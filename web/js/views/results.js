// Search results that widen automatically: the chosen day first, then keyword
// matches on other days, then talks related by meaning (semantic search).

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { esc, plural } from '../lib/html.js';
import { relatedSessions, semantic } from '../search.js';
import { passes, queryTerms, state } from '../state.js';
import { otherDaysHint, rowHTML } from './parts.js';

const EXPAND_BELOW = 6; // fewer matches than this on the day -> show other days in full

const shortDay = d => d.short_label.replace(' Sep', '');

/** Keyword + filter matches across all days (talks only, plus plenaries when searched). */
export function keywordMatches(n) {
  const terms = queryTerms();
  return db.sessions.filter(t => passes(t, null, terms, n) && (!t.plenary || terms.length));
}

function rows(items, n, { day = true } = {}) {
  return `<div class="res-rows">${items.map(t => rowHTML(t, n, { time: true, day })).join('')}</div>`;
}

function header(title, count, sub = '') {
  return `<header class="res-h"><h2>${title}</h2>${count != null ? `<span class="res-n">${count}</span>` : ''}${sub ? `<p>${sub}</p>` : ''}</header>`;
}

export function renderResults(n) {
  const day = db.days.find(d => d.date === state.day);
  const matches = keywordMatches(n);
  const onDay = matches.filter(t => t.day === state.day);
  const elsewhere = matches.filter(t => t.day !== state.day);
  const expand = onDay.length < EXPAND_BELOW;
  const shown = new Set([...onDay, ...(expand ? elsewhere : [])].map(t => t.id));
  const related = relatedSessions(shown, n, onDay.length + elsewhere.length ? 8 : 16);

  let html = '<div class="list results">';
  if (onDay.length) {
    html += `<section class="res-sec">${header(`On ${esc(day.label)}`, onDay.length)}${rows(onDay, n, { day: false })}</section>`;
  } else {
    const next = elsewhere.length ? 'showing other days' : semantic.loading || related.length ? 'showing related talks' : '';
    html += `<p class="res-note">${I.search}No exact matches for “${esc(state.q)}” on ${esc(shortDay(day))}${next ? ` — ${next}` : ''}.</p>`;
  }

  if (elsewhere.length && expand) {
    for (const d of db.days) {
      const items = elsewhere.filter(t => t.day === d.date);
      if (items.length) html += `<section class="res-sec">${header(esc(d.label), items.length)}${rows(items, n)}</section>`;
    }
  } else if (elsewhere.length) {
    html += otherDaysHint(n);
  }

  if (semantic.loading) {
    html += `<section class="res-sec">${header('Related by meaning', null)}<div class="res-loading"><span class="typing"><i></i><i></i><i></i></span>Finding talks about similar topics…</div></section>`;
  } else if (related.length) {
    html += `<section class="res-sec">${header(`${I.spark}Related by meaning`, related.length, 'Talks about similar topics, across all days')}${rows(related, n)}</section>`;
  }

  if (!matches.length && !related.length && !semantic.loading) {
    html += `<div class="empty"><div><h3>Nothing found</h3><p>No talk matches “${esc(state.q)}”${state.langs.size || state.tracks.size ? ' with the current filters' : ''}.</p>
      <button class="btn" data-act="clear">Clear search and filters</button> <button class="btn" data-act="ask-q">${I.spark}Ask AI</button></div></div>`;
  }
  return `${html}</div>`;
}

/** Extra hint for the timetable: how many related talks the results view would add. */
export function relatedHint(n, onDay) {
  if (!state.q || semantic.loading) return '';
  const related = relatedSessions(new Set(onDay.map(t => t.id)), n, 16);
  return related.length ? `<button data-view="list">${I.spark}${plural(related.length, 'related talk')}</button>` : '';
}
