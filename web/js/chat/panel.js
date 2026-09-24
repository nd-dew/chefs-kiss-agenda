// The "Ask AI" panel: conversation UI, grounded in the page's current context.

import { db, dayOf } from '../agenda.js';
import { I } from '../icons.js';
import { emit } from '../lib/bus.js';
import { $, isPhone } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { session } from '../lib/storage.js';
import { hhmm, isPast, now } from '../lib/time.js';
import { FACETS, favs, saveFavs, state } from '../state.js';
import { optLabel } from '../taxonomy.js';
import { closeMenu } from '../ui/menu.js';
import { bindHover, hidePop } from '../ui/popover.js';
import { toast } from '../ui/toast.js';
import { hueStyle, starBtn } from '../views/parts.js';
import { health, streamChat } from './client.js';
import { refsIn, renderMarkdown, replaceRefs } from './markdown.js';

const HISTORY_KEY = 'oxp_chat_2026';
const MAX_SAVED_MESSAGES = 40;

const ui = {};
let messages = session.getJSON(HISTORY_KEY, []);
let busy = null; // AbortController while an answer streams
let aiOnline = null;

const persist = () => session.setJSON(HISTORY_KEY, messages.filter(m => !m.error).slice(-MAX_SAVED_MESSAGES));
const talkRefs = text => refsIn(text).filter(r => db.byRef.get(r) && !db.byRef.get(r).plenary);

function refCard(ref) {
  const t = db.byRef.get(ref);
  if (!t) return ''; // hidden (e.g. masterclass) or unknown session
  const where = t.plenary ? 'All venues' : esc(t.room_str);
  return `<span class="ref${isPast(t) ? ' is-past' : ''}" role="button" tabindex="0" data-id="${t.id}" style="${hueStyle(t)}">
    <span class="bar"></span><span class="ref-main"><span class="ref-title">${esc(t.title)}</span>
    <span class="ref-meta">${esc(dayOf(t).short_label.replace(' Sep', ''))} · ${hhmm(t.s)}–${hhmm(t.e)} · ${where}${t.youtube_id ? ' · ▶ video' : ''}</span></span>
    ${t.plenary ? '' : starBtn(t)}</span>`;
}

function suggestions() {
  const live = db.days.some(d => d.date === now().date);
  return [
    live && "What's worth seeing in the next hour?",
    'Plan my Friday around AI and developer talks, no overlaps',
    'Best beginner-friendly accounting sessions?',
    'Which talks are about Odoo 20 new features?',
    favs.size && 'Review my saved schedule: any clashes or gaps?',
    'Quelles sessions sont en français ?',
  ].filter(Boolean).slice(0, 5);
}

/** What the assistant should know about the page right now. */
function pageContext() {
  const n = now();
  const day = db.days.find(d => d.date === state.day);
  const saved = db.sessions.filter(t => favs.has(t.id)).map(t => t.ref);
  const filters = Object.keys(FACETS).filter(k => state[k].size)
    .map(k => `${FACETS[k].label}: ${[...state[k]].map(v => optLabel(k, v)).join(', ')}`);
  const open = state.drawer && db.byId.get(state.drawer);
  const view = { mine: 'saved schedule', grid: 'timetable', list: 'list' }[state.view];
  return [
    `Now (Brussels): ${n.date} ${hhmm(n.min)}`,
    `Viewing: ${day ? day.label : state.day} (${view})`,
    filters.length && `Active filters: ${filters.join('; ')}`,
    state.q && `Search box: "${state.q}"`,
    `Saved sessions (${saved.length}): ${saved.slice(0, 80).join(', ') || 'none'}`,
    open && `Open session: ${open.ref}`,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- rendering
function emptyState() {
  const offline = aiOnline === false
    ? '<br><strong>AI is offline:</strong> run <code>uv run oxp-agenda serve</code> with <code>GEMINI_API_KEY</code> set.'
    : '';
  return `<div class="chat-empty"><h3>Ask me about the agenda</h3>
    <p>I know every session, speaker and room across all five days, plus what you've saved.${offline}</p>
    <div class="sugs">${suggestions().map(q => `<button class="sug" type="button" data-sug="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
}

function messageHTML(m, i, streamingIdx) {
  if (m.error) return `<div class="msg err"><span>${esc(m.content)}</span><button class="btn" type="button" data-chat="retry">Retry</button></div>`;
  if (m.role === 'user') return `<div class="msg user">${renderMarkdown(m.content, { ref: refCard })}</div>`;
  const streaming = i === streamingIdx;
  if (streaming && !m.content) return '<div class="msg ai"><span class="typing"><i></i><i></i><i></i></span></div>';
  if (streaming) return `<div class="msg ai">${renderMarkdown(m.content, { ref: refCard, streaming })}</div>`;

  const refs = talkRefs(m.content);
  const unsaved = refs.filter(r => !favs.has(db.byRef.get(r).id));
  const saveAll = refs.length > 1 && unsaved.length
    ? `<button class="btn" type="button" data-chat="save-all" data-i="${i}">${I.star}Save ${unsaved.length === refs.length ? 'all ' : ''}${unsaved.length}</button>`
    : '';
  return `<div class="msg ai">${renderMarkdown(m.content, { ref: refCard })}
    <div class="msg-actions">${saveAll}<button class="btn ghost" type="button" data-chat="copy" data-i="${i}">${I.copy}Copy</button></div></div>`;
}

function render(streamingIdx = -1) {
  if (!db.sessions.length) return;
  ui.log.innerHTML = messages.length ? messages.map((m, i) => messageHTML(m, i, streamingIdx)).join('') : emptyState();
}

const scrollDown = () => (ui.log.scrollTop = ui.log.scrollHeight);
const nearBottom = () => ui.log.scrollHeight - ui.log.scrollTop - ui.log.clientHeight < 80;

function setBusy(ctrl) {
  busy = ctrl;
  ui.send.classList.toggle('stop', !!ctrl);
  ui.send.innerHTML = ctrl ? I.stop : I.send;
  ui.send.setAttribute('aria-label', ctrl ? 'Stop' : 'Send');
}

// ---------------------------------------------------------------- conversation
async function send(text) {
  text = String(text || '').trim();
  if (!text || busy) return;
  messages = messages.filter(m => !m.error);
  messages.push({ role: 'user', content: text });
  const history = messages.map(({ role, content }) => ({ role, content }));
  const reply = { role: 'assistant', content: '' };
  messages.push(reply);
  const idx = messages.length - 1;
  render(idx);
  scrollDown();

  const ctrl = new AbortController();
  setBusy(ctrl);
  let frame = 0;
  const paint = () => {
    frame = 0;
    const stick = nearBottom();
    render(idx);
    if (stick) scrollDown();
  };
  try {
    await streamChat({
      messages: history,
      context: pageContext(),
      signal: ctrl.signal,
      onText: chunk => {
        reply.content += chunk;
        frame ||= requestAnimationFrame(paint);
      },
    });
    if (!reply.content.trim()) throw new Error('The assistant returned an empty answer.');
  } catch (err) {
    if (!reply.content) messages.pop();
    if (err.name !== 'AbortError') messages.push({ role: 'assistant', error: true, content: err.message || String(err) });
  } finally {
    cancelAnimationFrame(frame);
    setBusy(null);
    persist();
    render();
    scrollDown();
  }
}

function retry() {
  messages = messages.filter(m => !m.error);
  const lastUser = messages.findLastIndex(m => m.role === 'user');
  if (lastUser < 0) return;
  const question = messages[lastUser].content;
  messages = messages.slice(0, lastUser);
  send(question);
}

function copyAnswer(i) {
  const text = replaceRefs(messages[i].content, ref => {
    const t = db.byRef.get(ref);
    return t ? `“${t.title}” (${t.short_label} ${t.start_time}, ${t.room_str})` : ref;
  });
  navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Could not copy'));
}

function saveAll(i) {
  const refs = talkRefs(messages[i].content);
  refs.forEach(r => favs.add(db.byRef.get(r).id));
  saveFavs();
  emit('favs');
  emit('change');
  toast(`Saved ${refs.length} sessions`);
}

// ---------------------------------------------------------------- panel
export const isOpen = () => ui.panel.classList.contains('open');

export function open() {
  ui.panel.classList.add('open');
  ui.panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('chat-open');
  hidePop();
  closeMenu();
  render();
  scrollDown();
  autosize();
  if (!isPhone()) setTimeout(() => ui.input.focus({ preventScroll: true }), 60);
}

export function close() {
  ui.panel.classList.remove('open');
  ui.panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('chat-open');
  ui.input.blur();
}

export function ask(question) {
  open();
  send(question);
}

/** Re-render (e.g. stars changed elsewhere) unless an answer is streaming. */
export function refresh() {
  if (isOpen() && !busy) render();
}

function autosize() {
  ui.input.style.height = 'auto';
  ui.input.style.height = `${Math.min(ui.input.scrollHeight, 140)}px`;
}

export async function initChat() {
  Object.assign(ui, {
    panel: $('#chat'), log: $('#chat-log'), form: $('#chat-form'), input: $('#chat-input'), send: $('#chat-send'),
  });
  bindHover(ui.log);

  ui.form.addEventListener('submit', e => {
    e.preventDefault();
    if (busy) return busy.abort();
    const text = ui.input.value;
    ui.input.value = '';
    autosize();
    send(text);
  });
  ui.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ui.form.requestSubmit();
    }
  });
  ui.input.addEventListener('input', autosize);
  $('#ai-fab').addEventListener('click', open);

  ui.panel.addEventListener('click', e => {
    const suggestion = e.target.closest('[data-sug]');
    if (suggestion) return send(suggestion.dataset.sug);
    const btn = e.target.closest('[data-chat]');
    const i = Number(btn?.dataset.i);
    switch (btn?.dataset.chat) {
      case 'close': return close();
      case 'reset':
        busy?.abort();
        messages = [];
        persist();
        render();
        return ui.input.focus();
      case 'retry': return retry();
      case 'copy': return copyAnswer(i);
      case 'save-all': return saveAll(i);
    }
  });

  const status = await health();
  aiOnline = !!status.ai;
  $('#chat-model').textContent = aiOnline ? `Gemini · knows all ${db.sessions.length} sessions` : 'AI backend offline';
  if (!messages.length) render();
}
