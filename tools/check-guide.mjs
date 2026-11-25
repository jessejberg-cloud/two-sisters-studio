// The guide check (Jesse, 2026-11-25: "a guiding doc that is updated and correct and used for every build").
// A pull request that changes how the app works must also change docs/GUIDE.md: at least a new Build log row.
// Usage: node tools/check-guide.mjs [base]   (base defaults to origin/main)
import { execSync } from 'node:child_process';

const base = process.argv[2] || 'origin/main';
const changed = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' }).split('\n').filter(Boolean);
const APP = /^(site-src|netlify|content|tools|tablet-app|tests|\.github|\.claude)\/|^(package\.json|playwright[^/]*\.mjs|netlify\.toml)$/;
const app = changed.filter((f) => APP.test(f) && f !== 'tools/check-guide.mjs');
if (!app.length) { console.log('Guide check: no app files changed.'); process.exit(0); }
if (!changed.includes('docs/GUIDE.md')) {
  console.error('Guide check FAILED: these app files changed, but docs/GUIDE.md did not:\n  ' + app.join('\n  ') +
    '\nAdd a Build log row (and fix any rule or checklist line this change makes wrong). See CLAUDE.md, "Every build".');
  process.exit(1);
}
// The Build log must have more rows than on the base (a new row, not an edited old one).
const rows = (text) => (text.split('## Build log')[1] || '').split('\n').filter((l) => /^\| ?20\d\d-\d\d-\d\d/.test(l)).length;
let before = '';
try { before = execSync(`git show ${base}:docs/GUIDE.md`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
const after = execSync('git show HEAD:docs/GUIDE.md', { encoding: 'utf8' });
if (rows(after) <= rows(before)) {
  console.error('Guide check FAILED: docs/GUIDE.md has no new Build log row (a new line starting "| 2026-…" under "## Build log").');
  process.exit(1);
}
console.log('Guide check: OK (' + app.length + ' app files changed, guide updated with a Build log row).');
