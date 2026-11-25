// A shared link (studios batch 3, 2026-11-25): one picture, a few, or one special day. No login: the link is the key.
// Shows the pictures (never cropped) and the videos; tap a picture to see it big, save it, or see it full screen.
(function () {
  'use strict';
  var id = new URLSearchParams(location.search).get('l') || '';
  var $ = function (s) { return document.querySelector(s); };
  var foot = $('.foot-parent'); if (foot) foot.hidden = true;   // a visitor: no For parents
  var brand = $('.site-header .brand'); if (brand) brand.removeAttribute('href');
  function make(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function nice(iso) { return iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''; }
  var base = '/api/shared/' + encodeURIComponent(id);
  function off() { $('#shared-wait').hidden = true; $('#shared-off').hidden = false; }
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return off();

  fetch(base, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    $('#shared-wait').hidden = true;
    var title = j.title || (j.studio ? j.studio : 'Pictures');
    $('#shared-h').textContent = title;
    document.title = title + ' · ' + (j.studio || 'Two Sisters Studio');
    $('#shared-date').textContent = j.title && j.date ? nice(j.date) : '';
    var grid = $('#shared-grid'), vids = $('#shared-videos'), slides = [];
    if (!j.items.length) { $('#shared-off').textContent = 'Nothing here right now.'; $('#shared-off').hidden = false; }
    j.items.forEach(function (it) {
      if (it.kind === 'video') {
        var vb = base + '/video/' + encodeURIComponent(it.id), fig = make('figure', 'video-tile wobbly'), el = document.createElement('video');
        el.controls = true; el.preload = 'none'; el.playsInline = true; el.setAttribute('playsinline', '');
        if (it.poster) el.poster = vb + '/poster';
        el.src = vb; el.setAttribute('aria-label', 'Play the video' + (it.caption ? ': ' + it.caption : ''));
        fig.append(el);
        if (it.caption) { var c = make('figcaption'); c.append(make('span', 'art-cap', it.caption)); fig.append(c); }
        vids.append(fig);
        return;
      }
      it.photos.forEach(function (ph) {
        var src = base + '/img/' + encodeURIComponent(it.id) + '/' + ph.n;
        var f = make('figure', 'piece'), a = make('a', 'piece-open'), im = document.createElement('img');
        a.href = src; a.setAttribute('aria-label', 'Open ' + (it.caption || 'this picture') + ' big');
        im.src = src + '/sm'; im.alt = it.caption || 'A picture'; im.loading = 'lazy'; im.decoding = 'async';
        if (ph.w && ph.h) { im.width = ph.w; im.height = ph.h; }
        a.append(im); f.append(a);
        if (it.caption) { var fc = make('figcaption'); fc.append(make('span', 'art-cap', it.caption)); f.append(fc); }
        grid.append(f);
        var n = slides.length;
        slides.push({ src: src, dl: src + (ph.print ? '/print' : ''), cap: [it.caption, nice(it.date)].filter(Boolean).join(' · '), name: (it.caption || it.id).replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'picture' });
        a.addEventListener('click', function (e) { if (box.showModal) { e.preventDefault(); show(n); } });
      });
    });

    // The big view
    var box = $('.shared-box'), img = box.querySelector('.lb-img'), cap = box.querySelector('.lb-cap'), save = box.querySelector('.lb-save'), at = 0;
    function show(i) {
      at = (i + slides.length) % slides.length; var s = slides[at];
      img.src = s.src; img.alt = s.cap || 'A picture'; cap.textContent = s.cap;
      save.textContent = '⬇ Save this picture'; save.disabled = false;
      if (!box.open) box.showModal();
    }
    box.querySelector('.lb-prev').hidden = box.querySelector('.lb-next').hidden = slides.length < 2;
    box.querySelector('.lb-prev').addEventListener('click', function () { show(at - 1); });
    box.querySelector('.lb-next').addEventListener('click', function () { show(at + 1); });
    box.querySelector('.lb-close').addEventListener('click', function () { if (window.TSS && TSS.isFull()) TSS.exit(); else box.close(); });
    box.querySelector('.lb-full').addEventListener('click', function () { if (window.TSS) TSS.enter(box); });
    box.addEventListener('cancel', function (e) { if (window.TSS && TSS.isFull()) { e.preventDefault(); TSS.exit(); } });
    box.addEventListener('close', function () { if (window.TSS) TSS.exit(); });
    box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
    document.addEventListener('keydown', function (e) { if (!box.open) return; if (e.key === 'ArrowLeft') show(at - 1); if (e.key === 'ArrowRight') show(at + 1); });
    save.addEventListener('click', function () {
      var s = slides[at], im = new Image(); save.disabled = true; save.textContent = 'Getting it ready…';
      im.onload = function () {
        var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
        c.toBlob(function (bl) {
          TSS.save(new File([bl], s.name + '.jpg', { type: 'image/jpeg' }))
            .then(function (how) { save.textContent = how === 'downloaded' ? '✓ Saved to Downloads' : '⬇ Save this picture'; }, function () { save.textContent = 'That did not work. Try again?'; })
            .then(function () { save.disabled = false; });
        }, 'image/jpeg', 0.92);
      };
      im.onerror = function () { save.textContent = 'Could not get this picture'; save.disabled = false; };
      im.src = s.dl;
    });
  }).catch(off);
})();
