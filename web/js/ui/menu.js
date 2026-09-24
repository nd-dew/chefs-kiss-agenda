// Header popovers (bottom sheets on phones): the language picker and the Filters panel.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { emit } from '../lib/bus.js';
import { $, isPhone } from '../lib/dom.js';
import { esc, norm } from '../lib/html.js';
import { now } from '../lib/time.js';
import { dayCounts, FACETS, passes, queryTerms, state } from '../state.js';
import { FORMATS, LANGS, LEVELS, OTHER, TRACKS, venueOf } from '../taxonomy.js';

const TAG_LIMIT = 30;

const daySessions = () => (db.byDay.get(state.day) || []).filter(t => !t.plenary);

/** value -> count of today's talks that would match if `facet` were ignored. */
function counts(facet) {
  const terms = queryTerms();
  const n = now();
  const out = new Map();
  daySessions().filter(t => passes(t, facet, terms, n))
    .forEach(t => FACETS[facet].get(t).forEach(v => out.set(v, (out.get(v) || 0) + 1)));
  return out;
}

/** Values of `facet` that exist on the current day (or are selected). */
function presentValues(facet) {
  const present = new Set(daySessions().flatMap(t => FACETS[facet].get(t)));
  return v => present.has(v) || state[facet].has(v);
}

// ---------------------------------------------------------------- language picker
function renderLanguages() {
  const c = counts('langs');
  const total = [...c.values()].reduce((a, b) => a + b, 0);
  const option = (value, label, count) => {
    const on = value ? state.langs.has(value) : !state.langs.size;
    return `<button class="opt" role="menuitemradio" aria-checked="${on}" data-lang="${value}">
      <span class="radio"></span><span class="lbl">${esc(label)}</span><span class="cnt">${count}</span></button>`;
  };
  return `<div class="menu-head"><h3>Language</h3></div>
    <div class="menu-list" role="menu">${option('', 'Any language', total)}${LANGS.map(l => option(l.id, l.label, c.get(l.id) || 0)).join('')}</div>`;
}

// ---------------------------------------------------------------- filters panel
function chip(facet, value, label, count, extra = '') {
  const on = state[facet].has(value);
  return `<button class="chip${on ? ' on' : ''}${count || on ? '' : ' zero'}" aria-pressed="${on}" data-chip="${esc(`${facet}|${value}`)}">${extra}${esc(label)}<span class="cnt">${count}</span></button>`;
}

function section(title, body, aside = '') {
  return body ? `<section class="fp-sec"><div class="fp-h"><h4>${title}</h4>${aside}</div><div class="chips">${body}</div></section>` : '';
}

function chipsFor(facet, options) {
  const c = counts(facet);
  const present = presentValues(facet);
  return options.filter(o => present(o.id)).map(o => {
    const dot = o.h != null ? `<i class="dot" style="--h:${o.h};${o.sat ? `--sat:${o.sat}` : ''}"></i>` : '';
    return chip(facet, o.id, o.label, c.get(o.id) || 0, dot);
  }).join('');
}

function roomSections() {
  const c = counts('rooms');
  const present = presentValues('rooms');
  const venues = new Map();
  db.rooms.filter(present).forEach(r => venues.set(venueOf(r), [...(venues.get(venueOf(r)) || []), r]));
  return [...venues].map(([venue, rooms]) => {
    const short = r => (r === venue ? r : r.slice(venue.length).replace(/^[\s.]+/, '') || r);
    const all = rooms.length > 1
      ? `<button class="fp-all" data-group="${esc(venue)}">${rooms.every(r => state.rooms.has(r)) ? 'None' : 'All'}</button>`
      : '';
    return `<div class="fp-venue"><span class="fp-vname">${esc(venue)}</span>${all}<div class="chips">${rooms.map(r => chip('rooms', r, short(r), c.get(r) || 0)).join('')}</div></div>`;
  }).join('');
}

function tagChips() {
  const c = counts('tags');
  const present = presentValues('tags');
  const q = norm(state.menuQ);
  const tags = db.tags.filter(present).filter(t => !q || norm(t).includes(q));
  const shown = [...new Set([...[...state.tags].filter(t => tags.includes(t)), ...tags])].slice(0, q ? 80 : TAG_LIMIT);
  return shown.map(t => chip('tags', t, t, c.get(t) || 0)).join('') || '<span class="fp-empty">No tags match</span>';
}

function toggle(flag, icon, label) {
  const on = state[flag];
  return `<button class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-flag="${flag}">${icon}${label}</button>`;
}

function renderFilters() {
  const [shown, total] = dayCounts();
  const today = state.day === now().date;
  const show = toggle('video', I.play, 'Has video') + toggle('saved', I.star, 'Saved') + (today ? toggle('upcoming', I.eye, 'Hide past') : '');
  const tagSearch = `<label class="menu-search fp-search">${I.search}<input id="menu-q" type="search" placeholder="Find a tag…" value="${esc(state.menuQ)}" autocomplete="off"></label>`;
  return `<div class="menu-head"><h3>Filters</h3><span class="fp-count"><b>${shown}</b> of ${total}</span>
      <button data-act="clear-filters">Reset</button><button data-act="menu-close">Done</button></div>
    <div class="fp-body">
      ${section('Show', show)}
      ${section('Track', chipsFor('tracks', [...TRACKS, OTHER]))}
      ${section('Level', chipsFor('levels', LEVELS))}
      ${section('Format', chipsFor('formats', FORMATS))}
      <section class="fp-sec"><div class="fp-h"><h4>Room</h4></div>${roomSections()}</section>
      <section class="fp-sec"><div class="fp-h"><h4>Tags</h4></div>${tagSearch}<div class="chips">${tagChips()}</div></section>
    </div>`;
}

// ---------------------------------------------------------------- open / close / render
export function renderMenu() {
  const menu = $('#menu');
  const hadFocus = document.activeElement?.id === 'menu-q';
  const scroller = $('.fp-body, .menu-list', menu);
  const scroll = scroller?.scrollTop || 0;
  menu.className = `menu menu-${state.menu}`;
  menu.innerHTML = state.menu === 'langs' ? renderLanguages() : renderFilters();
  const next = $('.fp-body, .menu-list', menu);
  if (next) next.scrollTop = scroll;
  if (hadFocus) {
    const input = $('#menu-q');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function place(menu, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.left = `${Math.max(12, Math.min(r.right - w, innerWidth - w - 12))}px`;
  menu.style.top = `${r.bottom + 6}px`;
}

export function openMenu(name, button) {
  if (state.menu === name) return closeMenu();
  state.menu = name;
  state.menuQ = '';
  const menu = $('#menu');
  menu.hidden = false;
  emit('change'); // renders the menu too
  if (isPhone()) {
    $('#scrim').hidden = false;
  } else {
    place(menu, $(`[data-menu="${name}"]`) || button);
  }
}

export function closeMenu() {
  if (!state.menu) return;
  state.menu = null;
  $('#menu').hidden = true;
  if (!state.drawer) $('#scrim').hidden = true;
  emit('change');
}

export function setLanguage(value) {
  state.langs = value ? new Set([value]) : new Set();
  closeMenu();
}

export function toggleChip(spec) {
  const [facet, ...rest] = spec.split('|');
  const value = rest.join('|');
  const sel = state[facet];
  sel.has(value) ? sel.delete(value) : sel.add(value);
  emit('change');
}

export function toggleRoomGroup(venue) {
  const rooms = db.rooms.filter(r => venueOf(r) === venue && presentValues('rooms')(r));
  const all = rooms.every(r => state.rooms.has(r));
  rooms.forEach(r => (all ? state.rooms.delete(r) : state.rooms.add(r)));
  emit('change');
}

export function bindMenu() {
  $('#menu').addEventListener('input', e => {
    if (e.target.id === 'menu-q') {
      state.menuQ = e.target.value;
      renderMenu();
    }
  });
  document.addEventListener('pointerdown', e => {
    if (state.menu && !$('#menu').contains(e.target) && !e.target.closest('[data-menu]')) closeMenu();
  });
}
