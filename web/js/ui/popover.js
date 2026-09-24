// Hover card with session details (pointer devices only).

import { db, dayOf } from '../agenda.js';
import { I } from '../icons.js';
import { $, canHover } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { dur, hhmm, isLive, now } from '../lib/time.js';
import { favs } from '../state.js';
import { affTag, speakerBlock, tagChips } from '../views/parts.js';

const SHOW_DELAY = 280;
const MOVE_DELAY = 60; // when a card is already showing
const MARGIN = 12;

let timer = null;
let current = null;

function content(t) {
  const n = now();
  return `
    <div class="pop-top">${isLive(t, n) ? '<span class="pill live">Live now</span>' : ''}<span>${esc(dayOf(t).short_label)} · ${hhmm(t.s)}–${hhmm(t.e)} · ${dur(t.e - t.s)}</span></div>
    <h4 class="pop-title">${esc(t.title)}</h4>
    <div class="pop-top pop-where">${I.pin}<span>${t.plenary ? 'All venues' : esc(t.room_str)}</span>${t.youtube_id ? `<span>·</span>${I.play}<span>Video</span>` : ''}</div>
    ${t.name ? speakerBlock(t) : ''}${t.aff ? `<div class="pop-aff">${affTag(t)}</div>` : ''}
    ${t.desc ? `<p class="pop-desc">${esc(t.desc.replace(/\n+/g, ' '))}</p>` : ''}
    ${t.badges.length || t.tracks.length ? tagChips(t, { max: 6 }) : ''}
    <div class="pop-foot"><span>Click for details</span><span>${favs.has(t.id) ? '★ Saved' : '☆ Star to save'}</span></div>`;
}

/** Place the card beside the anchor, flipping/clamping to stay on screen. */
function place(pop, anchor, pointerX) {
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  let x;
  let y;
  if (anchor.classList.contains('plen')) {
    x = pointerX + 16;
    y = r.bottom + 8;
  } else {
    x = r.right + 10;
    y = r.top;
    if (x + w > innerWidth - MARGIN) x = r.left - w - 10;
  }
  if (x < MARGIN) {
    x = Math.min(Math.max(MARGIN, r.left), innerWidth - w - MARGIN);
    y = r.bottom + 8;
    if (y + h > innerHeight - MARGIN) y = r.top - h - 8;
  }
  x = Math.min(x, innerWidth - w - MARGIN);
  y = Math.max(MARGIN, Math.min(y, innerHeight - h - MARGIN));
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
}

function show(anchor, pointerX) {
  const t = db.byId.get(anchor.dataset.id);
  if (!t) return;
  const pop = $('#popover');
  pop.innerHTML = content(t);
  pop.hidden = false;
  place(pop, anchor, pointerX);
}

export function hidePop() {
  clearTimeout(timer);
  current = null;
  $('#popover').hidden = true;
}

/** Show the card when hovering any [data-id] element inside `zone`. */
export function bindHover(zone) {
  zone.addEventListener('mouseover', e => {
    if (!canHover()) return;
    const el = e.target.closest('[data-id]');
    if (!el || el === current) return;
    current = el;
    clearTimeout(timer);
    const x = e.clientX;
    timer = setTimeout(() => show(el, x), $('#popover').hidden ? SHOW_DELAY : MOVE_DELAY);
  });
  zone.addEventListener('mouseout', e => {
    const el = e.target.closest('[data-id]');
    if (el && !el.contains(e.relatedTarget)) hidePop();
  });
  zone.addEventListener('scroll', hidePop, { passive: true });
}
