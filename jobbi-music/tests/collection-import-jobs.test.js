import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCollectionJob,summarizeCollectionTransferHealth,summarizeFallbackRecordings,prepareSafeImportRetry} from '../server/collection-import-jobs.js';
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

test('safe retry does not submit duplicate downloads for rows with prior transfer IDs',()=>{
  const at=Date.now();
  const state={collections:[{kind:'favorites',tracks:[
    {title:'Already added',status:'hearted'},
    {title:'Waiting peer',status:'queued',importId:'prior-1'},
    {title:'Failed fallback',status:'review',source:'invidious',importId:'prior-2'},
    {title:'Rejected match',status:'review'},
    {title:'Search failed',status:'failed'},
    {title:'Downloaded metadata review',status:'review',source:'soulseek',importId:'prior-3'}
  ]}]};
  const result=prepareSafeImportRetry(state,at);
  assert.deepEqual(result,{recheck:2,research:2,untouched:2});
  const tracks=state.collections[0].tracks;
  assert.equal(tracks[0].status,'hearted');
  assert.equal(tracks[1].status,'queued');
  for(const index of [2,5]){
    assert.equal(tracks[index].status,'queued');
    assert.equal(tracks[index].retryAt,at);
    assert.match(tracks[index].note,/no duplicate download/);
    assert.ok(tracks[index].importId);
  }
  for(const index of [3,4]){
    assert.equal(tracks[index].status,'unsearched');
    assert.equal(tracks[index].retryAt,at);
  }
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

test('queued does not mean downloading; classify real peer transfers safely',()=>{
  const ids=[
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  ];
  const names=['Active song','Peer waiting','Failed song','Missing transfer'];
  const collections=[{name:'Favorite Songs',tracks:names.map((title,i)=>({
    title,artist:'Test',source:'soulseek',importId:ids[i],status:'queued'
  }))}];
  // The shared song is queued for a second playlist but must not imply
  // an independent peer transfer.
  collections.push({name:'Second playlist',tracks:[{
    title:'Active song',artist:'Test',status:'queued',
    importId:ids[0],source:'soulseek'
  }]});
  const rows=ids.map((id,i)=>({
    id,filename:'song'+i+'.flac',peer_username:'peer',
    status:'queued',created_at:'2026-11-18T00:00:00Z',
    downloader_job_id:'download-'+i,already_on_nas:false
  }));
  const snapshot={healthy:true,rows:[
    {job_id:'download-0',status:'downloading',progress:0.57},
    {job_id:'download-1',status:'queued'},
    {job_id:'download-2',status:'failed'}
  ]};
  const result=summarizeCollectionTransferHealth(collections,rows,snapshot);
  assert.equal(result.counts.queued,5);
  assert.equal(result.counts.active,2);
  assert.equal(result.counts.waiting,1);
  assert.equal(result.counts.failed,1);
  assert.equal(result.counts.unconfirmed,1);
  assert.equal(result.uniqueTransfers,4);
  assert.equal(result.examples.some(x=>x.title==='Failed song'),true);
  assert.equal(result.explanation.includes('not necessarily active'),true);
});

test('unreachable downloader is not mistaken for failed or completed',()=>{
  const id='a1111111-1111-4111-8111-111111111111';
  const tracks=[{status:'queued',source:'soulseek',importId:id,title:'Kino',artist:'Test'}];
  const snapshot={healthy:false,rows:[]};
  const result=summarizeCollectionTransferHealth(
    [{name:'Favorites',tracks}],
    [{id,filename:'song.flac',peer_username:'peer',status:'queued',
      created_at:'2026-11-18T00:00:00Z',already_on_nas:false}],
    snapshot);
  assert.equal(result.counts.unconfirmed,1);
  assert.equal(result.counts.failed,0);
  assert.equal(result.counts.active,0);
  assert.equal(result.downloaderConnected,false);
});


test('fallback snapshot distinguishes completed MP3 files from active downloads',()=>{
  const tracks=[
    {title:'Little Dark Age',artist:'MGMT'},
    {title:'Bloody Stream',artist:'Coda'},
    {title:'Missing Track',artist:'Composer'},
    {title:'Waiting Song',artist:'Artist'},
    {title:'Unknown Song',artist:'Other'}
  ];
  const requests=[
    {video_id:'rTL50MyBHPs',title:'Little Dark Age',artist:'MGMT'},
    {video_id:'hmpJq3LsR48',title:'Bloody Stream',artist:'Coda'},
    {video_id:'DuZhWMLLofg',title:'Missing Track',artist:'Composer'},
    {video_id:'gurstRLm06E',title:'Waiting Song',artist:'Artist'}
  ];
  const status={connected:true,items:[
    {videoId:'rTL50MyBHPs',status:'completed',present:true},
    {videoId:'hmpJq3LsR48',status:'running',present:false},
    {videoId:'DuZhWMLLofg',status:'completed',present:false},
    {videoId:'gurstRLm06E',status:'queued',present:false}
  ]};
  const result=summarizeFallbackRecordings(tracks,requests,status);
  assert.equal(result.counts.total,5);
  assert.equal(result.counts.onNas,1);
  assert.equal(result.counts.active,1);
  assert.equal(result.counts.waiting,1);
  assert.equal(result.counts.missing,1);
  assert.equal(result.counts.unknown,1);
  assert.equal(result.uniqueVideoIds,4);
  assert.equal(result.examples[0].title,'Missing Track');
});

test('fallback worker offline does not imply completed recordings failed',()=>{
  const tracks=[{title:'Little Dark Age',artist:'MGMT'}];
  const requests=[{video_id:'rTL50MyBHPs',title:'Little Dark Age',artist:'MGMT'}];
  const result=summarizeFallbackRecordings(tracks,requests,{connected:false,items:[]});
  assert.equal(result.counts.unconfirmed,1);
  assert.equal(result.counts.failed,0);
  assert.equal(result.connected,false);
});
