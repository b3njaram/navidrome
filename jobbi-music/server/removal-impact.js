import crypto from 'node:crypto';

const MAX_NAVIDROME_PLAYLISTS=160;
const MAX_SOCIAL_REFERENCES=200;
const MAX_AGE_MS=3*60*1000;
const text=v=>String(v??'').slice(0,160);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json=async(user,name,args,subsonic)=>subsonic(user,name,args);

/** Inspect references available through Navidrome and the Jobbi social DB.
 * No server can assert that another user's private Navidrome playlist is empty.
 * Treat partial checks and unavailable reference stores as blockers, not "safe".
 */
export async function collectRemovalImpact({user,id,subsonic,socialQuery}){
  const {song}=await json(user,'getSong',{id},subsonic);
  if(!song || song.id!==id || typeof song.path!=='string' || !song.path)
    throw new Error('The recording could not be verified in your library.');
  const data=await json(user,'getPlaylists',{},subsonic);
  const playlists=data.playlists?.playlist||[];
  if(!Array.isArray(playlists)||playlists.length>MAX_NAVIDROME_PLAYLISTS)
    throw new Error('Too many accessible Navidrome playlists to inspect safely.');
  const personal=[];
  for(let start=0;start<playlists.length;start+=8){
    const batch=await Promise.all(playlists.slice(start,start+8).map(async p=>{
      if(!p?.id)throw new Error('Incomplete Navidrome playlist metadata');
      const result=await json(user,'getPlaylist',{id:p.id},subsonic);
      if(!result.playlist||!Array.isArray(result.playlist.entry||[]))
        throw new Error('Could not check every accessible playlist');
      if(!(result.playlist.entry||[]).some(t=>t.id===id))return null;
      const owner=text(result.playlist.owner||p.owner||user.username);
      return {kind:'navidrome',id:text(p.id),name:text(result.playlist.name||p.name),
        owner,own:owner.toLowerCase()===user.username.toLowerCase(),private:!result.playlist.public,
        restricted:false};
    }));
    personal.push(...batch.filter(Boolean));
  }
  const sql=`SELECT p.id::text AS id,p.title,p.owner,p.visibility,
    (p.owner=$2 OR EXISTS (SELECT 1 FROM social_members m
      WHERE m.playlist_id=p.id AND m.username=$2)) AS visible_to_user
    FROM social_tracks t JOIN social_playlists p ON p.id=t.playlist_id
    WHERE t.track_id=$1 ORDER BY p.id LIMIT 201`;
  const rs=await socialQuery(sql,[id,user.username.toLowerCase()]);
  if(!Array.isArray(rs.rows)||rs.rows.length>MAX_SOCIAL_REFERENCES)
    throw new Error('Too many social playlist references to inspect safely.');
  const social=rs.rows.map(p=>{
    const own=String(p.owner).toLowerCase()===user.username.toLowerCase();
    const restricted=p.visibility!=='public'&&!p.visible_to_user&&!own;
    return {kind:'social',id:restricted?null:text(p.id),
      name:restricted?'Private playlist (name hidden)':text(p.title),
      owner:restricted?null:text(p.owner),own,private:p.visibility!=='public',restricted};
  });
  const references=[...personal,...social];
  // The signature must include all known internal IDs even when output is redacted.
  const signature=hash({path:song.path,
    refs:[...personal.map(p=>p.kind+':'+p.id+':'+p.owner+':'+p.name),
      ...rs.rows.map(p=>'social:'+p.id+':'+p.owner+':'+p.title+':'+p.visibility)].sort()});
  return {
    song:{id:song.id,title:text(song.title),artist:text(song.artist)},
    references,
    referenceCount:references.length,
    hiddenPrivateCount:references.filter(p=>p.restricted).length,
    incompleteScope:true,
    warning:'This recording is shared across the NAS. Other users may have it in private Navidrome playlists that cannot be inspected. Removing it can break their playlists and Favorites.',
    signature,path:song.path
  };
}
export function makeRemovalTicket({username,id,signature},secret,at=Date.now()){
  const payload=Buffer.from(JSON.stringify({u:username.toLowerCase(),id,s:signature,exp:at+MAX_AGE_MS})).toString('base64url');
  const mac=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return payload+'.'+mac;
}
export function verifyRemovalTicket(ticket,{username,id,signature},secret,at=Date.now()){
  if(typeof ticket!=='string'||ticket.length>2048)return false;
  const parts=ticket.split('.');
  if(parts.length!==2||!parts[0]||!parts[1])return false;
  const expected=crypto.createHmac('sha256',secret).update(parts[0]).digest();
  let provided;
  try{provided=Buffer.from(parts[1],'base64url')}catch{return false}
  if(provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return false;
  try{
    const parsed=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    return parsed.u===username.toLowerCase()&&parsed.id===id&&parsed.s===signature&&
      Number.isSafeInteger(parsed.exp)&&parsed.exp>=at&&parsed.exp<=at+MAX_AGE_MS;
  }catch{return false}
}
export function impactForClient(impact,ticket){
  const {song,references,referenceCount,hiddenPrivateCount,incompleteScope,warning}=impact;
  return {song,references,referenceCount,hiddenPrivateCount,incompleteScope,warning,ticket,
    confirmation:'REMOVE_FROM_SHARED_LIBRARY'};
}
