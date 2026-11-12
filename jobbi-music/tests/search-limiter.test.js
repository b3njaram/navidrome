import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicSearchLimiter} from '../server/search-limiter.js';

function request(user='listener'){
  let status=200,body=null,headers={},passed=false;
  const req={user:{username:user}};
  const res={
    setHeader:(name,value)=>{headers[name.toLowerCase()]=value;},
    status:(code)=>{status=code;return res;},
    json:(value)=>{body=value;return res;}
  };
  return {req,res,read:()=>({status,body,headers,passed}),
    next:()=>{passed=true;}};
}

test('Soulseek budget allows 60 searches then responds 429 with real remaining seconds',()=>{
  let current=1000;
  const limit=createMusicSearchLimiter({source:'Soulseek',clock:()=>current});
  for(let i=0;i<60;i++){
    const x=request();limit(x.req,x.res,x.next);
    assert.equal(x.read().passed,true,'search '+i+' should be allowed');
  }
  const rejected=request();limit(rejected.req,rejected.res,rejected.next);
  assert.equal(rejected.read().status,429);
  assert.equal(rejected.read().passed,false);
  assert.equal(rejected.read().body.quota,'search');
  assert.equal(rejected.read().headers['retry-after'],'600');
  current+=120000;
  const another=request();limit(another.req,another.res,another.next);
  assert.equal(another.read().headers['retry-after'],'480');
  current+=480000;
  const allowed=request();limit(allowed.req,allowed.res,allowed.next);
  assert.equal(allowed.read().passed,true);
});

test('Soulseek and Invidious have independent per-account budgets',()=>{
  let time=0;
  const soulseek=createMusicSearchLimiter({source:'Soulseek',limit:2,clock:()=>time});
  const invidious=createMusicSearchLimiter({source:'Invidious',limit:2,clock:()=>time});
  for(let i=0;i<2;i++){const r=request();soulseek(r.req,r.res,r.next);}
  let r=request();soulseek(r.req,r.res,r.next);
  assert.equal(r.read().status,429);
  r=request();invidious(r.req,r.res,r.next);
  assert.equal(r.read().passed,true);
  r=request('different');soulseek(r.req,r.res,r.next);
  assert.equal(r.read().passed,true);
});
