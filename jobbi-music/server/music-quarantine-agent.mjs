/**
 * Optional isolated NAS quarantine worker. Never exposed on a host port.
 * The Jobbi front end has no /music mount; only this opt-in service can move files.
 * Files are moved to a hidden same-filesystem folder, never unlinked.
 */
import http from 'node:http';
import path from 'node:path';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {promises as fs} from 'node:fs';

const AUDIO=/\.(flac|mp3|m4a|aac|alac|ogg|opus|wav|aif|aiff|wma)$/i;
export async function quarantineFile(root,relative){
  if(typeof relative!=='string'||relative.length>2000||!relative||
    relative.includes('\0')||relative.includes('\\')||
    path.isAbsolute(relative))throw new Error('Unsafe or missing relative music path');
  const parts=relative.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||p==='.jobbi-quarantine'))
    throw new Error('Unsafe music path segment');
  if(!AUDIO.test(relative))throw new Error('Only supported audio recordings can be quarantined');
  const canonicalRoot=await fs.realpath(root);
  let current=canonicalRoot;
  for(const piece of parts){
    current=path.join(current,piece);
    const st=await fs.lstat(current);
    if(st.isSymbolicLink())throw new Error('Symbolic links cannot be quarantined');
  }
  const file=path.join(canonicalRoot,...parts);
  const verified=await fs.realpath(file);
  if(!verified.startsWith(canonicalRoot+path.sep))throw new Error('File outside permitted music directory');
  const stat=await fs.lstat(file);
  if(!stat.isFile())throw new Error('Recording is not a regular file');
  const quarantine=path.join(canonicalRoot,'.jobbi-quarantine');
  await fs.mkdir(quarantine,{recursive:true,mode:0o700});
  const qstat=await fs.lstat(quarantine);
  if(!qstat.isDirectory()||qstat.isSymbolicLink())throw new Error('Unsafe quarantine directory');
  const stored=randomUUID()+'-'+path.basename(file);
  const dest=path.join(quarantine,stored);
  await fs.rename(file,dest);
  return {stored,bytes:stat.size,original:relative};
}

const secret=process.env.MUSIC_QUARANTINE_SECRET||'';
const root=process.env.MUSIC_ROOT||'/music';
const port=Number(process.env.PORT||3137);
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  if(secret.length<32)throw new Error('Set a random MUSIC_QUARANTINE_SECRET of at least 32 characters');
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    const reply=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value))};
    const auth=req.headers['x-jobbi-quarantine-key'];
    const actual=Buffer.from(typeof auth==='string'?auth:'');
    const wanted=Buffer.from(secret);
    if(actual.length!==wanted.length||!timingSafeEqual(actual,wanted))
      return reply(403,{error:'Unauthorized quarantine request'});
    if(req.method!=='POST'||req.url!=='/quarantine')
      return reply(404,{error:'Unknown operation'});
    try{
      let raw='';
      for await(const chunk of req){
        raw+=chunk.toString();
        if(raw.length>5000)throw new Error('Request too large');
      }
      const data=JSON.parse(raw);
      if(data.confirm!=='QUARANTINE')return reply(400,{error:'Confirmation missing'});
      const moved=await quarantineFile(root,data.path);
      return reply(200,{ok:true,...moved});
    }catch(e){
      // Do not disclose internal paths to clients.
      return reply(400,{error:String(e.message||'Quarantine failed').slice(0,180)});
    }
  });
  server.requestTimeout=10000;
  server.listen(port,'0.0.0.0');
}
