/* OXP 2026 Agenda — timetable, list & personal schedule */
(() => {
  'use strict';

  const TZ = 'Europe/Brussels';
  const UTC_OFFSET = '+02:00'; // CEST during the whole event
  const PX = 2.2; // pixels per minute in the timetable
  const LS_FAV = 'oxp_favorites_2026';
  const LS_THEME = 'oxp_theme';
  const ODOO = 'https://www.odoo.com';

  // ------------------------------------------------------------------ helpers
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const dur = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}` : `${m / 60}h`);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };

  const I = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9h17M9.5 3.5v17"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    layers: '<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
    level: '<svg viewBox="0 0 24 24"><path d="M5 20v-5M12 20V9M19 20V4"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    tag: '<svg viewBox="0 0 24 24"><path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8" cy="8" r="1.3"/></svg>',
    play: '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5z"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
    now: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg>',
  };

  // ------------------------------------------------------------ taxonomy
  // Odoo tags are noisy (119 of them), so they're folded into a few clean facets.
  const TRACKS = [
    { id: 'ai', label: 'AI', h: 268, tags: ['AI', 'Artificial Intelligence', 'IA', 'AI Day'], re: /\bAI\b|artificial intelligence|\bagents?\b|\bLLM/i },
    { id: 'finance', label: 'Accounting & Finance', h: 152, tags: ['Accounting & Finance', 'Accounting', 'Invoicing', 'finance', 'CFO', 'ESG'], re: /accounting|finance|invoic|\btax|fiscal|peppol|bank/i },
    { id: 'supply', label: 'Logistics & Manufacturing', h: 27, tags: ['Logistic & Manufacturing', 'Manufacturing', 'MRP', 'Inventory', 'Purchase', 'Logistic & Supply Chain', 'Logistics Day', 'Manufacturing Day', 'Quality', 'Maintenance', 'Repair', 'Brewing', 'construction'], re: /inventory|manufactur|\bmrp\b|logistic|warehouse|supply|barcode|purchase/i },
    { id: 'web', label: 'Website & Marketing', h: 328, tags: ['Marketing & eCommerce', 'eCommerce', 'Website', 'Webdesign', 'Marketing', 'Social Media', 'Email marketing', 'Website & eCommerce', 'Sitio web/E-commerce', 'Events', 'Events Business'], re: /website|e-?commerce|marketing|\bseo\b/i },
    { id: 'sales', label: 'Sales & Retail', h: 210, tags: ['Sales', 'Point of Sale', 'Retail & Food', 'Retail', 'Restaurant', 'CRM', 'Subscription', 'Rental', 'Hotel', 'second hand', 'Membership', 'Appointment', 'Real-Estate'], re: /\bsales\b|point of sale|\bpos\b|\bcrm\b|restaurant|retail|subscription|rental/i },
    { id: 'hr', label: 'HR & People', h: 184, tags: ['Human Resource', 'Human Resources', 'HR', 'Recruitment', 'Payroll', 'Planning', 'Timesheets', 'Attendance', 'Employees', 'Fleet'], re: /\bhr\b|payroll|recruit|employee|human resource/i },
    { id: 'dev', label: 'Developers', h: 240, sat: '22%', tags: ['Developers', 'Technical', 'Studio', 'Database', 'Hosting', 'Migration', "Developer's Forum", 'Access rights', 'Imports and exports', 'Hardware', 'technology'], re: /developer|technical|framework|\bowl\b|python|\bapi\b|\borm\b|odoo\.sh|studio/i },
    { id: 'prod', label: 'Productivity & Services', h: 48, tags: ['Productivity & Project', 'Productivity', 'Project', 'Spreadsheet', 'Helpdesk', 'Field Service', 'Dashboards', 'Business Intelligence', 'reporting', 'Discuss', 'Sign', 'Phone', 'Calendar', 'Customer Success', 'community care center'], re: /project|spreadsheet|helpdesk|field service|dashboard|knowledge|documents/i },
    { id: 'edu', label: 'Education', h: 96, tags: ['Education', 'Students & Teachers', 'Students', 'Teachers', 'Game', 'Sport'], re: /student|teacher|education|universit/i },
    { id: 'biz', label: 'Business & Strategy', h: 352, tags: ['Business leaders', 'CEO', 'CCO', 'Leadership', 'Consulting', 'Future entrepreneurs', 'Growth', 'implementation', 'Best practice', 'ERP', 'Industry'], re: /implementation|go-live|entrepreneur|leader|strategy|growth/i },
  ];
  const OTHER = { id: 'other', label: 'Other', h: 240, sat: '6%' };
  const LEVELS = [
    { id: 'beginner', label: 'Beginner', tags: ['Odoo Beginners', 'Getting started'] },
    { id: 'expert', label: 'Expert', tags: ['Odoo Experts', 'Advanced level'] },
  ];
  const LANGS = [
    { id: 'en', label: 'English', tags: ['English'] },
    { id: 'fr', label: 'French', tags: ['French'] },
    { id: 'nl', label: 'Dutch', tags: ['Dutch'] },
  ];
  const FORMATS = [
    { id: 'odoo', label: 'Odoo talk', tags: ['Internal', 'Odoo'] },
    { id: 'community', label: 'Community talk', tags: ['Community', 'Community Talk'] },
    { id: 'partner', label: 'Partner', tags: ['Partner', 'Partner talk'] },
    { id: 'invited', label: 'Invited speaker', tags: ['Invited Speaker'] },
    { id: 'influencer', label: 'Influencer', tags: ['Influencer'] },
    { id: 'mini', label: 'Mini event', tags: ['Mini Events'] },
    { id: 'masterclass', label: 'Masterclass', test: t => t.is_masterclass },
  ];
  const ROOM_ORDER = [
    'Auditorium 4000 A', 'Auditorium 4000 B', 'Auditorium 4000 C', 'Auditorium 4000 D',
    'Auditorium 2000 A', 'Auditorium 2000 B', 'Auditorium 2000 C', 'Auditorium 500',
    'Hall 6.A', 'Hall 6.B', 'Hall 6.C', 'Hall 6.D', 'Hall 6.E', 'Hall 7.A', 'Hall 7.B',
    'Education Village',
    ...Array.from({ length: 8 }, (_, i) => `Masterclass Room ${i + 1}`),
  ];
  const venueOf = r => (r.match(/^(Auditorium \d+|Hall \d+)/) || [])[1] || (r.startsWith('Masterclass') ? 'Masterclass rooms' : r);

  const fromTags = (defs, badges, t) => defs.filter(d => (d.test && d.test(t)) || (d.tags && d.tags.some(x => badges.has(x)))).map(d => d.id);

  // ------------------------------------------------------------ data
  let DATA, DAYS, TRACKS_ALL, byId, byRef, byDay, ROOMS, ALL_TAGS;

  function prepare(raw) {
    DATA = raw;
    DAYS = raw.days.map(d => ({ ...d, n: raw.tracks.filter(t => t.day === d.date).length }));
    const roomSet = new Set(raw.rooms);
    ROOMS = [...ROOM_ORDER.filter(r => roomSet.has(r)), ...raw.rooms.filter(r => !ROOM_ORDER.includes(r))];
    const tagCount = new Map();

    TRACKS_ALL = raw.tracks.map((t, idx) => {
      const badges = new Set(t.badges);
      t.badges.forEach(b => tagCount.set(b, (tagCount.get(b) || 0) + 1));
      const s = toMin(t.start_time);
      const x = {
        ...t, idx,
        s, e: s + (t.duration_min || 30),
        plenary: t.rooms.length > 2,
        desc: String(t.description || '').replace(/\s*<div\s*$/i, '').replace(/<[^>]*>?/g, '').trim(),
      };
      let tr = TRACKS.filter(d => d.tags.some(b => badges.has(b))).map(d => d.id);
      if (!tr.length && !x.plenary) tr = TRACKS.filter(d => d.re.test(t.title)).map(d => d.id).slice(0, 1);
      x.tracks = tr.length ? tr : (x.plenary ? [] : ['other']);
      x.levels = fromTags(LEVELS, badges, t);
      x.langs = fromTags(LANGS, badges, t);
      x.formats = fromTags(FORMATS, badges, t);
      const tk = TRACKS.find(d => d.id === x.tracks[0]) || OTHER;
      x.hue = tk.h; x.sat = tk.sat || '';
      x.name = (t.speaker || '').trim();
      x.hay = norm([t.title, t.speaker_raw, t.room_str, t.badges.join(' '), x.desc].join(' '));
      return x;
    }).sort((a, b) => a.day.localeCompare(b.day) || a.s - b.s || ROOMS.indexOf(a.rooms[0]) - ROOMS.indexOf(b.rooms[0]));

    byId = new Map(TRACKS_ALL.map(t => [t.id, t]));
    byRef = new Map(TRACKS_ALL.map(t => ['s' + t.idx, t]));
    byDay = new Map(DAYS.map(d => [d.date, TRACKS_ALL.filter(t => t.day === d.date)]));
    ALL_TAGS = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  }

  // ------------------------------------------------------------ time
  const NOW_OVERRIDE = new URLSearchParams(location.search).get('now'); // e.g. ?now=2026-09-24T14:10
  function now() {
    if (NOW_OVERRIDE) { const [d, tm] = NOW_OVERRIDE.split('T'); return { date: d, min: toMin(tm || '00:00') }; }
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const g = k => p.find(x => x.type === k).value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, min: +g('hour') * 60 + +g('minute') };
  }
  const isPast = (t, n = now()) => n.date > t.day || (n.date === t.day && t.e <= n.min);
  const isLive = (t, n = now()) => n.date === t.day && t.s <= n.min && n.min < t.e;

  // ------------------------------------------------------------ state
  const FACETS = {
    rooms: { label: 'Room', icon: I.pin, get: t => t.rooms, search: true },
    tracks: { label: 'Track', icon: I.layers, get: t => t.tracks },
    levels: { label: 'Level', icon: I.level, get: t => t.levels },
    langs: { label: 'Language', icon: I.globe, get: t => t.langs },
    formats: { label: 'Format', icon: I.mic, get: t => t.formats },
    tags: { label: 'Tags', icon: I.tag, get: t => t.badges, search: true },
  };
  const FLAGS = { video: 'Has video', saved: 'Saved', upcoming: 'Upcoming' };

  const state = {
    day: null, view: null, q: '',
    rooms: new Set(), tracks: new Set(), levels: new Set(), langs: new Set(), formats: new Set(), tags: new Set(),
    video: false, saved: false, upcoming: false,
    menu: null, menuQ: '', drawer: null,
  };
  let favs = new Set();
  let scrollPending = true;

  function loadFavs() {
    try { favs = new Set(JSON.parse(store.get(LS_FAV) || '[]')); } catch (e) { favs = new Set(); }
  }
  const saveFavs = () => store.set(LS_FAV, JSON.stringify([...favs]));

  const qTokens = () => norm(state.q).split(/\s+/).filter(Boolean);
  const activeFilterCount = () => Object.keys(FACETS).reduce((n, k) => n + state[k].size, 0) + ['video', 'saved', 'upcoming'].filter(k => state[k]).length;

  function passes(t, skip, toks = qTokens(), n = now()) {
    if (toks.length && !toks.every(w => t.hay.includes(w))) return false;
    if (state.saved && !favs.has(t.id)) return false;
    if (state.upcoming && isPast(t, n)) return false;
    // Plenary slots (keynotes, lunch, concerts) stay visible as context unless searched/saved-filtered.
    if (t.plenary) return !state.video && Object.keys(FACETS).every(k => !state[k].size || k === 'rooms');
    if (state.video && !t.youtube_id) return false;
    for (const k in FACETS) {
      if (k === skip) continue;
      const sel = state[k];
      if (sel.size && !FACETS[k].get(t).some(v => sel.has(v))) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ URL hash
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('day') && DAYS.some(d => d.date === p.get('day'))) state.day = p.get('day');
    if (['grid', 'list', 'mine'].includes(p.get('view'))) state.view = p.get('view');
    state.q = p.get('q') || '';
    for (const k in FACETS) state[k] = new Set((p.get(k) || '').split('|').filter(Boolean));
    for (const k in FLAGS) state[k] = p.get(k) === '1';
  }
  function writeHash() {
    const p = new URLSearchParams();
    p.set('day', state.day); p.set('view', state.view);
    if (state.q) p.set('q', state.q);
    for (const k in FACETS) if (state[k].size) p.set(k, [...state[k]].join('|'));
    for (const k in FLAGS) if (state[k]) p.set(k, '1');
    history.replaceState(null, '', '#' + p.toString().replace(/%7C/g, '|').replace(/%20/g, '+'));
  }

  // ------------------------------------------------------------ DOM refs
  const main = $('#main'), pop = $('#popover'), menu = $('#menu'), scrim = $('#scrim'), drawer = $('#drawer'), toastEl = $('#toast');
  const qInput = $('#q');
  const isPhone = () => matchMedia('(max-width: 640px)').matches;
  const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ------------------------------------------------------------ rendering: chrome
  function renderDays() {
    const n = now();
    $('#days').innerHTML = DAYS.map(d => {
      const [wd, , dd] = d.short_label.split(' ');
      const sel = d.date === state.day && state.view !== 'mine';
      return `<button class="day" role="tab" data-day="${d.date}" aria-selected="${sel}" title="${esc(d.label)}">
        ${d.date === n.date ? '<i class="today-dot" title="Today"></i>' : ''}
        <b>${wd} ${dd}</b><small>${d.is_masterclass ? 'Masterclass' : `${d.n} talks`}</small></button>`;
    }).join('');
  }

  function renderViews() {
    const v = [['grid', I.grid, 'Timetable', 'G'], ['list', I.list, 'List', 'L'], ['mine', I.star, 'Saved', 'S']];
    $('#views').innerHTML = v.map(([id, ic, lbl, key]) =>
      `<button class="view-btn" role="tab" data-view="${id}" aria-selected="${state.view === id}" title="${lbl} (${key})">${ic}<span class="lbl">${lbl}</span>${id === 'mine' && favs.size ? `<span class="count">${favs.size}</span>` : ''}</button>`
    ).join('');
  }

  function renderTheme() {
    const dark = resolvedTheme() === 'dark';
    const b = $('#theme');
    b.innerHTML = dark ? I.sun : I.moon;
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  const resolvedTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  function renderFilterbar(shown, total) {
    const fb = $('#filterbar');
    if (state.view === 'mine') { fb.hidden = true; return; }
    fb.hidden = false;
    const n = now();
    const isToday = state.day === n.date;
    let h = '';
    for (const k in FACETS) {
      const f = FACETS[k], c = state[k].size;
      const lbl = c === 1 ? optLabel(k, [...state[k]][0]) : f.label;
      h += `<button class="fbtn ${c ? 'active' : ''}" data-facet="${k}" aria-haspopup="true" aria-expanded="${state.menu === k}">${f.icon}<span>${esc(lbl)}</span>${c > 1 ? `<span class="n">${c}</span>` : ''}</button>`;
    }
    h += '<span class="fsep"></span>';
    h += `<button class="fbtn ${state.video ? 'active' : ''}" data-flag="video" aria-pressed="${state.video}">${I.play}<span>${FLAGS.video}</span></button>`;
    h += `<button class="fbtn ${state.saved ? 'active' : ''}" data-flag="saved" aria-pressed="${state.saved}">${I.star}<span>${FLAGS.saved}</span></button>`;
    if (isToday) {
      h += `<button class="fbtn ${state.upcoming ? 'active' : ''}" data-flag="upcoming" aria-pressed="${state.upcoming}">${I.eye}<span>Hide past</span></button>`;
      h += `<button class="fbtn" data-act="now">${I.now}<span>Now</span></button>`;
    }
    if (activeFilterCount() || state.q) h += `<button class="fclear" data-act="clear">Clear all</button>`;
    h += `<span class="fcount"><b>${shown}</b> of ${total} sessions</span>`;
    fb.innerHTML = h;
  }

  function optLabel(k, v) {
    const src = { tracks: [...TRACKS, OTHER], levels: LEVELS, langs: LANGS, formats: FORMATS }[k];
    return src ? (src.find(o => o.id === v) || { label: v }).label : v;
  }

  // ------------------------------------------------------------ rendering: main
  function render() {
    hidePop();
    renderDays(); renderViews();
    const dayList = byDay.get(state.day) || [];
    const toks = qTokens(), n = now();
    const list = dayList.filter(t => passes(t, null, toks, n));
    const talks = dayList.filter(t => !t.plenary);
    renderFilterbar(list.filter(t => !t.plenary).length, talks.length);

    if (state.view === 'mine') main.innerHTML = renderMine();
    else if (state.view === 'grid') main.innerHTML = renderGrid(list, dayList, n) || renderEmpty();
    else main.innerHTML = renderList(list, n) || renderEmpty();

    if (state.menu) renderMenu();
    if (scrollPending) { scrollPending = false; requestAnimationFrame(() => scrollToNow(true)); }
    writeHash();
  }

  function otherDaysHint() {
    if (!state.q && !activeFilterCount()) return '';
    const toks = qTokens(), n = now();
    const parts = DAYS.filter(d => d.date !== state.day).map(d => {
      const c = byDay.get(d.date).filter(t => (!t.plenary || toks.length) && passes(t, null, toks, n)).length;
      return c ? `<button data-day="${d.date}">${c} on ${esc(d.short_label.replace(/ Sep/, ''))}</button>` : '';
    }).filter(Boolean);
    return parts.length ? `<div class="hint">Also matching: ${parts.join('')}</div>` : '';
  }

  function renderEmpty() {
    return `<div class="empty"><div>${I.search}<h3>No sessions match</h3><p>Try a different search or loosen the filters.</p>
      ${otherDaysHint()}
      <button class="btn" data-act="clear">Clear all filters</button></div></div>`;
  }

  function hl(text) {
    const toks = state.q.trim().split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!toks.length) return esc(text);
    const re = new RegExp(`(${toks.join('|')})`, 'gi');
    return String(text).split(re).map((p, i) => i % 2 ? `<mark>${esc(p)}</mark>` : esc(p)).join('');
  }

  const statusCls = (t, n) => `${isLive(t, n) ? ' is-live' : isPast(t, n) ? ' is-past' : ''}${favs.has(t.id) ? ' is-fav' : ''}`;
  const hueStyle = t => `--h:${t.hue};${t.sat ? `--sat:${t.sat};--sat-bd:${t.sat === '6%' ? '8%' : '40%'};` : ''}`;
  const starBtn = t => `<span class="star ${favs.has(t.id) ? 'on' : ''}" role="button" tabindex="-1" data-star="${t.id}" aria-label="${favs.has(t.id) ? 'Remove from' : 'Add to'} saved">${I.star}</span>`;

  // Greedy lane assignment for overlapping sessions inside one room column.
  function lanes(evts) {
    const out = new Map();
    let cluster = [], end = -1;
    const flush = () => {
      const ends = [];
      for (const e of cluster) {
        let i = ends.findIndex(x => x <= e.s);
        if (i < 0) { i = ends.length; ends.push(0); }
        ends[i] = e.e; out.set(e, { lane: i });
      }
      cluster.forEach(e => (out.get(e).n = ends.length));
      cluster = []; end = -1;
    };
    for (const e of evts) { if (cluster.length && e.s >= end) flush(); cluster.push(e); end = Math.max(end, e.e); }
    if (cluster.length) flush();
    return out;
  }

  function renderGrid(list, dayList, n) {
    const plen = list.filter(t => t.plenary);
    const reg = list.filter(t => !t.plenary);
    let rooms = ROOMS.filter(r => reg.some(t => t.rooms.includes(r)));
    if (state.rooms.size) rooms = ROOMS.filter(r => state.rooms.has(r) && dayList.some(t => !t.plenary && t.rooms.includes(r)));
    if (!reg.length && !(plen.length && !activeFilterCount() && !state.q)) return '';
    if (!rooms.length) return '';

    // Zoom the time axis to what's visible when filtering, otherwise show the whole day.
    const span = state.q || activeFilterCount() ? (reg.length ? reg : list) : dayList;
    const start = Math.floor(Math.min(...span.map(t => t.s)) / 60) * 60;
    const end = Math.ceil(Math.max(...span.map(t => t.e)) / 60) * 60;
    const bandsIn = plen.filter(t => t.e > start && t.s < end);
    const H = (end - start) * PX;
    const y = m => (m - start) * PX;

    let hours = '';
    for (let m = start; m <= end; m += 30) {
      if (m === start) continue;
      hours += `<div class="tt-hour ${m % 60 ? 'half' : ''}" style="top:${y(m)}px">${hhmm(m)}</div>`;
    }

    const head = rooms.map((r, ci) => {
      const c = reg.filter(t => t.rooms.includes(r)).length;
      return `<button class="tt-room ${state.rooms.size === 1 && state.rooms.has(r) ? 'focused' : ''}" style="grid-column:${ci + 2}" data-room="${esc(r)}" title="Show only ${esc(r)}"><span class="rn">${esc(r)}</span><span class="rs">${c} session${c === 1 ? '' : 's'}</span></button>`;
    }).join('');

    const cols = rooms.map((r, ci) => {
      const evs = reg.filter(t => t.rooms[0] === r || (t.rooms.includes(r) && !rooms.includes(t.rooms[0])));
      const L = lanes(evs);
      return `<div class="tt-col" style="grid-column:${ci + 2};height:${H}px">${evs.map(t => {
        const { lane, n: ln } = L.get(t);
        const h = (t.e - t.s) * PX - 3;
        const pos = ln > 1 ? `left:calc(${(lane / ln) * 100}% + 2px);right:auto;width:calc(${100 / ln}% - 4px);` : '';
        return `<article class="ev${h > 120 ? ' tall' : ''}${statusCls(t, n)}" data-id="${t.id}" tabindex="0" style="top:${y(t.s) + 1}px;height:${h}px;${pos}${hueStyle(t)}">
          ${starBtn(t)}
          <div class="ev-title">${hl(t.title)}</div>
          ${t.name && h > 50 ? `<div class="ev-sub">${hl(t.name)}</div>` : ''}
          ${h > 110 ? `<div class="ev-when">${hhmm(t.s)} – ${hhmm(t.e)}${t.youtube_id ? ` ${I.play}` : ''}</div>` : ''}
        </article>`;
      }).join('')}</div>`;
    }).join('');

    const bands = bandsIn.map(t => `<article class="ev plen${/keynote/i.test(t.title) ? ' keynote' : ''}${statusCls(t, n)}" data-id="${t.id}" tabindex="0" style="top:${y(Math.max(t.s, start)) + 1}px;height:${(Math.min(t.e, end) - Math.max(t.s, start)) * PX - 2}px">
        <div class="ev-title">${hl(t.title.replace(/\s*\(.*\)\s*$/, ''))}<span>${hhmm(t.s)}–${hhmm(t.e)}</span></div></article>`).join('');

    const showNow = n.date === state.day && n.min >= start && n.min <= end;
    const nowLine = showNow ? `<div class="tt-nowlayer"><div class="now-line" style="top:${y(n.min)}px"></div></div>` : '';
    if (showNow) hours += `<div class="now-tag" style="top:${y(n.min)}px">${hhmm(n.min)}</div>`;

    const hint = otherDaysHint();
    return `${hint ? `<div class="tt-hint">${hint}</div>` : ''}
      <div class="tt" style="--cols:${rooms.length};--hour:${60 * PX}px">
        <div class="tt-corner"></div>${head}
        <div class="tt-gutter" style="height:${H}px">${hours}</div>
        ${cols}
        <div class="tt-layer">${bands}</div>
        ${nowLine}
      </div>`;
  }

  function rowHTML(t, n, { time = false, extra = '' } = {}) {
    const tk = TRACKS.find(d => d.id === t.tracks[0]);
    const meta = [
      t.plenary ? `<span>${I.pin}All venues</span>` : `<span>${I.pin}${hl(t.room_str)}</span>`,
      time ? '' : `<span>${I.clock}${dur(t.e - t.s)}</span>`,
      tk ? `<span><i class="dot" style="${hueStyle(t)}"></i>${esc(tk.label)}</span>` : '',
      t.levels.length ? `<span>${I.level}${esc(optLabel('levels', t.levels[0]))}</span>` : '',
      t.langs.length ? `<span>${I.globe}${esc(t.langs.map(l => optLabel('langs', l)).join(', '))}</span>` : '',
      t.youtube_id ? `<span>${I.play}Video</span>` : '',
      isLive(t, n) ? '<span class="pill live">Live</span>' : '',
      extra,
    ].join('');
    return `<article class="row${t.plenary ? ' plen' : ''}${statusCls(t, n)}" data-id="${t.id}" tabindex="0" style="${hueStyle(t)}">
      ${time ? `<div class="time-col"><b>${hhmm(t.s)}</b><small>${hhmm(t.e)}</small></div>` : ''}
      <div class="bar"></div>
      <div class="row-main">
        <h3 class="row-title">${hl(t.title)}</h3>
        ${t.name ? `<div class="row-sub">${hl(t.name)}${t.speaker_role ? ` · ${esc(t.speaker_role)}` : ''}</div>` : ''}
        <div class="row-meta">${meta}</div>
      </div>
      ${t.plenary ? '' : starBtn(t)}
    </article>`;
  }

  function renderList(list, n) {
    if (!list.some(t => !t.plenary) && (state.q || activeFilterCount())) return '';
    if (!list.length) return '';
    const groups = new Map();
    list.forEach(t => { if (!groups.has(t.s)) groups.set(t.s, []); groups.get(t.s).push(t); });
    let h = `<div class="list">${otherDaysHint()}`;
    for (const [s, items] of groups) {
      const live = items.some(t => isLive(t, n));
      const past = items.every(t => isPast(t, n));
      const c = items.filter(t => !t.plenary).length;
      h += `<section class="slot" data-slot="${s}" ${live ? 'data-live' : ''} ${past ? 'data-past' : ''}>
        <header class="slot-h"><time>${hhmm(s)}</time>${live ? '<span class="pill live">Now</span>' : ''}<span class="muted">${c ? `${c} session${c === 1 ? '' : 's'}` : ''}</span></header>
        <div class="slot-items">${items.map(t => rowHTML(t, n)).join('')}</div></section>`;
    }
    return h + '</div>';
  }

  function conflictsOf(items) {
    const m = new Map();
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.day === b.day && a.s < b.e && b.s < a.e) {
        (m.get(a.id) || m.set(a.id, []).get(a.id)).push(b);
        (m.get(b.id) || m.set(b.id, []).get(b.id)).push(a);
      }
    }
    return m;
  }

  function renderMine() {
    const n = now();
    const toks = qTokens();
    const items = TRACKS_ALL.filter(t => favs.has(t.id) && (!toks.length || toks.every(w => t.hay.includes(w))));
    if (!favs.size) {
      return `<div class="empty"><div>${I.star}<h3>Nothing saved yet</h3><p>Tap the star on any session to build your personal schedule. It's stored in this browser only.</p>
        <button class="btn primary" data-view="grid">Browse the timetable</button></div></div>`;
    }
    const cf = conflictsOf(items);
    let h = `<div class="list"><div class="mine-head"><div><h1>My schedule</h1><p>${favs.size} saved session${favs.size === 1 ? '' : 's'}${cf.size ? ` · <span class="pill warn">${I.alert} ${cf.size} overlapping</span>` : ''}</p></div>
      <div class="btns"><button class="btn" data-act="ics-mine">${I.download}Export .ics</button><button class="btn ghost" data-act="clear-favs">${I.trash}Clear</button></div></div>`;
    for (const d of DAYS) {
      const di = items.filter(t => t.day === d.date);
      if (!di.length) continue;
      h += `<div class="day-h"><h2>${esc(d.label)}</h2><span>${di.length} session${di.length === 1 ? '' : 's'}</span></div><div class="mini">`;
      for (const t of di) {
        const clash = cf.get(t.id);
        h += rowHTML(t, n, { time: true, extra: clash ? `<span class="pill warn" title="${esc(clash.map(o => o.title).join('\n'))}">${I.alert}Overlaps ${clash.length === 1 ? esc(clash[0].title.slice(0, 48)) : `${clash.length} sessions`}</span>` : '' });
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  // ------------------------------------------------------------ scrolling
  function scrollToNow(initial) {
    const n = now();
    if (state.view === 'mine') { main.scrollTop = 0; return; }
    if (n.date !== state.day) { if (initial) main.scrollTo({ top: 0, left: 0 }); return; }
    if (state.view === 'grid') {
      const line = $('.now-line', main);
      if (line) main.scrollTo({ top: Math.max(0, line.offsetTop - 110), behavior: initial ? 'auto' : 'smooth' });
    } else {
      const slot = $('.slot[data-live]', main) || $('.slot:not([data-past])', main);
      if (slot) main.scrollTo({ top: Math.max(0, slot.offsetTop - 6), behavior: initial ? 'auto' : 'smooth' });
    }
  }

  // ------------------------------------------------------------ filter menu
  function facetOptions(k) {
    const day = byDay.get(state.day) || [];
    const base = new Map();
    day.forEach(t => { if (!t.plenary) FACETS[k].get(t).forEach(v => base.set(v, (base.get(v) || 0) + 1)); });
    let opts;
    if (k === 'rooms') opts = ROOMS.map(r => ({ v: r, label: r, group: venueOf(r) }));
    else if (k === 'tracks') opts = [...TRACKS, OTHER].map(o => ({ v: o.id, label: o.label, h: o.h, sat: o.sat }));
    else if (k === 'levels') opts = LEVELS.map(o => ({ v: o.id, label: o.label }));
    else if (k === 'langs') opts = LANGS.map(o => ({ v: o.id, label: o.label }));
    else if (k === 'formats') opts = FORMATS.map(o => ({ v: o.id, label: o.label }));
    else opts = ALL_TAGS.map(v => ({ v, label: v }));
    return opts.filter(o => base.get(o.v) || state[k].has(o.v));
  }

  function renderMenu() {
    const k = state.menu, f = FACETS[k];
    const toks = qTokens(), n = now();
    const counts = new Map();
    (byDay.get(state.day) || []).forEach(t => { if (!t.plenary && passes(t, k, toks, n)) f.get(t).forEach(v => counts.set(v, (counts.get(v) || 0) + 1)); });
    const mq = norm(state.menuQ);
    const opts = facetOptions(k).filter(o => !mq || norm(o.label).includes(mq));
    let lastGroup = null, body = '';
    for (const o of opts) {
      if (o.group && o.group !== lastGroup) {
        lastGroup = o.group;
        const members = opts.filter(x => x.group === o.group);
        body += members.length > 1
          ? `<div class="menu-group"><span>${esc(o.group)}</span><button data-group="${esc(o.group)}">${members.every(x => state[k].has(x.v)) ? 'None' : 'All'}</button></div>`
          : `<div class="menu-group"><span>${esc(o.group)}</span></div>`;
      }
      const c = counts.get(o.v) || 0, on = state[k].has(o.v);
      body += `<button class="opt ${c || on ? '' : 'zero'}" role="menuitemcheckbox" aria-checked="${on}" data-opt="${esc(o.v)}">
        <span class="box">${I.check}</span>${o.h != null ? `<i class="dot" style="--h:${o.h};${o.sat ? `--sat:${o.sat}` : ''}"></i>` : ''}<span class="lbl">${esc(o.label)}</span><span class="cnt">${c}</span></button>`;
    }
    const keepFocus = document.activeElement && document.activeElement.id === 'menu-q';
    const scroll = $('.menu-list', menu)?.scrollTop || 0;
    menu.innerHTML = `<div class="menu-head"><h3>${f.label}</h3>${state[k].size ? '<button data-act="menu-clear">Clear</button>' : ''}<button data-act="menu-close" aria-label="Close">Done</button></div>
      ${f.search ? `<label class="menu-search">${I.search}<input id="menu-q" type="search" placeholder="Filter ${f.label.toLowerCase()}…" value="${esc(state.menuQ)}" autocomplete="off"></label>` : ''}
      <div class="menu-list" role="menu">${body || '<div class="menu-empty">Nothing here</div>'}</div>`;
    $('.menu-list', menu).scrollTop = scroll;
    if (keepFocus) { const i = $('#menu-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  function openMenu(k, btn) {
    if (state.menu === k) return closeMenu();
    const r = btn.getBoundingClientRect();
    state.menu = k; state.menuQ = '';
    menu.hidden = false;
    renderMenu();
    renderFilterbar(...countsNow());
    if (isPhone()) { scrim.hidden = false; scrim.classList.remove('clear'); }
    else {
      menu.style.left = Math.max(12, Math.min(r.left, innerWidth - 312)) + 'px';
      menu.style.top = r.bottom + 6 + 'px';
      $('#menu-q')?.focus();
    }
  }
  function closeMenu() {
    if (!state.menu) return;
    state.menu = null; menu.hidden = true;
    if (!state.drawer) scrim.hidden = true;
    renderFilterbar(...countsNow());
  }
  function countsNow() {
    const day = byDay.get(state.day) || [];
    const toks = qTokens(), n = now();
    return [day.filter(t => !t.plenary && passes(t, null, toks, n)).length, day.filter(t => !t.plenary).length];
  }

  // ------------------------------------------------------------ hover popover
  let popTimer = null, popFor = null;
  function initials(name) {
    return (name || '?').replace(/\(.*?\)/g, '').split(/\s+|,|&/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
  const avatar = (t, cls = '') => t.speaker_avatar
    ? `<img class="avatar ${cls}" src="${esc(t.speaker_avatar)}" alt="" loading="lazy" data-initials="${esc(initials(t.name))}">`
    : `<span class="avatar ${cls}">${esc(initials(t.name))}</span>`;

  function tagChips(t, max = 99, clickable = false) {
    const tk = TRACKS.find(d => d.id === t.tracks[0]);
    const el = clickable ? 'button' : 'span';
    const chips = [];
    if (tk) chips.push(`<${el} class="tag track" ${clickable ? `data-filter="tracks:${tk.id}"` : ''} style="${hueStyle(t)}"><i class="dot" style="${hueStyle(t)}"></i>${esc(tk.label)}</${el}>`);
    t.badges.slice(0, max).forEach(b => chips.push(`<${el} class="tag" ${clickable ? `data-filter="tags:${esc(b)}"` : ''}>${esc(b)}</${el}>`));
    return `<div class="tags">${chips.join('')}</div>`;
  }

  function showPop(el, ev) {
    const t = byId.get(el.dataset.id);
    if (!t) return;
    const n = now();
    const d = DAYS.find(x => x.date === t.day);
    pop.innerHTML = `
      <div class="pop-top">${isLive(t, n) ? '<span class="pill live">Live now</span>' : ''}<span>${esc(d.short_label)} · ${hhmm(t.s)}–${hhmm(t.e)} · ${dur(t.e - t.s)}</span></div>
      <h4 class="pop-title">${esc(t.title)}</h4>
      <div class="pop-top" style="margin:0 0 10px">${I.pin}<span>${t.plenary ? 'All venues' : esc(t.room_str)}</span>${t.youtube_id ? `<span>·</span>${I.play}<span>Video</span>` : ''}</div>
      ${t.name ? `<div class="speaker">${avatar(t)}<div class="speaker-txt"><b>${esc(t.name)}</b>${t.speaker_role ? `<span>${esc(t.speaker_role)}</span>` : ''}</div></div>` : ''}
      ${t.desc ? `<p class="pop-desc">${esc(t.desc.replace(/\n+/g, ' '))}</p>` : ''}
      ${t.badges.length || t.tracks.length ? tagChips(t, 6) : ''}
      <div class="pop-foot"><span>Click for details</span><span>${favs.has(t.id) ? '★ Saved' : '☆ Star to save'}</span></div>`;
    pop.hidden = false;
    const r = el.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight, m = 12;
    let x, y;
    if (el.classList.contains('plen')) { x = ev.clientX + 16; y = r.bottom + 8; }
    else { x = r.right + 10; y = r.top; if (x + pw > innerWidth - m) x = r.left - pw - 10; }
    if (x < m) { x = Math.min(Math.max(m, r.left), innerWidth - pw - m); y = r.bottom + 8; if (y + ph > innerHeight - m) y = r.top - ph - 8; }
    if (x + pw > innerWidth - m) x = innerWidth - pw - m;
    y = Math.max(m, Math.min(y, innerHeight - ph - m));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function hidePop() { clearTimeout(popTimer); popFor = null; pop.hidden = true; }

  // ------------------------------------------------------------ drawer
  let lastFocus = null;
  function linkify(s) {
    return esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function openDrawer(id) {
    const t = byId.get(id);
    if (!t) return;
    hidePop(); closeMenu();
    state.drawer = id;
    const n = now();
    const d = DAYS.find(x => x.date === t.day);
    const fav = favs.has(t.id);
    const nextInRoom = t.plenary ? [] : (byDay.get(t.day) || []).filter(x => !x.plenary && x.rooms[0] === t.rooms[0] && x.s >= t.e).slice(0, 2);
    const sameSpeaker = t.name ? TRACKS_ALL.filter(x => x.id !== t.id && x.name === t.name).slice(0, 3) : [];
    const formats = t.formats.map(f => `<span class="tag">${esc(optLabel('formats', f))}</span>`).join('');
    const levels = t.levels.map(f => `<span class="tag">${esc(optLabel('levels', f))}</span>`).join('');
    const status = isLive(t, n) ? '<span class="pill live">Live now</span>' : isPast(t, n) ? '<span class="muted">· Ended</span>' : '';

    drawer.innerHTML = `
      <div class="dr-bar">
        <button class="icon-btn" data-act="close" aria-label="Close">${I.x}</button>
        <span class="sp"></span>
        <button class="icon-btn" data-act="copy" title="Copy link" aria-label="Copy link">${I.link}</button>
        <a class="icon-btn" href="${ODOO}${esc(t.url)}" target="_blank" rel="noopener" title="Open on odoo.com" aria-label="Open on odoo.com">${I.ext}</a>
      </div>
      <div class="dr-body">
        <div class="dr-kicker">${formats}${levels}${t.langs.map(l => `<span class="tag">${esc(optLabel('langs', l))}</span>`).join('')}</div>
        <h2 class="dr-title">${esc(t.title)}</h2>
        <div class="facts">
          <div class="fact">${I.cal}<span>${esc(d.label)}</span></div>
          <div class="fact">${I.clock}<span>${hhmm(t.s)} – ${hhmm(t.e)} <span class="muted">(${dur(t.e - t.s)})</span> ${status}</span></div>
          <div class="fact">${I.pin}${t.plenary ? '<span>All venues</span>' : t.rooms.map(r => `<button data-filter="rooms:${esc(r)}" title="Show only this room">${esc(r)}</button>`).join(', ')}</div>
        </div>
        <div class="dr-actions">
          ${t.plenary ? '' : `<button class="btn primary ${fav ? 'on' : ''}" data-star="${t.id}">${I.star}${fav ? 'Saved' : 'Save'}</button>`}
          ${t.youtube_id ? `<button class="btn" data-act="watch">${I.play}Watch</button>` : ''}
          <a class="btn" href="${gcalUrl(t)}" target="_blank" rel="noopener">${I.cal}Google Calendar</a>
          <button class="btn" data-act="ics">${I.download}.ics</button>
          <button class="btn" data-act="ask-ai">${I.spark}Ask AI</button>
        </div>
        <div id="video-slot"></div>
        ${t.name ? `<section class="dr-sec"><h4>Speaker</h4><div class="dr-speaker">
            <div class="speaker">${avatar(t, 'lg')}<div class="speaker-txt"><b>${esc(t.name)}</b>${t.speaker_role ? `<span>${esc(t.speaker_role)}</span>` : ''}</div></div>
            ${t.speaker_bio ? `<p>${linkify(t.speaker_bio)}</p>` : ''}</div></section>` : ''}
        ${t.desc ? `<section class="dr-sec"><h4>About this session</h4>${t.desc.split(/\n+/).filter(p => p.trim()).map(p => `<p>${linkify(p)}</p>`).join('')}</section>` : ''}
        ${t.badges.length || t.tracks.length ? `<section class="dr-sec"><h4>Tags</h4>${tagChips(t, 99, true)}</section>` : ''}
        ${sameSpeaker.length ? `<section class="dr-sec"><h4>Also by ${esc(t.name.split(/ from | & |,/)[0])}</h4><div class="mini">${sameSpeaker.map(x => rowHTML(x, n, { time: true })).join('')}</div></section>` : ''}
        ${nextInRoom.length ? `<section class="dr-sec"><h4>Next in ${esc(t.rooms[0])}</h4><div class="mini">${nextInRoom.map(x => rowHTML(x, n, { time: true })).join('')}</div></section>` : ''}
      </div>`;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.hidden = false; scrim.classList.remove('clear');
    lastFocus = document.activeElement;
    $('.dr-body', drawer).scrollTop = 0;
    $('[data-act="close"]', drawer).focus({ preventScroll: true });
  }
  function closeDrawer() {
    if (!state.drawer) return;
    state.drawer = null;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    const v = $('#video-slot', drawer); if (v) v.innerHTML = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ calendar export
  const utcStamp = (day, min) => new Date(`${day}T${hhmm(min)}:00${UTC_OFFSET}`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function gcalUrl(t) {
    const p = new URLSearchParams({
      action: 'TEMPLATE', text: t.title, dates: `${utcStamp(t.day, t.s)}/${utcStamp(t.day, t.e)}`,
      location: `${t.plenary ? 'Brussels Expo' : t.room_str + ', Brussels Expo'}`,
      details: `${t.name ? t.name + '\n\n' : ''}${t.desc.slice(0, 1200)}\n\n${ODOO}${t.url}`,
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  }
  function downloadIcs(items, filename) {
    const e = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const fold = l => l.length <= 74 ? l : l.match(/.{1,73}/g).join('\r\n ');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OXP 2026 Agenda//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Odoo Experience 2026'];
    items.forEach(t => lines.push('BEGIN:VEVENT', `UID:${t.id}@oxp2026`, `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(t.day, t.s)}`, `DTEND:${utcStamp(t.day, t.e)}`, `SUMMARY:${e(t.title)}`,
      `LOCATION:${e((t.plenary ? '' : t.room_str + ', ') + 'Brussels Expo')}`,
      `DESCRIPTION:${e((t.name ? t.name + '\n\n' : '') + t.desc.slice(0, 1500))}`, `URL:${ODOO}${t.url}`, 'END:VEVENT'));
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.map(fold).join('\r\n')], { type: 'text/calendar' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------------------ actions
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function toggleFav(id) {
    const t = byId.get(id);
    if (favs.has(id)) { favs.delete(id); toast('Removed from your schedule'); }
    else {
      favs.add(id);
      const clash = TRACKS_ALL.find(x => x.id !== id && favs.has(x.id) && x.day === t.day && x.s < t.e && t.s < x.e);
      const short = clash && (clash.title.length > 42 ? clash.title.slice(0, 40).trimEnd() + '…' : clash.title);
      toast(clash ? `Saved · overlaps “${short}”` : 'Saved to your schedule');
    }
    saveFavs();
    render();
    chat.refresh();
    if (state.drawer === id) openDrawer(id);
  }

  function setDay(d) {
    if (state.view === 'mine') state.view = lastView;
    state.day = d; state.upcoming = state.upcoming && d === now().date;
    scrollPending = true; closeMenu(); render();
  }
  let lastView = 'grid';
  function setView(v) {
    if (v !== 'mine') lastView = v;
    state.view = v; scrollPending = true; closeMenu(); render();
  }
  function clearAll() {
    for (const k in FACETS) state[k].clear();
    for (const k in FLAGS) state[k] = false;
    state.q = ''; qInput.value = '';
    render();
  }
  function applyFilter(spec) {
    const i = spec.indexOf(':');
    const k = spec.slice(0, i), v = spec.slice(i + 1);
    closeDrawer();
    state[k] = new Set([v]);
    if (state.view === 'mine') state.view = lastView;
    render();
    toast(`Filtered by ${optLabel(k, v)}`);
  }

  // ------------------------------------------------------------ events
  document.addEventListener('click', e => {
    const tg = e.target;
    const star = tg.closest('[data-star]');
    if (star) { e.stopPropagation(); return toggleFav(star.dataset.star); }

    const act = tg.closest('[data-act]')?.dataset.act;
    if (act) {
      if (act === 'clear') return clearAll();
      if (act === 'now') return scrollToNow(false);
      if (act === 'close') return closeDrawer();
      if (act === 'menu-close') return closeMenu();
      if (act === 'menu-clear') { state[state.menu].clear(); return render(); }
      if (act === 'ics') { const t = byId.get(state.drawer); return downloadIcs([t], `${t.title.replace(/[^\w]+/g, '_').slice(0, 50)}.ics`); }
      if (act === 'ics-mine') return downloadIcs(TRACKS_ALL.filter(t => favs.has(t.id)), 'My_OXP_2026.ics');
      if (act === 'clear-favs') { if (confirm('Remove all saved sessions?')) { favs.clear(); saveFavs(); render(); chat.refresh(); } return; }
      if (act === 'copy') {
        const t = byId.get(state.drawer);
        navigator.clipboard?.writeText(ODOO + t.url).then(() => toast('Link copied'), () => toast('Could not copy'));
        return;
      }
      if (act === 'ask-ai') {
        const t = byId.get(state.drawer);
        closeDrawer();
        return chat.ask(`Tell me about [[s${t.idx}]]: what will I learn, who is it for, and which similar sessions should I also consider?`);
      }
      if (act === 'watch') {
        const t = byId.get(state.drawer);
        $('#video-slot', drawer).innerHTML = `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.youtube_id)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Video"></iframe></div>`;
        tg.closest('[data-act]').remove();
        return;
      }
    }

    const filt = tg.closest('[data-filter]');
    if (filt) return applyFilter(filt.dataset.filter);

    const opt = tg.closest('[data-opt]');
    if (opt && state.menu) {
      const s = state[state.menu], v = opt.dataset.opt;
      s.has(v) ? s.delete(v) : s.add(v);
      return render();
    }
    const grp = tg.closest('[data-group]');
    if (grp && state.menu) {
      const members = facetOptions(state.menu).filter(o => o.group === grp.dataset.group).map(o => o.v);
      const s = state[state.menu];
      const all = members.every(v => s.has(v));
      members.forEach(v => (all ? s.delete(v) : s.add(v)));
      return render();
    }

    const fb = tg.closest('[data-facet]');
    if (fb) return openMenu(fb.dataset.facet, fb);
    const flag = tg.closest('[data-flag]');
    if (flag) { state[flag.dataset.flag] = !state[flag.dataset.flag]; return render(); }

    const day = tg.closest('[data-day]');
    if (day) return setDay(day.dataset.day);
    const view = tg.closest('[data-view]');
    if (view) return setView(view.dataset.view);

    const room = tg.closest('[data-room]');
    if (room) {
      const r = room.dataset.room;
      state.rooms = state.rooms.size === 1 && state.rooms.has(r) ? new Set() : new Set([r]);
      return render();
    }

    const card = tg.closest('[data-id]');
    if (card && !tg.closest('a')) return openDrawer(card.dataset.id);
  });

  document.addEventListener('pointerdown', e => {
    if (state.menu && !menu.contains(e.target) && !e.target.closest('[data-facet]')) closeMenu();
  });
  scrim.addEventListener('click', () => { closeMenu(); closeDrawer(); });

  const hoverZones = [main, $('#chat-log')];
  hoverZones.forEach(zone => zone.addEventListener('mouseover', e => {
    if (!canHover()) return;
    const el = e.target.closest('[data-id]');
    if (!el || el === popFor) return;
    popFor = el; clearTimeout(popTimer);
    const x = e.clientX;
    popTimer = setTimeout(() => showPop(el, { clientX: x }), pop.hidden ? 280 : 60);
  }));
  hoverZones.forEach(zone => {
    zone.addEventListener('mouseout', e => {
      const el = e.target.closest('[data-id]');
      if (el && !el.contains(e.relatedTarget)) { clearTimeout(popTimer); popFor = null; pop.hidden = true; }
    });
    zone.addEventListener('scroll', hidePop, { passive: true });
  });

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (e.key === 'Escape') {
      if (state.menu) return closeMenu();
      if (state.drawer) return closeDrawer();
      if (chat.isOpen() && (!typing || e.target.id === 'chat-input')) return chat.close();
      if (typing) { document.activeElement.blur(); if (document.activeElement === qInput || e.target === qInput) { state.q = ''; qInput.value = ''; render(); } return; }
      return;
    }
    if (e.key === 'Enter' && e.target.matches?.('[data-id]')) return openDrawer(e.target.dataset.id);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); qInput.focus(); qInput.select(); return; }
    const k = e.key.toLowerCase();
    if (/^[1-9]$/.test(k) && DAYS[+k - 1]) return setDay(DAYS[+k - 1].date);
    if (k === 'g' || k === 't') return setView('grid');
    if (k === 'l') return setView('list');
    if (k === 's' || k === 'm') return setView('mine');
    if (k === 'd') return toggleTheme();
    if (k === 'a') { e.preventDefault(); return chat.open(); }
    if (k === 'n') return scrollToNow(false);
    if (k === 'arrowleft' || k === 'arrowright') {
      if (state.drawer || state.view === 'mine') return;
      const i = DAYS.findIndex(d => d.date === state.day) + (k === 'arrowleft' ? -1 : 1);
      if (DAYS[i]) setDay(DAYS[i].date);
    }
  });

  let qTimer;
  qInput.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = qInput.value; render(); }, 90);
  });
  menu.addEventListener('input', e => {
    if (e.target.id === 'menu-q') { state.menuQ = e.target.value; renderMenu(); }
  });

  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.classList.contains('avatar')) {
      const s = document.createElement('span');
      s.className = img.className; s.textContent = img.dataset.initials || '?';
      img.replaceWith(s);
    }
  }, true);

  function toggleTheme() {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set(LS_THEME, next);
    renderTheme();
  }
  $('#theme').addEventListener('click', toggleTheme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', renderTheme);
  addEventListener('hashchange', () => {
    readHash(); qInput.value = state.q;
    if (state.view !== 'mine') lastView = state.view;
    scrollPending = true; render();
  });
  addEventListener('resize', () => { hidePop(); if (state.menu && !isPhone()) closeMenu(); });

  // Keep "live" state and the now-line fresh.
  setInterval(() => { if (now().date === state.day && !state.menu) render(); }, 60_000);


  // ------------------------------------------------------------ AI assistant (Gemini via server.py)
  const chat = (() => {
    const LS_CHAT = 'oxp_chat_2026';
    const el = $('#chat'), log = $('#chat-log'), form = $('#chat-form'), input = $('#chat-input'), sendBtn = $('#chat-send');
    let msgs = [];
    let busy = null; // AbortController while streaming
    let aiOk = null;
    try { msgs = JSON.parse(sessionStorage.getItem(LS_CHAT) || '[]'); } catch (e) { msgs = []; }
    const persist = () => { try { sessionStorage.setItem(LS_CHAT, JSON.stringify(msgs.filter(m => !m.error).slice(-40))); } catch (e) { /* ignore */ } };

    const REF_RE = /\[\[\s*(s\d+(?:\s*[,;]\s*s\d+)*)\s*\]\]/g;

    function refCard(ref) {
      const t = byRef.get(ref);
      if (!t) return `<span class="ref bad">${esc(ref)}</span>`;
      const d = DAYS.find(x => x.date === t.day);
      return `<span class="ref${isPast(t) ? ' is-past' : ''}" role="button" tabindex="0" data-id="${t.id}" style="${hueStyle(t)}">
        <span class="bar"></span><span class="ref-main"><span class="ref-title">${esc(t.title)}</span>
        <span class="ref-meta">${esc(d.short_label.replace(' Sep', ''))} · ${hhmm(t.s)}–${hhmm(t.e)} · ${t.plenary ? 'All venues' : esc(t.room_str)}${t.youtube_id ? ' · ▶ video' : ''}</span></span>
        ${t.plenary ? '' : starBtn(t)}</span>`;
    }

    // Minimal, safe Markdown: escape first, then bold/italic/code, lists, headings, paragraphs, session refs.
    function inline(text) {
      return esc(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
        .replace(REF_RE, (_, refs) => refs.split(/\s*[,;]\s*/).map(refCard).join(''));
    }
    function md(src, streaming) {
      if (streaming) src = src.replace(/\[\[[^\]]*$/, '');
      const out = [];
      let list = null, para = [];
      const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
      const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
      for (const raw of src.split('\n')) {
        const line = raw.trimEnd();
        let m;
        if (!line.trim()) { flushPara(); flushList(); continue; }
        if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushPara(); flushList(); continue; }
        if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
        if ((m = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/))) {
          flushPara();
          const tag = m[1] ? 'ol' : 'ul';
          if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
          list.items.push(m[2].replace(/^((?:\*\*)?\[\[[^\]]+\]\](?:\*\*)?)\s*[—–:-]+\s*/, '$1 '));
          continue;
        }
        if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
        flushList(); para.push(line);
      }
      flushPara(); flushList();
      return out.join('');
    }

    const refsIn = text => [...new Set([...String(text).matchAll(REF_RE)].flatMap(m => m[1].split(/\s*[,;]\s*/)))].filter(r => byRef.has(r) && !byRef.get(r).plenary);

    function suggestions() {
      const n = now();
      const live = DAYS.some(d => d.date === n.date);
      const s = [];
      if (live) s.push("What's worth seeing in the next hour?");
      s.push('Plan my Friday around AI and developer talks, no overlaps');
      s.push('Best beginner-friendly accounting sessions?');
      s.push('Which talks are about Odoo 20 new features?');
      if (favs.size) s.push('Review my saved schedule: any clashes or gaps?');
      s.push('Quelles sessions sont en français ?');
      return s.slice(0, 5);
    }

    function render(streaming = false) {
      if (!DATA) return;
      if (!msgs.length) {
        log.innerHTML = `<div class="chat-empty"><h3>Ask me about the agenda</h3>
          <p>I know every session, speaker and room across all five days, plus what you've saved. ${aiOk === false ? '<br><strong>AI is offline:</strong> start the app with <code>./start.sh</code> and a <code>GEMINI_API_KEY</code>.' : ''}</p>
          <div class="sugs">${suggestions().map(q => `<button class="sug" type="button" data-sug="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
        return;
      }
      log.innerHTML = msgs.map((m, i) => {
        if (m.error) return `<div class="msg err"><span>${esc(m.content)}</span><button class="btn" type="button" data-chat="retry">Retry</button></div>`;
        if (m.role === 'user') return `<div class="msg user">${md(m.content)}</div>`;
        const last = i === msgs.length - 1;
        if (!m.content && streaming && last) return '<div class="msg ai"><span class="typing"><i></i><i></i><i></i></span></div>';
        const refs = !(streaming && last) ? refsIn(m.content) : [];
        const unsaved = refs.filter(r => !favs.has(byRef.get(r).id));
        const actions = !(streaming && last) ? `<div class="msg-actions">
            ${refs.length > 1 && unsaved.length ? `<button class="btn" type="button" data-chat="save-all" data-i="${i}">${I.star}Save ${unsaved.length === refs.length ? 'all ' : ''}${unsaved.length}</button>` : ''}
            <button class="btn ghost" type="button" data-chat="copy" data-i="${i}">${I.copy}Copy</button></div>` : '';
        return `<div class="msg ai">${md(m.content, streaming && last)}${actions}</div>`;
      }).join('');
    }
    const scrollDown = () => { log.scrollTop = log.scrollHeight; };

    function context() {
      const n = now();
      const d = DAYS.find(x => x.date === state.day);
      const saved = TRACKS_ALL.filter(t => favs.has(t.id)).map(t => 's' + t.idx);
      const filters = Object.keys(FACETS).filter(k => state[k].size).map(k => `${FACETS[k].label}: ${[...state[k]].map(v => optLabel(k, v)).join(', ')}`);
      const open = state.drawer && byId.get(state.drawer);
      return [
        `Now (Brussels): ${n.date} ${hhmm(n.min)}`,
        `Viewing: ${d ? d.label : state.day} (${state.view === 'mine' ? 'saved schedule' : state.view === 'grid' ? 'timetable' : 'list'})`,
        filters.length ? `Active filters: ${filters.join('; ')}` : '',
        state.q ? `Search box: "${state.q}"` : '',
        `Saved sessions (${saved.length}): ${saved.slice(0, 80).join(', ') || 'none'}`,
        open ? `Open session: s${open.idx}` : '',
      ].filter(Boolean).join('\n');
    }

    function setBusy(ctrl) {
      busy = ctrl;
      sendBtn.classList.toggle('stop', !!ctrl);
      sendBtn.innerHTML = ctrl ? I.stop : I.send;
      sendBtn.setAttribute('aria-label', ctrl ? 'Stop' : 'Send');
    }

    async function send(text) {
      text = String(text || '').trim();
      if (!text || busy) return;
      msgs = msgs.filter(m => !m.error);
      msgs.push({ role: 'user', content: text });
      const reply = { role: 'assistant', content: '' };
      msgs.push(reply);
      render(true); scrollDown();
      const ctrl = new AbortController();
      setBusy(ctrl);
      let raf = 0;
      const paint = () => { raf = 0; const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80; render(true); if (stick) scrollDown(); };
      try {
        const res = await fetch('api/chat', {
          method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: msgs.slice(0, -1).map(({ role, content }) => ({ role, content })), context: context() }),
        });
        if (!res.ok || !res.body) {
          let msg = `Assistant unavailable (HTTP ${res.status}).`;
          try { msg = (await res.json()).error || msg; } catch (e) { if (res.status === 404 || res.status === 501) msg = 'The AI backend is not running. Start the app with ./start.sh (it needs GEMINI_API_KEY).'; }
          throw new Error(msg);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let cut;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const evt = buf.slice(0, cut); buf = buf.slice(cut + 2);
            const line = evt.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            const data = JSON.parse(line.slice(5));
            if (data.error) throw new Error(data.error);
            if (data.t) { reply.content += data.t; if (!raf) raf = requestAnimationFrame(paint); }
          }
        }
        if (!reply.content.trim()) throw new Error('The assistant returned an empty answer.');
      } catch (err) {
        if (err.name === 'AbortError') {
          if (!reply.content) msgs.pop();
        } else {
          if (!reply.content) msgs.pop();
          msgs.push({ role: 'assistant', error: true, content: err.message || String(err) });
        }
      } finally {
        cancelAnimationFrame(raf);
        setBusy(null);
        persist();
        render(); scrollDown();
      }
    }

    function open(prefill) {
      el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('chat-open');
      hidePop(); closeMenu();
      render(); scrollDown();
      if (prefill != null) input.value = prefill;
      autosize();
      if (!isPhone() || prefill != null) setTimeout(() => input.focus({ preventScroll: true }), 60);
    }
    function close() {
      el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('chat-open');
      input.blur();
    }
    function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (busy) { busy.abort(); return; }
      const v = input.value; input.value = ''; autosize();
      send(v);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    input.addEventListener('input', autosize);
    $('#ai-fab').addEventListener('click', () => open());
    el.addEventListener('click', e => {
      const sug = e.target.closest('[data-sug]');
      if (sug) return send(sug.dataset.sug);
      const b = e.target.closest('[data-chat]');
      if (!b) return;
      const a = b.dataset.chat;
      if (a === 'close') close();
      if (a === 'reset') { if (busy) busy.abort(); msgs = []; persist(); render(); input.focus(); }
      if (a === 'retry') {
        msgs = msgs.filter(m => !m.error);
        const lastUser = msgs.map(m => m.role).lastIndexOf('user');
        if (lastUser >= 0) { const q = msgs[lastUser].content; msgs = msgs.slice(0, lastUser); send(q); }
      }
      if (a === 'copy') {
        const m = msgs[+b.dataset.i];
        const txt = m.content.replace(REF_RE, (_, refs) => refs.split(/\s*[,;]\s*/).map(r => { const t = byRef.get(r); return t ? `“${t.title}” (${t.short_label} ${t.start_time}, ${t.room_str})` : r; }).join(', '));
        navigator.clipboard?.writeText(txt).then(() => toast('Copied'), () => toast('Could not copy'));
      }
      if (a === 'save-all') {
        const refs = refsIn(msgs[+b.dataset.i].content);
        refs.forEach(r => favs.add(byRef.get(r).id));
        saveFavs(); render(); renderMain(); toast(`Saved ${refs.length} sessions`);
      }
    });
    log.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('.ref[data-id]')) openDrawer(e.target.dataset.id);
    });

    fetch('api/health').then(r => r.ok ? r.json() : null).then(h => {
      aiOk = !!(h && h.ai);
      $('#chat-model').textContent = aiOk ? `Gemini · knows all ${TRACKS_ALL ? TRACKS_ALL.length : 484} sessions` : 'AI backend offline';
      if (!msgs.length) render();
    }).catch(() => { aiOk = false; $('#chat-model').textContent = 'AI backend offline'; });

    return {
      open, close, isOpen: () => el.classList.contains('open'),
      ask(q) { open(); send(q); },
      refresh() { if (el.classList.contains('open') && !busy) render(); },
    };
  })();
  const renderMain = () => render();

  // ------------------------------------------------------------ boot
  async function boot() {
    renderTheme();
    main.innerHTML = '<div class="empty"><div><p>Loading agenda…</p></div></div>';
    const raw = await (await fetch('data/agenda.json')).json();
    prepare(raw);
    loadFavs();
    readHash();
    const n = now();
    if (!state.day) {
      const today = DAYS.find(d => d.date === n.date);
      state.day = today ? today.date : (DAYS.find(d => !d.is_masterclass && d.date > n.date) || DAYS.find(d => !d.is_masterclass) || DAYS[0]).date;
    }
    if (!state.view) state.view = isPhone() ? 'list' : 'grid';
    if (state.view !== 'mine') lastView = state.view;
    qInput.value = state.q;
    render();
  }
  boot();
})();
