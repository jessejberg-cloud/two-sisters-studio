// Two Sisters Studio upload app: pick a kid, take photos (or share them in from Google Photos), crop / turn /
// glow if wanted, caption each, Save.
// Save first keeps everything on the phone (IndexedDB "outbox"), then sends it to Google Drive / Two Sisters Studio /
// <Kid> / <year> / <School Year|Summer> whenever there is internet and a Google sign-in. Works with no signal.
// Edited pictures are saved twice: the edited one (name.jpg) and the untouched original (name-original.ext).
// Sign-in: Google's own page. The app asks only for "drive.file": it can see and change only the files it made.
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
  var API = 'https://www.googleapis.com/drive/v3';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var FOLDER = 'application/vnd.google-apps.folder';
  var REDIRECT = location.origin + '/upload/';
  var $ = function (s) { return document.querySelector(s); };
  var store = {
    get: function (k) { try { return localStorage.getItem('tss-' + k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem('tss-' + k) : localStorage.setItem('tss-' + k, v); } catch (e) {} },
  };
  var state = { kid: null, items: [] };   // items: { file, url, caption, featured, edit: {rot, crop, glow}, edited: Blob|null }

  // ---------- dates, seasons, names ----------
  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function season(iso) { var m = +iso.slice(5, 7); return m >= 9 && m <= 11 ? 'fall' : (m === 12 || m <= 2) ? 'winter' : m <= 5 ? 'spring' : 'summer'; }
  function schoolYear(iso) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? y + '-' + String(y + 1).slice(2) : (y - 1) + '-' + String(y).slice(2); }
  function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 5).join('-') || 'untitled'; }
  function ext(f) { var m = /\.([a-z0-9]+)$/i.exec(f.name || ''); return (m ? m[1] : (f.type.split('/')[1] || 'jpg')).toLowerCase().replace('jpeg', 'jpg'); }
  function plan(item, i) {
    var kid = cfg.kids[state.kid], iso = $('#date').value || today(), s = season(iso), sy = schoolYear(iso);
    var base = iso + '_' + state.kid + '_' + s + '_' + slug(item.caption || ('picture ' + (i + 1)));
    var meta = { kid: state.kid, date: iso, schoolYear: sy, grade: (kid.grades || {})[sy] || '', season: s, caption: item.caption.trim(), featured: item.featured };
    if (item.edited) { meta.edited = true; if (item.edit.glow) meta.glow = true; }
    return { folder: kid.name + '/' + sy + '/' + (s === 'summer' ? 'Summer' : 'School Year'), base: base, ext: ext(item.file), meta: meta };
  }

  // ---------- keeping things on the phone (IndexedDB) ----------
  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (ok, no) {
      var r = indexedDB.open('two-sisters-studio', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('outbox', { keyPath: 'id' }); r.result.createObjectStore('shared', { keyPath: 'id' }); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
    });
    return dbp;
  }
  function tx(name, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, no) {
        var t = d.transaction(name, mode), s = t.objectStore(name), out = fn(s);
        t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { no(t.error); };
      });
    });
  }
  var put = function (name, v) { return tx(name, 'readwrite', function (s) { s.put(v); }); };
  var del = function (name, id) { return tx(name, 'readwrite', function (s) { s.delete(id); }); };
  var all = function (name) { return tx(name, 'readonly', function (s) { return s.getAll(); }); };

  // ---------- screens ----------
  function show(id) { document.querySelectorAll('.screen').forEach(function (s) { s.hidden = s.id !== id; }); window.scrollTo(0, 0); }
  function setKid(k) {
    state.kid = k;
    $('#who').textContent = cfg.kids[k].name;
    document.body.className = 'up c-' + cfg.kids[k].color;
    if (!$('#date').value) $('#date').value = today();
    renderList(); show('s-photos');
  }
  document.querySelectorAll('[data-kid]').forEach(function (b) { b.addEventListener('click', function () { setKid(b.dataset.kid); }); });
  $('#back').addEventListener('click', function () {
    if (state.items.length && !confirm('Leave without saving these pictures?')) return;
    clearItems(); show('s-kid'); refreshOutbox();
  });
  function clearItems() { state.items.forEach(function (it) { URL.revokeObjectURL(it.url); }); state.items = []; $('#date').value = ''; }

  function addFiles(list) {
    Array.prototype.forEach.call(list, function (f) {
      if (!/^image\//.test(f.type)) return;
      state.items.push({ file: f, url: URL.createObjectURL(f), caption: '', featured: false, edit: { rot: 0, crop: null, glow: false }, edited: null });
    });
    renderList();
  }
  $('#take').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  $('#pick').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });

  function renderList() {
    if (!state.kid) return;   // shared-in pictures wait until a kid is picked
    var ul = $('#list'); ul.textContent = '';
    state.items.forEach(function (it, i) {
      var li = document.createElement('li'); li.className = 'item';
      var pic = document.createElement('button'); pic.type = 'button'; pic.className = 'item-pic'; pic.setAttribute('aria-label', 'Edit picture ' + (i + 1));
      var img = document.createElement('img'); img.src = it.url; img.alt = '';
      var tag = document.createElement('span'); tag.className = 'edit-tag'; tag.textContent = it.edited ? '✎ Edited' : '✎ Edit';
      pic.append(img, tag); pic.addEventListener('click', function () { openEditor(it); });
      var cap = document.createElement('input'); cap.type = 'text'; cap.placeholder = 'Caption, in ' + cfg.kids[state.kid].name + '’s words (optional)';
      cap.value = it.caption; cap.maxLength = 140; cap.setAttribute('aria-label', 'Caption for picture ' + (i + 1));
      cap.addEventListener('input', function () { it.caption = cap.value; });
      var star = document.createElement('button'); star.type = 'button'; star.className = 'star';
      star.setAttribute('aria-pressed', String(it.featured)); star.textContent = it.featured ? '★ Show big' : '☆ Show big';
      star.addEventListener('click', function () { it.featured = !it.featured; renderList(); });
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'remove'; rm.textContent = 'Take out';
      rm.addEventListener('click', function () { URL.revokeObjectURL(it.url); state.items.splice(i, 1); renderList(); });
      var row = document.createElement('div'); row.className = 'item-row'; row.append(star, rm);
      var box = document.createElement('div'); box.className = 'item-text'; box.append(cap, row);
      li.append(pic, box); ul.append(li);
    });
    $('#count').textContent = state.items.length ? state.items.length + ' picture' + (state.items.length > 1 ? 's' : '') + '. Tap a picture to crop, turn or add glow.' : 'No pictures yet';
    $('#save').disabled = !state.items.length;
    $('#share').disabled = !state.items.length;
  }

  // ---------- editor: turn, crop, glow ----------
  var ed = { item: null, bmp: null, rot: 0, crop: null, glow: false, cropping: false };
  var cv = $('#ed-canvas'), cx = cv.getContext('2d');
  function rotatedSize(b, rot) { return rot % 2 ? { w: b.height, h: b.width } : { w: b.width, h: b.height }; }
  // Draw the picture turned and cropped, at a scale, onto a context. Glow: brighter, richer colors plus a soft halo.
  function paint(ctx, bmp, rot, crop, glow, scale) {
    var R = rotatedSize(bmp, rot), c = crop || { x: 0, y: 0, w: 1, h: 1 };
    var W = Math.round(R.w * c.w * scale), H = Math.round(R.h * c.h * scale);
    ctx.canvas.width = W; ctx.canvas.height = H;
    function draw(filter, alpha, op) {
      ctx.save(); ctx.filter = filter; ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op;
      ctx.translate(-c.x * R.w * scale, -c.y * R.h * scale); ctx.scale(scale, scale);
      ctx.translate(R.w / 2, R.h / 2); ctx.rotate(rot * Math.PI / 2); ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      ctx.restore();
    }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (!glow) { draw('none', 1, 'source-over'); return; }
    draw('brightness(1.07) contrast(1.08) saturate(1.3)', 1, 'source-over');
    draw('blur(' + Math.max(4, Math.round(Math.max(W, H) / 90)) + 'px) brightness(1.15) saturate(1.5)', 0.45, 'screen');
  }
  function edScale() { var R = rotatedSize(ed.bmp, ed.rot), c = ed.cropping ? { w: 1, h: 1 } : (ed.crop || { w: 1, h: 1 }); return Math.min(1, (Math.min(window.innerWidth, 640) - 32) / (R.w * c.w), (window.innerHeight * 0.55) / (R.h * c.h)); }
  function edDraw() {
    paint(cx, ed.bmp, ed.rot, ed.cropping ? null : ed.crop, ed.glow, edScale());
    $('#ed-box').hidden = !ed.cropping;
    if (ed.cropping) placeBox();
    $('#ed-glow').setAttribute('aria-pressed', String(ed.glow));
    $('#ed-crop').textContent = ed.cropping ? '✓ Done cropping' : '✂ Crop';
  }
  async function openEditor(it) {
    ed.item = it; ed.rot = it.edit.rot; ed.crop = it.edit.crop; ed.glow = it.edit.glow; ed.cropping = false;
    try { ed.bmp = await createImageBitmap(it.file, { imageOrientation: 'from-image' }); }
    catch (e) { status('This picture can’t be edited here, but it can still be saved.', true); return; }
    show('s-edit'); edDraw();
  }
  $('#ed-turn').addEventListener('click', function () { ed.rot = (ed.rot + 1) % 4; ed.crop = null; ed.cropping = false; edDraw(); });
  $('#ed-glow').addEventListener('click', function () { ed.glow = !ed.glow; edDraw(); });
  $('#ed-crop').addEventListener('click', function () {
    if (!ed.cropping) { ed.box = ed.crop ? Object.assign({}, ed.crop) : { x: .05, y: .05, w: .9, h: .9 }; ed.cropping = true; }
    else { ed.crop = ed.box; ed.cropping = false; }
    edDraw();
  });
  $('#ed-reset').addEventListener('click', function () { ed.rot = 0; ed.crop = null; ed.glow = false; ed.cropping = false; edDraw(); });
  $('#ed-cancel').addEventListener('click', function () { ed.bmp && ed.bmp.close && ed.bmp.close(); show('s-photos'); });
  $('#ed-done').addEventListener('click', function () {
    if (ed.cropping) { ed.crop = ed.box; ed.cropping = false; }
    var it = ed.item, changed = ed.rot || ed.crop || ed.glow;
    it.edit = { rot: ed.rot, crop: ed.crop, glow: ed.glow };
    if (!changed) { it.edited = null; URL.revokeObjectURL(it.url); it.url = URL.createObjectURL(it.file); show('s-photos'); renderList(); return; }
    // Full-size edited copy (up to 4000px on the long side), saved as a high-quality JPEG.
    var R = rotatedSize(ed.bmp, ed.rot), c = ed.crop || { w: 1, h: 1 };
    var scale = Math.min(1, 4000 / Math.max(R.w * c.w, R.h * c.h));
    var big = document.createElement('canvas'); paint(big.getContext('2d'), ed.bmp, ed.rot, ed.crop, ed.glow, scale);
    big.toBlob(function (b) {
      it.edited = b; URL.revokeObjectURL(it.url); it.url = URL.createObjectURL(b);
      ed.bmp.close && ed.bmp.close(); show('s-photos'); renderList();
    }, 'image/jpeg', 0.92);
  });
  // Crop box: drag a corner to resize, drag the middle to move. Positions are fractions of the picture.
  var box = $('#ed-box');
  function placeBox() {
    var b = ed.box, r = cv.getBoundingClientRect(), wrap = $('#ed-wrap').getBoundingClientRect();
    box.style.left = (r.left - wrap.left + b.x * r.width) + 'px'; box.style.top = (r.top - wrap.top + b.y * r.height) + 'px';
    box.style.width = (b.w * r.width) + 'px'; box.style.height = (b.h * r.height) + 'px';
  }
  var drag = null;
  box.addEventListener('pointerdown', function (e) {
    var r = cv.getBoundingClientRect();
    drag = { mode: e.target.dataset.h || 'move', x0: e.clientX, y0: e.clientY, b0: Object.assign({}, ed.box), W: r.width, H: r.height };
    box.setPointerCapture(e.pointerId); e.preventDefault();
  });
  box.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = (e.clientX - drag.x0) / drag.W, dy = (e.clientY - drag.y0) / drag.H, b = Object.assign({}, drag.b0), MIN = 0.08;
    if (drag.mode === 'move') { b.x = Math.min(Math.max(0, b.x + dx), 1 - b.w); b.y = Math.min(Math.max(0, b.y + dy), 1 - b.h); }
    else {
      if (drag.mode.indexOf('l') > -1) { var nx = Math.min(Math.max(0, b.x + dx), b.x + b.w - MIN); b.w += b.x - nx; b.x = nx; }
      if (drag.mode.indexOf('r') > -1) { b.w = Math.min(Math.max(MIN, b.w + dx), 1 - b.x); }
      if (drag.mode.indexOf('t') > -1) { var ny = Math.min(Math.max(0, b.y + dy), b.y + b.h - MIN); b.h += b.y - ny; b.y = ny; }
      if (drag.mode.indexOf('b') > -1) { b.h = Math.min(Math.max(MIN, b.h + dy), 1 - b.y); }
    }
    ed.box = b; placeBox();
  });
  box.addEventListener('pointerup', function () { drag = null; });
  window.addEventListener('resize', function () { if (!$('#s-edit').hidden) edDraw(); });

  // ---------- Google sign-in (token in the address bar; it lasts about an hour) ----------
  function rand() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return b.toString(16); }).join(''); }
  function signIn() {
    // Kept in localStorage (not per-tab), because on Android the Google page can come back in a different tab
    // than the home-screen app that started it.
    // Opened in a new window so the pictures already on this screen are not lost.
    var st = rand(); store.set('state', st);
    var url = AUTH + '?' + new URLSearchParams({
      client_id: cfg.clientId, response_type: 'token', redirect_uri: REDIRECT, scope: SCOPE,
      state: st, include_granted_scopes: 'true',
    });
    var w = window.open(url, 'tss-signin');
    if (!w) location.href = url;   // pop-ups blocked: sign in in this window instead
  }
  function finishSignIn() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (!h.get('access_token') && !h.get('error')) return;
    history.replaceState(null, '', '/upload/');
    if (h.get('error')) { note('Google said: ' + h.get('error') + '. Please try Sign in to Google again.'); return; }
    if (!store.get('state') || h.get('state') !== store.get('state')) { note('That sign-in did not match. Please tap Sign in to Google again.'); return; }
    store.set('state', null);
    store.set('access', h.get('access_token'));
    store.set('expires', String(Date.now() + ((+h.get('expires_in') || 3600) - 120) * 1000));
    if (window.opener) {   // this is the sign-in window: hand back to the app and close
      try { window.opener.postMessage('tss-signed-in', location.origin); } catch (e) {}
      document.body.textContent = 'Signed in. You can close this and go back to the app.';
      setTimeout(function () { window.close(); }, 400);
      return 'popup';
    }
  }
  function refreshSignedIn() {
    var yes = !!(cfg.clientId && token());
    signedInUI(yes);
    if (yes && !$('#signin2').hidden) { $('#signin2').hidden = true; }
    if (yes) sendOutbox(); else refreshOutbox();
  }
  window.addEventListener('message', function (e) { if (e.origin === location.origin && e.data === 'tss-signed-in') refreshSignedIn(); });
  window.addEventListener('storage', function (e) { if (e.key === 'tss-access') refreshSignedIn(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshSignedIn(); });
  function note(msg) { var a = $('#acct'); a.textContent = msg; a.classList.add('bad'); noted = true; }
  var noted = false;
  function token() { return store.get('access') && Date.now() < +store.get('expires') ? store.get('access') : null; }
  function signedInUI(yes) {
    $('#signin').hidden = yes || !cfg.clientId; $('#signout').hidden = !yes;
    if (!noted) $('#acct').textContent = !cfg.clientId ? '' : yes ? 'Signed in to Google Drive.' : 'Sign in to Google, then Save sends pictures straight to Google Drive.';
    if (yes) { $('#acct').classList.remove('bad'); }
    if (!cfg.clientId) {   // Share-button mode: one big button that hands the pictures to the Drive app
      $('#save').hidden = true;
      $('#share').className = 'save wobbly';
      $('#share').textContent = 'Save to Google Drive';
      $('#share-help').hidden = false;
    }
  }
  $('#signin').addEventListener('click', signIn);
  $('#signin2').addEventListener('click', signIn);
  $('#signout').addEventListener('click', function () { store.set('access', null); store.set('expires', null); signedInUI(false); });

  // ---------- saving: first onto the phone, then to Google Drive ----------
  function status(msg, bad) { var s = $('#status'); s.textContent = msg; s.className = bad ? 'status bad' : 'status'; }
  async function api(url, opts) {
    var tok = token(); if (!tok) throw new Error('Your Google sign-in ran out.');
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + tok }, opts.headers || {});
    var r = await fetch(url, opts);
    if (r.status === 401) { store.set('access', null); throw new Error('Your Google sign-in ran out.'); }
    if (r.status === 403) {
      var why = '';
      try { var e = (await r.clone().json()).error || {}; why = ((e.errors && e.errors[0] && e.errors[0].reason) || e.status || '') + ' ' + (e.message || ''); } catch (x) {}
      if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(why))
        throw new Error('Google Drive is not turned on for this app yet (Drive API). The pictures are still saved on this phone.');
      if (/insufficient|scope/i.test(why)) {
        store.set('access', null);
        throw new Error('Google did not give this app permission to save. Sign in again and tick the box that lets it add files to your Drive.');
      }
      throw new Error('Google Drive said no (403' + (why.trim() ? ': ' + why.trim().slice(0, 120) : '') + '). The pictures are still saved on this phone.');
    }
    return r;
  }
  var folderCache = {};
  async function folderId(parts) {   // finds or makes Two Sisters Studio / Kid / year / part
    var parent = 'root', key = '';
    for (var i = 0; i < parts.length; i++) {
      key += '/' + parts[i];
      if (folderCache[key]) { parent = folderCache[key]; continue; }
      var q = "name = '" + parts[i].replace(/'/g, "\\'") + "' and mimeType = '" + FOLDER + "' and '" + parent + "' in parents and trashed = false";
      var r = await api(API + '/files?' + new URLSearchParams({ q: q, fields: 'files(id)', spaces: 'drive' }));
      var j = await r.json(), id = j.files && j.files[0] && j.files[0].id;
      if (!id) {
        r = await api(API + '/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: parts[i], mimeType: FOLDER, parents: [parent] }) });
        if (!r.ok) throw new Error('Google Drive would not make the folder (' + r.status + ').');
        id = (await r.json()).id;
      }
      parent = folderCache[key] = id;
    }
    return parent;
  }
  async function freeName(parent, base, ext) {
    var r = await api(API + '/files?' + new URLSearchParams({ q: "'" + parent + "' in parents and trashed = false and name contains '" + base + "'", fields: 'files(name)' }));
    var taken = ((await r.json()).files || []).map(function (f) { return f.name; });
    for (var n = 1; n < 50; n++) { var name = base + (n > 1 ? '-' + n : ''); if (taken.indexOf(name + '.' + ext) === -1) return name; }
    throw new Error('Too many pictures with the same name.');
  }
  async function upload(parent, name, blob, type, onPart) {
    var r = await api(UPLOAD + '?uploadType=resumable', { method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(blob.size) },
      body: JSON.stringify({ name: name, parents: [parent] }) });
    if (!r.ok) throw new Error('Google Drive would not start the upload (' + r.status + ').');
    var url = r.headers.get('Location'), size = blob.size, CH = 256 * 1024 * 16, start = 0;
    while (start < size || size === 0) {
      var end = Math.min(start + CH, size), tries = 0, res;
      for (;;) {   // retry a piece a few times on a weak signal
        try {
          res = await fetch(url, { method: 'PUT', headers: { 'Content-Range': size ? 'bytes ' + start + '-' + (end - 1) + '/' + size : 'bytes */0' }, body: blob.slice(start, end) });
          if (res.ok || res.status === 308) break;
        } catch (e) { /* network blip */ }
        if (++tries > 4) throw new Error('The connection dropped. Nothing was lost on the phone; tap Save again.');
        await new Promise(function (ok) { setTimeout(ok, 1500 * tries); });
      }
      if (res.ok) { if (onPart) onPart(1); return; }
      var got = res.headers.get('Range');   // what Google has so far
      start = got ? +got.split('-')[1] + 1 : end;
      if (onPart) onPart(start / size);
      if (size === 0) return;
    }
  }
  $('#save').addEventListener('click', async function () {
    var btn = this; btn.disabled = true;
    try {
      var n = state.items.length, stamp = Date.now();
      for (var i = 0; i < n; i++) {
        var it = state.items[i], pl = plan(it, i);
        await put('outbox', { id: stamp + '-' + i, folder: pl.folder, base: pl.base, ext: pl.ext, meta: pl.meta,
          original: it.file, originalType: it.file.type || 'image/jpeg', edited: it.edited || null });
      }
      clearItems(); renderList();
      status('Saved ' + n + ' picture' + (n > 1 ? 's' : '') + ' on this phone.' + (navigator.onLine && token() ? ' Sending to Google Drive…' : ' They will go to Google Drive next time there is internet and you are signed in.'));
      sendOutbox();
    } catch (e) { status('Could not save on this phone: ' + e.message, true); }
    btn.disabled = !state.items.length;
  });

  var sending = false;
  async function refreshOutbox() {
    var waiting = (await all('outbox')).length, bar = $('#outbox');
    bar.hidden = !waiting;
    $('#outbox-text').textContent = waiting + ' picture' + (waiting > 1 ? 's' : '') + ' saved on this phone, waiting to go to Google Drive.';
    $('#outbox-send').textContent = token() ? 'Send now' : 'Sign in to Google and send';
    return waiting;
  }
  async function sendOutbox() {
    if (sending || !cfg.clientId) { refreshOutbox(); return; }
    var list = await all('outbox');
    if (!list.length) { refreshOutbox(); return; }
    if (!navigator.onLine || !token()) { refreshOutbox(); return; }
    sending = true; var done = 0;
    try {
      for (var i = 0; i < list.length; i++) {
        var q = list[i];
        status('Sending picture ' + (i + 1) + ' of ' + list.length + ' to Google Drive…');
        var parent = await folderId([cfg.folderName].concat(q.folder.split('/')));
        var name = await freeName(parent, q.base, q.edited ? 'jpg' : q.ext);
        var meta = Object.assign({}, q.meta);
        if (q.edited) {
          meta.original = name + '-original.' + q.ext;
          await upload(parent, name + '.jpg', q.edited, 'image/jpeg');
          await upload(parent, meta.original, q.original, q.originalType);
        } else {
          await upload(parent, name + '.' + q.ext, q.original, q.originalType, function (f) {
            status('Sending picture ' + (i + 1) + ' of ' + list.length + ' (' + Math.round(f * 100) + '%)');
          });
        }
        await upload(parent, name + '.json', new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }), 'application/json');
        await del('outbox', q.id); done++;
      }
      status('All sent to Google Drive. Tell Claude “new art is in” when you want them on the site.');
    } catch (e) {
      status((done ? done + ' sent. ' : '') + e.message + ' The rest are still saved on this phone.', true);
    }
    sending = false; refreshOutbox();
  }
  $('#outbox-send').addEventListener('click', function () { if (token()) sendOutbox(); else signIn(); });
  window.addEventListener('online', sendOutbox);

  // Fallback: hand the photos and their .json files to the Google Drive app through Android's Share button.
  $('#share').addEventListener('click', async function () {
    var files = [];
    state.items.forEach(function (it, i) {
      var pl = plan(it, i);
      files.push(new File([it.edited || it.file], pl.base + '.' + (it.edited ? 'jpg' : pl.ext), { type: it.edited ? 'image/jpeg' : it.file.type }));
      files.push(new File([JSON.stringify(pl.meta, null, 2)], pl.base + '.json', { type: 'application/json' }));
    });
    if (!navigator.canShare || !navigator.canShare({ files: files })) {
      status('This phone can’t share files from here. Use Save instead.', true); return;
    }
    status('Pick Drive, choose the “' + cfg.folderName + '” folder, then tap Save. After that, tell Claude “new art is in”.');
    try { await navigator.share({ files: files, title: cfg.folderName }); } catch (e) { /* closed the share sheet */ }
  });

  // ---------- pictures shared in from Google Photos (the service worker stores them) ----------
  async function takeShared() {
    var got = await all('shared');
    if (!got.length) return;
    got.forEach(function (s) { addFiles([s.file]); });
    await Promise.all(got.map(function (s) { return del('shared', s.id); }));
    $('#kid-lead').textContent = got.length + ' picture' + (got.length > 1 ? 's' : '') + ' shared in. Whose art is it?';
  }

  // ---------- start ----------
  if (cfg.clientId && finishSignIn() === 'popup') return;
  signedInUI(!!(cfg.clientId && token()));
  show('s-kid');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/upload/sw.js', { scope: '/upload/' }).catch(function () {});
  takeShared().then(refreshOutbox).then(sendOutbox);
})();
