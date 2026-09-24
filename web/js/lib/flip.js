// FLIP animation for re-rendered tiles: tiles that survive a re-render slide from
// their old position to the new one, new tiles fade in. Keyed by [data-id].

const DURATION = 260;
const MAX_TILES = 400; // beyond this, skip moves and just fade (keeps it smooth)

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Remember where every visible tile is before the DOM is replaced. */
export function capture(root) {
  if (reduced()) return null;
  const view = root.getBoundingClientRect();
  const rects = new Map();
  for (const el of root.querySelectorAll('[data-id]')) {
    const r = el.getBoundingClientRect();
    const visible = r.bottom > view.top && r.top < view.bottom && r.right > view.left && r.left < view.right;
    if (visible) rects.set(el.dataset.id, r);
    if (rects.size > MAX_TILES) break;
  }
  return rects;
}

/** Animate from the captured positions to the freshly rendered ones. */
export function play(root, before) {
  if (!before) return;
  const view = root.getBoundingClientRect();
  for (const el of root.querySelectorAll('[data-id]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom < view.top || r.top > view.bottom || r.right < view.left || r.left > view.right) continue;
    const old = before.get(el.dataset.id);
    const keyframes = old
      ? [{ transform: `translate(${old.left - r.left}px, ${old.top - r.top}px)`, opacity: 1 }, { transform: 'none', opacity: 1 }]
      : [{ transform: 'scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }];
    if (old && old.left === r.left && old.top === r.top) continue;
    el.animate(keyframes, { duration: DURATION, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
  }
}
