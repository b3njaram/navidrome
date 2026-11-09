import express from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchSlskd, slskdConnection } from './slskd.js';
import { nativeAccounts, NativeAdminError, validateNewAccount } from './admin-native.js';
import { subsonicProxy } from './navidrome-proxy.js';
import { normalizeLyrics } from './lyrics-normalize.js';
import { androidLatest } from './android-update.js';
import { createSocialRouter } from './social-routes.js';
import { createMusicRequestsRouter } from './music-requests.js';
import {createMusicImportRouter,checkStorageStats} from './music-import.js';
import {searchInvidious,configuredInvidious,videoIdValid} from './invidious.js';
import {createInvidiousImportRouter} from './invidious-import.js';
import { promises as fs } from 'node:fs';

const app = express();
const PORT = Number(process.env.PORT || 3131);
const NAVIDROME = (process.env.NAVIDROME_URL || 'http://127.0.0.1:4533').replace(/\/$/, '');
const DOWNLOADER = (process.env.DOWNLOADER_URL || '').replace(/\/$/, '');
const SLSKD = (process.env.SLSKD_URL || '').replace(/\/$/, '');
const SLSKD_KEY = process.env.SLSKD_API_KEY || '';
const INVIDIOUS_WORKER_URL=(process.env.INVIDIOUS_WORKER_URL||'').replace(/\/$/,'');
const INVIDIOUS_WORKER_SECRET=process.env.INVIDIOUS_WORKER_SECRET||'';
const SECURE_COOKIE = process.env.PUBLIC_HTTPS === 'true';
const ACCOUNT_MANAGEMENT_ENABLED=process.env.ENABLE_ACCOUNT_MANAGEMENT==='true';
const STORAGE_STATS_PATH=process.env.STORAGE_STATS_PATH||'/run/jobbi-stats/storage.json';
const ADMIN_USERS = new Set((process.env.ADMIN_USERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const sessions = new Map();
const sessionEncryptionKey=crypto.randomBytes(32);
const sealPassword=plain=>{const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',sessionEncryptionKey,iv);const bytes=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');};
const unsealPassword=value=>{const bytes=Buffer.from(value,'base64url');const dec=crypto.createDecipheriv('aes-256-gcm',sessionEncryptionKey,bytes.subarray(0,12));dec.setAuthTag(bytes.subarray(12,28));return Buffer.concat([dec.update(bytes.subarray(28)),dec.final()]).toString('utf8');};
const MAX_SESSIONS = 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const ACTION_WINDOW_MS = 10 * 60 * 1000;
const actionLimits = new Map();
const soulseekSearchLimits=new Map();
const attempts = new Map();
const ttl = 12 * 60 * 60 * 1000;
const cookieName = 'jobbi_session';

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { upgradeInsecureRequests: SECURE_COOKIE ? [] : null, 'default-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'media-src': ["'self'", 'blob:'], 'connect-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"], 'script-src': ["'self'"] } } }));
app.use('/api', express.json({ limit: '64kb' }));
app.use('/api', (_, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map(kv => { const i=kv.indexOf('='); return i < 0 ? [] : [kv.slice(0,i).trim(), kv.slice(i+1).trim()]; }).filter(a=>a.length === 2));
const cookieOptions = { httpOnly: true, secure: SECURE_COOKIE, sameSite: 'strict', path: '/', maxAge: ttl };
const sess = req => {
  const token=cookies(req)[cookieName];
  const item=token&&sessions.get(token);
  if(!item||item.expires<Date.now()){if(token)sessions.delete(token);return null;}
  try{return {...item,password:unsealPassword(item.sealedPassword)};}
  catch{if(token)sessions.delete(token);return null;}
};
const mustAuth = (req, res, next) => { req.user = sess(req); if (!req.user) return res.status(401).json({error:'Please sign in'}); next(); };
const mustAdmin = async (req, res, next) => {
  if (!req.user?.admin || !ADMIN_USERS.has(req.user.username.toLowerCase())) return res.status(403).json({error:'Administrator access required'});
  try {
    const data=await subsonic(req.user,'getUser',{username:req.user.username});
    if(data.user?.adminRole!==true){req.user.admin=false;return res.status(403).json({error:'Administrator privileges are no longer active'});}
    next();
  } catch {return res.status(503).json({error:'Cannot verify administrator permissions with the music server'});}
};
const mustBeLimited = (req,res,next) => { const key = req.user.username.toLowerCase(); const now = Date.now(); const prev = actionLimits.get(key) || {count:0,start:now}; if(now-prev.start > ACTION_WINDOW_MS){ prev.count=0; prev.start=now; } prev.count++; actionLimits.set(key,prev); if(prev.count > 30) return res.status(429).json({error:'Too many music discovery requests; try again shortly'}); next(); };
const mustLimitPeerSearch=(req,res,next)=>{
  const username=req.user.username.toLowerCase();
  const now=Date.now(),before=soulseekSearchLimits.get(username);
  const state=before&&now-before.start<10*60*1000?before:{start:now,count:0};
  state.count++;soulseekSearchLimits.set(username,state);
  if(state.count>10)return res.status(429).json({error:'Soulseek search limit reached. Try again in a few minutes.'});
  next();
};
const validId = x => typeof x === 'string' && x.length > 0 && x.length <= 150;
const validName = x => typeof x === 'string' && x.trim().length >= 1 && x.trim().length <= 100;
const saltAuth = (user) => { const s = crypto.randomBytes(8).toString('hex'); return {u:user.username, t:crypto.createHash('md5').update(user.password + s).digest('hex'),s,v:'1.16.1',c:'JobbiMusic',f:'json'}; };
const subsonicUrl = (user, name, params={}) => { const url = new URL(`${NAVIDROME}/rest/${name}.view`); Object.entries({...saltAuth(user), ...params}).forEach(([k,v])=>url.searchParams.set(k,String(v))); return url; };
const safeError = (e) => console.error('Request failed:', e?.message || e);
async function subsonic(user, name, params={}) {
  const response = await fetch(subsonicUrl(user,name,params), {signal:AbortSignal.timeout(14000)});
  if (!response.ok) throw new Error(`Music server returned ${response.status}`);
  const data = (await response.json())['subsonic-response'];
  if (!data || data.status !== 'ok') throw new Error(data?.error?.message || 'Navidrome request failed');
  return data;
}
const route = handler => async (req,res) => {try { await handler(req,res); } catch(err) { safeError(err); if(!res.headersSent) res.status(502).json({error:'The music service is temporarily unavailable. Please retry.'}); }};

// Defense-in-depth: reject cross-origin requests and require per-session
// CSRF tokens for all state-changing authenticated API requests.
app.use('/api',(req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const origin=req.headers.origin;
  if(origin){
    try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Cross-origin request denied'});}
    catch{return res.status(403).json({error:'Invalid request origin'});}
  }
  if(req.path==='/login')return next();
  const user=sess(req);
  if(!user)return res.status(401).json({error:'Please sign in'});
  const submitted=req.get('x-csrf-token')||'';
  if(!submitted||!crypto.timingSafeEqual(Buffer.from(submitted.padEnd(80,' ').slice(0,80)),Buffer.from(user.csrfToken.padEnd(80,' ').slice(0,80)))||submitted!==user.csrfToken){
    return res.status(403).json({error:'Security token missing or expired; sign in again'});
  }
  next();
});

app.post('/api/login', route(async(req,res)=> {
  const ip = req.ip || 'unknown';
  const entry = attempts.get(ip) || {n:0,start:Date.now()};
  if(Date.now()-entry.start > LOGIN_WINDOW_MS){entry.n=0; entry.start=Date.now();}
  if(entry.n >= 10) return res.status(429).json({error:'Too many attempts. Please try again later.'});
  const {username,password} = req.body || {};
  if(typeof username!=='string' || typeof password!=='string' || !username.trim() || password.length>256 || username.length>120) return res.status(400).json({error:'Enter your Navidrome username and password'});
  const user={username:username.trim(),password};
  try {await subsonic(user,'ping');} catch {entry.n++; attempts.set(ip,entry); return res.status(401).json({error:'Invalid credentials or Navidrome unavailable'});}
  attempts.delete(ip);
  const token=crypto.randomBytes(32).toString('base64url');
  let admin=false;
  if(ADMIN_USERS.has(user.username.toLowerCase())){
    try { const detail=await subsonic(user,'getUser',{username:user.username});admin=detail.user?.adminRole===true; }
    catch { /* Fail closed: never give admin access without proof of role. */ }
  }
  const session={username:user.username,admin,csrfToken:crypto.randomBytes(32).toString('base64url'),sealedPassword:sealPassword(password),expires:Date.now()+ttl};
  if(sessions.size>=MAX_SESSIONS){const oldest=sessions.keys().next().value;if(oldest)sessions.delete(oldest);}
  sessions.set(token,session);
  res.cookie(cookieName,token,cookieOptions);
  res.json({username:session.username,admin:session.admin,csrfToken:session.csrfToken});
}));
app.post('/api/logout', (req,res)=> {const token=cookies(req)[cookieName]; if(token)sessions.delete(token);res.clearCookie(cookieName,{path:'/',secure:SECURE_COOKIE,sameSite:'strict'});res.json({ok:true});});
app.get('/api/session', (req,res)=>{const user=sess(req);res.json(user?{username:user.username,admin:user.admin,csrfToken:user.csrfToken}:null);});
app.get('/api/status',(req,res)=>res.json({ok:true,service:'Jobbi Music'}));
app.get('/api/android/latest',route(async(req,res)=>{res.setHeader('Cache-Control','public, max-age=1800');res.json(await androidLatest());}));
// Keep legacy Subsonic clients working if the public hostname is moved to Jobbi Music.
// This pass-through is fixed-origin, does not expose native admin endpoints,
// and Navidrome authenticates each client independently.
app.use('/rest',subsonicProxy(NAVIDROME));

app.get('/api/home',mustAuth,route(async(req,res)=>{
  const endpoints=[['recent','getAlbumList2',{type:'newest',size:16}],['featured','getAlbumList2',{type:'random',size:12}],['played','getAlbumList2',{type:'frequent',size:12}],['songs','getRandomSongs',{size:30}],['playlists','getPlaylists',{}]];
  const entries=await Promise.all(endpoints.map(async([key,name,params])=> { try { const d=await subsonic(req.user,name,params); return [key, key==='songs' ? (d.randomSongs?.song||[]) : key==='playlists' ? (d.playlists?.playlist||[]) : (d.albumList2?.album||[])]; } catch { return [key,[]]; } }));
  res.json(Object.fromEntries(entries));
}));
app.get('/api/search',mustAuth,route(async(req,res)=>{const q=String(req.query.q||'').slice(0,150).trim();if(!q)return res.json({artist:[],album:[],song:[]});const data=await subsonic(req.user,'search3',{query:q,artistCount:15,albumCount:25,songCount:40});res.json(data.searchResult3||{artist:[],album:[],song:[]});}));

app.get('/api/library/albums',mustAuth,route(async(req,res)=>{
  const offset=Math.max(0,Math.min(1000000,Math.trunc(Number(req.query.offset)||0)));
  const size=Math.max(10,Math.min(100,Math.trunc(Number(req.query.size)||36)));
  const data=await subsonic(req.user,'getAlbumList2',{type:'alphabeticalByName',size,offset});
  res.json({albums:data.albumList2?.album||[],offset,size});
}));
app.get('/api/library/artists',mustAuth,route(async(req,res)=>{
  const data=await subsonic(req.user,'getArtists');
  const artists=(data.artists?.index||[]).flatMap(g=>g.artist||[]);
  res.json({artists,count:artists.length});
}));
app.get('/api/albums/:id',mustAuth,route(async(req,res)=>{const d=await subsonic(req.user,'getAlbum',{id:req.params.id});res.json(d.album||null);}));
app.get('/api/artists/:id',mustAuth,route(async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid artist'});
  const d=await subsonic(req.user,'getArtist',{id:req.params.id});
  const artist=d.artist;
  if(!artist)return res.status(404).json({error:'Artist not found'});
  const albums=(artist.album||[]).slice(0,18);
  const groups=[];
  // Get real Navidrome album tracks rather than approximate search results.
  for(let i=0;i<albums.length;i+=6){
    const batch=await Promise.all(albums.slice(i,i+6).map(async album=>{
      try{
        const result=await subsonic(req.user,'getAlbum',{id:album.id});
        return (result.album?.song||[]).map(song=>({...song,albumId:song.albumId||album.id,
          artistId:song.artistId||artist.id}));
      }catch{return []}
    }));
    groups.push(...batch);
  }
  res.json({...artist,song:groups.flat().slice(0,360)});
}));
app.get('/api/playlists/:id',mustAuth,route(async(req,res)=>{const d=await subsonic(req.user,'getPlaylist',{id:req.params.id});res.json(d.playlist||null);}));
app.get('/api/starred',mustAuth,route(async(req,res)=>{const d=await subsonic(req.user,'getStarred2');res.json(d.starred2||{});}));
app.post('/api/star',mustAuth,route(async(req,res)=>{const {id,starred}=req.body ||{};if(!validId(id)||typeof starred!=='boolean')return res.status(400).json({error:'Invalid favorite request'});await subsonic(req.user,starred?'star':'unstar',{id});res.json({ok:true});}));
app.post('/api/scrobble',mustAuth,route(async(req,res)=>{const {id}=req.body ||{};if(!validId(id))return res.status(400).json({error:'Invalid id'});await subsonic(req.user,'scrobble',{id,submission:true});res.json({ok:true});}));
app.get('/api/lyrics/:id',mustAuth,route(async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid song'});
  let structured=null,legacy=null;
  try {const d=await subsonic(req.user,'getLyricsBySongId',{id:req.params.id});structured=d.lyricsList||{};}catch{}
  // Older Navidrome installations may only have the legacy getLyrics endpoint.
  if(!structured?.structuredLyrics?.some(group=>group.line?.length)){
    try {const d=await subsonic(req.user,'getSong',{id:req.params.id});
      const artist=String(d.song?.artist||'').slice(0,200);
      const title=String(d.song?.title||'').slice(0,200);
      if(artist&&title){const fallback=await subsonic(req.user,'getLyrics',{artist,title});legacy=fallback.lyrics||null;}
    }catch{}
  }
  res.json(normalizeLyrics(structured,legacy));
}));
async function binaryProxy(req,res,name){
  const quality=['original','balanced','saver'].includes(req.query.quality)?req.query.quality:'balanced';
  const streamSettings=quality==='original'?{format:'raw'}:quality==='saver'?{format:'mp3',maxBitRate:128}:{format:'mp3',maxBitRate:320};
  const url=subsonicUrl(req.user,name,{id:req.params.id,...(name==='stream'?streamSettings:{})});
  const headers={};if(req.headers.range)headers.Range=req.headers.range;
  // A fixed 120-second abort would truncate longer songs. Limit only the initial connection.
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const connectTimeout = setTimeout(() => controller.abort(), 20000);
  let upstream;
  try { upstream = await fetch(url, {headers,signal:controller.signal}); }
  finally { clearTimeout(connectTimeout); }
  if(!upstream.ok) return res.status(upstream.status).end();
  res.status(upstream.status);
  for(const k of ['content-type','content-length','content-range','accept-ranges','cache-control']){const val=upstream.headers.get(k);if(val)res.setHeader(k,val);}
  if(upstream.body)await pipeline(Readable.fromWeb(upstream.body),res);else res.end();
}
app.get('/api/cover/:id',mustAuth,route(async(req,res)=>binaryProxy(req,res,'getCoverArt')));
app.get('/api/stream/:id',mustAuth,route(async(req,res)=>binaryProxy(req,res,'stream')));

// Existing downloader is intentionally only accessible via authenticated, admin-only server routes.
// Its /api/search JSON contract has not yet been inspected. This transparently returns its JSON
// so the UI can display results; no download/import action is exposed in this safe starter.
app.use('/api/invidious',createInvidiousImportRouter({mustAuth,
  url:INVIDIOUS_WORKER_URL,secret:INVIDIOUS_WORKER_SECRET,statsFile:STORAGE_STATS_PATH}));
app.get('/api/invidious/search',mustAuth,mustLimitPeerSearch,route(async(req,res)=>{
  const query=String(req.query.q||'').trim().slice(0,150);
  if(query.length<2)return res.status(400).json({error:'Enter at least 2 characters to search'});
  const result=await searchInvidious(query);
  res.json(result);
}));
app.get('/api/invidious/thumbnail/:id',mustAuth,route(async(req,res)=>{
  const id=req.params.id;
  if(!videoIdValid(id))return res.status(400).end();
  for(const origin of configuredInvidious()){
    try{
      const response=await fetch(origin+'/vi/'+id+'/mqdefault.jpg',{
        redirect:'error',signal:AbortSignal.timeout(4500)
      });
      const size=Number(response.headers.get('content-length')||0);
      if(!response.ok||size>1500000||!response.headers.get('content-type')?.startsWith('image/'))continue;
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>1500000)continue;
      res.setHeader('Content-Type','image/jpeg');
      res.setHeader('Cache-Control','private, max-age=3600');
      return res.send(bytes);
    }catch{}
  }
  res.status(404).end();
}));
app.get('/api/soulseek/health',mustAuth,mustAdmin,route(async(req,res)=>{
  if(!DOWNLOADER)return res.status(503).json({error:'Downloader is not configured'});
  const r=await fetch(`${DOWNLOADER}/api/health`,{signal:AbortSignal.timeout(6000)});
  res.status(r.status).json(await r.json());
}));
app.get('/api/soulseek/status',mustAuth,route(async(req,res)=>{
  if(SLSKD&&SLSKD_KEY){
    try {
      const connection=await slskdConnection({url:SLSKD,key:SLSKD_KEY});
      return res.json({mode:'slskd',configured:true,...connection});
    } catch(err) {
      return res.json({mode:'slskd',configured:true,serverConnected:false,
        message:err.message||'Unable to reach slskd'});
    }
  }
  return res.json({mode:'legacy',configured:Boolean(DOWNLOADER),serverConnected:null,
    message:DOWNLOADER?'Using custom downloader search. Direct slskd search is not configured; empty results may not reflect the full peer network.':'Configure slskd access to search the Soulseek network.'});
}));
app.post('/api/soulseek/search',mustAuth,mustBeLimited,mustLimitPeerSearch,route(async(req,res)=>{
  const query=String(req.body?.query||'').trim().slice(0,150);
  if(query.length<2)return res.status(400).json({error:'Enter at least 2 characters to search'});
  if(SLSKD&&SLSKD_KEY){
    try{
      const result=await searchSlskd({url:SLSKD,key:SLSKD_KEY,query});
      return res.json(result);
    }catch(err){
      console.warn('slskd search failed:',err?.message);
      return res.status(502).json({error:'Soulseek search failed: '+String(err?.message||'Unknown error').slice(0,200)});
    }
  }
  if(!DOWNLOADER)return res.status(503).json({error:'Soulseek is not configured. Set SLSKD_URL and SLSKD_API_KEY on your NAS.'});
  // Compatibility mode for the existing custom Python downloader.
  const upstream=await fetch(`${DOWNLOADER}/api/search`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({query}),signal:AbortSignal.timeout(25000)
  });
  if(!upstream.ok)return res.status(502).json({error:'Custom downloader search returned HTTP '+upstream.status});
  const raw=await upstream.text();
  if(raw.length>1_000_000)return res.status(502).json({error:'Downloader response was too large'});
  let parsed;
  try{parsed=JSON.parse(raw)}catch{return res.status(502).json({error:'Custom downloader did not return JSON'})}
  const empty=Array.isArray(parsed)?parsed.length===0:
    !parsed||Array.isArray(parsed.results)&&parsed.results.length===0;
  res.json({source:'legacy',results:Array.isArray(parsed)?parsed:parsed?.results||parsed,
    message:empty?'Your custom downloader returned no results. For full Soulseek results, configure direct slskd search in the NAS environment.':''});
}));

/** Playlist actions use Navidrome's supported Subsonic endpoints.
 * Navidrome checks playlist ownership for updates and deletions.
 */
app.get('/api/playlists',mustAuth,route(async(req,res)=>{
  const data = await subsonic(req.user,'getPlaylists');
  res.json(data.playlists?.playlist || []);
}));
app.post('/api/playlists',mustAuth,route(async(req,res)=>{
  const name=req.body?.name;
  if(!validName(name)) return res.status(400).json({error:'Playlist name must be 1–100 characters'});
  const data=await subsonic(req.user,'createPlaylist',{name:name.trim()});
  res.status(201).json({playlist:data.playlist||null});
}));
app.patch('/api/playlists/:id',mustAuth,route(async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid playlist'});
  const {name,addSongId,removeIndex}=req.body||{};
  const changes={playlistId:req.params.id};
  if(name!==undefined){if(!validName(name))return res.status(400).json({error:'Invalid playlist name'});changes.name=name.trim();}
  if(addSongId!==undefined){if(!validId(addSongId))return res.status(400).json({error:'Invalid song'});changes.songIdToAdd=addSongId;}
  if(removeIndex!==undefined){if(!Number.isInteger(removeIndex)||removeIndex<0)return res.status(400).json({error:'Invalid song position'});changes.songIndexToRemove=removeIndex;}
  if(Object.keys(changes).length===1)return res.status(400).json({error:'No playlist changes supplied'});
  await subsonic(req.user,'updatePlaylist',changes);
  const updated=await subsonic(req.user,'getPlaylist',{id:req.params.id});
  res.json({playlist:updated.playlist||null});
}));
app.delete('/api/playlists/:id',mustAuth,route(async(req,res)=>{
  if(!validId(req.params.id))return res.status(400).json({error:'Invalid playlist'});
  await subsonic(req.user,'deletePlaylist',{id:req.params.id});
  res.json({ok:true});
}));


/** Administrative operations are available only to verified Navidrome admins
 * explicitly allowlisted by ADMIN_USERS. Never mount Docker's socket in this app.
 */
app.get('/api/admin/overview',mustAuth,mustAdmin,route(async(req,res)=>{
  let storage={status:'unavailable',reason:'Storage agent has not provided a snapshot yet'};
  try{
    const raw=await fs.readFile(STORAGE_STATS_PATH,'utf8');
    const obj=JSON.parse(raw);
    if(['ready','unavailable'].includes(obj.status))storage=obj;
  }catch{}
  let usersCount=null;
  try{
    const data=await subsonic(req.user,'getUsers');
    usersCount=(data.users?.user||[]).length;
  }catch{}
  res.json({storage,usersCount,accountManagementEnabled:ACCOUNT_MANAGEMENT_ENABLED,
    directSearchConfigured:Boolean(SLSKD&&SLSKD_KEY),
    httpsOnlyCookies:SECURE_COOKIE,
    statsNote:'Capacity reflects the filesystem containing /volume1/music. Music size excludes non-music files.'});
}));
app.get('/api/admin/accounts',mustAuth,mustAdmin,route(async(req,res)=>{
  if(ACCOUNT_MANAGEMENT_ENABLED){
    try{
      const data=await nativeAccounts(NAVIDROME,req.user,{action:'list'});
      const arr=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.users)?data.users:null;
      if(arr) return res.json({users:arr.map(u=>({id:String(u.id||u.userName||u.username),username:String(u.userName||u.username||''),name:String(u.name||''),isAdmin:u.isAdmin===true,email:String(u.email||'')})),readOnly:false});
    }catch(e){safeError(e);}
  }
  const data=await subsonic(req.user,'getUsers');
  const users=(data.users?.user||[]).map(u=>({id:String(u.username),username:String(u.username),name:String(u.name||''),isAdmin:u.adminRole===true,email:''}));
  res.json({users,readOnly:true,message:ACCOUNT_MANAGEMENT_ENABLED?'Navidrome native user-management API is not compatible with this server version.':'Enable account management after validating the native Navidrome API on your NAS.'});
}));
app.post('/api/admin/accounts',mustAuth,mustAdmin,mustBeLimited,route(async(req,res)=>{
  if(!ACCOUNT_MANAGEMENT_ENABLED)return res.status(503).json({error:'Account creation is disabled until the Navidrome API is verified'});
  try{
    const payload=validateNewAccount(req.body);
    await nativeAccounts(NAVIDROME,req.user,{action:'create',payload:req.body});
    res.status(201).json({created:true,username:payload.userName,role:'listener'});
  }catch(err){
    if(err instanceof NativeAdminError)return res.status([400,401,403,409].includes(err.status)?err.status:502).json({error:err.message});
    throw err;
  }
}));
app.delete('/api/admin/accounts/:id',mustAuth,mustAdmin,mustBeLimited,route(async(req,res)=>{
  if(!ACCOUNT_MANAGEMENT_ENABLED)return res.status(503).json({error:'Account deletion is disabled'});
  if(req.query.confirm!=='delete')return res.status(400).json({error:'Deletion must be explicitly confirmed'});
  const data=await nativeAccounts(NAVIDROME,req.user,{action:'list'});
  const entries=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:[];
  const target=entries.find(u=>String(u.id)===req.params.id);
  if(!target)return res.status(404).json({error:'User not found'});
  if(target.isAdmin===true||target.userName===req.user.username)return res.status(403).json({error:'Administrative accounts cannot be deleted from this interface'});
  await nativeAccounts(NAVIDROME,req.user,{action:'delete',id:req.params.id});
  res.json({deleted:true});
}));

// Social features reuse Navidrome's authenticated session but store sharing and
// friendship relationships in an isolated, persistent private PostgreSQL database.
app.use('/api/social',createSocialRouter({mustAuth,subsonic}));
app.use('/api/music-requests',createMusicRequestsRouter({mustAuth,mustAdmin,downloader:DOWNLOADER}));
app.use('/api/music-imports',createMusicImportRouter({
  mustAuth,downloader:DOWNLOADER,statsFile:STORAGE_STATS_PATH
}));

// Available to the designated music admin only. No direct browser access to
// downloader/slskd. This uses the existing /api/downloads route read-only.
app.get('/api/soulseek/downloads',mustAuth,mustAdmin,route(async(req,res)=>{
  if(!DOWNLOADER)return res.status(503).json({error:'Downloader is not configured'});
  const upstream=await fetch(`${DOWNLOADER}/api/downloads`,{signal:AbortSignal.timeout(10000)});
  if(!upstream.ok)return res.status(502).json({error:'Unable to retrieve transfer status'});
  const raw=await upstream.text();
  if(raw.length>300000)return res.status(502).json({error:'Transfer response was too large'});
  try {res.json(JSON.parse(raw));} catch {res.status(502).json({error:'Invalid downloader response'});}
}));

/** Queue an explicitly selected, authorized audio transfer through the NAS's
 * existing custom downloader. That service remains responsible for moving
 * complete files and tagging/indexing them; this app never writes to /music.
 */
app.post('/api/soulseek/download',mustAuth,mustAdmin,mustBeLimited,route(async(req,res)=>{
  if(!DOWNLOADER)return res.status(503).json({error:'Downloader is not configured'});
  const {username,filename,size,artist,title}=req.body||{};
  if(typeof username!=='string'||!username.trim()||username.length>100||
     typeof filename!=='string'||filename.length>900||
     typeof artist!=='string'||!artist.trim()||artist.length>180||
     typeof title!=='string'||!title.trim()||title.length>180||
     !Number.isSafeInteger(size)||size<1024||size>2147483648)
    return res.status(400).json({error:'Select a valid audio file, peer, artist, and title'});
  if(!/\.(mp3|flac|m4a|aac|ogg|opus|wav|aiff|alac)$/i.test(filename.trim()) ||
     filename.split(/[\\/]/).some(part=>part==='..'))
    return res.status(400).json({error:'Only supported audio files may be added'});
  const upstream=await fetch(`${DOWNLOADER}/api/download`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:username.trim(),filename,size,artist:artist.trim(),title:title.trim()}),
    signal:AbortSignal.timeout(16000)
  });
  const raw=await upstream.text();
  if(raw.length>30000)return res.status(502).json({error:'Downloader sent an oversized response'});
  let data;
  try{data=JSON.parse(raw)}catch{return res.status(502).json({error:'Downloader returned an unexpected response'});}
  if(!upstream.ok) return res.status(upstream.status>=400&&upstream.status<500?upstream.status:502).json({
    error:typeof data.error==='string'?data.error.slice(0,250):'Downloader rejected the request'
  });
  res.status(202).json({queued:true,details:data});
}));
app.post('/api/library/scan',mustAuth,mustAdmin,mustBeLimited,route(async(req,res)=>{
  const result=await subsonic(req.user,'startScan');
  res.json({ok:true,scanStatus:result.scanStatus||null});
}));

const staticDir=path.join(path.dirname(fileURLToPath(import.meta.url)),'../dist');
app.use('/assets',express.static(path.join(staticDir,'assets'),{index:false,immutable:true,maxAge:'1y',fallthrough:false}));
app.get('*',(req,res)=>{res.setHeader('Cache-Control','no-store');res.sendFile(path.join(staticDir,'index.html'));});
setInterval(()=>{const now=Date.now();for(const [key,item] of sessions)if(item.expires<now)sessions.delete(key);for(const[key,item]of attempts)if(now-item.start>LOGIN_WINDOW_MS)attempts.delete(key);for(const[key,item]of actionLimits)if(now-item.start>ACTION_WINDOW_MS)actionLimits.delete(key);},60000).unref();
app.listen(PORT,'0.0.0.0',()=>console.log(`Jobbi Music listening on port ${PORT}`));
