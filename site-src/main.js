// Two Sisters Studio: small, gentle extras. Everything works without this file.

// ---------- shared: full screen for any picture or video, and saving a file to a phone or computer ----------
// Full screen: the browser's own full screen where it has one; the tablet app has none, so the picture or video
// then simply fills the page (class is-full). Either way the ✕ or Back key brings it back.
window.TSS = (function () {
  'use strict';
  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var current = null;
  function exit() {
    if (!current) return;
    var c = current; current = null;
    c.el.classList.remove('is-full'); document.documentElement.classList.remove('full-open');
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    if (c.onExit) c.onExit();
  }
  function enter(el, onExit) {
    if (current) exit();
    current = { el: el, onExit: onExit };
    el.classList.add('is-full'); document.documentElement.classList.add('full-open');
    var go = el.requestFullscreen || el.webkitRequestFullscreen;
    try { if (go) { var p = go.call(el); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
  }
  function changed() { if (current && !(document.fullscreenElement || document.webkitFullscreenElement) && current.native) exit(); else if (current) current.native = true; }
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) exit(); });
  // iPhone: the Share sheet ("Save Image" / "Save Video") puts it in Photos. Android and computers: a download.
  async function save(file) {
    if (IOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') throw e; }
      return 'shared';
    }
    var u = URL.createObjectURL(file), a = document.createElement('a');
    a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
    return 'downloaded';
  }
  // A plain zip (stored, no compression: photos do not shrink anyway), made in the browser, so "Download all" needs no build.
  var CRC = null;
  function crc32(b) {
    if (!CRC) { CRC = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
    var x = -1; for (var i = 0; i < b.length; i++) x = CRC[(x ^ b[i]) & 255] ^ (x >>> 8); return (x ^ -1) >>> 0;
  }
  function zip(files) {   // [{ name, data: Uint8Array }] -> Blob
    var parts = [], central = [], off = 0, enc = new TextEncoder();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
      var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, n, true); h.setUint32(22, n, true); h.setUint16(26, name.length, true);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      parts.push(h.buffer, name, f.data); central.push(c.buffer, name); off += 30 + name.length + n;
    });
    var size = central.reduce(function (t, x) { return t + x.byteLength; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
  }
  // Family Moments: the section of a special day, made when the day so far has only things added from the app.
  function daySection(key, title, date) {
    var area = document.querySelector('.gallery-area[data-videos]');
    var sec = document.getElementById(key);
    if (sec && sec.classList.contains('moment')) return sec;
    function make(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
    sec = make('section', 'moment'); sec.id = key; sec.dataset.date = date;
    var head = make('div', 'moment-head');
    head.append(make('h2', 'moment-h', title), make('p', 'moment-date', new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })));
    sec.append(head, make('div', 'masonry'));
    var after = null;
    area.querySelectorAll('.moment').forEach(function (s) { var d = s.dataset.date || ''; if (!after && d && d < date) after = s; });
    area.insertBefore(sec, after);
    area.hidden = false;
    var empty = area.nextElementSibling; if (empty && empty.classList.contains('empty')) empty.hidden = true;
    var jump = document.querySelector('.moment-jump ul');   // the day buttons at the top, in the same order as the days
    if (jump) {
      jump.textContent = '';
      area.querySelectorAll('.moment').forEach(function (m) { var li = make('li'), a = make('a', '', (m.querySelector('.moment-h') || {}).textContent || ''); a.href = '#' + m.id; li.append(a); jump.append(li); });
    }
    return sec;
  }
  return { enter: enter, exit: exit, save: save, zip: zip, daySection: daySection, isFull: function () { return !!current; } };
})();
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
  // A household's phone (an invite link): Add photos shows too, but it is not a girl's tablet.
  if (pages && pages.indexOf('upload') !== -1) document.documentElement.classList.add('is-adder', pages.indexOf('house') !== -1 ? 'is-house' : 'is-kid');
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

// ---------- the small ＋ on every page (Jesse, 2026-11-25): family phones, households and the girls' tablets ----------
(function () {
  var fab = document.querySelector('.add-fab'), root = document.documentElement;
  if (!fab) return;
  var house = root.classList.contains('is-house'), kid = root.classList.contains('is-kid');
  if (root.classList.contains('is-friend') && !house && !kid) return;   // a friend on a share link: look only
  // A phone with only a View link (build spec, 2026-11-25): look only, so no ＋. A phone with an Invite adds.
  var hint = (document.cookie.match(/(?:^|;\s*)tssw=([^;]*)/) || [])[1];
  var keys = hint ? decodeURIComponent(hint).split(',') : [];
  var adds = keys.some(function (k) { return k.split(':')[1] === 'd'; });
  if (keys.length && !adds) {
    fetch('/api/whoami', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (me) { if (me.role === 'family') { fab.hidden = false; root.classList.add('has-fab'); } }).catch(function () {});
    return;
  }
  var add = fab.dataset.add || '';
  if (kid) fab.href = '/upload/';                                       // her tablet opens on My art / A snapshot
  if (house) fab.href = '/upload/' + (add === '?add=day' ? '?add=day' : '?add=house');
  if (house) fab.querySelector('.add-fab-label').textContent = 'Add photos';
  fab.setAttribute('aria-label', house ? 'Add photos' : kid ? 'Add a picture' : add === '?add=day' ? 'Add photos or a video to a special day'
    : add === '?add=episode' ? 'Add a podcast episode' : /kid=/.test(add) ? 'Add art for this page' : 'Add something');
  fab.hidden = false;
  root.classList.add('has-fab');   // the ＋ replaces the Add art tab, so the top row stays roomy
})();

// ---------- More family: the tab, and the page of each household's own photos (Jesse, 2026-11-25) ----------
// A household's phone: the tab is "<name>'s photos". A family phone: "More family", once there is a household.
(function () {
  'use strict';
  var root = document.documentElement, li = document.querySelector('.tab-houses-li');
  var isHouse = root.classList.contains('is-house'), isFamily = !root.classList.contains('is-friend');
  var onPage = document.getElementById('houses-area');
  if (!li || (!isHouse && !isFamily)) return;
  var cached = null;
  try { cached = JSON.parse(sessionStorage.getItem('tss-houses') || 'null'); } catch (e) {}
  function label(me) {
    if (me.role === 'house') { li.querySelector('.tab-label').textContent = me.name + '’s photos'; li.hidden = false; }
    else if (me.role === 'family' && me.houses && me.houses.length) li.hidden = false;
  }
  if (isHouse) { var add = document.querySelector('.tab-add .tab-label'); if (add) add.textContent = 'Add photos'; }
  if (cached) label(cached);
  if (cached && !onPage) return;
  fetch('/api/whoami', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (me) {
    try { sessionStorage.setItem('tss-houses', JSON.stringify({ role: me.role, name: me.name, house: me.house, houses: me.houses })); } catch (e) {}
    label(me);
    if (onPage) drawHouses(me);
  }).catch(function () { if (onPage) onPage.innerHTML = '<p class="muted">The photos could not load. Try again in a minute?</p>'; });

  function drawHouses(me) {
    var tpl = document.getElementById('house-tpl'), list = me.role === 'house' ? [{ id: me.house, name: me.name }] : (me.houses || []);
    onPage.innerHTML = '';
    if (new URLSearchParams(location.search).get('mine')) document.getElementById('houses-mine').hidden = false;
    if (me.role === 'house') {
      document.getElementById('houses-h').textContent = me.name + '’s photos';
      document.getElementById('houses-lead').textContent = 'Photos you added. Everyone in the family can see them.';
      document.getElementById('houses-add').hidden = false;
    }
    if (!list.length) { onPage.innerHTML = '<p class="muted">Nobody has been invited yet. Invites are made on the For parents page.</p>'; return; }
    list.forEach(function (h) {
      var sec = tpl.content.firstElementChild.cloneNode(true);
      sec.dataset.src = '/api/pieces?section=house&house=' + encodeURIComponent(h.id);
      sec.dataset.empty = me.role === 'house' ? 'Nothing here yet. Tap Add photos to put the first one on.' : 'No photos yet.';
      sec.querySelector('.live-h').textContent = h.name + '’s photos';
      if (me.role === 'house') sec.querySelector('.live-h').hidden = true;   // the page title already says it
      sec.querySelector('.live-note').textContent = me.role === 'house' ? '' : (h.off ? 'Their invite is turned off.' : '');
      onPage.append(sec);
      TSS.livePhotos(sec);
    });
  }
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

  var more = box.querySelector('.lb-more'), pdfLink = box.querySelector('.lb-pdf');
  // Slides: one per picture; a piece with several photos (a 3D piece) gives one slide per photo, so a swipe goes through them.
  function slides() {
    var out = [];
    Array.prototype.forEach.call(area.querySelectorAll('.piece-open'), function (a) {
      if (a.offsetParent === null) return;
      var phs = a.dataset.photos ? JSON.parse(a.dataset.photos) : null;
      if (phs && phs.length > 1) phs.forEach(function (ph, n) { out.push({ a: a, ph: ph, n: n + 1, of: phs.length }); });
      else out.push({ a: a, ph: { full: a.dataset.full, w: a.dataset.w, h: a.dataset.h, dl: a.dataset.dl, pdf: a.dataset.pdf || '' }, n: 1, of: 1 });
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
    if (pdfLink) { pdfLink.hidden = !sl.ph.pdf; if (sl.ph.pdf) pdfLink.href = sl.ph.pdf; }
    if (sl.ph.pdf) { readyFor = sl; ready = null; if (saveBtn) saveBtn.hidden = true; return; }
    if (saveBtn) saveBtn.hidden = false;
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
  function bindSaveAll(btn) {
    if (!matchMedia('(pointer: coarse)').matches) return;
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
  }
  area.querySelectorAll('.save-all').forEach(bindSaveAll);
  TSS.bindSaveAll = bindSaveAll;
  area.addEventListener('click', function (e) {
    var a = e.target.closest('.piece-open'); if (!a) return;
    e.preventDefault();
    list = slides();
    var first = 0; for (var k = 0; k < list.length; k++) if (list[k].a === a) { first = k; break; }
    opener = a; show(first); box.showModal();
  });
  var fullBtn = box.querySelector('.lb-full');
  if (fullBtn) fullBtn.addEventListener('click', function () { TSS.enter(box); });
  box.addEventListener('cancel', function (e) { if (TSS.isFull()) { e.preventDefault(); TSS.exit(); } });
  box.querySelector('.lb-close').addEventListener('click', function () { if (TSS.isFull()) TSS.exit(); else box.close(); });
  box.querySelector('.lb-prev').addEventListener('click', function () { show(at - 1); });
  box.querySelector('.lb-next').addEventListener('click', function () { show(at + 1); });
  box.addEventListener('close', function () { TSS.exit(); img.removeAttribute('src'); if (opener) opener.focus(); });
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
      photos: p.photos.map(function (ph) { return { full: '/img/' + p.id + '/' + ph.n, thumb: '/img/' + p.id + '/' + ph.n + '/sm', w: ph.w || 800, h: ph.h || 800, pdf: ph.pdf ? '/img/' + p.id + '/' + ph.n + '/pdf' : '' }; }) };
  }
  function label(it) {
    return [it.kid === 'both' ? 'Made together' : it.grade, SEASON[it.season], niceDate(it.date)].filter(Boolean).join(' · ');
  }
  function piece(it, big) {
    var ph = it.photos[0], lab = label(it);
    var search = [it.caption, SEASON[it.season], yearLabel(it.schoolYear), it.grade, it.kid === 'both' ? 'made together both' : ''].join(' ').toLowerCase();
    var alt = it.alt || it.caption || ('A drawing by ' + (it.kid === 'both' ? 'both girls' : live.dataset.name));
    return '<figure class="piece' + (big ? ' piece--big' : '') + '" data-search="' + esc(search) + '">' +
      '<a class="piece-open" href="' + esc(ph.full) + '" data-full="' + esc(ph.full) + '" data-dl="' + esc(ph.full) + '" data-name="' + esc(it.id) + '" data-w="' + ph.w + '" data-h="' + ph.h + '"' + (ph.pdf ? ' data-pdf="' + esc(ph.pdf) + '"' : '') +
      (it.photos.length > 1 ? ' data-photos="' + esc(JSON.stringify(it.photos)) + '"' : '') +
      ' data-caption="' + esc(it.caption) + '" data-label="' + esc(lab) + '" aria-label="Open ' + esc(it.caption || 'this drawing') + ' big">' +
      '<img src="' + esc(big ? ph.full : ph.thumb) + '" alt="' + esc(alt) + '" width="' + ph.w + '" height="' + ph.h + '" loading="lazy" decoding="async">' +
      (it.sample ? '<span class="sample-tag">Sample</span>' : '') +
      (it.photos.some(function (x) { return x.pdf; }) ? '<span class="pdf-tag">PDF</span>' : '') +
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
  fetch(live.dataset.api || '/api/pieces?kid=' + encodeURIComponent(kid), { credentials: 'same-origin' })
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
  if (q.get('kind') === 'friend' || q.get('friend')) form.elements.kind.value = 'friend';
  var e = q.get('e');
  if (e) { var m = document.querySelector('.login-error[data-e="' + e + '"]'); if (m) m.hidden = false; }
})();

// ---------- photos from the girls' tablets: a simple grid and viewer ----------
TSS.livePhotos = livePhotos;
document.querySelectorAll('.live-photos').forEach(function (sec) { if (sec.dataset.src) livePhotos(sec); });
function livePhotos(sec) {
  'use strict';
  var grid = sec.querySelector('.photo-grid'), box = sec.querySelector('.photo-box');
  var img = box.querySelector('.pb-img'), cap = box.querySelector('.pb-cap'), list = [], at = 0;
  function nice(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); }
  var names = {}; document.querySelectorAll('.art-live').forEach(function (a) { names[a.dataset.kid] = a.dataset.name; });
  function show(i) {
    at = (i + list.length) % list.length; var p = list[at];
    img.src = '/img/' + encodeURIComponent(p.id) + '/1'; img.alt = p.caption || 'Photo';
    cap.textContent = [p.caption, p.byName, nice(p.date)].filter(Boolean).join(' · ');
    var sv = box.querySelector('.pb-save'); sv.textContent = '⬇ Save this picture'; sv.disabled = false;
    if (!box.open) box.showModal();
  }
  var pbFull = box.querySelector('.pb-full'), pbSave = box.querySelector('.pb-save');
  pbFull.addEventListener('click', function () { TSS.enter(box); });
  pbSave.addEventListener('click', function () {
    var p = list[at], name = (p.caption || 'photo-' + p.date).replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'photo';
    pbSave.disabled = true; pbSave.textContent = 'Getting it ready…';
    var im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
      c.toBlob(function (bl) {
        TSS.save(new File([bl], name + '.jpg', { type: 'image/jpeg' }))
          .then(function (how) { pbSave.textContent = how === 'downloaded' ? '✓ Saved to Downloads' : '⬇ Save this picture'; },
            function () { pbSave.textContent = 'That did not work. Try again?'; })
          .then(function () { pbSave.disabled = false; });
      }, 'image/jpeg', 0.92);
    };
    im.onerror = function () { pbSave.textContent = 'Could not get this picture'; pbSave.disabled = false; };
    im.src = img.src;
  });
  box.addEventListener('cancel', function (e) { if (TSS.isFull()) { e.preventDefault(); TSS.exit(); } });
  box.addEventListener('close', function () { TSS.exit(); });
  box.querySelector('.pb-close').addEventListener('click', function () { if (TSS.isFull()) TSS.exit(); else box.close(); });
  box.querySelector('.pb-prev').addEventListener('click', function () { show(at - 1); });
  box.querySelector('.pb-next').addEventListener('click', function () { show(at + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
  fetch(sec.dataset.src, { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      list = (j.pieces || []).sort(function (a, b) { return (b.date + b.created).localeCompare(a.date + a.created); });
      if (sec.dataset.src.indexOf('moments') !== -1) {
        addToDays(list.filter(function (p) { return p.event; }));
        list = list.filter(function (p) { return !p.event; });   // the girls' own photos stay in their own row
      }
      if (!list.length) {
        if (sec.dataset.empty) { var em = document.createElement('p'); em.className = 'muted'; em.textContent = sec.dataset.empty; grid.replaceWith(em); sec.hidden = false; }
        return;
      }
      list.forEach(function (p, i) {
        p.byName = sec.dataset.src.indexOf('moments') !== -1 ? (p.from || p.byName || names[p.kid] || (p.kid.charAt(0).toUpperCase() + p.kid.slice(1))) : '';
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
}

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

// ---------- Family Moments: videos added from the app, in their special day's section ----------
(function () {
  'use strict';
  var area = document.querySelector('.gallery-area[data-videos]');
  if (!area || !area.dataset.videos) return;   // a family's studio: no videos yet
  function nice(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function mmss(s) { s = Math.round(s || 0); return s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : ''; }
  function make(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function section(v) { return TSS.daySection(v.event, v.eventTitle, v.eventDate); }
  // Save: fetch the whole video in pieces (the site hands it out a few MB at a time), then hand it to the phone or computer.
  var EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/x-m4v': 'm4v' };
  async function saveVideo(v, base, btn) {
    if (btn.disabled) return;
    var label = btn.textContent; btn.disabled = true;
    try {
      var parts = [], at = 0;
      while (at < v.size) {
        btn.textContent = 'Getting it… ' + Math.round(at / v.size * 100) + '%';
        var r = await fetch(base + '/play', { credentials: 'same-origin', headers: { range: 'bytes=' + at + '-' } });
        if (!r.ok) throw new Error(r.status);
        var b = await r.arrayBuffer();
        if (!b.byteLength) throw new Error('empty');
        parts.push(b); at += b.byteLength;
      }
      var name = (v.caption || v.eventTitle || 'video').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) + '.' + (EXT[v.type] || 'mp4');
      var file = new File(parts, name, { type: v.type });
      btn.textContent = (await TSS.save(file)) === 'downloaded' ? '✓ Saved to Downloads' : label;
    } catch (e) {
      btn.textContent = e && e.name === 'AbortError' ? label : 'Could not save it. Try again?';
    }
    setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 4000);
  }
  fetch(area.dataset.videos, { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      var list = (j.videos || []).slice().reverse();   // oldest first inside each day
      if (!list.length) return;
      area.hidden = false;
      var empty = area.nextElementSibling; if (empty && empty.classList.contains('empty')) empty.hidden = true;
      list.forEach(function (v) {
        var sec = section(v), row = sec.querySelector('.video-row');
        if (!row) { row = make('div', 'video-row'); sec.insertBefore(row, sec.querySelector('.masonry')); }
        var base = '/api/videos/' + encodeURIComponent(v.id);
        var fig = make('figure', 'video-tile wobbly');
        var el = document.createElement('video');
        el.controls = true; el.preload = 'none'; el.playsInline = true; el.setAttribute('playsinline', '');
        if (v.poster) el.poster = base + '/poster';
        if (v.w && v.h) { el.width = v.w; el.height = v.h; }
        el.src = base + '/play';
        el.setAttribute('aria-label', 'Play the video' + (v.caption ? ': ' + v.caption : ''));
        var cap = make('figcaption');
        if (v.caption) cap.append(make('span', 'art-cap', v.caption));
        var len = mmss(v.seconds);
        if (len) cap.append(make('span', 'vid-len', '🎬 ' + len));
        var oops = make('p', 'vid-oops', 'This video cannot play on this device. Try a phone or a computer.'); oops.hidden = true;
        el.addEventListener('error', function () { oops.hidden = false; });
        var tools = make('div', 'vid-tools');
        var big = make('button', 'vid-btn', '⛶ Full screen'); big.type = 'button';
        big.addEventListener('click', function () {
          if (!el.requestFullscreen && !el.webkitRequestFullscreen && el.webkitEnterFullscreen) { el.webkitEnterFullscreen(); el.play().catch(function () {}); return; }   // iPhone
          TSS.enter(fig); el.play().catch(function () {});
        });
        var save = make('button', 'vid-btn', '⬇ Save this video'); save.type = 'button';
        save.addEventListener('click', function () { saveVideo(v, base, save); });
        tools.append(big, save);
        var shut = make('button', 'vid-shut', '✕'); shut.type = 'button'; shut.setAttribute('aria-label', 'Close the big video');
        shut.addEventListener('click', function () { TSS.exit(); });
        fig.append(shut, el, cap, tools, oops); row.append(fig);
      });
    })
    .catch(function () { /* the photos stay as they are */ });
})();

// ---------- Family Moments: photos of a special day added from the app, in that day's section ----------
// Each day gets "Download all" (one zip, made in the browser from the print-size copies) and, on phones, "Save all".
function addToDays(pieces) {
  'use strict';
  if (!pieces.length || !document.querySelector('.gallery-area[data-videos]')) return;
  function make(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function nice(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  var touched = {};
  pieces.slice().reverse().forEach(function (p) {   // oldest first inside each day
    var sec = TSS.daySection(p.event, p.eventTitle, p.eventDate), grid = sec.querySelector('.masonry');
    if (!grid) { grid = make('div', 'masonry'); sec.append(grid); }
    p.photos.forEach(function (ph) {
      var base = '/img/' + encodeURIComponent(p.id) + '/' + ph.n;
      var fig = make('figure', 'piece'), a = make('a', 'piece-open'), im = document.createElement('img');
      a.href = base; a.dataset.full = base; a.dataset.dl = base + '/print'; a.dataset.name = p.id + (p.photos.length > 1 ? '-' + ph.n : '');
      a.dataset.w = ph.w; a.dataset.h = ph.h; a.dataset.caption = p.caption || ''; a.dataset.label = nice(p.date) + ' · ' + p.eventTitle + (p.from || p.byName ? ' · added by ' + (p.from || p.byName) : '');
      a.setAttribute('aria-label', 'Open ' + (p.caption || 'this photo') + ' big');
      im.src = base + '/sm'; im.alt = p.caption || 'A photo from ' + p.eventTitle; im.loading = 'lazy'; im.decoding = 'async';
      if (ph.w && ph.h) { im.width = ph.w; im.height = ph.h; }
      a.append(im); fig.append(a);
      if (p.caption) { var fc = make('figcaption'); fc.append(make('span', 'art-cap', p.caption)); fig.append(fc); }
      grid.append(fig);
    });
    touched[p.event] = sec;
  });
  Object.keys(touched).forEach(function (k) {
    var sec = touched[k], head = sec.querySelector('.moment-head'), n = sec.querySelectorAll('.piece-open').length;
    var old = head.querySelector('.dl-row'); if (old) old.remove();   // the hand-added zip no longer has every photo
    var row = make('div', 'dl-row'), phone = make('button', 'btn-download save-all', '📱 Save all ' + n + ' to this phone'), all = make('button', 'btn-download zip-all', '⬇ Download all ' + n + ' as one zip');
    phone.type = all.type = 'button'; phone.hidden = true;
    all.append(make('span', 'dl-size', '(for a computer or a photo book)'));
    all.addEventListener('click', async function () {
      if (all.disabled) return;
      var links = sec.querySelectorAll('.piece-open'), files = [], label = all.innerHTML; all.disabled = true;
      try {
        for (var i = 0; i < links.length; i++) {
          all.textContent = 'Getting ' + (i + 1) + ' of ' + links.length + '…';
          var r = await fetch(links[i].dataset.dl || links[i].dataset.full, { credentials: 'same-origin' });
          if (!r.ok) throw new Error(r.status);
          var type = r.headers.get('content-type') || '', ext = /webp/.test(type) ? 'webp' : /png/.test(type) ? 'png' : 'jpg';
          files.push({ name: k + '/' + String(i + 1).padStart(3, '0') + '_' + (links[i].dataset.name || 'photo') + '.' + ext, data: new Uint8Array(await r.arrayBuffer()) });
        }
        await TSS.save(new File([TSS.zip(files)], k + '.zip', { type: 'application/zip' }));
        all.innerHTML = label;
      } catch (e) { all.textContent = 'That did not work. Try again?'; }
      all.disabled = false;
    });
    row.append(phone, all); head.append(row);
    if (TSS.bindSaveAll) TSS.bindSaveAll(phone);
  });
}

// ---------- "Share this page" (Jesse, 2026-11-25): family logins make a link to one page and send it in one go ----------
// The link is the key: whoever taps it sees that page only, until it ends or a parent turns it off on the For parents page.
// Making a link needs the parent PIN once; a parent's phone then remembers it for 30 days.
(function () {
  'use strict';
  var btns = document.querySelectorAll('.share-page');
  var root = document.documentElement;
  if (!btns.length || root.classList.contains('is-friend') || root.classList.contains('is-kid')) return;
  function make(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  var box = make('dialog', 'share-box'); box.setAttribute('aria-label', 'Share this page');
  var h = make('h2', 'share-h'), note = make('p', 'share-note', 'Anyone with the link can see this page, nothing else. It keeps working until it is turned off on the For parents page.');
  var go = make('button', 'btn-big share-go', '📤 Share the link'); go.type = 'button';
  var msg = make('p', 'share-msg'); msg.setAttribute('role', 'status');
  var shut = make('button', 'linkish share-close', 'Close'); shut.type = 'button';
  box.append(h, note, go, msg, shut);
  document.body.append(box);
  shut.addEventListener('click', function () { box.close(); });
  box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
  var page = null, label = '', made = null;
  btns.forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      page = b.dataset.share; label = b.dataset.label; made = null;
      h.textContent = 'Share ' + label; msg.textContent = ''; go.textContent = '📤 Share the link'; go.disabled = false;
      if (typeof box.showModal === 'function') box.showModal(); else box.setAttribute('open', '');
    });
  });
  async function post(url, body) {
    var r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    var j = {}; try { j = await r.json(); } catch (e) {}
    return j;
  }
  async function send() {
    var what = { title: label, text: label + ' on our family art site:', url: made };
    try {
      if (navigator.share) { await navigator.share(what); msg.textContent = '✓ Sent. To stop it working, turn it off on the For parents page.'; return; }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.name === 'NotAllowedError') { go.textContent = '📤 Send the link'; msg.textContent = 'The link is ready. Tap Send the link.'; return; }
    }
    try { await navigator.clipboard.writeText(made); msg.textContent = '✓ Link copied. Paste it into a text or an email.'; }
    catch (e) { msg.textContent = 'Copy this link: ' + made; }
  }
  go.addEventListener('click', async function () {
    if (made) return send();
    go.disabled = true; msg.textContent = 'Making the link…';
    try {
      var j = await post('/api/links', { pages: [page] });
      if (!j.ok) throw new Error(j.error || 'no');
      made = j.link.url; go.disabled = false;
      await send();
    } catch (e) { msg.textContent = 'That did not work. Try again?'; go.disabled = false; }
  });
})();

// ---------- the home screen guide (build spec, 2026-11-25): once per phone, after a View link. A picture, no words ----------
(function () {
  'use strict';
  var g = document.getElementById('guide'), q = new URLSearchParams(location.search);
  if (!g || !q.get('hello')) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  var installed = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  try { if (installed || localStorage.getItem('tss-guide')) return; localStorage.setItem('tss-guide', '1'); } catch (e) {}
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  g.querySelector('[data-os="ios"]').hidden = !ios; g.querySelector('[data-os="android"]').hidden = ios;
  g.querySelector('.guide-skip').addEventListener('click', function () { g.close(); });
  if (g.showModal) g.showModal(); else g.setAttribute('open', '');
})();

// ---------- the family menu (build spec): every studio's View link, in every studio. Shows once there are two ----------
TSS.famMenu = function () {
  'use strict';
  var li = document.querySelector('.tab-fam-li'), root = document.documentElement;
  if (!li || li.dataset.done || root.classList.contains('is-friend') || root.classList.contains('is-kid')) return;
  li.dataset.done = '1';
  function make(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  fetch('/api/studios/menu', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
    var list = j.studios || [];
    if (list.length < 2) return;
    var box = make('dialog', 'share-box fam-box'); box.setAttribute('aria-label', 'Family');
    var ul = make('ul', 'fam-list');
    list.forEach(function (st) {
      var a = make('a', 'big-button wobbly c-' + (st.color || 'sky')); a.href = st.mine ? st.href : (st.view || st.href);
      a.append(make('span', 'big-label', st.name)); var it = make('li'); it.append(a); ul.append(it);
    });
    var shut = make('button', 'linkish share-close', 'Close'); shut.type = 'button';
    box.append(ul, shut); document.body.append(box);
    shut.addEventListener('click', function () { box.close(); });
    box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
    li.querySelector('button').addEventListener('click', function () { if (box.showModal) box.showModal(); else box.setAttribute('open', ''); });
    li.hidden = false;
  }).catch(function () {});
};
TSS.famMenu();
