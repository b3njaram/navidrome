// Pure import reconciliation helpers. Never mark a recording playable
// without confirming its metadata in the authenticated Navidrome catalog.
const CYR=Object.freeze({
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh',
  'з':'z','и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o',
  'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
  'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e',
  'ю':'yu','я':'ya','і':'i','ї':'yi','є':'ye'
});
export function transliterateMusic(value){
  return String(value||'').toLowerCase().replace(/[а-яёіїє]/gu,ch=>CYR[ch]??ch);
}
export function musicKey(value){
  return transliterateMusic(String(value||'').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,''))
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export function matchingLibrarySong(item,songs){
  const title=musicKey(item?.title),artist=musicKey(item?.artist);
  if(!title||!artist||!Array.isArray(songs))return null;
  // Require both a matching title AND artist to avoid false-positive "ready"
  // results for common song titles from unrelated performers.
  return songs.find(song=>song?.id&&musicKey(song.title)===title&&
    musicKey(song.artist)===artist)||null;
}
export function libraryQueries(item){
  const query=String(item?.title||'').trim();
  const transliterated=transliterateMusic(query);
  const ret=[query];
  if(transliterated.toLowerCase()!==query.toLowerCase())ret.push(transliterated);
  // Search for the artist if the library stored a different song-title
  // spelling; matchingLibrarySong still enforces exact normalized metadata.
  const artist=String(item?.artist||'').trim();
  if(artist&&artist.toLowerCase()!==query.toLowerCase())ret.push(artist);
  return [...new Set(ret.filter(x=>x.length>=2))].slice(0,3);
}
const stageScore=Object.freeze({
  available:80,downloading:70,indexing:60,imported:60,existing:50,
  queued:40,failed:20,unconfirmed:10
});
export function groupMusicImports(rows){
  const groups=new Map();
  for(const item of rows||[]){
    const key=musicKey(item.artist)+'|'+musicKey(item.title);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  }
  return [...groups.values()].map(group=>{
    const mostUseful=[...group].sort((a,b)=>
      (stageScore[b.stage]||0)-(stageScore[a.stage]||0)||
      Date.parse(b.submittedAt)-Date.parse(a.submittedAt))[0];
    return {...mostUseful,
      attemptCount:group.length,
      archiveIds:group.filter(x=>x.archivable).map(x=>x.id),
      // The user sees one card but all original history remains in PostgreSQL.
      latestSubmittedAt:group[0]?.submittedAt
    };
  });
}
