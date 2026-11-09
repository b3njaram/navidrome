import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import express from 'express';
import {subsonicProxy} from '../server/navidrome-proxy.js';

async function listen(server){
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  return 'http://127.0.0.1:'+server.address().port;
}
async function withProxy(fn){
  const requests=[];
  const nav=createServer(async(req,res)=>{
    const data=[];for await(const d of req)data.push(d);
    requests.push({method:req.method,path:req.url,headers:req.headers,body:Buffer.concat(data).toString()});
    if(req.url?.includes('stream.view')){
      res.writeHead(206,{'content-type':'audio/mpeg','content-range':'bytes 0-3/100','accept-ranges':'bytes'});
      return res.end(Buffer.from('ABCD'));
    }
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({path:req.url,method:req.method}));
  });
  const navBase=await listen(nav);
  const app=express();
  app.use('/rest',subsonicProxy(navBase));
  app.get('/api/health',(_req,res)=>res.json({ok:true}));
  const site=createServer(app);
  const base=await listen(site);
  try{await fn({base,requests});}
  finally{await Promise.all([new Promise(resolve=>nav.close(resolve)),new Promise(resolve=>site.close(resolve))]);}
}
test('legacy Subsonic GET retains path and credentials but never app cookie',async()=>{
  await withProxy(async({base,requests})=>{
    const r=await fetch(base+'/rest/ping.view?u=listener&t=token&s=salt',{
      headers:{cookie:'jobbi_session=sensitive','x-forwarded-for':'9.9.9.9',authorization:'Basic dGVzdDp0ZXN0'}
    });
    assert.equal(r.status,200);
    assert.equal(requests[0].path,'/rest/ping.view?u=listener&t=token&s=salt');
    assert.equal(requests[0].headers.cookie,undefined);
    assert.equal(requests[0].headers['x-forwarded-for'],undefined);
    assert.equal(requests[0].headers.authorization,'Basic dGVzdDp0ZXN0');
  });
});
test('legacy API POST forwards body unchanged and supports range playback',async()=>{
  await withProxy(async({base,requests})=>{
    const body='u=listener&p=secret&v=1.16.1&c=client';
    const r=await fetch(base+'/rest/getPlaylists.view',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
    assert.equal(r.status,200);
    assert.equal(requests[0].body,body);
    const stream=await fetch(base+'/rest/stream.view?id=song1',{headers:{range:'bytes=0-3'}});
    assert.equal(stream.status,206);
    assert.equal(await stream.text(),'ABCD');
    assert.equal(requests[1].headers.range,'bytes=0-3');
  });
});
test('proxy restricts methods and does not expose native admin endpoints',async()=>{
  await withProxy(async({base,requests})=>{
    const bad=await fetch(base+'/rest/ping.view',{method:'PUT'});
    assert.equal(bad.status,405);
    const native=await fetch(base+'/api/user');
    assert.equal(native.status,404);
    assert.equal(requests.length,0);
  });
});
