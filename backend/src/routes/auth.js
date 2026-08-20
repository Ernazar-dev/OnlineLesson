import { Router } from '../lib/asyncRouter.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import config from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { appendAdminLog, logActivity } from '../utils/logger.js';
import { avatarUrlOf } from '../lib/avatar.js';

const router = Router();

function signToken(user) {
  return jwt.sign(
    { user_id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

// Self-registration is disabled: only an admin creates accounts and hands out
// the login/password. There is no public /auth/register endpoint.

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username) return res.status(400).json({ error: req.t('auth.usernameRequired') });
  if (!password) return res.status(400).json({ error: req.t('auth.passwordRequired') });

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: req.t('auth.invalidCredentials') });
  if (!user.isActive) return res.status(403).json({ error: req.t('auth.accountBlocked') });

  // Bookkeeping, not part of the answer. Awaiting these put two more round-trips
  // to a possibly cold database between the correct password and the response —
  // seconds of spinner on a free tier, and a login that fails outright if the
  // audit write does. Fire them off and reply now; both already swallow errors.
  prisma.user
    .update({ where: { id: user.id }, data: { lastSeen: new Date() } })
    .catch(() => {});
  appendAdminLog('LOGIN', user.username, 'log.login', { role: user.role });
  logActivity(user.id, 'LOGIN', 'log.login', { role: user.role }, req.ip);

  res.json({
    token: signToken(user),
    role: user.role,
    user_id: user.id,
    username: user.username,
    message: req.t('auth.loginSuccess'),
  });
});

// POST /auth/logout
router.post('/logout', authRequired, async (req, res) => {
  appendAdminLog('LOGOUT', req.user.username, 'log.logout');
  await logActivity(req.user.id, 'LOGOUT', 'log.logout', null, req.ip);
  res.json({ message: req.t('auth.logoutSuccess') });
});

// GET /auth/me
router.get('/me', authRequired, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    username: u.username,
    role: u.role,
    email: u.email,
    full_name: u.fullName,
    display_name: u.profile?.displayName || u.fullName || u.username,
    avatar_url: avatarUrlOf(u),
    is_active: u.isActive,
    group_name: u.group ? u.group.name : null,
    last_seen: u.lastSeen ? u.lastSeen.toISOString() : null,
  });
});

// GET /auth/check
router.get('/check', authRequired, (req, res) => {
  res.json({ valid: true, user: { id: req.user.id, username: req.user.username, role: req.user.role } });
});

// POST /auth/refresh
router.post('/refresh', authRequired, (req, res) => {
  res.json({ token: signToken(req.user), message: req.t('auth.tokenRefreshed') });
});

export default router;
