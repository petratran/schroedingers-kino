/**
 * Prueft 09-innenstadtkinos.js gegen fixtures/innenstadtkinos.html
 * (JSON-LD-Struktur, abgenommen von der echten Seite am 21.09.2026).
 * Der n8n-Glue wird mit nachgebauten Globals ausgefuehrt.
 *   node n8n/test-innenstadtkinos.js
 */
const fs = require('fs');
const path = require('path');
const mod = require('./09-innenstadtkinos.js');

const html = fs.readFileSync(path.join(__dirname, 'fixtures/innenstadtkinos.html'), 'utf8');

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? 'ok  ' : 'FEHL'} ${name}${ok ? '' : `\n     ist:  ${JSON.stringify(ist)}\n     soll: ${JSON.stringify(soll)}`}`);
};

// --- reine Funktionen -------------------------------------------------
const { film, events } = mod.parseSeite(html);
pruefe('Movie gefunden',        film && film.name, 'Runner');
pruefe('ScreeningEvents',       events.length, 4);
pruefe('TMDb aus sameAs',       mod.tmdbAusSameAs(film.sameAs), 1377237);
pruefe('Dauer PT1H37M',         mod.dauerInMinuten('PT1H37M'), 97);
pruefe('Dauer nur Minuten',     mod.dauerInMinuten('PT95M'), 95);
pruefe('Dauer leer',            mod.dauerInMinuten(null), null);
pruefe('Saal Gloria',           mod.kinoAusOffer('https://www.kinoheld.de/Kino-Stuttgart/Gloria%20Stuttgart?showId=1'), 'gloria');
pruefe('Saal EM',               mod.kinoAusOffer('https://www.kinoheld.de/Kino-Stuttgart/EM%20Stuttgart?showId=1'), 'em');
pruefe('Saal Cinema',           mod.kinoAusOffer('https://www.kinoheld.de/Kino-Stuttgart/Cinema%20Stuttgart?showId=1'), 'cinema');
pruefe('Saal unbekannt',        mod.kinoAusOffer('https://www.kinoheld.de/Kino-Stuttgart/Metropol?showId=1'), null);
pruefe('kein Treffer im Rest',  mod.kinoAusOffer('https://beispiel.de/system/embed?x=1'), null);

// --- n8n-Glue mit nachgebauten Globals --------------------------------
const src = fs.readFileSync(path.join(__dirname, '09-innenstadtkinos.js'), 'utf8');
const DateTime = {
  now: () => ({ setZone: () => ({ valueOf: () => Date.parse('2026-09-21T12:00:00+02:00') }) }),
  fromISO: (s) => {
    const t = Date.parse(s);
    return { setZone: () => ({
      isValid: !isNaN(t),
      valueOf: () => t,
      toISO: () => new Date(t).toISOString()
    })};
  }
};
const nodes = { 'Filmseiten planen': [{ json: { url: 'https://www.innenstadtkinos.de/de/programm/1638658' } }] };
const $ = (n) => { if (!nodes[n]) throw new Error('unbekannt'); return { all: () => nodes[n] }; };
const logs = [];
const lauf = new Function('$input', '$', 'DateTime', 'console', 'module', src);
const [{ json: out }] = lauf({ all: () => [{ json: { html } }] }, $, DateTime,
                             { log: (...a) => logs.push(a.join(' ')) }, undefined);

pruefe('Vorstellungen (Vergangenes raus)', out.showings.length, 3);
pruefe('Kinos zugeordnet',    out.showings.map((s) => s.cinema_id), ['gloria', 'em', 'cinema']);
pruefe('Quelle gesetzt',      out.showings[0].source, 'innenstadtkinos');
pruefe('source_key aus URL',  out.showings[0].source_key, 'isk:1638658');
pruefe('deutsch = DF',        out.showings[0].version, 'DF');
pruefe('englisch = OV',       out.showings[1].version, 'OV');
pruefe('2D wird verworfen',   out.showings[0].format, null);
pruefe('3D bleibt',           out.showings[1].format, '3D');
pruefe('Laufzeit uebernommen', out.showings[0].runtime_min, 97);
pruefe('Genres als Text',     out.showings[0].genre, 'Action, Komödie, Thriller');
pruefe('Ticketlink',          /kinoheld\.de/.test(out.showings[0].booking_url), true);
pruefe('ein Film',            out.filme.length, 1);
pruefe('Film traegt TMDb',    out.filme[0].tmdb_id, 1377237);
pruefe('Regie uebernommen',   out.filme[0].director, 'Scott Waugh');
pruefe('ein Alias',           out.aliasse.length, 1);
pruefe('Alias ist sicher',    [out.aliasse[0].status, out.aliasse[0].resolved_by, out.aliasse[0].confidence],
                              ['sicher', 'tmdb', 1]);

// --- Sonderveranstaltung: Event statt ScreeningEvent, kein Movie-Block ----
const htmlEvent = fs.readFileSync(path.join(__dirname, 'fixtures/innenstadtkinos-event.html'), 'utf8');
const nodes2 = { 'Filmseiten planen': [{ json: { url: 'https://www.innenstadtkinos.de/de/programm/1985454' } }] };
const $2 = (n) => { if (!nodes2[n]) throw new Error('unbekannt'); return { all: () => nodes2[n] }; };
const [{ json: ev }] = lauf({ all: () => [{ json: { html: htmlEvent } }] }, $2, DateTime,
                            { log: () => {} }, undefined);

pruefe('Sondertermin erfasst',     ev.showings.length, 1);
pruefe('Titel ohne Schlussstrich', ev.showings[0].raw_title, 'Weird Wednesday DRIVE (2011)');
pruefe('Kino aus Ticketlink',      ev.showings[0].cinema_id, 'em');
pruefe('source_key der Seite',     ev.showings[0].source_key, 'isk:1985454');
pruefe('ohne Movie kein Film',     ev.filme.length, 0);
pruefe('ohne Movie kein Alias',    ev.aliasse.length, 0);
pruefe('Laufzeit unbekannt',       ev.showings[0].runtime_min, null);

console.log('\n' + logs.join('\n'));
console.log(fehler ? `\n${fehler} Pruefung(en) fehlgeschlagen` : '\nalle Pruefungen bestanden');
process.exit(fehler ? 1 : 0);
