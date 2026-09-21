/**
 * Prueft den MUBI-GO-Node ohne Netz:  node test-mubi-go.js
 */
const fs = require('fs');
const path = require('path');
const { mubiTitel, entities, schluessel, findeKennung, entscheide } =
  require('./10-mubi-go.js');

const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'mubi-go.html'), 'utf8');

let ok = 0, fail = 0;
function pruefe(name, bedingung, zusatz) {
  if (bedingung) { ok++; console.log('OK    ' + name); }
  else { fail++; console.log('FAIL  ' + name + (zusatz ? '\n      ' + zusatz : '')); }
}
function wirft(name, fn, teil) {
  try { fn(); fail++; console.log('FAIL  ' + name + '\n      kein Fehler geworfen'); }
  catch (e) {
    if (!teil || e.message.includes(teil)) { ok++; console.log('OK    ' + name); }
    else { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); }
  }
}

// --- Titel lesen -------------------------------------------------------
pruefe('Titel aus der Meta-Beschreibung',
  mubiTitel(html) === 'Gentle Monster', mubiTitel(html));

pruefe('Rubrik davor wird abgeschnitten',
  mubiTitel('<meta name="description" content="Film der Woche | Vaterland">') === 'Vaterland');

pruefe('Gedankenstrich trennt genauso',
  mubiTitel('<meta name="description" content="Film des Tages – Nur geträumt">') === 'Nur geträumt');

pruefe('Titel ohne Rubrik bleibt ganz',
  mubiTitel('<meta property="og:description" content="Heat">') === 'Heat');

pruefe('HTML-Entities werden aufgeloest',
  mubiTitel('<meta name="description" content="Film des Tages | Fr&uuml;hst&uuml;ck &amp; Kino">')
    === 'Frühstück & Kino');

pruefe('og:description hat Vorrang vor description',
  mubiTitel('<meta name="description" content="A | Alt">\n<meta property="og:description" content="B | Neu">')
    === 'Neu');

wirft('Fehlende Meta-Angabe wirft', () => mubiTitel('<html><body>nichts</body></html>'),
  'ohne Meta-Beschreibung');

wirft('Rubrik ohne Film wirft', () => mubiTitel('<meta name="description" content="MUBI GO">'),
  'kein Filmtitel');

pruefe('entities: numerische Referenz',
  entities('Ocean&#39;s Eleven') === "Ocean's Eleven");

// --- Kennung finden ----------------------------------------------------
const ALIASSE = [
  { raw_title: 'Gentle Monster', tmdb_id: 1473148 },
  { raw_title: 'Shrek - Der tollkühne Held (25 Jahre)', tmdb_id: 808 },
  { raw_title: 'Nur geträumt', tmdb_id: 1404684 },
  { raw_title: 'Her', tmdb_id: 152601 },
  { raw_title: 'Sneak', tmdb_id: null }
];

pruefe('exakter Treffer',
  findeKennung('Gentle Monster', ALIASSE).tmdb_id === 1473148);

pruefe('Umlaut und Schreibweise egal',
  findeKennung('NUR GETRÄUMT', ALIASSE).tmdb_id === 1404684);

pruefe('MUBI-Titel kuerzer als der Aushangtitel',
  findeKennung('Shrek - Der tollkühne Held', ALIASSE).tmdb_id === 808);

pruefe('Zeile ohne Kennung zaehlt nicht als Treffer',
  findeKennung('Sneak', ALIASSE) === null);

pruefe('kein Treffer bleibt null',
  findeKennung('Ein Film, den niemand zeigt', ALIASSE) === null);

pruefe('kurze Titel nur exakt — kein Zufallstreffer',
  findeKennung('Her', ALIASSE).treffer === 'exakt');

// --- Entscheiden -------------------------------------------------------
const BESTAND = [{ valid_from: '2026-09-18', raw_title: 'Gentle Monster', tmdb_id: 1473148 }];

pruefe('unveraendert => nichts schreiben',
  entscheide('Gentle Monster', ALIASSE, BESTAND, '2026-09-21').schreiben === false);

pruefe('abweichende Schreibweise gilt als unveraendert',
  entscheide('GENTLE MONSTER', ALIASSE, BESTAND, '2026-09-21').schreiben === false);

const neu = entscheide('Nur geträumt', ALIASSE, BESTAND, '2026-09-25');
pruefe('Wechsel => Zeile mit heutigem Datum',
  neu.schreiben === true && neu.zeile.valid_from === '2026-09-25' &&
  neu.zeile.tmdb_id === 1404684 && neu.zeile.raw_title === 'Nur geträumt',
  JSON.stringify(neu));

pruefe('leerer Bestand => erste Zeile wird geschrieben',
  entscheide('Gentle Monster', ALIASSE, [], '2026-09-21').schreiben === true);

wirft('unbekannter Film wirft statt still zu schreiben',
  () => entscheide('Irgendein MUBI-Film', ALIASSE, BESTAND, '2026-09-25'),
  'steht in keinem der erfassten Kinoprogramme');

console.log();
console.log(`${ok} von ${ok + fail} Pruefungen bestanden` + (fail ? `, ${fail} FEHLGESCHLAGEN` : ''));
process.exit(fail ? 1 : 0);
