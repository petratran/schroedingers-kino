# Gemini — Prompt für dieselbe Präsentation

10 Minuten · gemischtes Publikum (Prüfungskommission + Kurskollegen) ·
Live-Demo von rund 90 Sekunden in der Lösungsphase.

---

## Warum der Prompt anders aussehen muss

Napkin und Gemini lösen zwei verschiedene Hälften derselben Aufgabe.

**Napkin bekommt Inhalt und liefert Form.** Es visualisiert, was du
hineinschreibst. Es erfindet wenig, weil es wenig erfinden soll — und
deshalb darf der Prompt dort im Wesentlichen aus deinem fertigen Text
bestehen.

**Gemini bekommt Material und liefert Inhalt *und* Form.** Es schreibt,
kürzt, formuliert um, ergänzt „passende" Beispiele und rundet Zahlen auf
glatte Werte. Das ist bei einer Abschlussarbeit die gefährlichere
Eigenschaft: Eine erfundene Zahl auf einer Folie, die du selbst vorträgst,
ist schlimmer als eine fehlende Folie.

Der Gemini-Prompt braucht deshalb drei Dinge, die der Napkin-Prompt nicht
braucht: eine **Rolle**, ein ausdrückliches **Erfindungsverbot** mit
Quellenbindung, und einen **Selbstprüfungsschritt** am Ende. Dafür kann
Gemini etwas, das Napkin nicht kann — Sprechnotizen mit Zeitbudget.

Zwei Wege, je nachdem womit du arbeitest:

- **Weg A — Gemini-App:** ein langer Prompt, Ergebnis ist Folientext plus
  Sprechnotizen. Den überträgst du danach nach Napkin, in Google Slides oder
  PowerPoint. Das ist der Weg, den ich empfehle.
- **Weg B — Gemini direkt in Google Slides:** kurze Prompts pro Folie. Gut
  fürs Layout, schlecht für den roten Faden. Prompts dafür stehen weiter
  unten.

---

## Weg A · Der Hauptprompt für die Gemini-App

> **Rolle:** Du bist Dramaturg für Fachvorträge. Du strukturierst
> Präsentationen nach einem Spannungsbogen und schreibst Folientexte, die
> gesprochen funktionieren — nicht gelesen.
>
> **Aufgabe:** Erstelle den vollständigen Folientext samt Sprechnotizen für
> einen 10-minütigen Vortrag über mein Abschlussprojekt.
>
> **Wichtigste Regel — bitte wörtlich befolgen:**
> Alle inhaltlichen Aussagen, Beispiele und Zahlen stammen ausschließlich
> aus dem Material, das ich dir mitgebe. Du erfindest nichts hinzu: keine
> zusätzlichen Beispiele, keine geschätzten Kennzahlen, keine
> Branchenvergleiche, keine Zitate. Du rundest keine Zahl und formulierst
> keine Zahl um. Wenn dir für eine Folie Material fehlt, schreibe an die
> Stelle `[FEHLT: was genau]` statt etwas zu ergänzen. Diese Regel ist
> wichtiger als Vollständigkeit.
>
> **Publikum:** Prüfungskommission einer KI-Manager-Weiterbildung und
> Mitlernende aus demselben Kurs. Technisch interessiert, aber nicht alle
> mit Programmiererfahrung. Fachbegriffe sind erlaubt, wenn sie beim ersten
> Auftreten in einem Halbsatz erklärt werden.
>
> **Sprache:** Deutsch, direkt und sachlich, keine Werbesprache, keine
> Superlative, keine Ausrufezeichen. Kurze Hauptsätze. Verben statt
> Substantivierungen.
>
> **Dramaturgie:** vier Phasen mit festen Zeitfenstern. Der Spannungsbogen
> steigt bis zum Ende der Herausforderung und fällt dann ab. Halte dich
> genau an diese Verteilung — sie ist anteilig aus einem 25-Minuten-Raster
> skaliert:
>
> | Phase | Zeit | Folien | Ziel |
> | --- | --- | --- | --- |
> | Set-Up | 0:00–1:30 | 2 | Interesse wecken |
> | Herausforderung | 1:30–4:30 | 3–4 | Dringlichkeit schaffen |
> | Lösung | 4:30–8:00 | 3 + Demofolie | Überzeugen |
> | Call to Action | 8:00–10:00 | 2 | Handeln auslösen |
>
> In der Lösungsphase liegt eine Live-Demo von 90 Sekunden. Plane dafür eine
> reine Übergangsfolie mit dem Wort „Demo" und der URL — ohne Inhalt, weil
> das Publikum sonst mitliest statt zuzuschauen. Die 90 Sekunden gehen vom
> Folienbudget der Lösungsphase ab, nicht obendrauf.
>
> **Ausgabeformat:** eine Folie nach der anderen, jede genau so aufgebaut:
>
> ```
> FOLIE <Nr> · <Phase> · <Zeitfenster, z. B. 1:30–2:15>
> Titel:        <maximal 8 Wörter>
> Stichpunkte:  <höchstens 3, je maximal 12 Wörter, keine ganzen Sätze>
> Visual:       <ein Satz: welche Art Darstellung und warum — Diagramm,
>                Gegenüberstellung, Tabelle, Zahl; keine Deko>
> Sprechnotiz:  <was ich sage, 40–90 Wörter, ausformuliert>
> Beleg:        <woher die Aussagen dieser Folie stammen>
> ```
>
> **Nach der letzten Folie** gib zwei Listen aus:
> 1. **Zahlenprüfung:** jede Zahl, die in der Präsentation vorkommt, mit der
>    Stelle im Material, aus der sie stammt.
> 2. **Lücken:** alle `[FEHLT: …]`-Stellen gesammelt.
>
> **Der Inhalt.** Das Projekt heißt „Schrödingers Kino" und beantwortet die
> Frage, welche Filme von meiner Letterboxd-Watchlist gerade in Kinos der
> Region Stuttgart laufen. Die Substanz für die vier Phasen:
>
> *Set-Up:* Auf meiner Watchlist stehen 148 Filme. Zwei davon laufen heute
> Abend in einem Stuttgarter Kino. Herauszufinden welche, kostete jedes Mal
> zwanzig Minuten und sechzehn Browser-Tabs. Das ist kein Filmproblem,
> sondern das Problem jeder personalisierten Content-Pipeline: Eine Liste,
> die mir gehört, trifft auf Datenquellen, die nichts von mir wissen.
> Dieselbe Aufgabe stellt sich bei Produktkatalogen, Stellenanzeigen,
> Veranstaltungskalendern. Der Projektname spielt darauf an, dass der Film
> läuft und nicht läuft, solange niemand nachgesehen hat.
>
> *Herausforderung:* Drei Quellen, 15 Kinos, kein gemeinsamer Schlüssel.
> Kinos hängen Aushangtitel aus, keine Filmtitel — echte Beispiele, die
> wörtlich so bleiben müssen: „Shrek - Der tollkühne Held (25 Jahre)",
> „KINOTOUR & PREVIEW: EINE KRANKHEIT WIE EIN GEDICHT", „Kalimera e.V.
> ARCADIA", sowie „Coyote Vs. Acme" und „Coyote vs. ACME" als derselbe Film
> aus zwei Quellen. Ein Titelvergleich verbindet nichts: Ein Film heißt in
> Deutschland „Vaterland", auf Englisch „Fatherland", im polnischen Original
> „Ojczyzna" — und zwei völlig andere Filme von 1986 und 1994 heißen im
> Original tatsächlich „Fatherland". Was auf dem Spiel steht: Eine Pipeline,
> die falsch verbindet, meldet keinen Fehler, sondern zeigt still das
> Falsche. Beleg aus dem Betrieb: An einem Morgen lieferte die Pipeline 121
> Vorstellungen für morgen und keine einzige für heute; der Lauf war grün,
> und das Dashboard zeigte für den laufenden Tag in elf Kinos nichts mehr an.
>
> *Lösung:* Nicht Titel verbinden, sondern Kennungen — die TMDb-ID ist das
> Bindeglied. Die Matching-Kaskade hat vier Stufen, jede teurer und seltener
> als die vorige: normalisieren (Fassungsangaben, Reihennamen, Veranstalter
> abtrennen), TMDb-Suche mit Bewertung, ein Sprachmodell als Schiedsrichter
> nur bei unklarer Lage, Handarbeit für den Rest. Technisch: fünf
> n8n-Workflows, die zeitlich aufeinander aufbauen (Kinoprogramm 6:00,
> Matching 6:30, MUBI GO 6:45, Ausspielung 7:00, Watchlist wöchentlich),
> Datenhaltung in Supabase, Ausspielung als statische Datei, Dashboard auf
> GitHub Pages. Belege: 96 Prozent der Aushangtitel automatisch aufgelöst
> (137 von 142); 549 Vorstellungen aus 15 Kinos und drei Quellen; der offene
> Rest sind nachweislich keine Filmtitel, sondern Sneak-Previews,
> Sondervorstellungen und Reihennamen.
>
> *Call to Action:* Drei übertragbare Regeln. Erstens: über Kennungen
> verbinden, nie über Zeichenketten — Zeichenketten sehen aus wie Daten und
> verhalten sich wie Meinungen. Zweitens: Plausibilitätsprüfungen statt
> Fehlerbehandlung — drei Produktionsfehler wurden in diesem Projekt
> gefunden, keiner davon von einer Fehlermeldung, alle drei von einer
> Prüfung der Art „das kann so nicht stimmen". Drittens: Herkunft
> mitschreiben — ein einziges Feld mit dem Abrufzeitpunkt beantwortete eine
> Frage in einer Abfrage, für die sonst eine halbe Stunde Raten nötig
> gewesen wäre. Dazu eine Messung statt einer Annahme: Die drei Datenquellen
> galten stillschweigend als gleichwertig; gemessen liefern die beiden, die
> direkt vom Kino lesen, bei 100 Prozent der Vorstellungen einen Ticketlink,
> der Aggregator bei 35. Abschluss auf zwei Ebenen — für die Bewertung: Das
> Projekt läuft unbeaufsichtigt, die Grenzen sind dokumentiert, jede nicht
> umgesetzte Erweiterung ist begründet statt weggelassen. Für die Kollegen:
> Repository und Dashboard sind offen, übertragbar sind eher die drei Regeln
> als der Code. Schlussbild, das den Anfang aufgreift, ausdrücklich **kein**
> „Vielen Dank für Ihre Aufmerksamkeit": „Heute Abend, 19:45 Uhr, Delphi
> Arthaus Kino. Ich musste nicht suchen."
>
> Zusätzliches Material hängt an. Wenn es einer meiner Angaben oben
> widerspricht, weise darauf hin, statt eines von beidem stillschweigend zu
> bevorzugen.

---

## Weg A · Die Nachfass-Prompts

Ein Durchgang reicht selten. Diese drei in dieser Reihenfolge:

**1 · Auf Zeit prüfen**

> Lies die Sprechnotizen und rechne bei 110 Wörtern pro Minute aus, wie lange
> jede Phase tatsächlich dauert. Nenne mir die Ist-Zeiten pro Phase. Wo die
> Zeit überschritten wird, kürze — aber ausschließlich in der Lösungsphase
> und im Call to Action, niemals in der Herausforderung.

Der Zusatz am Ende ist der wichtige. Ohne ihn kürzt ein Modell zuverlässig
die Problemschilderung, weil sie sich „wiederholend" liest — und dann steht am
Ende eine Antwort auf eine Frage, die niemand gestellt hat.

**2 · Gegen sich selbst lesen lassen**

> Prüfe deinen eigenen Entwurf kritisch: Welche Aussage auf welcher Folie
> stammt nicht wörtlich aus meinem Material? Liste sie auf, ohne sie zu
> verteidigen. Markiere getrennt, wo du eine Zahl gerundet, zusammengefasst
> oder in eigene Worte gefasst hast.

**3 · Den Einstieg schärfen**

> Schreib mir drei alternative Fassungen der ersten Folie: eine, die mit der
> Zahl beginnt, eine, die mit einer Frage beginnt, eine, die mit dem
> Projektnamen beginnt. Je zwei bis drei Sätze Sprechnotiz.

---

## Weg B · Wenn Gemini direkt in Google Slides arbeitet

Dort sind lange Prompts unbrauchbar — pro Folie ein kurzer Satz, und der
Inhalt kommt von dir. Muster:

```
Titelfolie: „Schrödingers Kino — welche Filme von meiner Watchlist
laufen gerade im Kino?" Untertitel: Abschlussprojekt KI-Manager.
Reduziertes Layout, viel Weißraum, keine Bilder.
```

```
Folie mit vier Beispielen in einer zweispaltigen Gegenüberstellung:
links „So hängt es im Kino aus", rechts „So heißt der Film".
Vier Zeilen, keine Grafik.
```

```
Ablaufdiagramm mit vier Stufen von links nach rechts: Normalisieren,
TMDb-Suche, Sprachmodell als Schiedsrichter, Handarbeit. Jede Stufe
schmaler als die vorige.
```

```
Zahlenfolie: 96 % · 549 Vorstellungen · 15 Kinos · 3 Quellen.
Große Zahlen, kleine Beschriftungen, sonst nichts.
```

Den roten Faden — Zeiten, Reihenfolge, Sprechnotizen — machst du in diesem
Weg selbst. Deshalb empfehle ich Weg A und danach das Übertragen.

---

## Was du mitschicken solltest

Dieselben Materialien wie bei Napkin, aber mit anderer Begründung: Bei Napkin
liefern sie die Bildsprache, bei Gemini sind sie die **Quellenbindung** —
der Bezugspunkt, an dem du später jede Behauptung prüfen kannst.

1. **`README-nachtrag-22-09.md`** — die Fund-Abschnitte mit Zahlen und
   Beispielen im Originalwortlaut.
2. **Screenshot des Dashboards.**
3. **Screenshot des n8n-Canvas von Workflow 2** — als Vorlage für das
   Architekturdiagramm.
4. **Die Quellenbilanz** (22 / 100 %, 258 / 100 %, 269 / 35 %).

**Nicht mitschicken:** die Checkliste. Sie ist eine Bauanleitung; ein Modell
macht daraus Folien voller Klickpfade, und du merkst es erst beim Kürzen.

---

## Worauf du beim Ergebnis achten musst

**Die Zahlenprüfung am Ende ist der Grund für den ganzen Prompt.** Lies sie
zuerst. Steht dort eine Zahl ohne Fundstelle, ist sie erfunden — auch wenn sie
plausibel aussieht. Besonders anfällig: Prozentwerte, die „ungefähr" gerundet
wurden, und Zeitangaben wie „in nur drei Wochen".

**Prüf die Beispieltitel wörtlich.** „Shrek - Der tollkühne Held (25 Jahre)"
und „Kalimera e.V. ARCADIA" sind echte Aushangtitel. Werden sie „geglättet",
verlieren sie genau das, was sie belegen sollen — dann steht auf der Folie ein
sauberer Titel, und das Publikum versteht nicht, worin das Problem lag.

**Achte auf Werbesprache.** Modelle schreiben bei Projektvorstellungen gern
„innovativ", „nahtlos", „leistungsstark". In einer Abschlussarbeit
signalisiert das Unsicherheit. Wenn es auftaucht: einmal
„Streiche alle bewertenden Adjektive und lass die Zahlen die Arbeit machen."

**Widerstehe der Versuchung, das Ergebnis direkt zu übernehmen.** Der
inhaltliche Wert dieser Präsentation liegt in den drei Produktionsfehlern und
den widerlegten Annahmen — also genau in dem, was ein Modell als
„Detail" kürzt. Was es streicht, ist oft das, was dich von einer
Standardpräsentation unterscheidet.
