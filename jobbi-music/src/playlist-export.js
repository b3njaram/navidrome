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
export function pickSoulseekCandidate(item,results=[]){
  const fits=results.filter(row=>{
    if(!row||typeof row.filename!=='string')return false;
    const name=row.filename.split(/[\\/]/).pop().replace(/\.[^.]+$/,'');
    return hasAll(name,item.title)&&hasAll(row.filename,item.artist) &&
      /\.(flac|mp3|m4a|aac|ogg|opus|wav|alac)$/i.test(row.filename);
  }).sort((a,b)=>{
    const score=x=>(/\.flac$/i.test(x.filename)?120:0)+
      Math.min(70,Number(x.bitrate)||0)/10+
      (x.freeUploadSlot?20:0)+
      Math.min(35,Math.log2(Math.max(1,Number(x.uploadSpeed)||1)));
    return score(b)-score(a);
  });
  return fits[0]||null;
}
