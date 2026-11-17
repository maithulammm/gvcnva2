import {YEAR} from './model.mjs';

// Configuration readiness only. Never return credentials, tokens or student data.
export function serviceAccountConfigured(env=process.env) {
  try {
    const account=JSON.parse(String(env.FIREBASE_SERVICE_ACCOUNT||''));
    return account.type==='service_account' && account.project_id==='gvcn-3bdf9' &&
      typeof account.client_email==='string' && account.client_email.endsWith('.iam.gserviceaccount.com') &&
      typeof account.private_key==='string' && account.private_key.includes('-----BEGIN PRIVATE KEY-----') &&
      account.private_key.includes('-----END PRIVATE KEY-----');
  } catch {return false;}
}

export function deploymentStatus(env=process.env,{databaseConfigured=true}={}) {
  const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const microsoftConfigured=guid.test(String(env.MICROSOFT_TENANT_ID||'').trim()) &&
    guid.test(String(env.MICROSOFT_CLIENT_ID||'').trim());
  const allowedOriginsConfigured=String(env.GVCN_ALLOWED_ORIGINS||'').split(',').some(value=>{
    try {const origin=value.trim();return !!origin && new URL(origin).origin===origin;}
    catch {return false;}
  });
  return {service:'vietanh-gvcn-api',year:YEAR,
    configured:microsoftConfigured&&allowedOriginsConfigured&&databaseConfigured,
    microsoftConfigured,allowedOriginsConfigured,databaseConfigured};
}
