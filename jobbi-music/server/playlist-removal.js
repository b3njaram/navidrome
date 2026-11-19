/**
 * Confirm that Navidrome removed exactly the requested playlist occurrence.
 * A server HTTP 200 is not evidence that the entry disappeared. Verify the
 * resulting multiset of song IDs so duplicate songs are handled correctly.
 */
export function preparePlaylistRemoval(playlist,index,expectedSongId){
  const entries=playlist?.entry;
  if(!Array.isArray(entries))throw Object.assign(
    Error('Cannot verify the current playlist entries. No change requested.'),{status:503});
  if(index<0||index>=entries.length)throw Object.assign(
    Error('Song position changed; reload the playlist before removing.'),{status:409});
  const selected=entries[index];
  if(typeof selected?.id!=='string'||!selected.id)
    throw Object.assign(Error('Unrecognized playlist entry. Reload before removing.'),{status:409});
  if(expectedSongId!==undefined&&expectedSongId!==selected.id)
    throw Object.assign(Error('Playlist order changed; no song was removed. Refresh and retry.'),{status:409});
  return {id:selected.id,title:selected.title||selected.name||'Track',
    previousIds:entries.map(x=>x.id),index};
}

export function verifyPlaylistRemoval(before,playlist){
  const after=playlist?.entry;
  if(!Array.isArray(after))return false;
  if(after.length!==before.previousIds.length-1)return false;
  const expected=before.previousIds.slice();
  expected.splice(before.index,1);
  const counts=new Map();
  for(const id of expected)counts.set(id,(counts.get(id)||0)+1);
  for(const item of after){
    const id=item?.id;
    if(!counts.has(id)||counts.get(id)===0)return false;
    counts.set(id,counts.get(id)-1);
  }
  return [...counts.values()].every(n=>n===0);
}
