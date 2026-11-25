// A family's studio (build spec, 2026-11-25): one page for every studio, at /<slug>/, /<slug>/<kid>/,
// /<slug>/family-moments/ and /<slug>/for-parents/. Runs before main.js: it puts the right template on the page
// straight away (so main.js draws the gallery and the Family Moments days as on Jesse's pages), then fills in the
// studio's name, tabs and kids from /api/studio/<slug>.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var root = $('#studio-root');
  if (!root) return;
  var parts = location.pathname.split('/').filter(Boolean), slug = parts[0] || '', sub = parts[1] || '';
  var kind = !sub ? 'home' : sub === 'family-moments' ? 'moments' : sub === 'for-parents' ? 'parents' : 'kid';
  var cached = null;
  try { cached = (JSON.parse(localStorage.getItem('tss-studio-' + slug) || 'null') || {}).studio || null; } catch (e) {}
  function make(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function use(id) { root.textContent = ''; root.append(document.getElementById(id).content.cloneNode(true)); }
  function kidOf(st, key) { return ((st && st.kids) || []).filter(function (k) { return k.key === key; })[0] || null; }
  var api = '/api/studio/' + encodeURIComponent(slug);
  var q = function (more) { return '/api/pieces?studio=' + encodeURIComponent(slug) + more; };

  // ---------- the template, now (before main.js) ----------
  if (!slug || !/^[a-z0-9-]{1,40}$/.test(slug)) { use('tpl-none'); return; }
  if (kind === 'home') use('tpl-home');
  if (kind === 'kid') {
    use('tpl-kid');
    var k0 = kidOf(cached, sub), name0 = k0 ? k0.name : sub.charAt(0).toUpperCase() + sub.slice(1);
    var live = $('.art-live');
    live.dataset.kid = sub; live.dataset.name = name0; live.dataset.api = q('&kid=' + encodeURIComponent(sub));
    live.dataset.empty = 'Nothing here yet.';
    $('.studio-kid-h').textContent = name0;
    var snaps = $('#snapshots');
    if (snaps) { snaps.dataset.src = q('&kid=' + encodeURIComponent(sub) + '&section=photos'); snaps.querySelector('.live-h').textContent = '📷'; snaps.querySelector('.live-note').textContent = ''; }
    if (cached) cats(cached, false);
  }
  // The studio's own categories (Jesse, 2026-11-25): one row each on an artist's page, under the snapshots; hidden while empty.
  function cats(st, now) {
    var snaps = $('#snapshots'); if (!snaps) return;
    var at = snaps;
    (st.cats || []).forEach(function (c) {
      var id = 'cat-' + c.key, sec = document.getElementById(id);
      if (!sec) {
        sec = snaps.cloneNode(true); sec.id = id; sec.hidden = true;
        sec.querySelector('.photo-grid').textContent = '';
        sec.dataset.src = q('&kid=' + encodeURIComponent(sub) + '&section=cat&cat=' + encodeURIComponent(c.key));
        sec.querySelector('.live-note').textContent = '';
        at.after(sec);
        if (now && window.TSS && TSS.livePhotos) TSS.livePhotos(sec);
      }
      sec.querySelector('.live-h').textContent = (c.scan ? '📄 ' : '📷 ') + c.name;
      at = sec;
    });
  }
  var ICON = { kid: '🎨', adult: '🎨', pet: '🐾' };
  if (kind === 'moments') {
    use('tpl-moments');
    var sec = $('.live-photos'); sec.dataset.src = q('&section=moments'); sec.querySelector('.live-h').textContent = ''; sec.querySelector('.live-note').textContent = '';
  }
  if (kind === 'parents') use('tpl-parents');

  // ---------- the studio's names, tabs and ＋ ----------
  function hintKeys() {
    var m = /(?:^|;\s*)tssw=([^;]*)/.exec(document.cookie);
    return m ? decodeURIComponent(m[1]).split(',').filter(Boolean).map(function (x) { var p = x.split(':'); return { s: p[0], t: p[1], kid: p[2] === 'kid' }; }) : [];
  }
  var mine = hintKeys().filter(function (k) { return k.s === slug; });
  var adds = mine.some(function (k) { return k.t === 'd'; }), kidPhone = mine.some(function (k) { return k.kid; });
  function draw(st, me) {
    document.title = st.name + ' · Two Sisters Studio';
    document.body.classList.add('c-' + (st.color || 'sky'));
    var brand = $('.site-header .brand'); if (brand) brand.href = '/' + slug + '/';
    // Tabs: the kids, then Family Moments, then the family menu (main.js shows it when there are other studios).
    var header = $('.site-header'), nav = make('nav'), ul = make('ul', 'tabs');
    nav.setAttribute('aria-label', 'Main');
    st.kids.forEach(function (k) { ul.append(tab('/' + slug + '/' + k.key + '/', k.name, k.color, ICON[k.kind] || '🎨', kind === 'kid' && sub === k.key)); });
    ul.append(tab('/' + slug + '/family-moments/', 'Family Moments', 'yellow', '❤️', kind === 'moments'));
    var fam = make('li', 'tab-fam-li'); fam.hidden = true;
    var fb = make('button', 'tab tab-fam c-sky'); fb.type = 'button'; fb.append(make('span', 'tab-icon', '🏠'), make('span', 'tab-label', 'Family'));
    fam.append(fb); ul.append(fam); nav.append(ul);
    var old = header.querySelector('nav'); if (old) old.remove();
    header.append(nav);
    if (window.TSS && TSS.famMenu) TSS.famMenu();
    if (kind === 'home') {
      $('.studio-name').textContent = st.name;
      var bb = $('#studio-buttons'); bb.textContent = '';
      st.kids.forEach(function (k) { bb.append(big('/' + slug + '/' + k.key + '/', k.name, k.color, ICON[k.kind] || '🎨')); });
      bb.append(big('/' + slug + '/family-moments/', 'Family Moments', 'yellow', '❤️'));
    }
    if (kind === 'kid') {
      var k = kidOf(st, sub);
      if (!k) { use('tpl-none'); return; }
      $('.studio-kid-h') && ($('.studio-kid-h').textContent = k.name);
      cats(st, true);
    }
    // The ＋: only on a phone this studio invited (the app); a View link only looks.
    if (adds && (me ? me.add : true) && kind !== 'parents') {
      var add = kind === 'kid' ? '&add=art&kid=' + encodeURIComponent(sub) : kind === 'moments' ? '&add=day' : '';
      var a = make('a', 'add-fab'); a.href = '/upload/?s=' + encodeURIComponent(slug) + add; a.setAttribute('aria-label', 'Add');
      a.append(make('span', '', '＋'), make('span', 'add-fab-label', 'Add'));
      document.body.append(a); document.documentElement.classList.add('has-fab');
    }
    // A link to For parents at the bottom (not on a kid's phone).
    var foot = $('.site-footer a[href="/parent/"]');
    if (foot) { foot.href = '/' + slug + '/for-parents/'; foot.hidden = kidPhone; }
  }
  function tab(href, label, color, icon, here) {
    var li = make('li'), a = make('a', 'tab c-' + (color || 'sky')); a.href = href; if (here) a.setAttribute('aria-current', 'page');
    a.append(make('span', 'tab-icon', icon), make('span', 'tab-label', label)); li.append(a); return li;
  }
  function big(href, label, color, icon) {
    var li = make('li'), a = make('a', 'big-button wobbly c-' + (color || 'sky')); a.href = href;
    a.append(make('span', 'big-icon', icon), make('span', 'big-label', label)); li.append(a); return li;
  }
  if (cached) draw(cached, null);
  fetch(api, { credentials: 'same-origin' }).then(function (r) {
    if (r.status === 404) { use('tpl-none'); throw new Error('none'); }
    if (r.status === 401) { location.href = '/login/?next=' + encodeURIComponent(location.pathname); throw new Error('login'); }
    return r.json();
  }).then(function (j) {
    try { localStorage.setItem('tss-studio-' + slug, JSON.stringify({ studio: j.studio, dev: j.me.device })); } catch (e) {}
    draw(j.studio, j.me);
    if (kind === 'parents') parents(j.studio);
  }).catch(function () {});

  // ---------- For parents ----------
  function parents(st) {
    var opened = false;
    async function post(url, body) {
      var r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
      var j = {}; try { j = await r.json(); } catch (e) {}
      return j;
    }
    async function load(body) {
      var j = body ? await post(api + '/parent', body) : await (await fetch(api + '/parent', { credentials: 'same-origin' })).json().catch(function () { return {}; });
      if (!j.ok) { if (opened) location.reload(); return null; }
      opened = true; $('#pin-box').hidden = true; $('#parent-tools').hidden = false;
      fill(j); return j;
    }
    $('#pin-go').addEventListener('click', async function () {
      var j = await post(api + '/pin', { pin: $('#pin').value }), msg = $('#pin-msg');
      $('#pin').value = '';
      if (j.ok) { msg.hidden = true; load(); return; }
      msg.textContent = j.error === 'wait' ? 'Too many tries. Please wait 15 minutes.' : 'That PIN did not work.'; msg.hidden = false;
    });
    $('#pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#pin-go').click(); });
    load();   // a trusted phone (PIN typed here in the last 30 days) opens straight away

    var LABEL = { kids: 'Artists', name: 'Name', look: 'Color', drive: 'Google Drive' };
    var HEADS = { pin: ['5 wrong PINs in a row.', 'Change the PIN below.'], delete: ['Many pictures put away in one hour.', 'Bring them back from Recent in the app.'],
      upload: ['Many pictures from one phone in one hour.', 'Look at Recent in the app.'], link: ['A link was opened on many phones.', 'Make a new link above.'], storage: ['Storage is nearly full.', 'Connect Google Drive.'] };
    function send(url, note) {
      if (navigator.share) { navigator.share({ title: st.name, url: url }).catch(function () {}); return; }
      navigator.clipboard.writeText(url).then(function () { note.textContent = '✓ Copied'; }, function () { note.textContent = url; });
    }
    function fill(j) {
      st = j.studio;
      [['view', j.view], ['invite', j.invite]].forEach(function (x) {
        var box = $('[data-link="' + x[0] + '"]'); box.querySelector('[data-url]').textContent = x[1] || ''; box.dataset.href = x[1] || '';
      });
      var hl = $('#heads-list'); hl.textContent = '';
      (j.heads || []).forEach(function (h) {
        var t = HEADS[h.kind] || [h.kind, ''], li = make('li', 'link-item'); li.append(make('p', '', t[0] + ' ' + t[1]));
        var ok = make('button', 'linkish', 'OK'); ok.type = 'button'; ok.addEventListener('click', function () { load({ do: 'heads-seen', id: h.id }); });
        li.append(ok); hl.append(li);
      });
      $('#heads-card').hidden = !(j.heads || []).length;
      var sl = $('#skipped-list'); sl.textContent = '';
      (j.skipped || []).forEach(function (x) { sl.append(make('li', '', LABEL[x] || x)); });
      $('#skipped-card').hidden = !(j.skipped || []).length;
      // Phones
      var pl = $('#phone-list'); pl.textContent = '';
      if (!j.devices.length) pl.append(make('li', 'muted', 'None yet.'));
      j.devices.forEach(function (d) {
        var li = make('li', 'link-item' + (d.off ? ' is-off' : '')), row = make('div', 'send-row phone-row');
        var nm = make('input'); nm.type = 'text'; nm.value = d.name || ''; nm.placeholder = 'No name yet'; nm.maxLength = 30; nm.setAttribute('aria-label', 'Name');
        var kid = make('select'); kid.setAttribute('aria-label', 'Kid mode');
        [['', 'Grown-up']].concat(st.kids.filter(function (k) { return (k.kind || 'kid') === 'kid'; }).map(function (k) { return [k.key, k.name + ' (kid mode)']; })).forEach(function (o) { var op = make('option', '', o[1]); op.value = o[0]; op.selected = (d.kid || '') === o[0]; kid.append(op); });
        var off = make('button', 'linkish', d.off ? 'Turn back on' : 'Turn off'); off.type = 'button';
        nm.addEventListener('change', function () { if (nm.value.trim()) load({ do: 'device', id: d.id, name: nm.value.trim() }); });
        kid.addEventListener('change', function () { load({ do: 'device', id: d.id, kid: kid.value || null }); });
        off.addEventListener('click', function () { if (d.off || confirm('Turn this phone off?')) load({ do: 'device', id: d.id, off: !d.off }); });
        row.append(nm, kid, off); li.append(row); pl.append(li);
      });
      // Kids
      var kl = $('#kid-list'); kl.textContent = '';
      st.kids.forEach(function (k) { kl.append(kidRow(k)); });
      if (!st.kids.length) kl.append(kidRow({}));
      var cl = $('#cat-list'); cl.textContent = '';
      (st.cats || []).forEach(function (c) { cl.append(catRow(c)); });
      $('#studio-name').value = st.name;
      document.querySelectorAll('#look input').forEach(function (r) { r.checked = r.value === st.color; });
      var g = j.drive || {};
      $('#g-status').textContent = g.connected ? 'Connected' + (g.email ? ': ' + g.email : '') : 'Not connected.';
      $('#g-connect').textContent = g.connected ? 'Connect again' : 'Connect Google Drive';
      $('#g-connect').href = '/api/google/start?s=' + encodeURIComponent(slug);
    }
    var GRADES = ['', 'Pre-K', 'K4', 'K5', '1st grade', '2nd grade', '3rd grade', '4th grade', '5th grade', '6th grade', '7th grade', '8th grade', '9th grade', '10th grade', '11th grade', '12th grade'];
    function sel(label, cls, opts, value) {
      var x = make('select', cls); x.setAttribute('aria-label', label);
      opts.forEach(function (o) { var op = make('option', '', o[1]); op.value = o[0]; op.selected = value === o[0]; x.append(op); });
      return x;
    }
    // An artist: a kid, a grown-up or a pet (Jesse, 2026-11-25). Only a kid has a grade.
    function kidRow(k) {
      var li = make('li', 'st-kid'); li.dataset.key = k.key || '';
      var n = make('input'); n.type = 'text'; n.value = k.name || ''; n.maxLength = 30; n.setAttribute('aria-label', 'Name');
      var w = sel('Who', 'st-kind', [['kid', 'Kid'], ['adult', 'Grown-up'], ['pet', 'Pet']], k.kind || 'kid');
      var g = sel('Grade', 'st-grade', GRADES.map(function (x) { return [x, x || 'Grade']; }), k.grade || '');
      function hideGrade() { g.hidden = w.value !== 'kid'; li.classList.toggle('no-grade', g.hidden); }
      w.addEventListener('change', hideGrade); hideGrade();
      li.append(n, w, g); return li;
    }
    function catRow(c) {
      var li = make('li', 'st-kid st-cat'); li.dataset.key = c.key || '';
      var n = make('input'); n.type = 'text'; n.value = c.name || ''; n.maxLength = 30; n.placeholder = 'School papers'; n.setAttribute('aria-label', 'Category');
      li.append(n, sel('Kind', 'st-scan', [['1', '📄 Paper'], ['', '📷 Photo']], c.key && !c.scan ? '' : '1')); return li;
    }
    $('#kid-add').addEventListener('click', function () { var r = kidRow({}); $('#kid-list').append(r); r.querySelector('input').focus(); });
    $('#cat-add').addEventListener('click', function () { var r = catRow({}); $('#cat-list').append(r); r.querySelector('input').focus(); });
    $('#cats-save').addEventListener('click', async function () {
      var list = Array.prototype.map.call(document.querySelectorAll('#cat-list .st-cat'), function (li) {
        return { key: li.dataset.key || undefined, name: li.querySelector('input').value.trim(), scan: !!li.querySelector('select').value };
      }).filter(function (c) { return c.name; });
      var j = await load({ do: 'cats', cats: list });
      $('#cats-msg').textContent = j ? '✓ Saved' : 'That did not work.';
    });
    $('#kids-save').addEventListener('click', async function () {
      var kids = Array.prototype.map.call(document.querySelectorAll('#kid-list .st-kid'), function (li, i) {
        var keep = (st.kids.filter(function (k) { return k.key === li.dataset.key; })[0]) || {};
        var kind = li.querySelector('.st-kind').value;
        return { key: li.dataset.key || undefined, name: li.querySelector('input').value.trim(), kind: kind, grade: kind === 'kid' ? li.querySelector('.st-grade').value : '', color: keep.color };
      }).filter(function (k) { return k.name; });
      var j = await load({ do: 'kids', kids: kids });
      $('#kids-msg').textContent = j ? '✓ Saved' : 'That did not work.';
      if (j) draw(j.studio, null);
    });
    $('#name-save').addEventListener('click', async function () { var n = $('#studio-name').value.trim(); if (!n) return; var j = await load({ do: 'name', name: n }); if (j) draw(j.studio, null); });
    document.querySelectorAll('#look input').forEach(function (r) {
      r.addEventListener('change', async function () { var j = await load({ do: 'look', color: r.value }); $('#look-msg').textContent = j ? '✓' : ''; });
    });
    $('#pin-save').addEventListener('click', async function () {
      var v = $('#new-pin').value.trim();
      if (!/^\d{4}$/.test(v)) { $('#pin-save-msg').textContent = '4 numbers.'; return; }
      var j = await post(api + '/parent', { do: 'pin', pin: v });
      $('#new-pin').value = '';
      $('#pin-save-msg').textContent = j.ok ? '✓ Changed. Other phones need the new PIN.' : 'That did not work.';
    });
    document.querySelectorAll('[data-link]').forEach(function (box) {
      var kind_ = box.dataset.link, note = box.querySelector('[data-note]');
      box.querySelector('[data-act="share"]').addEventListener('click', function () { if (box.dataset.href) send(box.dataset.href, note); });
      box.querySelector('[data-act="copy"]').addEventListener('click', function () {
        navigator.clipboard.writeText(box.dataset.href).then(function () { note.textContent = '✓ Copied'; }, function () { note.textContent = box.dataset.href; });
      });
      box.querySelector('[data-act="reset"]').addEventListener('click', async function () {
        if (!confirm(kind_ === 'view' ? 'Make a new View link? The old one stops working.' : 'Make a new Invite? The old link stops working. Phones already added keep working.')) return;
        if (await load({ do: kind_ + '-reset' })) note.textContent = '✓ New link made.';
      });
    });
  }
})();
