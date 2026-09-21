/**
 * Liest die TMDb- und IMDb-Kennung aus einer Letterboxd-Filmseite.
 *
 * Der Trick stammt aus marcelbusch/tmdb-letterboxd-importer: Die Filmseite
 * traegt die TMDb-ID selbst — man braucht dafuer keine Titelsuche. Damit faellt
 * auf der Watchlist-Seite die gesamte Unschaerfe weg, an der Stufe A und B
 * scheitern: kein Titelvergleich ueber Sprachgrenzen, kein Schiedsrichter,
 * kein Vaterland/Ojczyzna-Problem. Die Kinoseite bleibt unscharf, die
 * Watchlist-Seite wird exakt.
 *
 * Zwei Fundstellen, absichtlich beide: das Attribut data-tmdb-id und der
 * sichtbare Link auf themoviedb.org. Verschwindet eines von beiden bei einem
 * Umbau der Seite, traegt das andere — und wenn beide fehlen, sagt die
 * Funktion das, statt still -1 zu liefern.
 */

const MUSTER = [
  { name: 'data-tmdb-id', art: 'movie', re: /data-tmdb-id=["'](\d+)["']/ },
  { name: 'themoviedb-link', art: 'movie', re: /themoviedb\.org\/movie\/(\d+)/ },
  { name: 'themoviedb-tv', art: 'tv', re: /themoviedb\.org\/tv\/(\d+)/ }
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

// Letterboxd-Kennung aus einer boxd.it-Kurzadresse: https://boxd.it/2b8y -> 2b8y
function lidAusUri(uri) {
  const m = String(uri || '').match(/boxd\.it\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

if (typeof module !== 'undefined') module.exports = { ausLetterboxdSeite, lidAusUri, MUSTER };
