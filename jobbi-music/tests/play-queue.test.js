import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueNext,enqueueLast,reorderUpcoming,removeUpcoming,clearUpcoming,nextQueueIndex} from '../src/play-queue.js';
const s=(id)=>({id,title:id});
const q=[s('a'),s('b'),s('c'),s('b')];
test('Play Next inserts after the current song, preserving the rest and duplicates',()=>{
  const result=enqueueNext(q,0,s('new'));
  assert.deepEqual(result.map(x=>x.id),['a','new','b','c','b']);
  assert.equal(q.length,4);
  assert.deepEqual(enqueueNext([], -1,s('a')).map(x=>x.id),['a']);
});
test('Add to Queue appends to the end and allows repeated songs',()=>{
  assert.deepEqual(enqueueLast(q,0,s('b')).map(x=>x.id),['a','b','c','b','b']);
});
test('Reordering queue only moves future tracks; currently playing stays fixed',()=>{
  assert.deepEqual(reorderUpcoming(q,0,3,1).map(x=>x.id),['a','b','b','c']);
  assert.equal(reorderUpcoming(q,1,1,3),q);
  assert.equal(reorderUpcoming(q,1,2,1),q);
});
test('Remove and clear affect only upcoming tracks',()=>{
  assert.deepEqual(removeUpcoming(q,0,2).map(x=>x.id),['a','b','b']);
  assert.equal(removeUpcoming(q,1,1),q);
  assert.deepEqual(clearUpcoming(q,1).map(x=>x.id),['a','b']);
  assert.equal(nextQueueIndex(q,2),3);
  assert.equal(nextQueueIndex(q,3),-1);
});
test('Invalid songs and indexes are safely ignored',()=>{
  assert.equal(enqueueNext(q,0,{title:'no ID'}),q);
  assert.equal(enqueueLast(q,0,null),q);
  assert.equal(reorderUpcoming(q,2,-1,0),q);
  assert.equal(removeUpcoming(q,2,999),q);
});
