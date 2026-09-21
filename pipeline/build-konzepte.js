/** Baut die Artifact-Fassung der Designvorschau: Daten einbetten, Gerüst entfernen. */
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'dashboard/konzepte.html'), 'utf8');
const today = fs.readFileSync(path.join(ROOT, 'data/today.json'), 'utf8');
const wl = fs.readFileSync(path.join(ROOT, 'data/watchlist-angereichert.json'), 'utf8');
const pick = (re) => (src.match(re) || [''])[0];
const out = [
  pick(/<title>[\s\S]*?<\/title>/),
  (src.match(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g) || []).join('\n'),
  pick(/<style>[\s\S]*?<\/style>/), '',
  '<script>window.__TODAY__ = ' + today.replace(/<\//g, '<\\/') +
  ';window.__WATCHLIST__ = ' + wl.replace(/<\//g, '<\\/') + ';<\/script>', '',
  (src.match(/<body>([\s\S]*)<\/body>/) || [, ''])[1].trim()
].join('\n');
if (/<!doctype|<html|<head>|<body>/i.test(out)) throw new Error('Gerüst-Tags nicht entfernt');
fs.writeFileSync(path.join(ROOT, 'dashboard/konzepte-artifact.html'), out);
console.log('dashboard/konzepte-artifact.html —', (out.length/1024).toFixed(1), 'KB');
