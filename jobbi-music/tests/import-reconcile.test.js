import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transliterateMusic,musicKey,libraryQueries,matchingLibrarySong,groupMusicImports}
  from '../server/import-reconcile.js';

test('Cyrillic Kino music names match Latin Navidrome metadata without fuzzy cross-artist matches',()=>{
  assert.equal(transliterateMusic('Группа крови'),'gruppa krovi');
  assert.equal(transliterateMusic('Кино'),'kino');
  assert.equal(musicKey('ГРУППА — крови'),'gruppa krovi');
  assert.deepEqual(libraryQueries({title:'Группа крови',artist:'Кино'}),
    ['Группа крови','gruppa krovi','Кино']);
  const result=matchingLibrarySong({title:'Группа крови',artist:'Кино'},[
    {id:'wrong',title:'Gruppa Krovi',artist:'Other Artist'},
    {id:'correct',title:'Gruppa Krovi',artist:'Kino'}]);
  assert.equal(result?.id,'correct');
  assert.equal(matchingLibrarySong({title:'Группа крови',artist:'Кино'},
    [{id:'wrong',title:'Gruppa Krovi',artist:'Other Artist'}]),null);
});
test('three stale imports for the same song display as one non-destructive group',()=>{
  const now=new Date().toISOString();
  const base={title:'Группа крови',artist:'Кино',submittedAt:now,progress:null};
  const rows=[
    {...base,id:'a',stage:'unconfirmed',archivable:true},
    {...base,id:'b',stage:'unconfirmed',archivable:true},
    {...base,id:'c',stage:'existing',archivable:true},
    {...base,id:'d',stage:'downloading',title:'Другая песня',archivable:false}
  ];
  const grouped=groupMusicImports(rows);
  assert.equal(grouped.length,2);
  const kino=grouped.find(x=>x.title==='Группа крови');
  assert.equal(kino.attemptCount,3);
  assert.equal(kino.stage,'existing');
  assert.deepEqual(kino.archiveIds.sort(),['a','b','c']);
});
