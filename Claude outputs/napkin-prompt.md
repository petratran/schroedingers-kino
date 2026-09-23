# Napkin.ai — Prompt für die Abschlusspräsentation

10 Minuten · gemischtes Publikum (Prüfungskommission + Kurskollegen) ·
Live-Demo von rund 90 Sekunden in der Lösungsphase.

---

## Vorher: die Zeitrechnung

Der Präsentationsplaner ist für 25 Minuten gebaut. Bei 10 Minuten werden die
Phasen nicht gekürzt, sondern **anteilig** skaliert — sonst kippt der
Spannungsbogen. Die Live-Demo kommt aus dem Lösungsbudget, nicht obendrauf.

| Phase | Original (25 Min) | Hier (10 Min) | Folien |
| --- | --- | --- | --- |
| Set-Up | 0–5 | **0:00–1:30** | 2 |
| Herausforderung | 5–15 | **1:30–4:30** | 3–4 |
| Lösung | 15–20 | **4:30–8:00** (davon 1:30 Demo) | 3 + Demo |
| Call to Action | 20–25 | **8:00–10:00** | 2 |

Der Spannungshöhepunkt liegt damit bei 4:30, also bei 45 % der Laufzeit —
dieselbe Stelle wie im Original. Das ist der Grund für die anteilige
Skalierung: Wer bei 10 Minuten einfach vorne kürzt, hat den Höhepunkt nach
zwei Minuten und danach acht Minuten Abstieg.

---

## Der Prompt — alles ab hier in napkin.ai einfügen

> Erstelle eine Präsentation für einen 10-minütigen Vortrag. Zielgruppe:
> Prüfungskommission einer KI-Manager-Weiterbildung und Mitlernende aus
> demselben Kurs — technisch interessiert, aber nicht alle mit
> Programmiererfahrung. Sprache: Deutsch, Sie-Form vermeiden, sachlich und
> direkt.
>
> Die Präsentation folgt einem Spannungsbogen in vier Phasen. Halte dich an
> die Zeiten und die Reihenfolge. Pro Phase die angegebene Folienzahl, eine
> Kernaussage pro Folie, maximal drei kurze Stichpunkte je Folie. Keine
> Fließtextfolien.
>
> Gestaltung: ruhig und reduziert, serifenlose Schrift, viel Weißraum,
> höchstens zwei Akzentfarben. Nutze Diagramme, wo eine Abfolge oder eine
> Struktur gezeigt wird, und eine schlichte Tabelle, wo Zahlen verglichen
> werden. Keine dekorativen Bilder ohne Aussage. Kein Firmenlogo.
>
> **Titel der Präsentation:** Schrödingers Kino — welche Filme von meiner
> Watchlist laufen gerade im Kino?
>
> ---
>
> **PHASE 1 · SET-UP (0:00–1:30, 2 Folien)**
>
> Einstieg (Aufmerksamkeit):
> Auf meiner Letterboxd-Watchlist stehen 148 Filme. Zwei davon laufen heute
> Abend in einem Stuttgarter Kino. Herauszufinden welche, kostete mich jedes
> Mal zwanzig Minuten und sechzehn Browser-Tabs.
>
> Relevanz (warum das Publikum zuhören soll):
> Das ist kein Filmproblem. Es ist das Problem jeder personalisierten
> Content-Pipeline: Eine Liste, die mir gehört, trifft auf Datenquellen, die
> nichts von mir wissen. Dieselbe Aufgabe stellt sich bei Produktkatalogen,
> Stellenanzeigen, Veranstaltungskalendern.
>
> Was das Publikum mitnimmt: wie man Daten aus Quellen verbindet, die keinen
> gemeinsamen Schlüssel haben — und woran man merkt, wenn es schiefgeht.
>
> Namenserklärung als Aufhänger: Der Film läuft und läuft nicht, solange
> niemand nachgesehen hat.
>
> ---
>
> **PHASE 2 · HERAUSFORDERUNG (1:30–4:30, 3–4 Folien)**
>
> Das Problem, konkret:
> Drei Quellen, 15 Kinos, kein gemeinsamer Schlüssel. Kinos hängen
> Aushangtitel aus, keine Filmtitel.
>
> Beispiele, die das sofort zeigen (als Gegenüberstellung darstellen):
> - „Shrek - Der tollkühne Held (25 Jahre)" — Jubiläum im Titel
> - „KINOTOUR & PREVIEW: EINE KRANKHEIT WIE EIN GEDICHT" — Reihenname und
>   Filmtitel ohne Trennzeichen in einem Feld
> - „Kalimera e.V. ARCADIA" — Veranstalter und Film verschmolzen
> - „Coyote Vs. Acme" und „Coyote vs. ACME" — derselbe Film, zwei Quellen
>
> Warum ein Titelvergleich nicht funktioniert:
> Ein Film heißt in Deutschland „Vaterland", auf Englisch „Fatherland", im
> polnischen Original „Ojczyzna". Und zwei völlig andere Filme von 1986 und
> 1994 heißen im Original tatsächlich „Fatherland". Titel verbinden nichts —
> sie führen in die Irre.
>
> Was auf dem Spiel steht (Spannungshöhepunkt):
> Eine Pipeline, die falsch verbindet, meldet keinen Fehler. Sie zeigt
> einfach das Falsche, und zwar so lange, bis es jemandem auffällt. Das ist
> der teuerste Fehlertyp, den es gibt.
>
> Der Beleg aus dem Betrieb:
> An einem Morgen lieferte die Pipeline 121 Vorstellungen für morgen und
> keine einzige für heute. Der Lauf war grün, keine Fehlermeldung, und das
> Dashboard zeigte für den laufenden Tag in elf Kinos nichts mehr an.
>
> ---
>
> **PHASE 3 · LÖSUNG (4:30–8:00, 3 Folien + Live-Demo)**
>
> Das Prinzip in einem Satz:
> Nicht Titel verbinden, sondern Kennungen. Die TMDb-ID ist das Bindeglied
> zwischen Watchlist und Kinoprogramm.
>
> Die Matching-Kaskade (als Ablaufdiagramm mit vier Stufen darstellen,
> jede Stufe teurer und seltener als die vorige):
> 1. Normalisieren — Fassungsangaben, Reihennamen, Veranstalter abtrennen
> 2. TMDb-Suche — Kandidaten holen und bewerten
> 3. LLM als Schiedsrichter — nur bei unklarer Lage, nicht als erste Instanz
> 4. Handarbeit — für den Rest, dokumentiert statt versteckt
>
> Die Architektur (als schlichtes Flussdiagramm):
> Fünf n8n-Workflows, die zeitlich aufeinander aufbauen — Kinoprogramm 6:00,
> Matching 6:30, MUBI GO 6:45, Ausspielung 7:00, Watchlist wöchentlich.
> Datenhaltung in Supabase, Ausspielung als statische Datei, Dashboard auf
> GitHub Pages.
>
> Die Belege (als Tabelle oder Zahlenfolie):
> - 96 Prozent der Aushangtitel automatisch aufgelöst (137 von 142)
> - 549 Vorstellungen aus 15 Kinos und drei Quellen
> - der offene Rest sind nachweislich keine Filmtitel: Sneak-Previews,
>   Sondervorstellungen, Reihennamen
>
> [An dieser Stelle folgt eine Live-Demo des Dashboards, etwa 90 Sekunden.
> Plane hierfür eine reine Übergangsfolie mit dem Wort „Demo" und der URL,
> keinen Inhalt.]
>
> ---
>
> **PHASE 4 · CALL TO ACTION (8:00–10:00, 2 Folien)**
>
> Drei Regeln, die über dieses Projekt hinaus gelten (als drei klar
> getrennte Punkte darstellen):
>
> 1. Verbinde über Kennungen, nie über Zeichenketten. Zeichenketten sehen
>    aus wie Daten und verhalten sich wie Meinungen.
> 2. Baue Plausibilitätsprüfungen, keine Fehlerbehandlung. Drei
>    Produktionsfehler wurden in diesem Projekt gefunden — keiner davon von
>    einer Fehlermeldung, alle drei von einer Prüfung der Art „das kann so
>    nicht stimmen".
> 3. Schreib Herkunft mit. Ein einziges Feld mit dem Abrufzeitpunkt hat eine
>    Frage in einer Abfrage beantwortet, für die sonst eine halbe Stunde
>    Raten nötig gewesen wäre.
>
> Und eine Messung statt einer Annahme:
> Die drei Datenquellen galten stillschweigend als gleichwertig. Gemessen
> liefern die beiden, die direkt vom Kino lesen, bei 100 Prozent der
> Vorstellungen einen Ticketlink — der Aggregator bei 35. Quellenqualität
> gehört gemessen, nicht vermutet.
>
> Konkreter Abschluss, zwei Ebenen:
> - Für die Bewertung: Das Projekt läuft unbeaufsichtigt, die Grenzen sind
>   dokumentiert, und jede nicht umgesetzte Erweiterung ist begründet statt
>   weggelassen.
> - Für die Kolleginnen und Kollegen: Repository und Dashboard sind offen,
>   die Muster sind übertragbar — der Code weniger als die drei Regeln.
>
> Schlussbild, das den Anfang aufgreift (kein „Vielen Dank für Ihre
> Aufmerksamkeit"):
> Heute Abend, 19:45 Uhr, Delphi Arthaus Kino. Ich musste nicht suchen.

---

## Was du mitschicken solltest

Napkin baut Visuals aus dem Text, den es bekommt — je konkreter das Material,
desto weniger erfindet es. In dieser Reihenfolge:

**1. Den Prompt oben.** Vollständig, nicht gekürzt. Die Zeitangaben und die
Folienzahlen sind Teil der Anweisung.

**2. Die Fund-Abschnitte aus dem README** (`README-nachtrag-22-09.md`). Sie
liefern die Beispiele und die Zahlen im Originalwortlaut. Ohne sie formuliert
napkin die Belege um, und dann stimmen sie nicht mehr.

**3. Einen Screenshot des Dashboards.** Als Vorlage für die Demo-Folie und
damit napkin die Bildsprache trifft.

**4. Einen Screenshot des n8n-Canvas von Workflow 2.** Das ist das
eindrücklichste Bild des Projekts — zwanzig Nodes, drei Quellen, eine Linie.
Als Vorlage für das Architekturdiagramm; napkin soll es nachzeichnen, nicht
den Screenshot einbauen.

**5. Die Quellenbilanz als kleine Tabelle**, damit die Zahlen exakt bleiben:

| Quelle | Vorstellungen | mit Ticketlink |
| --- | --- | --- |
| Traumpalast | 22 | 100 % |
| Innenstadtkinos | 258 | 100 % |
| kino-zeit | 269 | 35 % |

**Nicht mitschicken:** die Checkliste. Sie ist eine Bauanleitung, kein
Präsentationsmaterial, und napkin würde daraus Folien voller Klickpfade
machen.

---

## Worauf du beim Ergebnis achten musst

**Prüf jede Zahl.** Generatoren runden, glätten und erfinden gern
Zwischenwerte. 96 Prozent, 137 von 142, 549 Vorstellungen, 15 Kinos, 100/100/35
— das sind deine Messwerte, und sie müssen so stehen bleiben. Eine erfundene
Zahl in einer Abschlusspräsentation ist teurer als eine fehlende Folie.

**Prüf die Beispieltitel.** „Shrek - Der tollkühne Held (25 Jahre)" und
„Kalimera e.V. ARCADIA" sind echte Aushangtitel. Wenn napkin sie
„vereinfacht", verlieren sie genau das, was sie belegen sollen.

**Zähl die Folien.** Zehn Minuten mit Demo heißt etwa 10 bis 12 Folien. Kommt
mehr zurück, streich in der Lösungsphase — nicht in der Herausforderung.
Der häufigste Fehler bei technischen Vorträgen ist, dass die Lösung wächst
und das Problem schrumpft; dann steht am Ende eine Antwort auf eine Frage,
die niemand gestellt hat.

**Die Demo-Folie muss leer bleiben.** Wenn dort Inhalt steht, liest das
Publikum mit, statt auf deinen Bildschirm zu schauen.
