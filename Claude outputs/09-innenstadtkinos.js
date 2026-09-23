/**
 * n8n Code-Node — "Innenstadtkinos parsen" (Workflow 2, dritte Quelle)
 * Modus: Run Once for All Items
 *
 * Warum diese Quelle: kino-zeit fuehrt die Sonderreihen der Innenstadtkinos
 * nicht. Belegt am 19./21.09.2026 an "Weird Wednesday": Taxi Driver (21.10.)
 * und Drive (04.11.), beide im EM, beide auf der Watchlist, beide auf der
 * Stadtseite nicht auffindbar. Die Luecke ist systematisch, nicht zufaellig.
 *
 * Eingang: der done-Zweig der Schleife ueber die Filmseiten, Seiteninhalt im
 * Feld `html`. Die Liste der Seiten kommt aus 'Filmseiten planen'.
 * Ausgang: EIN Item mit drei fertigen Nutzlasten —
 *   json.filme     -> POST /rest/v1/film        (zuerst, wegen Fremdschluessel)
 *   json.aliasse   -> POST /rest/v1/title_alias (danach)
 *   json.showings  -> POST /rest/v1/showing     (zuletzt)
 *
 * Der Clou: Die Seite traegt im JSON-LD `sameAs` die TMDb-Adresse des Films.
 * Damit ist die Zuordnung schon an der Quelle entschieden — diese Titel
 * durchlaufen die Kaskade aus Workflow 3 gar nicht erst. Dieselbe Idee wie
 * bei der Letterboxd-Seite in Workflow 1: Wer die ID hat, vergleicht keine
 * Titel.
 *
 * Kein 21-Tage-Fenster: Genau die weit vorn liegenden Sondertermine sind der
 * Grund fuer diese Quelle. Der Datumsfilter im Dashboard fasst alles jenseits
 * der laufenden Woche ohnehin unter "ab ..." zusammen.
 */

const ZONE = 'Europe/Berlin';

// Saal -> cinema.id. Der Saal steht nicht im JSON-LD, wohl aber im
// Ticketlink: kinoheld.de/Kino-Stuttgart/Gloria%20Stuttgart?...
const KINO_MUSTER = [
  { re: /gloria/i,  id: 'gloria' },
  { re: /cinema/i,  id: 'cinema' },
  { re: /\bem\b/i,  id: 'em' }
];

/**
 * Fassungskuerzel, wie sie in den Etiketten der Vorstellungen stehen
 * ("EM 12D·OV Weird Wednesday"). Absichtlich OHNE /i:
 * Diese Kuerzel sind immer grossgeschrieben, und "of" in einem Titel wie
 * "KitKatClub: Kinks of Berlin" darf nicht als Originalfassung durchgehen.
 * Reihenfolge = Vorrang: das Spezifischere zuerst.
 */
const FASSUNG_MUSTER = [
  [/\bOmeU\b/, 'OmeU'],
  [/\bOmU\b/,  'OmU'],
  [/\bOV\b/,   'OV'],
  [/\bDF\b/,   'DF']
];

/**
 * Ausgeschriebene Fassungsangaben aus dem Beschreibungstext. Die Reihen der
 * Innenstadtkinos sagen es dort im Fliesstext statt im Kuerzel:
 *
 *   "Weird Wednesday - Jeden 3. Mittwoch im Monat zeigen wir ausgesuchte
 *    Kultklassiker ... und in der Originalversion."
 *
 * Das Spezifischere zuerst: Wer Untertitel nennt, meint OmU, auch wenn im
 * selben Satz "Originalfassung" steht.
 */
const WORTFASSUNG = [
  [/\bmit\s+(?:deutschen\s+|dt\.?\s+|engl(?:ischen)?\.?\s+)?Untertiteln\b/i, 'OmU'],
  [/\bOriginalversion\b/i,   'OV'],
  [/\bOriginalfassung\b/i,   'OV'],
  [/\bim\s+Original\b/i,     'OV'],
  [/\bdeutsche[nr]?\s+Fassung\b/i, 'DF'],
  [/\bsynchronisiert\b/i,    'DF']
];

/** "PT1H37M" -> 97 */
function dauerInMinuten(iso) {
  const m = String(iso || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m || (!m[1] && !m[2])) return null;
  return (Number(m[1] || 0) * 60) + Number(m[2] || 0);
}

/**
 * Fassung EINER Vorstellung. Drei Quellen, in dieser Reihenfolge:
 *   1. ein Kuerzel im Namen oder in der Beschreibung ("... ·OV ...")
 *   2. das Feld `inLanguage` des Events
 *   3. eine ausgeschriebene Angabe im Beschreibungstext
 * Findet sich nichts, bleibt die Spalte LEER.
 *
 * Die dritte Stufe steht bewusst NACH `inLanguage`: Sie greift nur dort, wo
 * die Quelle sonst schweigt. Ein Fliesstext ist die schwaechste der drei
 * Angaben — er beschreibt oft die Reihe, nicht die einzelne Vorstellung —,
 * und soll deshalb eine ausdrueckliche Sprachangabe nie ueberstimmen.
 *
 * Das ist der Punkt dieser Funktion. Die erste Fassung schrieb
 * `String(e.inLanguage || 'de')` und machte damit aus einer fehlenden Angabe
 * ein "DF". Am 23.09.2026 aufgefallen an "Weird Wednesday: TAXI DRIVER" und
 * "DRIVE": Beide laufen laut Kinoseite im Original, beide standen in der
 * Datenbank als deutsche Fassung. Die Quelle hatte nie etwas anderes
 * behauptet — sie hatte gar nichts behauptet.
 *
 * Zum Vergleich: Der kino-zeit-Zweig laesst 702 von 869 Zeilen leer. Diese
 * Leerstellen sind eine ehrliche Angabe. Ein Standardwert ist es nicht.
 */
function fassung(event) {
  const etikett = [event && event.name, event && event.description]
    .filter(Boolean).join(' ');
  for (const [re, wert] of FASSUNG_MUSTER) if (re.test(etikett)) return wert;

  const lang = event && event.inLanguage ? String(event.inLanguage).toLowerCase() : null;
  if (lang) return lang.startsWith('de') ? 'DF' : 'OV';

  for (const [re, wert] of WORTFASSUNG) if (re.test(etikett)) return wert;

  return null;                         // keine Angabe ist keine deutsche Fassung
}

/** TMDb-Kennung aus den sameAs-Verweisen des Films. */
function tmdbAusSameAs(sameAs) {
  for (const u of [].concat(sameAs || [])) {
    const m = String(u).match(/themoviedb\.org\/movie\/(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** "Weird Wednesday DRIVE (2011) - " -> "Weird Wednesday DRIVE (2011)" */
function titelSauber(s) {
  return String(s || '').replace(/\s+/g, ' ').replace(/[\s–—-]+$/, '').trim();
}

function kinoAusOffer(url) {
  let pfad = String(url || '');
  try { pfad = decodeURIComponent(pfad); } catch (e) { /* Rohform reicht auch */ }
  // Nur das Segment hinter /Kino-Stuttgart/ pruefen, sonst trifft "em" in
  // beliebigen Woertern der uebrigen URL.
  const seg = (pfad.match(/\/Kino-[^/]*\/([^?#]*)/) || [])[1] || pfad;
  for (const k of KINO_MUSTER) if (k.re.test(seg)) return k.id;
  return null;
}

/** Alle JSON-LD-Bloecke einer Seite, flach als Liste von Knoten. */
function ldKnoten(html) {
  const knoten = [];
  for (const m of String(html || '').matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const liste = Array.isArray(j) ? j : (j['@graph'] || [j]);
    for (const k of liste) if (k && typeof k === 'object') knoten.push(k);
  }
  return knoten;
}

function parseSeite(html) {
  const knoten = ldKnoten(html);
  const film = knoten.find((k) => k['@type'] === 'Movie') || null;
  const listen = knoten.filter((k) => k['@type'] === 'ItemList');

  // Das regulaere Programm liefert ScreeningEvent mit einem Movie-Block
  // daneben. Sonderveranstaltungen ("Weird Wednesday") sind aus Sicht des
  // Kinosystems kein Film, sondern ein Event: kein Movie, kein sameAs, kein
  // TMDb-Verweis — und genau das sind die Termine, die kino-zeit nicht fuehrt.
  const events = [];
  for (const l of listen) {
    for (const e of (l.itemListElement || [])) {
      const it = e && e.item ? e.item : e;
      if (it && (it['@type'] === 'ScreeningEvent' || it['@type'] === 'Event')) events.push(it);
    }
  }
  return { film, events };
}

// ---- n8n-Glue ----------------------------------------------------------
if (typeof $input !== 'undefined') {
  const plan = (() => { try { return $('Filmseiten planen').all(); } catch (e) { return []; } })();
  const jetzt = DateTime.now().setZone(ZONE);

  const showings = [];
  const aliasse  = new Map();   // source_key -> Zeile
  const filme    = new Map();   // tmdb_id   -> Zeile
  const hinweise = [];
  let ohneTmdb = 0, ohneKino = 0, ohneFassung = 0;

  $input.all().forEach((item, i) => {
    const url = plan[i]?.json?.url || '';
    const { film, events } = parseSeite(item.json.html);

    if (!events.length) {
      hinweise.push('Seite ohne Vorstellungen: ' + (url || i));
      return;
    }

    // Ohne Movie-Block traegt das Event selbst den Titel.
    const titel = titelSauber(film ? film.name : (events[0] && events[0].name));
    if (!titel) { hinweise.push('Seite ohne Titel: ' + (url || i)); return; }

    const tmdb_id = film ? tmdbAusSameAs(film.sameAs) : null;
    if (!tmdb_id) ohneTmdb++;

    // Eigener Schluesselraum dieser Quelle — die Programm-ID der Seite.
    const seitenId  = (url.match(/\/programm\/(\d+)/) || [])[1] || null;
    const source_key = seitenId ? 'isk:' + seitenId
                                : 'titel:' + titel.toLowerCase();

    const genre  = film ? ([].concat(film.genre || []).join(', ') || null) : null;
    const laenge = film ? dauerInMinuten(film.duration) : null;

    for (const e of events) {
      const start = DateTime.fromISO(e.startDate, { setZone: true }).setZone(ZONE);
      if (!start.isValid) {
        // Nennt die vorhandenen Felder mit: Wenn eine Variante der Seite das
        // Datum woanders fuehrt, steht im Log, wo man nachsehen muss.
        hinweise.push(`"${titel}": kein lesbares startDate (Felder: ${Object.keys(e).join(', ')})`);
        continue;
      }
      if (start < jetzt) continue;                       // Vergangenes nicht schreiben

      const cinema_id = kinoAusOffer(e.offers && e.offers.url);
      if (!cinema_id) { ohneKino++; continue; }

      const version = fassung(e);
      if (!version) ohneFassung++;

      const format = String(e.videoFormat || '').toUpperCase();

      showings.push({
        cinema_id,
        source:      'innenstadtkinos',
        source_key,
        raw_title:   titel,
        version,
        format:      format && format !== '2D' ? format : null,
        genre,
        runtime_min: laenge,
        starts_at:   start.toISO(),
        booking_url: (e.offers && e.offers.url) || e.url || null
      });
    }

    // Die Quelle nennt die TMDb-Kennung selbst — dann ist der Titel bereits
    // aufgeloest und muss durch keine Kaskade mehr.
    if (tmdb_id) {
      if (!filme.has(tmdb_id)) {
        const regie = [].concat(film.director || [])
          .map((d) => (d && d.name) || d).filter(Boolean).join(', ');
        // Alle Objekte eines Sammel-Inserts muessen dieselben Schluessel
        // tragen, sonst antwortet PostgREST mit PGRST102 "All object keys
        // must match". Fehlende Angaben stehen deshalb als null drin.
        filme.set(tmdb_id, {
          tmdb_id,
          title_de:    titel || null,
          runtime_min: laenge,
          director:    regie || null
        });
      }
      if (!aliasse.has(source_key)) {
        aliasse.set(source_key, {
          source_key,
          raw_title:   titel,
          tmdb_id,
          confidence:  1,
          resolved_by: 'tmdb',
          status:      'sicher',
          reason:      'TMDb-Kennung aus der Quelle (schema.org sameAs)',
          checked_at:  new Date().toISOString()
        });
      }
    }
  });

  // Dubletten innerhalb eines Laufs: PostgREST bricht ab, wenn ein Upsert
  // dieselbe Zeile zweimal im selben Rumpf trifft.
  const gesehen = new Set();
  const eindeutig = showings.filter((z) => {
    const k = `${z.cinema_id}|${z.starts_at}|${z.raw_title}`;
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });

  console.log(`Innenstadtkinos: ${eindeutig.length} Vorstellungen aus ${$input.all().length} Filmseiten`);
  console.log(`Filme mit TMDb-Kennung aus der Quelle: ${filme.size}, ohne: ${ohneTmdb}`);
  // Leere Fassungsangaben sind kein Fehler, sondern eine Messung: Sie sagen,
  // wie oft die Quelle nichts sagt. Steigt die Zahl auf fast alle Zeilen,
  // steht das Kuerzel nicht mehr im JSON-LD und muss aus dem HTML gelesen
  // werden.
  console.log(`Vorstellungen ohne Fassungsangabe: ${ohneFassung} von ${eindeutig.length}`);
  if (ohneKino) console.log(`Vorstellungen ohne erkennbaren Saal: ${ohneKino}`);
  if (hinweise.length) console.log('Hinweise:\n' + [...new Set(hinweise)].join('\n'));

  if (!eindeutig.length) {
    throw new Error('0 Vorstellungen aus den Innenstadtkinos — Seitenstruktur pruefen.');
  }

  return [{ json: {
    filme:    [...filme.values()],
    aliasse:  [...aliasse.values()],
    showings: eindeutig,
    anzahl: { filme: filme.size, aliasse: aliasse.size, showings: eindeutig.length }
  } }];
}

if (typeof module !== 'undefined') {
  module.exports = { parseSeite, ldKnoten, dauerInMinuten, tmdbAusSameAs, kinoAusOffer, fassung };
}
