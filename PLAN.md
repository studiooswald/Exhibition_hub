# Exhibition Hub – Plan

Persönlicher Ausstellungs-Bot unter **exh.studiooswald.com**: Ich sage ihm, in welcher
Ausstellung ich war, er recherchiert und fasst alles Wichtige zusammen und liefert eine
fertige Markdown-Notiz, die ich direkt in Obsidian kopieren (oder später automatisch
ablegen) kann.

## Ablauf aus Nutzersicht

1. Seite auf dem Handy öffnen (direkt im/nach dem Museum).
2. Eingeben: Ausstellungsname + Museum/Ort, optional eigene Eindrücke, Lieblingswerke,
   Fotos (Ticket, Wandtext).
3. Der Bot recherchiert im Web (Museums-Website, Pressetexte, Rezensionen) und erstellt
   eine strukturierte Obsidian-Notiz.
4. Ein Klick auf „Kopieren" → in Obsidian einfügen. (Später optional: automatisch in den
   Vault schreiben.)

## Notiz-Format (Entwurf, wird an den echten Vault angepasst)

```markdown
---
titel: "Ausstellungstitel"
museum: "Museum XY"
ort: "Berlin"
besucht: 2026-07-20
laufzeit: "2026-05-01 – 2026-09-30"
kuenstler: ["Name"]
tags: [ausstellung, malerei]
---

## Überblick
Kurzzusammenfassung der Ausstellung (2–4 Sätze).

## Künstler:in / Hintergrund
Wer, Kontext, Werkphase.

## Zentrale Werke & Themen
- Werk 1 – warum relevant
- Kuratorisches Konzept

## Eigene Eindrücke
(meine Notizen, vom Bot sprachlich aufbereitet)

## Quellen
- [Museums-Website](…)
- Rezensionen
```

## Architektur

```
Browser (exh.studiooswald.com)
   │  einfache Chat-/Formular-Oberfläche, mobile-first
   ▼
Backend (ein kleiner Server, z. B. FastAPI oder Hono)
   │  Prompt-Template + Vault-Konventionen
   ▼
Claude API (claude-sonnet-5) mit Web-Search-Tool
   │  recherchiert die Ausstellung, schreibt die Notiz
   ▼
Markdown-Notiz zurück an den Browser (Copy-Button)
```

- **Frontend:** eine einzige Seite, kein Framework-Overkill. Eingabefelder, Verlauf der
  Konversation, gerenderte Vorschau der Notiz + „Als Markdown kopieren"-Button.
- **Backend:** hält den `ANTHROPIC_API_KEY` als Secret, baut den Prompt (inkl. Beispiel-
  Notizen aus dem Vault als Formatvorlage) und streamt die Antwort.
- **Recherche:** Claudes eingebautes Web-Search-Tool – keine eigene Scraping-Logik nötig.
- **Auth:** simples Passwort/Magic-Link, da rein persönlich.
- **Hosting:** z. B. Vercel oder Cloudflare (Frontend + Serverless-Backend in einem),
  DNS: CNAME `exh` auf den Hoster. Alternativ ein kleiner VPS, wenn schon vorhanden.

## Ausbaustufen

**Phase 1 – MVP (Copy & Paste):**
Formular → Claude mit Web-Search → Obsidian-Markdown mit Copy-Button. Deployment auf
exh.studiooswald.com mit Passwortschutz.

**Phase 2 – Feinschliff:**
- Ausgabeformat exakt an bestehende Vault-Notizen angleichen (Frontmatter-Felder, Tags,
  interne `[[Links]]` zu Künstler:innen/Museen).
- Rückfragen-Modus: Bot fragt nach, wenn die Ausstellung nicht eindeutig ist.
- Archiv: bereits erstellte Notizen auf der Seite wiederfinden.

**Phase 3 – Direkt in den Vault (optional):**
- Variante A: Vault liegt (auch) in einem Git-Repo → Backend committet die Notiz,
  Obsidian-Git-Plugin synchronisiert. Robust und einfach.
- Variante B: Obsidian „Local REST API"-Plugin, wenn der Vault-Rechner erreichbar ist.

**Phase 4 – Nice-to-have:**
- Foto-Upload: Ticket/Wandtext fotografieren, Claude liest Titel & Daten selbst aus.
- Kurz-Erfassung unterwegs, ausführliche Notiz später zu Hause generieren.

## Offene Punkte

1. Beispiel-Notiz(en) aus dem Obsidian-Vault als Formatvorlage (die erwähnten Anhänge
   sind nicht angekommen).
2. Hosting-Präferenz (Vercel/Cloudflare vs. eigener Server) – Empfehlung: Vercel,
   weil Subdomain + Secrets + Deployment am wenigsten Aufwand sind.
3. Sprache der Notizen: Deutsch, Englisch oder je nach Ausstellung?
