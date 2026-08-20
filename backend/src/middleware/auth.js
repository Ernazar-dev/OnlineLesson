import jwt from 'jsonwebtoken';
import config from '../config.js';
import prisma from '../lib/prisma.js';

function extractBearer(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  return token.trim() || null;
}

/** Verifies JWT, loads the user, blocks inactive accounts. Sets req.user. */
export async function authRequired(req, res, next) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ message: req.t('auth.tokenMissing') });

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const userId = payload.user_id;
    if (!userId) return res.status(401).json({ message: req.t('auth.tokenInvalid') });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { group: true, profile: { select: { displayName: true, avatarMime: true } } },
    });
    if (!user) return res.status(401).json({ message: req.t('auth.userNotFound') });
    if (!user.isActive) return res.status(403).json({ message: req.t('auth.accountBlocked') });

    req.user = user;
    req.jwt = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ message: req.t('auth.tokenExpired') });
    return res.status(401).json({ message: req.t('auth.tokenInvalid') });
  }
}

/** Guard that requires the user to have one of the given roles. */
export function roleRequired(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user || !allowed.has(req.user.role))
      return res.status(403).json({ message: req.t('common.unauthorized') });
    next();
  };
}
