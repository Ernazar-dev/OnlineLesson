import { Router } from '../lib/asyncRouter.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma.js';
import config from '../config.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { evictBookFile } from '../services/bookFileCache.js';
import { getMaxFileSizeBytes } from '../utils/settings.js';

const router = Router();

// Files live in the database (see Book.fileData/coverData), not on disk: Render's
// free web service has no persistent disk, so anything written under `uploads/`
// is wiped on the next deploy and every link 404s afterwards. memoryStorage keeps
// the upload as a Buffer in `file.buffer` instead of writing it anywhere.
const memoryStorage = multer.memoryStorage();

/**
 * Same shape as assignments.js's dynamicSubmissionUpload: the size cap comes
 * from the admin's "Maks. fayl hajmi (MB)" setting, re-read (from a short
 * cache, see utils/settings.js) on every request instead of frozen at
 * `config.maxFileSize` since server start.
 */
function dynamicBookUpload(fields) {
  return async (req, res, next) => {
    let limitBytes;
    try { limitBytes = await getMaxFileSizeBytes(); } catch { limitBytes = config.maxFileSize; }
    multer({ storage: memoryStorage, limits: { fileSize: limitBytes } }).fields(fields)(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE')
          return res.status(400).json({ message: req.t('assignment.fileTooLarge', { mb: Math.round(limitBytes / (1024 * 1024)) }) });
        return next(err);
      }
      next();
    });
  };
}

/**
 * Resolves the `subject_id` field of a multipart form to a real Subject id.
 * Multipart carries everything as a string, so an unfiled book arrives as "",
 * and a stale id from a subject deleted in another tab would otherwise reach
 * the database as a foreign key that does not resolve — a 500 for what is
 * really just a form that needs correcting.
 * Returns `undefined` when the field was not sent at all (leave as it is).
 */
async function resolveSubjectId(raw) {
  if (raw === undefined) return undefined;
  const value = String(raw).trim();
  if (!value) return null;
  const id = Number(value);
  if (!Number.isInteger(id)) return null;
  const subject = await prisma.subject.findUnique({ where: { id } });
  return subject ? subject.id : null;
}

// Cover images are non-sensitive and served to <img> tags, which can't send the
// Authorization header — so this route stays public, before authRequired below.
router.get('/cover/:id(\\d+)', async (req, res) => {
  const book = await prisma.book.findUnique({ where: { id: Number(req.params.id) } });
  if (book?.coverData) {
    res.setHeader('Content-Type', book.coverMime || 'image/jpeg');
    return res.send(book.coverData);
  }
  // Legacy row from before the database-storage migration — only resolves if
  // this deploy's disk still happens to have it.
  if (book?.coverImage && fs.existsSync(book.coverImage)) return res.sendFile(path.resolve(book.coverImage));
  res.status(404).json({ message: 'Not found' });
});

router.use(authRequired);

// GET /api/literature/
router.get('/', async (req, res) => {
  const books = await prisma.book.findMany({ include: { subject: true }, orderBy: { createdAt: 'desc' } });
  res.json(
    books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      // The id, not only the name: the edit form has to preselect the subject,
      // and grading looks books up by subject to build the knowledge base.
      subject_id: b.subjectId,
      subject_name: b.subject ? b.subject.name : 'General',
      cover_url: b.coverData || b.coverImage ? `/api/literature/cover/${b.id}` : null,
      file_ext: (path.extname(b.fileName || b.filePath || '').replace('.', '') || 'pdf').toLowerCase(),
      created_at: b.createdAt.toISOString(),
    }))
  );
});

// POST /api/literature/  — teacher/admin
router.post(
  '/',
  roleRequired('teacher', 'admin'),
  dynamicBookUpload([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  async (req, res) => {
    const file = req.files?.file?.[0];
    const cover = req.files?.cover?.[0];
    const { title, author, subject_id } = req.body || {};
    if (!file || !title) return res.status(400).json({ message: req.t('literature.missingData') });
    const book = await prisma.book.create({
      data: {
        title,
        author: author || 'Unknown',
        fileData: file.buffer,
        fileName: file.originalname,
        fileMime: file.mimetype,
        coverData: cover?.buffer || null,
        coverMime: cover?.mimetype || null,
        subjectId: (await resolveSubjectId(subject_id)) ?? null,
      },
    });
    res.status(201).json({ message: req.t('literature.bookAdded'), book_id: book.id });
  }
);

// DELETE /api/literature/:id  — teacher/admin
router.delete('/:id(\\d+)', roleRequired('teacher', 'admin'), async (req, res) => {
  const book = await prisma.book.findUnique({ where: { id: Number(req.params.id) } });
  if (!book) return res.status(404).json({ message: req.t('common.notFound') });
  await prisma.book.delete({ where: { id: book.id } });
  // Legacy on-disk files (see the migration note on Book.filePath above).
  if (book.filePath) fs.unlink(book.filePath, () => {});
  if (book.coverImage) fs.unlink(book.coverImage, () => {});
  evictBookFile(book);
  res.json({ message: req.t('literature.bookDeleted') });
});

// PUT /api/literature/:id  — teacher/admin. Accepts multipart so the file and/or
// cover can be replaced; text fields alone are also fine.
router.put(
  '/:id(\\d+)',
  roleRequired('teacher', 'admin'),
  dynamicBookUpload([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  async (req, res) => {
    const existing = await prisma.book.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) return res.status(404).json({ message: req.t('common.notFound') });

    const { title, author, subject_id } = req.body || {};
    const newFile = req.files?.file?.[0];
    const newCover = req.files?.cover?.[0];

    const book = await prisma.book.update({
      where: { id: existing.id },
      data: {
        title: title ?? undefined,
        author: author ?? undefined,
        subjectId: await resolveSubjectId(subject_id),
        fileData: newFile ? newFile.buffer : undefined,
        fileName: newFile ? newFile.originalname : undefined,
        fileMime: newFile ? newFile.mimetype : undefined,
        // A replaced file was uploaded fresh, so it can't still live at the old
        // (possibly already-wiped) disk path.
        filePath: newFile ? null : undefined,
        coverData: newCover ? newCover.buffer : undefined,
        coverMime: newCover ? newCover.mimetype : undefined,
        coverImage: newCover ? null : undefined,
      },
    });

    // Remove the replaced legacy on-disk files (best-effort), and the cached
    // extraction copy of the old file content so grading picks up the new one.
    if (newFile && existing.filePath) fs.unlink(existing.filePath, () => {});
    if (newCover && existing.coverImage) fs.unlink(existing.coverImage, () => {});
    if (newFile) evictBookFile(existing);

    res.json({ message: req.t('literature.bookUpdated'), book_id: book.id });
  }
);

// GET /api/literature/downloads — who downloaded what (teacher/admin)
router.get('/downloads', roleRequired('teacher', 'admin'), async (req, res) => {
  const rows = await prisma.bookDownload.findMany({
    include: { book: true, user: true },
    orderBy: { downloadedAt: 'desc' },
    take: 200,
  });
  res.json(
    rows.map((d) => ({
      id: d.id,
      book_title: d.book?.title || '-',
      username: d.user?.fullName || d.user?.username || '-',
      downloaded_at: d.downloadedAt.toISOString(),
    }))
  );
});

// GET /api/literature/download/:id
router.get('/download/:id(\\d+)', async (req, res) => {
  const book = await prisma.book.findUnique({ where: { id: Number(req.params.id) } });
  if (!book) return res.status(404).json({ message: req.t('common.fileNotFound') });
  await prisma.bookDownload.create({ data: { bookId: book.id, userId: req.user.id } }).catch(() => {});
  if (book.fileData) {
    res.setHeader('Content-Type', book.fileMime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(book.fileName || `book_${book.id}`)}"`
    );
    return res.send(book.fileData);
  }
  // Legacy row — only resolves if this deploy's disk still happens to have it.
  if (book.filePath && fs.existsSync(book.filePath)) return res.download(book.filePath);
  res.status(404).json({ message: req.t('common.fileNotFound') });
});

export default router;
