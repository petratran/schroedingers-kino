/**
 * Prueft 07-traumpalast-imax.js gegen fixtures/traumpalast-imax.html
 * (Ausschnitt der Wochenseite vom 21.09.2026, aus n8n heraus abgegriffen).
 *   node n8n/test-traumpalast.js
 */
const fs = require('fs');
const path = require('path');
const { parseTraumpalast, fassung, titelSchluessel } = require('./07-traumpalast-imax.js');

const html = fs.readFileSync(path.join(__dirname, 'fixtures/traumpalast-imax.html'), 'utf8');
const { vorstellungen, warnungen } = parseTraumpalast(html);

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? 'ok  ' : 'FEHL'} ${name}${ok ? '' : `\n     ist:  ${JSON.stringify(ist)}\n     soll: ${JSON.stringify(soll)}`}`);
};

pruefe('Anzahl Vorstellungen', vorstellungen.length, 2);
pruefe('Titel',        vorstellungen[0]?.raw_title, 'Avengers: Endgame Extended');
pruefe('Saal',         vorstellungen[0]?.saal, 'IMAX');
pruefe('Sprache',      vorstellungen[0]?.sprache, 'Deutsch');
pruefe('Fassung',      vorstellungen[0]?.version, 'DF');
pruefe('Startzeit 1',  vorstellungen[0]?.lokal, '2026-09-24T19:00:00');
pruefe('Startzeit 2',  vorstellungen[1]?.lokal, '2026-09-25T19:00:00');
pruefe('Ticketlink',   vorstellungen[0]?.booking_url,
       'https://leonberg.traumpalast.de/index.php/PID/5581/TICKET/7222993.html');

pruefe('Originalversion erkannt', fassung('IMAX (Originalversion)<br><small>Sprache: Englisch</small>').version, 'OV');
pruefe('Fremdsprache = OV',       fassung('IMAX<br><small>Sprache: Englisch</small>').version, 'OV');
pruefe('Saal ohne IMAX',          fassung('Saal 3<br><small>Sprache: Deutsch</small>').saal, 'Saal 3');
pruefe('Ersatzschluessel',        titelSchluessel('Avengers: Endgame Extended'), 'titel:avengers-endgame-extended');
pruefe('Umlaute im Schluessel',   titelSchluessel('Die Odyssee für Anfänger'), 'titel:die-odyssee-fuer-anfaenger');

console.log(warnungen.length ? '\nWarnungen: ' + warnungen.join(' | ') : '\nkeine Warnungen');
console.log(fehler ? `\n${fehler} Pruefung(en) fehlgeschlagen` : '\nalle Pruefungen bestanden');
process.exit(fehler ? 1 : 0);
