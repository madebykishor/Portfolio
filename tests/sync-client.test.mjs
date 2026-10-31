import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { videoURL, seed } from '../lib/behance.mjs';
const script = await readFile(new URL('../sync-client.js',import.meta.url),'utf8');
const namePolicy = await readFile(new URL('../video-names.js',import.meta.url),'utf8');
const settle = async () => { for(let i=0;i<8;i++) await new Promise(resolve=>setImmediate(resolve)); };

function harness(initialStorage = new Map()) {
  const events = [], listeners = {}, callbacks = [], calls = [];
  const nodes = { message:{textContent:'',title:''}, status:{dataset:{}} };
  let now=Date.now(), responseStatus=200;
  let payload={schemaVersion:1,status:'live',profile:{username:'madebykishor'},lastSuccessfulAt:new Date(now).toISOString(),projects:structuredClone(seed.projects),categories:structuredClone(seed.categories),refreshedProjectIds:seed.categories.map(c=>c.externalUrl.match(/gallery\/(\d+)/)[1])};
  class CustomEvent { constructor(type,opts){this.type=type;this.detail=opts.detail;} }
  class TestDate extends Date { static now(){return now;} }
  const document={hidden:false,querySelectorAll:selector=>selector==='[data-sync-message]' ? [nodes.message] : selector==='[data-sync-state]' ? [nodes.status] : [],dispatchEvent:e=>{events.push(e);(listeners[e.type]||[]).forEach(fn=>fn(e));},addEventListener:(type,fn)=>(listeners[type] ||= []).push(fn)};
  const window={KIXOR_PORTFOLIO:structuredClone(seed),KixorThumbnails:{safeURL:videoURL},addEventListener(){}};
  const context={window,document,CustomEvent,URL,Date:TestDate,AbortController,navigator:{onLine:true},location:{protocol:'https:',origin:'https://portfolio.example',href:'https://portfolio.example/work.html'},console:{info(){}},setTimeout,clearTimeout,setInterval:fn=>callbacks.push(fn),localStorage:{getItem:k=>initialStorage.get(k)||null,setItem:(k,v)=>initialStorage.set(k,v)},fetch:async url=>{calls.push(url);return {ok:responseStatus===200,headers:{get:()=> 'application/json'},json:async()=>structuredClone(payload)};}};
  vm.runInNewContext(namePolicy,context,{filename:'video-names.js'});
  vm.runInNewContext(script,context,{filename:'sync-client.js'});
  return {events,nodes,callbacks,calls,storage:initialStorage,window,context,setPayload(p,status=200){payload=p;responseStatus=status;},payload:()=>structuredClone(payload),tick(){now+=301000;callbacks.forEach(fn=>fn());},lastPortfolio(){return events.filter(e=>e.type==='kixor:portfolio').at(-1)?.detail;}};
}

test('actual browser sync-client polls, inserts a new film, and updates published data without editing site-data',async()=>{
  const h=harness();await settle();assert.equal(h.lastPortfolio().projects.length,32);
  const next=h.payload();next.projects.unshift({...next.projects[0],id:'newly-synced-film',title:'Newly synced film',embedUrl:'https://www-ccv.adobe.io/v1/player/ccv/NEW_CLIENT_TEST/embed'});
  h.setPayload(next);h.tick();await settle();
  assert.equal(h.lastPortfolio().projects.length,33);assert.equal(h.lastPortfolio().projects[0].id,'newly-synced-film');
  assert.equal(h.nodes.message.textContent,'Updated from Behance');assert.equal(h.calls.length,2);
  h.tick();await settle();assert.equal(h.lastPortfolio().projects.length,33);
});
test('unavailable status never overwrites the last good browser snapshot',async()=>{
  const h=harness();await settle();const old=[...h.storage.values()][0];
  const failed=h.payload();failed.status='unavailable';failed.projects=[];h.setPayload(failed,503);h.tick();await settle();
  assert.equal(h.lastPortfolio().projects.length,32);assert.equal([...h.storage.values()][0],old);
  assert.equal(h.nodes.status.dataset.syncState,'unavailable');
});
test('cached browser snapshot restores first; failed refresh is not labelled live',async()=>{
  const one=harness();await settle();const next=one.payload();next.projects.push({...next.projects[0],id:'new-cached',embedUrl:'https://www-ccv.adobe.io/v1/player/ccv/NEW_CACHE_TEST/embed'});one.setPayload(next);one.tick();await settle();
  const two=harness(one.storage);const failed=two.payload();failed.status='unavailable';two.setPayload(failed,503);await settle();
  assert.equal(two.lastPortfolio().projects.length,33);assert.equal(two.nodes.status.dataset.syncState,'unavailable');
});
test('a confirmed removed video is removed; hostile URLs are never passed to UI',async()=>{
  const h=harness();await settle();const next=h.payload();next.projects.shift();next.projects.push({...next.projects[0],id:'hostile',embedUrl:'javascript:alert(1)'});
  h.setPayload(next);h.tick();await settle();assert.equal(h.lastPortfolio().projects.length,31);assert.ok(!h.lastPortfolio().projects.find(p=>p.id==='hostile'));
});
test('local-file mode explicitly requires hosting and makes no backend request',async()=>{
  const h=harness();await settle();h.context.location.protocol='file:';h.tick();await settle();
  assert.equal(h.nodes.status.dataset.syncState,'local');assert.equal(h.calls.length,1);
});

test('browser uses exact filenames, remembers them through empty metadata, and supports source renames',async()=>{
  const h=harness();await settle();
  let next=h.payload();next.projects[0].originalFileName='The Real_Name (FINAL).mp4';
  h.setPayload(next);h.tick();await settle();
  assert.equal(h.lastPortfolio().projects[0].title,'The Real_Name (FINAL).mp4');
  next=h.payload();next.projects[0].originalFileName='';next.projects[0].title='Generated 01';
  h.setPayload(next);h.tick();await settle();
  assert.equal(h.lastPortfolio().projects[0].title,'The Real_Name (FINAL).mp4');
  next.projects[0].originalFileName='Renamed_original.mp4';
  h.setPayload(next);h.tick();await settle();
  assert.equal(h.lastPortfolio().projects[0].title,'Renamed_original.mp4');
});
test('metadata-only results update known names but cannot add/remove films or fake a live sync',async()=>{
  const h=harness();await settle();const next=h.payload();
  next.status='unavailable';next.projects[0].originalFileName='Found_on_player.mp4';
  next.projects.pop();next.projects.push({...next.projects[0],id:'not-authorized',embedUrl:'https://www-ccv.adobe.io/v1/player/ccv/FAKE_NEW/embed'});
  h.setPayload(next,503);h.tick();await settle();
  assert.equal(h.lastPortfolio().projects.length,32);
  assert.equal(h.lastPortfolio().projects[0].title,'Found_on_player.mp4');
  assert.ok(!h.lastPortfolio().projects.some(p=>p.id==='not-authorized'));
  assert.equal(h.nodes.status.dataset.syncState,'unavailable');
});
