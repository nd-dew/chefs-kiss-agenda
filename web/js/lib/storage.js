// Web storage that never throws (private mode, blocked site data, previews).

const wrap = getArea => ({
  get(key, fallback = null) {
    try {
      const v = getArea().getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      getArea().setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  getJSON(key, fallback) {
    try {
      return JSON.parse(this.get(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  },
});

export const local = wrap(() => localStorage);
export const session = wrap(() => sessionStorage);
