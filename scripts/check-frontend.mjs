import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
assert(!/<style\b/i.test(html),'Application CSS must be in assets/css/app.css.');
const tags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const sources=[];
for(const [,attributes,inline] of tags) {
  assert(!inline.trim(),'Application JavaScript must be in a feature file.');
  assert(/\bdefer\b/.test(attributes),'Scripts must preserve deferred execution order.');
  const src=/\bsrc="([^"]+)"/.exec(attributes)?.[1];
  assert(src,'A script source is missing.');
  if(/^https?:/.test(src)) {
    assert.equal(src,'https://alcdn.msauth.net/browser/2.35.0/js/msal-browser.min.js','Keep the working Microsoft MSAL version.');
    continue;
  }
  assert(!sources.includes(src),'Duplicate script: '+src);
  sources.push(src);
  new vm.Script(fs.readFileSync(new URL(src,root),'utf8'),{filename:src});
}
assert.equal(sources.at(0).split('?')[0],'assets/js/config.js');
assert.equal(sources.at(-1).split('?')[0],'assets/js/main.js');
for(const href of [...html.matchAll(/<link\b[^>]*href="([^"]+)"/gi)].map(m=>m[1])) {
  if(!/^https?:/.test(href)) assert(fs.statSync(new URL(href,root)).isFile(),'Missing asset '+href);
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate static HTML IDs.');
const template=fs.readFileSync(new URL('assets/js/excel/template.js',root),'utf8');
const base64=/const TEMPLATE_B64\s*=\s*"([A-Za-z0-9+/=\s]+)"/.exec(template)?.[1];
assert(base64,'The original Excel template is missing.');
assert.equal(createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex'),
  'a71b530f093d5abb98f0ff49b358f2195094b7a9ef1eac30a07fabddd5c776f7','The embedded original workbook changed.');
assert(fs.readFileSync(new URL('netlify/functions/gvcnApi.mjs',root),'utf8').includes("path:'/api/*'"),
  'Netlify must route the protected API through /api.');
assert(fs.readFileSync(new URL('assets/js/config.js',root),'utf8').includes('"https://gvcnva2.lammt.workers.dev/api"'),
  'The frontend must use the configured Cloudflare API.');
const worker=JSON.parse(fs.readFileSync(new URL('wrangler.jsonc',root),'utf8'));
assert.equal(worker.name,'gvcnva2');
assert.equal(worker.main,'cloudflare/worker.mjs');
assert.equal(worker.assets.directory,'./dist');
assert.equal(worker.assets.html_handling,'none','Keep the Microsoft index.html callback intact.');
assert(worker.assets.run_worker_first.includes('/api/*'),'Cloudflare must route the protected API to the Worker.');
console.log(`Frontend: ${sources.length} scripts parsed, CSS and index.html valid, original workbook unchanged.`);
