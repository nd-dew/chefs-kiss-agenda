// Minimal, safe Markdown for assistant replies. Text is escaped first, then a
// small subset is re-enabled: **bold**, *italic*, `code`, lists, ### headings,
// paragraphs and [[s123]] session references (rendered by a callback).

import { esc } from '../lib/html.js';

const REF_RE = /\[\[\s*(s\d+(?:\s*[,;]\s*s\d+)*)\s*\]\]/g;
const splitRefs = group => group.split(/\s*[,;]\s*/);

/** Unique session refs cited in a text, in order of appearance. */
export const refsIn = text => [...new Set([...String(text).matchAll(REF_RE)].flatMap(m => splitRefs(m[1])))];

/** Replace refs with plain text, e.g. for copying an answer. */
export const replaceRefs = (text, fn) => String(text).replace(REF_RE, (_, group) => splitRefs(group).map(fn).join(', '));

function inline(text, ref) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(REF_RE, (_, group) => splitRefs(group).map(ref).join(''));
}

/**
 * @param {string} src Markdown source
 * @param {object} opts
 * @param {(ref: string) => string} opts.ref HTML for one session reference
 * @param {boolean} [opts.streaming] hide a trailing, not-yet-closed "[[s12"
 */
export function renderMarkdown(src, { ref = esc, streaming = false } = {}) {
  if (streaming) src = src.replace(/\[\[[^\]]*$/, '');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(l => inline(l, ref)).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i, ref)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim() || /^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) {
      flushPara();
      flushList();
      out.push(`<h4>${inline(m[1], ref)}</h4>`);
    } else if ((m = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/))) {
      flushPara();
      const tag = m[1] ? 'ol' : 'ul';
      if (list?.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      // "[[s1]] – reason" -> "[[s1]] reason": the card already separates them visually.
      list.items.push(m[2].replace(/^((?:\*\*)?\[\[[^\]]+\]\](?:\*\*)?)\s*[—–:-]+\s*/, '$1 '));
    } else if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join('');
}
