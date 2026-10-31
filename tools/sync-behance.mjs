
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performSync, seed, config } from '../lib/behance.mjs';

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

let output = result;

if (result.status === 'unavailable') {
  console.warn(
    'Behance access unavailable. Publishing saved portfolio.'
  );

  output = {
    ...result,
    status: 'unavailable',
    projects: previous,
    lastSuccessfulAt,
    warnings: [
      ...result.warnings,
      'Showing saved portfolio. Live Behance sync unavailable.'
    ]
  };
}

await mkdir('data', { recursive: true });

await writeFile(
  outputPath,
  JSON.stringify(output, null, 2) + '\n',
  'utf8'
);

console.log('Portfolio JSON saved successfully.');
console.log('Published project count:', output.projects.length);
