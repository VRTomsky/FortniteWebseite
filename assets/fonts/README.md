# Fortnite-Schrift

Fortnite nutzt **Burbank Big Condensed** (Black). Die Schrift ist kommerziell (House Industries) und darf deshalb nicht in ein öffentliches Repository gelegt werden.

So nutzt Shopradar sie trotzdem:

- **Automatisch**, wenn sie auf deinem Rechner installiert ist – `style.css` sucht per `local()` nach den üblichen Namen.
- **Mit eigener Lizenz:** Datei als `BurbankBigCondensed-Black.woff2` hier ablegen und in `assets/css/style.css` im `@font-face`-Block die `url(...)`-Zeile einkommentieren.

Ohne Burbank fällt die Seite auf **Anton** (Google Fonts) zurück – optisch sehr nah dran.
