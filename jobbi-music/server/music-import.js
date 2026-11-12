import express from 'express';
import { promises as fs } from 'node:fs';
import {ensureSocialProfile,normalUsername,socialQuery,withSocialTransaction} from './social-db.js';
import {ImportError,validateImportSelection,queueMusicImport} from './music-requests.js';
import {latestTransferSnapshot,findTransfer,transferStage} from './import-progress.js';
import {libraryQueries,matchingLibrarySong,groupMusicImports,musicKey} from './import-reconcile.js';

const MIN_FREE_BYTES=4*1024**3;
const MAX_FILE_BYTES=350*1024**2;
const CATALOG_CACHE_MS=45000;
const catalogCache=new Map();
function respondError(res,e){
  const known=e instanceof ImportError;
  res.status(known?e.status:503).json({error:known?e.message:'Music import temporarily unavailable. Please retry.'});
}
export async function checkStorageStats(file,bytes,{now=Date.now()}={}){
  let data;
  try{data=JSON.parse(await fs.readFile(file,'utf8'));}
  catch{throw new ImportError('Cannot read NAS storage status. Check the storage monitor before importing.',503);}
  const age=now-Date.parse(data.checkedAt||'');
  if(data.status!=='ready'||!Number.isFinite(data.freeBytes)||!Number.isFinite(age)||age<0||age>90*60000)
    throw new ImportError('NAS storage figures are not current. Try again after the next storage scan.',503);
  if(data.freeBytes<MIN_FREE_BYTES+bytes)
    throw new ImportError('NAS storage is too low for new imports (4 GB reserve).',507);
  return data;
}
export function createMusicImportRouter({mustAuth,downloader,statsFile,subsonic}){
  const router=express.Router();
  router.get('/',mustAuth,async(req,res)=>{
    try{
      const actor=normalUsername(req.user.username);
      const rows=await socialQuery(`SELECT id,peer_username,downloader_job_id,already_on_nas,
        import_error,filename,size_bytes,artist,title,status,created_at
        FROM music_import_requests WHERE requester=$1 AND archived_at IS NULL
        AND status IN ('queued','processing','needs_review')
        ORDER BY created_at DESC LIMIT 60`,[actor]);
      const snapshot=await latestTransferSnapshot(downloader);
      const items=rows.rows.map(row=>{
        const job=row.already_on_nas?null:findTransfer(row,snapshot.rows);
        const stage=row.already_on_nas?
          {stage:'existing',label:'Downloader index reports a duplicate · not yet verified in Navidrome',progress:null}:
          transferStage(row,job,snapshot.healthy);
        return {id:row.id,filename:row.filename,size:Number(row.size_bytes),
          artist:row.artist,title:row.title,submittedAt:row.created_at,
          ...stage,archivable:!['downloading','indexing','imported','available'].includes(stage.stage),
          // Historical import failures had no stored error. Do not infer
          // from a missing active transfer that a specific download succeeded.
          reason:row.import_error?String(row.import_error).slice(0,200):null
        };
      });
      // Repeated imports for the same artist/title are one visible item,
      // while history remains unchanged in the social database.
      const groups=groupMusicImports(items);
      const needsCatalog=groups.filter(x=>['imported','indexing','existing','unconfirmed','queued'].includes(x.stage))
        .slice(0,6);
      if(subsonic){
        for(const item of needsCatalog){
          const key=actor+'|'+musicKey(item.artist)+'|'+musicKey(item.title);
          const hit=catalogCache.get(key);
          let match=hit&&Date.now()-hit.at<CATALOG_CACHE_MS?hit.song:undefined;
          if(match===undefined){
            match=null;
            for(const query of libraryQueries(item)){
              try{
                const d=await subsonic(req.user,'search3',{query,
                  songCount:80,albumCount:0,artistCount:0});
                match=matchingLibrarySong(item,d.searchResult3?.song||[]);
                if(match)break;
              }catch{ /* Keep the original stage; don't report a false success. */ }
            }
            catalogCache.set(key,{at:Date.now(),song:match});
            if(catalogCache.size>500){
              const oldest=catalogCache.keys().next().value;
              catalogCache.delete(oldest);
            }
          }
          if(match?.id){
            item.stage='available';
            item.label='Available in your Navidrome library';
            item.progress=100;
            item.songId=match.id;
            item.archiveIds=[];
          }
        }
      }
      res.setHeader('Cache-Control','private, no-store');
      res.json({items:groups,downloaderConnected:snapshot.healthy,
        checkedAt:new Date().toISOString()});
    }catch(e){respondError(res,e)}
  });
  router.post('/archive',mustAuth,async(req,res)=>{
    try{
      const ids=req.body?.ids;
      if(!Array.isArray(ids)||ids.length<1||ids.length>60||
        ids.some(x=>typeof x!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x)))
        return res.status(400).json({error:'Select valid import entries to hide'});
      const actor=normalUsername(req.user.username);
      const result=await socialQuery(`UPDATE music_import_requests
        SET archived_at=now(),updated_at=now()
        WHERE requester=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL
        RETURNING id`,[actor,[...new Set(ids)]]);
      // No Soulseek API call: archiving hides history only and does not cancel
      // or delete any transfer, file, or Navidrome song.
      res.json({archived:result.rowCount,deletedFiles:0,canceledTransfers:0});
    }catch(e){respondError(res,e)}
  });
  router.post('/',mustAuth,async(req,res)=>{
    let id;
    try{
      const song=validateImportSelection(req.body);
      if(song.size>MAX_FILE_BYTES)throw new ImportError('Maximum single audio import is 350 MB.',413);
      if(!downloader)throw new ImportError('Soulseek downloader is not configured on this NAS.',503);
      await checkStorageStats(statsFile,song.size);
      const actor=await ensureSocialProfile(req.user.username);
      const row=await withSocialTransaction(async client=>{
        await client.query('SELECT pg_advisory_xact_lock(90280913)');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['jobbi-import:'+actor]);
        const duplicate=await client.query(`SELECT 1 FROM music_import_requests
          WHERE requester=$1 AND peer_username=$2 AND filename=$3
            AND created_at>now()-interval '12 hours'
            AND status IN ('processing','queued') LIMIT 1`,[actor,song.username,song.filename]);
        if(duplicate.rowCount)throw new ImportError('This recording is already queued for import.',409);
        // Large personal library migrations are intentionally not capped by an
        // artificial daily track/GB limit. Every audio file still passes
        // extension, deduplication and fresh NAS free-space validation.
        const added=await client.query(`INSERT INTO music_import_requests
          (id,requester,peer_username,filename,size_bytes,artist,title,status)
          VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,'processing') RETURNING id`,
          [actor,song.username,song.filename,song.size,song.artist,song.title]);
        return added.rows[0];
      });
      id=row.id;
      try{
        const imported=await queueMusicImport(downloader,song);
        const ref=imported.details?.job_id||imported.details?.jobId||imported.details?.id;
        const jobId=typeof ref==='string'&&ref.length<=200?ref:null;
        await socialQuery(`UPDATE music_import_requests
          SET status='queued',downloader_job_id=$2,updated_at=now() WHERE id=$1`,[id,jobId]);
        return res.status(202).json({queued:true,importId:id,message:'Import queued for the shared NAS library.',
          details:imported.details});
      }catch(e){
        // The NAS downloader reports HTTP 409 when its tag-based library index
        // already recognizes a recording. This is NOT an ambiguous transfer,
        // and must not be displayed as a failed download.
        if(e instanceof ImportError&&e.status===409&&
          /already (?:in|present|exist)|music folder|already indexed|duplicate (?:song|track)/i.test(e.message)){
          await socialQuery(`UPDATE music_import_requests
            SET status='needs_review',already_on_nas=TRUE,
              import_error='Downloader index reports recording already in Music folder',
              updated_at=now() WHERE id=$1`,[id]);
          return res.status(200).json({existing:true,importId:id,
            message:'Already in your NAS music collection. Check the library for this track.'});
        }
        await socialQuery(`UPDATE music_import_requests
          SET status='needs_review',import_error=$2,updated_at=now() WHERE id=$1`,
          [id,String(e?.message||'Transfer status unknown').slice(0,200)]).catch(()=>{});
        throw e;
      }
    }catch(e){respondError(res,e)}
  });
  return router;
}
