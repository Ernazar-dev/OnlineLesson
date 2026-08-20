// Public (any signed-in role) news feed — what /admin/news actually reaches.
// Admin manages the full CRUD from routes/admin.js; this is the read-only
// side every teacher/student (and admin) polls, scoped to who a given item
// was published for.

import { Router } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// GET /api/news — published items aimed at 'all' or at the caller's own
// role. An admin sees everything published, same as the management page.
router.get('/', async (req, res) => {
  const where =
    req.user.role === 'admin'
      ? { isPublished: true }
      : { isPublished: true, OR: [{ targetRole: 'all' }, { targetRole: req.user.role }] };

  const rows = await prisma.news.findMany({
    where,
    include: { author: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(
    rows.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      author_name: n.author?.fullName || n.author?.username || null,
      target_role: n.targetRole,
      created_at: n.createdAt.toISOString(),
    }))
  );
});

export default router;
