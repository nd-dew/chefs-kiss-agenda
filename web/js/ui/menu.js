// The Filters panel (a bottom sheet on phones): speaker, topic, level, room, saved / hide past.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { emit } from '../lib/bus.js';
import { $, isPhone } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { now } from '../lib/time.js';
import { dayCounts, FACETS, passes, queryTerms, state } from '../state.js';
import { LEVELS, OTHER, SPEAKERS, TRACKS, venueOf } from '../taxonomy.js';

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

// ---------------------------------------------------------------- filters panel
function chip(facet, value, label, count, extra = '') {
  const on = state[facet].has(value);
  return `<button class="chip${on ? ' on' : ''}${count || on ? '' : ' zero'}" aria-pressed="${on}" data-chip="${esc(`${facet}|${value}`)}">${extra}${esc(label)}<span class="cnt">${count}</span></button>`;
}

function section(title, body) {
  return body ? `<section class="fp-sec"><h4>${title}</h4><div class="chips">${body}</div></section>` : '';
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
    const name = rooms.length > 1
      ? `<button class="fp-vname" data-group="${esc(venue)}" title="Select all of ${esc(venue)}">${esc(venue)}</button>`
      : '<span class="fp-vname"></span>';
    const chips = rooms.map(r => chip('rooms', r, short(r), c.get(r) || 0)).join('');
    return `<div class="fp-venue">${name}<div class="chips">${chips}</div></div>`;
  }).join('');
}

function toggle(flag, icon, label) {
  const on = state[flag];
  return `<button class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-flag="${flag}">${icon}${label}</button>`;
}

function renderFilters() {
  const [shown, total] = dayCounts();
  const today = state.day === now().date;
  const show = toggle('saved', I.star, 'Saved only') + (today ? toggle('upcoming', I.eye, 'Hide past') : '');
  return `<div class="menu-head"><h3>Filters</h3><span class="fp-count"><b>${shown}</b> of ${total} talks</span>
      <button data-act="clear-filters">Reset</button><button data-act="menu-close">Done</button></div>
    <div class="fp-body">
      ${section('Speaker', chipsFor('speakers', SPEAKERS))}
      ${section('Topic', chipsFor('tracks', [...TRACKS, OTHER]))}
      ${section('Level', chipsFor('levels', LEVELS))}
      <section class="fp-sec"><h4>Room</h4>${roomSections()}</section>
      ${section('Show', show)}
    </div>`;
}

// ---------------------------------------------------------------- open / close / render
export function renderMenu() {
  const menu = $('#menu');
  const scroll = $('.fp-body', menu)?.scrollTop || 0;
  menu.className = 'menu menu-filters';
  menu.innerHTML = renderFilters();
  $('.fp-body', menu).scrollTop = scroll;
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
  document.addEventListener('pointerdown', e => {
    if (state.menu && !$('#menu').contains(e.target) && !e.target.closest('[data-menu]')) closeMenu();
  });
}
