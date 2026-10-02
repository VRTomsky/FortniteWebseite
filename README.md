# Shopradar – Fortnite Item-Shop Tracker

Fan-Webseite für den Fortnite Item-Shop: tägliche Rotation live, wann ein Item zuletzt im Shop war, Song- und Emote-Vorschau, Leaks aus den Spieldateien, V-Bucks-Rechner, Stats und eine drehbare 3D-Kartenansicht für jedes Item.

## Was drin ist

| Bereich | Was es kann |
|---|---|
| **Intro** | Vollbild-Start mit aktuellem Saison-Artwork, großem Countdown bis zum Shop-Wechsel, Highlights-Band; beim Scrollen Parallax und einfliegende Kacheln |
| **Shop** | Aufgebaut wie bei Fortnite.GG: Bereiche in genau der Reihenfolge wie im Spiel (Rang des Bereichs, dann Reihe für Reihe), einklappbar; Tabs mit Zählern (Neu, Wunschliste, Anders als gestern, Gehen heute, Längste Wartezeit, Rabatt, leistbar), Filter nach Typ, Sortieren, Einstellungen (Kachelgröße, Videos, Restzeit), Suche; unter jeder Kachel Restzeit und „zuletzt vor X Tagen“ |
| **Videos** | Von Fortnite.GG: Outfits, Rucksäcke, Spitzhacken & Co. drehen sich beim Drüberfahren (360°), Emotes tanzen mit Ton; in der Item-Ansicht das Video in voller Größe mit Steuerung |
| **Songs & Emotes** | Jam-Songs: Maus drüber = Song spielt an, Klick = Play/Pause mit Fortschrittsring und „Läuft gerade“-Leiste (30-Sekunden-Vorschau des Originals über die iTunes-Suche). Emotes: Maus drüber = Tanz mit Ton, Play-Knopf hält das Video fest |
| **Archiv** | Alle ~16.400 Cosmetics durchsuchen; sortieren nach längster Pause, zuletzt im Shop, Häufigkeit; Filter nach Typ, Seltenheit, Kapitel, Shop-Status |
| **Item-Ansicht** | Video (360° bzw. Emote mit Ton) oder 3D-Sammelkarte (ziehen = drehen, scrollen = zoomen, Rückseite mit Daten), Trailer, komplette Shop-Historie mit Zeitleiste und Tabelle aller Auftritte, Preis und was dir mit deinem Guthaben fehlt |
| **Leaks** | Neue Items aus dem letzten Update, die noch nie im Shop waren |
| **Season** | Aktuelles Kapitel/Saison mit Fortschritt und Countdown, Events, In-Game-News, aktuelle Karte, „Neu seit deiner Pause“ |
| **V-Bucks** | Was fehlt mir? Günstigste Paket-Kombination (Preise ab 19.03.2026), Epic-Rewards, Angebots-Check für Guthabenkarten, Spartipps |
| **Spind** | Wunschliste und „Besitze ich“, Browser-Benachrichtigung, Export/Import |
| **Stats** | Siege, K/D, Spielzeit, Battle-Pass-Stufe – über deinen API-Key |

## Einrichtung (einmalig, ca. 3 Minuten)

1. **Repository umbenennen** (optional): *Settings → General → Repository name* → `fortnite-webseite` → *Rename*.
2. **Öffentlich machen** – GitHub Pages ist im kostenlosen Plan nur für öffentliche Repos verfügbar. Im Repo liegt nichts Geheimes (dein API-Key bleibt in deinem Browser). *Settings → General → Danger Zone → Change visibility → Public*.
3. **Pages einschalten:** *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
4. **Ersten Build starten:** Tab *Actions* → „Shopradar bauen & veröffentlichen“ → *Run workflow*. Nach etwa einer Minute ist die Seite online unter
   `https://<dein-github-name>.github.io/<repo-name>/` (bei dir z. B. `https://vrtomsky.github.io/fortnite-webseite/`).
5. **Auf der Seite:** Einmal-Setup öffnen, API-Key von [dash.fortnite-api.com](https://dash.fortnite-api.com) und Epic-Namen eintragen, testen, speichern. Danach verschwindet das Setup aus der Navigation. Der Key wird nur im `localStorage` deines Browsers gespeichert und nur an fortnite-api.com geschickt, wenn du Stats abrufst – nie ins Repository.

Der Workflow läuft danach automatisch: kurz nach jedem Shop-Wechsel (00:07 und 00:41 UTC) und alle vier Stunden. Er baut den Archiv-Index (Daten für „zuletzt gesehen“) und veröffentlicht die Seite neu. Der Shop selbst wird immer live im Browser geladen.

## Alarm per Mail: „Nikki ist im Shop“

`config/watch.json` enthält Begriffe (voreingestellt: `Nikki`, `Obsession`, `One Wish Willow`). Taucht ein Item mit einem dieser Begriffe im Shop **oder** neu in den Spieldateien auf, öffnet der Workflow ein Issue mit dem Label `shop-alarm` und erwähnt dich darin. GitHub schickt dir dann eine Mail und eine Push-Nachricht (GitHub-App). Jedes Ereignis wird nur einmal gemeldet; schließ das Issue einfach, wenn du es gesehen hast.

Begriffe werden als ganze Wörter verglichen („Sora“ trifft nicht „Sorana“), Groß-/Kleinschreibung ist egal.

## Saison pflegen

`config/season.json` enthält Name, Start und (ungefähres) Ende der Saison sowie laufende Events. Der Workflow erkennt neue Kapitel/Saisons automatisch über die Spielversion; passt die Datei dann nicht mehr, blendet die Seite Name und Enddatum aus und zeigt einen Hinweis, bis du sie aktualisierst.

## Lokal ansehen

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Lokal fehlt der Archiv-Index (`data/index.json` erzeugt nur der Workflow); das Archiv nutzt dann automatisch die Live-Suche nach Namen. Den Index kannst du auch selbst bauen: `node scripts/build-data.mjs` (Node 22+).

## Technik

- Reines HTML/CSS/JavaScript (ES-Module), kein Build-Schritt. Three.js für die 3D-Karte kommt per Import-Map von jsDelivr.
- Daten: [fortnite-api.com](https://fortnite-api.com) (Shop mit `responseFlags=4` für die Shop-Historie, Cosmetics, Leaks, News, Karte, Stats).
- Song-Vorschauen: iTunes Search API (30-Sekunden-Previews, CORS offen, kein Key). Die Fortnite-API liefert selbst kein Audio.
- Videos: [Fortnite.GG](https://fortnite.gg) (`fnggcdn.com/items/<id>/video.mp4`, kleine Fassung `video-sd.mp4` für die Kacheln). Die Zuordnung Epic-ID → Fortnite.GG-ID holt der Workflow aus `fortnite.gg/api/items.json` (ohne CORS, darum nicht im Browser) und legt sie als `data/gg.json` bzw. `data/gg-shop.json` ab. Gibt es kein Video, zeigt die Seite Bild bzw. 3D-Karte.
- Emote-Ton ohne Fortnite.GG-Video: offizielles Showcase-Video (YouTube, nocookie-Einbettung) im Mini-Player.
- Shop-Reihenfolge: Bereiche nach `layout.rank` (absteigend), darin Reihen nach der Endung der `layoutId` (`.99` vor `.98`), in der Reihe nach `sortPriority`.
- Schrift: Burbank Big Condensed, wenn lokal installiert (siehe `assets/fonts/README.md`), sonst Anton; UI-Text in Plus Jakarta Sans.
- `scripts/build-data.mjs` – Archiv-Index, Saison-Erkennung, Fortnite.GG-Zuordnung, Watchlist-Alarm.
- `.github/workflows/deploy.yml` – baut und veröffentlicht auf GitHub Pages.
- Persönliches (Wunschliste, Spind, Guthaben, API-Key) bleibt im Browser.

Echte 3D-Modelle stellt Epic nicht bereit; die 360°-Videos kommen von Fortnite.GG, die 3D-Ansicht ist eine Sammelkarte mit den offiziellen Item-Renders.

## Rechtliches

Fan-Projekt, nicht mit Epic Games verbunden. Fortnite und alle Item-Bilder sind Marken bzw. Eigentum von Epic Games.
