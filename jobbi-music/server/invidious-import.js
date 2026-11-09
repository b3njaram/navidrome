import express from 'express';
import crypto from 'node:crypto';
import {ensureSocialProfile,socialQuery,withSocialTransaction} from './social-db.js';
import {checkStorageStats} from './music-import.js';
import {videoIdValid,configuredInvidious} from './invidious.js';

const SOURCE_RESERVE=180*1024**2;
const isAllowedWorker=(url,secret)=>url==='http://jobbi-invidious-worker:8091'&&secret?.length>=32;
const keyForUser=x=>'user-'+crypto.createHash('sha256').update(x).digest('hex').slice(0,44);
async function requestWorker(url,secret,method,path,body){
  const response=await fetch(url+path,{
    method,redirect:'error',headers:{'X-Worker-Token':secret,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)
  });
  const raw=await response.text();
  if(raw.length>50000)throw Error('Import worker sent too much data');
  let data;try{data=JSON.parse(raw)}catch{throw Error('Import worker sent invalid JSON')}
  return {status:response.status,ok:response.ok,data};
}
export function createInvidiousImportRouter({mustAuth,url,secret,statsFile}){
  const router=express.Router();
  const enabled=isAllowedWorker(url,secret);
  router.get('/status',mustAuth,async(req,res)=>{
    if(!enabled)return res.json({configured:configuredInvidious().length>0,importEnabled:false,
      message:'Invidious search is available. Enable the optional import worker for audio downloads.'});
    try{
      const result=await requestWorker(url,secret,'GET','/health');
      res.json({configured:configuredInvidious().length>0,
        importEnabled:result.ok&&result.data?.ok===true,
        message:result.ok?'Import worker connected':'Import worker unhealthy'});
    }catch{
      res.json({configured:configuredInvidious().length>0,importEnabled:false,
        message:'Import worker not reachable. Invidious discovery links still work.'});
    }
  });
  router.get('/jobs',mustAuth,async(req,res)=>{
    if(!enabled)return res.json({jobs:[]});
    try{
      const user=keyForUser(req.user.username.toLowerCase());
      const result=await requestWorker(url,secret,'GET','/jobs?owner='+encodeURIComponent(user));
      if(!result.ok)return res.status(502).json({error:'Could not read import jobs'});
      res.json({jobs:Array.isArray(result.data.jobs)?result.data.jobs:[]});
    }catch{return res.status(503).json({error:'Fallback import worker is not available'});}
  });
  router.post('/import',mustAuth,async(req,res)=>{
    if(!enabled)return res.status(503).json({error:'Fallback audio imports need the optional NAS import worker'});
    const videoId=String(req.body?.videoId||'');
    const title=String(req.body?.title||'').trim().slice(0,200);
    const artist=String(req.body?.artist||'').trim().slice(0,140);
    if(!videoIdValid(videoId)||!title||!artist||req.body?.authorized!==true)
      return res.status(400).json({error:'Choose a valid recording and confirm you have permission to save it'});
    let id;
    try{
      await checkStorageStats(statsFile,SOURCE_RESERVE);
      const actor=await ensureSocialProfile(req.user.username);
      id=await withSocialTransaction(async client=>{
        await client.query('SELECT pg_advisory_xact_lock(90280914)');
        const prior=await client.query(`SELECT 1 FROM invidious_imports
          WHERE video_id=$1 AND status IN ('processing','queued')
          AND created_at>now()-interval '30 days' LIMIT 1`,[videoId]);
        if(prior.rowCount)return {error:'Recording has already been submitted for import',status:409};
        const daily=await client.query(`SELECT requester,COUNT(*)::int AS n FROM invidious_imports
          WHERE created_at>now()-interval '24 hours'
          AND status IN ('processing','queued')
          GROUP BY requester`);
        const mine=daily.rows.find(x=>x.requester===actor);
        if(Number(mine?.n||0)>=5)return {error:'You reached the 5-video daily import limit',status:429};
        const globalCount=daily.rows.reduce((n,x)=>n+Number(x.n),0);
        if(globalCount>=40)return {error:'The shared daily import budget has been reached',status:429};
        const row=await client.query(`INSERT INTO invidious_imports
          (id,requester,video_id,title,artist,status)
          VALUES($1,$2,$3,$4,$5,'processing') RETURNING id`,
          [crypto.randomUUID(),actor,videoId,title,artist]);
        return row.rows[0].id;
      });
      if(typeof id==='object')return res.status(id.status).json({error:id.error});
      const user=keyForUser(actor);
      const worker=await requestWorker(url,secret,'POST','/import',
        {owner:user,videoId,title,artist});
      if(!worker.ok){
        await socialQuery(`UPDATE invidious_imports SET status='failed',updated_at=now() WHERE id=$1`,[id]).catch(()=>{});
        return res.status(worker.status>=400&&worker.status<600?worker.status:502)
          .json({error:String(worker.data?.error||'Import worker refused this recording').slice(0,180)});
      }
      await socialQuery(`UPDATE invidious_imports SET status='queued',updated_at=now() WHERE id=$1`,[id]);
      res.status(202).json({queued:true,jobId:worker.data.jobId,source:'invidious'});
    }catch(e){
      if(id&&typeof id==='string')await socialQuery(`UPDATE invidious_imports
        SET status='needs_review',updated_at=now() WHERE id=$1`,[id]).catch(()=>{});
      res.status(503).json({error:'Cannot confirm audio import. Check NAS storage and worker logs.'});
    }
  });
  return router;
}
