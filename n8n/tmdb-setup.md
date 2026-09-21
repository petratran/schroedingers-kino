# TMDb-Zugang einrichten

Kostenlos für nicht-kommerzielle Nutzung. Zehn Minuten, einmalig.

## 1 · Konto und Schlüssel

1. Konto auf [themoviedb.org](https://www.themoviedb.org/signup) anlegen und
   die Mail-Adresse bestätigen — ohne Bestätigung bleibt der API-Bereich zu.
2. **Am Desktop** weitermachen. Die Registrierung ist laut TMDb nicht für
   mobile Geräte ausgelegt.
3. Profilbild oben rechts → *Einstellungen* → linke Spalte **API** →
   *Request an API Key* → **Developer**.
4. Nutzungsbedingungen bestätigen, dann das Formular ausfüllen. Gefragt werden
   Art der Nutzung (persönlich/nicht-kommerziell), Name und Zweck der
   Anwendung, eine URL und Kontaktdaten. Eine Platzhalter-URL ist in Ordnung,
   wenn noch nichts veröffentlicht ist.
5. Der Zugang wird bei nicht-kommerzieller Nutzung sofort freigeschaltet.

## 2 · Welcher der beiden Werte

Auf der API-Seite stehen zwei Zugangsdaten. Sie geben dieselben Rechte:

| Feld | Form | Verwendung |
| --- | --- | --- |
| **API Key** (v3) | 32 Zeichen | Query-Parameter `?api_key=…` |
| **API Read Access Token** (v4) | langer Token | Header `Authorization: Bearer …` |

Nimm den **Read Access Token**. Der Schlüssel steht dann im Header statt in der
URL und landet damit nicht in Logs, Browserverläufen oder n8n-Ausführungs-
historien.

## 3 · In n8n hinterlegen

*Credentials* → *New* → **Header Auth**:

```
Name:  Authorization
Value: Bearer eyJhbGciOi…            (der Read Access Token)
```

Diese Credential im HTTP-Request-Node auswählen, nie den Token in einen
Code-Node schreiben. Ein Code-Node landet im Workflow-Export, eine Credential
nicht.

## 4 · Der Aufruf für dieses Projekt

```
GET https://api.themoviedb.org/3/search/movie
    ?query={{ encodeURIComponent($json.queryTitle) }}
    &language=de-DE
    &include_adult=false
```

`language=de-DE` sorgt dafür, dass `title` der deutsche Verleihtitel ist und
`original_title` der Originaltitel — genau das Paar, an dem sich *Vaterland*
gegen *Fatherland* entscheidet.

Bewusst **ohne** `year` und ohne `region`: beides würde Klassikerreihen und
Wiederaufführungen aussortieren.

Danach ein *Set*-Node, der `{{ $json.results }}` nach `tmdb_results` legt —
dort erwartet es `02-score-decide.js`.

## 5 · Testaufruf

```bash
curl -s -H "Authorization: Bearer DEIN_TOKEN" \
  "https://api.themoviedb.org/3/search/movie?query=Vaterland&language=de-DE" \
  | head -c 600
```

Kommt eine Liste mit `title`, `original_title` und `release_date`, steht der
Zugang. Kommt `{"status_code":7}`, ist der Token falsch oder noch nicht aktiv.

## 6 · Grenzen

Rund 40 Anfragen pro Sekunde, und TMDb behält sich Änderungen vor. Für dieses
Projekt spielt das keine Rolle: der einmalige Watchlist-Abgleich sind 2.833
Aufrufe, der tägliche Lauf eine Handvoll. Trotzdem gehört ein *Wait*-Node von
200 ms in die Schleife und ein Retry auf `429` in die Node-Einstellungen —
beides kostet nichts und erspart einen abgebrochenen Erstlauf.

Bilder (Poster) sind vom Bilderdienst separat: Basis-URL
`https://image.tmdb.org/t/p/w342` plus `poster_path`. Die Attribution
„This product uses the TMDb API but is not endorsed or certified by TMDb"
verlangen die Nutzungsbedingungen — gehört in den Fuß des Dashboards, sobald
Poster oder TMDb-Daten sichtbar werden.
