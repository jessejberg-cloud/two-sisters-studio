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
// "Share this page": family logins only (main.js shows it). Makes a link to this one page and opens the phone's Share list.
const shareBtn = (key, label) => `<button type="button" class="share-page" data-share="${esc(key)}" data-label="${esc(label)}" hidden>📤 Share</button>`;
// Content-Security-Policy is set per page (a meta tag), so the upload app can talk to Google Drive
// while every other page can reach nothing outside this site.  (The upload app talks to Google Drive.)
const CSP_STRICT = "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'self'; object-src 'none'";
// Pages that talk to this site's own functions (login state, parent page, live galleries): still nothing outside.
const CSP_SELF = CSP_STRICT.replace("connect-src 'none'", "connect-src 'self'");
const CSP_LOGIN = CSP_STRICT.replace("form-action 'none'", "form-action 'self'");
const CSP_UPLOAD = "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; font-src 'self'; manifest-src 'self'; "
  + "connect-src 'self' https://www.googleapis.com; media-src 'self' blob:; "
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


// The home screen guide (build spec, 2026-11-25): a phone picture with the spot to tap circled, iPhone or Android, no words.
// main.js and app.js show it once per device, when someone arrives from a View link or an Invite.
const RING = '#e4572e';
function guidePic(os) {
  const phone = (x, inner) => `<g transform="translate(${x} 0)"><rect x="4" y="4" width="132" height="252" rx="20" fill="#fff" stroke="#2b2a33" stroke-width="5"/>`
    + `<rect x="16" y="30" width="108" height="196" rx="6" fill="#fdf8ef" stroke="#2b2a33" stroke-width="2"/>${inner}</g>`;
  const arrow = '<path d="M150 130 L182 130 M170 118 L184 130 L170 142" fill="none" stroke="#2b2a33" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>';
  const rows = (y0) => [0, 1, 2, 3].map((i) => `<rect x="28" y="${y0 + i * 30}" width="84" height="20" rx="5" fill="#ece4f7"/>`).join('');
  const ring = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${RING}" stroke-width="6"/>`;
  if (os === 'ios') {
    const share = '<g transform="translate(58 202)" fill="none" stroke="#2b6fd6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10 L4 22 L20 22 L20 10"/><path d="M12 2 L12 16 M6 8 L12 2 L18 8"/></g>';
    const add = '<g transform="translate(36 147)" fill="none" stroke="#2b2a33" stroke-width="3.5" stroke-linecap="round"><rect x="0" y="0" width="18" height="18" rx="4"/><path d="M9 4 L9 14 M4 9 L14 9"/></g>';
    return `<svg viewBox="0 0 330 260" role="img" aria-label="On iPhone: tap Share, then Add to Home Screen">${phone(0, `<rect x="16" y="196" width="108" height="30" fill="#ddeefa"/>${share}${ring(70, 212, 20)}`)}${arrow}`
      + `${phone(190, `${rows(54)}<rect x="28" y="144" width="84" height="24" rx="5" fill="#fff1c9"/>${add}${ring(45, 156, 20)}`)}</svg>`;
  }
  const dots = '<g fill="#2b2a33"><circle cx="112" cy="40" r="3.5"/><circle cx="112" cy="50" r="3.5"/><circle cx="112" cy="60" r="3.5"/></g>';
  const add = '<g transform="translate(34 115)" fill="none" stroke="#2b2a33" stroke-width="3.5" stroke-linecap="round"><rect x="2" y="0" width="14" height="22" rx="3"/><path d="M9 6 L9 16 M4 11 L14 11"/></g>';
  return `<svg viewBox="0 0 330 260" role="img" aria-label="On Android: tap the three dots, then Add to Home screen">${phone(0, `<rect x="16" y="30" width="108" height="40" fill="#ddeefa"/>${dots}${ring(112, 50, 18)}`)}${arrow}`
    + `${phone(190, `<rect x="28" y="54" width="84" height="20" rx="5" fill="#ece4f7"/><rect x="28" y="84" width="84" height="20" rx="5" fill="#ece4f7"/><rect x="28" y="114" width="84" height="26" rx="5" fill="#fff1c9"/>${add}${ring(44, 127, 20)}<rect x="28" y="150" width="84" height="20" rx="5" fill="#ece4f7"/>`)}</svg>`;
}
const homeGuide = () => `<dialog class="guide" id="guide" aria-label="Add to Home Screen">
  <div class="guide-pic" data-os="ios">${guidePic('ios')}</div>
  <div class="guide-pic" data-os="android" hidden>${guidePic('android')}</div>
  <p><button type="button" class="btn-big guide-skip">Skip</button></p>
</dialog>`;

function page({ key, title, body, section, bodyClass, csp = CSP_SELF, tabs = true, scripts = [], pre = [] }) {
  const fullTitle = title ? `${title} · ${site.siteName}` : site.siteName;
  const current = section || key;
  // The small ＋ on every page (Jesse, 2026-11-25): opens the app on the right screen for this page. main.js shows it
  // for family phones, households and the girls' tablets, never for friends on a share link.
  const addFor = kidByKey[current] ? `?add=art&kid=${current}` : current === 'family-moments' ? '?add=day'
    : current === 'pet-parents' ? '?add=episode' : current === 'households' ? '?add=house' : '';
  const fab = tabs && key !== 'parent' ? `<a class="add-fab" href="/upload/${addFor}" data-add="${addFor}" hidden><span aria-hidden="true">＋</span><span class="add-fab-label">Add</span></a>` : '';
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
<link rel="icon" href="${asset('brand/app-192.png')}" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${asset('brand/apple-touch-icon.png')}">
<link rel="preload" href="${asset('fonts/kalam-latin-700-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${asset('fonts/nunito-latin-600-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=${cssHash()}">
${pre.map((f) => `<script src="/${f}?v=${fileHash(f)}" defer></script>`).join('\n')}
<script src="/main.js?v=${jsHash()}" defer></script>
${scripts.map((f) => `<script src="/${f}?v=${fileHash(f)}" defer></script>`).join('\n')}
</head>
<body class="page-${key}${section ? ' in-' + section : ''}${bodyClass ? ' ' + bodyClass : ''}">
<a class="skip" href="#main">Skip to the main part</a>
<header class="site-header">
  <a class="brand" href="/">${logo(false)}</a>
  ${tabs ? '' : '<!--'}<nav aria-label="Main"><ul class="tabs">${nav}<li class="tab-houses-li" hidden><a class="tab c-sky tab-houses" href="/households/"${current === 'households' ? ' aria-current="page"' : ''}><span class="tab-icon">${ICONS.home}</span><span class="tab-label">More family</span></a></li><li class="tab-add-li"><a class="tab tab-add" href="/upload/"><span class="tab-icon" aria-hidden="true">＋</span><span class="tab-label">Add art</span></a></li><li class="tab-fam-li" hidden><button type="button" class="tab tab-fam c-sky" aria-haspopup="dialog"><span class="tab-icon">${ICONS.home}</span><span class="tab-label">Family</span></button></li></ul></nav>${tabs ? '' : '-->'}
</header>
<main id="main">
${body}
</main>
${fab}
${tabs ? homeGuide() : ''}
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

// What main.js needs to draw a hand-added episode next to the ones added from the app.
const epData = (ep) => ({ number: ep.number, title: ep.title, date: ep.date, minutes: ep.minutes || null, description: ep.description || '',
  guests: ep.guests || [], pets: ep.pets || [], href: `${PP}/episodes/${ep.number}/`, audio: asset(ep.audio),
  drawing: ep.drawing ? asset(ep.drawing) : '', drawingSm: ep.drawing ? asset(ep.drawing) : '', w: ep.drawingW || 800, h: ep.drawingH || 800 });

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
  <figure class="lb-fig"><img class="lb-img" alt=""><figcaption><span class="lb-cap"></span><span class="lb-label"></span><span class="lb-more"></span><span class="lb-tools"><button type="button" class="lb-full">⛶ Full screen</button><a class="lb-pdf" href="#" target="_blank" rel="noopener" hidden>📄 Open the PDF</a><button type="button" class="lb-save">⬇ Save this picture</button><button type="button" class="lb-share" hidden>📤 Share</button></span></figcaption></figure>
  <button type="button" class="lb-next" aria-label="Next picture">›</button>
</dialog>
${livePhotos(`/api/pieces?kid=${kid.key}&section=photos`, `${kid.name}'s snapshots`, '', 'snapshots')}`;
}

// Photos from the girls' tablets (shown after a parent says OK). Drawn by main.js; stays hidden while empty.
function livePhotos(src, title, note, id = '') {
  return `<section class="live-photos"${id ? ` id="${id}"` : ''} data-src="${esc(src)}" hidden>
  <h2 class="live-h">${esc(title)}</h2><p class="live-note">${esc(note)}</p>
  <ul class="photo-grid"></ul>
  <dialog class="photo-box" aria-label="Photo">
    <button type="button" class="pb-close" aria-label="Close">✕</button>
    <button type="button" class="pb-prev" aria-label="Previous photo">‹</button>
    <figure class="pb-fig"><img class="pb-img" alt=""><figcaption class="pb-cap"></figcaption>
      <p class="pb-tools"><button type="button" class="pb-full">⛶ Full screen</button><button type="button" class="pb-save">⬇ Save this picture</button><button type="button" class="pb-share" hidden>📤 Share</button></p></figure>
    <button type="button" class="pb-next" aria-label="Next photo">›</button>
  </dialog>
</section>`;
}

// ---------- pages ----------
const pages = {};

// Welcome: one big button per tab.
pages['index.html'] = page({
  key: 'welcome',
  title: '',
  body: `<section class="welcome">
  <h1 class="hero-logo">${logo(true)}</h1>
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
    body: `<div class="page-head"><h1>${esc(kid.name)}'s Art</h1>${shareBtn(kid.key, `${kid.name}'s Art`)}</div>
<p class="snap-jump" hidden><a class="chip" href="#snapshots">📷 ${esc(kid.name)}'s snapshots</a></p>
${artGallery(kid, items)}`,
  });
}

pages['pet-parents/index.html'] = page({
  key: 'podcast',
  section: 'pet-parents',
  title: site.podcastName,
  csp: CSP_SELF,
  body: `${podcastNav('episodes')}
<section class="hero">
  <h1 class="hero-logo">${podcastMark()}</h1>
  ${shareBtn('pet-parents', site.podcastName)}
  <div class="hero-art">${drawing('hero')}</div>
</section>
<div class="pp-live" data-empty="${episodes.length ? '' : '1'}">
${episodes.length ? latestBlock(episodes[0]) : comingSoon()}
${pastList(episodes.slice(1))}
</div>
<script type="application/json" id="pp-static">${JSON.stringify(episodes.map(epData)).replace(/</g, '\\u003c')}</script>
<template id="ep-paw">${ICONS.paw}</template>`,
});

// Episodes added from the app live in the site's storage; this one page shows any of them (?id=...), drawn by main.js.
pages['pet-parents/episode/index.html'] = page({
  key: 'episode',
  section: 'pet-parents',
  title: 'Episode',
  csp: CSP_SELF,
  body: `<article class="episode ep-live" aria-live="polite">
  <p class="back"><a href="${PP}/">← All episodes</a></p>
  <p class="ep-loading">Getting the episode…</p>
</article>
<template id="ep-paw">${ICONS.paw}</template>`,
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
    return `<section class="moment" id="${esc(ev.key)}" data-date="${esc(ev.date)}">
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
    csp: CSP_SELF,   // the girls' photos and the videos load from this site's own functions
    body: `<div class="page-head"><h1>Family Moments</h1>${shareBtn('family-moments', 'Family Moments')}</div>
${livePhotos('/api/pieces?section=moments', `From ${listWords(KIDS.map((k) => k.name))}`, '')}
${events.length ? `${jump}
<div class="gallery-area" data-videos="/api/videos">
${blocks}
</div>
<dialog class="lightbox" aria-label="Photo">
  <button type="button" class="lb-close" aria-label="Close">✕</button>
  <button type="button" class="lb-prev" aria-label="Previous photo">‹</button>
  <figure class="lb-fig"><img class="lb-img" alt=""><figcaption><span class="lb-cap"></span><span class="lb-label"></span><span class="lb-tools"><button type="button" class="lb-full">⛶ Full screen</button><button type="button" class="lb-save">⬇ Save this picture</button><button type="button" class="lb-share" hidden>📤 Share</button></span></figcaption></figure>
  <button type="button" class="lb-next" aria-label="Next photo">›</button>
</dialog>` : `<div class="gallery-area" data-videos="/api/videos" hidden></div>
${gallery([], 'Family photos will show up here soon!')}
<dialog class="lightbox" aria-label="Photo">
  <button type="button" class="lb-close" aria-label="Close">✕</button>
  <button type="button" class="lb-prev" aria-label="Previous photo">‹</button>
  <figure class="lb-fig"><img class="lb-img" alt=""><figcaption><span class="lb-cap"></span><span class="lb-label"></span><span class="lb-tools"><button type="button" class="lb-full">⛶ Full screen</button><button type="button" class="lb-save">⬇ Save this picture</button><button type="button" class="lb-share" hidden>📤 Share</button></span></figcaption></figure>
  <button type="button" class="lb-next" aria-label="Next photo">›</button>
</dialog>`}`,
  });
}

// ---------- More family (Jesse, 2026-11-25): each household's own photos (Grandma's photos, ...) ----------
// main.js draws one section per household: a household's phone sees only its own; family phones see all of them.
pages['households/index.html'] = page({
  key: 'households', title: 'More family', csp: CSP_SELF, bodyClass: 'c-sky',
  body: `<div class="page-head"><h1 id="houses-h">More family</h1></div>
<p class="houses-lead" id="houses-lead">Photos from Grandma, aunts, uncles and cousins.</p>
<p class="houses-add" id="houses-add" hidden><a class="btn-big" href="/upload/">📷 Add photos</a></p>
<p class="houses-mine muted" id="houses-mine" hidden>That was an invite link for someone else. This phone is already logged in as family, so nothing changed.</p>
<div id="houses-area"><p class="loading">Getting the pictures…</p></div>
<template id="house-tpl">${livePhotos('', '', '', '')}</template>`,
});

// ---------- a family's studio (build spec, 2026-11-25): /<slug>/, /<slug>/<kid>/, /<slug>/family-moments/, /<slug>/for-parents/ ----------
// One page for every studio (netlify.toml sends every address with no file of its own here). studio.js runs before
// main.js: it reads the address, puts the right template on the page, and fills in the studio's names and tabs.
const lightboxTpl = `<dialog class="lightbox" aria-label="Photo">
  <button type="button" class="lb-close" aria-label="Close">✕</button>
  <button type="button" class="lb-prev" aria-label="Previous photo">‹</button>
  <figure class="lb-fig"><img class="lb-img" alt=""><figcaption><span class="lb-cap"></span><span class="lb-label"></span><span class="lb-tools"><button type="button" class="lb-full">⛶ Full screen</button><button type="button" class="lb-save">⬇ Save this picture</button><button type="button" class="lb-share" hidden>📤 Share</button></span></figcaption></figure>
  <button type="button" class="lb-next" aria-label="Next photo">›</button>
</dialog>`;
// Category ideas (Jesse, 2026-11-25): each comes with its template: 📄 paper gets the scan fix, the rest are plain photos.
const CAT_IDEAS = [{ name: 'School papers', icon: '📄', scan: true }, { name: 'Awards', icon: '🏅', scan: true }, { name: 'Stories', icon: '📝', scan: true },
  { name: 'Lego and builds', icon: '🧱', scan: false }, { name: 'Crafts', icon: '✂️', scan: false }, { name: 'Sports', icon: '⚽', scan: false }];
const ideasJson = `<script type="application/json" id="cat-ideas">${JSON.stringify(CAT_IDEAS)}</script>`;
const swatches = (name) => ['coral', 'lav', 'mint', 'yellow', 'sky'].map((c, i) => `<label class="swatch c-${c}"><input type="radio" name="${name}" value="${c}"${i === 4 ? ' checked' : ''}><span class="sr">${c}</span></label>`).join('');
pages['studio/index.html'] = page({
  key: 'studio', title: '', tabs: false, pre: ['studio.js'],
  body: `<div id="studio-root"><p class="loading">…</p></div>
<template id="tpl-home"><section class="welcome"><h1 class="hero-logo studio-name"></h1><ul class="big-buttons" id="studio-buttons"></ul></section></template>
<template id="tpl-kid"><div class="page-head"><h1 class="studio-kid-h"></h1></div>
${artGallery({ key: '', name: '' }, []).replace('<div class="art-live" data-kid="" data-name="" data-empty="\'s art will show up here soon!"></div>', '<div class="art-live" data-kid="" data-name="" data-empty=""></div>')}</template>
<template id="tpl-moments"><div class="page-head"><h1>Family Moments</h1></div>
${livePhotos('', '', '')}
<div class="gallery-area" data-videos="" hidden></div>
<div class="empty wobbly"><p>Nothing here yet.</p></div>
${lightboxTpl}</template>
<template id="tpl-parents"><div class="page-head"><h1>For parents</h1></div>
<section class="parent-pin wobbly" id="pin-box">
  <p>PIN</p>
  <div class="pin-row"><input id="pin" type="password" inputmode="numeric" autocomplete="off" aria-label="PIN"><button type="button" class="btn-big" id="pin-go">Open</button></div>
  <p class="login-error" id="pin-msg" hidden></p>
</section>
<div id="parent-tools" hidden>
  <section class="parent-card wobbly heads" id="heads-card" hidden><h2>Heads-up</h2><ul class="link-list" id="heads-list"></ul></section>
  <section class="parent-card wobbly" id="skipped-card" hidden><h2>Not done yet</h2><ul class="link-list" id="skipped-list"></ul></section>
  <section class="parent-card wobbly" id="studio-links">
    <h2>Links</h2>
    <div class="slink" data-link="view"><h3>👀 View</h3><p class="share-help">To look. Nobody can add with it.</p><p class="link-url" data-url></p>
      <div class="send-row"><button type="button" class="btn-big" data-act="share">📤 Send</button><button type="button" class="chip" data-act="copy">📋 Copy</button><button type="button" class="linkish" data-act="reset">New link</button></div><p class="share-help" data-note role="status"></p></div>
    <div class="slink" data-link="invite"><h3>📷 Invite</h3><p class="share-help">For a phone in your family that adds pictures. It opens the app.</p><p class="link-url" data-url></p>
      <div class="send-row"><button type="button" class="btn-big" data-act="share">📤 Send</button><button type="button" class="chip" data-act="copy">📋 Copy</button><button type="button" class="linkish" data-act="reset">New link</button></div><p class="share-help" data-note role="status"></p></div>
    <p class="share-help">Links never end. New link stops the old one; the other link keeps working.</p>
  </section>
  <section class="parent-card wobbly" id="shared-card"><h2>Shared pictures</h2><p class="share-help">Links to one picture or one day. Anyone with the link sees just that.</p><ul class="link-list" id="shared-list"><li class="muted">None yet.</li></ul></section>
  <section class="parent-card wobbly"><h2>Phones</h2><p class="share-help">A kid's name hides Put away and For parents on that phone.</p><ul class="link-list" id="phone-list"></ul></section>
  <section class="parent-card wobbly" id="kids-card"><h2>Artists</h2><p class="share-help">Kids, grown-ups or pets. Only kids have a grade.</p><ul class="kid-edit" id="kid-list"></ul>
    <p><button type="button" class="chip" id="kid-add">＋ Add</button> <button type="button" class="btn-big" id="kids-save">Save</button></p><p class="share-help" id="kids-msg" role="status"></p></section>
  <section class="parent-card wobbly" id="cats-card"><h2>Categories</h2><p class="share-help">Beside Artwork, Snapshots and Family Moments. 📄 Paper gets the scan fix. 📷 Photo stays a plain picture.</p><ul class="kid-edit" id="cat-list"></ul>
    <p><button type="button" class="chip" id="cat-add">＋ Add</button> <button type="button" class="btn-big" id="cats-save">Save</button></p><p class="share-help" id="cats-msg" role="status"></p></section>
  <section class="parent-card wobbly"><h2>Name</h2><div class="pw-row"><label>Studio <input type="text" id="studio-name" maxlength="40"></label><button type="button" class="chip" id="name-save">Save</button></div>
    <h2>Color</h2><div class="swatches" id="look">${swatches('look')}</div><p class="share-help" id="look-msg" role="status"></p></section>
  <section class="parent-card wobbly" id="export-card"><h2>Download everything</h2><p class="share-help" id="export-size">Every picture as one zip, in a folder per artist. Videos and full-size originals are in Google Drive.</p><p><button type="button" class="btn-big" id="export-go">⬇ Download everything</button></p><p class="share-help" id="export-msg" role="status"></p></section>
  <section class="parent-card wobbly"><h2>Google Drive</h2><p id="g-status">…</p><p><a class="btn-big" id="g-connect" href="#">Connect Google Drive</a></p></section>
  <section class="parent-card wobbly"><h2>PIN</h2><div class="pw-row"><label>New PIN (4 numbers) <input type="text" id="new-pin" inputmode="numeric" maxlength="4" autocomplete="off"></label><button type="button" class="chip" id="pin-save">Change</button></div><p class="share-help" id="pin-save-msg" role="status"></p></section>
</div></template>
<template id="tpl-none"><section class="empty wobbly"><p>This page is not here.</p><p><a class="btn-big" href="/">Home</a></p></section></template>`,
});

// ---------- onboarding (build spec): a family makes its own studio from Jesse's invite. One word per label ----------
const gradeOptions = ['', 'Pre-K', 'K4', 'K5', '1st grade', '2nd grade', '3rd grade', '4th grade', '5th grade', '6th grade', '7th grade', '8th grade', '9th grade', '10th grade', '11th grade', '12th grade']
  .map((g) => `<option value="${esc(g)}">${g ? esc(g) : 'Grade'}</option>`).join('');
pages['start/index.html'] = page({
  key: 'start', title: '', tabs: false, scripts: ['start.js'],
  body: `<div class="start">
  <section class="step" data-step="1">
    <label class="st-label">Studio <input type="text" id="st-name" maxlength="40" autocomplete="off" enterkeyhint="next"></label>
    <p class="st-label">Artists</p>
    <p class="share-help st-help">Kids, grown-ups or pets.</p>
    <ul class="st-kids" id="st-kids"></ul>
    <template id="st-kid"><li class="st-kid"><input type="text" maxlength="30" autocomplete="off" aria-label="Name"><select aria-label="Who" class="st-kind"><option value="kid">Kid</option><option value="adult">Grown-up</option><option value="pet">Pet</option></select><select aria-label="Grade" class="st-grade">${gradeOptions}</select></li></template>
    <p><button type="button" class="linkish st-more" id="st-more">＋ Add someone</button></p>
    <p><button type="button" class="linkish st-more" id="st-cats-open" aria-expanded="false">＋ Categories (optional)</button></p>
    <div class="st-cats-box" id="st-cats-box" hidden>
      <p class="share-help">Artwork, Snapshots and Family Moments are there already. Tap to add more.</p>
      <div class="idea-chips" id="st-ideas"></div>
      <div class="own-row"><input type="text" id="st-own" maxlength="30" autocomplete="off" placeholder="Your own" aria-label="Your own category"><label class="paper-q"><input type="checkbox" id="st-own-paper"> On paper</label><button type="button" class="linkish" id="st-own-add">Add</button></div>
    </div>
    ${ideasJson}
    <p class="st-nav"><button type="button" class="linkish" data-next>Skip</button> <button type="button" class="btn-big" data-next>→</button></p>
  </section>
  <section class="step" data-step="2" hidden>
    <p class="st-label">PIN</p>
    <div class="pin-dots" id="pin-dots" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    <input type="password" id="st-pin" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN" class="st-pin">
    <div class="swatches" id="st-color">${swatches('st-color')}</div>
    <p class="login-error" id="st-msg" hidden></p>
    <p class="st-nav"><button type="button" class="linkish" data-back>←</button> <button type="button" class="btn-big" id="st-make">→</button></p>
  </section>
  <section class="step" data-step="3" hidden>
    <p class="st-label">Drive</p>
    <p><a class="btn-big st-drive" id="st-drive" href="#"><span aria-hidden="true">☁️</span> Google Drive</a></p>
    <p class="login-error" id="st-drive-msg" hidden></p>
  </section>
  <section class="step" data-step="4" hidden>
    <div class="st-links">
      <button type="button" class="big-button wobbly c-mint" data-copy="invite"><span class="big-icon" aria-hidden="true">📋</span><span class="big-label">Invite</span></button>
      <button type="button" class="big-button wobbly c-sky" data-copy="view"><span class="big-icon" aria-hidden="true">📋</span><span class="big-label">View</span></button>
    </div>
    <p class="share-help st-copied" id="st-copied" role="status"></p>
    <p class="st-nav"><button type="button" class="linkish" data-next>Skip</button> <button type="button" class="btn-big" data-next>→</button></p>
  </section>
  <section class="step" data-step="5" hidden>
    <div class="guide-pic" data-os="ios">${guidePic('ios')}</div>
    <div class="guide-pic" data-os="android" hidden>${guidePic('android')}</div>
    <p class="st-nav"><button type="button" class="linkish" data-next>Skip</button> <button type="button" class="btn-big" data-next>→</button></p>
  </section>
  <section class="step" data-step="6" hidden>
    <p><a class="btn-big st-camera" id="st-camera" href="/upload/"><span aria-hidden="true">📷</span></a></p>
  </section>
  <section class="step" data-step="0" hidden><p class="empty wobbly">This link was turned off. Ask for a new one.</p></section>
</div>`,
});

// ---------- a shared link (studios batch 3): one picture, a few, or one day. No login: the link is the key ----------
pages['shared/index.html'] = page({
  key: 'shared', title: '', tabs: false, scripts: ['shared.js'],
  body: `<section class="shared-page">
  <h1 class="shared-h" id="shared-h"></h1>
  <p class="moment-date" id="shared-date"></p>
  <p class="shared-wait" id="shared-wait">Getting the pictures…</p>
  <div class="video-row" id="shared-videos"></div>
  <div class="masonry shared-grid" id="shared-grid"></div>
  <p class="empty" id="shared-off" hidden>This link was turned off. Ask for a new one.</p>
</section>
<dialog class="lightbox shared-box" aria-label="Picture">
  <button type="button" class="lb-close" aria-label="Close">✕</button>
  <figure class="lb-fig"><img class="lb-img" alt=""><figcaption><span class="lb-cap"></span><span class="lb-tools"><button type="button" class="lb-full">⛶ Full screen</button><button type="button" class="lb-save">⬇ Save this picture</button></span></figcaption></figure>
  <button type="button" class="lb-prev" aria-label="The picture before">‹</button><button type="button" class="lb-next" aria-label="The next picture">›</button>
</dialog>`,
});

// ---------- login (the gate sends everyone without a login here) ----------
pages['login/index.html'] = page({
  key: 'login', title: 'Log in', csp: CSP_LOGIN, tabs: false,
  body: `<section class="login wobbly">
  <!-- One box (build spec, 2026-11-25): paste the link you were sent. Old passwords (the girls' tablets) still work here too. -->
  <form class="login-form" method="post" action="/api/login">
    <label for="pw">Your link</label>
    <input id="pw" name="password" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url" required autofocus>
    <input type="hidden" name="next" value="/">
    <input type="hidden" name="kind" value="family">
    <button type="submit" class="btn-big">Open</button>
    <p class="login-error" data-e="pw" hidden>That did not work. Paste the whole link?</p>
    <p class="login-error" data-e="wait" hidden>Too many tries. Please wait 15 minutes and try again.</p>
    <p class="login-error" data-e="link" hidden>This link was turned off. Ask for a new one.</p>
    <p class="login-error" data-e="invite" hidden>This link was turned off. Ask for a new one.</p>
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
  <section class="parent-card wobbly" id="studio-links">
    <h2>Links</h2>
    <div class="slink" data-link="view">
      <h3>👀 View</h3>
      <p class="share-help">To look. Nobody can add with it.</p>
      <p class="link-url" data-url></p>
      <div class="send-row"><button type="button" class="btn-big" data-act="share">📤 Send</button><button type="button" class="chip" data-act="copy">📋 Copy</button><button type="button" class="linkish" data-act="reset">New link</button></div>
      <p class="share-help" data-note role="status"></p>
    </div>
    <div class="slink" data-link="invite">
      <h3>📷 Invite</h3>
      <p class="share-help">For a phone that adds pictures. It opens the app.</p>
      <p class="link-url" data-url></p>
      <div class="send-row"><button type="button" class="btn-big" data-act="share">📤 Send</button><button type="button" class="chip" data-act="copy">📋 Copy</button><button type="button" class="linkish" data-act="reset">New link</button></div>
      <p class="share-help" data-note role="status"></p>
    </div>
    <p class="share-help">Links never end. New link stops the old one; the other link keeps working.</p>
  </section>
  <section class="parent-card wobbly" id="owner-card" hidden>
    <h2>Families</h2>
    <p class="share-help">Invite a family to make their own studio. They pick the name, kids, PIN and connect their own Google Drive. Only you see this card (owner PIN).</p>
    <div class="pw-row"><label>Who is it for? <input type="text" id="fam-name" maxlength="40" autocomplete="off" placeholder="The Smiths"></label><button type="button" class="btn-big" id="fam-make">Make an invite</button></div>
    <p class="share-help" id="fam-msg" role="status"></p>
    <h3>Invites</h3><ul class="link-list" id="fam-invites"><li class="muted">None yet.</li></ul>
    <h3>Studios</h3><ul class="link-list" id="fam-studios"></ul>
  </section>
  <section class="parent-card wobbly" id="phones-card">
    <h2>Phones</h2>
    <p class="share-help">Phones that add pictures with the Invite. A kid's name hides Put away and For parents on that phone.</p>
    <ul class="link-list" id="phone-list"><li class="muted">None yet.</li></ul>
  </section>
  <section class="parent-card wobbly" id="waiting-card">
    <h2>Photos waiting for your OK</h2>
    <p>Photos from the girls' tablets show on the site after you tap OK.</p>
    <ul class="wait-list" id="wait-list"><li class="muted">None waiting.</li></ul>
  </section>
  <section class="parent-card wobbly" id="tablets-card">
    <h2>The girls' tablets</h2>
    <p>Each girl's tablet logs in with her own tablet password. She can look at the site and take snapshots. Her snapshots wait for your OK. She cannot delete or change anything.</p>
    ${KIDS.map((k) => `<div class="tablet-row" data-tablet="${k.key}">
      <h3>${esc(k.name)}</h3>
      <p class="tablet-state muted">Checking…</p>
      <div class="pw-row"><label>${esc(k.name)}'s tablet password (4 or more letters or numbers) <input type="text" id="pw-kid-${k.key}" autocomplete="off" spellcheck="false"></label><button type="button" class="chip" data-change="kid-${k.key}">Set</button></div>
      <label class="tick"><input type="checkbox" data-moments="${k.key}"> Can see Family Moments and add photos to it</label>
    </div>`).join('\n    ')}
    <p class="share-help" id="tablet-msg" role="status"></p>
    ${fs.existsSync(path.join(SRC, 'assets/app/two-sisters-studio.apk')) ? `<h3>The tablet app</h3>
    <p>Amazon Kids' own browser cannot take or pick photos, so the girls use this small app. Open this page on the tablet in your own profile and download it.</p>
    <p><a class="btn-big" href="/assets/app/two-sisters-studio.apk" download="two-sisters-studio.apk">⬇ Download the tablet app</a></p>` : ''}
    <p class="share-help">On her tablet: open the app (or the site), type her tablet password, and it stays logged in.</p>
  </section>
  <section class="parent-card wobbly">
    <h2>Google Drive</h2>
    <p id="g-status">Checking…</p>
    <p><a class="btn-big" id="g-connect" href="/api/google/start">Connect Google Drive</a></p>
  </section>
  <section class="parent-card wobbly" id="houses-card" hidden>
    <h2>Family who add photos (older invites)</h2>
    <p class="share-help">These invites still work. New family members now get the Invite link above, or their own studio.</p>
    <div class="old-make" hidden>
    <p>Give Grandma, an aunt or a cousin their own invite link. They tap it once on their phone and they are in, with no password, for as long as they keep visiting. They get their own page (for example "Grandma's photos") and can add photos and videos to the special days on Family Moments. Their photos show right away. You can put any of them away from Recent uploads in the app.</p>
    <label class="house-name">Who is it for? <input type="text" id="house-name" maxlength="40" autocomplete="off" placeholder="Grandma"></label>
    <fieldset class="ticks"><legend>What else they can see</legend>
      ${TABS.filter((n) => n.key !== 'family-moments').map((n) => `<label class="tick"><input type="checkbox" name="house-pages" value="${n.key}"> ${esc(n.label)}</label>`).join('\n      ')}
      <p class="share-help">Family Moments and their own page are always on.</p>
    </fieldset>
    <p><button type="button" class="btn-big" id="house-make">Make an invite link</button></p>
    <p class="login-error" id="house-msg" hidden></p>
    </div>
    <h3>Invites</h3>
    <ul class="link-list house-list" id="house-list"><li class="muted">None yet.</li></ul>
    <p class="share-help">On an iPhone: after tapping the link, they can tap Share, then Add to Home Screen, to get an app button. If that app ever asks for a password, they paste the invite link into the box.</p>
  </section>
  <section class="parent-card wobbly" id="share-card">
    <h2>Share links</h2>
    <p class="share-help">Links made with Share this page. Each opens one page. Turn any of them off here.</p>
    <div class="old-make" hidden>
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
      <div class="send-row"><button type="button" class="btn-big" id="send-link">Send link</button></div>
      <p class="share-help" id="send-note"></p>
    </div>
    </div>
    <h3>Links</h3>
    <ul class="link-list" id="link-list"><li class="muted">None yet.</li></ul>
  </section>
  <section class="parent-card wobbly" id="shared-card"><h2>Shared pictures</h2><p class="share-help">Links to one picture or one day. Anyone with the link sees just that.</p><ul class="link-list" id="shared-list"><li class="muted">None yet.</li></ul></section>
  <section class="parent-card wobbly">
    <h2>Parent PIN</h2>
    <div class="pw-row"><label>Parent PIN (4 to 8 numbers) <input type="text" id="pw-pin" inputmode="numeric" autocomplete="off"></label><button type="button" class="chip" data-change="pin">Change</button></div>
    <div class="pw-row"><label>Owner PIN: yours only, opens For parents in every family's studio (4 to 8 numbers) <input type="text" id="pw-owner" inputmode="numeric" autocomplete="off"></label><button type="button" class="chip" data-change="owner">Set</button></div>
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
  // Family Moments events already on the page, so a video can join one of them.
  moments: moments.filter((ev) => !ev.sample).map((ev) => ({ key: ev.key, title: ev.title, date: ev.date })),
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
<link rel="icon" href="${asset('brand/app-192.png')}" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${asset('brand/app-192.png')}">
<link rel="stylesheet" href="/styles.css?v=${cssHash()}">
<script type="application/json" id="cfg">${JSON.stringify(uploadCfg).replace(/</g, '\\u003c')}</script>
<script src="/upload/app.js?v=${upJs()}" defer></script>
</head>
<body class="up">
<main id="main" class="up-main">
  <section class="screen" id="s-kid">
    <h1 class="up-h">${logo(false)}</h1>
    <div class="outbox wobbly" id="outbox" hidden><p id="outbox-text"></p><button type="button" class="chip" id="outbox-send">Send now</button></div>
    <div class="outbox wobbly waiting-bar" id="waiting-bar" hidden><p id="waiting-text"></p><button type="button" class="chip" id="waiting-ok">✓ OK all</button> <a class="linkish" href="/parent/">Look first</a></div>
    <!-- Home (build spec, 2026-11-25): one big button per kid, then Family Moments. Drawn by app.js from the studio. -->
    <div class="up-kids up-what" id="home-buttons">
      ${KIDS.map((k) => `<button type="button" class="big-button wobbly c-${k.color}" data-home="${k.key}"><span class="big-icon">${ICONS[k.icon]}</span><span class="big-label">${esc(k.name)}</span></button>`).join('\n      ')}
    </div>
    <p class="up-extra" id="home-extra"><button type="button" class="chip" data-what="both">🤝 Both</button> <button type="button" class="chip" data-what="episode">🎙️ Podcast</button></p>
    <p class="up-more"><a class="chip" id="home-site" href="/">🏠 Site</a> <button type="button" class="chip" id="recent">🕘 Recent</button> <button type="button" class="chip" id="quick-toggle" aria-pressed="false" title="Open on the camera">⚡ Quick</button> <a class="chip" id="home-parents" href="/parent/">🔒 Parents<span class="dot-heads" id="heads-dot" hidden></span></a></p>
  </section>

  <section class="screen" id="s-pick" hidden>
    <p><button type="button" class="linkish" id="pick-back">← Back</button></p>
    <h1 class="up-h2" id="pick-who"></h1>
    <div class="up-kids up-what">
      <button type="button" class="big-button wobbly c-coral" data-pick="art"><span class="big-icon">${ICONS.palette}</span><span class="big-label">Artwork</span></button>
      <button type="button" class="big-button wobbly c-mint" data-pick="photos"><span class="big-icon" aria-hidden="true">📷</span><span class="big-label">A snapshot</span></button>
      <button type="button" class="big-button wobbly c-yellow" data-pick="moment"><span class="big-icon">${ICONS.heart}</span><span class="big-label">Family Moments</span></button>
      <button type="button" class="big-button wobbly c-sky vid-only" data-pick="video"><span class="big-icon" aria-hidden="true">🎬</span><span class="big-label">A video</span></button>
    </div>
    <p class="pick-more"><button type="button" class="linkish" id="pick-more" hidden>More…</button> <button type="button" class="linkish" id="pick-new" hidden>＋ Something else</button></p>
  </section>

  <section class="screen" id="s-newcat" hidden>
    <p><button type="button" class="linkish" id="newcat-back">← Back</button></p>
    <h1 class="up-h2">Something else</h1>
    <div class="idea-chips idea-big" id="newcat-ideas"></div>
    <div class="own-row"><input type="text" id="newcat-own" maxlength="30" autocomplete="off" placeholder="Your own" aria-label="Your own category"></div>
    <div class="newcat-paper" id="newcat-paper" hidden><p class="up-lead">Is it on paper?</p>
      <p><button type="button" class="btn-big" data-paper="1">Yes</button> <button type="button" class="btn-big" data-paper="">No</button></p></div>
    <p class="share-help" id="newcat-msg" role="status"></p>
    ${ideasJson}
  </section>

  <section class="screen" id="s-name" hidden>
    <h1 class="up-h">${logo(false)}</h1>
    <p class="up-lead">Who?</p>
    <div class="up-kids name-faces" id="name-faces"></div>
    <div class="name-own"><label>Name <input type="text" id="name-own" maxlength="30" autocomplete="given-name" enterkeyhint="done"></label><button type="button" class="btn-big" id="name-ok">OK</button></div>
  </section>

  <section class="screen" id="s-kidhome" hidden>
    <h1 class="up-h">${logo(false)}</h1>
    <p class="up-lead">What do you want to add?</p>
    <div class="up-kids up-what">
      <button type="button" class="big-button wobbly c-coral" data-kidwhat="art"><span class="big-icon">${ICONS.palette}</span><span class="big-label">My art<small>Something I drew, painted or made</small></span></button>
      <button type="button" class="big-button wobbly c-mint" data-kidwhat="photos"><span class="big-icon" aria-hidden="true">📷</span><span class="big-label">A snapshot<small>A photo I took</small></span></button>
    </div>
    <p class="kid-look kid-look-home"><a class="chip kid-page" href="/">🎨 See my page</a> <a class="chip" href="/">🏠 Look at the site</a></p>
  </section>

  <section class="screen" id="s-househome" hidden>
    <h1 class="up-h">${logo(false)}</h1>
    <div class="outbox wobbly welcome-box" id="welcome" hidden>
      <p class="welcome-h">Welcome<span id="welcome-name"></span>! You are in. No password needed.</p>
      <div class="ios-tip" id="ios-tip" hidden>
        <p>To get an app button: tap <strong>Share</strong> <span aria-hidden="true">⬆️</span> at the bottom of Safari, then <strong>Add to Home Screen</strong>.</p>
        <p class="share-help">If the app button ever asks for a password, paste your invite link in the box. <button type="button" class="chip" id="copy-invite">📋 Copy my invite link</button></p>
      </div>
    </div>
    <p class="up-lead">What do you want to add?</p>
    <div class="up-kids up-what">
      <button type="button" class="big-button wobbly c-sky" data-housewhat="house"><span class="big-icon" aria-hidden="true">📷</span><span class="big-label"><span id="house-own">My photos</span><small>On your own page</small></span></button>
      <button type="button" class="big-button wobbly c-yellow" data-housewhat="day"><span class="big-icon" aria-hidden="true">❤️</span><span class="big-label">A special day<small>Photos and videos for Family Moments</small></span></button>
    </div>
    <p class="kid-look kid-look-home"><a class="chip" href="/households/">🏡 See my page</a> <a class="chip" href="/">🏠 Look at the site</a></p>
  </section>

  <section class="screen" id="s-who" hidden>
    <p><button type="button" class="linkish" id="who-back">← Back</button></p>
    <p class="up-lead" id="who-lead">Whose art is it?</p>
    <div class="up-kids">
      ${KIDS.map((k) => `<button type="button" class="big-button wobbly c-${k.color}" data-kid="${k.key}"><span class="big-icon">${ICONS[k.icon]}</span><span class="big-label">${esc(k.name)}</span></button>`).join('\n      ')}
      <button type="button" class="big-button wobbly c-yellow both-button" data-kid="both"><span class="big-label">Both, made together</span></button>
    </div>
  </section>

  <section class="screen" id="s-photos" hidden>
    <p><button type="button" class="linkish" id="back">← Back</button></p>
    <h1 class="up-h2" id="who"></h1>
    <p class="kid-help" id="kid-help"></p>
    <div class="up-add">
      <label class="big-pick wobbly pick-take"><input type="file" id="take" accept="image/*" capture="environment"><span>📷 Take a photo</span></label>
      <label class="big-pick wobbly pick-choose"><input type="file" id="pick" accept="image/*,application/pdf,.pdf" multiple><span>🖼️ Choose photos</span></label>
      <button type="button" class="big-pick wobbly cam-open" id="cam-open" hidden><span>💡 Camera with light</span></button>
    </div>
    <div class="up-where" id="where" hidden><p>Where should it go?</p>
      <button type="button" class="chip" data-where="photos" aria-pressed="true">📷 My snapshots</button>
      <button type="button" class="chip" data-where="moments" aria-pressed="false">❤️ Family Moments</button>
    </div>
    <div class="tag-chips" id="tag-chips" hidden></div>
    <label class="up-date">Date it was made <input type="date" id="date"></label>
    <p class="count" id="count"></p>
    <ul class="up-list" id="list"></ul>
    <div class="up-actions">
      <button type="button" class="save wobbly" id="save" disabled>Save</button>
      <button type="button" class="linkish" id="share" disabled>If Save will not work: share to the Drive app</button>
    </div>
    <p class="status" id="status" role="status" aria-live="polite"></p>
    <p class="day-look"><a class="chip" href="/family-moments/">❤️ See it on Family Moments</a></p>
    <p class="house-look"><a class="chip" href="/households/">🏡 See my page</a></p>
    <p class="kid-look"><a class="chip" id="kid-page" href="/">🎨 See my page</a> <a class="chip" href="/">🏠 Look at the site</a></p>
  </section>

  <section class="screen c-lav" id="s-episode" hidden>
    <p><button type="button" class="linkish" id="ep-back">← Back</button></p>
    <h1 class="up-h2">Add a podcast episode</h1>
    <p class="share-help">It goes on the Pet Parents page as soon as it is sent. The audio file is also kept in Google Drive.</p>
    <label class="big-pick wobbly ep-pick"><input type="file" id="ep-audio" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"><span id="ep-audio-label">🎙️ Choose the audio file</span></label>
    <div class="ep-form">
      <label>Title <input type="text" id="ep-title" maxlength="120"></label>
      <div class="ep-two">
        <label>Episode number <input type="number" id="ep-number" min="1" step="1" inputmode="numeric"></label>
        <label>Date <input type="date" id="ep-date"></label>
      </div>
      <label>What is it about? <span class="muted">(optional)</span> <textarea id="ep-desc" rows="3" maxlength="1000"></textarea></label>
      <label>Guests <span class="muted">(optional; commas between names)</span> <input type="text" id="ep-guests" placeholder="Grandma Ruth, Sam"></label>
      <label>Pets <span class="muted">(optional; for example: Biscuit the beagle, Mo the cat)</span> <input type="text" id="ep-pets"></label>
      <label class="big-pick wobbly ep-pick ep-pick-sm"><input type="file" id="ep-drawing" accept="image/*"><span id="ep-drawing-label">🖍️ Add the episode drawing <span class="muted">(optional)</span></span></label>
    </div>
    <div class="up-actions">
      <button type="button" class="save wobbly" id="ep-save" disabled>Send the episode</button>
    </div>
    <div class="ep-bar" id="ep-bar" hidden><span id="ep-bar-fill"></span></div>
    <p class="status" id="ep-status" role="status" aria-live="polite"></p>
    <p class="ep-done" id="ep-done" hidden><a class="chip" href="/pet-parents/">🎧 See it on the Pet Parents page</a></p>
    <h2 class="up-h3">On the site</h2>
    <ul class="up-list ep-list" id="ep-list"><li class="muted">Checking…</li></ul>
  </section>

  <section class="screen c-yellow" id="s-video" hidden>
    <p><button type="button" class="linkish" id="vid-back">← Back</button></p>
    <h1 class="up-h2">A special day</h1>
    <p class="share-help">Photos and videos go on the Family Moments page as soon as they are sent. The originals are kept in Google Drive.</p>
    <div class="ep-form">
      <label id="vid-event-pick">Which special day? <select id="vid-event"></select></label>
      <div class="vid-new" id="vid-new">
        <label>Name of the special day <input type="text" id="vid-event-title" maxlength="80" autocomplete="off" enterkeyhint="done"></label>
        <p class="muted vid-eg">For example: Leora's 9th birthday, or Trip to Grandma's</p>
        <label>Date <input type="date" id="vid-event-date"></label>
      </div>
    </div>
    <div class="up-add day-add">
      <label class="big-pick wobbly pick-choose"><input type="file" id="day-photos" accept="image/*" multiple><span>🖼️ Choose photos</span></label>
      <label class="big-pick wobbly pick-take vid-only"><input type="file" id="vid-file" accept="video/*"><span id="vid-label">🎬 Choose a video</span></label>
    </div>
    <p class="status" id="day-status" role="status" aria-live="polite"></p>
    <div id="vid-more" hidden>
      <p class="vid-note" id="vid-note" hidden></p>
      <img class="vid-poster" id="vid-poster" alt="" hidden>
      <div class="ep-form"><label>A few words about the video <span class="muted">(optional)</span> <input type="text" id="vid-caption" maxlength="200"></label></div>
      <div class="up-actions">
        <button type="button" class="save wobbly" id="vid-save" disabled>Send the video</button>
      </div>
    </div>
    <div class="ep-bar" id="vid-bar" hidden><span id="vid-bar-fill"></span></div>
    <p class="status" id="vid-status" role="status" aria-live="polite"></p>
    <p class="ep-done" id="vid-done" hidden><a class="chip" href="/family-moments/">❤️ See it on Family Moments</a></p>
    <h2 class="up-h3 vid-only">Videos on the site</h2>
    <ul class="up-list ep-list vid-only" id="vid-list"><li class="muted">Checking…</li></ul>
  </section>

  <section class="screen" id="s-edit" hidden>
    <h1 class="up-h2">Fix the corners</h1>
    <p class="share-help">Drag the four dots onto the corners of the paper. The picture is straightened when you tap Done.</p>
    <div class="ed-wrap" id="ed-wrap">
      <canvas id="ed-canvas" class="ed-canvas" aria-label="The picture"></canvas>
      <svg class="ed-lines" id="ed-lines" aria-hidden="true"><polygon points=""></polygon></svg>
      <span class="ed-dot" aria-label="Top left corner"></span><span class="ed-dot" aria-label="Top right corner"></span><span class="ed-dot" aria-label="Bottom right corner"></span><span class="ed-dot" aria-label="Bottom left corner"></span>
    </div>
    <div class="ed-tools"><button type="button" class="linkish" id="ed-reset">Use the whole photo</button></div>
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

  ${homeGuide()}
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
  // Hold the app icon (Android): straight to Take a photo for the last artist, or a special day. Each can be dragged onto the home screen.
  shortcuts: [{ name: 'Take a picture', short_name: 'Picture', url: '/upload/?add=quick', icons: [{ src: '/assets/brand/app-192.png', sizes: '192x192', type: 'image/png' }] },
    { name: 'A special day', short_name: 'Special day', url: '/upload/?add=day', icons: [{ src: '/assets/brand/app-192.png', sizes: '192x192', type: 'image/png' }] }],
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
for (const f of ['studio.js', 'start.js', 'shared.js']) fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));
fs.copyFileSync(path.join(SRC, 'upload/app.js'), path.join(DIST, 'upload/app.js'));
fs.writeFileSync(path.join(DIST, 'upload/sw.js'), swCode);
// pdf.js (Mozilla, Apache-2.0): turns page 1 of a PDF into a picture on the phone or computer. Loaded only when a PDF is picked.
fs.cpSync(path.join(SRC, 'upload/vendor'), path.join(DIST, 'upload/vendor'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'upload/manifest.webmanifest'), JSON.stringify(manifest, null, 2));
// Unlisted: block every crawler. No sitemap on purpose.
// Print copies are also served one by one, for "Save this picture".
if (fs.existsSync(path.join(SRC, 'moments-print'))) fs.cpSync(path.join(SRC, 'moments-print'), path.join(DIST, 'moments'), { recursive: true });
for (const [rel, files] of Object.entries(momentZips)) { fs.mkdirSync(path.join(DIST, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(DIST, rel), zipStore(files)); }
fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
// The plain icon some devices ask for first (Amazon Kids tiles, older browsers). Open without a login.
fs.copyFileSync(path.join(SRC, 'assets/brand/favicon.ico'), path.join(DIST, 'favicon.ico'));
console.log(`Built ${Object.keys(pages).length} pages, ${episodes.length} episode(s) -> dist/`);
