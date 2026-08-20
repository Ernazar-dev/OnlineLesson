import prisma from '../lib/prisma.js';

// Admin-configurable platform settings (the `setting` key/value table edited
// from /admin/settings) — cached briefly so every file upload, roster poll,
// etc. doesn't cost a DB round trip just to read a value that changes maybe
// once a year. Same short-TTL-cache shape as liveSessions.js's audience
// cache, for the same reason: cheap reads, still fresh within seconds of an
// admin actually changing something.
const cache = new Map();
const TTL_MS = 30_000;

/** Raw setting value (string) or `fallback` if unset/unreadable. */
export async function getSetting(key, fallback) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value = fallback;
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (row?.value != null && row.value !== '') value = row.value;
  } catch (e) {
    // DB hiccup — serve the fallback rather than fail whatever needed this.
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

/** The admin's "Maks. fayl hajmi (MB)" setting, in bytes. Defaults to 50MB. */
export async function getMaxFileSizeBytes() {
  const mb = Number(await getSetting('max_file_size', '50'));
  return Math.max(1, Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}

/**
 * Drop the cache so a just-saved setting takes effect on the very next
 * request instead of waiting out the TTL — called after POST /admin/settings.
 */
export function invalidateSettingsCache() {
  cache.clear();
}
