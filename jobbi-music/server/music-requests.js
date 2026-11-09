import express from 'express';
import crypto from 'node:crypto';
import { socialQuery, ensureSocialProfile, normalUsername } from './social-db.js';

// Only the explicitly configured, fixed NAS downloader receives transfer requests.
export class ImportError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
export function validateImportSelection(input){
  const {username,filename,size,artist,title}=input||{};
  if(typeof username!=='string'||!username.trim()||username.length>100||
    typeof filename!=='string'||!filename.trim()||filename.length>900||
    typeof artist!=='string'||!artist.trim()||artist.length>180||
    typeof title!=='string'||!title.trim()||title.length>180||
    !Number.isSafeInteger(size)||size<1024||size>2147483648)
    throw new ImportError('Select a valid audio file, peer, artist and title');
  if(!/\.(mp3|flac|m4a|aac|ogg|opus|wav|aiff|alac)$/i.test(filename.trim())||
    filename.split(/[\\/]/).some(part=>part==='..'))
    throw new ImportError('Only supported audio files may be requested');
  return {username:username.trim(),filename:filename.trim(),size,
    artist:artist.trim(),title:title.trim()};
}
export async function queueMusicImport(downloader,details){
  if(!downloader)throw new ImportError('Music downloads are not configured',503);
  const selected=validateImportSelection(details);
  let upstream;
  try{
    upstream=await fetch(downloader+'/api/download',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(selected),signal:AbortSignal.timeout(16000)
    });
  }catch{
    // May have reached downloader; DO NOT automatically retry to avoid duplicate jobs.
    throw new ImportError('Could not confirm whether the downloader accepted this file. Review transfers before retrying.',502);
  }
  const raw=await upstream.text();
  if(raw.length>30000)throw new ImportError('Downloader response too large',502);
  let json;try{json=JSON.parse(raw)}catch{throw new ImportError('Downloader returned an unexpected response',502)}
  if(!upstream.ok){
    throw new ImportError(typeof json.error==='string'?json.error.slice(0,250):'Downloader refused the import',
      upstream.status>=400&&upstream.status<500?upstream.status:502);
  }
  return {queued:true,details:json};
}
const safe=(error)=>error instanceof ImportError?error:new ImportError('Music requests are temporarily unavailable',503);
const fail=(res,err)=>{const e=safe(err);res.status(e.status).json({error:e.message});};
const toRow=row=>({
  id:row.id,requester:row.requester,username:row.peer_username,filename:row.filename,
  size:Number(row.size_bytes),artist:row.artist,title:row.title,
  status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,
  reviewedBy:row.reviewed_by||null
});
const limits=new Map();
const PER_USER_PENDING=12;
const PERIOD=10*60*1000;
function limitRequests(req,res,next){
  const user=normalUsername(req.user?.username);if(!user)return res.status(401).json({error:'Sign in'});
  const now=Date.now();
  const previous=limits.get(user);
  const slot=!previous||now-previous.start>PERIOD?{start:now,count:0}:previous;
  slot.count++;limits.set(user,slot);
  if(slot.count>15)return res.status(429).json({error:'Too many song requests. Try again later.'});
  next();
}
setInterval(()=>{const now=Date.now();for(const [user,slot]of limits)
  if(now-slot.start>PERIOD)limits.delete(user)},PERIOD).unref();

export function createMusicRequestsRouter({mustAuth,mustAdmin,downloader}){
  const router=express.Router();
  router.get('/',mustAuth,async(req,res)=>{
    try{
      const actor=normalUsername(req.user.username);
      const result=await socialQuery(`SELECT * FROM music_import_requests
        WHERE requester=$1 ORDER BY created_at DESC LIMIT 60`,[actor]);
      res.json({requests:result.rows.map(toRow)});
    }catch(err){fail(res,err);}
  });
  router.post('/',mustAuth,limitRequests,async(req,res)=>{
    try{
      const actor=await ensureSocialProfile(req.user.username);
      const song=validateImportSelection(req.body);
      const count=await socialQuery(`SELECT COUNT(*)::int AS n FROM music_import_requests
        WHERE requester=$1 AND status='pending'`,[actor]);
      if(count.rows[0].n>=PER_USER_PENDING)return res.status(429).json({error:'You have too many pending music requests'});
      const id=crypto.randomUUID();
      const result=await socialQuery(`INSERT INTO music_import_requests
        (id,requester,peer_username,filename,size_bytes,artist,title)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [id,actor,song.username,song.filename,song.size,song.artist,song.title]);
      res.status(201).json({requested:true,request:toRow(result.rows[0])});
    }catch(err){
      if(err?.code==='23505')return res.status(409).json({error:'You already requested this file'});
      fail(res,err);
    }
  });
  router.get('/admin',mustAuth,mustAdmin,async(req,res)=>{
    try{
      const result=await socialQuery(`SELECT * FROM music_import_requests
        ORDER BY (status='pending') DESC,created_at DESC LIMIT 100`);
      res.json({requests:result.rows.map(toRow)});
    }catch(err){fail(res,err);}
  });
  router.post('/:id/decision',mustAuth,mustAdmin,limitRequests,async(req,res)=>{
    const id=req.params.id,decision=req.body?.decision;
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)||id.length>40)
      return res.status(400).json({error:'Invalid request ID'});
    if(!['approve','reject'].includes(decision))
      return res.status(400).json({error:'Choose approve or reject'});
    const reviewer=normalUsername(req.user.username);
    try{
      const claim=await socialQuery(`UPDATE music_import_requests SET status=$2,
        reviewed_by=$3,updated_at=now()
        WHERE id=$1 AND status='pending' RETURNING *`,
        [id,decision==='approve'?'processing':'rejected',reviewer]);
      if(!claim.rowCount)return res.status(409).json({error:'This request was already reviewed'});
      const item=claim.rows[0];
      if(decision==='reject')return res.json({status:'rejected',request:toRow(item)});
      try{
        const queued=await queueMusicImport(downloader,{
          username:item.peer_username,filename:item.filename,
          size:Number(item.size_bytes),artist:item.artist,title:item.title
        });
        const result=await socialQuery(`UPDATE music_import_requests
          SET status='queued',updated_at=now() WHERE id=$1 RETURNING *`,[id]);
        res.status(202).json({...queued,status:'queued',request:toRow(result.rows[0])});
      }catch(err){
        // This attempt is not automatically retried: the upstream might have
        // accepted the work but timed out before acknowledging it.
        await socialQuery(`UPDATE music_import_requests
          SET status='needs_review',updated_at=now() WHERE id=$1`,[id]);
        fail(res,err);
      }
    }catch(err){fail(res,err);}
  });
  return router;
}
