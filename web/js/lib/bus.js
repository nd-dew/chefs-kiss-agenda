// Tiny pub/sub so modules can ask for a re-render without importing the app.
//   'change' – state changed, re-render the page
//   'favs'   – the saved-sessions set changed

const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event).delete(fn);
}

export function emit(event, payload) {
  handlers.get(event)?.forEach(fn => fn(payload));
}
