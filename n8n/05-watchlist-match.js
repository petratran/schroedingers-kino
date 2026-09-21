/**
 * n8n Code-Node — "Direktabgleich gegen die angereicherte Watchlist"
 * Läuft VOR der TMDb-Kaskade.
 *
 * Hintergrund: Der Letterboxd-Export enthält nur den Anzeigetitel. Der
 * Endpunkt /film/<slug>/json/ liefert zusätzlich originalName, releaseYear,
 * runTime und directors — strukturiert, ein kleiner Aufruf je Film, einmalig.
 *
 * Damit hat die Watchlist drei sprachunabhängige Merkmale: Laufzeit, Jahr
 * und den Originaltitel. Genau die braucht man für den Fall, an dem jeder
 * Titelvergleich scheitert:
 *
 *   Aushang Stuttgart : "Vaterland", Drama, 82 Min, Termin 18.09.2026
 *   Watchlist         : "Fatherland" / "Ojczyzna", 2026, 82 Min
 *
 * Kein Titel stimmt überein — Laufzeit und Jahr schon, und der Film läuft
 * zum Termin im regulären Einsatz. Das reicht für einen belastbaren
 * Verdacht, ohne einen einzigen API-Aufruf.
 */

// Ergebnisse: 'sicher' wird ausgespielt, 'verdacht' geht an die TMDb-Kaskade,
// 'mehrdeutig' und 'kein_treffer' beenden die Prüfung.
const W = {
  TITEL_SICHER: 0.95,   // Titel stimmt praktisch überein
  TITEL_NAH: 0.86,      // ähnlich genug, um mit Laufzeit bestätigt zu werden
  LAUFZEIT_TOLERANZ: 2, // Minuten; Verleih- und Datenbankangaben weichen leicht ab
  JAHR_TOLERANZ: 1,     // Kinostart kann ins Folgejahr rutschen
  LAUF_MONATE: 15       // so lange gilt ein Film als "im regulären Einsatz"
};

const ARTICLES = /\b(der|die|das|den|dem|des|the|a|an|le|la|les|el|los|il|lo|un|une)\b/g;
function toAscii(s){return s.replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
  .replace(/Ä/g,'ae').replace(/Ö/g,'oe').replace(/Ü/g,'ue').replace(/ß/g,'ss')
  .normalize('NFKD').replace(/[̀-ͯ]/g,'');}
function squash(s){return (s||'').toLowerCase().replace(/&/g,' und ')
  // \p{L} statt a-z: sonst verschwinden Hangul, Kana und Kyrillisch spurlos
  // und "괴물" wird zum leeren String.
  .replace(/[^\p{L}\p{N}]+/gu,' ').replace(ARTICLES,' ').replace(/\s+/g,' ').trim();}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s) => { const m = new Map();
    for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i+2); m.set(g, (m.get(g)||0)+1); }
    return m; };
  const ga = grams(a), gb = grams(b);
  let hits = 0, total = 0;
  for (const [g, n] of ga) { total += n; hits += Math.min(n, gb.get(g) || 0); }
  for (const [, n] of gb) total += n;
  return (2 * hits) / total;
}

/** Watchlist aus data/watchlist-angereichert.json in Objekte wandeln. */
function ladeWatchlist(roh) {
  return (roh.filme || roh).map((f) => Array.isArray(f)
    ? { slug: f[0], lid: f[1], name: f[2], originalName: f[3], year: f[4], runtime: f[5], director: f[6] }
    : f);
}

/**
 * Eine Vorstellung gegen die Watchlist halten.
 * @param {{raw_title, runtime_min, date}} v  Vorstellung aus dem Parser
 * @param {Array} watchlist  angereicherte Einträge
 */
// Reihennamen wie "Weird Wednesday:" muessen weg, bevor verglichen wird —
// sonst findet der Titel nichts und die Laufzeit erzeugt einen Fehlverdacht.
const REIHEN = ['weird wednesday','arthaus sneak','sneak preview','horror classics',
  'kitkatclub','met opera','the metropolitan opera','minikino',
  'disney channel mitmachkino','ladies night','schulkino','open air',
  'filmclub','klassiker am sonntag','preview'];
function ohneReihe(title) {
  const m = String(title || '').trim().match(/^([^:]{3,40}):\s*(.+)$/);
  if (!m) return String(title || '').trim();
  const kopf = m[1].toLowerCase().replace(/\s+/g,' ').trim();
  return REIHEN.some((r) => kopf === r || kopf.startsWith(r)) ? m[2].trim() : String(title).trim();
}

function pruefe(v, watchlist) {
  const titelNorm = squash(toAscii(ohneReihe(v.raw_title)));
  const jahrTermin = v.date ? parseInt(String(v.date).slice(0, 4), 10) : null;
  const treffer = [];

  for (const w of watchlist) {
    const kandidatTitel = [w.name, w.originalName].filter(Boolean)
      .map((t) => squash(toAscii(t)));
    const titelScore = Math.max(0, ...kandidatTitel.map((t) => similarity(titelNorm, t)));

    const laufzeitPasst = v.runtime_min && w.runtime &&
      Math.abs(v.runtime_min - w.runtime) <= W.LAUFZEIT_TOLERANZ;
    const jahrPasst = jahrTermin && w.year &&
      (jahrTermin - w.year) <= W.LAUF_MONATE / 12 && (w.year - jahrTermin) <= W.JAHR_TOLERANZ;

    let status = null, confidence = 0, grund = '';

    if (titelScore >= W.TITEL_SICHER) {
      status = 'sicher'; confidence = titelScore;
      grund = 'Titel stimmt überein';
      if (laufzeitPasst) { confidence = 1; grund += ', Laufzeit bestätigt'; }
    } else if (titelScore >= W.TITEL_NAH && laufzeitPasst) {
      status = 'sicher'; confidence = 0.95;
      grund = `ähnlicher Titel (${titelScore.toFixed(2)}) plus identische Laufzeit`;
    } else if (laufzeitPasst && jahrPasst) {
      // Der sprachübergreifende Fall. Laufzeit und Jahr sind ein Verdacht,
      // kein Beweis: "Adams Acht" (124 Min) und "Colony" (123 Min) sind beide
      // von 2026 und haben nichts miteinander zu tun. Deshalb entscheidet
      // dieser Zweig nichts, sondern reicht den Fall an TMDb weiter.
      const exakt = v.runtime_min === w.runtime;
      status = 'verdacht'; confidence = exakt ? 0.65 : 0.5;
      grund = `kein Titeltreffer, aber ${exakt ? 'identische' : 'nahe'} Laufzeit `
            + `(${v.runtime_min}/${w.runtime} Min) und Jahrgang ${w.year} — von TMDb prüfen lassen`;
    }

    if (status) treffer.push({ ...w, status, confidence, titelScore: +titelScore.toFixed(3), grund });
  }

  if (!treffer.length) return { status: 'kein_treffer', confidence: 0, watchlist: null, alternativen: [] };

  treffer.sort((a, b) => b.confidence - a.confidence || b.titelScore - a.titelScore);
  const best = treffer[0];

  // Mehrere gleich gute Verdachtsfälle ohne Titeltreffer sind kein Treffer.
  if (best.status === 'verdacht' && treffer.filter((t) => t.confidence === best.confidence).length > 1) {
    return { status: 'mehrdeutig', confidence: 0, watchlist: null,
             alternativen: treffer.filter((t) => t.confidence === best.confidence).slice(0, 4) };
  }

  return { status: best.status, confidence: best.confidence, resolved_by: 'signale',
           reason: best.grund, watchlist: best,
           alternativen: treffer.slice(1, 3) };
}

// ---- n8n-Glue ----------------------------------------------------------
if (typeof $input !== 'undefined') {
  const wl = ladeWatchlist($('Watchlist laden').first().json);
  return $input.all().map((item) => ({ json: { ...item.json, ...pruefe(item.json, wl) } }));
}

if (typeof module !== 'undefined') {
  module.exports = { pruefe, ladeWatchlist, similarity, squash, toAscii, ohneReihe, W };
}
