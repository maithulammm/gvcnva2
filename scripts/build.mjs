import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './check-frontend.mjs';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.resolve(root,'dist');
// Only replace our generated output directory inside the project, never a link.
if(path.dirname(output)!==root || path.basename(output)!=='dist')
  throw Error('Build output must be the project dist directory.');
if(fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())
  throw Error('Refusing to replace a symlink at the build output path.');
if(fs.existsSync(output)) fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output);

for(const entry of ['index.html','assets'])
  fs.cpSync(path.join(root,entry),path.join(output,entry),{recursive:true});

console.log('Build ready in dist/: index.html and browser assets.');
