// Page chrome: day tabs, view switcher, filter bar and theme toggle.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { $ } from '../lib/dom.js';
import { esc } from '../lib/html.js';
import { local } from '../lib/storage.js';
import { now } from '../lib/time.js';
import { activeFilterCount, FACETS, FLAGS, favs, state } from '../state.js';
import { optLabel, OTHER, TRACKS } from '../taxonomy.js';

const VIEW_TABS = [
  { id: 'grid', icon: I.grid, label: 'Timetable', key: 'G' },
  { id: 'list', icon: I.list, label: 'List', key: 'L' },
  { id: 'mine', icon: I.star, label: 'Saved', key: 'S' },
];
const CHEVRON = '<svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
const LANG_CODES = { en: 'EN', fr: 'FR', nl: 'NL' };

export function renderDays() {
  const today = now().date;
  $('#days').innerHTML = db.days.map(d => {
    const [weekday, , day] = d.short_label.split(' ');
    const selected = d.date === state.day && state.view !== 'mine';
    const title = `${d.label}${d.is_masterclass ? ' · Masterclasses' : ` · ${d.n} talks`}`;
    return `<button class="day${d.is_masterclass ? ' mc' : ''}" role="tab" data-day="${d.date}" aria-selected="${selected}" title="${esc(title)}">
      ${d.date === today ? '<i class="today-dot"></i>' : ''}${weekday} ${day}</button>`;
  }).join('');
}

export function renderViews() {
  $('#views').innerHTML = VIEW_TABS.map(v => {
    const count = v.id === 'mine' && favs.size ? `<span class="count">${favs.size}</span>` : '';
    return `<button class="view-btn" role="tab" data-view="${v.id}" aria-selected="${state.view === v.id}" title="${v.label} (${v.key})">${v.icon}<span class="lbl">${v.label}</span>${count}</button>`;
  }).join('');
}

/** Number of active filters shown on the Filters button (language has its own control). */
const filterCount = () => activeFilterCount() - state.langs.size;

export function renderControls() {
  const lang = [...state.langs][0];
  const langLabel = lang ? optLabel('langs', lang) : 'Any language';
  const n = filterCount();
  const isToday = state.day === now().date && state.view !== 'mine';
  $('#controls').innerHTML = `
    <button class="ctl${lang ? ' active' : ''}" data-menu="langs" aria-haspopup="true" aria-expanded="${state.menu === 'langs'}" title="Language">
      ${I.globe}<span class="lbl"><span class="full">${esc(langLabel)}</span><span class="short">${lang ? LANG_CODES[lang] : 'All'}</span></span>${CHEVRON}</button>
    <button class="ctl${n ? ' active' : ''}" data-menu="filters" aria-haspopup="true" aria-expanded="${state.menu === 'filters'}" title="Filters (F)">
      ${I.sliders}<span class="lbl">Filters</span>${n ? `<span class="n">${n}</span>` : ''}</button>
    ${isToday ? `<button class="ctl icon" data-act="now" title="Jump to now (N)" aria-label="Jump to now">${I.now}</button>` : ''}`;
}

const FLAG_LABELS = { video: 'Has video', saved: 'Saved', upcoming: 'Hide past' };
const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/** Removable chips for every active filter (except language), plus the match count. */
export function renderActiveBar([shown, total]) {
  const bar = $('#activebar');
  const chips = [];
  for (const k in FACETS) {
    if (k === 'langs') continue;
    for (const v of state[k]) {
      const track = k === 'tracks' ? [...TRACKS, OTHER].find(t => t.id === v) : null;
      const dot = track ? `<i class="dot" style="--h:${track.h};${track.sat ? `--sat:${track.sat}` : ''}"></i>` : '';
      chips.push(`<button class="achip" data-chip="${esc(`${k}|${v}`)}" title="Remove">${dot}${esc(optLabel(k, v))}${X}</button>`);
    }
  }
  for (const f of FLAGS) if (state[f]) chips.push(`<button class="achip" data-flag="${f}" title="Remove">${FLAG_LABELS[f]}${X}</button>`);
  bar.hidden = state.view === 'mine' || (!chips.length && !state.q);
  if (bar.hidden) return;
  bar.innerHTML = `${chips.join('')}${chips.length ? '<button class="fclear" data-act="clear">Clear all</button>' : ''}
    <span class="acount"><b>${shown}</b> of ${total} sessions${state.q ? ` for “${esc(state.q)}”` : ''}</span>`;
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
