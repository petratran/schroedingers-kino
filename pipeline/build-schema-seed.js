/**
 * Schreibt den cinema-Seed in sql/schema.sql aus data/kinos.json neu.
 *
 *   node pipeline/build-schema-seed.js
 *
 * Die Stammdaten stehen an einer Stelle; dieses Skript sorgt dafuer, dass die
 * Datenbank denselben Stand bekommt wie Abruf und Dashboard. Es ersetzt nur den
 * Block zwischen den beiden Markern und laesst den Rest der Datei in Ruhe.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const STAMM = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/kinos.json'), 'utf8'));
const datei = path.join(ROOT, 'sql/schema.sql');
let sql = fs.readFileSync(datei, 'utf8');

const AUF = '-- >>> kinos aus data/kinos.json — erzeugt, nicht von Hand pflegen';
const ZU  = '-- <<< Ende erzeugter Block';

const q = (v) => v === null || v === undefined ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
const gruppe = (id) => (STAMM.gruppen.find((g) => g.id === id) || {}).name;

const zeilen = STAMM.kinos.map((k) =>
  `  (${q(k.id)}, ${q(k.name)}, ${q(k.ort)}, ${q(k.district)}, ${q(k.group)}, ` +
  `${q(gruppe(k.group))}, ${k.mubi_partner ? 'true' : 'false'}, ${q(k.node)})`
).join(',\n');

const block = [
  AUF,
  `-- ${STAMM.region} · ${STAMM.kinos.length} Haeuser · Stand ${new Date().toISOString().slice(0, 10)}`,
  'insert into cinema (id, name, ort, district, group_id, group_name, mubi_partner, kinozeit_node) values',
  zeilen,
  'on conflict (id) do update set',
  '  name = excluded.name, ort = excluded.ort, district = excluded.district,',
  '  group_id = excluded.group_id, group_name = excluded.group_name,',
  '  mubi_partner = excluded.mubi_partner, kinozeit_node = excluded.kinozeit_node;',
  '',
  ...(STAMM.ignorieren || []).map((x) =>
    `-- bewusst nicht aufgenommen: node ${x.node} (${x.name}) — ${x.grund.replace(/\s+/g, ' ')}`),
  ZU
].join('\n');

const i = sql.indexOf(AUF), j = sql.indexOf(ZU);
if (i >= 0 && j > i) {
  sql = sql.slice(0, i) + block + sql.slice(j + ZU.length);
} else {
  // Erster Lauf: den handgeschriebenen Seed durch den erzeugten Block ersetzen.
  const alt = sql.indexOf('insert into cinema (');
  if (alt < 0) throw new Error('Kein cinema-Seed gefunden — schema.sql von Hand pruefen.');
  const ende = sql.indexOf(';', sql.indexOf('on conflict (id) do update set', alt));
  if (ende < 0) throw new Error('Ende des alten Seeds nicht gefunden.');
  sql = sql.slice(0, alt) + block + sql.slice(ende + 1);
}

fs.writeFileSync(datei, sql);
console.log(`sql/schema.sql — cinema-Seed erzeugt: ${STAMM.kinos.length} Haeuser, ` +
            `${(STAMM.ignorieren || []).length} bewusst ausgelassen`);
