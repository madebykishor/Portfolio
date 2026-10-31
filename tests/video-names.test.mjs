import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../video-names.js';
import { parsePlayerMetadata, allowedPlayerURL, enrichVideoNames } from '../lib/video-metadata.mjs';
import { parseProjectPage, mergeVideos, readJSONScripts, seed, performSync } from '../lib/behance.mjs';
const Names = globalThis.KixorVideoNames;
const fixture = await readFile(new URL('./fixtures/personal-branding.html', import.meta.url), 'utf8');
const source = readJSONScripts(fixture)[0].project.project;
const page = p => `<script type="application/json">${JSON.stringify({ project:{ project:p } }).replaceAll('</','<\\/')}</script>`;

test('original export spelling, spaces, case, Tamil, punctuation and extension stay intact', () => {
  const filename = 'VP_\u0bb5\u0bc0\u0b9f\u0bc1  Final_V03 (9x16).MP4';
  const result = Names.normalize({ title:'AI Video Edit 01', originalFileName:filename });
  assert.equal(result.title,filename);
  assert.equal(result.titleSource,'filename');
});
test('local files use decoded basename, not directory names or remote rendition IDs', () => {
  assert.equal(Names.normalize({ localVideo:'assets/videos/My%20Film_V2.mp4' }).title, 'My Film_V2.mp4');
  assert.equal(Names.normalize({ embedUrl:'https://example.com/9837343.mp4', title:'Video 01' }).title, 'Watch video');
  assert.equal(Names.fromLocalPath('https://cdn.example.com/abc.mp4'), '');
  assert.equal(Names.fromLocalPath('../../private.mp4'), '');
});
test('filenames outrank native titles and captions; arbitrary template titles are not guessed', () => {
  const p = { originalFileName:'Actual export.mov', sourceTitle:'Displayed title', caption:'A caption', title:'Made up' };
  assert.equal(Names.resolve(p).title, 'Actual export.mov');
  assert.equal(Names.resolve({ sourceTitle:'Displayed title',caption:'A caption' }).title, 'Displayed title');
  assert.equal(Names.resolve({ title:'Commercial Brand Film 01' }).titleSource, 'unavailable');
});
test('a transient metadata failure never downgrades a previously found filename', () => {
  const old = { id:'film',originalFileName:'The_original.mp4' };
  assert.equal(Names.merge(old,{ title:'Generic 01',originalFileName:'' }).title, 'The_original.mp4');
  assert.equal(Names.merge(old,{originalFileName:'Renamed_file.mp4'}).title, 'Renamed_file.mp4');
});
test('public Behance module filename is preserved and is preferred over its caption', () => {
  const p=structuredClone(source);
  p.modules[0].originalFilename='Exact_name_V4.mp4';
  p.modules[0].captionPlain='Marketing caption';
  const parsed=parseProjectPage(page(p),'255358117');
  assert.equal(parsed.videos[0].title,'Exact_name_V4.mp4');
  assert.equal(parsed.videos[0].originalFileName,'Exact_name_V4.mp4');
  const merged=mergeVideos(seed.projects,parsed.videos,['255358117']);
  assert.equal(merged.find(p=>p.id==='personal-branding-01').title,'Exact_name_V4.mp4');
});
test('a later Behance sync without a filename retains the real previously resolved one', () => {
  const parsed=parseProjectPage(fixture,'255358117');
  const previous=seed.projects.map(p=>p.id==='personal-branding-01' ? {...p,originalFileName:'Remember me.mp4',title:'Remember me.mp4'} : p);
  const merged=mergeVideos(previous,parsed.videos,['255358117']);
  assert.equal(merged.find(p=>p.id==='personal-branding-01').title,'Remember me.mp4');
});
test('JSON filename fields and native player titles are distinguished, not conflated', () => {
  const found=parsePlayerMetadata('<script type="application/json">{"video":{"originalFilename":"Film V2.mp4"}}</script><meta property="og:title" content="Portfolio film">');
  assert.equal(found.originalFileName,'Film V2.mp4');
  assert.equal(found.sourceTitle,'Portfolio film');
  const native=parsePlayerMetadata('<title>My export.mp4 - Google Drive</title>');
  assert.equal(native.originalFileName,'');
  assert.equal(native.sourceTitle,'My export.mp4');
  assert.equal(parsePlayerMetadata('<title>Audio/Video Player</title>').sourceTitle,'');
});
test('unrelated recommended JSON assets and JS expressions are never executed or imported', () => {
  const result=parsePlayerMetadata('<script type="application/json">{"recommended":[{"fileName":"Unrelated.mp4"}]}</script><script>globalThis.bad=true;</script>');
  assert.equal(result.originalFileName,'');
  assert.equal(globalThis.bad,undefined);
});
test('only allowlisted public player URLs are fetchable', () => {
  for(const url of ['http://127.0.0.1/a','https://localhost/a','https://www-ccv.adobe.io.attacker.example/v1/player/ccv/a/embed','https://user:pw@www-ccv.adobe.io/v1/player/ccv/a/embed','https://www-ccv.adobe.io:8080/v1/player/ccv/a/embed']) assert.equal(allowedPlayerURL(url),'');
  assert.ok(allowedPlayerURL(seed.projects[0].embedUrl));
});
test('fixture-backed public metadata enriches filenames without changing project IDs/URLs', async () => {
  const result=await enrichVideoNames(seed.projects.slice(0,2),{useCache:false,fetcher:async (url,options)=>{
    assert.equal(options.redirect,'error');
    return new Response('<script type="application/json">{"originalFileName":"My_actual_export.mp4"}</script>',{headers:{'content-type':'text/html'}});
  }});
  assert.equal(result.report.filenames,2);
  assert.equal(result.projects[0].title,'My_actual_export.mp4');
  assert.equal(result.projects[0].embedUrl,seed.projects[0].embedUrl);
});
test('403, oversized pages, and invalid content types retain saved names and data', async () => {
  for(const response of [new Response('',{status:403}),new Response('x'.repeat(1000001)),new Response('{}',{headers:{'content-type':'application/json'}})]){
    const p={...seed.projects[0],sourceTitle:'Known source title'};
    const out=await enrichVideoNames([p],{useCache:false,fetcher:async()=>response});
    assert.equal(out.projects[0].title,'Known source title');
    assert.equal(out.report.failed,1);
  }
});
test('player metadata can succeed while Behance discovery remains honestly unavailable', async () => {
  const result=await performSync({previous:seed.projects.slice(0,1),fetcher:async url=>url.includes('www-ccv.adobe.io')
    ? new Response('<script type="application/json">{"fileName":"Actual_export.mp4"}</script>',{headers:{'content-type':'text/html'}})
    : new Response('',{status:403}) });
  assert.equal(result.status,'unavailable');
  assert.equal(result.projects.length,1);
  assert.equal(result.projects[0].title,'Actual_export.mp4');
  assert.equal(result.lastSuccessfulAt,null);
  assert.equal(result.videoNames.filenames,1);
});
test('static fallback has no invented titles, and raw browser/server snapshots match', async () => {
  const work=await readFile(new URL('../work.html',import.meta.url),'utf8');
  assert.equal((work.match(/class="film-title-line"/g)||[]).length,32);
  assert.ok(!work.includes('>Brand Film</h2>'));
  assert.equal((work.match(/<h2 title="Watch video">Watch video<\/h2>/g)||[]).length,32);
  assert.ok(!work.includes('Commercial Brand Film 01'));
  const browser=await readFile(new URL('../site-data.js',import.meta.url),'utf8');
  const saved=JSON.parse(browser.slice(browser.indexOf(' = ')+3).trim().replace(/;$/,''));
  assert.deepEqual(saved,seed);
});
