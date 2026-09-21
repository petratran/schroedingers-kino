# -*- coding: utf-8 -*-
LOGO = open('/mnt/user-data/outputs/logo-path.txt').read().strip()

LINKS = [
  "https://fonts.googleapis.com/css2?family=Syne:wght@600;800"
  "&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400"
  "&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
  "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700"
  "&family=Inter:wght@300;400;500;600&display=swap",
  "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600"
  "&family=Archivo+Black&display=swap",
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap",
  "https://fonts.googleapis.com/css2?family=DM+Serif+Display"
  "&family=DM+Sans:wght@400;500;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&display=swap",
]
FONTLINKS = "\n".join('<link rel="stylesheet" href="%s">' % u for u in LINKS)

# Erste Familie je Variante, fuer die Ladekontrolle im Browser.
PROBE = {"jetzt":"Syne","fraunces":"Fraunces","archivo":"Archivo Black",
         "grotesk":"Space Grotesk","dmserif":"DM Serif Display",
         "bricolage":"Bricolage Grotesque"}

# id, Kurzname, Charakter, Display-Familie, Text-Familie, Display-Gewicht, Tracking, Notiz, Schwaeche
VAR = [
 ("jetzt", "Syne + IBM Plex Sans", "heute im Einsatz",
  "Syne, sans-serif", "'IBM Plex Sans', sans-serif", "800", "-.02em",
  "Der Ist-Zustand zum Vergleich. Syne ist breit und eigenwillig — das gibt dem Titel Charakter, "
  "macht lange deutsche Woerter wie „Vorstellungszeiten“ aber sperrig.",
  "Bei 38 px stark, bei 16 px in den Kinonamen wirkt die Breite gedrungen."),

 ("fraunces", "Fraunces + Inter", "Programmheft",
  "Fraunces, Georgia, serif", "Inter, system-ui, sans-serif", "700", "-.012em",
  "Eine warme Serife mit weichen Keilen — die Typografie gedruckter Kinoprogramme und "
  "Repertoire-Aushaenge. Passt zum Befund, dass dein Fenster zu grossen Teilen aus Klassikern "
  "und Sondervorstellungen besteht, nicht aus Blockbuster-Startterminen.",
  "Serifen brauchen Groesse: unter 15 px werden die Keile matschig, deshalb bleibt der Fliesstext "
  "bei Inter."),

 ("archivo", "Archivo Black + Archivo", "Plakat",
  "'Archivo Black', sans-serif", "Archivo, system-ui, sans-serif", "400", "-.025em",
  "Eine Grotesk mit Plakatgewicht. Der Titel liest sich wie eine Anschlagsaeule, der Rest bleibt "
  "eine ruhige, gut lesbare Textschrift derselben Familie — eine Familie, zwei Rollen.",
  "Archivo Black hat nur ein Gewicht. Fuer Zwischenstufen musst du auf Archivo 600 ausweichen, "
  "was den Sprung zwischen H1 und H2 weniger deutlich macht."),

 ("grotesk", "Space Grotesk + IBM Plex Sans", "Apparat",
  "'Space Grotesk', sans-serif", "'IBM Plex Sans', sans-serif", "700", "-.02em",
  "Die naechstliegende Alternative, wenn dich an Syne nur die Breite stoert: Space Grotesk "
  "behaelt die technische Note und die schraegen Schnitte, baut aber schmaler und laesst lange "
  "Woerter durch.",
  "Bleibt in derselben Familie von Ideen wie Syne — wenn dir der ganze Ton zu technisch ist, "
  "loest das dein Problem nicht."),

 ("dmserif", "DM Serif Display + DM Sans", "Filmmagazin",
  "'DM Serif Display', Georgia, serif", "'DM Sans', system-ui, sans-serif", "400", "-.005em",
  "Hoher Strichkontrast, schmale Serifen — der Ton von Filmkritik und Feuilleton. Das Paar ist "
  "aufeinander gezeichnet und braucht keine Abstimmung von dir.",
  "Nur ein Schnitt im Display, und der hohe Kontrast vertraegt kleine Groessen schlecht. Im "
  "Dunkelmodus wirken die duennen Haarstriche zusaetzlich zarter."),

 ("bricolage", "Bricolage Grotesque", "Gegenwart",
  "'Bricolage Grotesque', system-ui, sans-serif", "'Bricolage Grotesque', system-ui, sans-serif",
  "800", "-.02em",
  "Eine einzige variable Familie fuer alles, mit optischer Achse: gross wird sie eigenwillig, "
  "klein wird sie sachlich. Weniger Abstimmungsarbeit und ein sehr gegenwaertiger Ton.",
  "Eine Familie heisst auch: wenig Kontrast zwischen Titel und Text. Die Hierarchie muss "
  "ueber Groesse und Gewicht allein tragen."),
]

def frag(v):
    return f'''
<div class="demo" style="--fd:{v[3]};--ft:{v[4]};--dw:{v[5]};--dt:{v[6]}">
  <div class="mast">
    <div class="brandrow">
      <svg class="mark" viewBox="0 0 1000 756" aria-hidden="true"><path fill="currentColor" d="{LOGO}"/></svg>
      <div><h1>Schrödingers Kino</h1><p class="tag">Der Film läuft. Vielleicht. Bis du nachschaust.</p></div>
    </div>
    <div class="meta"><strong>Heute 18.09.</strong><br>Stuttgart · 9 Kinos<br>Watchlist <strong>savoy_truffle</strong> · 74 Titel</div>
  </div>
  <div class="metrics">
    <div class="metric hit"><span class="num">2</span><span class="lbl">Treffer</span></div>
    <div class="metric mubi"><span class="num">1</span><span class="lbl">MUBI-GO-Film</span></div>
    <div class="metric"><span class="num">114</span><span class="lbl">Vorstellungen</span></div>
    <div class="metric"><span class="num">43<small> Tage</small></span><span class="lbl">im Fenster</span></div>
  </div>
  <div class="bar"><span class="lead">Datum</span>
    <button class="chip" aria-pressed="false">Alle<span class="n">766</span></button>
    <button class="chip" aria-pressed="true">Heute 18.09.<span class="n">114</span></button>
    <button class="chip" aria-pressed="false">Sa 19.09.<span class="n">124</span></button></div>
  <div class="sec"><h2>Deine Treffer</h2><span class="note">Filme von deiner Watchlist, die heute laufen</span></div>
  <article class="card mubi">
    <div class="badges"><span class="badge b-mubi">MUBI GO</span><span class="badge b-watch">Watchlist</span></div>
    <h3>Gentle Monster</h3>
    <div class="where">Delphi Arthaus Kino · <strong>20:15</strong></div>
    <div class="why">Auf der Watchlist seit 2026-09-19. Aktueller MUBI-GO-Film — Ticket kostenlos.</div>
  </article>
  <div class="sec"><h2>Kinos &amp; Vorstellungszeiten</h2></div>
  <article class="kino">
    <div class="kinohead"><h3>atelier am bollwerk</h3><span class="addr">Stuttgart-Mitte</span></div>
    <ul class="films">
      <li class="film"><div class="title">Insidious: Out of the Further</div>
        <div class="times"><span class="time">18:30<span class="v">OmU</span></span><span class="time">20:40<span class="v">OV</span></span></div></li>
      <li class="film treffer"><div class="title">Her<span class="badge b-watch">Watchlist</span></div>
        <div class="times"><span class="time">20:15<span class="v">OmU</span></span></div></li>
    </ul>
  </article>
</div>'''

bloecke = '\n'.join(f'''
<section class="wahl" id="{v[0]}" data-probe="{PROBE[v[0]]}">
  <div class="kopf"><span class="rolle">{v[2]}</span><h2>{v[1]}</h2>
    <span class="fehlt" hidden>nicht geladen — du siehst eine Ersatzschrift</span></div>
  <p class="warum">{v[7]}</p>
  <p class="gegen"><span>Schwäche</span> {v[8]}</p>
  {frag(v)}
</section>''' for v in VAR)

html = f'''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Schriften für Schrödingers Kino</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{FONTLINKS}
<style>
:root{{
  --mubi:#001489; --mubi-ink:#fff; --mubi-line:#001489; --mubi-soft:#ecedfa;
  --bg:#f4f5f7; --surface:#fff; --surface-2:#eceef2;
  --ink:#16181f; --ink-2:#4d5261; --ink-3:#7a8091;
  --line:#dfe2e9; --line-strong:#c6cbd6;
  --accent:#FF8000; --accent-soft:#fff3e4; --accent-line:#ffc98a; --accent-ink:#b35c00;
  --lbxd-ink:#14181C; --ok:#1f7a5c;
  --radius:10px; --radius-sm:5px;
  --shadow:0 1px 2px rgba(22,24,31,.06), 0 8px 24px -16px rgba(22,24,31,.35);
  --mono:'IBM Plex Mono', ui-monospace, monospace;
  color-scheme:light;
}}
@media (prefers-color-scheme:dark){{ :root:not([data-theme="light"]){{
  --bg:#101218; --surface:#191c24; --surface-2:#212530;
  --ink:#edeff5; --ink-2:#a6acbc; --ink-3:#737a8c;
  --line:#2a2f3c; --line-strong:#3a4152;
  --accent-soft:#2a1b08; --accent-line:#6b4610; --accent-ink:#ff9a33;
  --mubi-line:#4f4de0; --mubi-soft:#171a38; --ok:#52c69d;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 8px 24px -16px rgba(0,0,0,.8);
  color-scheme:dark; }} }}
:root[data-theme="dark"]{{
  --bg:#101218; --surface:#191c24; --surface-2:#212530;
  --ink:#edeff5; --ink-2:#a6acbc; --ink-3:#737a8c;
  --line:#2a2f3c; --line-strong:#3a4152;
  --accent-soft:#2a1b08; --accent-line:#6b4610; --accent-ink:#ff9a33;
  --mubi-line:#4f4de0; --mubi-soft:#171a38; --ok:#52c69d;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 8px 24px -16px rgba(0,0,0,.8);
  color-scheme:dark; }}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);
  font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:15px;line-height:1.55;
  -webkit-font-smoothing:antialiased}}
.wrap{{max-width:1040px;margin:0 auto;padding:0 20px 80px}}
header.seite{{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;
  padding:44px 0 20px;border-bottom:2px solid var(--ink)}}
header.seite h1{{font-family:Syne,sans-serif;font-weight:800;letter-spacing:-.02em;
  font-size:clamp(26px,5vw,38px);margin:0;line-height:1}}
header.seite p{{margin:8px 0 0;color:var(--ink-3);font-size:14px;max-width:62ch}}
.theme{{margin-left:auto}}
.hinweis{{margin:22px 0 0;color:var(--ink-2);max-width:68ch}}
.sprung{{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0 0}}
.sprung a{{font-family:var(--mono);font-size:11.5px;letter-spacing:.04em;text-decoration:none;
  border:1px solid var(--line-strong);border-radius:999px;padding:5px 12px;color:var(--ink-2)}}
.sprung a:hover{{border-color:var(--ink-3);color:var(--ink)}}

.wahl{{margin-top:46px;padding-top:26px;border-top:1px solid var(--line)}}
.wahl:first-of-type{{border-top:0}}
.kopf{{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}}
.rolle{{font-family:var(--mono);font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;
  color:var(--ink-3);border:1px solid var(--line-strong);border-radius:999px;padding:3px 9px}}
.kopf h2{{font-family:Syne,sans-serif;font-weight:800;font-size:21px;letter-spacing:-.02em;margin:0}}
.warum{{margin:10px 0 0;color:var(--ink-2);max-width:70ch}}
.gegen{{margin:8px 0 0;color:var(--ink-3);font-size:13.5px;max-width:70ch}}
.fehlt{{font-family:var(--mono);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
  color:#fff;background:var(--accent-ink);border-radius:999px;padding:3px 9px}}
.gegen span{{font-family:var(--mono);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
  color:var(--accent-ink);margin-right:6px}}

/* ---- der Ausschnitt: alles ausser der Schrift bleibt gleich ---- */
.demo{{margin-top:18px;border:1px solid var(--line-strong);border-radius:var(--radius);
  background:var(--bg);padding:22px;font-family:var(--ft)}}
.demo .mast{{display:flex;flex-wrap:wrap;align-items:flex-end;gap:18px;
  padding-bottom:18px;border-bottom:2px solid var(--ink)}}
.brandrow{{display:flex;align-items:center;gap:13px;min-width:0}}
.mark{{height:46px;width:auto;flex:none;color:var(--ink)}}
.demo h1{{font-family:var(--fd);font-weight:var(--dw);letter-spacing:var(--dt);
  font-size:clamp(23px,4.4vw,33px);line-height:1.02;margin:0}}
.tag{{margin:6px 0 0;font-size:13px;font-style:italic;color:var(--ink-3)}}
.meta{{margin-left:auto;text-align:right;font-family:var(--mono);font-size:12px;
  color:var(--ink-2);line-height:1.7}}
.meta strong{{color:var(--ink);font-weight:600}}
.metrics{{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:var(--radius);
  overflow:hidden;margin-top:20px}}
.metric{{background:var(--surface);padding:12px 14px}}
.metric .num{{font-family:var(--fd);font-weight:var(--dw);font-size:25px;line-height:1.1;
  font-variant-numeric:tabular-nums;display:block;letter-spacing:var(--dt)}}
.metric .num small{{font-size:16px;color:var(--ink-3)}}
.metric .lbl{{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--ink-3);margin-top:3px;display:block}}
.metric.hit .num{{color:var(--accent-ink)}}
.metric.mubi .num{{color:var(--mubi)}}
:root[data-theme="dark"] .metric.mubi .num{{color:var(--mubi-line)}}
@media (prefers-color-scheme:dark){{ :root:not([data-theme="light"]) .metric.mubi .num{{color:var(--mubi-line)}} }}
.bar{{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:18px}}
.lead{{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);margin-right:4px}}
.chip{{font:inherit;font-size:13px;padding:5px 13px;border-radius:999px;
  border:1px solid var(--line-strong);background:var(--surface);color:var(--ink-2)}}
.chip[aria-pressed="true"]{{background:var(--ink);border-color:var(--ink);color:var(--bg)}}
.chip .n{{font-family:var(--mono);font-size:11px;opacity:.7;margin-left:5px}}
.sec{{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:26px 0 12px}}
.sec h2{{font-family:var(--fd);font-weight:var(--dw);font-size:19px;letter-spacing:var(--dt);margin:0}}
.note{{font-size:13px;color:var(--ink-3)}}
.card{{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:var(--radius);padding:15px 17px;box-shadow:var(--shadow);max-width:430px}}
.card.mubi{{border-left-color:var(--mubi-line)}}
.card h3{{font-family:var(--fd);font-weight:var(--dw);font-size:17px;letter-spacing:var(--dt);margin:9px 0 0}}
.where{{font-size:13px;color:var(--ink-2);margin-top:8px}}
.why{{font-size:12.5px;color:var(--ink-3);border-top:1px solid var(--line);padding-top:9px;margin-top:10px}}
.badges{{display:flex;flex-wrap:wrap;gap:6px}}
.badge{{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.05em;
  text-transform:uppercase;padding:2.5px 7px;border-radius:var(--radius-sm);
  border:1px solid transparent;white-space:nowrap}}
.b-watch{{background:#FF8000;color:var(--lbxd-ink);border-color:#FF8000;border-radius:2px}}
.b-mubi{{background:var(--mubi);color:var(--mubi-ink);border-color:var(--mubi-line);border-radius:0}}
:root[data-theme="dark"] .b-mubi{{background:#1b1aa8}}
.kino{{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}}
.kinohead{{display:flex;align-items:baseline;gap:10px;padding:12px 16px;
  background:var(--surface-2);border-bottom:1px solid var(--line)}}
.kinohead h3{{font-family:var(--fd);font-weight:var(--dw);font-size:16px;letter-spacing:var(--dt);margin:0}}
.addr{{font-size:12.5px;color:var(--ink-3)}}
.films{{list-style:none;margin:0;padding:0}}
.film{{display:flex;gap:16px;align-items:center;justify-content:space-between;
  padding:11px 16px;border-bottom:1px solid var(--line)}}
.film:last-child{{border-bottom:0}}
.film.treffer{{background:var(--accent-soft)}}
.film .title{{font-weight:600;font-size:15px;display:flex;flex-wrap:wrap;align-items:center;gap:7px}}
.times{{display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end}}
.time{{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:13px;font-weight:500;
  padding:3px 8px;border-radius:var(--radius-sm);background:var(--surface-2);
  border:1px solid var(--line);color:var(--ink);white-space:nowrap}}
.film.treffer .time{{background:var(--surface);border-color:var(--accent-line)}}
.time .v{{font-size:10px;color:var(--ink-3);margin-left:4px;letter-spacing:.04em}}
footer{{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);
  font-size:13px;color:var(--ink-3);max-width:70ch}}
.themebtn{{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:13px;
  padding:5px 13px;border-radius:999px;border:1px solid var(--line-strong);
  background:var(--surface);color:var(--ink-2);cursor:pointer}}
</style>
</head>
<body>
<div class="wrap">
<header class="seite">
  <div>
    <h1>Fünf Schriften zur Wahl</h1>
    <p>Jede Paarung an einem echten Ausschnitt des Dashboards, nicht an Blindtext — Kopfzeile,
    Kennzahlen, Trefferkarte und Spielplanzeile. Farben, Abstände und Rahmen sind überall
    identisch; nur Titel- und Textschrift wechseln.</p>
  </div>
  <button class="themebtn" id="theme" type="button">Auto</button>
</header>

<p class="hinweis">Die Ziffern in Zeiten, Daten und Zählern bleiben in allen Varianten
IBM Plex Mono. Das ist Absicht: Uhrzeiten müssen untereinander bündig stehen, und eine
tabellarische Mono trägt das verlässlicher als die Ziffern einer Textschrift. Damit
entscheidest du hier nur über Titel und Fließtext.</p>

<div class="sprung">{''.join(f'<a href="#{v[0]}">{v[1]}</a>' for v in VAR)}</div>

{bloecke}

<footer>Alle sechs liegen bei Google Fonts und laden über dieselbe Verbindung, die das Dashboard
schon nutzt — ein Wechsel kostet eine Zeile im Stylesheet und drei Variablen. Sag mir die Nummer
oder den Namen, dann baue ich sie ein und prüfe die langen deutschen Wörter gegen die
Umbruchkanten.</footer>
</div>
<script>
(function () {{
  var S = ['auto','light','dark'], N = {{auto:'Auto', light:'Hell', dark:'Dunkel'}};
  var t = 'auto';
  try {{ var v = localStorage.getItem('sk-theme'); if (S.indexOf(v) >= 0) t = v; }} catch (e) {{}}
  var b = document.getElementById('theme');
  function an() {{
    var r = document.documentElement;
    if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
    b.textContent = N[t];
    try {{ if (t === 'auto') localStorage.removeItem('sk-theme'); else localStorage.setItem('sk-theme', t); }} catch (e) {{}}
  }}
  an();
  b.addEventListener('click', function () {{ t = S[(S.indexOf(t) + 1) % S.length]; an(); }});

  // Ladekontrolle: eine Ersatzschrift sieht auf den ersten Blick wie eine
  // Entscheidung aus. Lieber sagen, dass sie fehlt.
  // document.fonts.check taugt dafuer nicht — es meldet auch fuer erfundene
  // Familien true, weil der Fallback als Treffer zaehlt. Also messen:
  // gleiche Breite wie die nackte Ersatzschrift heisst nicht geladen.
  function wirklichDa(fam) {{
    var c = document.createElement('canvas').getContext('2d');
    var probe = 'Hamburgefonstiv Vorstellungszeiten 0123456789';
    c.font = '700 32px monospace'; var ohne = c.measureText(probe).width;
    c.font = '700 32px "' + fam + '", monospace'; var mit = c.measureText(probe).width;
    return Math.abs(mit - ohne) > 0.5;
  }}
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {{
    document.querySelectorAll('.wahl[data-probe]').forEach(function (w) {{
      var fam = w.getAttribute('data-probe');
      var da = wirklichDa(fam);
      var m = w.querySelector('.fehlt');
      if (m && !da) m.hidden = false;
    }});
  }});
}})();
</script>
</body>
</html>'''

open('/home/claude/fonts.html','w',encoding='utf-8').write(html)
print('fonts.html', round(len(html)/1024,1), 'KB ·', len(VAR), 'Varianten')
