// Semantic search: asks the server which talks are *about* the query (embeddings),
// so results can widen beyond exact keyword matches.

import { db } from './agenda.js';
import { emit } from './lib/bus.js';
import { passes } from './state.js';

const DEBOUNCE_MS = 350;
const MIN_LENGTH = 3;
const MIN_Z = 3.0; // how far above the query's average similarity a talk must stand out

export const semantic = { available: null, query: '', loading: false, confident: false, results: [] };

const cache = new Map();
let timer = null;

function apply(query, data) {
  Object.assign(semantic, { query, loading: false, confident: !!data.confident, results: data.results || [] });
}

/** Kick off (debounced) semantic lookup for the current search box value. */
export function requestSemantic(raw) {
  const query = String(raw || '').trim();
  clearTimeout(timer);
  if (semantic.available === false || query.length < MIN_LENGTH) {
    apply(query, {});
    return;
  }
  const key = query.toLowerCase();
  if (cache.has(key)) {
    apply(query, cache.get(key));
    return;
  }
  Object.assign(semantic, { query, loading: true, confident: false, results: [] });
  timer = setTimeout(async () => {
    let data = {};
    try {
      const res = await fetch(`api/search?q=${encodeURIComponent(query)}&k=40`);
      data = res.ok ? await res.json() : {};
      if (data.semantic === false) semantic.available = false;
      else cache.set(key, data);
    } catch {
      /* offline or static hosting: keyword search still works */
    }
    if (semantic.query === query) {
      apply(query, data);
      emit('change');
    }
  }, DEBOUNCE_MS);
}

/**
 * Talks related by meaning to the current query that aren't already shown,
 * still honouring the non-search filters (language, track, room…).
 */
export function relatedSessions(exclude, n, limit = 12) {
  if (!semantic.confident) return [];
  return semantic.results
    .filter(r => r.z >= MIN_Z)
    .map(r => db.byRef.get(r.ref))
    .filter(t => t && !exclude.has(t.id) && passes(t, null, [], n))
    .slice(0, limit);
}

export function initSearch(health) {
  semantic.available = health.semantic !== false;
}
