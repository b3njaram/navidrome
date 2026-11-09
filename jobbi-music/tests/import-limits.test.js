import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkStorageStats} from '../server/music-import.js';
import {validateImportSelection} from '../server/music-requests.js';
async function withFixture(data,fn){
 const folder=await mkdtemp(path.join(os.tmpdir(),'jobbi-quota-'));
 const file=path.join(folder,'stats.json');
 await writeFile(file,JSON.stringify(data));
 try{return await fn(file)}finally{await rm(folder,{recursive:true,force:true})}
}
test('storage checks preserve 4GiB NAS reserve',async()=>{
 const now=Date.now();
 await withFixture({status:'ready',checkedAt:new Date(now).toISOString(),freeBytes:8*1024**3},async file=>{
   assert.equal((await checkStorageStats(file,25000000,{now})).freeBytes,8*1024**3);
 });
 await withFixture({status:'ready',checkedAt:new Date(now).toISOString(),freeBytes:4*1024**3},async file=>{
   await assert.rejects(checkStorageStats(file,25000000,{now}),/too low/);
 });
});
test('stale or unavailable storage status blocks new imports',async()=>{
 const now=Date.now();
 await withFixture({status:'ready',checkedAt:new Date(now-100*60000).toISOString(),freeBytes:20*1024**3},async file=>{
   await assert.rejects(checkStorageStats(file,50000,{now}),/not current/);
 });
});
test('audio selections reject non-music and peer path traversal',()=>{
 const valid={username:'peer',filename:'Music/recording.flac',size:25000000,artist:'A',title:'Song'};
 assert.equal(validateImportSelection(valid).filename,'Music/recording.flac');
 assert.throws(()=>validateImportSelection({...valid,filename:'../payload.exe'}),/Only supported/);
 assert.throws(()=>validateImportSelection({...valid,filename:'../track.flac'}),/Only supported/);
});
