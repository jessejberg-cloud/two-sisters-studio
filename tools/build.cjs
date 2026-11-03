#!/usr/bin/env node
// Builds Two Sisters Studio into dist/. No dependencies: Netlify runs this on every push.
//   content/site.json      site name, the kids (one tab and gallery each), extra sections (tabs), podcast names
//   content/episodes.json  Pet Parents episodes (added by tools/add.py episode)
//   content/art.json       the kids' art (added by tools/add.py)
//   site-src/              styles, script, fonts, drawings, audio, art
// Pages: /  (Welcome)   /<kid>/  (gallery)   /pet-parents/  /pet-parents/about/  /pet-parents/episodes/<n>/
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
const CSP_UPLOAD = "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; font-src 'self'; manifest-src 'self'; "
  + "connect-src https://www.googleapis.com; "
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
  mic: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><rect x="14" y="4" width="12" height="20" rx="6"/><path d="M9,18 Q9,29 20,29 Q31,29 31,18"/><path d="M20,29 L20,36 M14,36 L26,36"/></g></svg>',
};

function page({ key, title, body, section, bodyClass }) {
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
<meta http-equiv="Content-Security-Policy" content="${CSP_STRICT}">
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
</head>
<body class="page-${key}${section ? ' in-' + section : ''}${bodyClass ? ' ' + bodyClass : ''}">
<a class="skip" href="#main">Skip to the main part</a>
<header class="site-header">
  <a class="brand" href="/">${logo(false)}</a>
  <nav aria-label="Main"><ul class="tabs">${nav}</ul></nav>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="paw-trail" aria-hidden="true">${ICONS.paw.repeat(5)}</div>
  <p>Made with love (and crayons) by the ${esc(site.siteName)} crew.</p>
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
const SEASON_ICON = { fall: '🍂', winter: '❄️', spring: '🌷', summer: '☀️' };
const yearLabel = (sy) => sy.replace('-', '–');
const artLabel = (it) => [it.grade, it.season, niceDate(it.date)].filter(Boolean).join(' · ');

function artPiece(kid, it, big) {
  const cap = it.caption ? `<span class="art-cap">“${esc(it.caption)}”</span>` : '';
  const search = [it.caption, it.season, yearLabel(it.schoolYear), it.grade].filter(Boolean).join(' ').toLowerCase();
  return `<figure class="piece${big ? ' piece--big' : ''}" data-search="${esc(search)}">
    <a class="piece-open" href="${asset(it.src)}" data-full="${asset(it.src)}" data-w="${it.w}" data-h="${it.h}"
       data-caption="${esc(it.caption || '')}" data-label="${esc(artLabel(it))}" aria-label="Open ${esc(it.caption || 'this drawing')} big">
      <img src="${asset(big ? it.src : (it.thumb || it.src))}" alt="${esc(it.alt || it.caption || `A drawing by ${kid.name}`)}" width="${it.w}" height="${it.h}" loading="lazy" decoding="async">
      ${it.sample ? '<span class="sample-tag">Sample</span>' : ''}
    </a>
    <figcaption>${cap}<span class="art-label">${esc(artLabel(it))}</span></figcaption>
  </figure>`;
}

function seasonBlock(kid, season, list) {
  if (!list.length) return '';
  const featured = list.filter((x) => x.featured).slice(0, 2);
  const rest = list.filter((x) => !featured.includes(x));
  return `<section class="season" data-season="${season}">
    <h4 class="season-h"><span aria-hidden="true">${SEASON_ICON[season]}</span> ${SEASON_LABEL[season]}</h4>
    ${featured.length ? `<div class="featured featured--${featured.length}">${featured.map((it) => artPiece(kid, it, true)).join('')}</div>` : ''}
    ${rest.length ? `<div class="masonry">${rest.map((it) => artPiece(kid, it, false)).join('')}</div>` : ''}
  </section>`;
}

function artGallery(kid, items) {
  const years = [...new Set(items.map((x) => x.schoolYear))].sort().reverse();
  const anySample = items.some((x) => x.sample);
  const chips = (name, opts) => `<div class="chips" role="group" aria-label="${name}">${opts.map(([v, l], i) => `<button type="button" class="chip" data-filter="${name}" data-value="${v}" aria-pressed="${i === 0}">${esc(l)}</button>`).join('')}</div>`;
  const filters = `<div class="filters" hidden>
    ${chips('year', [['all', 'All years'], ...years.map((y) => [y, yearLabel(y)])])}
    ${chips('season', [['all', 'All seasons'], ...SEASONS.map((s) => [s, SEASON_LABEL[s]])])}
    <label class="find"><span>Find a word</span><input type="search" class="find-input" placeholder="like cat or rainbow" autocomplete="off"></label>
    <p class="none-found" hidden>No pictures match. Try another word.</p>
  </div>`;
  const yearBlocks = years.map((y, i) => {
    const inYear = items.filter((x) => x.schoolYear === y);
    const school = ['fall', 'winter', 'spring'].map((s) => seasonBlock(kid, s, inYear.filter((x) => x.season === s))).join('');
    const summer = seasonBlock(kid, 'summer', inYear.filter((x) => x.season === 'summer'));
    return `<details class="year" data-year="${y}"${i === 0 ? ' open' : ''}>
    <summary><h2 class="year-h">${yearLabel(y)}</h2><span class="year-count">${inYear.length} picture${inYear.length === 1 ? '' : 's'}</span></summary>
    ${school ? `<div class="part"><h3 class="part-h">School Year</h3>${school}</div>` : ''}
    ${summer ? `<div class="part"><h3 class="part-h">Summer</h3>${summer}</div>` : ''}
  </details>`;
  }).join('\n');
  return `${anySample ? '<p class="sample-note">These are sample pictures, so you can see how the page will look. Real art is coming soon!</p>' : ''}
${filters}
<div class="gallery-area">
${yearBlocks}
</div>
<dialog class="lightbox" aria-label="Picture">
  <button type="button" class="lb-close" aria-label="Close">✕</button>
  <button type="button" class="lb-prev" aria-label="Previous picture">‹</button>
  <figure class="lb-fig"><img class="lb-img" alt=""><figcaption><span class="lb-cap"></span><span class="lb-label"></span></figcaption></figure>
  <button type="button" class="lb-next" aria-label="Next picture">›</button>
</dialog>`;
}

// ---------- pages ----------
const pages = {};

// Welcome: three big buttons, one per tab.
pages['index.html'] = page({
  key: 'welcome',
  title: '',
  body: `<section class="welcome">
  <h1 class="hero-logo">${logo(true)}</h1>
  <p class="hero-tag">Art by ${esc(listWords(KIDS.map((k) => k.name)))}, and our podcast.</p>
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
    body: `<div class="page-head"><h1>${esc(kid.name)}'s Art</h1></div>
${items.length ? artGallery(kid, items) : gallery([], `${kid.name}'s art will show up here soon!`)}`,
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

// ---------- upload app (for Jesse's phone; not in the tabs) ----------
const uploadCfg = {
  clientId: site.googleClientId || '',
  folderName: site.uploadFolderName,
  kids: Object.fromEntries(KIDS.map((k) => [k.key, { name: k.name, color: k.color, grades: k.grades || {} }])),
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
    <p class="up-lead">Whose art is it?</p>
    <div class="up-kids">
      ${KIDS.map((k) => `<button type="button" class="big-button wobbly c-${k.color}" data-kid="${k.key}"><span class="big-icon">${ICONS[k.icon]}</span><span class="big-label">${esc(k.name)}</span></button>`).join('\n      ')}
    </div>
    <p class="acct" id="acct"></p>
    <p class="acct-row"><button type="button" class="chip" id="signin" hidden>Sign in to Google</button>
      <button type="button" class="linkish" id="signout" hidden>Sign out</button></p>
    <p class="up-home"><a href="/">Go to the site</a></p>
  </section>

  <section class="screen" id="s-photos" hidden>
    <p><button type="button" class="linkish" id="back">← Back</button></p>
    <h1 class="up-h2"><span id="who"></span>'s art</h1>
    <div class="up-add">
      <label class="big-pick wobbly"><input type="file" id="take" accept="image/*" capture="environment"><span>📷 Take a photo</span></label>
      <label class="big-pick wobbly"><input type="file" id="pick" accept="image/*" multiple><span>🖼️ Choose photos</span></label>
    </div>
    <label class="up-date">Date it was made <input type="date" id="date"></label>
    <p class="count" id="count"></p>
    <ul class="up-list" id="list"></ul>
    <div class="up-actions">
      <button type="button" class="save wobbly" id="save" disabled>Save to Google Drive</button>
      <button type="button" class="linkish" id="share" disabled>Share to the Drive app instead</button>
    </div>
    <p class="share-help" id="share-help" hidden>Your phone's share list opens. Pick <strong>Drive</strong>, choose the <strong>${esc(site.uploadFolderName)}</strong> folder, and tap <strong>Save</strong>.</p>
    <p class="status" id="status" role="status" aria-live="polite"></p>
  </section>
</main>
</body>
</html>
`;
const manifest = {
  name: `${site.siteName}: Add art`, short_name: 'Add art', start_url: '/upload/', scope: '/upload/', display: 'standalone',
  background_color: '#fdf8ef', theme_color: '#fdf8ef',
  icons: [{ src: '/assets/brand/app-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/brand/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
};

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
fs.copyFileSync(path.join(SRC, 'upload/app.js'), path.join(DIST, 'upload/app.js'));
fs.writeFileSync(path.join(DIST, 'upload/manifest.webmanifest'), JSON.stringify(manifest, null, 2));
// Unlisted: block every crawler. No sitemap on purpose.
fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Built ${Object.keys(pages).length} pages, ${episodes.length} episode(s) -> dist/`);
