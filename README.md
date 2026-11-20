# Lern-App

Offline-Web-App (PWA) fürs iPad mit Apple Pencil. Kein App Store, keine Cloud: alle Seiten, Notizen und Karten bleiben im Speicher des Geräts.

## Funktionen
- **Scannen**: Buchseiten und Arbeitsblätter fotografieren, Seite erkennen, gerade ziehen, auf unter 300 KB verkleinern. Fotos landen nicht in der Fotos-App.
- **Fächer, Bücher, Hefte, Mappen**: sortieren, verschieben, Reihenfolge ändern, Eingang für Unsortiertes.
- **Buch-Leser**: blättern wie in einem Buch (quer als Doppelseite), Lesezeichen und Inhaltsverzeichnis.
- **Schreiben mit dem Pencil**: Stift mit Druck, Marker, Radierer, Lasso, Textfelder (mit Formel-Schreibweise wie x² und ≥).
- **Papiere**: kariert, liniert, blanko, Millimeter, Noten, Cornell.
- **Mathe**: Lineal (30 cm), Geodreieck, Parabelschablone, Zirkel, Karo-Hilfe, Koordinatensystem und Funktionsgraphen.
- **Lernkarten**: Vokabeln mit Wiederholungsplan (Karteikasten), umdrehen oder eintippen, Vorlesen.
- **Hausaufgaben** pro Fach, Übersicht „Heute“ auf der Startseite.
- **PDF**: Arbeitsblätter als PDF importieren und beschriftete Seiten als PDF speichern.
- **Suche** und **Sicherung** (eine .json-Datei mit allem).

## Aufs iPad
1. In Safari die GitHub-Pages-Adresse dieses Repositorys öffnen.
2. Teilen → „Zum Home-Bildschirm“. Danach startet die App wie eine normale App und läuft offline.

## Technik
- Reines HTML/CSS/JavaScript (ES-Module), kein Build-Schritt.
- Daten in IndexedDB (Datenbank `lernapp`).
- `sw.js` speichert die App für den Offline-Betrieb. Bei jeder Änderung `VERSION` erhöhen.
- `vendor/`: pdf.js 3.11.174 von Mozilla (Apache-2.0) für den PDF-Import.

## Lokal testen
`python3 -m http.server 8123` im Ordner, dann http://localhost:8123 öffnen.

## Wichtig zum Speicher
Safari kann Daten von Webseiten löschen, die lange nicht benutzt wurden. Als Homescreen-App passiert das deutlich seltener, und die App bittet zusätzlich um dauerhaften Speicher. Trotzdem ab und zu über „…“ → „Sicherung speichern“ eine Sicherung machen.
