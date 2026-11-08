import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { normalizeSlskdResponses, searchSlskd, slskdConnection } from '../server/slskd.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function mockSlskd(handler,fn){
  const server=createServer(handler);
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  try{return await fn('http://127.0.0.1:'+server.address().port)}
  finally{await new Promise(resolve=>server.close(resolve))}
}
const json=(res,obj,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(obj))};

test('flat Soulseek files are filtered, deduped and ranked by format and match',()=>{
  const rows=normalizeSlskdResponses([
    {username:'peer-one',hasFreeUploadSlot:true,files:[
      {filename:'Music\\Kino - Gruppa krovi.flac',size:30000000,attributes:[{type:0,value:1000}]},
      {filename:'Music\\Kino - Gruppa krovi.flac',size:30000000},
      {filename:'Cover.jpg',size:2500}
    ]},
    {username:'peer-two',files:[{filename:'Music/Kino - Gruppa krovi.mp3',size:12000000,bitrate:320}]}
  ],'Kino Gruppa');
  assert.equal(rows.peerCount,2);
  assert.equal(rows.total,2);
  assert.equal(rows.results.length,2);
  assert.equal(rows.results[0].format,'FLAC');
  assert.equal(rows.results[0].username,'peer-one');
  assert.equal(rows.results[1].format,'MP3');
});
test('slskd search waits for delayed peer responses instead of returning the first empty array',async()=>{
  let count=0,removed=false;
  await mockSlskd(async(req,res)=>{
    if(req.headers['x-api-key']!=='test-key')return json(res,{error:'unauthorized'},401);
    if(req.method==='POST'&&req.url==='/api/v0/searches'){
      let data='';for await(const part of req)data+=part;
      assert.equal(JSON.parse(data).searchText,'Kino');
      return json(res,{id:'00000000-0000-0000-0000-000000000123'});
    }
    if(req.method==='GET'&&req.url.endsWith('/responses')){
      count++;
      return json(res,count===1?[]:[{
        username:'music-peer',uploadSpeed:2000000,hasFreeUploadSlot:true,
        files:[{filename:'Kino\\Gruppa krovi.flac',size:23000000}]
      }]);
    }
    if(req.method==='GET'&&req.url.includes('/searches/'))return json(res,{isComplete:count>=3});
    if(req.method==='DELETE'&&req.url.includes('/searches/')){removed=true;res.writeHead(204);return res.end();}
    return json(res,{error:'not found'},404);
  },async url=>{
    const response=await searchSlskd({url,key:'test-key',query:'Kino'});
    assert.equal(response.source,'slskd');
    assert.equal(response.results.length,1);
    assert.equal(response.results[0].username,'music-peer');
    assert.ok(count>=2);
    await sleep(60);
    assert.ok(removed,'our temporary search should be cleaned up');
  });
});
test('slskd connection checks keep keys and backend details private',async()=>{
  await mockSlskd((req,res)=>{
    assert.equal(req.headers['x-api-key'],'test-key');
    json(res,{isConnected:true,state:'Connected'});
  },async url=>{
    const x=await slskdConnection({url,key:'test-key'});
    assert.equal(x.serverConnected,true);
    assert.equal(x.state,'Connected');
  });
});
test('slskd errors are explicit rather than disguised as no search results',async()=>{
  await mockSlskd((req,res)=>json(res,{error:'Unauthorized'},401),async url=>{
    await assert.rejects(searchSlskd({url,key:'wrong-key',query:'Kino'}),/API key/);
  });
});
