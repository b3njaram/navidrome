// Import metadata only; never read Spotify or Apple Music credentials or stream files.
const field=s=>String(s??'').trim();
export function parseDelimited(raw,delimiter=','){
  const rows=[];let row=[],value='',quoted=false;
  const input=String(raw).replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const char=input[i];
    if(quoted){
      if(char==='"'&&input[i+1]==='"'){value+='"';i++;}
      else if(char==='"')quoted=false;
      else value+=char;
    }else if(char==='"'&&value==='')quoted=true;
    else if(char===delimiter){row.push(value);value='';}
    else if(char==='\n'||char==='\r'){
      if(char==='\r'&&input[i+1]==='\n')i++;
      row.push(value);if(row.some(x=>x.trim()))rows.push(row);
      row=[];value='';
    }else value+=char;
  }
  row.push(value);if(row.some(x=>x.trim()))rows.push(row);
  if(quoted)throw new Error('Unclosed quoted field in playlist CSV');
  return rows;
}
const normHeader=s=>field(s).toLowerCase().replace(/[^a-z0-9]+/g,'');
const take=(obj,keys)=>{for(const key of keys){const hit=obj[key];if(hit!=null&&field(hit))return hit;}return ''};
function normalizeRows(raw){
  if(!Array.isArray(raw))throw new Error('No track list found');
  return raw.slice(0,1000).map((entry,index)=>{
    const obj=Object.fromEntries(Object.entries(entry||{}).map(([k,v])=>[normHeader(k),v]));
    const title=field(take(obj,['trackname','name','title','song','songname','track']));
    const artistRaw=take(obj,['artistname','artistnames','artist','artists','performer']);
    const artist=field(Array.isArray(artistRaw)?artistRaw.map(x=>x.name||x).join(', '):artistRaw);
    const album=field(take(obj,['albumname','album','release']));
    return {id:index+1,title:title.slice(0,200),artist:artist.slice(0,200),album:album.slice(0,200)};
  }).filter(x=>x.title&&x.artist);
}
export function parsePlaylistExport(raw,filename='playlist.csv'){
  if(raw.length>2_000_000)throw new Error('Playlist exports must be under 2 MB');
  let rows;
  if(/\.(json)$/i.test(filename)||raw.trimStart().startsWith('[')||raw.trimStart().startsWith('{')){
    const json=JSON.parse(raw);
    const list=Array.isArray(json)?json:Array.isArray(json.tracks)?json.tracks:Array.isArray(json.items)?json.items:Array.isArray(json.playlists)?json.playlists.flatMap(p=>p.items||p.tracks||[]):[];
    rows=normalizeRows(list.map(r=>{
      const t=r.track||r;
      return {...t,'Track Name':t.name||t.title||t.trackName,'Artist Name':Array.isArray(t.artists)?t.artists.map(a=>a.name||a).join(', '):t.artistName||t.artist,'Album Name':t.album?.name||t.albumName||t.album};
    }));
  }else{
    const first=raw.split(/\r?\n/,1)[0];
    const delimiter=first.includes('\t')?'\t':first.split(';').length>first.split(',').length?';':',';
    const table=parseDelimited(raw,delimiter);
    if(table.length<2)throw new Error('The file has no track rows');
    const headers=table.shift().map(normHeader);
    rows=normalizeRows(table.map(cols=>Object.fromEntries(headers.map((h,i)=>[h,cols[i]||'']))));
  }
  if(!rows.length)throw new Error('No songs with both a title and artist. Try exporting a playlist as CSV, TSV, or JSON.');
  return rows;
}
export const songKey=text=>field(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function hasAll(hay,needle){
  const words=songKey(needle).split(' ').filter(w=>w.length>1);
  if(!words.length)return false;
  const all=songKey(hay);
  return words.every(word=>all.split(' ').includes(word));
}
export function findLocalSong(item,songs=[]){
  return songs.find(song=>songKey(song.title||song.name)===songKey(item.title)&&
    (hasAll(song.artist,item.artist)||hasAll(item.artist,song.artist)))||null;
}
const BAD_EDITION=/\b(live|remix|acoustic|karaoke|instrumental|demo|tribute|re[- ]?record(?:ed|ing)?|sped up|slowed|nightcore|reverb|cover version|cover song|concert|bootleg|radio edit|extended mix)\b/iu;
const normalizePath=s=>songKey(s).replace(/\s+/g,' ');
const variants=s=>[...normalizePath(s).matchAll(BAD_EDITION)].map(m=>m[0]).sort();
function recordedDuration(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  const bits=String(value||'').split(':').map(Number);
  if(bits.length===2&&bits.every(Number.isFinite))return bits[0]*60+bits[1];
  if(bits.length===3&&bits.every(Number.isFinite))return bits[0]*3600+bits[1]*60+bits[2];
  return null;
}
export function pickSoulseekCandidate(item,results=[]){
  const artist=normalizePath(item.artist),title=normalizePath(item.title),album=normalizePath(item.album);
  if(!title||!artist||!Array.isArray(results))return null;
  const expectedEdition=variants([item.title,item.version].filter(Boolean).join(' '));
  const duration=recordedDuration(item.durationSeconds??item.duration);
  const candidates=[];
  for(const row of results){
    if(!row||typeof row.filename!=='string'||typeof row.username!=='string'||
       !Number.isSafeInteger(Number(row.size))||Number(row.size)<1024)continue;
    const file=row.filename,ext=file.split('.').pop().toLowerCase();
    if(!['flac','mp3'].includes(ext))continue;
    const basename=file.split(/[\\/]/).pop().replace(/\.[^.]+$/,'').replace(/^\s*\d{1,3}\s*[-._ ]\s*/,'');
    const plainTitle=normalizePath(basename),path=normalizePath(file),whole=' '+path+' ';
    if(!plainTitle.includes(title))continue;
    if(!whole.includes(' '+artist+' '))continue;
    // A differing live/remix/demo etc. edition is a false match, regardless
    // of bitrate. If the user supplied a specific version, respect it.
    const extraEdition=variants(file);
    if(extraEdition.some(v=>!expectedEdition.includes(v)))continue;
    if(expectedEdition.some(v=>!extraEdition.includes(v)))continue;
    const candidateDuration=recordedDuration(row.duration);
    if(duration&&candidateDuration&&Math.abs(candidateDuration-duration)>Math.max(9,duration*.08))continue;
    const likelyAlbum=album&&whole.includes(' '+album+' ');
    const exactTitle=plainTitle===title||plainTitle===artist+' '+title||
      plainTitle===title+' '+artist;
    const extraWords=Math.max(0,plainTitle.split(' ').length-title.split(' ').length-
      (plainTitle.includes(artist)?artist.split(' ').length:0));
    // Strong title accuracy beats format; FLAC wins among equally safe matches.
    const score=(exactTitle?180:100)+
      (likelyAlbum?35:0) + (duration&&candidateDuration?25:0) -
      extraWords*13 + (ext==='flac'?45:0) +
      (row.freeUploadSlot?6:0)+Math.min(20,Math.max(0,Number(row.bitrate)||0)/40);
    candidates.push({...row,matchScore:Math.round(score),
      matchReason:exactTitle?'Exact title and artist':'Strong title and artist metadata',
      format:ext.toUpperCase()});
  }
  return candidates.sort((a,b)=>b.matchScore-a.matchScore||
    String(a.filename).localeCompare(String(b.filename)))[0]||null;
}

export function parseCollectionManifest(raw,filename='collection.json'){
  if(typeof raw!=='string'||raw.length>8_000_000)throw new Error('Import file exceeds 8 MB');
  const input=raw.trimStart();
  if(!input.startsWith('{')&&!input.startsWith('[') && !/\.json$/i.test(filename)){
    const tracks=parsePlaylistExport(raw,filename);
    return {format:'jobbi-collection-export/v1',collections:[{
      id:'single:'+filename,name:filename.replace(/\.(csv|tsv|txt)$/i,'').slice(0,100),
      kind:'playlist',provider:'unknown',incomplete:false,
      tracks:tracks.map((track,index)=>({...track,position:index+1}))
    }]};
  }
  const obj=JSON.parse(raw);
  if(obj?.format!=='jobbi-collection-export/v1'){
    const tracks=parsePlaylistExport(raw,filename);
    return {format:'jobbi-collection-export/v1',collections:[{
      id:'single:'+filename,name:filename.replace(/\.(json)$/i,'').slice(0,100),
      kind:'playlist',provider:'unknown',incomplete:false,
      tracks:tracks.map((track,index)=>({...track,position:index+1}))
    }]};
  }
  if(!Array.isArray(obj.collections)||!obj.collections.length||obj.collections.length>150)
    throw new Error('The Jobbi export must contain between 1 and 150 collections');
  let total=0;
  const ids=new Set();
  const collections=obj.collections.map((c,index)=>{
    if(!c||!['favorites','playlist'].includes(c.kind)||
       typeof c.name!=='string'||!c.name.trim()||c.name.length>100||
       !Array.isArray(c.tracks)||c.tracks.length>12000||
       !['spotify','apple'].includes(c.provider))
      throw new Error('Collection '+(index+1)+' has invalid metadata');
    const id=String(c.id||index);
    if(ids.has(id))throw new Error('Duplicate collection identifier');
    ids.add(id);
    total+=c.tracks.length;
    if(total>16000)throw new Error('This import has too many song entries (limit 16,000)');
    return {id,name:c.name.trim(),kind:c.kind,provider:c.provider,
      sourceUrl:typeof c.sourceUrl==='string'?c.sourceUrl.slice(0,500):'',
      expectedCount:Number.isInteger(c.expectedCount)?c.expectedCount:null,
      incomplete:Boolean(c.incomplete),
      tracks:c.tracks.map((track,pos)=>{
        const title=field(track?.title),artist=field(track?.artist);
        if(!title||!artist||title.length>200||artist.length>200)
          throw new Error('Missing artist or song title in '+c.name+' at row '+(pos+1));
        return {id:id+':'+pos,position:pos,title,artist,
          album:field(track.album).slice(0,200),version:field(track.version).slice(0,100),
          duration:track.duration||track.durationSeconds||'',
          sourceUrl:field(track.sourceUrl).slice(0,500),status:'unsearched',note:''};
      })
    };
  });
  return {format:obj.format,exportedAt:obj.exportedAt,collections};
}
