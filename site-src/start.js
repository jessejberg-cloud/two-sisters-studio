// Onboarding (build spec, 2026-11-25): a family makes its own studio from the invite Jesse sent.
// 1 Studio + Artists (kid, grown-up or pet; + Add someone) · 2 PIN + Color (makes the studio) · 3 Google Drive (needed, Jesse 2026-11-25) · 4 Invite + View links
// · 5 Add to Home Screen picture · 6 Camera. One word per label. What was left empty shows on For parents.
// The answers live in this browser (localStorage) so the trip to Google and back picks up where it left off.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var KEY = 'tss-start';
  var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  function keep() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} }
  function go(n) { document.querySelectorAll('.step').forEach(function (s) { s.hidden = s.dataset.step !== String(n); }); window.scrollTo(0, 0); var f = document.querySelector('.step:not([hidden]) input'); if (f && n !== 2) f.focus(); }
  var step = 1;
  document.querySelectorAll('[data-next]').forEach(function (b) { b.addEventListener('click', function () { go(++step); }); });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { go(--step); }); });

  // 1: studio name, artists (a kid, a grown-up or a pet; only a kid has a grade)
  function kidRow() {
    var li = $('#st-kid').content.firstElementChild.cloneNode(true), kind = li.querySelector('.st-kind'), grade = li.querySelector('.st-grade');
    kind.addEventListener('change', function () { grade.hidden = kind.value !== 'kid'; li.classList.toggle('no-grade', grade.hidden); });
    $('#st-kids').append(li); return li;
  }
  kidRow();
  $('#st-more').addEventListener('click', function () { kidRow().querySelector('input').focus(); });
  // Categories, optional and folded away (Jesse, 2026-11-25): tap an idea (it comes with its template), or name your own.
  var ideas = []; try { ideas = JSON.parse($('#cat-ideas').textContent); } catch (e) {}
  var picked = [];
  function chip(c) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'idea'; b.setAttribute('aria-pressed', 'false');
    b.textContent = (c.icon ? c.icon + ' ' : '') + c.name;
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on));
      picked = on ? picked.concat(c) : picked.filter(function (x) { return x !== c; });
    });
    $('#st-ideas').append(b); return b;
  }
  ideas.forEach(chip);
  $('#st-cats-open').addEventListener('click', function () { var box = $('#st-cats-box'); box.hidden = !box.hidden; this.setAttribute('aria-expanded', String(!box.hidden)); });
  $('#st-own-add').addEventListener('click', function () {
    var n = $('#st-own').value.trim(); if (!n) { $('#st-own').focus(); return; }
    var c = { name: n, scan: $('#st-own-paper').checked, icon: $('#st-own-paper').checked ? '📄' : '📷' };
    chip(c).click(); $('#st-own').value = ''; $('#st-own-paper').checked = false;
  });
  $('#st-own').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#st-own-add').click(); });


  // 2: PIN dots and color
  var pin = $('#st-pin'), dots = document.querySelectorAll('#pin-dots span');
  pin.addEventListener('input', function () {
    pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
    dots.forEach(function (d, i) { d.classList.toggle('on', i < pin.value.length); });
  });
  $('#pin-dots').addEventListener('click', function () { pin.focus(); });
  $('#st-make').addEventListener('click', async function () {
    var msg = $('#st-msg'); msg.hidden = true;
    if (!/^\d{4}$/.test(pin.value)) { msg.textContent = '4 numbers.'; msg.hidden = false; pin.focus(); return; }
    var name = $('#st-name').value.trim();
    var kids = Array.prototype.map.call(document.querySelectorAll('#st-kids .st-kid'), function (li) {
      var kind = li.querySelector('.st-kind').value;
      return { name: li.querySelector('input').value.trim(), kind: kind, grade: kind === 'kid' ? li.querySelector('.st-grade').value : '' };
    }).filter(function (k) { return k.name; });
    var color = (document.querySelector('input[name="st-color"]:checked') || {}).value || 'sky';
    var skipped = []; if (!name) skipped.push('name'); if (!kids.length) skipped.push('kids');
    this.disabled = true;
    var j = {};
    try {
      var r = await fetch('/api/studios/create', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name, kids: kids, cats: picked, pin: pin.value, color: color, skipped: skipped }) });
      j = await r.json();
    } catch (e) {}
    this.disabled = false;
    if (!j.ok) { msg.textContent = j.error === 'invite' ? 'This link was turned off. Ask for a new one.' : 'That did not work. Try again?'; msg.hidden = false; return; }
    saved = { slug: j.studio.slug, invite: j.invite, view: j.view, step: 3 }; keep();
    driveLink(); step = 3; go(3);
  });

  // 3: Google Drive (the family's own; the originals are kept there)
  function driveLink() { $('#st-drive').href = '/api/google/start?from=start&s=' + encodeURIComponent(saved.slug); }

  // 4: the two links
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', async function () {
      var url = saved && saved[b.dataset.copy]; if (!url) return;
      if (navigator.share && /Android|iPhone|iPad/.test(navigator.userAgent)) { try { await navigator.share({ url: url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(url); $('#st-copied').textContent = '✓ ' + b.textContent.trim(); } catch (e) { $('#st-copied').textContent = url; }
    });
  });

  // 5: the right phone picture
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  document.querySelector('.step [data-os="ios"]').hidden = !ios; document.querySelector('.step [data-os="android"]').hidden = ios;

  // 6: the camera: the app, on this studio (this phone was added when the studio was made)
  function camera() { $('#st-camera').href = '/upload/?s=' + encodeURIComponent(saved.slug); }
  $('#st-camera').addEventListener('click', function () { try { localStorage.removeItem(KEY); } catch (e) {} });

  // ---------- where to start ----------
  var q = new URLSearchParams(location.search);
  if (saved && saved.slug) {
    driveLink(); camera();
    if (q.get('connected')) { saved.step = 4; keep(); }
    if (q.get('e')) { $('#st-drive-msg').textContent = 'Google did not connect. Try again?'; $('#st-drive-msg').hidden = false; }
    step = saved.step || 3;
    try { history.replaceState(null, '', '/start/'); } catch (e) {}
    go(step);
    document.querySelectorAll('[data-next]').forEach(function (b) { b.addEventListener('click', function () { saved.step = step; keep(); camera(); }); });
    return;
  }
  fetch('/api/studios/create', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
    if (!j.ok) { go(0); return; }
    if (j.name) $('#st-name').value = j.name;
    go(1);
  }).catch(function () { go(1); });
})();
