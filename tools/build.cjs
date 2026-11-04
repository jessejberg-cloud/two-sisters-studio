#!/usr/bin/env node
// Builds Two Sisters Studio into dist/. No dependencies: Netlify runs this on every push.
//   content/site.json      site name, the kids (one tab and gallery each), extra sections (tabs), podcast names
//   content/episodes.json  Pet Parents episodes (added by tools/add.py episode)
//   content/art.json       the kids' art (added by tools/add.py)
//   content/moments.json   Family Moments: events and their photos (added by tools/add.py moments)
//   site-src/              styles, script, fonts, drawings, audio, art
// Pages: /  (Welcome)   /<kid>/  (gallery)   /family-moments/   /pet-parents/  /pet-parents/about/  /pet-parents/episodes/<n>/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'site-src');
const DIST = path.join(ROOT, 'dist');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const site = json('content/site.json');
const episodes = json('content/episodes.json').slice().sort((a, b) => b.number - a.number);
const art = json('content/art.json');
const moments = json('content/moments.json').events || [];
// Link previews need a full address. Netlify sets URL to the site's main address during builds.
const SITE_URL = (process.env.URL || site.url).replace(/\/$/, '');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const drawing = (name) => fs.readFileSync(path.join(SRC, 'assets/drawings', name + '.svg'), 'utf8');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const niceDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const listWords = (xs) => xs.length < 2 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
const KIDS = site.kids;
const kidByKey = Object.fromEntries(KIDS.map((k) => [k.key, k]));
const cohost = kidByKey[site.podcastCohost] || KIDS[0];
// Every tab: one per kid, then the extra sections. Add a tab by adding a line to content/site.json.
const TABS = [
  ...KIDS.map((k) => ({ key: k.key, label: k.name, href: `/${k.key}/`, icon: k.icon, color: k.color })),
  ...site.sections,
];
const PP = '/pet-parents';
// Content-Security-Policy is set per page (a meta tag), so the upload app can talk to Google Drive
// while every other page can reach nothing outside this site.  (The upload app talks to Google Drive.)
const CSP_STRICT = "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'self'; object-src 'none'";
// Pages that talk to this site's own functions (login state, parent page, live galleries): still nothing outside.
const CSP_SELF = CSP_STRICT.replace("connect-src 'none'", "connect-src 'self'");
const CSP_LOGIN = CSP_STRICT.replace("form-action 'none'", "form-action 'self'");
const CSP_UPLOAD = "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; font-src 'self'; manifest-src 'self'; "
  + "connect-src 'self' https://www.googleapis.com; "
  + "form-action 'none'; base-uri 'self'; object-src 'none'";

// Cache-busting: every asset URL gets ?v=<hash of the file>.
const hashes = {};
function asset(rel) {
  if (!hashes[rel]) {
    const buf = fs.readFileSync(path.join(SRC, 'assets', rel));
    hashes[rel] = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
  }
  return `/assets/${rel}?v=${hashes[rel]}`;
}
const cssHash = () => crypto.createHash('sha1').update(fs.readFileSync(path.join(SRC, 'styles.css'))).digest('hex').slice(0, 8);
const fileHash = (f) => crypto.createHash('sha1').update(fs.readFileSync(path.join(SRC, f))).digest('hex').slice(0, 8);
const jsHash = () => crypto.createHash('sha1').update(fs.readFileSync(path.join(SRC, 'main.js'))).digest('hex').slice(0, 8);

// Logo: if a drawn logo exists at site-src/assets/logo/logo.webp (or .png), it replaces the placeholder wordmark.
function logo(big) {
  for (const f of ['logo.webp', 'logo.png']) {
    if (fs.existsSync(path.join(SRC, 'assets/logo', f))) {
      return `<img class="logo-img${big ? ' logo-img--big' : ''}" src="${asset('logo/' + f)}" alt="${esc(site.siteName)}">`;
    }
  }
  return `<span class="wordmark${big ? ' wordmark--big' : ''}" role="img" aria-label="${esc(site.siteName)}">`
    + `<span class="wm-icon" aria-hidden="true">${ICONS.stars}</span>`
    + `<span class="wm-text" aria-hidden="true"><span class="wm-1">Two Sisters</span> <span class="wm-2">Studio</span></span>`
    + `</span>`;
}
// The Pet Parents wordmark, shown big at the top of the podcast section.
function podcastMark() {
  return `<span class="wordmark wordmark--big" role="img" aria-label="${esc(site.podcastName)}">`
    + `<span class="wm-paw" aria-hidden="true">${ICONS.paw}</span>`
    + `<span class="wm-text" aria-hidden="true"><span class="wm-1">Pet</span> <span class="wm-2">Parents</span></span>`
    + `</span>`;
}

const ICONS = {
  paw: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="currentColor"><ellipse cx="20" cy="27" rx="9" ry="7.5"/><ellipse cx="9" cy="17" rx="4" ry="5"/><ellipse cx="16" cy="10" rx="4" ry="5"/><ellipse cx="25" cy="10" rx="4" ry="5"/><ellipse cx="32" cy="17" rx="4" ry="5"/></g></svg>',
  home: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6,20 L20,8 L34,20"/><path d="M10,17 L10,33 L30,33 L30,17"/><path d="M17,33 L17,25 L23,25 L23,33"/></g></svg>',
  palette: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20,5 C10,5 4,12 4,20 C4,29 11,35 18,35 C22,35 22,31 20,29 C18,27 19,24 23,24 L28,24 C33,24 36,21 36,17 C36,10 29,5 20,5 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="12" cy="19" r="2.8" fill="#e4572e"/><circle cx="16" cy="11" r="2.8" fill="#ffd166"/><circle cx="25" cy="11" r="2.8" fill="#5fa8d3"/><circle cx="30" cy="18" r="2.8" fill="#8fd3b6"/></svg>',
  crayon: '<svg viewBox="0 0 40 40" aria-hidden="true"><g transform="rotate(-45 20 20)" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M2,15 L28,15 L28,25 L2,25 Z" fill="#c3b1e1"/><path d="M28,15 L38,20 L28,25 Z" fill="#7d4e9e"/><path d="M8,15 L8,25 M12,15 L12,25 M20,15 L20,25 M24,15 L24,25" fill="none" stroke-width="2"/></g></svg>',
  stars: '<svg viewBox="0 0 48 40" aria-hidden="true"><g stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M15,4 L18.6,12.4 L27.6,13.2 L20.8,19.2 L22.9,28 L15,23.3 L7.1,28 L9.2,19.2 L2.4,13.2 L11.4,12.4 Z" fill="#ffd166"/><path d="M35,14 L37.6,20 L44,20.6 L39.2,24.9 L40.6,31.2 L35,27.9 L29.4,31.2 L30.8,24.9 L26,20.6 L32.4,20 Z" fill="#f4978e"/></g></svg>',
  heart: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20,34 C12,28 4,22 4,14 C4,8.5 8.2,5 12.6,5 C16,5 18.6,7 20,9.6 C21.4,7 24,5 27.4,5 C31.8,5 36,8.5 36,14 C36,22 28,28 20,34 Z" fill="#f4978e" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
  mic: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><rect x="14" y="4" width="12" height="20" rx="6"/><path d="M9,18 Q9,29 20,29 Q31,29 31,18"/><path d="M20,29 L20,36 M14,36 L26,36"/></g></svg>',
};

function page({ key, title, body, section, bodyClass, csp = CSP_STRICT, tabs = true, scripts = [] }) {
  const fullTitle = title ? `${title} · ${site.siteName}` : site.siteName;
  const current = section || key;
  const nav = TABS.map((n) => `<li><a class="tab c-${n.color}" href="${n.href}"${n.key === current ? ' aria-current="page"' : ''}><span class="tab-icon">${ICONS[n.icon]}</span><span class="tab-label">${esc(n.label)}</span></a></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="googlebot" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta property="og:title" content="${esc(site.siteName)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.siteName)}">
<meta property="og:description" content="${esc(site.siteName)}">
<meta property="og:image" content="${SITE_URL}/assets/brand/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(site.siteName)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(site.siteName)}">
<meta name="theme-color" content="#fdf8ef">
<link rel="icon" href="${asset('brand/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${asset('brand/apple-touch-icon.png')}">
<link rel="preload" href="${asset('fonts/kalam-latin-700-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${asset('fonts/nunito-latin-600-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=${cssHash()}">
<script src="/main.js?v=${jsHash()}" defer></script>
${scripts.map((f) => `<script src="/${f}?v=${fileHash(f)}" defer></script>`).join('\n')}
</head>
<body class="page-${key}${section ? ' in-' + section : ''}${bodyClass ? ' ' + bodyClass : ''}">
<a class="skip" href="#main">Skip to the main part</a>
<header class="site-header">
  <a class="brand" href="/">${logo(false)}</a>
  ${tabs ? '' : '<!--'}<nav aria-label="Main"><ul class="tabs">${nav}<li class="tab-add-li"><a class="tab tab-add" href="/upload/"><span class="tab-icon" aria-hidden="true">＋</span><span class="tab-label">Add art</span></a></li></ul></nav>${tabs ? '' : '-->'}
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="paw-trail" aria-hidden="true">${ICONS.paw.repeat(5)}</div>
  <p>Made with love (and crayons) by the ${esc(site.siteName)} crew.</p>
  <p class="foot-parent"><a class="linkish" href="/parent/">For parents</a></p>
</footer>
</body>
</html>
`;
}

// Small tab row inside the podcast section: Episodes · About.
function podcastNav(current) {
  const items = [[`${PP}/`, 'Episodes', 'episodes'], [`${PP}/about/`, 'About the podcast', 'about']];
  return `<nav class="subnav" aria-label="${esc(site.podcastName)}"><ul>${items.map(([h, l, k]) => `<li><a href="${h}"${k === current ? ' aria-current="page"' : ''}>${esc(l)}</a></li>`).join('')}</ul></nav>`;
}

// ---------- pieces ----------
const epMeta = (ep) => `Episode ${ep.number} <span class="dot">·</span> <time datetime="${ep.date}">${niceDate(ep.date)}</time>`
  + (ep.minutes ? ` <span class="dot">·</span> ${ep.minutes} min` : '');
function player(ep, opts = {}) {
  return `<div class="player">
    <audio controls preload="none" src="${asset(ep.audio)}"${opts.label ? ` aria-label="${esc(opts.label)}"` : ''}>
      Your browser can't play this audio.
    </audio>
  </div>`;
}

function whoLine(ep) {
  const bits = [];
  if (ep.guests && ep.guests.length) bits.push(`<span class="who"><strong>Guest${ep.guests.length > 1 ? 's' : ''}:</strong> ${esc(listWords(ep.guests))}</span>`);
  if (ep.pets && ep.pets.length) bits.push(`<span class="who"><strong>Pet${ep.pets.length > 1 ? 's' : ''}:</strong> ${esc(listWords(ep.pets.map((p) => p.kind ? `${p.name} the ${p.kind}` : p.name)))}</span>`);
  return bits.length ? `<p class="who-line">${bits.join('')}</p>` : '';
}

function episodePic(ep, cls) {
  if (!ep.drawing) return `<div class="${cls} ep-pic ep-pic--none" aria-hidden="true">${ICONS.paw}</div>`;
  return `<img class="${cls} ep-pic" src="${asset(ep.drawing)}" alt="${esc(ep.drawingAlt || `Drawing for episode ${ep.number}`)}" width="${ep.drawingW || 800}" height="${ep.drawingH || 800}" loading="lazy" decoding="async">`;
}

function latestBlock(ep) {
  return `<section class="latest reveal" aria-labelledby="latest-h">
  <p class="kicker">Newest episode</p>
  <div class="latest-card wobbly">
    ${episodePic(ep, 'latest-pic')}
    <div class="latest-text">
      <p class="ep-num">${epMeta(ep)}</p>
      <h2 id="latest-h"><a href="${PP}/episodes/${ep.number}/">${esc(ep.title)}</a></h2>
      <p class="ep-desc">${esc(ep.description)}</p>
      ${whoLine(ep)}
      ${player(ep, { label: `Play episode ${ep.number}: ${ep.title}` })}
    </div>
  </div>
</section>`;
}

function comingSoon() {
  return `<section class="latest soon reveal" aria-labelledby="soon-h">
  <div class="soon-card wobbly">
    <div class="soon-art">${drawing('coming-soon')}</div>
    <div class="soon-text">
      <h2 id="soon-h">First episode coming soon!</h2>
      <p>We're busy recording. Check back soon to hear our very first pet parent.</p>
    </div>
  </div>
</section>`;
}

function pastList(list) {
  if (!list.length) return '';
  const items = list.map((ep, i) => `<li class="past-item reveal">
      <a class="past-link wobbly" href="${PP}/episodes/${ep.number}/">
        ${episodePic(ep, 'past-pic')}
        <span class="past-text">
          <span class="ep-num">${epMeta(ep)}</span>
          <span class="past-title">${esc(ep.title)}</span>
          <span class="past-desc">${esc(ep.description)}</span>
        </span>
      </a>
    </li>`).join('\n');
  return `<section class="past" aria-labelledby="past-h">
  <h2 id="past-h" class="section-h">More episodes</h2>
  <ul class="past-list">${items}</ul>
</section>`;
}

function gallery(items, emptyText) {
  if (!items.length) {
    return `<div class="empty wobbly reveal"><div class="empty-art">${drawing('easel')}</div><p>${esc(emptyText)}</p></div>`;
  }
  return `<ul class="gallery">${items.map((it, i) => `<li class="art-item reveal">
    <figure class="frame">
      <a class="art-open" href="${asset(it.src)}" aria-label="Open ${esc(it.title || 'drawing')} full size">
        <img src="${asset(it.src)}" alt="${esc(it.alt || it.title || 'A drawing')}" width="${it.w || 800}" height="${it.h || 800}" loading="lazy" decoding="async">
      </a>
      ${it.title ? `<figcaption>${esc(it.title)}</figcaption>` : ''}
    </figure>
  </li>`).join('\n')}</ul>`;
}

// ---------- art galleries ----------
const SEASONS = ['fall', 'winter', 'spring', 'summer'];
const SEASON_LABEL = { fall: 'Fall', winter: 'Winter', spring: 'Spring', summer: 'Summer' };

// The gallery itself is drawn on the page (main.js): art saved from the app comes live from the site's art list
// (/api/pieces), and older art added by hand comes from the list below, so both show together.
function artGallery(kid, items) {
  const data = items.map((it) => ({ id: it.id, date: it.date, schoolYear: it.schoolYear, season: it.season, grade: it.grade || '',
    caption: it.caption || '', alt: it.alt || '', starred: !!it.featured, sample: !!it.sample, kid: kid.key,
    photos: [{ full: asset(it.src), thumb: asset(it.thumb || it.src), w: it.w, h: it.h }] }));
  return `<script type="application/json" id="art-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<div class="art-live" data-kid="${kid.key}" data-name="${esc(kid.name)}" data-empty="${esc(`${kid.name}'s art will show up here soon!`)}"></div>
<button type="button" class="chip filter-toggle" aria-expanded="false" hidden>🔎 Filter</button>
<div class="filters" hidden>
  <div class="chips" role="group" aria-label="year" data-group="year"></div>
  <div class="chips" role="group" aria-label="season">${[['all', 'All seasons'], ...SEASONS.map((x) => [x, SEASON_LABEL[x]])].map(([v, l], i) => `<button type="button" class="chip" data-filter="season" data-value="${v}" aria-pressed="${i === 0}">${esc(l)}</button>`).join('')}</div>
  <label class="find"><span>Find a word</span><input type="search" class="find-input" placeholder="like cat or rainbow" autocomplete="off"></label>
  <p class="none-found" hidden>No pictures match. Try another word.</p>
</div>
<div class="gallery-area"><p class="loading">Getting the pictures…</p></div>
<dialog class="lightbox" aria-label="Picture">
  <button type="button" class="lb-close" aria-label="Close">✕</button>
  <button type="button" class="lb-prev" aria-label="Previous picture">‹</button>
  <figure class="lb-fig"><img class="lb-img" alt=""><figcaption><span class="lb-cap"></span><span class="lb-label"></span><span class="lb-more"></span><button type="button" class="lb-save">⬇ Save this picture</button></figcaption></figure>
  <button type="button" class="lb-next" aria-label="Next picture">›</button>
</dialog>`;
}

// ---------- pages ----------
const pages = {};

// Welcome: one big button per tab.
pages['index.html'] = page({
  key: 'welcome',
  title: '',
  body: `<section class="welcome">
  <h1 class="hero-logo">${logo(true)}</h1>
  <p class="hero-tag">Art by ${esc(listWords(KIDS.map((k) => k.name)))}, our podcast, and family moments.</p>
  <ul class="big-buttons">
    ${TABS.map((n) => `<li><a class="big-button wobbly c-${n.color}" href="${n.href}"><span class="big-icon">${ICONS[n.icon]}</span><span class="big-label">${esc(n.label)}</span></a></li>`).join('\n    ')}
  </ul>
</section>`,
});

// One gallery page per kid: school years newest first (newest open), each with School Year (fall, winter,
// spring) and Summer. Each season: featured pieces large, then the rest in a masonry grid that never crops.
for (const kid of KIDS) {
  const items = (art[kid.key] || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  pages[`${kid.key}/index.html`] = page({
    key: 'kid',
    section: kid.key,
    bodyClass: `c-${kid.color}`,
    title: `${kid.name}'s Art`,
    csp: CSP_SELF,
    body: `<div class="page-head"><h1>${esc(kid.name)}'s Art</h1></div>
${artGallery(kid, items)}`,
  });
}

pages['pet-parents/index.html'] = page({
  key: 'podcast',
  section: 'pet-parents',
  title: site.podcastName,
  body: `${podcastNav('episodes')}
<section class="hero">
  <h1 class="hero-logo">${podcastMark()}</h1>
  <p class="hero-tag">A podcast about pets and the people who love them.</p>
  <div class="hero-art">${drawing('hero')}</div>
</section>
${episodes.length ? latestBlock(episodes[0]) : comingSoon()}
${pastList(episodes.slice(1))}`,
});

pages['pet-parents/about/index.html'] = page({
  key: 'about',
  section: 'pet-parents',
  title: `About ${site.podcastName}`,
  body: `${podcastNav('about')}
<div class="page-head reveal"><h1>About the podcast</h1></div>
<div class="about-top">
  <section class="about-tag reveal"><p>${esc(site.tagline)}</p></section>
  <div class="about-art">${drawing('about')}</div>
</div>
<div class="about-grid">
  <section class="about-block wobbly tint-yellow reveal">
    <h2>What is it?</h2>
    <p>In every episode we talk with a pet parent. We ask what their pet is like, what's fun, what's hard, and what they wish they'd known.</p>
  </section>
  <section class="about-block wobbly tint-mint reveal">
    <h2>Who is it for?</h2>
    <p>Anyone who loves pets, has a pet, or is thinking about getting one. Kids and grown-ups welcome!</p>
  </section>
  <section class="about-block wobbly tint-lav reveal">
    <h2>Who asks the questions?</h2>
    <p>${esc(cohost.name)} and ${esc(site.hostName)} do the interviews. ${esc(cohost.name)} also makes the episode drawings.</p>
  </section>
</div>`,
});

for (const ep of episodes) {
  const i = episodes.indexOf(ep);
  const newer = episodes[i - 1], older = episodes[i + 1];
  pages[`pet-parents/episodes/${ep.number}/index.html`] = page({
    key: 'episode',
    section: 'pet-parents',
    title: `Episode ${ep.number}`,
    body: `<article class="episode reveal">
  <p class="back"><a href="${PP}/">← All episodes</a></p>
  <div class="latest-card wobbly">
    ${episodePic(ep, 'latest-pic')}
    <div class="latest-text">
      <p class="ep-num">${epMeta(ep)}</p>
      <h1>${esc(ep.title)}</h1>
      <p class="ep-desc">${esc(ep.description)}</p>
      ${whoLine(ep)}
      ${player(ep, { label: `Play episode ${ep.number}: ${ep.title}` })}
    </div>
  </div>
  <nav class="ep-nav" aria-label="More episodes">
    ${older ? `<a class="ep-nav-link" href="${PP}/episodes/${older.number}/">← Episode ${older.number}</a>` : '<span></span>'}
    ${newer ? `<a class="ep-nav-link" href="${PP}/episodes/${newer.number}/">Episode ${newer.number} →</a>` : ''}
  </nav>
</article>`,
  });
}

pages['404.html'] = page({
  key: 'notfound',
  title: 'Page not found',
  body: `<div class="page-head reveal"><h1>Oops! This page ran off to chase a squirrel.</h1><p><a class="big-link" href="/">Go back home</a></p></div>`,
});

// ---------- Family Moments: one page, one section per special event, newest first ----------
// Each event has a "Download all" zip of the print-size copies (site-src/moments-print/, never served one by one),
// for photo books. The zips are made here, into dist/ only.
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zipStore(files) {   // files: [{ name, data }] -> a plain (stored, no compression) zip; JPEGs don't shrink anyway
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), crc = crc32(f.data), n = f.data.length;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(0, 8); h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(n, 18); h.writeUInt32LE(n, 22); h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(n, 20); c.writeUInt32LE(n, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, name, f.data); central.push(c, name); off += 30 + name.length + n;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
const momentZips = {};
const eventDates = (ev) => ev.endDate && ev.endDate !== ev.date ? `${niceDate(ev.date)} to ${niceDate(ev.endDate)}` : niceDate(ev.date);
function momentPhoto(ev, ph) {
  const label = [ph.date ? niceDate(ph.date) : '', ev.title].filter(Boolean).join(' · ');
  return `<figure class="piece">
    <a class="piece-open" href="${asset(ph.src)}" data-full="${asset(ph.src)}" data-dl="${ph.print ? '/moments/' + ph.print : asset(ph.src)}" data-name="${esc(ph.id)}" data-w="${ph.w}" data-h="${ph.h}"
       data-caption="${esc(ph.caption || '')}" data-label="${esc(label)}" aria-label="Open ${esc(ph.caption || 'this photo')} big">
      <img src="${asset(ph.thumb || ph.src)}" alt="${esc(ph.alt || ph.caption || 'A photo from ' + ev.title)}" width="${ph.w}" height="${ph.h}" loading="lazy" decoding="async">
      ${ev.sample ? '<span class="sample-tag">Sample</span>' : ''}
    </a>
    ${ph.caption ? `<figcaption><span class="art-cap">${esc(ph.caption)}</span></figcaption>` : ''}
  </figure>`;
}
{
  const events = moments.slice().sort((a, b) => b.date.localeCompare(a.date));
  const blocks = events.map((ev) => {
    const prints = (ev.photos || []).filter((ph) => ph.print);
    let dl = '';
    if (prints.length) {
      const zipRel = `moments/${ev.key}.zip`;
      momentZips[zipRel] = prints.map((ph) => ({ name: `${ev.key}/${path.basename(ph.print)}`, data: fs.readFileSync(path.join(SRC, 'moments-print', ph.print)) }));
      const mb = Math.max(1, Math.round(momentZips[zipRel].reduce((t, f) => t + f.data.length, 0) / 1048576));
      dl = `<div class="dl-row"><button type="button" class="btn-download save-all" hidden>📱 Save all ${prints.length} to this phone</button>
      <a class="btn-download" href="/${zipRel}" download="${esc(ev.key)}.zip">⬇ Download all ${prints.length} as one zip <span class="dl-size">(for a computer or a photo book, about ${mb} MB)</span></a></div>`;
    }
    return `<section class="moment" id="${esc(ev.key)}">
    <div class="moment-head">
      <h2 class="moment-h">${esc(ev.title)}</h2>
      <p class="moment-date">${eventDates(ev)}</p>
      ${ev.note ? `<p class="moment-note">${esc(ev.note)}</p>` : ''}
      ${dl}
    </div>
    <div class="masonry">${(ev.photos || []).map((ph) => momentPhoto(ev, ph)).join('')}</div>
  </section>`;
  }).join('\n');
  const jump = events.length > 1 ? `<nav class="moment-jump" aria-label="Events"><ul>${events.map((ev) => `<li><a href="#${esc(ev.key)}">${esc(ev.title)}</a></li>`).join('')}</ul></nav>` : '';
  pages['family-moments/index.html'] = page({
    key: 'moments',
    section: 'family-moments',
    bodyClass: 'c-yellow',
    title: 'Family Moments',
    body: `<div class="page-head"><h1>Family Moments</h1><p>Photos from our special days.</p></div>
${events.some((ev) => ev.sample) ? '<p class="sample-note">These are sample pictures, so you can see how the page will look. Real photos are coming soon!</p>' : ''}
${events.length ? `${jump}
<div class="gallery-area">
${blocks}
</div>
<dialog class="lightbox" aria-label="Photo">
  <button type="button" class="lb-close" aria-label="Close">✕</button>
  <button type="button" class="lb-prev" aria-label="Previous photo">‹</button>
  <figure class="lb-fig"><img class="lb-img" alt=""><figcaption><span class="lb-cap"></span><span class="lb-label"></span><button type="button" class="lb-save">⬇ Save this picture</button></figcaption></figure>
  <button type="button" class="lb-next" aria-label="Next photo">›</button>
</dialog>` : gallery([], 'Family photos will show up here soon!')}`,
  });
}

// ---------- login (the gate sends everyone without a login here) ----------
pages['login/index.html'] = page({
  key: 'login', title: 'Log in', csp: CSP_LOGIN, tabs: false,
  body: `<section class="login wobbly">
  <h1>Welcome!</h1>
  <p class="login-lead" data-family>Type the family password to come in.</p>
  <p class="login-lead" data-friend hidden>Someone shared part of the site with you. Type the password they sent you.</p>
  <form class="login-form" method="post" action="/api/login">
    <label for="pw">Password</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
    <input type="hidden" name="next" value="/">
    <input type="hidden" name="kind" value="family">
    <button type="submit" class="btn-big">Come in</button>
    <p class="login-error" data-e="pw" hidden>That password did not work. Try again?</p>
    <p class="login-error" data-e="wait" hidden>Too many tries. Please wait 15 minutes and try again.</p>
    <p class="login-error" data-e="link" hidden>This link has ended or was turned off. Ask for a new one.</p>
  </form>
</section>`,
});

// ---------- parent page: parent PIN, Google Drive, rebuild ----------
pages['parent/index.html'] = page({
  key: 'parent', title: 'For parents', csp: CSP_SELF, scripts: ['parent.js'],
  body: `<div class="page-head"><h1>For parents</h1></div>
<section class="parent-pin wobbly" id="pin-box">
  <p>Type the parent PIN.</p>
  <div class="pin-row"><input id="pin" type="password" inputmode="numeric" autocomplete="off" aria-label="Parent PIN"><button type="button" class="btn-big" id="pin-go">Open</button></div>
  <p class="login-error" id="pin-msg" hidden></p>
</section>
<div id="parent-tools" hidden>
  <section class="parent-card wobbly">
    <h2>Google Drive</h2>
    <p id="g-status">Checking…</p>
    <p><a class="btn-big" id="g-connect" href="/api/google/start">Connect Google Drive</a></p>
  </section>
  <section class="parent-card wobbly" id="share-card">
    <h2>Share with a friend</h2>
    <p>Pick the pages and how long the link works. Your friend also needs the friends password, which you send in a second text.</p>
    <fieldset class="ticks"><legend>Pages</legend>
      ${TABS.map((n) => `<label class="tick"><input type="checkbox" name="pages" value="${n.key}"> ${esc(n.label)}</label>`).join('\n      ')}
      <label class="tick"><input type="checkbox" id="pages-all"> All of them</label>
    </fieldset>
    <fieldset class="ticks"><legend>Works for</legend>
      <label class="tick"><input type="radio" name="expiry" value="week"> A week</label>
      <label class="tick"><input type="radio" name="expiry" value="month" checked> A month</label>
      <label class="tick"><input type="radio" name="expiry" value="year"> A year</label>
      <label class="tick"><input type="radio" name="expiry" value="never"> No end date</label>
    </fieldset>
    <p><button type="button" class="btn-big" id="link-make">Make a link</button></p>
    <p class="login-error" id="link-msg" hidden></p>
    <div class="link-made" id="link-made" hidden>
      <p class="link-url" id="link-url"></p>
      <div class="send-row"><button type="button" class="btn-big" id="send-link">Send link</button><button type="button" class="btn-big" id="send-pw">Send password</button></div>
      <p class="share-help" id="send-note"></p>
    </div>
    <h3>Links you made</h3>
    <ul class="link-list" id="link-list"><li class="muted">None yet.</li></ul>
  </section>
  <section class="parent-card wobbly">
    <h2>Passwords and PIN</h2>
    <p>Changing one logs out every other phone and computer that uses it. This one stays in.</p>
    <div class="pw-row"><label>Family password <input type="text" id="pw-family" autocomplete="off" spellcheck="false"></label><button type="button" class="chip" data-change="family">Change</button></div>
    <div class="pw-row"><label>Friends password <input type="text" id="pw-friends" autocomplete="off" spellcheck="false"></label><button type="button" class="chip" data-change="friends">Change</button></div>
    <div class="pw-row"><label>Parent PIN (4 to 8 numbers) <input type="text" id="pw-pin" inputmode="numeric" autocomplete="off"></label><button type="button" class="chip" data-change="pin">Change</button></div>
    <p class="share-help" id="pw-msg" role="status"></p>
  </section>
  <section class="parent-card wobbly">
    <h2>Rebuild the galleries from Drive</h2>
    <p>Only needed if something on the site was lost. Drive is never changed.</p>
    <p><button type="button" class="btn-big" id="rebuild">Rebuild now</button></p>
    <p id="rebuild-status"></p>
  </section>
  <section class="parent-card wobbly">
    <h2>This device</h2>
    <p><button type="button" class="linkish" id="logout">Log out of the site on this device</button></p>
  </section>
</div>`,
});

// ---------- upload app (for Jesse's phone; not in the tabs) ----------
const uploadCfg = {
  folderName: site.uploadFolderName,
  kids: Object.fromEntries(KIDS.map((k) => [k.key, { name: k.name, color: k.color }])),
};
const upJs = () => crypto.createHash('sha1').update(fs.readFileSync(path.join(SRC, 'upload/app.js'))).digest('hex').slice(0, 8);
pages['upload/index.html'] = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Add art · ${esc(site.siteName)}</title>
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${CSP_UPLOAD}">
<meta name="theme-color" content="#fdf8ef">
<link rel="manifest" href="/upload/manifest.webmanifest" crossorigin="use-credentials">
<link rel="icon" href="${asset('brand/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${asset('brand/app-192.png')}">
<link rel="stylesheet" href="/styles.css?v=${cssHash()}">
<script type="application/json" id="cfg">${JSON.stringify(uploadCfg).replace(/</g, '\\u003c')}</script>
<script src="/upload/app.js?v=${upJs()}" defer></script>
</head>
<body class="up">
<main id="main" class="up-main">
  <section class="screen" id="s-kid">
    <h1 class="up-h">${logo(false)}</h1>
    <p class="up-lead" id="kid-lead">Whose art is it?</p>
    <div class="outbox wobbly" id="outbox" hidden><p id="outbox-text"></p><button type="button" class="chip" id="outbox-send">Send now</button></div>
    <div class="up-kids">
      ${KIDS.map((k) => `<button type="button" class="big-button wobbly c-${k.color}" data-kid="${k.key}"><span class="big-icon">${ICONS[k.icon]}</span><span class="big-label">${esc(k.name)}</span></button>`).join('\n      ')}
      <button type="button" class="big-button wobbly c-yellow both-button" data-kid="both"><span class="big-label">Both, made together</span></button>
    </div>
    <p class="up-more"><button type="button" class="chip" id="recent">Recent uploads</button> <a class="linkish" href="/parent/">For parents</a></p>
    <nav class="up-look" aria-label="Look at the site"><p class="up-look-h">Look at the site</p>
      <ul>${TABS.map((n) => `<li><a class="tab c-${n.color}" href="${n.href}"><span class="tab-icon">${ICONS[n.icon]}</span><span class="tab-label">${esc(n.label)}</span></a></li>`).join('')}</ul>
    </nav>
  </section>

  <section class="screen" id="s-photos" hidden>
    <p><button type="button" class="linkish" id="back">← Back</button></p>
    <h1 class="up-h2" id="who"></h1>
    <div class="up-add">
      <label class="big-pick wobbly"><input type="file" id="take" accept="image/*" capture="environment"><span>📷 Take a photo</span></label>
      <label class="big-pick wobbly"><input type="file" id="pick" accept="image/*" multiple><span>🖼️ Choose photos</span></label>
      <button type="button" class="big-pick wobbly cam-open" id="cam-open" hidden><span>💡 Camera with light</span></button>
    </div>
    <label class="up-date">Date it was made <input type="date" id="date"></label>
    <p class="count" id="count"></p>
    <ul class="up-list" id="list"></ul>
    <div class="up-actions">
      <button type="button" class="save wobbly" id="save" disabled>Save</button>
      <button type="button" class="linkish" id="share" disabled>If Save will not work: share to the Drive app</button>
    </div>
    <p class="status" id="status" role="status" aria-live="polite"></p>
  </section>

  <section class="screen" id="s-edit" hidden>
    <h1 class="up-h2">Fix up the picture</h1>
    <div class="ed-wrap" id="ed-wrap">
      <canvas id="ed-canvas" class="ed-canvas" aria-label="The picture"></canvas>
      <div class="ed-box" id="ed-box" hidden><span data-h="tl"></span><span data-h="tr"></span><span data-h="bl"></span><span data-h="br"></span></div>
    </div>
    <div class="ed-tools">
      <button type="button" class="chip" id="ed-turn">↻ Turn</button>
      <button type="button" class="chip" id="ed-crop">✂ Crop</button>
      <button type="button" class="linkish" id="ed-reset">Start over</button>
    </div>
    <div class="ed-tools ed-looks" role="group" aria-label="Look">
      <button type="button" class="chip" data-look="auto" aria-pressed="false">Auto</button>
      <button type="button" class="chip" data-look="paper" aria-pressed="false">Paper white</button>
      <button type="button" class="chip" data-look="vivid" aria-pressed="false">Vivid</button>
      <button type="button" class="chip glow-chip" data-look="glow" aria-pressed="false">✨ Glow</button>
    </div>
    <div class="up-actions">
      <button type="button" class="save wobbly" id="ed-done">Done</button>
      <button type="button" class="linkish" id="ed-cancel">Cancel</button>
    </div>
    <p class="share-help">The untouched original is always saved too.</p>
  </section>

  <section class="screen cam" id="s-cam" hidden>
    <video id="cam-video" class="cam-video" playsinline muted autoplay></video>
    <p class="cam-note" id="cam-note" role="status"></p>
    <div class="cam-bar">
      <button type="button" class="chip" id="cam-light" aria-pressed="false" hidden>💡 Light</button>
      <button type="button" class="cam-shoot" id="cam-shoot" aria-label="Take the photo"></button>
      <button type="button" class="chip" id="cam-done">Done</button>
    </div>
  </section>

  <section class="screen" id="s-recent" hidden>
    <p><button type="button" class="linkish" id="recent-back">← Back</button></p>
    <h1 class="up-h2">Recent uploads</h1>
    <p class="share-help">Change a caption or date, star one to show it big, or put one away.</p>
    <ul class="up-list" id="recent-list"></ul>
    <h2 class="up-h3" id="deleted-h" hidden>Recently put away</h2>
    <p class="share-help" id="deleted-help">Kept for 30 days, then cleared from the site. The originals in Google Drive are never touched.</p>
    <ul class="up-list" id="deleted-list"></ul>
  </section>
</main>
</body>
</html>
`;
const manifest = {
  // The installed app opens on Add art, but its scope is the whole site, so the gallery pages open inside the app too.
  // id stays '/upload/' so the copy already on Jesse's phone updates instead of becoming a second app.
  id: '/upload/', name: site.siteName, short_name: 'Two Sisters', start_url: '/upload/', scope: '/', display: 'standalone',
  background_color: '#fdf8ef', theme_color: '#fdf8ef',
  icons: [{ src: '/assets/brand/app-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/brand/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
  // Shows "Add art" in the phone's Share list (for example from Google Photos). The service worker catches it.
  share_target: { action: '/upload/share', method: 'POST', enctype: 'multipart/form-data', params: { files: [{ name: 'photos', accept: ['image/*'] }] } },
};
// The service worker: keeps the app working with no signal, and receives pictures shared from other apps.
const swFonts = ['kalam-latin-700-normal', 'kalam-latin-400-normal', 'nunito-latin-600-normal', 'nunito-latin-800-normal'];
const swShell = ['/upload/', `/upload/app.js?v=${upJs()}`, `/styles.css?v=${cssHash()}`, '/upload/manifest.webmanifest',
  ...swFonts.map((f) => `/assets/fonts/${f}.woff2`),   // as the stylesheet asks for them
  asset('brand/favicon.svg'), asset('brand/app-192.png'), '/assets/brand/app-192.png', '/assets/brand/app-512.png'];
const swCode = fs.readFileSync(path.join(SRC, 'upload/sw.js'), 'utf8')
  .replace('__SHELL__', JSON.stringify(swShell))
  .replace('__VERSION__', crypto.createHash('sha1').update(JSON.stringify(swShell)).digest('hex').slice(0, 8));

// ---------- write ----------
fs.rmSync(DIST, { recursive: true, force: true });
for (const [rel, html] of Object.entries(pages)) {
  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
}
fs.cpSync(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true, filter: (p) => !p.endsWith('.gitkeep') });
fs.copyFileSync(path.join(SRC, 'styles.css'), path.join(DIST, 'styles.css'));
fs.copyFileSync(path.join(SRC, 'main.js'), path.join(DIST, 'main.js'));
fs.copyFileSync(path.join(SRC, 'parent.js'), path.join(DIST, 'parent.js'));
fs.copyFileSync(path.join(SRC, 'upload/app.js'), path.join(DIST, 'upload/app.js'));
fs.writeFileSync(path.join(DIST, 'upload/sw.js'), swCode);
fs.writeFileSync(path.join(DIST, 'upload/manifest.webmanifest'), JSON.stringify(manifest, null, 2));
// Unlisted: block every crawler. No sitemap on purpose.
// Print copies are also served one by one, for "Save this picture".
if (fs.existsSync(path.join(SRC, 'moments-print'))) fs.cpSync(path.join(SRC, 'moments-print'), path.join(DIST, 'moments'), { recursive: true });
for (const [rel, files] of Object.entries(momentZips)) { fs.mkdirSync(path.join(DIST, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(DIST, rel), zipStore(files)); }
fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Built ${Object.keys(pages).length} pages, ${episodes.length} episode(s) -> dist/`);
