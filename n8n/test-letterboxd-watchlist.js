/**
 * Prueft den Watchlist-Parser ohne Netz:  node test-letterboxd-watchlist.js
 */
const fs = require('fs');
const path = require('path');
const { filmeAusSeite, seitenAnzahl, abgleich, entities } =
  require('./11-letterboxd-watchlist.js');

const html = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'letterboxd-watchlist.html'), 'utf8');

let ok = 0, fail = 0;
const pruefe = (name, bed, zusatz) => {
  if (bed) { ok++; console.log('OK    ' + name); }
  else { fail++; console.log('FAIL  ' + name + (zusatz ? '\n      ' + zusatz : '')); }
};
const wirft = (name, fn, teil) => {
  try { fn(); fail++; console.log('FAIL  ' + name + '\n      kein Fehler geworfen'); }
  catch (e) {
    if (!teil || e.message.includes(teil)) { ok++; console.log('OK    ' + name); }
    else { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); }
  }
};

// --- Seite lesen -------------------------------------------------------
const filme = filmeAusSeite(html);

pruefe('drei Filme gelesen', filme.length === 3, JSON.stringify(filme.map(f => f.titel)));

pruefe('Titel und Jahr getrennt',
  filme[0].titel === 'Fatherland' && filme[0].jahr === '2026',
  JSON.stringify(filme[0]));

pruefe('lid wird zur Letterboxd-URI des Exports',
  filme[0].letterboxd_uri === 'https://boxd.it/TbK4', filme[0].letterboxd_uri);

pruefe('Filmseite vollstaendig',
  filme[1].film_url === 'https://letterboxd.com/film/gentle-monster/', filme[1].film_url);

pruefe('Slug bleibt erhalten', filme[1].slug === 'gentle-monster');

pruefe('Umlaute und Apostroph im Titel',
  filme[2].titel === "Frühstück bei Tiffany's" && filme[2].jahr === '1961',
  JSON.stringify(filme[2]));

pruefe('Seitenzahl aus der Blaetter-Leiste', seitenAnzahl(html) === 3, String(seitenAnzahl(html)));

pruefe('ohne Blaetter-Leiste genau eine Seite', seitenAnzahl('<html></html>') === 1);

pruefe('leere Seite liefert keine Filme', filmeAusSeite('<html></html>').length === 0);

pruefe('Eintrag ohne lid wird uebersprungen',
  filmeAusSeite('<div data-item-slug="x" data-item-name="X (2020)" data-item-link="/film/x/"></div>').length === 0);

pruefe('anderer Typ als film wird uebersprungen',
  filmeAusSeite('<div data-item-slug="l" data-item-name="Liste (2020)" ' +
    'data-postered-identifier="{&quot;lid&quot;:&quot;Q1&quot;,&quot;type&quot;:&quot;list&quot;}"></div>').length === 0);

pruefe('entities: benannte und numerische Referenzen',
  entities('Fr&uuml;hst&uuml;ck &amp; Tiffany&#039;s') === "Frühstück & Tiffany's");

// --- Abgleich ----------------------------------------------------------
const BESTAND = [
  { tmdb_id: 1437696, letterboxd_uri: 'https://boxd.it/TbK4', title_raw: 'Fatherland' },
  { tmdb_id: 103,     letterboxd_uri: 'https://boxd.it/ALT1', title_raw: 'Taxi Driver' }
];

const plan = abgleich(filme, BESTAND, '2026-09-21');

pruefe('zwei neue Filme erkannt',
  plan.filter((p) => p.aktion === 'neu').length === 2,
  JSON.stringify(plan.filter((p) => p.aktion === 'neu').map((p) => p.Name)));

pruefe('ein entfernter Film erkannt',
  plan.filter((p) => p.aktion === 'entfernt').length === 1 &&
  plan.find((p) => p.aktion === 'entfernt').tmdb_id === 103,
  JSON.stringify(plan.filter((p) => p.aktion === 'entfernt')));

pruefe('bekannter Film bleibt unangetastet',
  !plan.some((p) => p['Letterboxd URI'] === 'https://boxd.it/TbK4'));

const neu0 = plan.find((p) => p.aktion === 'neu');
pruefe('neue Items tragen die CSV-Spaltennamen',
  'Name' in neu0 && 'Year' in neu0 && 'Letterboxd URI' in neu0 && 'Date' in neu0,
  JSON.stringify(neu0));

pruefe('Date ist der Tag des Laufs', neu0.Date === '2026-09-21');

pruefe('leerer Bestand: alles neu, nichts entfernt',
  abgleich(filme, [], '2026-09-21').every((p) => p.aktion === 'neu'));

wirft('leere Seite loescht nichts, sondern wirft',
  () => abgleich([], BESTAND, '2026-09-21'), 'keinen einzigen Film');

// Sicherung 2: mehr als die Haelfte weg -> Abbruch statt Loeschen.
const GROSS = Array.from({ length: 40 }, (_, i) => ({
  tmdb_id: i + 1, letterboxd_uri: 'https://boxd.it/x' + i, title_raw: 'Film ' + i
}));
wirft('Massenloeschung wird gemeldet statt ausgefuehrt',
  () => abgleich(filme, GROSS, '2026-09-21'), 'zu viel fuer einen normalen Lauf');

pruefe('einzelne Streichungen gehen normal durch',
  abgleich(
    GROSS.slice(0, 38).map((b) => ({ letterboxd_uri: b.letterboxd_uri, lid: 'x', titel: b.title_raw, jahr: null, slug: 's' })),
    GROSS, '2026-09-21'
  ).filter((p) => p.aktion === 'entfernt').length === 2);

console.log();
console.log(`${ok} von ${ok + fail} Pruefungen bestanden` + (fail ? `, ${fail} FEHLGESCHLAGEN` : ''));
process.exit(fail ? 1 : 0);
