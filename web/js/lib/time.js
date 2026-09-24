// Conference time helpers. Times are minutes since midnight, Europe/Brussels.

export const TZ = 'Europe/Brussels';
const UTC_OFFSET = '+02:00'; // CEST for the whole event

export const toMin = hm => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
export const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const dur = m => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}` : `${m / 60}h`);

let override = null;
/** Pin "now" for demos and tests, e.g. "2026-09-24T14:10" (from ?now=…). */
export function setNow(value) {
  if (!value) return (override = null);
  const [date, time] = value.split('T');
  override = { date, min: toMin(time || '00:00') };
}

/** Current Brussels date ("YYYY-MM-DD") and minute of day. */
export function now() {
  if (override) return override;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, min: +get('hour') * 60 + +get('minute') };
}

export const isPast = (t, n = now()) => n.date > t.day || (n.date === t.day && t.e <= n.min);
export const isLive = (t, n = now()) => n.date === t.day && t.s <= n.min && n.min < t.e;

/** "20260924T093000Z" for a Brussels day + minute. */
export const utcStamp = (day, min) =>
  new Date(`${day}T${hhmm(min)}:00${UTC_OFFSET}`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
