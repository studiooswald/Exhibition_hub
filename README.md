# Exhibition Hub

Persönlicher Ausstellungs-Bot unter **exh.studiooswald.com**: Du erzählst im Chat, in welcher Ausstellung du warst – der Bot recherchiert per Web-Suche Museum, Laufzeit, Künstler:innen, Kurator:innen und den offiziellen Ausstellungstext, fragt nach deinem Kommentar und erzeugt eine fertige **Obsidian-Notiz** (Markdown mit YAML-Properties) zum Kopieren. Alle Notizen werden gespeichert, die laufende Nummer im Dateinamen (z. B. `26 - MÄR Shifting The Silence`) zählt automatisch hoch.

## Wie es funktioniert

- **Backend:** Node.js + Express, Claude (`claude-sonnet-5`) mit Web-Suche
- **Datenbank:** SQLite (eine Datei unter `data/`, kein DB-Server) mit täglichem Backup
- **Frontend:** schlankes Chat-UI, optimiert auch für iPad/iPhone
- **Login:** ein Passwort (nur du nutzt die App)
- **Deployment:** Docker + Caddy (automatisches HTTPS) auf deinem VPS, ausgelöst durch GitHub Actions bei jedem Push auf `main`

### Im Alltag

- **Korrigieren:** Stimmt eine Angabe nicht, sag es dem Bot einfach im selben Chat („das Enddatum ist der 28.2."). Er aktualisiert die bestehende Notiz – sie behält ihre Nummer, es entsteht keine zweite.
- **Weitermachen nach einem Reload:** Die Unterhaltung wird gemerkt. Wenn Safari den Tab verwirft, machst du nach dem Öffnen einfach weiter. Für eine neue Ausstellung auf **+ Neu** tippen.
- **Löschen:** In der Notizliste links liegt hinter jedem Eintrag ein **✕**.
- **Sichern:** Unten in der Notizliste lädt „Alle Notizen sichern" alles als JSON herunter.

### Der Link zur Ausstellung

Das Feld, bei dem Web-Recherche am ehesten danebengreift – deshalb wird es besonders behandelt:

- Der Bot muss die offizielle Seite **genau dieser** Ausstellung liefern, nicht die Startseite des Museums, keine Übersichtsliste, kein Kunstportal. Erfinden ist ihm ausdrücklich untersagt.
- Beim Speichern wird die Adresse aufgeräumt (Tracking-Parameter, Anker, Markdown-Klammern) und einmal angefragt. Zeigt sie nur auf die Startseite oder antwortet sie mit 404, bekommt der Bot das zurückgemeldet, sucht noch einmal und speichert die bessere Adresse.
- Findet er nichts, sagt er es offen, statt etwas zu erfinden – die Notiz wird trotzdem gespeichert.
- In der Notiz-Karte steht der Link zum Antippen, damit du vor dem Einfügen in Obsidian kurz prüfen kannst, ob die richtige Seite dahintersteckt. Notizen ohne Link sind in der Liste als „ohne Link" markiert.

## Aufbau des Codes

| Datei | Zuständig für |
|---|---|
| `src/config.js` | alle Einstellungen an einer Stelle, geprüft beim Start |
| `src/server.js` / `src/app.js` | Start und Zusammenstecken der Routen |
| `src/auth.js` | Anmeldung, Session-Token, Bremse gegen Passwort-Raten |
| `src/agent.js` | Gesprächsschleife mit Claude, Prompt-Caching, Verlauf aufräumen |
| `src/prompt.js` | System-Prompt und Definition des `save_note`-Werkzeugs |
| `src/mock-agent.js` | simulierter Bot für Tests und zum Ausprobieren ohne API-Key |
| `src/note.js` | Felder normalisieren, Dateiname und Obsidian-Markdown erzeugen |
| `src/link.js` | Links aufräumen und prüfen |
| `src/db.js` | SQLite, Nummerierung, Backups |
| `src/routes/` | HTTP-Endpunkte für Chat und Notizen |

Gespeichert werden nur die **Felder** einer Notiz – Dateiname und Markdown entstehen daraus beim Ausliefern. Eine Änderung am Notiz-Format gilt dadurch rückwirkend auch für alte Notizen.

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
| `START_NR` | Nummer, die die **nächste** Notiz bekommen soll – siehe unten |

> **`START_NR` richtig setzen:** Der Bot nummeriert die Dateinamen fortlaufend und würde bei leerer Datenbank mit `1` anfangen. Schau in Obsidian nach deiner zuletzt vergebenen Nummer und trage die nächste ein: liegt dort zuletzt `26 - MÄR …`, dann `START_NR = 27`. Der Wert greift nur, solange der Bot selbst noch keine Notiz gespeichert hat – danach zählt er von seiner höchsten Nummer weiter. Ohne das Secret startet er bei 1.

> **Kein SSH-Key zur Hand?** Bei Infomaniak-VPS (oder jedem anderen Anbieter) kannst du im Kundencenter einen SSH-Key hinterlegen bzw. herunterladen. Der *private* Key kommt in das Secret `VPS_SSH_KEY`, der *öffentliche* muss auf dem VPS in `~/.ssh/authorized_keys` stehen.

### 2. Voraussetzungen auf dem VPS (einmalig)

- Docker inkl. Compose-Plugin installiert (`docker compose version` muss funktionieren)
- Ports **80** und **443** frei (kein anderer Webserver darauf – sonst siehe unten)

### 3. DNS bei Infomaniak

Im Infomaniak-Manager unter deiner Domain **studiooswald.com → DNS-Zone**:

- Neuer Eintrag: Typ **A**, Name/Subdomain **`exh`**, Ziel = **IP deines VPS**, TTL Standard

Mehr ist nicht nötig. Das HTTPS-Zertifikat holt sich Caddy nach dem ersten Deployment automatisch von Let's Encrypt.

### 4. Deployen

Push auf den Branch `main` (oder im Repo unter **Actions → Deploy auf VPS → Run workflow** manuell starten). Die Action legt zuerst eine Sicherheitskopie der Datenbank an, kopiert den Code auf den VPS, schreibt die `.env` aus den Secrets, startet `docker compose up -d --build` und prüft danach, ob die App wirklich gesund hochkommt. Schlägt der Start fehl, steht in den Action-Logs, woran es lag.

Danach: **https://exh.studiooswald.com** öffnen, mit deinem `APP_PASSWORD` anmelden, loslegen. 🖼️

## Daten und Backups

Alles liegt in `~/exhibition-hub/data/` auf dem VPS:

- `exhibition-hub.db` – Notizen und Unterhaltungen
- `backups/` – automatische Kopien, eine pro Tag, die letzten 14 werden aufgehoben (`BACKUP_KEEP`), dazu je eine Kopie vor jedem Deployment

Zum Sichern reicht es, den Ordner `data/` zu kopieren – etwa mit `scp -r user@vps:~/exhibition-hub/data ./backup-$(date +%F)`. Zum Wiederherstellen die gewünschte Datei aus `backups/` über `exhibition-hub.db` legen und `docker compose restart app`.

> **Nur relevant, falls schon einmal eine ältere Version lief:** Die Datenbank lag früher in einem Docker-Volume namens `app-data` und liegt jetzt in `./data`. Bestehende Notizen einmalig herüberholen:
> ```bash
> cd ~/exhibition-hub && docker compose down
> docker run --rm -v exhibition-hub_app-data:/from -v "$PWD/data":/to alpine \
>   sh -c 'cp -a /from/. /to/'
> docker compose up -d --build
> ```

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
npm test        # 40 Tests, kein API-Key und kein Netz nötig

APP_PASSWORD=test-passwort SESSION_SECRET=ein-langes-dev-secret MOCK_AGENT=1 START_NR=26 npm start
# → http://localhost:3000  (MOCK_AGENT=1 simuliert den Bot ohne API-Key)
```

Der simulierte Bot spielt den echten Ablauf nach: recherchieren, in einer Nachricht nachfragen, speichern, einen bemängelten Link nachbessern und ab der dritten Nachricht eine Korrektur einarbeiten. Damit lassen sich Nummerierung, Aktualisieren, Link-Prüfung und Wiederherstellen ohne API-Key durchspielen.

Die Tests decken die Stellen ab, an denen die erste Fassung Ärger gemacht hat: Nummerierung und START_NR, Korrektur ohne zweite Notiz, Wiederherstellen nach Reload, Aufräumen des Verlaufs, Cache-Punkte, Link-Behandlung (inklusive 404 und ausgesperrter Bots gegen einen lokalen Testserver), Anmeldung samt Sperre und Ablauf des Tokens. Die Deploy-Action führt sie vor jedem Ausrollen aus – schlagen sie fehl, wird nicht deployt.

### Weitere Einstellungen

Alle optional, per Umgebungsvariable bzw. `.env` (siehe `.env.example`):

| Variable | Standard | Bedeutung |
|---|---|---|
| `START_NR` | `1` | Nummer der nächsten Notiz, solange die Datenbank leer ist |
| `TIMEZONE` | `Europe/Berlin` | Zeitzone für „heute" und die Datumsfelder |
| `MODEL` | `claude-sonnet-5` | verwendetes Modell |
| `BACKUP_KEEP` | `14` | wie viele tägliche Backups aufgehoben werden |
| `SESSION_DAYS` | `365` | wie lange man angemeldet bleibt |
| `LINK_CHECK` | `1` | Ausstellungsseite beim Speichern anfragen; `0` schaltet das ab |

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

Die Datumsfelder sind im ISO-Format, damit Obsidian sie als Date-Properties erkennt. In der Notiz-Karte gibt es je einen Button für den Dateinamen und den Markdown-Inhalt, dazwischen den Link zum Antippen.

## Was als Nächstes sinnvoll wäre

Bewusst noch nicht gebaut, damit der Kern schlank bleibt:

- **Fotos:** Ausstellungsbilder im Chat hochladen und als Anhang in die Notiz legen.
- **Direkt nach Obsidian schreiben:** statt kopieren die Datei gleich in einen Sync-Ordner legen (iCloud/Dropbox) oder per Obsidian-URI anlegen.
