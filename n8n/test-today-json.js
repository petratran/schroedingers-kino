/**
 * Prueft 08-today-json.js mit erfundenen Zeilen aus v_programm.
 * Luxon und die n8n-Globals werden minimal nachgebaut.
 *   node n8n/test-today-json.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '08-today-json.js'), 'utf8');

// --- Stubs -----------------------------------------------------------
const DateTime = {
  fromISO: (s) => ({ setZone: () => ({
    toFormat: (f) => (f === 'yyyy-MM-dd' ? String(s).slice(0, 10) : String(s).slice(11, 16))
  })}),
  now: () => ({ toUTC: () => ({ toISO: () => '2026-09-21T12:00:00.000Z' }) })
};

const zeile = (o) => ({ json: Object.assign({
  cinema_id: 'delphi', cinema_name: 'Delphi Arthaus Kino', district: 'Stuttgart-Sued',
  group_id: 'arthaus', group_name: 'Arthaus Filmtheater', mubi_partner: true,
  raw_title: 'Irgendein Film', version: null, format: null, genre: 'Drama',
  runtime_min: 100, starts_at: '2026-09-21T20:15:00+02:00', booking_url: null,
  tmdb_id: null, confidence: 0, resolved_by: 'offen', match_status: 'offen',
  auf_watchlist: false, watchlist_titel: null, watchlist_seit: null, mubi_go: false,
  source_key: '1000', ort: 'Stuttgart', kinozeit_node: '2354',
  watchlist_uri: null, watchlist_jahr: null, title_de: null, title_orig: null,
  film_jahr: null, film_runtime_min: null, director: null, poster_path: null
}, o) });

const programm = [
  zeile({ source_key: '62765', raw_title: 'Vaterland', tmdb_id: 1437696, confidence: 0.97,
          resolved_by: 'tmdb', match_status: 'sicher', auf_watchlist: true,
          watchlist_titel: 'Fatherland', watchlist_seit: '2026-09-19',
          watchlist_uri: 'https://boxd.it/abc', watchlist_jahr: '2026',
          title_de: 'Vaterland', title_orig: 'Ojczyzna', film_runtime_min: 118,
          director: 'Jan Kowalski' }),
  zeile({ source_key: '62765', raw_title: 'Vaterland', tmdb_id: 1437696, confidence: 0.97,
          resolved_by: 'tmdb', match_status: 'sicher', auf_watchlist: true,
          cinema_id: 'atelier', starts_at: '2026-09-22T18:00:00+02:00' }),
  zeile({ source_key: 'titel:avengers-endgame-extended', raw_title: 'Avengers: Endgame Extended',
          cinema_id: 'traumpalast-imax', ort: 'Leonberg', group_id: 'leonberg',
          group_name: 'Leonberg · IMAX', mubi_partner: false, format: 'IMAX',
          starts_at: '2026-09-24T19:00:00+02:00' }),
  zeile({ source_key: '77777', raw_title: 'Ein MUBI-Film', mubi_go: true,
          starts_at: '2026-09-23T21:00:00+02:00' })
];

const kinos = [
  { id: 'delphi', name: 'Delphi Arthaus Kino', ort: 'Stuttgart', district: 'Stuttgart-Sued',
    mubi_partner: true, group_id: 'arthaus', group_name: 'Arthaus Filmtheater', kinozeit_node: '2354' },
  { id: 'atelier', name: 'atelier am bollwerk', ort: 'Stuttgart', district: 'Stuttgart-Mitte',
    mubi_partner: true, group_id: 'arthaus', group_name: 'Arthaus Filmtheater', kinozeit_node: '2357' },
  { id: 'traumpalast-imax', name: 'Traumpalast IMAX Leonberg', ort: 'Leonberg', district: 'Leonberg',
    mubi_partner: false, group_id: 'leonberg', group_name: 'Leonberg · IMAX', kinozeit_node: '53864' },
  { id: 'komm-es', name: 'Kommunales Kino Esslingen', ort: 'Esslingen', district: 'Esslingen',
    mubi_partner: false, group_id: 'esslingen', group_name: 'Esslingen', kinozeit_node: '2194' }
];

const nodes = {
  'Kinos holen':     kinos.map((k) => ({ json: k })),
  'Watchlist holen': Array.from({ length: 74 }, (_, i) => ({ json: { tmdb_id: i < 70 ? 1000 + i : null } })),
  'MUBI holen':      [{ json: { raw_title: 'Gentle Monster', source: 'https://mubi.com/de/de/go' } }]
};
const $ = (name) => {
  if (!nodes[name]) throw new Error('unbekannter Node: ' + name);
  return { all: () => nodes[name] };
};

const stilleLogs = [];
const fakeConsole = { log: (...a) => stilleLogs.push(a.join(' ')) };

const lauf = new Function('$input', '$', 'DateTime', 'console', src);
const [{ json: out }] = lauf({ all: () => programm }, $, DateTime, fakeConsole);

// --- Pruefungen ------------------------------------------------------
let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? 'ok  ' : 'FEHL'} ${name}${ok ? '' : `\n     ist:  ${JSON.stringify(ist)}\n     soll: ${JSON.stringify(soll)}`}`);
};

pruefe('Filme gruppiert',            out.films.length, 3);
pruefe('Vaterland hat 2 Termine',    out.films.find((f) => f.key === '62765').showings.length, 2);
pruefe('Treffer steht vorn',         out.films[0].title, 'Vaterland');
pruefe('MUBI-Film auf Rang 2',       out.films[1].mubi_go, true);
pruefe('match.status Treffer',       out.films[0].match.status, 'treffer');
pruefe('watchlist-Block gefuellt',   out.films[0].match.watchlist.uri, 'https://boxd.it/abc');
pruefe('kein Treffer ohne Watchlist', out.films[2].match.status, 'kein_treffer');
pruefe('film_nodes nur bei Zahl-Key', out.films.find((f) => f.key.startsWith('titel:')).film_nodes, []);
pruefe('Termine sortiert',           out.films[0].showings.map((s) => s.date + ' ' + s.time),
                                     ['2026-09-21 20:15', '2026-09-22 18:00']);
pruefe('Daten gesammelt',            out.dates, ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
pruefe('date_from/date_to',          [out.date_from, out.date_to], ['2026-09-21', '2026-09-24']);
pruefe('Kinos live',                 out.stats.kinos_live, 3);
pruefe('Kinos gesamt',               out.stats.kinos_gesamt, 4);
pruefe('Kino ohne Programm bleibt',  out.cinemas.find((c) => c.id === 'komm-es').status, 'abruf_offen');
pruefe('Ortsreihenfolge',            out.cinemas.map((c) => c.ort), ['Stuttgart', 'Stuttgart', 'Esslingen', 'Leonberg']);
pruefe('Gruppen gebaut',             out.groups.map((g) => g.id), ['arthaus', 'esslingen', 'leonberg']);
pruefe('Vorstellungen gezaehlt',     out.stats.vorstellungen, 4);
pruefe('heutige Vorstellungen',      out.stats.vorstellungen_heute, 1);
pruefe('Watchlist-Gesamtzahl',       out.watchlist.total, 74);
pruefe('Watchlist mit TMDb',         out.stats.watchlist_mit_tmdb, 70);
pruefe('MUBI-Titel uebernommen',     out.mubi_go.title, 'Gentle Monster');
pruefe('Stufe C',                    out.matching.stufe, 'C');

console.log('\n' + stilleLogs.join('\n'));
console.log(fehler ? `\n${fehler} Pruefung(en) fehlgeschlagen` : '\nalle Pruefungen bestanden');
process.exit(fehler ? 1 : 0);
