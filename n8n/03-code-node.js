/**
 * n8n Code-Node 3 — "LLM-Urteil zusammenfuehren"
 * Modus: Run Once for All Items
 *
 * Laeuft nach dem LLM-Node und hinter einem Merge, der den 'tmdb'- und den
 * 'needs_llm'-Zweig wieder zusammenfuehrt. Erzeugt die Zeilen fuer title_alias.
 *
 * Erwartet je Item: das Ergebnis aus Node 2, bei LLM-Zweig zusaetzlich
 *   llm: { tmdb_id: number|null, confidence: number, reason: string }
 */
const SHOW = 0.85;   // ab hier normal ausspielen
const FUZZY = 0.50;  // darunter gar nicht ausspielen

function merge(item) {
  let tmdb_id = item.tmdb_id ?? null;
  let confidence = item.confidence ?? 0;
  let resolved_by = item.resolved_by ?? null;
  let reason = item.reason ?? '';

  if (item.decision === 'needs_llm') {
    const v = item.llm || {};
    // Das Modell darf nur aus den Kandidaten waehlen, die es bekommen hat.
    const allowed = new Set((item.candidates || []).map((c) => c.tmdb_id));
    if (v.tmdb_id && allowed.has(v.tmdb_id)) {
      tmdb_id = v.tmdb_id;
      confidence = Math.min(Number(v.confidence) || 0, 0.95); // nie volle Sicherheit
      resolved_by = 'llm';
      reason = v.reason || 'LLM-Entscheidung';
    } else {
      tmdb_id = null;
      confidence = 0;
      resolved_by = 'llm';
      reason = v.tmdb_id ? 'LLM nannte eine ID ausserhalb der Kandidaten — verworfen'
                         : (v.reason || 'LLM ohne Zuordnung');
    }
  }

  const status = tmdb_id == null ? 'offen'
               : confidence >= SHOW ? 'sicher'
               : confidence >= FUZZY ? 'unscharf'
               : 'offen';

  return {
    raw_title: item.raw_title,
    tmdb_id,
    confidence: Math.round(confidence * 1000) / 1000,
    resolved_by,
    status,                         // steuert das Label im Dashboard
    reason,
    checked_at: new Date().toISOString(),
    related: item.related || []     // Vorgaenger/Nachfolger, separat ausspielbar
  };
}

// ---- n8n-Glue: Workflow 3 ---------------------------------------------
// Node-Modus: **Run Once for All Items**. Laeuft hinter dem Merge, der den
// tmdb-, den needs_llm- und den unresolved-Zweig zusammenfuehrt.
//
// Liefert genau EIN Item mit zwei fertigen Listen:
//   json.filme    -> Rumpf fuer POST /rest/v1/film        (zuerst schreiben)
//   json.aliasse  -> Rumpf fuer POST /rest/v1/title_alias (danach)
//
// Warum ein einziges Item: Die Insert-Nodes brauchen dann nur noch
// {{ JSON.stringify($json.filme) }} statt eines Ausdrucks, der ueber
// $('...').all() in einen fremden Node greift. Ein solcher Ausdruck liefert
// im Fehlerfall still eine leere Liste — PostgREST nimmt die klaglos an,
// schreibt nichts, und der Fehler faellt erst beim Fremdschluessel auf.
//
// Warum film zuerst: title_alias.tmdb_id ist ein Fremdschluessel auf
// film.tmdb_id. In `film` stehen bislang nur Watchlist-Filme — der erste
// Kinofilm, den du nicht vorgemerkt hast, fehlt dort.

const aliasse = [];
const filmeNachId = new Map();   // dedupliziert: ein Upsert darf dieselbe
                                 // Zeile nicht zweimal im selben Rumpf treffen

for (const item of $input.all()) {
  const m = merge(item.json);

  aliasse.push({
    source_key:  item.json.source_key,
    raw_title:   m.raw_title,
    tmdb_id:     m.tmdb_id,
    confidence:  m.confidence,
    // Die Spalte ist NOT NULL mit CHECK in ('tmdb','llm','manual','offen').
    // merge() liefert bei einem unaufgeloesten Titel null — das waere ein
    // Constraint-Fehler statt eines dokumentierten Zustands.
    resolved_by: m.resolved_by ?? 'offen',
    status:      m.status,
    reason:      m.reason,
    checked_at:  m.checked_at
    // `related` bleibt draussen: dafuer gibt es keine Spalte.
  });

  if (!m.tmdb_id) continue;

  // Der gewaehlte Kandidat steckt noch in der TMDb-Antwort am Item.
  // Achtung: tmdb_results nennt das Feld `id`, die Kandidatenliste `tmdb_id`.
  const quelle = (item.json.tmdb_results || []).find((r) => r.id === m.tmdb_id) || null;

  // Nur setzen, was wir wirklich wissen: Ein Upsert mit leeren Titeln wuerde
  // sonst ausgefuellte Zeilen aus Workflow 1 ueberschreiben.
  // Einheitliche Schluessel: PostgREST verlangt bei einem Sammel-Insert von
  // jedem Objekt dieselben Felder (PGRST102 "All object keys must match").
  const film = {
    tmdb_id:    m.tmdb_id,
    title_de:   quelle?.title ?? null,
    title_orig: quelle?.original_title ?? null,
    year:       quelle?.release_date ? (Number(String(quelle.release_date).slice(0, 4)) || null) : null
  };
  filmeNachId.set(film.tmdb_id, { ...(filmeNachId.get(film.tmdb_id) || {}), ...film });
}

const filme = [...filmeNachId.values()];

const zaehl = (feld, wert) => aliasse.filter((a) => a[feld] === wert).length;
console.log(`Aliasse: ${aliasse.length} — sicher ${zaehl('status', 'sicher')}, ` +
            `unscharf ${zaehl('status', 'unscharf')}, offen ${zaehl('status', 'offen')}`);
console.log(`davon per LLM entschieden: ${zaehl('resolved_by', 'llm')}`);
console.log(`Filme zum Anlegen oder Ergaenzen: ${filme.length}`);

if (!aliasse.length) throw new Error('Keine Aliasse gebaut — kam am Merge nichts an?');

return [{ json: { filme, aliasse, anzahl: { aliasse: aliasse.length, filme: filme.length } } }];
