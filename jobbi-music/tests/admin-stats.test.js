import test from 'node:test';
import assert from 'node:assert/strict';
import {countIndexedSongs,countAccountRows} from '../server/admin-stats.js';

test('counts songs from every album page, not sample or disk snapshot',async()=>{
  const requests=[];
  const fetcher=async(_,name,params)=>{
    assert.equal(name,'getAlbumList2');requests.push(params.offset);
    const list=params.offset===0?
      [{songCount:5},{songCount:7}]:
      [{songCount:3}];
    return {albumList2:{album:list}};
  };
  const data=await countIndexedSongs(fetcher,{username:'admin'},{pageSize:2});
  assert.deepEqual(requests,[0,2]);
  assert.equal(data.indexedSongs,15);
  assert.equal(data.indexedAlbums,3);
  assert.equal(data.complete,true);
});

test('does not publish incomplete counts as total',async()=>{
  const result=await countIndexedSongs(async()=>({albumList2:{album:[{songCount:2}]}}),{}, {pageSize:1,maxPages:2});
  assert.equal(result.indexedSongs,null);
  assert.equal(result.complete,false);
});

test('unknown album track counts fail instead of incorrectly showing zero',async()=>{
  await assert.rejects(()=>countIndexedSongs(async()=>({albumList2:{album:[{name:'No count'}]}}),{}),/song count/);
});
test('counts native account API variants without guessing',()=>{
  assert.equal(countAccountRows({data:[{id:1},{id:2}]}),2);
  assert.equal(countAccountRows({users:[{id:1}]}),1);
  assert.equal(countAccountRows({other:[]}),null);
});
