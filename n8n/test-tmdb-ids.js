/**
 * Tests fuer n8n/06-letterboxd-tmdb.js — laufen offline gegen Ausschnitte.
 *
 *   node n8n/test-tmdb-ids.js
 *
 * Die Erwartungswerte fuer Taxi Driver (TMDb 103, IMDb tt0075314) sind am
 * 20.09.2026 von der echten Letterboxd-Seite abgelesen.
 */
const { ausLetterboxdSeite, lidAusUri } = require('./06-letterboxd-tmdb.js');

let ok = 0, fehler = 0;
function pruef(name, ist, soll) {
  const gleich = JSON.stringify(ist) === JSON.stringify(soll);
  if (gleich) { ok++; console.log('OK    ' + name); }
  else { fehler++; console.log('FEHLT ' + name + '\n      ist : ' + JSON.stringify(ist) +
                               '\n      soll: ' + JSON.stringify(soll)); }
}

pruef('Attribut wird gelesen',
  ausLetterboxdSeite('<div class="film" data-tmdb-id="103" data-film-name="Taxi Driver">' +
                     '<a href="http://www.imdb.com/title/tt0075314/maindetails">IMDb</a>'),
  { tmdb_id: 103, tmdb_typ: 'movie', imdb_id: 'tt0075314', gefunden_ueber: 'data-tmdb-id' });

pruef('Link traegt, wenn das Attribut fehlt',
  ausLetterboxdSeite('<a href="https://www.themoviedb.org/movie/103/">TMDb</a>' +
                     '<a href="http://www.imdb.com/title/tt0075314/">IMDb</a>'),
  { tmdb_id: 103, tmdb_typ: 'movie', imdb_id: 'tt0075314', gefunden_ueber: 'themoviedb-link' });

pruef('Serien werden als solche gekennzeichnet',
  ausLetterboxdSeite('<a href="https://www.themoviedb.org/tv/1396/">TMDb</a>'),
  { tmdb_id: 1396, tmdb_typ: 'tv', imdb_id: null, gefunden_ueber: 'themoviedb-tv' });

pruef('nichts gefunden bleibt null statt -1',
  ausLetterboxdSeite('<html><body>Seite ohne Kennungen</body></html>'),
  { tmdb_id: null, tmdb_typ: null, imdb_id: null, gefunden_ueber: null });

pruef('IMDb allein wird trotzdem mitgenommen',
  ausLetterboxdSeite('<a href="https://www.imdb.com/title/tt0075314/">nur IMDb</a>'),
  { tmdb_id: null, tmdb_typ: null, imdb_id: 'tt0075314', gefunden_ueber: null });

pruef('einfache Anfuehrungszeichen im Attribut',
  ausLetterboxdSeite("<div data-tmdb-id='42'></div>").tmdb_id, 42);

pruef('Kennung aus der Kurzadresse', lidAusUri('https://boxd.it/2b8y'), '2b8y');
pruef('Kurzadresse ohne Kennung', lidAusUri('https://letterboxd.com/film/taxi-driver/'), null);
pruef('leere Eingabe wirft nicht', lidAusUri(null), null);

console.log('\n' + ok + ' von ' + (ok + fehler) + ' bestanden');
if (fehler) process.exit(1);
console.log('Alle Tests bestanden');
