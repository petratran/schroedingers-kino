/**
 * Baut data/today.json — die einzige Datei, die das Dashboard laedt.
 *
 *   node pipeline/build-today.js
 *
 * Eingaben:  data/showings-raw.json   (Ausgabe von n8n/04-parse-kinozeit.js)
 *            export/watchlist.csv     (Letterboxd-Datenexport)
 * Ausgabe:   data/today.json
 *
 * Das Matching hier ist Stufe B: normalisierte Titel, Aehnlichkeit ueber
 * Zeichen-Bigramme, harte Fortsetzungssperre. Kein TMDb, kein LLM — die
 * kommen in n8n dazu und fuellen dieselben Felder (status, confidence,
 * resolved_by). Am Dashboard aendert sich dadurch nichts.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { normalizeTitle, sequelIndex, squash, toAscii } = require(path.join(ROOT, 'n8n/01-normalize.js'));
const { similarity } = require(path.join(ROOT, 'n8n/02-score-decide.js'));

const SCHWELLE_TREFFER = 0.95;
const SCHWELLE_UNSCHARF = 0.90;   // darunter ist ein Stringtreffer nur noch Zufall

// Der MUBI-GO-Film der Woche. In n8n kommt der aus Workflow 4.
const MUBI_GO = { title: 'Gentle Monster', source: 'https://mubi.com/de/de/go' };

// Letterboxd-Konto, dessen Export unter export/watchlist.csv liegt.
const LETTERBOXD_USER = 'savoy_truffle';

// --- Watchlist einlesen --------------------------------------------------
// Angereicherte Watchlist (aus letterboxd.com/film/<slug>/json/), Schluessel ist
// die Letterboxd-Kennung. Fehlt die Datei, laeuft alles ohne Zusatzfelder weiter.
const ANGEREICHERT = (() => {
  try {
    const roh = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/watchlist-angereichert.json'), 'utf8'));
    const [iSlug, iLid, iName, iOrig, iJahr, iLauf, iRegie] = [0, 1, 2, 3, 4, 5, 6];
    const map = {};
    for (const z of roh.filme || [])
      map[z[iLid]] = { slug: z[iSlug], originalName: z[iOrig], year: z[iJahr],
                       runtime: z[iLauf], director: z[iRegie] };
    return map;
  } catch (e) { if (e.code !== 'ENOENT') throw e; return {}; }
})();

// TMDb-Kennungen, sofern pipeline/fetch-tmdb-ids.js schon gelaufen ist.
// Sie kommen direkt von der Letterboxd-Filmseite und sind damit exakt — auf
// dieser Seite braucht es keine Titelsuche und keinen Schiedsrichter mehr.
const TMDB_IDS = (() => {
  try {
    return (JSON.parse(fs.readFileSync(path.join(ROOT, 'data/watchlist-tmdb.json'), 'utf8')) || {}).filme || {};
  } catch (e) { if (e.code !== 'ENOENT') throw e; return {}; }
})();

function readWatchlist(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(',');
  const idx = (n) => head.indexOf(n);
  return lines.map((line) => {
    // Titel koennen Kommas in Anfuehrungszeichen enthalten
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) =>
      c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    const r = { date: cells[idx('Date')], name: cells[idx('Name')],
                year: cells[idx('Year')], uri: cells[idx('Letterboxd URI')] };
    // Laufzeit, Regie und Originaltitel liegen angereichert vor — ueber die
    // Letterboxd-Kennung aus der URL (boxd.it/<lid>) zugeordnet.
    const zusatz = ANGEREICHERT[String(r.uri || '').split('/').pop()];
    if (zusatz) { r.runtime = zusatz.runtime; r.director = zusatz.director;
                  r.originalName = zusatz.originalName; }
    const ids = TMDB_IDS[String(r.uri || '').split('/').pop()];
    if (ids) { r.tmdb_id = ids.tmdb_id; r.imdb_id = ids.imdb_id; }
    const n = normalizeTitle(r.name || '');
    return { ...r, norm: n.norm, normPlain: n.normPlain, sequel: n.sequel };
  }).filter((r) => r.name);
}

// --- ein Kinotitel gegen die Watchlist ----------------------------------
function matchWatchlist(rawTitle, watchlist) {
  const me = normalizeTitle(rawTitle);
  let best = null, related = [];
  for (const w of watchlist) {
    const score = Math.max(similarity(me.norm, w.norm), similarity(me.normPlain, w.normPlain));
    if (score < SCHWELLE_UNSCHARF) continue;
    if (w.sequel !== me.sequel) {
      related.push({ title: w.name, year: w.year, uri: w.uri, score: +score.toFixed(3),
                     relation: w.sequel < me.sequel ? 'vorgaenger' : 'nachfolger' });
      continue;
    }
    if (!best || score > best.score) best = { ...w, score: +score.toFixed(3) };
  }
  related.sort((a, b) => b.score - a.score);
  related = related.slice(0, 2);

  if (best && best.score >= SCHWELLE_TREFFER)
    return { status: 'treffer', confidence: best.score, resolved_by: 'titel',
             watchlist: { title: best.name, year: best.year, added_on: best.date, uri: best.uri,
                          runtime: best.runtime || null, director: best.director || null,
                          originalName: best.originalName || null,
                          tmdb_id: best.tmdb_id || null, imdb_id: best.imdb_id || null }, related };
  if (best)
    return { status: 'unscharf', confidence: best.score, resolved_by: 'titel',
             watchlist: { title: best.name, year: best.year, added_on: best.date, uri: best.uri,
                          runtime: best.runtime || null, director: best.director || null,
                          originalName: best.originalName || null,
                          tmdb_id: best.tmdb_id || null, imdb_id: best.imdb_id || null }, related };
  return { status: related.length ? 'verwandt' : 'kein_treffer', confidence: 0, resolved_by: 'titel',
           watchlist: null, related };
}

// --- Aufbau --------------------------------------------------------------
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/showings-raw.json'), 'utf8'));
const STAMM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/kinos.json'), 'utf8'));

// Reihenfolge der Orte kommt aus den Stammdaten, nicht aus dem Code: sie ist eine
// Entscheidung ueber die Region, keine Eigenschaft des Aufbereitungsskripts.
// Ein Ort ohne Rang landet hinten statt still vorne — dann faellt er auf.
const ORTE = STAMM.ort_reihenfolge || [];
const ortRang = (ort) => { const i = ORTE.indexOf(ort); return i < 0 ? ORTE.length : i; };
// Ort zuerst, darin die MUBI-GO-Partner nach oben, dann alphabetisch. Die
// Partner stehen bewusst nicht ueber allem: die Ortsreihenfolge ist die
// groebere Entscheidung, und alle Partner liegen ohnehin in Stuttgart.
const nachOrtPartnerName = (a, b) =>
  (ortRang(a.ort) - ortRang(b.ort)) ||
  String(a.ort || '').localeCompare(String(b.ort || ''), 'de') ||
  (Number(!!b.mubi_partner) - Number(!!a.mubi_partner)) ||
  String(a.name).localeCompare(String(b.name), 'de');

// Nachtraege: kino-zeit fuehrt die Sonderreihen der Innenstadtkinos nachweislich
// nicht — am 21.10. und am 04.11. meldet die Stadtseite das EM gar nicht, obwohl
// das Kino selbst je eine Vorstellung aushaengt. Bis ein Adapter fuer
// innenstadtkinos.de laeuft, kommen diese Termine aus einer belegten Handliste.
// Sie durchlaufen denselben Abgleich wie alle anderen und werden im Dashboard
// gestrichelt markiert, damit niemand sie fuer Abrufdaten haelt.
let nachtraege = { eintraege: [] };
try {
  nachtraege = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nachtraege.json'), 'utf8'));
} catch (e) { if (e.code !== 'ENOENT') throw e; }
for (const e of nachtraege.eintraege) {
  if (!raw.showings[e.kino_id])
    throw new Error('Nachtrag zeigt auf unbekanntes Kino: ' + e.kino_id);
  const doppelt = raw.showings[e.kino_id].some((r) =>
    r.date === e.date && r.time === e.time && r.raw_title === e.raw_title);
  if (doppelt) continue;   // Quelle hat aufgeholt: Nachtrag stillschweigend fallen lassen
  raw.showings[e.kino_id].push(Object.assign({}, e, { nachtrag: true }));
}
console.log('Nachtraege eingespielt:', nachtraege.eintraege.length);
const watchlist = readWatchlist(path.join(ROOT, 'export/watchlist.csv'));

const filme = new Map();   // film_node -> Filmobjekt
const alleDaten = new Set();

for (const [cid, rows] of Object.entries(raw.showings)) {
  for (const r of rows) {
    // Meist identifiziert die kino-zeit-node-ID den Film eindeutig. Ein paar
    // Eintraege (Sondervorstellungen, Reihen) verlinken anders — dort faellt
    // der Schluessel auf den normalisierten Titel zurueck, sonst stuende
    // derselbe Film zweimal auf der Seite, einmal je Sprachfassung.
    const key = /^\d+$/.test(String(r.film_node))
      ? String(r.film_node)
      : 'titel:' + normalizeTitle(r.raw_title).norm;
    if (!filme.has(key)) {
      filme.set(key, {
        key,
        film_nodes: [],
        title: r.raw_title,
        genre: r.genre,
        runtime_min: r.runtime_min,
        match: matchWatchlist(r.raw_title, watchlist),
        mubi_go: squash(toAscii(r.raw_title)) === squash(toAscii(MUBI_GO.title)),
        showings: []
      });
    }
    const f = filme.get(key);
    if (!f.film_nodes.includes(r.film_node)) f.film_nodes.push(r.film_node);
    if (!f.genre && r.genre) f.genre = r.genre;
    if (!f.runtime_min && r.runtime_min) f.runtime_min = r.runtime_min;
    alleDaten.add(r.date);
    f.showings.push({ cinema_id: cid, date: r.date, time: r.time,
                      version: r.version, format: r.format, booking_url: r.booking_url,
                      nachtrag: r.nachtrag ? { beleg: r.beleg, belegt_am: r.belegt_am,
                                               reihe: r.reihe || null } : null });
  }
}

// Nachlese: Filme, die teils mit node-ID und teils ohne verlinkt sind, stehen
// sonst zweimal auf der Seite — "Dune: Part Three" kam so als OF- und als
// DF-Eintrag getrennt heraus. Ein Titel-Schluessel wird in den node-Eintrag
// desselben Titels eingeschmolzen, aber nur wenn es genau einen gibt.
for (const [key, f] of [...filme]) {
  if (!String(key).startsWith('titel:')) continue;
  const norm = normalizeTitle(f.title).norm;
  const ziele = [...filme.values()].filter((g) =>
    g !== f && !String(g.key).startsWith('titel:') && normalizeTitle(g.title).norm === norm);
  if (ziele.length !== 1) continue;
  const z = ziele[0];
  z.showings.push(...f.showings);
  for (const n of f.film_nodes) if (!z.film_nodes.includes(n)) z.film_nodes.push(n);
  if (!z.genre && f.genre) z.genre = f.genre;
  if (!z.runtime_min && f.runtime_min) z.runtime_min = f.runtime_min;
  filme.delete(key);
}

for (const f of filme.values())
  f.showings.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

const daten = [...alleDaten].sort();
const heute = daten[0];
const liste = [...filme.values()].sort((a, b) => {
  const rang = (f) => f.match.status === 'treffer' ? 0 : f.mubi_go ? 1 : f.match.status === 'unscharf' ? 2 : f.match.status === 'verwandt' ? 3 : 4;
  return rang(a) - rang(b) || a.title.localeCompare(b.title, 'de');
});

const heutigeVorstellungen = liste.flatMap((f) => f.showings.filter((s) => s.date === heute));

const out = {
  generated_at: new Date().toISOString(),
  region: STAMM.region,
  city: STAMM.region,   // Altfeld, damit aeltere Leser nicht brechen
  date_from: daten[0], date_to: daten[daten.length - 1], dates: daten,
  watchlist: { username: LETTERBOXD_USER, total: watchlist.length,
               source: `https://letterboxd.com/${LETTERBOXD_USER}/watchlist/` },
  mubi_go: MUBI_GO,
  matching: {
    stufe: 'B',
    verfahren: 'normalisierte Titel, Zeichen-Bigramme, harte Fortsetzungssperre',
    schwellen: { treffer: SCHWELLE_TREFFER, unscharf: SCHWELLE_UNSCHARF },
    grenze: 'Ohne TMDb-Abgleich bleiben Filme unentdeckt, deren deutscher Verleihtitel vom Originaltitel abweicht — etwa Vaterland gegen Fatherland.'
  },
  // Gruppen und Kinos kommen aus den Stammdaten, nicht aus dem Mitschnitt:
  // sonst verschwinden genau die Haeuser aus dem Dashboard, deren Programm noch
  // fehlt — und ein stillschweigend fehlendes Kino ist schlimmer als ein leeres.
  groups: STAMM.gruppen.map((g) => ({
    id: g.id, name: g.name, ort: g.ort,
    cinemas: STAMM.kinos.filter((k) => k.group === g.id).map((k) => k.id),
    mubi_partner: STAMM.kinos.some((k) => k.group === g.id && k.mubi_partner)
  })).sort((a, b) => (ortRang(a.ort) - ortRang(b.ort)) || 0),
  cinemas: STAMM.kinos.map((k) => {
    const erfasst = !!raw.cinemas[k.id];
    return {
      id: k.id, name: k.name, ort: k.ort, district: k.district,
      mubi_partner: k.mubi_partner, group: k.group,
      group_name: (STAMM.gruppen.find((g) => g.id === k.group) || {}).name,
      kinozeit_node: k.node,
      source_url: 'https://www.kino-zeit.de/kinoprogramm/ort/' + k.ort,
      status: erfasst ? 'live' : 'abruf_offen'
    };
  }).sort(nachOrtPartnerName),
  films: liste,
  stats: {
    treffer: liste.filter((f) => f.match.status === 'treffer').length,
    unscharf: liste.filter((f) => f.match.status === 'unscharf').length,
    verwandt: liste.filter((f) => f.match.status === 'verwandt').length,
    filme: liste.length,
    vorstellungen: liste.reduce((n, f) => n + f.showings.length, 0),
    vorstellungen_heute: heutigeVorstellungen.length,
    mubi_go: liste.filter((f) => f.mubi_go).length,
    kinos_live: Object.keys(raw.cinemas).length,
    kinos_gesamt: STAMM.kinos.length,
    watchlist_mit_tmdb: Object.keys(TMDB_IDS).length
  },
  sources: [
    { name: 'kino-zeit.de — Stadtseite Stuttgart', url: 'https://www.kino-zeit.de/kinoprogramm/ort/Stuttgart', captured_at: raw.captured_at },
    { name: 'Letterboxd-Datenexport', url: `https://letterboxd.com/${LETTERBOXD_USER}/watchlist/` },
    { name: 'MUBI GO', url: MUBI_GO.source }
  ].concat(nachtraege.eintraege.length
    ? [{ name: 'innenstadtkinos.de — belegte Nachträge (' + nachtraege.eintraege.length + ')',
         url: 'https://www.innenstadtkinos.de/de/programm/', captured_at: nachtraege.geprueft_am }]
    : [])
};

if (!out.films.length) throw new Error('0 Filme — Eingaben pruefen, heute wird nichts geschrieben.');

fs.writeFileSync(path.join(ROOT, 'data/today.json'), JSON.stringify(out, null, 1));
console.log(`data/today.json geschrieben — ${out.stats.filme} Filme, ${out.stats.vorstellungen} Vorstellungen, ${daten.length} Tage`);
console.log(`Treffer: ${out.stats.treffer} · unscharf: ${out.stats.unscharf} · verwandt: ${out.stats.verwandt} · MUBI GO: ${out.stats.mubi_go}`);
for (const f of liste.filter((f) => f.match.status !== 'kein_treffer' || f.mubi_go)) {
  console.log(`  ${f.match.status.padEnd(12)} ${f.title.padEnd(30)} ${f.match.watchlist ? f.match.watchlist.title + ' (' + f.match.watchlist.year + ') ' + f.match.confidence : ''}${f.match.related.length ? ' ~ ' + f.match.related.map(r => r.title + ' [' + r.relation + ']').join(', ') : ''}${f.mubi_go ? '  [MUBI GO]' : ''}`);
}
