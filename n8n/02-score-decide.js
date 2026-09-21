/**
 * n8n Code-Node 2 — "Kandidaten bewerten und entscheiden"
 * Modus: Run Once for All Items
 *
 * Erwartet je Item: die Felder aus Node 1 plus
 *   tmdb_results: [{ id, title, original_title, release_date, ... }]
 *
 * Liefert je Item:
 *   { decision: 'tmdb' | 'needs_llm' | 'unresolved',
 *     tmdb_id, confidence, resolved_by, reason,
 *     candidates: [...],        // nur bei needs_llm, fuer den LLM-Node
 *     related: [...] }          // Vorgaenger/Nachfolger, kein Treffer
 *
 * Schwellen an einer Stelle, damit du sie beim Tunen nicht suchen musst.
 */
const T = {
  AUTO: 0.95,   // ab hier ohne Rueckfrage uebernehmen
  RIVAL: 0.90,  // zweitbester Kandidat darueber => doch unsicher
  ASK: 0.60,    // darunter lohnt sich nicht mal die LLM-Frage
  RELATED: 0.85, // Aehnlichkeit trotz anderer Teil-Nummer => Vorgaenger
  // Ein Film im regulaeren Einsatz ist hoechstens gut ein Jahr alt und kann
  // als Preview schon vor dem Start laufen. Genau ein Kandidat in diesem
  // Fenster entscheidet einen Gleichstand ohne Rueckfrage beim Modell.
  NEU_MONATE_VOR: 15,
  NEU_MONATE_NACH: 3
};

/** Monate zwischen Kinotermin und Kinostart, positiv = Start liegt davor. */
function monateSeitStart(releaseDate, terminDate) {
  if (!releaseDate || !terminDate) return null;
  const r = new Date(releaseDate + 'T12:00:00'), t = new Date(terminDate + 'T12:00:00');
  if (isNaN(r) || isNaN(t)) return null;
  return (t.getFullYear() - r.getFullYear()) * 12 + (t.getMonth() - r.getMonth());
}

// --- aus Node 1 gespiegelt (Code-Nodes koennen nichts importieren) -------
const ARTICLES = /\b(der|die|das|den|dem|des|the|a|an|le|la|les|el|los|il|lo|un|une)\b/g;
const ORDINALS = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,eins:1,zwei:2,drei:3,vier:4,fuenf:5,funf:5,sechs:6,sieben:7,acht:8,
  neun:9,zehn:10,elf:11,zwoelf:12,zwolf:12,i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10,xi:11,xii:12 };

function toAscii(s){return s.replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
  .replace(/Ä/g,'ae').replace(/Ö/g,'oe').replace(/Ü/g,'ue').replace(/ß/g,'ss')
  .normalize('NFKD').replace(/[̀-ͯ]/g,'');}
function toPlain(s){return s.replace(/ß/g,'ss').normalize('NFKD').replace(/[̀-ͯ]/g,'');}
function squash(s){return s.toLowerCase().replace(/&/g,' und ')
  // \p{L} statt a-z: sonst verschwinden Hangul, Kana und Kyrillisch spurlos
  // und "괴물" wird zum leeren String.
  .replace(/[^\p{L}\p{N}]+/gu,' ').replace(ARTICLES,' ').replace(/\s+/g,' ').trim();}
function sequelIndex(c){const w=c.split(' ').filter(Boolean);if(!w.length)return 1;
  const last=w[w.length-1],prev=w[w.length-2];
  if(/^\d{1,2}$/.test(last)){const n=parseInt(last,10);if(n>=2&&n<=12)return n;}
  if((prev==='part'||prev==='teil'||prev==='chapter'||prev==='kapitel'||prev==='episode')&&ORDINALS[last])return ORDINALS[last];
  if(ORDINALS[last]&&ORDINALS[last]>=2&&ORDINALS[last]<=12&&w.length>1&&!/^(i|v|x)$/.test(last))return ORDINALS[last];
  return 1;}

/** Dice-Koeffizient ueber Zeichen-Bigramme. Robust gegen Wortdreher. */
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a), gb = grams(b);
  let hits = 0, total = 0;
  for (const [g, n] of ga) { total += n; hits += Math.min(n, gb.get(g) || 0); }
  for (const [, n] of gb) total += n;
  return (2 * hits) / total;
}

/** Bester Score eines Kandidaten ueber alle Schreibvarianten. */
function scoreCandidate(item, cand) {
  const mine = [item.norm, item.normAscii, item.normPlain].filter(Boolean);
  const theirs = [cand.title, cand.original_title]
    .filter(Boolean)
    .flatMap((t) => [squash(toAscii(t)), squash(toPlain(t))]);
  let best = 0, bestTitle = null;
  for (const m of mine) for (const t of theirs) {
    const s = similarity(m, t);
    if (s > best) { best = s; bestTitle = t; }
  }
  return { score: Math.round(best * 1000) / 1000, matchedOn: bestTitle };
}

function decide(item) {
  const results = item.tmdb_results || [];
  const scored = [], related = [];

  for (const c of results) {
    const { score, matchedOn } = scoreCandidate(item, c);
    const year = (c.release_date || '').slice(0, 4);
    const candSequel = sequelIndex(squash(toAscii(c.title || c.original_title || '')));
    const entry = {
      tmdb_id: c.id, title: c.title, original_title: c.original_title,
      year, release_date: c.release_date || null, score, matchedOn, sequel: candSequel
    };
    // Fortsetzungs-Sperre: gleicher Stamm, andere Nummer => niemals derselbe Film.
    if (candSequel !== item.sequel) {
      if (score >= T.RELATED) related.push({ ...entry, relation: candSequel < item.sequel ? 'vorgaenger' : 'nachfolger' });
      continue;
    }
    scored.push(entry);
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0], rival = scored[1];

  if (top && top.score >= T.AUTO && (!rival || rival.score < T.RIVAL)) {
    return { decision: 'tmdb', tmdb_id: top.tmdb_id, confidence: top.score,
             resolved_by: 'tmdb', reason: `eindeutig: "${top.matchedOn}"`,
             candidates: [], related };
  }
  // Gleichstand? Dann entscheidet zuerst der Kinostart, nicht das Modell.
  if (top && top.score >= T.AUTO && rival && rival.score >= T.RIVAL) {
    const termin = item.date || (item.starts_at || '').slice(0, 10) || null;
    const gleichauf = scored.filter((c) => c.score >= T.RIVAL);
    const aktuell = gleichauf.filter((c) => {
      const m = monateSeitStart(c.release_date, termin);
      return m !== null && m <= T.NEU_MONATE_VOR && m >= -T.NEU_MONATE_NACH;
    });
    if (aktuell.length === 1) {
      return { decision: 'tmdb', tmdb_id: aktuell[0].tmdb_id, confidence: 0.97,
               resolved_by: 'tmdb',
               reason: `${gleichauf.length} Titelgleiche, aber nur "${aktuell[0].title}" (${aktuell[0].year}) laeuft zum Termin im regulaeren Einsatz`,
               candidates: [], related };
    }
  }

  if (top && top.score >= T.ASK) {
    return { decision: 'needs_llm', tmdb_id: null, confidence: top.score,
             resolved_by: null,
             reason: rival && rival.score >= T.RIVAL
               ? `${scored.filter(s => s.score >= T.RIVAL).length} gleichwertige Kandidaten`
               : `bester Kandidat nur bei ${top.score}`,
             candidates: scored.slice(0, 6), related };
  }
  return { decision: 'unresolved', tmdb_id: null, confidence: top ? top.score : 0,
           resolved_by: null,
           reason: results.length ? 'kein Kandidat ueber der Schwelle' : 'TMDb ohne Ergebnis',
           candidates: [], related };
}

// ---- n8n-Glue ----------------------------------------------------------
if (typeof $input !== 'undefined') {
  return $input.all().map((item) => ({ json: { ...item.json, ...decide(item.json) } }));
}

if (typeof module !== 'undefined') {
  module.exports = { decide, similarity, scoreCandidate, monateSeitStart, T };
}
