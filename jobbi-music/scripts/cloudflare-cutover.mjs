#!/usr/bin/env node
// Cloudflare remotely managed tunnel: exact-hostname, non-destructive cutover.
// API token comes ONLY from stdin and is never logged, saved, or placed in argv.
import fs from 'node:fs';
import path from 'node:path';

const [mode] = process.argv.slice(2);
const account = process.env.CF_ACCOUNT_ID || '';
const tunnel = process.env.CF_TUNNEL_ID || '';
const hostname = 'music.jobbisoft.com.mx';
const previous = 'http://192.168.1.20:4533';
const next = 'http://192.168.1.20:3131';
const backupDir = '/backups';
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/cfd_tunnel/${tunnel}/configurations`;
const die = message => { console.error('Cloudflare cutover stopped: '+message); process.exitCode=1; };
if(!['check','switch'].includes(mode)||!/^[a-f0-9]{32}$/i.test(account)||
    !/^[a-f0-9-]{36}$/i.test(tunnel)){
  die('Supply a valid Cloudflare account ID, tunnel ID and mode.');process.exit(1);
}
let token='';
for await (const chunk of process.stdin) {
  token+=chunk.toString('utf8');
  if(token.length>5000){die('API token too long');process.exit(1)}
}
token=token.trim();
if(!token){die('Missing Cloudflare API token');process.exit(1)}
async function request(method,body){
  const response=await fetch(api,{
    method,redirect:'error',
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(16000)
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.success){
    const message=(result?.errors||[]).map(x=>String(x.message||'')).join('; ')||
      `HTTP ${response.status}`;
    throw Error('Cloudflare API: '+message.slice(0,330));
  }
  return result.result;
}
function inspect(config){
  const rules=config?.ingress;
  if(!Array.isArray(rules)||!rules.length)throw Error('Tunnel has no remotely managed ingress rules');
  const relevant=rules.map((rule,i)=>({rule,i})).filter(x=>
    String(x.rule?.hostname||'').toLowerCase()===hostname);
  if(relevant.length!==1||relevant[0].rule.path)
    throw Error('Expected exactly one path-free ingress rule for '+hostname+
      '. No other Cloudflare routes were changed.');
  const chosen=relevant[0];
  if(![previous,next].includes(chosen.rule.service))
    throw Error('Current origin is '+String(chosen.rule.service).slice(0,180)+
      ' rather than the expected Navidrome/Jobbi URL. No changes made.');
  return chosen;
}
try {
  const current=await request('GET');
  const config=current?.config;
  const found=inspect(config);
  console.log('Cloudflare hostname verified:',hostname);
  console.log('Current destination:',found.rule.service);
  if(mode==='check'){
    console.log('This is a remotely managed tunnel with the expected existing route.');
  } else if(found.rule.service===next){
    console.log('Already routed to Jobbi Music; no change required.');
  } else {
    fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
    const safeName='tunnel-config-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    const backup=path.join(backupDir,safeName);
    fs.writeFileSync(backup,JSON.stringify({account,tunnel,original:config},null,2),{
      encoding:'utf8',mode:0o600,flag:'wx'
    });
    console.log('Existing ingress configuration safely backed up:',backup);
    const updated=structuredClone(config);
    updated.ingress[found.i].service=next;
    let putAttempted=false;
    try {
      putAttempted=true;
      await request('PUT',{config:updated});
      const verified=await request('GET');
      if(inspect(verified?.config).rule.service!==next)
        throw Error('Cloudflare did not confirm the new upstream');
      console.log('Cloudflare route switched successfully:',hostname,'->',next);
      console.log('Every other ingress rule was preserved.');
    } catch(err) {
      if(putAttempted){
        try{await request('PUT',{config});console.error('Original Cloudflare ingress restored.');}
        catch(rollbackError){console.error('ROLLBACK FAILED:',rollbackError.message,
          'Use the backed-up tunnel configuration to restore this hostname.');}
      }
      throw err;
    }
  }
} catch(err) {die(err.message)}
