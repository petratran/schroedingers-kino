# Nachtrag 22.09.2026 — was der Blick aufs eigene Dashboard ergab

Die folgenden fünf Abschnitte gehören ans Ende von `n8n/README.md`. Sie sind
an einem einzigen Nachmittag entstanden, ausgelöst von einer beiläufigen
Beobachtung: Im Dashboard steht „verlinkte Zeiten führen zum Ticket", aber
nicht jede Zeit führt zu einem.

---

## Drei Quellen, drei Qualitäten

Die Pipeline liest aus drei Quellen, und bis zum 22.09. galten sie
stillschweigend als gleichwertig. Sie sind es nicht:

| Quelle | Vorstellungen | mit Ticketlink |
| --- | --- | --- |
| Traumpalast (Kinowebsite) | 22 | 22 · 100 % |
| Innenstadtkinos (kinoheld) | 258 | 258 · 100 % |
| kino-zeit.de (Aggregator) | 269 | 95 · 35 % |

Die beiden Quellen, die direkt vom Kino beziehungsweise vom Ticketsystem
lesen, sind lückenlos. Der Aggregator liefert bei zwei von drei Vorstellungen
keinen Link.

Innerhalb von kino-zeit ist die Lücke nicht zufällig verteilt, sondern nach
Haus sortiert. Neun der fünfzehn erfassten Kinos haben **null** Links —
CinemaxX (beide Häuser, 106 Vorstellungen), Metropol, Corso, Central,
Caligari, Luna, Union und die Innenstadtkinos. Vier haben fast lückenlos
welche: Kommunales Kino Esslingen 51 von 52, atelier am bollwerk 27 von 29,
Delphi 16 von 24. Eine Lücke pro Vorstellung sähe anders aus; das ist eine
Eigenschaft des Kinos, nicht der einzelnen Aufführung.

**Bevor diese Zahl hier stehen durfte, musste eine andere Erklärung
ausgeschlossen werden.** Der Parser liest den Ticketlink mit

```js
/(?:<a href="(\/booking\/[^"]*)"[^>]*>)?\s*<span class="startzeit"[^>]*>/
```

und erkennt damit **nur** Links, die mit `/booking/` beginnen. Würde kino-zeit
bei CinemaxX direkt nach außen verlinken, griffe die Klammer nicht, die
Uhrzeit würde trotzdem gelesen, und `booking_url` bliebe leer — ohne Fehler,
ohne Warnung. Die 35 % wären dann unsere Zahl, nicht ihre.

Geprüft am 22.09. im Browser: Die CinemaxX-Zeiten auf kino-zeit sind
überhaupt keine Links. Die Erklärung liegt bei der Quelle, nicht beim Parser.

Das ist der eigentliche Punkt des Abschnitts. Eine Zahl, die eine fremde
Quelle schlecht aussehen lässt, muss teurer erkauft werden als eine, die das
eigene System lobt — sonst schreibt man den eigenen Programmierfehler als
Befund über jemand anderen auf.

**Folge für das Dashboard:** Der Satz „Verlinkte Zeiten führen zum Ticket"
behauptete mehr, als die Daten hergeben, und wurde ersetzt durch
„Unterstrichene Zeiten führen zum Ticketverkauf — nicht jedes Kino stellt
einen Link bereit."

**Bewusst nicht gebaut:** CinemaxX hat ein eigenes Ticketsystem, das sich als
vierte Quelle anbinden ließe. 106 Vorstellungen wären damit verlinkt. Das ist
Arbeit für einen weiteren Parser mit eigener Fehlerbehandlung und eigener
Pflege — dieselbe Abwägung wie bei kinoheld als eigenständiger Quelle.
Dokumentiert statt gebaut.

---

## Die Doppelungen, die die erste Abfrage nicht fand

Drei Häuser — Cinema, EM und Gloria — werden von zwei Quellen erfasst: vom
Innenstadtkinos-Zweig und zusätzlich von kino-zeit. Die Frage lag nahe, ob
dabei dieselbe Vorstellung zweimal in der Datenbank landet. Die erste Abfrage
sagte nein:

```sql
group by c.name, s.raw_title, s.starts_at
having count(*) > 1
```

Null Zeilen. Die zweite, die den Titel **nicht** in die Gruppierung nimmt,
fand 24:

| kino-zeit schreibt | kinoheld schreibt |
| --- | --- |
| `Coyote Vs. Acme` | `Coyote vs. ACME` |
| `Practical Magic 2 – Zauberhafte Schwestern` | `Practical Magic 2 - Zauberhafte Schwestern` |
| `Pans Labyrinth` | `Pan's Labyrinth` |
| `The Uprising - Für die Freiheit` | `The Uprising` |
| `KINOTOUR & PREVIEW: EINE KRANKHEIT WIE EIN GEDICHT` | `Eine Krankheit wie ein Gedicht` |

Groß- und Kleinschreibung, Bindestrich gegen Gedankenstrich, Apostroph,
Untertitel, Reihenpräfix. Dieselbe Vorstellung, dieselbe Minute, dasselbe
Haus — zwei Schreibweisen.

Die erste Abfrage hatte Gleichheit über eine Zeichenkette definiert, die zwei
Quellen unterschiedlich schreiben. Genau der Fehler, gegen den die ganze
Matching-Kaskade gebaut wurde — nur diesmal nicht gegenüber TMDb, sondern
gegenüber der eigenen Datenbank. Ein Werkzeug schützt nicht davor, dass man
es an der falschen Stelle nicht benutzt.

**Der Umfang war exakt:** EM hatte 11 kino-zeit-Zeilen und 11 doppelte
Zeitpunkte, Gloria 12 und 12, Cinema 1 und 1. Für diese drei Häuser war
**jede einzelne** kino-zeit-Zeile ein Zwilling. Der Aggregator trug dort
nichts bei, was der direkte Zweig nicht schon besser hatte — 23 der 24
Zwillinge waren die Fassung ohne Ticketlink.

**Behoben als Regel, nicht als Sonderfall.** Eine Funktion räumt am Ende von
Workflow 2 auf:

```sql
delete from showing s
using showing d, title_alias ts, title_alias td
where s.source      = 'kino-zeit'     -- der Aggregator ist immer der Verlierer
  and d.source     <> 'kino-zeit'     -- gegen jede Direktquelle
  and d.cinema_id   = s.cinema_id
  and d.starts_at   = s.starts_at
  and ts.source_key = s.source_key
  and td.source_key = d.source_key
  and ts.tmdb_id    = td.tmdb_id
  and ts.tmdb_id is not null;
```

Das Prinzip in einem Satz: *Wo eine Quelle direkt vom Kino liest und eine über
einen Aggregator, gewinnt die direkte.* Die Bedingung auf `tmdb_id` ist die
Sicherung — gelöscht wird nur, wenn beide Zeilen nachweislich denselben Film
meinen. Zwei verschiedene Filme, die zur selben Minute in zwei Sälen laufen,
bleiben unangetastet.

Der Preis dafür steht noch in der Datenbank: Eine Met-Opera-Vorstellung bei
Cinema hat als `Met Opera 2026/27: … COSÌ FAN TUTTE` und als
`The Metropolitan Opera 2026/27: Così fan tutte` zwei verschiedene Kennungen
und überlebt deshalb. 23 von 24 aufgeräumt ist der richtige Tausch gegen das
Risiko, einen echten Film zu löschen.

**Warum nicht beim Schreiben filtern.** Naheliegend wäre gewesen, die drei
Häuser aus dem kino-zeit-Zweig auszuschließen. Dann aber stünden sie leer da,
sobald der Innenstadtkinos-Zweig ausfällt. Ein Aufräumen am Schluss löscht nur
dort, wo tatsächlich ein Ersatz liegt — bricht die Quelle weg, passiert
nichts.

---

## Eine Auslassung ist keine Lücke

Traumpalast Esslingen wurde am 22.09. aus der Erfassung genommen — kein
technischer Grund, sondern ein inhaltlicher: Das Haus wird nicht besucht.
71 Vorstellungen fallen damit weg.

Die Umsetzung ist die eigentliche Entscheidung. Den Eintrag aus der
Kinozuordnung zu löschen hätte funktioniert, aber das Haus wäre bei jedem Lauf
in der Meldung *„Nicht zugeordnete Kinos"* aufgetaucht. Diese Liste ist eine
Aufgabenliste: Was darin steht, soll stören. Eine bewusste Auslassung darf sich
dort nicht einnisten, sonst gewöhnt man sich an, die Liste zu überlesen — und
dann meldet sie auch den echten Neuzugang vergeblich.

```js
const NICHT_ERFASSEN = {
  '3321': 'Traumpalast Leonberg (ohne IMAX) — fuer Leonberg zaehlt nur der IMAX-Saal 53864',
  '2741': 'Traumpalast Esslingen — zu weit weg, wird nicht besucht',
};
```

Nebeneffekt: Knoten 3321 stand bis dahin bei **jedem** Lauf in der
Unbekannt-Meldung, obwohl ein Kommentar darüber erklärte, dass er bewusst
fehlt. Der Kommentar stand im Code, die Meldung im Protokoll, und niemand
brachte beides zusammen. Seit der Trennung ist die Unbekannt-Liste leer — und
damit zum ersten Mal aussagekräftig.

Die Zeile in `cinema` bleibt stehen. Ohne Vorstellungen taucht das Haus
nirgends auf, und sie dokumentiert, dass es bekannt und bewusst nicht erfasst
ist.

---

## Wo der Kanarienvogel aufhört

Beim Prüflauf am 22.09. meldete das Protokoll: *Leonberg 22-09-2026: 0
Vorstellungen geparst*. Die kino-zeit-Tagesseite für Leonberg war für den
laufenden Tag leer — im Browser ebenso wie für die Pipeline.

Kanarienvogel 2 prüft, ob **irgendwo** Vorstellungen für heute stehen. Für
Stuttgart standen welche, also schwieg er. Die naheliegende Verschärfung wäre
eine Prüfung pro Ort. Sie wäre falsch, und zwar aus zwei Gründen.

**Sie würde zu viel anhalten.** Der Kanarienvogel bricht ab und schreibt
nichts — richtig, solange der Verdacht lautet „die Quelle ist ausgefallen".
Pro Ort angewandt hieße das: Weil ein Ort leer ist, bekommen die übrigen
fünfzehn Kinos kein Update.

**Sie würde das Falsche messen.** Central Kino und Union Kino, beide in
Leonberg, hatten für diesen Tag Vorstellungen in der Datenbank — geschrieben
in genau diesem Lauf, wie `fetched_at` belegt. Die leere Seite hat also
nichts gekostet. Ein Alarm, der bei jeder folgenlosen Quelllücke anschlägt,
wird nach drei Tagen ignoriert, und dann schützt er auch im Ernstfall nicht
mehr.

Die inhaltlich richtige Regel lautet anders: *Ein Kino, das gestern
Vorstellungen für heute hatte und heute keine mehr, hat sie verloren.* Die
braucht einen Vergleich mit dem Bestand **vor** dem Löschen, also einen
zusätzlichen Abruf und einen Abgleich — kein Einzeiler. Erkannt, begründet
nicht gebaut.

Offen bleibt eine Nebenfrage: Woher die Leonberger Vorstellungen für diesen
Tag stammen, ließ sich nicht klären. Zwei Hypothesen wurden geprüft und beide
widerlegt — weder enthält die Tagesseite des Folgetags eine Spalte für den
Vortag, noch führt die Stuttgarter Seite die Leonberger Häuser. Der Bestand ist
vollständig, der Weg dorthin unbelegt.

---

## Was `fetched_at` beantwortet hat

Dieselbe Nebenfrage hatte zwei mögliche Antworten, und eine davon wäre ein
Fehler gewesen: Wenn die Zeilen **nicht** aus diesem Lauf stammten, hätte
`showing leeren` sie nicht erwischt, obwohl ihr `starts_at` nach der
Löschgrenze lag. Die Tabelle würde sich dann stillschweigend mit Altlasten
füllen, und abgesagte Vorstellungen blieben für immer im Dashboard stehen.

Der DELETE lief seit Wochen. Geprüft hatte ihn nie jemand — die Konsole zeigt,
dass er abgeschickt wurde, nicht, was er gelöscht hat.

Eine Spalte hat die Frage in einer Abfrage beantwortet: `fetched_at` stand
auf `12:06:27`, eine Sekunde nach dem DELETE um `12:06:26`. Die Zeilen
stammten aus diesem Lauf, der Löschmechanismus arbeitet.

Die Lehre ist nicht der Befund, sondern die Spalte. Drei Hypothesen ließen
sich an diesem Nachmittag nicht direkt prüfen, weil die Herkunft einer Zeile
nicht mitgeschrieben wird — aus welcher der 84 abgerufenen Seiten eine
Vorstellung stammt, weiß niemand. Eine Spalte `fetched_from` mit der
Quell-URL würde aus „woher kommt diese Zeile" eine Abfrage statt einer
Detektivarbeit machen. `fetched_at` konnte die wichtige Frage sofort
beantworten, weil dieses eine Feld existiert.

Herkunft mitzuschreiben kostet ein Feld und spart eine halbe Stunde Raten —
jedes Mal.
