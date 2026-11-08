import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanTree } from '../server/storage-agent.js';

test('storage scan counts nested files and excludes symlink targets',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jobbi-storage-'));
  try {
    await fs.mkdir(path.join(root,'artist'));
    await fs.writeFile(path.join(root,'song.flac'),Buffer.alloc(3200));
    await fs.writeFile(path.join(root,'artist','song.mp3'),Buffer.alloc(800));
    await fs.writeFile(path.join(root,'cover.jpg'),Buffer.alloc(1000));
    await fs.symlink(path.join(root,'song.flac'),path.join(root,'artist','duplicate.flac'));
    const result=await scanTree(root);
    assert.equal(result.musicBytes,4000);
    assert.equal(result.libraryBytes,5000);
    assert.equal(result.allFiles,3);
    assert.equal(result.files,2);
    assert.equal(result.folders,2);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('storage scan fails boundedly when maximum entries is exceeded',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jobbi-storage-'));
  try{
    for(let i=0;i<4;i++)await fs.writeFile(path.join(root,String(i)),Buffer.from('audio'));
    await assert.rejects(scanTree(root,{maxEntries:3}),/limit/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
