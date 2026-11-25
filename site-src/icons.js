// An artist's own icon (Jesse, 2026-11-25): one of eight hand-drawn icons, picked in setup or on For parents.
// With none picked, the artists get them in order (a pet gets the paw). The drawings come from the page (#artist-icons).
(function () {
  'use strict';
  var KEYS = ['palette', 'crayon', 'star', 'rocket', 'flower', 'dino', 'ball', 'paw'];
  var SVG = null;
  function svgs() {
    if (!SVG) { try { SVG = JSON.parse(document.getElementById('artist-icons').textContent); } catch (e) { SVG = {}; } }
    return SVG;
  }
  function keyOf(k, i) { return KEYS.indexOf(k && k.icon) !== -1 ? k.icon : k && k.kind === 'pet' ? 'paw' : KEYS[(i || 0) % 7]; }
  // A span with the drawing in it (the drawings are this site's own, built in; no outside text goes into innerHTML).
  function icon(k, i, cls) { var s = document.createElement('span'); s.className = cls || 'big-icon'; s.innerHTML = svgs()[keyOf(k, i)] || ''; return s; }
  // A small button that shows the icon; a tap opens a row of all eight. The pick is kept on li.dataset.icon.
  function picker(li, k, i) {
    var wrap = document.createElement('div'), btn = document.createElement('button'), row = document.createElement('div');
    wrap.className = 'icon-pick'; btn.type = 'button'; btn.className = 'icon-now'; btn.setAttribute('aria-label', 'Icon'); btn.setAttribute('aria-expanded', 'false');
    row.className = 'icon-row'; row.hidden = true;
    li.dataset.icon = KEYS.indexOf(k && k.icon) !== -1 ? k.icon : '';
    function draw() { btn.innerHTML = svgs()[li.dataset.icon || keyOf(k, i)] || ''; row.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.icon === (li.dataset.icon || keyOf(k, i)))); }); }
    KEYS.forEach(function (key) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.icon = key; b.setAttribute('aria-label', key); b.innerHTML = svgs()[key] || '';
      b.addEventListener('click', function () { li.dataset.icon = key; row.hidden = true; btn.setAttribute('aria-expanded', 'false'); draw(); });
      row.append(b);
    });
    btn.addEventListener('click', function () { row.hidden = !row.hidden; btn.setAttribute('aria-expanded', String(!row.hidden)); });
    wrap.append(btn, row); draw();
    return wrap;
  }
  window.TSS_ICONS = { keys: KEYS, keyOf: keyOf, icon: icon, picker: picker, svg: function (key) { return svgs()[key] || ''; } };
})();
