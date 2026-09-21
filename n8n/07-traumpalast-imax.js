/**
 * n8n Code-Node — "Traumpalast parsen" (IMAX Leonberg)
 * Modus: Run Once for All Items
 *
 * Zweite Quelle, weil kino-zeit den IMAX-Saal nicht ausliefert: Die Ortsseite
 * Leonberg fuehrt nur den regulaeren Traumpalast (Knoten 3321), und dessen
 * Titel tragen keinerlei Formatkuerzel — ein Filter waere dort wirkungslos.
 * Begruendung und Pruefdatum stehen in data/kinos.json.
 *
 * Eingabe je Item: { html } — eine Wochenseite von leonberg.traumpalast.de
 *   Woche 1: /index.php/PID/11321.html
 *   Woche 2: /index.php/PID/11321/W/1.html
 * Ausgabe: eine Zeile je Vorstellung, fertig fuer die Tabelle `showing`.
 *
 * Die Seite traegt schema.org-Auszeichnungen, deshalb haengt hier nichts an
 * Spaltenkoepfen oder Tabellenlayout:
 *   <h3 id="box_movie_1_name" itemprop="name"><a ...>Titel</a></h3>
 *   <p class="h5 version">IMAX<br><small>Sprache: Deutsch</small></p>
 *   <span itemscope itemtype=".../ScreeningEvent" itemref="box_movie_1 ...">
 *     <a href="/index.php/PID/5581/TICKET/7222993.html">
 *       <time itemprop="startDate" datetime="2026-09-24T19:00:00">19:00</time>
 * `itemref` verbindet jede Vorstellung mit ihrem Film — auch wenn die Bloecke
 * im Markup anders verschachtelt waeren als erwartet.
 */

const BASIS      = 'https://leonberg.traumpalast.de';
const CINEMA_ID  = 'traumpalast-imax';   // cinema.id in Supabase
const NUR_SAAL   = /imax/i;              // alles andere gehoert nicht ins Dashboard

function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß');
}

const text = (s) => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "IMAX Sprache: Deutsch" -> { saal: 'IMAX', sprache: 'Deutsch', version: 'DF' } */
function fassung(kopf) {
  const t = text(kopf);
  const saal = t.split(/\s*(?:\(|Sprache:)/)[0].trim();
  const sprache = (t.match(/Sprache:\s*([^,;]+)/) || [])[1]?.trim() || null;
  let version = 'DF';
  if (/originalversion|originalfassung|\bOV\b|\bOF\b/i.test(t)) version = 'OV';
  if (/untertitel|omu/i.test(t)) version = 'OmU';
  if (version === 'DF' && sprache && !/deutsch/i.test(sprache)) version = 'OV';
  return { saal, sprache, version };
}

/**
 * Ersatzschluessel fuer title_alias. Die Quelle hat keine kino-zeit-Knoten-ID,
 * also greift die im Schema vorgesehene Form 'titel:<normalisierter titel>'.
 */
function titelSchluessel(titel) {
  const flach = decode(titel).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'titel:' + flach;
}

function parseTraumpalast(html) {
  const roh = String(html || '');
  const warnungen = [];

  // 1. Filmtitel je box_movie_N
  const titel = {};
  for (const m of roh.matchAll(/<h3 id="box_movie_(\d+)_name"[^>]*>([\s\S]*?)<\/h3>/g)) {
    titel[m[1]] = text(m[2]);
  }
  if (!Object.keys(titel).length) warnungen.push('kein box_movie_N_name gefunden — Seite umgebaut?');

  // 2. Bloecke je Fassung. Der Kopf gilt bis zum naechsten Kopf.
  const koepfe = [...roh.matchAll(/<p class="h5 version">([\s\S]*?)<\/p>/g)];
  if (!koepfe.length) warnungen.push('keine Fassungsueberschrift gefunden');

  const vorstellungen = [];
  koepfe.forEach((k, i) => {
    const block = roh.slice(k.index + k[0].length,
                            i + 1 < koepfe.length ? koepfe[i + 1].index : roh.length);
    const { saal, sprache, version } = fassung(k[1]);
    if (!NUR_SAAL.test(saal)) { warnungen.push('Saal uebersprungen: ' + saal); return; }

    for (const s of block.matchAll(
      /itemref="box_movie_(\d+)[^"]*"([\s\S]{0,2000}?)<time itemprop="startDate" datetime="([^"]+)"/g)) {
      const film = titel[s[1]];
      if (!film) { warnungen.push(`Vorstellung ohne Titel (box_movie_${s[1]})`); continue; }
      const ticket = (s[2].match(/href="([^"]+TICKET[^"]*)"/) || [])[1] || null;
      vorstellungen.push({
        raw_title:   film,
        saal, sprache, version,
        lokal:       s[3],                       // 2026-09-24T19:00:00, ohne Zone
        booking_url: ticket ? (ticket.startsWith('http') ? ticket : BASIS + ticket) : null
      });
    }
  });

  return { vorstellungen, warnungen };
}

// ---- n8n-Glue ----------------------------------------------------------
if (typeof $input !== 'undefined') {
  const bis = DateTime.now().setZone('Europe/Berlin').startOf('day').plus({ days: 21 });
  const ab  = DateTime.now().setZone('Europe/Berlin');

  const zeilen = [];
  const warnungen = [];

  for (const item of $input.all()) {
    const r = parseTraumpalast(item.json.html);
    warnungen.push(...r.warnungen);
    for (const v of r.vorstellungen) {
      const start = DateTime.fromISO(v.lokal, { zone: 'Europe/Berlin' });
      if (!start.isValid) { warnungen.push('unlesbares Datum: ' + v.lokal); continue; }
      // Dasselbe Fenster wie der kino-zeit-Teil, damit das Dashboard nicht
      // fuer ein einzelnes Kino weiter in die Zukunft reicht als fuer alle anderen.
      if (start < ab || start > bis) continue;
      zeilen.push({
        cinema_id:   CINEMA_ID,
        source:      'traumpalast',
        source_key:  titelSchluessel(v.raw_title),
        raw_title:   v.raw_title,
        version:     v.version,
        format:      'IMAX',
        genre:       null,
        runtime_min: null,
        starts_at:   start.toISO(),
        booking_url: v.booking_url
      });
    }
  }

  const gesehen = new Set();
  const eindeutig = zeilen.filter((z) => {
    const k = `${z.cinema_id}|${z.starts_at}|${z.raw_title}`;
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });

  console.log(`IMAX Leonberg: ${eindeutig.length} Vorstellungen aus ${$input.all().length} Wochenseiten`);
  if (warnungen.length) console.log('Hinweise:\n' + [...new Set(warnungen)].join('\n'));

  // Kein throw: Der IMAX kann eine Woche lang geschlossen sein, und dann soll
  // der Lauf fuer die anderen 15 Kinos nicht scheitern.
  return eindeutig.map((json) => ({ json }));
}

if (typeof module !== 'undefined') {
  module.exports = { parseTraumpalast, fassung, titelSchluessel, decode };
}
