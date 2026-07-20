# Exhibition Hub

Persönlicher Ausstellungs-Bot: Du nennst eine Ausstellung, die du besucht hast — der Bot recherchiert
sie live im Web (Museums-Website, offizielle Ausstellungsseite) und erzeugt eine fertige
Obsidian-Notiz zum Kopieren, inklusive Frontmatter-Properties, wörtlichem Ausstellungstext,
Künstlerliste, Kurator:in und Laufzeit.

Läuft als kleine Node.js-App, gedacht für den Betrieb auf einem eigenen Server unter
einer Subdomain wie `exh.studiooswald.com`.

## Notiz-Format

Dateiname: `26 - MÄR Shifting the Silence` (laufende Nummer – Monat des Besuchs – Titel)

```markdown
---
Museum: Lenbachhaus, München
VisitDate: 2026-03-15
OpeningDate: nicht gefunden
EndingDate: 2027-01-01
Discipline:
Artists:
  - Etel Adnan
  - ...
Link: https://www.lenbachhaus.de/...
---
Exhibition Text:
<offizieller Text des Museums, wörtlich>

Curator:
...

Comment:
<deine Gedanken>

Inspiration for own work:
<dein Feld>
```

## Voraussetzungen

1. **Claude-API-Key** — auf [console.anthropic.com](https://console.anthropic.com) erstellen
   (Settings → API Keys). Kosten bei persönlicher Nutzung: grob 10–30 Cent pro Notiz
   (Modell `claude-opus-4-8` inkl. Websuche).
2. **Server mit Docker** (z.B. Hetzner-VPS) — oder lokal Node.js ≥ 20.

## Lokal starten (zum Testen)

```bash
cp .env.example .env   # ANTHROPIC_API_KEY und APP_PASSWORD eintragen
npm install
npm start              # → http://localhost:3000
```

Tests: `npm test`

## Deployment auf dem VPS (Hetzner)

```bash
# Auf dem Server:
git clone https://github.com/studiooswald/Exhibition_hub.git
cd Exhibition_hub
cp .env.example .env && nano .env   # API-Key + Passwort eintragen
docker compose up -d --build
```

Die App lauscht danach nur auf `127.0.0.1:3000` — nach außen geht es über einen Reverse Proxy mit TLS.

### DNS

Beim DNS-Anbieter von `studiooswald.com` einen **A-Record** anlegen:

```
exh.studiooswald.com  →  <IP deines VPS>
```

### Reverse Proxy — Variante A: Caddy (empfohlen, TLS automatisch)

```bash
sudo apt install caddy
```

`/etc/caddy/Caddyfile`:

```
exh.studiooswald.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy besorgt und erneuert das TLS-Zertifikat automatisch. Fertig.

### Reverse Proxy — Variante B: nginx + certbot

Falls auf dem VPS schon nginx läuft:

```nginx
# /etc/nginx/sites-available/exh.studiooswald.com
server {
    server_name exh.studiooswald.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # Recherche kann 1-2 Minuten dauern
    }
    listen 80;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/exh.studiooswald.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d exh.studiooswald.com
```

> **Wichtig:** Der Proxy-Timeout sollte ≥ 300 s sein — die Web-Recherche einer Notiz
> dauert typischerweise 1–2 Minuten.

## Updates einspielen

```bash
cd Exhibition_hub
git pull
docker compose up -d --build
```

## Konfiguration (`.env`)

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude-API-Key |
| `APP_PASSWORD` | empfohlen | Passwort für die Web-App (ohne: offen zugänglich) |
| `CLAUDE_MODEL` | — | Default `claude-opus-4-8` |
| `PORT` | — | Default `3000` |

## Architektur

- `server.js` — Hono-Server: statisches Frontend, Passwort-Login (Cookie), `POST /api/generate`
- `lib/claude.js` — Claude Messages API mit Web-Search-Tool; liefert strukturiertes JSON
  (oder eine Rückfrage bei Mehrdeutigkeit)
- `lib/note.js` — rendert JSON + eigene Eingaben in Obsidian-Markdown und den Dateinamen
- `public/index.html` — Single-Page-Frontend ohne Build-Step
