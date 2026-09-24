// String helpers for building HTML safely.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

/** Lowercase and strip accents, for accent-insensitive search. */
export const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Returns a function that escapes text and wraps search terms (at word starts) in <mark>. */
export function highlighter(query) {
  const terms = String(query || '').trim().split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return esc;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${terms.join('|')})`, 'giu');
  return text => String(text).split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
}

export const linkify = s =>
  esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
