import express from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = Number(process.env.PORT || 3131);
const NAVIDROME = (process.env.NAVIDROME_URL || 'http://127.0.0.1:4533').replace(/\/$/, '');
const DOWNLOADER = (process.env.DOWNLOADER_URL || '').replace(/\/$/, '');
const SECURE_COOKIE = process.env.PUBLIC_HTTPS === 'true';
const ADMIN_USERS = new Set((process.env.ADMIN_USERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const sessions = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map();
const ttl = 12 * 60 * 60 * 1000;
const cookieName = 'jobbi_session';

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { upgradeInsecureRequests: null, 'default-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'media-src': ["'self'", 'blob:'], 'connect-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"], 'script-src': ["'self'"] } } }));
app.use('/api', express.json({ limit: '64kb' }));
app.use('/api', (_, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map(kv => { const i=kv.indexOf('='); return i < 0 ? [] : [kv.slice(0,i).trim(), kv.slice(i+1).trim()]; }).filter(a=>a.length === 2));
const cookieOptions = { httpOnly: true, secure: SECURE_COOKIE, sameSite: 'strict', path: '/', maxAge: ttl };
const sess = req => { const token = cookies(req)[cookieName]; const item = token && sessions.get(token); if (!item || item.expires < Date.now()) { if(token) sessions.delete(token); return null; } return item; };
const mustAuth = (req, res, next) => { req.user = sess(req); if (!req.user) return res.status(401).json({error:'Please sign in'}); next(); };
const mustAdmin = (req, res, next) => { if (!req.user.admin) return res.status(403).json({error:'This action is only available to designated music administrators'}); next(); };
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
const route = handler => async (req,res) => {try { await handler(req,res); } catch(err) { safeError(err); if(!res.headersSent) res.status(502).json({error:err.message || 'Backend unavailable'}); }};

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
  const session={...user, admin:ADMIN_USERS.has(user.username.toLowerCase()), expires:Date.now()+ttl};
  sessions.set(token,session);
  res.cookie(cookieName,token,cookieOptions);
  res.json({username:session.username,admin:session.admin});
}));
app.post('/api/logout', (req,res)=> {const token=cookies(req)[cookieName]; if(token)sessions.delete(token);res.clearCookie(cookieName,{path:'/',secure:SECURE_COOKIE,sameSite:'strict'});res.json({ok:true});});
app.get('/api/session', (req,res)=>{const user=sess(req);res.json(user?{username:user.username,admin:user.admin}:null);});
app.get('/api/status',(req,res)=>res.json({ok:true, service:'Jobbi Music', downloaderConfigured: Boolean(DOWNLOADER)}));

app.get('/api/home',mustAuth,route(async(req,res)=>{
  const endpoints=[['recent','getAlbumList2',{type:'newest',size:16}],['featured','getAlbumList2',{type:'random',size:12}],['played','getAlbumList2',{type:'frequent',size:12}],['songs','getRandomSongs',{size:30}],['playlists','getPlaylists',{}]];
  const entries=await Promise.all(endpoints.map(async([key,name,params])=> { try { const d=await subsonic(req.user,name,params); return [key, key==='songs' ? (d.randomSongs?.song||[]) : key==='playlists' ? (d.playlists?.playlist||[]) : (d.albumList2?.album||[])]; } catch { return [key,[]]; } }));
  res.json(Object.fromEntries(entries));
}));
app.get('/api/search',mustAuth,route(async(req,res)=>{const q=String(req.query.q||'').slice(0,150).trim();if(!q)return res.json({artist:[],album:[],song:[]});const data=await subsonic(req.user,'search3',{query:q,artistCount:15,albumCount:25,songCount:40});res.json(data.searchResult3||{artist:[],album:[],song:[]});}));
app.get('/api/albums/:id',mustAuth,route(async(req,res)=>{const d=await subsonic(req.user,'getAlbum',{id:req.params.id});res.json(d.album||null);}));
app.get('/api/artists/:id',mustAuth,route(async(req,res)=>{const d=await subsonic(req.user,'getArtist',{id:req.params.id});res.json(d.artist||null);}));
app.get('/api/playlists/:id',mustAuth,route(async(req,res)=>{const d=await subsonic(req.user,'getPlaylist',{id:req.params.id});res.json(d.playlist||null);}));
app.get('/api/starred',mustAuth,route(async(req,res)=>{const d=await subsonic(req.user,'getStarred2');res.json(d.starred2||{});}));
app.post('/api/star',mustAuth,route(async(req,res)=>{const {id,starred}=req.body ||{};if(typeof id!=='string'||id.length>150)return res.status(400).json({error:'Invalid id'});await subsonic(req.user,starred?'star':'unstar',{id});res.json({ok:true});}));
app.post('/api/scrobble',mustAuth,route(async(req,res)=>{const {id}=req.body ||{};if(typeof id!=='string'||id.length>150)return res.status(400).json({error:'Invalid id'});await subsonic(req.user,'scrobble',{id,submission:true});res.json({ok:true});}));
app.get('/api/lyrics/:id',mustAuth,route(async(req,res)=>{const d=await subsonic(req.user,'getLyricsBySongId',{id:req.params.id});res.json(d.lyricsList||{});}));
async function binaryProxy(req,res,name){
  const url=subsonicUrl(req.user,name,{id:req.params.id,...(name==='stream'?{format:'mp3',maxBitRate:320}:{})});
  const headers={};if(req.headers.range)headers.Range=req.headers.range;
  const upstream=await fetch(url,{headers,signal:AbortSignal.timeout(120000)});
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
app.get('/api/soulseek/health',mustAuth,mustAdmin,route(async(req,res)=>{
  if(!DOWNLOADER)return res.status(503).json({error:'Downloader is not configured'});
  const r=await fetch(`${DOWNLOADER}/api/health`,{signal:AbortSignal.timeout(6000)});
  res.status(r.status).json(await r.json());
}));
app.post('/api/soulseek/search',mustAuth,mustAdmin,route(async(req,res)=>{
  if(!DOWNLOADER)return res.status(503).json({error:'Downloader is not configured'});
  const query=String(req.body?.query||'').trim().slice(0,150);
  if(!query)return res.status(400).json({error:'Enter a search query'});
  const r=await fetch(`${DOWNLOADER}/api/search`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(20000)});
  const content=await r.text();let data;try{data=JSON.parse(content)}catch{data={error:'Downloader did not return JSON'}};
  res.status(r.status).json(data);
}));

const staticDir=path.join(path.dirname(fileURLToPath(import.meta.url)),'../dist');
app.use(express.static(staticDir,{index:false,immutable:true,maxAge:'1h'}));
app.get('*',(req,res)=>res.sendFile(path.join(staticDir,'index.html')));
setInterval(()=>{const now=Date.now();for(const [key,item] of sessions)if(item.expires<now)sessions.delete(key);for(const[key,item]of attempts)if(now-item.start>LOGIN_WINDOW_MS)attempts.delete(key);},60000).unref();
app.listen(PORT,'0.0.0.0',()=>console.log(`Jobbi Music listening on port ${PORT}`));
