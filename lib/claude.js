import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';
const MAX_CONTINUATIONS = 5;

const client = new Anthropic();

const SYSTEM = `Du bist ein Recherche-Assistent für Ausstellungsbesuche. Der User nennt dir eine Ausstellung
(und meist das Museum), die er besucht hat. Deine Aufgabe:

1. Finde über die Websuche die offizielle Seite der Ausstellung auf der Website des Museums.
2. Extrahiere den offiziellen Ausstellungstext des Museums WÖRTLICH — nicht paraphrasieren,
   nicht kürzen, nicht übersetzen. Übernimm den Text in der Originalsprache der Museumsseite.
3. Ermittle: Laufzeit (Eröffnungs- und Enddatum), vollständige Künstlerliste, Kurator:in(en),
   Disziplin (z.B. Malerei, Fotografie, Installation, Gruppenausstellung) und den Link zur Ausstellungsseite.

Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt, ohne Text davor oder danach, ohne Markdown-Codeblock:

{
  "status": "ok",
  "title": "Titel der Ausstellung",
  "museum": "Name des Museums, Stadt",
  "opening_date": "YYYY-MM-DD oder leerer String, wenn nicht gefunden",
  "ending_date": "YYYY-MM-DD oder leerer String, wenn nicht gefunden",
  "discipline": "Disziplin oder leerer String",
  "artists": ["Name 1", "Name 2"],
  "curator": "Name(n) oder leerer String",
  "link": "https://... (URL der Ausstellungsseite beim Museum)",
  "exhibition_text": "Der wörtliche offizielle Ausstellungstext"
}

Wenn die Angabe mehrdeutig ist (z.B. mehrere passende Ausstellungen oder Häuser) oder du die
Ausstellung nicht sicher identifizieren kannst, stelle stattdessen eine Rückfrage:

{ "status": "question", "question": "Deine Rückfrage an den User" }

Regeln:
- Bevorzuge die offizielle Museums-Website als Quelle; Presseportale nur als Fallback.
- Erfinde keine Daten. Was du nicht findest, bleibt ein leerer String bzw. eine leere Liste.
- Bei sehr langen Künstlerlisten: alle Namen aufführen, die die Museumsseite nennt.`;

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function researchExhibition(messages) {
  const convo = [...messages];
  let response;

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      messages: convo,
    });
    response = await stream.finalMessage();
    if (response.stop_reason !== 'pause_turn') break;
    // Server-Tool-Loop pausiert: Assistant-Turn anhängen und weiterlaufen lassen
    convo.push({ role: 'assistant', content: response.content });
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const parsed = extractJson(text);
  if (parsed && (parsed.status === 'ok' || parsed.status === 'question')) {
    return { result: parsed, rawText: text };
  }
  // Kein valides JSON — Antwort als Rückfrage an den User durchreichen
  return { result: { status: 'question', question: text.trim() || 'Ich konnte die Ausstellung nicht identifizieren. Kannst du Museum und Stadt nennen?' }, rawText: text };
}
