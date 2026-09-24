// Odoo's 119 raw tags are noisy, so they're folded into a few clean facets.
// A session's first track also decides its colour (hue / saturation).

export const TRACKS = [
  { id: 'ai', label: 'AI', h: 268, re: /\bAI\b|artificial intelligence|\bagents?\b|\bLLM/i,
    tags: ['AI', 'Artificial Intelligence', 'IA', 'AI Day'] },
  { id: 'finance', label: 'Accounting & Finance', h: 152, re: /accounting|finance|invoic|\btax|fiscal|peppol|bank/i,
    tags: ['Accounting & Finance', 'Accounting', 'Invoicing', 'finance', 'CFO', 'ESG'] },
  { id: 'supply', label: 'Logistics & Manufacturing', h: 27, re: /inventory|manufactur|\bmrp\b|logistic|warehouse|supply|barcode|purchase/i,
    tags: ['Logistic & Manufacturing', 'Manufacturing', 'MRP', 'Inventory', 'Purchase', 'Logistic & Supply Chain',
      'Logistics Day', 'Manufacturing Day', 'Quality', 'Maintenance', 'Repair', 'Brewing', 'construction'] },
  { id: 'web', label: 'Website & Marketing', h: 328, re: /website|e-?commerce|marketing|\bseo\b/i,
    tags: ['Marketing & eCommerce', 'eCommerce', 'Website', 'Webdesign', 'Marketing', 'Social Media', 'Email marketing',
      'Website & eCommerce', 'Sitio web/E-commerce', 'Events', 'Events Business'] },
  { id: 'sales', label: 'Sales & Retail', h: 210, re: /\bsales\b|point of sale|\bpos\b|\bcrm\b|restaurant|retail|subscription|rental/i,
    tags: ['Sales', 'Point of Sale', 'Retail & Food', 'Retail', 'Restaurant', 'CRM', 'Subscription', 'Rental', 'Hotel',
      'second hand', 'Membership', 'Appointment', 'Real-Estate'] },
  { id: 'hr', label: 'HR & People', h: 184, re: /\bhr\b|payroll|recruit|employee|human resource/i,
    tags: ['Human Resource', 'Human Resources', 'HR', 'Recruitment', 'Payroll', 'Planning', 'Timesheets', 'Attendance',
      'Employees', 'Fleet'] },
  { id: 'dev', label: 'Developers', h: 240, sat: '22%', re: /developer|technical|framework|\bowl\b|python|\bapi\b|\borm\b|odoo\.sh|studio/i,
    tags: ['Developers', 'Technical', 'Studio', 'Database', 'Hosting', 'Migration', "Developer's Forum", 'Access rights',
      'Imports and exports', 'Hardware', 'technology'] },
  { id: 'prod', label: 'Productivity & Services', h: 48, re: /project|spreadsheet|helpdesk|field service|dashboard|knowledge|documents/i,
    tags: ['Productivity & Project', 'Productivity', 'Project', 'Spreadsheet', 'Helpdesk', 'Field Service', 'Dashboards',
      'Business Intelligence', 'reporting', 'Discuss', 'Sign', 'Phone', 'Calendar', 'Customer Success',
      'community care center'] },
  { id: 'edu', label: 'Education', h: 96, re: /student|teacher|education|universit/i,
    tags: ['Education', 'Students & Teachers', 'Students', 'Teachers', 'Game', 'Sport'] },
  { id: 'biz', label: 'Business & Strategy', h: 352, re: /implementation|go-live|entrepreneur|leader|strategy|growth/i,
    tags: ['Business leaders', 'CEO', 'CCO', 'Leadership', 'Consulting', 'Future entrepreneurs', 'Growth',
      'implementation', 'Best practice', 'ERP', 'Industry'] },
];
export const OTHER = { id: 'other', label: 'Other', h: 240, sat: '6%' };

export const LEVELS = [
  { id: 'beginner', label: 'Beginner', tags: ['Odoo Beginners', 'Getting started'] },
  { id: 'expert', label: 'Expert', tags: ['Odoo Experts', 'Advanced level'] },
];

export const LANGS = [
  { id: 'en', label: 'English', tags: ['English'] },
  { id: 'fr', label: 'French', tags: ['French'] },
  { id: 'nl', label: 'Dutch', tags: ['Dutch'] },
];

export const FORMATS = [
  { id: 'odoo', label: 'Odoo talk', tags: ['Internal', 'Odoo'] },
  { id: 'community', label: 'Community talk', tags: ['Community', 'Community Talk'] },
  { id: 'partner', label: 'Partner', tags: ['Partner', 'Partner talk'] },
  { id: 'invited', label: 'Invited speaker', tags: ['Invited Speaker'] },
  { id: 'influencer', label: 'Influencer', tags: ['Influencer'] },
  { id: 'mini', label: 'Mini event', tags: ['Mini Events'] },
  { id: 'masterclass', label: 'Masterclass', test: t => t.is_masterclass },
];

export const ROOM_ORDER = [
  'Auditorium 4000 A', 'Auditorium 4000 B', 'Auditorium 4000 C', 'Auditorium 4000 D',
  'Auditorium 2000 A', 'Auditorium 2000 B', 'Auditorium 2000 C', 'Auditorium 500',
  'Hall 6.A', 'Hall 6.B', 'Hall 6.C', 'Hall 6.D', 'Hall 6.E', 'Hall 7.A', 'Hall 7.B',
  'Education Village',
  ...Array.from({ length: 8 }, (_, i) => `Masterclass Room ${i + 1}`),
];

export const venueOf = room =>
  (room.match(/^(Auditorium \d+|Hall \d+)/) || [])[1] || (room.startsWith('Masterclass') ? 'Masterclass rooms' : room);

const OPTIONS = { tracks: [...TRACKS, OTHER], levels: LEVELS, langs: LANGS, formats: FORMATS };

/** Human label for a facet value ("tracks", "ai") -> "AI". Rooms and tags are their own label. */
export const optLabel = (facet, value) => (OPTIONS[facet]?.find(o => o.id === value) || { label: value }).label;

export const trackOf = t => TRACKS.find(d => d.id === t.tracks[0]);

// Few talks carry a language tag, so the language is also guessed from stop words
// (title weighted 3x). A tag always wins; anything unclear counts as English.
const STOP_WORDS = {
  en: 'the and for with your how to of in is our you what why from this are can',
  fr: 'le la les de des du et pour avec vous votre vos une en dans est sur nos notre comment pourquoi au aux qui que quoi neuf sans plus ton ta tes je j l d ou',
  nl: 'de het een en van voor met je jouw onze wat hoe is niet naar bij ook uw',
};
const STOP_SETS = Object.entries(STOP_WORDS).map(([lang, words]) => [lang, new Set(words.split(' '))]);
const wordsOf = text => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]+/g) || [];

export function detectLanguage(title, description = '') {
  const hits = (words, set) => words.filter(w => set.has(w)).length;
  const titleWords = wordsOf(title);
  // The title is written in the talk's language even when the abstract is in English.
  const byTitle = STOP_SETS.map(([lang, set]) => [lang, hits(titleWords, set)]).sort((a, b) => b[1] - a[1]);
  const [[titleLang, titleHits], [, titleRunnerUp]] = byTitle;
  if (titleLang !== 'en' && titleHits >= 2 && titleHits > titleRunnerUp) return titleLang;

  const bodyWords = wordsOf(String(description).slice(0, 600));
  const ranked = STOP_SETS.map(([lang, set]) => [lang, hits(bodyWords, set) + 3 * hits(titleWords, set)])
    .sort((a, b) => b[1] - a[1]);
  const [[best, score], [, runnerUp]] = ranked;
  return score >= 3 && score > runnerUp * 1.5 ? best : 'en';
}

const matching = (defs, badges, t) =>
  defs.filter(d => d.test?.(t) || d.tags?.some(x => badges.has(x))).map(d => d.id);

/** Derive facet values and colour for one raw session. */
export function classify(t, plenary) {
  const badges = new Set(t.badges);
  let tracks = matching(TRACKS, badges, t);
  if (!tracks.length && !plenary) tracks = TRACKS.filter(d => d.re.test(t.title)).map(d => d.id).slice(0, 1);
  if (!tracks.length && !plenary) tracks = ['other'];
  const colour = TRACKS.find(d => d.id === tracks[0]) || OTHER;
  return {
    tracks,
    levels: matching(LEVELS, badges, t),
    langs: plenary ? [] : (() => {
      const tagged = matching(LANGS, badges, t);
      return tagged.length ? tagged : [detectLanguage(t.title, t.description)];
    })(),
    formats: matching(FORMATS, badges, t),
    hue: colour.h,
    sat: colour.sat || '',
  };
}
