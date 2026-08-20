import { createApp } from './app.js';
import config from './config.js';
import prisma from './lib/prisma.js';
import { failStalledSubmissions } from './services/gradingService.js';

const app = createApp();

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`\n=== Independent Work Evaluation-AI API ===`);
  console.log(`Listening on http://0.0.0.0:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  // Report the engine that actually grades, in priority order, with its settings
  // so the log reflects the real accuracy configuration at a glance.
  let engine;
  let quotaNote = null;
  if (config.geminiApiKey) {
    // Spelled out because it is the number that decides whether a free API key
    // survives a day of submissions: every sample is one call, and the verify
    // pass adds one more. Past the quota, grading falls back to a mock that
    // scores by text length — silently, unless someone reads the logs.
    const callsPerSubmission = config.geminiSamples + (config.geminiVerify ? 1 : 0);
    const extras = [`samples=${config.geminiSamples}`, `verify=${config.geminiVerify ? 'on' : 'off'}`];
    engine = `Gemini (${config.geminiModel}) · ${extras.join(' · ')} · ${callsPerSubmission} API call(s)/submission`;
    if (callsPerSubmission > 1)
      quotaNote =
        `  note: ${callsPerSubmission} calls per submission — on a free API key set GEMINI_SAMPLES=1`;
  } else if (config.openRouterApiKey) {
    engine = 'OpenRouter';
  } else {
    engine = 'Mock fallback';
  }
  console.log(`AI grading: ${engine}`);

  // The JWT secret is what makes a login token unforgeable. Left at the
  // built-in default, or at the placeholder .env.example ships, it is a string
  // anyone who has read this repository already knows — and knowing it is
  // enough to mint a token for any account on the platform, admin included.
  //
  // Only values that are actually published are treated as a finding, plus a
  // floor on length; guessing at how random a private secret "looks" would cry
  // wolf on perfectly good ones. Warned rather than enforced, because refusing
  // to boot would take a running deployment offline over something the host's
  // environment panel fixes in a minute.
  const PUBLISHED_SECRETS = ['dev-secret-change-me', 'replace-with-a-long-random-secret'];
  const weakSecret = PUBLISHED_SECRETS.includes(config.jwtSecret)
    ? 'it is the example value from this repository, so anyone can forge a login token'
    : config.jwtSecret.length < 32
      ? 'it is short enough to be worth guessing'
      : null;
  if (weakSecret) {
    console.warn(`!! JWT_SECRET is unsafe: ${weakSecret}.`);
    console.warn(
      "!! Generate one:  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }
  if (quotaNote) console.log(quotaNote);
  if (config.kbEnabled) console.log(`Knowledge base: on (${config.kbDir})`);
  if (config.plagEnabled) {
    const ai = config.plagAi && config.plagAiCandidates > 0 && config.geminiApiKey ? 'AI verified' : 'fingerprint only';
    console.log(
      `Plagiarism check: on (${ai}) · warn ≥${config.plagWarnAt}% · penalty ≥${config.plagPenaltyFrom}%`
    );
  }
  console.log(`========================\n`);

  // Any submission still "processing" now was being graded by an instance that
  // no longer exists — this process is the one that just started. Close those
  // out so nobody is left watching a spinner that will never resolve. Detached
  // from the listen callback: a slow or still-waking database must delay the
  // sweep, never the server accepting traffic.
  failStalledSubmissions().catch((e) => console.error('stalled sweep failed', e));
});

// The ERR_CONNECTION_CLOSED fix.
//
// Render puts a proxy in front of this process and keeps idle upstream
// connections open for about a minute, reusing them for later requests. Node's
// default keep-alive timeout is FIVE SECONDS. So on a quiet site the sequence
// is: the proxy holds a connection, Node closes it at 5s, the proxy sends the
// next request down that same socket, and the browser gets a closed connection
// with no response at all — net::ERR_CONNECTION_CLOSED — with nothing in the
// server log, because the request never reached Express. The login page is
// where it shows up first: it is the first request after an idle spell.
//
// The cure is to outlive the proxy: keep sockets alive longer than it does, and
// keep headersTimeout above that again (Node aborts a connection whose headers
// are not complete within it, so a shorter value would re-introduce the drop).
server.keepAliveTimeout = 120000; // 120s > Render's ~60s idle window
server.headersTimeout = 125000; // must stay above keepAliveTimeout
// Left at Node's five-minute default deliberately: requestTimeout measures how
// long the *whole request body* may take to arrive, and a 50 MB submission over
// a phone connection legitimately takes minutes. A shorter value here would cut
// students off mid-upload. It matches the frontend's upload timeout.
server.requestTimeout = 300000;

// Background work (grading, the originality check) runs detached from the
// request that started it, so a rejection there has no `next()` to fall into.
// Requests are already covered by lib/asyncRouter.js; this is the net under
// everything else, and it must not kill the server — a failed grading is one
// bad submission, not a reason to drop every other user's session.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (server kept running):', reason);
});

// An uncaught exception is different: the process may be in an unknown state,
// so the honest response is to die and let the host start a clean one.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception — shutting down:', err);
  shutdown(1);
});

async function shutdown(code = 0) {
  console.log('Shutting down...');
  // Stop taking new connections, but let in-flight requests finish — a student
  // mid-upload should not lose their submission to a routine redeploy.
  const closed = new Promise((resolve) => server.close(resolve));
  const timeout = new Promise((resolve) => setTimeout(resolve, 10000).unref());
  await Promise.race([closed, timeout]);
  await prisma.$disconnect().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
