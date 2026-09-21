# Matching-Kaskade für n8n

Drei Code-Nodes plus ein LLM-Node. Die Code-Nodes sind reine Funktionen ohne
Netzzugriff — deshalb lassen sie sich außerhalb von n8n testen, und deshalb
liegt hier ein Test daneben.

```
node test-cascade.js
```

10 Fälle aus dem echten Stuttgarter Programm, alle grün. Wenn du an den
Schwellen drehst, dreh hier und lass den Test laufen, bevor du es in n8n
einträgst.

## Verdrahtung

| # | Node | Typ | Datei |
| --- | --- | --- | --- |
| 1 | Offene Titel holen | Supabase → Select `showing` ohne Alias | — |
| 2 | Titel normalisieren | Code (Run Once for All Items) | `01-normalize.js` |
| 3 | TMDb-Suche | HTTP Request | s. u. |
| 4 | Kandidaten bewerten | Code (Run Once for All Items) | `02-score-decide.js` |
| 5 | Verzweigung | Switch auf `{{ $json.decision }}` | — |
| 6 | Schiedsspruch | Basic LLM Chain + Structured Output Parser | `llm-prompt.md` |
| 7 | Zusammenführen | Merge (Append) | — |
| 8 | Urteil verrechnen | Code (Run Once for All Items) | `03-merge-llm.js` |
| 9 | Speichern | Supabase → Upsert `title_alias` | — |

Node 5 hat drei Ausgänge: `tmdb` geht direkt auf den Merge, `needs_llm` auf den
LLM-Node, `unresolved` ebenfalls direkt auf den Merge (die Zeile wird mit
`status: offen` geschrieben, damit sie nicht jeden Tag erneut abgefragt wird).

## Node 3 — TMDb-Suche

```
GET https://api.themoviedb.org/3/search/movie
    ?query={{ encodeURIComponent($json.queryTitle) }}
    &language=de-DE
    &include_adult=false
```

Die drei Parameter stehen im Node unter *Query Parameters*, nicht in der URL
— siehe die Falle in `tmdb-setup.md`: beides zusammen sendet sie doppelt und
TMDb antwortet mit `400` / `status_code: 5`.

Header `Authorization: Bearer <TMDb v4 Token>` aus dem n8n Credential Store.
Danach ein *Set*-Node, der `{{ $json.results }}` auf das Feld `tmdb_results`
legt — Node 4 erwartet es dort.

Kein Jahrgangs- oder Regionsfilter. Der wäre für aktuelle Starts bequem, würde
aber jede Klassikeraufführung aussortieren.

## Was die Kaskade entscheidet

| Lage | Ergebnis |
| --- | --- |
| ein Kandidat ≥ 0,95, kein Rivale ≥ 0,90 | `tmdb`, wird ausgespielt |
| bester Kandidat 0,60 – 0,95, oder mehrere gleichauf | `needs_llm` |
| alles unter 0,60, oder TMDb liefert nichts | `unresolved` |
| ähnlicher Titel, aber andere Teil-Nummer | kein Treffer, landet in `related` |

Die Teil-Nummer ist eine harte Sperre, kein Abzug. *Practical Magic 2* darf
niemals auf *Practical Magic* fallen, egal wie ähnlich die Titel sind. Statt
dessen entsteht ein `related`-Eintrag mit `relation: vorgaenger` — daraus wird
im Dashboard der Hinweis „den ersten Teil hast du auf der Watchlist".

## Schwellen

Alle vier stehen oben in `02-score-decide.js` im Objekt `T`. Für die Auswertung
im Abschlussprojekt sind das die Stellschrauben, an denen sich Precision und
Recall gegeneinander verschieben lassen.

## Zwei Sicherungen gegen das Modell

`03-merge-llm.js` verwirft jede `tmdb_id`, die nicht in der Kandidatenliste
stand, und deckelt die Confidence des Modells bei 0,95. Ein Schiedsspruch ist
nie so sicher wie ein eindeutiger Titelabgleich.

---

# Kinoprogramm-Parser (kino-zeit.de)

`04-parse-kinozeit.js`, getestet gegen `fixtures/delphi-2026-09-18.html`:

```
node test-parser.js
```

Gegen die Live-Seite am 18.09.2026 geprüft: 45 Vorstellungen, 7 Tage,
13 Film-Fassungs-Blöcke, keine Warnungen.

## Verdrahtung

| # | Node | Typ | Konfiguration |
| --- | --- | --- | --- |
| 1 | Kinoliste | Code oder Set | ein Item je Kino: `cinema_id`, `cinema_name`, `source_url` |
| 2 | Seite holen | HTTP Request | `{{ $json.source_url }}`, Response Format **String**, Header `User-Agent` |
| 3 | Antwort ablegen | Set | `html` = `{{ $json.data }}` |
| 4 | Programm parsen | Code (Run Once for All Items) | `04-parse-kinozeit.js` |
| 5 | Zeitraum leeren | Supabase | `delete from showing where cinema_id = … and date >= today` |
| 6 | Schreiben | Supabase | Insert `showing` |

Reihenfolge in Node 5/6 ist Absicht: erst löschen, dann neu schreiben. Kinos
verschieben Zeiten und nehmen Vorstellungen raus — ein Update würde die
gestrichenen stehen lassen.

## Die Seitenstruktur

```
div.programmwrapper
  h2 > a[href="/node/64039"]     Titel + Fassung, z. B. "Bad Apples (OF)"
  p                              "Genre: … Länge: 114 Min. FSK: 12"
  table.program
    tr.dayofweek > th.spalteN    "Heute / 18.09." … 7 Spalten, heute bis +6
    tr.kino-mit-startzeiten
      td.spalteN > a[/booking/…] > span.startzeit   "20:15"
```

Je Fassung ein eigener Block: *Bad Apples (OF)* und *Bad Apples (OmU)* sind
zwei `programmwrapper` mit derselben node-ID.

## Der beste Fund: die node-ID

Der Titel-Link zeigt auf `/node/64039`. Diese ID ist stabil und gilt
kinoübergreifend — derselbe Film hat im Delphi und im Atelier dieselbe. Damit
ist sie der bessere Cache-Schlüssel für `title_alias` als der Titelstring:

* einmal auf TMDb aufgelöst, nie wieder gefragt — auch nicht, wenn derselbe
  Film nächste Woche unter „(OmU)" statt „(OF)" im Aushang steht,
* kein zweiter LLM-Aufruf für denselben Film in einem anderen Kino,
* und eine manuelle Korrektur gilt sofort überall.

Empfehlung: `title_alias` bekommt `source_node` als Primärschlüssel und
`raw_title` nur noch als Rückfallebene für Quellen ohne eigene ID.

## Was der Parser bewusst tut

**Er wirft, wenn null Vorstellungen herauskommen.** Ein grün durchgelaufener
Workflow mit leerem Ergebnis ist der Fehler, den man wochenlang nicht bemerkt.
Lieber eine rote Ausführung und eine Telegram-Nachricht.

kino-zeit schreibt mal `(OF)` für Originalfassung, mal `(OV)` für Originalversion — gemeint ist dasselbe. Die Tabelle `SPRACHE` bildet beides auf **OV** ab, damit das Kürzel schon in `showings-raw.json` einheitlich ist und die Anzeige nichts zurechtbiegen muss.

**Er schneidet nur bekannte Fassungskürzel ab.** `(OmU)`, `(OF)`, `(3D)` und
ein paar weitere stehen in `FASSUNGEN`. Alles andere in Klammern bleibt am
Titel — sonst würde aus *Heat (1995)* ein *Heat*.

**Er rechnet den Jahreswechsel mit.** Die Seite schreibt nur „05.01."; liegt
das Datum mehr als 60 Tage zurück, ist das nächste Jahr gemeint.

## Eine Seite statt neun Parser

Die Innenstadtkinos brauchen keinen eigenen Parser. kino-zeit hat eine
Stadt-Tagesseite:

```
https://www.kino-zeit.de/kinoprogramm/ort/Stuttgart/tag/18-09-2026
```

Ein Abruf liefert **alle neun Stuttgarter Kinos** für einen Tag — 114
Vorstellungen. Sieben Abrufe decken die ganze Woche ab. Das ersetzt den Plan,
je Kino eine Seite zu holen, und skaliert auf jede weitere Stadt, ohne dass
eine Zeile Code dazukommt.

Der Aufbau ist derselbe wie auf der Kinoseite, mit einem Unterschied: die
Kopfzeile trägt eine zusätzliche Spalte `th.cinema`, und jede Zeile beginnt mit
`<a class="cinema" href="/node/2356">Gloria Kino, Stuttgart</a>`. Der Parser
erkennt das Layout an genau diesem `th.cinema` und zieht Kinoname und Kino-node
dann aus der Zeile statt aus dem Kontext.

Die Kino-node-IDs sind stabil und stehen als Stammdaten in
`pipeline/import-capture.js`:

| node | Kino | MUBI GO |
| --- | --- | --- |
| 2354 | Delphi Arthaus Kino | ja |
| 2357 | atelier am bollwerk | ja |
| 2356 | Gloria | ja |
| 2355 | EM | ja |
| 2812 | Cinema | ja |
| 2586 | Das Metropol | nein |
| 2359 | Corso Cinema International | nein |
| 2667 | CinemaxX Liederhalle | nein |
| 2448 | CinemaxX SI-Centrum | nein |

## Fassung und Format sind zwei Dinge

Multiplexe hängen beides an den Titel, teils doppelt:

| Aushang | Titel | Fassung | Format |
| --- | --- | --- | --- |
| `Bad Apples (OF)` | Bad Apples | OV | — |
| `Her (OV)` | Her | OV | — |
| `Coyote Vs. Acme (MXP 2D) (Deutsch/MXP 2D)` | Coyote Vs. Acme | DF | MXP |
| `Spider-Man … (PLF 2D) (OV/PLF 2D)` | Spider-Man … | OV | PLF |
| `Heat (1995)` | Heat (1995) | — | — |
| `Oh la la 2 - Neue Tests …` | Oh la la 2 - Neue Tests … | — | — |

`splitVersion` schneidet nur Klammern ab, deren Inhalt **vollständig** aus
bekannten Kürzeln besteht, und arbeitet sich dabei von rechts durch. Sonst
verlöre *Heat (1995)* seine Jahreszahl und *Oh la la 2* seine Teil-Nummer —
und damit die Fortsetzungssperre ihren Anker.

## Filme ohne node-ID

Acht der 59 Filme verlinken nicht auf `/node/…`, sondern auf eine andere
Kennung — Reihen und Sondervorstellungen wie *Batman Triple* oder
*Il bene comune*. Dort fällt der Schlüssel auf den normalisierten Titel zurück.
Ohne diesen Fallback stünde *The Uprising* zweimal auf der Seite, weil die
deutsche und die OF-Fassung getrennte Kennungen haben.

## Der Fall „Vaterland" — was der erste echte TMDb-Aufruf gezeigt hat

Abgerufen am 18.09.2026, `search/movie?query=Vaterland&language=de-DE`:
33 Treffer, davon **fünf mit exakt dem Titel „Vaterland"**.

| TMDb-ID | Titel (de) | Originaltitel | Start |
| --- | --- | --- | --- |
| 1437696 | Vaterland | **Ojczyzna** (pl) | 19.06.2026 |
| 96820 | Vaterland | Vaterland | 18.10.2002 |
| 1138987 | Vaterland | Vaterland | 29.10.1992 |
| 11248 | Vaterland | Fatherland | 26.11.1994 |
| 129455 | Vaterland | Fatherland | 02.09.1986 |

Der Film, der gerade in Stuttgart läuft, ist **1437696**. Sein Originaltitel
ist polnisch: *Ojczyzna* — das Wort bedeutet Vaterland. Letterboxd führt ihn
unter dem englischen Titel *Fatherland (2026)*.

Damit ist die Annahme widerlegt, die dem Entwurf zugrunde lag: der deutsche
Verleihtitel lässt sich **nicht** über `original_title` mit dem Watchlist-Titel
verbinden. Hier stehen drei Sprachen nebeneinander — polnisches Original,
englischer Letterboxd-Titel, deutscher Aushangtitel — und kein einziges
TMDb-Feld enthält zwei davon gleichzeitig.

**Was trotzdem funktioniert, und warum die Architektur stimmt:** verglichen
werden nie Titel, sondern TMDb-IDs. Workflow 1 holt die ID der Watchlist über
die Letterboxd-Filmseite, Workflow 3 die ID des Aushangtitels über TMDb. Beide
landen auf 1437696, und die Sprache ist gleichgültig. Der Fall ist damit kein
Sonderfall, sondern der Beleg dafür, dass der Abgleich über IDs laufen muss.

### `language=de-DE` sucht nicht auf Deutsch

> **Teilweise widerlegt am 21.09.2026.** Die Messung unten stimmt, die
> Erklaerung fuer die zehn Ungeloesten nur zur Haelfte. Siehe die Korrektur
> im naechsten Abschnitt.

Der erste vollstaendige Lauf ueber echte Kinodaten (21.09.2026, 82 offene
Titel) hat eine zweite Annahme widerlegt. Die Verteilung war:

| Ausgang | Titel | Anteil |
| --- | --- | --- |
| `tmdb` — ohne Rueckfrage aufgeloest | 63 | 77 % |
| `needs_llm` — Schiedsrichter noetig | 9 | 11 % |
| `unresolved` — kein Treffer | 10 | 12 % |

Die Kaskade erledigt also gut drei Viertel allein, und der teure Teil ist der
kleinste. Nach dem Schiedsrichter steht in `title_alias`:

| Ergebnis | Titel |
| --- | --- |
| sicher, per TMDb allein | 63 |
| sicher, per Schiedsrichter | 8 |
| unscharf, per Schiedsrichter | 1 |
| offen geblieben | 10 |

**71 von 82 aufgeloest, 87 %.** Von den neun Faellen am Modell kam keiner mit
`null` zurueck, und keiner wurde von der Kandidatenpruefung verworfen.

Einschraenkung, die dazugehoert: Acht von neun Urteilen auf `sicher` heisst,
das Modell war durchweg zuversichtlich — nicht, dass es richtig lag. Die
Deckelung auf 0,95 und die Kandidatenliste verhindern erfundene IDs, aber
keine plausiblen Verwechslungen. Eine belastbare Trefferquote fuer die
LLM-Stufe gibt es erst nach einer Stichprobe von Hand.

Interessant sind ausserdem die zehn Ungeloesten. Zwei Gruppen:

**Der Suchstring war zu lang.** *Your Name. - Gestern, heute und fuer immer*
und *Shrek - Der tollkuehne Held (25 Jahre)* stehen bei TMDb unter ihren
kurzen Titeln. Das Kino haengt einen Zusatztitel oder einen Jubilaeumshinweis
an, und `queryTitle` schickt ihn mit. „25 Jahre" steht in keiner Token-Liste
von `01-normalize.js` — eine echte Luecke.

**Der deutsche Titel ist bei TMDb nicht suchbar.** *Nur getraeumt* ist dort
`1404684` unter dem franzoesischen Original *Juste une illusion*, *Shaun das
Schaf – Spuk im Kuerbisfeld* ist `1477104` unter *Shaun the Sheep: The Beast
of Mossy Bottom*. Beide Filme existieren, beide sind ueber ihren deutschen
Aushangtitel nicht auffindbar: **`language=de-DE` bestimmt nur die Sprache
der Antwort, nicht die der Suche.** Gesucht wird gegen Original- und
englischen Titel.

Das ist der Vaterland-Fall von der anderen Seite. Dort rettete die TMDb-ID
von der Letterboxd-Seite; hier gibt es keine solche Bruecke, und ein
gekuerzter Suchstring hilft auch nicht weiter.

**Was hilft, und was bewusst nicht gemacht wird:** Naheliegend waere, den
Titel generell am ersten Gedankenstrich abzuschneiden. Bei *Die Tribute von
Panem - The Hunger Games* ginge das gut; bei *Shaun das Schaf - Spuk im
Kuerbisfeld* bekaeme man Treffer fuer irgendeinen Shaun-Film, mit hoher
Aehnlichkeit, weil der Vergleich gegen den gekuerzten Titel liefe. Genau der
falsche Treffer, vor dem der Prompt warnt.

Sicher wird es, wenn der Zweitversuch **nur die Suche kuerzt, nicht den
Vergleich**: Die Kandidaten der Kurzsuche werden weiterhin gegen den vollen
normalisierten Titel bewertet. Fuer die Titel-Bruecke (deutsch -> Original)
kommen Wikidata oder das Modell in Frage, in beiden Faellen mit derselben
maschinellen Gegenprobe ueber `/movie/{id}/alternative_titles`: Steht der
deutsche Aushangtitel dort als Nebentitel, ist die Zuordnung bewiesen statt
geraten.

### Korrektur: nicht die Schnittstelle, der Suchtitel (21.09.2026)

Nach dem Anschluss der dritten Quelle stand *Shrek – Der tollkuehne Held*
zweimal auf dem Dashboard — einmal von den Innenstadtkinos mit `tmdb_id 808`,
einmal von kino-zeit ohne Kennung. Die Ursachensuche hat den Abschnitt oben
zur Haelfte umgeworfen.

**Erstens** war die aufgeloeste Zeile nie eine erfolgreiche Suche. Der
Innenstadtkinos-Adapter liest die Kennung aus dem `sameAs`-Feld der Seite und
schreibt sie mit `resolved_by: 'tmdb'` weg. Beide Zeilen sahen in der Tabelle
gleich aus, aber nur eine war ueberhaupt bei TMDb. Eine Kennung aus der Quelle
und eine Kennung aus der Suche sollten kuenftig unterscheidbar sein —
derselbe Wert in `resolved_by` verdeckt zwei sehr verschiedene Beweislagen.

**Zweitens**, und das ist der eigentliche Befund: Die Suche bekam
`queryTitle` — den **Vergleichstitel**. Der ist fuer den Abgleich gebaut:
Umlaute ausgeschrieben, Artikel entfernt, Satzzeichen weg, alles klein. Als
Suchanfrage ist er unlesbar. Die Gegenprobe, beide Abfragen am selben Tag:

| Anfrage | Ergebnis |
| --- | --- |
| `query=shrek tollkuehne held` | `total_results: 0` |
| `query=Shrek - Der tollkühne Held` | `808` *Shrek – Der tollkuehne Held*, `809` *Shrek 2* |

Alle 17 offenen Titel des Laufs kamen mit `results: []` zurueck — und alle
sieben darunter, die einen echten Film bezeichnen, enthalten einen Umlaut.
Keiner der zehn, die keinen Film bezeichnen, enthaelt einen. Die
`ue`/`oe`-Schreibweise war der gemeinsame Nenner.

**Damit ist die Aussage „`language=de-DE` bestimmt nur die Sprache der
Antwort, nicht die der Suche" vollstaendig widerlegt.** Mit der
Originalschreibweise liefert dieselbe Schnittstelle am selben Tag fuer alle
sieben Titel einen Treffer — darunter genau die beiden, auf die der alte
Befund gebaut war:

| Aushangtitel | gefunden | TMDb-`title` | `original_title` |
| --- | --- | --- | --- |
| Nur getraeumt | `1404684` | Nur getraeumt | Juste une illusion |
| Shaun das Schaf - Spuk im Kuerbisfeld | `1477104` | Shaun das Schaf - Spuk im Kuerbisfeld | Shaun the Sheep: The Beast of Mossy Bottom |
| Your Name. - Gestern, heute und fuer immer | `372058` | Your Name. - Gestern, heute und fuer immer | Kimi no na wa. |
| Das getraeumte Abenteuer | `1013822` | Das getraeumte Abenteuer | (deutsch) |
| Luegen ueber meine Mutter | `1452237` | Luegen ueber meine Mutter | (deutsch) |
| Toedliche Weihnachten – The Long Kiss Goodnight | `11412` | Toedliche Weihnachten | The Long Kiss Goodnight |
| Shrek - Der tollkuehne Held (25 Jahre) | `808` | Shrek - Der tollkuehne Held | Shrek |

TMDb durchsucht die deutschen Verleihtitel also sehr wohl. *Nur getraeumt*
war nie unauffindbar — es wurde nur nie danach gefragt. Die geplante
Titel-Bruecke ueber Wikidata und die Kurztitel-Zweitsuche sind damit vorerst
gegenstandslos: Beide waren Loesungen fuer ein Problem, das es nicht gab.

**Die Trennung, die daraus folgt:** `normalizeTitle()` liefert jetzt zwei
Titel. `norm`/`queryTitle` bleibt der Vergleichstitel, neu ist `searchTitle` —
Reihenname und Anlassklammer entfernt, Fassungsangaben in Klammern entfernt,
sonst Originalschreibweise. Node 3 fragt damit ab, Node 4 vergleicht
unveraendert gegen `norm`.

```
"Shrek - Der tollkühne Held (25 Jahre)"  ->  "Shrek - Der tollkühne Held"
"Pressure (OmU)"                         ->  "Pressure"
"Avengers: Endgame Extended"             ->  "Avengers: Endgame"
"The Lord of the Rings"                  ->  "The Lord of the Rings"
```

Das letzte Beispiel erklaert die eigene Tokenliste `SUCH_TOKENS`: `of` steht
in `VERSION_TOKENS` fuer „Originalfassung". Im Vergleich ist das harmlos, weil
beide Seiten gleich behandelt werden — in einer Suchanfrage zerlegt es
englische Titel.

### Die Frage vor der Frage: bezeichnet der Titel ueberhaupt einen Film?

Derselbe Lauf hat zwei Faelle nebeneinandergestellt, die wie zwei
Verhaltensweisen des Modells aussehen und in Wahrheit dieselbe sind.

*Sneak* (Ueberraschungsvorstellung, der Film wird nicht genannt) ging mit 78
Kandidaten an den Schiedsrichter und kam mit `confidence 0.000`,
`status = offen` zurueck — die erste Enthaltung im Betrieb.

*Horror Classics* (ein Programmformat, kein Film) ging mit einem Kandidaten
hin und kam mit `1383612` „The Best of All Time Horror Classics" und 0,66
zurueck. Die Begruendung des Modells:

> „Der Aushangtitel entspricht dem zentralen Titelbestandteil des Kandidaten;
> der andere Kandidat ist ein japanischer Anthologiefilm ohne erkennbare
> Titeluebereinstimmung."

Diese Begruendung ist **richtig**. Der Titel stimmt tatsaechlich ueberein.
Falsch ist die Frage, die wir gestellt haben. Der Prompt fragt: *Welcher
dieser Kandidaten passt zum Titel?* — nicht: *Bezeichnet dieser Titel
ueberhaupt einen Film?* Die Enthaltung bei *Sneak* war also kein Urteil
ueber den Charakter des Titels, sondern die Folge davon, dass kein Kandidat
dem String aehnlich sah. Haette TMDb dort einen Film namens „Sneak"
geliefert, waere er genommen worden.

Ein Modell beantwortet die gestellte Frage, nicht die gemeinte. Die zweite
Frage gehoert deshalb **vor** den Schiedsrichter, in Code, der immer gleich
antwortet: `keinFilmtitel()` in `02-score-decide.js` bricht ab, wenn nach dem
Normalisieren nichts uebrig bleibt (*Sneak*, *SNEAK 1340*) oder genau ein
bekannter Reihenname (*Horror Classics*, *Sondervorstellung*). Beide Faelle
stehen als Test in `test-cascade.js`, zusammen mit der Gegenprobe, dass ein
Reihenname *mit* Film dahinter weiterhin aufgeloest wird (23/23).

Die Vertrauensgrenze hat den Fehler uebrigens nicht verhindert, nur
abgemildert: 0,66 landet auf `unscharf` statt `sicher`. Der Titel stand
trotzdem auf der Seite. Eine Schwelle sortiert schwache Urteile aus — kein
falsch gestelltes Problem.

**Die Lehre fuer die Arbeit:** Ein Normalisierer, der fuer den Vergleich
gebaut ist, darf nicht ungeprueft als Suchanfrage weiterverwendet werden. Der
Fehler war nicht sichtbar, weil er nur Titel mit Umlauten traf — und die
waren in der ersten Messung in der Minderheit. Dass er ueberhaupt auffiel,
liegt an der dritten Quelle: Erst als zwei Quellen denselben Film lieferten,
wurde der Unterschied zwischen „nicht gefunden" und „gar nicht erst gesucht"
sichtbar.

### Stand nach der Korrektur (21.09.2026)

| | erste Messung | nach der Korrektur |
| --- | --- | --- |
| Titel gesamt | 82 | 142 |
| per Kaskade aufgeloest | 63 | 118 |
| per Schiedsrichter aufgeloest | 8 | 13 |
| unscharf | 1 | 0 |
| offen | 10 | 11 |
| **Quote** | **87 %** | **92 %** |

Die Zahlen sind nicht direkt vergleichbar — zwischen beiden Messungen kamen
zwei Quellen dazu, und der Bestand wuchs von 82 auf 142 Titel. Aussagekraeftig
ist das Verhaeltnis: Der Anteil der Faelle, die das Modell braucht, ist mit
rund 9 % stabil geblieben, obwohl sich die Datenmenge fast verdoppelt hat und
die neue Quelle die unsauberste Titelschreibweise der drei liefert.
`unscharf` und die eine ausgebliebene LLM-Antwort sind verschwunden, weil die
betreffenden Titel gar nicht mehr beim Modell landen.

Die elf Offenen sind kein Rest, der noch abgearbeitet werden muesste:

- **vier** bezeichnen keinen Film (`Sneak`, `SNEAK 1340`, `Sondervorstellung`,
  `Met Opera: Cosi fan tutte`) — hier ist „offen" das richtige Ergebnis,
  und `keinFilmtitel()` sorgt dafuer, dass sie erst gar nicht gefragt werden.
- **sechs** stammen von den Innenstadtkinos, die Reihenname und Filmtitel ohne
  Trennzeichen in ein Feld schreiben (`HIMMELSSTREIFEN Innere Emigranten`,
  `CineLounge BITTERES FEST`, `ARCADIA Kalimera e.V.` …).
- **einer** ist ein Grenzfall zwischen beidem.

**Nachtrag am selben Abend.** Die zweite Gruppe ist keine Luecke des
Verfahrens, sondern eine fehlende Liste: Fuer `CineLounge`, `HIMMELSSTREIFEN`
und `KINOTOUR & PREVIEW` ist von Hand bestaetigt, dass der Reihenname vorn und
der Film dahinter steht — damit greift dieselbe Regel wie bei
`Weird Wednesday`, und die drei stehen jetzt in `REIHEN`. Fuenf Aushangtitel
loesen sich dadurch auf und fallen mit Eintraegen zusammen, die ohnehin schon
auf der Seite standen (*Bitteres Fest*, *Liebe braucht keine Ferien*,
*Steckerlfischfiasko*, *Eine Krankheit wie ein Gedicht*).

`ARCADIA Kalimera e.V.` bleibt bewusst offen: Ob *Arcadia* die Reihe und
*Kalimera e.V.* der Veranstalter ist oder umgekehrt, geht aus dem Feld nicht
hervor. Eine Liste, die nur eingetragene Namen abschneidet, ist der Preis
dafuer, dass sie keine halben Filmtitel frisst — ein ungeprueftes Muster wird
nicht aufgenommen, auch wenn es plausibel aussieht.

Eine hoehere Quote waere ab hier nur noch durch Raten zu haben.

**Nachtrag, spaeter am Abend.** Nicht durch Raten — aber durch Nachfragen.
Petra hat die sechs Innenstadtkinos-Titel von Hand aufgeloest, und es waren
keine sechs Einzelfaelle, sondern zwei Muster:

| Aushangtitel | Reihe / Veranstalter | Film |
| --- | --- | --- |
| CineLounge BITTERES FEST | CineLounge | Bitteres Fest |
| CINELOUNGE Steckerlfischfiasko | CineLounge | Steckerlfischfiasko |
| CineLounge LIEBE BRAUCHT KEINE FERIEN | CineLounge | Liebe braucht keine Ferien |
| HIMMELSSTREIFEN Innere Emigranten | Himmelsstreifen | Innere Emigranten |
| KINOTOUR & PREVIEW: EINE KRANKHEIT … | Kinotour & Preview | Eine Krankheit wie ein Gedicht |
| ARCADIA Kalimera e.V. | Kalimera e.V. (Veranstalter) | Arcadia |

Die ersten fuenf sind das Muster von „Weird Wednesday": Reihe vorn, Film
dahinter. Sie kosten drei Eintraege in `REIHEN`. Der sechste steht andersherum
— der Veranstalter haengt hinten dran — und dafuer gibt es eine Regel, die
ohne Liste auskommt: Ein eingetragener Verein ist nie Teil eines Filmtitels.
`stripVeranstalter()` schneidet ein abschliessendes „… e.V." ab, laesst den
Titel aber unveraendert, wenn danach nichts uebrig bliebe.

**Der Punkt fuer die Arbeit:** Welcher Teil des Feldes die Reihe ist und
welcher der Film, steht nirgends in den Daten. Weder Zeichensetzung noch
Gross-/Kleinschreibung verraten es — „CINELOUNGE Steckerlfischfiasko" und
„ARCADIA Kalimera e.V." sehen identisch aus und sind genau spiegelverkehrt
aufgebaut. Das ist Ortskenntnis, kein Rechenproblem. Ein Modell haette hier
geraten und waere, wie bei *Horror Classics*, mit einer gut begruendeten
falschen Antwort zurueckgekommen. Die gepflegte Liste ist nicht die
unelegante Loesung, sondern die einzige ehrliche: Sie macht sichtbar, was
jemand wissen musste.

**Ergebnis des Nachtrags:** Von elf offenen Titeln bleiben fuenf — *Sneak*,
*SNEAK 1340*, *Sondervorstellung*, *Horror Classics* und die Met-Opern-
Uebertragung. Alle fuenf bezeichnen keinen Film. **137 von 142 aufgeloest,
96 %**, und der Rest ist kein Rest mehr, sondern die Antwort auf eine Frage,
die das Kino nicht beantwortet: Welcher Film laeuft in der Ueberraschungs-
vorstellung? — Das weiss vor Beginn niemand, und das ist der Punkt daran.

### Gleichstand entscheidet der Kinostart, nicht das Modell

Fünf titelgleiche Kandidaten hätte die Kaskade an den LLM-Node geschickt.
Dafür braucht es ihn aber nicht: von den fünf läuft genau einer zum
Vorstellungstermin im regulären Einsatz. Die Regel steht jetzt in
`02-score-decide.js`:

> Bei Gleichstand gewinnt der Kandidat, dessen Kinostart im Fenster von
> 15 Monaten vor bis 3 Monaten nach dem Vorstellungstermin liegt —
> aber nur, wenn genau einer darin liegt.

**Im Betrieb bestaetigt, 21.09.2026.** Der erste echte Lauf von Workflow 3
loest *Vaterland* genau so auf: `tmdb_id 1437696`, Konfidenz 0,970,
`resolved_by = tmdb`, Begruendung „5 Titelgleiche, aber nur »Vaterland« (2026)
laeuft zum Termin im regulaeren Einsatz". Der LLM-Node wurde fuer diesen Fall
nicht gebraucht. Damit ist die Regel nicht mehr nur plausibel, sondern an dem
Fall gemessen, fuer den sie geschrieben wurde.

Das Fenster ist nach hinten offen genug für lange Laufzeiten und nach vorn für
Previews: *Dune: Part Three* läuft am 15.12. als Vorpremiere, drei Tage vor dem
offiziellen Start. Liegt kein Kandidat im Fenster — der Normalfall bei
Klassikerreihen — bleibt alles wie bisher und der LLM-Node entscheidet.

Ergebnis: ein LLM-Aufruf weniger, eine reproduzierbare Entscheidung mehr.
Die echte TMDb-Antwort liegt als `fixtures/tmdb-vaterland.json` im Test.

### Die Dublette, die erst drei Quellen sichtbar machen (21.09.2026)

Mit der dritten Quelle stand derselbe Film zweimal auf der Seite: *Shrek – Der
tollkühne Held* von den Innenstadtkinos und *Shrek – Der tollkühne Held
(25 Jahre)* von kino-zeit. Die Prüfung zeigt, dass nicht die doppelte Zeile
das Problem ist, sondern die halbe Auflösung:

| `raw_title` | Quelle | `tmdb_id` | Status |
|---|---|---|---|
| Shrek - Der tollkühne Held | innenstadtkinos | 808 | sicher |
| Shrek - Der tollkühne Held (25 Jahre) | kino-zeit | – | offen |
| The Uprising | kino-zeit | 977942 | sicher |
| The Uprising - Für die Freiheit | innenstadtkinos | 977942 | sicher |

*The Uprising* steht zweimal in `showing` und trotzdem einmal auf dem
Dashboard: beide Schreibweisen zeigen auf dieselbe `tmdb_id`, und der Builder
gruppiert über `tmdb:<id>`. Unterschiedliche Aushangtitel sind also kein
Fehler, solange beide aufgelöst sind — die Vereinheitlichung passiert über die
Kennung, nicht über den Text. Genau deshalb fällt *Shrek* auseinander: ein
Eintrag hat die Kennung, der andere nicht, und ohne Kennung ist der Rohtitel
der Gruppierungsschlüssel.

Ursache ist der Zusatz „(25 Jahre)". Er ist dasselbe wie die Jahreszahl bei
„TAXI DRIVER (1976)": eine Angabe zum Anlass der Vorstellung, kein Teil des
Namens. `splitKlammern()` in `01-normalize.js` entfernt ihn jetzt zusammen mit
der Jahresklammer — eng gefasst über eine Liste (`25 Jahre`, `25 Years`,
`25th Anniversary`, `Jubiläum`), nicht über die allgemeine Regel „letzte
Klammer weg": Bei *Borat Subsequent Moviefilm (Delivery of Prodigious Bribe)*
gehört die Klammer zum Titel. Beide Fälle stehen als Test in
`test-cascade.js` (20/20).

Der Befund gehört zur Quellenlage: Eine Dublettenprüfung über
`(cinema_id, starts_at)` findet sie **nicht**, weil das Datenmodell keine Säle
kennt — zwei Filme um 20:00 Uhr im selben Haus sind der Normalfall, nicht die
Ausnahme. Sichtbar wird die Dublette erst über den aufgelösten Film.

---

# Die Watchlist anreichern — und warum das der größere Hebel ist

Der Letterboxd-Export hat vier Spalten: Datum, Anzeigetitel, Jahr, URI. Der
Anzeigetitel ist bei 29 von 74 Filmen **nicht** der Originaltitel.

Letterboxd hat je Film einen JSON-Endpunkt:

```
GET https://letterboxd.com/film/<slug>/json/
```

```json
{ "id": 1315318, "name": "Fatherland", "originalName": "Ojczyzna",
  "releaseYear": 2026, "runTime": 82, "slug": "fatherland-2026",
  "directors": [{ "name": "Paweł Pawlikowski" }] }
```

Ein kleiner Aufruf je Film, strukturiert, kein HTML-Parsen. Die Slugs stehen
im `data-item-slug`-Attribut auf den Watchlist-Seiten; der `lid` darin ist
derselbe Code wie in der `boxd.it`-URL des Exports, die beiden Quellen lassen
sich also verlustfrei verbinden.

**Was die Anreicherung bringt:** aus einem Titel werden vier Merkmale.

| Merkmal | Bei Sprachwechsel brauchbar |
| --- | --- |
| Anzeigetitel | nein |
| **Originaltitel** | ja, wenn das Kino ihn verwendet |
| **Laufzeit** | ja, sprachunabhängig |
| **Jahr** | ja, sprachunabhängig |

Die Watchlist von savoy_truffle zeigt, dass das kein Randfall ist: 29 von 74
Filmen haben einen abweichenden Originaltitel — koreanisch, japanisch,
polnisch, estnisch. Ein reiner Titelabgleich verliert bei denen jede Chance,
sobald ein Kino den deutschen oder englischen Verleihtitel plakatiert.

## 05-watchlist-match.js

Läuft **vor** der TMDb-Kaskade und kennt drei Ausgänge:

| Ergebnis | Bedingung | Folge |
| --- | --- | --- |
| `sicher` | Titel ≥ 0,95, oder Titel ≥ 0,86 mit passender Laufzeit | wird ausgespielt |
| `verdacht` | kein Titeltreffer, aber Laufzeit und Jahr passen | geht an TMDb |
| `kein_treffer` / `mehrdeutig` | alles andere | Ende |

Der Fall, um den es geht:

```
Aushang    "Vaterland", 82 Min, Termin 18.09.2026
Watchlist  "Fatherland" / "Ojczyzna", 2026, 82 Min
→ verdacht · identische Laufzeit (82/82 Min) und Jahrgang 2026
```

**Warum `verdacht` und nicht `sicher`:** weil die Laufzeit allein trügt.
*Adams Acht* dauert 124 Minuten, *Colony* von der Watchlist 123 — beide von
2026, und sie haben nichts miteinander zu tun. Der Zweig entscheidet deshalb
nichts, sondern reicht den Fall an TMDb weiter, wo die ID die Frage endgültig
beantwortet. Genau dieser Fehler stand vor der Korrektur im Test.

Der Gewinn liegt trotzdem auf der Hand: Die TMDb-Kaskade bekommt nicht mehr
alle 93 Aushangtitel, sondern nur die, bei denen ein Treffer überhaupt
plausibel ist — und sie bekommt mit Laufzeit, Jahr und Regie gleich die
Merkmale mit, die einen Gleichstand auflösen.

## Nebenbefund: Nicht-lateinische Schriften

`squash` hat vorher `[^a-z0-9]` entfernt und damit koreanische, japanische
und kyrillische Titel in leere Strings verwandelt — „괴물" wurde zu "". Jetzt
steht dort `[^\p{L}\p{N}]` mit `u`-Flag. Bei einer Watchlist mit Bong Joon Ho
und Park Chan-wook ist das kein Schönheitsfehler, sondern ein Drittel der
Liste. Die Änderung gilt in allen drei Modulen.

## Die TMDb-Kennung steht auf der Letterboxd-Seite

Die Watchlist-Seite des Abgleichs braucht **keine Titelsuche**. Jede
Letterboxd-Filmseite trägt die TMDb-Kennung selbst — einmal als Attribut
`data-tmdb-id`, einmal als sichtbarer Link auf `themoviedb.org/movie/<id>`.
Gegengeprüft am 20.09.2026 an *Taxi Driver*: TMDb 103, IMDb tt0075314.

Der Hinweis stammt aus `marcelbusch/tmdb-letterboxd-importer` (90 Zeilen Python,
vollständig gelesen: CSV einlesen, Seiten abrufen, zwei reguläre Ausdrücke,
CSV schreiben — kein Fremdcode, der irgendwo hinschreibt). Übernommen ist das
Verfahren, nicht der Code: Das Skript dort erzeugt eine Importdatei für TMDb,
hier wird eine Zuordnungstabelle für die Pipeline gebraucht.

`n8n/06-letterboxd-tmdb.js` liest beide Fundstellen — bewusst beide, damit ein
Umbau der Seite nicht sofort alles verliert — und liefert `null` statt `-1`,
wenn nichts zu finden ist. Neun Tests in `n8n/test-tmdb-ids.js`.
`pipeline/fetch-tmdb-ids.js` holt damit die Seiten (eine Anfrage je Sekunde,
fortsetzbar) und schreibt `data/watchlist-tmdb.json`. `build-today.js` hängt die
Kennungen an jeden Treffer, sobald die Datei da ist.

**Was das für die Kaskade heißt.** Die Unschärfe verschwindet auf einer der
beiden Seiten vollständig: Die Watchlist liefert exakte Kennungen, kein
Titelvergleich über Sprachgrenzen, kein Schiedsrichter, kein
Vaterland/Ojczyzna-Problem. Unscharf bleibt allein die Kinoseite — der deutsche
Verleihtitel von kino-zeit muss weiterhin über die TMDb-Suche aufgelöst werden.
Stufe C misst damit nur noch einen Übergang statt zwei.

**Robots.** letterboxd.com/robots.txt sperrt KI-Crawler (ClaudeBot, GPTBot und
weitere) vollständig aus; für den allgemeinen Agenten sind die `/film/`-Seiten
offen, ein Crawl-delay ist nicht gesetzt. Das Skript läuft deshalb auf deinem
Rechner als gewöhnlicher Abruf, nicht hier als Bot — aus dieser Umgebung
beantwortet die Ausgangs-Policy Verbindungen zu letterboxd.com ohnehin mit 403.
