const $ = (sel) => document.querySelector(sel);

const loginView = $('#login-view');
const appView = $('#app-view');
const messagesEl = $('#messages');
const chatForm = $('#chat-form');
const chatInput = $('#chat-input');
const sendBtn = $('#send-btn');
const notesList = $('#notes-list');
const sidebar = $('#sidebar');

const GREETING =
  'In welcher Ausstellung warst du? Erzähl mir einfach kurz, was du gesehen hast – ich recherchiere den Rest und baue dir die Obsidian-Notiz.';

// Die Unterhaltung überlebt einen Reload: Safari wirft Tabs im Hintergrund
// gerne raus, der Verlauf liegt aber auf dem Server.
const STORAGE_KEY = 'exhibition-hub.conversationId';
let conversationId = localStorage.getItem(STORAGE_KEY) || newConversationId();
let busy = false;

// Notiz-Karten im Chat, damit eine Korrektur die bestehende Karte ersetzt
const noteCards = new Map();

function newConversationId() {
  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

// ---- Init ----------------------------------------------------------------

async function init() {
  const res = await fetch('/api/me');
  const { authed } = await res.json();
  if (authed) {
    showApp();
  } else {
    loginView.classList.remove('hidden');
  }
}

async function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  loadNotes();
  await restoreConversation();
  chatInput.focus();
}

async function restoreConversation() {
  messagesEl.innerHTML = '';
  noteCards.clear();
  try {
    const res = await fetch(`/api/conversations/${conversationId}`);
    if (!res.ok) throw new Error('nicht ladbar');
    const { messages, note } = await res.json();
    if (messages.length === 0) {
      addMessage('assistant', GREETING);
      return;
    }
    for (const message of messages) addMessage(message.role, message.text);
    if (note) showNoteCard(note);
  } catch {
    addMessage('assistant', GREETING);
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: $('#password').value }),
  });
  if (res.ok) {
    showApp();
  } else {
    const { error } = await res.json().catch(() => ({}));
    $('#login-error').textContent = error || 'Falsches Passwort';
  }
});

// ---- Chat ----------------------------------------------------------------

function addMessage(role, text) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollDown();
  return bubble;
}

function addStatus(text) {
  const el = document.createElement('div');
  el.className = 'status-line';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollDown();
  return el;
}

/**
 * Zeigt eine Notiz im Chat. Ist die Notiz schon zu sehen (Korrektur, oder
 * Klick auf denselben Eintrag im Verlauf), wird die vorhandene Karte
 * aktualisiert statt eine zweite anzulegen.
 */
function showNoteCard(note) {
  const existing = noteCards.get(note.id);
  if (existing) {
    fillNoteCard(existing, note);
    existing.classList.add('note-card--updated');
    setTimeout(() => existing.classList.remove('note-card--updated'), 1800);
    existing.scrollIntoView({ block: 'nearest' });
    return;
  }

  const card = $('#note-card-template').content.cloneNode(true).querySelector('.note-card');
  fillNoteCard(card, note);
  card.querySelector('.copy-btn').addEventListener('click', (e) =>
    copyToClipboard(card.dataset.markdown, e.target, 'Kopiert ✓', 'Notiz kopieren')
  );
  card.querySelector('.copy-filename-btn').addEventListener('click', (e) =>
    copyToClipboard(card.dataset.filename, e.target, 'Kopiert ✓', 'Name kopieren')
  );

  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.appendChild(card);
  messagesEl.appendChild(wrap);
  noteCards.set(note.id, card);
  scrollDown();
}

function fillNoteCard(card, { filename, markdown }) {
  card.dataset.filename = filename;
  card.dataset.markdown = markdown;
  card.querySelector('.note-filename').textContent = filename;
  card.querySelector('.note-markdown').textContent = markdown;
}

async function copyToClipboard(text, btn, doneLabel, normalLabel) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback für ältere Browser / http
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  btn.classList.add('copied');
  btn.textContent = doneLabel;
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.textContent = normalLabel;
  }, 1600);
}

function scrollDown() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage();
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || busy) return;
  busy = true;
  sendBtn.disabled = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  addMessage('user', text);

  let assistantBubble = null;
  let statusEl = addStatus('Denke nach …');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, message: text }),
    });
    if (!res.ok || !res.body) throw new Error('Request fehlgeschlagen');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseSSE(raw);
        if (!event) continue;

        if (event.type === 'text') {
          statusEl?.remove();
          statusEl = null;
          if (!assistantBubble) assistantBubble = addMessage('assistant', '');
          assistantBubble.textContent += event.data.text;
          scrollDown();
        } else if (event.type === 'status') {
          if (statusEl) statusEl.textContent = event.data.text;
          else statusEl = addStatus(event.data.text);
        } else if (event.type === 'note') {
          statusEl?.remove();
          statusEl = null;
          showNoteCard(event.data);
          loadNotes();
          // Nach der Notiz folgt noch der Abschlusssatz – als neue Blase
          assistantBubble = null;
        } else if (event.type === 'error') {
          statusEl?.remove();
          statusEl = null;
          addMessage('assistant', '⚠️ ' + event.data.error);
        }
      }
    }
  } catch {
    addMessage('assistant', '⚠️ Verbindungsfehler – bitte erneut versuchen.');
  } finally {
    statusEl?.remove();
    busy = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

function parseSSE(raw) {
  let type = 'message';
  const dataLines = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event: ')) type = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
  }
  if (dataLines.length === 0) return null;
  try {
    return { type, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

// ---- Notizen-Verlauf -----------------------------------------------------

async function loadNotes() {
  const res = await fetch('/api/notes');
  if (!res.ok) return;
  const notes = await res.json();
  notesList.innerHTML = '';
  if (notes.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Noch keine Notizen';
    notesList.appendChild(li);
    return;
  }
  for (const note of notes) {
    notesList.appendChild(buildNoteListItem(note));
  }
}

function buildNoteListItem(note) {
  const li = document.createElement('li');

  const label = document.createElement('div');
  label.className = 'note-label';
  label.textContent = note.filename;
  const date = document.createElement('span');
  date.className = 'note-date';
  date.textContent = new Date(note.created_at + 'Z').toLocaleDateString('de-DE');
  label.appendChild(date);
  label.addEventListener('click', async () => {
    const r = await fetch(`/api/notes/${note.id}`);
    if (!r.ok) return;
    showNoteCard(await r.json());
    sidebar.classList.remove('open');
  });

  const del = document.createElement('button');
  del.className = 'note-delete';
  del.title = 'Notiz löschen';
  del.textContent = '✕';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`„${note.filename}" wirklich löschen?`)) return;
    const r = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
    if (!r.ok) return;
    noteCards.get(note.id)?.closest('.message')?.remove();
    noteCards.delete(note.id);
    loadNotes();
  });

  li.appendChild(label);
  li.appendChild(del);
  return li;
}

// ---- Sonstiges -----------------------------------------------------------

$('#new-chat').addEventListener('click', () => {
  conversationId = newConversationId();
  noteCards.clear();
  messagesEl.innerHTML = '';
  addMessage('assistant', 'Neue Unterhaltung – in welcher Ausstellung warst du?');
  sidebar.classList.remove('open');
});

$('#toggle-sidebar').addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

init();
