/**
 * Low-cost Jobbi Music recommendations.
 * Scores Navidrome metadata and private, opt-in-by-listening Jobbi scrobbles.
 * No audio decoding, embeddings, LLM, peer searches or private playlist sharing.
 */
const CITY_CACHE_MS=45*60*1000;
const cityCache=new Map();
const daySeed=()=>new Date().toISOString().slice(0,10);
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const genre=s=>norm([s?.genre,s?.artist,s?.album].filter(Boolean).join(' '));
const finite=n=>Number.isFinite(Number(n))?Number(n):0;
const audioFields=['id','title','artist','album','genre','duration','coverArt','albumId','artistId','year','suffix','size'];

export function safeSong(song){
  if(!song||typeof song.id!=='string'||song.id.length>150||!song.id)return null;
  const output={};
  for(const k of audioFields){
    const val=song[k];
    if(typeof val==='string')output[k]=val.slice(0,k==='id'?150:240);
    else if(typeof val==='number'&&Number.isFinite(val))output[k]=val;
  }
  output.title=output.title||'Untitled';
  output.artist=output.artist||'Unknown artist';
  return output;
}
const hash=s=>{
  let h=2166136261;
  for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619)}
  return (h>>>0)/4294967295;
};
export function timeContext(hour){
  const h=Math.trunc(finite(hour));
  if(h>=5&&h<11)return {key:'morning',title:'Good Morning',genres:['acoustic','jazz','folk','indie','pop','soul','classical','bossa']};
  if(h>=11&&h<17)return {key:'afternoon',title:'Afternoon Energy',genres:['pop','rock','dance','funk','latin','electronic','reggaeton','hip hop','indie']};
  if(h>=17&&h<22)return {key:'evening',title:'Evening Mix',genres:['indie','r&b','jazz','soul','rock','latin','alternative','pop']};
  return {key:'night',title:'Late Night Listening',genres:['ambient','lofi','chill','classical','jazz','instrumental','dream','downtempo','soft']};
}
export function weatherContext(code,temp){
  const value=finite(code),c=finite(temp);
  if([95,96,99].includes(value))return {key:'storm',title:'Stormy Night Mix',genres:['ambient','classical','indie','jazz','soundtrack','instrumental']};
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(value))return {key:'rain',title:'Rainy Day Mix',genres:['indie','jazz','acoustic','ambient','folk','classical','lofi','soul']};
  if([71,73,75,77,85,86].includes(value))return {key:'snow',title:'Snow Day Mix',genres:['acoustic','folk','classical','jazz','ambient','soul']};
  if(c>=31)return {key:'hot',title:'Sunny Day Energy',genres:['latin','pop','dance','reggaeton','funk','electronic','rock']};
  if(value<=1)return {key:'clear',title:'Clear Skies Mix',genres:['pop','indie','folk','dance','acoustic','latin']};
  return {key:'cloudy',title:'Cloudy Day Mix',genres:['indie','alternative','rock','jazz','soul','folk','classical']};
}
const preferenceStats=plays=>{
  const artists=new Map(),genres=new Map();
  for(const entry of plays){
    const song=entry.song||{};
    const count=finite(entry.monthCount);
    const artist=norm(song.artist);
    if(artist)artists.set(artist,(artists.get(artist)||0)+count);
    if(song.genre){const g=norm(song.genre);genres.set(g,(genres.get(g)||0)+count)}
  }
  return {artists,genres};
};
export function rankSongs(candidates,{plays=[],favorites=[],context=null,size=16,mode='personal'}={}){
  const stats=preferenceStats(plays);
  const favoritesSet=new Set(favorites.map(s=>s.id));
  const recent=new Map(plays.map(p=>[p.song?.id,p]));
  const unique=new Map();
  for(const item of candidates){const song=safeSong(item);if(song&&!unique.has(song.id))unique.set(song.id,song)}
  const now=Date.now(),seed=daySeed();
  const ranked=[...unique.values()].map(song=>{
    const m=recent.get(song.id),p=finite(m?.monthCount);
    const artist=stats.artists.get(norm(song.artist))||0;
    const g=stats.genres.get(norm(song.genre))||0;
    const contextMatch=context?.genres?.some(word=>genre(song).includes(word))||false;
    let score=hash(seed+':'+mode+':'+song.id)*2;
    score+=Math.log1p(artist)*1.9 +Math.log1p(g)*1.6;
    if(favoritesSet.has(song.id))score+=2.8;
    if(contextMatch)score+=5.5;
    if(mode==='personal'&&p)score+=Math.log1p(p)*0.65;
    if(mode==='discover'&&p)score-=Math.log1p(p)*2.4;
    const last=Date.parse(m?.lastPlayed||'');
    if(Number.isFinite(last)&&now-last<18*60*60*1000)score-=5;
    return {song,score};
  }).sort((a,b)=>b.score-a.score);
  // Preserve diversity when possible. Avoid repeating one artist more than
  // twice before offering songs from other artists.
  const chosen=[],deferred=[],perArtist=new Map();
  for(const item of ranked){
    const artist=norm(item.song.artist),n=perArtist.get(artist)||0;
    if(n>=2){deferred.push(item.song);continue}
    chosen.push(item.song);perArtist.set(artist,n+1);
    if(chosen.length>=size)break;
  }
  return [...chosen,...deferred].slice(0,size);
}
function countRows(rows){
  const seen=new Map();
  for(const row of rows){
    const song=safeSong(row.song);
    if(!song)continue;
    seen.set(song.id,{song,weekCount:finite(row.week_count),
      monthCount:finite(row.month_count),lastPlayed:row.last_played});
  }
  return [...seen.values()];
}
export function makeRecommendations({history=[],random=[],starred=[],recent=[],hour=12,weather=null}={}){
  const plays=countRows(history);
  const week=[...plays].filter(p=>p.weekCount>0).sort((a,b)=>b.weekCount-a.weekCount).slice(0,20);
  const month=[...plays].sort((a,b)=>b.monthCount-a.monthCount).slice(0,20);
  const pool=[...random,...starred,...plays.map(p=>p.song),...recent];
  const time=timeContext(hour);
  const personal=rankSongs(pool,{plays,favorites:starred,size:16});
  const timeMix=rankSongs(pool,{plays,favorites:starred,context:time,mode:'time',size:14});
  const weatherTag=weather?weatherContext(weather.weatherCode,weather.temperature):null;
  return {
    topWeek:week.map(p=>({...p.song,playCount:p.weekCount})),
    topMonth:month.map(p=>({...p.song,playCount:p.monthCount})),
    recentTracks:[...new Map(recent.map(s=>[s.id,safeSong(s)]).filter(([,s])=>s)).values()].slice(0,18),
    madeForYou:personal,
    timeMix,
    timeLabel:time.title,
    timeKey:time.key,
    weatherMix:weatherTag?rankSongs(pool,{plays,favorites:starred,context:weatherTag,mode:'weather',size:14}):[],
    weatherLabel:weatherTag?.title||'',
    weather:weather?{city:weather.city,temperature:weather.temperature,condition:weatherTag.key}:null,
    trackingNote:'Weekly/monthly plays are counted from Jobbi Music listening history after this update; older Navidrome totals cannot be assigned reliably to past weeks.'
  };
}
export function localHour(minutes,at=Date.now()){
  const offset=Number(minutes);
  const safe=Number.isInteger(offset)&&offset>=-840&&offset<=840?offset:0;
  return new Date(at-safe*60000).getUTCHours();
}
async function fetchJSON(url,fetchFn){
  const reply=await fetchFn(url,{signal:AbortSignal.timeout(4500),redirect:'error'});
  if(!reply.ok)throw new Error('Weather provider temporarily unavailable');
  return reply.json();
}
/** Weather is OFF until a user explicitly supplies a city. No GPS/IP lookup. */
export async function getCityWeather(input,fetchFn=fetch,at=Date.now()){
  const city=String(input||'').trim().slice(0,80);
  if(city.length<2||!/^[\p{L}\p{M}\p{N}\s,.'-]+$/u.test(city))
    throw new Error('Enter a valid city name (for example El Paso or Ciudad Juárez).');
  const key=norm(city);
  const cached=cityCache.get(key);
  if(cached&&cached.expires>at)return cached.weather;
  const geoUrl=new URL('https://geocoding-api.open-meteo.com/v1/search');
  geoUrl.searchParams.set('name',city);
  geoUrl.searchParams.set('count','1');
  geoUrl.searchParams.set('language','en');
  const geo=await fetchJSON(geoUrl,fetchFn);
  const result=geo.results?.[0];
  if(!Number.isFinite(result?.latitude)||!Number.isFinite(result?.longitude))
    throw new Error('City not found. Try adding its state or country.');
  const forecastUrl=new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude',String(result.latitude));
  forecastUrl.searchParams.set('longitude',String(result.longitude));
  forecastUrl.searchParams.set('current','temperature_2m,weather_code');
  const current=(await fetchJSON(forecastUrl,fetchFn)).current||{};
  if(!Number.isFinite(current.temperature_2m)||!Number.isFinite(current.weather_code))
    throw new Error('Weather observations are unavailable for this city.');
  const weather={city:[result.name,result.admin1,result.country].filter(Boolean).join(', ').slice(0,110),
    temperature:current.temperature_2m,weatherCode:current.weather_code};
  if(cityCache.size>=64)cityCache.delete(cityCache.keys().next().value);
  cityCache.set(key,{weather,expires:at+CITY_CACHE_MS});
  return weather;
}
/** Track only a completed song, not arbitrary client-supplied listen counts. */
export async function recordListen({user,track,query,source='web',hour=12}){
  const song=safeSong(track);
  if(!song)throw new Error('Cannot record a track without a valid ID');
  const username=String(user||'').toLowerCase();
  if(!username||username.length>120)throw new Error('Invalid listener');
  return query(`INSERT INTO jobbi_listens(username,song_id,song_data,local_hour,source)
    SELECT $1,$2,$3::jsonb,$4,$5 WHERE NOT EXISTS (
      SELECT 1 FROM jobbi_listens
      WHERE username=$1 AND song_id=$2 AND played_at > now()-interval '45 seconds'
    )`,[username,song.id,JSON.stringify(song),Math.trunc(finite(hour)),source==='android'?'android':'web']);
}
export async function fetchListeningHistory(username,query){
  const result=await query(`SELECT song_id,
    COUNT(*) FILTER(WHERE played_at>=now()-interval '7 days')::integer AS week_count,
    COUNT(*)::integer AS month_count,
    (ARRAY_AGG(song_data ORDER BY played_at DESC))[1] AS song,
    MAX(played_at) AS last_played
    FROM jobbi_listens WHERE username=$1 AND played_at>=now()-interval '30 days'
    GROUP BY song_id ORDER BY month_count DESC LIMIT 250`,[String(username||'').toLowerCase()]);
  return result.rows||[];
}
