// Timetable: rooms × time. Desktop has rooms as columns and time flowing down;
// phones rotate it (time across, rooms stacked) since the screen is tall.
// Half-hours without any talk (early welcome, lunch, evening concerts) are squeezed.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { esc, plural } from '../lib/html.js';
import { hhmm } from '../lib/time.js';
import { isFiltering, state } from '../state.js';
import { affTag, hl, starBtn, statusCls } from './parts.js';

const SLOT = 30; // minutes
export const SCALE = {
  vertical: { busy: 2.2, idle: 0.8 }, // px per minute
  horizontal: { busy: 4.4, idle: 1.2 },
};
const ROW = { label: 20, lane: 64, gap: 6 }; // horizontal layout, px

/** Half-hour slots of the day that contain at least one talk (plenaries don't count). */
export function busySlots(dayList) {
  const busy = new Set();
  for (const t of dayList) {
    if (t.plenary) continue;
    for (let m = Math.floor(t.s / SLOT) * SLOT; m < t.e; m += SLOT) busy.add(m);
  }
  return busy;
}

/** Map minutes to pixels from `start`, with idle half-hours drawn at the `idle` rate. */
export function timeScale(start, end, busy, { busy: pxBusy, idle: pxIdle }) {
  const offsets = new Map();
  let at = 0;
  for (let m = start; m <= end; m += SLOT) {
    offsets.set(m, at);
    at += SLOT * (busy.has(m) ? pxBusy : pxIdle);
  }
  const pos = m => {
    const slot = Math.min(Math.max(Math.floor((m - start) / SLOT) * SLOT + start, start), end);
    return offsets.get(slot) + (m - slot) * (busy.has(slot) ? pxBusy : pxIdle);
  };
  pos.idle = m => !busy.has(m);
  return pos;
}

/**
 * Greedy lane assignment for overlapping sessions in one room.
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

/** Minute to scroll to when opening a day: now on today, the same time of day elsewhere. */
export function anchorMinute(dayList, n) {
  const talks = dayList.filter(t => !t.plenary);
  if (!talks.length) return null;
  const first = Math.min(...talks.map(t => t.s));
  const last = Math.max(...talks.map(t => t.s));
  const conferenceStarted = n.date >= db.days[0]?.date;
  return conferenceStarted ? Math.min(Math.max(n.min, first), last) : first;
}

function cardInner(t, n, big) {
  return `${starBtn(t)}
    <div class="ev-title">${hl(t.title)}</div>
    ${t.name ? `<div class="ev-sub">${t.aff?.kind !== 'odoo' ? affTag(t, { short: true }) : ''}${hl(t.name)}</div>` : ''}
    ${big ? `<div class="ev-when">${hhmm(t.s)} – ${hhmm(t.e)}${t.youtube_id ? ` ${I.play}` : ''}</div>` : ''}`;
}

const bandTitle = t => `<div class="ev-title">${hl(t.title.replace(/\s*\(.*\)\s*$/, ''))}<span>${hhmm(t.s)}–${hhmm(t.e)}</span></div>`;
const bandCls = (t, n) => `ev plen${/keynote/i.test(t.title) ? ' keynote' : ''}${statusCls(t, n)}`;

/** Rooms to show, and the talks drawn in each (a talk shows in its first visible room). */
function roomsAndTalks(talks, dayList) {
  const rooms = state.rooms.size
    ? db.rooms.filter(r => state.rooms.has(r) && dayList.some(t => !t.plenary && t.rooms.includes(r)))
    : db.rooms.filter(r => talks.some(t => t.rooms.includes(r)));
  const inRoom = r => talks.filter(t => t.rooms[0] === r || (t.rooms.includes(r) && !rooms.includes(t.rooms[0])));
  return rooms.map(r => ({ room: r, talks: inRoom(r) }));
}

// ---------------------------------------------------------------- desktop: rooms across, time down
function vertical({ columns, bands, start, end, busy, n, anchor }) {
  const y = timeScale(start, end, busy, SCALE.vertical);
  const height = y(end);
  let gutter = '';
  let lines = '';
  for (let m = start + SLOT; m <= end; m += SLOT) {
    const half = m % 60 !== 0;
    if (half && y.idle(m - SLOT)) continue;
    if (m < end) lines += `<div class="tt-line${half ? ' half' : ''}" style="top:${y(m)}px"></div>`;
    gutter += `<div class="tt-hour${half ? ' half' : ''}" style="top:${y(m)}px">${hhmm(m)}</div>`;
  }
  for (let m = start; m < end; m += SLOT) {
    if (y.idle(m)) lines += `<div class="tt-squeeze" style="top:${y(m)}px;height:${y(m + SLOT) - y(m)}px"></div>`;
  }
  // The now-line sits in the grid layer, under the cards, so it never crosses text.
  if (n.date === state.day && n.min >= start && n.min <= end) {
    gutter += `<div class="now-tag" style="top:${y(n.min)}px">${hhmm(n.min)}</div>`;
    lines += `<div class="now-line" style="top:${y(n.min)}px"></div>`;
  }
  if (anchor != null) lines += `<div class="tt-anchor" style="top:${y(anchor)}px"></div>`;

  const head = columns.map(({ room, talks }, ci) => {
    const focused = state.rooms.size === 1 && state.rooms.has(room);
    return `<button class="tt-room ${focused ? 'focused' : ''}" style="grid-column:${ci + 2}" data-room="${esc(room)}" title="Show only ${esc(room)}">
      <span class="rn">${esc(room)}</span><span class="rs">${plural(talks.length, 'session')}</span></button>`;
  }).join('');

  const cols = columns.map(({ talks }, ci) => {
    const layout = lanes(talks);
    const cards = talks.map(t => {
      const { lane, n: ln } = layout.get(t);
      const h = y(t.e) - y(t.s) - 3;
      const pos = ln > 1 ? `left:calc(${(lane / ln) * 100}% + 2px);right:auto;width:calc(${100 / ln}% - 4px);` : '';
      return `<article class="ev${h > 120 ? ' tall' : ''}${h < 50 ? ' short' : ''}${statusCls(t, n)}" data-id="${t.id}" tabindex="0" style="top:${y(t.s) + 1}px;height:${h}px;${pos}">${cardInner(t, n, h > 110)}</article>`;
    }).join('');
    return `<div class="tt-col" style="grid-column:${ci + 2};height:${height}px">${cards}</div>`;
  }).join('');

  const plen = bands.map(t => {
    const s = Math.max(t.s, start);
    const e = Math.min(t.e, end);
    return `<article class="${bandCls(t, n)}" data-id="${t.id}" tabindex="0" style="top:${y(s) + 1}px;height:${y(e) - y(s) - 2}px">${bandTitle(t)}</article>`;
  }).join('');

  return `<div class="tt" style="--cols:${columns.length}">
      <div class="tt-corner"></div>${head}
      <div class="tt-gutter" style="height:${height}px">${gutter}</div>
      <div class="tt-grid">${lines}</div>
      ${cols}
      <div class="tt-layer">${plen}</div>
    </div>`;
}

// ---------------------------------------------------------------- phones: time across, rooms down
/** Compact chips for plenaries outside the phone grid's window ("Before 11:30 · After 18:00"). */
function outsideChips(before, after, start, end, n) {
  const chip = t => `<button class="plen-chip${statusCls(t, n)}" data-id="${t.id}">${esc(t.title.replace(/\s*\(.*\)\s*$/, ''))}<span>${hhmm(t.s)}</span></button>`;
  const group = (label, items) => (items.length ? `<span class="plen-when">${label}</span>${items.map(chip).join('')}` : '');
  const html = group(`Before ${hhmm(start)}`, before) + group(`After ${hhmm(end)}`, after);
  return html ? `<div class="tth-extra">${html}</div>` : '';
}

function horizontal({ columns, bands, start, end, busy, n, anchor, before = [], after = [] }) {
  const x = timeScale(start, end, busy, SCALE.horizontal);
  const width = x(end);
  let top = 0;
  const rows = columns.map(({ room, talks }) => {
    const layout = lanes(talks);
    const laneCount = Math.max(1, ...talks.map(t => layout.get(t).n));
    const height = ROW.label + laneCount * ROW.lane + ROW.gap;
    const cards = talks.map(t => {
      const { lane } = layout.get(t);
      const w = x(t.e) - x(t.s) - 3;
      return `<article class="ev h${statusCls(t, n)}" data-id="${t.id}" tabindex="0" style="left:${x(t.s) + 1}px;width:${w}px;top:${ROW.label + lane * ROW.lane}px;height:${ROW.lane - 4}px">${cardInner(t, n, false)}</article>`;
    }).join('');
    const row = `<section class="tth-row" style="top:${top}px;height:${height}px">
      <button class="tth-room" data-room="${esc(room)}">${esc(room)}<span>${talks.length}</span></button>${cards}</section>`;
    top += height;
    return row;
  }).join('');

  let ruler = '';
  let lines = '';
  for (let m = start; m <= end; m += SLOT) {
    const half = m % 60 !== 0;
    if (half && m !== start && x.idle(m - SLOT)) continue;
    if (m > start && m < end) lines += `<div class="tth-line${half ? ' half' : ''}" style="left:${x(m)}px"></div>`;
    if (m < end) ruler += `<span class="tth-hour${half ? ' half' : ''}" style="left:${x(m)}px">${hhmm(m)}</span>`;
  }
  for (let m = start; m < end; m += SLOT) {
    if (x.idle(m)) lines += `<div class="tth-squeeze" style="left:${x(m)}px;width:${x(m + SLOT) - x(m)}px"></div>`;
  }
  if (n.date === state.day && n.min >= start && n.min <= end) {
    lines += `<div class="tth-now" style="left:${x(n.min)}px"></div>`;
    ruler += `<span class="tth-now-tag" style="left:${x(n.min)}px">${hhmm(n.min)}</span>`;
  }
  if (anchor != null) lines += `<div class="tt-anchor h" style="left:${x(anchor)}px"></div>`;

  const plen = bands.map(t => {
    const s = Math.max(t.s, start);
    const e = Math.min(t.e, end);
    return `<article class="${bandCls(t, n)} h" data-id="${t.id}" tabindex="0" style="left:${x(s) + 1}px;width:${x(e) - x(s) - 2}px">${bandTitle(t)}</article>`;
  }).join('');

  // Extra width so a late "now" can still scroll to the left edge.
  return `${outsideChips(before, after, start, end, n)}<div class="tth" style="width:calc(${width + 24}px + 60vw)">
      <div class="tth-ruler">${ruler}</div>
      <div class="tth-body" style="height:${top}px">
        <div class="tth-grid">${lines}</div>${plen}${rows}
      </div>
    </div>`;
}

export function renderTimetable(list, dayList, n, { horizontal: rotate = false } = {}) {
  const bands = list.filter(t => t.plenary);
  const talks = list.filter(t => !t.plenary);
  const filtering = isFiltering();
  if (!talks.length && (filtering || !bands.length)) return '';

  const columns = roomsAndTalks(talks, dayList);
  if (!columns.length) return '';

  let [start, end] = timeWindow(talks.length ? talks : list, dayList, filtering);
  let before = [];
  let after = [];
  if (rotate && talks.length) {
    // Phones: the grid spans only the talks; earlier/later plenaries become chips above it.
    start = Math.floor(Math.min(...talks.map(t => t.s)) / SLOT) * SLOT;
    end = Math.ceil(Math.max(...talks.map(t => t.e)) / SLOT) * SLOT;
    before = bands.filter(t => t.e <= start);
    after = bands.filter(t => t.s >= end);
  }
  const anchor = anchorMinute(dayList, n);
  const layout = {
    columns,
    bands: bands.filter(t => t.e > start && t.s < end),
    start,
    end,
    busy: busySlots(dayList),
    n,
    anchor: anchor == null ? null : Math.min(Math.max(anchor, start), end),
    before,
    after,
  };
  return rotate ? horizontal(layout) : vertical(layout);
}
