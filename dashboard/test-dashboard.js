/**
 * Browsertests für das Dashboard.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node dashboard/test-dashboard.js
 *
 * Geprüft wird die gebaute Artefaktfassung (dashboard/artifact.html) mit
 * eingebetteten Daten — dieselbe Datei, die veröffentlicht wird. Die Fälle
 * hier sind die, die bei jeder Änderung von Hand nachgeprüft wurden; ab jetzt
 * prüft sie der Rechner. Die Zähler sind bewusst nicht festgenagelt: die Daten
 * ändern sich täglich, die Regeln nicht.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const QUELLE = path.join(ROOT, 'dashboard/artifact.html');

let ok = 0, fehler = 0;
function pruef(name, bedingung, zusatz) {
  if (bedingung) { ok++; console.log('OK    ' + name); }
  else { fehler++; console.log('FEHLT ' + name + (zusatz ? '  → ' + zusatz : '')); }
}

(async () => {
  if (!fs.existsSync(QUELLE)) {
    console.error('dashboard/artifact.html fehlt — erst "node pipeline/build-artifact.js" laufen lassen.');
    process.exit(2);
  }
  // Die Artefaktfassung trägt kein Gerüst; zum Testen eine vollständige Seite bauen.
  const seite = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-')), 'index.html');
  fs.writeFileSync(seite,
    '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    fs.readFileSync(QUELLE, 'utf8') + '</html>');

  const browser = await chromium.launch();
  const seiteAuf = async (breite) => {
    const p = await browser.newPage({ viewport: { width: breite || 1180, height: 900 } });
    p.on('pageerror', (e) => { fehler++; console.log('FEHLT Skriptfehler → ' + e.message); });
    await p.goto('file://' + seite, { waitUntil: 'domcontentloaded' });
    return p;
  };

  const heute = (() => { const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0'); })();

  // --- 1 · Datum kommt von der Uhr ---------------------------------------
  let p = await seiteAuf();
  const tage = await p.evaluate(() => [...document.querySelectorAll('[data-day]')]
    .map((e) => e.getAttribute('data-day')).filter((x) => /^\d{4}-/.test(x)));
  pruef('kein vergangener Spieltag in der Datumszeile',
    tage.every((t) => t >= heute), tage.filter((t) => t < heute).join(','));
  const heuteChip = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[data-day]')].find((x) => /Heute/.test(x.textContent));
    return e && e.getAttribute('data-day'); });
  pruef('„Heute" steht am heutigen Datum oder fehlt',
    heuteChip === null || heuteChip === undefined || heuteChip === heute, String(heuteChip));

  // --- 2 · Vergangene Vorstellungen sind markiert, nicht gelöscht ---------
  const zeiten = await p.evaluate(() => {
    const jetzt = new Date().toTimeString().slice(0, 5);
    const heu = [...document.querySelectorAll('#cinemas .time')]
      .map((e) => ({ txt: e.textContent, vorbei: e.classList.contains('vorbei') }));
    return { jetzt, falsch: heu.filter((x) => {
      const m = x.txt.match(/(\d{2}:\d{2})/); if (!m) return false;
      return (m[1] < jetzt) !== x.vorbei; }).length, gesamt: heu.length };
  });
  pruef('vergangene Zeiten von heute sind durchgestrichen',
    zeiten.falsch === 0, zeiten.falsch + ' von ' + zeiten.gesamt + ' falsch markiert');

  // --- 3 · Ticketversprechen nur wo es zutrifft ---------------------------
  const ticket = await p.evaluate(() => {
    const note = (document.querySelector('#programm .note') || {}).textContent || '';
    return { behauptet: /Ticket/.test(note), links: document.querySelectorAll('#cinemas a.time').length };
  });
  pruef('Ticket wird nur versprochen, wenn Zeiten verlinkt sind',
    ticket.behauptet === (ticket.links > 0),
    'behauptet=' + ticket.behauptet + ' links=' + ticket.links);

  // --- 4 · Kacheln filtern das Programm -----------------------------------
  await p.click('[data-day="alle"]');
  const vorher = await p.evaluate(() => document.querySelectorAll('#cinemas .film').length);
  await p.click('.held.watch');
  const nachher = await p.evaluate(() => ({
    zeilen: [...document.querySelectorAll('#cinemas .film')],
    nurTreffer: [...document.querySelectorAll('#cinemas .film')]
      .every((e) => e.hasAttribute('data-watchlist')),
    anzahl: document.querySelectorAll('#cinemas .film').length,
    chip: ([...document.querySelectorAll('[data-filter]')]
      .find((c) => c.getAttribute('aria-pressed') === 'true') || {}).textContent }));
  pruef('Watchlist-Kachel zeigt nur Treffer', nachher.nurTreffer);
  pruef('Watchlist-Kachel verkleinert die Liste', nachher.anzahl < vorher,
    nachher.anzahl + ' von ' + vorher);
  pruef('Filterchip springt mit um', /Watchlist/.test(nachher.chip || ''), nachher.chip);
  await p.click('.held.watch');
  pruef('zweiter Klick hebt auf',
    await p.evaluate(() => document.querySelectorAll('#cinemas .film').length) === vorher);

  // --- 5 · Sprachfilter schränkt auch die Zeiten ein ----------------------
  await p.click('[data-filter="omu"]');
  const fassungen = await p.evaluate(() => [...new Set(
    [...document.querySelectorAll('#cinemas .time .v')].map((e) => e.textContent))]);
  pruef('„Nur OmU" zeigt keine anderen Fassungen',
    fassungen.every((v) => v === 'OmU' || v === 'OmeU'), fassungen.join(','));
  await p.click('[data-filter="all"]');

  // --- 6 · Zustand steht in der Adresse -----------------------------------
  await p.click('[data-kino="corso"]');
  await p.click('[data-filter="watchlist"]');
  const hash = await p.evaluate(() => location.hash);
  pruef('Adresse trägt Kino und Filter',
    /kinos=corso/.test(hash) && /filter=watchlist/.test(hash), hash);
  await p.reload({ waitUntil: 'domcontentloaded' });
  const wieder = await p.evaluate(() => ({
    kino: ([...document.querySelectorAll('[data-kino]')]
      .find((c) => c.getAttribute('aria-pressed') === 'true') || {}).textContent,
    filter: ([...document.querySelectorAll('[data-filter]')]
      .find((c) => c.getAttribute('aria-pressed') === 'true') || {}).textContent }));
  pruef('Zustand überlebt das Neuladen',
    /Corso/.test(wieder.kino || '') && /Watchlist/.test(wieder.filter || ''),
    JSON.stringify(wieder));

  // --- 7 · Barrierefreiheit ----------------------------------------------
  const a11y = await p.evaluate(() => ({
    main: !!document.querySelector('main#app'),
    sprung: !!document.querySelector('a.sprung[href="#programm"]'),
    live: (document.getElementById('meldung') || {}).getAttribute &&
          document.getElementById('meldung').getAttribute('aria-live'),
    meldung: (document.getElementById('meldung') || {}).textContent,
    kacheltasten: [...document.querySelectorAll('.held[data-modus]')]
      .every((e) => e.getAttribute('tabindex') === '0' && e.getAttribute('role') === 'button'),
    karten: [...document.querySelectorAll('.hit-card[data-film]')]
      .every((e) => e.getAttribute('tabindex') === '0') }));
  pruef('<main> vorhanden', a11y.main);
  pruef('Sprungmarke zum Programm', a11y.sprung);
  pruef('Meldebereich ist aria-live', a11y.live === 'polite', String(a11y.live));
  pruef('Meldung ist gefüllt', !!(a11y.meldung || '').trim(), JSON.stringify(a11y.meldung));
  pruef('Kacheln sind mit der Tastatur erreichbar', a11y.kacheltasten);
  pruef('Trefferkarten sind mit der Tastatur erreichbar', a11y.karten);

  // --- 8 · Leerer Zustand hat eine Ansage ---------------------------------
  await p.goto('file://' + seite + '#tag=alle&filter=mubi&kinos=corso',
    { waitUntil: 'domcontentloaded' });
  pruef('leerer Filter sagt es',
    await p.evaluate(() => /läuft nichts/.test(document.body.innerText)));
  await p.close();

  // --- 9 · Schmale Ansicht ------------------------------------------------
  const m = await seiteAuf(390);
  const schmal = await m.evaluate(() => ({
    ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    filterZu: getComputedStyle(document.getElementById('feinfilter')).display === 'none',
    schalter: getComputedStyle(document.querySelector('.nurschmal')).display !== 'none' }));
  pruef('kein waagerechter Überlauf bei 390 px', schmal.ueberlauf === 0, String(schmal.ueberlauf));
  pruef('Kinos und Filter sind schmal eingeklappt', schmal.filterZu);
  pruef('Schalter dafür ist sichtbar', schmal.schalter);
  await m.click('[data-mehr]');
  pruef('Schalter klappt auf',
    await m.evaluate(() => getComputedStyle(document.getElementById('feinfilter')).display !== 'none'));
  await m.close();

  await browser.close();
  console.log('\n' + ok + ' von ' + (ok + fehler) + ' bestanden');
  if (fehler) process.exit(1);
  console.log('Alle Tests bestanden');
})();
