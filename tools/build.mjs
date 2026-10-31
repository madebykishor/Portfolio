
import { renderWorkTitles } from './render-video-titles.mjs';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('public/', root);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const name of [
  'index.html',
  'work.html',
  'sync-status.html',
  'style.css',
  'script.js',
  'site-data.js',
  'sync-client.js',
  'sync-status.js',
  'video-thumbnails.js',
  'video-names.js',
  'video-titles.js',
  'original-video-names.js',
  'video-title-map.js',
  'motion.js',
  'robots.txt',
  'assets',
  'css',
  'js'
]) {
  await cp(
    new URL(name, root),
    new URL(name, output),
    { recursive: true }
  );
}

// Publish the latest saved Behance synchronization data.
const syncSource = new URL('data/behance-sync.json', root);
const syncDestination = new URL('data/behance-sync.json', output);

try {
  await mkdir(new URL('data/', output), { recursive: true });
  await cp(syncSource, syncDestination);
  console.log('Behance sync JSON published.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.log('No Behance sync JSON found. Using saved portfolio.');
}

const data = JSON.parse(
  await readFile(new URL('data/portfolio.json', root), 'utf8')
);

await writeFile(
  new URL('work.html', output),
  renderWorkTitles(
    await readFile(new URL('work.html', root), 'utf8'),
    data
  )
);

console.log('Built public/ successfully.');
