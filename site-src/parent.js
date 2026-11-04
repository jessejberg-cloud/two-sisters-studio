// The parent page: parent PIN, Google Drive connection, rebuild from Drive, log out.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var MSG = { pin: 'Please type the parent PIN first.', secret: 'The Google client secret is not in Netlify yet (see the how-to).',
    state: 'That took too long. Please try Connect again.', denied: 'Google was not allowed. Try again and tap Allow.',
    norefresh: 'Google did not give a lasting key. Try Connect again.', scope: 'Google did not give permission to save files. Try again and tick the box.',
    google: 'Google said no. Try Connect again.' };
  var q = new URLSearchParams(location.search);

  async function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), credentials: 'same-origin' });
  }
  function size(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB'; }

  var opened = false;
  async function openTools() {
    if (opened) return; opened = true;
    $('#pin-box').hidden = true; $('#parent-tools').hidden = false;
    var g = await (await fetch('/api/google/status', { credentials: 'same-origin' })).json();
    if (g.error) { opened = false; $('#pin-box').hidden = false; $('#parent-tools').hidden = true; return; }
    if (g.connected) {
      $('#g-status').textContent = 'Connected' + (g.email ? ' to ' + g.email : '') + '.' +
        (g.limit ? ' Drive space: ' + size(g.used) + ' of ' + size(g.limit) + ' used.' : '') + (g.problem ? ' Problem: ' + g.problem : '');
      $('#g-connect').textContent = 'Connect again';
    } else $('#g-status').textContent = 'Not connected yet. Uploads need this once.';
    if (q.get('connected')) $('#g-status').textContent = 'Connected! ' + $('#g-status').textContent;
    showRebuild(); showLinks(); getFriendsPw(); showWaiting(); showTablets();
  }

  // ---------- share links ----------
  var friendsPw = null;
  function getFriendsPw() {
    fetch('/api/links/password', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { friendsPw = j.password || null; }, function () {});
  }
  var pageBoxes = Array.prototype.slice.call(document.querySelectorAll('input[name="pages"]'));
  $('#pages-all').addEventListener('change', function () { var on = this.checked; pageBoxes.forEach(function (b) { b.checked = on; }); });
  pageBoxes.forEach(function (b) { b.addEventListener('change', function () { $('#pages-all').checked = pageBoxes.every(function (x) { return x.checked; }); }); });
  function until(l) { return l.expires ? 'until ' + new Date(l.expires).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'no end date'; }
  // The phone's Share list with only this one thing in it; on a computer, copy it instead.
  async function send(what, note) {
    try {
      if (navigator.share) { await navigator.share(what); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(what.url || what.text); note.textContent = 'Copied. Paste it into a text or email.'; }
    catch (e) { note.textContent = 'Copy this: ' + (what.url || what.text); }
  }
  var current = null;
  $('#link-make').addEventListener('click', async function () {
    var msg = $('#link-msg'); msg.hidden = true;
    var pages = pageBoxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
    var exp = document.querySelector('input[name="expiry"]:checked');
    if (!pages.length) { msg.textContent = 'Tick at least one page.'; msg.hidden = false; return; }
    var j = {}; try { j = await (await post('/api/links', { pages: pages, expiry: exp ? exp.value : 'month' })).json(); } catch (e) {}
    if (!j.ok) {
      msg.textContent = j.error === 'pin' ? 'Please type the parent PIN again.' : j.error === 'friends-not-set' ? 'Set a friends password first (below, or FRIENDS_PASSWORD in Netlify).' : 'That did not work. Try again?';
      msg.hidden = false; if (j.error === 'pin') location.reload(); return;
    }
    current = j.link;
    $('#link-url').textContent = j.link.names.join(', ') + ', ' + until(j.link) + ':\n' + j.link.url;
    $('#send-note').textContent = 'Send the link first, then the password, as two separate texts.';
    $('#link-made').hidden = false;
    if (!friendsPw) getFriendsPw();
    showLinks();
  });
  $('#send-link').addEventListener('click', function () { if (current) send({ url: current.url }, $('#send-note')); });
  $('#send-pw').addEventListener('click', function () {
    if (!friendsPw) { $('#send-note').textContent = 'The friends password was changed outside this page. Set it again below to send it from here.'; return; }
    send({ text: 'Password for the art site: ' + friendsPw }, $('#send-note'));
  });
  var linksTurn = 0;
  async function showLinks() {
    var turn = ++linksTurn, j = {};
    try { j = await (await fetch('/api/links', { credentials: 'same-origin' })).json(); } catch (e) { return; }
    if (turn !== linksTurn) return;   // a newer list is on its way
    var ul = $('#link-list'); ul.textContent = '';
    if (!j.links || !j.links.length) { var none = document.createElement('li'); none.className = 'muted'; none.textContent = 'None yet.'; ul.append(none); return; }
    j.links.forEach(function (l) {
      var li = document.createElement('li'); li.className = 'link-item' + (l.open ? '' : ' is-off');
      var t = document.createElement('p'); t.textContent = l.names.join(', ') + ' · ' + until(l) + ' · made ' + new Date(l.created).toLocaleDateString() + (l.open ? '' : l.off ? ' · turned off' : ' · ended');
      li.append(t);
      if (l.open) {
        var row = document.createElement('div'); row.className = 'send-row';
        var again = document.createElement('button'); again.type = 'button'; again.className = 'chip'; again.textContent = 'Send link';
        again.addEventListener('click', function () { send({ url: l.url }, t); });
        var off = document.createElement('button'); off.type = 'button'; off.className = 'linkish'; off.textContent = 'Turn off';
        off.addEventListener('click', async function () { off.disabled = true; await post('/api/links/' + l.id + '/off'); showLinks(); });
        row.append(again, off); li.append(row);
      }
      ul.append(li);
    });
  }

  // ---------- photos from the girls' tablets, waiting for an OK ----------
  var KIDNAME = {}; document.querySelectorAll('[data-tablet]').forEach(function (r) { KIDNAME[r.dataset.tablet] = r.querySelector('h3').textContent; });
  async function showWaiting() {
    var j = {}; try { j = await (await fetch('/api/pieces/waiting', { credentials: 'same-origin' })).json(); } catch (e) { return; }
    var ul = $('#wait-list'); ul.textContent = '';
    if (!j.waiting || !j.waiting.length) { var none = document.createElement('li'); none.className = 'muted'; none.textContent = 'None waiting.'; ul.append(none); return; }
    j.waiting.forEach(function (p) {
      var li = document.createElement('li'); li.className = 'wait-item';
      var im = document.createElement('img'); im.src = '/img/' + encodeURIComponent(p.id) + '/1/sm'; im.alt = p.caption || 'Photo'; im.loading = 'lazy';
      var t = document.createElement('p');
      t.textContent = (KIDNAME[p.kid] || p.kid) + ' · ' + (p.section === 'moments' ? 'for Family Moments' : 'for her photos') + (p.caption ? ' · “' + p.caption + '”' : '')
        + ' · ' + new Date(p.created).toLocaleDateString();
      var row = document.createElement('div'); row.className = 'send-row';
      var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn-big'; ok.textContent = 'OK, show it';
      var away = document.createElement('button'); away.type = 'button'; away.className = 'linkish'; away.textContent = 'Put away';
      async function act(what, btn) {
        btn.disabled = true;
        var r = await post('/api/pieces/' + encodeURIComponent(p.id) + '/' + what);
        if (r.ok) { li.remove(); if (!ul.children.length) showWaiting(); } else { btn.disabled = false; t.textContent += ' · That did not work. Try again?'; }
      }
      ok.addEventListener('click', function () { act('ok', ok); });
      away.addEventListener('click', function () { act('delete', away); });
      row.append(ok, away); li.append(im, t, row); ul.append(li);
    });
  }

  // ---------- the girls' tablets: password set?, Family Moments switch ----------
  function drawTablets(kids) {
    Object.keys(kids || {}).forEach(function (k) {
      var row = document.querySelector('[data-tablet="' + k + '"]'); if (!row) return;
      row.querySelector('.tablet-state').textContent = kids[k].password ? 'Tablet password is set.' : 'No tablet password yet.';
      row.querySelector('[data-moments]').checked = !!kids[k].moments;
    });
  }
  async function showTablets() {
    try { drawTablets((await (await fetch('/api/admin/kids', { credentials: 'same-origin' })).json()).kids); } catch (e) {}
  }
  document.querySelectorAll('[data-moments]').forEach(function (box) {
    box.addEventListener('change', async function () {
      var k = box.dataset.moments, j = {};
      try { j = await (await post('/api/admin/kids', { kid: k, moments: box.checked })).json(); } catch (e) {}
      if (j.kids) { drawTablets(j.kids); $('#tablet-msg').textContent = '✓ ' + KIDNAME[k] + (box.checked ? ' can now see Family Moments and add photos to it.' : ' no longer sees Family Moments.'); }
      else { box.checked = !box.checked; $('#tablet-msg').textContent = j.error === 'pin' ? 'Please type the parent PIN again.' : 'That did not work. Try again?'; }
    });
  });

  // ---------- passwords and PIN ----------
  document.querySelectorAll('[data-change]').forEach(function (b) {
    b.addEventListener('click', async function () {
      var level = b.dataset.change, input = $('#pw-' + level), kidKey = level.indexOf('kid-') === 0 ? level.slice(4) : null;
      var msg = kidKey ? $('#tablet-msg') : $('#pw-msg');
      var name = kidKey ? KIDNAME[kidKey] + '’s tablet password' : { family: 'Family password', friends: 'Friends password', pin: 'Parent PIN' }[level];
      var j = {}; try { j = await (await post('/api/admin/password', { level: level, password: input.value })).json(); } catch (e) {}
      if (j.ok) {
        msg.textContent = '✓ ' + name + (kidKey ? ' set. Type it on her tablet to log in. A tablet using an older one is logged out.' : ' changed. Every other device using it is logged out.');
        if (level === 'friends') friendsPw = input.value.trim(); input.value = ''; showLinks(); if (kidKey) showTablets();
      }
      else msg.textContent = j.error === 'short' ? (level === 'pin' ? 'A PIN is 4 to 8 numbers.' : kidKey ? 'Use at least 4 letters or numbers.' : 'Use at least 6 letters or numbers.')
        : j.error === 'same' ? 'That one is already used by another login. Pick a different one.'
        : j.error === 'pin' ? 'Please type the parent PIN again.' : 'That did not work. Try again?';
    });
  });
  async function showRebuild() {
    var s = (await (await fetch('/api/admin/status', { credentials: 'same-origin' })).json()).rebuild;
    if (!s) return;
    $('#rebuild-status').textContent = s.state === 'running' ? 'Rebuilding: ' + s.done + ' of ' + s.total + ' pieces…'
      : s.state === 'done' ? 'Last rebuild: ' + new Date(s.finished).toLocaleString() + ', ' + s.indexed + ' pieces.' + (s.problems.length ? ' ' + s.problems.length + ' problem(s): ' + s.problems.slice(0, 3).join('; ') : '')
      : 'Last rebuild failed: ' + (s.problems[0] || '');
    if (s.state === 'running') setTimeout(showRebuild, 3000);
  }

  $('#pin-go').addEventListener('click', async function () {
    var j = {}; try { j = await (await post('/api/parent', { pin: $('#pin').value })).json(); } catch (e) {}
    var msg = $('#pin-msg');
    if (j.ok) { msg.hidden = true; openTools(); return; }
    msg.textContent = j.error === 'wait' ? 'Too many tries. Please wait 15 minutes.' : 'That PIN did not work.';
    msg.hidden = false;
  });
  $('#pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#pin-go').click(); });
  $('#rebuild').addEventListener('click', async function () {
    $('#rebuild-status').textContent = 'Starting…';
    await post('/api/admin/rebuild');
    setTimeout(showRebuild, 2000);
  });
  $('#logout').addEventListener('click', async function () { await post('/api/logout'); location.href = '/login/'; });

  if (q.get('e')) { $('#pin-msg').textContent = MSG[q.get('e')] || 'Something went wrong.'; $('#pin-msg').hidden = false; }
  // Already have the PIN cookie? Try the tools straight away.
  fetch('/api/google/status', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (g) { if (!g.error) openTools(); }, function () {});
})();
