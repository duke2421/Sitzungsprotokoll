# Schriftführer

Browserbasierte Protokollverwaltung für Vereins- oder Vorstandssitzungen mit Rollen, Kommentaren und persistenter SQLite-Speicherung. Die Anwendung läuft als schlanke Node.js-App im Docker-Container und kann lokal per `docker compose` oder produktiv über Portainer direkt aus einem GitHub-Repository deployt werden.

## Funktionsumfang

- Login mit Rollen `admin` und `reader`
- Dashboard mit Kennzahlen und zuletzt bearbeiteten Protokollen
- Protokolle anlegen, bearbeiten und löschen
- Tagesordnungspunkte per Drag-and-drop sortieren
- Markdown-Import und -Export
- Lesefreundliche Protokollansicht für Leser
- Interne Kommentare pro Tagesordnungspunkt
- Benutzerverwaltung für Admins
- Druck-/PDF-Ansicht mit Logo
- Login-Rate-Limiting bei wiederholten Fehlversuchen

## Projektstruktur

- `server.js`: Express-Backend, Sessions, Rollen, SQLite
- `public/index.html`: App-Struktur und Ansichten
- `public/app.js`: Frontend-Logik und API-Aufrufe
- `public/styles.css`: Oberfläche und Drucklayout
- `Dockerfile`: Container-Build
- `docker-compose.yml`: lokaler Start und Deployment über Portainer

## Lokaler Start

Voraussetzung: Docker und Docker Compose.

```bash
docker compose up --build
```

Die App ist danach standardmäßig unter `http://localhost:8080` erreichbar.

Falls `8080` lokal belegt ist:

```bash
HOST_PORT=8090 docker compose up --build
```

Zum Stoppen:

```bash
docker compose down
```

## Wichtige Umgebungsvariablen

- `SESSION_SECRET`: Pflicht für produktive Umgebungen, zufälliger geheimer Wert
- `HOST_PORT`: freier Host-Port für den Webzugriff, Standard `8080`
- `ADMIN_USERNAME`: Standardname des initialen Admins
- `ADMIN_PASSWORD`: Passwort des initialen Admins
- `ADMIN_DISPLAY_NAME`: Anzeigename des Admins
- `TRUST_PROXY_HOPS`: Für Reverse-Proxy-Betrieb, typischerweise `1`
- `COOKIE_SECURE`: `auto`, `true` oder `false`
- `FORCE_HTTPS`: `true` oder `false`
- `LOGIN_RATE_LIMIT_WINDOW_MS`: Zeitfenster für Login-Drosselung
- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`: maximal erlaubte Fehlversuche pro Zeitfenster
- `TZ`: Zeitzone, standardmäßig `Europe/Berlin`

Hinweis: Der Bootstrap-Admin wird beim Start anhand von `ADMIN_USERNAME`, `ADMIN_PASSWORD` und `ADMIN_DISPLAY_NAME` sichergestellt bzw. aktualisiert. Diese Werte sollten in Produktion bewusst gesetzt werden.

## Deployment mit GitHub und Portainer

1. Repository nach GitHub pushen.
2. In Portainer einen neuen Stack aus einem Git-Repository anlegen.
3. Als Compose-Datei `docker-compose.yml` auswählen.
4. Für den Stack mindestens diese Werte setzen oder prüfen:
   - `HOST_PORT`, zum Beispiel `8090` oder ein anderer freier Host-Port
   - `SESSION_SECRET`
   - `ADMIN_PASSWORD`
   - optional `ADMIN_USERNAME`, `ADMIN_DISPLAY_NAME`
   - optional `FORCE_HTTPS=true`, wenn hinter einem korrekt konfigurierten HTTPS-Proxy gearbeitet wird
5. Stack deployen.

Die Compose-Datei verwendet ein persistentes Volume `schriftfuehrer_data` für die SQLite-Datenbank unter `/app/data`.

## Reverse Proxy

Für den Betrieb hinter Nginx Proxy Manager oder einem anderen Reverse Proxy sind diese Standardwerte vorgesehen:

- `TRUST_PROXY_HOPS=1`
- `COOKIE_SECURE=auto`
- `FORCE_HTTPS=false`

Wenn TLS ausschließlich am Proxy terminiert wird, reicht meist `COOKIE_SECURE=auto`. `FORCE_HTTPS` sollte nur aktiviert werden, wenn der Proxy `X-Forwarded-Proto=https` korrekt setzt.

## Syntax-Checks

```bash
node --check server.js
node --check public/app.js
```

## Technische Basis

- Node.js 22
- Express
- better-sqlite3
- bcryptjs
- SQLite mit persistentem Docker-Volume
