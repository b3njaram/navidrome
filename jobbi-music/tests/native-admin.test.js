import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {nativeAccounts,validateNewAccount,nativeToken} from '../server/admin-native.js';

function json(res,status,data){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));}
async function withServer(handle,fn){
  const srv=createServer(handle);
  await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
  try{return await fn('http://127.0.0.1:'+srv.address().port)}
  finally{await new Promise(resolve=>srv.close(resolve))}
}
const credentials={username:'admin',password:'fake-test-secret'};
test('validates account creation inputs and disallows creating elevated accounts',()=>{
  assert.throws(()=>validateNewAccount({username:'ab',password:'short'}),/Username/);
  assert.throws(()=>validateNewAccount({username:'listener',password:'short'}),/Password/);
  const data=validateNewAccount({username:'listener_1',password:'very-long-strong-password',isAdmin:true});
  assert.equal(data.isAdmin,false);
  assert.equal(data.userName,'listener_1');
});
test('native admin API creates listeners without exposing authentication token',async()=>{
  const received=[];
  await withServer(async(req,res)=>{
    if(req.url==='/auth/login'){let text='';for await(const part of req)text+=part;assert.equal(JSON.parse(text).username,'admin');return json(res,200,{token:'a'.repeat(60)});}
    if(req.url==='/api/user'&&req.method==='POST'){
      assert.equal(req.headers['x-nd-authorization'],'Bearer '+'a'.repeat(60));
      let body='';for await(const part of req)body+=part;received.push(JSON.parse(body));
      return json(res,201,{id:'u1'});
    }
    return json(res,404,{message:'not found'});
  },async base=>{
    const result=await nativeAccounts(base,credentials,{action:'create',payload:{username:'listener',password:'a-complex-password-123',isAdmin:true}});
    assert.equal(result.id,'u1');
    assert.equal(received[0].isAdmin,false);
    assert.equal(received[0].userName,'listener');
  });
});
test('native administration refuses failed authentication without falling back silently',async()=>{
  await withServer((req,res)=>json(res,401,{message:'unauthorized'}),async base=>{
    await assert.rejects(nativeToken(base,credentials),/authentication failed/);
  });
});
