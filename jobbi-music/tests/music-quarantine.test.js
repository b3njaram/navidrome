import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readdir, lstat, symlink, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {quarantineFile} from '../server/music-quarantine-agent.mjs';

test('NAS quarantine safely moves a music file without permanently deleting its bytes',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jobbi-quarantine-'));
  try{
    await mkdir(path.join(root,'Artist','Album'),{recursive:true});
    const file=path.join(root,'Artist','Album','Track.flac');
    const bytes=Buffer.from('test audio metadata placeholder');
    await writeFile(file,bytes);
    const result=await quarantineFile(root,'Artist/Album/Track.flac');
    assert.equal(result.original,'Artist/Album/Track.flac');
    await assert.rejects(lstat(file),{code:'ENOENT'});
    const names=await readdir(path.join(root,'.jobbi-quarantine'));
    assert.equal(names.length,1);
    assert.equal(names[0],result.stored);
    assert.deepEqual(await readFile(path.join(root,'.jobbi-quarantine',names[0])),bytes);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('NAS quarantine rejects paths outside music root and unsupported file types',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jobbi-quarantine-'));
  try{
    for(const input of ['../bad.flac','/etc/passwd','folder/../../secret.flac',
      'playlist.m3u','folder\\song.mp3','.jobbi-quarantine/file.flac','']){
      await assert.rejects(quarantineFile(root,input));
    }
  }finally{await rm(root,{recursive:true,force:true})}
});

test('NAS quarantine refuses symlinked audio and symlinked directory',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jobbi-quarantine-'));
  const outside=await mkdtemp(path.join(os.tmpdir(),'jobbi-outside-'));
  try{
    await writeFile(path.join(outside,'external.flac'),'dont touch');
    await symlink(path.join(outside,'external.flac'),path.join(root,'link.flac'));
    await symlink(outside,path.join(root,'linked-directory'));
    await assert.rejects(quarantineFile(root,'link.flac'),/Symbolic links/);
    await assert.rejects(quarantineFile(root,'linked-directory/external.flac'),/Symbolic links/);
    assert.equal(await readFile(path.join(outside,'external.flac'),'utf8'),'dont touch');
  }finally{
    await rm(root,{recursive:true,force:true});
    await rm(outside,{recursive:true,force:true});
  }
});
