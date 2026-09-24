// Search ranking: finds and orders talks for a query. Pure, so it's unit-tested.
//
// - Each query word is scored by the best field it hits: title > speaker > topic/tags > room > abstract,
//   more when it matches at a word start, less mid-word, and a little for a one-letter typo.
// - Filler words ("how", "the", "de", "pour"…) are ignored unless the query is only filler.
// - A talk must match at least half of the meaningful words (more = higher); the phrase in the title is a bonus.
// - Semantic similarity (from the server's embeddings) is blended in, so talks matching both
//   keywords and meaning rank first, and talks related by meaning alone still appear.

import { norm } from './lib/html.js';

const WEIGHTS = { title: 10, speaker: 8, tags: 5, room: 4, desc: 2 };
const FUZZY_FIELDS = ['title', 'speaker', 'tags'];
const STOP = new Set(
  ('a an and are as at be by can do for from how i in into is it me my of on or our the this to was what when where '
    + 'which who why will with you your about best up get talk talks session sessions odoo '
    + 'le la les l un une des de du d et ou en au aux pour par sur avec dans que qui quoi comment est sont mon ma mes '
    + 'ton ta tes votre vos notre nos').split(' '),
);

export const SEMANTIC_MIN_Z = 3.0;
const SEMANTIC_WEIGHT = 8; // points per z above the threshold (+1)
const MIN_RELATIVE = 0.12; // drop matches weaker than this share of the best one

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const words = text => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Normalised, per-field text for a session (computed once at load). */
export function searchFields(t, extra = {}) {
  return {
    title: norm(t.title),
    speaker: norm(t.speaker_raw || t.speaker || ''),
    tags: norm([...(t.badges || []), ...(extra.tags || [])].join(' ')),
    room: norm(t.room_str || ''),
    desc: norm(t.desc || t.description || ''),
  };
}

/** Index a session's fields for matching: the text plus the set of words per field. */
export function indexFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, text]) => [k, { text, words: words(text) }]));
}

export function queryWords(query) {
  const all = words(norm(query));
  const meaningful = all.filter(w => !STOP.has(w));
  return meaningful.length ? meaningful : all;
}

/** Levenshtein distance ≤ 1 (one insertion, deletion or substitution). */
export function withinOneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Best score for one query word against one indexed session. */
function wordScore(w, index) {
  let best = 0;
  for (const [field, weight] of Object.entries(WEIGHTS)) {
    const f = index[field];
    if (!f.text.includes(w)) continue;
    const atWordStart = f.words.some(x => x.startsWith(w));
    if (!atWordStart && w.length < 3) continue; // "hr" shouldn't match "through"
    best = Math.max(best, atWordStart ? (f.words.includes(w) ? weight : weight * 0.85) : weight * 0.25);
  }
  if (best || w.length < 5) return best;
  for (const field of FUZZY_FIELDS) {
    if (index[field].words.some(x => withinOneEdit(w, x))) best = Math.max(best, WEIGHTS[field] * 0.6);
  }
  return best;
}

/** Keyword relevance of one session, 0 when it doesn't match enough of the query. */
export function keywordScore(qwords, phrase, index) {
  if (!qwords.length) return 0;
  const scores = qwords.map(w => wordScore(w, index));
  const matched = scores.filter(Boolean).length;
  const needed = Math.ceil(qwords.length * 0.5); // partial matches rank lower via coverage
  if (matched < needed) return 0;
  let score = scores.reduce((a, b) => a + b, 0) * (0.5 + 0.5 * (matched / qwords.length));
  if (phrase.length > 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(phrase)}`, 'u').test(index.title.text)) score += 15;
  return score;
}

/**
 * Rank sessions for a query.
 * @param {string} query
 * @param {Array} sessions sessions with `.index` (see indexFields)
 * @param {Map<string, number>} [semantic] ref -> z-score, only when the server was confident
 * @returns {Array<{t, score, keyword, related}>} best first; `related` = matched by meaning only
 */
export function rank(query, sessions, semantic = new Map()) {
  const qwords = queryWords(query);
  const phrase = norm(query).trim();
  const out = [];
  for (const t of sessions) {
    const keyword = keywordScore(qwords, phrase, t.index);
    const z = semantic.get(t.ref) ?? 0;
    const meaning = z >= SEMANTIC_MIN_Z ? (z - SEMANTIC_MIN_Z + 1) * SEMANTIC_WEIGHT : 0;
    if (!keyword && !meaning) continue;
    out.push({ t, score: keyword + meaning, keyword, related: !keyword });
  }
  // Best first; ties go to the earlier talk. Weak long-tail matches are dropped.
  out.sort((a, b) => b.score - a.score || a.t.day.localeCompare(b.t.day) || a.t.s - b.t.s);
  const floor = (out[0]?.score || 0) * MIN_RELATIVE;
  return out.filter(r => r.score >= floor);
}
