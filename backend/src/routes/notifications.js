import { Router } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { decodeDetails } from '../utils/logger.js';

const router = Router();
router.use(authRequired);

// GET /api/notifications
router.get('/', async (req, res) => {
  const items = await prisma.notification.findMany({
    where: { studentId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const unread = items.filter((n) => !n.isRead).length;
  res.json({
    unread_count: unread,
    notifications: items.map((n) => ({
      id: n.id,
      title: decodeDetails(n.title, req.lang),
      message: decodeDetails(n.message, req.lang),
      type: n.type,
      is_read: n.isRead,
      assignment_id: n.assignmentId,
      created_at: n.createdAt ? n.createdAt.toISOString() : null,
    })),
  });
});

// POST /api/notifications/:id/read
router.post('/:id(\\d+)/read', async (req, res) => {
  const n = await prisma.notification.findUnique({ where: { id: Number(req.params.id) } });
  if (!n || n.studentId !== req.user.id) return res.status(404).json({ message: req.t('common.notFound') });
  await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
  res.json({ message: 'ok' });
});

// POST /api/notifications/read-all
router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { studentId: req.user.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ message: 'ok' });
});

export default router;
