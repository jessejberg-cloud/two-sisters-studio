#!/usr/bin/env node
// Checks the built site (dist/) against the privacy and "unlisted" rules. Run after every build:
//   node tools/build.cjs && node tools/audit.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const site = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content/site.json'), 'utf8'));
const problems = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(DIST);
const rel = (f) => path.relative(DIST, f);

// Never link to Jesse's other sites or socials.
const BLOCKED = /divergenttherapy|intrinsicchange|jessemade|brainspotting|facebook\.|instagram\.|twitter\.|x\.com|tiktok\.|youtube\.|linkedin\./i;
const siteHost = new URL(process.env.URL || site.url).host;

for (const f of files.filter((f) => /\.(html|css|js)$/.test(f))) {
  const t = fs.readFileSync(f, 'utf8');
  if (BLOCKED.test(t)) problems.push(`${rel(f)}: mentions a blocked site`);
  for (const m of t.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
    const u = m[0];
    if (u.startsWith('http://www.w3.org/')) continue; // SVG namespace, not a request
    if (new URL(u).host !== siteHost) problems.push(`${rel(f)}: outside address ${u}`);
  }
  if (f.endsWith('.html')) {
    if (!/<meta name="robots" content="noindex/.test(t)) problems.push(`${rel(f)}: missing noindex meta`);
    if (/<form|<iframe|<embed|<object|data-netlify|netlify-honeypot/i.test(t)) problems.push(`${rel(f)}: has a form or embed`);
    if (/document\.cookie|localStorage|sessionStorage|gtag|analytics/i.test(t)) problems.push(`${rel(f)}: tracking/cookie code`);
    if (/<script(?![^>]*src="\/main\.js)/.test(t)) problems.push(`${rel(f)}: unexpected script`);
  }
}
const robots = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
if (!/Disallow: \/\s*$/m.test(robots)) problems.push('robots.txt does not disallow everything');
if (files.some((f) => /sitemap/i.test(f))) problems.push('a sitemap exists');
const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
if (!/X-Robots-Tag = "noindex/.test(toml)) problems.push('netlify.toml is missing the X-Robots-Tag header');
if (!/Content-Security-Policy = "default-src 'self'/.test(toml)) problems.push('netlify.toml is missing the self-only Content-Security-Policy');

if (problems.length) { console.error('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`Audit OK: ${files.length} files, noindex everywhere, no outside links, no forms, no trackers, no sitemap.`);
