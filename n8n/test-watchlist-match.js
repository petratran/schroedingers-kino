/**
 * Prüft den Direktabgleich gegen die angereicherte Watchlist.
 *   node test-watchlist-match.js
 */
const { pruefe, ladeWatchlist } = require('./05-watchlist-match.js');
const wl = ladeWatchlist(require('../data/watchlist-angereichert.json'));

const FAELLE = [
  { name: 'Titel und Laufzeit stimmen',
    v: { raw_title: 'Gentle Monster', runtime_min: 114, date: '2026-09-18' },
    erwartet: { status: 'sicher', film: 'Gentle Monster' } },

  { name: 'Klassiker über den Titel',
    v: { raw_title: 'Her', runtime_min: 126, date: '2026-09-29' },
    erwartet: { status: 'sicher', film: 'Her' } },

  { name: 'Sprachgrenze: kein Titel passt, Laufzeit und Jahr schon',
    v: { raw_title: 'Vaterland', runtime_min: 82, date: '2026-09-18' },
    erwartet: { status: 'verdacht', film: 'Fatherland' } },

  { name: 'Zufällig ähnliche Laufzeit ist kein Treffer',
    v: { raw_title: 'Adams Acht', runtime_min: 124, date: '2026-09-18' },
    erwartet: { status: 'verdacht', film: 'Colony' } },

  { name: 'Originaltitel im Aushang wird erkannt',
    v: { raw_title: 'Ojczyzna', runtime_min: 82, date: '2026-09-18' },
    erwartet: { status: 'sicher', film: 'Fatherland' } },

  { name: 'Koreanischer Originaltitel im Aushang',
    v: { raw_title: '괴물', runtime_min: 120, date: '2026-10-03' },
    erwartet: { status: 'sicher', film: 'The Host' } },

  { name: 'Reihenname vor dem Titel — der echte Fall vom 04.11.',
    v: { raw_title: 'Weird Wednesday: Drive', runtime_min: 100, date: '2026-11-04' },
    erwartet: { status: 'sicher', film: 'Drive' } },

  { name: 'Doppelpunkt im Filmtitel bleibt unangetastet',
    v: { raw_title: 'Dune: Part Three', runtime_min: 140, date: '2026-12-15' },
    erwartet: { status: 'sicher', film: 'Dune: Part Three' } },

  { name: 'Nichts auf der Liste',
    v: { raw_title: 'Die Odyssee', runtime_min: 160, date: '2026-09-18' },
    erwartet: { status: 'kein_treffer' } },

  { name: 'Ohne Laufzeit kein Verdacht',
    v: { raw_title: 'Irgendwas', runtime_min: null, date: '2026-09-18' },
    erwartet: { status: 'kein_treffer' } },

  { name: 'Alter Film ohne passendes Jahr bleibt außen vor',
    v: { raw_title: 'Irgendein Titel', runtime_min: 126, date: '2026-09-18' },
    erwartet: { status: 'kein_treffer' } }
];

let fail = 0;
for (const f of FAELLE) {
  const r = pruefe(f.v, wl);
  let ok = r.status === f.erwartet.status;
  if (ok && f.erwartet.film) ok = r.watchlist && r.watchlist.name === f.erwartet.film;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${f.name}`);
  console.log(`      "${f.v.raw_title}" ${f.v.runtime_min ? f.v.runtime_min + ' Min' : 'ohne Laufzeit'}` +
              `  ->  ${r.status}` + (r.watchlist ? ` · ${r.watchlist.name}` : '') +
              (r.reason ? `\n      ${r.reason}` : ''));
}
console.log(fail ? `\n${fail} fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(fail ? 1 : 0);
