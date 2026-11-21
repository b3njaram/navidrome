import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredDuration,cappedPosition,progressPercent,endedTooEarly,listenThresholdSeconds,canSeekToSeconds} from '../src/player-math.js';
test('finite duration fallback',()=>{assert.equal(preferredDuration(242,Infinity),242);assert.equal(preferredDuration(0,131),131);});
test('actual stream duration wins over mismatched catalog duration',()=>{
  assert.equal(preferredDuration(266,206),206);
  assert.equal(preferredDuration(206,266),266);
  assert.equal(preferredDuration(266,NaN),266);
});
test('early-end recovery only seeks within a verified range',()=>{
  const ranges={length:1,start:()=>0,end:()=>206};
  assert.equal(canSeekToSeconds(ranges,204),true);
  assert.equal(canSeekToSeconds(ranges,264),false);
  assert.equal(canSeekToSeconds({length:0},204),false);
  assert.equal(canSeekToSeconds(null,204),false);
  assert.equal(canSeekToSeconds(ranges,NaN),false);
  assert.equal(canSeekToSeconds({length:1,start:()=>{throw Error('invalid')},end:()=>206},30),false);
});
test('seek bounds',()=>{assert.equal(cappedPosition(Infinity,242),0);assert.equal(cappedPosition(300,242),242);assert.equal(progressPercent(121,242),50);});
test('early ending',()=>{assert.equal(endedTooEarly(120,242),true);assert.equal(endedTooEarly(237,242),false);});
test('web and Android count the same qualified listening fraction',()=>{
  assert.equal(listenThresholdSeconds(210),105);
  assert.equal(listenThresholdSeconds(900),240);
  assert.equal(listenThresholdSeconds(8),5);
  assert.equal(listenThresholdSeconds(0),30);
});
