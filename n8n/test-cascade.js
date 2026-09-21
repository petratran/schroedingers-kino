/**
 * Prueft die beiden Code-Nodes gegen echte Faelle aus dem Stuttgarter Programm.
 * Laeuft ohne Abhaengigkeiten:  node test-cascade.js
 */
const { normalizeTitle } = require('./01-normalize.js');
const { decide } = require('./02-score-decide.js');

const f = (id, title, original, date) =>
  ({ id, title, original_title: original || title, release_date: date });

const CASES = [
  { name: 'Exakter Treffer',
    raw: 'Gentle Monster',
    tmdb: [f(1, 'Gentle Monster', null, '2026-02-12')],
    expect: { decision: 'tmdb', tmdb_id: 1 } },

  { name: 'Fassungszusatz "Extended" (Repertoire-Treffer)',
    raw: 'Avengers: Endgame Extended',
    tmdb: [f(299534, 'Avengers: Endgame', null, '2019-04-24')],
    expect: { decision: 'tmdb', tmdb_id: 299534 } },

  { name: 'Fortsetzung darf nicht auf den Vorgaenger fallen',
    raw: 'Practical Magic 2',
    tmdb: [f(11162, 'Practical Magic', 'Practical Magic', '1998-10-16')],
    expect: { decision: 'unresolved', related: 'vorgaenger' } },

  { name: 'Richtiger Teil aus mehreren',
    raw: 'Dune: Part Three',
    tmdb: [f(693134, 'Dune: Part Two', null, '2024-02-27'),
           f(1064213, 'Dune: Part Three', null, '2026-12-18')],
    expect: { decision: 'tmdb', tmdb_id: 1064213 } },

  { name: 'Sprachgrenze: Verleihtitel vs. Originaltitel',
    raw: 'Vaterland',
    tmdb: [f(9001, 'Vaterland', 'Fatherland', '2026-03-05')],
    expect: { decision: 'tmdb', tmdb_id: 9001 } },

  { name: 'Sprachfassung im Aushang',
    raw: 'Pressure (OmU)',
    tmdb: [f(5501, 'Pressure', null, '2026-08-21')],
    expect: { decision: 'tmdb', tmdb_id: 5501 } },

  { name: 'Umlaut',
    raw: 'Frühstück bei Audrey',
    tmdb: [f(7702, 'Frühstück bei Audrey', null, '2026-05-02')],
    expect: { decision: 'tmdb', tmdb_id: 7702 } },

  { name: 'Reihenname wird vor der Suche abgeschnitten',
    raw: 'Weird Wednesday: Drive', date: '2026-11-04',
    tmdb: [f(1819, 'Drive', null, '2011-09-16')],
    expect: { decision: 'tmdb', tmdb_id: 1819 } },

  { name: 'Kein Kandidat — darf nichts erfinden',
    raw: 'Kalter Hund',
    tmdb: [],
    expect: { decision: 'unresolved' } },

  { name: 'Reihentitel ohne Film dahinter',
    raw: 'Arthaus Sneak Vol. 41',
    tmdb: [],
    expect: { decision: 'unresolved' } },

  { name: 'Titelgleich, aber nur einer läuft gerade',
    raw: 'David', date: '2026-09-18',
    tmdb: [f(301, 'David', null, '1951-03-14'),
           f(302, 'David', null, '1979-09-01'),
           f(303, 'David', null, '2026-06-11')],
    expect: { decision: 'tmdb', tmdb_id: 303 } },

  { name: 'Echter Fall: "Vaterland" mit fünf Titelgleichen',
    raw: 'Vaterland', date: '2026-09-18',
    tmdb: require('./fixtures/tmdb-vaterland.json').results.map(
      (c) => ({ id: c.id, title: c.title, original_title: c.original_title, release_date: c.release_date })),
    expect: { decision: 'tmdb', tmdb_id: 1437696 } },

  { name: 'Titelgleich, alle alt — dafür ist der LLM-Node da',
    raw: 'Vaterland', date: '2026-09-18',
    tmdb: [f(96820, 'Vaterland', 'Vaterland', '2002-10-18'),
           f(11248, 'Vaterland', 'Fatherland', '1994-11-26'),
           f(129455,'Vaterland', 'Fatherland', '1986-09-02')],
    expect: { decision: 'needs_llm' } },

  { name: 'Preview vor dem Kinostart zählt noch als aktuell',
    raw: 'Dune: Part Three', date: '2026-12-15',
    tmdb: [f(1064213, 'Dune: Part Three', null, '2026-12-18'),
           f(999999,  'Dune: Part Three', null, '1984-01-01')],
    expect: { decision: 'tmdb', tmdb_id: 1064213 } },
];

// --- Innenstadtkinos: Reihe ohne Doppelpunkt, Jahr im Titel ------------
// Am 21.09.2026 aus der neuen Quelle abgelesen. Beide Eigenheiten zusammen
// liessen die Kaskade vorher ins Leere laufen: "weird wednesday taxi driver
// 1976" findet bei TMDb nichts, und selbst mit dem richtigen Kandidaten in
// der Liste sank die Aehnlichkeit auf 0,42.
CASES.push(
  { name: 'Reihe ohne Doppelpunkt, Jahr entscheidet den Gleichstand',
    raw: 'Weird Wednesday TAXI DRIVER (1976)',
    date: '2026-10-21',
    tmdb: [f(103, 'Taxi Driver', null, '1976-02-08'),
           f(875, 'Taxi Driver', null, '1954-11-01')],
    expect: { decision: 'tmdb', tmdb_id: 103 } },

  { name: 'Jahresangabe trennt Film von Neuverfilmung',
    raw: 'Weird Wednesday DRIVE (2011)',
    date: '2026-11-04',
    tmdb: [f(64690, 'Drive', null, '2011-09-16'),
           f(9999, 'Drive', null, '1997-05-01')],
    expect: { decision: 'tmdb', tmdb_id: 64690 } },

  { name: 'Reihenabkuerzung frisst keinen Filmtitel (WW84)',
    raw: 'WW84',
    tmdb: [f(464052, 'Wonder Woman 1984', 'WW84', '2020-12-16')],
    expect: { decision: 'tmdb', tmdb_id: 464052 } },

  { name: 'Alte Jahresangabe bleibt eine Angabe, kein Titelteil',
    raw: 'Heat (1995)',
    date: '2026-10-01',
    tmdb: [f(949, 'Heat', null, '1995-12-15'),
           f(8888, 'Heat', null, '1986-10-03')],
    expect: { decision: 'tmdb', tmdb_id: 949 } }
);

let ok = 0, fail = 0;
for (const c of CASES) {
  const item = { raw_title: c.raw, date: c.date || null, ...normalizeTitle(c.raw), tmdb_results: c.tmdb };
  const r = decide(item);
  let pass = r.decision === c.expect.decision;
  if (pass && c.expect.tmdb_id !== undefined) pass = r.tmdb_id === c.expect.tmdb_id;
  if (pass && c.expect.related) pass = r.related.some(x => x.relation === c.expect.related);
  (pass ? ok++ : fail++);
  console.log(`${pass ? 'OK  ' : 'FAIL'}  ${c.name}`);
  console.log(`      "${c.raw}"  ->  norm="${item.norm}"  teil=${item.sequel}` +
              (item.stripped.length ? `  entfernt=[${item.stripped}]` : ''));
  console.log(`      ${r.decision}  id=${r.tmdb_id}  conf=${r.confidence}  ${r.reason}`);
  if (r.related.length) console.log(`      verwandt: ${r.related.map(x => `${x.title} (${x.year}, ${x.relation})`).join(', ')}`);
  if (r.candidates.length) console.log(`      offen:    ${r.candidates.map(x => `${x.title} (${x.year}) ${x.score}`).join(', ')}`);
  console.log();
}
console.log(`${ok} von ${CASES.length} bestanden` + (fail ? `, ${fail} FEHLGESCHLAGEN` : ''));
process.exit(fail ? 1 : 0);
