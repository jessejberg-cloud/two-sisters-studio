// Claude Code "Stop" hook (.claude/settings.json): before Claude says it is done, the tests must pass.
// Runs only when app or test files changed and were not checked yet, so a plain chat turn costs nothing.
// Blocks (exit 2) with the failures, so Claude fixes them instead of reporting "done".
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const PATHS = 'site-src netlify content tools tests package.json playwright.config.mjs';
let dirty = '';
try {
  // Not committed yet, or committed on this branch but not on main yet: both count.
  dirty = sh(`git status --porcelain -- ${PATHS}`);
  try { dirty += sh(`git diff --name-only origin/main...HEAD -- ${PATHS}`); } catch {}
} catch { process.exit(0); }
if (!dirty.trim()) process.exit(0);
if (!fs.existsSync('node_modules/@playwright/test')) { console.error('Stop check: run `npm ci` first; tests were not run.'); process.exit(0); }

const hash = createHash('sha1').update(sh('git rev-parse HEAD') + sh('git diff HEAD') + dirty).digest('hex');
const mark = sh('git rev-parse --git-path stop-check').trim();
let last = {};
try { last = JSON.parse(fs.readFileSync(mark, 'utf8')); } catch {}
if (last.hash === hash && last.ok) process.exit(0);
if (last.hash === hash && !last.ok && input.stop_hook_active) {
  console.error('Stop check: the same tests still fail. Do not call this done: tell Jesse what fails and why.');
  process.exit(0);
}

// Together under the hook's 600 s limit (.claude/settings.json).
const run = (cmd, args, s) => spawnSync(cmd, args, { encoding: 'utf8', timeout: s * 1000 });
const steps = [
  ['server tests', run('npm', ['test', '--silent'], 120)],
  ['build + audit', run('sh', ['-c', 'node tools/build.cjs && node tools/audit.cjs'], 60)],
];
if (steps.every(([, r]) => r.status === 0)) steps.push(['robot phone (Pixel)', run('npx', ['playwright', 'test', '--project=pixel', '--reporter=line'], 360)]);
const bad = steps.filter(([, r]) => r.status !== 0);
fs.writeFileSync(mark, JSON.stringify({ hash, ok: !bad.length, at: new Date().toISOString() }));
if (!bad.length) process.exit(0);
console.error('Stop check FAILED. Fix these before saying the work is done (docs/GUIDE.md, "Every build"):\n' +
  bad.map(([n, r]) => `--- ${n} ---\n` + ((r.stdout || '') + (r.stderr || '')).split('\n').slice(-40).join('\n')).join('\n'));
process.exit(2);
