import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCollectionJob} from '../server/collection-import-jobs.js';
import {parseCollectionManifest} from '../src/playlist-export.js';

test('saved collection import exposes safe cross-device progress',()=>{
  const row={
    id:'99d2d4a2-56fe-4d2a-9650-55462dd21862',
    filename:'Apple Music.json',
    status:'monitoring',authorized:true,message:'Waiting for downloads',
    manifest:{collections:[
      {id:'spotify:mix',kind:'playlist',name:'My Mix',destinationId:'native-123',
        tracks:[{status:'added'},{status:'queued'},{status:'review'}]},
      {id:'spotify:favs',kind:'favorites',name:'Favorite Songs',
        tracks:[{status:'hearted'},{status:'unsearched'}]}
    ]},created_at:'2026-11-12',updated_at:'2026-11-13'
  };
  const summary=summarizeCollectionJob(row);
  assert.equal(summary.total,5);
  assert.equal(summary.completed,2);
  assert.equal(summary.queued,1);
  assert.equal(summary.review,1);
  assert.equal(summary.pending,1);
  assert.equal(summary.collections[0].destinationId,'native-123');
  assert.equal(JSON.stringify(summary).includes('password'),false);
});

test('saved source is normalised and repaired without altering explicit favorites',()=>{
  const raw=JSON.stringify({format:'jobbi-collection-export/v1',collections:[
    {id:'apple:favorites',name:'Favorite Songs',kind:'favorites',provider:'apple',
      tracks:[{title:'Бездельник №1',artist:'Кино'},
        {title:'Бездельник №1',artist:'Кино'},
        {title:'Бездельник №1',artist:'Кино'},
        {title:'Arizona',artist:'Zynyx'},
        {title:'Arizona',artist:'Zynyx'},
        {title:'Arizona',artist:'Zynyx'}]}
  ]});
  const result=parseCollectionManifest(raw,'collection.json');
  assert.equal(result.collections[0].kind,'favorites');
  assert.equal(result.collections[0].tracks.length,2);
  assert.equal(result.collections[0].removedDuplicates,4);
});
