import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {createSocialRouter} from '../server/social-routes.js';
import {socialReady,socialPool} from '../server/social-db.js';

const enabled=Boolean(process.env.SOCIAL_TEST_DATABASE_URL);
let server,base;
function req(path,{user='alice',method='GET',body,headers={}}={}){
  return fetch(base+'/api/social'+path,{
    method,headers:{'x-test-user':user,...(body&&!Buffer.isBuffer(body)&&typeof body==='object'?{'content-type':'application/json'}:{}),...headers},
    body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)
  });
}
async function read(res){return res.json()}
async function post(url,user,body){return req(url,{user,method:'POST',body})}
async function patch(url,user,body){return req(url,{user,method:'PATCH',body})}
async function del(url,user){return req(url,{user,method:'DELETE'})}

before(async()=>{
  if(!enabled)return;
  process.env.SOCIAL_DATABASE_URL=process.env.SOCIAL_TEST_DATABASE_URL;
  await socialReady();
  const app=express();app.use(express.json({limit:'64kb'}));
  app.use('/api/social',createSocialRouter({
    mustAuth:(request,response,next)=>{
      const user=request.headers['x-test-user'];if(!user)return response.status(401).json({error:'Login required'});
      request.user={username:user,password:'fake-test-only'};next();
    },
    subsonic:async(user,method,params)=>{
      if(method==='getSong')return {song:{id:params.id,title:'Song '+params.id,artist:'Test Artist',album:'Test Album',duration:189,coverArt:'cover-'+params.id}};
      if(method==='getPlaylist')return {playlist:{id:params.id,name:'My Navidrome mix',entry:[{id:'native-song',title:'From my library',artist:'Artist',duration:180}]}};
      if(method==='getStarred2')return {starred2:{song:[
        {id:'favorite-'+user.username,title:'Favorite of '+user.username,artist:user.username,duration:180},
        {id:'same-song',title:'Shared favorite',artist:'Everyone',duration:210}
      ]}};
      throw Error('Unsupported Navidrome test method');
    }
  }));
  server=createServer(app);
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  base='http://127.0.0.1:'+server.address().port;
  for(const u of ['alice','bob','charlie'])assert.equal((await req('/home',{user:u})).status,200);
});
after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(enabled)await socialPool().end();
});
test('friend requests require recipient approval; private playlist visibility is enforced', {skip:!enabled},async()=>{
  const created=await post('/playlists','alice',{title:'Our sound',visibility:'private'});
  assert.equal(created.status,201);
  const id=(await read(created)).playlist.id;
  assert.equal((await req('/playlists/'+id,{user:'bob'})).status,404);
  assert.equal((await post('/friends/request','alice',{username:'bob'})).status,201);
  assert.equal((await req('/home',{user:'bob'})).status,200);
  assert.equal((await read(await req('/home',{user:'bob'}))).incoming.length,1);
  assert.equal((await post('/friends/alice/respond','bob',{accept:true})).status,200);
  assert.equal((await req('/playlists/'+id,{user:'bob'})).status,404,'Friendship alone must not share a private playlist');
  assert.equal((await post('/playlists/'+id+'/members','alice',{username:'bob',canEdit:true})).status,200);
  assert.equal((await req('/playlists/'+id,{user:'bob'})).status,200);
  assert.equal((await req('/playlists/'+id,{user:'charlie'})).status,404);
  assert.equal((await post('/playlists/'+id+'/tracks','bob',{trackId:'bob-added'})).status,201);
  const detail=await read(await req('/playlists/'+id,{user:'alice'}));
  assert.equal(detail.tracks.length,1);
  assert.equal(detail.tracks[0].added_by,'bob');
  assert.equal((await post('/playlists/'+id+'/tracks','charlie',{trackId:'evil'})).status,404);
  assert.equal((await patch('/playlists/'+id,'alice',{visibility:'public'})).status,200);
  assert.equal((await req('/playlists/'+id,{user:'charlie'})).status,200);
  assert.equal((await post('/playlists/'+id+'/tracks','charlie',{trackId:'evil'})).status,403);
  const bobProfile=await read(await req('/profiles/bob',{user:'alice'}));
  assert.equal(bobProfile.stats.songs_added,1);
  assert.equal((await patch('/playlists/'+id,'alice',{visibility:'private'})).status,200);
  assert.equal((await req('/playlists/'+id,{user:'charlie'})).status,404);
  assert.equal((await del('/friends/bob','alice')).status,200);
  assert.equal((await req('/playlists/'+id,{user:'bob'})).status,404,'Unfriending revokes private playlist access');
  assert.equal((await del('/playlists/'+id,'bob')).status,404);
  assert.equal((await del('/playlists/'+id,'alice')).status,200);
});
test('private profiles and avatar uploads do not expose arbitrary image types',{skip:!enabled},async()=>{
  assert.equal((await patch('/me','alice',{displayName:'Alice Music',bio:'Hello!'})).status,200);
  const profile=await read(await req('/profiles/alice',{user:'charlie'}));
  assert.equal(profile.profile.display_name,'Alice Music');
  const bytes=Buffer.alloc(48);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes,0);
  const avatar=await req('/me/avatar',{user:'alice',method:'POST',body:bytes,headers:{'content-type':'image/png'}});
  assert.equal(avatar.status,200);
  const image=await req('/profiles/alice/avatar',{user:'charlie'});
  assert.equal(image.status,200);
  assert.equal(image.headers.get('content-type'),'image/png');
  assert.equal((await req('/me/avatar',{user:'alice',method:'POST',body:Buffer.from('<svg><script>bad</script></svg>'),headers:{'content-type':'image/svg+xml'}})).status,400);
  assert.equal((await patch('/me','alice',{discoverable:false})).status,200);
  assert.equal((await req('/profiles/alice',{user:'charlie'})).status,404);
  assert.equal((await req('/profiles/alice/avatar',{user:'charlie'})).status,404);
  assert.equal((await del('/me/avatar','alice')).status,200);
  assert.equal((await patch('/me','alice',{discoverable:true})).status,200);
});
test('Navidrome playlist import creates a separate social copy and remains private',{skip:!enabled},async()=>{
  const created=await post('/playlists/import','charlie',{navidromePlaylistId:'native-1'});
  assert.equal(created.status,201);
  const id=(await read(created)).id;
  const result=await read(await req('/playlists/'+id,{user:'charlie'}));
  assert.equal(result.tracks[0].title,'From my library');
  assert.equal((await req('/playlists/'+id,{user:'alice'})).status,404);
});
test('two friends explicitly contribute favorites before a blend can exist',{skip:!enabled},async()=>{
  assert.equal((await post('/friends/request','alice',{username:'bob'})).status,201);
  assert.equal((await post('/friends/alice/respond','bob',{accept:true})).status,200);
  assert.equal((await post('/blends','alice',{username:'bob'})).status,409,'Both users must opt in');
  assert.equal((await post('/blend/picks','alice',{})).status,200);
  assert.equal((await post('/blends','alice',{username:'bob'})).status,409,'Only one user opted in');
  assert.equal((await post('/blend/picks','bob',{})).status,200);
  const created=await post('/blends','alice',{username:'bob'});
  assert.equal(created.status,201);
  const id=(await read(created)).id;
  const b=await read(await req('/playlists/'+id,{user:'bob'}));
  assert.equal(b.playlist.visibility,'private');
  assert.equal(b.playlist.kind,'blend');
  assert.ok(b.tracks.some(t=>t.added_by==='alice'));
  assert.ok(b.tracks.some(t=>t.added_by==='bob'));
  assert.equal((await post('/playlists/'+id+'/tracks','bob',{trackId:'manual'})).status,403);
  assert.equal((await patch('/playlists/'+id,'alice',{visibility:'public'})).status,403);
  assert.equal((await post('/blends/'+id+'/refresh','bob',{})).status,200);
  assert.equal((await del('/blend/picks','bob')).status,200);
  assert.equal((await req('/playlists/'+id,{user:'alice'})).status,404,'Opting out deletes previously shared blends');
});
test('unauthenticated visitor cannot query social profiles or media',{skip:!enabled},async()=>{
  const res=await req('/home',{user:''});
  assert.equal(res.status,401);
});
