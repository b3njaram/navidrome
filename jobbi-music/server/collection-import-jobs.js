import express from 'express';
import crypto from 'node:crypto';
import {ensureSocialProfile,normalUsername,socialQuery} from './social-db.js';
import {
  parseCollectionManifest,findLocalSong,pickSoulseekCandidate,
  pickInvidiousCandidate,romanizeMusic,songKey
} from '../src/playlist-export.js';

const MAX_FILE_BYTES=8_000_000;
const ONE_SECOND=1000;
const WAIT_FOR_INDEX_MS=45_000;
const MIN_BETWEEN_STEPS_MS=3000;
const META_FIELDS='id,owner,filename,manifest,status,message,authorized,created_at,updated_at';
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const safeFilename=x=>String(x||'collection.json').replace(/[^a-zA-Z0-9_. -]/g,'_').slice(0,160)||'collection.json';
const key=x=>songKey(x.artist)+'|'+songKey(x.title);
const responseJob=row=>{
  const collections=row.manifest?.collections||[];
  let total=0,finished=0,queued=0,review=0,pending=0;
  for(const collection of collections)for(const track of collection.tracks||[]){
    total++;
    if(['added','hearted'].includes(track.status))finished++;
    else if(['queued','waiting'].includes(track.status))queued++;
    else if(['review','failed'].includes(track.status))review++;
    else pending++;
  }
  return {id:row.id,filename:row.filename,status:row.status,
    message:row.message,authorized:row.authorized,
    total,completed:finished,queued,review,pending,
    collections:collections.map(c=>({id:c.id,name:c.name,kind:c.kind,
      total:c.tracks.length,destinationId:c.destinationId||null})),
    createdAt:row.created_at,updatedAt:row.updated_at};
};

export function summarizeCollectionJob(row){return responseJob(row)}

function checkJobID(id){
  if(!uuid.test(String(id||'')))throw Object.assign(Error('Invalid collection job ID'),{status:400});
  return id;
}
function sendError(res,error){
  const status=Number(error?.status)||503;
  res.status(status>=400&&status<=599?status:503)
    .json({error:(error?.status?error.message:'Collection importer temporarily unavailable.').slice(0,250)});
}
function eligibleTracks(collections){
  return collections.flatMap(c=>c.tracks.map(track=>({collection:c,track})));
}
function firstPending(state,now){
  const rows=eligibleTracks(state.collections||[]);
  const waiting=rows.filter(x=>x.track.status==='unsearched'&&
    (Number(x.track.retryAt)||0)<=now);
  if(waiting.length)return {row:waiting[0],mode:'search'};
  const downloading=rows.filter(x=>['queued','waiting'].includes(x.track.status)&&
    (Number(x.track.retryAt)||0)<=now);
  if(downloading.length)return {row:downloading[0],mode:'reconcile'};
  return null;
}

export function createCollectionJobsRouter({mustAuth,getSession,port}){
  const router=express.Router();
  let running=false;
  let timer;
  let lastDiagnostic=0;

  // Authentication remains exactly the same as for browser or native clients.
  // Tokens and Navidrome credentials stay in RAM, never in the job database.
  async function localAPI(session,path,{method='GET',body}={}){
    const address='http://127.0.0.1:'+port+path;
    const headers={Cookie:'jobbi_session='+session.token,
      Accept:'application/json'};
    if(method!=='GET'){
      headers['X-CSRF-Token']=session.csrf;
      headers['Content-Type']='application/json';
    }
    const reply=await fetch(address,{method,headers,
      body:method==='GET'?undefined:JSON.stringify(body||{}),
      signal:AbortSignal.timeout(30000)});
    let result={};
    try{result=await reply.json()}catch{}
    if(!reply.ok){
      const error=new Error(result.error||'Music server error '+reply.status);
      error.status=reply.status;
      error.retryAfterSeconds=Math.min(900,Math.max(0,
        Number(reply.headers.get('Retry-After'))||Number(result.retryAfterSeconds)||0));
      throw error;
    }
    return result;
  }
  async function searchLibrary(session,track){
    const q=encodeURIComponent(String(track.title).slice(0,120));
    const result=await localAPI(session,'/api/search?q='+q);
    return findLocalSong(track,result.song||[])||null;
  }
  async function saveState(job,state,status=job.status,message=job.message){
    const saved=await socialQuery('UPDATE collection_import_jobs SET manifest=$2::jsonb,status=$3,message=$4,updated_at=now(),lease_until=NULL WHERE id=$1 AND status IN (\'running\',\'monitoring\',\'reauth\') RETURNING id',
      [job.id,JSON.stringify(state),status,String(message||'').slice(0,300)]);
    if(!saved.rowCount)throw Error('Job was paused or cancelled');
  }
  async function applySong(job,session,state,collection,track,song){
    if(!song?.id)throw Error('Recording not indexed yet');
    if(collection.kind==='favorites'){
      await localAPI(session,'/api/star',{method:'POST',body:{id:song.id,starred:true}});
      track.status='hearted';
    }else{
      if(!collection.destinationId){
        const created=await localAPI(session,'/api/playlists',
          {method:'POST',body:{name:collection.name}});
        const id=created?.playlist?.id;
        if(!id)throw Error('Navidrome did not create the destination playlist');
        collection.destinationId=id;
        // Save the ID immediately so a restarted job never creates a second
        // playlist after a successful createPlaylist response.
        await saveState(job,state,'running','Created '+collection.name);
      }
      const existing=await localAPI(session,'/api/playlists/'+
        encodeURIComponent(collection.destinationId));
      if(!(existing.entry||[]).some(x=>x.id===song.id))
        await localAPI(session,'/api/playlists/'+
          encodeURIComponent(collection.destinationId),
          {method:'PATCH',body:{addSongId:song.id}});
      track.status='added';
    }
    track.songId=song.id;
    track.note='Added to '+(collection.kind==='favorites'?'Favorites':collection.name);
    delete track.retryAt;
  }
  async function findRemote(session,item){
    const query=(item.artist+' '+item.title).slice(0,140);
    const latin=romanizeMusic(query);
    const variants=latin===query.toLowerCase()?[query]:[query,latin];
    let soulseekNote='No matching studio audio on Soulseek';
    for(const q of variants){
      try{
        const result=await localAPI(session,'/api/soulseek/search',
          {method:'POST',body:{query:q}});
        const chosen=pickSoulseekCandidate(item,result.results||[]);
        if(chosen)return {candidate:chosen,source:'soulseek'};
        if(result.message)soulseekNote=result.message;
      }catch(error){
        if(error.status===429||error.status===401)throw error;
        soulseekNote='Soulseek unavailable: '+error.message;
        break;
      }
    }
    let invidiousNote='No verified Invidious audio';
    for(const q of variants){
      try{
        const result=await localAPI(session,'/api/invidious/search?q='+
          encodeURIComponent(q));
        const chosen=pickInvidiousCandidate(item,result.results||[]);
        if(chosen)return {candidate:chosen,source:'invidious'};
        if(result.message)invidiousNote=result.message;
      }catch(error){
        if(error.status===429||error.status===401)throw error;
        invidiousNote='Invidious unavailable: '+error.message;
        break;
      }
    }
    return {candidate:null,note:soulseekNote+'; '+invidiousNote};
  }
  async function queueCandidate(session,track,candidate,source){
    if(source==='invidious'){
      const available=await localAPI(session,'/api/invidious/status');
      if(!available.importEnabled)return {review:available.message||
        'Enable optional Invidious NAS audio worker for fallback downloads'};
      const data=await localAPI(session,'/api/invidious/import',{
        method:'POST',
        body:{videoId:candidate.videoId,artist:track.artist,title:track.title,authorized:true}
      });
      return {id:data.jobId||null};
    }
    const data=await localAPI(session,'/api/music-imports',{
      method:'POST',body:{username:candidate.username,filename:candidate.filename,
        size:Number(candidate.size),artist:track.artist,title:track.title}
    });
    return {id:data.importId||null};
  }
  async function processTrack(job,session,state,collection,track,mode){
    const already=await searchLibrary(session,track);
    if(already){
      await applySong(job,session,state,collection,track,already);
      return 'Added '+track.title;
    }
    if(mode==='reconcile'){
      track.status='queued';
      track.retryAt=Date.now()+WAIT_FOR_INDEX_MS;
      track.note='Waiting for NAS download and Navidrome indexing';
      return 'Monitoring downloads';
    }
    // Music represented in multiple collections is queued once, then applied
    // to each collection when it is indexed in Navidrome.
    const duplicate=eligibleTracks(state.collections).find(x=>
      x.track!==track&&key(x.track)===key(track)&&
      ['queued','waiting'].includes(x.track.status));
    if(duplicate){
      track.status='queued';
      track.source=duplicate.track.source;
      track.importId=duplicate.track.importId||null;
      track.note='Shared recording already queued; waiting for indexing';
      track.retryAt=Date.now()+WAIT_FOR_INDEX_MS;
      return 'Waiting for another collection to download '+track.title;
    }
    const found=await findRemote(session,track);
    if(!found.candidate){
      track.status='review';
      track.note=found.note||'No verified recording found';
      return 'Needs review: '+track.title;
    }
    track.source=found.source;
    track.format=found.candidate.format;
    track.note='Verified '+track.format+' recording';
    if(!job.authorized){
      track.status='review';
      track.note+=' (download authorization needed)';
      return track.note;
    }
    const submitted=await queueCandidate(session,track,found.candidate,found.source);
    if(submitted.review){
      track.status='review';
      track.note=submitted.review;
      return 'Needs review: '+track.title;
    }
    track.status='queued';
    track.importId=submitted.id;
    track.retryAt=Date.now()+WAIT_FOR_INDEX_MS;
    track.note='Queued '+track.format+' to NAS; waiting for library indexing';
    return 'Queued '+track.title+' ('+track.format+')';
  }
  async function tick(){
    if(running)return;
    running=true;
    try{
      const result=await socialQuery('SELECT '+META_FIELDS+' FROM collection_import_jobs WHERE status IN (\'running\',\'monitoring\',\'reauth\') ORDER BY updated_at ASC LIMIT 12');
      for(const job of result.rows){
        const session=getSession(job.owner);
        if(!session){
          if(job.status!=='reauth')await socialQuery('UPDATE collection_import_jobs SET status=$2,message=$3,updated_at=now() WHERE id=$1 AND status IN (\'running\',\'monitoring\')',
            [job.id,'reauth','Sign in to Jobbi Music again to resume this saved import']);
          continue;
        }
        // Multiple Node instances or restarts must not process the same row.
        const lock=await socialQuery('UPDATE collection_import_jobs SET lease_until=now()+interval \'120 seconds\' WHERE id=$1 AND (lease_until IS NULL OR lease_until<now()) AND status IN (\'running\',\'monitoring\',\'reauth\') RETURNING id',[job.id]);
        if(!lock.rowCount)continue;
        const state=job.manifest;
        const candidate=firstPending(state,Date.now());
        if(!candidate){
          const rows=eligibleTracks(state.collections);
          const waiting=rows.filter(x=>['queued','waiting'].includes(x.track.status));
          const future=rows.some(x=>x.track.status==='unsearched');
          const status=waiting.length?'monitoring':future?'running':'finished';
          await saveState(job,state,status,waiting.length?
            'Waiting for '+waiting.length+' NAS downloads to appear in your library':
            future?'Waiting for temporary download cooldown':'Import scan finished');
          break;
        }
        try{
          const message=await processTrack(job,session,state,
            candidate.row.collection,candidate.row.track,candidate.mode);
          const rows=eligibleTracks(state.collections);
          const waiting=rows.some(x=>['queued','waiting'].includes(x.track.status));
          const pending=rows.some(x=>x.track.status==='unsearched');
          await saveState(job,state,pending?'running':waiting?'monitoring':'finished',
            !pending&&!waiting?'Import scan finished':message);
        }catch(error){
          if(error.message==='Job was paused or cancelled')break;
          // Only transient errors are retried; no false "no match" results.
          candidate.row.track.retryAt=Date.now()+
            (error.status===429?Math.max(60,Number(error.retryAfterSeconds)||3600)*ONE_SECOND:60_000);
          candidate.row.track.note='Will retry: '+String(error.message||'Temporary server error').slice(0,180);
          if(error.status===401){
            await saveState(job,state,'reauth','Session expired; sign in again to resume');
          }else{
            await saveState(job,state,'running',candidate.row.track.note);
          }
        }
        // Bounded to one track per tick across the NAS, not a daily request cap.
        break;
      }
    }catch(error){
      if(Date.now()-lastDiagnostic>60000){
        console.warn('Collection import worker paused:',String(error.message||error).slice(0,250));
        lastDiagnostic=Date.now();
      }
    }finally{running=false}
  }
  function start(){
    if(timer)return;
    timer=setInterval(()=>{void tick()},MIN_BETWEEN_STEPS_MS);
    timer.unref();
  }
  router.get('/',mustAuth,async(req,res)=>{
    try{
      const owner=normalUsername(req.user.username);
      const results=await socialQuery('SELECT '+META_FIELDS+' FROM collection_import_jobs WHERE owner=$1 ORDER BY created_at DESC LIMIT 25',[owner]);
      res.setHeader('Cache-Control','private, no-store');
      res.json({jobs:results.rows.map(responseJob)});
    }catch(error){sendError(res,error)}
  });
  router.get('/:id',mustAuth,async(req,res)=>{
    try{
      const owner=normalUsername(req.user.username);
      const results=await socialQuery('SELECT '+META_FIELDS+' FROM collection_import_jobs WHERE id=$1 AND owner=$2',
        [checkJobID(req.params.id),owner]);
      if(!results.rowCount)return res.status(404).json({error:'Saved import not found'});
      res.setHeader('Cache-Control','private, no-store');
      res.json({job:responseJob(results.rows[0]),manifest:results.rows[0].manifest});
    }catch(error){sendError(res,error)}
  });
  router.get('/:id/source',mustAuth,async(req,res)=>{
    try{
      const owner=normalUsername(req.user.username);
      const result=await socialQuery('SELECT filename,source_text FROM collection_import_jobs WHERE id=$1 AND owner=$2',
        [checkJobID(req.params.id),owner]);
      if(!result.rowCount)return res.status(404).json({error:'Saved import not found'});
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('Content-Disposition','attachment; filename="'+safeFilename(result.rows[0].filename)+'"');
      res.type(result.rows[0].filename.endsWith('.json')?'application/json':'text/plain')
        .send(result.rows[0].source_text);
    }catch(error){sendError(res,error)}
  });
  router.post('/',mustAuth,async(req,res)=>{
    try{
      const owner=await ensureSocialProfile(req.user.username);
      const source=String(req.body?.content||'');
      const filename=safeFilename(req.body?.filename);
      if(!source||Buffer.byteLength(source,'utf8')>MAX_FILE_BYTES)
        return res.status(413).json({error:'Select a collection export of at most 8 MB'});
      const document=parseCollectionManifest(source,filename);
      if(document.collections.some(c=>!c.tracks.length))
        return res.status(400).json({error:'Each imported collection must contain at least one track'});
      const digest=crypto.createHash('sha256').update(source).digest('hex');
      const existing=await socialQuery('SELECT '+META_FIELDS+' FROM collection_import_jobs WHERE owner=$1 AND fingerprint=$2 AND status NOT IN (\'finished\',\'cancelled\') ORDER BY created_at DESC LIMIT 1',[owner,digest]);
      if(existing.rowCount)return res.json({job:responseJob(existing.rows[0]),existing:true});
      const authorized=req.body?.authorized===true;
      const created=await socialQuery('INSERT INTO collection_import_jobs(owner,filename,source_text,fingerprint,manifest,authorized,status,message) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING '+META_FIELDS,
        [owner,filename,source,digest,JSON.stringify(document),authorized,
          authorized?'running':'paused',authorized?
            'Saved on NAS; matching and downloads continue after the browser closes':
            'Saved on NAS; authorize recording downloads to start']);
      res.status(201).json({job:responseJob(created.rows[0]),existing:false});
    }catch(error){
      if(error instanceof SyntaxError||/invalid metadata|export|track rows|collection|too many song entries/i.test(error.message))
        return res.status(400).json({error:error.message.slice(0,250)});
      sendError(res,error)
    }
  });
  router.post('/:id/control',mustAuth,async(req,res)=>{
    try{
      const owner=normalUsername(req.user.username);
      const action=String(req.body?.action||'');
      if(!['pause','resume','cancel','retry'].includes(action))
        return res.status(400).json({error:'Choose pause, resume, retry or cancel'});
      const match=await socialQuery('SELECT '+META_FIELDS+' FROM collection_import_jobs WHERE id=$1 AND owner=$2',
        [checkJobID(req.params.id),owner]);
      if(!match.rowCount)return res.status(404).json({error:'Saved import not found'});
      const job=match.rows[0];
      if(job.status==='cancelled')return res.status(409).json({error:'Cancelled imports cannot be resumed'});
      if(job.status==='finished'&&action!=='retry')
        return res.status(409).json({error:'Use Retry to check unfinished songs again'});
      const state=job.manifest;
      if(action==='retry'){
        for(const {track} of eligibleTracks(state.collections))
          if(['review','failed'].includes(track.status)){
            track.status='unsearched';track.note='Ready to retry';delete track.retryAt;
          }
      }
      const status=action==='cancel'?'cancelled':action==='pause'?'paused':'running';
      const authorized=job.authorized||req.body?.authorized===true;
      if(status==='running'&&!authorized)
        return res.status(400).json({error:'Confirm you have rights to obtain and save the recordings'});
      const updated=await socialQuery('UPDATE collection_import_jobs SET status=$3,authorized=$4,manifest=$5::jsonb,message=$6,updated_at=now(),lease_until=NULL WHERE id=$1 AND owner=$2 RETURNING '+META_FIELDS,
        [job.id,owner,status,authorized,JSON.stringify(state),
          action==='cancel'?'Import cancelled; saved source retained':
          action==='pause'?'Paused by user':'Import resumed on NAS']);
      res.json({job:responseJob(updated.rows[0])});
    }catch(error){sendError(res,error)}
  });
  return {router,start,tick};
}
