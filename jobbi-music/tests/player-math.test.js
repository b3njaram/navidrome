import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredDuration,cappedPosition,progressPercent,endedTooEarly} from '../src/player-math.js';
test('finite duration fallback',()=>{assert.equal(preferredDuration(242,Infinity),242);assert.equal(preferredDuration(0,131),131);});
test('seek bounds',()=>{assert.equal(cappedPosition(Infinity,242),0);assert.equal(cappedPosition(300,242),242);assert.equal(progressPercent(121,242),50);});
test('early ending',()=>{assert.equal(endedTooEarly(120,242),true);assert.equal(endedTooEarly(237,242),false);});
