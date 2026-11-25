// Two Sisters Studio "Add art" app.
// Pick who made it (Leora, Amaya or Both), take or pick photos (art is straightened and its light evened out by itself;
// Turn and Fix corners if needed), caption, star, Save. Save keeps everything on the phone first (IndexedDB "outbox"), then sends it to the
// site: the untouched original (and the edited copy) go straight to Google Drive through one-time upload addresses
// the site makes; the web copies go to the site, which shows the piece in the gallery right away.
// No Google sign-in on the phone: the site holds the Drive connection. Works with no signal and resumes.
(function () {
  'use strict';
  // Remember that this device adds art, so the site shows an Add art link in the top row here (tablets).
  try { localStorage.setItem('tss-adder', '1'); } catch (e) {}
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var $ = function (s) { return document.querySelector(s); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  var state = { kid: null, pieces: [], section: 'art', me: null, day: null };   // day: { key, title, date } when adding photos of a special day   // pieces: [{ caption, starred, photos: [photo], dupes: [] }]
  // photo: { file, url, bmpUrl, edit: { rot, crop, look }, edited: Blob|null, fp }

  // ---------- dates ----------
  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function niceDate(iso) { var d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); }
  function kidName(k) { return k === 'both' ? cfg.kids.leora.name + ' and ' + cfg.kids.amaya.name : cfg.kids[k].name; }

  // ---------- the phone's own storage (IndexedDB) ----------
  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (ok, no) {
      var r = indexedDB.open('two-sisters-studio', 2);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('shared')) d.createObjectStore('shared', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('outbox2')) d.createObjectStore('outbox2', { keyPath: 'id' });
      };
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
  function status(msg, bad) { var s = $('#status'); s.textContent = msg; s.classList.toggle('bad', !!bad); }
  function setKid(k) {
    state.kid = k; state.day = null;
    $('#who').textContent = k === 'both' ? 'Made together' : cfg.kids[k].name + (state.section === 'photos' ? '’s snapshots' : '’s art');
    document.body.className = 'up c-' + (k === 'both' ? 'yellow' : cfg.kids[k].color) + (kidMode() ? ' kid-mode' : '') + (IN_APP ? ' in-app' : '');
    if (!$('#date').value) $('#date').value = today();
    status(''); renderList(); show('s-photos');
  }
  // ---------- a girl's own tablet (her tablet password): one big Choose photos, her name already picked ----------
  // Inside the girls' tablet app (Amazon Kids' browser blocks the camera and photo picker; the app does not).
  var IN_APP = / TwoSistersApp\//.test(navigator.userAgent);
  if (IN_APP) document.body.classList.add('in-app');
  function kidMode() { return !!(state.me && state.me.role === 'kid'); }
  // A household's phone (Grandma's, from an invite link; Jesse, 2026-11-25): My photos (their own page) or A special day.
  function houseMode() { return !!(state.me && state.me.role === 'house'); }
  var HM = function () { return houseMode() ? ' house-mode' : ''; };
  function startHouseMode() {
    var name = state.me.name || 'Family', q = new URLSearchParams(location.search), inv = (/[#&]i=([A-Za-z0-9_-]+)/.exec(location.hash) || [])[1];
    document.body.className = 'up c-sky house-mode' + (IN_APP ? ' in-app' : '');
    $('#house-own').textContent = name + '’s photos';
    if (q.get('welcome')) {
      $('#welcome').hidden = false; $('#welcome-name').textContent = ', ' + name;
      var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var installed = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
      $('#ios-tip').hidden = !(ios && !installed);
      $('#copy-invite').hidden = !inv;
      $('#copy-invite').addEventListener('click', function () {
        var b = this, link = location.origin + '/i/' + inv;
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { b.textContent = '✓ Copied'; }, function () { b.textContent = link; });
      });
      try { history.replaceState(null, '', '/upload/'); } catch (e) {}
    }
    show('s-househome');
  }
  document.querySelectorAll('[data-housewhat]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.housewhat === 'day') { openVideo(); return; }
      state.kid = 'both'; state.section = 'house'; state.day = null;
      $('#who').textContent = (state.me.name || 'Family') + '’s photos';
      $('#date').value = today();
      document.body.className = 'up c-sky day-mode house-mode house-own' + (IN_APP ? ' in-app' : '');
      status(''); renderList(); show('s-photos');
    });
  });
  function setWhere(w) {
    state.section = w;
    document.querySelectorAll('[data-where]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.where === w)); });
  }
  document.querySelectorAll('[data-where]').forEach(function (b) { b.addEventListener('click', function () { setWhere(b.dataset.where); }); });
  async function startKidMode() {
    try { state.me = await (await fetch('/api/whoami', { credentials: 'same-origin' })).json(); } catch (e) { state.me = null; }
    if (houseMode()) { startHouseMode(); return true; }
    if (!kidMode() || !cfg.kids[state.me.kid]) return false;
    $('#kid-page').href = '/' + state.me.kid + '/';
    document.querySelectorAll('.kid-page').forEach(function (a) { a.href = '/' + state.me.kid + '/'; });
    document.body.className = 'up c-' + cfg.kids[state.me.kid].color + ' kid-mode' + (IN_APP ? ' in-app' : '');
    show('s-kidhome');   // My art or A snapshot (Jesse, 2026-11-25)
    return true;
  }
  document.querySelectorAll('[data-kidwhat]').forEach(function (b) {
    b.addEventListener('click', function () {
      var art = b.dataset.kidwhat === 'art';
      setWhere(art ? 'art' : 'photos');
      $('#where').hidden = art || !state.me.moments;
      $('#kid-help').textContent = art ? 'Take a picture of your art, or choose one. It goes on your page after a grown-up says OK.'
        : 'Take a picture or choose one. It goes to your snapshots after a grown-up says OK.' + (state.me.moments ? ' Or tap Family Moments below.' : '');
      setKid(state.me.kid);
    });
  });
  // ---------- home: what are we adding? Art, a snapshot (a photo she took), or a podcast episode ----------
  function chooseWhat(what) {
    if (what === 'episode') { openEpisode(); return; }
    if (what === 'video') { openVideo(); return; }
    state.section = what;
    $('#who-lead').textContent = what === 'photos' ? 'Whose snapshot is it?' : 'Whose art is it?';
    document.querySelector('[data-kid="both"]').hidden = what === 'photos';
    show('s-who');
  }
  document.querySelectorAll('[data-what]').forEach(function (b) { b.addEventListener('click', function () { chooseWhat(b.dataset.what); }); });
  $('#who-back').addEventListener('click', function () { show('s-kid'); });
  document.querySelectorAll('[data-kid]').forEach(function (b) { b.addEventListener('click', function () { setKid(b.dataset.kid); }); });

  // ---------- a Pet Parents episode: audio, details, maybe a drawing ----------
  // The audio goes to the site in 3 MB pieces (Netlify's limit is 6 MB per request), so the page can play it right
  // away; then the untouched file goes to Google Drive through a one-time address, as the archive copy.
  var ep = { audio: null, drawing: null, minutes: null, job: null, busy: false };
  function epStatus(msg, bad) { var s = $('#ep-status'); s.textContent = msg; s.classList.toggle('bad', !!bad); }
  function epBar(f) { $('#ep-bar').hidden = f == null; $('#ep-bar-fill').style.width = Math.round((f || 0) * 100) + '%'; }
  function epReady() { $('#ep-save').disabled = ep.busy || !ep.audio; }
  function mb(n) { return n > 1e6 ? Math.round(n / 1e6) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB'; }
  function openEpisode() {
    document.body.className = 'up c-lav' + (IN_APP ? ' in-app' : '');
    if (!$('#ep-date').value) $('#ep-date').value = today();
    epStatus(''); show('s-episode'); epList();
  }
  $('#ep-back').addEventListener('click', function () {
    if (ep.busy && !confirm('The episode is still sending. Leave anyway? You can send it again later.')) return;
    show('s-kid');
  });
  $('#ep-audio').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    ep.audio = f; ep.job = null; ep.minutes = null;
    $('#ep-audio-label').textContent = '🎙️ ' + f.name + ' · ' + mb(f.size);
    var a = new Audio(), u = URL.createObjectURL(f);
    a.preload = 'metadata';
    a.onloadedmetadata = function () {
      if (isFinite(a.duration) && a.duration > 0) { ep.minutes = Math.max(1, Math.round(a.duration / 60)); $('#ep-audio-label').textContent += ' · ' + ep.minutes + ' min'; }
      URL.revokeObjectURL(u);
    };
    a.onerror = function () { URL.revokeObjectURL(u); };
    a.src = u;
    if (!$('#ep-title').value) $('#ep-title').value = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
    $('#ep-done').hidden = true; epStatus(''); epReady();
  });
  $('#ep-drawing').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f || !/^image\//.test(f.type)) return;
    ep.drawing = f; $('#ep-drawing-label').textContent = '🖍️ ' + f.name;
  });
  function petsFrom(text) {
    return text.split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
      var m = /^(.+?)\s+the\s+(.+)$/i.exec(s); return m ? { name: m[1], kind: m[2] } : { name: s, kind: '' };
    });
  }
  async function postBytes(url, body, type) {
    for (var tries = 0; ; tries++) {
      try {
        var r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': type || 'application/octet-stream' }, body: body });
        if (r.ok) return r.json();
        if (r.status === 401) throw Object.assign(new Error('Please log in to the site again (the family password).'), { stop: true });
        if (r.status < 500) { var j = {}; try { j = await r.json(); } catch (e) {} throw Object.assign(new Error('The site said no (' + (j.error || r.status) + ').'), { stop: true }); }
      } catch (e) { if (e.stop || tries >= 4) throw e; }
      if (tries >= 4) throw new Error('The connection dropped.');
      await new Promise(function (ok) { setTimeout(ok, 1500 * (tries + 1)); });
    }
  }
  $('#ep-save').addEventListener('click', async function () {
    if (!ep.audio || ep.busy) return;
    ep.busy = true; epReady(); $('#ep-done').hidden = true;
    var f = ep.audio;
    try {
      if (!ep.job || ep.job.file !== f) {
        var title = $('#ep-title').value.trim();
        epStatus('Getting ready…'); epBar(0);
        var st = await apiJSON('/api/episodes/start', { title: title || ('Episode ' + ($('#ep-number').value || '')).trim(),
          number: +$('#ep-number').value || 0, date: $('#ep-date').value || today(), description: $('#ep-desc').value.trim(),
          guests: $('#ep-guests').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean), pets: petsFrom($('#ep-pets').value),
          minutes: ep.minutes, audioType: f.type || 'audio/mpeg', audioSize: f.size });
        ep.job = { file: f, id: st.id, number: st.number, chunkSize: st.chunkSize, chunks: st.chunks, upload: st.upload, sent: {}, drawn: false, live: false, drive: null };
      }
      var J = ep.job;
      for (var i = 0; i < J.chunks; i++) {
        if (J.sent[i]) continue;
        epStatus('Sending the audio to the site… ' + Math.round(i / J.chunks * 100) + '%'); epBar(i / J.chunks);
        await postBytes('/api/episodes/' + J.id + '/audio/' + i, f.slice(i * J.chunkSize, Math.min(f.size, (i + 1) * J.chunkSize)));
        J.sent[i] = true;
      }
      epBar(1);
      if (ep.drawing && !J.drawn) {
        epStatus('Sending the drawing…');
        var wc = await webCopies(ep.drawing), fd = new FormData();
        fd.set('meta', JSON.stringify({ w: wc.w, h: wc.h })); fd.set('web', wc.web, 'web'); fd.set('thumb', wc.thumb, 'thumb');
        var r = await fetch('/api/episodes/' + J.id + '/drawing', { method: 'POST', credentials: 'same-origin', body: fd });
        if (!r.ok) throw await notTaken(r, 'drawing');
        J.drawn = true;
      }
      if (!J.live) { await apiJSON('/api/episodes/' + J.id + '/finish'); J.live = true; }
      $('#ep-done').hidden = false; epList();
      // The archive copy in Google Drive. If it does not work, the episode is still on the site.
      if (J.upload && !J.drive) {
        try {
          J.drive = await sendToGoogle(J.upload, f, function (x) { epStatus('Episode ' + J.number + ' is on the site. Keeping a copy in Google Drive… ' + Math.round(x * 100) + '%'); epBar(x); });
          await apiJSON('/api/episodes/' + J.id + '/finish', { driveAudio: J.drive });
        } catch (e) { J.upload = null; epStatus('Episode ' + J.number + ' is on the site. The Google Drive copy did not go; keep the file on your phone.', true); epBar(null); ep.busy = false; epReady(); return; }
      }
      epBar(null);
      epStatus('✓ Episode ' + J.number + ' is on the Pet Parents page' + (J.drive ? ', and the audio is kept in Google Drive.' : '. (Google Drive is not connected, so there is no Drive copy.)'));
      ep.audio = null; ep.drawing = null; ep.job = null;
      ['#ep-title', '#ep-number', '#ep-desc', '#ep-guests', '#ep-pets', '#ep-audio', '#ep-drawing'].forEach(function (s) { $(s).value = ''; });
      $('#ep-audio-label').textContent = '🎙️ Choose the audio file';
      $('#ep-drawing-label').innerHTML = '🖍️ Add the episode drawing <span class="muted">(optional)</span>';
    } catch (e) {
      epBar(null);
      epStatus((e.message || 'Something went wrong.') + ' Tap Send again to pick up where it stopped.', true);
    }
    ep.busy = false; epReady();
  });
  async function epList() {
    var ul = $('#ep-list');
    try {
      var r = await fetch('/api/episodes?all=1', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(r.status);
      var list = (await r.json()).episodes || [];
      var nums = list.filter(function (x) { return !x.deleted; }).map(function (x) { return x.number; });
      if (!$('#ep-number').value) $('#ep-number').value = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
      ul.innerHTML = '';
      if (!list.length) { ul.append(el('li', 'muted', 'No episodes added from the app yet.')); return; }
      list.forEach(function (x) {
        var li = el('li', 'ep-row wobbly'), box = el('div');
        box.append(el('strong', '', 'Episode ' + x.number + ': ' + x.title));
        box.append(el('p', 'muted', niceDate(x.date) + (x.minutes ? ' · ' + x.minutes + ' min' : '') + (x.deleted ? ' · put away' : x.ready ? '' : ' · not finished sending')));
        var b = el('button', 'chip', x.deleted ? 'Bring back' : 'Put away'); b.type = 'button';
        b.addEventListener('click', async function () {
          b.disabled = true;
          try { await apiJSON('/api/episodes/' + x.id + '/' + (x.deleted ? 'restore' : 'delete')); epList(); } catch (e) { epStatus(e.message, true); b.disabled = false; }
        });
        box.append(b); li.append(box); ul.append(li);
      });
    } catch (e) { ul.innerHTML = ''; ul.append(el('li', 'muted', 'Could not load the list just now.')); }
  }
  // ---------- a Family Moments video: one file, a special day, a few words ----------
  // The phone sends the video once, to the site, in pieces (Send again picks up where a weak signal stopped it).
  // The site shows it right away and copies it into Google Drive by itself.
  var vid = { file: null, info: null, busy: false, job: null, list: [], days: [] };   // days: special days that have photos added from the app
  function vidStatus(msg, bad) { var s = $('#vid-status'); s.textContent = msg; s.classList.toggle('bad', !!bad); }
  function vidBar(f) { $('#vid-bar').hidden = f == null; $('#vid-bar-fill').style.width = Math.round((f || 0) * 100) + '%'; }
  function vidReady() { $('#vid-save').disabled = vid.busy || !vid.file; }
  function events() {   // the special days on the page, plus any that only have videos so far
    var seen = {}, out = [];
    (cfg.moments || []).concat(vid.list.filter(function (v) { return !v.deleted; }).map(function (v) { return { key: v.event, title: v.eventTitle, date: v.eventDate }; }), vid.days)
      .forEach(function (e) { if (!seen[e.key]) { seen[e.key] = 1; out.push(e); } });
    return out.sort(function (a, b) { return b.date.localeCompare(a.date); });
  }
  function fillEvents() {
    var sel = $('#vid-event'), was = vid.lastEvent || (vid.picked ? sel.value : null);   // until someone picks, the newest day
    sel.innerHTML = '';
    events().forEach(function (e) { var o = el('option', '', e.title + ' (' + niceDate(e.date) + ')'); o.value = e.key; sel.append(o); });
    var n = el('option', '', '➕ A new special day'); n.value = ''; sel.append(n);
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === was; }) ? was : (sel.options[0] ? sel.options[0].value : '');
    $('#vid-new').hidden = sel.value !== '';
    $('#vid-event-pick').hidden = sel.options.length < 2;   // no days yet: just ask for the name
  }
  $('#vid-event').addEventListener('change', function () { vid.picked = true; $('#vid-new').hidden = $('#vid-event').value !== ''; });
  function openVideo() {
    if (!$('#vid-event-date').value) $('#vid-event-date').value = today();
    document.body.className = 'up c-yellow' + HM() + (IN_APP ? ' in-app' : '');
    vidStatus(''); dayStatus(''); fillEvents(); show('s-video'); vidList(); dayList();
  }
  // The special days that already have photos from the app, so new photos and videos can join them.
  async function dayList() {
    try {
      var r = await fetch('/api/pieces?section=moments', { credentials: 'same-origin' });
      if (!r.ok) return;
      var seen = {};
      vid.days = ((await r.json()).pieces || []).filter(function (p) { if (!p.event || seen[p.event]) return false; seen[p.event] = 1; return true; })
        .map(function (p) { return { key: p.event, title: p.eventTitle, date: p.eventDate }; });
      fillEvents();
    } catch (e) { /* no signal: the days on the page are still there */ }
  }
  function dayStatus(msg, bad) { var s = $('#day-status'); s.textContent = msg; s.classList.toggle('bad', !!bad); }
  // The day picked (or typed) on the special day screen. Null, with a note, when a new day has no name yet.
  function pickedDay(fallbackTitle) {
    var key = $('#vid-event').value, ev = null;
    events().forEach(function (x) { if (x.key === key) ev = x; });
    if (ev) return { key: ev.key, title: ev.title, date: ev.date };
    var title = $('#vid-event-title').value.trim() || (fallbackTitle || '');
    if (!title) {
      $('#vid-event-title').scrollIntoView({ block: 'center' }); $('#vid-event-title').focus();
      return null;
    }
    return { key: '', title: title, date: $('#vid-event-date').value || today() };
  }
  // Photos of a special day: straight to the photos screen, the day already chosen, nothing else to pick.
  $('#day-photos').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files); e.target.value = '';
    if (!files.length) return;
    var day = pickedDay();
    if (!day) { dayStatus('Type a name for the special day first (the box under "Name of the special day").', true); return; }
    dayStatus('');
    state.kid = 'both'; state.section = 'moments'; state.day = day;
    $('#who').textContent = '❤️ ' + day.title;
    $('#date').value = day.date;
    document.body.className = 'up c-yellow day-mode' + HM() + (IN_APP ? ' in-app' : '');
    status(''); show('s-photos');
    addFiles(files);
  });
  $('#vid-back').addEventListener('click', function () {
    if (vid.busy && !confirm('The video is still sending. Leave anyway? You can send it again later.')) return;
    if (houseMode()) { document.body.className = 'up c-sky house-mode' + (IN_APP ? ' in-app' : ''); show('s-househome'); } else show('s-kid');
  });
  // Videos in the newer "high efficiency" (HEVC) format play on most phones but may not play on the Fire tablets.
  async function isHevc(f) {
    var M = 4 * 1024 * 1024, bits = [f.slice(0, M)];
    if (f.size > M) bits.push(f.slice(Math.max(M, f.size - M)));
    for (var i = 0; i < bits.length; i++) {
      var b = new Uint8Array(await bits[i].arrayBuffer());
      for (var j = 0; j + 4 <= b.length; j++) {
        if ((b[j] === 104 && b[j + 1] === 118 && b[j + 2] === 99 && b[j + 3] === 49) || (b[j] === 104 && b[j + 1] === 101 && b[j + 2] === 118 && b[j + 3] === 49)
          || (b[j] === 100 && b[j + 1] === 118 && b[j + 2] === 104 && b[j + 3] === 49)) return true;   // hvc1, hev1, dvh1
      }
    }
    return false;
  }
  // Length, size and a still picture for the page, from the phone's own player. Any of it may be missing.
  function videoInfo(f) {
    return new Promise(function (ok) {
      var v = document.createElement('video'), u = URL.createObjectURL(f), info = { seconds: 0, w: 0, h: 0, poster: null, pw: 0, ph: 0 }, done = false;
      function finish() { if (done) return; done = true; URL.revokeObjectURL(u); ok(info); }
      setTimeout(finish, 15000);
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onloadedmetadata = function () {
        info.seconds = isFinite(v.duration) ? v.duration : 0; info.w = v.videoWidth; info.h = v.videoHeight;
        try { v.currentTime = Math.min(1, (info.seconds || 2) / 2); } catch (e) { finish(); }
      };
      v.onseeked = function () {
        try {
          var sc = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
          c.width = Math.round(v.videoWidth * sc); c.height = Math.round(v.videoHeight * sc);
          if (!c.width || !c.height) return finish();
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(function (b) { info.poster = b; info.pw = c.width; info.ph = c.height; finish(); }, 'image/webp', 0.82);
        } catch (e) { finish(); }
      };
      v.onerror = finish;
      v.src = u;
    });
  }
  $('#vid-file').addEventListener('change', async function (e) {
    var f = e.target.files[0];
    if (!f) return;
    vid.file = f; vid.info = null; vid.job = null; vidReady(); $('#vid-more').hidden = false;
    $('#vid-label').textContent = '🎬 ' + (f.name || 'Video') + ' (' + mb(f.size) + ')';
    $('#vid-done').hidden = true; $('#vid-poster').hidden = true; $('#vid-note').hidden = true; vidStatus('');
    var info = await videoInfo(f);
    if (vid.file !== f) return;
    vid.info = info;
    info.hevc = await isHevc(f).catch(function () { return false; });
    if (info.poster) { $('#vid-poster').src = URL.createObjectURL(info.poster); $('#vid-poster').hidden = false; }
    var note = [];
    if (info.seconds) note.push(Math.floor(info.seconds / 60) + ':' + String(Math.round(info.seconds % 60)).padStart(2, '0') + ' long');
    if (info.hevc) note.push('This video is in the "high efficiency" (HEVC) format. It plays on most phones and computers, but it may not play on the Fire tablets. You can still send it. For new videos, turning HEVC off in the camera settings makes them play everywhere.');
    if (note.length) { $('#vid-note').textContent = note.join('. '); $('#vid-note').hidden = false; }
  });
  $('#vid-save').addEventListener('click', async function () {
    if (!vid.file || vid.busy) return;
    var f = vid.file, info = vid.info || {};
    // No name typed? Use the few words about it, so nothing blocks sending.
    var day = pickedDay($('#vid-caption').value.trim());
    if (!day) { vidStatus('Type a name for the special day (the box under "Name of the special day").', true); return; }
    var ev = day.key ? day : null, evTitle = day.title, evDate = day.date;
    vid.busy = true; vidReady(); $('#vid-done').hidden = true;
    var lock = null; try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch (e) {}
    try {
      if (!vid.job || vid.job.file !== f) {
        var st = await apiJSON('/api/videos/start', { event: ev ? ev.key : '', eventTitle: evTitle, eventDate: evDate, caption: $('#vid-caption').value.trim(),
          date: evDate, type: f.type || 'video/mp4', size: f.size, seconds: info.seconds || 0, w: info.w || 0, h: info.h || 0, hevc: !!info.hevc });
        vid.job = { file: f, id: st.id, chunkSize: st.chunkSize, chunks: st.chunks, sent: {}, poster: false, live: false };
      }
      var J = vid.job, t0 = Date.now(), done0 = Object.keys(J.sent).length;
      for (var i = 0; i < J.chunks; i++) {
        if (J.sent[i]) continue;
        var doneN = Object.keys(J.sent).length, left = '';
        if (doneN - done0 >= 3) { var per = (Date.now() - t0) / (doneN - done0), m = Math.ceil(per * (J.chunks - doneN) / 60000); left = m > 1 ? ' About ' + m + ' minutes left.' : ' Almost done.'; }
        vidStatus('Sending the video… ' + Math.round(doneN / J.chunks * 100) + '%.' + left + ' Keep this screen open.'); vidBar(doneN / J.chunks);
        await postBytes('/api/videos/' + J.id + '/part/' + i, f.slice(i * J.chunkSize, Math.min(f.size, (i + 1) * J.chunkSize)));
        J.sent[i] = true;
      }
      if (!J.poster && info.poster) {
        var fd = new FormData();
        fd.append('poster', info.poster, 'poster.webp'); fd.append('meta', JSON.stringify({ w: info.pw, h: info.ph }));
        var r = await fetch('/api/videos/' + J.id + '/poster', { method: 'POST', credentials: 'same-origin', body: fd });
        if (r.ok) J.poster = true;   // without it the page shows a plain play button
      }
      if (!J.live) { var fin = await apiJSON('/api/videos/' + J.id + '/finish'); J.live = true; if (fin.video) vid.lastEvent = fin.video.event; }
      fetch('/api/videos-drive/' + J.id, { method: 'POST', credentials: 'same-origin' }).catch(function () {});
      vidBar(null);
      vidStatus('✓ The video is on the Family Moments page. The site is now keeping a copy in Google Drive by itself; you can close the app.');
      $('#vid-done').hidden = false;
      vid.file = null; vid.info = null; vid.job = null;
      ['#vid-file', '#vid-caption', '#vid-event-title'].forEach(function (s) { $(s).value = ''; });
      $('#vid-label').textContent = '🎬 Choose a video'; $('#vid-poster').hidden = true; $('#vid-note').hidden = true; $('#vid-more').hidden = true;
      setTimeout(vidList, 1500);
    } catch (e) {
      vidBar(null);
      vidStatus((e.message || 'Something went wrong.') + ' Tap Send again to pick up where it stopped.', true);
    }
    if (lock) try { lock.release(); } catch (e) {}
    vid.busy = false; vidReady();
  });
  async function vidList() {
    var ul = $('#vid-list');
    try {
      var r = await fetch('/api/videos?all=1', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(r.status);
      vid.list = (await r.json()).videos || [];
      fillEvents();
      ul.innerHTML = '';
      if (!vid.list.length) { ul.append(el('li', 'muted', 'No videos yet.')); return; }
      vid.list.forEach(function (x) {
        var li = el('li', 'ep-row wobbly'), box = el('div');
        box.append(el('strong', '', x.caption || x.eventTitle));
        var drive = x.drive === 'done' ? ' · kept in Google Drive' : x.drive === 'failed' ? ' · not in Google Drive yet' : x.drive ? ' · copying to Google Drive' : '';
        box.append(el('p', 'muted', x.eventTitle + ' · ' + niceDate(x.eventDate) + (x.deleted ? ' · put away' : x.ready ? drive : ' · not finished sending')));
        var b = el('button', 'chip', x.deleted ? 'Bring back' : 'Put away'); b.type = 'button';
        b.addEventListener('click', async function () {
          b.disabled = true;
          try { await apiJSON('/api/videos/' + x.id + '/' + (x.deleted ? 'restore' : 'delete')); vidList(); } catch (e) { vidStatus(e.message, true); b.disabled = false; }
        });
        box.append(b);
        if (x.ready && x.drive === 'failed') {
          var d = el('button', 'chip', 'Copy to Google Drive again'); d.type = 'button';
          d.addEventListener('click', function () { fetch('/api/videos-drive/' + x.id, { method: 'POST', credentials: 'same-origin' }); d.disabled = true; d.textContent = 'Copying…'; });
          box.append(' ', d);
        }
        li.append(box); ul.append(li);
      });
    } catch (e) { ul.innerHTML = ''; ul.append(el('li', 'muted', 'Could not load the list just now.')); }
  }
  $('#back').addEventListener('click', function () {
    if (state.pieces.length && !confirm('Leave without saving these pictures?')) return;
    var wasDay = !!state.day;
    clearPieces(); state.day = null;
    if (wasDay) openVideo(); else if (kidMode()) show('s-kidhome'); else if (houseMode()) show('s-househome'); else { show('s-kid'); refreshOutbox(); }
  });
  function clearPieces() {
    state.pieces.forEach(function (p) { p.photos.forEach(function (ph) { URL.revokeObjectURL(ph.url); }); });
    state.pieces = []; $('#date').value = state.day ? state.day.date : today();
  }

  // ---------- adding photos ----------
  function newPhoto(f) { return { file: f, url: URL.createObjectURL(f), edit: newEdit(), edited: null, fp: '' }; }
  // ---------- PDFs: a picture of page 1 stands in for the piece; the PDF itself is kept too ----------
  var pdfLoading = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfLoading) pdfLoading = new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = '/upload/vendor/pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/upload/vendor/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { pdfLoading = null; fail(new Error('pdf.js did not load')); };
      document.head.appendChild(s);
    });
    return pdfLoading;
  }
  var isPdf = function (f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''); };
  // Returns a JPEG of page 1. If the PDF cannot be drawn (no signal for the library, a locked file), a plain "PDF" card stands in.
  async function pdfPreview(file) {
    var c = document.createElement('canvas');
    try {
      var lib = await loadPdfJs();
      var doc = await lib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
      var page = await doc.getPage(1), v0 = page.getViewport({ scale: 1 });
      var vp = page.getViewport({ scale: Math.min(4, 1600 / Math.max(v0.width, v0.height)) });
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      doc.destroy && doc.destroy();
    } catch (e) {
      c.width = 800; c.height = 1040;
      var h = c.getContext('2d'); h.fillStyle = '#fff'; h.fillRect(0, 0, 800, 1040);
      h.strokeStyle = '#2b2b2b'; h.lineWidth = 8; h.strokeRect(40, 40, 720, 960);
      h.fillStyle = '#2b2b2b'; h.font = 'bold 220px sans-serif'; h.textAlign = 'center'; h.fillText('PDF', 400, 580);
    }
    return toBlob(c, 'image/jpeg', 0.9);
  }
  async function addPdf(f, toPiece) {
    var prev = await pdfPreview(f), ph = newPhoto(prev);
    ph.file = f; ph.preview = prev; ph.pdf = true;
    if (toPiece) toPiece.photos.push(ph); else state.pieces.push({ caption: '', starred: false, photos: [ph], dupes: [] });
    renderList();
    checkDupes([ph]);
    if (f.size > 5e6) status('That PDF is over 5 MB. The site will show its picture, and the whole PDF goes to Google Drive.');
  }

  function addFiles(list, toPiece) {
    var added = [];
    Array.prototype.forEach.call(list, function (f) {
      if (isPdf(f) && (state.section || 'art') === 'art' && !kidMode()) { addPdf(f, toPiece); return; }
      if (!/^image\//.test(f.type)) return;
      var ph = newPhoto(f);
      if (toPiece) toPiece.photos.push(ph); else state.pieces.push({ caption: '', starred: false, photos: [ph], dupes: [] });
      added.push(ph);
    });
    renderList();
    checkDupes(added);
    if ((state.section || 'art') === 'art') added.reduce(function (p, ph) { return p.then(function () { return autoScan(ph); }); }, Promise.resolve());
  }
  $('#take').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  $('#pick').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });

  // ---------- camera with a steady light (Android Chrome; the phone's own camera can't keep its light on) ----------
  var cam = { stream: null, track: null, light: false, taken: 0 };
  if (/Android/i.test(navigator.userAgent) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) $('#cam-open').hidden = false;
  async function camStart() {
    show('s-cam'); cam.taken = 0; $('#cam-note').textContent = 'Starting the camera…';
    try {
      cam.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } } });
    } catch (e) { $('#cam-note').textContent = 'The camera did not open. Allow the camera for this site, or use Take a photo.'; return; }
    cam.track = cam.stream.getVideoTracks()[0];
    var v = $('#cam-video'); v.srcObject = cam.stream; try { await v.play(); } catch (e) {}
    var caps = cam.track.getCapabilities ? cam.track.getCapabilities() : {};
    $('#cam-light').hidden = !caps.torch;
    if (caps.torch) await setLight(true);
    $('#cam-note').textContent = caps.torch ? 'Hold the phone straight over the drawing, then tap the circle.' : 'This phone does not let the app turn its light on. Use a lamp or a window.';
  }
  async function setLight(on) {
    try { await cam.track.applyConstraints({ advanced: [{ torch: on }] }); cam.light = on; } catch (e) { cam.light = false; }
    $('#cam-light').setAttribute('aria-pressed', String(cam.light));
    $('#cam-light').textContent = cam.light ? '💡 Light on' : '💡 Light off';
  }
  function camStop() {
    if (cam.stream) cam.stream.getTracks().forEach(function (t) { t.stop(); });
    cam.stream = cam.track = null; cam.light = false; $('#cam-video').srcObject = null;
  }
  $('#cam-open').addEventListener('click', camStart);
  $('#cam-light').addEventListener('click', function () { setLight(!cam.light); });
  $('#cam-shoot').addEventListener('click', function () {
    var v = $('#cam-video'); if (!v.videoWidth) return;
    var c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(function (b) {
      if (!b) return;
      cam.taken++;
      addFiles([new File([b], 'camera-' + Date.now() + '.jpg', { type: 'image/jpeg' })]);
      $('#cam-note').textContent = '✓ ' + cam.taken + ' taken. Take another, or tap Done.';
    }, 'image/jpeg', 0.95);
  });
  $('#cam-done').addEventListener('click', function () { camStop(); show('s-photos'); renderList(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && cam.stream) { camStop(); show('s-photos'); renderList(); } });

  // A small picture fingerprint (difference hash, 64 bits): the same photo picked twice gives nearly the same one.
  async function fingerprint(blob) {
    var b = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    var c = document.createElement('canvas'); c.width = 9; c.height = 8;
    var g = c.getContext('2d'); g.drawImage(b, 0, 0, 9, 8); b.close && b.close();
    var d = g.getImageData(0, 0, 9, 8).data, bits = '', hex = '';
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var i = (y * 9 + x) * 4, j = i + 4;
      bits += (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) > (d[j] * .3 + d[j + 1] * .59 + d[j + 2] * .11) ? '1' : '0';
    }
    for (var k = 0; k < 64; k += 4) hex += parseInt(bits.slice(k, k + 4), 2).toString(16);
    return hex;
  }
  function hamming(a, b) { var d = 0; for (var i = 0; i < 16; i++) { var x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; }
  async function checkDupes(photos) {
    for (var i = 0; i < photos.length; i++) { try { photos[i].fp = await fingerprint(photos[i].preview || photos[i].file); } catch (e) { photos[i].fp = ''; } }
    // In this batch
    state.pieces.forEach(function (p) { p.dupes = p.dupes.filter(function (d) { return d.saved; }); });
    var seen = [];
    state.pieces.forEach(function (p, pi) {
      p.photos.forEach(function (ph) {
        if (!ph.fp) return;
        seen.forEach(function (s) { if (s.pi !== pi && hamming(s.fp, ph.fp) <= 6) p.dupes.push({ text: 'Looks the same as picture ' + (s.pi + 1) + ' here.' }); });
        seen.push({ fp: ph.fp, pi: pi });
      });
    });
    // Already on the site
    var fps = photos.map(function (p) { return p.fp; }).filter(Boolean);
    if (fps.length && navigator.onLine) {
      try {
        var r = await fetch('/api/pieces/dupes?fp=' + fps.join(','), { credentials: 'same-origin' });
        var m = (await r.json()).matches || [];
        m.forEach(function (x) {
          state.pieces.forEach(function (p) {
            if (p.photos.some(function (ph) { return ph.fp === x.fp; })) p.dupes.push({ saved: true, text: 'This looks like a picture already saved on ' + niceDate(x.date) + (x.caption ? ' (“' + x.caption + '”)' : '') + (x.deleted ? ', now put away' : '') + '.' });
          });
        });
      } catch (e) { /* no signal: skip the check */ }
    }
    renderList();
  }

  function renderList() {
    if (!state.kid) return;   // shared-in pictures wait until a kid is picked
    var ul = $('#list'); ul.textContent = '';
    state.pieces.forEach(function (p, i) {
      var li = el('li', 'item');
      var pics = el('div', 'item-pics');
      p.photos.forEach(function (ph, j) {
        var b = el('button', 'item-pic'); b.type = 'button'; b.setAttribute('aria-label', 'Fix up photo ' + (j + 1));
        var img = el('img'); img.src = ph.url; img.alt = '';
        var art = (state.section || 'art') === 'art' && !ph.pdf;
        b.append(img, el('span', 'edit-tag', ph.pdf ? '📄 PDF' : ph.working ? '… Fixing' : art ? (ph.edit.orig ? 'Original' : ph.fixed ? '✓ Straightened' : '✎ Fix corners') : ph.edit.rot ? '↻ Turned' : ''));
        if (!art || ph.pdf) b.querySelector('.edit-tag').hidden = !ph.pdf && !ph.edit.rot && !ph.working;
        b.addEventListener('click', function () { if (art && !ph.working) openEditor(ph); });
        pics.append(b);
      });
      // Under each photo: Turn (one tap), and for art Fix corners and Use the original. No looks: the girls' colours stay theirs.
      var quick = el('div', 'quick');
      p.photos.forEach(function (ph, j) {
        if (ph.pdf) return;
        var tools = el('div', 'fix-row');
        if (p.photos.length > 1) tools.append(el('span', 'quick-n', 'Photo ' + (j + 1)));
        var turn = el('button', 'fix-btn wobbly', '↻ Turn'); turn.type = 'button'; turn.disabled = !!ph.working;
        turn.addEventListener('click', function () { turnOne(ph); });
        tools.append(turn);
        if ((state.section || 'art') === 'art') {
          var corners = el('button', 'fix-btn wobbly', '✂ Fix corners'); corners.type = 'button'; corners.disabled = !!ph.working;
          corners.addEventListener('click', function () { openEditor(ph); });
          tools.append(corners);
          if (ph.fixed) {
            var orig = el('button', 'linkish', ph.edit.orig ? 'Use the fix' : 'Use the original'); orig.type = 'button';
            orig.addEventListener('click', function () { toggleOriginal(ph); });
            tools.append(orig);
          }
        }
        quick.append(tools);
      });
      var more = el('label', 'more-photo');
      var inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
      inp.addEventListener('change', function () { addFiles(inp.files, p); inp.value = ''; });
      more.append(inp, el('span', null, '＋ Another photo of this piece'));
      var cap = el('input'); cap.type = 'text'; cap.placeholder = state.day || houseMode() ? 'A few words (optional)' : kidMode() ? 'What is it? (you can skip this)' : 'Caption, in their own words (optional)';
      cap.value = p.caption; cap.maxLength = 140; cap.setAttribute('aria-label', 'Caption for piece ' + (i + 1));
      cap.addEventListener('input', function () { p.caption = cap.value; });
      var star = el('button', 'star', p.starred ? '★ Show big' : '☆ Show big'); star.type = 'button';
      star.setAttribute('aria-pressed', String(p.starred));
      star.addEventListener('click', function () { p.starred = !p.starred; renderList(); });
      var rm = el('button', 'remove', 'Take out'); rm.type = 'button';
      rm.addEventListener('click', function () { p.photos.forEach(function (ph) { URL.revokeObjectURL(ph.url); }); state.pieces.splice(i, 1); renderList(); });
      var row = el('div', 'item-row'); row.append(star, rm);
      var box = el('div', 'item-text'); box.append(cap, row);
      p.dupes.map(function (d) { return d.text; }).filter(function (t, k, a) { return a.indexOf(t) === k; })
        .forEach(function (t) { box.append(el('p', 'dupe', '⚠ ' + t + ' Save anyway, or tap Take out.')); });
      li.append(pics, more, box, quick); ul.append(li);
    });
    var n = state.pieces.length;
    $('#count').textContent = state.day ? (n ? n + ' photo' + (n > 1 ? 's' : '') + '. Tap Save to send ' + (n > 1 ? 'them' : 'it') + '.' : 'All sent. Add more, or go back.')
      : n ? n + ' piece' + (n > 1 ? 's' : '') + '. Tap a photo to fix it up.' : 'No pictures yet';
    $('#save').disabled = !n; $('#share').disabled = !n;
  }

  // ---------- the scan fix for photos of art (Jesse, 2026-11-25: fewer presses, no looks that change the girls' colours) ----------
  // Done by itself when a photo is added as Art: find the paper's four corners, straighten it as if shot from straight above,
  // and even out shadows so the paper is white, without changing any colour the girls chose. Under each photo: Turn (one tap),
  // Fix corners, Use the original. The untouched original is always kept.
  // edit: { quad: [[x, y] x4] (fractions of the photo as taken: top-left, top-right, bottom-right, bottom-left) or null,
  //         light: even out the light, rot: quarter turns after straightening, orig: show the untouched photo }
  function newEdit() { return { quad: null, light: false, rot: 0, orig: false }; }
  // Finds the paper: the colour around the photo's edges is the table or floor; the biggest connected patch that differs is the art.
  // Paper-shaped patch: its four corners. Anything else (clay, a cut-out): a straight box around it. Null when nothing is sure.
  function findPaper(bmp) {
    var S = 360, sc = Math.min(1, S / Math.max(bmp.width, bmp.height));
    var W = Math.max(8, Math.round(bmp.width * sc)), H = Math.max(8, Math.round(bmp.height * sc));
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, W, H);
    var d = g.getImageData(0, 0, W, H).data, n = W * H;
    var ring = Math.max(2, Math.round(Math.min(W, H) * 0.03)), rs = [], gs = [], bs = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (x >= ring && x < W - ring && y >= ring && y < H - ring) continue;
      var i = (y * W + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
    }
    function mid(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    var br = mid(rs.slice()), bg = mid(gs.slice()), bb = mid(bs.slice());
    var spread = []; for (var k = 0; k < rs.length; k++) spread.push(Math.abs(rs[k] - br) + Math.abs(gs[k] - bg) + Math.abs(bs[k] - bb));
    var T = Math.max(45, mid(spread) * 3);   // a busy background (wood grain, carpet) needs a bigger difference
    var on = new Uint8Array(n);
    for (var p = 0; p < n; p++) { var j = p * 4; if (Math.abs(d[j] - br) + Math.abs(d[j + 1] - bg) + Math.abs(d[j + 2] - bb) > T) on[p] = 1; }
    var label = new Int32Array(n), stack = new Int32Array(n), best = null, id = 0;
    for (var s0 = 0; s0 < n; s0++) {
      if (!on[s0] || label[s0]) continue;
      id++; var top = 0, cnt = 0; stack[top++] = s0; label[s0] = id;
      while (top) {
        var q = stack[--top], qx = q % W; cnt++;
        var nb = [qx > 0 ? q - 1 : -1, qx < W - 1 ? q + 1 : -1, q >= W ? q - W : -1, q < n - W ? q + W : -1];
        for (var m = 0; m < 4; m++) { var r2 = nb[m]; if (r2 >= 0 && on[r2] && !label[r2]) { label[r2] = id; stack[top++] = r2; } }
      }
      if (!best || cnt > best.cnt) best = { cnt: cnt, id: id };
    }
    if (!best || best.cnt < n * 0.08) return null;
    // Corners (the patch's furthest points toward each corner), its box, and how light it is.
    var tl = [W, H, 1e9], tr = [0, 0, -1e9], brc = [0, 0, -1e9], bl = [0, 0, -1e9], x0 = W, x1 = 0, y0 = H, y1 = 0, lums = [];
    for (var pp = 0; pp < n; pp++) {
      if (label[pp] !== best.id) continue;
      var px = pp % W, py = (pp / W) | 0;
      if (px + py < tl[2]) tl = [px, py, px + py];
      if (px - py > tr[2]) tr = [px, py, px - py];
      if (px + py > brc[2]) brc = [px, py, px + py];
      if (py - px > bl[2]) bl = [px, py, py - px];
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      if (!(pp % 7)) { var li = pp * 4; lums.push(d[li] * .3 + d[li + 1] * .59 + d[li + 2] * .11); }
    }
    var pts = [tl, tr, brc, bl].map(function (v) { return [(v[0] + .5) / W, (v[1] + .5) / H]; });
    function area(a) { var s = 0; for (var t = 0; t < 4; t++) { var u = a[t], v = a[(t + 1) % 4]; s += u[0] * v[1] - v[0] * u[1]; } return Math.abs(s) / 2; }
    var quadArea = area(pts) * n, paperish = quadArea > 0 && best.cnt / quadArea > 0.88;
    var quad = paperish ? pts : [[x0 / W, y0 / H], [(x1 + 1) / W, y0 / H], [(x1 + 1) / W, (y1 + 1) / H], [x0 / W, (y1 + 1) / H]];
    var frac = area(quad);
    if (frac > 0.95 || frac < 0.1) return null;   // almost the whole photo already, or too small to trust
    return { quad: quad, light: mid(lums) > 150 };
  }
  // The square-to-corners map (Heckbert): (u, v) in 0..1 on the straightened picture -> (x, y) on the photo.
  function squareToQuad(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3, g = 0, h = 0;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) { var det = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / det; h = (dx1 * dy3 - dx3 * dy1) / det; }
    var a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, dd = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    return function (u, v) { var w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (dd * u + e * v + f) / w]; };
  }
  var dist = function (p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  // Straighten: the area inside the four corners becomes a flat rectangle (bilinear, at most 3600 px on the long side).
  function straighten(bmp, quadF) {
    var sc = Math.min(1, 4096 / Math.max(bmp.width, bmp.height)), SW = Math.round(bmp.width * sc), SH = Math.round(bmp.height * sc);
    var sc0 = document.createElement('canvas'); sc0.width = SW; sc0.height = SH;
    var sg = sc0.getContext('2d', { willReadFrequently: true }); sg.drawImage(bmp, 0, 0, SW, SH);
    var src = sg.getImageData(0, 0, SW, SH).data;
    var q = quadF.map(function (p) { return [p[0] * SW, p[1] * SH]; });
    var W = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    var s = Math.min(1, 3600 / Math.max(W, H)); W = Math.max(1, Math.round(W * s)); H = Math.max(1, Math.round(H * s));
    var out = document.createElement('canvas'); out.width = W; out.height = H;
    var og = out.getContext('2d', { willReadFrequently: true }), img = og.createImageData(W, H), o = img.data, map = squareToQuad(q);
    for (var y = 0; y < H; y++) {
      var v = (y + .5) / H;
      for (var x = 0; x < W; x++) {
        var pt = map((x + .5) / W, v), fx = Math.min(SW - 1.001, Math.max(0, pt[0] - .5)), fy = Math.min(SH - 1.001, Math.max(0, pt[1] - .5));
        var ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, i00 = (iy * SW + ix) * 4, i10 = i00 + 4, i01 = i00 + SW * 4, i11 = i01 + 4, k = (y * W + x) * 4;
        for (var ch = 0; ch < 3; ch++) {
          o[k + ch] = (src[i00 + ch] * (1 - ax) + src[i10 + ch] * ax) * (1 - ay) + (src[i01 + ch] * (1 - ax) + src[i11 + ch] * ax) * ay;
        }
        o[k + 3] = 255;
      }
    }
    og.putImageData(img, 0, 0);
    return out;
  }
  // Even out the light: find how bright the bare paper is across the picture (ignoring patches full of colour), then brighten
  // each spot by the same amount for red, green and blue, so shadows lift and the paper turns white but colours keep their hue.
  function evenLight(cv) {
    var W = cv.width, H = cv.height, g = cv.getContext('2d', { willReadFrequently: true }), img = g.getImageData(0, 0, W, H), d = img.data;
    var G = 24, gw = Math.max(2, Math.round(G * W / Math.max(W, H))), gh = Math.max(2, Math.round(G * H / Math.max(W, H)));
    var cells = new Float32Array(gw * gh), all = [];
    for (var cy = 0; cy < gh; cy++) for (var cx = 0; cx < gw; cx++) {
      var xa = Math.floor(cx * W / gw), xb = Math.floor((cx + 1) * W / gw), ya = Math.floor(cy * H / gh), yb = Math.floor((cy + 1) * H / gh), ls = [];
      var st = Math.max(1, Math.floor((xb - xa) / 12));
      for (var y = ya; y < yb; y += st) for (var x = xa; x < xb; x += st) { var i = (y * W + x) * 4; ls.push(d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11); }
      ls.sort(function (a, b) { return a - b; });
      cells[cy * gw + cx] = ls.length ? ls[Math.floor(ls.length * .92)] : 0; all.push(cells[cy * gw + cx]);
    }
    all.sort(function (a, b) { return a - b; });
    var paper = all[Math.floor(all.length * .75)];
    if (paper < 120) return cv;   // dark paper: leave it alone
    for (var t = 0; t < cells.length; t++) if (cells[t] < paper * .65) cells[t] = paper;   // a cell full of paint is not paper
    for (var pass = 0; pass < 2; pass++) {   // smooth
      var nx = new Float32Array(cells.length);
      for (var yy = 0; yy < gh; yy++) for (var xx = 0; xx < gw; xx++) {
        var s = 0, c2 = 0;
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) { var X = xx + ox, Y = yy + oy; if (X >= 0 && Y >= 0 && X < gw && Y < gh) { s += cells[Y * gw + X]; c2++; } }
        nx[yy * gw + xx] = s / c2;
      }
      cells = nx;
    }
    for (var py = 0; py < H; py++) {
      var gy = Math.min(gh - 1.001, Math.max(0, (py + .5) / H * gh - .5)), y0 = gy | 0, fy = gy - y0;
      for (var px = 0; px < W; px++) {
        var gx = Math.min(gw - 1.001, Math.max(0, (px + .5) / W * gw - .5)), x0 = gx | 0, fx = gx - x0;
        var pv = (cells[y0 * gw + x0] * (1 - fx) + cells[y0 * gw + x0 + 1] * fx) * (1 - fy) + (cells[(y0 + 1) * gw + x0] * (1 - fx) + cells[(y0 + 1) * gw + x0 + 1] * fx) * fy;
        var gain = Math.min(1.7, Math.max(1, 250 / Math.max(1, pv))), k = (py * W + px) * 4;
        d[k] = d[k] * gain; d[k + 1] = d[k + 1] * gain; d[k + 2] = d[k + 2] * gain;
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  function turned(cv, rot) {
    if (!rot) return cv;
    var o = document.createElement('canvas'); o.width = rot % 2 ? cv.height : cv.width; o.height = rot % 2 ? cv.width : cv.height;
    var g = o.getContext('2d'); g.translate(o.width / 2, o.height / 2); g.rotate(rot * Math.PI / 2); g.drawImage(cv, -cv.width / 2, -cv.height / 2);
    return o;
  }
  // Make the fixed picture from the untouched photo and its edit. Null edit (or Use the original): no fixed copy.
  async function render(ph) {
    var e = ph.edit, quad = e.orig ? null : e.quad, light = !e.orig && e.light;   // Use the original keeps only the turn
    if (!quad && !light && !e.rot) { ph.edited = null; URL.revokeObjectURL(ph.url); ph.url = URL.createObjectURL(ph.file); return; }
    var bmp = await createImageBitmap(ph.file, { imageOrientation: 'from-image' }), cv;
    if (quad) cv = straighten(bmp, quad);
    else {
      var s = Math.min(1, 4000 / Math.max(bmp.width, bmp.height)); cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    }
    bmp.close && bmp.close();
    if (light) evenLight(cv);
    cv = turned(cv, e.rot);
    var b = await toBlob(cv, 'image/jpeg', 0.92);
    ph.edited = b; URL.revokeObjectURL(ph.url); ph.url = URL.createObjectURL(b);
  }
  async function redo(ph) {
    ph.working = true; renderList();
    try { await render(ph); } catch (err) { ph.edit = newEdit(); ph.edited = null; status('This photo can’t be fixed here, but it can still be saved.', true); }
    ph.working = false; renderList();
  }
  async function autoScan(ph) {
    ph.working = true; renderList();
    try {
      var bmp = await createImageBitmap(ph.file, { imageOrientation: 'from-image' });
      var found = findPaper(bmp); bmp.close && bmp.close();
      if (found && !ph.edit.quad && !ph.edit.rot) { ph.edit.quad = found.quad; ph.edit.light = found.light; ph.fixed = true; await render(ph); }
    } catch (e) { /* stays as taken */ }
    ph.working = false; renderList();
  }
  function turnOne(ph) { ph.edit.rot = (ph.edit.rot + 1) % 4; ph.edit.orig = false; redo(ph); }
  function toggleOriginal(ph) { ph.edit.orig = !ph.edit.orig; redo(ph); }

  // ---------- Fix corners: drag four dots onto the paper's corners ----------
  var ed = { ph: null, bmp: null, quad: null, drag: -1 };
  var cv = $('#ed-canvas'), cx = cv.getContext('2d');
  var FULL = function () { return [[0, 0], [1, 0], [1, 1], [0, 1]]; };
  function edDraw() {
    var b = ed.bmp, s = Math.min(1, (Math.min(window.innerWidth, 640) - 72) / b.width, (window.innerHeight * 0.6) / b.height);
    cv.width = Math.max(1, Math.round(b.width * s)); cv.height = Math.max(1, Math.round(b.height * s));
    cx.drawImage(b, 0, 0, cv.width, cv.height);
    placeDots();
  }
  function placeDots() {
    var r = cv.getBoundingClientRect(), w = $('#ed-wrap').getBoundingClientRect(), pts = [];
    document.querySelectorAll('.ed-dot').forEach(function (dot, i) {
      var x = r.left - w.left + ed.quad[i][0] * r.width, y = r.top - w.top + ed.quad[i][1] * r.height;
      dot.style.left = x + 'px'; dot.style.top = y + 'px'; pts.push(x + ',' + y);
    });
    var svg = $('#ed-lines'); svg.setAttribute('viewBox', '0 0 ' + w.width + ' ' + w.height);
    svg.querySelector('polygon').setAttribute('points', pts.join(' '));
  }
  async function openEditor(ph) {
    ed.ph = ph; ed.quad = (ph.edit.quad || FULL()).map(function (p) { return p.slice(); });
    try { ed.bmp = await createImageBitmap(ph.file, { imageOrientation: 'from-image' }); }
    catch (e) { status('This photo can’t be fixed up here, but it can still be saved.', true); return; }
    show('s-edit'); edDraw();
  }
  document.querySelectorAll('.ed-dot').forEach(function (dot, i) {
    dot.addEventListener('pointerdown', function (e) { ed.drag = i; dot.setPointerCapture(e.pointerId); e.preventDefault(); });
    dot.addEventListener('pointermove', function (e) {
      if (ed.drag !== i) return;
      var r = cv.getBoundingClientRect();
      ed.quad[i] = [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
      placeDots();
    });
    dot.addEventListener('pointerup', function () { ed.drag = -1; });
  });
  $('#ed-reset').addEventListener('click', function () { ed.quad = FULL(); placeDots(); });
  $('#ed-cancel').addEventListener('click', function () { ed.bmp && ed.bmp.close && ed.bmp.close(); show('s-photos'); });
  $('#ed-done').addEventListener('click', function () {
    var ph = ed.ph, full = ed.quad.every(function (p, i) { return dist(p, FULL()[i]) < 0.01; });
    ph.edit.quad = full ? null : ed.quad; ph.edit.orig = false; ph.fixed = !full;
    if (full) ph.edit.light = false;
    ed.bmp && ed.bmp.close && ed.bmp.close(); show('s-photos'); redo(ph);
  });
  window.addEventListener('resize', function () { if (!$('#s-edit').hidden && ed.bmp) edDraw(); });

  // ---------- web copies (made on the phone) ----------
  function toBlob(c, type, q) { return new Promise(function (ok) { c.toBlob(ok, type, q); }); }
  async function webCopies(blob) {
    var b = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    var out = {};
    for (var size of [1600, 640]) {
      var s = Math.min(1, size / Math.max(b.width, b.height)), c = document.createElement('canvas');
      c.width = Math.round(b.width * s); c.height = Math.round(b.height * s);
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(b, 0, 0, c.width, c.height);
      var w = await toBlob(c, 'image/webp', 0.84);
      if (!w || w.type !== 'image/webp') w = await toBlob(c, 'image/jpeg', 0.86);   // iPhone Safari cannot make WebP
      if (size === 1600) { out.web = w; out.w = c.width; out.h = c.height; } else out.thumb = w;
    }
    b.close && b.close();
    return out;
  }

  // Family Moments: a print-size copy (3000px JPEG) for "Download all" and photo books.
  async function printCopy(blob) {
    var b = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    var s = Math.min(1, 3000 / Math.max(b.width, b.height)), c = document.createElement('canvas');
    c.width = Math.round(b.width * s); c.height = Math.round(b.height * s);
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(b, 0, 0, c.width, c.height);
    b.close && b.close();
    var out = await toBlob(c, 'image/jpeg', 0.88);
    if (out && out.size > 5.4e6) out = await toBlob(c, 'image/jpeg', 0.75);
    return out && out.size <= 5.4e6 ? out : null;
  }
  // ---------- Save: keep on the phone, then send ----------
  $('#save').addEventListener('click', async function () {
    var btn = this; btn.disabled = true;
    try {
      var date = $('#date').value || today(), n = state.pieces.length;
      for (var i = 0; i < n; i++) {
        var p = state.pieces[i], photos = [];
        status('Getting piece ' + (i + 1) + ' of ' + n + ' ready…');
        for (var j = 0; j < p.photos.length; j++) {
          var ph = p.photos[j], wc = await webCopies(ph.pdf ? ph.preview : (ph.edited || ph.file));
          var edits = []; if (!ph.edit.orig) { if (ph.edit.quad) edits.push('straighten'); if (ph.edit.light) edits.push('light'); } if (ph.edit.rot) edits.push('turn');
          var print = state.section === 'moments' && !ph.pdf ? await printCopy(ph.edited || ph.file).catch(function () { return null; }) : null;
          photos.push({ print: print, pdf: !!ph.pdf, original: ph.file, originalType: ph.pdf ? 'application/pdf' : (ph.file.type || 'image/jpeg'), edited: ph.edited, web: wc.web, thumb: wc.thumb, w: wc.w, h: wc.h, fp: ph.fp, edits: edits });
        }
        await put('outbox2', { id: Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 8), kid: state.kid, date: date, section: state.section || 'art', event: state.day,
          caption: p.caption.trim(), starred: p.starred, photos: photos, progress: {}, created: new Date().toISOString() });
      }
      clearPieces(); renderList();
      status('Saved ' + n + (kidMode() || state.day ? ' photo' : ' piece') + (n > 1 ? 's' : '') + ' on this ' + (kidMode() ? 'tablet' : 'phone') + '.' + (navigator.onLine ? ' Sending…' : ' They will go up next time there is signal.'));
      sendOutbox();
    } catch (e) { status('Could not save on this phone: ' + e.message, true); }
    btn.disabled = !state.pieces.length;
  });

  async function apiJSON(url, body) {
    var r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401) throw new Error(kidMode() ? 'Ask a grown-up to log in again.' : 'Please log in to the site again (the family password).');
    if (!r.ok) throw new Error(whyNot(j, r.status));
    return j;
  }
  // The same plain words for every step that talks to the site, so a Drive sign-in that ran out says so.
  function whyNot(j, code) {
    return j.error === 'not-connected' ? 'Google Drive is not connected yet (a parent can do it on the For parents page).'
      : j.error === 'reconnect' ? 'Google Drive needs connecting again (For parents page).'
      : 'The site said no (' + (j.message || j.error || code) + ').';
  }
  async function notTaken(r, what) {
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (j.error === 'not-connected' || j.error === 'reconnect') return new Error(whyNot(j, r.status));
    return new Error('The site did not take the ' + what + ' (' + r.status + ').');
  }
  // Send one file to Google through its one-time address, in pieces, retrying on a weak signal. Returns the Drive file id.
  async function sendToGoogle(url, blob, onPart) {
    var size = blob.size, CH = 256 * 1024 * 32, start = 0;
    for (;;) {
      var end = Math.min(start + CH, size), tries = 0, res;
      for (;;) {
        try {
          res = await fetch(url, { method: 'PUT', headers: { 'Content-Range': size ? 'bytes ' + start + '-' + (end - 1) + '/' + size : 'bytes */0' }, body: blob.slice(start, end) });
          if (res.ok || res.status === 308) break;
          if (res.status === 404 || res.status === 410) { var gone = new Error('expired'); gone.expired = true; throw gone; }
        } catch (e) { if (e.expired) throw e; }
        if (++tries > 4) throw new Error('The connection dropped. Nothing was lost; it will try again.');
        await new Promise(function (ok) { setTimeout(ok, 1500 * tries); });
      }
      if (res.ok) { var j = await res.json(); if (onPart) onPart(1); return j.id; }
      var got = res.headers.get('Range');
      start = got ? +got.split('-')[1] + 1 : end;
      if (onPart) onPart(start / size);
    }
  }

  var sending = false, outboxErr = '';
  async function sendOne(q, label) {
    var pr = q.progress;
    if (!pr.start) {
      pr.start = await apiJSON('/api/pieces/start', { clientId: q.id, kid: q.kid, date: q.date, section: q.section || 'art', event: q.event || null, caption: q.caption, starred: q.starred,
        photos: q.photos.map(function (ph) { return { originalType: ph.originalType, originalSize: ph.original.size, edited: !!ph.edited, editedSize: ph.edited ? ph.edited.size : 0 }; }) });
      await put('outbox2', q);
    }
    pr.files = pr.files || {};
    for (var k = 0; k < pr.start.uploads.length; k++) {
      var u = pr.start.uploads[k], key = u.n + '-' + u.kind;
      if (pr.files[key]) continue;
      var ph = q.photos[u.n - 1], blob = u.kind === 'edited' ? ph.edited : ph.original;
      try {
        pr.files[key] = await sendToGoogle(u.url, blob, function (f) { status(label + ' (' + Math.round(f * 100) + '%)'); });
      } catch (e) {
        if (!e.expired) throw e;
        pr.start = await apiJSON('/api/pieces/start', { clientId: q.id, renew: true });
        await put('outbox2', q); k = -1; continue;
      }
      await put('outbox2', q);
    }
    pr.sent = pr.sent || {};
    for (var n = 1; n <= q.photos.length; n++) {
      if (pr.sent[n]) continue;
      var p = q.photos[n - 1], f = new FormData();
      f.set('meta', JSON.stringify({ w: p.w, h: p.h, fp: p.fp, edits: p.edits, original: pr.files[n + '-original'], edited: pr.files[n + '-edited'] || null }));
      f.set('web', p.web, 'web'); f.set('thumb', p.thumb, 'thumb');
      var r = await fetch('/api/pieces/' + pr.start.id + '/photo/' + n, { method: 'POST', credentials: 'same-origin', body: f });
      if (!r.ok) throw await notTaken(r, 'picture');
      pr.sent[n] = true; await put('outbox2', q);
    }
    pr.printSent = pr.printSent || {};
    for (var pn = 1; pn <= q.photos.length; pn++) {
      var pq = q.photos[pn - 1];
      if (!pq.print || pr.printSent[pn]) continue;
      try {   // one more try later on a dropped signal; if the site will not take it, the web copy stands in
        var prf = new FormData(); prf.set('print', pq.print, 'print.jpg');
        var prr = await fetch('/api/pieces/' + pr.start.id + '/print/' + pn, { method: 'POST', credentials: 'same-origin', body: prf });
        if (prr.status >= 500) throw new Error('server');
      } catch (e) {
        if (!pr.printTried) { pr.printTried = true; await put('outbox2', q); throw new Error('The connection dropped. Nothing was lost; it will try again.'); }
      }
      pr.printSent[pn] = true; await put('outbox2', q);
    }
    pr.pdfSent = pr.pdfSent || {};
    for (var m = 1; m <= q.photos.length; m++) {
      var pp = q.photos[m - 1];
      if (!pp.pdf || pr.pdfSent[m] || pp.original.size > 5e6) continue;   // bigger than 5 MB: Drive only
      var pf = new FormData(); pf.set('pdf', pp.original, 'piece.pdf');
      var pres = await fetch('/api/pieces/' + pr.start.id + '/pdf/' + m, { method: 'POST', credentials: 'same-origin', body: pf });
      if (!pres.ok) throw await notTaken(pres, 'PDF');
      pr.pdfSent[m] = true; await put('outbox2', q);
    }
    await apiJSON('/api/pieces/' + pr.start.id + '/finish');
    await del('outbox2', q.id);
  }
  async function sendOutbox() {
    if (sending) return;
    var list = await all('outbox2');
    if (!list.length || !navigator.onLine) { refreshOutbox(); return; }
    sending = true; var done = 0;
    try {
      for (var i = 0; i < list.length; i++) {
        var label = 'Sending piece ' + (i + 1) + ' of ' + list.length;
        status(label + '…');
        await sendOne(list[i], label); done++;
      }
      status(kidMode() ? 'Sent! A grown-up will look, then ' + (done === 1 ? 'it shows' : 'they show') + (state.section === 'art' ? ' on your page.' : ' in your snapshots.')
        : 'All sent! ' + (done === 1 ? 'It is' : 'They are') + (state.day ? ' on the Family Moments page now.' : ' on the site now.'));
      outboxErr = '';
    } catch (e) {
      outboxErr = e.message;
      status((done ? done + ' sent. ' : '') + e.message + ' The rest are still saved on this phone.', true);
    }
    sending = false; refreshOutbox();
  }
  async function refreshOutbox() {
    var waiting = (await all('outbox2')).length + (await all('outbox')).length, bar = $('#outbox');
    bar.hidden = !waiting;
    // Say why it did not go, here on the first screen too (the status line lives on the photos screen).
    $('#outbox-text').textContent = waiting + ' piece' + (waiting > 1 ? 's' : '') + ' saved on this phone, waiting to go up.'
      + (waiting && outboxErr ? ' It did not go: ' + outboxErr : '');
    return waiting;
  }
  $('#outbox-send').addEventListener('click', function () { $('#outbox-text').textContent = 'Sending…'; sendOutbox(); });
  window.addEventListener('online', sendOutbox);

  // Backup: hand the photos to the Google Drive app through the phone's Share button.
  $('#share').addEventListener('click', async function () {
    var files = [], date = $('#date').value || today();
    state.pieces.forEach(function (p, i) {
      p.photos.forEach(function (ph, j) {
        var name = date + '_' + state.kid + '_' + (i + 1) + '-' + (j + 1);
        files.push(new File([ph.file], name + '-original.jpg', { type: ph.file.type || 'image/jpeg' }));
        if (ph.edited) files.push(new File([ph.edited], name + '.jpg', { type: 'image/jpeg' }));
      });
      files.push(new File([JSON.stringify({ kid: state.kid, date: date, caption: p.caption, starred: p.starred }, null, 2)], date + '_' + state.kid + '_' + (i + 1) + '.json', { type: 'application/json' }));
    });
    if (!navigator.canShare || !navigator.canShare({ files: files })) { status('This phone can’t share files from here. Use Save instead.', true); return; }
    status('Pick Drive, choose the “' + cfg.folderName + '” folder, then tap Save. Then tell Claude “new art is in”.');
    try { await navigator.share({ files: files, title: cfg.folderName }); } catch (e) { /* closed */ }
  });

  // ---------- recent uploads: change caption or date, star, put away, bring back ----------
  async function openRecent() {
    show('s-recent');
    var list = $('#recent-list'), gone = $('#deleted-list');
    list.textContent = 'Loading…'; gone.textContent = '';
    var j;
    try { j = await (await fetch('/api/pieces/recent', { credentials: 'same-origin' })).json(); }
    catch (e) { list.textContent = 'Needs signal to show recent uploads.'; return; }
    list.textContent = '';
    if (!j.recent || !j.recent.length) list.append(el('li', 'muted', 'Nothing uploaded yet.'));
    (j.recent || []).forEach(function (p) { list.append(recentRow(p, false)); });
    $('#deleted-h').hidden = $('#deleted-help').hidden = !(j.deleted && j.deleted.length);
    (j.deleted || []).forEach(function (p) { gone.append(recentRow(p, true, j.keepDays)); });
  }
  function recentRow(p, deleted, keepDays) {
    var li = el('li', 'item recent');
    var img = el('img', 'recent-pic'); img.src = '/img/' + p.id + '/1/sm'; img.alt = ''; img.loading = 'lazy';
    var who = el('p', 'recent-who', (p.eventTitle ? '❤️ ' + p.eventTitle : p.kid === 'both' ? 'Made together' : cfg.kids[p.kid].name) + (p.photos.length > 1 ? ' · ' + p.photos.length + ' photos' : ''));
    var box = el('div', 'item-text'); box.append(who);
    if (deleted) {
      var until = new Date(Date.parse(p.deleted) + keepDays * 86400000).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
      box.append(el('p', 'muted', (p.caption ? '“' + p.caption + '” · ' : '') + niceDate(p.date) + ' · kept until ' + until));
      var back = el('button', 'chip', 'Bring back'); back.type = 'button';
      back.addEventListener('click', async function () { back.disabled = true; try { await apiJSON('/api/pieces/' + p.id + '/restore'); openRecent(); } catch (e) { status(e.message, true); back.disabled = false; } });
      box.append(back); li.append(img, box); return li;
    }
    var cap = el('input'); cap.type = 'text'; cap.value = p.caption; cap.maxLength = 140; cap.placeholder = 'Caption (optional)'; cap.setAttribute('aria-label', 'Caption');
    var date = el('input'); date.type = 'date'; date.value = p.date; date.setAttribute('aria-label', 'Date it was made');
    var star = el('button', 'star', p.starred ? '★ Show big' : '☆ Show big'); star.type = 'button'; star.setAttribute('aria-pressed', String(p.starred));
    var rm = el('button', 'remove', 'Put away'); rm.type = 'button';
    var saved = el('span', 'saved-note');
    async function change(body) { try { var r = await apiJSON('/api/pieces/' + p.id + '/edit', body); Object.assign(p, r.piece); saved.textContent = '✓ Saved'; setTimeout(function () { saved.textContent = ''; }, 1500); } catch (e) { status(e.message, true); } }
    cap.addEventListener('change', function () { change({ caption: cap.value }); });
    date.addEventListener('change', function () { if (date.value) change({ date: date.value }); });
    star.addEventListener('click', async function () { await change({ starred: !p.starred }); star.textContent = p.starred ? '★ Show big' : '☆ Show big'; star.setAttribute('aria-pressed', String(p.starred)); });
    rm.addEventListener('click', async function () { rm.disabled = true; try { await apiJSON('/api/pieces/' + p.id + '/delete'); openRecent(); } catch (e) { status(e.message, true); rm.disabled = false; } });
    var row = el('div', 'item-row'); row.append(star, rm, saved);
    box.append(cap, date, row); li.append(img, box);
    return li;
  }
  $('#recent').addEventListener('click', openRecent);
  $('#recent-back').addEventListener('click', function () { show('s-kid'); });

  // ---------- pictures shared in from Google Photos (the service worker keeps them) ----------
  async function takeShared() {
    var got = await all('shared');
    if (!got.length) return;
    got.forEach(function (s) { addFiles([s.file]); });
    await Promise.all(got.map(function (s) { return del('shared', s.id); }));
    state.section = 'art';
    $('#who-lead').textContent = got.length + ' picture' + (got.length > 1 ? 's' : '') + ' shared in. Whose art is it?';
    show('s-who');
  }

  // Pictures the first version of the app kept on the phone: move them into the new outbox so nothing is lost.
  async function moveOldOutbox() {
    var old = await all('outbox');
    for (var i = 0; i < old.length; i++) {
      var q = old[i], m = q.meta || {};
      try {
        var wc = await webCopies(q.edited || q.original), fp = '';
        try { fp = await fingerprint(q.original); } catch (e) {}
        await put('outbox2', { id: 'old-' + q.id, kid: m.kid || 'leora', date: m.date || today(), caption: m.caption || '', starred: !!m.featured,
          photos: [{ original: q.original, originalType: q.originalType || 'image/jpeg', edited: q.edited || null, web: wc.web, thumb: wc.thumb, w: wc.w, h: wc.h, fp: fp, edits: m.edited ? ['edited'] : [] }],
          progress: {}, created: new Date().toISOString() });
        await del('outbox', q.id);
      } catch (e) { /* leave it where it is; it is still on the phone */ }
    }
  }

  // ---------- the girls' pictures waiting for a parent's OK: on the first screen, one tap for all ----------
  var waitingList = [];
  async function showWaitingBar() {
    var bar = $('#waiting-bar');
    try {
      var r = await fetch('/api/pieces/waiting', { credentials: 'same-origin' });
      waitingList = r.ok ? ((await r.json()).waiting || []) : [];
    } catch (e) { waitingList = []; }
    bar.hidden = !waitingList.length;
    if (waitingList.length) $('#waiting-text').textContent = waitingList.length + ' picture' + (waitingList.length > 1 ? 's' : '') + ' from the girls ' + (waitingList.length > 1 ? 'are' : 'is') + ' waiting for your OK.';
  }
  $('#waiting-ok').addEventListener('click', async function () {
    var btn = this; btn.disabled = true;
    for (var i = 0; i < waitingList.length; i++) {
      $('#waiting-text').textContent = 'Showing ' + (i + 1) + ' of ' + waitingList.length + '…';
      try { await apiJSON('/api/pieces/' + encodeURIComponent(waitingList[i].id) + '/ok'); } catch (e) { $('#waiting-text').textContent = e.message; btn.disabled = false; return; }
    }
    $('#waiting-text').textContent = '✓ All on the site now.'; btn.disabled = false;
    setTimeout(showWaitingBar, 1500);
  });

  // ---------- start ----------
  show('s-kid');
  startKidMode().then(function (kid) { if (!kid) showWaitingBar(); jumpTo(); });
  // The ＋ on a site page (Jesse, 2026-11-25) opens the app straight on that page's screen: ?add=art&kid=leora, day, episode, house.
  function jumpTo() {
    var q = new URLSearchParams(location.search), add = q.get('add'), k = q.get('kid');
    if (!add || kidMode()) return;
    try { history.replaceState(null, '', '/upload/' + (q.get('welcome') ? '?welcome=1' : '')); } catch (e) {}
    if (houseMode()) { var hb = document.querySelector('[data-housewhat="' + (add === 'day' ? 'day' : 'house') + '"]'); if (hb) hb.click(); return; }
    if (add === 'day') openVideo();
    else if (add === 'episode') openEpisode();
    else if (add === 'art' && cfg.kids[k]) { state.section = 'art'; setKid(k); }
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/upload/sw.js', { scope: '/upload/' }).catch(function () {});
  takeShared().then(moveOldOutbox).then(refreshOutbox).then(sendOutbox);
})();
