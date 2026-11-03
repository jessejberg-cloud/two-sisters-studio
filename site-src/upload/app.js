// Two Sisters Studio upload app: pick a kid, take photos, caption each, Save to OneDrive.
// Full-quality photos and a .json for each go to OneDrive / Apps / Two Sisters Studio / <Kid> / <year> / <School Year|Summer>.
// Sign-in: Microsoft's own page (OAuth with PKCE). The app can only reach its own OneDrive folder (Files.ReadWrite.AppFolder).
// No client ID yet? The app still works through the phone's Share button (to the OneDrive app).
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var AUTH = 'https://login.microsoftonline.com/' + encodeURIComponent(cfg.tenant || 'consumers') + '/oauth2/v2.0';
  var GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
  var SCOPE = 'Files.ReadWrite.AppFolder offline_access';
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

  // ---------- Microsoft sign-in (authorization code + PKCE) ----------
  function b64url(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function rand() { var a = new Uint8Array(32); crypto.getRandomValues(a); return b64url(a); }
  async function signIn() {
    var verifier = rand(), st = rand();
    var challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    sessionStorage.setItem('tss-pkce', verifier); sessionStorage.setItem('tss-state', st);
    location.href = AUTH + '/authorize?' + new URLSearchParams({
      client_id: cfg.clientId, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', state: st, prompt: 'select_account',
    });
  }
  async function tokenRequest(body) {
    var r = await fetch(AUTH + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.assign({ client_id: cfg.clientId, scope: SCOPE, redirect_uri: REDIRECT }, body)) });
    var j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.error || 'Sign-in failed');
    store.set('access', j.access_token); store.set('expires', String(Date.now() + (j.expires_in - 120) * 1000));
    if (j.refresh_token) store.set('refresh', j.refresh_token);
    return j.access_token;
  }
  async function finishSignIn() {
    var q = new URLSearchParams(location.search);
    if (!q.get('code') && !q.get('error')) return;
    history.replaceState(null, '', '/upload/');
    if (q.get('error')) { status('Microsoft said: ' + (q.get('error_description') || q.get('error')), true); return; }
    if (q.get('state') !== sessionStorage.getItem('tss-state')) { status('Sign-in did not match. Please try again.', true); return; }
    await tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), code_verifier: sessionStorage.getItem('tss-pkce') });
    sessionStorage.removeItem('tss-pkce'); sessionStorage.removeItem('tss-state');
  }
  async function token() {
    if (store.get('access') && Date.now() < +store.get('expires')) return store.get('access');
    if (store.get('refresh')) {
      try { return await tokenRequest({ grant_type: 'refresh_token', refresh_token: store.get('refresh') }); }
      catch (e) { store.set('refresh', null); }
    }
    return null;
  }
  function signedInUI(yes) {
    $('#signin').hidden = yes || !cfg.clientId; $('#signout').hidden = !yes;
    $('#acct').textContent = !cfg.clientId ? 'OneDrive is not connected yet. Use “Share to OneDrive app” for now.'
      : yes ? 'Connected to OneDrive.' : 'Sign in to Microsoft once, then Save sends pictures straight to OneDrive.';
  }
  $('#signin').addEventListener('click', signIn);
  $('#signout').addEventListener('click', function () { ['access', 'refresh', 'expires'].forEach(function (k) { store.set(k, null); }); signedInUI(false); });

  // ---------- saving ----------
  function status(msg, bad) { var s = $('#status'); s.textContent = msg; s.className = bad ? 'status bad' : 'status'; }
  function path(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  async function api(tok, url, opts) {
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + tok }, opts.headers || {});
    return fetch(url, opts);
  }
  async function exists(tok, p) { var r = await api(tok, GRAPH + ':/' + path(p)); return r.ok; }
  async function freeName(tok, folder, base, ext) {
    for (var n = 1; n < 50; n++) {
      var name = base + (n > 1 ? '-' + n : '');
      if (!(await exists(tok, folder + '/' + name + '.' + ext))) return name;
    }
    throw new Error('Too many pictures with the same name.');
  }
  async function uploadBig(tok, p, file, onPart) {
    var r = await api(tok, GRAPH + ':/' + path(p) + ':/createUploadSession', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'fail' } }) });
    if (!r.ok) throw new Error('OneDrive would not start the upload (' + r.status + ').');
    var url = (await r.json()).uploadUrl, size = file.size, CH = 320 * 1024 * 10, start = 0;
    while (start < size) {
      var end = Math.min(start + CH, size), tries = 0, res;
      for (;;) {   // retry a piece a few times on a weak signal
        try {
          res = await fetch(url, { method: 'PUT', headers: { 'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + size }, body: file.slice(start, end) });
          if (res.ok || res.status === 202 || res.status === 201 || res.status === 200) break;
        } catch (e) { /* network blip */ }
        if (++tries > 4) throw new Error('The connection dropped. Nothing was lost on the phone; tap Save again.');
        await new Promise(function (ok) { setTimeout(ok, 1500 * tries); });
      }
      start = end; onPart(start / size);
    }
  }
  async function putSmall(tok, p, text) {
    var r = await api(tok, GRAPH + ':/' + path(p) + ':/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text });
    if (!r.ok) throw new Error('OneDrive would not save the caption (' + r.status + ').');
  }
  $('#save').addEventListener('click', async function () {
    var btn = this; btn.disabled = true;
    try {
      var tok = await token();
      if (!tok) { status('Please sign in to Microsoft first (button below).', true); btn.disabled = false; return; }
      for (var i = 0; i < state.items.length; i++) {
        var it = state.items[i], pl = plan(it, i);
        status('Saving picture ' + (i + 1) + ' of ' + state.items.length + '…');
        var name = await freeName(tok, pl.folder, pl.base, pl.ext);
        await uploadBig(tok, pl.folder + '/' + name + '.' + pl.ext, it.file, function (f) {
          status('Saving picture ' + (i + 1) + ' of ' + state.items.length + ' (' + Math.round(f * 100) + '%)');
        });
        await putSmall(tok, pl.folder + '/' + name + '.json', JSON.stringify(pl.meta, null, 2));
        it.saved = true;
      }
      var n = state.items.length;
      state.items.forEach(function (it) { URL.revokeObjectURL(it.url); }); state.items = [];
      renderList(); status('Saved ' + n + ' picture' + (n > 1 ? 's' : '') + ' to OneDrive. Tell Claude “new art is in” when you want them on the site.');
    } catch (e) {
      state.items = state.items.filter(function (it) { return !it.saved; }); renderList();
      status(e.message + ' Pictures that were saved are off the list; the rest are still here.', true);
    }
    btn.disabled = !state.items.length;
  });

  // Fallback: hand the photos and their .json files to the OneDrive app through Android's Share button.
  $('#share').addEventListener('click', async function () {
    var files = [];
    state.items.forEach(function (it, i) {
      var pl = plan(it, i);
      files.push(new File([it.file], pl.base + '.' + pl.ext, { type: it.file.type }));
      files.push(new File([JSON.stringify(pl.meta, null, 2)], pl.base + '.json', { type: 'application/json' }));
    });
    var folder = plan(state.items[0], 0).folder;
    if (!navigator.canShare || !navigator.canShare({ files: files })) {
      status('This phone can’t share files from here. Use Save instead.', true); return;
    }
    status('In the share list, pick OneDrive, then open Apps › ' + cfg.folderName + ' › ' + folder + '.');
    try { await navigator.share({ files: files, title: cfg.folderName }); } catch (e) { /* closed the share sheet */ }
  });

  // ---------- start ----------
  (async function () {
    if (cfg.clientId) { try { await finishSignIn(); } catch (e) { status(e.message, true); } }
    var tok = cfg.clientId ? await token() : null;
    signedInUI(!!tok);
    show('s-kid');
  })();
})();
