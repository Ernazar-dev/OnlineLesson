// One place that decides how a date reaches the screen.
//
// `toLocaleString()` renders seconds ("25.05.2026, 23:59:07"), which is noise in
// every place this app shows a time — nobody submits work to the second. Times
// are shown to the minute, and a deadline is shown as a plain day, because that
// is the unit the deadline is actually set in.

const DATE = { day: '2-digit', month: '2-digit', year: 'numeric' };
const TIME = { hour: '2-digit', minute: '2-digit' };

/** "25.05.2026" — for deadlines and anything measured in whole days. */
export function formatDate(value, fallback = '—') {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString([], DATE);
}

/**
 * "01.06.2026 — 10.06.2026" — an assignment's open window, the way a teacher
 * sets it: from the opening day to the closing one. An assignment made before
 * the window existed has no start date, so only its closing day is shown.
 */
export function formatWindow(start, end, fallback = '—') {
  const from = formatDate(start, '');
  const to = formatDate(end, '');
  if (from && to) return `${from} — ${to}`;
  return to || from || fallback;
}

/** "25.05.2026, 14:30" — for events where the time of day matters. */
export function formatDateTime(value, fallback = '—') {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${d.toLocaleDateString([], DATE)}, ${d.toLocaleTimeString([], TIME)}`;
}

// Uzbek mobile numbers as +998 XX XXX-XX-XX. We keep only the 9 national digits
// the user types (dropping a pasted 998 country code) and lay the mask over
// them, so the field always reads back in one familiar shape. Empty stays empty
// — the number is optional everywhere it is asked for.
export function formatUzPhone(input) {
  let d = (input || '').replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  if (!d) return '';
  let out = '+998 ' + d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += '-' + d.slice(5, 7);
  if (d.length > 7) out += '-' + d.slice(7, 9);
  return out;
}

/** A complete +998 XX XXX-XX-XX number; use to validate an optional phone field. */
export const UZ_PHONE_RE = /^\+998 \d{2} \d{3}-\d{2}-\d{2}$/;

/** "Nodira Karimova" -> "NK", "nodira" -> "N" — an avatar's text fallback. */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

/**
 * The message to show when a request fails.
 *
 * The API reports a refusal it wants the user to read — "this subject is still
 * in use", "that login is taken" — under `error` or `message`, already in the
 * caller's language. Showing a generic "error" instead throws that away and
 * leaves the user with no idea what to do differently, so the server's own
 * wording wins and `fallback` is only for a request that never got an answer.
 */
export function apiError(err, fallback) {
  const data = err?.response?.data;
  return data?.error || data?.message || fallback;
}
