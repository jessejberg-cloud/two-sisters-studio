#!/usr/bin/env node
// Builds the Pet Parents site into dist/. No dependencies: Netlify runs this on every push.
//   content/site.json      names, tagline
//   content/episodes.json  one entry per episode (added by tools/add-episode.cjs)
//   content/art.json       other art: "daughter" and "sister" lists (added by tools/add-art.cjs)
//   site-src/              styles, script, fonts, drawings, audio, art
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
const sisterArtTitle = `${site.sisterName}'s Art`;

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

// Logo: if her drawing exists at site-src/assets/logo/logo.webp (or .png), it replaces the placeholder wordmark.
function logo(big) {
  for (const f of ['logo.webp', 'logo.png']) {
    if (fs.existsSync(path.join(SRC, 'assets/logo', f))) {
      return `<img class="logo-img${big ? ' logo-img--big' : ''}" src="${asset('logo/' + f)}" alt="${esc(site.podcastName)}">`;
    }
  }
  return `<span class="wordmark${big ? ' wordmark--big' : ''}" aria-label="${esc(site.podcastName)}">`
    + `<span class="wm-paw" aria-hidden="true">${ICONS.paw}</span>`
    + `<span class="wm-text" aria-hidden="true"><span class="wm-1">Pet</span> <span class="wm-2">Parents</span></span>`
    + `</span>`;
}

const ICONS = {
  paw: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="currentColor"><ellipse cx="20" cy="27" rx="9" ry="7.5"/><ellipse cx="9" cy="17" rx="4" ry="5"/><ellipse cx="16" cy="10" rx="4" ry="5"/><ellipse cx="25" cy="10" rx="4" ry="5"/><ellipse cx="32" cy="17" rx="4" ry="5"/></g></svg>',
  home: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6,20 L20,8 L34,20"/><path d="M10,17 L10,33 L30,33 L30,17"/><path d="M17,33 L17,25 L23,25 L23,33"/></g></svg>',
  palette: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20,5 C10,5 4,12 4,20 C4,29 11,35 18,35 C22,35 22,31 20,29 C18,27 19,24 23,24 L28,24 C33,24 36,21 36,17 C36,10 29,5 20,5 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="12" cy="19" r="2.8" fill="#e4572e"/><circle cx="16" cy="11" r="2.8" fill="#ffd166"/><circle cx="25" cy="11" r="2.8" fill="#5fa8d3"/><circle cx="30" cy="18" r="2.8" fill="#8fd3b6"/></svg>',
  crayon: '<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M9,31 L27,13 L33,19 L15,37 Z" fill="#c3b1e1" transform="translate(-2,-4)"/><path d="M25,9 L29,5 L35,11 L31,15" fill="#7d4e9e" transform="translate(-2,-4)"/></g><path d="M5,35 Q12,28 18,33" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  mic: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><rect x="14" y="4" width="12" height="20" rx="6"/><path d="M9,18 Q9,29 20,29 Q31,29 31,18"/><path d="M20,29 L20,36 M14,36 L26,36"/></g></svg>',
};

const NAV = [
  { href: '/', label: 'Home', icon: 'home', key: 'home' },
  { href: '/artwork/', label: 'Artwork', icon: 'palette', key: 'artwork' },
  { href: '/sister-art/', label: sisterArtTitle, icon: 'crayon', key: 'sister' },
  { href: '/about/', label: 'About', icon: 'mic', key: 'about' },
];

function page({ key, title, body, depth }) {
  const fullTitle = title ? `${title} · ${site.podcastName}` : site.podcastName;
  const nav = NAV.map((n) => `<li><a class="tab tab--${n.key}" href="${n.href}"${n.key === key ? ' aria-current="page"' : ''}><span class="tab-icon">${ICONS[n.icon]}</span><span class="tab-label">${esc(n.label)}</span></a></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="googlebot" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta property="og:title" content="${esc(site.podcastName)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE_URL}/assets/brand/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(site.podcastName)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(site.podcastName)}">
<meta name="theme-color" content="#fdf8ef">
<link rel="icon" href="${asset('brand/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${asset('brand/apple-touch-icon.png')}">
<link rel="preload" href="${asset('fonts/kalam-latin-700-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${asset('fonts/nunito-latin-600-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=${cssHash()}">
<script src="/main.js?v=${jsHash()}" defer></script>
</head>
<body class="page-${key}">
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
  <p>Made with love (and pet hair) by the ${esc(site.podcastName)} crew.</p>
</footer>
</body>
</html>
`;
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
      <h2 id="latest-h"><a href="/episodes/${ep.number}/">${esc(ep.title)}</a></h2>
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
      <a class="past-link wobbly" href="/episodes/${ep.number}/">
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

// ---------- pages ----------
const pages = {};

pages['index.html'] = page({
  key: 'home',
  title: '',
  body: `<section class="hero">
  <h1 class="hero-logo">${logo(true)}</h1>
  <p class="hero-tag">A podcast about pets and the people who love them.</p>
  <div class="hero-art">${drawing('hero')}</div>
</section>
${episodes.length ? latestBlock(episodes[0]) : comingSoon()}
${pastList(episodes.slice(1))}`,
});

const episodeDrawings = episodes.filter((e) => e.drawing).map((e) => ({ src: e.drawing, alt: e.drawingAlt, title: `Episode ${e.number}: ${e.title}`, w: e.drawingW, h: e.drawingH }));
pages['artwork/index.html'] = page({
  key: 'artwork',
  title: 'Artwork',
  body: `<div class="page-head reveal"><h1>Artwork</h1><p>Drawings by ${esc(site.daughterName)}.</p></div>
${!episodeDrawings.length && !(art.daughter || []).length
  ? gallery([], 'Drawings will show up here soon!')
  : `<section aria-labelledby="ep-art-h">
  <h2 id="ep-art-h" class="section-h">Episode drawings</h2>
  ${gallery(episodeDrawings, 'Episode drawings will show up here.')}
</section>
<section aria-labelledby="more-art-h">
  <h2 id="more-art-h" class="section-h">More art</h2>
  ${gallery(art.daughter || [], 'More art is on its way!')}
</section>`}`,
});

pages['sister-art/index.html'] = page({
  key: 'sister',
  title: sisterArtTitle,
  body: `<div class="page-head reveal"><h1>${esc(sisterArtTitle)}</h1><p>Drawings by ${esc(site.sisterName)}.</p></div>
${gallery(art.sister || [], `${site.sisterName}'s drawings are on their way!`)}`,
});

pages['about/index.html'] = page({
  key: 'about',
  title: 'About',
  body: `<div class="page-head reveal"><h1>About the podcast</h1></div>
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
    <p>${esc(site.daughterName)} and ${esc(site.hostName)} do the interviews. ${esc(site.daughterName)} also makes the episode drawings.</p>
  </section>
</div>`,
});

for (const ep of episodes) {
  const i = episodes.indexOf(ep);
  const newer = episodes[i - 1], older = episodes[i + 1];
  pages[`episodes/${ep.number}/index.html`] = page({
    key: 'episode',
    title: `Episode ${ep.number}`,
    body: `<article class="episode reveal">
  <p class="back"><a href="/">← All episodes</a></p>
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
    ${older ? `<a class="ep-nav-link" href="/episodes/${older.number}/">← Episode ${older.number}</a>` : '<span></span>'}
    ${newer ? `<a class="ep-nav-link" href="/episodes/${newer.number}/">Episode ${newer.number} →</a>` : ''}
  </nav>
</article>`,
  });
}

pages['404.html'] = page({
  key: 'notfound',
  title: 'Page not found',
  body: `<div class="page-head reveal"><h1>Oops! This page ran off to chase a squirrel.</h1><p><a class="big-link" href="/">Go back home</a></p></div>`,
});

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
// Unlisted: block every crawler. No sitemap on purpose.
fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Built ${Object.keys(pages).length} pages, ${episodes.length} episode(s) -> dist/`);
