import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app/config.js',import.meta.url),'utf8');
const url=source.match(/["']?SUPABASE_URL["']?\s*:\s*["']([^"']+)/)?.[1];
const key=source.match(/["']?SUPABASE_ANON_KEY["']?\s*:\s*["']([^"']+)/)?.[1];
if(!url||!key||key==='TU_ANON_KEY'){console.log(JSON.stringify({ok:false,reason:'missing_config'}));process.exit(2)}
try{
  const response=await fetch(`${url}/rest/v1/business_units?select=id,code,name`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  const body=await response.text();
  console.log(JSON.stringify({ok:response.ok,status:response.status,units:response.ok?JSON.parse(body):undefined,reason:response.ok?undefined:body.slice(0,160)}));
}catch(error){console.log(JSON.stringify({ok:false,reason:'network_unavailable',detail:error.cause?.code||error.message}));process.exit(3)}
