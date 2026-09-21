/**
 * n8n Code-Node — "today.json bauen" (Workflow 5, Ausspielung)
 * Modus: Run Once for All Items
 *
 * Eingang (Hauptstrang): die Zeilen der View `v_programm`.
 * Zusaetzlich per Node-Namen, alle drei optional:
 *   'Kinos holen'     -> /rest/v1/cinema      (Stammdaten, auch ohne Programm)
 *   'Watchlist holen' -> /rest/v1/watchlist   (nur fuer die Gesamtzahl)
 *   'MUBI holen'      -> /rest/v1/mubi_go     (juengste Zeile)
 *
 * Ausgabe: ein Item, dessen json exakt die Struktur von data/today.json hat.
 * Das Dashboard liest sie unveraendert weiter — Feldnamen sind hier Vertrag,
 * nicht Geschmackssache.
 *
 * Unterschied zur lokalen Fassung: Das Matching kommt nicht mehr aus einem
 * Titelvergleich, sondern aus `title_alias` — also aus TMDb-IDs. Deshalb
 * steht in matching.stufe jetzt C.
 */

const LETTERBOXD_USER = 'savoy_truffle';
const REGION          = 'Region Stuttgart';
const ORT_REIHENFOLGE = ['Stuttgart', 'Ludwigsburg', 'Esslingen', 'Leonberg'];
const ZONE            = 'Europe/Berlin';

const ortRang = (ort) => {
  const i = ORT_REIHENFOLGE.indexOf(ort);
  return i === -1 ? ORT_REIHENFOLGE.length : i;
};

/** Optionaler Node: fehlt er, laeuft der Rest trotzdem. */
function hole(name) {
  try { return $(name).all().map((i) => i.json); } catch (e) { return []; }
}

const programm  = $input.all().map((i) => i.json);
const kinos     = hole('Kinos holen');
const watchlist = hole('Watchlist holen');
// 'Always Output Data' liefert bei leerer Tabelle ein leeres Item —
// das ist keine MUBI-Zeile, auch wenn es eine ist.
const mubiZeile = hole('MUBI holen').find((r) => r && r.raw_title) || null;

// MUBI GO erkennt v_programm ueber die tmdb_id der mubi_go-Zeile. Steht die
// dort nicht (weil den Titel noch niemand aufgeloest hat), bleibt die Fahne
// fuer jeden Film aus. Deshalb zusaetzlich der Titelvergleich, so wie es die
// lokale Fassung in build-today.js gemacht hat.
const flach = (x) => String(x || '').toLowerCase()
  .replace(/\u00e4/g, 'ae').replace(/\u00f6/g, 'oe').replace(/\u00fc/g, 'ue').replace(/\u00df/g, 'ss')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '');
const mubiTitel = mubiZeile ? flach(mubiZeile.raw_title) : null;
const istMubi = (r) => !!r.mubi_go || (!!mubiTitel && flach(r.raw_title) === mubiTitel);

if (!programm.length) {
  throw new Error('v_programm liefert 0 Zeilen — heute wird nichts geschrieben.');
}

// Supabase deckelt die Data API auf 1000 Zeilen und schneidet still ab.
// Eine halbe Seite ist schlimmer als eine leere: Sie sieht richtig aus.
if (programm.length >= 1000) {
  throw new Error(
    `v_programm liefert genau ${programm.length} Zeilen — das ist vermutlich die ` +
    `Seitengrenze der Supabase-API, nicht das volle Programm. Entweder "Max rows" ` +
    `unter Project Settings -> API erhoehen oder den Abruf seitenweise holen.`);
}

// --- Filme gruppieren -------------------------------------------------
// Schluessel ist source_key: die kino-zeit-node-ID des Films, oder die
// Ersatzform 'titel:...' bei Quellen ohne eigene ID (Traumpalast IMAX).
const filme = new Map();
const alleDaten = new Set();
const kinosMitProgramm = new Set();

for (const r of programm) {
  const start = DateTime.fromISO(r.starts_at, { setZone: true }).setZone(ZONE);
  const datum = start.toFormat('yyyy-MM-dd');
  const zeit  = start.toFormat('HH:mm');
  alleDaten.add(datum);
  kinosMitProgramm.add(r.cinema_id);

  // Gruppiert wird nach TMDb-Kennung, wo es eine gibt — sonst nach
  // source_key. Derselbe Film kommt sonst zweimal auf die Seite, wenn ihn
  // zwei Quellen melden: kino-zeit unter seiner node-ID, die Innenstadtkinos
  // unter ihrer Programm-ID. Nebeneffekt, den die lokale Fassung mit einer
  // eigenen Nachlese erkaufen musste: OV- und DF-Eintraege desselben Films
  // fallen ebenfalls zusammen.
  const key = r.tmdb_id ? 'tmdb:' + r.tmdb_id : String(r.source_key);
  if (!filme.has(key)) {
    // 'treffer' heisst hier: auf der Watchlist UND sicher aufgeloest.
    // Die alten Statuswerte bleiben, weil das Dashboard sie so liest.
    const status = r.auf_watchlist
      ? (r.match_status === 'sicher' ? 'treffer' : 'unscharf')
      : 'kein_treffer';
    filme.set(key, {
      key,
      film_nodes: [],
      title:       r.raw_title,
      title_de:    r.title_de   || null,
      title_orig:  r.title_orig || null,
      tmdb_id:     r.tmdb_id    || null,
      genre:       r.genre       ?? null,
      runtime_min: r.runtime_min ?? r.film_runtime_min ?? null,
      match: {
        status,
        confidence:  r.confidence ?? 0,
        resolved_by: r.resolved_by || null,
        watchlist: r.auf_watchlist ? {
          title:    r.watchlist_titel,
          year:     r.watchlist_jahr ? Number(r.watchlist_jahr) || null : null,
          added_on: r.watchlist_seit,
          uri:      r.watchlist_uri,
          runtime:  r.film_runtime_min ?? null,
          director: r.director ?? null,
          tmdb_id:  r.tmdb_id ?? null
        } : null,
        related: []
      },
      mubi_go: istMubi(r),
      showings: []
    });
  }

  const f = filme.get(key);
  // Die kino-zeit-node-ID bleibt als Herkunftsnachweis am Film haengen.
  if (/^\d+$/.test(String(r.source_key)) && !f.film_nodes.includes(String(r.source_key)))
    f.film_nodes.push(String(r.source_key));
  if (!f.mubi_go && istMubi(r)) f.mubi_go = true;
  if (!f.genre && r.genre) f.genre = r.genre;
  if (!f.runtime_min && r.runtime_min) f.runtime_min = r.runtime_min;
  f.showings.push({
    cinema_id:   r.cinema_id,
    date:        datum,
    time:        zeit,
    version:     r.version ?? null,
    format:      r.format ?? null,
    booking_url: r.booking_url ?? null,
    nachtrag:    null
  });
}

for (const f of filme.values()) {
  // Melden zwei Quellen dieselbe Vorstellung, steht sie sonst doppelt im
  // Tagesplan — gleiche Uhrzeit, gleiches Kino, einmal je Quelle.
  const gesehen = new Set();
  f.showings = f.showings.filter((s) => {
    const k = s.cinema_id + '|' + s.date + '|' + s.time;
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
  f.showings.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

const daten = [...alleDaten].sort();
const heute = daten[0];

// Sortierung wie im Dashboard erwartet: Treffer zuerst, dann MUBI GO,
// dann unscharf, dann der Rest alphabetisch.
const liste = [...filme.values()].sort((a, b) => {
  const rang = (f) => f.match.status === 'treffer' ? 0
                    : f.mubi_go ? 1
                    : f.match.status === 'unscharf' ? 2 : 4;
  return rang(a) - rang(b) || a.title.localeCompare(b.title, 'de');
});

// --- Kinos und Gruppen aus den Stammdaten -----------------------------
// Bewusst aus `cinema` und nicht aus dem Programm: sonst verschwindet genau
// das Haus aus dem Dashboard, dessen Programm gerade fehlt — und ein
// stillschweigend fehlendes Kino ist schlimmer als ein leeres.
const cinemas = kinos.map((k) => ({
  id: k.id, name: k.name, ort: k.ort, district: k.district,
  mubi_partner: k.mubi_partner, group: k.group_id, group_name: k.group_name,
  kinozeit_node: k.kinozeit_node,
  source_url: k.source_url || ('https://www.kino-zeit.de/kinoprogramm/ort/' + k.ort),
  status: kinosMitProgramm.has(k.id) ? 'live' : 'abruf_offen'
})).sort((a, b) =>
  (ortRang(a.ort) - ortRang(b.ort)) ||
  (Number(b.mubi_partner) - Number(a.mubi_partner)) ||
  a.name.localeCompare(b.name, 'de'));

const gruppenIds = [...new Set(kinos.map((k) => k.group_id))];
const groups = gruppenIds.map((gid) => {
  const mitglieder = kinos.filter((k) => k.group_id === gid);
  return {
    id: gid,
    name: mitglieder[0]?.group_name || gid,
    ort: mitglieder[0]?.ort || null,
    cinemas: mitglieder.map((k) => k.id),
    mubi_partner: mitglieder.some((k) => k.mubi_partner)
  };
}).sort((a, b) => ortRang(a.ort) - ortRang(b.ort));

// --- Zusammenbau ------------------------------------------------------
const heutige = liste.flatMap((f) => f.showings.filter((s) => s.date === heute));

const out = {
  generated_at: DateTime.now().toUTC().toISO(),
  region: REGION,
  city: REGION,                       // Altfeld, damit aeltere Leser nicht brechen
  date_from: daten[0],
  date_to: daten[daten.length - 1],
  dates: daten,
  watchlist: {
    username: LETTERBOXD_USER,
    total: watchlist.length,
    source: `https://letterboxd.com/${LETTERBOXD_USER}/watchlist/`
  },
  mubi_go: mubiZeile
    ? { title: mubiZeile.raw_title, source: mubiZeile.source || 'https://mubi.com/de/de/go' }
    : { title: null, source: 'https://mubi.com/de/de/go' },
  matching: {
    stufe: 'C',
    verfahren: 'TMDb-IDs aus title_alias; Titel werden nur zur Kandidatensuche benutzt, nie zum Vergleich',
    schwellen: { treffer: 0.95, unscharf: 0.85 },
    grenze: 'TMDb sucht gegen Original- und englischen Titel; ein rein deutscher Verleihtitel findet seinen Film nicht — etwa "Nur getraeumt" gegen "Juste une illusion".'
  },
  groups,
  cinemas,
  films: liste,
  stats: {
    treffer:  liste.filter((f) => f.match.status === 'treffer').length,
    unscharf: liste.filter((f) => f.match.status === 'unscharf').length,
    verwandt: 0,
    filme: liste.length,
    vorstellungen: liste.reduce((n, f) => n + f.showings.length, 0),
    vorstellungen_heute: heutige.length,
    mubi_go: liste.filter((f) => f.mubi_go).length,
    kinos_live: kinosMitProgramm.size,
    kinos_gesamt: cinemas.length,
    watchlist_mit_tmdb: watchlist.filter((w) => w.tmdb_id).length
  },
  sources: [
    { name: 'kino-zeit.de — Ortsseiten Region Stuttgart', url: 'https://www.kino-zeit.de/kinoprogramm/ort/Stuttgart' },
    { name: 'Traumpalast Leonberg — IMAX-Programm', url: 'https://leonberg.traumpalast.de/index.php/PID/11321.html' },
    { name: 'Letterboxd-Datenexport', url: `https://letterboxd.com/${LETTERBOXD_USER}/watchlist/` },
    { name: 'TMDb', url: 'https://www.themoviedb.org/' },
    { name: 'MUBI GO', url: 'https://mubi.com/de/de/go' }
  ]
};

console.log(`today.json: ${out.stats.filme} Filme, ${out.stats.vorstellungen} Vorstellungen, ${daten.length} Tage`);
console.log(`Treffer: ${out.stats.treffer} · unscharf: ${out.stats.unscharf} · MUBI GO: ${out.stats.mubi_go}`);
console.log(`Kinos live: ${out.stats.kinos_live} von ${out.stats.kinos_gesamt}`);

return [{ json: out }];
