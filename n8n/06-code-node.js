/**
 * Inhalt fuer den n8n-Code-Node in Workflow 1 (Watchlist-Sync).
 * Node-Modus: "Run Once for Each Item".
 *
 * Code-Nodes koennen keine Dateien requiren, deshalb steht die Logik aus
 * 06-letterboxd-tmdb.js hier noch einmal. Aendert sich dort etwas, hier
 * nachziehen — test-tmdb-ids.js prueft weiterhin nur das Original.
 */

const MUSTER = [
  { name: 'data-tmdb-id',    art: 'movie', re: /data-tmdb-id=["'](\d+)["']/ },
  { name: 'themoviedb-link', art: 'movie', re: /themoviedb\.org\/movie\/(\d+)/ },
  { name: 'themoviedb-tv',   art: 'tv',    re: /themoviedb\.org\/tv\/(\d+)/ }
];
const IMDB = /imdb\.com\/title\/(tt\d+)/;

function ausLetterboxdSeite(html) {
  const text = String(html || '');
  for (const m of MUSTER) {
    const t = text.match(m.re);
    if (t) {
      const i = text.match(IMDB);
      return { tmdb_id: Number(t[1]), tmdb_typ: m.art, imdb_id: i ? i[1] : null, gefunden_ueber: m.name };
    }
  }
  const i = text.match(IMDB);
  return { tmdb_id: null, tmdb_typ: null, imdb_id: i ? i[1] : null, gefunden_ueber: null };
}

function lidAusUri(uri) {
  const m = String(uri || '').match(/boxd\.it\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

// Hinter dem HTTP Request steht nur noch das HTML im Item — Titel und URI
// kommen aus der Quellzeile der Schleife zurueck.
const quelle  = $('Loop Over Items').item.json;
const treffer = ausLetterboxdSeite($json.data);

return {
  json: {
    name:           quelle.Name,
    jahr:           Number(quelle.Year) || null,
    letterboxd_uri: quelle['Letterboxd URI'],
    lid:            lidAusUri(quelle['Letterboxd URI']),
    added_on:       quelle.Date,
    ...treffer
  }
};
