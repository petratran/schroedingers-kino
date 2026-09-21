/**
 * Holt fuer jeden Film der Watchlist die TMDb-Kennung von seiner
 * Letterboxd-Seite und schreibt data/watchlist-tmdb.json.
 *
 *   node pipeline/fetch-tmdb-ids.js
 *   node pipeline/fetch-tmdb-ids.js export/watchlist.csv
 *
 * Verfahren nach marcelbusch/tmdb-letterboxd-importer: Die Filmseite traegt die
 * TMDb-ID selbst, eine Titelsuche ist dafuer nicht noetig. Gelesen wird sie von
 * n8n/06-letterboxd-tmdb.js.
 *
 * Zur Hoeflichkeit: eine Anfrage pro Sekunde, sprechende Kennung im User-Agent,
 * und ein Lauf setzt fort statt neu zu beginnen — data/watchlist-tmdb.json wird
 * eingelesen, bereits Aufgeloestes nicht noch einmal geholt. Letterboxds
 * robots.txt sperrt KI-Crawler vollstaendig, fuer den allgemeinen Agenten sind
 * die /film/-Seiten offen; dieses Skript laeuft als allgemeiner Agent auf dem
 * Rechner der Nutzerin, nicht als Bot.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { ausLetterboxdSeite, lidAusUri } = require(path.join(ROOT, 'n8n/06-letterboxd-tmdb.js'));

const CSV = path.join(ROOT, process.argv[2] || 'export/watchlist.csv');
const ZIEL = path.join(ROOT, 'data/watchlist-tmdb.json');
const PAUSE_MS = 1000;
const AGENT = 'SchroedingersKino/1.0 (Abschlussprojekt, ein Abruf je Sekunde)';

function csvZeilen(datei) {
  const zeilen = fs.readFileSync(datei, 'utf8').split(/\r?\n/).filter(Boolean);
  const kopf = zeilen.shift().split(',');
  const i = (n) => kopf.indexOf(n);
  return zeilen.map((z) => {
    const c = z.match(/("([^"]|"")*"|[^,]*)(,|$)/g)
      .map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    return { name: c[i('Name')], year: c[i('Year')], uri: c[i('Letterboxd URI')] };
  }).filter((r) => r.name && r.uri);
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const filme = csvZeilen(CSV);
  let stand = { filme: {}, fehlend: [] };
  try { stand = JSON.parse(fs.readFileSync(ZIEL, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  stand.filme = stand.filme || {};

  let neu = 0, uebersprungen = 0;
  const fehlend = [];

  for (const f of filme) {
    const lid = lidAusUri(f.uri);
    if (!lid) { fehlend.push({ name: f.name, grund: 'keine boxd.it-Kennung in der CSV' }); continue; }
    if (stand.filme[lid] && stand.filme[lid].tmdb_id) { uebersprungen++; continue; }

    let html = '';
    try {
      const antwort = await fetch(f.uri, { headers: { 'user-agent': AGENT, accept: 'text/html' },
                                           redirect: 'follow' });
      if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
      html = await antwort.text();
    } catch (e) {
      console.log('  ' + f.name.padEnd(34) + ' Abruf fehlgeschlagen: ' + e.message);
      fehlend.push({ name: f.name, lid, grund: String(e.message) });
      await warte(PAUSE_MS);
      continue;
    }

    const treffer = ausLetterboxdSeite(html);
    if (!treffer.tmdb_id) {
      console.log('  ' + f.name.padEnd(34) + ' keine TMDb-Kennung auf der Seite');
      fehlend.push({ name: f.name, lid, grund: 'keine Kennung im HTML' });
    } else {
      stand.filme[lid] = { tmdb_id: treffer.tmdb_id, tmdb_typ: treffer.tmdb_typ,
                           imdb_id: treffer.imdb_id, titel: f.name, jahr: f.year,
                           uri: f.uri, gefunden_ueber: treffer.gefunden_ueber };
      neu++;
      console.log('  ' + f.name.padEnd(34) + ' TMDb ' + String(treffer.tmdb_id).padStart(8) +
                  '  (' + treffer.gefunden_ueber + ')');
    }
    await warte(PAUSE_MS);
  }

  const gesamt = Object.keys(stand.filme).length;
  // Kanarienvogel: ein gruener Lauf ohne eine einzige Kennung waere schlimmer
  // als ein roter — dann hat sich die Seite geaendert und niemand merkt es.
  if (!gesamt) throw new Error('0 Kennungen aufgeloest — Seitenaufbau pruefen, es wird nichts geschrieben.');

  fs.writeFileSync(ZIEL, JSON.stringify({
    quelle: 'letterboxd.com/film/<slug>/ — TMDb-Kennung aus der Seite',
    verfahren: 'nach marcelbusch/tmdb-letterboxd-importer, gelesen von n8n/06-letterboxd-tmdb.js',
    abgerufen_am: new Date().toISOString(),
    watchlist_csv: path.relative(ROOT, CSV),
    anzahl: gesamt,
    fehlend,
    filme: stand.filme
  }, null, 1));

  console.log('\ndata/watchlist-tmdb.json — ' + gesamt + ' von ' + filme.length + ' Filmen' +
              ' (' + neu + ' neu, ' + uebersprungen + ' schon da, ' + fehlend.length + ' offen)');
  if (fehlend.length) console.log('Offen: ' + fehlend.map((x) => x.name).join(', '));
})().catch((e) => { console.error(e.message); process.exit(1); });
