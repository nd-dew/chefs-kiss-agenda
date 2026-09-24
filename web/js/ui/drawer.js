// Session details side panel (bottom sheet on phones).

import { db, dayOf } from '../agenda.js';
import { downloadIcs, gcalUrl, icsName, ODOO_URL } from '../calendar.js';
import { I } from '../icons.js';
import { $ } from '../lib/dom.js';
import { esc, linkify } from '../lib/html.js';
import { dur, hhmm, isLive, isPast, now } from '../lib/time.js';
import { favs, state } from '../state.js';
import { optLabel } from '../taxonomy.js';
import { affTag, rowHTML, speakerBlock, tagChips } from '../views/parts.js';
import { closeMenu } from './menu.js';
import { hidePop } from './popover.js';
import { toast } from './toast.js';

let returnFocus = null;

const el = () => $('#drawer');
export const openSession = () => db.byId.get(state.drawer);

function related(t, n) {
  const nextInRoom = t.plenary
    ? []
    : db.byDay.get(t.day).filter(x => !x.plenary && x.rooms[0] === t.rooms[0] && x.s >= t.e).slice(0, 2);
  const sameSpeaker = t.name ? db.sessions.filter(x => x.id !== t.id && x.name === t.name).slice(0, 3) : [];
  const section = (title, items) =>
    items.length ? `<section class="dr-sec"><h4>${title}</h4><div class="mini">${items.map(x => rowHTML(x, n, { time: true })).join('')}</div></section>` : '';
  return section(`Also by ${esc(t.name.split(/ from | & |,/)[0])}`, sameSpeaker) + section(`Next in ${esc(t.rooms[0])}`, nextInRoom);
}

function content(t) {
  const n = now();
  const fav = favs.has(t.id);
  const kicker = [
    ...t.formats.map(f => optLabel('formats', f)),
    ...t.levels.map(f => optLabel('levels', f)),
    ...t.langs.map(f => optLabel('langs', f)),
  ].map(label => `<span class="tag">${esc(label)}</span>`).join('');
  const status = isLive(t, n) ? '<span class="pill live">Live now</span>' : isPast(t, n) ? '<span class="muted">· Ended</span>' : '';
  const rooms = t.plenary
    ? '<span>All venues</span>'
    : t.rooms.map(r => `<button data-filter="rooms:${esc(r)}" title="Show only this room">${esc(r)}</button>`).join(', ');
  const paragraphs = t.desc.split(/\n+/).filter(p => p.trim()).map(p => `<p>${linkify(p)}</p>`).join('');

  return `
    <div class="dr-bar">
      <button class="icon-btn" data-act="close" aria-label="Close">${I.x}</button>
      <span class="sp"></span>
      <button class="icon-btn" data-act="copy" title="Copy link" aria-label="Copy link">${I.link}</button>
      <a class="icon-btn" href="${ODOO_URL}${esc(t.url)}" target="_blank" rel="noopener" title="Open on odoo.com" aria-label="Open on odoo.com">${I.ext}</a>
    </div>
    <div class="dr-body">
      <div class="dr-kicker">${kicker}</div>
      <h2 class="dr-title">${esc(t.title)}</h2>
      <div class="facts">
        <div class="fact">${I.cal}<span>${esc(dayOf(t).label)}</span></div>
        <div class="fact">${I.clock}<span>${hhmm(t.s)} – ${hhmm(t.e)} <span class="muted">(${dur(t.e - t.s)})</span> ${status}</span></div>
        <div class="fact">${I.pin}${rooms}</div>
      </div>
      <div class="dr-actions">
        ${t.plenary ? '' : `<button class="btn primary ${fav ? 'on' : ''}" data-star="${t.id}">${I.star}${fav ? 'Saved' : 'Save'}</button>`}
        ${t.youtube_id ? `<button class="btn" data-act="watch">${I.play}Watch</button>` : ''}
        <a class="btn" href="${gcalUrl(t)}" target="_blank" rel="noopener">${I.cal}Google Calendar</a>
        <button class="btn" data-act="ics">${I.download}.ics</button>
        <button class="btn" data-act="ask-ai">${I.spark}Ask AI</button>
      </div>
      <div id="video-slot"></div>
      ${t.name ? `<section class="dr-sec"><h4>Speaker ${affTag(t)}</h4><div class="dr-speaker">${speakerBlock(t, 'lg')}
        ${t.speaker_bio ? `<p>${linkify(t.speaker_bio)}</p>` : ''}</div></section>` : ''}
      ${paragraphs ? `<section class="dr-sec"><h4>About this session</h4>${paragraphs}</section>` : ''}
      ${t.badges.length || t.tracks.length ? `<section class="dr-sec"><h4>Tags</h4>${tagChips(t, { clickable: true })}</section>` : ''}
      ${related(t, n)}
    </div>`;
}

export function openDrawer(id) {
  const t = db.byId.get(id);
  if (!t) return;
  const wasOpen = !!state.drawer;
  hidePop();
  closeMenu();
  state.drawer = id;
  const drawer = el();
  drawer.innerHTML = content(t);
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
  if (!wasOpen) returnFocus = document.activeElement;
  $('.dr-body', drawer).scrollTop = 0;
  $('[data-act="close"]', drawer).focus({ preventScroll: true });
}

export function closeDrawer() {
  if (!state.drawer) return;
  state.drawer = null;
  const drawer = el();
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
  $('#video-slot', drawer)?.replaceChildren(); // stop playback
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
}

/** Re-render in place (e.g. after starring) without moving focus. */
export function refreshDrawer() {
  const t = openSession();
  if (!t) return;
  const body = $('.dr-body', el());
  const scroll = body?.scrollTop || 0;
  el().innerHTML = content(t);
  $('.dr-body', el()).scrollTop = scroll;
}

/** Drawer-only actions, dispatched from the app's click handler. Returns true when handled. */
export function drawerAction(act, target) {
  const t = openSession();
  if (!t) return false;
  switch (act) {
    case 'close':
      closeDrawer();
      return true;
    case 'ics':
      downloadIcs([t], icsName(t));
      return true;
    case 'copy':
      navigator.clipboard?.writeText(ODOO_URL + t.url).then(() => toast('Link copied'), () => toast('Could not copy'));
      return true;
    case 'watch':
      $('#video-slot', el()).innerHTML = `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.youtube_id)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Video"></iframe></div>`;
      target.closest('[data-act]').remove();
      return true;
    default:
      return false;
  }
}
