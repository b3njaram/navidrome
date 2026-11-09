import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadRows,findTransfer,transferStage} from '../server/import-progress.js';

const selected={filename:'Кино/01 - Группа крови.flac',peer_username:'trusted-peer',downloader_job_id:'nas-job-100',status:'queued'};
test('matches downloader job identifier before ambiguous filenames and never leaks other jobs',()=>{
  const data={jobs:[
    {job_id:'other',filename:'01 - Группа крови.flac',username:'someone-else',state:'completed'},
    {job_id:'nas-job-100',filename:'01 - Группа крови.flac',username:'trusted-peer',state:'downloading',percentage:36}
  ]};
  assert.equal(downloadRows(data).length,2);
  const found=findTransfer(selected,downloadRows(data));
  assert.equal(found.job_id,'nas-job-100');
  assert.deepEqual(transferStage(selected,found,true),{stage:'downloading',label:'Downloading · 36%',progress:36});
});
test('does not mark a queued or completed transfer as library-available',()=>{
  const queued=transferStage(selected,{state:'queued'},true);
  const completed=transferStage(selected,{state:'completed',percentage:100},true);
  assert.equal(queued.stage,'queued');
  assert.equal(completed.stage,'indexing');
});
test('shows an explicit uncertain state if transfer acceptance was never confirmed',()=>{
  const result=transferStage({...selected,status:'needs_review'},null,true);
  assert.equal(result.stage,'unconfirmed');
  assert.match(result.label,/not confirmed/);
  assert.equal(transferStage(selected,null,false).stage,'unconfirmed');
});
test('tracks failures without inventing percentage',()=>{
  const result=transferStage(selected,{state:'failed'},true);
  assert.equal(result.stage,'failed');
  assert.equal(result.progress,null);
});
test('only a moved/imported state can be considered ready for Navidrome verification',()=>{
  const result=transferStage(selected,{state:'moved'},true);
  assert.equal(result.stage,'imported');
});
