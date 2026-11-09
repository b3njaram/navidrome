import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredInvidious,normalizeInvidiousResults,searchInvidious,videoIdValid} from '../server/invidious.js';

test('operator-configured Invidious sources exclude unsafe protocols and arbitrary paths',()=>{
  const sources=configuredInvidious({INVIDIOUS_URL:'https://yt.jobbisoft.com.mx',
    INVIDIOUS_BACKUPS:'https://inv.nadeko.net,http://127.0.0.1:5000,https://evil.test/a'});
  assert.deepEqual(sources,['https://yt.jobbisoft.com.mx','https://inv.nadeko.net']);
});
test('only normal video results survive source normalization',()=>{
  const songs=normalizeInvidiousResults([
    {type:'video',videoId:'dQw4w9WgXcQ',title:'Luis Miguel (test)',author:'Example',lengthSeconds:200},
    {type:'video',videoId:'bad-id',title:'Invalid'},
    {type:'video',videoId:'abcdefghijk',liveNow:true},
    {type:'channel',author:'Channel'}
  ],'https://yt.jobbisoft.com.mx');
  assert.equal(songs.length,1);
  assert.equal(songs[0].title,'Luis Miguel (test)');
  assert.equal(songs[0].thumbnail,'/api/invidious/thumbnail/dQw4w9WgXcQ');
  assert.ok(videoIdValid(songs[0].videoId));
});
test('search retries the next configured instance when an API is down',async()=>{
  const attempts=[];
  const result=await searchInvidious('Elliot James Reay',{
    instances:['https://yt.jobbisoft.com.mx','https://inv.nadeko.net'],
    fetcher:async url=>{
      attempts.push(url);
      if(url.startsWith('https://yt.jobbisoft.com.mx'))throw Error('instance unavailable');
      return [{type:'video',videoId:'dQw4w9WgXcQ',title:'Music example',author:'Example',lengthSeconds:170}];
    }
  });
  assert.equal(attempts.length,2);
  assert.equal(result.available,true);
  assert.equal(result.instance,'https://inv.nadeko.net');
});
test('search with no working sources returns explicit status',async()=>{
  const result=await searchInvidious('Luis Miguel',{instances:['https://yt.jobbisoft.com.mx'],
    fetcher:async()=>{throw Error('unavailable')}});
  assert.equal(result.available,false);
  assert.deepEqual(result.results,[]);
  assert.match(result.message,/Invidious instances/);
});
