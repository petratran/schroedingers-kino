/**
 * n8n Code-Node — "Watchlist lesen" (Workflow 1, automatischer Zweig)
 * Modus: Run Once for All Items
 *
 * Liest die oeffentliche Letterboxd-Watchlist und vergleicht sie mit dem
 * eigenen Bestand. Liefert je Film ein Item:
 *
 *   { aktion: 'neu',      Name, Year, 'Letterboxd URI', Date, slug }
 *   { aktion: 'entfernt', tmdb_id, Name }
 *
 * Die Feldnamen der 'neu'-Items sind bewusst die Spaltennamen des
 * CSV-Exports: Danach kommt unveraendert die bestehende Kette aus
 * Workflow 1 (Filmseite holen -> 06-code-node.js -> film/watchlist
 * schreiben). Der Abruf ersetzt den Upload, nicht die Pipeline.
 *
 * Reine Funktionen, kein Netz. Test: node test-letterboxd-watchlist.js
 */

// --- HTML lesen --------------------------------------------------------
const ENTITIES = {
  '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&apos;': "'",
  '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
  '&auml;': 'ä', '&ouml;': 'ö', '&uuml;': 'ü', '&Auml;': 'Ä', '&Ouml;': 'Ö',
  '&Uuml;': 'Ü', '&szlig;': 'ß', '&eacute;': 'é', '&egrave;': 'è'
};

function entities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-zA-Z]+;/g, (e) => (e in ENTITIES ? ENTITIES[e] : e));
}

function attr(tag, name) {
  const m = String(tag).match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'));
  return m ? entities(m[1]) : null;
}

/**
 * Die Watchlist-Seite ist serverseitig gerendert: Jeder Film steht als
 * <div class="react-component" data-item-…> im ausgelieferten HTML, auch
 * wenn das Poster selbst spaeter nachgeladen wird. Gelesen werden nur die
 * Datenattribute — nicht das Markup drumherum, das sich jederzeit aendern
 * darf, ohne dass dieser Parser etwas merkt.
 *
 * Wichtig ist `data-postered-identifier`: Darin steht die `lid`, also genau
 * der Kurzschluessel, der im CSV-Export als https://boxd.it/<lid> auftaucht.
 * Damit ist der Abgleich mit dem Bestand exakt und braucht keinen
 * Titelvergleich.
 */
function filmeAusSeite(html) {
  const tags = String(html || '').match(/<div\b[^>]*data-item-slug="[^"]*"[^>]*>/gi) || [];
  const filme = [];

  for (const tag of tags) {
    const slug = attr(tag, 'data-item-slug');
    const link = attr(tag, 'data-item-link');
    const name = attr(tag, 'data-item-name') || attr(tag, 'data-item-full-display-name');
    if (!slug || !name) continue;

    let lid = null, typ = 'film';
    const ident = attr(tag, 'data-postered-identifier');
    if (ident) {
      try {
        const j = JSON.parse(ident);
        lid = j.lid || null;
        typ = j.type || j.typeName || 'film';
      } catch (e) { /* kaputtes JSON: dann eben ohne lid */ }
    }
    // Eine Watchlist enthaelt nur Filme; alles andere waere ein Umbau der
    // Seite und keine Zeile, die wir stillschweigend mitnehmen wollen.
    if (typ !== 'film') continue;
    if (!lid) continue;

    // "Fatherland (2026)" -> Titel + Jahr. Das Jahr steht immer in Klammern
    // am Ende; fehlt es, bleibt das Feld leer statt geraten.
    const m = name.match(/^(.*)\s+\((\d{4})\)\s*$/);
    filme.push({
      titel: (m ? m[1] : name).trim(),
      jahr: m ? m[2] : null,
      slug,
      film_url: link ? 'https://letterboxd.com' + link : `https://letterboxd.com/film/${slug}/`,
      lid,
      letterboxd_uri: 'https://boxd.it/' + lid
    });
  }
  return filme;
}

/** Hoechste Seitenzahl aus der Blaetter-Leiste; ohne Leiste ist es eine Seite. */
function seitenAnzahl(html) {
  const treffer = String(html || '').match(/\/watchlist\/page\/(\d+)\//g) || [];
  const zahlen = treffer.map((t) => Number(t.match(/(\d+)/)[1])).filter(Boolean);
  return zahlen.length ? Math.max(1, ...zahlen) : 1;
}

// --- Abgleich ----------------------------------------------------------
/**
 * Der eigentliche Gewinn gegenueber dem CSV-Upload: Der Abruf kennt den
 * vollstaendigen Soll-Zustand und sieht deshalb auch, was verschwunden ist.
 * Ein Upload kann nur hinzufuegen — ein von der Watchlist genommener Film
 * bleibt sonst für immer als Treffer auf dem Dashboard stehen.
 *
 * Genau deshalb sind hier zwei Sicherungen eingebaut. Loeschen ist die
 * einzige Operation dieser Pipeline, die Daten vernichtet, und ein
 * Seitenumbau bei Letterboxd darf nicht als "alles entfernt" durchgehen.
 */
function abgleich(gefunden, bestand, heute, grenze = 0.5) {
  const aktuell = (gefunden || []).filter((f) => f && f.letterboxd_uri);
  const alt = (bestand || []).filter((b) => b && b.letterboxd_uri);

  // Sicherung 1: keine Filme gelesen heisst Parser kaputt, nicht Liste leer.
  if (!aktuell.length) {
    throw new Error(
      'Die Watchlist-Seite lieferte keinen einzigen Film. Das ist eher ein ' +
      'Umbau bei Letterboxd als eine geleerte Watchlist — es wird nichts ' +
      'geschrieben und nichts geloescht. 11-letterboxd-watchlist.js pruefen.');
  }

  const habenWir = new Set(alt.map((b) => b.letterboxd_uri));
  const sindDa   = new Set(aktuell.map((f) => f.letterboxd_uri));

  const neu = aktuell.filter((f) => !habenWir.has(f.letterboxd_uri));
  const weg = alt.filter((b) => !sindDa.has(b.letterboxd_uri));

  // Sicherung 2: ein Sprung, der nach Datenverlust aussieht, wird gemeldet
  // statt ausgefuehrt. Einzelne Streichungen sind Alltag, die halbe Liste
  // auf einmal ist es nicht.
  if (alt.length && weg.length > Math.max(5, alt.length * grenze)) {
    throw new Error(
      `${weg.length} von ${alt.length} Watchlist-Eintraegen waeren zu loeschen. ` +
      `Das ist zu viel fuer einen normalen Lauf — vermutlich war die Seite ` +
      `unvollstaendig. Es wird nichts geloescht; bei Bedarf den Lauf mit ` +
      `angehobener Grenze wiederholen.`);
  }

  return [
    ...neu.map((f) => ({
      aktion: 'neu',
      // Die Spaltennamen des CSV-Exports, damit 06-code-node.js unveraendert bleibt.
      Name: f.titel,
      Year: f.jahr,
      'Letterboxd URI': f.letterboxd_uri,
      Date: heute,            // "seit wann auf der Watchlist" = seit wann gesehen
      slug: f.slug
    })),
    ...weg.map((b) => ({ aktion: 'entfernt', tmdb_id: b.tmdb_id, Name: b.title_raw || b.letterboxd_uri }))
  ];
}

// --- n8n-Glue ----------------------------------------------------------
if (typeof $input !== 'undefined') {
  // Seite 1 kommt aus dem ersten HTTP-Node, die Folgeseiten aus dem zweiten.
  const seite1 = $('Watchlist Seite 1').first().json.data;
  const weitere = $input.all()
    .map((i) => i.json && i.json.data)
    .filter((d) => typeof d === 'string' && d !== seite1);

  const alleSeiten = [seite1, ...weitere];
  const gefunden = [];
  const gesehen = new Set();
  for (const html of alleSeiten) {
    for (const f of filmeAusSeite(html)) {
      if (gesehen.has(f.lid)) continue;   // Seitenwechsel kann doppeln
      gesehen.add(f.lid);
      gefunden.push(f);
    }
  }

  const bestand = $('Bestand holen').all().map((i) => i.json).filter((r) => r && r.letterboxd_uri);
  const heute = DateTime.now().setZone('Europe/Berlin').toISODate();

  const plan = abgleich(gefunden, bestand, heute);
  console.log(`Watchlist: ${gefunden.length} Filme auf ${alleSeiten.length} Seiten · ` +
              `${plan.filter((p) => p.aktion === 'neu').length} neu · ` +
              `${plan.filter((p) => p.aktion === 'entfernt').length} entfernt`);
  return plan.map((json) => ({ json }));
}

if (typeof module !== 'undefined') {
  module.exports = { filmeAusSeite, seitenAnzahl, abgleich, entities, attr };
}
