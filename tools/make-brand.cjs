#!/usr/bin/env node
// Makes the link-preview picture (og-image.png, 1200x630) and the phone home-screen icon
// from the logo. Run again after the logo changes:  node tools/make-brand.cjs
// Needs Playwright (preinstalled in Claude's cloud workspace; not needed on Netlify).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, '..', 'site-src');
const A = (p) => 'file://' + path.join(SRC, 'assets', p);
const logoFile = ['logo.webp', 'logo.png'].find((f) => fs.existsSync(path.join(SRC, 'assets/logo', f)));
const paw = '<svg viewBox="0 0 40 40" width="100%"><g fill="currentColor"><ellipse cx="20" cy="27" rx="9" ry="7.5"/><ellipse cx="9" cy="17" rx="4" ry="5"/><ellipse cx="16" cy="10" rx="4" ry="5"/><ellipse cx="25" cy="10" rx="4" ry="5"/><ellipse cx="32" cy="17" rx="4" ry="5"/></g></svg>';

const stars = '<svg viewBox="0 0 48 40" width="100%"><g stroke="#2b2a33" stroke-width="2.6" stroke-linejoin="round"><path d="M15,4 L18.6,12.4 L27.6,13.2 L20.8,19.2 L22.9,28 L15,23.3 L7.1,28 L9.2,19.2 L2.4,13.2 L11.4,12.4 Z" fill="#ffd166"/><path d="M35,14 L37.6,20 L44,20.6 L39.2,24.9 L40.6,31.2 L35,27.9 L29.4,31.2 L30.8,24.9 L26,20.6 L32.4,20 Z" fill="#f4978e"/></g></svg>';
const mark = logoFile
  ? `<img src="${A('logo/' + logoFile)}" style="max-width:1000px;max-height:420px">`
  : `<div class="wm"><span class="paw">${stars}</span><span>Two Sisters</span>&nbsp;<span class="p2">Studio</span></div>`;

const html = `<!doctype html><html><head><style>
@font-face { font-family: Kalam; font-weight: 700; src: url("${A('fonts/kalam-latin-700-normal.woff2')}"); }
html,body { margin:0; }
body { width:1200px; height:630px; display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:#fdf8ef radial-gradient(rgba(43,42,51,.08) 2px, transparent 2.4px) 0 0/34px 34px; font-family:Kalam; color:#2b2a33; }
.wm { display:flex; align-items:center; font-size:120px; font-weight:700; line-height:1; }
.paw { width:150px; margin-right:24px; }
.p2 { color:#6b3d8c; position:relative; }
.p2::after { content:""; position:absolute; left:-2%; right:-4%; bottom:-24px; height:44px; z-index:-1; border-radius:30px; background:#ffd166; transform:rotate(-1.5deg); }
.trail { display:flex; gap:40px; margin-top:70px; color:#c3b1e1; }
.trail span { width:50px; } .trail span:nth-child(odd){ transform:rotate(-12deg) translateY(10px);} .trail span:nth-child(even){ transform:rotate(12deg);}
</style></head><body>${mark}<div class="trail">${('<span>' + paw + '</span>').repeat(6)}</div></body></html>`;

(async () => {
  const tmp = path.join(os.tmpdir(), 'tss-brand.html');
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + tmp);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(SRC, 'assets/brand/og-image.png') });
  const iconHtml = path.join(os.tmpdir(), 'tss-icon.html');
  fs.writeFileSync(iconHtml, `<body style="margin:0;background:#fdf8ef"><img src="${A('brand/favicon.svg')}" width="180" height="180"></body>`);
  const icon = await b.newPage({ viewport: { width: 180, height: 180 } });
  await icon.goto('file://' + iconHtml);
  await icon.screenshot({ path: path.join(SRC, 'assets/brand/apple-touch-icon.png') });
  await b.close();
  console.log('Wrote site-src/assets/brand/og-image.png');
})();
