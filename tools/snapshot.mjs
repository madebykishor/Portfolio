/** Optional: save a VERIFIED successful sync into the deployable fallback. */
import { writeFile } from 'node:fs/promises';
import { performSync, seed } from '../lib/behance.mjs';
const result = await performSync();
if (result.status !== 'live') {
  console.error('Snapshot NOT written: a full live sync has not succeeded.');
  result.warnings.forEach(message => console.error(message));
  process.exitCode = 1;
} else {
  const updated = { ...seed, projects:result.projects, categories:result.categories, lastSnapshotAt:result.checkedAt };
  await writeFile(new URL('../data/portfolio.json',import.meta.url),JSON.stringify(updated,null,2)+'\n');
  await writeFile(new URL('../site-data.js',import.meta.url),'/* Verified saved fallback. */\nwindow.KIXOR_PORTFOLIO = '+JSON.stringify(updated,null,2)+';\n');
  console.log(`Saved ${result.projects.length} videos. Redeploy to distribute this fallback snapshot.`);
}
