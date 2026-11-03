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

// ---------- art galleries: filters and the big-picture viewer ----------
(function () {
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

  function show(i) {
    at = (i + list.length) % list.length;
    var a = list[at];
    img.src = a.dataset.full; img.width = +a.dataset.w; img.height = +a.dataset.h;
    img.alt = a.querySelector('img').alt;
    cap.textContent = !a.dataset.caption ? '' : a.closest('.moment') ? a.dataset.caption : '“' + a.dataset.caption + '”';
    label.textContent = a.dataset.label;
    prepareSave(a);
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
  function prepareSave(a) {
    readyFor = a; ready = null;
    if (!saveBtn) return;
    saveBtn.disabled = true; saveBtn.textContent = 'Getting it ready…';
    jpegFile(a.dataset.dl, a.dataset.name || 'picture').then(function (f) {
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
    list = Array.prototype.filter.call(area.querySelectorAll('.piece-open'), function (x) { return x.offsetParent !== null; });
    opener = a; show(list.indexOf(a)); box.showModal();
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
