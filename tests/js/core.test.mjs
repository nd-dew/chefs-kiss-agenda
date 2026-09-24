// Unit tests for the front-end's pure modules: node --test tests/js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { prepare } from '../../web/js/agenda.js';
import { buildIcs, gcalUrl } from '../../web/js/calendar.js';
import { parseEvents } from '../../web/js/chat/client.js';
import { refsIn, renderMarkdown, replaceRefs } from '../../web/js/chat/markdown.js';
import { esc, highlighter, norm } from '../../web/js/lib/html.js';
import { dur, hhmm, isLive, isPast, toMin, utcStamp } from '../../web/js/lib/time.js';
import { classify, detectLanguage, optLabel, venueOf } from '../../web/js/taxonomy.js';
import { conflictsOf } from '../../web/js/views/saved.js';
import { lanes, PX_PER_MIN, PX_PER_MIN_EDGE, timeScale, timeWindow } from '../../web/js/views/timetable.js';

const raw = JSON.parse(readFileSync(new URL('../../web/data/agenda.json', import.meta.url)));
const db = prepare(raw);
const session = (s, e, extra = {}) => ({ id: `${s}-${e}`, day: '2026-09-24', s, e, ...extra });

test('time helpers', () => {
  assert.equal(toMin('07:30'), 450);
  assert.equal(hhmm(450), '07:30');
  assert.deepEqual([dur(30), dur(60), dur(90)], ['30 min', '1h', '1h 30']);
  assert.equal(utcStamp('2026-09-24', 14 * 60), '20260924T120000Z'); // CEST = UTC+2
  const t = session(600, 630);
  assert.ok(isLive(t, { date: '2026-09-24', min: 610 }));
  assert.ok(!isLive(t, { date: '2026-09-24', min: 630 }));
  assert.ok(isPast(t, { date: '2026-09-24', min: 630 }));
  assert.ok(isPast(t, { date: '2026-09-25', min: 0 }));
});

test('html helpers escape and highlight', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(norm('Comptabilité'), 'comptabilite');
  assert.equal(highlighter('pos')('New POS <b>'), 'New <mark>POS</mark> &lt;b&gt;');
  assert.equal(highlighter('')('<x>'), '&lt;x&gt;');
  // Only at word starts, and short words are ignored.
  assert.equal(highlighter('to up rium')('Auditorium to Group'), 'Auditorium to Group');
  assert.equal(highlighter('Comp')('Quoi de neuf dans Comptabilité'), 'Quoi de neuf dans <mark>Comp</mark>tabilité');
});

test('taxonomy folds tags into facets', () => {
  const c = classify({ title: 'x', badges: ['Artificial Intelligence', 'Odoo Beginners', 'French', 'Internal'] }, false);
  assert.deepEqual([c.tracks, c.levels, c.langs, c.formats], [['ai'], ['beginner'], ['fr'], ['odoo']]);
  assert.deepEqual(classify({ title: 'Inventory tips', badges: [] }, false).tracks, ['supply']); // title fallback
  assert.deepEqual(classify({ title: 'Hello', badges: [] }, false).tracks, ['other']);
  assert.deepEqual(classify({ title: 'Lunch', badges: [] }, true).tracks, []);
  assert.equal(optLabel('tracks', 'finance'), 'Accounting & Finance');
  assert.equal(venueOf('Hall 6.B'), 'Hall 6');
  assert.equal(venueOf('Education Village'), 'Education Village');
});

test('language detection prefers the title', () => {
  assert.equal(detectLanguage('Quoi de neuf dans Comptabilité ?', 'Discover what is new in the accounting app and how to use it.'), 'fr');
  assert.equal(detectLanguage('Hoe de administratie van je business vereenvoudigen ?'), 'nl');
  assert.equal(detectLanguage('Stop Writing AI Prompts by Hand'), 'en');
  assert.equal(detectLanguage('Odoo Security 102'), 'en');
  const tagged = classify({ title: 'Pilotez votre restaurant', badges: ['English'] }, false);
  assert.deepEqual(tagged.langs, ['en']); // an explicit tag wins
});

test('timetable squeezes hours outside 10:00-18:00', () => {
  const y = timeScale(7 * 60 + 30);
  assert.equal(y(450), 0);
  assert.equal(y(600), 150 * PX_PER_MIN_EDGE);
  assert.equal(y(660), 150 * PX_PER_MIN_EDGE + 60 * PX_PER_MIN);
  assert.equal(y(1140) - y(1080), 60 * PX_PER_MIN_EDGE);
});

test('prepare indexes the real dataset', () => {
  assert.equal(db.sessions.length, 468); // 484 minus the 16 pre-event masterclasses
  assert.deepEqual(db.days.map(d => d.date), ['2026-09-24', '2026-09-25', '2026-09-26']);
  const first = raw.tracks.findIndex(t => !t.is_masterclass);
  assert.equal(db.byRef.get(`s${first}`).title, raw.tracks[first].title); // refs follow agenda.json order
  assert.ok(!db.rooms.some(r => r.startsWith('Masterclass')));
  assert.ok(db.sessions.every(t => t.e > t.s && t.hay === norm(t.hay)));
  assert.ok(db.sessions.filter(t => t.plenary).every(t => t.rooms.length > 2));
  assert.ok(!db.sessions.some(t => /<div/.test(t.desc)));
  assert.equal(db.rooms[0], 'Auditorium 4000 A');
  const thursday = db.byDay.get('2026-09-24');
  assert.ok(thursday.every((t, i) => !i || thursday[i - 1].s <= t.s));
});

test('timetable lanes split only overlapping sessions', () => {
  const a = session(600, 660), b = session(600, 630), c = session(630, 660), d = session(700, 730);
  const L = lanes([a, b, c, d]);
  assert.deepEqual([L.get(a), L.get(b), L.get(c), L.get(d)],
    [{ lane: 0, n: 2 }, { lane: 1, n: 2 }, { lane: 1, n: 2 }, { lane: 0, n: 1 }]);
  assert.deepEqual(timeWindow([session(690, 720)], [session(450, 1380)], true), [660, 720]);
  assert.deepEqual(timeWindow([session(690, 720)], [session(450, 1380)], false), [420, 1380]);
});

test('saved schedule conflicts', () => {
  const a = session(600, 660), b = session(630, 690), c = session(690, 720), other = session(600, 660, { day: 'x' });
  const clashes = conflictsOf([a, b, c, other]);
  assert.deepEqual([...clashes.keys()].sort(), [a.id, b.id].sort());
});

test('markdown is escaped and renders session refs', () => {
  const html = renderMarkdown('Hi **there** <script>\n\n- [[s1]] – great\n- [[s2, s3]]', { ref: r => `<R:${r}>` });
  assert.equal(html, '<p>Hi <strong>there</strong> &lt;script&gt;</p><ul><li><R:s1> great</li><li><R:s2><R:s3></li></ul>');
  assert.equal(renderMarkdown('see [[s1', { streaming: true }), '<p>see</p>');
  assert.equal(renderMarkdown('### Title\n1. one\n2. two'), '<h4>Title</h4><ol><li>one</li><li>two</li></ol>');
  assert.deepEqual(refsIn('[[s1]] then [[s2; s1]]'), ['s1', 's2']);
  assert.equal(replaceRefs('A [[s1, s2]]', r => r.toUpperCase()), 'A S1, S2');
});

test('SSE parsing keeps partial events for the next chunk', () => {
  const { events, rest } = parseEvents('data: {"t":"a"}\n\ndata: {"done":true}\n\ndata: {"t"');
  assert.deepEqual(events, [{ t: 'a' }, { done: true }]);
  assert.equal(rest, 'data: {"t"');
});

test('calendar export', () => {
  const t = db.sessions.find(x => !x.plenary && x.desc);
  const ics = buildIcs([t], '20260101T000000Z');
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, new RegExp(`DTSTART:${utcStamp(t.day, t.s)}`));
  assert.ok(ics.split('\r\n').every(line => line.length <= 75));
  const url = new URL(gcalUrl(t));
  assert.equal(url.searchParams.get('text'), t.title);
  assert.match(url.searchParams.get('location'), /Brussels Expo/);
});
