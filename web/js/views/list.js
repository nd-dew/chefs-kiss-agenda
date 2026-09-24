// List view: sessions grouped by start time (default on phones).

import { plural } from '../lib/html.js';
import { hhmm, isLive, isPast } from '../lib/time.js';
import { isFiltering } from '../state.js';
import { otherDaysHint, rowHTML } from './parts.js';

export function renderList(list, n) {
  if (!list.length || (isFiltering() && !list.some(t => !t.plenary))) return '';
  const groups = new Map();
  for (const t of list) groups.set(t.s, [...(groups.get(t.s) || []), t]);
  let html = `<div class="list">${otherDaysHint(n)}`;
  for (const [s, items] of groups) {
    const live = items.some(t => isLive(t, n));
    const past = items.every(t => isPast(t, n));
    const talks = items.filter(t => !t.plenary).length;
    html += `<section class="slot" data-slot="${s}" ${live ? 'data-live' : ''} ${past ? 'data-past' : ''}>
      <header class="slot-h"><time>${hhmm(s)}</time>${live ? '<span class="pill live">Now</span>' : ''}<span class="muted">${talks ? plural(talks, 'session') : ''}</span></header>
      <div class="slot-items">${items.map(t => rowHTML(t, n)).join('')}</div></section>`;
  }
  return html + '</div>';
}
