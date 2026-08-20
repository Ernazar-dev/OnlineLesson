import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from './config.js';
import { languageMiddleware } from './i18n/index.js';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import assignmentsRoutes from './routes/assignments.js';
import subjectsRoutes from './routes/subjects.js';
import adminRoutes from './routes/admin.js';
import teacherRoutes from './routes/teacher.js';
import literatureRoutes from './routes/literature.js';
import notificationsRoutes from './routes/notifications.js';
import liveSessionsRoutes from './routes/liveSessions.js';
import newsRoutes from './routes/news.js';
import settingsRoutes from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Translate, even when there is nothing to translate with. Errors raised before
 * `languageMiddleware` runs — a rejected CORS origin, a malformed body — reach
 * the handlers below with no `req.t` on the request, and an error handler that
 * throws is far worse than an untranslated message.
 */
const FALLBACK_MESSAGES = {
  'common.notFound': 'Not found',
  'common.fileTooLarge': 'File too large',
  'common.internalError': 'Internal server error',
};
const tr = (req, key) =>
  (typeof req.t === 'function' ? req.t(key) : null) || FALLBACK_MESSAGES[key] || key;

export function createApp() {
  const app = express();

  // Behind Render's proxy, so req.ip reflects the real client (needed by the rate limiter).
  app.set('trust proxy', 1);
  // crossOriginResourcePolicy is relaxed so a separately-hosted frontend can
  // still load book covers served by this API.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const allowAllOrigins = config.corsOrigins.includes('*');
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin / server-to-server requests have no Origin header — always allow.
        // Otherwise enforce the CORS_ORIGINS allowlist ("*" => allow any).
        if (!origin || allowAllOrigins || config.corsOrigins.includes(origin))
          return cb(null, true);
        cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    })
  );
  app.use(languageMiddleware); // sets req.lang / req.t from Accept-Language
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (config.nodeEnv === 'development') app.use(morgan('dev'));

  // NOTE: the uploads directory is deliberately NOT served statically. It holds
  // student submissions; book covers and submission files are delivered through
  // the authenticated /api/literature/cover and /assignments/download routes.
  fs.mkdirSync(path.resolve(process.cwd(), config.uploadsDir), { recursive: true });

  // Health check (used by Render)
  app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Throttle credential endpoints so passwords cannot be brute-forced.
  //
  // Counted per IP *and* username, not per IP alone: a computer lab reaches this
  // server through one NAT address, so an IP-only budget is shared by the whole
  // room — thirty students signing in for a class would lock each other out
  // after the twentieth, each of them on their first attempt. Per username, the
  // limit still does its job (guessing one account's password is what it is
  // there to stop) without one user's typos costing anyone else their login.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}|${String(req.body?.username || '').toLowerCase()}`,
    // A correct password is not an attack. Only failures count, so a working
    // account is never locked out by the number of times it signs in.
    skipSuccessfulRequests: true,
    handler: (req, res) => res.status(429).json({ error: req.t('auth.tooManyAttempts') }),
  });
  // Mounted after express.json so keyGenerator can see req.body.username.
  app.use('/auth/login', authLimiter);

  // API routes — prefixes match the original Flask blueprints
  app.use('/auth', authRoutes);
  app.use('/assignments', assignmentsRoutes);
  app.use('/api/subjects', subjectsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/teacher', teacherRoutes);
  app.use('/api/literature', literatureRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/live-sessions', liveSessionsRoutes);
  app.use('/api/news', newsRoutes);
  app.use('/api/settings', settingsRoutes);

  // Serve the built frontend (single-service deploy on Render)
  const clientDir = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(clientDir)) {
    app.use(
      express.static(clientDir, {
        // Asset filenames carry a content hash, so they can be cached forever;
        // index.html must not be, or a redeploy would keep serving the old one
        // and point browsers at chunks that no longer exist.
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html'))
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          else if (filePath.includes(`${path.sep}assets${path.sep}`))
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/assignments'))
        return next();
      // A build asset that is not on disk is a stale request from a browser
      // still running the previous deploy's index.html. Answering it with the
      // SPA shell hands JavaScript an HTML document, which fails to parse and
      // leaves a blank page; a plain 404 lets the client retry the import and
      // reload into the new build instead.
      if (req.path.startsWith('/assets/')) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  // JSON 404 for unmatched API paths
  app.use((req, res) => res.status(404).json({ message: tr(req, 'common.notFound') }));

  // Central error handler. Everything async reaches it via lib/asyncRouter.js,
  // so a failing handler returns a clean 500 for that one request instead of
  // taking the process down.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ message: tr(req, 'common.fileTooLarge') });
    // A rejected CORS origin is the caller's mistake, not a server fault.
    if (/not allowed by CORS/.test(err.message || ''))
      return res.status(403).json({ message: 'Origin not allowed' });
    // Never let the error handler itself throw: if the response has already
    // started streaming (a download that failed mid-flight) there is no status
    // left to set, and the connection simply has to be closed.
    if (res.headersSent) return res.end();
    res.status(500).json({ message: tr(req, 'common.internalError') });
  });

  return app;
}

export default createApp;
