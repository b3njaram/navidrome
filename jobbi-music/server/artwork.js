import express from 'express';
import {ensureSocialProfile,socialQuery} from './social-db.js';

// Artwork is a private per-listener overlay; source files and Navidrome tags
// are never overwritten. Verify magic bytes, not just the client Content-Type.
export function imageMime(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<16||bytes.length>1048576)return null;
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return null;
}
const kindOk=k=>['album','playlist'].includes(k);
const idOk=id=>typeof id==='string'&&id.length>0&&id.length<=150;
export function createArtworkRouter({mustAuth,subsonic}){
  const router=express.Router();
  router.use(mustAuth);
  router.get('/:kind/:id',async(req,res)=>{
    if(!kindOk(req.params.kind)||!idOk(req.params.id))return res.status(404).end();
    try{
      const name=await ensureSocialProfile(req.user.username);
      const result=await socialQuery('SELECT mime,bytes FROM personalized_cover_art WHERE username=$1 AND kind=$2 AND entity_id=$3',
        [name,req.params.kind,req.params.id]);
      if(!result.rowCount)return res.status(404).end();
      res.setHeader('Content-Type',result.rows[0].mime);
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Cache-Control','private, max-age=120');
      res.send(result.rows[0].bytes);
    }catch{res.status(503).end();}
  });
  router.post('/:kind/:id',express.raw({type:['image/jpeg','image/png','image/webp'],limit:'1mb'}),async(req,res)=>{
    if(!kindOk(req.params.kind)||!idOk(req.params.id))return res.status(400).json({error:'Invalid cover target'});
    const mime=imageMime(req.body);
    if(!mime||mime!==req.get('content-type'))return res.status(400).json({error:'Use a valid JPEG, PNG or WebP image under 1 MB'});
    try{
      const nav=await subsonic(req.user,req.params.kind==='album'?'getAlbum':'getPlaylist',{id:req.params.id});
      if(!nav[req.params.kind]?.id)return res.status(404).json({error:'Album or playlist is not available'});
      const name=await ensureSocialProfile(req.user.username);
      await socialQuery(`INSERT INTO personalized_cover_art(username,kind,entity_id,mime,bytes)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(username,kind,entity_id)
        DO UPDATE SET mime=EXCLUDED.mime,bytes=EXCLUDED.bytes,updated_at=now()`,
        [name,req.params.kind,req.params.id,mime,req.body]);
      res.json({saved:true,kind:req.params.kind,id:req.params.id});
    }catch(err){
      console.warn('Cover artwork upload failed:',err?.code||err?.name||'unknown');
      res.status(503).json({error:'Artwork could not be saved. Verify the social database and music server.'});
    }
  });
  router.delete('/:kind/:id',async(req,res)=>{
    if(!kindOk(req.params.kind)||!idOk(req.params.id))return res.status(400).json({error:'Invalid cover target'});
    try{
      const name=await ensureSocialProfile(req.user.username);
      await socialQuery('DELETE FROM personalized_cover_art WHERE username=$1 AND kind=$2 AND entity_id=$3',[name,req.params.kind,req.params.id]);
      res.json({removed:true});
    }catch{res.status(503).json({error:'Artwork removal failed'});}
  });
  return router;
}
