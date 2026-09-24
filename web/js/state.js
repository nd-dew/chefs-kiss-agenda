// UI state, saved sessions, filtering and the shareable URL hash.

import { db } from './agenda.js';
import { local } from './lib/storage.js';
import { isPast, now } from './lib/time.js';

export const FACETS = {
  speakers: { label: 'Speaker', get: t => t.speakers },
  rooms: { label: 'Room', get: t => t.rooms, search: true },
  tracks: { label: 'Track', get: t => t.tracks },
  levels: { label: 'Level', get: t => t.levels },
  langs: { label: 'Language', get: t => t.langs },
  tags: { label: 'Tags', get: t => t.badges, search: true },
};
export const FLAGS = ['saved', 'upcoming'];
export const VIEWS = ['grid', 'list', 'mine'];

export const state = {
  day: null,
  view: null,
  lastView: 'list', // where "back from Saved" goes
  q: '',
  searchDay: null, // day chip on the search results page (null = all days)
  ...Object.fromEntries(Object.keys(FACETS).map(k => [k, new Set()])),
  saved: false,
  upcoming: false,
  menu: null, // open header panel ('filters')
  drawer: null, // id of the open session
  scrollPending: true, // scroll to "now" after the next render
  animate: false, // animate tiles on the next render (filter changes)
};

// ---------------------------------------------------------------- saved sessions
const FAVS_KEY = 'oxp_favorites_2026';
export const favs = new Set();
export const loadFavs = () => local.getJSON(FAVS_KEY, []).filter(id => db.byId.has(id)).forEach(id => favs.add(id));
export const saveFavs = () => local.setJSON(FAVS_KEY, [...favs]);

// ---------------------------------------------------------------- filtering

export const activeFilterCount = () =>
  Object.keys(FACETS).reduce((n, k) => n + state[k].size, 0) + FLAGS.filter(k => state[k]).length;
export const isFiltering = () => !!activeFilterCount();

/**
 * Does a session pass the filters? (Search is separate: see rank.js.) `skip` ignores one
 * facet, which is how the filter panel computes "how many would match if I ticked this".
 */
export function passes(t, skip = null, n = now()) {
  if (state.saved && !favs.has(t.id)) return false;
  if (state.upcoming && isPast(t, n)) return false;
  // Plenary slots (keynotes, lunch, concerts) stay visible as context unless a topic filter is on.
  if (t.plenary) return Object.keys(FACETS).every(k => k === 'rooms' || k === 'langs' || !state[k].size);
  for (const k in FACETS) {
    if (k !== skip && state[k].size && !FACETS[k].get(t).some(v => state[k].has(v))) return false;
  }
  return true;
}

/** [matching talks, all talks] for the current day (plenaries excluded). */
export function dayCounts() {
  const talks = (db.byDay.get(state.day) || []).filter(t => !t.plenary);
  const n = now();
  return [talks.filter(t => passes(t, null, n)).length, talks.length];
}

export function clearFilters() {
  for (const k in FACETS) state[k].clear();
  for (const k of FLAGS) state[k] = false;
  state.q = '';
}

// ---------------------------------------------------------------- URL hash
export function readHash(hash = location.hash) {
  const p = new URLSearchParams(hash.slice(1));
  if (db.days.some(d => d.date === p.get('day'))) state.day = p.get('day');
  if (VIEWS.includes(p.get('view'))) state.view = p.get('view');
  if (state.view && state.view !== 'mine') state.lastView = state.view;
  state.q = p.get('q') || '';
  for (const k in FACETS) state[k] = new Set((p.get(k) || '').split('|').filter(Boolean));
  for (const k of FLAGS) state[k] = p.get(k) === '1';
}

export function writeHash() {
  const p = new URLSearchParams({ day: state.day, view: state.view });
  if (state.q) p.set('q', state.q);
  for (const k in FACETS) if (state[k].size) p.set(k, [...state[k]].join('|'));
  for (const k of FLAGS) if (state[k]) p.set(k, '1');
  history.replaceState(null, '', '#' + p.toString().replace(/%7C/g, '|'));
}

/** Pick a sensible default day: today during the event, else the next main day. */
export function defaultDay(n = now()) {
  const days = db.days;
  if (days.some(d => d.date === n.date)) return n.date;
  return (days.find(d => d.date > n.date) || days[days.length - 1]).date;
}
