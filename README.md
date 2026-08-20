# AI Assistant Platform

Educational management + AI coursework grading platform, rewritten from the original
Python/Flask app into a modern JavaScript stack:

- **Backend:** Node.js + Express + **Prisma** ORM on **PostgreSQL**
- **Frontend:** **React + Vite + Tailwind CSS + Ant Design**, with route-level `React.lazy` + `Suspense`
- **AI grading:** Gemini (multimodal, rubric-based) → OpenRouter → deterministic mock fallback

The three roles (student / teacher / admin) are preserved from the original; the grading logic
has since moved to a file-only submission model with a subject-agnostic standard rubric (see
below), rather than the original's fixed 9-section coursework report.

---

## What the app does

- **Students** enroll in a group, see their subjects and assignments, and submit coursework
  through a short two-step flow: upload the main document (plus an optional diagram/screenshot
  image), then a review page confirming what's about to be sent. There is nothing to fill in —
  the AI grader reads the file itself (including any images embedded inside a .docx/.pptx) against
  the assignment's rubric: either the platform's standard, subject-agnostic criteria (requirements
  compliance, correctness, evidence of results, clarity) or the teacher's own criteria when they've
  defined one, each with its own weight and maximum score. The grader scores each criterion,
  applies weighted/penalty logic, and produces an overall score plus a written report. Each
  assignment may be handed in up to **3 times** and the best attempt is the one that counts. Students also
  track academic ratings (0–5) per subject, browse the grading **criteria** per subject, see
  their **group** roster and its assignments, get notifications (header bell + full page),
  download PDF reports, read shared literature, and consult an in-app **help** guide.
- **Teachers** create assignments through a **3-phase wizard** (basic info → conditions →
  preview), review submissions, see a **scores/students** table with a per-student results
  drawer, follow **student activity**, and manage literature with a download history.
- **Admins** manage users, groups, subjects, departments, news, settings, drill down
  **teachers → their groups → those groups' students**, view activity logs, platform-wide
  notifications, a student leaderboard, and platform stats.

### Languages

The UI ships in **Uzbek (default)** and **Russian**, switchable from the header/login page; the
choice is remembered in `localStorage` and the browser language is deliberately ignored so a fresh
visitor always lands on Uzbek.

The server is localized too: the client sends its language in `Accept-Language`, and
`backend/src/i18n/` translates API messages, AI feedback, and the grading prompts (so the model
answers in the student's language). Values that outlive the request — notifications and activity
logs — are stored as translation keys and rendered in whatever language the reader has selected.

---

## Attempts: three tries, the best one counts

A student may submit the same assignment up to **3 times** (`MAX_ATTEMPTS`). Every attempt is
graded on its own and kept, but only the **highest-scoring** one is the student's mark — so a
retry can raise a grade and can never lower it. Where a teacher has corrected an attempt, their
number is the one compared.

That single rule lives in `backend/src/utils/attempts.js` and is imported everywhere a grade is
read — assignment lists, ratings, averages, the leaderboard, teacher rosters and PDF reports —
so the same student cannot show a different mark depending on the page. The limit itself is
enforced server-side on submit (`POST /assignments/:id/submit` returns `400` on the fourth try);
the wizard only mirrors it so the student is not walked through a form that will be refused.

What each side sees:

- **Students** — remaining tries and their best score on the assignment list and in the submit
  wizard before they start writing; on a result page, which attempt they are looking at, whether
  it is the one that counts, and a link to the better one if it is not.
- **Teachers** — one row per student, not per submission: the row *is* the counting attempt,
  with the other tries hanging off it so an earlier one can still be opened to see what changed.

The originality check excludes a student's own earlier attempts, so resubmitting your own work
is not reported as copying.

---

## How grading works

A submission is graded in the background (the HTTP request returns `202` immediately)
by `services/gradingService.js`, which tries two engines in order:

**1. Gemini** (`geminiGrader.js`) — used whenever `GEMINI_API_KEY` is set. One multimodal
request carries the original PDF *as a document* (DOCX/PPTX are sent as extracted text, since
Gemini only ingests PDF natively among document formats), the flowchart *as an image*, and any
raster images embedded inside the DOCX/PPTX itself — screenshots, diagrams, command output — sent
as additional images so a student pasting evidence straight into the document is not penalised for
it. There is no separate written answer; the file is the only evidence, judged against the
assignment's rubric. Four things make the result defensible rather than a black box:

- **Rubric-bound.** The model is given only the teacher's criteria, their weights and their
  score bands, and is forbidden from inventing criteria of its own.
- **Evidence required.** A JSON schema forces a verbatim quote from the work behind every
  score; where nothing supports it the model must return `NOT FOUND` and score near zero.
  The quote is shown to the teacher next to the mark.
- **Calibration.** The last five teacher corrections on that assignment travel in the prompt
  ("the AI said 72, the teacher said 58, noting …"), so the grader converges on that
  teacher's standard — no fine-tuning, and it improves with every correction.
- **Sampling.** `GEMINI_SAMPLES=3` averages three independent gradings and keeps the prose
  from the run nearest the average, which removes most run-to-run variance on borderline work.
  **Cost:** each sample is one API call and `GEMINI_VERIFY=true` adds one more, so `3` + verify
  means **four calls per submission**. That is affordable on a billed key and exhausts a free
  key's daily quota after a handful of submissions — past the quota every model in the fallback
  chain returns 429 and grading silently drops to the length-based mock. On a free key use
  `GEMINI_SAMPLES=1`. Quota is counted per model, so `GEMINI_FALLBACK_MODELS` should end on an
  older, less contended model (`gemini-2.5-flash`) that still answers when the newest does not.
- **Course knowledge base.** (`knowledgeBase.js`) Reference material for the subject — the
  textbooks/notes in the `data-fayl/` directory and any **Books** uploaded for the subject — is
  mined for the passages most relevant to each submission (dependency-free TF‑IDF retrieval) and
  handed to the grader as the authoritative source it must check factual correctness against. So
  a wrong claim ("OSI has 4 layers") is caught against the textbook, not just the model's own
  memory. **Accuracy grows as you add more books.** Drop files in `data-fayl/` (shared across
  subjects) or, once you serve more than one subject, in a sub‑folder named after the subject
  (`data-fayl/Tarmoq xavfsizligi/`). Tuned by `KB_ENABLED` / `KB_DIR` / `KB_MAX_CHARS`.

**2. Legacy** (`aiService.js` + `fuzzyLogic.js`) — the original per-section OpenRouter path,
used when Gemini is unconfigured or fails. Text-only, so it never sees the document or the
diagram. With no `OPENROUTER_API_KEY` either, it degrades to a mock grader that scores by
text length — fine for a demo, meaningless as a grade.

A teacher's own score always overrides the AI's: `overallScore` keeps the AI value for the
record, `teacherScore` is what counts everywhere a final grade is shown, and ratings follow
the corrected number.

---

## Originality check (anti-plagiarism)

Every submission is compared against **every submission ever made on the platform**, so one
student handing in another's work is caught. It runs alongside the grading, in
`services/plagiarismService.js`, in two stages:

**1. Fingerprint (all submissions, always).** The work is reduced to the set of hashes of its
overlapping 5-word sequences and stored on the submission. A new submission is compared
against that whole corpus in memory — no earlier text has to be re-read — which catches a
copied file, a re-uploaded work, or a few pasted paragraphs exactly. Formatting, case and
punctuation are normalised away, so renaming a heading changes nothing. Submissions made
before this feature existed are re-fingerprinted from their stored files as they are
encountered, so the corpus fills in by itself.

**2. AI verification (the closest candidates).** Shingles cannot see a *reworded* copy, and
they wrongly flag two students who quote the same textbook. So the closest candidates go to
Gemini, which reads both works and rules `copy` / `paraphrase` / `common_material` /
`independent` with verbatim passage pairs as evidence. It is explicitly told that a shared
report template, shared headings, standard definitions and the task wording are **not**
plagiarism. Its verdict decides the final figure whenever it runs.

Two different numbers are computed, because two different questions are being asked:

- **coverage** — how much of *this* work came from elsewhere. This is the reported figure and
  the only fair basis for a penalty: one pasted paragraph in an original work is not a copy.
- **detection** — the share of the *shorter* work found in the longer one. Used to rank
  candidates and to keep a small-but-total lift visible to the teacher.

What happens to the grade:

| Similarity | Result |
|-----------:|--------|
| `< 25%` | nothing — normal overlap for one subject |
| `25–39%` | warning in the report and a notification; **no** deduction |
| `≥ 40%` | grade scaled by `1 − similarity`, so 60% similar keeps 40% of the marks |
| identical file | 100%, grade goes to zero |

The student is warned ("you submitted work that has already been uploaded"), told what it
cost them, and shown their own matching passages — never the other student's name. The
teacher sees who was matched, both figures, the AI's verdict and both sides of every matched
passage, plus a **re-check** button for work graded before the source appeared in the corpus.
Re-checking is idempotent: the previous deduction is added back before the new one is worked
out, so the same overlap can never be punished twice.

Tuned by `PLAGIARISM_*` (see below); set `PLAGIARISM_ENABLED=false` to switch it off entirely.

---

## Project structure

```
ai-assistant/
├── backend/            Express API + Prisma
│   ├── prisma/schema.prisma
│   └── src/
│       ├── routes/     auth, users, assignments, subjects, admin, teacher, literature, notifications, live-sessions
│       ├── services/   aiService, fuzzyLogic, gradingService, plagiarismService, fileParser, pdfService
│       ├── middleware/  auth (JWT + role guards)
│       ├── app.js  server.js  config.js  seed.js
├── frontend/           React + Vite + Tailwind + AntD
│   └── src/
│       ├── pages/      login, register, student/*, teacher/*, admin/*
│       ├── api/        axios client + typed endpoint modules
│       ├── store/      zustand auth store
│       └── App.jsx     lazy routes + Suspense
├── render.yaml         one-click Render Blueprint (web service; DB is external/Neon)
└── package.json        root orchestration scripts
```

---

## Local development

Requirements: **Node 18+** and a **PostgreSQL** database.

### 1. Backend

```bash
cd backend
cp .env.example .env         # then edit DATABASE_URL, JWT_SECRET, ADMIN_*
npm install
npx prisma db push           # create tables
npm run seed                 # create the bootstrap admin + default settings
npm run dev                  # http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173 (proxies /api,/auth,/assignments to :5000)
```

### Accounts

There is **no self-registration and there are no demo accounts**. Seeding creates exactly
one user — the bootstrap admin — whose credentials come from `.env`:

```env
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
```

Log in as that admin and create every teacher and student from **Admin → Users**; the admin
hands each person their login and password. Change `ADMIN_PASSWORD` in `.env` before going
live (re-running `npm run seed` updates the admin's password to the current `.env` value).

---

## Deploy to Render (free tier)

This repo ships a **single-service** setup: the Express server also serves the built React
app, so there is one Render web service and no separate frontend to host. The database is
external — PostgreSQL on **Neon**.

1. **Neon**: create a project and copy the connection string. Take the **direct** one, not
   the pooled one (the pooled host has `-pooler` in it): `prisma db push` runs during the
   Render build and does not work through pgbouncer. Append the query parameters described
   next to `DATABASE_URL` in `render.yaml` — without `sslmode=require` Neon rejects the
   connection outright, and the other two are what keep Neon's five-minute idle suspend from
   surfacing as a failed first request.
2. Push this folder to a GitHub repo (`git init && git add . && git commit && git push`).
   The Blueprint flow reads `render.yaml` out of a GitHub repo — there is no upload path.
3. Set `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` and `GEMINI_API_KEY` in the Render
   dashboard **before** the first deploy — they are marked `sync: false` in `render.yaml`,
   which means Render will prompt for them. `GEMINI_API_KEY` is what turns on real grading;
   without it a deterministic mock grader is used, so the platform still runs but its scores
   mean nothing.
4. In Render: **New + → Blueprint**, select the repo (it reads `render.yaml`).
5. Render creates the web service, runs `npm run build && npm run db:push && npm run db:seed`,
   then `npm start`. Seeding runs on every deploy and is idempotent; it creates the one
   bootstrap admin you can log in as, and resets that admin's password to `ADMIN_PASSWORD`.
6. Log in as `ADMIN_USERNAME` and create the teachers and students from **Admin → Users**.

`render.yaml` deliberately has no `databases:` block. Adding one back would make Render
provision its own Postgres *and* overwrite `DATABASE_URL` with it, silently pointing the
deployed app at an empty database instead of Neon.

### What the free tier cannot do

- **Uploaded files do not survive a redeploy.** Render's free plan has no persistent disk, so
  `backend/uploads/` — every submitted document, flowchart and uploaded book — is wiped on each
  deploy and on the instance restarting after idling. The database rows survive, so grades,
  feedback and originality figures are all kept; it is the original files behind them that go,
  and "download submission" then returns *file not found*. A paid plan with a mounted disk at
  `backend/uploads` fixes it. The knowledge base is unaffected: `data-fayl/` is committed to git
  and so is restored with every deploy.
- **Schema changes need care.** `db:push` runs with `--accept-data-loss`, which is what lets a
  changed schema reach the deployed database at all. Run `npx prisma db push` locally *without*
  the flag first and read what it says it will drop.
- **The instance sleeps after 15 idle minutes** and takes roughly a minute to wake. The first
  visitor after a quiet spell waits through that; nobody after them does. Open the site a few
  minutes before a demo so it is already awake.
- **Grading can be cut short.** It runs detached from the request, so an instance that stops
  mid-grading takes the unfinished work with it. `failStalledSubmissions()` runs at every boot
  and closes those out (score 0, `gradedBy: 'error'`, a message asking for a resubmission)
  rather than leaving the student on a spinner that would never resolve. The uploaded file is
  gone with the disk by then, so re-grading is not an option — resubmitting is. Attempts are
  counted at submission time and only the best attempt counts, so the zero costs no marks.
- **0.1 CPU is the real ceiling.** `PLAGIARISM_BACKFILL`/`PLAGIARISM_POOL` are lowered in
  `render.yaml` for this reason: the defaults re-parse 40 stored documents per originality
  check, which is minutes of work on a tenth of a core.

### Why it won't "hang" on the free tier

- Every page is **code-split** with `React.lazy` + `Suspense`, so the browser only downloads
  the chunk for the current page (each page bundle is a few KB).
- Vendors (`react`, `antd`) are split into their own cacheable chunks, served `immutable` —
  their filenames carry a content hash, so they never need revalidating. `index.html` is served
  `no-cache`, so a redeploy is picked up on the next load rather than a stale shell being reused.
- A redeploy renames every chunk. A tab left open on the previous build asks for files that no
  longer exist; the server answers those with a **404** (not the SPA shell, which would hand
  JavaScript an HTML document and leave a blank page) and the client reloads once into the new
  build. See `lazyPage` in `App.jsx`.
- AI grading runs **fire-and-forget** after a submission — the HTTP request returns immediately
  (HTTP 202) and the result appears once processing finishes.
- A `/health` endpoint is provided for Render's health checks.

---

## Environment variables

**Backend** (`backend/.env`):

| Var                 | Description                                             |
|---------------------|---------------------------------------------------------|
| `DATABASE_URL`      | PostgreSQL connection string. On Neon: the **direct** URL plus `?sslmode=require&connect_timeout=20&connection_limit=5` |
| `JWT_SECRET`        | Secret for signing JWTs                                 |
| `PORT`              | API port (default 5000). **Do not set this on Render** — the platform assigns it, and overriding it makes the deploy fail with "no open ports detected" |
| `CORS_ORIGINS`      | Comma-separated allowed origins (or `*`)                |
| `GEMINI_API_KEY`    | **Enables real grading.** Key from https://aistudio.google.com/apikey |
| `GEMINI_MODEL`      | Primary model (default `gemini-3.5-flash`)              |
| `GEMINI_FALLBACK_MODELS` | Tried in order on quota/5xx errors; end it on an older model |
| `GEMINI_SAMPLES`    | Independent gradings to average, 1–5 (default 1). **1 per API call** — use 1 on a free key |
| `GEMINI_VERIFY`     | Second auditor pass (default `false`). Adds **one more API call** per submission |
| `GEMINI_TIMEOUT_MS` | Per-request timeout (default 120000)                    |
| `OPENROUTER_API_KEY`| Optional; secondary text-only grader                    |
| `KB_ENABLED`        | Course knowledge base on/off (default `true`)           |
| `KB_DIR`            | Reference-material directory (default `../data-fayl`)   |
| `KB_MAX_CHARS`      | Reference chars sent per grading (default 24000 ≈ 6k tokens) |
| `PLAGIARISM_ENABLED`| Originality check on/off (default `true`)               |
| `PLAGIARISM_MIN_WORDS` | Shortest work that can be judged (default 120)       |
| `PLAGIARISM_POOL`   | Earlier submissions compared against (default 400)      |
| `PLAGIARISM_WARN_AT`| Similarity % that triggers a warning (default 25)       |
| `PLAGIARISM_PENALTY_FROM` | Similarity % from which marks are deducted (default 40) |
| `PLAGIARISM_HIGH_AT`| Similarity % reported as "high" (default 70)            |
| `PLAGIARISM_AI`     | AI verification of the closest matches (default `true`) |
| `PLAGIARISM_AI_CANDIDATES` | Pairs the AI judges per submission, 0–5 (default 2) |
| `MAX_ATTEMPTS`      | Tries a student gets per assignment (default 3)         |
| `UPLOADS_DIR`       | Where uploaded files are stored (default `./uploads`)   |
| `AGORA_APP_ID`      | **Enables Live Classroom.** From a free project at https://agora.io |
| `AGORA_APP_CERTIFICATE` | Same project, with "App Certificate" turned on — required for token auth |
| `AGORA_TOKEN_TTL`   | How long an issued join token stays valid, in seconds (default 3600) |

> Without `GEMINI_API_KEY` the platform still runs, but grading falls back to a
> **mock grader that scores by text length** — usable for a demo, not for real marking.
> Without `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE`, everything else works but the
> "Jonli darslar" (Live Classroom) video call cannot start — the token endpoint
> returns a clear error instead of silently failing.

**Frontend** (`frontend/.env`): leave `VITE_API_URL` empty for the single-service deploy;
set it only if you host the frontend separately from the API.

---

## Notes on the migration

- SQLite → PostgreSQL (Prisma schema mirrors the original SQLAlchemy models, table/column
  names preserved via `@@map`/`@map`).
- Flask blueprints → Express routers with the **same URL prefixes** (`/auth`, `/assignments`,
  `/api/subjects`, `/api/users`, `/api/admin`, `/api/teacher`, `/api/literature`,
  `/api/notifications`).
- `services/ai_service.py` and `fuzzy_logic.py` were ported faithfully at first (same 9 sections,
  same weights) but the standard rubric has since been redesigned to a subject-agnostic 4-criterion
  set (`ORDERED_SECTIONS`/`SECTION_WEIGHTS`) — the original's 9-section coursework-report structure
  didn't fit non-report assignments (e.g. networking labs). The OpenRouter fallback chain + mock
  fallback are otherwise unchanged.
- PDF generation switched from reportlab to `pdfkit` (Node).
- `.doc`/`.pptx` text extraction is simplified compared to the Python original; `.docx` uses
  `mammoth`. `.docx`/`.pptx` also have their embedded raster images extracted (via `adm-zip`) and
  sent to the Gemini grader alongside the text. Extend `src/services/fileParser.js` if you need
  richer parsing.
