/** Artifact-Fassung der Logo-Seite: Gerüst entfernen, sonst nichts. */
const fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'design/logos.html'),'utf8');
const pick=(re)=>(src.match(re)||[''])[0];
const out=[pick(/<title>[\s\S]*?<\/title>/),
 (src.match(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g)||[]).join('\n'),
 pick(/<style>[\s\S]*?<\/style>/),'',
 (src.match(/<body>([\s\S]*)<\/body>/)||[,''])[1].trim()].join('\n');
if(/<!doctype|<html|<head>|<body>/i.test(out)) throw new Error('Gerüst-Tags nicht entfernt');
fs.writeFileSync(path.join(ROOT,'design/logos-artifact.html'),out);
console.log('design/logos-artifact.html —',(out.length/1024).toFixed(1),'KB');
