# Erste n8n-Sitzung — Klickliste

Reihenfolge einhalten. Jeder Schritt hat ein Abbruchkriterium: stimmt das
Ergebnis nicht, lohnt der nächste Schritt nicht.

*Stand 22.09.2026.*

---

## Die fünf Workflows im Überblick

Die Schrittnummern dieser Liste sind die Bau-Reihenfolge, nicht die
Workflow-Nummern in n8n. Maßgeblich sind die Namen:

| Workflow | Zeitplan | Aufgabe |
| --- | --- | --- |
| Watchlist-Sync | wöchentlich DI 6:15, zusätzlich Formular-Upload | Letterboxd → `film`, `watchlist` |
| Kinoprogramm | täglich 7:00 | drei Quellen → `showing` |
| Matching | täglich 7:30 | offene Titel → `title_alias` |
| MUBI GO | täglich 7:45 | Film der Woche → `mubi_go` |
| Ausspielung | täglich 8:00 | alles → `today.json` |

Die Uhrzeiten sind keine Geschmackssache, sie bilden eine Kette:
Kinoprogramm schreibt `showing` und `title_alias`, das Matching löst offene
Titel auf, MUBI GO schlägt seinen Film **in** `title_alias` nach, und die
Ausspielung liest am Ende alles. Wer eine Uhrzeit verschiebt, verschiebt eine
Abhängigkeit.

> **Die Viertelstunde zwischen Matching und MUBI GO ist Absicht.** Beide
> liefen zunächst zur selben Zeit. MUBI GO schlägt seinen Film aber in
> `title_alias` nach — also in genau der Tabelle, die das Matching zur selben
> Zeit füllt; wer zuerst fertig ist, hätte der Zufall entschieden. Ruft MUBI
> donnerstags einen Film aus, der mit der neuen Kinowoche erst ins Programm
> kommt, wirft der Node `steht in keinem der erfassten Kinoprogramme`, obwohl
> der Titel eine Minute später dagestanden hätte. Seit 22.09.2026 liegt eine
> Viertelstunde dazwischen.

> **Warum die Kette um eine Stunde nach hinten gerückt ist.** Ursprünglich
> begann sie um 6:00. Am 23.09.2026 lieferten um 06:03 alle vier
> kino-zeit-Ortsseiten für den *laufenden* Tag nichts, während 1041
> Vorstellungen für kommende Tage bereitstanden — die neue Kinowoche war
> offenbar noch in der Veröffentlichung. Der Kanarienvogel brach ab und
> verhinderte, dass der heutige Tag geleert wurde; drei Stunden später hatte
> dieselbe Seite Programm. Seitdem beginnt die Kette um 7:00. Die Stunde
> Aktualität merkt niemand, die Kollision mit dem Veröffentlichungsfenster
> schon.

---

## 0 · Vorher, geht sofort (1 Minute)

Prüf den TMDb-Key an dem Fall, um den sich das halbe Projekt dreht:

```
https://api.themoviedb.org/3/search/movie?query=Vaterland&language=de-DE
```

**Und einmal die Zeitzone setzen.** n8n steht ab Werk auf
`America/New_York`. Ohne `GENERIC_TIMEZONE=Europe/Berlin` (und `TZ` gleich
mit) feuert der Trigger aus Schritt 4 nicht um 07:00, sondern um 13:00 — und
„heute" ist morgens noch der Vortag. Rechts im Input-Panel jedes Nodes steht,
welche Zone gerade gilt.

Header `Authorization: Bearer <dein Read Access Token>`.
Ohne Terminal geht es auch im Browser über einen REST-Client, oder in n8n
direkt im HTTP-Request-Node mit *Test step*.

**Fertig, wenn** in der Antwort der Eintrag mit `"id": 1437696` steht —
`"title": "Vaterland"`, `"original_title": "Ojczyzna"`, `"original_language":
"pl"`, Start 19.06.2026. Das ist der Film, der gerade läuft.
Kommt `{"status_code":7}`, ist der Token falsch oder noch nicht aktiv.

> **Achtung, alte Annahme:** Bis zum 18.09. stand hier, zu erwarten sei
> `"original_title": "Fatherland"`. Das war falsch und ist an deiner eigenen
> TMDb-Antwort aufgeflogen: Der Originaltitel ist polnisch, *Fatherland* ist
> nur der englische Verleihtitel, unter dem Letterboxd den Film führt —
> und zwei ältere, unbeteiligte Filme von 1986 und 1994 heißen im Original
> tatsächlich *Fatherland*. Wer nach diesem Kriterium prüft, hält seinen
> funktionierenden Key für kaputt. Genau deshalb ist der Fall so wertvoll:
> Er zeigt, dass Titel über Sprachgrenzen hinweg nichts beweisen und nur
> die TMDb-ID verbindet.

---

## 1 · Supabase (20 Minuten)

1. Projekt anlegen auf supabase.com, Region Frankfurt.
2. SQL Editor öffnen, `sql/schema.sql` einfügen, **Run**.
3. Unter *Project Settings → API* zwei Werte kopieren: die Projekt-URL und den
   **service_role**-Key. Nicht den `anon`-Key — der ist für Browser gedacht
   und darf nicht schreiben.

Am Ende von `schema.sql` steht ein GRANT-Block für `service_role`. Neuere
Supabase-Projekte vergeben die Default-Privilegien nicht mehr durchgehend;
ohne ihn antwortet PostgREST später mit `42501 permission denied for table
film`, obwohl der Key stimmt. Das ist kein RLS — `service_role` umgeht RLS
ohnehin.

**Fertig, wenn** unter *Table Editor* sieben Tabellen stehen und `cinema`
**16 Zeilen** hat — neun in Stuttgart, vier in Ludwigsburg, zwei in Esslingen,
eine in Leonberg. Den Seed erzeugt `node pipeline/build-schema-seed.js` aus
`data/kinos.json`; von Hand gepflegt wird er nicht.

> **16 Stammdaten, 15 abgerufene Häuser.** Traumpalast Esslingen steht in
> `cinema`, wird aber seit dem 22.09. bewusst nicht erfasst (Schritt 4). Die
> Zeile bleibt stehen: Sie dokumentiert, dass das Haus bekannt und die
> Auslassung eine Entscheidung ist.

**Nicht vergessen:** `schema.sql` enthält außer den Tabellen auch die Sichten
`v_programm`, `v_offene_titel`, `v_titel_kollisionen` und die Funktion
`dedupe_showings()`. Beides ist schon einmal auseinandergelaufen — einmal
stand eine Sicht nur in der Datei und nie in der Datenbank, einmal umgekehrt.
Nach jeder Änderung an einer Sicht oder Funktion gehört beides nachgezogen.

---

## 2 · Credentials in n8n (5 Minuten)

| Credential | Typ | Inhalt |
| --- | --- | --- |
| TMDb | Header Auth | Name `Authorization`, Wert `Bearer <Read Access Token>` |
| Supabase | Supabase API | Host = Projekt-URL, Service Role Secret = service_role-Key |
| LLM | je nach Anbieter | für den Schiedsrichter-Node im Matching |

Nie einen dieser Werte in einen Code-Node schreiben — Code-Nodes landen im
Workflow-Export, Credentials nicht.

---

## 3 · Watchlist-Sync, Formularzweig (45 Minuten)

*On form submission* (Form Trigger) mit einem Feld vom Typ **File** →
*Extract from File* (Extract From CSV) → Loop Over Items (Batch Size 1) mit
*Wait* 1 s → HTTP Request auf `{{ $json['Letterboxd URI'] }}`
(Response Format **Text**, User-Agent setzen) → Code-Node mit dem Inhalt von
`06-letterboxd-tmdb.js`, Funktion `ausLetterboxdSeite` →
Supabase Upsert in `film` und `watchlist`.

> **Kein Disk-Node.** *Read/Write Files from Disk* liest das Dateisystem der
> Maschine, auf der n8n läuft — nicht deinen Desktop. Ein relativer Pfad wie
> `export/watchlist.csv` sucht ab dem Arbeitsverzeichnis im Container und
> findet nichts. Der Upload über das Formular funktioniert unabhängig davon,
> wo die Instanz steht.

Einstellungen, die sonst Zeit kosten:

* Feld-Label schlicht halten (`watchlist`) — daraus leitet sich der Name der
  Binary-Property ab, den *Extract from File* als *Input Binary Field*
  braucht. Nach dem ersten Testlauf im Binary-Tab des Triggers ablesen.
* *Respond When* auf der Voreinstellung *Form Is Submitted* lassen: die Seite
  antwortet sofort, der Lauf über 74 Zeilen blockiert sie nicht.
* Die Test-URL des Triggers gilt nur, solange der Node lauscht; die
  Production-URL nur bei aktivem Workflow.
* Entpackte `watchlist.csv` hochladen, nicht das ZIP — sonst gehört ein
  *Compression*-Node (Decompress) davor.
* Alle Werte im JSON-Body mit `JSON.stringify(... ?? null)` einsetzen.
  n8n rendert `null` in einer Expression als **leeren String**: Aus
  `"year": {{ $json.jahr }}` wird bei einem Film ohne Jahrgang im Export
  (es gibt welche) `"year": }` — ungültiges JSON, der Lauf bricht mitten
  in der Schleife ab. Bei `year_raw` zusätzlich `?.toString() ?? null`,
  sonst steht die Zeichenkette `"null"` in der Spalte.
* Den Code-Node auf **Run Once for Each Item** stellen. Hinter dem HTTP
  Request steht nur noch das HTML im Item, Titel und URI sind weg; die
  Quellzeile über `$('Loop Over Items').item.json` zurückholen und
  `name`, `jahr`, `letterboxd_uri`, `lid` neben die Treffer legen.

Ohne n8n macht dasselbe `node pipeline/fetch-tmdb-ids.js`; das Ergebnis landet
in `data/watchlist-tmdb.json` und wird von `build-today.js` eingelesen. Das
Skript setzt fort, ein Abbruch kostet also nichts.

**Fertig, wenn** `watchlist` mindestens 70 der 74 Zeilen hat und jede eine
TMDb-Kennung trägt. Dauer des Erstlaufs: gut anderthalb Minuten bei einer
Anfrage je Sekunde. Probe: *Taxi Driver* muss TMDb **103** bekommen.

---

## 3b · Watchlist ohne Upload (automatischer Zweig)

Der Form-Trigger aus Schritt 3 bleibt — als zweiter Einstieg, falls
Letterboxd umbaut. Daneben kann die Liste aber auch selbst geholt werden.

**Was die Seite hergibt.** `letterboxd.com/<name>/watchlist/` ist
serverseitig gerendert; jeder Film steht als Datenattribut im HTML, auch
wenn das Poster erst später nachgeladen wird:

```html
<div class="react-component" data-item-name="Fatherland (2026)"
     data-item-slug="fatherland-2026" data-item-link="/film/fatherland-2026/"
     data-postered-identifier="{&quot;lid&quot;:&quot;TbK4&quot;,&quot;uid&quot;:&quot;film:1315318&quot;,&quot;type&quot;:&quot;film&quot;}">
```

Die `lid` darin ist genau der Kurzschlüssel, den der CSV-Export als
`https://boxd.it/TbK4` führt. Damit ist der Abgleich mit dem Bestand exakt
und braucht keinen Titelvergleich. 28 Filme pro Seite, geblättert wird über
`/watchlist/page/2/`.

> **Die Anführungszeichen sind eine Falle.** Im Browser zeigt `outerHTML`
> doppelte Anführungszeichen um `data-postered-identifier`, der Server
> schickt einfache. Ein Parser, der gegen die Browseransicht gebaut ist,
> findet auf der echten Antwort keinen einzigen Film. Die Testdatei
> `fixtures/letterboxd-watchlist.html` enthält deshalb beide Schreibweisen
> und stammt aus der Serverantwort, nicht aus den Entwicklerwerkzeugen.

### Die Nodes

| # | Node | Typ | Das Wichtigste |
| --- | --- | --- | --- |
| 1 | `Wöchentlich DI 6:15` | Schedule Trigger | Weeks · Tuesday · 6:15 |
| 2 | `Watchlist Seite 1` | HTTP Request | Response Format **Text**, Feld `data` |
| 3 | `Seitenplan` | Code | s. u., erzeugt Seite 2..n |
| 4 | `Weitere Seiten` | HTTP Request | URL aus `{{ $json.url }}` (*Expression!*) |
| 5 | `Bestand holen` | HTTP Request | Supabase `watchlist`, **Always Output Data** + **Execute Once** |
| 6 | `Watchlist lesen` | Code | Inhalt von `11-letterboxd-watchlist.js` |
| 7 | `Was tun?` | Switch | `neu` / `entfernt` |
| 8 | *(Zweig neu)* | — | die bestehende Kette aus Schritt 3 |
| 9 | `Entfernte loeschen` | HTTP Request | DELETE, s. u. |

Die Namen von Node 2 und 5 sind Vertrag: Der Code-Node holt sich seine
Eingaben über `$('Watchlist Seite 1')` und `$('Bestand holen')`. Node 3, 4, 7
und 9 dürfen heißen, wie sie wollen.

**Warum dienstags um 6:15.** Die Watchlist ändert sich in Wochen, nicht in
Stunden — ein täglicher Abruf wäre Last ohne Ertrag. 6:15 liegt aber
zwingend **vor** der Ausspielung um 8:00: Bei 9:00 wäre ein dienstags
hinzugefügter Film erst am Mittwochmorgen im Dashboard sichtbar.

**Node 2 und 4 — die Abrufe**

```
GET https://letterboxd.com/<dein-name>/watchlist/        (Node 2)
GET {{ $json.url }}                                      (Node 4, Expression)
Header: User-Agent: Mozilla/5.0 (SchroedingersKino/1.0; privates Projekt)
Options -> Response -> Response Format: Text, Output Field Name: data
```

Der Platzhalter `<dein-name>` muss in **beiden** Nodes und im Seitenplan
ersetzt werden — bleibt er stehen, antwortet Cloudflare mit 403.

**Node 3 — `Seitenplan`** (Run Once for All Items)

```js
const html = $json.data;
const treffer = html.match(/\/watchlist\/page\/(\d+)\//g) || [];
const seiten = treffer.length
  ? Math.max(1, ...treffer.map(t => Number(t.match(/(\d+)/)[1])))
  : 1;
const basis = 'https://letterboxd.com/<dein-name>/watchlist';
const plan = [];
for (let i = 2; i <= seiten; i++) plan.push({ json: { url: `${basis}/page/${i}/` } });
return plan;          // eine Seite: leere Liste, Node 4 laeuft nicht
```

**Node 5 — `Bestand holen`**

```
GET https://<projekt>.supabase.co/rest/v1/watchlist
    ?select=tmdb_id,letterboxd_uri,title_raw&limit=1000
Settings -> Always Output Data: AN
Settings -> Execute Once:        AN
```

*Execute Once* ist hier nicht kosmetisch: Ohne den Schalter läuft der Node
einmal pro eingehendem Item — bei zwei Folgeseiten also zweimal, und der
Bestand kommt doppelt zurück. Am 22.09.2026 führte das zu „92 von 148
Einträgen wären zu löschen". Der Abgleich entdoppelt seitdem selbst,
weil eine Löschliste nicht von einem Häkchen abhängen darf — der Schalter
spart trotzdem zwei unnötige Anfragen.

**Node 9 — `Entfernte loeschen`**

```
DELETE https://<projekt>.supabase.co/rest/v1/watchlist?tmdb_id=eq.{{ $json.tmdb_id }}
```

### Was der Lauf ausgibt, wenn nichts zu tun ist

Immer eine Berichtszeile:

```json
{ "aktion": "bericht", "gelesen": 74, "seiten": 3, "im_bestand": 74,
  "neu": 0, "entfernt": 0 }
```

Der Switch kennt nur `neu` und `entfernt`; `bericht` fällt dort heraus und
landet in keinem Ausgang. Damit ist im Code-Node ablesbar, was der Lauf
gesehen hat, ohne dass die Verzweigung davon etwas mitbekommt.

Zusammen mit den beiden Sicherungen macht das einen leeren Lauf beweiskräftig:
Hätte der Parser nichts gelesen, wäre er abgebrochen; wären Filme
verschwunden, stünden sie unter `entfernt`. Kein Abbruch **und** keine
Aktion heißt also: Abruf und Bestand sind deckungsgleich.

### Warum das mehr ist als eine Bequemlichkeit

Ein Upload kann nur **hinzufügen**. Nimmst du einen Film von der Watchlist,
bleibt er in der Datenbank stehen und das Dashboard zeigt ihn weiter als
Treffer — ein Fehler, der nie auffällt, weil er nie eine Fehlermeldung
erzeugt. Der Abruf kennt den vollständigen Soll-Zustand und sieht deshalb
auch, was fehlt.

Genau deshalb hat `abgleich()` zwei Sicherungen, und sie sind der wichtigste
Teil der Datei: Löschen ist die einzige Operation dieser Pipeline, die Daten
vernichtet.

1. **Keine Filme gelesen → Abbruch.** Eine umgebaute Seite sieht aus wie
   eine geleerte Watchlist. Der Unterschied ist, dass eine geleerte Watchlist
   ein Ereignis ist und ein Umbau ein Fehler.
2. **Mehr als die Hälfte weg → Abbruch.** Einzelne Streichungen sind
   Alltag, die halbe Liste auf einmal ist es nicht.

Beide melden sich über den Fehler-Melder. Ein Lauf, der nichts tut und sich
beschwert, ist besser als einer, der stillschweigend Daten löscht.

### Die Abwägung, die dazugehört

Letterboxds Nutzungsbedingungen sehen automatisiertes Auslesen nicht vor —
auch wenn es die eigenen, öffentlichen Daten sind und der Export denselben
Inhalt liefert. Deshalb: ein Lauf pro Woche, erkennbarer User-Agent, und die
Filmseiten werden nur für **neue** Filme geholt (typisch null bis zwei statt
74). Eine offizielle API gibt es; der Schlüssel wird auf Antrag vergeben
(`letterboxd.com/api-beta/`) und wäre der sauberere Weg. Diese Entscheidung
gehört in die Arbeit geschrieben, nicht stillschweigend getroffen.

---

## 4 · Kinoprogramm (60 Minuten)

Der längste Workflow, und der einzige mit drei Quellen. Sie hängen
**hintereinander** an einem Strang, nicht parallel — jede schreibt in dieselbe
Tabelle `showing`, und die Reihenfolge entscheidet, wer wen überschreibt.

```
Täglich 7:00
  → Abrufplan                (Code)
  → Seiten-Schleife          (Loop Over Items)
      loop:  Pause Tagesseite → Tagesseite holen → zurück
      done:  Kinoprogramm parsen
  → showing leeren → showing einfügen          [Quelle 1: kino-zeit]
  → IMAX-Wochen → Traumpalast holen
  → Traumpalast parsen → showing einfügen (IMAX)   [Quelle 2: Traumpalast]
  → Sitemap holen → Filmseiten planen
  → Filmseiten-Schleife
      loop:  Filmseite holen → Pause Filmseite → zurück
      done:  Innenstadtkinos parsen
  → ISK film → ISK alias → ISK showing         [Quelle 3: Innenstadtkinos]
  → Doppelungen entfernen
```

### Quelle 1 · kino-zeit.de

Code-Node **`Abrufplan`** (`wf2-abrufplan.js`, 21 Tage × 4 Orte = 84 Abrufe)
→ Loop Over Items (Batch Size 1).

* **loop-Zweig:** *Wait* 1 s → HTTP Request auf `{{ $json.url }}`
  (Response Format **Text**, *Put Output in Field* **`html`**, `User-Agent`
  setzen) → zurück auf den Loop.
* **done-Zweig:** Code-Node **`Kinoprogramm parsen`** (`04-code-node.js`,
  Run Once for All Items) → `showing leeren` → `showing einfügen`.

Gelöscht wird **nach** dem Parsen: `DELETE /rest/v1/showing?starts_at=gte.{{
$now.toUTC().toISO() }}`. Bricht der Parser, bleiben die alten Daten stehen,
statt dass das Dashboard leer dasteht.

Eingefügt wird in **einem** Request, Body
`{{ JSON.stringify($('Kinoprogramm parsen').all().map(i => i.json)) }}`,
bei beiden Supabase-Nodes in den Settings **Execute Once**.

Der Node-Name `Abrufplan` ist nicht kosmetisch — der Parser holt sich über ihn
Ort und Datum jeder Seite zurück, weil hinter dem HTTP Request nur noch das
HTML im Item steht.

> **Zwei Kanarienvögel, nicht einer.** Dass der Parser bei *null* Zeilen wirft,
> reicht nicht: Am 22.09.2026 lieferte der 06:00-Lauf 121 Vorstellungen für
> morgen und keine einzige für heute. Der Lauf war grün, das Löschen lief,
> und das Dashboard zeigte für den laufenden Tag in allen elf
> kino-zeit-Kinos nichts mehr. Seitdem wirft `04-code-node.js` auch dann,
> wenn ausgerechnet der heutige Tag fehlt (bis 20 Uhr; danach ist ein leerer
> Resttag normal).
>
> **Restrisiko, bewusst offen gelassen:** Fällt ein Tag *mitten* im Zeitraum
> aus, wird er weiterhin still geleert. Und die Prüfung ist global, nicht pro
> Ort — ist nur eine Ortsseite leer, schweigt sie. Warum das so bleibt, steht
> im README unter „Wo der Kanarienvogel aufhört": Pro Ort angewandt würde ein
> einzelner leerer Ort die Aktualisierung aller übrigen Häuser verhindern, und
> ein Alarm, der bei jeder folgenlosen Quelllücke anschlägt, wird nach drei
> Tagen ignoriert.

**Bewusste Auslassungen.** In `04-code-node.js` steht neben der Kinozuordnung
eine zweite Liste:

```js
const NICHT_ERFASSEN = {
  '3321': 'Traumpalast Leonberg (ohne IMAX) — fuer Leonberg zaehlt nur der IMAX-Saal 53864',
  '2741': 'Traumpalast Esslingen — zu weit weg, wird nicht besucht',
};
```

Was hier steht, wird stumm übersprungen. Was in **keiner** der beiden Listen
steht, meldet der Node als `Nicht zugeordnete Kinos`. Diese Meldung ist eine
Aufgabenliste — eine bewusste Auslassung darf sich dort nicht einnisten, sonst
gewöhnt man sich an, die Liste zu überlesen. Nach einem sauberen Lauf steht im
Protokoll nur `Bewusst ausgelassen: …` und sonst nichts.

### Quelle 2 · Traumpalast IMAX Leonberg

Am 21.09.2026 geprüft: Die kino-zeit-Ortsseite Leonberg führt nur den
regulären Traumpalast (Knoten 3321), und die kino-zeit-Seite des IMAX meldet
„Leider ist derzeit kein Programm verfügbar". Auf der Kinoseite trägt zudem
kein Titel ein Formatkürzel — ein Filter wäre dort wirkungslos. Deshalb hängt
hinter `showing einfügen` ein zweiter Abschnitt: Code-Node `IMAX-Wochen`
(zwei URLs) → `Traumpalast holen` → `Traumpalast parsen`
(`07-traumpalast-imax.js`) → `showing einfügen (IMAX)`. Hinten angehängt, weil
`showing leeren` alles Zukünftige wegräumt.

Die Kinowebsite bietet nur zwei Wochen an: Leonberg reicht rund 14 Tage weit,
die übrigen Kinos 21. Eigenschaft der Quelle, kein Fehler. Der IMAX-Parser
wirft deshalb auch nicht bei null Vorstellungen — ein geschlossenes Kino darf
den Lauf für die anderen Häuser nicht kippen.

### Quelle 3 · Innenstadtkinos (Cinema, EM, Gloria)

Die drei Häuser stehen zwar auch bei kino-zeit, aber dort ohne Ticketlink.
Ihre eigene Seite liefert beides — Vorstellungen **und** kinoheld-Links — und
dazu in vielen Fällen die TMDb-Kennung gleich mit.

**`Sitemap holen`** (HTTP Request)

```
GET https://www.innenstadtkinos.de/program/sitemap.xml
Header: User-Agent: Mozilla/5.0 (…) Chrome/140 …
Options -> Response -> Response Format: Text
Options -> Response -> Output Field Name: html
```

Eine Sitemap statt einer Programmübersicht: Sie nennt jede Filmseite
namentlich, ändert sich mit dem Programm und muss nicht geparst, sondern nur
gefiltert werden.

**`Filmseiten planen`** (Code, Run Once for All Items)

```js
const xml = String($json.html || '');
const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
  .map((m) => m[1])
  .filter((u) => /\/de\/programm\/\d+$/.test(u));   // die englischen Fassungen fliegen raus

const eindeutig = [...new Set(urls)];
if (!eindeutig.length) throw new Error('Sitemap ohne /de/programm-Adressen — Struktur geaendert?');
return eindeutig.map((url) => ({ json: { url } }));
```

Der Filter ist zweigeteilt: `/de/` wirft die englischen Fassungen derselben
Seiten weg, `\d+$` alles, was keine Filmseite ist. Der Node protokolliert
beide Zahlen und listet, was er nicht übernommen hat — wächst diese Liste,
hat die Seite etwas Neues.

**`Filmseiten-Schleife`** (Loop Over Items, Batch Size 1) → `Filmseite holen`
(GET `{{ $json.url }}`, Response Format Text) → *Wait* → zurück.
done-Zweig: **`Innenstadtkinos parsen`**.

Der Parser liest die `ScreeningEvent`-Angaben nach schema.org aus der Seite.
Wo ein `sameAs` auf TMDb zeigt, kommt die Kennung ohne Umweg über Suche und
Schiedsrichter — beim Lauf vom 22.09. bei 43 von 56 Filmen.

**`ISK film` → `ISK alias` → `ISK showing`**, alle drei mit
*Execute Once*, `Prefer: resolution=merge-duplicates,return=minimal`,
Authentication *Predefined Credential Type → Supabase API*:

```
ISK film
  POST /rest/v1/film?on_conflict=tmdb_id
  Body: {{ JSON.stringify($json.filme) }}

ISK alias
  POST /rest/v1/title_alias?on_conflict=source_key
  Body: {{ JSON.stringify($('Innenstadtkinos parsen').first().json.aliasse) }}

ISK showing
  POST /rest/v1/showing?on_conflict=cinema_id,starts_at,raw_title
  Body: {{ JSON.stringify($('Innenstadtkinos parsen').first().json.showings) }}
```

Alle drei ziehen ihren Rumpf aus **demselben** Ergebnisobjekt des Parsers,
jeweils aus dem passenden Feld. Nur der erste darf `$json` schreiben: Er steht
direkt hinter dem Parser, also *ist* `$json` dessen Ausgabe. Ab dem zweiten
Node enthält `$json` die Antwort des vorigen Supabase-Aufrufs — dort muss das
Ergebnis über den Node-Namen zurückgeholt werden. Wer das übersieht, schickt
Supabase eine leere oder fremde Liste, und der Node meldet dabei keinen
Fehler. Einheitlich `$('Innenstadtkinos parsen')` in allen dreien wäre
robuster, weil es auch dann noch stimmt, wenn später ein Node dazwischenrutscht.

Die Reihenfolge ist Pflicht: `film` zuerst, weil `title_alias` und `showing`
per Fremdschlüssel darauf zeigen.

> **Warum der erste Node anders aussieht.** `ISK film` steht direkt hinter
> dem Parser und kann deshalb mit `$json` arbeiten. Bei `ISK alias` und
> `ISK showing` liegt mindestens ein Node dazwischen — dort steht im Item nur
> noch die Antwort des vorigen Supabase-Aufrufs, und der Parser muss über
> seinen Namen zurückgeholt werden. Wer `ISK film` später verschiebt oder
> einen Node davorhängt, muss ihn auf dieselbe Schreibweise umstellen.

**Der Nebenfund:** Die Ticket-Links zeigen auf kinoheld und enthalten eine
`showId`. Damit wäre kinoheld als vierte, eigenständige Quelle erreichbar —
auch für Corso, Delphi und atelier, die dieselben Kennungen benutzen.
Dokumentiert, nicht gebaut.

### Aufräumen · `Doppelungen entfernen`

Letzter Node, HTTP Request:

```
POST https://<projekt>.supabase.co/rest/v1/rpc/dedupe_showings
Authentication: Predefined Credential Type -> Supabase API
Settings -> Execute Once: AN
```

Die Funktion steht in `sql/schema.sql`. Sie löscht kino-zeit-Zeilen, für die
eine Direktquelle dieselbe Vorstellung desselben Films im selben Haus zur
selben Minute gemeldet hat. Warum es das braucht und warum nicht schon beim
Schreiben gefiltert wird, steht im README unter „Die Doppelungen, die die
erste Abfrage nicht fand".

### Fertig, wenn

`showing` mehrere hundert Zeilen hat, **15 Kinos** mindestens einmal
vorkommen und die heutigen Zeiten mit dem stimmen, was auf der Kinoseite
steht. Bei 0 Zeilen über alle Seiten wirft der Parser von selbst — das ist
Absicht.

Im Protokoll (Browser-Konsole, F12, nur bei manuellen Läufen) erwartet:

```
Seiten: 84, davon ohne Ergebnis: …
Vorstellungen: … (Rohzeilen …)
Bewusst ausgelassen: Traumpalast Leonberg (ohne IMAX) … | Traumpalast Esslingen …
IMAX Leonberg: … Vorstellungen aus 2 Wochenseiten
Innenstadtkinos: … Vorstellungen aus … Filmseiten
```

und **keine** Zeile `Nicht zugeordnete Kinos`.

Prüfabfragen:

```sql
-- Wer liefert wie viel, und ab wann?
select c.name, s.source, count(*) as vorstellungen,
       min(s.starts_at)::date as ab, max(s.starts_at)::date as bis
  from showing s join cinema c on c.id = s.cinema_id
 where s.starts_at >= now()
 group by 1, 2 order by 1;

-- Quellenqualität: hat die Vorstellung einen Ticketlink?
select s.source,
       count(*)                                          as vorstellungen,
       count(*) filter (where s.booking_url is not null) as mit_link,
       round(100.0 * count(*) filter (where s.booking_url is not null)
             / count(*))                                 as prozent
  from showing s
 where s.starts_at >= now()
 group by 1 order by 4 desc;

-- Doppelungen: muss leer sein (oder nur die Met-Opera-Zeile zeigen).
-- Bewusst OHNE raw_title in der Gruppierung — zwei Quellen schreiben
-- denselben Titel verschieden, und genau daran ist die erste Fassung
-- dieser Abfrage gescheitert.
select c.name, s.starts_at, count(*),
       string_agg(distinct s.raw_title, ' | ') as titel,
       string_agg(distinct s.source, ' + ')    as quellen
  from showing s join cinema c on c.id = s.cinema_id
 where s.starts_at >= now()
 group by 1, 2 having count(distinct s.source) > 1
 order by 1, 2;
```

---

## 5 · Matching (45 Minuten)

Supabase Select auf Vorstellungen ohne Alias (`v_offene_titel`) →
`01-normalize.js` → TMDb-Suche → Set-Node auf `tmdb_results` →
`02-score-decide.js` → Switch auf `decision` → LLM-Node nur im Zweig
`needs_llm` → Merge → `03-merge-llm.js` → Supabase Upsert in `title_alias`.

Verdrahtung und Prompt stehen in `README.md` und `llm-prompt.md`.

> **Gesucht wird mit `searchTitle`, nicht mit `queryTitle`.** Der
> Vergleichstitel ist entschärft — Artikel entfernt, Umlaute umgeschrieben,
> auf ASCII reduziert. Als Suchanfrage taugt er nicht: Am 21.09. lieferten
> alle 17 Anfragen null Treffer, bis der Unterschied auffiel. Und im
> HTTP-Node darf die Anfrage **entweder** über den Parameter-Abschnitt
> `sendQuery` **oder** in der URL stehen — beides zusammen erzeugt doppelte
> Parameter und TMDb antwortet mit `400, status_code: 5`.

**Fertig, wenn** *Vaterland* mit `resolved_by = tmdb` und einer TMDb-ID in
`title_alias` steht. Das ist der Moment, in dem Stufe C misst.

Restbestand prüfen:

```sql
select status, resolved_by, count(*) from title_alias group by 1, 2 order by 3 desc;
select * from v_offene_titel;
```

---

## 6 · Ausspielung (30 Minuten)

Schedule Trigger **08:00** → vier HTTP-Nodes **hintereinander** → Code-Node
`today.json bauen` (`08-today-json.js`) → HTTP-Node schreibt die Datei.

| Reihenfolge | Node | Abruf |
| --- | --- | --- |
| 1 | `Kinos holen` | `/rest/v1/cinema?select=*` |
| 2 | `Watchlist holen` | `/rest/v1/watchlist?select=tmdb_id` |
| 3 | `MUBI holen` | `/rest/v1/mubi_go?...&limit=1` |
| 4 | `Programm holen` | `/rest/v1/v_programm` — URL s. u., **Expression** |

Bei 2, 3 und 4 **Execute Once**, bei 3 zusätzlich **Always Output Data** — eine
leere MUBI-Tabelle liefert sonst null Items, und die Kette bricht dort ab.
`Programm holen` steht zuletzt, weil der Code-Node dessen Zeilen als `$input`
erwartet und die drei anderen über ihren Namen holt; die Namen sind Vertrag.

Die Sicht `v_programm` wurde dafür um `source_key`, `ort`, `kinozeit_node`,
die Watchlist-Felder und die Filmstammdaten erweitert. Ohne `source_key`
gruppiert der Builder alle Vorstellungen zu **einem** Film — ein Fehler, der
nicht wehtut, sondern nur falsch aussieht.

**Node 4 — `Programm holen`.** Das URL-Feld auf **Expression** stellen:

```
https://<projekt>.supabase.co/rest/v1/v_programm?select=*&starts_at=lt.{{ $now.plus({ days: 90 }).toISODate() }}&order=starts_at.asc
```

Drei Bestandteile, drei verschiedene Gründe:

`starts_at=lt.…` begrenzt den Horizont auf 90 Tage. Das ist eine inhaltliche
Entscheidung, und die Zahl ist zweimal bewegt worden. Die Quellen reichen
unterschiedlich weit — kino-zeit rund drei Wochen, die Innenstadtkinos mit
Sonderreihen bis zu **acht Monate** (Met Opera 2026/27, Weird Wednesday,
Konzertfilme). Ganz ohne Grenze bestimmt eine einzelne Opernübertragung im
Juni den angezeigten Zeitraum: `date_to` steht in 2027, und das `dates`-Feld
bekommt über 250 Einträge, von denen fast alle leer sind.

Die erste Fassung schnitt bei 28 Tagen ab und war damit zu eng. Genau die
Sonderreihen, die weit vorausgeplant werden, sind die interessanten Treffer —
*Weird Wednesday: DRIVE* am 04.11., *Rocky* am 03.11.: alte Filme, die nur
einmal laufen, und für die eine Watchlist überhaupt gedacht ist. Ein
Dashboard, das nur vier Wochen zeigt, blendet genau den Fall aus, den es
lösen soll. 90 Tage kosten nichts — von 1133 Zeilen liegen nur gut zwanzig
überhaupt jenseits von vier Wochen — und bringen die Datumsleiste nur um ein
paar verstreute Einträge in Verlegenheit.

> Was auch bei 90 Tagen draußen bleibt: die Met-Opera-Übertragungen im
> Frühjahr 2027 und ein *Weird Wednesday* im Januar. Wer die auch will,
> setzt 150 Tage. Die Grenze ist kein technisches Limit, sondern die
> Antwort auf die Frage „wie weit voraus plane ich einen Kinobesuch".

`order=starts_at.asc` ist die Versicherung gegen die Zeilengrenze. Eine
unsortierte Liste, die abgeschnitten wird, verliert **irgendwelche** Zeilen —
und sieht danach vollkommen plausibel aus. Eine sortierte verliert das Ende,
und das fällt beim ersten Blick auf `date_to` auf. Wo eine Obergrenze
existiert, gehört eine Sortierung dazu, auch wenn die Grenze gerade nicht
greift.

`toISODate()` statt `toISO()`, und das ist kein Schönheitsgrund:
`toISO()` liefert `2026-10-21T10:14:28.979+02:00`. **In einer URL bedeutet
ein Pluszeichen ein Leerzeichen** — Postgres bekommt `…979 02:00` zu sehen
und antwortet mit `22007 invalid input syntax for type timestamp`. Ein
reines Datum hat kein Pluszeichen. (Alternativ `.toUTC().toISO()`, das endet
auf `Z`.)

Der Builder wirft außerdem, wenn `v_programm` die Zeilengrenze der
Supabase-API erreicht — eine halbe Seite ist schlimmer als eine leere, weil
sie richtig aussieht. Die Grenze steht unter *Project Settings → API →
Max rows*; der Schwellwert im Builder muss dazu passen.

> **Das ist kein theoretischer Fall mehr.** Am 23.09.2026, nach
> Veröffentlichung der neuen Kinowoche, standen 1133 Vorstellungen in
> `showing` — 869 aus kino-zeit, 244 aus den Innenstadtkinos, 20 vom
> Traumpalast. Mit der Voreinstellung von 1000 lieferte `Programm holen` eine
> stumm gekappte Liste: `stats.vorstellungen` stand auf exakt 1000, und
> `date_to` endete acht Tage nach dem Start statt nach drei Wochen.
> Aufgefallen ist es **nicht** an der Anzahl — 1000 ließ sich plausibel als
> Ergebnis der Entdopplung erklären —, sondern am Datum: Die Datenbank
> reichte bis 2027, die Datei bis zum 30.09. *Max rows* steht seitdem auf
> 5000, der Schwellwert im Builder ebenso.
>
> Die Lehre: Prüf eine verdächtige Zahl nie an sich selbst. Eine zweite,
> unabhängige Größe aus demselben Datenbestand — hier der Zeitraum —
> entscheidet, eine Erklärung für die erste Zahl nicht.

**Die Reihenfolge der Kinos steht an genau einer Stelle.** Oben in
`08-today-json.js`:

```js
const GRUPPEN_REIHENFOLGE = [
  'arthaus', 'innenstadt', 'corso', 'metropol',
  'cinemaxx', 'ludwigsburg', 'esslingen', 'leonberg'
];
```

Diese Liste sortiert die Filterleiste (`groups`), die Kinoliste (`cinemas`)
**und** die Vorstellungen innerhalb jedes Films. Vorher gab es zwei
Sortierungen, die auseinanderlaufen konnten. Die Werte sind `cinema.group_id`,
nicht die Anzeigenamen — nachzusehen mit
`select distinct group_id, group_name from cinema;`. Eine Gruppe, die hier
fehlt, landet am Ende und wird im Protokoll gemeldet:

```
Gruppenreihenfolge: arthaus > innenstadt > corso > metropol > …
Gruppen ohne feste Position (ans Ende sortiert): …
```

Die zweite Zeile muss leer bleiben. Zusätzlich schreibt der Builder
`group_order` und `cinema_order` in die `today.json`, damit das Dashboard die
Reihenfolge nicht selbst nachbauen muss.

**Ausspielung in zwei Teilen.** Die Daten schreibt der letzte Node in den
öffentlichen Supabase-Bucket (`POST /storage/v1/object/dashboard/data/today.json`,
Header `x-upsert: true` und `cache-control: max-age=60`, Body **Raw** mit
`{{ JSON.stringify($json, null, 1) }}`). Die Seite selbst liegt auf **GitHub
Pages**.

Warum getrennt: Supabase liefert HTML aus öffentlichen Buckets grundsätzlich
als `text/plain` aus — auch wenn man den Content-Type beim Upload
ausdrücklich setzt. Der Browser zeigt dann Quelltext statt Seite. Das ist eine
Schutzmaßnahme des Anbieters, kein Konfigurationsfehler; Storage taugt für
Daten, nicht für Webseiten. Entsprechend lädt das Dashboard die Datei über
ihre absolute URL, nicht relativ.

Zwei Stolpersteine bei Pages: Ohne eine leere Datei `.nojekyll` im Wurzel-
verzeichnis schickt GitHub das Repo durch Jekyll, und der Build scheitert.
Und der Kasten „Your site is live at …" erscheint erst nach dem ersten
erfolgreichen Build — vorher sieht jede Seite des Projekts aus wie ein 404.

**Fertig, wenn** die Seite dieselben Zahlen zeigt wie der lokale Lauf.
Erreicht am 21.09.2026:
https://petratran.github.io/schroedingers-kino/dashboard/

> **`generated_at` ist die billigste Überwachung, die es gibt.** Am 22.09.
> stand dort 09:00 statt 07:00 — der Zeitplan war verstellt, und aufgefallen
> ist es nur, weil der Zeitstempel in der Ausgabe steht. Ein Feld im Ergebnis
> ist günstiger als jede Zeitplanprüfung.

---

## 6b · MUBI GO (automatisch)

Der Film der Woche war lange der einzige Teil der Pipeline, der von Hand
gepflegt wurde. Seit dem 21.09.2026 holt ihn ein eigener Workflow.

**Woher der Titel kommt.** `mubi.com/de/de/go` ist fast vollständig
JavaScript — im ausgelieferten HTML steht der Film nur in den Meta-Angaben:

```html
<meta name="description" content="Film des Tages | Gentle Monster">
```

Das ist dünn, aber es ist die Stelle, die MUBI selbst für Suchmaschinen und
Link-Vorschauen pflegt. Fällt sie weg, wirft der Code-Node — und der
Fehler-Melder schlägt an. Das ist der Punkt: Ein stiller Rückfall auf den
Film der Vorwoche wäre der gefährlichere Fehler.

**Woher die TMDb-Kennung kommt — und warum nicht von TMDb.** MUBI GO ist ein
Kinoticket, der Film läuft also per Definition im Kino. Deshalb sucht der
Node die Kennung im eigenen Titel-Cache (`title_alias`) statt bei TMDb: Dort
stehen genau die Filme, um die es geht, die Kennungen sind bereits geprüft,
und die Fremdschlüsselbedingung auf `film` ist automatisch erfüllt. Läuft der
Film in keinem der erfassten Häuser, nützt die Kennung ohnehin nichts —
`v_programm` verbindet `mubi_go` über `tmdb_id` mit den Vorstellungen.

### Die sieben Nodes

| # | Node | Typ | Das Wichtigste |
| --- | --- | --- | --- |
| 1 | `Täglich 7:45` | Schedule Trigger | Days · Hour 7 · Minute 45 — **nach** Kinoprogramm und Matching |
| 2 | `MUBI-Seite holen` | HTTP Request | s. u. |
| 3 | `Titel-Cache holen` | HTTP Request | Supabase, `title_alias` |
| 4 | `MUBI-Stand holen` | HTTP Request | Supabase, `mubi_go`, **Always Output Data** |
| 5 | `MUBI GO lesen` | Code | Inhalt von `10-mubi-go.js` |
| 6 | `Wechsel?` | If | Boolean: `{{ $json.schreiben }}` ist *true* |
| 7 | `MUBI-Zeile schreiben` | HTTP Request | am **true**-Ausgang von Node 6 |

Verkettet in genau dieser Reihenfolge, eine Linie. Die Node-**Namen** müssen
stimmen: Der Code-Node holt sich seine drei Eingaben über
`$('MUBI-Seite holen')`, `$('Titel-Cache holen')` und `$('MUBI-Stand holen')`.

> **Korrigiert am 22.09.2026.** Vorher lief der Workflow um 05:45, also *vor*
> dem Kinoprogramm, mit der Begründung, er solle früh dran sein. Das war
> falsch herum: `MUBI GO lesen` schlägt den Titel in `title_alias` nach, und
> diese Tabelle füllt der Kinoprogramm-Workflow. Ruft MUBI donnerstags einen
> Film aus, der mit der neuen Kinowoche erst ins Programm kommt, sucht der
> Node in einem Bestand, der ihn noch nicht kennt, und wirft `steht in keinem
> der erfassten Kinoprogramme`. 7:45 liegt nach dem Kinoprogramm (7:00) und
> dem Matching (7:30), das die Tabelle füllt, und vor der Ausspielung um 8:00.

**Node 2 — `MUBI-Seite holen`**

```
Method: GET
URL:    https://mubi.com/de/de/go
Header: User-Agent: Mozilla/5.0 (kompatibel; SchroedingersKino/1.0)
Options -> Response -> Response Format: Text
Options -> Response -> Output Field Name: data
Settings -> Retry On Fail: an
```

**Node 3 — `Titel-Cache holen`**

```
GET https://<projekt>.supabase.co/rest/v1/title_alias
    ?select=raw_title,tmdb_id&tmdb_id=not.is.null&limit=1000
Authentication: Predefined Credential Type -> Supabase API
```

**Node 4 — `MUBI-Stand holen`**

```
GET https://<projekt>.supabase.co/rest/v1/mubi_go
    ?select=valid_from,raw_title,tmdb_id&order=valid_from.desc&limit=1
Settings -> Always Output Data: AN
```

Ohne *Always Output Data* liefert eine leere Tabelle null Items, und die Kette
bricht genau beim ersten Lauf ab — derselbe Stolperstein wie bei Node 3 in
Schritt 6.

**Node 6 — `Wechsel?`** (If)

```
Conditions -> Boolean -> is true
Left Value (Expression):  {{ $json.schreiben }}
```

**Node 7 — `MUBI-Zeile schreiben`** (am *true*-Ausgang)

```
POST https://<projekt>.supabase.co/rest/v1/mubi_go?on_conflict=valid_from
Send Headers: Prefer = resolution=merge-duplicates,return=minimal
Send Body -> Using JSON:  {{ JSON.stringify($json.zeile) }}
```

`$json.zeile`, nicht `$json` — im Item stehen daneben noch `schreiben`,
`titel` und `grund`, und Supabase lehnt unbekannte Spalten ab.

### Was der Lauf tut, wenn nichts passiert ist

Er sagt es. Der Code-Node vergleicht den gelesenen Titel mit der jüngsten Zeile
in `mubi_go` und liefert in beiden Fällen ein Item:

```json
{ "schreiben": false, "titel": "Gentle Monster",
  "grund": "unveraendert: \"Gentle Monster\" seit 2026-09-21", "zeile": null }
```

Geschrieben wird nur am *true*-Ausgang. `valid_from` bleibt dadurch das, was es
sein soll: der Tag, ab dem der Film gilt, nicht der Tag des letzten Laufs. Ein
täglicher Lauf, der jeden Tag eine Zeile schreibt, würde die Angabe
bedeutungslos machen.

**Warum nicht einfach kein Item?** Genau so war die erste Fassung gebaut, und
sie war unbrauchbar: Ein Lauf ohne Ausgabe sieht aus wie ein Lauf, der nicht
funktioniert hat. Die Begründung stand nur in der Browser-Konsole, wo niemand
nachschaut. Ein Lauf, der nichts tut, muss trotzdem sagen können, was er
gesehen hat — sonst prüft man bei jedem Mal von Hand nach, und dann ist nichts
gewonnen.

Deshalb ist der Trigger auch täglich und nicht wöchentlich. **MUBI wechselt
den Film der Woche donnerstags** — das ist Beobachtung aus der Nutzung, keine
Zusage von MUBI, und nirgends dokumentiert. Ein wöchentlicher Lauf müsste
diese Annahme in den Zeitplan gießen und läge bei einer Umstellung eine ganze
Woche daneben, ohne dass es auffällt: Der Node schreibt ja nur bei einer
Änderung. Ein täglicher Lauf merkt den Wechsel an dem Tag, an dem er
passiert, macht `valid_from` dadurch belastbar und kostet an allen anderen
Tagen einen einzigen Seitenabruf.

Wenn nach einigen Wochen in `mubi_go` steht, dass die Wechsel immer auf
denselben Wochentag fallen, kann man den Lauf reduzieren — dann aber mit
Beleg statt mit Vermutung.

### Wenn der Node wirft

Zwei Fälle, beide gewollt:

1. **„MUBI-Seite ohne Meta-Beschreibung"** — MUBI hat die Seite umgebaut.
   `10-mubi-go.js` muss nachgezogen werden.
2. **„… steht in keinem der erfassten Kinoprogramme"** — der Film läuft hier
   nicht, oder die Schreibweise weicht ab. Im ersten Fall ist nichts zu tun,
   im zweiten hilft die Handarbeit unten.

### Rückfallebene: die Zeile von Hand

```sql
insert into mubi_go (valid_from, raw_title, tmdb_id)
select current_date, a.raw_title, a.tmdb_id
  from title_alias a
 where a.raw_title ilike '%<Titel>%'
   and a.tmdb_id is not null
   and exists (select 1 from film f where f.tmdb_id = a.tmdb_id)
 limit 1
on conflict (valid_from) do update
   set raw_title = excluded.raw_title, tmdb_id = excluded.tmdb_id;
```

Kennt `title_alias` den Film nicht, zuerst
`insert into film (tmdb_id) values (<ID>) on conflict do nothing;`.

**Die `tmdb_id` ist der Punkt.** `v_programm` erkennt MUBI GO ausschließlich
über sie; ein Eintrag ohne ID lässt die Kennzeichnung im Dashboard stumm
verschwinden. Der Titelvergleich in `08-today-json.js` fängt das ab, ist aber
Rückfallebene und kein Ersatz.

---

## 7 · Zum Schluss

Jedem Workflow ein **Error Workflow** zuweisen. Ohne das merkst du nicht,
wenn ein Lauf still bricht — und genau das ist der Fehler, der Projekte wie
dieses nach sechs Wochen unbrauchbar macht.

Der Melder ist ein **eigener** Workflow namens `Fehler-Melder`, zwei Nodes:
*Error Trigger* → *HTTP Request* POST auf `/rest/v1/error_log` (Header
`Prefer: return=minimal`, kein `on_conflict`). Body:

```
{
  "workflow": {{ JSON.stringify($json.workflow?.name ?? null) }},
  "message": {{ JSON.stringify($json.execution?.error?.message ?? null) }},
  "node": {{ JSON.stringify($json.execution?.lastNodeExecuted ?? null) }},
  "execution_url": {{ JSON.stringify($json.execution?.url ?? null) }}
}
```

Zwei Stolpersteine beim Zuweisen: Den Workflow, in dem du gerade stehst,
bietet das Dropdown nicht an — der Melder muss also getrennt angelegt sein.
Und ein Workflow, der nur als Entwurf gespeichert ist, bleibt ausgegraut:
erst **Publish**, dann taucht er auf.

Zuweisen unter ⋯ → *Settings* → *Error Workflow*. Im selben Dialog sitzt die
**Timezone** — die wird nicht vererbt, also bei jedem neuen Workflow auf
Europe/Berlin stellen.

Geprüft wird der Melder nur über einen produktiven Lauf (Production-URL bzw.
Schedule), nicht über *Execute workflow* im Editor.

> **Einmal auslösen, bevor man sich darauf verlässt.** Der Melder war
> wochenlang zugewiesen und hatte nie gemeldet — ein Melder, der nie
> gemeldet hat, ist eine Annahme, keine Sicherung. Am 22.09.2026 mit einem
> eingefügten `throw new Error('Test')` geprüft und wieder entfernt. Fünf
> Minuten, und danach weiß man es, statt es zu glauben.

### Woran man am Morgen sieht, dass die Nacht gut war

```sql
-- 1. Hat überhaupt jemand gemeckert?
select * from error_log order by occurred_at desc limit 10;

-- 2. Ist die Datei von heute?  (im Dashboard: Feld generated_at)
-- 3. Stehen alle 15 Häuser im Programm?
select count(distinct cinema_id) from showing where starts_at >= now();
```

Drei Abfragen, zwei Minuten. Was sie nicht abdecken, deckt auch eine längere
Liste nicht ab — dann hilft nur Hinschauen.
