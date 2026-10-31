import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProjectPage, discoverProfileProjects, mergeVideos, videoURL, videoKey, readJSONScripts, projectId, config, seed, performSync } from '../lib/behance.mjs';

const real = await readFile(new URL('./fixtures/personal-branding.html', import.meta.url), 'utf8');
const source = readJSONScripts(real)[0].project.project;
const html = value => `<html><script id="beconfig-store_state" type="application/json">${JSON.stringify(value).replaceAll('</','<\\/')}</script></html>`;
const owned = p => ({ ...p, owners:[{ id:151483611, username:'madebykishor', url:'https://www.behance.net/madebykishor' }] });
const profile = entries => html({ profile:{ projects:entries } });
const added = owned({ ...structuredClone(source), modules:[...source.modules, { id:1999999999, __typename:'VideoModule', captionPlain:'Newly published film', width:1920, height:1080, embed:'<iframe src="https://www-ccv.adobe.io/v1/player/ccv/NEWFILM2026/embed?api_key=behance1"></iframe>' }] });

test('real saved Behance page: eight video modules, true owner, correct portrait ratios', () => {
  const parsed = parseProjectPage(real,'255358117');
  assert.equal(parsed.videos.length,8);
  assert.equal(parsed.project.category,'personal-branding');
  assert.equal(parsed.videos[0].embedUrl,'https://www-ccv.adobe.io/v1/player/ccv/4QMQqfXxq7s/embed?api_key=behance1&bgcolor=%23191919');
  assert.ok(parsed.videos.every(p => p.ratio==='9/16'));
  assert.ok(parsed.videos.every(p => p.thumbnail===''));
});
test('an added video module is discovered without editing the website project list', () => {
  const parsed=parseProjectPage(html({ project:{ project:added } }),'255358117');
  const merged=mergeVideos(seed.projects,parsed.videos,['255358117']);
  assert.equal(merged.length,33);
  assert.equal(merged[0].title,'Newly published film');
  assert.equal(merged[0].ratio,'16/9');
  assert.equal(merged.find(p=>p.id==='personal-branding-01').title,seed.projects.find(p=>p.id==='personal-branding-01').title);
});
test('repeated sync does not duplicate a video; original ids remain stable', () => {
  const parsed=parseProjectPage(html({ project:{ project:added } }),'255358117');
  const once=mergeVideos(seed.projects,parsed.videos,['255358117']);
  const twice=mergeVideos(once,parsed.videos,['255358117']);
  assert.equal(twice.length,33);
  assert.equal(new Set(twice.map(p=>videoKey(p.embedUrl))).size,33);
  assert.ok(twice.find(p=>p.id==='personal-branding-01'));
});
test('confirmed deletion removes a missing module, not unrelated collections', () => {
  const p=structuredClone(source);p.modules.pop();
  const parsed=parseProjectPage(html({project:{project:p}}),'255358117');
  assert.equal(mergeVideos(seed.projects,parsed.videos,['255358117']).length,31);
  assert.equal(mergeVideos(seed.projects,[],[]).length,32);
});
test('public profile discovery only imports the configured owner, not recommendations', () => {
  const p=owned({...source,modules:undefined});
  const other={...p,id:123,url:'https://www.behance.net/gallery/123/Other',owners:[{id:666,username:'someoneelse'}]};
  const result=discoverProfileProjects(profile([p,other]));
  assert.equal(result.length,1);assert.equal(result[0].id,'255358117');
});
test('non-public projects, unverifiable owners, and changed video schemas fail closed', () => {
  assert.throws(()=>parseProjectPage(html({project:{project:{...source,isPrivate:true}}}),'255358117'),/not public/);
  assert.throws(()=>parseProjectPage(html({project:{project:{...source,owners:[]}}}),'255358117'),/ownership/);
  const p={...source,modules:[{__typename:'VideoModule',embed:'<iframe src="https://attacker.example/x"></iframe>'}]};
  assert.throws(()=>parseProjectPage(html({project:{project:p}}),'255358117'),/unsupported/);
});
test('only approved embed hosts and path shapes are accepted', () => {
  assert.equal(videoURL('javascript:alert(1)'), '');
  assert.equal(videoURL('https://www-ccv.adobe.io.attacker.example/v1/player/ccv/foo/embed'), '');
  assert.equal(videoURL('https://user:pass@www-ccv.adobe.io/v1/player/ccv/foo/embed'), '');
  assert.equal(videoURL('https://www-ccv.adobe.io:8080/v1/player/ccv/foo/embed'), '');
  assert.equal(videoURL('https://www-ccv.adobe.io/random'), '');
  assert.ok(videoURL('https://www.youtube-nocookie.com/embed/abc123'));
  assert.equal(projectId('https://attacker.example/gallery/123'), '');
  assert.equal(projectId('https://www.behance.net/gallery/123/Film'), '123');
});
test('all failed upstream requests report unavailable and retain the 32 saved records', async () => {
  const result=await performSync({fetcher:async()=>new Response('Forbidden',{status:403})});
  assert.equal(result.status,'unavailable');assert.equal(result.projects.length,32);
  assert.equal(result.lastSuccessfulAt,null);assert.equal(result.refreshedProjectIds.length,0);
  assert.equal(result.sources.length,6);assert.ok(result.warnings.length>=7);
});
test('partial fetch updates the successful collection but clearly reports failed discovery', async () => {
  const result=await performSync({fetcher:async url=>url.includes('/gallery/255358117/') ? new Response(html({project:{project:added}}),{headers:{'content-type':'text/html'}}) : new Response('',{status:403})});
  assert.equal(result.status,'partial');assert.equal(result.projects.length,33);
  assert.equal(result.discovery.ok,false);assert.deepEqual(result.refreshedProjectIds,['255358117']);
});
test('a complete successful run discovers a new project and its video', async () => {
  const newId='299999999';
  const newProject=owned({...source,id:Number(newId),url:`https://www.behance.net/gallery/${newId}/New-film`,name:'New story',tags:[],modules:[added.modules.at(-1)]});
  const settings={...config,projectSources:[{id:'255358117',url:source.url,category:'personal-branding'}]};
  const response = body => new Response(body,{headers:{'content-type':'text/html'}});
  const result=await performSync({settings,previous:seed.projects.filter(p=>p.category==='personal-branding'),fetcher:async url=>{
    if(url.endsWith('/madebykishor'))return response(profile([owned({...source,modules:undefined}),{...newProject,modules:undefined}]));
    if(url.includes(`/gallery/${newId}/`))return response(html({project:{project:newProject}}));
    return response(real);
  }});
  assert.equal(result.status,'live');assert.equal(result.projects.length,9);
  assert.ok(result.categories.some(c=>c.id==='other'));assert.equal(result.discovery.discovered,2);
});
