import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../video-names.js';
import '../original-video-names.js';
import '../video-title-map.js';
import '../video-titles.js';
import { renderWorkTitles } from '../tools/render-video-titles.mjs';
const Titles=globalThis.KixorVideoTitles;
const Names=globalThis.KixorVideoNames;
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('all 64 screenshot names are distinct and kept exactly as supplied',()=>{
  assert.equal(Titles.catalog.length,64);
  assert.equal(new Set(Titles.catalog).size,64);
  for(const title of Titles.catalog) {
    assert.equal(Titles.title({sourceTitle:title}),title);
    assert.equal(Titles.title({originalFileName:title+'.mp4'}),title);
  }
});
test('owner spellings, casing and meaningful series numbers are never corrected',()=>{
  for(const title of ['Charcoal Shiping','Villa Comming Soon','90s VS 2k','Video Editing Ai','Blood letting','Velavan City - AI 3','Velavan City - AI 4','Podcast 10 - SSR','Legs Go Holidays - 6','Q & A']) assert.equal(Titles.format(title),title);
});
test('underscored provider metadata matches an exact screenshot name without fuzzy matching',()=>{
  assert.equal(Titles.format('charcoal_shiping.mp4'),'Charcoal Shiping');
  assert.equal(Titles.format('Blood_letting.MOV'),'Blood letting');
  assert.equal(Titles.format('Velavan City - AI 3.mp4'),'Velavan City - AI 3');
  assert.notEqual(Titles.format('Charcoal Shipping.mp4'),'Charcoal Shiping');
  assert.notEqual(Titles.format('Velavan City - AI 4.mp4'),'Velavan City - AI 3');
});
test('unlisted source filenames keep version markers, underscores and original case',()=>{
  const originalFileName='The_original_Final_V03 (9x16).MP4';
  const project=Names.normalize({originalFileName});
  assert.equal(Titles.title(project),'The_original_Final_V03 (9x16)');
  assert.equal(project.originalFileName,originalFileName);
  assert.equal(Titles.format('iPhone_15_final_v2.mov'),'iPhone_15_final_v2');
});
test('32 saved Work videos are retained without guessing assignments or inventing labels',async()=>{
  const data=JSON.parse(await read('data/portfolio.json'));
  assert.equal(data.projects.length,32);
  assert.equal(Object.keys(globalThis.KIXOR_VIDEO_TITLE_MAP).length,0);
  for(const p of data.projects) assert.deepEqual(Titles.resolve(p),{title:'Watch video',source:'unavailable'});
  assert.equal(Titles.resolve({category:'ai',id:'ai-01',title:'Generative Film',displayTitle:'Generative Film'}).title,'Watch video');
});
test('source identity ignores query changes and project list position',()=>{
  const p={id:'a',embedUrl:'https://www-ccv.adobe.io/v1/player/ccv/A1_b-2/embed?api_key=behance1&bgcolor=white'};
  assert.equal(Titles.sourceKey(p),'adobe:A1_b-2');
  assert.equal(Titles.sourceKey({...p,id:'changed',embedUrl:p.embedUrl+'&autoplay=0'}),'adobe:A1_b-2');
  assert.equal(Titles.sourceKey({embedUrl:'https://drive.google.com/file/d/ABC123/preview'}),'drive:ABC123');
  for(const url of ['http://localhost/a','https://evil.example/v1/player/ccv/ABC/embed','https://user:pw@www-ccv.adobe.io/v1/player/ccv/ABC/embed','javascript:alert(1)']) assert.equal(Titles.sourceKey({embedUrl:url}),'');
});
test('confirmed mapping survives a new ID, reordered feed and missing metadata',()=>{
  const before=globalThis.KIXOR_VIDEO_TITLE_MAP;
  globalThis.KIXOR_VIDEO_TITLE_MAP={'adobe:CONFIRMED_TEST':'Charcoal Shiping'};
  try {
    for(const id of ['old','new']) assert.deepEqual(Titles.resolve({id,embedUrl:'https://www-ccv.adobe.io/v1/player/ccv/CONFIRMED_TEST/embed',sourceTitle:'Conflicting source text'}),{title:'Charcoal Shiping',source:'owner-confirmed'});
    assert.equal(Titles.title({id:'old',embedUrl:'https://www-ccv.adobe.io/v1/player/ccv/OTHER_TEST/embed'}),'Watch video');
  }finally{globalThis.KIXOR_VIDEO_TITLE_MAP=before;}
});
test('filenames take precedence over native titles; new names require real metadata',()=>{
  assert.equal(Titles.title({originalFileName:'Boba tea.mp4',sourceTitle:'Data'}),'Boba tea');
  assert.equal(Titles.title({sourceTitle:'Kelloggs'}),'Kelloggs');
  assert.equal(Titles.title({caption:'MSME'}),'MSME');
  assert.equal(Titles.title({title:'Podcast 2 - SSR',category:'podcast'}),'Watch video');
});
test('invalid input, generic players and URLs do not become original titles',()=>{
  for(const value of [null,undefined,123,{},'https://example.org/a.mp4','','Watch video','Audio/Video Player']) assert.equal(Titles.format(value),'');
  assert.equal(Titles.format('Hyper%20City%20-%20Madurai.mp4'),'Hyper City - Madurai');
});
test('static and enhanced titles use the same neutral fallback until assigned',async()=>{
  const work=await read('work.html');
  assert.equal((work.match(/<h2 title="Watch video">Watch video<\/h2>/g)||[]).length,32);
  for(const old of ['>Brand Film</h2>','>Synthetic Cinema</h2>','>Creator Story</h2>'])assert.ok(!work.includes(old));
  for(const page of ['index.html','work.html']){
    const html=await read(page);
    for(const name of ['original-video-names.js','video-title-map.js']) assert.ok(html.indexOf(`src="${name}"`)<html.indexOf('src="video-titles.js"'));
    assert.ok(html.indexOf('src="video-titles.js"')<html.indexOf('src="script.js"'));
  }
});
test('static render applies confirmed names with HTML escaping',()=>{
  const previous=globalThis.KIXOR_VIDEO_TITLE_MAP;
  globalThis.KIXOR_VIDEO_TITLE_MAP={'adobe:STATIC_TEST':'Q & A <title>'};
  try{
    const html='<article data-project-id="p"><a aria-label="Watch video"><h2 title="Watch video">Watch video</h2></a></article>';
    const rendered=renderWorkTitles(html,{projects:[{id:'p',embedUrl:'https://www-ccv.adobe.io/v1/player/ccv/STATIC_TEST/embed'}]});
    assert.ok(rendered.includes('Q &amp; A &lt;title&gt;'));
    assert.ok(!rendered.includes('Q & A <title>'));
  }finally{globalThis.KIXOR_VIDEO_TITLE_MAP=previous;}
});
test('title files are deployed; owner utility is excluded from production build and public Node routes',async()=>{
  for(const file of ['tools/build.mjs','server.mjs']){
    const source=await read(file);
    for(const name of ['original-video-names.js','video-title-map.js']) assert.ok(source.includes(`'${name}'`));
    assert.ok(!source.includes("'owner-tools'"));
  }
});
test('sticky-header animation remains unchanged',async()=>{
  const motion=await read('motion.js');assert.ok(motion.includes('if (y > 40)'));assert.ok(motion.includes('else if (y < 4)'));
});
