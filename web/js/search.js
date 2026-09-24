// Semantic search: asks the server which talks are *about* the query (embeddings);
// rank.js blends those scores with keyword matching.

import { emit } from './lib/bus.js';

const DEBOUNCE_MS = 350;
const MIN_LENGTH = 3;

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

/** ref -> z-score of talks related by meaning, only when the server trusts the query. */
export function semanticScores() {
  return new Map(semantic.confident ? semantic.results.map(r => [r.ref, r.z]) : []);
}

export function initSearch(health) {
  semantic.available = health.semantic !== false;
}
