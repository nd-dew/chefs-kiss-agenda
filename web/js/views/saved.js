// "Saved" view: the personal schedule across all days, with clash detection.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { esc, plural } from '../lib/html.js';
import { favs } from '../state.js';
import { rowHTML } from './parts.js';

/** Map(id -> [overlapping sessions]) for sessions that clash with another one. */
export function conflictsOf(sessions) {
  const clashes = new Map();
  const add = (a, b) => clashes.set(a.id, [...(clashes.get(a.id) || []), b]);
  sessions.forEach((a, i) => sessions.slice(i + 1).forEach(b => {
    if (a.day === b.day && a.s < b.e && b.s < a.e) {
      add(a, b);
      add(b, a);
    }
  }));
  return clashes;
}

const clashPill = others => `<span class="pill warn" title="${esc(others.map(o => o.title).join('\n'))}">${I.alert}Overlaps ${
  others.length === 1 ? esc(others[0].title.slice(0, 48)) : `${others.length} sessions`}</span>`;

export function renderSaved(n) {
  if (!favs.size) {
    return `<div class="empty"><div>${I.star}<h3>Nothing saved yet</h3>
      <p>Tap the star on any session to build your personal schedule. It's stored in this browser only.</p>
      <button class="btn primary" data-view="grid">Browse the timetable</button></div></div>`;
  }
  const saved = db.sessions.filter(t => favs.has(t.id));
  const clashes = conflictsOf(saved);

  let html = `<div class="list"><div class="mine-head">
    <div><h1>My schedule</h1><p>${plural(favs.size, 'saved session')}${clashes.size ? ` · <span class="pill warn">${I.alert} ${clashes.size} overlapping</span>` : ''}</p></div>
    <div class="btns"><button class="btn" data-act="ics-mine">${I.download}Export .ics</button>
      <button class="btn ghost" data-act="clear-favs">${I.trash}Clear</button></div></div>`;
  for (const d of db.days) {
    const items = saved.filter(t => t.day === d.date);
    if (!items.length) continue;
    html += `<div class="day-h"><h2>${esc(d.label)}</h2><span>${plural(items.length, 'session')}</span></div><div class="mini">`;
    html += items.map(t => rowHTML(t, n, { time: true, extra: clashes.has(t.id) ? clashPill(clashes.get(t.id)) : '' })).join('');
    html += '</div>';
  }
  return html + '</div>';
}
