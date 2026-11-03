// Rebuild the galleries from Google Drive alone (a parent starts it from the parent page).
// Reads every details file the site made, copies its web copies back into storage, and remakes the index.
// Runs in the background (up to 15 minutes); progress is kept in storage for the parent page.
import { isParent } from '../lib/auth.mjs';
import { listAll, readFile } from '../lib/drive.mjs';
import { store } from '../lib/store.mjs';
import { reindex, webName } from '../lib/pieces.mjs';

export default async (req, context) => {
  if (!(await isParent(req, context))) return;
  const status = store('drive', context);
  const report = { state: 'running', started: new Date().toISOString(), total: 0, done: 0, problems: [] };
  const save = () => status.setJSON('rebuild', report);
  try {
    const files = await listAll(context, "appProperties has { key='tss' and value='piece' } and trashed = false");
    report.total = files.length; await save();
    const pieces = store('pieces', context), images = store('images', context);
    for (const f of files) {
      try {
        const d = JSON.parse(new TextDecoder().decode(await readFile(context, f.id)));
        for (const ph of d.photos || []) {
          if (!ph.web) { report.problems.push(`${d.id}: photo ${ph.n} has no web copy in Drive`); continue; }
          await images.set(webName(d.id, ph.n), await readFile(context, ph.web), { metadata: { type: ph.webType || 'image/webp', piece: d.id } });
          if (ph.thumb) await images.set(webName(d.id, ph.n, true), await readFile(context, ph.thumb), { metadata: { type: ph.webType || 'image/webp', piece: d.id } });
        }
        await pieces.setJSON('p/' + d.id, { ...d, detailsFile: f.id });
      } catch (e) { report.problems.push(`${f.name}: ${e.message}`); }
      report.done += 1;
      if (report.done % 10 === 0) await save();
    }
    report.indexed = await reindex(context);
    report.state = 'done';
  } catch (e) { report.state = 'failed'; report.problems.push(e.message); }
  report.finished = new Date().toISOString();
  await save();
};

export const config = { path: '/api/admin/rebuild' };
