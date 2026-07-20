# Exhibition Hub

Persönlicher Ausstellungs-Bot unter **exh.studiooswald.com**: Du erzählst im Chat, in welcher Ausstellung du warst – der Bot recherchiert per Web-Suche Museum, Laufzeit, Künstler:innen, Kurator:innen und den offiziellen Ausstellungstext, fragt nach deinem Kommentar und erzeugt eine fertige **Obsidian-Notiz** (Markdown mit YAML-Properties) zum Kopieren. Alle Notizen werden gespeichert, die laufende Nummer im Dateinamen (z. B. `26 - MÄR Shifting The Silence`) zählt automatisch hoch.

## Wie es funktioniert

- **Backend:** Node.js + Express, Claude (`claude-sonnet-5`) mit Web-Suche
- **Datenbank:** SQLite (eine Datei im Docker-Volume, kein DB-Server)
- **Frontend:** schlankes Chat-UI, optimiert auch für iPad/iPhone
- **Login:** ein Passwort (nur du nutzt die App)
- **Deployment:** Docker + Caddy (automatisches HTTPS) auf deinem VPS, ausgelöst durch GitHub Actions bei jedem Push auf `main`

## Einrichtung (komplett vom iPad aus möglich)

### 1. GitHub-Secrets hinterlegen

Im Repo: **Settings → Secrets and variables → Actions → New repository secret**. Lege diese Secrets an:

| Secret | Wert |
|---|---|
| `VPS_HOST` | IP-Adresse oder Hostname deines VPS |
| `VPS_USER` | SSH-Benutzer auf dem VPS (z. B. `root` oder `debian`) |
| `VPS_SSH_KEY` | Privater SSH-Key für den VPS (kompletter Inhalt inkl. `-----BEGIN … KEY-----`-Zeilen) |
| `VPS_PORT` | Nur nötig, falls SSH nicht auf Port 22 läuft |
| `ANTHROPIC_API_KEY` | Dein API-Key von [console.anthropic.com](https://console.anthropic.com) |
| `APP_PASSWORD` | Dein Login-Passwort für die App (frei wählbar) |
| `SESSION_SECRET` | Langer Zufallsstring (z. B. 3× eine UUID aneinanderhängen) |

> **Kein SSH-Key zur Hand?** Bei Infomaniak-VPS (oder jedem anderen Anbieter) kannst du im Kundencenter einen SSH-Key hinterlegen bzw. herunterladen. Der *private* Key kommt in das Secret `VPS_SSH_KEY`, der *öffentliche* muss auf dem VPS in `~/.ssh/authorized_keys` stehen.

### 2. Voraussetzungen auf dem VPS (einmalig)

- Docker inkl. Compose-Plugin installiert (`docker compose version` muss funktionieren)
- Ports **80** und **443** frei (kein anderer Webserver darauf – sonst siehe unten)

### 3. DNS bei Infomaniak

Im Infomaniak-Manager unter deiner Domain **studiooswald.com → DNS-Zone**:

- Neuer Eintrag: Typ **A**, Name/Subdomain **`exh`**, Ziel = **IP deines VPS**, TTL Standard

Mehr ist nicht nötig. Das HTTPS-Zertifikat holt sich Caddy nach dem ersten Deployment automatisch von Let's Encrypt.

### 4. Deployen

Push auf den Branch `main` (oder im Repo unter **Actions → Deploy auf VPS → Run workflow** manuell starten). Die Action kopiert den Code auf den VPS, schreibt die `.env` aus den Secrets und startet `docker compose up -d --build`.

Danach: **https://exh.studiooswald.com** öffnen, mit deinem `APP_PASSWORD` anmelden, loslegen. 🖼️

### Falls auf dem VPS schon ein Webserver läuft (nginx o. ä.)

Dann kollidiert Caddy mit Port 80/443. In dem Fall:

1. In `docker-compose.yml` den kompletten `caddy:`-Block und die Caddy-Volumes entfernen und beim `app`-Service statt `expose` setzen:
   ```yaml
   ports:
     - "127.0.0.1:3000:3000"
   ```
2. Im bestehenden nginx einen Serverblock für `exh.studiooswald.com` anlegen, der auf `http://127.0.0.1:3000` proxied, und mit `certbot --nginx -d exh.studiooswald.com` das Zertifikat holen.

## Fallback: Deployment per SSH-App (Termius, Blink …)

Ohne GitHub Action geht es auch manuell:

```bash
git clone https://github.com/studiooswald/Exhibition_hub.git ~/exhibition-hub
cd ~/exhibition-hub
cp .env.example .env && nano .env   # Werte eintragen
docker compose up -d --build
```

Updates später: `cd ~/exhibition-hub && git pull && docker compose up -d --build`

## Lokal entwickeln / testen

```bash
npm install
APP_PASSWORD=test SESSION_SECRET=dev-secret MOCK_AGENT=1 npm start
# → http://localhost:3000  (MOCK_AGENT=1 simuliert den Bot ohne API-Key)
```

## Notiz-Format

Dateiname: `{Nr} - {MONAT} {Titel}`, z. B. `26 - MÄR Shifting The Silence`

```markdown
---
Museum: Lenbachhaus, München
VisitDate: 2026-03-15
OpeningDate: 
EndingDate: 2027-01-01
Discipline: []
Artists:
  - Etel Adnan
  - …
Link: https://www.lenbachhaus.de/…
---

**Exhibition Text:**
…offizieller Text der Museums-Website…

**Curator:**
…

**Comment:**
…dein Kommentar aus dem Chat…

**Inspiration for own work:**
…
```

Die Datumsfelder sind im ISO-Format, damit Obsidian sie als Date-Properties erkennt. In der Notiz-Karte gibt es je einen Button für den Dateinamen und den Markdown-Inhalt.
