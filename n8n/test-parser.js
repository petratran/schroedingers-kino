/**
 * Regressionstest fuer 04-parse-kinozeit.js gegen ein eingefrorenes Fixture.
 * Laeuft ohne Netz:  node test-parser.js
 */
const fs = require('fs');
const { parseKinozeit, splitVersion, toISODate, heuteFehlt } = require('./04-parse-kinozeit.js');

const html = fs.readFileSync(__dirname + '/fixtures/delphi-2026-09-18.html', 'utf8');
const { showings, warnings, films } = parseKinozeit(html, {
  cinema_id: 'delphi', cinema_name: 'Delphi Arthaus Kino', today: '2026-09-18T12:00:00'
});

let fail = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      erwartet ${e}\n      bekommen ${a}`);
};

check('Anzahl Vorstellungen', showings.length, 8);
check('Filme', films, ['Bad Apples', 'Gentle Monster', 'Vaterland']);
check('keine Warnungen', warnings, []);
check('Fassung aus dem Titel geloest', splitVersion('Bad Apples (OF)'), { title: 'Bad Apples', version: 'OV', format: null });
check('OF und OV fallen zusammen', splitVersion('Her (OV)'), { title: 'Her', version: 'OV', format: null });
check('Jahreszahl bleibt am Titel', splitVersion('Heat (1995)'), { title: 'Heat (1995)', version: null, format: null });
check('Doppelklammer Multiplex', splitVersion('Coyote Vs. Acme (MXP 2D) (Deutsch/MXP 2D)'), { title: 'Coyote Vs. Acme', version: 'DF', format: 'MXP' });
check('Originalfassung im Multiplex', splitVersion('Spider-Man: Brand New Day (PLF 2D) (OV/PLF 2D)'), { title: 'Spider-Man: Brand New Day', version: 'OV', format: 'PLF' });
check('Teil-Nummer bleibt stehen', splitVersion('Oh la la 2 - Neue Tests, neues Chaos').title, 'Oh la la 2 - Neue Tests, neues Chaos');
check('Extended wird abgeschnitten', splitVersion('Avengers: Endgame Extended').title, 'Avengers: Endgame');
check('Jahreswechsel', toISODate('05.01.', new Date('2026-12-20')), '2027-01-05');

const heute = showings.filter(s => s.date === '2026-09-18').map(s => `${s.time} ${s.raw_title}`);
check('heutige Vorstellungen', heute.sort(), ['16:20 Vaterland', '18:10 Bad Apples', '20:15 Gentle Monster']);

const sa = showings.filter(s => s.date === '2026-09-19').map(s => s.time);
check('zwei Zeiten in einer Zelle', sa.sort(), ['15:50', '20:15']);

const gm = showings.find(s => s.raw_title === 'Gentle Monster' && s.time === '20:15');
check('Ticketlink', gm.booking_url, 'https://www.kino-zeit.de/booking/111');
check('Laufzeit', gm.runtime_min, 114);
check('Kino-Zeit-Node als Cache-Schluessel', gm.source_node, '64039');
check('Zeitstempel', gm.starts_at, '2026-09-18T20:15:00');
check('letzter Tag im Fenster', showings.filter(s => s.date === '2026-09-24').length, 1);

// --- Stadt-Tagesseite: ein Tag, alle Kinos, Kinospalte ---
const stadtHtml = fs.readFileSync(__dirname + '/fixtures/stadt-2026-09-18.html', 'utf8');
const stadt = parseKinozeit(stadtHtml, { today: '2026-09-18T12:00:00' });
check('Stadt-Layout: Vorstellungen', stadt.showings.length, 3);
check('Stadt-Layout: Kinos erkannt',
  [...new Set(stadt.showings.map(s => s.cinema_name))].sort(),
  ['Delphi Kinos, Stuttgart', 'EM Kinos, Stuttgart', 'Gloria Kino, Stuttgart']);
check('Stadt-Layout: Kino-Node', stadt.showings.find(s => s.cinema_name.startsWith('Gloria')).cinema_id, '2356');
check('Stadt-Layout: Format geloest', stadt.showings.find(s => s.cinema_name.startsWith('Gloria')).format, 'MXP');
check('Stadt-Layout: Sprache geloest', stadt.showings.find(s => s.cinema_name.startsWith('Gloria')).version, 'OV');
check('Stadt-Layout: Titel sauber', stadt.showings.find(s => s.cinema_name.startsWith('Gloria')).raw_title, 'Coyote Vs. Acme');

// --- Kanarienvogel: fehlt der heutige Tag im Ergebnis? -----------------
// Am 22.09.2026 im Betrieb aufgefallen: Der 06:00-Lauf lieferte fuer alle
// Tage ausser dem heutigen Daten, loeschte aber trotzdem ab jetzt — und das
// Dashboard stand fuer den laufenden Tag leer da.
const PLAN = ['2026-09-22', '2026-09-23', '2026-09-24'];
const MIT  = [{ starts_at: '2026-09-22T20:30:00.000+02:00' },
              { starts_at: '2026-09-23T18:00:00.000+02:00' }];
const OHNE = [{ starts_at: '2026-09-23T18:00:00.000+02:00' },
              { starts_at: '2026-09-24T18:00:00.000+02:00' }];

check('heute vorhanden -> kein Alarm',  heuteFehlt(MIT,  PLAN, '2026-09-22', 6),  false);
check('heute fehlt -> Alarm',           heuteFehlt(OHNE, PLAN, '2026-09-22', 6),  true);
check('spaetabends kein Alarm',         heuteFehlt(OHNE, PLAN, '2026-09-22', 23), false);
check('heute gar nicht im Plan',        heuteFehlt(OHNE, ['2026-09-23'], '2026-09-22', 6), false);
check('leeres Ergebnis faengt der andere Kanarienvogel',
      heuteFehlt([], PLAN, '2026-09-22', 6), true);

console.log(fail ? `\n${fail} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(fail ? 1 : 0);
