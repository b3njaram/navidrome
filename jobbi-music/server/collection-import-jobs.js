import express from 'express';
import crypto from 'node:crypto';
import {latestTransferSnapshot,findTransfer,transferStage} from './import-progress.js';
import {inspectInvidiousRecordings,repairInvidiousRecording} from './invidious-import.js';
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

/**
 * Diagnose the actual downloader snapshot without changing the saved import.
 * A collection "queued" entry is NOT proof that a peer is downloading it.
 * Missing transfers remain unconfirmed, never falsely marked successful.
 */
export function summarizeCollectionTransferHealth(collections,importRows,snapshot){
  const requests=new Map(importRows.map(row=>[String(row.id),row]));
  const counts={queued:0,active:0,waiting:0,indexing:0,failed:0,
    unconfirmed:0,unknown:0,otherSource:0};
  const examples=[];
  const items=[];
  for(const {track} of eligibleTracks(collections)){
    if(!['queued','waiting'].includes(track.status))continue;
    counts.queued++;
    const id=String(track.importId||'');
    const source=track.source||'unknown';
    if(source!=='soulseek'){counts.otherSource++;continue}
    const row=uuid.test(id)?requests.get(id):null;
    if(!row){counts.unknown++;continue}
    const stage=row.already_on_nas?
      {stage:'existing',label:'Downloader knows this file; Navidrome is not indexed yet'}:
      transferStage(row,findTransfer(row,snapshot.rows),snapshot.healthy);
    const kind=stage.stage;
    if(kind==='downloading')counts.active++;
    else if(kind==='queued')counts.waiting++;
    else if(['indexing','imported','existing','available'].includes(kind))
      counts.indexing++;
    else if(kind==='failed' || (row.status==='needs_review' &&
      !row.already_on_nas && row.import_error))counts.failed++;
    else counts.unconfirmed++;
    if(examples.length<18 && (kind==='failed'||kind==='unconfirmed'||
       (row.status==='needs_review'&&!row.already_on_nas))){
      examples.push({title:track.title,artist:track.artist,
        stage:kind==='failed'?'failed':kind,
        reason:(row.import_error||stage.label||'Status unknown').slice(0,180)});
    }
    items.push({id,stage:kind});
  }
  const uniqueTransfers=new Set(items.map(x=>x.id)).size;
  return {counts,downloaderConnected:snapshot.healthy,
    uniqueTransfers,examples,checkedAt:new Date().toISOString(),
    explanation:'Queued tracks are not necessarily active downloads. A missing transfer is unconfirmed, not automatically failed. No recordings or playlists were changed.'};
}

/**
 * Fallback downloads are separate from Soulseek transfers. The worker may
 * report completed for a file not yet indexed under the correct ID3 metadata.
 * 'File on NAS' is not the same thing as added to Favorites.
 */
export function summarizeFallbackRecordings(tracks,dbRows,snapshot){
  const bySong=new Map();
  for(const row of dbRows){
    const k=key(row);
    if(!bySong.has(k))bySong.set(k,row);
  }
  const byVideo=new Map((snapshot.items||[]).map(row=>[row.videoId,row]));
  const counts={total:tracks.length,onNas:0,active:0,waiting:0,
    failed:0,interrupted:0,missing:0,unconfirmed:0,unknown:0};
  const examples=[];
  const ids=new Set();
  for(const track of tracks){
    const record=bySong.get(key(track));
    if(!record){counts.unknown++;continue}
    ids.add(record.video_id);
    const item=snapshot.connected?byVideo.get(record.video_id):null;
    if(!item){counts.unconfirmed++;continue}
    let stage='unconfirmed';
    if(item.present){counts.onNas++;stage='onNas'}
    else if(item.status==='running'){counts.active++;stage='active'}
    else if(item.status==='queued'){counts.waiting++;stage='waiting'}
    else if(['failed','needs_review'].includes(item.status)){counts.failed++;stage='failed'}
    else if(item.status==='interrupted'){counts.interrupted++;stage='interrupted'}
    else if(item.status==='completed'){counts.missing++;stage='missing'}
    else{counts.unconfirmed++}
    if(examples.length<12&&['failed','interrupted','missing'].includes(stage))
      examples.push({title:track.title,artist:track.artist,stage});
  }
  return {connected:snapshot.connected,reason:snapshot.reason||null,
    counts,uniqueVideoIds:ids.size,examples,
    explanation:'An MP3 on NAS still needs correct tags and Navidrome indexing before it can be added to Favorites.'};
}

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

/**
 * Safe manual recovery of "review" rows: never launch another download for
 * a recording with an outstanding request ID. Instead, reconcile that
 * request against Navidrome and its tracked downloader state first.
 * New searches are limited to rows with no earlier transfer identity.
 */
export function prepareSafeImportRetry(state,now=Date.now()){
  const counts={recheck:0,research:0,untouched:0};
  for(const {track} of eligibleTracks(state.collections||[])){
    if(!['review','failed'].includes(track.status)){counts.untouched++;continue}
    if(track.importId){
      track.status='queued';
      track.retryAt=now;
      track.note='Rechecking existing NAS transfer; no duplicate download requested';
      counts.recheck++;
    }else{
      track.status='unsearched';
      track.retryAt=now;
      track.note='Ready to search again (no previous transfer ID)';
      counts.research++;
    }
  }
  return counts;
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

export function createCollectionJobsRouter({
  mustAuth,getSession,port,downloader,invidiousWorkerUrl,invidiousWorkerSecret
}){
  const router=express.Router();
  let running=false;
  let timer;
  let lastDiagnostic=0;
  let cachedTransfers={at:0,snapshot:null};
  let lastMetadataScanAt=0;
  async function transferSnapshot(){
    if(!cachedTransfers.snapshot || Date.now()-cachedTransfers.at>25_000){
      cachedTransfers.snapshot=await latestTransferSnapshot(downloader);
      cachedTransfers.at=Date.now();
    }
    return cachedTransfers.snapshot;
  }

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
  async function saveState(job,state,status=job.status,message=job.message,releaseLease=true){
    const saved=await socialQuery(`UPDATE collection_import_jobs SET
      manifest=$2::jsonb,status=$3,message=$4,updated_at=now(),
      lease_until=CASE WHEN $5 THEN NULL ELSE now()+interval '120 seconds' END
      WHERE id=$1 AND status IN ('running','monitoring','reauth') RETURNING id`,
      [job.id,JSON.stringify(state),status,String(message||'').slice(0,300),releaseLease]);
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
        await saveState(job,state,'running','Created '+collection.name,false);
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
      // An accepted queue request is not proof that a peer is downloading.
      // Once the downloader explicitly reports failure, stop waiting forever.
      if(track.source==='soulseek' && uuid.test(String(track.importId||''))){
        const result=await socialQuery(`SELECT id,requester,peer_username,
          downloader_job_id,filename,status,created_at,already_on_nas,import_error
          FROM music_import_requests WHERE requester=$1 AND id=$2`,
          [job.owner,track.importId]);
        if(result.rowCount){
          const request=result.rows[0];
          if(request.status==='needs_review'&&!request.already_on_nas&&
             request.import_error){
            track.status='review';
            track.note='Downloader needs review: '+String(request.import_error).slice(0,190);
            delete track.retryAt;
            return track.note;
          }
          const snapshot=await transferSnapshot();
          if(snapshot.healthy){
            const detail=transferStage(request,
              findTransfer(request,snapshot.rows),snapshot.healthy);
            if(detail.stage==='failed'){
              track.status='review';
              track.note='Transfer failed: '+detail.label;
              delete track.retryAt;
              return track.note;
            }
            track.note=detail.label;
            return detail.label;
          }
          track.note='Downloader status unavailable; waiting for NAS indexing';
          return track.note;
        }
      }
      if(track.source==='invidious' &&
        Date.now()-(Number(track.lastTagCheckAt)||0)>15*60*1000){
        // This imported video may have been downloaded successfully but
        // indexed with YouTube's title/uploader rather than the saved song.
        // Repair ID3 tags *in place* by the user's verified import record.
        track.lastTagCheckAt=Date.now();
        const request=await socialQuery(`SELECT video_id FROM invidious_imports
          WHERE requester=$1 AND title=$2 AND artist=$3
          ORDER BY created_at DESC LIMIT 1`,
          [job.owner,track.title,track.artist]);
        if(request.rowCount){
          const repair=await repairInvidiousRecording({
            url:invidiousWorkerUrl,secret:invidiousWorkerSecret,
            owner:job.owner,videoId:request.rows[0].video_id,
            title:track.title,artist:track.artist
          });
          if(repair.status==='tagged'){
            track.note='Downloaded MP3 tags repaired; awaiting Navidrome indexing';
            // Scans are intentionally coalesced. Do not trigger hundreds of
            // overlapping scans for a large saved Favorites migration.
            if(Date.now()-lastMetadataScanAt>15*60*1000){
              lastMetadataScanAt=Date.now();
              try{await localAPI(session,'/api/library/scan',{method:'POST'})}
              catch{track.note+=' (Navidrome scan requires admin access)'}
            }
            return track.note;
          }
          if(repair.status==='already_tagged'){
            track.note='Downloaded MP3 is tagged; waiting for Navidrome scan';
            return track.note;
          }
          if(repair.status==='tagging_failed'){
            track.status='review';
            track.note='Downloaded MP3 needs metadata repair on NAS';
            delete track.retryAt;
            return track.note;
          }
          if(repair.status==='worker_unavailable'){
            track.note='Fallback worker cannot confirm the recording; retry status later';
            return track.note;
          }
          if(repair.status==='file_not_found'){
            track.note='Fallback recording not yet located on NAS; verify its worker job';
            return track.note;
          }
        }
      }
      track.note='Queued or awaiting indexing; transfer not verified active';
      return track.note;
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
        // One remote search per tick. Once searching is finished, check up to
        // five previously queued songs without submitting any new downloads.
        // Hold the lease until the whole batch is persisted: another Node
        // process must never reconcile the same collection concurrently.
        let message='Checking NAS library';
        let overrideStatus=null;
        let shouldSave=true;
        for(let reconciled=0;reconciled<5;reconciled++){
          const candidate=firstPending(state,Date.now());
          if(!candidate)break;
          try{
            message=await processTrack(job,session,state,
              candidate.row.collection,candidate.row.track,candidate.mode);
          }catch(error){
            if(error.message==='Job was paused or cancelled'){
              shouldSave=false;
              break;
            }
            candidate.row.track.retryAt=Date.now()+
              (error.status===429?Math.max(60,Number(error.retryAfterSeconds)||3600)*ONE_SECOND:60_000);
            candidate.row.track.note='Will retry: '+String(error.message||'Temporary server error').slice(0,180);
            message=candidate.row.track.note;
            if(error.status===401){
              overrideStatus='reauth';
              message='Session expired; sign in again to resume';
            }
            break;
          }
          if(candidate.mode!=='reconcile')break;
        }
        if(shouldSave){
          const rows=eligibleTracks(state.collections);
          const waiting=rows.some(x=>['queued','waiting'].includes(x.track.status));
          const pending=rows.some(x=>x.track.status==='unsearched');
          const status=overrideStatus||
            (pending?'running':waiting?'monitoring':'finished');
          if(!waiting&&!pending&&!overrideStatus)message='Import scan finished';
          else if(waiting&&!pending&&message==='Checking NAS library')
            message='Waiting for queued NAS recordings to appear in the library';
          await saveState(job,state,status,message);
        }
        // Only one collection job runs per tick to keep NAS demand predictable.
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
  router.get('/:id/transfer-health',mustAuth,async(req,res)=>{
    try{
      const owner=normalUsername(req.user.username);
      const id=checkJobID(req.params.id);
      const result=await socialQuery('SELECT '+META_FIELDS+
        ' FROM collection_import_jobs WHERE id=$1 AND owner=$2',[id,owner]);
      if(!result.rowCount)return res.status(404).json({error:'Saved import not found'});
      const rows=eligibleTracks(result.rows[0].manifest.collections||[])
        .map(x=>x.track)
        .filter(x=>['queued','waiting'].includes(x.status) && x.source==='soulseek' &&
          uuid.test(String(x.importId||'')));
      const ids=[...new Set(rows.map(x=>String(x.importId)))].slice(0,5000);
      let records=[];
      if(ids.length){
        const data=await socialQuery(`SELECT id,requester,peer_username,downloader_job_id,
          already_on_nas,import_error,filename,status,created_at
          FROM music_import_requests WHERE requester=$1 AND id=ANY($2::uuid[])`,[owner,ids]);
        records=data.rows;
      }
      const snapshot=await latestTransferSnapshot(downloader);
      const collections=result.rows[0].manifest.collections||[];
      const diagnostic=summarizeCollectionTransferHealth(
        collections,records,snapshot);
      const alternatives=eligibleTracks(collections)
        .map(x=>x.track).filter(x=>['queued','waiting'].includes(x.status) &&
          x.source==='invidious');
      let fallback=null;
      if(alternatives.length){
        const imported=await socialQuery(`SELECT video_id,title,artist,status
          FROM invidious_imports WHERE requester=$1
          ORDER BY created_at DESC LIMIT 5000`,[owner]);
        const bySong=new Map();
        for(const row of imported.rows){
          const k=key(row);
          if(!bySong.has(k))bySong.set(k,row);
        }
        const videoIds=[...new Set(alternatives.map(track=>
          bySong.get(key(track))?.video_id).filter(Boolean))];
        const state=await inspectInvidiousRecordings({
          url:invidiousWorkerUrl,secret:invidiousWorkerSecret,
          owner,videoIds
        });
        fallback=summarizeFallbackRecordings(alternatives,imported.rows,state);
      }
      res.setHeader('Cache-Control','private, no-store');
      res.json({...diagnostic,fallback,
        limited:new Set(rows.map(x=>String(x.importId))).size>ids.length});
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
      let retryCounts=null;
      if(action==='retry'){
        retryCounts=prepareSafeImportRetry(state);
        if(retryCounts.recheck+retryCounts.research===0)
          return res.status(409).json({error:'No unmatched or failed songs to retry.'});
      }
      const status=action==='cancel'?'cancelled':action==='pause'?'paused':'running';
      const authorized=job.authorized||req.body?.authorized===true;
      if(status==='running'&&!authorized)
        return res.status(400).json({error:'Confirm you have rights to obtain and save the recordings'});
      const updated=await socialQuery('UPDATE collection_import_jobs SET status=$3,authorized=$4,manifest=$5::jsonb,message=$6,updated_at=now(),lease_until=NULL WHERE id=$1 AND owner=$2 RETURNING '+META_FIELDS,
        [job.id,owner,status,authorized,JSON.stringify(state),
          action==='cancel'?'Import cancelled; saved source retained':
          action==='pause'?'Paused by user':action==='retry'?
            ('Recovery requested: '+retryCounts.recheck+' old transfers to recheck, '+
              retryCounts.research+' songs to search again'):
            'Import resumed on NAS']);
      res.json({job:responseJob(updated.rows[0]),...(retryCounts?{retry:retryCounts}:{})});
    }catch(error){sendError(res,error)}
  });
  return {router,start,tick};
}
