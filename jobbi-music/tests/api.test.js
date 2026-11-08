import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

let navServer, downloadServer, appProcess, base, cookie;
const received={};
const json=(res,body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
const ok=(extra={})=>({'subsonic-response':{status:'ok',version:'1.16.1',...extra}});

async function listen(server){await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));return server.address().port;}
async function vacantPort(){const s=createServer();const p=await listen(s);await new Promise(resolve=>s.close(resolve));return p;}
const post=(url,body,cookieValue=cookie)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...(cookieValue?{cookie:cookieValue}:{})},body:JSON.stringify(body)});
const patch=(url,body)=>fetch(base+url,{method:'PATCH',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)});
const get=url=>fetch(base+url,{headers:{cookie}});

before(async()=>{
  navServer=createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost');
    const name=u.pathname.split('/').at(-1).replace('.view','');
    received.lastSubsonic={name,params:Object.fromEntries(u.searchParams)};
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
      DOWNLOADER_URL:'http://127.0.0.1:'+dlPort,ADMIN_USERS:'testadmin'}
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
});

test('health endpoint and access control',async()=>{
  assert.equal((await (await fetch(base+'/api/status')).json()).ok,true);
  assert.equal((await fetch(base+'/api/playlists')).status,401);
  assert.equal((await post('/api/soulseek/download',{username:'x'} ,null)).status,401);
});
test('Navidrome login and session cookies',async()=>{
  const r=await post('/api/login',{username:'testadmin',password:'mock-password'},null);
  assert.equal(r.status,200);
  assert.equal((await r.json()).admin,true);
  cookie=r.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie,/jobbi_session=/);
  const session=await(await get('/api/session')).json();
  assert.equal(session.username,'testadmin');
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
test('playlist create, edit and delete',async()=>{
  const made=await post('/api/playlists',{name:'Road trip'});
  assert.equal(made.status,201);
  assert.equal((await made.json()).playlist.name,'Road trip');
  const updated=await patch('/api/playlists/pl-1',{addSongId:'song-1'});
  assert.equal(updated.status,200);
  assert.equal(received.lastSubsonic.name,'getPlaylist');
  assert.equal((await patch('/api/playlists/pl-1',{removeIndex:-1})).status,400);
  const gone=await fetch(base+'/api/playlists/pl-1',{method:'DELETE',headers:{cookie}});
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
test('admin-initiated library scan',async()=>{
  const res=await post('/api/library/scan',{});
  assert.equal(res.status,200);
  assert.equal((await res.json()).scanStatus.scanning,true);
});
