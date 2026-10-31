
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performSync, seed } from '../lib/behance.mjs';

const outputPath = 'data/behance-sync.json';

let previous = seed.projects;
let lastSuccessfulAt = null;

try {
  const saved = JSON.parse(
    await readFile(outputPath, 'utf8')
  );

  if (Array.isArray(saved.projects)) {
    previous = saved.projects;
  }

  lastSuccessfulAt = saved.lastSuccessfulAt || null;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const result = await performSync({
  previous,
  lastSuccessfulAt
});

console.log('Behance sync status:', result.status);
console.log('Projects:', result.projects.length);
console.log('Warnings:', result.warnings);

if (result.status === 'unavailable') {
  console.error('Behance unavailable. Saved data preserved.');
  process.exitCode = 1;
} else {
  await mkdir('data', { recursive: true });

  await writeFile(
    outputPath,
    JSON.stringify(result, null, 2) + '\n',
    'utf8'
  );

  console.log('Behance data saved successfully.');
}
