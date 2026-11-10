import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylistExport,parseDelimited,findLocalSong,pickSoulseekCandidate} from '../src/playlist-export.js';
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
