// Calendar export: Google Calendar links and RFC 5545 .ics files.

import { utcStamp } from './lib/time.js';

export const ODOO_URL = 'https://www.odoo.com';
const VENUE = 'Brussels Expo';

const where = t => (t.plenary ? VENUE : `${t.room_str}, ${VENUE}`);
const details = (t, max) => `${t.name ? `${t.name}\n\n` : ''}${t.desc.slice(0, max)}`;

export function gcalUrl(t) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: t.title,
    dates: `${utcStamp(t.day, t.s)}/${utcStamp(t.day, t.e)}`,
    location: where(t),
    details: `${details(t, 1200)}\n\n${ODOO_URL}${t.url}`,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = line => (line.length <= 74 ? line : line.match(/.{1,73}/g).join('\r\n '));

const nowStamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(sessions, stamp = nowStamp()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OXP 2026 Agenda//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Odoo Experience 2026'];
  for (const t of sessions) {
    lines.push('BEGIN:VEVENT', `UID:${t.id}@oxp2026`, `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(t.day, t.s)}`, `DTEND:${utcStamp(t.day, t.e)}`,
      `SUMMARY:${icsText(t.title)}`, `LOCATION:${icsText(where(t))}`,
      `DESCRIPTION:${icsText(details(t, 1500))}`, `URL:${ODOO_URL}${t.url}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

export function downloadIcs(sessions, filename) {
  const blob = new Blob([buildIcs(sessions)], { type: 'text/calendar' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const icsName = t => `${t.title.replace(/[^\w]+/g, '_').slice(0, 50)}.ics`;
