// Entry point: render loop, user actions, event wiring and boot.

import { db, load } from './agenda.js';
import { downloadIcs } from './calendar.js';
import * as chat from './chat/panel.js';
import { health } from './chat/client.js';
import { initSearch, requestSemantic } from './search.js';
import { emit, on } from './lib/bus.js';
import { $, isPhone, isTyping } from './lib/dom.js';
import { esc } from './lib/html.js';
import { now, setNow } from './lib/time.js';
import {
  clearFilters, dayCounts, defaultDay, favs, loadFavs, passes, queryTerms, readHash, saveFavs, state, writeHash,
} from './state.js';
import { optLabel } from './taxonomy.js';
import { bindTheme, renderActiveBar, renderControls, renderDays, renderTheme, renderViews } from './ui/chrome.js';
import { closeDrawer, drawerAction, openDrawer, openSession, refreshDrawer } from './ui/drawer.js';
import { bindMenu, closeMenu, openMenu, renderMenu, toggleChip, toggleRoomGroup } from './ui/menu.js';
import { bindHover, hidePop } from './ui/popover.js';
import { toast } from './ui/toast.js';
import { renderList } from './views/list.js';
import { renderResults } from './views/results.js';
import { emptyState } from './views/parts.js';
import { renderSaved } from './views/saved.js';
import { anchorMinute, renderTimetable } from './views/timetable.js';
import { capture, play } from './lib/flip.js';

const main = $('#main');
const search = $('#q');

// ---------------------------------------------------------------- render
function renderMain(n) {
  if (state.view === 'mine') return renderSaved(n);
  const dayList = db.byDay.get(state.day) || [];
  const terms = queryTerms();
  const visible = dayList.filter(t => passes(t, null, terms, n));
  if (state.q.trim()) {
    // Searching: the timetable stays while the day has hits; otherwise results widen automatically.
    const hits = visible.some(t => !t.plenary);
    // (On phones results are always a list: matches would be scattered across the rotated grid.)
    const grid = state.view === 'grid' && hits && !isPhone();
    return grid ? renderTimetable(visible, dayList, n) : renderResults(n);
  }
  const html = state.view === 'grid' ? renderTimetable(visible, dayList, n, { horizontal: isPhone() }) : renderList(visible, n);
  return html || emptyState(n);
}

function render() {
  const n = now();
  hidePop();
  renderDays();
  renderViews();
  renderControls();
  $('#search-btn').classList.toggle('on', !!state.q.trim());
  renderActiveBar(dayCounts());
  // Filter changes animate: surviving tiles slide into place, new ones fade in.
  const before = state.animate && !state.scrollPending ? capture(main) : null;
  state.animate = false;
  main.innerHTML = renderMain(n);
  play(main, before);
  if (state.menu) renderMenu();
  if (state.scrollPending) {
    state.scrollPending = false;
    requestAnimationFrame(() => scrollToNow(true));
  }
  writeHash();
}

/** Scroll to "now": the current time on today, the same time of day on other days. */
function scrollToNow(instant = false) {
  const behavior = instant ? 'auto' : 'smooth';
  const box = main.getBoundingClientRect();
  const to = (el, { dx = 0, dy = 0 } = {}) => {
    const r = el.getBoundingClientRect();
    main.scrollTo({
      top: dy == null ? main.scrollTop : Math.max(0, main.scrollTop + r.top - box.top - dy),
      left: dx == null ? main.scrollLeft : Math.max(0, main.scrollLeft + r.left - box.left - dx),
      behavior,
    });
  };
  const anchor = $('.tt-anchor', main);
  if (state.view === 'mine' || state.q.trim()) return main.scrollTo({ top: 0, left: 0, behavior });
  if (anchor) return anchor.classList.contains('h') ? to(anchor, { dx: 48, dy: null }) : to(anchor, { dx: null, dy: 110 });
  const minute = anchorMinute(db.byDay.get(state.day) || [], now());
  const slots = [...main.querySelectorAll('.slot')];
  // Today: what's live; other days: the talks running at this time of day.
  const slot = $('.slot[data-live]', main) || slots.findLast(s => +s.dataset.slot <= minute) || slots[0];
  if (slot) to(slot, { dx: null, dy: 6 });
}

// ---------------------------------------------------------------- actions
function toggleFav(id) {
  const t = db.byId.get(id);
  if (favs.delete(id)) {
    toast('Removed from your schedule');
  } else {
    favs.add(id);
    const clash = db.sessions.find(x => x.id !== id && favs.has(x.id) && x.day === t.day && x.s < t.e && t.s < x.e);
    const title = clash && (clash.title.length > 42 ? `${clash.title.slice(0, 40).trimEnd()}…` : clash.title);
    toast(clash ? `Saved · overlaps “${title}”` : 'Saved to your schedule');
  }
  saveFavs();
  emit('favs');
  render();
}

function setDay(date) {
  if (state.view === 'mine') state.view = state.lastView;
  state.day = date;
  state.upcoming &&= date === now().date;
  state.scrollPending = true;
  closeMenu();
  render();
}

function setView(view) {
  if (view !== 'mine') state.lastView = view;
  state.view = view;
  state.scrollPending = true;
  closeMenu();
  render();
}

function clearAll() {
  clearFilters();
  state.animate = true;
  search.value = '';
  requestSemantic('');
  render();
}

function applyFilter(spec) {
  const [facet, ...rest] = spec.split(':');
  const value = rest.join(':');
  closeDrawer();
  state[facet] = new Set([value]);
  state.animate = true;
  if (state.view === 'mine') state.view = state.lastView;
  render();
  toast(`Filtered by ${optLabel(facet, value)}`);
}

function focusRoom(room) {
  state.rooms = state.rooms.size === 1 && state.rooms.has(room) ? new Set() : new Set([room]);
  state.animate = true;
  render();
}

function clearFavs() {
  if (!confirm('Remove all saved sessions?')) return;
  favs.clear();
  saveFavs();
  emit('favs');
  render();
}

function askAbout(t) {
  closeDrawer();
  chat.ask(`Tell me about [[${t.ref}]]: what will I learn, who is it for, and which similar sessions should I also consider?`);
}

const ACTIONS = {
  clear: clearAll,
  'menu-close': closeMenu,
  'clear-filters': () => {
    const lang = state.langs;
    clearFilters();
    state.langs = lang; // Reset in the Filters panel keeps the language flags
    state.q = search.value;
    render();
  },
  'ics-mine': () => downloadIcs(db.sessions.filter(t => favs.has(t.id)), 'My_OXP_2026.ics'),
  'clear-favs': clearFavs,
  'ask-ai': () => openSession() && askAbout(openSession()),
  'ask-q': () => chat.ask(`Which talks are about “${state.q}”? Include close alternatives.`),
};

// ---------------------------------------------------------------- events
/** One delegated click handler; the first matching data-attribute wins. */
function onClick(e) {
  const target = e.target;
  const hit = attr => target.closest(`[${attr}]`);
  let el;

  if ((el = hit('data-star'))) return toggleFav(el.dataset.star);
  if ((el = hit('data-act'))) {
    const act = el.dataset.act;
    if (drawerAction(act, target)) return;
    return ACTIONS[act]?.();
  }
  if ((el = hit('data-filter'))) return applyFilter(el.dataset.filter);
  if ((el = hit('data-chip'))) return toggleChip(el.dataset.chip);
  if ((el = hit('data-group'))) return toggleRoomGroup(el.dataset.group);
  if ((el = hit('data-menu'))) return openMenu(el.dataset.menu, el);
  if ((el = hit('data-flag'))) {
    state[el.dataset.flag] = !state[el.dataset.flag];
    state.animate = true;
    return render();
  }
  if ((el = hit('data-day'))) return setDay(el.dataset.day);
  if ((el = hit('data-view'))) return setView(el.dataset.view);
  if ((el = hit('data-room'))) return focusRoom(el.dataset.room);
  if ((el = hit('data-id')) && !target.closest('a')) return openDrawer(el.dataset.id);
}

function onEscape(e) {
  if (state.menu) return closeMenu();
  if (state.drawer) return closeDrawer();
  if (chat.isOpen() && (!isTyping() || e.target.id === 'chat-input')) return chat.close();
  if (e.target === search) {
    search.value = '';
    state.q = '';
    requestSemantic('');
    document.body.classList.remove('searching');
    render();
  }
  if (isTyping()) document.activeElement.blur();
}

const KEYS = {
  '/': () => {
    search.focus();
    search.select();
  },
  g: () => setView('grid'),
  t: () => setView('grid'),
  l: () => setView('list'),
  s: () => setView('mine'),
  m: () => setView('mine'),
  a: () => chat.open(),
  f: () => openMenu('filters'),
  d: () => $('#theme').click(),
  arrowleft: () => stepDay(-1),
  arrowright: () => stepDay(1),
};

function stepDay(delta) {
  if (state.drawer || state.view === 'mine') return;
  const next = db.days[db.days.findIndex(d => d.date === state.day) + delta];
  if (next) setDay(next.date);
}

function onKeydown(e) {
  if (e.key === 'Escape') return onEscape(e);
  if (e.key === 'Enter' && e.target.matches?.('[data-id]')) return openDrawer(e.target.dataset.id);
  if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (/^[1-9]$/.test(key) && db.days[+key - 1]) return setDay(db.days[+key - 1].date);
  if (KEYS[key]) {
    e.preventDefault();
    KEYS[key]();
  }
}

/** Broken speaker photos fall back to initials. */
function onImageError(e) {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.classList.contains('avatar')) return;
  const fallback = document.createElement('span');
  fallback.className = img.className;
  fallback.textContent = img.dataset.initials || '?';
  img.replaceWith(fallback);
}

function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('error', onImageError, true);
  $('#scrim').addEventListener('click', () => {
    closeMenu();
    closeDrawer();
  });
  bindHover(main);
  bindMenu();
  bindTheme();

  // Phones: the search field opens from an icon and overlays the header row.
  $('#search-btn').addEventListener('click', () => {
    document.body.classList.add('searching');
    search.focus();
  });
  $('#search-close').addEventListener('click', e => {
    e.preventDefault(); // clears the search and closes the field
    document.body.classList.remove('searching');
    search.value = '';
    state.q = '';
    requestSemantic('');
    search.blur();
    render();
  });

  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = search.value;
      state.animate = true;
      requestSemantic(state.q);
      render();
    }, 90);
  });

  addEventListener('hashchange', () => {
    readHash();
    search.value = state.q;
    requestSemantic(state.q);
    state.scrollPending = true;
    render();
  });
  let phone = isPhone();
  addEventListener('resize', () => {
    hidePop();
    if (state.menu && !isPhone()) closeMenu();
    if (phone !== isPhone()) {
      phone = isPhone(); // timetable rotates on phones
      render();
    }
  });
  // Keep the "live" state and the now-line fresh during the event.
  setInterval(() => {
    if (now().date === state.day && !state.menu) render();
  }, 60_000);

  on('change', render);
  on('favs', () => {
    chat.refresh();
    refreshDrawer();
  });
}

// ---------------------------------------------------------------- boot
async function boot() {
  setNow(new URLSearchParams(location.search).get('now')); // e.g. ?now=2026-09-24T14:10
  renderTheme();
  main.innerHTML = '<div class="empty"><div><p>Loading agenda…</p></div></div>';
  try {
    await load();
  } catch (err) {
    main.innerHTML = `<div class="empty"><div><h3>Couldn't load the agenda</h3><p>${esc(err.message)}</p></div></div>`;
    return;
  }
  loadFavs();
  readHash();
  state.day ||= defaultDay();
  state.view ||= isPhone() ? 'list' : 'grid';
  if (state.view !== 'mine') state.lastView = state.view;
  search.value = state.q;
  bindEvents();
  initSearch(await health());
  requestSemantic(state.q);
  render();
  chat.initChat();
}

boot();
