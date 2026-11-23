# Vertretungsplan einrichten (Cloudflare Worker)

Die Lern-App holt den Vertretungsplan nicht direkt aus dem Schulportal (das blockt der Browser).
Sie fragt deinen eigenen kleinen Server bei Cloudflare. Der ist kostenlos.

Dauer: etwa 10 Minuten. Am besten am PC machen.

## 1. Konto anlegen

1. Öffne https://dash.cloudflare.com/sign-up
2. E-Mail und Passwort eingeben, dann die E-Mail bestätigen.
3. Wenn Cloudflare nach einer Website fragt: überspringen. Du brauchst keine.

## 2. Worker anlegen

1. Links im Menü auf **Workers & Pages** (manchmal heißt es **Compute (Workers)**).
2. **Erstellen** → **Worker erstellen** (oder „Mit Hello World beginnen“).
3. Name: `vertretung` → **Bereitstellen** (Deploy).
4. Dann **Code bearbeiten** (Edit code).
5. Den ganzen Beispiel-Code löschen.
6. Diesen Code öffnen, alles kopieren und einfügen:
   https://raw.githubusercontent.com/Brastib/lernen-macht-spa-/main/worker/vertretungsplan-worker.js
7. Oben rechts **Bereitstellen** (Deploy).

## 3. Geheimnisse eintragen

Dein Passwort kommt NICHT in den Code, sondern hier hinein. Cloudflare speichert es verschlüsselt.

1. Zurück zum Worker → **Einstellungen** (Settings) → **Variablen und Geheimnisse** (Variables and Secrets).
2. Viermal **Hinzufügen**. Typ jedes Mal: **Geheimnis** (Secret).

| Name | Was kommt rein |
| --- | --- |
| `SPH_SCHULE` | Die Schul-ID (eine Zahl). Du siehst sie beim Login im Schulportal oben in der Adresse: `...?i=1234` → `1234` |
| `SPH_NUTZER` | Dein Benutzername im Schulportal (z. B. `vorname.nachname`) |
| `SPH_PASSWORT` | Dein Passwort im Schulportal |
| `APP_SCHLUESSEL` | Ein langes Fantasie-Wort, mindestens 20 Zeichen, z. B. vier zufällige Wörter mit Zahlen. Nirgends sonst benutzen! |

3. **Bereitstellen** drücken.

## 4. Testen

1. Oben beim Worker steht die Adresse, z. B. `https://vertretung.deinname.workers.dev`. Kopieren.
2. Im Browser öffnen. Da sollte stehen: „Worker läuft. Ohne richtigen App-Schlüssel gibt es keine Daten.“
   Dann ist alles richtig. Ohne Schlüssel gibt er absichtlich nichts heraus.

## 5. In der App verbinden

1. Lern-App → **Stundenplan** → unten **Vertretungsplan verbinden** (oder oben **•••**).
2. Adresse des Workers und deinen `APP_SCHLUESSEL` eintragen.
3. **Testen**. Wenn „Klappt“ kommt: **Sichern**.

Danach siehst du im Stundenplan: rot = Entfall, orange = Vertretung oder Raumänderung.
Auch auf der Startseite bei „Jetzt / Als Nächstes“.

## Worker-Code aktualisieren (z. B. für Hausaufgaben, Arbeiten, Nachrichten)

1. https://dash.cloudflare.com → **Workers & Pages** → `vertretung` → **Code bearbeiten**.
2. Alles löschen, den Code von diesem Link neu einfügen:
   https://raw.githubusercontent.com/Brastib/lernen-macht-spa-/main/worker/vertretungsplan-worker.js
3. **Bereitstellen**. Die Geheimnisse bleiben, die musst du nicht neu eintragen.

## Wenn etwas nicht klappt

- **„Login abgelehnt“**: Schul-ID, Benutzername oder Passwort falsch. Bei Cloudflare unter Geheimnisse ändern.
  Achtung: Nach mehreren Fehlversuchen sperrt das Schulportal kurz.
- **„Falscher App-Schlüssel“**: In der App nicht genau dasselbe Wort wie bei `APP_SCHLUESSEL`.
- **„Worker nicht erreichbar“**: Adresse prüfen (muss mit `https://` anfangen).
- **Passwort im Schulportal geändert?** Dann auch `SPH_PASSWORT` bei Cloudflare ändern.

## Sicherheit (ehrlich)

- Dein Schulportal-Passwort liegt verschlüsselt bei Cloudflare als Geheimnis. Nicht auf GitHub, nicht in der App.
- Der Worker antwortet nur, wenn der richtige App-Schlüssel mitkommt. Und er nimmt nur Anfragen von deiner App-Seite an.
- Der App-Schlüssel steht in der App und in deinen App-Sicherungen. Wer ihn hat, kann deinen Vertretungsplan lesen (nicht dein Passwort).
  Wenn er mal weg ist: bei Cloudflare einen neuen eintragen und in der App neu verbinden.
- Der Worker liest nur. Er schickt keine Nachrichten. Beim Lesen einer Nachricht kann das Schulportal sie als gelesen markieren. Er fragt höchstens alle 5 Minuten nach.
- Das ist kein offizielles Angebot des Schulportals. Es nutzt denselben Weg wie die Open-Source-Apps „Lanis-Mobile“ und „pylanis“.
  Wenn das Schulportal seinen Login ändert, kann es aufhören zu klappen.
