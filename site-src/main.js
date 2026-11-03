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
  }
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
