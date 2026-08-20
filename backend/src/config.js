import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: '24h',

  // The single bootstrap admin account. Seeding/reset creates ONLY this user;
  // everyone else is added by the admin from inside the app. Credentials live
  // in .env so they are not hard-coded in the source tree.
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  adminFullName: process.env.ADMIN_FULL_NAME || 'Administrator',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',

  // Gemini is the primary grader: it reads the submitted PDF and the flowchart
  // image directly (DOCX/PPTX reach it as extracted text, since its API only
  // ingests PDF among document formats), so grading sees the real work rather
  // than a text-extraction approximation. Falls back to OpenRouter, then to the
  // deterministic mock, so the platform still runs with no keys at all.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  // Tried in order when the primary model is unavailable or rate-limited.
  // `gemini-flash-latest` is an always-current alias that stays available even
  // when a pinned version is retired, so it makes a dependable last resort.
  //
  // Quota is per model, so the chain is what keeps grading running once the
  // newest model hits its free-tier limit — which it does well before the
  // others. Keep an older, less contended model at the end of the chain: it is
  // the one still answering when the newest is returning 429.
  geminiFallbackModels: (
    process.env.GEMINI_FALLBACK_MODELS || 'gemini-flash-latest,gemini-3.5-flash,gemini-2.5-flash'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // How many independent gradings to average per submission. 1 is fine for
  // everyday use; 3 buys noticeably more stable scores for the same rubric.
  geminiSamples: Math.max(1, Math.min(5, parseInt(process.env.GEMINI_SAMPLES || '1', 10) || 1)),
  geminiTimeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || '120000', 10),
  // A second "auditor" pass that re-checks every proposed score against the
  // cited evidence and corrects unsupported ones. Higher accuracy, one extra call.
  geminiVerify: (process.env.GEMINI_VERIFY || 'false').toLowerCase() === 'true',

  // How many times a student may hand in the same assignment. Only their best
  // attempt counts towards the grade, so extra attempts can raise a mark but
  // never lower one — a student who improves their work is rewarded for it.
  maxAttempts: Math.max(1, parseInt(process.env.MAX_ATTEMPTS || '3', 10) || 3),

  // Agora RTC hosts live lessons — WebRTC media routing/TURN/STUN is Agora's
  // service, but the whole call UI is the app's own (components/AgoraVideoRoom.jsx),
  // so no third-party branding ever reaches the user. Both come from a free
  // agora.io project (Console → Project Management → your project → the
  // "App Certificate" enabled): without them, token generation throws — see
  // utils/agoraToken.js — and Live Classroom simply cannot be used.
  agoraAppId: process.env.AGORA_APP_ID || '',
  agoraAppCertificate: process.env.AGORA_APP_CERTIFICATE || '',
  // How long an issued join token stays valid, in seconds.
  agoraTokenTtl: parseInt(process.env.AGORA_TOKEN_TTL || '3600', 10),

  siteUrl: process.env.SITE_URL || 'http://localhost:5000',
  siteName: process.env.SITE_NAME || 'Independent Work Evaluation-AI',
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
  maxFileSize: 50 * 1024 * 1024, // 50 MB

  // Course knowledge base. Reference material (textbooks, lecture notes) placed
  // in this directory — and Books uploaded for the subject — is mined for the
  // passages most relevant to each submission and handed to the grader as the
  // authoritative source it must check the work against. This is what makes the
  // AI grade "Network Security" on real course content rather than on general
  // knowledge. Drop more books in here to raise accuracy over time.
  //   Flat files apply to every subject (fine while the platform serves one).
  //   Put subject-specific material in a sub-folder named after the subject
  //   (e.g. data-fayl/Tarmoq xavfsizligi/) once you add more subjects.
  kbEnabled: (process.env.KB_ENABLED || 'true').toLowerCase() === 'true',
  kbDir: process.env.KB_DIR || '../data-fayl',
  // How many characters of retrieved reference to include per grading. ~4 chars
  // per token, so 24000 ≈ 6k tokens — generous context, modest cost.
  kbMaxChars: parseInt(process.env.KB_MAX_CHARS || '24000', 10),

  // ---- Originality / anti-plagiarism check ---------------------------------
  // Every submission is fingerprinted and compared against the corpus of all
  // earlier submissions, so one student handing in another's work is caught.
  // A cheap word-shingle comparison finds literal copying; the AI pass then
  // judges the closest candidates, which is what catches a reworded copy.
  plagEnabled: (process.env.PLAGIARISM_ENABLED || 'true').toLowerCase() === 'true',
  // Below this many words there is not enough text to judge — a three-sentence
  // answer would collide with every other three-sentence answer.
  plagMinWords: parseInt(process.env.PLAGIARISM_MIN_WORDS || '120', 10),
  // How many earlier submissions to compare against, newest first.
  plagPoolSize: parseInt(process.env.PLAGIARISM_POOL || '400', 10),
  // Submissions from before this feature existed carry no fingerprint; this many
  // are rebuilt from their stored file per check, so the corpus fills in itself.
  plagBackfill: parseInt(process.env.PLAGIARISM_BACKFILL || '40', 10),
  // Similarity (%) bands. Below `warn` nothing is said; from `warn` the student
  // is warned; from `penaltyFrom` the score is reduced proportionally.
  plagWarnAt: parseInt(process.env.PLAGIARISM_WARN_AT || '25', 10),
  plagPenaltyFrom: parseInt(process.env.PLAGIARISM_PENALTY_FROM || '40', 10),
  plagHighAt: parseInt(process.env.PLAGIARISM_HIGH_AT || '70', 10),
  // Use Gemini to judge the closest candidates (catches paraphrasing, and stops
  // shared boilerplate from being reported as copying). Needs GEMINI_API_KEY.
  plagAi: (process.env.PLAGIARISM_AI || 'true').toLowerCase() === 'true',
  // How many candidate pairs the AI looks at, and the similarity a candidate
  // needs before it is worth an AI call at all.
  plagAiCandidates: Math.max(0, Math.min(5, parseInt(process.env.PLAGIARISM_AI_CANDIDATES || '2', 10) || 0)),
  plagAiMinSimilarity: parseInt(process.env.PLAGIARISM_AI_MIN || '12', 10),
};

export default config;
