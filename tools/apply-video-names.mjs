/** Optional: update static fallbacks after replacing video-title-map.js. */
import { readFile, writeFile } from 'node:fs/promises';
import { renderWorkTitles } from './render-video-titles.mjs';
const root=new URL('../',import.meta.url);
const data=JSON.parse(await readFile(new URL('data/portfolio.json',root),'utf8'));
const path=new URL('work.html',root);
await writeFile(path,renderWorkTitles(await readFile(path,'utf8'),data));
const count=data.projects.filter(p=>globalThis.KixorVideoTitles.resolve(p).source==='owner-confirmed').length;
console.log(`Updated static titles: ${count}/${data.projects.length} Work videos have confirmed original names. No video files or links were changed.`);
