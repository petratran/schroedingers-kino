/**
 * Misst die Matching-Stufen gegen den handgelabelten Goldstandard.
 *
 *   node eval/evaluate.js
 *
 * Erwartet eval/goldstandard.csv mit ausgefuellter Spalte `auf_watchlist`
 * (ja / nein / unsicher). Zeilen ohne Eintrag werden uebersprungen und am
 * Ende gezaehlt — du kannst also zwischendurch messen.
 *
 * Stufe A: Teilstring-Vergleich, wie man es zuerst baut.
 * Stufe B: normalisierte Titel, Bigramm-Aehnlichkeit, Fortsetzungssperre.
 * Stufe C: dasselbe plus TMDb-ID und LLM-Schiedsspruch — wird gemessen,
 *          sobald data/today.json ein Feld resolved_by = 'tmdb' oder 'llm' hat.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { normalizeTitle } = require(path.join(ROOT, 'n8n/01-normalize.js'));
const { similarity } = require(path.join(ROOT, 'n8n/02-score-decide.js'));

// --- CSV lesen (Semikolon, Excel-tauglich) -------------------------------
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// --- Watchlist -----------------------------------------------------------
const wl = fs.readFileSync(path.join(ROOT, 'export/watchlist.csv'), 'utf8')
  .split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
    const c = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((x) =>
      x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    return { name: c[1], year: c[2] };
  }).filter((r) => r.name);

const wlNorm = wl.map((r) => ({ ...r, ...normalizeTitle(r.name) }));

// --- Stufe A: naiver Teilstring -----------------------------------------
const plump = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function stufeA(titel) {
  const n = plump(titel);
  if (!n) return { hit: false };
  const t = wl.find((w) => { const m = plump(w.name); return m === n || (n.length > 6 && (n.includes(m) || m.includes(n))); });
  return t ? { hit: true, matched: t.name } : { hit: false };
}

// --- Stufe B: wie im Betrieb --------------------------------------------
function stufeB(titel, schwelle = 0.90) {
  const me = normalizeTitle(titel);
  let best = null, score = 0;
  for (const w of wlNorm) {
    if (w.sequel !== me.sequel) continue;
    const s = Math.max(similarity(me.norm, w.norm), similarity(me.normPlain, w.normPlain));
    if (s >= schwelle && s > score) { score = s; best = w.name; }
  }
  return best ? { hit: true, matched: best, score: +score.toFixed(3) } : { hit: false };
}

// --- Messen --------------------------------------------------------------
const gold = readCsv(path.join(__dirname, 'goldstandard.csv'));
const ja = (v) => /^(ja|j|yes|y|1|x)$/i.test(v);
const nein = (v) => /^(nein|n|no|0)$/i.test(v);
const gelabelt = gold.filter((r) => ja(r.auf_watchlist) || nein(r.auf_watchlist));
const offen = gold.length - gelabelt.length;

function messen(name, vorhersage) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const fehler = [];
  for (const r of gelabelt) {
    const soll = ja(r.auf_watchlist);
    const v = vorhersage(r.titel);
    let ist = v.hit;
    // Richtig aus falschem Grund zaehlt nicht als Treffer: wenn du den
    // erwarteten Watchlist-Eintrag eingetragen hast und das Verfahren einen
    // anderen gefunden hat, ist das ein Fehler, kein Erfolg.
    if (ist && soll && r.watchlist_titel && v.matched &&
        plump(v.matched) !== plump(r.watchlist_titel)) {
      ist = false;
      fehler.push('falscher Eintrag: ' + r.titel + ' → ' + v.matched + ' statt ' + r.watchlist_titel);
    }
    if (ist && soll) tp++;
    else if (ist && !soll) { fp++; fehler.push('falsch positiv: ' + r.titel + (v.matched ? ' → ' + v.matched : '')); }
    else if (!ist && soll) { fn++; fehler.push('übersehen:      ' + r.titel + (r.watchlist_titel ? ' → ' + r.watchlist_titel : '')); }
    else tn++;
  }
  const p = tp + fp ? tp / (tp + fp) : null;
  const rec = tp + fn ? tp / (tp + fn) : null;
  const f1 = p && rec ? (2 * p * rec) / (p + rec) : null;
  const pct = (x) => x === null ? '  —  ' : (100 * x).toFixed(0).padStart(3) + ' %';
  console.log(`${name.padEnd(28)} Precision ${pct(p)}   Recall ${pct(rec)}   F1 ${pct(f1)}   (tp ${tp}, fp ${fp}, fn ${fn}, tn ${tn})`);
  return fehler;
}

if (!gelabelt.length) {
  console.log('Noch nichts gelabelt. Spalte "auf_watchlist" in eval/goldstandard.csv mit ja/nein füllen.');
  process.exit(0);
}

console.log(`Goldstandard: ${gelabelt.length} von ${gold.length} Zeilen gelabelt` +
            (offen ? `, ${offen} offen` : '') + `, davon ${gelabelt.filter(r => ja(r.auf_watchlist)).length} auf der Watchlist\n`);

const fa = messen('A · Teilstring', stufeA);
const fb = messen('B · normalisiert + Bigramm', stufeB);
console.log('   B mit Schwelle 0,86        ', '(zum Vergleich)');
messen('B · Schwelle 0,86', (t) => stufeB(t, 0.86));

console.log('\nFehler in Stufe A:');
fa.slice(0, 12).forEach((f) => console.log('  ' + f));
if (fa.length > 12) console.log(`  … und ${fa.length - 12} weitere`);
console.log('\nFehler in Stufe B:');
if (!fb.length) console.log('  keine');
fb.forEach((f) => console.log('  ' + f));

console.log('\nStufe C misst du, sobald TMDb angebunden ist — dann zählt hier,');
console.log('was resolved_by = tmdb oder llm in data/today.json liefert.');
