/**
 * n8n Code-Node — "Kinoprogramm parsen (kino-zeit.de)"
 * Modus: Run Once for All Items
 *
 * Eingabe je Item: { html, cinema_id, cinema_name, source_url }
 *   (html = Body des vorangehenden HTTP-Request-Nodes, Response Format "String")
 * Ausgabe: eine Zeile pro Vorstellung, fertig fuer die Tabelle `showing`.
 *
 * Struktur der Quelle (Stand 18.09.2026):
 *   div.programmwrapper
 *     h2 > a[href="/node/62765"]        -> "Bad Apples (OF)"   Titel + Fassung
 *     p                                 -> "Genre: ... Länge: 100 Min. FSK: 16"
 *     table.program
 *       tr.dayofweek   > th.spalteN     -> "<strong>Heute</strong><br>18.09."
 *       tr.kino-mit-startzeiten > td.spalteN > a[href="/booking/ID"] > span.startzeit
 *
 * Die node-ID aus dem h2-Link ist stabil und kinouebergreifend. Sie ist der
 * bessere Cache-Schluessel als der Titelstring: einmal aufgeloest, nie wieder
 * gefragt — auch dann nicht, wenn derselbe Film in einem anderen Kino unter
 * einer anderen Fassungsbezeichnung laeuft.
 */

// Sprachfassungen (was man verstehen muss) und technische Formate (wie es laeuft).
// kino-zeit schreibt mal OF (Originalfassung), mal OV (Originalversion) — dasselbe.
// Beides faellt hier auf OV zusammen, damit das Kuerzel schon in den Daten einheitlich
// ist und nicht erst in der Anzeige zurechtgebogen wird.
const SPRACHE = { omu:'OmU', omeu:'OmeU', of:'OV', ov:'OV', df:'DF', deutsch:'DF', 'dt':'DF' };
const FORMAT  = { '3d':'3D','2d':null,'mxp':'MXP','mxp 2d':'MXP','plf':'PLF','plf 2d':'PLF',
                  imax:'IMAX','4dx':'4DX','dolby':'Dolby','open air':'Open Air','omu 3d':null };
// Zusaetze, die weder Sprache noch Format sind, aber weg muessen.
const RAUSCHEN = ['extended','extended cut','directors cut','director s cut','final cut',
                  'restauriert','remastered','wa','wiederauffuehrung','preview','sneak'];

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/&auml;/g, '\u00e4').replace(/&ouml;/g, '\u00f6').replace(/&uuml;/g, '\u00fc')
          .replace(/&Auml;/g, '\u00c4').replace(/&Ouml;/g, '\u00d6').replace(/&Uuml;/g, '\u00dc')
          .replace(/&szlig;/g, '\u00df').trim();
}

/**
 * Trennt Fassungs- und Formatangaben vom Titel.
 *   "Bad Apples (OF)"                                 -> Bad Apples            OV     -
 *   "Coyote Vs. Acme (MXP 2D) (Deutsch/MXP 2D)"       -> Coyote Vs. Acme       DF     MXP
 *   "Spider-Man: Brand New Day (PLF 2D) (OV/PLF 2D)"  -> Spider-Man: ...       OV     PLF
 *   "Heat (1995)"                                     -> Heat (1995)           -      -
 *   "Avengers: Endgame Extended"                      -> Avengers: Endgame     -      -
 * Nur Klammern, die ausschliesslich aus bekannten Kuerzeln bestehen, werden
 * abgeschnitten. Alles andere bleibt am Titel — sonst verliert "Heat (1995)"
 * seine Jahreszahl und "Oh la la 2" seine Teil-Nummer.
 */
function splitVersion(heading) {
  let title = heading.trim();
  let sprache = null, format = null, hit = true;

  while (hit) {
    hit = false;
    const m = title.match(/^(.*?)\s*\(([^()]{1,24})\)\s*$/);
    if (!m) break;
    const teile = m[2].toLowerCase().split(/[\/,]/).map((t) => t.trim()).filter(Boolean);
    const erkannt = teile.map((t) => {
      if (SPRACHE[t] !== undefined) return ['sprache', SPRACHE[t]];
      if (FORMAT[t] !== undefined) return ['format', FORMAT[t]];
      if (/^\d?d$/.test(t)) return ['format', null];
      return null;
    });
    if (erkannt.some((e) => e === null)) break;      // unbekannter Inhalt -> stehen lassen
    for (const [art, wert] of erkannt) {
      if (art === 'sprache' && wert && !sprache) sprache = wert;
      if (art === 'format' && wert && !format) format = wert;
    }
    title = m[1].trim();
    hit = true;
  }

  // Rauschen ohne Klammern, z. B. "... Extended"
  for (const r of RAUSCHEN) {
    const re = new RegExp('\\s+' + r.replace(/ /g, '\\s+') + '$', 'i');
    if (re.test(title)) title = title.replace(re, '').trim();
  }
  return { title, version: sprache, format };
}

/** "18.09." + Referenzdatum -> "2026-09-18" (Jahreswechsel eingerechnet) */
function toISODate(dayMonth, today) {
  const m = dayMonth.match(/(\d{1,2})\.(\d{1,2})\./);
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  let year = today.getFullYear();
  const cand = new Date(year, mo - 1, d);
  // Spielplaene reichen nur nach vorn: liegt das Datum weit zurueck, ist es naechstes Jahr.
  if ((today - cand) / 86400000 > 60) year += 1;
  return `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseKinozeit(html, ctx = {}) {
  const today = ctx.today ? new Date(ctx.today) : new Date();
  const showings = [];
  const warnings = [];
  // Die Kinoseite schreibt class="programmwrapper", die Stadt-Tagesseite
  // class="path-kinoprogramm-film programmwrapper". Am Ende des Klassen-
  // attributs zu trennen faengt beide.
  const blocks = html.split(/programmwrapper"/).slice(1);

  if (!blocks.length) warnings.push('kein programmwrapper gefunden — Seitenstruktur geaendert?');

  for (const block of blocks) {
    const h2 = block.match(/<h2>\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!h2) { warnings.push('Block ohne h2-Titel uebersprungen'); continue; }

    const sourceNode = (h2[1].match(/\/node\/(\d+)/) || [])[1] || null;
    const { title, version, format } = splitVersion(decode(h2[2].replace(/<[^>]+>/g, '')));

    const meta = block.match(/Genre:\s*([^<]*)<br>\s*L(?:ä|&auml;)nge:\s*(\d+)\s*Min/);
    const genre = meta ? decode(meta[1]) : null;
    const runtime = meta ? parseInt(meta[2], 10) : null;

    // Spaltenindex -> Datum
    const dayRow = block.match(/<tr class="dayofweek">([\s\S]*?)<\/tr>/);
    if (!dayRow) { warnings.push(`"${title}": keine Datumszeile`); continue; }
    const dates = {};
    for (const th of dayRow[1].matchAll(/<th[^>]*\bspalte(\d+)\b[^>]*>([\s\S]*?)<\/th>/g)) {
      dates[th[1]] = toISODate(decode(th[2].replace(/<[^>]+>/g, ' ')), today);
    }

    // Zwei Seitenlayouts: die Kinoseite listet 7 Tage fuer EIN Kino, die
    // Stadt-Tagesseite listet EINEN Tag fuer alle Kinos und traegt dann eine
    // Kinospalte. Letztere erkennt man am th.cinema in der Kopfzeile.
    const stadtLayout = /<th[^>]*class="[^"]*\bcinema\b/.test(dayRow[1]);

    let found = 0;
    for (const row of block.matchAll(/<tr class="kino-mit-startzeiten"[^>]*>([\s\S]*?)<\/tr>/g)) {
      let kino = { id: ctx.cinema_id ?? null, name: ctx.cinema_name ?? null };
      if (stadtLayout) {
        const km = row[1].match(/<a class="cinema" href="\/node\/(\d+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!km) { warnings.push(`"${title}": Zeile ohne Kinozuordnung`); continue; }
        kino = { id: km[1], name: decode(km[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ') };
      }
      for (const td of row[1].matchAll(/<td[^>]*\bspalte(\d+)\b[^>]*>([\s\S]*?)<\/td>/g)) {
        const date = dates[td[1]];
        if (!date) continue;
        // Uhrzeit und zugehoeriger Ticketlink, in Dokumentreihenfolge
        for (const slot of td[2].matchAll(
          /(?:<a href="(\/booking\/[^"]*)"[^>]*>)?\s*<span class="startzeit"[^>]*>\s*(\d{1,2}:\d{2})\s*<\/span>/g)) {
          showings.push({
            cinema_id: kino.id,
            cinema_name: kino.name,
            source: 'kino-zeit',
            source_node: sourceNode,
            raw_title: title,
            version,
            format,
            genre,
            runtime_min: runtime,
            date,
            time: slot[2].padStart(5, '0'),
            starts_at: `${date}T${slot[2].padStart(5, '0')}:00`,
            booking_url: slot[1] ? 'https://www.kino-zeit.de' + slot[1] : null
          });
          found++;
        }
      }
    }
    if (!found) warnings.push(`"${title}": Block ohne Spielzeiten`);
  }

  // Kanarienvogel: gruener Lauf ohne Daten ist der gefaehrlichste Fehlerfall.
  if (!showings.length) {
    throw new Error(
      `${ctx.cinema_name || ctx.source_url || 'Kino'}: 0 Vorstellungen geparst. ` +
      `Selektoren pruefen. Hinweise: ${warnings.join(' | ') || 'keine'}`);
  }
  return { showings, warnings, films: [...new Set(showings.map(s => s.raw_title))] };
}

// ---- n8n-Glue: Workflow 2 ---------------------------------------------
// Node-Modus: **Run Once for All Items**.
// Eingang: der done-Zweig von "Loop Over Items" — 84 Seiten (21 Tage x 4 Orte),
// Seiteninhalt jeweils im Feld `html` (HTTP Request: Response Format Text,
// Put Output in Field = html).
// Ausgang: eine Zeile je Vorstellung, fertig fuer die Tabelle `showing`.

// kino-zeit-Knoten -> cinema.id. Erzeugt aus data/kinos.json.
// Knoten 3321 (Traumpalast Leonberg ohne IMAX) fehlt bewusst — fuer Leonberg
// zaehlt allein der IMAX-Saal (53864). Alles, was hier nicht steht, faellt raus.
const KINO_NACH_NODE = {
  '2354': 'delphi',
  '2357': 'atelier',
  '2356': 'gloria',
  '2355': 'em',
  '2812': 'cinema',
  '2586': 'metropol',
  '2359': 'corso',
  '2667': 'cinemaxx-liederhalle',
  '2448': 'cinemaxx-si',
  '2194': 'komm-es',
  '2741': 'traumpalast-es',
  '2246': 'caligari',
  '2248': 'central-lb',
  '2598': 'luna',
  '2249': 'union-lb',
  '53864': 'traumpalast-imax',
};

const plan     = $('Abrufplan').all();   // gleiche Reihenfolge wie der Loop
const probleme = [];
const unbekannt = new Set();
const zeilen   = [];

$input.all().forEach((item, i) => {
  const ctx = plan[i]?.json ?? {};
  let res;
  try {
    res = parseKinozeit(item.json.html, { source_url: ctx.url, today: ctx.datum });
  } catch (e) {
    // Leere Seite oder kaputte Struktur: eine Seite darf ausfallen, der Lauf
    // nicht. Weit in der Zukunft hat kino-zeit oft noch kein Programm.
    probleme.push(`${ctx.ort ?? '?'} ${ctx.slug ?? i}: ${e.message}`);
    return;
  }
  for (const s of res.showings) {
    const cinema_id = KINO_NACH_NODE[String(s.cinema_id)];
    if (!cinema_id) { unbekannt.add(`${s.cinema_id} ${s.cinema_name}`); continue; }
    zeilen.push({
      cinema_id,
      source:      'kino-zeit',
      source_key:  s.source_node ? String(s.source_node)
                                 : 'titel:' + s.raw_title.toLowerCase(),
      raw_title:   s.raw_title,
      version:     s.version,
      format:      s.format,
      genre:       s.genre,
      runtime_min: s.runtime_min,
      // starts_at ist timestamptz. Ohne Zone legt Postgres UTC zugrunde und
      // alle Vorstellungen wandern zwei Stunden nach hinten.
      starts_at:   DateTime.fromISO(s.starts_at, { zone: 'Europe/Berlin' }).toISO(),
      booking_url: s.booking_url
    });
  }
});

// Dubletten innerhalb eines Laufs entfernen: PostgREST bricht ab, wenn ein
// Upsert dieselbe Zeile zweimal im selben Rumpf trifft.
const gesehen = new Set();
const eindeutig = zeilen.filter((z) => {
  const k = `${z.cinema_id}|${z.starts_at}|${z.raw_title}`;
  if (gesehen.has(k)) return false;
  gesehen.add(k);
  return true;
});

console.log(`Seiten: ${$input.all().length}, davon ohne Ergebnis: ${probleme.length}`);
console.log(`Vorstellungen: ${eindeutig.length} (Rohzeilen ${zeilen.length})`);
if (unbekannt.size) console.log('Nicht zugeordnete Kinos: ' + [...unbekannt].join(', '));
if (probleme.length) console.log('Seiten ohne Ergebnis:\n' + probleme.join('\n'));

// Kanarienvogel: ein gruener Lauf ohne Daten ist der gefaehrlichste Fehlerfall.
if (!eindeutig.length) {
  throw new Error('0 Vorstellungen ueber alle Seiten. ' + probleme.slice(0, 3).join(' | '));
}

return eindeutig.map((json) => ({ json }));
