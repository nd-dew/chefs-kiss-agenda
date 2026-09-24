// Default view: rooms as columns, time flowing down, plenaries as full-width bands.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { esc, plural } from '../lib/html.js';
import { hhmm } from '../lib/time.js';
import { isFiltering, state } from '../state.js';
import { hl, hueStyle, otherDaysHint, starBtn, statusCls } from './parts.js';
import { relatedHint } from './results.js';

export const PX_PER_MIN = 2.2;
// Before 10:00 and after 18:00 there are only plenaries (welcome, keynotes, dinner,
// concerts), so those hours are drawn at a fraction of the height.
export const CORE_HOURS = [10 * 60, 18 * 60];
export const PX_PER_MIN_EDGE = 0.8;

/** Pixel offset of minute `m` from the top of the grid starting at `start`. */
export function timeScale(start) {
  const [from, to] = CORE_HOURS;
  const px = m => {
    const early = Math.min(m, from);
    const core = Math.min(Math.max(m, from), to) - from;
    const late = Math.max(m, to) - to;
    return early * PX_PER_MIN_EDGE + core * PX_PER_MIN + late * PX_PER_MIN_EDGE;
  };
  return m => px(m) - px(start);
}

export const isCompressed = m => m < CORE_HOURS[0] || m >= CORE_HOURS[1];

/**
 * Greedy lane assignment for overlapping sessions in one column.
 * Returns Map(session -> { lane, n }) where n is the lane count of its overlap cluster.
 */
export function lanes(sessions) {
  const out = new Map();
  let cluster = [];
  let end = -1;
  const flush = () => {
    const ends = [];
    for (const e of cluster) {
      let i = ends.findIndex(x => x <= e.s);
      if (i < 0) i = ends.push(0) - 1;
      ends[i] = e.e;
      out.set(e, { lane: i });
    }
    cluster.forEach(e => (out.get(e).n = ends.length));
    cluster = [];
    end = -1;
  };
  for (const e of sessions) {
    if (cluster.length && e.s >= end) flush();
    cluster.push(e);
    end = Math.max(end, e.e);
  }
  if (cluster.length) flush();
  return out;
}

/** Visible time window in minutes, rounded to whole hours. Zooms in while filtering. */
export function timeWindow(visible, dayList, filtering) {
  const span = filtering ? visible : dayList;
  return [
    Math.floor(Math.min(...span.map(t => t.s)) / 60) * 60,
    Math.ceil(Math.max(...span.map(t => t.e)) / 60) * 60,
  ];
}

function sessionCard(t, n, top, height, lane) {
  const pos = lane.n > 1
    ? `left:calc(${(lane.lane / lane.n) * 100}% + 2px);right:auto;width:calc(${100 / lane.n}% - 4px);`
    : '';
  return `<article class="ev${height > 120 ? ' tall' : ''}${statusCls(t, n)}" data-id="${t.id}" tabindex="0" style="top:${top}px;height:${height}px;${pos}${hueStyle(t)}">
    ${starBtn(t)}
    <div class="ev-title">${hl(t.title)}</div>
    ${t.name && height > 50 ? `<div class="ev-sub">${hl(t.name)}</div>` : ''}
    ${height > 110 ? `<div class="ev-when">${hhmm(t.s)} – ${hhmm(t.e)}${t.youtube_id ? ` ${I.play}` : ''}</div>` : ''}
  </article>`;
}

export function renderTimetable(list, dayList, n) {
  const bandsAll = list.filter(t => t.plenary);
  const talks = list.filter(t => !t.plenary);
  const filtering = isFiltering();
  if (!talks.length && (filtering || !bandsAll.length)) return '';

  const rooms = state.rooms.size
    ? db.rooms.filter(r => state.rooms.has(r) && dayList.some(t => !t.plenary && t.rooms.includes(r)))
    : db.rooms.filter(r => talks.some(t => t.rooms.includes(r)));
  if (!rooms.length) return '';

  const [start, end] = timeWindow(talks.length ? talks : list, dayList, filtering);
  const y = timeScale(start);
  const height = y(end);

  // Hour labels + grid lines; compressed hours get hourly lines only and a tinted band.
  let gutter = '';
  let lines = '';
  for (let m = start + 30; m <= end; m += 30) {
    const half = m % 60 !== 0;
    if (half && isCompressed(m - 30)) continue;
    if (m < end) lines += `<div class="tt-line${half ? ' half' : ''}" style="top:${y(m)}px"></div>`;
    gutter += `<div class="tt-hour${half ? ' half' : ''}" style="top:${y(m)}px">${hhmm(m)}</div>`;
  }
  const [from, to] = CORE_HOURS;
  const squeeze = (a, b) => (b > a ? `<div class="tt-squeeze" style="top:${y(a)}px;height:${y(b) - y(a)}px"></div>` : '');
  lines += squeeze(start, Math.min(from, end)) + squeeze(Math.max(to, start), end);

  const head = rooms.map((r, ci) => {
    const focused = state.rooms.size === 1 && state.rooms.has(r);
    return `<button class="tt-room ${focused ? 'focused' : ''}" style="grid-column:${ci + 2}" data-room="${esc(r)}" title="Show only ${esc(r)}">
      <span class="rn">${esc(r)}</span><span class="rs">${plural(talks.filter(t => t.rooms.includes(r)).length, 'session')}</span></button>`;
  }).join('');

  const cols = rooms.map((r, ci) => {
    // A session shows in its first room, or in the first visible one if that's filtered out.
    const inCol = talks.filter(t => t.rooms[0] === r || (t.rooms.includes(r) && !rooms.includes(t.rooms[0])));
    const layout = lanes(inCol);
    const cards = inCol.map(t => sessionCard(t, n, y(t.s) + 1, y(t.e) - y(t.s) - 3, layout.get(t))).join('');
    return `<div class="tt-col" style="grid-column:${ci + 2};height:${height}px">${cards}</div>`;
  }).join('');

  const bands = bandsAll.filter(t => t.e > start && t.s < end).map(t => {
    const s = Math.max(t.s, start);
    const e = Math.min(t.e, end);
    return `<article class="ev plen${/keynote/i.test(t.title) ? ' keynote' : ''}${statusCls(t, n)}" data-id="${t.id}" tabindex="0" style="top:${y(s) + 1}px;height:${y(e) - y(s) - 2}px">
      <div class="ev-title">${hl(t.title.replace(/\s*\(.*\)\s*$/, ''))}<span>${hhmm(t.s)}–${hhmm(t.e)}</span></div></article>`;
  }).join('');

  const showNow = n.date === state.day && n.min >= start && n.min <= end;
  if (showNow) gutter += `<div class="now-tag" style="top:${y(n.min)}px">${hhmm(n.min)}</div>`;

  const hint = otherDaysHint(n, relatedHint(n, talks));
  return `${hint ? `<div class="tt-hint">${hint}</div>` : ''}
    <div class="tt" style="--cols:${rooms.length}">
      <div class="tt-corner"></div>${head}
      <div class="tt-gutter" style="height:${height}px">${gutter}</div>
      <div class="tt-grid">${lines}</div>
      ${cols}
      <div class="tt-layer">${bands}</div>
      ${showNow ? `<div class="tt-nowlayer"><div class="now-line" style="top:${y(n.min)}px"></div></div>` : ''}
    </div>`;
}
