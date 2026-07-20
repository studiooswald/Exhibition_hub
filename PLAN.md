# Exhibition Hub – Plan

Ein persönlicher Bot unter **exh.studiooswald.com**: Du sagst ihm, in welcher
Ausstellung du warst, er recherchiert und fasst alles Wichtige als
Markdown-Notiz zusammen – fertig formatiert zum Kopieren (oder direkten
Übernehmen) in Obsidian.

---

## 1. Wie es sich anfühlen soll (User Flow)

1. Du öffnest `exh.studiooswald.com` (passwortgeschützt, nur für dich).
2. Du tippst z. B.: *„Caspar David Friedrich, Alte Nationalgalerie, gestern"*
   – optional mit eigenen Eindrücken oder einem Foto vom Ticket/Flyer.
3. Der Bot recherchiert per Websuche (Ausstellungsseite des Museums,
   Pressetexte, Rezensionen) und erzeugt eine strukturierte Markdown-Notiz.
4. Du bekommst die Notiz mit drei Buttons:
   - **Kopieren** (Markdown in die Zwischenablage)
   - **In Obsidian öffnen** (via `obsidian://new`-URI, legt die Notiz direkt im Vault an)
   - **.md herunterladen** (Dateiname = Notiz-Titel)
5. Optional: Die Notiz wird zusätzlich in einer kleinen Historie gespeichert,
   sodass du alle besuchten Ausstellungen im Hub nachschlagen kannst.

## 2. Notiz-Template (Vorschlag – bitte an deine Obsidian-Vorlage anpassen)

```markdown
---
typ: ausstellung
titel: "Caspar David Friedrich – Unendliche Landschaften"
museum: "Alte Nationalgalerie"
ort: "Berlin"
besucht: 2026-07-19
laufzeit: 2026-04-19 – 2026-08-04
kuenstler: [Caspar David Friedrich]
tags: [ausstellung, romantik, malerei]
---

## Kurzfassung
2–3 Sätze: Worum ging es, was war das Besondere.

## Kuratorisches Konzept
Aufbau, Themenräume, These der Ausstellung.

## Wichtige Werke
- **Werktitel (Jahr)** – warum relevant / was gezeigt wurde

## Künstler:in / Kontext
Kurzbio bzw. kunsthistorische Einordnung.

## Rezeption
Was Kritik/Presse sagen (mit Quellen-Links).

## Meine Eindrücke
> Hier fließen deine eigenen Notizen ein (vom Bot eingearbeitet oder leer gelassen).

## Quellen
- [Museumsseite](…)
- [Rezension](…)
```

Das Template liegt im Code als eigene Datei (`templates/note.md`), damit du es
jederzeit ändern kannst, ohne den Bot anzufassen.

## 3. Architektur

```
Browser (exh.studiooswald.com)
   │  einfache Chat-/Formular-Seite, Streaming-Ausgabe
   ▼
Backend (ein kleiner Server / Serverless Function)
   │  - Basic-Auth / Passwort
   │  - ruft Claude API mit Web-Search-Tool auf
   │  - füllt das Notiz-Template
   ▼
Claude API (claude-sonnet-5 + web_search)
   │
   ▼
Speicher (optional): SQLite/KV für Historie der Notizen
```

**Wichtige Entscheidung:** Die Websuche macht Claudes serverseitiges
`web_search`-Tool – wir müssen also keinen eigenen Scraper bauen.

### Tech-Stack (Vorschlag)

| Baustein | Wahl | Warum |
|---|---|---|
| Hosting | Cloudflare Pages + Workers (oder Vercel) | kostenlos, HTTPS, Subdomain trivial |
| Frontend | Eine schlanke Seite (HTML/Alpine oder Next.js) | es ist im Kern ein Formular + Markdown-Ansicht |
| Backend | Worker/Route mit Anthropic SDK | streamt die Antwort live in die Seite |
| Modell | `claude-sonnet-5` mit `web_search` | gute Recherche, geringe Kosten (~wenige Cent pro Notiz) |
| Auth | ein Shared-Secret/Passwort (Cookie) | Single-User, kein Login-System nötig |
| Historie | Cloudflare KV oder D1 (SQLite) | optional, Phase 3 |

### DNS
`exh.studiooswald.com` → CNAME auf das Hosting-Projekt (bei Cloudflare Pages
ein Klick, sonst CNAME-Eintrag beim DNS-Provider).

## 4. Obsidian-Anbindung (drei Stufen)

1. **Copy-Paste (MVP):** Kopieren-Button, du fügst es selbst ein. Null Setup.
2. **Obsidian-URI:** Button erzeugt `obsidian://new?vault=<dein-vault>&name=<titel>&content=<markdown>` – Obsidian öffnet sich und legt die Notiz an. Funktioniert auf Desktop und Mobile, kein Plugin nötig.
3. **Vollautomatisch (später, optional):** Wenn dein Vault per Git oder über das Plugin „Local REST API" erreichbar ist, kann der Bot die Notiz direkt ablegen.

## 5. Umsetzungsphasen

### Phase 1 – MVP (das Kernstück)
- [ ] Projektgerüst + Deployment auf Subdomain, Passwortschutz
- [ ] Eingabeseite: Freitextfeld („Wo warst du?") + optionales Feld „Meine Eindrücke"
- [ ] Backend-Route: Prompt + Template + Web-Search → gestreamte Markdown-Notiz
- [ ] Kopieren-Button + Markdown-Vorschau

### Phase 2 – Obsidian-Komfort
- [ ] `obsidian://new`-Button (Vault-Name konfigurierbar)
- [ ] Download als `.md` mit sauberem Dateinamen (`YYYY-MM-DD Titel.md`)
- [ ] Template exakt an deine bestehende Obsidian-Vorlage angleichen

### Phase 3 – Nice-to-have
- [ ] Historie aller Notizen im Hub (Liste + Wiederöffnen)
- [ ] Foto-Upload (Ticket/Flyer/Wandtext) – Claude liest Titel & Daten daraus
- [ ] Nachfragen im Chat („geh tiefer auf Werk X ein") vor dem Export

## 6. Offene Punkte / von dir benötigt

1. **Deine Vorlage:** Die im Chat erwähnten Anhänge sind nicht angekommen –
   bitte die Beispiel-Notiz(en) nachreichen, dann wird das Template exakt daran
   ausgerichtet (Frontmatter-Felder, Tags, Abschnittsnamen).
2. **Anthropic API-Key** (für den Bot) als Secret im Hosting.
3. **Hosting-Präferenz:** Cloudflare oder Vercel – oder läuft schon etwas
   Eigenes für studiooswald.com, an das wir andocken sollen?
4. **Obsidian-Vault-Name** für den URI-Button (Phase 2).
