// Page chrome: day tabs, view switcher, filter bar and theme toggle.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { $ } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { local } from '../lib/storage.js';
import { now } from '../lib/time.js';
import { activeFilterCount, FACETS, favs, state } from '../state.js';
import { optLabel } from '../taxonomy.js';

const FACET_ICONS = { rooms: I.pin, tracks: I.layers, levels: I.level, langs: I.globe, formats: I.mic, tags: I.tag };
const VIEW_TABS = [
  { id: 'grid', icon: I.grid, label: 'Timetable', key: 'G' },
  { id: 'list', icon: I.list, label: 'List', key: 'L' },
  { id: 'mine', icon: I.star, label: 'Saved', key: 'S' },
];

export function renderDays() {
  const today = now().date;
  $('#days').innerHTML = db.days.map(d => {
    const [weekday, , day] = d.short_label.split(' ');
    const selected = d.date === state.day && state.view !== 'mine';
    return `<button class="day" role="tab" data-day="${d.date}" aria-selected="${selected}" title="${esc(d.label)}">
      ${d.date === today ? '<i class="today-dot" title="Today"></i>' : ''}
      <b>${weekday} ${day}</b><small>${d.is_masterclass ? 'Masterclass' : `${d.n} talks`}</small></button>`;
  }).join('');
}

export function renderViews() {
  $('#views').innerHTML = VIEW_TABS.map(v => {
    const count = v.id === 'mine' && favs.size ? `<span class="count">${favs.size}</span>` : '';
    return `<button class="view-btn" role="tab" data-view="${v.id}" aria-selected="${state.view === v.id}" title="${v.label} (${v.key})">${v.icon}<span class="lbl">${v.label}</span>${count}</button>`;
  }).join('');
}

const toggleBtn = (flag, icon, label) =>
  `<button class="fbtn ${state[flag] ? 'active' : ''}" data-flag="${flag}" aria-pressed="${state[flag]}">${icon}<span>${label}</span></button>`;

export function renderFilterbar([shown, total]) {
  const bar = $('#filterbar');
  bar.hidden = state.view === 'mine';
  if (bar.hidden) return;

  let html = '';
  for (const k in FACETS) {
    const count = state[k].size;
    const label = count === 1 ? optLabel(k, [...state[k]][0]) : FACETS[k].label;
    html += `<button class="fbtn ${count ? 'active' : ''}" data-facet="${k}" aria-haspopup="true" aria-expanded="${state.menu === k}">${FACET_ICONS[k]}<span>${esc(label)}</span>${count > 1 ? `<span class="n">${count}</span>` : ''}</button>`;
  }
  html += '<span class="fsep"></span>';
  html += toggleBtn('video', I.play, 'Has video') + toggleBtn('saved', I.star, 'Saved');
  if (state.day === now().date) {
    html += toggleBtn('upcoming', I.eye, 'Hide past');
    html += `<button class="fbtn" data-act="now">${I.now}<span>Now</span></button>`;
  }
  if (activeFilterCount() || state.q) html += '<button class="fclear" data-act="clear">Clear all</button>';
  html += `<span class="fcount"><b>${shown}</b> of ${total} sessions</span>`;
  bar.innerHTML = html;
}

// ---------------------------------------------------------------- theme
const THEME_KEY = 'oxp_theme'; // also read by the inline script in index.html to avoid a flash
const resolvedTheme = () =>
  document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function renderTheme() {
  const dark = resolvedTheme() === 'dark';
  const btn = $('#theme');
  btn.innerHTML = dark ? I.sun : I.moon;
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

export function toggleTheme() {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  local.set(THEME_KEY, next);
  renderTheme();
}

export function bindTheme() {
  $('#theme').addEventListener('click', toggleTheme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTheme);
}
