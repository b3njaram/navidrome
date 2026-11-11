import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_UPLOAD_BYTES,usableOriginalImage,prepareImageUpload} from '../src/image-upload.js';

test('small PNG/JPEG/WebP can be uploaded unchanged when already server-compatible',async()=>{
  for(const type of ['image/png','image/jpeg','image/webp']){
    const file={size:30000,type,name:'picture.png'};
    assert.equal(usableOriginalImage(file),true);
    assert.equal(await prepareImageUpload(file),file);
  }
});
test('oversized, HEIC and untrusted MIME types are never forwarded as raw originals',()=>{
  assert.equal(usableOriginalImage({size:MAX_UPLOAD_BYTES+1,type:'image/jpeg'}),false);
  assert.equal(usableOriginalImage({size:2048,type:'image/heic'}),false);
  assert.equal(usableOriginalImage({size:2048,type:'image/svg+xml'}),false);
  assert.equal(usableOriginalImage({size:0,type:'image/png'}),false);
});
test('impossibly large files fail before any browser decoding or upload occurs',async()=>{
  await assert.rejects(prepareImageUpload({name:'huge.heic',size:41*1024*1024,type:'image/heic'}),/40 MB/);
  await assert.rejects(prepareImageUpload(null),/Select a picture/);
  await assert.rejects(prepareImageUpload({name:'tiny.jpg',size:3,type:'image/jpeg'}),/not a valid picture/);
});
