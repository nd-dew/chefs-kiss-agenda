// Small HTML building blocks shared by the views, drawer, popover and chat.

import { db, dayOf } from '../agenda.js';
import { I } from '../icons.js';
import { esc, highlighter } from '../lib/html.js';
import { dur, hhmm, isLive, isPast } from '../lib/time.js';
import { favs, passes, queryTerms, state } from '../state.js';
import { optLabel, trackOf } from '../taxonomy.js';

/** Highlight the current search terms in a piece of text. */
export const hl = text => highlighter(state.q)(text);

export const statusCls = (t, n) =>
  `${isLive(t, n) ? ' is-live' : isPast(t, n) ? ' is-past' : ''}${favs.has(t.id) ? ' is-fav' : ''}`;

/** CSS custom properties that colour a session by its track. */
export const hueStyle = t =>
  `--h:${t.hue};${t.sat ? `--sat:${t.sat};--sat-bd:${t.sat === '6%' ? '8%' : '40%'};` : ''}`;

export const starBtn = t => {
  const on = favs.has(t.id);
  return `<span class="star ${on ? 'on' : ''}" role="button" tabindex="-1" data-star="${t.id}" aria-label="${on ? 'Remove from' : 'Add to'} saved">${I.star}</span>`;
};

export function initials(name) {
  return (name || '?').replace(/\(.*?\)/g, '').split(/\s+|,|&/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase();
}

export const avatar = (t, cls = '') =>
  t.speaker_avatar
    ? `<img class="avatar ${cls}" src="${esc(t.speaker_avatar)}" alt="" loading="lazy" data-initials="${esc(initials(t.name))}">`
    : `<span class="avatar ${cls}">${esc(initials(t.name))}</span>`;

export const speakerBlock = (t, cls = '') =>
  `<div class="speaker">${avatar(t, cls)}<div class="speaker-txt"><b>${esc(t.name)}</b>${t.speaker_role ? `<span>${esc(t.speaker_role)}</span>` : ''}</div></div>`;

export function tagChips(t, { max = 99, clickable = false } = {}) {
  const tk = trackOf(t);
  const el = clickable ? 'button' : 'span';
  const attr = spec => (clickable ? `data-filter="${esc(spec)}"` : '');
  const chips = [];
  if (tk) chips.push(`<${el} class="tag track" ${attr(`tracks:${tk.id}`)} style="${hueStyle(t)}"><i class="dot" style="${hueStyle(t)}"></i>${esc(tk.label)}</${el}>`);
  t.badges.slice(0, max).forEach(b => chips.push(`<${el} class="tag" ${attr(`tags:${b}`)}>${esc(b)}</${el}>`));
  return `<div class="tags">${chips.join('')}</div>`;
}

/** "Odoo" / "External · Dynapps" / "Odoo + Partena" tag; `short` for tight timetable cards. */
export function affTag(t, { short = false } = {}) {
  if (!t.aff) return '';
  // Company names come only from the official agenda; web lookups just decide Odoo vs external.
  const others = t.aff.source === 'agenda' ? t.aff.orgs.filter(o => o !== 'Odoo') : [];
  const label = {
    odoo: 'Odoo',
    external: short ? 'External' : `External${others.length ? ` · ${others.join(', ')}` : ''}`,
    mixed: short ? 'Odoo + guest' : `Odoo + ${others.join(', ') || 'guest'}`,
  }[t.aff.kind];
  return `<span class="aff aff-${t.aff.kind}" title="${t.aff.source === 'web' ? 'Found online' : 'From the agenda'}">${esc(label)}</span>`;
}

/** A session as a card row (list view, saved view, drawer "related" lists). */
export function rowHTML(t, n, { time = false, day = false, extra = '' } = {}) {
  const tk = trackOf(t);
  const meta = [
    affTag(t),
    `<span>${I.pin}${t.plenary ? 'All venues' : hl(t.room_str)}</span>`,
    time ? '' : `<span>${I.clock}${dur(t.e - t.s)}</span>`,
    tk ? `<span><i class="dot" style="${hueStyle(t)}"></i>${esc(tk.label)}</span>` : '',
    t.levels.length ? `<span>${I.level}${esc(optLabel('levels', t.levels[0]))}</span>` : '',
    // English is the default; only call out other languages.
    t.langs.some(l => l !== 'en') ? `<span>${I.globe}${esc(t.langs.map(l => optLabel('langs', l)).join(', '))}</span>` : '',
    t.youtube_id ? `<span>${I.play}Video</span>` : '',
    isLive(t, n) ? '<span class="pill live">Live</span>' : '',
    extra,
  ].join('');
  return `<article class="row${t.plenary ? ' plen' : ''}${statusCls(t, n)}" data-id="${t.id}" tabindex="0" style="${hueStyle(t)}">
    ${time ? `<div class="time-col">${day ? `<small class="tc-day">${esc(dayOf(t).short_label.replace(' Sep', ''))}</small>` : ''}<b>${hhmm(t.s)}</b><small>${hhmm(t.e)}</small></div>` : ''}
    <div class="bar"></div>
    <div class="row-main">
      <h3 class="row-title">${hl(t.title)}</h3>
      ${t.name ? `<div class="row-sub">${hl(t.name)}${t.speaker_role ? ` · ${esc(t.speaker_role)}` : ''}</div>` : ''}
      <div class="row-meta">${meta}</div>
    </div>
    ${t.plenary ? '' : starBtn(t)}
  </article>`;
}

/** While searching: "Also on other days: Fri 25 (12) · Sat 26 (3)". */
export function otherDaysHint(n, extra = '') {
  if (!state.q.trim()) return '';
  const terms = queryTerms();
  const parts = db.days.filter(d => d.date !== state.day).map(d => {
    const c = db.byDay.get(d.date).filter(t => (!t.plenary || terms.length) && passes(t, null, terms, n)).length;
    return c ? `<button data-day="${d.date}">${esc(d.short_label.replace(/ Sep/, ''))} <b>${c}</b></button>` : '';
  }).filter(Boolean);
  const days = parts.length ? `<span>“${esc(state.q.trim())}” also on</span>${parts.join('')}` : '';
  return days || extra ? `<div class="hint">${days}${extra}</div>` : '';
}

export const emptyState = n => `<div class="empty"><div>${I.search}<h3>No sessions match</h3>
  <p>Try a different search or loosen the filters.</p>${otherDaysHint(n)}
  <button class="btn" data-act="clear">Clear all filters</button></div></div>`;
