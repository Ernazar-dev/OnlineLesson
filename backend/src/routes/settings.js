// Public (any signed-in role) view of the handful of admin settings that
// non-admin pages need to actually enforce/display — e.g. the student
// submission page's upload limit. Everything else in the `setting` table
// (AI thresholds, site name, …) is admin-only and stays behind /api/admin.

import { Router } from '../lib/asyncRouter.js';
import { authRequired } from '../middleware/auth.js';
import { getSetting } from '../utils/settings.js';

const router = Router();
router.use(authRequired);

router.get('/public', async (req, res) => {
  const [maxFileSize, allowedFileTypes] = await Promise.all([
    getSetting('max_file_size', '50'),
    getSetting('allowed_file_types', ''),
  ]);
  res.json({ max_file_size: Number(maxFileSize) || 50, allowed_file_types: allowedFileTypes });
});

export default router;
