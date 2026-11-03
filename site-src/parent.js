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

  async function openTools() {
    $('#pin-box').hidden = true; $('#parent-tools').hidden = false;
    var g = await (await fetch('/api/google/status', { credentials: 'same-origin' })).json();
    if (g.error) { $('#pin-box').hidden = false; $('#parent-tools').hidden = true; return; }
    if (g.connected) {
      $('#g-status').textContent = 'Connected' + (g.email ? ' to ' + g.email : '') + '.' +
        (g.limit ? ' Drive space: ' + size(g.used) + ' of ' + size(g.limit) + ' used.' : '') + (g.problem ? ' Problem: ' + g.problem : '');
      $('#g-connect').textContent = 'Connect again';
    } else $('#g-status').textContent = 'Not connected yet. Uploads need this once.';
    if (q.get('connected')) $('#g-status').textContent = 'Connected! ' + $('#g-status').textContent;
    showRebuild();
  }
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
