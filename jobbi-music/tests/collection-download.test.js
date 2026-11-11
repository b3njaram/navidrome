import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCollectionPlan,safeArchiveName,audioSuffix} from '../server/collection-download.js';

const user={username:'listener'};
const track=(id,title='Track')=>({id,title,artist:'Artist',suffix:'flac',size:1000});
const mock=async(_user,name,params)=>{
  if(name==='getPlaylists')return {playlists:{playlist:[
    {id:'p1',name:'Mix'},{id:'p2',name:'Mix'}
  ]}};
  if(name==='getPlaylist')return {playlist:{id:params.id,name:'Mix',
    entry:params.id==='p1'?[track('s1'),track('s2','Another')]:[track('s1')]}};
  if(name==='getStarred2')return {starred2:{song:[track('s3','Favorite')]}};
  throw Error('Unexpected '+name);
};
test('sanitizes archive names and preserves Unicode names without traversal',()=>{
  assert.equal(safeArchiveName('../../My: Playlist\\?'), 'My Playlist');
  assert.equal(audioSuffix({suffix:'FLAC'}),'flac');
  assert.equal(audioSuffix({contentType:'audio/mpeg'}),'mp3');
  assert.equal(safeArchiveName('  Ñandú   canción '),'Ñandú canción');
});
test('downloads a single playlist with original audio formats',async()=>{
  const plan=await buildCollectionPlan(user,{scope:'playlist',playlistId:'p1'},mock);
  assert.equal(plan.total,2);
  assert.ok(plan.entries[0].path.startsWith('Mix/0001 - Artist - Track.flac'));
});
test('downloads all playlists in distinct folders without dropping repeated songs',async()=>{
  const plan=await buildCollectionPlan(user,{scope:'all-playlists'},mock);
  assert.equal(plan.collections,2);
  assert.equal(plan.entries.length,3);
  assert.notEqual(plan.entries[0].path,plan.entries[2].path);
  assert.ok(plan.entries[2].path.startsWith('002 - Mix/'));
  assert.equal(plan.entries[0].id,plan.entries[2].id);
});
test('downloads all Favorites',async()=>{
  const plan=await buildCollectionPlan(user,{scope:'favorites'},mock);
  assert.equal(plan.total,1);
  assert.equal(plan.entries[0].path,'Favorites/0001 - Artist - Favorite.flac');
});
test('unknown playlist, empty collection and invalid scope fail instead of emitting an empty archive',async()=>{
  await assert.rejects(buildCollectionPlan(user,{scope:'wrong'},mock));
  await assert.rejects(buildCollectionPlan(user,{scope:'favorites'},
    async()=>({starred2:{song:[]}})),/no songs/);
});
