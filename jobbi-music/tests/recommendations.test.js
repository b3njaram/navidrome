import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safeSong,timeContext,weatherContext,rankSongs,makeRecommendations,
  localHour,getCityWeather,recordListen,fetchListeningHistory
} from '../server/recommendations.js';

const track=(id,genre='Indie',artist='Example')=>({
  id,title:'Song '+id,artist,genre,album:'Album',duration:210,
  coverArt:'cover-'+id,albumId:'album-1'
});

test('Sanitizes track metadata without storing file paths, secrets, or raw payloads',()=>{
  const result=safeSong({...track('x'),path:'/volume1/music/private.flac',password:'secret'});
  assert.equal(result.id,'x');
  assert.equal(result.path,undefined);
  assert.equal(result.password,undefined);
  assert.equal(safeSong({id:''}),null);
});
test('Local time-of-day uses user offset, not NAS server timezone',()=>{
  const noon=Date.parse('2026-11-10T18:00:00Z');
  assert.equal(localHour(360,noon),12); // UTC-6
  assert.equal(localHour(0,noon),18);
  assert.equal(timeContext(8).key,'morning');
  assert.equal(timeContext(13).key,'afternoon');
  assert.equal(timeContext(19).key,'evening');
  assert.equal(timeContext(1).key,'night');
});
test('Weather groups have intuitive genres and do not require AI or decoded audio',()=>{
  assert.equal(weatherContext(61,21).key,'rain');
  assert.equal(weatherContext(95,25).key,'storm');
  assert.equal(weatherContext(0,35).key,'hot');
  assert.equal(weatherContext(71,-2).key,'snow');
});
test('Counts weekly and monthly per-user plays separately and ranks most-played first',()=>{
  const history=[
    {song:track('one'),week_count:3,month_count:8,last_played:'2026-11-09T10:00:00Z'},
    {song:track('two'),week_count:5,month_count:5,last_played:'2026-11-08T11:00:00Z'},
    {song:track('three'),week_count:0,month_count:10,last_played:'2026-10-15T11:00:00Z'}
  ];
  const result=makeRecommendations({history,random:[track('fresh')],starred:[],recent:[track('new')],hour:8});
  assert.deepEqual(result.topWeek.map(s=>s.id),['two','one']);
  assert.deepEqual(result.topWeek.map(s=>s.playCount),[5,3]);
  assert.deepEqual(result.topMonth.map(s=>s.id),['three','one','two']);
  assert.equal(result.recentTracks[0].id,'new');
  assert.equal(result.timeLabel,'Good Morning');
  assert.ok(result.madeForYou.length>0);
  assert.equal(result.weatherMix.length,0);
});
test('Contextual mixes use available genre metadata, retain variety and do not expose listening activity',()=>{
  const library=[
    track('rain','Jazz'),track('rain2','Acoustic','Artist B'),
    track('pop','Pop','Artist C'),track('night','Ambient','Artist D'),
    track('rock','Rock','Artist E')
  ];
  const result=makeRecommendations({random:library,weather:{
    city:'El Paso, Texas, United States',temperature:15,weatherCode:61
  },hour:23});
  assert.equal(result.weather.condition,'rain');
  assert.equal(result.weatherLabel,'Rainy Day Mix');
  assert.equal(result.weatherMix.length,library.length);
  assert.equal(result.timeLabel,'Late Night Listening');
  assert.equal(result.weatherMix[0].song_id,undefined);
  const favorites=rankSongs(library,{favorites:[track('rock')]});
  assert.ok(favorites.some(s=>s.id==='rock'));
});
test('Optional weather only resolves an explicitly supplied city and caches the result',async()=>{
  let calls=0;
  const mock=async url=>{
    calls++;
    const host=new URL(String(url)).hostname;
    if(host==='geocoding-api.open-meteo.com'){
      return {ok:true,json:async()=>({results:[{name:'El Paso',admin1:'Texas',country:'United States',latitude:31.76,longitude:-106.49}]})};
    }
    if(host==='api.open-meteo.com'){
      return {ok:true,json:async()=>({current:{temperature_2m:24,weather_code:0}})};
    }
    throw Error('Unexpected external host');
  };
  const input='El Paso 123'; // unique city cache key for this test
  const result=await getCityWeather(input,mock,1000000);
  assert.equal(result.temperature,24);
  assert.equal(result.city,'El Paso, Texas, United States');
  await getCityWeather(input,mock,1000001);
  assert.equal(calls,2);
  await assert.rejects(getCityWeather('http://169.254.169.254',mock),/valid city/);
});
test('Recording one completed listen uses server-derived track metadata and SQL parameters',async()=>{
  let executed;
  await recordListen({user:'ALICE',track:{...track('track-1'),path:'/private/song.flac'},
    source:'android',hour:22,query:async(sql,args)=>{executed={sql,args};return {rowCount:1}}});
  assert.equal(executed.args[0],'alice');
  assert.equal(executed.args[1],'track-1');
  assert.equal(executed.args[3],22);
  assert.equal(executed.args[4],'android');
  assert.equal(JSON.parse(executed.args[2]).path,undefined);
  assert.match(executed.sql,/NOT EXISTS/);
});
test('Listening history only queries the authenticated username and a 30-day interval',async()=>{
  let statement;
  await fetchListeningHistory('Listener',async(sql,args)=>{statement={sql,args};return {rows:[]}});
  assert.deepEqual(statement.args,['listener']);
  assert.match(statement.sql,/30 days/);
  assert.match(statement.sql,/7 days/);
});
