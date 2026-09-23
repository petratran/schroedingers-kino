# Schrödingers Kino

Zeigt, welche Filme von einer Letterboxd-Watchlist gerade in Stuttgarter Kinos
laufen, und markiert, welche davon über MUBI GO einlösbar sind.

Abschlussprojekt · Petra Tran · Stand 18.09.2026

---

## Stand

| | |
| --- | --- |
| Datenquelle | kino-zeit.de, Stadtseite Stuttgart, ein Abruf je Tag |
| Abdeckung | 9 Kinos, 43 Spieltage, 766 Vorstellungen, bis 26.12.2026 |
| Watchlist | savoy_truffle, 74 Titel, angereichert um Originaltitel und Laufzeit |
| Treffer | 4 (Bad Apples, Gentle Monster, Her, Dune: Part Three) |
| Matching | Stufe B produktiv · Stufe C (TMDb + LLM) vorbereitet, noch nicht verdrahtet |
| Dashboard | fertig, Design „Papier", liest `data/today.json` |
| Betrieb | n8n, Workflows noch aufzusetzen |

## Was wo liegt

```
dashboard/     index.html      das Dashboard, lädt data/today.json
               artifact.html   dieselbe Seite mit eingebetteten Daten
pipeline/      import-capture.js   Mitschnitt → data/showings-raw.json
               build-today.js      Programm + Watchlist → data/today.json
               build-artifact.js   erzeugt artifact.html
n8n/           01-normalize.js       Titel normalisieren, Fortsetzungen erkennen
               02-score-decide.js    TMDb-Kandidaten bewerten und entscheiden
               03-merge-llm.js       LLM-Urteil verrechnen und absichern
               04-parse-kinozeit.js  Kinoprogramm parsen (beide Seitenlayouts)
               05-watchlist-match.js Direktabgleich über Titel, Laufzeit, Jahr
               README.md             Verdrahtung, Seitenstrukturen, Befunde
               checkliste.md         Klickliste für die erste n8n-Sitzung
               tmdb-setup.md         TMDb-Zugang einrichten
               llm-prompt.md         Prompt und JSON-Schema für den LLM-Node
eval/          goldstandard.csv      93 Aushangtitel, von Hand gelabelt
               evaluate.js           misst Precision, Recall, F1 je Stufe
sql/           schema.sql            Supabase-Datenmodell, einspielfertig
export/        watchlist.csv         Letterboxd-Datenexport
data/          capture-*.json        Rohmitschnitte der Kinoseiten
               watchlist-angereichert.json  74 Titel mit Originaltitel und Laufzeit
               today.json            was das Dashboard liest
```

## Alles prüfen

```
node n8n/test-parser.js            19 Tests, Kinoprogramm-Parser
node n8n/test-cascade.js           13 Tests, TMDb-Kaskade
node n8n/test-watchlist-match.js    9 Tests, Direktabgleich
node eval/evaluate.js              Messung gegen den Goldstandard
```

Alle laufen ohne Netz und ohne Zugangsdaten.

## Neu aufbauen

```
node pipeline/import-capture.js data/capture-stuttgart-100tage.json
node pipeline/build-today.js
node pipeline/build-artifact.js
```

## Das Messergebnis

93 Aushangtitel aus 43 Spieltagen, von Hand gelabelt, 5 davon auf der Watchlist.

| Stufe | Verfahren | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| A | Teilstring-Vergleich | 67 % | 80 % | 73 % |
| B | normalisierte Titel, Bigramme, Fortsetzungssperre | 100 % | 80 % | 89 % |
| C | + TMDb-ID und LLM-Schiedsspruch | offen | offen | offen |

Stufe A scheitert an *Her*: die Zeichenfolge steckt in „Der **Her**r der Ringe"
und in „Insidious: Out of the Furt**her**". Stufe B räumt beide weg. Der eine
verbleibende Fehler ist in beiden Stufen derselbe — *Vaterland* wird nicht als
*Fatherland* erkannt, die Titelähnlichkeit liegt bei 0,706.

Genau dafür ist Stufe C da. Der Beleg steht: Der Film ist TMDb 1437696,
Originaltitel *Ojczyzna* (polnisch für Vaterland), Letterboxd führt ihn als
*Fatherland (2026)*. Drei Sprachen, ein Film, und kein TMDb-Feld enthält zwei
davon gleichzeitig — verglichen werden dürfen deshalb nur IDs, nie Titel.

## Bekannte Grenzen

kino-zeit meldet nicht alles. Für den 4.11.2026 liegen dort keine Daten, obwohl
innenstadtkinos.de an dem Tag spielt. Vollständigkeit gäbe es nur näher an der
Quelle: ein eigener Adapter je Betreibergruppe, oder das Ticketing-Backend —
letzteres untersagt seine robots.txt, dafür bräuchte es eine Anfrage bei
Kinoheld.

Das Zeitfenster ist löchrig, nicht kurz: dichtes Programm für sechs Tage,
danach einzelne Vorverkaufstermine bis Weihnachten. Der tägliche Lauf sollte
deshalb alle Tage einzeln abfragen und nicht beim ersten leeren aufhören.

## Marke

Das Logo liegt als einzelner SVG-Pfad in `design/logo-mark.svg` (viewBox `0 0 1000 756`,
`fill="currentColor"`). Der reine Pfad steht zusaetzlich in `design/logo-path.txt`, damit er sich
ohne Parsing in andere Dateien einsetzen laesst. Im Dashboard wird er an zwei Stellen verwendet:
in der Konstante `LOGO` der Kopfzeile und als Favicon-Data-URI im `<head>`, dort mit einer
eigenen `prefers-color-scheme`-Regel im SVG.

`design/logos-schroedinger.html` zeigt die fuenf zuvor entworfenen Alternativen.
`dashboard/index-vorlogo.bak` ist der Stand vor dem Einbau.

## Bekannte Lücke der Quelle

kino-zeit führt die Sonderreihen der Innenstadtkinos nicht. Zweimal belegt:
*Drive* am 04.11.2026 und *Taxi Driver* am 21.10.2026, beide im EM, beide in der
Reihe „Weird Wednesday", beide auf der Watchlist. Für den 21.10. meldet die
Stadtseite nur die beiden CinemaxX-Häuser, das EM taucht gar nicht auf — am
19.09.2026 direkt gegen die Live-Seite geprüft, es ist also keine Frage des
Abzugsalters. Damit ist die Lücke systematisch, nicht zufällig.

Bis ein Adapter für innenstadtkinos.de läuft, kommen solche Termine aus
`data/nachtraege.json`: eine Handliste, in der jeder Eintrag seine Quell-URL und
sein Prüfdatum trägt. `build-today.js` spielt sie vor dem Abgleich ein, sie
durchlaufen dieselbe Matching-Kaskade wie alles andere, und im Dashboard sind
ihre Zeitchips gestrichelt. Holt die Quelle einen Termin nach, fällt der
Nachtrag automatisch weg — gleiche Kino-ID, gleiches Datum, gleiche Zeit,
gleicher Titel gilt als Dublette.

### Der Adapter läuft (21.09.2026)

`n8n/09-innenstadtkinos.js`, dritter Abschnitt von Workflow 2. Die Sitemap
unter `/program/sitemap.xml` liefert 58 deutsche Programmseiten, jede ein Film
mit allen seinen Terminen über Gloria, EM und Cinema hinweg. Erster Lauf:
**253 Vorstellungen**.

Die Seiten tragen JSON-LD; die 900 KB React-Markup daneben muss niemand
anfassen. Zwei Dinge musste der Parser trotzdem lernen:

**Der Saal steht nicht im JSON-LD.** `location` zeigt auf „Innenstadtkinos" als
Ganzes. Welches Haus gemeint ist, verrät erst der Ticketlink:
`kinoheld.de/Kino-Stuttgart/EM-Kino%20Stuttgart?...`. Die Zuordnung läuft
deshalb über das Pfadsegment hinter `/Kino-.../`.

**Sonderveranstaltungen sind kein `Movie`.** Das reguläre Programm kommt als
`Movie` mit `ScreeningEvent`-Liste — und im `sameAs` des Films steht die
TMDb-Adresse. Diese Titel sind damit an der Quelle aufgelöst und gehen gar
nicht erst durch die Kaskade aus Workflow 3; sie stehen sofort als `sicher` in
`title_alias` mit `resolved_by = tmdb`. Dieselbe Idee wie die TMDb-Kennung auf
der Letterboxd-Seite in Workflow 1: Wer die ID hat, vergleicht keine Titel.

Die Reihe „Weird Wednesday" dagegen ist aus Sicht des Kinosystems kein Film,
sondern ein blankes `Event`: kein `Movie`-Block, kein `sameAs`, keine Kennung,
der Titel nur als `"Weird Wednesday DRIVE (2011) - "` im Event selbst.
Ausgerechnet die Termine, die sonst nirgends auftauchen, sind auch hier am
schlechtesten ausgezeichnet — und landen als einzige dieser Quelle wieder im
Titelvergleich. Dass `weird wednesday` längst in der `REIHEN`-Liste von
`01-normalize.js` steht, zahlt sich dabei aus.

**Was der erste Lauf gefunden hat**, über die zwei von Hand belegten Fälle
hinaus:

| Termin | Film | Kino |
| --- | --- | --- |
| 07.10.2026 | Weird Wednesday THE KILLER (1989) | EM |
| 21.10.2026 | Weird Wednesday TAXI DRIVER (1976) | EM |
| 04.11.2026 | Weird Wednesday DRIVE (2011) | EM |
| 20.01.2027 | Weird Wednesday SIN CITY (2005) | EM |

Zwei davon waren vorher unbekannt. *Sin City* liegt vier Monate voraus — über
ein rollendes Abruffenster wäre er nie gefunden worden, egal wie breit.

Für diese Quelle gilt deshalb **kein 21-Tage-Fenster**: Die weit vorn
liegenden Sondertermine sind ihr ganzer Zweck. Der Datumsfilter im Dashboard
fasst alles jenseits der laufenden Woche ohnehin unter „ab …" zusammen.

`data/nachtraege.json` ist damit überholt, bleibt aber als Beleg dafür stehen,
wie die Lücke vor dem Adapter überbrückt wurde.

## Region statt Stadt

Das Dashboard deckt die **Region Stuttgart** ab: Stuttgart, Esslingen, Ludwigsburg
und Leonberg. `data/kinos.json` ist die einzige Quelle der Kino-Stammdaten —
Gruppen, Knotennummern, Ort, MUBI-Partnerstatus und der Abrufzustand. Sowohl
`import-capture.js` als auch `build-today.js` lesen daraus, damit Abruf und
Aufbereitung nicht auseinanderlaufen.

**Leonberg zeigt nur IMAX**, und zwar ohne Sonderlogik: kino-zeit führt den
IMAX-Saal als eigenes Kino (Knoten 53864). Aufgenommen ist nur dieser; der
reguläre Traumpalast Leonberg (Knoten 3321) steht unter `ignorieren` mit
Begründung. Ein Formatfilter wäre hier falsch gewesen — die Ortsseite Leonberg
vergibt überhaupt keine Formatkürzel, ein Filter auf „IMAX" hätte also alles
verworfen.

**Sieben Häuser sind noch nicht abgerufen** (Stand 20.09.2026). Sie stehen
trotzdem im Dashboard, mit gelbem Punkt und dem Hinweis „Abruf offen", und die
Kopfzeile sagt „9 von 16 Kinos". Ein stillschweigend fehlendes Kino wäre
schlimmer als ein leeres: Man würde die Region für vollständig halten.

Der Abruf gehört nach n8n. Zu holen sind die Ortsseiten
`kino-zeit.de/kinoprogramm/ort/<Ort>/tag/TT-MM-JJJJ` für Esslingen,
Ludwigsburg und Leonberg über dasselbe Datumsfenster wie Stuttgart; der Parser
`n8n/04-parse-kinozeit.js` verarbeitet sie unverändert. Aus dieser Umgebung geht
das nicht — die Ausgangs-Policy beantwortet Verbindungen zu kino-zeit.de mit 403,
nur der geprüfte Abrufweg kommt durch, und der liefert Zusammenfassungen statt
Rohdaten. Daraus einen Mitschnitt zu bauen wäre für ein benotetes Projekt der
falsche Weg.

## Das Datum kommt von der Uhr

Das Dashboard hat bis zum 20.09.2026 den ersten Spieltag der Daten als „Heute"
beschriftet. Bei einem zwei Tage alten Abzug stand deshalb „Heute 18.09." über
Vorstellungen, die längst gelaufen waren. Jetzt vergleicht `dashboard/index.html`
gegen das echte Datum im Browser: Vergangenes fällt beim Rendern raus, „Heute"
wird nur vergeben, wenn heute wirklich gespielt wird, und die Startansicht
öffnet auf dem nächsten Spieltag.

Gefiltert wird bewusst **beim Rendern, nicht beim Bauen**. Die Datei altert
zwischen zwei Läufen weiter, die Uhr im Browser nicht — ein einmal gebautes
`today.json` bliebe sonst wieder falsch, sobald es einen Tag liegt. Ist der
Abzug älter als einen Tag, zeigt die Kopfzeile das als gelbe Marke an. Sind
sämtliche Spieltage vorbei, wird nichts weggefiltert: Dann ist ein sichtbar
veraltetes Programm ehrlicher als eine leere Seite.

## Weitere Eingriffe am Dashboard (20.09.2026)

Die Kennzahlenkacheln sind einer Aussage gewichen — wie viele Filme der
Watchlist laufen — mit den übrigen Zahlen als ruhiger Zeile darunter. Die
Datums-Chips tragen einen Punkt, wenn an dem Tag etwas von der Liste läuft.
Die Kino-Kopfzeile bleibt beim Scrollen stehen (`position:sticky`; dafür musste
`.cinema` von `overflow:hidden` auf `overflow:clip` wechseln, sonst hätte der
Container das Kleben verhindert). Zeiten von Filmen ohne Treffer haben keine
Fläche mehr. Und unter 620 px klappen Kino-, Filter- und Legendenzeile hinter
einen Schalter — die erste Trefferkarte rückt dadurch von 968 px auf 796 px.

## Ausbau am 20.09.2026, zweite Runde

**Zwei falsche Aussagen entfernt.** Über der Kinoliste stand „Zeiten führen
direkt zum Ticket" — von 768 Vorstellungen haben aber nur zwei eine
Buchungsadresse, nämlich die beiden Nachträge; kino-zeit liefert keine. Der Satz
erscheint jetzt nur noch, wenn im aktuellen Ausschnitt tatsächlich etwas
verlinkt ist, und verlinkte Zeiten tragen ein kleines ↗. Zweitens wurde bisher
nur das Datum gegen die Uhr geprüft, nicht die Uhrzeit: Um 20 Uhr stand die
13-Uhr-Vorstellung noch als Angebot da. Vergangene Termine des heutigen Tages
sind jetzt durchgestrichen und zählen nicht mehr in den Kacheln mit — sichtbar
bleiben sie, sonst leert sich die Liste im Lauf des Abends und man weiß nicht,
ob nichts läuft oder alles vorbei ist.

**Vorhandene Daten genutzt.** `build-today.js` verbindet die Watchlist jetzt
über die Letterboxd-Kennung aus `boxd.it/<lid>` mit
`data/watchlist-angereichert.json`. Die Trefferkarten zeigen dadurch Laufzeit,
Regie und Jahr, und der Filmtitel verlinkt auf Letterboxd.

**Sprachfassungen getrennt.** Aus „Nur OmU / OV" wurden zwei Filter. OmU heißt
mit Untertiteln, OV ohne — für einen fremdsprachigen Film ein erheblicher
Unterschied. Der Filter schränkt auch die angezeigten Zeiten ein, nicht nur die
Filmauswahl.

**Zustand in der Adresse.** Datum, Kinoauswahl, Filter und gewählter Film stehen
im Hash, `#tag=alle&filter=watchlist&kinos=arthaus`. Damit lässt sich eine
Ansicht als Lesezeichen sichern und verschicken; sie überlebt das Neuladen.

**Barrierefreiheit.** `<main>`, eine Sprungmarke zum Programm und ein
`aria-live`-Bereich, der nach jedem Filterwechsel meldet, wie viele Filme in wie
vielen Kinos übrig sind. Kacheln und Trefferkarten sind mit der Tastatur
bedienbar.

**Browsertests.** `dashboard/test-dashboard.js` prüft 22 Fälle gegen die
gebaute `artifact.html` — Heute-Logik, durchgestrichene Vergangenheit,
Ticketversprechen, Kachelfilter, Sprachfilter, Adresse, Barrierefreiheit,
Leerzustand und die schmale Ansicht. Voraussetzung ist Playwright:

```
npm i -D playwright && npx playwright install chromium
node pipeline/build-artifact.js && node dashboard/test-dashboard.js
```

Die Zähler sind bewusst nicht festgenagelt — die Daten ändern sich täglich, die
Regeln nicht.
