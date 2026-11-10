/**
 * Counts indexed Navidrome tracks from every album page. Do not mistake
 * a sample of "recent albums" or the NAS disk file count for the indexed
 * library size. Treat uncountable/incomplete results as unknown, never zero.
 */
export async function countIndexedSongs(subsonic,user,{pageSize=500,maxPages=100}={}){
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500)throw new Error('Invalid page size');
  let albums=0,songs=0;
  for(let page=0;page<maxPages;page++){
    const response=await subsonic(user,'getAlbumList2',{
      type:'alphabeticalByName',size:pageSize,offset:page*pageSize
    });
    const rows=response.albumList2?.album;
    if(!Array.isArray(rows))throw new Error('Navidrome did not provide an album list');
    for(const album of rows){
      const n=Number(album.songCount);
      if(!Number.isSafeInteger(n)||n<0)throw new Error('Navidrome album is missing a usable song count');
      albums++;songs+=n;
    }
    if(rows.length<pageSize)return {indexedSongs:songs,indexedAlbums:albums,
      indexedSongsSource:'Navidrome indexed albums (all pages)',complete:true};
  }
  return {indexedSongs:null,indexedAlbums:albums,
    indexedSongsSource:'Navidrome album pagination reached safety limit',complete:false};
}

export function countAccountRows(raw) {
  const rows=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:
    Array.isArray(raw?.users)?raw.users:null;
  return rows ? rows.length : null;
}
