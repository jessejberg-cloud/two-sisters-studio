// Google Drive, from the server. A parent connects Drive once (functions/google.mjs); the refresh key is kept
// encrypted in storage, so family phones never sign in to Google. Scope drive.file: the site only sees files it made.
import { encrypt, decrypt } from './core.mjs';
import { env, secret } from './auth.mjs';
import { store } from './store.mjs';
import site from '../../content/site.json' with { type: 'json' };

export const ROOT_NAME = site.uploadFolderName || 'Two Sisters Studio';
export const clientId = () => env('GOOGLE_CLIENT_ID') || site.googleClientId;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

export async function saveGoogle(context, refreshToken, info) {
  await store('auth', context).setJSON('google', { rt: await encrypt(refreshToken, secret()), ...info, at: new Date().toISOString() });
  tokenCache = null;
}
export async function googleInfo(context) {
  const g = await store('auth', context).get('google', { type: 'json' });
  return g ? { connected: true, email: g.email || '', at: g.at } : { connected: false };
}

let tokenCache = null;
export async function accessToken(context) {
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.tok;
  const g = await store('auth', context).get('google', { type: 'json' });
  if (!g) throw Object.assign(new Error('Google Drive is not connected yet.'), { code: 'not-connected' });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: env('GOOGLE_CLIENT_SECRET') || '', grant_type: 'refresh_token', refresh_token: await decrypt(g.rt, secret()) }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error('Google Drive said no: ' + (j.error_description || j.error || r.status)), { code: j.error === 'invalid_grant' ? 'reconnect' : 'google' });
  tokenCache = { tok: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.tok;
}

export async function api(context, path, opts = {}) {
  const tok = await accessToken(context);
  const r = await fetch(path.startsWith('http') ? path : API + path, { ...opts, headers: { authorization: 'Bearer ' + tok, ...(opts.headers || {}) } });
  if (!r.ok && !opts.allowFail) {
    let why = ''; try { why = (await r.json()).error?.message || ''; } catch {}
    throw Object.assign(new Error(`Google Drive ${r.status}${why ? ': ' + why : ''}`), { status: r.status });
  }
  return r;
}

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

// Finds or makes Two Sisters Studio / a / b / c, remembering the ids.
export async function folder(context, parts) {
  const s = store('drive', context);
  const map = (await s.get('folders', { type: 'json' })) || {};
  let parent = 'root', key = '', changed = false;
  for (const name of [ROOT_NAME, ...parts]) {
    key += '/' + name;
    if (map[key]) { parent = map[key]; continue; }
    const found = await (await api(context, '/files?' + new URLSearchParams({ q: `name = ${q(name)} and mimeType = '${FOLDER}' and ${q(parent)} in parents and trashed = false`, fields: 'files(id)', spaces: 'drive' }))).json();
    let id = found.files?.[0]?.id;
    if (!id) id = (await (await api(context, '/files?fields=id', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) })).json()).id;
    parent = map[key] = id; changed = true;
  }
  if (changed) await s.setJSON('folders', map);
  return parent;
}

// A small file in one request (details .json, web copies).
export async function putSmall(context, parentId, name, mime, bytes, fileId) {
  const boundary = 'tss' + Math.random().toString(36).slice(2);
  const meta = fileId ? { name } : { name, parents: [parentId] };
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const body = new Blob([head, bytes, `\r\n--${boundary}--`]);
  const url = UPLOAD + '/files' + (fileId ? '/' + fileId : '') + '?uploadType=multipart&fields=id,name,size';
  return (await api(context, url, { method: fileId ? 'PATCH' : 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body })).json();
}

// A one-time upload address for a big original: the phone sends the bytes straight to Google, so they never pass
// through Netlify (6 MB limit) and the phone never holds a Google key.
export async function uploadAddress(context, parentId, name, mime, size, origin) {
  const r = await api(context, UPLOAD + '/files?uploadType=resumable&fields=id,name,size', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': mime, ...(size ? { 'x-upload-content-length': String(size) } : {}), origin },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
  return r.headers.get('location');
}

export async function readFile(context, id) {
  return (await api(context, `/files/${id}?alt=media`)).arrayBuffer();
}
export async function listAll(context, query, fields = 'id,name,mimeType,parents,modifiedTime,size') {
  const out = []; let pageToken;
  do {
    const p = new URLSearchParams({ q: query, fields: `nextPageToken,files(${fields})`, pageSize: '1000', spaces: 'drive' });
    if (pageToken) p.set('pageToken', pageToken);
    const j = await (await api(context, '/files?' + p)).json();
    out.push(...(j.files || [])); pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}
export async function storageInfo(context) {
  const j = await (await api(context, '/about?fields=user(emailAddress),storageQuota')).json();
  return { email: j.user?.emailAddress || '', used: +j.storageQuota?.usage || 0, limit: +j.storageQuota?.limit || 0 };
}
