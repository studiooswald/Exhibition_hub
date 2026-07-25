# Exhibition Bot

Telegram-Bot, der Ausstellungsbesuche als **Obsidian-Notizen** aufbereitet. Du schreibst ihm, in welcher Ausstellung du warst – er recherchiert per Web-Suche Museum, Laufzeit, Künstler:innen, Kurator:innen, den offiziellen Ausstellungstext und den Link, fragt nach deinem Kommentar und schickt die fertige Notiz zurück: als kopierbaren Block **und** als `.md`-Datei, die du direkt in deinen Vault legen kannst. Die laufende Nummer im Dateinamen (`27 - MÄR Shifting The Silence`) zählt automatisch hoch.

Kein Server-Login, keine Subdomain, kein Zertifikat – der Bot holt seine Nachrichten selbst bei Telegram ab.

## Wie es sich anfühlt

```
Du   War heute in Shifting the Silence im Lenbachhaus
Bot  🔎 Suche: Shifting the Silence Lenbachhaus
Bot  Ich habe die Ausstellung gefunden … kuratiert von Eva Huttenlauch und
     Matthias Mühling, mit 40 Künstler:innen. Laufzeit bis 01.01.2027.
     Was ist dein persönlicher Kommentar? An welchem Tag warst du dort?

Du   Das Spiel mit Materialien war spannend. War am 15.3.2026 dort.
Bot  📝 Notiz gespeichert – Nr. 27
     🔗 https://www.lenbachhaus.de/programm/ausstellungen/detail/…
     Dateiname:  27 - MÄR Shifting The Silence
     ---  (die fertige Notiz zum Antippen und Kopieren)
     📎 27 - MÄR Shifting The Silence.md

Du   Das Enddatum stimmt nicht, die läuft bis Ende Februar
Bot  ✏️ Notiz aktualisiert – Nr. 27
```

Korrekturen ändern **dieselbe** Notiz – sie behält ihre Nummer, es entsteht keine zweite. Für die nächste Ausstellung `/neu` schicken; nach ein paar Stunden Pause fängt der Bot ohnehin von selbst neu an, damit nichts versehentlich als Korrektur gilt.

## Befehle

| Befehl | Wirkung |
|---|---|
| `/neu` | nächste Ausstellung, frisch anfangen |
| `/liste` | die letzten Notizen mit Nummer |
| `/notiz <Nr>` | eine Notiz noch einmal schicken |
| `/loeschen <Nr>` | eine Notiz löschen |
| `/nummer` | zeigt die nächste Nummer; `/nummer 27` setzt sie |
| `/export` | alle Notizen als JSON-Datei sichern |
| `/hilfe` | Übersicht |

`/nummer` ist der Weg, den Bot an deine bestehenden Obsidian-Notizen anzuschließen: Steht dort zuletzt `26 - MÄR …`, schick ihm einmal `/nummer 27`.

## Der Link zur Ausstellung

Das Feld, bei dem Web-Recherche am ehesten danebengreift – deshalb besonders behandelt:

- Der Bot muss die offizielle Seite **genau dieser** Ausstellung liefern, nicht die Startseite des Museums, keine Übersichtsliste, kein Kunstportal. Erfinden ist ihm ausdrücklich untersagt.
- Beim Speichern wird die Adresse aufgeräumt (Tracking-Parameter, Anker, Markdown-Klammern) und einmal angefragt. Zeigt sie nur auf die Startseite oder antwortet sie mit 404, bekommt der Bot das zurückgemeldet, sucht noch einmal und speichert die bessere Adresse – ohne dass du im Chat zwei Notizen siehst.
- Findet er nichts, sagt er es offen, statt etwas zu erfinden. Die Notiz wird trotzdem gespeichert und in `/liste` als „ohne Link" markiert.

## Einrichten

### 1. Bot bei Telegram anlegen

In Telegram **@BotFather** anschreiben → `/newbot` → Namen und Benutzernamen vergeben. Du bekommst ein Token der Form `123456789:AA…`.

Deine eigene Nutzer-ID sagt dir **@userinfobot**. Nur diese ID darf den Bot später benutzen – das ersetzt jeden Login.

### 2. Auf den Server

Der Bot läuft im selben Muster wie die anderen Bots, in `/root/exhibition-bot`:

```bash
ssh root@62.238.0.148          # BoxAndSites
git clone https://github.com/studiooswald/Exhibition_hub.git /root/exhibition-bot
cd /root/exhibition-bot
cp .env.example .env && nano .env      # Token, User-ID, API-Key eintragen
docker compose up -d --build
docker compose logs -f
```

Updates später:

```bash
cd /root/exhibition-bot && git pull && docker compose up -d --build
```

Mehr ist nicht nötig: kein DNS-Eintrag, kein Reverse Proxy, keine GitHub-Secrets. Wer trotzdem per Knopfdruck deployen will, findet unter **Actions → Deploy → Run workflow** den optionalen Weg; der braucht dann `VPS_HOST`, `VPS_USER` und `VPS_SSH_KEY`.

### 3. Loslegen

Dem Bot in Telegram `/start` schicken, dann `/nummer 27` (oder was deine nächste Nummer ist) – und danach einfach erzählen, wo du warst.

## Daten und Backups

Alles liegt in `/root/exhibition-bot/data/`:

- `exhibition-bot.db` – Notizen und Unterhaltungen
- `backups/` – automatische Kopien, eine pro Tag, die letzten 14 (`BACKUP_KEEP`)
- `heartbeat` – Lebenszeichen für den Docker-Healthcheck

Sichern: `scp -r root@62.238.0.148:/root/exhibition-bot/data ./backup-$(date +%F)`. Wiederherstellen: gewünschte Datei aus `backups/` über `exhibition-bot.db` legen und `docker compose restart`.

Zusätzlich holt `/export` jederzeit alle Notizen als JSON in den Chat.

## Aufbau des Codes

| Datei | Zuständig für |
|---|---|
| `src/config.js` | alle Einstellungen an einer Stelle, geprüft beim Start |
| `src/index.js` | Start, Telegram-Anbindung, Lebenszeichen |
| `src/bot.js` | Gesprächslogik und Befehle – ohne Telegram-Bibliothek, daher testbar |
| `src/telegram-format.js` | Nachrichten aufteilen, maskieren, Notiz-Nachrichten bauen |
| `src/agent.js` | Gesprächsschleife mit Claude, Prompt-Caching, Verlauf aufräumen |
| `src/prompt.js` | System-Prompt und Definition des `save_note`-Werkzeugs |
| `src/mock-agent.js` | simulierter Bot für Tests und zum Ausprobieren ohne API-Key |
| `src/note.js` | Felder normalisieren, Dateiname und Obsidian-Markdown erzeugen |
| `src/link.js` | Links aufräumen und prüfen |
| `src/db.js` | SQLite, Nummerierung, Backups |

Gespeichert werden nur die **Felder** einer Notiz – Dateiname und Markdown entstehen daraus beim Verschicken. Eine Änderung am Notiz-Format gilt dadurch rückwirkend auch für alte Notizen.

## Entwickeln und testen

```bash
npm install
npm test              # 49 Tests, ohne API-Key und ohne Netz
node test/demo.js     # zeigt einen kompletten Chatverlauf im Terminal
```

Die Tests decken ab: Nummerierung und `/nummer`, Korrektur ohne zweite Notiz, Zugangsschutz, alle Befehle, das Aufteilen langer Nachrichten, HTML-Maskierung, Link-Behandlung (inklusive 404 und ausgesperrter Bots gegen einen lokalen Testserver), Prompt-Caching und das Aufräumen des Verlaufs. `test/demo.js` zeigt, wie der Chat wirklich aussieht – dort ist beim Bauen ein Fehler aufgefallen, den die Tests durchgelassen hatten.

Mit echtem Token, aber ohne API-Key ausprobieren:

```bash
TELEGRAM_BOT_TOKEN=… TELEGRAM_USER_ID=… MOCK_AGENT=1 npm start
```

### Weitere Einstellungen

| Variable | Standard | Bedeutung |
|---|---|---|
| `START_NR` | `1` | Nummer der nächsten Notiz, solange die Datenbank leer ist (`/nummer` sticht) |
| `TIMEZONE` | `Europe/Berlin` | Zeitzone für „heute" und die Datumsfelder |
| `MODEL` | `claude-sonnet-5` | verwendetes Modell |
| `CONVERSATION_TIMEOUT_HOURS` | `6` | ab wann eine Nachricht als neue Ausstellung gilt |
| `BACKUP_KEEP` | `14` | wie viele tägliche Backups aufgehoben werden |
| `LINK_CHECK` | `1` | Ausstellungsseite beim Speichern anfragen; `0` schaltet das ab |

## Notiz-Format

Dateiname: `{Nr} - {MONAT} {Titel}`, z. B. `27 - MÄR Shifting The Silence`

```markdown
---
Museum: "Lenbachhaus, München"
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

Die Datumsfelder sind im ISO-Format, damit Obsidian sie als Date-Properties erkennt.

## Was als Nächstes sinnvoll wäre

- **Fotos:** Ausstellungsbilder an den Bot schicken und als Anhang in die Notiz legen.
- **Direkt in den Vault:** die `.md` gleich in den Obsidian-Ordner auf dem Server schreiben, statt sie zu verschicken – der Studio-Bot hat den Vault ja schon unter `/root/obsidian`.
