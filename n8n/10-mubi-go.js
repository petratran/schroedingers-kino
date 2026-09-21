/**
 * n8n Code-Node — "MUBI GO lesen" (Workflow 4)
 * Modus: Run Once for All Items
 *
 * Erwartet drei vorgelagerte Nodes:
 *   "MUBI-Seite holen"   HTTP GET https://mubi.com/de/de/go   (Response: Text)
 *   "Titel-Cache holen"  GET /rest/v1/title_alias?...         (raw_title, tmdb_id)
 *   "MUBI-Stand holen"   GET /rest/v1/mubi_go?...limit=1      (aktuelle Zeile)
 *
 * Liefert IMMER genau ein Item:
 *   { schreiben: true,  titel, grund, zeile: { valid_from, raw_title, tmdb_id } }
 *   { schreiben: false, titel, grund, zeile: null }
 *
 * Ein IF-Node dahinter entscheidet, ob geschrieben wird. Die erste Fassung
 * gab bei "unveraendert" gar kein Item zurueck — technisch richtig, in der
 * Bedienung falsch: Der Lauf sah dann aus wie ein Lauf, der nichts getan hat,
 * und warum er nichts getan hat, stand nur in der Browser-Konsole. Ein Lauf,
 * der nichts tut, muss trotzdem sagen koennen, was er gesehen hat.
 *
 * Reine Funktionen, kein Netz. Test: node test-mubi-go.js
 */

// --- 1 · Den Titel aus der Seite holen ---------------------------------
/**
 * mubi.com/de/de/go ist fast vollstaendig JavaScript; im ausgelieferten HTML
 * steht der Film der Woche nur in den Meta-Angaben:
 *
 *   <meta name="description" content="Film des Tages | Gentle Monster">
 *
 * Das ist duenn, aber es ist die Stelle, die MUBI selbst fuer Suchmaschinen
 * und Link-Vorschauen pflegt — sie ist damit eher stabil als der Rest der
 * Seite. Bricht sie weg, wirft dieser Node, und der Fehler-Melder schlaegt
 * an. Das ist besser als ein stiller Ruecklauf auf den Film der Vorwoche.
 */
const ENTITIES = {
  '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&apos;': "'",
  '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&ndash;': '\u2013', '&mdash;': '\u2014',
  '&auml;': 'ä', '&ouml;': 'ö', '&uuml;': 'ü', '&Auml;': 'Ä', '&Ouml;': 'Ö',
  '&Uuml;': 'Ü', '&szlig;': 'ß'
};

function entities(s) {
  return String(s)
    .replace(/&[a-zA-Z#0-9]+;/g, (e) => (e in ENTITIES ? ENTITIES[e] : e))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Inhalt der ersten Meta-Angabe, deren name/property passt. */
function meta(html, key) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  const passend = new RegExp('(?:name|property)\\s*=\\s*["\']' + key + '["\']', 'i');
  for (const tag of tags) {
    if (!passend.test(tag)) continue;
    const m = tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i);
    if (m) return entities(m[1]).trim();
  }
  return null;
}

/**
 * "Film des Tages | Gentle Monster" -> "Gentle Monster".
 * Getrennt wird am letzten Balken bzw. Gedankenstrich: Der Vorspann ist die
 * Rubrik, der Film steht hinten. Faellt der Vorspann weg, bleibt der ganze
 * Text stehen — ein Titel ohne Trennzeichen ist auch ein Titel.
 */
function mubiTitel(html) {
  const roh = meta(html, 'og:description')
           || meta(html, 'description')
           || meta(html, 'twitter:description');
  if (!roh) throw new Error(
    'MUBI-Seite ohne Meta-Beschreibung — dort stand bisher der Film der Woche. ' +
    'Vermutlich hat MUBI die Seite umgebaut; 10-mubi-go.js muss nachgezogen werden.');

  const teile = roh.split(/\s*[|\u2013\u2014]\s*/).filter((t) => t.trim());
  const titel = (teile.length > 1 ? teile[teile.length - 1] : teile[0] || '').trim();

  // Plausibilitaet: ein Filmtitel ist weder leer noch die Rubrik selbst.
  if (titel.length < 2 || titel.length > 90 || /^mubi(\s|$)/i.test(titel)) {
    throw new Error(`Aus der MUBI-Beschreibung "${roh}" laesst sich kein Filmtitel lesen.`);
  }
  return titel;
}

// --- 2 · Die TMDb-Kennung aus dem eigenen Bestand holen ----------------
/**
 * Bewusst KEINE zweite TMDb-Suche: MUBI GO ist ein Kinoticket, der Film
 * laeuft also per Definition in einem Kino. Laeuft er in keinem der 16
 * erfassten Haeuser, nuetzt die Kennung ohnehin nichts — `v_programm`
 * verbindet `mubi_go` ueber `tmdb_id` mit den Vorstellungen, und ohne
 * Vorstellung gibt es nichts zu kennzeichnen.
 *
 * Der eigene Titel-Cache ist damit die bessere Quelle als TMDb: Er enthaelt
 * genau die Filme, um die es geht, die Kennungen sind schon geprueft, und
 * die Fremdschluesselbedingung auf `film` ist automatisch erfuellt.
 */
function schluessel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Sucht den Film im Titel-Cache. Exakt zuerst, dann Teiltreffer. */
function findeKennung(titel, aliasse) {
  const ziel = schluessel(titel);
  if (!ziel) return null;

  const kandidaten = (aliasse || [])
    .filter((a) => a && a.tmdb_id)
    .map((a) => ({ ...a, key: schluessel(a.raw_title) }));

  const exakt = kandidaten.find((a) => a.key === ziel);
  if (exakt) return { tmdb_id: exakt.tmdb_id, treffer: 'exakt', ueber: exakt.raw_title };

  // Der Aushangtitel darf laenger sein ("Shrek - Der tollkuehne Held (25 Jahre)"),
  // der MUBI-Titel kuerzer. Mindestlaenge gegen Zufallstreffer wie "Her".
  if (ziel.length >= 6) {
    const teil = kandidaten.filter((a) => a.key.startsWith(ziel + ' ') || a.key === ziel ||
                                          ziel.startsWith(a.key + ' '));
    // Nur eindeutige Teiltreffer zaehlen. Zwei Kandidaten heisst raten.
    const ids = [...new Set(teil.map((a) => a.tmdb_id))];
    if (ids.length === 1) return { tmdb_id: ids[0], treffer: 'teil', ueber: teil[0].raw_title };
  }
  return null;
}

// --- 3 · Entscheiden, ob geschrieben wird ------------------------------
/**
 * `valid_from` ist der Tag, ab dem der Film gilt — nicht der Tag des Laufs.
 * Deshalb wird nur bei einem Wechsel geschrieben. Ein taeglicher Lauf, der
 * jeden Tag eine Zeile anlegt, wuerde die Tabelle fuellen und die Angabe
 * "gilt seit" bedeutungslos machen.
 */
function entscheide(titel, aliasse, bestand, heute) {
  const aktuell = (bestand || [])[0] || null;
  if (aktuell && schluessel(aktuell.raw_title) === schluessel(titel)) {
    return { schreiben: false, grund: `unveraendert: "${titel}" seit ${aktuell.valid_from}` };
  }

  const gefunden = findeKennung(titel, aliasse);
  if (!gefunden) {
    throw new Error(
      `MUBI GO zeigt "${titel}" — dieser Titel steht in keinem der erfassten ` +
      `Kinoprogramme (title_alias). Entweder laeuft der Film hier nicht, dann ` +
      `ist nichts zu tun; oder die Schreibweise weicht ab, dann die Zeile von ` +
      `Hand anlegen (siehe checkliste.md, Schritt 6b).`);
  }

  return {
    schreiben: true,
    zeile: { valid_from: heute, raw_title: titel, tmdb_id: gefunden.tmdb_id },
    grund: `neu: "${titel}" -> ${gefunden.tmdb_id} (${gefunden.treffer} ueber "${gefunden.ueber}")`
  };
}

// --- n8n-Glue ----------------------------------------------------------
if (typeof $input !== 'undefined') {
  const html     = $('MUBI-Seite holen').first().json.data;
  const aliasse  = $('Titel-Cache holen').all().map((i) => i.json);
  const bestand  = $('MUBI-Stand holen').all().map((i) => i.json)
                     .filter((r) => r && r.valid_from);
  const heute    = DateTime.now().setZone('Europe/Berlin').toISODate();

  const titel = mubiTitel(html);
  const e = entscheide(titel, aliasse, bestand, heute);

  return [{ json: {
    schreiben: e.schreiben,
    titel,
    grund: e.grund,
    zeile: e.zeile || null
  } }];
}

if (typeof module !== 'undefined') {
  module.exports = { mubiTitel, meta, entities, schluessel, findeKennung, entscheide };
}
