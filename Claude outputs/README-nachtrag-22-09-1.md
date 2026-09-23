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

---

## Nachtrag 23.09.2026 — die erste Nacht ohne Aufsicht

Die Sicherungen vom Vortag waren bis dahin Behauptungen. Am Morgen des 23.09.
haben drei von ihnen innerhalb von vier Stunden ausgelöst.

### 06:03 — der Kanarienvogel verhindert einen Datenverlust

Der erste unbeaufsichtigte Lauf des Kinoprogramms las **1041 Vorstellungen
für kommende Tage und keine einzige für den laufenden Tag**. Alle vier
kino-zeit-Ortsseiten lieferten für heute nichts — die neue Kinowoche war
offenbar gerade in der Veröffentlichung.

Der Kanarienvogel, der genau dafür am Vortag eingebaut worden war, brach ab.
Damit lief `showing leeren` nicht, der Bestand vom Vorabend blieb stehen, und
das Dashboard zeigte einen Tag alte, aber vollständige Daten. Drei Stunden
später hatte dieselbe Seite Programm.

Ohne die Prüfung wäre der laufende Tag in allen kino-zeit-Kinos gelöscht und
nicht ersetzt worden — genau der Fehler vom 22.09., diesmal aber ohne
jemanden, der zusieht.

**Konsequenz:** Die Kette beginnt seitdem um 7:00 statt 6:00 (7:00
Kinoprogramm, 7:30 Matching, 7:45 MUBI GO, 8:00 Ausspielung). Die Stunde
Aktualität merkt niemand, die Kollision mit dem Veröffentlichungsfenster
schon.

**Was der Kanarienvogel nicht auflöst:** Löschen und Schreiben sind
alles-oder-nichts. Ein einziger fehlender Tag hat die Aktualisierung von 1041
frischen Vorstellungen blockiert. Die Prüfung hat richtig entschieden —
nichts schreiben ist besser als den heutigen Tag löschen —, aber sie musste
diese Entscheidung nur treffen, weil es keine dritte Möglichkeit gibt.
Tageweise zu löschen statt ab `now()` würde beides trennen: Der fehlende Tag
bliebe stehen, die anderen zwanzig würden aktualisiert. Weiterhin erkannt und
nicht gebaut — aber der Preis ist jetzt beziffert.

### 09:17 — ein Zweig bricht nach dem Löschen

Beim manuellen Nachlauf scheiterte `ISK film` an einem Feld, das im
*Fixed*-Modus statt als Ausdruck stand. Der Fehler kam **nach**
`showing leeren` und `showing einfügen` — die 244 Vorstellungen der
Innenstadtkinos waren also gelöscht und wurden nicht neu geschrieben. Cinema,
EM und Gloria fehlten vollständig, bis das Feld repariert war.

Der Kanarienvogel wacht über den ersten Zweig. Bricht ein späterer, fällt
eine ganze Quelle still aus, und keine Prüfung sagt etwas. Dieselbe Lücke wie
beim tageweisen Löschen, nur auf der Quellenachse statt auf der Zeitachse.

### 10:00 — die Zeilengrenze, und warum die Zahl sie nicht verraten hat

Mit der neuen Kinowoche stieg der Bestand von 549 auf 1133 Vorstellungen.
Die Supabase Data API liefert voreingestellt höchstens 1000 Zeilen und
schneidet still ab. In der `today.json` stand daraufhin:

```json
"vorstellungen": 1000
```

Für diese Zahl gab es eine plausible harmlose Erklärung: Der Builder legt
Vorstellungen desselben Films im selben Kino zur selben Minute zusammen —
1133 minus 133 Fassungsdopplungen ergäbe zufällig genau 1000. Diese Erklärung
war falsch, aber sie war nicht unvernünftig.

Entschieden hat es eine **zweite, unabhängige Größe aus demselben
Datenbestand**: der Zeitraum. Die Datenbank reichte bis 2027, die Datei
endete acht Tage nach dem Start. Acht Tage mal rund 125 Vorstellungen sind
ziemlich genau 1000 — die Liste war gekappt, nicht entdoppelt. Nach dem
Anheben der Grenze legte derselbe Builder **null** Zeilen zusammen: 1112
hinein, 1112 heraus.

**Die Lehre:** Prüf eine verdächtige Zahl nie an sich selbst. Für fast jede
Zahl lässt sich eine Erklärung finden, die sie bestätigt; entschieden wird
sie von einer anderen Größe, die dieselben Daten beschreibt.

### Drei kleinere Funde desselben Vormittags

**Ein Pluszeichen in einer URL ist ein Leerzeichen.** Die Zeitgrenze war
zuerst als `{{ $now.plus({ days: 28 }).toISO() }}` gesetzt, was
`2026-10-21T10:14:28.979+02:00` ergibt. Unterwegs wird aus dem `+` ein
Leerzeichen, und Postgres antwortet mit `22007 invalid input syntax for type
timestamp`. `toISODate()` liefert ein reines Datum ohne Pluszeichen — für
eine Vier-Wochen-Grenze ist die Uhrzeit ohnehin bedeutungslos.

**Wo eine Obergrenze existiert, gehört eine Sortierung dazu.** Eine
unsortierte Liste, die abgeschnitten wird, verliert irgendwelche Zeilen und
sieht danach vollkommen plausibel aus. `order=starts_at.asc` sorgt dafür,
dass eine Kappung am Ende passiert — und damit am Datum sichtbar wird.

**Die drei Quellen haben verschiedene Horizonte.** kino-zeit reicht rund drei
Wochen, die Innenstadtkinos mit ihren Sonderreihen bis zu acht Monate: Met
Opera 2026/27 bis Juni, Weird Wednesday, Konzertfilme. Das sind echte
Vorstellungen, kein Parser-Fehler. Ganz ohne Grenze bestimmt aber eine
einzelne Opernübertragung im Juni den angezeigten Zeitraum, und 250 der 260
Tage im Dashboard wären leer. Die Pipeline begrenzt deshalb — eine
inhaltliche Entscheidung, keine technische Grenze.

Die erste Fassung dieser Grenze lag bei 28 Tagen und war falsch gewählt.
Gerade die weit vorausgeplanten Sonderreihen sind die interessanten Treffer:
*Weird Wednesday: DRIVE* am 04.11., *Rocky* am 03.11. — alte Filme, die
einmal laufen und dann wieder ein Jahr nicht. Für spätestens diese Fälle
führt man eine Watchlist. Ein Dashboard mit Vier-Wochen-Horizont blendet
genau den Fall aus, für den es gebaut wurde. Die Grenze liegt seitdem bei 90
Tagen, und sie kostet fast nichts: Von 1133 Vorstellungen liegen gut zwanzig
überhaupt jenseits von vier Wochen.

### Bilanz des Tages

Drei Prüfungen haben angeschlagen, bevor ein Schaden entstand. Keine davon
war eine Fehlermeldung des Systems; alle drei waren beim Bauen
hingeschriebene Sätze der Form *„das kann so nicht stimmen"*. Der einzige
Fehler, der tatsächlich Daten gekostet hat — die fehlenden Innenstadtkinos um
09:17 —, traf genau die Stelle, an der keine solche Prüfung stand.

---

## Die Gegenprobe, die anders ausging als erwartet

Am 22.09. fehlten im Dashboard drei Filme, die auf arthaus-kino.de standen.
Die Vermutung lautete: kino-zeit veröffentlicht die neue Kinowoche mit rund
einer Woche Verzug, das Kino selbst früher. Aus einer Vermutung wird ein
Befund, wenn sie eine überprüfbare Vorhersage macht — also wurde eine
notiert: *Sobald kino-zeit die neue Woche führt, müssen* Come ti muovi,
sbagli, KitKatClub *und* Emil und die Detektive *auftauchen.*

Am 23.09. war die neue Woche da. Der Abgleich für den 23.–29.09.:

**17 von 17 Titeln mit Spielzeiten sind in der Datenbank.** Keine Lücke.

*Dune: Part Three* steht auf der Kinoseite im Wochenblock, aber **ohne eine
einzige Uhrzeit** — nur Plakat und Trailer. Eine Vorstellung, die es nicht
gibt, kann keine Pipeline erfassen; das Fehlen ist das richtige Ergebnis. Die
Vorhersage selbst ging zu zwei Dritteln auf: *Emil und die Detektive* und
*KitKatClub* sind wie angekündigt erschienen, *Come ti muovi, sbagli* steht
inzwischen bei keiner der beiden Quellen. Der Wochenvorlauf ist damit belegt,
die Titelauswahl der Vorhersage war zu einem Drittel geraten.

Zwei Einzelfälle belegen unterwegs die Kette, und zwar an Beispielen, die
niemand dafür konstruiert hat:

| Kinowebsite | Datenbank | Was dazwischen passiert ist |
| --- | --- | --- |
| „Lass mal schauen! – Her" | „Her" | `stripReihe()` trennt Reihenname und Filmtitel |
| „Coyote vs. ACME" | „Coyote Vs. Acme" | dieselbe Schreibweisendifferenz, an der die erste Doppelungsabfrage scheiterte |

**Und dann geht die Probe in die andere Richtung aus.** Die Datenbank führt
für dieselbe Woche **sieben Titel mehr** als die Arthaus-Startseite: *Das
geträumte Abenteuer*, *Gewalt und Leidenschaft*, *Gioia mia*, *Il bene
comune*, *La vita da grandi*, *Tre Ciotole* und *Horror Classics*. Keiner
davon steht auf der Übersichtsseite des Kinos; sie laufen dort trotzdem, im
Sonderprogramm auf einer Unterseite.

Die Gegenprobe sollte zeigen, ob der Aggregator hinter der Kinowebsite
zurückbleibt. Sie zeigt für diese Woche das Gegenteil: Er ist vollständiger
als die Startseite des Hauses. Beides gleichzeitig ist wahr — kino-zeit ist
langsamer **und** breiter, und wer nur die eine Eigenschaft misst, hält die
Quelle für schlechter oder besser, als sie ist.

Das ist der Punkt, an dem diese zwei Tage aufhören, eine Fehlersuche zu sein,
und anfangen, eine Methode zu werden: Jede Annahme über eine Datenquelle ist
eine Vorhersage. Aufgeschrieben und geprüft wird sie zu Wissen — und
manchmal, wie hier, zu einem Ergebnis, das der Annahme widerspricht, ohne sie
zu widerlegen.

---

## Ein Standardwert ist eine Behauptung

*Weird Wednesday: TAXI DRIVER* und *DRIVE* standen im Dashboard als deutsche
Fassung. Beide laufen laut Kinoseite im Original — und beide stehen genau
deshalb auf der Watchlist.

Die Ursache war eine Zeile im Innenstadtkinos-Parser:

```js
const sprache = String(e.inLanguage || 'de').toLowerCase();
version: sprache.startsWith('de') ? 'DF' : 'OV',
```

Das `|| 'de'` macht aus einer **fehlenden** Angabe eine deutsche Fassung.
Die Quelle hatte nie „DF" behauptet; sie hatte gar nichts behauptet. Die
Pipeline hat die Lücke gefüllt, und zwar mit dem häufigeren Fall — was die
Falschaussage zusätzlich tarnt, weil sie meistens zufällig stimmt.

Sichtbar wurde es an der Verteilung, nicht am Einzelfall:

| Quelle | ohne Angabe |
| --- | --- |
| kino-zeit | 702 von 869 |
| Innenstadtkinos | **0 von 244** |

Eine Quelle, die bei 81 Prozent der Vorstellungen schweigt, und eine, die
immer etwas weiß — bei vergleichbaren Kinos in derselben Stadt. Diese Null
war das eigentliche Alarmzeichen. Ein Feld, das nie leer ist, ist verdächtig,
nicht vorbildlich.

Nach der Korrektur trägt `version` drei Zustände statt zwei: das Kürzel aus
dem Etikett der Vorstellung, die Sprachangabe des Events, oder `null`. Das
Ergebnis: 188 DF, 48 OV, 1 OmU — und **7 Leerstellen**. Die 188 stammen
tatsächlich aus `inLanguage`, waren also nie erfunden. Betroffen war genau
die kleine Zahl von Fällen, in denen die Quelle schweigt. Auch das gehört zur
Ehrlichkeit des Befunds: Die Vermutung, der Standardwert betreffe die
Mehrheit, war falsch.

Zwei Nachträge, die den Fall abrunden:

**Die Angabe stand doch in den Daten — nur nicht als Kürzel.** Im Browser
trägt die Vorstellung das Etikett `EM 12D·OV`, im JSON-LD fehlt jedes
Sprachfeld. Im **Beschreibungstext** desselben Events steht dagegen:

> „Weird Wednesday — Jeden 3. Mittwoch im Monat zeigen wir im EM-Kino
> Stuttgart ausgesuchte Kultklassiker … und in der **Originalversion**."

Die Auflösung liest deshalb seit dem 23.09. auch ausgeschriebene Angaben —
*Originalversion*, *Originalfassung*, *im Original*, *mit Untertiteln* —, und
zwar als **dritte** Stufe, nach dem Kürzel und nach `inLanguage`. Ein
Fließtext beschreibt oft die Reihe und nicht die einzelne Vorstellung; er
darf eine ausdrückliche Sprachangabe deshalb nie überstimmen, sondern nur
eine Lücke füllen.

Der naheliegende Weg wäre gewesen, das Kürzel aus dem HTML zu holen — es
steht dort als `<span style="…">OV</span>`. Die Suche im Rohtext zeigte
allerdings einen dritten Treffer auf derselben Seite:

```json
"language":{"options":{"ov":"OV","omu":"OmU"}}
```

Das ist die Konfiguration der Filterleiste. Sie steht auf **jeder** Seite,
und ein Parser, der im HTML nach „OV" sucht, hätte jede Vorstellung für
Originalversion gehalten — der genaue Spiegel des Fehlers, den er beheben
sollte. Der Umweg über den Beschreibungstext ist nicht der offensichtliche,
aber der stabilere.

**Und ein falscher Alarm zum Schluss.** Nach der Korrektur zeigte das
Dashboard weiterhin „DF". Verdacht: eine zweite Voreinstellung in der
Anzeige. Tatsächlich war die `today.json` schlicht älter als die Korrektur —
Workflow 2 schreibt die Datenbank, das Dashboard liest die Datei, und
dazwischen liegt Workflow 5. Derselbe Fehlgriff wie am 21.09., als ein
Builder-Node eine alte Kopie des Codes hielt. Bevor man eine zweite Ursache
sucht, prüft man den Zeitstempel der Ausgabe.
