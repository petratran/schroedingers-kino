# Erste n8n-Sitzung — Klickliste

Reihenfolge einhalten. Jeder Schritt hat ein Abbruchkriterium: stimmt das
Ergebnis nicht, lohnt der nächste Schritt nicht.

---

## 0 · Vorher, geht sofort (1 Minute)

Prüf den TMDb-Key an dem Fall, um den sich das halbe Projekt dreht:

```
https://api.themoviedb.org/3/search/movie?query=Vaterland&language=de-DE
```

**Und einmal die Zeitzone setzen.** n8n steht ab Werk auf
`America/New_York`. Ohne `GENERIC_TIMEZONE=Europe/Berlin` (und `TZ` gleich
mit) feuert der Trigger aus Schritt 4 nicht um 06:00, sondern um 12:00 — und
„heute“ ist morgens noch der Vortag. Rechts im Input-Panel jedes Nodes steht,
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

---

## 2 · Credentials in n8n (5 Minuten)

| Credential | Typ | Inhalt |
| --- | --- | --- |
| TMDb | Header Auth | Name `Authorization`, Wert `Bearer <Read Access Token>` |
| Supabase | Supabase API | Host = Projekt-URL, Service Role Secret = service_role-Key |
| LLM | je nach Anbieter | für den Schiedsrichter-Node in Workflow 3 |

Nie einen dieser Werte in einen Code-Node schreiben — Code-Nodes landen im
Workflow-Export, Credentials nicht.

---

## 3 · Workflow 1 · Watchlist-Sync (45 Minuten)

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

Ein Schedule Trigger entfällt hier: der Sync läuft, wenn du den Export
hochlädst.

Ohne n8n macht dasselbe `node pipeline/fetch-tmdb-ids.js`; das Ergebnis landet
in `data/watchlist-tmdb.json` und wird von `build-today.js` eingelesen. Das
Skript setzt fort, ein Abbruch kostet also nichts.

**Fertig, wenn** `watchlist` mindestens 70 der 74 Zeilen hat und jede eine
TMDb-Kennung trägt. Dauer des Erstlaufs: gut anderthalb Minuten bei einer
Anfrage je Sekunde. Probe: *Taxi Driver* muss TMDb **103** bekommen.

---

## 4 · Workflow 2 · Kinoprogramm (45 Minuten)

Schedule Trigger täglich 06:00 → Code-Node **`Abrufplan`** (`wf2-abrufplan.js`,
21 Tage × 4 Orte = 84 Abrufe) → Loop Over Items (Batch Size 1)

* **loop-Zweig:** *Wait* 1 s → HTTP Request auf `{{ $json.url }}`
  (Response Format **Text**, *Put Output in Field* **`html`**, `User-Agent`
  setzen) → zurück auf den Loop.
* **done-Zweig:** Code-Node **`Kinoprogramm parsen`** (`04-code-node.js`,
  Run Once for All Items) → `showing leeren` → `showing einfügen`.

Gelöscht wird **nach** dem Parsen: `DELETE /rest/v1/showing?starts_at=gte.{{
$now.toUTC().toISO() }}`. Bricht der Parser, bleiben die alten Daten stehen,
statt dass das Dashboard leer dasteht. Eingefügt wird in **einem** Request,
Body `{{ JSON.stringify($('Kinoprogramm parsen').all().map(i => i.json)) }}`,
bei beiden Supabase-Nodes in den Settings **Execute Once**.

Der Node-Name `Abrufplan` ist nicht kosmetisch — der Parser holt sich über ihn
Ort und Datum jeder Seite zurück, weil hinter dem HTTP Request nur noch das
HTML im Item steht.

**Leonberg läuft über eine zweite Quelle.** Am 21.09.2026 geprüft: Die
kino-zeit-Ortsseite Leonberg führt nur den regulären Traumpalast (Knoten
3321), und die kino-zeit-Seite des IMAX meldet „Leider ist derzeit kein
Programm verfügbar". Auf der Kinoseite trägt zudem kein Titel ein
Formatkürzel — ein Filter wäre dort wirkungslos. Deshalb hängt hinter
`showing einfügen` ein zweiter Abschnitt: Code-Node `IMAX-Wochen` (zwei URLs)
→ `Traumpalast holen` → `Traumpalast parsen` (`07-traumpalast-imax.js`) →
`showing einfügen (IMAX)`. Hinten angehängt, weil `showing leeren` alles
Zukünftige wegräumt.

Die Kinowebsite bietet nur zwei Wochen an: Leonberg reicht rund 14 Tage weit,
die übrigen Kinos 21. Eigenschaft der Quelle, kein Fehler. Der IMAX-Parser
wirft deshalb auch nicht bei null Vorstellungen — ein geschlossenes Kino darf
den Lauf für die anderen 15 nicht kippen.

**Fertig, wenn** `showing` mehrere hundert Zeilen hat, **alle 16 Kinos**
mindestens einmal vorkommen und die heutigen Zeiten mit dem stimmen, was auf
der Kinoseite steht. Bei 0 Zeilen über alle Seiten wirft der Parser von
selbst — das ist Absicht. Knoten 3321 bleibt leer: Für Leonberg zählt allein
der IMAX-Saal.

Prüfabfrage:

```sql
select c.name, count(*) as vorstellungen,
       min(s.starts_at)::date as ab, max(s.starts_at)::date as bis
  from showing s join cinema c on c.id = s.cinema_id
 group by 1 order by 2 desc;
```

## 5 · Workflow 3 · Matching (45 Minuten)

Supabase Select auf Vorstellungen ohne Alias → `01-normalize.js` →
TMDb-Suche → Set-Node auf `tmdb_results` → `02-score-decide.js` →
Switch auf `decision` → LLM-Node nur im Zweig `needs_llm` →
Merge → `03-merge-llm.js` → Supabase Upsert in `title_alias`.

Verdrahtung und Prompt stehen in `README.md` und `llm-prompt.md`.

**Fertig, wenn** *Vaterland* mit `resolved_by = tmdb` und einer TMDb-ID in
`title_alias` steht. Das ist der Moment, in dem Stufe C misst.

---

## 6 · Workflow 5 · Ausspielung (30 Minuten)

Supabase Select auf die View `v_programm` → Code-Node baut daraus die
Struktur von `data/today.json` → GitHub-API-Node committet die Datei ins
Repo. Das Dashboard lädt sie und ist damit live.

**Fertig, wenn** die Seite dieselben Zahlen zeigt wie der lokale Lauf.

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
