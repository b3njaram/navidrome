import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findAndroidRelease} from '../server/android-update.js';
test('only signed public Android release assets from official repository are eligible',()=>{
 const releases=[
  {tag_name:'android-v1.2.0',draft:false,prerelease:false,assets:[{name:'Jobbi-Music-android-v1.2.0.apk',browser_download_url:'https://github.com/b3njaram/navidrome/releases/download/android-v1.2.0/Jobbi-Music-android-v1.2.0.apk',size:3456,digest:'sha256:'+'a'.repeat(64)}]},
  {tag_name:'android-v9.9.9',draft:false,prerelease:false,assets:[{name:'fake.apk',browser_download_url:'https://evil.example/fake.apk'}]},
  {tag_name:'android-v3.0.0',draft:true,assets:[]},
  {tag_name:'v99.0.0',draft:false,assets:[]}
 ];
 const x=findAndroidRelease(releases);
 assert.equal(x.available,true);assert.equal(x.version,'1.2.0');
 assert.match(x.downloadUrl,/^https:\/\/github.com\/b3njaram\/navidrome\/releases\/download/);
 assert.equal(x.sha256,'a'.repeat(64));
});
test('no release means no update and no link',()=>{
 assert.deepEqual(findAndroidRelease([]),{available:false});
});