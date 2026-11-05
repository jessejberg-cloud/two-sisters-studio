// Two Sisters Studio: small, gentle extras. Everything works without this file.
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fade in things that start below the screen, as they scroll into view.
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); e.target.classList.remove('pending'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('pending'); io.observe(el); }
    });
  }

  // Only one episode plays at a time.
  document.addEventListener('play', function (e) {
    document.querySelectorAll('audio').forEach(function (a) { if (a !== e.target) a.pause(); });
  }, true);
})();

// ---------- friends on a share link see only their pages' tabs (the site's front door blocks the rest anyway) ----------
// Devices that have opened Add art once (the girls' tablets) show Add art in the top row.
(function () {
  var v = (document.cookie.match(/(?:^|;\s*)tssv=([^;]*)/) || [])[1];
  var pages = v ? decodeURIComponent(v).split(',') : null;
  // A girl's own tablet login: Add art always shows, and the page knows it is her tablet.
  if (pages && pages.indexOf('upload') !== -1) document.documentElement.classList.add('is-adder', 'is-kid');
  try { if (!pages && localStorage.getItem('tss-adder')) document.documentElement.classList.add('is-adder'); } catch (e) {}
})();

(function () {
  var m = document.cookie.match(/(?:^|;\s*)tssv=([^;]*)/);
  if (!m || !m[1]) return;
  var pages = decodeURIComponent(m[1]).split(',');
  document.querySelectorAll('a.tab, a.big-button').forEach(function (a) {
    var first = (a.getAttribute('href') || '').split('/')[1] || '';
    if (first && pages.indexOf(first) === -1) { var li = a.closest('li'); (li || a).hidden = true; }
  });
  document.documentElement.classList.add('is-friend');
})();

// ---------- art galleries: filters and the big-picture viewer ----------
function initGallery() {
  'use strict';
  var area = document.querySelector('.gallery-area');
  if (!area) return;
  var filters = document.querySelector('.filters');
  var state = { year: 'all', season: 'all', q: '' };

  function apply() {
    var shown = 0;
    area.querySelectorAll('.year').forEach(function (y) {
      var yearOk = state.year === 'all' || y.dataset.year === state.year;
      var yearShown = 0;
      y.querySelectorAll('.season').forEach(function (s) {
        var seasonOk = state.season === 'all' || s.dataset.season === state.season;
        var n = 0;
        s.querySelectorAll('.piece').forEach(function (p) {
          var ok = yearOk && seasonOk && (!state.q || p.dataset.search.indexOf(state.q) !== -1);
          p.classList.toggle('is-hidden', !ok); if (ok) n++;
        });
        s.classList.toggle('is-hidden', n === 0); yearShown += n;
      });
      y.querySelectorAll('.part').forEach(function (part) {
        part.classList.toggle('is-hidden', !part.querySelector('.season:not(.is-hidden)'));
      });
      y.classList.toggle('is-hidden', yearShown === 0);
      if (state.year !== 'all' || state.season !== 'all' || state.q) { if (yearShown) y.open = true; }
      shown += yearShown;
    });
    filters.querySelector('.none-found').hidden = shown > 0;
  }

  if (filters) {
    filters.hidden = false;
    filters.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      state[b.dataset.filter] = b.dataset.value;
      filters.querySelectorAll('.chip[data-filter="' + b.dataset.filter + '"]').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
      apply();
    });
    var input = filters.querySelector('.find-input');
    input.addEventListener('input', function () { state.q = input.value.trim().toLowerCase(); apply(); });
  }

  var box = document.querySelector('.lightbox');
  if (!box || typeof box.showModal !== 'function') return;   // old browsers: the link opens the picture itself
  var img = box.querySelector('.lb-img'), cap = box.querySelector('.lb-cap'), label = box.querySelector('.lb-label');
  var list = [], at = 0, opener = null;

  var more = box.querySelector('.lb-more');
  // Slides: one per picture; a piece with several photos (a 3D piece) gives one slide per photo, so a swipe goes through them.
  function slides() {
    var out = [];
    Array.prototype.forEach.call(area.querySelectorAll('.piece-open'), function (a) {
      if (a.offsetParent === null) return;
      var phs = a.dataset.photos ? JSON.parse(a.dataset.photos) : null;
      if (phs && phs.length > 1) phs.forEach(function (ph, n) { out.push({ a: a, ph: ph, n: n + 1, of: phs.length }); });
      else out.push({ a: a, ph: { full: a.dataset.full, w: a.dataset.w, h: a.dataset.h, dl: a.dataset.dl }, n: 1, of: 1 });
    });
    return out;
  }
  function show(i) {
    at = (i + list.length) % list.length;
    var sl = list[at], a = sl.a;
    img.src = sl.ph.full; img.width = +sl.ph.w; img.height = +sl.ph.h;
    img.alt = a.querySelector('img').alt;
    cap.textContent = !a.dataset.caption ? '' : a.closest('.moment') ? a.dataset.caption : '“' + a.dataset.caption + '”';
    label.textContent = a.dataset.label;
    if (more) more.textContent = sl.of > 1 ? 'Photo ' + sl.n + ' of ' + sl.of : '';
    prepareSave(sl, sl.ph.dl || sl.ph.full, (a.dataset.name || 'picture') + (sl.of > 1 ? '-' + sl.n : ''));
  }

  // ---------- Save to a phone or computer ----------
  // iPhone: the Share sheet's "Save Image" puts it in Photos (a plain download would land in Files).
  // Android and computers: a normal download (Android shows it in Photos / Gallery under Downloads).
  // Pictures are turned into JPEG on the page itself, so nothing outside this site is needed.
  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var useShare = IOS && !!navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] });
  function jpegFile(url, name) {
    return new Promise(function (ok, fail) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
        c.toBlob(function (bl) { bl ? ok(new File([bl], name + '.jpg', { type: 'image/jpeg' })) : fail(new Error('no picture')); }, 'image/jpeg', 0.92);
      };
      im.onerror = function () { fail(new Error('could not load')); };
      im.src = url;
    });
  }
  function download(file) {
    var u = URL.createObjectURL(file), link = document.createElement('a');
    link.href = u; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
  }
  async function saveFiles(files) {
    if (useShare) {
      try { await navigator.share({ files: files }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    } else {
      for (var i = 0; i < files.length; i++) { download(files[i]); await new Promise(function (r) { setTimeout(r, 400); }); }
    }
  }
  var saveBtn = box.querySelector('.lb-save'), ready = null, readyFor = null;
  function prepareSave(a, url, name) {
    readyFor = a; ready = null;
    if (!saveBtn) return;
    saveBtn.disabled = true; saveBtn.textContent = 'Getting it ready…';
    jpegFile(url, name).then(function (f) {
      if (readyFor !== a) return;
      ready = f; saveBtn.disabled = false; saveBtn.textContent = '⬇ Save this picture';
    }, function () { if (readyFor === a) saveBtn.textContent = 'Could not get this picture'; });
  }
  if (saveBtn) saveBtn.addEventListener('click', function () {
    if (!ready) return;
    saveFiles([ready]).then(function () { if (!useShare) { saveBtn.textContent = '✓ Saved to Downloads'; } },
      function () { saveBtn.textContent = 'That did not work. Try again?'; });
  });
  // "Save all to this phone", one button per Family Moments event. Phones only (computers have the zip).
  if (matchMedia('(pointer: coarse)').matches) area.querySelectorAll('.save-all').forEach(function (btn) {
    btn.hidden = false;
    var label = btn.textContent, files = null, BATCH = 20, from = 0;
    btn.addEventListener('click', async function () {
      var links = btn.closest('.moment').querySelectorAll('.piece-open');
      if (!files) {
        btn.disabled = true; files = [];
        for (var i = 0; i < links.length; i++) {
          btn.textContent = 'Getting ' + (i + 1) + ' of ' + links.length + ' ready…';
          files.push(await jpegFile(links[i].dataset.dl, links[i].dataset.name || 'photo-' + (i + 1)));
        }
        btn.disabled = false;
        if (useShare) { btn.textContent = 'Ready: tap to save ' + Math.min(BATCH, files.length) + ' photos'; return; }
      }
      var part = useShare ? files.slice(from, from + BATCH) : files;
      try { await saveFiles(part); } catch (e) { btn.textContent = 'That did not work. Try again?'; return; }
      from = useShare ? from + part.length : files.length;
      if (from < files.length) btn.textContent = 'Tap to save the next ' + Math.min(BATCH, files.length - from);
      else { btn.textContent = useShare ? '✓ Saved. Tap to save again' : '✓ Saved to Downloads'; from = 0; }
    });
  });
  area.addEventListener('click', function (e) {
    var a = e.target.closest('.piece-open'); if (!a) return;
    e.preventDefault();
    list = slides();
    var first = 0; for (var k = 0; k < list.length; k++) if (list[k].a === a) { first = k; break; }
    opener = a; show(first); box.showModal();
  });
  box.querySelector('.lb-close').addEventListener('click', function () { box.close(); });
  box.querySelector('.lb-prev').addEventListener('click', function () { show(at - 1); });
  box.querySelector('.lb-next').addEventListener('click', function () { show(at + 1); });
  box.addEventListener('close', function () { img.removeAttribute('src'); if (opener) opener.focus(); });
  box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
  box.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
  });
  // Swipe left or right on a phone.
  var x0 = null;
  box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) show(dx < 0 ? at + 1 : at - 1);
  });
}

// ---------- kids' galleries: drawn here, from the site's live art list plus the older hand-added art ----------
// School years newest first (the newest open), each with School Year (fall, winter, spring) and Summer. Each season:
// starred pieces large (up to 2; if none is starred, the newest), then the rest in a grid that never crops.
(function () {
  'use strict';
  var live = document.querySelector('.art-live');
  if (!live) { if (document.querySelector('.gallery-area')) initGallery(); return; }
  var kid = live.dataset.kid, area = document.querySelector('.gallery-area');
  var SEASON = { fall: 'Fall', winter: 'Winter', spring: 'Spring', summer: 'Summer' };
  var ICON = { fall: '🍂', winter: '❄️', spring: '🌷', summer: '☀️' };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function niceDate(iso) { var d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function yearLabel(sy) { return sy.replace('-', '–'); }
  var data = [];
  try { data = JSON.parse(document.getElementById('art-data').textContent); } catch (e) {}

  function fromSite(p) {
    return { id: p.id, date: p.date, schoolYear: p.schoolYear, season: p.season, grade: p.grade || '', caption: p.caption || '', starred: !!p.starred,
      kid: p.kid, created: p.created || '',
      photos: p.photos.map(function (ph) { return { full: '/img/' + p.id + '/' + ph.n, thumb: '/img/' + p.id + '/' + ph.n + '/sm', w: ph.w || 800, h: ph.h || 800 }; }) };
  }
  function label(it) {
    return [it.kid === 'both' ? 'Made together' : it.grade, SEASON[it.season], niceDate(it.date)].filter(Boolean).join(' · ');
  }
  function piece(it, big) {
    var ph = it.photos[0], lab = label(it);
    var search = [it.caption, SEASON[it.season], yearLabel(it.schoolYear), it.grade, it.kid === 'both' ? 'made together both' : ''].join(' ').toLowerCase();
    var alt = it.alt || it.caption || ('A drawing by ' + (it.kid === 'both' ? 'both girls' : live.dataset.name));
    return '<figure class="piece' + (big ? ' piece--big' : '') + '" data-search="' + esc(search) + '">' +
      '<a class="piece-open" href="' + esc(ph.full) + '" data-full="' + esc(ph.full) + '" data-dl="' + esc(ph.full) + '" data-name="' + esc(it.id) + '" data-w="' + ph.w + '" data-h="' + ph.h + '"' +
      (it.photos.length > 1 ? ' data-photos="' + esc(JSON.stringify(it.photos)) + '"' : '') +
      ' data-caption="' + esc(it.caption) + '" data-label="' + esc(lab) + '" aria-label="Open ' + esc(it.caption || 'this drawing') + ' big">' +
      '<img src="' + esc(big ? ph.full : ph.thumb) + '" alt="' + esc(alt) + '" width="' + ph.w + '" height="' + ph.h + '" loading="lazy" decoding="async">' +
      (it.sample ? '<span class="sample-tag">Sample</span>' : '') +
      (it.photos.length > 1 ? '<span class="photos-tag">' + it.photos.length + ' photos</span>' : '') +
      (it.kid === 'both' ? '<span class="together-tag">Made together</span>' : '') +
      '</a><figcaption>' + (it.caption ? '<span class="art-cap">“' + esc(it.caption) + '”</span>' : '') + '<span class="art-label">' + esc(lab) + '</span></figcaption></figure>';
  }
  function season(name, list) {
    if (!list.length) return '';
    var big = list.filter(function (x) { return x.starred; }).slice(0, 2);
    if (!big.length) big = [list[0]];   // list is newest first
    var rest = list.filter(function (x) { return big.indexOf(x) === -1; });
    return '<section class="season" data-season="' + name + '"><h4 class="season-h"><span aria-hidden="true">' + ICON[name] + '</span> ' + SEASON[name] + '</h4>' +
      '<div class="featured featured--' + big.length + '">' + big.map(function (x) { return piece(x, true); }).join('') + '</div>' +
      (rest.length ? '<div class="masonry">' + rest.map(function (x) { return piece(x, false); }).join('') + '</div>' : '') + '</section>';
  }
  function draw(items) {
    items.sort(function (a, b) { return (b.date + b.created).localeCompare(a.date + a.created); });
    if (!items.length) {
      area.innerHTML = '<div class="empty wobbly"><p>' + esc(live.dataset.empty) + '</p></div>';
      return;
    }
    if (items.some(function (x) { return x.sample; })) live.innerHTML = '<p class="sample-note">These are sample pictures, so you can see how the page will look. Real art is coming soon!</p>';
    var years = items.map(function (x) { return x.schoolYear; }).filter(function (y, i, a) { return a.indexOf(y) === i; }).sort().reverse();
    area.innerHTML = years.map(function (y, i) {
      var inYear = items.filter(function (x) { return x.schoolYear === y; });
      var of = function (s) { return inYear.filter(function (x) { return x.season === s; }); };
      var school = ['fall', 'winter', 'spring'].map(function (s) { return season(s, of(s)); }).join(''), summer = season('summer', of('summer'));
      return '<details class="year" data-year="' + y + '"' + (i === 0 ? ' open' : '') + '><summary><h2 class="year-h">' + yearLabel(y) + '</h2><span class="year-count">' +
        inYear.length + ' picture' + (inYear.length === 1 ? '' : 's') + '</span></summary>' +
        (school ? '<div class="part"><h3 class="part-h">School Year</h3>' + school + '</div>' : '') +
        (summer ? '<div class="part"><h3 class="part-h">Summer</h3>' + summer + '</div>' : '') + '</details>';
    }).join('');
    document.querySelector('.filters [data-group="year"]').innerHTML = [['all', 'All years']].concat(years.map(function (y) { return [y, yearLabel(y)]; }))
      .map(function (o, i) { return '<button type="button" class="chip" data-filter="year" data-value="' + o[0] + '" aria-pressed="' + (i === 0) + '">' + esc(o[1]) + '</button>'; }).join('');
    // On a phone the filters wait behind one button.
    var toggle = document.querySelector('.filter-toggle'), filters = document.querySelector('.filters');
    toggle.hidden = false;
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open)); filters.classList.toggle('is-open', open);
    });
    initGallery();
  }

  var done = false;
  function fallback() { if (!done) { done = true; draw(data); } }
  var timer = setTimeout(fallback, 8000);
  fetch('/api/pieces?kid=' + encodeURIComponent(kid), { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) { if (done) return; done = true; clearTimeout(timer); var mine = (j.pieces || []).map(fromSite);
      // Sample pictures step aside as soon as real art is saved.
      draw(mine.concat(mine.length ? data.filter(function (x) { return !x.sample; }) : data)); })
    .catch(function () { clearTimeout(timer); fallback(); });
})();

// ---------- login page: show the right words and errors, keep where the person was going ----------
(function () {
  var form = document.querySelector('.login-form');
  if (!form) return;
  var q = new URLSearchParams(location.search);
  var next = q.get('next');
  if (next && next.charAt(0) === '/' && next.charAt(1) !== '/') form.elements.next.value = next;
  if (q.get('kind') === 'friend' || q.get('friend')) {
    form.elements.kind.value = 'friend';
    document.querySelector('[data-family]').hidden = true;
    document.querySelector('[data-friend]').hidden = false;
  }
  var e = q.get('e');
  if (e) { var m = document.querySelector('.login-error[data-e="' + e + '"]'); if (m) m.hidden = false; }
})();

// ---------- photos from the girls' tablets: a simple grid and viewer ----------
document.querySelectorAll('.live-photos').forEach(function (sec) {
  'use strict';
  var grid = sec.querySelector('.photo-grid'), box = sec.querySelector('.photo-box');
  var img = box.querySelector('.pb-img'), cap = box.querySelector('.pb-cap'), list = [], at = 0;
  function nice(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); }
  var names = {}; document.querySelectorAll('.art-live').forEach(function (a) { names[a.dataset.kid] = a.dataset.name; });
  function show(i) {
    at = (i + list.length) % list.length; var p = list[at];
    img.src = '/img/' + encodeURIComponent(p.id) + '/1'; img.alt = p.caption || 'Photo';
    cap.textContent = [p.caption, p.byName, nice(p.date)].filter(Boolean).join(' · ');
    if (!box.open) box.showModal();
  }
  box.querySelector('.pb-close').addEventListener('click', function () { box.close(); });
  box.querySelector('.pb-prev').addEventListener('click', function () { show(at - 1); });
  box.querySelector('.pb-next').addEventListener('click', function () { show(at + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
  fetch(sec.dataset.src, { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      list = (j.pieces || []).sort(function (a, b) { return (b.date + b.created).localeCompare(a.date + a.created); });
      if (!list.length) return;
      list.forEach(function (p, i) {
        p.byName = sec.dataset.src.indexOf('moments') !== -1 ? (names[p.kid] || (p.kid.charAt(0).toUpperCase() + p.kid.slice(1))) : '';
        var li = document.createElement('li'), b = document.createElement('button'), t = document.createElement('img');
        b.type = 'button'; b.className = 'photo-tile';
        t.src = '/img/' + encodeURIComponent(p.id) + '/1/sm'; t.alt = p.caption || 'Photo'; t.loading = 'lazy';
        b.appendChild(t); b.addEventListener('click', function () { show(i); });
        li.appendChild(b); grid.appendChild(li);
      });
      sec.hidden = false;
      if (sec.id === 'snapshots') document.querySelectorAll('.snap-jump').forEach(function (j) { j.hidden = false; });
    })
    .catch(function () { /* stays hidden */ });
});

// ---------- Pet Parents: episodes added from the app join the hand-added ones ----------
(function () {
  'use strict';
  var area = document.querySelector('.pp-live'), one = document.querySelector('.ep-live');
  if (!area && !one) return;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nice(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function words(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  var paw = (document.getElementById('ep-paw') || {}).innerHTML || '';
  function fromSite(e) {
    var b = '/api/episodes/' + encodeURIComponent(e.id);
    return { number: e.number, title: e.title, date: e.date, minutes: e.minutes, description: e.description || '', guests: e.guests || [], pets: e.pets || [],
      href: '/pet-parents/episode/?id=' + encodeURIComponent(e.id), audio: b + '/audio',
      drawing: e.drawing ? b + '/drawing' : '', drawingSm: e.drawing ? b + '/drawing/sm' : '', w: (e.drawing && e.drawing.w) || 800, h: (e.drawing && e.drawing.h) || 800 };
  }
  function meta(e) { return 'Episode ' + e.number + ' <span class="dot">·</span> <time datetime="' + esc(e.date) + '">' + esc(nice(e.date)) + '</time>' + (e.minutes ? ' <span class="dot">·</span> ' + e.minutes + ' min' : ''); }
  function pic(e, cls, small) {
    if (!e.drawing) return '<div class="' + cls + ' ep-pic ep-pic--none" aria-hidden="true">' + paw + '</div>';
    return '<img class="' + cls + ' ep-pic" src="' + esc(small ? e.drawingSm : e.drawing) + '" alt="Drawing for episode ' + e.number + '" width="' + e.w + '" height="' + e.h + '" loading="lazy" decoding="async">';
  }
  function who(e) {
    var bits = [];
    if (e.guests.length) bits.push('<span class="who"><strong>Guest' + (e.guests.length > 1 ? 's' : '') + ':</strong> ' + esc(words(e.guests)) + '</span>');
    if (e.pets.length) bits.push('<span class="who"><strong>Pet' + (e.pets.length > 1 ? 's' : '') + ':</strong> ' + esc(words(e.pets.map(function (p) { return p.kind ? p.name + ' the ' + p.kind : p.name; }))) + '</span>');
    return bits.length ? '<p class="who-line">' + bits.join('') + '</p>' : '';
  }
  function player(e) { return '<div class="player"><audio controls preload="none" src="' + esc(e.audio) + '" aria-label="' + esc('Play episode ' + e.number + ': ' + e.title) + '">Your browser can’t play this audio.</audio></div>'; }
  function card(e, h) {
    return '<div class="latest-card wobbly">' + pic(e, 'latest-pic') + '<div class="latest-text"><p class="ep-num">' + meta(e) + '</p>' + h +
      '<p class="ep-desc">' + esc(e.description) + '</p>' + who(e) + player(e) + '</div></div>';
  }

  if (area) {
    var stat = []; try { stat = JSON.parse(document.getElementById('pp-static').textContent); } catch (x) {}
    fetch('/api/episodes', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var live = (j.episodes || []).map(fromSite);
        if (!live.length) return;
        var all = live.concat(stat.filter(function (s) { return !live.some(function (l) { return l.number === s.number; }); }))
          .sort(function (a, b) { return b.number - a.number; });
        var top = all[0], rest = all.slice(1);
        area.innerHTML = '<section class="latest" aria-labelledby="latest-h"><p class="kicker">Newest episode</p>' +
          card(top, '<h2 id="latest-h"><a href="' + esc(top.href) + '">' + esc(top.title) + '</a></h2>') + '</section>' +
          (rest.length ? '<section class="past" aria-labelledby="past-h"><h2 id="past-h" class="section-h">More episodes</h2><ul class="past-list">' +
            rest.map(function (e) {
              return '<li class="past-item"><a class="past-link wobbly" href="' + esc(e.href) + '">' + pic(e, 'past-pic', true) +
                '<span class="past-text"><span class="ep-num">' + meta(e) + '</span><span class="past-title">' + esc(e.title) + '</span><span class="past-desc">' + esc(e.description) + '</span></span></a></li>';
            }).join('') + '</ul></section>' : '');
      })
      .catch(function () { /* the hand-added episodes stay as they are */ });
  }

  if (one) {
    var id = new URLSearchParams(location.search).get('id') || '';
    fetch('/api/episodes', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var list = (j.episodes || []).sort(function (a, b) { return b.number - a.number; });
        var i = list.findIndex(function (x) { return x.id === id; });
        if (i < 0) throw new Error('missing');
        var e = fromSite(list[i]), newer = list[i - 1], older = list[i + 1];
        document.title = 'Episode ' + e.number + ': ' + e.title + ' · ' + document.title.split(' · ').slice(1).join(' · ');
        var link = function (x, txt) { return '<a class="ep-nav-link" href="/pet-parents/episode/?id=' + encodeURIComponent(x.id) + '">' + txt + '</a>'; };
        one.querySelector('.ep-loading').outerHTML = card(e, '<h1>' + esc(e.title) + '</h1>') +
          '<nav class="ep-nav" aria-label="More episodes">' + (older ? link(older, '← Episode ' + older.number) : '<span></span>') + (newer ? link(newer, 'Episode ' + newer.number + ' →') : '') + '</nav>';
      })
      .catch(function () { var l = one.querySelector('.ep-loading'); if (l) l.textContent = 'This episode could not be found. It may have been put away.'; });
  }
})();
