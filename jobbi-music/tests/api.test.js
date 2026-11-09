import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let navServer, downloadServer, appProcess, base, cookie, csrfToken, listenerCookie, listenerCsrfToken, testDir;
const received={};
const nativeUsers=[{id:'admin-id',userName:'testadmin',name:'Admin',isAdmin:true},{id:'listener-id',userName:'listener',name:'Listener',isAdmin:false}];
const json=(res,body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
const ok=(extra={})=>({'subsonic-response':{status:'ok',version:'1.16.1',...extra}});

async function listen(server){await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));return server.address().port;}
async function vacantPort(){const s=createServer();const p=await listen(s);await new Promise(resolve=>s.close(resolve));return p;}
const post=(url,body,cookieValue=cookie)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...(cookieValue?{cookie:cookieValue,'x-csrf-token':csrfToken}:{})},body:JSON.stringify(body)});
const patch=(url,body)=>fetch(base+url,{method:'PATCH',headers:{'content-type':'application/json',cookie,'x-csrf-token':csrfToken},body:JSON.stringify(body)});
const get=url=>fetch(base+url,{headers:{cookie}});

before(async()=>{
  testDir=await mkdtemp(path.join(os.tmpdir(),'jobbi-storage-test-'));
  await writeFile(path.join(testDir,'storage.json'),JSON.stringify({
    status:'ready',checkedAt:new Date().toISOString(),
    freeBytes:25*1024**3,totalBytes:50*1024**3,usedBytes:25*1024**3
  }));
  navServer=createServer(async(req,res)=>{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/auth/login'){
      let body='';for await(const data of req)body+=data;
      assert.equal(JSON.parse(body).username,'testadmin');
      return json(res,{token:'a'.repeat(64)});
    }
    if(u.pathname==='/api/user'){
      if(req.method==='GET')return json(res,{data:nativeUsers});
      if(req.method==='POST'){
        let body='';for await(const data of req)body+=data;
        received.nativeCreate=JSON.parse(body);
        return json(res,{id:'new-listener'},201);
      }
    }
    if(u.pathname==='/api/user/listener-id'&&req.method==='DELETE'){received.nativeDeleted=true;return json(res,{ok:true});}
    const name=u.pathname.split('/').at(-1).replace('.view','');
    received.lastSubsonic={name,params:Object.fromEntries(u.searchParams)};
    if(name==='getUser')return json(res,ok({user:{username:u.searchParams.get('username'),adminRole:u.searchParams.get('username')==='testadmin'}}));
    if(name==='getUsers')return json(res,ok({users:{user:[{username:'testadmin',adminRole:true},{username:'listener',adminRole:false}]}}));
    if(name==='getPlaylists')return json(res,ok({playlists:{playlist:[{id:'pl-1',name:'Road trip',songCount:0}]}}));
    if(name==='getPlaylist')return json(res,ok({playlist:{id:'pl-1',name:u.searchParams.get('name')||'Road trip',entry:[]}}));
    if(name==='createPlaylist')return json(res,ok({playlist:{id:'pl-1',name:u.searchParams.get('name')}}));
    if(name==='getAlbumList2')return json(res,ok({albumList2:{album:[{id:'album-1',name:'Album'}]}}));
    if(name==='getArtists')return json(res,ok({artists:{index:[{name:'A',artist:[{id:'artist-1',name:'Artist'}]}]}}));
    if(name==='getRandomSongs')return json(res,ok({randomSongs:{song:[]}}));
    if(name==='getStarred2')return json(res,ok({starred2:{song:[]}}));
    if(name==='getLyricsBySongId')return json(res,ok({lyricsList:{structuredLyrics:[]}}));
    if(name==='search3')return json(res,ok({searchResult3:{song:[],album:[],artist:[]}}));
    if(name==='startScan')return json(res,ok({scanStatus:{scanning:true}}));
    return json(res,ok());
  });
  downloadServer=createServer(async(req,res)=>{
    let chunks='';for await(const chunk of req)chunks+=chunk;
    if(req.url==='/api/health')return json(res,{ok:true});
    if(req.url==='/api/downloads')return json(res,{jobs:[{filename:'Track.flac',state:'queued'}]});
    if(req.url==='/api/search'){received.search=JSON.parse(chunks);return json(res,{results:[{username:'peer',files:[{filename:'Music/Track.flac',size:100000}]}]});}
    if(req.url==='/api/download'){received.download=JSON.parse(chunks);return json(res,{job_id:'job-1',state:'queued'},202);}
    return json(res,{error:'Not found'},404);
  });
  const navPort=await listen(navServer);
  const dlPort=await listen(downloadServer);
  const appPort=await vacantPort();
  base='http://127.0.0.1:'+appPort;
  appProcess=spawn(process.execPath,['server/index.js'],{
    cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(appPort),PUBLIC_HTTPS:'false',NAVIDROME_URL:'http://127.0.0.1:'+navPort,
      DOWNLOADER_URL:'http://127.0.0.1:'+dlPort,ADMIN_USERS:'testadmin',ENABLE_ACCOUNT_MANAGEMENT:'true',SOCIAL_DATABASE_URL:process.env.SOCIAL_TEST_DATABASE_URL||'',STORAGE_STATS_PATH:path.join(testDir,'storage.json')}
  });
  let error='';appProcess.stderr.on('data',d=>error+=d.toString());
  let ready=false;
  for(let i=0;i<100;i++){
    if(appProcess.exitCode!==null)break;
    try {const response=await fetch(base+'/api/status');if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,75));
  }
  if(!ready)throw Error('Test app did not start: '+error.slice(0,1200));
});
after(async()=>{
  if(appProcess){appProcess.kill('SIGTERM');await new Promise(resolve=>appProcess.once('exit',resolve));}
  await Promise.all([new Promise(resolve=>navServer?.close(resolve)),new Promise(resolve=>downloadServer?.close(resolve))]);
  if(testDir)await rm(testDir,{force:true,recursive:true});
});

test('health endpoint and access control',async()=>{
  assert.equal((await (await fetch(base+'/api/status')).json()).ok,true);
  assert.equal((await fetch(base+'/api/playlists')).status,401);
  assert.equal((await post('/api/soulseek/download',{username:'x'} ,null)).status,401);
});
test('Navidrome login and session cookies',async()=>{
  const r=await post('/api/login',{username:'testadmin',password:'mock-password'},null);
  assert.equal(r.status,200);
  const login=await r.json();
  assert.equal(login.admin,true);
  csrfToken=login.csrfToken;
  assert.ok(csrfToken?.length>=20);
  cookie=r.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie,/jobbi_session=/);
  const session=await(await get('/api/session')).json();
  assert.equal(session.username,'testadmin');
});
test('CSRF validation rejects missing tokens and untrusted origins',async()=>{
  const noCsrf=await fetch(base+'/api/playlists',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Unsafe'})});
  assert.equal(noCsrf.status,403);
  const crossOrigin=await fetch(base+'/api/playlists',{method:'POST',headers:{cookie,'Content-Type':'application/json','x-csrf-token':csrfToken,origin:'https://evil.example'},body:JSON.stringify({name:'Unsafe'})});
  assert.equal(crossOrigin.status,403);
});
test('non-admin sessions never inherit administrator privileges',async()=>{
  const r=await post('/api/login',{username:'listener',password:'regular'},null);
  assert.equal(r.status,200);
  const info=await r.json();
  assert.equal(info.admin,false);
  listenerCookie=r.headers.get('set-cookie')?.split(';')[0];
  listenerCsrfToken=info.csrfToken;
  const status=await fetch(base+'/api/soulseek/status',{headers:{cookie:listenerCookie}});
  assert.equal(status.status,200);
  const direct=await fetch(base+'/api/soulseek/download',{
    method:'POST',headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify({username:'peer',filename:'Music/test.flac',size:250000,artist:'A',title:'Test'})
  });
  assert.equal(direct.status,403);
});
test('complete album and artist library APIs',async()=>{
  const albums=await get('/api/library/albums?offset=0&size=48');
  assert.equal(albums.status,200);
  assert.equal((await albums.json()).albums[0].id,'album-1');
  const artists=await get('/api/library/artists');
  assert.equal(artists.status,200);
  const list=await artists.json();
  assert.equal(list.count,1);
  assert.equal(list.artists[0].name,'Artist');
});
test('admin console shows user roles and restricted storage state',async()=>{
  const r=await get('/api/admin/overview');
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.usersCount,2);
  assert.equal(data.accountManagementEnabled,true);
  assert.ok(['ready','unavailable'].includes(data.storage.status));
  const accounts=await get('/api/admin/accounts');
  assert.equal(accounts.status,200);
  assert.equal((await accounts.json()).users.length,2);
});
test('admin creates a regular account and cannot create elevated roles',async()=>{
  const bad=await post('/api/admin/accounts',{username:'ab',password:'short'});
  assert.equal(bad.status,400);
  const created=await post('/api/admin/accounts',{username:'another-listener',password:'a-good-test-password-99',isAdmin:true});
  assert.equal(created.status,201);
  assert.equal(received.nativeCreate.isAdmin,false);
  assert.equal(received.nativeCreate.userName,'another-listener');
  const deleteAdmin=await fetch(base+'/api/admin/accounts/admin-id?confirm=delete',{method:'DELETE',headers:{cookie,'x-csrf-token':csrfToken}});
  assert.equal(deleteAdmin.status,403);
  const deleteListener=await fetch(base+'/api/admin/accounts/listener-id?confirm=delete',{method:'DELETE',headers:{cookie,'x-csrf-token':csrfToken}});
  assert.equal(deleteListener.status,200);
  assert.equal(received.nativeDeleted,true);
});
test('playlist create, edit and delete',async()=>{
  const made=await post('/api/playlists',{name:'Road trip'});
  assert.equal(made.status,201);
  assert.equal((await made.json()).playlist.name,'Road trip');
  const updated=await patch('/api/playlists/pl-1',{addSongId:'song-1'});
  assert.equal(updated.status,200);
  assert.equal(received.lastSubsonic.name,'getPlaylist');
  assert.equal((await patch('/api/playlists/pl-1',{removeIndex:-1})).status,400);
  const gone=await fetch(base+'/api/playlists/pl-1',{method:'DELETE',headers:{cookie,'x-csrf-token':csrfToken}});
  assert.equal(gone.status,200);
  assert.deepEqual(await gone.json(),{ok:true});
});
test('Soulseek search, transfer status and safe import',async()=>{
  const search=await post('/api/soulseek/search',{query:'test'});
  assert.equal(search.status,200);
  assert.equal(received.search.query,'test');
  const downloads=await get('/api/soulseek/downloads');
  assert.equal((await downloads.json()).jobs[0].state,'queued');
  const entry={username:'peer',filename:'Music/Track.flac',size:100000,artist:'A',title:'Track'};
  assert.equal((await post('/api/soulseek/download',{...entry,filename:'./bad.exe'})).status,400);
  const queued=await post('/api/soulseek/download',entry);
  assert.equal(queued.status,202);
  assert.equal((await queued.json()).queued,true);
  assert.deepEqual(received.download,entry);
});
test('listener can discover Soulseek tracks and request imports without directly downloading',async()=>{
  const query=await fetch(base+'/api/soulseek/search',{
    method:'POST',
    headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify({query:'Kino'})
  });
  assert.equal(query.status,200);
  assert.equal(received.search.query,'Kino');
  const item={username:'peer',filename:'Music/Another.flac',size:230000,artist:'Another Artist',title:'Another Song'};
  const req=await fetch(base+'/api/music-requests',{
    method:'POST',
    headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify(item)
  });
  assert.equal(req.status,201);
  const created=await req.json();
  assert.equal(created.request.status,'pending');
  assert.equal(created.request.requester,'listener');
  const duplicate=await fetch(base+'/api/music-requests',{
    method:'POST',
    headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify(item)
  });
  assert.equal(duplicate.status,409);
  const own=await fetch(base+'/api/music-requests',{headers:{cookie:listenerCookie}});
  assert.equal(own.status,200);
  assert.ok((await own.json()).requests.some(x=>x.id===created.request.id));
  const adminPending=await get('/api/music-requests/admin');
  assert.equal(adminPending.status,200);
  assert.ok((await adminPending.json()).requests.some(x=>x.id===created.request.id));
  const listenerCantApprove=await fetch(base+`/api/music-requests/${created.request.id}/decision`,{
    method:'POST',headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify({decision:'approve'})
  });
  assert.equal(listenerCantApprove.status,403);
  const approved=await post(`/api/music-requests/${created.request.id}/decision`,{decision:'approve'});
  assert.equal(approved.status,202);
  assert.equal((await approved.json()).request.status,'queued');
  assert.deepEqual(received.download,item);
  const again=await post(`/api/music-requests/${created.request.id}/decision`,{decision:'approve'});
  assert.equal(again.status,409);
  const invalid=await fetch(base+'/api/music-requests',{
    method:'POST',headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify({...item,filename:'../malware.exe'})
  });
  assert.equal(invalid.status,400);
});
test('regular user imports Soulseek audio immediately with no approval flow',async()=>{
  if(!process.env.SOCIAL_TEST_DATABASE_URL)return;
  const track={username:'peer-instant',filename:'Audio/Luis Miguel.flac',size:25000000,artist:'Luis Miguel',title:'Test Song'};
  const response=await fetch(base+'/api/music-imports',{
    method:'POST',headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify(track)
  });
  assert.equal(response.status,202);
  assert.equal((await response.json()).queued,true);
  assert.deepEqual(received.download,track);
  const history=await fetch(base+'/api/music-imports',{headers:{cookie:listenerCookie}});
  assert.equal(history.status,200);
  assert.ok((await history.json()).items.some(x=>x.title==='Test Song'&&x.status==='queued'));
  const duplicate=await fetch(base+'/api/music-imports',{
    method:'POST',headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify(track)
  });
  assert.equal(duplicate.status,409);
  const invalid=await fetch(base+'/api/music-imports',{
    method:'POST',headers:{cookie:listenerCookie,'content-type':'application/json','x-csrf-token':listenerCsrfToken},
    body:JSON.stringify({...track,filename:'../payload.exe'})
  });
  assert.equal(invalid.status,400);
});
test('non-configured Invidious worker does not accept direct audio imports',async()=>{
  const result=await fetch(base+'/api/invidious/status',{headers:{cookie}});
  assert.equal(result.status,200);
  assert.equal((await result.json()).importEnabled,false);
  const attempted=await post('/api/invidious/import',{
    videoId:'dQw4w9WgXcQ',artist:'Example',title:'Test',authorized:true
  });
  assert.equal(attempted.status,503);
});
test('Soulseek fallback explains an empty response instead of exposing []',async()=>{
  const status=await get('/api/soulseek/status');
  const state=await status.json();
  assert.equal(state.mode,'legacy');
  assert.equal(state.configured,true);
  const result=await post('/api/soulseek/search',{query:'Kino'});
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.source,'legacy');
  assert.ok(data.results);
});
test('audio quality settings route to original or 128 kbps transcoded streaming',async()=>{
  const original=await get('/api/stream/track-1?quality=original');
  assert.equal(original.status,200);
  await original.arrayBuffer();
  assert.equal(received.lastSubsonic.name,'stream');
  assert.equal(received.lastSubsonic.params.format,'raw');
  const saver=await get('/api/stream/track-1?quality=saver');
  assert.equal(saver.status,200);
  await saver.arrayBuffer();
  assert.equal(received.lastSubsonic.params.format,'mp3');
  assert.equal(received.lastSubsonic.params.maxBitRate,'128');
});
test('social routes use real Navidrome sessions, forbid unauthenticated access, and enforce CSRF',async()=>{
  if(!process.env.SOCIAL_TEST_DATABASE_URL)return;
  const noCookie=await fetch(base+'/api/social/home');
  assert.equal(noCookie.status,401);
  const adminHome=await get('/api/social/home');
  assert.equal(adminHome.status,200);
  const created=await post('/api/social/playlists',{title:'Private integration mix',visibility:'private'});
  assert.equal(created.status,201);
  const id=(await created.json()).playlist.id;
  const regularLogin=await post('/api/login',{username:'listener',password:'test-only'},null);
  assert.equal(regularLogin.status,200);
  const regular=(await regularLogin.json());
  const regularCookie=regularLogin.headers.get('set-cookie')?.split(';')[0];
  const forbidden=await fetch(base+'/api/social/playlists/'+id,{
    headers:{cookie:regularCookie}
  });
  assert.equal(forbidden.status,404,'Another logged-in user cannot view a private social playlist');
  const forged=await fetch(base+'/api/social/playlists/'+id,{
    method:'PATCH',headers:{cookie:regularCookie,'content-type':'application/json','x-csrf-token':regular.csrfToken},
    body:JSON.stringify({visibility:'public'})
  });
  assert.equal(forged.status,404);
  const missingCsrf=await fetch(base+'/api/social/playlists',{method:'POST',
    headers:{cookie:regularCookie,'content-type':'application/json'},
    body:JSON.stringify({title:'Forged social mix'})});
  assert.equal(missingCsrf.status,403);
  const deleted=await fetch(base+'/api/social/playlists/'+id,{method:'DELETE',headers:{cookie,'x-csrf-token':csrfToken}});
  assert.equal(deleted.status,200);
});
test('admin-initiated library scan',async()=>{
  const res=await post('/api/library/scan',{});
  assert.equal(res.status,200);
  assert.equal((await res.json()).scanStatus.scanning,true);
});
