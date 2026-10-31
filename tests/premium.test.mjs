import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('premium home keeps only the requested essential sections',async()=>{
 const home=await read('index.html');
 for(const id of ['showreel','projects','about','contact']) assert.ok(home.includes(`id="${id}"`));
 for(const id of ['skills','experience']) assert.ok(!home.includes(`id="${id}"`));
 assert.ok(!home.includes('id="contact-form"'));
});
test('all static resume links target the included PDF and use download attributes',async()=>{
 const home=await read('index.html'),work=await read('work.html');
 assert.equal((home.match(/data-resume-link/g)||[]).length,3);
 assert.equal((work.match(/data-resume-link/g)||[]).length,2);
 const path='assets/resume/Kishor-M-Resume.pdf';
 for(const text of [home,work]){
  const links=text.match(/<a[^>]+data-resume-link[^>]*>/g)||[];
  for(const link of links){assert.ok(link.includes(`href="${path}"`));assert.ok(link.includes('download="Kishore-Kumar-Resume.pdf"'));}
 }
 const pdf=await readFile(new URL(path,root));assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
});
test('server and browser snapshots retain 32 projects and the configured resume',async()=>{
 const data=JSON.parse(await read('data/portfolio.json'));
 assert.equal(data.projects.length,32);assert.equal(data.categories.length,6);
 assert.equal(data.person.resume,'assets/resume/Kishor-M-Resume.pdf');
 assert.ok((await read('site-data.js')).includes(JSON.stringify(data.person.resume)));
});
test('motion is progressive, respects reduced motion, and uses no third-party library',async()=>{
 const js=await read('motion.js'),css=await read('style.css');
 assert.ok(js.includes("prefers-reduced-motion: reduce"));
 assert.ok(css.includes('@media (prefers-reduced-motion:reduce)'));
 assert.ok(js.includes('IntersectionObserver'));assert.ok(js.includes('MutationObserver'));
 assert.ok(!js.includes('setInterval('));assert.ok(!js.includes('preventDefault('));
});
test('build and Node server include motion and PDF MIME support',async()=>{
 assert.ok((await read('tools/build.mjs')).includes("'motion.js'"));
 const server=await read('server.mjs');assert.ok(server.includes("'motion.js'"));assert.ok(server.includes("'.pdf':'application/pdf'"));
});
test('home and library have no missing local script, image, style or download references',async()=>{
 for(const file of ['index.html','work.html']){
  const text=await read(file);
  for(const match of text.matchAll(/(?:src|href)="([^"]+)"/g)){
   const path=match[1].split(/[?#]/)[0];
   if(!path||/^[a-z]+:/i.test(path))continue;
   await assert.doesNotReject(access(new URL(path,root)),`${file}: ${path}`);
  }
 }
});
