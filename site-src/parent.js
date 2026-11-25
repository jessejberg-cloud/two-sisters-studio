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
    showRebuild(); showLinks(); showWaiting(); showTablets(); showHouses(); showStudio(); showOwner();
  }

  // ---------- family who add photos: one invite link per household (Jesse, 2026-11-25) ----------
  var LBL = { leora: 'Leora', amaya: 'Amaya', 'pet-parents': 'Pet Parents' };
  function inviteText(h) { return h.name + ', tap this link to see the girls’ pictures and add your own photos. No password needed.'; }
  async function houseCall(url, body) {
    var j = {}; try { j = await (await post(url, body)).json(); } catch (e) {}
    if (j.error === 'pin') location.reload();
    return j;
  }
  $('#house-make').addEventListener('click', async function () {
    var msg = $('#house-msg'); msg.hidden = true;
    var name = $('#house-name').value.trim();
    if (!name) { msg.textContent = 'Type who it is for first, like Grandma.'; msg.hidden = false; $('#house-name').focus(); return; }
    var pages = Array.prototype.filter.call(document.querySelectorAll('input[name="house-pages"]'), function (b) { return b.checked; }).map(function (b) { return b.value; });
    var j = await houseCall('/api/houses', { name: name, pages: pages });
    if (!j.ok) { msg.textContent = 'That did not work. Try again?'; msg.hidden = false; return; }
    $('#house-name').value = '';
    await showHouses(j.house.id);
  });
  async function showHouses(fresh) {
    var ul = $('#house-list');
    var j = {}; try { j = await (await fetch('/api/houses', { credentials: 'same-origin' })).json(); } catch (e) {}
    ul.textContent = '';
    $('#houses-card').hidden = !(j.houses && j.houses.length);   // older household invites (build spec: new family gets the Invite or a studio)
    if (!j.houses || !j.houses.length) { var none = document.createElement('li'); none.className = 'muted'; none.textContent = 'None yet.'; ul.append(none); return; }
    j.houses.forEach(function (h) {
      var li = document.createElement('li'); li.className = 'house-row' + (h.off ? ' off' : '');
      var head = document.createElement('p'); head.innerHTML = '<strong></strong> <span class="muted"></span>';
      head.querySelector('strong').textContent = h.name;
      head.querySelector('span').textContent = h.off ? '(turned off)' : 'sees ' + (h.names.length > 1 ? h.names.slice(0, -1).join(', ') + ' and ' + h.names[h.names.length - 1] : h.names[0]);
      var ticks = document.createElement('div'); ticks.className = 'house-pages';
      Object.keys(LBL).forEach(function (k) {
        var l = document.createElement('label'); l.className = 'tick'; var c = document.createElement('input'); c.type = 'checkbox'; c.value = k; c.checked = h.pages.indexOf(k) !== -1;
        c.addEventListener('change', async function () {
          var pages = Array.prototype.filter.call(ticks.querySelectorAll('input'), function (x) { return x.checked; }).map(function (x) { return x.value; });
          await houseCall('/api/houses/' + h.id, { pages: pages }); showHouses();
        });
        l.append(c, ' ' + LBL[k]); ticks.append(l);
      });
      var row = document.createElement('div'); row.className = 'send-row';
      var note = document.createElement('p'); note.className = 'share-help';
      function btn(text, cls, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.addEventListener('click', fn); row.append(b); return b; }
      if (!h.off) btn('Send ' + h.name + ' the link', 'btn-big', function () { send({ text: inviteText(h), url: h.url }, note); });
      btn(h.off ? 'Turn back on' : 'Turn off', 'chip', async function () {
        if (!h.off && !confirm('Turn off ' + h.name + '’s invite? Their phones are logged out until you turn it back on. Their photos stay.')) return;
        await houseCall('/api/houses/' + h.id, { off: !h.off }); showHouses();
      });
      btn('New link', 'chip', async function () {
        if (!confirm('Make a new link for ' + h.name + '? The old link stops working and their phones are logged out until they tap the new one.')) return;
        await houseCall('/api/houses/' + h.id, { newLink: true }); showHouses(h.id);
      });
      li.append(head, ticks, row, note);
      if (fresh === h.id) note.textContent = 'Ready. Tap Send ' + h.name + ' the link and pick them in Messages.';
      ul.append(li);
    });
  }

  // ---------- this studio's View link and Invite, and the phones added with it (build spec, 2026-11-25) ----------
  var studioTurn = 0;
  async function showStudio() {
    var turn = ++studioTurn, j = {};
    try { j = await (await fetch('/api/studio/main/parent', { credentials: 'same-origin' })).json(); } catch (e) { return; }
    if (turn !== studioTurn || !j.ok) return;
    [['view', j.view], ['invite', j.invite]].forEach(function (x) {
      var box = document.querySelector('[data-link="' + x[0] + '"]');
      box.querySelector('[data-url]').textContent = x[1] || '';
      box.dataset.href = x[1] || '';
    });
    var ul = $('#phone-list'); ul.textContent = '';
    if (!j.devices.length) { var none = document.createElement('li'); none.className = 'muted'; none.textContent = 'None yet.'; ul.append(none); }
    j.devices.forEach(function (d) {
      var li = document.createElement('li'); li.className = 'link-item' + (d.off ? ' is-off' : '');
      var name = document.createElement('input'); name.type = 'text'; name.value = d.name || ''; name.placeholder = 'No name yet'; name.maxLength = 30; name.setAttribute('aria-label', 'Name');
      var kid = document.createElement('select'); kid.setAttribute('aria-label', 'Kid mode');
      [['', 'Grown-up']].concat(j.studio.kids.map(function (k) { return [k.key, k.name + ' (kid mode)']; })).forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if ((d.kid || '') === o[0]) op.selected = true; kid.append(op);
      });
      var off = document.createElement('button'); off.type = 'button'; off.className = 'linkish'; off.textContent = d.off ? 'Turn back on' : 'Turn off';
      var t = document.createElement('p'); t.className = 'share-help'; t.textContent = 'Added ' + new Date(d.created).toLocaleDateString() + (d.off ? ' · turned off' : '');
      async function change(body) { body.do = 'device'; body.id = d.id; var r = {}; try { r = await (await post('/api/studio/main/parent', body)).json(); } catch (e) {} if (r.error === 'pin') location.reload(); showStudio(); }
      name.addEventListener('change', function () { if (name.value.trim()) change({ name: name.value.trim() }); });
      kid.addEventListener('change', function () { change({ kid: kid.value || null }); });
      off.addEventListener('click', function () { if (!d.off && !confirm('Turn this phone off? It stops adding and looking until you turn it back on.')) return; change({ off: !d.off }); });
      var row = document.createElement('div'); row.className = 'send-row phone-row'; row.append(name, kid, off);
      li.append(row, t); ul.append(li);
    });
  }
  document.querySelectorAll('[data-link]').forEach(function (box) {
    var kind = box.dataset.link, note = box.querySelector('[data-note]');
    box.querySelector('[data-act="share"]').addEventListener('click', function () {
      if (box.dataset.href) send({ title: document.title, url: box.dataset.href }, note);
    });
    box.querySelector('[data-act="copy"]').addEventListener('click', async function () {
      try { await navigator.clipboard.writeText(box.dataset.href); note.textContent = '✓ Copied'; } catch (e) { note.textContent = box.dataset.href; }
    });
    box.querySelector('[data-act="reset"]').addEventListener('click', async function () {
      if (!confirm(kind === 'view' ? 'Make a new View link? The old one stops working, and phones that only look need the new one.'
        : 'Make a new Invite? The old link stops working. Phones already added keep working.')) return;
      var r = {}; try { r = await (await post('/api/studio/main/parent', { do: kind + '-reset' })).json(); } catch (e) {}
      if (r.error === 'pin') { location.reload(); return; }
      note.textContent = '✓ New link made. Send it again to whoever needs it.'; showStudio();
    });
  });

  // ---------- Families (owner only): invite a family to make its own studio; every studio and its use ----------
  function li(cls, text) { var x = document.createElement('li'); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function mb(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(0, Math.round(b / 1e6)) + ' MB'; }
  async function showOwner(body) {
    var j = {};
    try { j = body ? await (await post('/api/owner', body)).json() : await (await fetch('/api/owner', { credentials: 'same-origin' })).json(); } catch (e) { return; }
    if (!j.ok) return;
    $('#owner-card').hidden = false;
    var inv = $('#fam-invites'); inv.textContent = '';
    if (!j.creates.length) inv.append(li('muted', 'None yet.'));
    j.creates.forEach(function (c) {
      var it = li('link-item' + (c.off ? ' is-off' : '')), t = document.createElement('p');
      t.textContent = (c.name || 'Family') + (c.used ? ' · made /' + c.used + '/' : ' · not used yet') + (c.off ? ' · turned off' : '');
      var row = document.createElement('div'); row.className = 'send-row';
      if (!c.used && !c.off) {
        var s = document.createElement('button'); s.type = 'button'; s.className = 'btn-big'; s.textContent = '📤 Send';
        s.addEventListener('click', function () { send({ text: (c.name ? c.name + ', ' : '') + 'tap this to make your family’s studio:', url: c.url }, t); });
        row.append(s);
      }
      if (!c.used) {
        var o = document.createElement('button'); o.type = 'button'; o.className = 'linkish'; o.textContent = c.off ? 'Turn back on' : 'Turn off';
        o.addEventListener('click', function () { showOwner({ do: 'invite-off', id: c.id, off: !c.off }); });
        row.append(o);
      }
      it.append(t, row); inv.append(it);
    });
    var sl = $('#fam-studios'); sl.textContent = '';
    j.studios.forEach(function (s) {
      var it = li('link-item' + (s.removed ? ' is-off' : '')), t = document.createElement('p');
      var a = document.createElement('a'); a.href = s.href; a.textContent = s.name;
      t.append(a, ' · ' + s.pieces + ' pictures · ' + mb(s.bytes) + ' on the site' + (s.main ? '' : s.drive ? ' · Google Drive on' : ' · no Google Drive') + (s.removed ? ' · removed' : ''));
      it.append(t);
      if (!s.main) {
        var r = document.createElement('button'); r.type = 'button'; r.className = 'linkish'; r.textContent = s.removed ? 'Bring back' : 'Remove';
        r.addEventListener('click', function () {
          if (!s.removed && !confirm('Remove ' + s.name + '? Its pages and links stop working. Nothing is deleted: its pictures and Google Drive stay, and you can bring it back.')) return;
          showOwner({ do: s.removed ? 'restore' : 'remove', slug: s.slug });
        });
        it.append(r);
      }
      sl.append(it);
    });
  }
  $('#fam-make').addEventListener('click', async function () {
    var n = $('#fam-name').value.trim();
    await showOwner({ do: 'invite', name: n });
    $('#fam-name').value = ''; $('#fam-msg').textContent = '✓ Invite made. Tap Send beside it.';
  });

  // ---------- share links ----------
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
      msg.textContent = j.error === 'pin' ? 'Please type the parent PIN again.' : 'That did not work. Try again?';
      msg.hidden = false; if (j.error === 'pin') location.reload(); return;
    }
    current = j.link;
    $('#link-url').textContent = j.link.names.join(', ') + ', ' + until(j.link) + ':\n' + j.link.url;
    $('#send-note').textContent = 'Tap Send link and pick who gets it. They tap it and they are in.';
    $('#link-made').hidden = false;
    showLinks();
  });
  $('#send-link').addEventListener('click', function () { if (current) send({ url: current.url }, $('#send-note')); });
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
    // OK all: one tap for everything the girls sent.
    if (j.waiting.length > 1) {
      var allLi = document.createElement('li'), all = document.createElement('button');
      all.type = 'button'; all.className = 'btn-big'; all.textContent = '✓ OK all ' + j.waiting.length;
      all.addEventListener('click', async function () {
        all.disabled = true;
        for (var i = 0; i < j.waiting.length; i++) { all.textContent = 'Showing ' + (i + 1) + ' of ' + j.waiting.length + '…'; await post('/api/pieces/' + encodeURIComponent(j.waiting[i].id) + '/ok'); }
        showWaiting();
      });
      allLi.append(all); ul.append(allLi);
    }
    j.waiting.forEach(function (p) {
      var li = document.createElement('li'); li.className = 'wait-item';
      var im = document.createElement('img'); im.src = '/img/' + encodeURIComponent(p.id) + '/1/sm'; im.alt = p.caption || 'Photo'; im.loading = 'lazy';
      var t = document.createElement('p');
      t.textContent = (KIDNAME[p.kid] || p.kid) + ' · ' + (p.section === 'moments' ? 'for Family Moments' : p.section === 'art' ? 'for her art' : 'for her snapshots') + (p.caption ? ' · “' + p.caption + '”' : '')
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
      var name = kidKey ? KIDNAME[kidKey] + '’s tablet password' : { family: 'Family password', friends: 'Friends password', pin: 'Parent PIN', owner: 'Owner PIN' }[level];
      var j = {}; try { j = await (await post('/api/admin/password', { level: level, password: input.value })).json(); } catch (e) {}
      if (j.ok) {
        msg.textContent = '✓ ' + name + (kidKey ? ' set. Type it on her tablet to log in. A tablet using an older one is logged out.' : ' changed. Every other device using it is logged out.');
        input.value = ''; showLinks(); if (kidKey) showTablets();
      }
      else msg.textContent = j.error === 'short' ? (level === 'pin' || level === 'owner' ? 'A PIN is 4 to 8 numbers.' : kidKey ? 'Use at least 4 letters or numbers.' : 'Use at least 6 letters or numbers.')
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
    var j = {}; try { j = await (await post('/api/studio/main/pin', { pin: $('#pin').value })).json(); } catch (e) {}
    $('#pin').value = '';
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
  // A phone that had the PIN typed on it is trusted for 30 days (Jesse, 2026-11-25): open the tools straight away.
  fetch('/api/google/status', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (g) { if (!g.error) openTools(); }, function () {});
})();
