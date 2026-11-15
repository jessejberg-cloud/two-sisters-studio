// Copies a finished Family Moments video into Google Drive (the archive), from the pieces the site already has,
// so the phone only sends the video once. The app starts it right after a video is on the site; a family login
// can start it again (POST /api/videos-drive/<id>) if Drive was not connected at the time.
// Runs in the background (up to 15 minutes). Drive:  Two Sisters Studio / Family Moments / <2026-06-14 Wedding> /
//   <id>.mp4   the video, untouched        <id>.json   the details        <id>-poster.webp   the still picture
import { who } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { folder, putSmall, uploadAddress } from '../lib/drive.mjs';
import { getVideo, saveVideo, pub, driveFolder, fileName } from './videos.mjs';

export default async (req, context) => {
  const me = await who(req, context);
  if (me?.role !== 'family') return;
  const id = new URL(req.url).pathname.split('/').filter(Boolean)[2];
  await copyToDrive(context, id, new URL(req.url).origin);
};

export async function copyToDrive(context, id, origin) {
  const v = await getVideo(context, id);
  if (!v || !v.ready) return;
  if (v.drive?.state === 'done' || (v.drive?.state === 'copying' && Date.now() - Date.parse(v.drive.at || 0) < 20 * 60000)) return;
  v.drive = { state: 'copying', at: new Date().toISOString() };
  await saveVideo(context, v);
  try {
    const parent = await folder(context, driveFolder(v));
    const address = await uploadAddress(context, parent, fileName(v), v.type, v.size, origin);
    const pieces = store('video', context);
    let fileId = null;
    for (let i = 0; i < v.chunks; i++) {
      const buf = await pieces.get(v.id + '/' + i, { type: 'arrayBuffer' });
      if (!buf) throw new Error('piece ' + i + ' is missing');
      const start = i * v.chunkSize, end = start + buf.byteLength - 1;
      let res;
      for (let tries = 0; ; tries++) {
        res = await fetch(address, { method: 'PUT', headers: { 'content-range': `bytes ${start}-${end}/${v.size}` }, body: buf }).catch(() => null);
        if (res && (res.ok || res.status === 308)) break;
        if (tries >= 4) throw new Error('Google Drive did not take piece ' + i + (res ? ' (' + res.status + ')' : ''));
        await new Promise((ok) => setTimeout(ok, 2000 * (tries + 1)));
      }
      if (res.ok) fileId = (await res.json()).id;
    }
    if (!fileId) throw new Error('Google Drive did not confirm the file');
    const files = { video: fileId };
    if (v.poster) {
      const p = await store('images', context).get('vid-' + v.id, { type: 'arrayBuffer' });
      if (p) files.poster = (await putSmall(context, parent, `${v.id}-poster.${v.poster.type === 'image/jpeg' ? 'jpg' : 'webp'}`, v.poster.type, p)).id;
    }
    const details = { version: 1, kind: 'family-moments-video', ...pub(v), file: fileName(v), drive: undefined };
    files.details = (await putSmall(context, parent, `${v.id}.json`, 'application/json', JSON.stringify(details, null, 2), null, { tss: 'video' })).id;
    const fresh = await getVideo(context, id);
    fresh.drive = { state: 'done', at: new Date().toISOString(), ...files };
    await saveVideo(context, fresh);
  } catch (e) {
    console.error('video to drive failed:', id, e.code || '', e.message);
    const fresh = await getVideo(context, id);
    fresh.drive = { state: 'failed', at: new Date().toISOString(), error: e.code === 'not-connected' ? 'not-connected' : String(e.message).slice(0, 200) };
    await saveVideo(context, fresh);
  }
}

export const config = { path: '/api/videos-drive/*' };
