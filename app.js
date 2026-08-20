// Passenger entry point (cPanel "Setup Node.js App" → Application startup file).
//
// Two things stand between cPanel and this app, and this file is both bridges.
//
// 1. Module system. Passenger loads the startup file with require(), i.e. as
//    CommonJS, but backend/package.json declares "type": "module" so everything
//    under backend/ is ESM and require() would throw ERR_REQUIRE_ESM. The root
//    package.json has no "type" field, so THIS file is CommonJS and can reach
//    the ESM server through a dynamic import(), which works from CJS.
//
// 2. Working directory. Passenger starts the process in the application root
//    (this folder), but the backend resolves several paths against process.cwd()
//    and every one of them assumes cwd is backend/ — that is where `npm --prefix
//    backend start` put it on the old host:
//
//      .env             dotenv.config() reads it from cwd
//      ./uploads        student submissions and book files
//      ./admin.txt      the audit log
//      ../data-fayl     the knowledge base the AI grades against
//
//    Without the chdir the app starts, finds no .env (so no database URL, no
//    Gemini key), and writes uploads into the wrong folder. Grading silently
//    falls back to the mock grader. So: chdir first, import second.

const path = require('path');

process.chdir(path.join(__dirname, 'backend'));

// Resolved against this file's own location, not cwd — dynamic import() in
// CommonJS is relative to the module, so the chdir above does not affect it.
import('./backend/src/server.js').catch((err) => {
  // Passenger reports a failed startup as a bare 503 with nothing to go on.
  // Print the real reason so it lands in stderr, where cPanel's error log shows it.
  console.error('Failed to start the backend:', err);
  process.exit(1);
});
