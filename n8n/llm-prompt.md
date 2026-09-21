# LLM-Node: Prompt und Schema

Node-Typ: **Basic LLM Chain** mit angehängtem **Structured Output Parser**.
Läuft nur auf dem `needs_llm`-Zweig — in der Praxis eine Handvoll Titel pro Woche.

## System-Prompt

```
Du ordnest Filmtitel aus deutschen Kinoaushängen den richtigen TMDb-Einträgen zu.
Du wählst ausschließlich aus der vorgegebenen Kandidatenliste.
Wenn kein Kandidat sicher passt, gibst du null zurück. Raten ist schlechter
als keine Antwort: ein falscher Treffer schickt jemanden umsonst ins Kino.
Deutsche Verleihtitel weichen oft vom Originaltitel ab — das allein ist kein
Ausschlussgrund. Ein anderer Teil einer Reihe ist immer ein Ausschlussgrund.
```

## User-Prompt (n8n-Expression)

```
Kino: {{ $json.cinema_name }}
Aushangtitel: "{{ $json.raw_title }}"
Vorstellung am: {{ $json.starts_at }}
Reihe/Kontext: {{ $json.series || "reguläres Programm" }}

Kandidaten:
{{ $json.candidates.map(c => `- tmdb_id ${c.tmdb_id}: "${c.title}" (Original: "${c.original_title}", ${c.year}) — Ähnlichkeit ${c.score}`).join("\n") }}

Welcher Kandidat ist der Film, der hier läuft?
```

## Structured Output Parser — JSON Schema

```json
{
  "type": "object",
  "properties": {
    "tmdb_id": { "type": ["integer", "null"] },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "reason": { "type": "string", "maxLength": 200 }
  },
  "required": ["tmdb_id", "confidence", "reason"]
}
```

## Zwei Regeln, die nicht im Prompt stehen dürfen, sondern im Code

Node 3 prüft beides — verlass dich nicht darauf, dass das Modell sich daran hält:

1. **Die zurückgegebene `tmdb_id` muss aus der Kandidatenliste stammen.** Sonst
   wird sie verworfen. Modelle erfinden gelegentlich plausible IDs.
2. **`confidence` wird auf 0,95 gedeckelt.** Ein Schiedsspruch ist nie so sicher
   wie ein eindeutiger Titelabgleich, egal was das Modell behauptet.
