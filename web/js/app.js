// Entry point: render loop, user actions, event wiring and boot.

import { db, load } from './agenda.js';
import { downloadIcs } from './calendar.js';
import * as chat from './chat/panel.js';
import { emit, on } from './lib/bus.js';
import { $, isPhone, isTyping } from './lib/dom.js';
import { esc } from './lib/html.js';
import { now, setNow } from './lib/time.js';
import {
  clearFilters, dayCounts, defaultDay, favs, loadFavs, passes, queryTerms, readHash, saveFavs, state, writeHash,
} from './state.js';
import { optLabel } from './taxonomy.js';
import { bindTheme, renderDays, renderFilterbar, renderTheme, renderViews } from './ui/chrome.js';
import { closeDrawer, drawerAction, openDrawer, openSession, refreshDrawer } from './ui/drawer.js';
import { bindMenu, closeMenu, openMenu, renderMenu, toggleGroup, toggleOption } from './ui/menu.js';
import { bindHover, hidePop } from './ui/popover.js';
import { toast } from './ui/toast.js';
import { renderList } from './views/list.js';
import { emptyState } from './views/parts.js';
import { renderSaved } from './views/saved.js';
import { renderTimetable } from './views/timetable.js';

const main = $('#main');
const search = $('#q');

// ---------------------------------------------------------------- render
function renderMain(n) {
  if (state.view === 'mine') return renderSaved(n);
  const dayList = db.byDay.get(state.day) || [];
  const terms = queryTerms();
  const visible = dayList.filter(t => passes(t, null, terms, n));
  const html = state.view === 'grid' ? renderTimetable(visible, dayList, n) : renderList(visible, n);
  return html || emptyState(n);
}

function render() {
  const n = now();
  hidePop();
  renderDays();
  renderViews();
  renderFilterbar(dayCounts());
  main.innerHTML = renderMain(n);
  if (state.menu) renderMenu();
  if (state.scrollPending) {
    state.scrollPending = false;
    requestAnimationFrame(() => scrollToNow(true));
  }
  writeHash();
}

function scrollToNow(instant = false) {
  const behavior = instant ? 'auto' : 'smooth';
  if (state.view === 'mine' || state.day !== now().date) {
    if (instant) main.scrollTo({ top: 0, left: 0 });
    return;
  }
  const target = state.view === 'grid'
    ? $('.now-line', main)
    : $('.slot[data-live]', main) || $('.slot:not([data-past])', main);
  if (target) main.scrollTo({ top: Math.max(0, target.offsetTop - (state.view === 'grid' ? 110 : 6)), behavior });
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
  search.value = '';
  render();
}

function applyFilter(spec) {
  const [facet, ...rest] = spec.split(':');
  const value = rest.join(':');
  closeDrawer();
  state[facet] = new Set([value]);
  if (state.view === 'mine') state.view = state.lastView;
  render();
  toast(`Filtered by ${optLabel(facet, value)}`);
}

function focusRoom(room) {
  state.rooms = state.rooms.size === 1 && state.rooms.has(room) ? new Set() : new Set([room]);
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
  now: () => scrollToNow(),
  'menu-close': closeMenu,
  'menu-clear': () => {
    state[state.menu].clear();
    render();
  },
  'ics-mine': () => downloadIcs(db.sessions.filter(t => favs.has(t.id)), 'My_OXP_2026.ics'),
  'clear-favs': clearFavs,
  'ask-ai': () => openSession() && askAbout(openSession()),
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
  if (state.menu && (el = hit('data-opt'))) return toggleOption(el.dataset.opt);
  if (state.menu && (el = hit('data-group'))) return toggleGroup(el.dataset.group);
  if ((el = hit('data-facet'))) return openMenu(el.dataset.facet, el);
  if ((el = hit('data-flag'))) {
    state[el.dataset.flag] = !state[el.dataset.flag];
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
  n: () => scrollToNow(),
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

  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = search.value;
      render();
    }, 90);
  });

  addEventListener('hashchange', () => {
    readHash();
    search.value = state.q;
    state.scrollPending = true;
    render();
  });
  addEventListener('resize', () => {
    hidePop();
    if (state.menu && !isPhone()) closeMenu();
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
  render();
  chat.initChat();
}

boot();
