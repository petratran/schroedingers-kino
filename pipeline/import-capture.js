/**
 * Wandelt einen Roh-Mitschnitt der kino-zeit-Stadtseite in data/showings-raw.json.
 *
 *   node pipeline/import-capture.js data/capture-stuttgart-2026-09-18.json
 *
 * Im Betrieb schreibt n8n data/showings-raw.json direkt — dieses Skript
 * existiert, damit ein von Hand gezogener Mitschnitt dasselbe Format bekommt.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { splitVersion } = require(path.join(ROOT, 'n8n/04-parse-kinozeit.js'));

// Stammdaten aller Haeuser der Region: data/kinos.json ist die einzige Quelle,
// damit Abruf und Aufbereitung nicht auseinanderlaufen. mubi_partner nach den
// Angaben von arthaus-kino.de (Delphi, atelier) und innenstadtkinos.de
// (Gloria, EM, Cinema); fuer die Haeuser ausserhalb Stuttgarts ist kein
// MUBI-GO-Partnerstatus belegt, sie stehen deshalb auf false.
const STAMM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/kinos.json'), 'utf8'));
const GRUPPEN = {};
for (const g of STAMM.gruppen) GRUPPEN[g.id] = { name: g.name, ort: g.ort };
const KINOS = {};
for (const k of STAMM.kinos) KINOS[k.node] = k;
// Knoten, die bewusst draussen bleiben (siehe Begruendung in kinos.json).
const IGNORIEREN = new Set((STAMM.ignorieren || []).map((x) => x.node));

const capture = JSON.parse(fs.readFileSync(path.join(ROOT, process.argv[2] ||
  'data/capture-stuttgart-2026-09-18.json'), 'utf8'));

// Genre und Laufzeit aus einem frueheren Mitschnitt uebernehmen, wo vorhanden.
const meta = {};
try {
  const alt = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/showings-raw.json'), 'utf8'));
  for (const rows of Object.values(alt.showings || {}))
    for (const r of rows) if (Array.isArray(r) && r[0]) meta[r[0]] = { genre: r[3], runtime_min: r[4] };
} catch (e) { /* erster Lauf */ }

const unbekannt = new Set();
const showings = {};
for (const [kinoNode, titelIdx, datum, zeit, bookingId] of capture.rows) {
  const kino = KINOS[String(kinoNode)];
  if (IGNORIEREN.has(String(kinoNode))) continue;
  if (!kino) { unbekannt.add(kinoNode + ' = ' + capture.kinos[kinoNode]); continue; }
  const [filmNode, rohTitel] = capture.titel[titelIdx];
  const { title, version, format } = splitVersion(rohTitel);
  (showings[kino.id] ||= []).push({
    film_node: filmNode,
    raw_title: title,
    version, format,
    genre: (meta[filmNode] || {}).genre ?? null,
    runtime_min: (meta[filmNode] || {}).runtime_min ?? null,
    date: datum,
    time: zeit,
    booking_url: bookingId ? 'https://www.kino-zeit.de/booking/' + bookingId : null
  });
}
for (const rows of Object.values(showings))
  rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.raw_title.localeCompare(b.raw_title, 'de'));

const cinemas = {};
for (const [node, k] of Object.entries(KINOS)) {
  if (!showings[k.id]) continue;
  cinemas[k.id] = { name: k.name, district: k.district, mubi_partner: k.mubi_partner,
                    group: k.group, group_name: GRUPPEN[k.group].name,
                    kinozeit_node: node,
                    source_url: 'https://www.kino-zeit.de/kinoprogramm/ort/Stuttgart' };
}

// Gruppen in der Reihenfolge, in der ihre Kinos stehen (MUBI-Partner zuerst)
const gruppen = [];
for (const [node, k] of Object.entries(KINOS)) {
  if (!showings[k.id]) continue;
  if (gruppen.some((g) => g.id === k.group)) continue;
  const mitglieder = Object.values(KINOS).filter((x) => x.group === k.group && showings[x.id]);
  gruppen.push({ id: k.group, name: GRUPPEN[k.group].name,
                 cinemas: mitglieder.map((x) => x.id),
                 mubi_partner: mitglieder.every((x) => x.mubi_partner) });
}
gruppen.sort((a, b) => (b.mubi_partner - a.mubi_partner) || a.name.localeCompare(b.name, 'de'));

const out = {
  captured_at: new Date().toISOString(),
  groups: gruppen,
  note: 'Mitschnitt der kino-zeit-Stadtseite (ein Abruf je Tag deckt alle Kinos ab). Im Betrieb schreibt n8n diese Datei.',
  cinemas,
  showings
};
fs.writeFileSync(path.join(ROOT, 'data/showings-raw.json'), JSON.stringify(out, null, 1));

const n = Object.values(showings).reduce((a, r) => a + r.length, 0);
console.log(`data/showings-raw.json: ${Object.keys(cinemas).length} Kinos, ${n} Vorstellungen`);
for (const [id, rows] of Object.entries(showings).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${id.padEnd(22)} ${String(rows.length).padStart(3)} Vorstellungen${cinemas[id].mubi_partner ? '  [MUBI GO]' : ''}`);
if (unbekannt.size) console.log('Ohne Stammdaten übersprungen:', [...unbekannt].join(', '));
