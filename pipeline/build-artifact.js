/**
 * Baut aus dashboard/index.html die Artifact-Fassung.
 *
 * Unterschied: Artifact-Seiten duerfen nichts nachladen (CSP blockt fetch auf
 * fremde Hosts), also wird data/today.json direkt eingebettet. Ausserdem
 * liefert die Artifact-Plattform das HTML-Geruest selbst — doctype, head und
 * body muessen raus.
 *
 *   node pipeline/build-artifact.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const src = fs.readFileSync(path.join(ROOT, 'dashboard/index.html'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'data/today.json'), 'utf8');

const pick = (re) => (src.match(re) || [''])[0];
const title = pick(/<title>[\s\S]*?<\/title>/);
const links = (src.match(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g) || []).join('\n');
const style = pick(/<style>[\s\S]*?<\/style>/);
const body = (src.match(/<body>([\s\S]*)<\/body>/) || [, ''])[1].trim();

const out = [
  title,
  links,
  style,
  '',
  '<script id="today-data">window.__TODAY__ = ' + data.replace(/<\//g, '<\\/') + ';<\/script>',
  '',
  body
].join('\n');

const dest = path.join(ROOT, 'dashboard/artifact.html');
fs.writeFileSync(dest, out);
console.log('dashboard/artifact.html geschrieben —', (out.length / 1024).toFixed(1), 'KB');
if (/<!doctype|<html|<head>|<body>/i.test(out)) throw new Error('Geruest-Tags nicht entfernt');
if (!out.includes('window.__TODAY__')) throw new Error('Daten nicht eingebettet');
console.log('Geruest-Tags entfernt, Daten eingebettet — bereit zum Veroeffentlichen');
