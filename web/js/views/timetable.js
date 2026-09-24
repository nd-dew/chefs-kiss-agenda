// Timetable: time runs across, rooms are stacked rows (on every screen size).
// The grid spans only the talks; earlier/later plenaries become chips above it,
// and half-hours without any talk (e.g. lunch) are squeezed.

import { db } from '../agenda.js';
import { I } from '../icons.js';
import { esc } from '../lib/html.js';
import { hhmm } from '../lib/time.js';
import { isFiltering, state } from '../state.js';
import { affTag, hl, starBtn, statusCls } from './parts.js';

const SLOT = 30; // minutes
export const SCALE = { busy: 5.2, idle: 0.45 }; // px per minute (idle = no talks, e.g. lunch)
const ROW = { label: 7, lane: 90, gap: 3 }; // px (label = room name sitting on the row divider)

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

/** Minute to scroll to when opening a day: now on today, the first talk on any other day. */
export function anchorMinute(dayList, n) {
  const talks = dayList.filter(t => !t.plenary);
  if (!talks.length) return null;
  const first = Math.min(...talks.map(t => t.s));
  const last = Math.max(...talks.map(t => t.s));
  return talks[0].day === n.date ? Math.min(Math.max(n.min, first), last) : first;
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

// ---------------------------------------------------------------- layout: time across, rooms stacked
/** Compact chips for plenaries outside the grid's window ("Before 11:30 · After 18:00"). */
function outsideChips(before, after, start, end, n) {
  const chip = t => `<button class="plen-chip${statusCls(t, n)}" data-id="${t.id}">${esc(t.title.replace(/\s*\(.*\)\s*$/, ''))}<span>${hhmm(t.s)}</span></button>`;
  const group = (label, items) => (items.length ? `<span class="plen-when">${label}</span>${items.map(chip).join('')}` : '');
  const html = group(`Before ${hhmm(start)}`, before) + group(`After ${hhmm(end)}`, after);
  return html ? `<div class="tth-extra">${html}</div>` : '';
}

/** Stretch the busy rate so the whole window fills `width` on wide screens (never below SCALE). */
export function fitScale(start, end, busy, width) {
  let busyMin = 0;
  for (let m = start; m < end; m += SLOT) if (busy.has(m)) busyMin += SLOT;
  const idleMin = end - start - busyMin;
  const stretched = busyMin ? (width - idleMin * SCALE.idle) / busyMin : SCALE.busy;
  return { busy: Math.max(SCALE.busy, stretched), idle: SCALE.idle };
}

function grid({ columns, bands, start, end, busy, n, anchor, width, before = [], after = [] }) {
  const x = timeScale(start, end, busy, width ? fitScale(start, end, busy, width) : SCALE);
  const gridWidth = x(end);
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
  const nowX = n.date === state.day && n.min >= start && n.min <= end ? x(n.min) : null;
  let lastLabel = -Infinity;
  for (let m = start; m <= end; m += SLOT) {
    const half = m % 60 !== 0;
    if (m > start && m < end) lines += `<div class="tth-line${half ? ' half' : ''}" style="left:${x(m)}px"></div>`;
    // Label only where talks happen (idle bands like lunch carry their own label),
    // and skip labels that would collide with the previous one or with the now-tag.
    const crowded = (x.idle(m) && m !== start) || x(m) - lastLabel < 40 || (nowX != null && Math.abs(x(m) - nowX) < 44);
    if (m < end && !crowded) {
      ruler += `<span class="tth-hour${half ? ' half' : ''}" style="left:${x(m)}px">${hhmm(m)}</span>`;
      lastLabel = x(m);
    }
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

  return `${outsideChips(before, after, start, end, n)}<div class="tth" style="width:${gridWidth + 12}px">
      <div class="tth-ruler">${ruler}</div>
      <div class="tth-body" style="height:${top}px">
        <div class="tth-grid">${lines}</div>${plen}${rows}
      </div>
    </div>`;
}

export function renderTimetable(list, dayList, n, { width = 0 } = {}) {
  const bands = list.filter(t => t.plenary);
  const talks = list.filter(t => !t.plenary);
  const filtering = isFiltering();
  if (!talks.length && (filtering || !bands.length)) return '';

  const columns = roomsAndTalks(talks, dayList);
  if (!columns.length) return '';

  let [start, end] = timeWindow(talks.length ? talks : list, dayList, filtering);
  let before = [];
  let after = [];
  if (talks.length) {
    // The grid spans only the talks; earlier/later plenaries become chips above it.
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
    width: width && width - 12,
  };
  return grid(layout);
}
