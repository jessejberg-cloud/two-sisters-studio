// Two Sisters Studio "Add art" app.
// Pick who made it (Leora, Amaya or Both), take or pick photos, fix them up (turn, crop, Auto, Paper white, Vivid,
// Glow), caption, star, Save. Save keeps everything on the phone first (IndexedDB "outbox"), then sends it to the
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
  var state = { kid: null, pieces: [] };   // pieces: [{ caption, starred, photos: [photo], dupes: [] }]
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
    state.kid = k;
    $('#who').textContent = k === 'both' ? 'Made together' : cfg.kids[k].name + '’s art';
    document.body.className = 'up c-' + (k === 'both' ? 'yellow' : cfg.kids[k].color);
    if (!$('#date').value) $('#date').value = today();
    status(''); renderList(); show('s-photos');
  }
  document.querySelectorAll('[data-kid]').forEach(function (b) { b.addEventListener('click', function () { setKid(b.dataset.kid); }); });
  $('#back').addEventListener('click', function () {
    if (state.pieces.length && !confirm('Leave without saving these pictures?')) return;
    clearPieces(); show('s-kid'); refreshOutbox();
  });
  function clearPieces() {
    state.pieces.forEach(function (p) { p.photos.forEach(function (ph) { URL.revokeObjectURL(ph.url); }); });
    state.pieces = []; $('#date').value = today();
  }

  // ---------- adding photos ----------
  function newPhoto(f) { return { file: f, url: URL.createObjectURL(f), edit: { rot: 0, crop: null, look: '' }, edited: null, fp: '' }; }
  function addFiles(list, toPiece) {
    var added = [];
    Array.prototype.forEach.call(list, function (f) {
      if (!/^image\//.test(f.type)) return;
      var ph = newPhoto(f);
      if (toPiece) toPiece.photos.push(ph); else state.pieces.push({ caption: '', starred: false, photos: [ph], dupes: [] });
      added.push(ph);
    });
    renderList();
    checkDupes(added);
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
    for (var i = 0; i < photos.length; i++) { try { photos[i].fp = await fingerprint(photos[i].file); } catch (e) { photos[i].fp = ''; } }
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
        b.append(img, el('span', 'edit-tag', ph.edited ? '✎ Edited' : '✎ Fix up'));
        b.addEventListener('click', function () { openEditor(ph); });
        pics.append(b);
      });
      // Quick looks, one tap each, right under the photos (Turn and Crop are in Fix up).
      var quick = el('div', 'quick');
      p.photos.forEach(function (ph, j) {
        var row = el('div', 'quick-row');
        if (p.photos.length > 1) row.append(el('span', 'quick-n', 'Photo ' + (j + 1)));
        [['', 'Original'], ['auto', 'Auto'], ['paper', 'Paper white'], ['vivid', 'Vivid'], ['glow', '✨ Glow']].forEach(function (o) {
          var c = el('button', 'chip chip-sm', o[1]); c.type = 'button';
          c.setAttribute('aria-pressed', String((ph.edit.look || '') === o[0]));
          c.addEventListener('click', function () { quickLook(ph, o[0], c); });
          row.append(c);
        });
        var fix = el('button', 'linkish', 'Turn or crop'); fix.type = 'button';
        fix.addEventListener('click', function () { openEditor(ph); });
        row.append(fix); quick.append(row);
      });
      var more = el('label', 'more-photo');
      var inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
      inp.addEventListener('change', function () { addFiles(inp.files, p); inp.value = ''; });
      more.append(inp, el('span', null, '＋ Another photo of this piece'));
      var cap = el('input'); cap.type = 'text'; cap.placeholder = 'Caption, in their own words (optional)';
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
    $('#count').textContent = n ? n + ' piece' + (n > 1 ? 's' : '') + '. Tap a photo to fix it up.' : 'No pictures yet';
    $('#save').disabled = !n; $('#share').disabled = !n;
  }

  async function quickLook(ph, look, btn) {
    if (btn) btn.textContent = '…';
    var e = { rot: ph.edit.rot, crop: ph.edit.crop, look: look };
    try {
      if (!e.rot && !e.crop && !look) { ph.edit = e; ph.edited = null; URL.revokeObjectURL(ph.url); ph.url = URL.createObjectURL(ph.file); renderList(); return; }
      var bmp = await createImageBitmap(ph.file, { imageOrientation: 'from-image' });
      var R = rotatedSize(bmp, e.rot), c = e.crop || { w: 1, h: 1 };
      var big = document.createElement('canvas');
      paint(big.getContext('2d', { willReadFrequently: true }), bmp, e.rot, e.crop, look, Math.min(1, 4000 / Math.max(R.w * c.w, R.h * c.h)));
      bmp.close && bmp.close();
      var b = await new Promise(function (ok) { big.toBlob(ok, 'image/jpeg', 0.92); });
      ph.edit = e; ph.edited = b; URL.revokeObjectURL(ph.url); ph.url = URL.createObjectURL(b);
    } catch (err) { status('This photo can’t be changed here, but it can still be saved.', true); }
    renderList();
  }

  // ---------- editor: turn, crop, and one look (Auto, Paper white, Vivid, Glow) ----------
  var ed = { ph: null, bmp: null, rot: 0, crop: null, look: '', cropping: false };
  var cv = $('#ed-canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  function rotatedSize(b, rot) { return rot % 2 ? { w: b.height, h: b.width } : { w: b.width, h: b.height }; }
  // Pixel math (works on every phone, including iPhone Safari, which has no canvas filters).
  function applyLook(ctx, W, H, look) {
    if (!look) return;
    var img = ctx.getImageData(0, 0, W, H), d = img.data, n = d.length;
    var step = Math.max(4, Math.floor(n / 4 / 40000) * 4), hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256), hl = new Uint32Array(256), cnt = 0;
    for (var i = 0; i < n; i += step) { hr[d[i]]++; hg[d[i + 1]]++; hb[d[i + 2]]++; hl[(d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8]++; cnt++; }
    function pct(h, p) { var t = cnt * p, s = 0; for (var v = 0; v < 256; v++) { s += h[v]; if (s >= t) return v; } return 255; }
    var lo = [pct(hr, .005), pct(hg, .005), pct(hb, .005)], hi = [pct(hr, .995), pct(hg, .995), pct(hb, .995)];
    var sat = 1, con = 1, white = 255;
    if (look === 'paper') { var paper = pct(hl, .85); hi = [paper, paper, paper].map(function (v) { return Math.max(140, v - 6); }); lo = [Math.min(lo[0], 40), Math.min(lo[1], 40), Math.min(lo[2], 40)]; con = 1.08; sat = 1.1; }
    if (look === 'vivid') { sat = 1.45; con = 1.12; }
    if (look === 'glow') { sat = 1.3; con = 1.06; white = 262; }
    var lut = [0, 1, 2].map(function (c) {
      var t = new Uint8ClampedArray(256), span = Math.max(24, hi[c] - lo[c]);
      for (var v = 0; v < 256; v++) { var x = (v - lo[c]) / span * white; t[v] = (x - 128) * con + 128; }
      return t;
    });
    for (var k = 0; k < n; k += 4) {
      var r = lut[0][d[k]], g = lut[1][d[k + 1]], b = lut[2][d[k + 2]], l = r * .3 + g * .59 + b * .11;
      if (look === 'paper' && l > 222) { r = g = b = 255; }
      else if (sat !== 1) { r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
      d[k] = r; d[k + 1] = g; d[k + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    if (look === 'glow' && 'filter' in ctx) {   // soft halo where the phone supports it
      var c2 = document.createElement('canvas'); c2.width = W; c2.height = H; c2.getContext('2d').drawImage(ctx.canvas, 0, 0);
      ctx.save(); ctx.filter = 'blur(' + Math.max(4, Math.round(Math.max(W, H) / 90)) + 'px)'; ctx.globalAlpha = .35; ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(c2, 0, 0); ctx.restore();
    }
  }
  function paint(ctx, bmp, rot, crop, look, scale) {
    var R = rotatedSize(bmp, rot), c = crop || { x: 0, y: 0, w: 1, h: 1 };
    var W = Math.max(1, Math.round(R.w * c.w * scale)), H = Math.max(1, Math.round(R.h * c.h * scale));
    ctx.canvas.width = W; ctx.canvas.height = H;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-c.x * R.w * scale, -c.y * R.h * scale); ctx.scale(scale, scale);
    ctx.translate(R.w / 2, R.h / 2); ctx.rotate(rot * Math.PI / 2); ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    ctx.restore();
    applyLook(ctx, W, H, look);
  }
  function edScale() { var R = rotatedSize(ed.bmp, ed.rot), c = ed.cropping ? { w: 1, h: 1 } : (ed.crop || { w: 1, h: 1 }); return Math.min(1, (Math.min(window.innerWidth, 640) - 32) / (R.w * c.w), (window.innerHeight * 0.55) / (R.h * c.h)); }
  function edDraw() {
    paint(cx, ed.bmp, ed.rot, ed.cropping ? null : ed.crop, ed.cropping ? '' : ed.look, edScale());
    $('#ed-box').hidden = !ed.cropping;
    if (ed.cropping) placeBox();
    document.querySelectorAll('[data-look]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.look === ed.look)); });
    $('#ed-crop').textContent = ed.cropping ? '✓ Done cropping' : '✂ Crop';
  }
  async function openEditor(ph) {
    ed.ph = ph; ed.rot = ph.edit.rot; ed.crop = ph.edit.crop; ed.look = ph.edit.look; ed.cropping = false;
    try { ed.bmp = await createImageBitmap(ph.file, { imageOrientation: 'from-image' }); }
    catch (e) { status('This photo can’t be fixed up here, but it can still be saved.', true); return; }
    show('s-edit'); edDraw();
  }
  $('#ed-turn').addEventListener('click', function () { ed.rot = (ed.rot + 1) % 4; ed.crop = null; ed.cropping = false; edDraw(); });
  document.querySelectorAll('[data-look]').forEach(function (b) {
    b.addEventListener('click', function () { ed.look = ed.look === b.dataset.look ? '' : b.dataset.look; edDraw(); });
  });
  $('#ed-crop').addEventListener('click', function () {
    if (!ed.cropping) { ed.box = ed.crop ? Object.assign({}, ed.crop) : { x: .05, y: .05, w: .9, h: .9 }; ed.cropping = true; }
    else { ed.crop = ed.box; ed.cropping = false; }
    edDraw();
  });
  $('#ed-reset').addEventListener('click', function () { ed.rot = 0; ed.crop = null; ed.look = ''; ed.cropping = false; edDraw(); });
  $('#ed-cancel').addEventListener('click', function () { ed.bmp && ed.bmp.close && ed.bmp.close(); show('s-photos'); });
  $('#ed-done').addEventListener('click', function () {
    if (ed.cropping) { ed.crop = ed.box; ed.cropping = false; }
    var ph = ed.ph, changed = ed.rot || ed.crop || ed.look;
    ph.edit = { rot: ed.rot, crop: ed.crop, look: ed.look };
    if (!changed) { ph.edited = null; URL.revokeObjectURL(ph.url); ph.url = URL.createObjectURL(ph.file); show('s-photos'); renderList(); return; }
    var R = rotatedSize(ed.bmp, ed.rot), c = ed.crop || { w: 1, h: 1 };
    var scale = Math.min(1, 4000 / Math.max(R.w * c.w, R.h * c.h));
    var big = document.createElement('canvas'); paint(big.getContext('2d', { willReadFrequently: true }), ed.bmp, ed.rot, ed.crop, ed.look, scale);
    big.toBlob(function (b) {
      ph.edited = b; URL.revokeObjectURL(ph.url); ph.url = URL.createObjectURL(b);
      ed.bmp.close && ed.bmp.close(); show('s-photos'); renderList();
    }, 'image/jpeg', 0.92);
  });
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

  // ---------- Save: keep on the phone, then send ----------
  $('#save').addEventListener('click', async function () {
    var btn = this; btn.disabled = true;
    try {
      var date = $('#date').value || today(), n = state.pieces.length;
      for (var i = 0; i < n; i++) {
        var p = state.pieces[i], photos = [];
        status('Getting piece ' + (i + 1) + ' of ' + n + ' ready…');
        for (var j = 0; j < p.photos.length; j++) {
          var ph = p.photos[j], wc = await webCopies(ph.edited || ph.file);
          var edits = []; if (ph.edit.rot) edits.push('turn'); if (ph.edit.crop) edits.push('crop'); if (ph.edit.look) edits.push(ph.edit.look);
          photos.push({ original: ph.file, originalType: ph.file.type || 'image/jpeg', edited: ph.edited, web: wc.web, thumb: wc.thumb, w: wc.w, h: wc.h, fp: ph.fp, edits: edits });
        }
        await put('outbox2', { id: Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 8), kid: state.kid, date: date,
          caption: p.caption.trim(), starred: p.starred, photos: photos, progress: {}, created: new Date().toISOString() });
      }
      clearPieces(); renderList();
      status('Saved ' + n + ' piece' + (n > 1 ? 's' : '') + ' on this phone.' + (navigator.onLine ? ' Sending…' : ' They will go up next time there is signal.'));
      sendOutbox();
    } catch (e) { status('Could not save on this phone: ' + e.message, true); }
    btn.disabled = !state.pieces.length;
  });

  async function apiJSON(url, body) {
    var r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401) throw new Error('Please log in to the site again (the family password).');
    if (!r.ok) throw new Error(j.error === 'not-connected' ? 'Google Drive is not connected yet (a parent can do it on the For parents page).' : j.error === 'reconnect' ? 'Google Drive needs connecting again (For parents page).' : 'The site said no (' + (j.message || j.error || r.status) + ').');
    return j;
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

  var sending = false;
  async function sendOne(q, label) {
    var pr = q.progress;
    if (!pr.start) {
      pr.start = await apiJSON('/api/pieces/start', { clientId: q.id, kid: q.kid, date: q.date, caption: q.caption, starred: q.starred,
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
      if (!r.ok) throw new Error('The site did not take the picture (' + r.status + ').');
      pr.sent[n] = true; await put('outbox2', q);
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
      status('All sent! ' + (done === 1 ? 'It is' : 'They are') + ' in the gallery now.');
    } catch (e) {
      status((done ? done + ' sent. ' : '') + e.message + ' The rest are still saved on this phone.', true);
    }
    sending = false; refreshOutbox();
  }
  async function refreshOutbox() {
    var waiting = (await all('outbox2')).length + (await all('outbox')).length, bar = $('#outbox');
    bar.hidden = !waiting;
    $('#outbox-text').textContent = waiting + ' piece' + (waiting > 1 ? 's' : '') + ' saved on this phone, waiting to go up.';
    return waiting;
  }
  $('#outbox-send').addEventListener('click', sendOutbox);
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
    var who = el('p', 'recent-who', (p.kid === 'both' ? 'Made together' : cfg.kids[p.kid].name) + (p.photos.length > 1 ? ' · ' + p.photos.length + ' photos' : ''));
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
    $('#kid-lead').textContent = got.length + ' picture' + (got.length > 1 ? 's' : '') + ' shared in. Who made it?';
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

  // ---------- start ----------
  show('s-kid');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/upload/sw.js', { scope: '/upload/' }).catch(function () {});
  takeShared().then(moveOldOutbox).then(refreshOutbox).then(sendOutbox);
})();
