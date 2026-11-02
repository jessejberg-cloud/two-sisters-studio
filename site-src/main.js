// Pet Parents: small, gentle extras. Everything works without this file.
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
