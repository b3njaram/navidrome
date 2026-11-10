import test from 'node:test';
import assert from 'node:assert/strict';
import {imageMime} from '../server/artwork.js';
test('personal artwork accepts verified JPEG, PNG and WebP signatures',()=>{
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(64)]);
 const jpg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(40)]);
 const webp=Buffer.from('RIFF____WEBPxxxxxxxxxxxxxxxx','ascii');
 assert.equal(imageMime(png),'image/png');
 assert.equal(imageMime(jpg),'image/jpeg');
 assert.equal(imageMime(webp),'image/webp');
});
test('album artwork rejects executable formats, malformed files and oversize input',()=>{
 assert.equal(imageMime(Buffer.from('<svg onload="alert(1)"/>')) ,null);
 assert.equal(imageMime(Buffer.alloc(10)),null);
 assert.equal(imageMime(Buffer.alloc(1048577)),null);
 assert.equal(imageMime(Buffer.from('hello world hello world')),null);
});
