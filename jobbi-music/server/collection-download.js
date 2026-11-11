import archiver from 'archiver';
import {Readable} from 'node:stream';

export const MAX_ARCHIVE_TRACKS=10000;
export const MAX_ARCHIVE_PLAYLISTS=250;
export const audioSuffix=song=>{
  const suffix=String(song?.suffix||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8);
  if(['flac','mp3','m4a','aac','ogg','opus','wav','aif','aiff','wma','alac'].includes(suffix))return suffix;
  const contentType=String(song?.contentType||'').toLowerCase();
  if(contentType.includes('flac'))return 'flac';
  if(contentType.includes('mpeg'))return 'mp3';
  if(contentType.includes('mp4'))return 'm4a';
  if(contentType.includes('ogg'))return 'ogg';
  if(contentType.includes('wav'))return 'wav';
  return 'audio';
};
export function safeArchiveName(value,limit=85){
  const out=String(value||'Untitled').normalize('NFKC')
    .replace(/[\\/<>:"|?*\x00-\x1f\x7f]/g,' ')
    .replace(/\.+/g,'.').replace(/\s+/g,' ').trim()
    .replace(/^\.+|\.+$/g,'').slice(0,limit).trim();
  return out||'Untitled';
}
export async function buildCollectionPlan(user,{scope,playlistId},subsonic){
  const collections=[];
  if(scope==='playlist'){
    if(typeof playlistId!=='string'||!playlistId||playlistId.length>150)
      throw new Error('Select a valid playlist.');
    const reply=await subsonic(user,'getPlaylist',{id:playlistId});
    if(!reply.playlist||!Array.isArray(reply.playlist.entry||[]))
      throw new Error('Playlist could not be read.');
    collections.push({name:reply.playlist.name||'Playlist',songs:reply.playlist.entry||[]});
  }else if(scope==='favorites'){
    const reply=await subsonic(user,'getStarred2');
    const songs=reply.starred2?.song;
    collections.push({name:'Favorites',songs:Array.isArray(songs)?songs:[]});
  }else if(scope==='all-playlists'){
    const reply=await subsonic(user,'getPlaylists');
    const list=reply.playlists?.playlist||[];
    if(!Array.isArray(list)||list.length>MAX_ARCHIVE_PLAYLISTS)
      throw new Error('Too many playlists to download at once.');
    for(let i=0;i<list.length;i+=5){
      const results=await Promise.all(list.slice(i,i+5).map(async(p)=>{
        if(typeof p.id!=='string'||!p.id)throw new Error('Missing playlist ID.');
        const detail=await subsonic(user,'getPlaylist',{id:p.id});
        if(!detail.playlist||!Array.isArray(detail.playlist.entry||[]))
          throw new Error('One of your playlists could not be read.');
        return {name:detail.playlist.name||p.name||'Playlist',songs:detail.playlist.entry||[]};
      }));
      collections.push(...results);
    }
  }else throw new Error('Choose playlist, all-playlists, or favorites.');
  const total=collections.reduce((n,c)=>n+c.songs.length,0);
  if(total===0)throw new Error('There are no songs in the selected collection.');
  if(total>MAX_ARCHIVE_TRACKS)throw new Error('Too many tracks in one download. Download individual playlists instead.');
  const entries=[];
  for(let ci=0;ci<collections.length;ci++){
    const collection=collections[ci];
    for(let si=0;si<collection.songs.length;si++){
      const song=collection.songs[si];
      if(!song?.id||typeof song.id!=='string'||song.id.length>150)
        throw new Error('One or more playlist tracks are invalid.');
      const folder=collections.length>1
        ?String(ci+1).padStart(3,'0')+' - '+safeArchiveName(collection.name):safeArchiveName(collection.name);
      const filename=String(si+1).padStart(4,'0')+' - '+
        safeArchiveName(song.artist||'Unknown artist',48)+' - '+
        safeArchiveName(song.title||'Untitled',75)+'.'+audioSuffix(song);
      entries.push({id:song.id,path:folder+'/'+filename});
    }
  }
  const name=scope==='all-playlists'?'Jobbi-Music-All-Playlists':
    scope==='favorites'?'Jobbi-Music-Favorites':safeArchiveName(collections[0].name,65);
  return {entries,name,total,collections:collections.length};
}
export function streamCollectionZip({res,user,plan,fetchAudio}){
  const archive=archiver('zip',{zlib:{level:0},forceZip64:true});
  const controller=new AbortController();
  let finished=false;
  archive.on('error',err=>{controller.abort();if(!res.destroyed)res.destroy(err)});
  archive.on('warning',err=>{controller.abort();if(!res.destroyed)res.destroy(err)});
  res.on('close',()=>{if(!finished){controller.abort();archive.abort()}});
  archive.on('end',()=>{finished=true});
  res.status(200);
  res.setHeader('Content-Type','application/zip');
  res.setHeader('Content-Disposition','attachment; filename="'+safeArchiveName(plan.name,85)+'.zip"');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  archive.pipe(res);
  for(const entry of plan.entries){
    // Each upstream stream starts only when the archive needs it. Never open
    // thousands of connections or buffer entire recordings in Node memory.
    const source=Readable.from((async function*(){
      const reply=await fetchAudio(user,entry.id,controller.signal);
      if(!reply.ok||!reply.body)throw new Error('Cannot download one of the recordings.');
      for await(const chunk of Readable.fromWeb(reply.body))yield chunk;
    })());
    archive.append(source,{name:entry.path});
  }
  archive.finalize().catch(err=>{if(!res.destroyed)res.destroy(err)});
}
