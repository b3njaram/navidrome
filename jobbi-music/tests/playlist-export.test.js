import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylistExport,parseDelimited,findLocalSong,pickSoulseekCandidate,pickInvidiousCandidate,collapseTripleCapture,parseCollectionManifest} from '../src/playlist-export.js';
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


test('older Apple Music tripled exports repair three copies to one song',()=>{
 const tracks=[
   ...Array.from({length:3},(_,i)=>({position:i+1,title:'Бездельник №1',artist:'Кино',sourceUrl:'https://music.apple.com/song/abc'})),
   ...Array.from({length:3},(_,i)=>({position:i+4,title:'Circle of Death',artist:'Flawed Mangoes',sourceUrl:'https://music.apple.com/song/def'})),
   ...Array.from({length:3},(_,i)=>({position:i+7,title:'Requiem',artist:'King Crimson',sourceUrl:'https://music.apple.com/song/ghi'}))
 ];
 const json=JSON.stringify({format:'jobbi-collection-export/v1',collections:[
   {id:'apple:test',kind:'playlist',provider:'apple',name:'Test',tracks}
 ]});
 const result=parseCollectionManifest(json,'old-export.json');
 assert.equal(result.collections[0].tracks.length,3);
 assert.equal(result.collections[0].removedDuplicates,6);
 assert.deepEqual(result.collections[0].tracks.map(t=>t.title),
   ['Бездельник №1','Circle of Death','Requiem']);
});

test('intentional doubles and isolated triplets are not erased',()=>{
 const two=[{title:'A',artist:'B'},{title:'A',artist:'B'}];
 assert.equal(collapseTripleCapture(two).tracks.length,2);
 const mixed=[...Array.from({length:3},()=>({title:'A',artist:'B'})),
   {title:'X',artist:'Y'}, {title:'Z',artist:'Q'}, {title:'J',artist:'K'}];
 assert.equal(collapseTripleCapture(mixed).removed,0);
});

test('FLAC is selected before MP3 among safe matches',()=>{
 const song={title:'Dream Song',artist:'Artist'};
 const choices=[
   {username:'perfect-mp3',filename:'Artist/Dream Song.mp3',size:7000000,bitrate:320},
   {username:'good-flac',filename:'Artist/Album/01 - Dream Song.flac',size:42000000}
 ];
 assert.equal(pickSoulseekCandidate(song,choices).username,'good-flac');
});

test('Invidious fallback must verify title artist edition and duration',()=>{
 const song={title:'Dream Song',artist:'Artist',duration:'3:10'};
 const results=[
   {videoId:'abcABC12345',title:'Artist - Dream Song (LIVE)',artist:'Artist',duration:190},
   {videoId:'abcABC12346',title:'Artist - Dream Song',artist:'Artist - Topic',duration:600},
   {videoId:'abcABC12347',title:'Artist - Dream Song (Official Audio)',artist:'Artist',duration:190},
   {videoId:'abcABC12348',title:'Another Artist - Dream Song',artist:'Other',duration:190}
 ];
 const chosen=pickInvidiousCandidate(song,results);
 assert.equal(chosen?.videoId,'abcABC12347');
 assert.equal(chosen?.format,'INVIDIOUS');
 assert.equal(pickInvidiousCandidate(song,[results[0],results[1]]),null);
});
