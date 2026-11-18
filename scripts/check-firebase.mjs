import fs from 'node:fs';

const file=new URL('../firebase/functions/.env.gvcn-3bdf9',import.meta.url);
if(!fs.existsSync(file)) throw Error('Copy firebase/functions/.env.example to .env.gvcn-3bdf9 to validate local API settings.');
const values=Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).map(line=>{
  const match=/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
  return match?[match[1],match[2].replace(/^(["'])(.*)\1$/,'$2')]:null;
}).filter(Boolean));
const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
for(const key of ['MICROSOFT_TENANT_ID','MICROSOFT_CLIENT_ID']) if(!guid.test(values[key]||'')) throw Error(`${key} must be a valid Microsoft GUID.`);
if(!/^[a-z0-9._%+-]+@vietanhschool\.edu\.vn$/i.test(values.GVCN_ADMIN_EMAIL||'')) throw Error('Configure the school Admin email.');
const origins=(values.GVCN_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
for(const origin of origins) if(new URL(origin).origin!==origin) throw Error('Allowed origins must omit paths and trailing slashes.');
if(!origins.includes('https://gvcnva2.lammt.workers.dev')) throw Error('Add https://gvcnva2.lammt.workers.dev to GVCN_ALLOWED_ORIGINS.');
console.log('API config valid: Microsoft IDs, Admin email and Cloudflare production origin.');
