// Facet dropdown (a bottom sheet on phones) with live per-option counts.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { $, isPhone } from '../lib/dom.js';
import { esc, norm } from '../lib/html.js';
import { emit } from '../lib/bus.js';
import { now } from '../lib/time.js';
import { FACETS, passes, queryTerms, state } from '../state.js';
import { FORMATS, LANGS, LEVELS, OTHER, TRACKS, venueOf } from '../taxonomy.js';

const MENU_WIDTH = 312;

function allOptions(facet) {
  switch (facet) {
    case 'rooms': return db.rooms.map(r => ({ v: r, label: r, group: venueOf(r) }));
    case 'tracks': return [...TRACKS, OTHER].map(o => ({ v: o.id, label: o.label, h: o.h, sat: o.sat }));
    case 'levels': return LEVELS.map(o => ({ v: o.id, label: o.label }));
    case 'langs': return LANGS.map(o => ({ v: o.id, label: o.label }));
    case 'formats': return FORMATS.map(o => ({ v: o.id, label: o.label }));
    default: return db.tags.map(v => ({ v, label: v }));
  }
}

const tally = (sessions, facet) => {
  const counts = new Map();
  sessions.forEach(t => FACETS[facet].get(t).forEach(v => counts.set(v, (counts.get(v) || 0) + 1)));
  return counts;
};

/** Options that exist on the current day (or are selected). */
export function facetOptions(facet) {
  const base = tally((db.byDay.get(state.day) || []).filter(t => !t.plenary), facet);
  return allOptions(facet).filter(o => base.get(o.v) || state[facet].has(o.v));
}

export function renderMenu() {
  const menu = $('#menu');
  const facet = state.menu;
  const f = FACETS[facet];
  const terms = queryTerms();
  const n = now();
  // Counts ignore this facet's own selection: "how many if I tick this too".
  const counts = tally((db.byDay.get(state.day) || []).filter(t => !t.plenary && passes(t, facet, terms, n)), facet);
  const mq = norm(state.menuQ);
  const opts = facetOptions(facet).filter(o => !mq || norm(o.label).includes(mq));

  let body = '';
  let lastGroup = null;
  for (const o of opts) {
    if (o.group && o.group !== lastGroup) {
      lastGroup = o.group;
      const members = opts.filter(x => x.group === o.group);
      const toggle = members.length > 1
        ? `<button data-group="${esc(o.group)}">${members.every(x => state[facet].has(x.v)) ? 'None' : 'All'}</button>`
        : '';
      body += `<div class="menu-group"><span>${esc(o.group)}</span>${toggle}</div>`;
    }
    const c = counts.get(o.v) || 0;
    const on = state[facet].has(o.v);
    const dot = o.h != null ? `<i class="dot" style="--h:${o.h};${o.sat ? `--sat:${o.sat}` : ''}"></i>` : '';
    body += `<button class="opt ${c || on ? '' : 'zero'}" role="menuitemcheckbox" aria-checked="${on}" data-opt="${esc(o.v)}">
      <span class="box">${I.check}</span>${dot}<span class="lbl">${esc(o.label)}</span><span class="cnt">${c}</span></button>`;
  }

  const hadFocus = document.activeElement?.id === 'menu-q';
  const scroll = $('.menu-list', menu)?.scrollTop || 0;
  menu.innerHTML = `<div class="menu-head"><h3>${f.label}</h3>${state[facet].size ? '<button data-act="menu-clear">Clear</button>' : ''}<button data-act="menu-close" aria-label="Close">Done</button></div>
    ${f.search ? `<label class="menu-search">${I.search}<input id="menu-q" type="search" placeholder="Filter ${f.label.toLowerCase()}…" value="${esc(state.menuQ)}" autocomplete="off"></label>` : ''}
    <div class="menu-list" role="menu">${body || '<div class="menu-empty">Nothing here</div>'}</div>`;
  $('.menu-list', menu).scrollTop = scroll;
  if (hadFocus) {
    const input = $('#menu-q');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

export function openMenu(facet, button) {
  if (state.menu === facet) return closeMenu();
  const r = button.getBoundingClientRect(); // measure before the filter bar re-renders
  state.menu = facet;
  state.menuQ = '';
  const menu = $('#menu');
  menu.hidden = false;
  emit('change');
  if (isPhone()) {
    $('#scrim').hidden = false;
  } else {
    menu.style.left = `${Math.max(12, Math.min(r.left, innerWidth - MENU_WIDTH))}px`;
    menu.style.top = `${r.bottom + 6}px`;
    $('#menu-q')?.focus();
  }
}

export function closeMenu() {
  if (!state.menu) return;
  state.menu = null;
  $('#menu').hidden = true;
  if (!state.drawer) $('#scrim').hidden = true;
  emit('change');
}

export function toggleOption(value) {
  const sel = state[state.menu];
  sel.has(value) ? sel.delete(value) : sel.add(value);
  emit('change');
}

export function toggleGroup(group) {
  const sel = state[state.menu];
  const members = facetOptions(state.menu).filter(o => o.group === group).map(o => o.v);
  const all = members.every(v => sel.has(v));
  members.forEach(v => (all ? sel.delete(v) : sel.add(v)));
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
    if (state.menu && !$('#menu').contains(e.target) && !e.target.closest('[data-facet]')) closeMenu();
  });
}
