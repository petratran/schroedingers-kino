/**
 * n8n Code-Node 1 — "Titel normalisieren"
 * Modus: Run Once for All Items
 *
 * Erwartet je Item:  { raw_title, cinema_id?, starts_at?, series? }
 * Liefert je Item:   + { norm, normAscii, queryTitle, sequel, stripped }
 *
 * Reine Funktion, kein Netz. Alles, was hier passiert, ist testbar —
 * siehe test-cascade.js im selben Ordner.
 */

// Fassungs- und Reihen-Zusaetze, die kein Teil des Filmtitels sind.
const VERSION_TOKENS = [
  'omu', 'omeu', 'ov', 'of', 'df', 'original', 'originalfassung',
  '3d', '2d', 'imax', 'dolby', 'atmos', '4k', '70mm', '35mm',
  'extended', 'extended cut', 'directors cut', 'director s cut', 'final cut',
  'restauriert', 'digital restauriert', 'remastered',
  'wa', 'wiederauffuehrung', 'wiederauffuhrung', 'preview', 'sneak',
  'ue18', 'ab18', 'open air', 'matinee', 'spaetvorstellung'
];

// Zahlwoerter, die eine Fortsetzung markieren.
const ORDINALS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, funf: 5, sechs: 6,
  sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12, zwolf: 12,
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12
};

const ARTICLES = /\b(der|die|das|den|dem|des|the|a|an|le|la|les|el|los|il|lo|un|une)\b/g;

/**
 * Reihennamen, die Kinos dem Titel voranstellen. Bewusst eine Liste und keine
 * allgemeine Regel "alles vor dem Doppelpunkt": sonst verlöre "Mission:
 * Impossible" seinen halben Titel und "Dune: Part Three" seine Teil-Nummer.
 */
const REIHEN = [
  // Schreibweisen derselben Reihe, wie sie in den Quellen vorkommen —
  // am 21.09.2026 bei den Innenstadtkinos abgelesen.
  'weird wednesday special', 'w. wednesday special', 'weird wednesday',
  'w. wednesday', 'ww',
  // Am 21.09.2026 von Petra aus dem Programm der Innenstadtkinos bestaetigt:
  // Reihenname vorn, Filmtitel dahinter, ohne Trennzeichen.
  'cinelounge', 'himmelsstreifen', 'kinotour & preview', 'kinotour',
  // Am 21.09.2026 von Petra aus dem laufenden Programm bestaetigt: Reihe
  // vorn, Filmtitel dahinter — bei den Innenstadtkinos ohne Trennzeichen.
  'cinelounge', 'himmelsstreifen', 'kinotour & preview', 'kinotour',
  'arthaus sneak', 'sneak preview', 'horror classics',
  'kitkatclub', 'met opera', 'the metropolitan opera', 'minikino',
  'disney channel mitmachkino', 'ladies night', 'schulkino', 'open air',
  'filmclub', 'klassiker am sonntag', 'preview'
];

/** "Weird Wednesday: Drive" -> { title: "Drive", reihe: "Weird Wednesday" } */
function stripReihe(title) {
  const t = title.trim();

  // Variante 1: "Reihe: Titel" — der Doppelpunkt trennt sauber.
  const m = t.match(/^([^:]{3,40}):\s*(.+)$/);
  if (m) {
    const kopf = m[1].toLowerCase().replace(/\s+/g, ' ').trim();
    if (REIHEN.find((r) => kopf === r || kopf.startsWith(r))) {
      return { title: m[2].trim(), reihe: m[1].trim() };
    }
  }

  // Variante 2: "Reihe Titel" ohne Trennzeichen. So schreiben es die
  // Innenstadtkinos: "Weird Wednesday TAXI DRIVER (1976)". Abgeschnitten wird
  // nur ein Name aus REIHEN — eine allgemeine Regel "alles vor dem ersten
  // Grossbuchstabenblock" wuerde halbe Filmtitel fressen.
  // Das Leerzeichen hinter dem Reihennamen ist Bedingung: sonst verlöre
  // "WW84" seine ersten beiden Zeichen an die Reihe "WW".
  const flach = t.toLowerCase().replace(/\s+/g, ' ');
  for (const r of [...REIHEN].sort((a, b) => b.length - a.length)) {
    if (!flach.startsWith(r + ' ')) continue;
    const rest = t.slice(r.length).replace(/^[\s:\u2013\u2014-]+/, '').trim();
    if (rest.length >= 2) return { title: rest, reihe: t.slice(0, r.length).trim() };
  }

  return { title: t, reihe: null };
}

/**
 * Veranstalter am Titelende: "ARCADIA Kalimera e.V." — der Film heisst
 * *Arcadia*, Kalimera e.V. zeigt ihn. Ein eingetragener Verein ist nie Teil
 * eines Filmtitels, deshalb ist das die seltene Stelle, an der eine
 * allgemeine Regel gefahrlos ist. Der Rest muss trotzdem uebrig bleiben:
 * Ein Aushang, der nur aus dem Vereinsnamen besteht, bleibt unveraendert.
 */
const VEREIN = /\s+([^\s].{0,40}?)\s+e\.?\s?V\.?\s*$/i;

function stripVeranstalter(title) {
  const t = String(title).trim();
  const m = t.match(VEREIN);
  if (!m) return { title: t, veranstalter: null };
  const rest = t.slice(0, m.index).trim();
  if (rest.length < 2) return { title: t, veranstalter: null };
  return { title: rest, veranstalter: m[0].trim() };
}

/** Umlaute ausschreiben (fruehstueck), danach Diakritika entfernen. */
function toAscii(s) {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'ae').replace(/Ö/g, 'oe').replace(/Ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** Diakritika direkt entfernen (fruhstuck) — die zweite Schreibvariante. */
function toPlain(s) {
  return s.replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function squash(s) {
  return s.toLowerCase()
    .replace(/&/g, ' und ')
    // \p{L} statt a-z: sonst verschwinden Hangul, Kana und Kyrillisch spurlos.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(ARTICLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fassungszusaetze entfernen. Gibt { clean, stripped[] } zurueck. */
function stripVersions(title) {
  let s = ' ' + squash(toAscii(title)) + ' ';
  const stripped = [];
  // "vol 41", "teil 41", "folge 3" am Ende
  s = s.replace(/\s(vol|volume|folge|nr)\s\d{1,3}\s*$/g, (m) => {
    stripped.push(m.trim()); return ' ';
  });
  for (const t of VERSION_TOKENS) {
    const re = new RegExp('\\s' + t.replace(/ /g, '\\s') + '\\s', 'g');
    if (re.test(s)) { stripped.push(t); s = s.replace(re, ' '); }
  }
  return { clean: s.replace(/\s+/g, ' ').trim(), stripped };
}

/**
 * Fortsetzungs-Index eines Titels.
 * "Practical Magic 2" -> 2, "Dune: Part Three" -> 3, "Practical Magic" -> 1.
 * Nur 1..12 gelten als Fortsetzung — "Blade Runner 2049" und "Apollo 13"
 * sind Jahreszahlen bzw. Namen, keine Teile.
 */
function sequelIndex(cleanTitle) {
  const words = cleanTitle.split(' ').filter(Boolean);
  if (!words.length) return 1;
  const last = words[words.length - 1];
  const prev = words[words.length - 2];

  if (/^\d{1,2}$/.test(last)) {
    const n = parseInt(last, 10);
    if (n >= 2 && n <= 12) return n;
  }
  if ((prev === 'part' || prev === 'teil' || prev === 'chapter' ||
       prev === 'kapitel' || prev === 'episode') && ORDINALS[last]) {
    return ORDINALS[last];
  }
  if (ORDINALS[last] && ORDINALS[last] >= 2 && ORDINALS[last] <= 12 &&
      words.length > 1 && !/^(i|v|x)$/.test(last)) {
    return ORDINALS[last];
  }
  return 1;
}

/** Titel ohne Fortsetzungsmarker — Basis fuer den Vorgaenger-Vergleich. */
function sequelBase(cleanTitle) {
  return cleanTitle
    .replace(/\s(part|teil|chapter|kapitel|episode)\s\w+$/,'')
    .replace(/\s\d{1,2}$/, '')
    .trim();
}

/**
 * Eine Jahreszahl am Titelende ist eine Angabe zum Film, kein Teil seines
 * Namens: "TAXI DRIVER (1976)". Sie bleibt als `jahr` erhalten und wandert
 * aus dem Vergleichstitel heraus — sonst sinkt die Aehnlichkeit gegen den
 * TMDb-Titel "Taxi Driver" auf 0,42, und der Film bleibt unaufgeloest.
 * Fuer Repertoire-Vorstellungen ist das Jahr das einzige Unterscheidungs-
 * merkmal, das die Quelle mitliefert.
 */
function splitJahr(title) {
  const m = String(title).match(/\s*\((19|20)\d{2}\)\s*$/);
  if (!m) return { title: String(title).trim(), jahr: null };
  return {
    title: String(title).slice(0, m.index).trim(),
    jahr: Number(m[0].replace(/\D/g, ''))
  };
}

/**
 * Jubilaeumsklammern: "Shrek - Der tollkuehne Held (25 Jahre)".
 * Dasselbe Argument wie bei der Jahreszahl — eine Angabe zum Anlass der
 * Vorstellung, kein Teil des Namens. Ohne sie lief derselbe Film unter zwei
 * Eintraegen: kino-zeit schreibt den Zusatz, die Innenstadtkinos nicht, und
 * die eine Schreibweise blieb unaufgeloest.
 * Bewusst eine enge Liste: eine allgemeine Regel "letzte Klammer weg" wuerde
 * "Pieces of a Woman (2020)"-Faelle zwar auch treffen, aber ebenso Titel,
 * deren Klammer zum Namen gehoert ("Borat Subsequent Moviefilm (...)").
 */
const KLAMMER_ANLASS = /^(?:\d{1,3}\s*(?:\.|th|st|nd|rd)?\s*)?(?:jahre?|years?|jubilaeum|jubil\u00e4um|jubil\u00e4umsfassung|jubilaeumsfassung|anniversary)$/i;

/** Entfernt Jahres- und Jubilaeumsklammern am Titelende, auch mehrere. */
function splitKlammern(title) {
  let t = String(title).trim();
  let jahr = null;
  const klammern = [];
  for (let i = 0; i < 3; i++) {
    const m = t.match(/\s*\(([^()]{1,40})\)\s*$/);
    if (!m) break;
    const inhalt = m[1].trim();
    if (/^(19|20)\d{2}$/.test(inhalt)) {
      if (jahr === null) jahr = Number(inhalt);
    } else if (KLAMMER_ANLASS.test(inhalt)) {
      klammern.push(inhalt);
    } else {
      break;                       // gehoert zum Titel — stehen lassen
    }
    t = t.slice(0, m.index).trim();
  }
  return { title: t, jahr, klammern };
}

/**
 * Suchtitel fuer TMDb — bewusst NICHT der normalisierte Titel.
 *
 * `norm` ist fuer den Vergleich gebaut: Umlaute ausgeschrieben, Artikel und
 * Satzzeichen entfernt, alles klein. Das ist richtig, solange beide Seiten
 * gleich behandelt werden. Als Suchanfrage ist es falsch — die TMDb-Suche
 * bekommt dann "shrek tollkuehne held" statt "Shrek - Der tollkuehne Held"
 * und findet nichts.
 *
 * Entfernt werden hier nur zwei eindeutige Dinge: Klammern, die ausschliesslich
 * Fassungsangaben enthalten ("(OmU)", "[3D]"), und ein Fassungswort am Ende
 * ("... Extended"). Alles andere bleibt in Originalschreibweise stehen —
 * besonders "of", das in `stripVersions` fuer "Originalfassung" steht und in
 * einer Suchanfrage "Lord of the Rings" zerlegen wuerde.
 */
const SUCH_TOKENS = [
  'omu', 'omeu', 'ov', '3d', '2d', 'imax', 'dolby atmos', 'dolby', 'atmos',
  '4k', '70mm', '35mm', 'final cut', 'directors cut', 'extended cut',
  'extended', 'digital restauriert', 'restauriert', 'remastered',
  'wiederauffuehrung', 'preview', 'sneak', 'open air', 'matinee'
];

function suchTitel(title) {
  let s = String(title);

  // (a) Klammern, die nur eine Fassungsangabe enthalten
  s = s.replace(/[([]([^()[\]]{1,30})[)\]]/g, (ganz, inhalt) => {
    const flach = squash(toAscii(inhalt));
    return flach && SUCH_TOKENS.includes(flach) ? ' ' : ganz;
  });

  // (b) ein Fassungswort am Ende
  for (const t of [...SUCH_TOKENS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp('[\\s,:/\u2013\u2014-]+' + t.replace(/ /g, '\\s+') + '\\s*$', 'i');
    if (re.test(s)) { s = s.replace(re, ''); break; }
  }

  return s.replace(/\s+/g, ' ').replace(/[\s,:/\u2013\u2014-]+$/, '').trim();
}

function normalizeTitle(raw) {
  const ohneReihe = stripReihe(String(raw || ''));
  const ohneVerein = stripVeranstalter(ohneReihe.title);
  const ohneJahr = splitKlammern(ohneVerein.title);
  const { clean, stripped } = stripVersions(ohneJahr.title);
  const plain = squash(toPlain(ohneJahr.title));
  return {
    norm: clean,                       // fruehstueck-Variante, Zusaetze entfernt
    normAscii: squash(toAscii(ohneJahr.title)),
    normPlain: plain,                  // fruhstuck-Variante
    queryTitle: clean,                 // Vergleichstitel (historischer Name)
    searchTitle: suchTitel(ohneJahr.title) || ohneJahr.title,  // das geht an die TMDb-Suche
    jahr: ohneJahr.jahr,               // Jahresangabe aus dem Aushangtitel
    sequel: sequelIndex(clean),
    sequelBase: sequelBase(clean),
    reihe: ohneReihe.reihe,
    stripped: (ohneReihe.reihe ? stripped.concat('reihe:' + ohneReihe.reihe) : stripped)
      .concat(ohneJahr.klammern.map((k) => 'anlass:' + k))
      .concat(ohneVerein.veranstalter ? ['veranstalter:' + ohneVerein.veranstalter] : [])
  };
}

// ---- n8n-Glue ----------------------------------------------------------
if (typeof $input !== 'undefined') {
  return $input.all().map((item) => ({
    json: { ...item.json, ...normalizeTitle(item.json.raw_title) }
  }));
}

if (typeof module !== 'undefined') {
  module.exports = { normalizeTitle, splitJahr, splitKlammern, suchTitel, stripVeranstalter, sequelIndex, sequelBase, squash, toAscii, toPlain, stripVersions, stripReihe, REIHEN };
}
