import express from 'express';
import { promises as fs } from 'node:fs';
import {ensureSocialProfile,normalUsername,socialQuery,withSocialTransaction} from './social-db.js';
import {ImportError,validateImportSelection,queueMusicImport} from './music-requests.js';

const MIN_FREE_BYTES=4*1024**3;
const MAX_FILE_BYTES=350*1024**2;
const MAX_DAY_BYTES=2*1024**3;
const GLOBAL_DAY_BYTES=10*1024**3;
const MAX_DAY_JOBS=20;
const GLOBAL_DAY_JOBS=80;
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
export function createMusicImportRouter({mustAuth,downloader,statsFile}){
  const router=express.Router();
  router.get('/',mustAuth,async(req,res)=>{
    try{
      const actor=normalUsername(req.user.username);
      const rows=await socialQuery(`SELECT id,peer_username AS username,filename,size_bytes,artist,title,status,created_at
        FROM music_import_requests WHERE requester=$1
        AND status IN ('queued','processing','needs_review')
        ORDER BY created_at DESC LIMIT 60`,[actor]);
      res.json({items:rows.rows.map(x=>({...x,size:Number(x.size_bytes)}))});
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
        const mine=await client.query(`SELECT COUNT(*)::int AS jobs,
          COALESCE(SUM(size_bytes),0)::bigint AS bytes FROM music_import_requests
          WHERE requester=$1 AND created_at>now()-interval '24 hours'
            AND status IN ('processing','queued')`,[actor]);
        const usage=mine.rows[0];
        if(usage.jobs>=MAX_DAY_JOBS||Number(usage.bytes)+song.size>MAX_DAY_BYTES)
          throw new ImportError('Daily import allowance reached (20 tracks / 2 GB).',429);
        const all=await client.query(`SELECT COUNT(*)::int AS jobs,
          COALESCE(SUM(size_bytes),0)::bigint AS bytes FROM music_import_requests
          WHERE created_at>now()-interval '24 hours'
            AND status IN ('processing','queued')`);
        if(all.rows[0].jobs>=GLOBAL_DAY_JOBS||Number(all.rows[0].bytes)+song.size>GLOBAL_DAY_BYTES)
          throw new ImportError('Shared library daily import budget reached.',429);
        const added=await client.query(`INSERT INTO music_import_requests
          (id,requester,peer_username,filename,size_bytes,artist,title,status)
          VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,'processing') RETURNING id`,
          [actor,song.username,song.filename,song.size,song.artist,song.title]);
        return added.rows[0];
      });
      id=row.id;
      try{
        const imported=await queueMusicImport(downloader,song);
        await socialQuery(`UPDATE music_import_requests
          SET status='queued',updated_at=now() WHERE id=$1`,[id]);
        return res.status(202).json({queued:true,importId:id,message:'Import queued for the shared NAS library.',
          details:imported.details});
      }catch(e){
        await socialQuery(`UPDATE music_import_requests
          SET status='needs_review',updated_at=now() WHERE id=$1`,[id]).catch(()=>{});
        throw e;
      }
    }catch(e){respondError(res,e)}
  });
  return router;
}
