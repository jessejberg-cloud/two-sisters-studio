// Two Sisters Studio upload app: pick a kid, take photos, caption each, Save to Google Drive.
// Full-quality photos and a .json for each go to Google Drive / Two Sisters Studio / <Kid> / <year> / <School Year|Summer>.
// Sign-in: Google's own page. The app asks only for "drive.file": it can see and change only the files it made.
// No client ID yet? The app still works through the phone's Share button (to the Google Drive app).
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
  var state = { kid: null, items: [] };   // items: { file, url, caption, featured }

  // ---------- dates, seasons, names ----------
  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function season(iso) { var m = +iso.slice(5, 7); return m >= 9 && m <= 11 ? 'fall' : (m === 12 || m <= 2) ? 'winter' : m <= 5 ? 'spring' : 'summer'; }
  function schoolYear(iso) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? y + '-' + String(y + 1).slice(2) : (y - 1) + '-' + String(y).slice(2); }
  function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 5).join('-') || 'untitled'; }
  function ext(f) { var m = /\.([a-z0-9]+)$/i.exec(f.name || ''); return (m ? m[1] : (f.type.split('/')[1] || 'jpg')).toLowerCase().replace('jpeg', 'jpg'); }
  function plan(item, i) {
    var kid = cfg.kids[state.kid], iso = $('#date').value || today(), s = season(iso), sy = schoolYear(iso);
    var base = iso + '_' + state.kid + '_' + s + '_' + slug(item.caption || ('picture ' + (i + 1)));
    return {
      folder: kid.name + '/' + sy + '/' + (s === 'summer' ? 'Summer' : 'School Year'),
      base: base, ext: ext(item.file),
      meta: { kid: state.kid, date: iso, schoolYear: sy, grade: (kid.grades || {})[sy] || '', season: s, caption: item.caption.trim(), featured: item.featured },
    };
  }

  // ---------- screens ----------
  function show(id) { document.querySelectorAll('.screen').forEach(function (s) { s.hidden = s.id !== id; }); }
  function setKid(k) {
    state.kid = k; state.items = [];
    $('#who').textContent = cfg.kids[k].name;
    document.body.className = 'up c-' + cfg.kids[k].color;
    $('#date').value = today(); renderList(); show('s-photos');
  }
  document.querySelectorAll('[data-kid]').forEach(function (b) { b.addEventListener('click', function () { setKid(b.dataset.kid); }); });
  $('#back').addEventListener('click', function () { if (!state.items.length || confirm('Leave without saving these pictures?')) show('s-kid'); });

  function addFiles(list) {
    Array.prototype.forEach.call(list, function (f) {
      if (!/^image\//.test(f.type)) return;
      state.items.push({ file: f, url: URL.createObjectURL(f), caption: '', featured: false });
    });
    renderList();
  }
  $('#take').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  $('#pick').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });

  function renderList() {
    var ul = $('#list'); ul.textContent = '';
    state.items.forEach(function (it, i) {
      var li = document.createElement('li'); li.className = 'item';
      var img = document.createElement('img'); img.src = it.url; img.alt = 'Picture ' + (i + 1);
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
      li.append(img, box); ul.append(li);
    });
    $('#count').textContent = state.items.length ? state.items.length + ' picture' + (state.items.length > 1 ? 's' : '') : 'No pictures yet';
    $('#save').disabled = !state.items.length;
    $('#share').disabled = !state.items.length;
  }

  // ---------- Google sign-in (token in the address bar; it lasts about an hour) ----------
  function rand() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return b.toString(16); }).join(''); }
  function signIn() {
    var st = rand(); sessionStorage.setItem('tss-state', st);
    location.href = AUTH + '?' + new URLSearchParams({
      client_id: cfg.clientId, response_type: 'token', redirect_uri: REDIRECT, scope: SCOPE,
      state: st, include_granted_scopes: 'true', prompt: '',
    });
  }
  function finishSignIn() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (!h.get('access_token') && !h.get('error')) return;
    history.replaceState(null, '', '/upload/');
    if (h.get('error')) { status('Google said: ' + h.get('error'), true); return; }
    if (h.get('state') !== sessionStorage.getItem('tss-state')) { status('Sign-in did not match. Please try again.', true); return; }
    sessionStorage.removeItem('tss-state');
    store.set('access', h.get('access_token'));
    store.set('expires', String(Date.now() + ((+h.get('expires_in') || 3600) - 120) * 1000));
  }
  function token() { return store.get('access') && Date.now() < +store.get('expires') ? store.get('access') : null; }
  function signedInUI(yes) {
    $('#signin').hidden = yes || !cfg.clientId; $('#signout').hidden = !yes;
    $('#acct').textContent = !cfg.clientId ? '' : yes ? 'Connected to Google Drive.' : 'Sign in to Google, then Save sends pictures straight to Google Drive.';
    if (!cfg.clientId) {   // Share-button mode: one big button that hands the pictures to the Drive app
      $('#save').hidden = true;
      $('#share').className = 'save wobbly';
      $('#share').textContent = 'Save to Google Drive';
      $('#share-help').hidden = false;
    }
  }
  $('#signin').addEventListener('click', signIn);
  $('#signout').addEventListener('click', function () { store.set('access', null); store.set('expires', null); signedInUI(false); });

  // ---------- saving ----------
  function status(msg, bad) { var s = $('#status'); s.textContent = msg; s.className = bad ? 'status bad' : 'status'; }
  async function api(url, opts) {
    var tok = token(); if (!tok) throw new Error('Your Google sign-in ran out. Tap Back, then Sign in to Google.');
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + tok }, opts.headers || {});
    var r = await fetch(url, opts);
    if (r.status === 401) { store.set('access', null); throw new Error('Your Google sign-in ran out. Tap Back, then Sign in to Google.'); }
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
      if (!token()) { status('Please sign in to Google first: tap Back, then Sign in to Google.', true); btn.disabled = false; return; }
      for (var i = 0; i < state.items.length; i++) {
        var it = state.items[i], pl = plan(it, i);
        status('Saving picture ' + (i + 1) + ' of ' + state.items.length + '…');
        var parent = await folderId([cfg.folderName].concat(pl.folder.split('/')));
        var name = await freeName(parent, pl.base, pl.ext);
        await upload(parent, name + '.' + pl.ext, it.file, it.file.type || 'image/jpeg', function (f) {
          status('Saving picture ' + (i + 1) + ' of ' + state.items.length + ' (' + Math.round(f * 100) + '%)');
        });
        await upload(parent, name + '.json', new Blob([JSON.stringify(pl.meta, null, 2)], { type: 'application/json' }), 'application/json');
        it.saved = true;
      }
      var n = state.items.length;
      state.items.forEach(function (it) { URL.revokeObjectURL(it.url); }); state.items = [];
      renderList(); status('Saved ' + n + ' picture' + (n > 1 ? 's' : '') + ' to Google Drive. Tell Claude “new art is in” when you want them on the site.');
    } catch (e) {
      state.items = state.items.filter(function (it) { return !it.saved; }); renderList();
      status(e.message + ' Pictures that were saved are off the list; the rest are still here.', true);
    }
    btn.disabled = !state.items.length;
  });

  // Fallback: hand the photos and their .json files to the Google Drive app through Android's Share button.
  $('#share').addEventListener('click', async function () {
    var files = [];
    state.items.forEach(function (it, i) {
      var pl = plan(it, i);
      files.push(new File([it.file], pl.base + '.' + pl.ext, { type: it.file.type }));
      files.push(new File([JSON.stringify(pl.meta, null, 2)], pl.base + '.json', { type: 'application/json' }));
    });
    if (!navigator.canShare || !navigator.canShare({ files: files })) {
      status('This phone can’t share files from here. Use Save instead.', true); return;
    }
    status('Pick Drive, choose the “' + cfg.folderName + '” folder, then tap Save. After that, tell Claude “new art is in”.');
    try { await navigator.share({ files: files, title: cfg.folderName }); } catch (e) { /* closed the share sheet */ }
  });

  // ---------- start ----------
  if (cfg.clientId) finishSignIn();
  signedInUI(!!(cfg.clientId && token()));
  show('s-kid');
})();
