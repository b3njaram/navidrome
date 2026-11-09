import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLyrics,parseLrc,lineAt} from '../server/lyrics-normalize.js';
test('timecoded LRC is ordered and parsed into milliseconds',()=>{
  const l=parseLrc('[00:12.54]First\n[00:08.5]Intro\n[01:01.005]Last');
  assert.deepEqual(l.map(x=>x.at),[8500,12540,61005]);
  assert.equal(lineAt(l,13),1);
});
test('structured synchronized lyrics take priority',()=>{
  const v=normalizeLyrics({structuredLyrics:[{synced:true,line:[{start:0,value:'Intro'},{start:13500,value:'Verse'}]}]},'Legacy');
  assert.equal(v.available,true);assert.equal(v.synced,true);assert.equal(v.lines[1].at,13500);
});
test('plain legacy lyrics are retained without false timing',()=>{
  const v=normalizeLyrics({}, {lyrics:'hello\nworld'});
  assert.equal(v.synced,false);assert.equal(v.lines.length,2);assert.equal(v.lines[0].at,null);
});
test('missing lyrics have an explicit empty representation',()=>{
  const v=normalizeLyrics({},null);assert.equal(v.available,false);assert.deepEqual(v.lines,[]);
});