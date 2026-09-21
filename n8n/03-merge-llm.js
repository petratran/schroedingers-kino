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

// ---- n8n-Glue ----------------------------------------------------------
if (typeof $input !== 'undefined') {
  return $input.all().map((item) => ({ json: merge(item.json) }));
}

if (typeof module !== 'undefined') {
  module.exports = { merge, SHOW, FUZZY };
}
