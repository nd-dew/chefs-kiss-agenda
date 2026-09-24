// Search results: one ranked list of talks across all days (search is not a filter).
// The Filters panel still narrows it; day chips switch between all days and one day.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { esc, plural } from '../lib/html.js';
import { rank } from '../rank.js';
import { semantic, semanticScores } from '../search.js';
import { activeFilterCount, passes, state } from '../state.js';
import { rowHTML } from './parts.js';

const PAGE = 60;

/** Ranked matches for the current query, honouring filters (not the day). */
export function searchMatches(n) {
  const pool = db.sessions.filter(t => passes(t, null, n) || (t.plenary && !activeFilterCount()));
  return rank(state.q, pool, semanticScores());
}

const shortDay = d => d.short_label.replace(' Sep', '');

export function renderSearch(n) {
  const all = searchMatches(n);
  const byDay = new Map(db.days.map(d => [d.date, all.filter(r => r.t.day === d.date).length]));
  const day = state.searchDay && byDay.get(state.searchDay) ? state.searchDay : null;
  const results = day ? all.filter(r => r.t.day === day) : all;
  const exact = results.filter(r => !r.related);
  const related = results.filter(r => r.related);

  const chip = (value, label, count) =>
    `<button class="chip${(value || null) === day ? ' on' : ''}" data-search-day="${value}"${count ? '' : ' disabled'}>${label}<span class="cnt">${count}</span></button>`;
  const chips = chip('', 'All days', all.length) + db.days.map(d => chip(d.date, esc(shortDay(d)), byDay.get(d.date))).join('');
  const rows = items => `<div class="res-rows">${items.slice(0, PAGE).map(r =>
    rowHTML(r.t, n, { time: true, day: true, extra: r.related ? `<span class="aff aff-related">${I.spark}Related</span>` : '' })).join('')}</div>`;

  let html = `<div class="list results">
    <header class="res-top">
      <h2>${plural(exact.length, 'result')} for “${esc(state.q.trim())}”${activeFilterCount() ? ' <span class="res-f">with filters</span>' : ''}</h2>
      <div class="chips">${chips}</div>
    </header>`;
  if (exact.length) html += rows(exact);
  if (semantic.loading) {
    html += `<div class="res-loading"><span class="typing"><i></i><i></i><i></i></span>Finding talks about similar topics…</div>`;
  } else if (related.length) {
    html += `<section class="res-sec"><header class="res-h"><h2>${I.spark}Related by meaning</h2><span class="res-n">${related.length}</span><p>No exact words in common, but about the same topic</p></header>${rows(related)}</section>`;
  }
  if (!results.length && !semantic.loading) {
    html += `<div class="empty"><div><h3>No talks found</h3><p>Nothing matches “${esc(state.q.trim())}”${activeFilterCount() ? ' with the current filters' : ''}.</p>
      ${activeFilterCount() ? '<button class="btn" data-act="clear-filters">Remove filters</button> ' : ''}<button class="btn" data-act="ask-q">${I.spark}Ask AI</button></div></div>`;
  }
  return `${html}</div>`;
}
