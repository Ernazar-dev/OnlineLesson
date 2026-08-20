// Book files live in Postgres (Book.fileData) so they survive a Render deploy
// (see the migration note on Book.filePath in schema.prisma). Text extraction
// for the grading knowledge base, though, works off a real file on disk — so
// this materializes a book's bytes into a per-process cache directory the
// first time it's needed and hands back that path. The container's own disk
// is fine to use for this: it only has to outlive the current process, not a
// redeploy, because the database is always there to rematerialize from.
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import config from '../config.js';

const cacheDir = path.resolve(process.cwd(), config.uploadsDir, 'books_cache');

function cachePath(book) {
  const ext = path.extname(book.fileName || '') || '.bin';
  return path.join(cacheDir, `${book.id}${ext}`);
}

/** Writes `book.fileData` to disk if not already cached, and returns the path. */
export async function materializeBookFile(book) {
  if (!book?.fileData) return null;
  const dest = cachePath(book);
  if (!fssync.existsSync(dest)) {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(dest, book.fileData);
  }
  return dest;
}

/** Drops the cached copy so a replaced/deleted book's old bytes never linger. */
export function evictBookFile(book) {
  if (!book?.fileName) return;
  fs.rm(cachePath(book), { force: true }).catch(() => {});
}
