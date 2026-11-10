import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylistExport,parseDelimited,findLocalSong,pickSoulseekCandidate,parseCollectionManifest} from '../src/playlist-export.js';
test('Spotify CSV and quoted commas',()=>{
 const rows=parsePlaylistExport('Track Name,Artist Name(s),Album Name\n"Long Journey, Home",Billy Strings,Live\n','spotify.csv');
 assert.equal(rows[0].title,'Long Journey, Home');assert.equal(rows[0].artist,'Billy Strings');
});
test('Apple Music TSV and JSON metadata',()=>{
 const rows=parsePlaylistExport('Name\tArtist\tAlbum\nRoving Gambler\tThe Country Gentlemen\tVintage\n','music.txt');
 assert.equal(rows[0].artist,'The Country Gentlemen');
 const r=parsePlaylistExport(JSON.stringify([{track:{name:'Roving Gambler',artists:[{name:'The Country Gentlemen'}]}}]),'a.json');
 assert.equal(r[0].title,'Roving Gambler');
});
test('library matching is accent and Unicode safe',()=>{
 assert.equal(findLocalSong({title:'Группа крови',artist:'Кино'},[{id:'x',title:'Группа крови',artist:'Кино'}]).id,'x');
 assert.equal(findLocalSong({title:'Canción',artist:'José'},[{id:'z',title:'Cancion',artist:'Jose'}]).id,'z');
});
test('Soulseek FLAC preferred only for strong title/artist matches',()=>{
 const rows=[{username:'a',filename:'Billy Strings/Long Journey Home.mp3',size:14000000},
 {username:'b',filename:'Billy Strings/Long Journey Home.flac',size:50000000},
 {username:'c',filename:'Another Artist/Long Journey Home.flac',size:50000000}];
 assert.equal(pickSoulseekCandidate({title:'Long Journey Home',artist:'Billy Strings'},rows).username,'b');
 assert.equal(pickSoulseekCandidate({title:'Группа крови',artist:'Кино'},rows),null);
});

test('combined manifest keeps Liked Songs separate from individual playlists and duplicate entries',()=>{
  const file=JSON.stringify({format:'jobbi-collection-export/v1',exportedAt:'2026-11-10',
    collections:[
      {id:'spotify:/collection/tracks',kind:'favorites',provider:'spotify',name:'Liked Songs',
        tracks:[{title:'Dark Beach',artist:'PASTEL GHOST',album:'Abyss',position:1}]},
      {id:'spotify:/playlist/123',kind:'playlist',provider:'spotify',name:'Banjo',
        tracks:[{title:'Roving Gambler',artist:'Country Gentlemen',position:1},
          {title:'Roving Gambler',artist:'Country Gentlemen',position:2}]}
    ]});
  const result=parseCollectionManifest(file,'jobbi-export.json');
  assert.equal(result.collections.length,2);
  assert.equal(result.collections[0].kind,'favorites');
  assert.equal(result.collections[0].tracks[0].title,'Dark Beach');
  assert.equal(result.collections[1].tracks.length,2);
  assert.notEqual(result.collections[1].tracks[0].id,result.collections[1].tracks[1].id);
});
test('metadata manifest rejects unknown collection kinds and invalid songs',()=>{
  const base={format:'jobbi-collection-export/v1',collections:[{
    id:'a',provider:'spotify',name:'Test',kind:'favorites',
    tracks:[{title:'X',artist:'Y'}]
  }]};
  assert.throws(()=>parseCollectionManifest(JSON.stringify({...base,collections:[
    {...base.collections[0],kind:'something-else'}]}),'a.json'),/invalid metadata/);
  assert.throws(()=>parseCollectionManifest(JSON.stringify({...base,collections:[
    {...base.collections[0],tracks:[{title:'Missing artist'}]}]}),'a.json'),/Missing artist/);
});
test('candidate matching ignores live, remixed, demo, karaoke and cover versions when studio is requested',()=>{
  const song={title:'Dark Beach',artist:'PASTEL GHOST',album:'Abyss',duration:'3:42'};
  const base={username:'peer',size:50000000,bitrate:1000};
  const rows=[
    {...base,filename:'PASTEL GHOST/Live at Somewhere/Dark Beach.flac'},
    {...base,filename:'PASTEL GHOST/Dark Beach (Remix).flac'},
    {...base,filename:'PASTEL GHOST/Dark Beach Acoustic Demo.flac'},
    {...base,filename:'PASTEL GHOST/Abyss/Dark Beach.mp3',size:7000000,duration:224}
  ];
  const chosen=pickSoulseekCandidate(song,rows);
  assert.equal(chosen.filename,'PASTEL GHOST/Abyss/Dark Beach.mp3');
  assert.equal(chosen.format,'MP3');
});
test('FLAC takes priority among valid non-live recordings and the version explicitly requested is honored',()=>{
  const song={title:'Dark Beach',artist:'PASTEL GHOST'};
  const rows=[
    {username:'a',filename:'PASTEL GHOST/Dark Beach.mp3',size:7000000},
    {username:'b',filename:'PASTEL GHOST/Dark Beach.flac',size:43000000}
  ];
  assert.equal(pickSoulseekCandidate(song,rows).username,'b');
  const live={...song,title:'Dark Beach (Live)'};
  assert.equal(pickSoulseekCandidate(live,[{
    username:'a',filename:'PASTEL GHOST/Dark Beach (Live).flac',size:42000000
  }]).username,'a');
});
test('legacy CSV still imports as a single normal playlist, not favorites',()=>{
  const result=parseCollectionManifest('Track Name,Artist Name\nSong,Artist\n','songs.csv');
  assert.equal(result.collections[0].kind,'playlist');
  assert.equal(result.collections[0].tracks[0].artist,'Artist');
});
