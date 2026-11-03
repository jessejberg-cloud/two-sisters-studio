#!/usr/bin/env node
// Last-name check. Fails if a family last name appears anywhere: page text, metadata, file names, URLs, docs.
// The names themselves are never written in this repo; only their SHA-256 hashes are, so this file is safe to keep.
//   node tools/names-check.cjs                 check the repo and dist/
//   node tools/names-check.cjs --hash <word>   print the line to add to BLOCKED below (Claude runs this; the word stays in the terminal)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// [length, sha256 of the lowercase word]
const BLOCKED = [
  [4, 'd251835de0d6c81c80a9849686b0edf09ecbb253911f7abd1f921ebc7df8acf8'],
  [9, 'b255106391c84d568f793b1bf27ca190b9ef54d5c447eccdc7c058a92f2d29c7'],
];

if (process.argv[2] === '--hash') {
  const w = (process.argv[3] || '').toLowerCase().replace(/[^a-z]/g, '');
  console.log(`  [${w.length}, '${sha(w)}'],`);
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['.git', 'node_modules', 'incoming']);
const TEXT = /\.(html|css|js|cjs|mjs|json|md|txt|toml|svg|py|webmanifest|xml)$|^[^.]+$/i;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => SKIP.has(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const lengths = [...new Set(BLOCKED.map(([n]) => n))];
const hashes = new Set(BLOCKED.map(([, h]) => h));

// Looks inside every run of letters, so joined words (like a name glued to another word) are caught too.
function hits(text) {
  const found = new Set();
  for (const m of text.toLowerCase().matchAll(/[a-z]+/g)) {
    const t = m[0];
    for (const n of lengths) for (let i = 0; i + n <= t.length; i++) if (hashes.has(sha(t.slice(i, i + n)))) found.add(t);
  }
  return [...found];
}

const problems = [];
for (const f of walk(ROOT)) {
  const rel = path.relative(ROOT, f);
  if (rel === path.join('tools', 'names-check.cjs')) continue;
  if (hits(rel).length) problems.push(`file name: ${rel}`);
  if (TEXT.test(path.basename(f))) {
    const h = hits(fs.readFileSync(f, 'utf8'));
    if (h.length) problems.push(`${rel}: contains a blocked last name (${h.length} word${h.length > 1 ? 's' : ''})`);
  }
}
if (problems.length) { console.error('LAST-NAME CHECK FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('Last-name check OK: no family last name in any file or file name.');
