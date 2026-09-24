// The agenda dataset, prepared once at boot and shared read-only.

import { norm } from './lib/html.js';
import { toMin } from './lib/time.js';
import { indexFields, searchFields } from './rank.js';
import { classify, optLabel, ROOM_ORDER } from './taxonomy.js';

/** Filled by load(); every module reads from this. */
export const db = { days: [], sessions: [], rooms: [], tags: [], byId: new Map(), byRef: new Map(), byDay: new Map() };

/**
 * Normalise raw agenda.json into indexed sessions. Pure, so it can be unit-tested.
 * `ref` ("s123") is the session's position in agenda.json; the server's assistant
 * prompt uses the same numbering for its [[s123]] citations.
 */
export function prepare(raw, affiliations = {}) {
  // The two pre-event masterclass days (8 paid all-day trainings) aren't part of the conference agenda.
  const days = raw.days.filter(d => !d.is_masterclass).map(d => ({ ...d, n: raw.tracks.filter(t => t.day === d.date).length }));
  const dayDates = new Set(days.map(d => d.date));
  const used = new Set(raw.tracks.filter(t => dayDates.has(t.day)).flatMap(t => t.rooms));
  const rooms = [...ROOM_ORDER.filter(r => used.has(r)), ...raw.rooms.filter(r => used.has(r) && !ROOM_ORDER.includes(r))];
  const tagCount = new Map();

  const sessions = raw.tracks.map((t, idx) => ({ t, idx })).filter(({ t }) => dayDates.has(t.day)).map(({ t, idx }) => {
    t.badges.forEach(b => tagCount.set(b, (tagCount.get(b) || 0) + 1));
    const s = toMin(t.start_time);
    const plenary = t.rooms.length > 2; // keynotes, lunch, concerts span every room
    const desc = String(t.description || '').replace(/<[^>]*>?/g, '').trim();
    return {
      ...t,
      ...classify(t, plenary),
      idx,
      ref: `s${idx}`,
      s,
      e: s + (t.duration_min || 30),
      plenary,
      desc,
      name: (t.speaker || '').trim(),
      aff: affiliations[t.id] || null, // { kind: 'odoo' | 'external' | 'mixed', orgs }
      speakers: { odoo: ['odoo'], external: ['external'], mixed: ['odoo', 'external'] }[affiliations[t.id]?.kind] || [],
      hay: norm([t.title, t.speaker_raw, t.room_str, t.badges.join(' '), desc].join(' ')),
    };
  });
  // Search index: topic, level and speaker affiliation are searchable like tags.
  for (const t of sessions) {
    const extra = [...t.tracks.map(v => optLabel('tracks', v)), ...t.levels.map(v => optLabel('levels', v))];
    if (t.aff) extra.push(t.aff.kind === 'odoo' ? 'Odoo staff' : 'external', ...t.aff.orgs);
    t.index = indexFields(searchFields(t, { tags: extra }));
  }
  sessions.sort((a, b) => a.day.localeCompare(b.day) || a.s - b.s || rooms.indexOf(a.rooms[0]) - rooms.indexOf(b.rooms[0]));

  return {
    event: { title: raw.event_title, location: raw.location, timezone: raw.timezone },
    days,
    rooms,
    sessions,
    tags: [...tagCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag),
    byId: new Map(sessions.map(t => [t.id, t])),
    byRef: new Map(sessions.map(t => [t.ref, t])),
    byDay: new Map(days.map(d => [d.date, sessions.filter(t => t.day === d.date)])),
  };
}

export async function load(url = 'data/agenda.json') {
  const [res, aff] = await Promise.all([fetch(url), fetch('data/affiliations.json').catch(() => null)]);
  if (!res.ok) throw new Error(`Could not load the agenda (HTTP ${res.status})`);
  const affiliations = aff?.ok ? await aff.json() : {}; // optional
  Object.assign(db, prepare(await res.json(), affiliations));
  return db;
}

export const dayOf = t => db.days.find(d => d.date === t.day);
