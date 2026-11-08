import express from 'express';
import crypto from 'node:crypto';
import {socialQuery,withSocialTransaction,ensureSocialProfile,normalUsername} from './social-db.js';

export class SocialError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
const fail=(status,message)=>{throw new SocialError(message,status)};
const key=x=>normalUsername(x);
const validId=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x)&&x.length<=40;
const safeText=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=max;
const socialMutations=new Map();
setInterval(()=>{const now=Date.now();for(const [user,record] of socialMutations)if(now-record.start>600000)socialMutations.delete(user)},60000).unref();
const short=(x,max)=>String(x||'').slice(0,max);
const visibility=x=>x==='public'||x==='private';
const ordered=(a,b)=>[a,b].sort();
async function friends(a,b){
  const [x,y]=ordered(a,b);
  const r=await socialQuery('SELECT 1 FROM social_friends WHERE a=$1 AND b=$2',[x,y]);
  return r.rowCount>0;
}
async function loadPlaylist(id,viewer){
  if(!validId(id))fail(404,'Playlist not found');
  const {rows}=await socialQuery(`SELECT p.*,m.can_edit, (m.username IS NOT NULL) AS is_member,
      (SELECT COUNT(*)::int FROM social_tracks t WHERE t.playlist_id=p.id) AS song_count
    FROM social_playlists p LEFT JOIN social_members m ON m.playlist_id=p.id AND m.username=$2
      AND EXISTS(SELECT 1 FROM social_friends f WHERE f.a=LEAST(p.owner,$2) AND f.b=GREATEST(p.owner,$2))
    WHERE p.id=$1 AND (p.owner=$2 OR p.visibility='public' OR m.username IS NOT NULL)`,[id,viewer]);
  if(!rows.length)fail(404,'Playlist not found');
  return rows[0];
}
function editPermission(p,actor){
  if(p.kind==='blend')fail(403,'Blends are managed by both friends using Refresh blend');
  if(p.owner!==actor&&!(p.is_member&&p.can_edit))fail(403,'You cannot edit this playlist');
}
function cleanTrack(t){
  const id=String(t.id||t.track_id||'');
  if(!id||id.length>180)fail(400,'Invalid Navidrome track');
  const title=short(t.title||t.name,200);
  if(!title)fail(400,'Track is missing a title');
  return {id,title,artist:short(t.artist,200),album:short(t.album,200),
    coverArt:short(t.coverArt||t.cover_art,180),duration:Math.max(0,Math.min(100000,Math.trunc(Number(t.duration)||0)))};
}
async function addTracks(client,playlistId,rows,{max=1000}={}){
  await client.query('SELECT id FROM social_playlists WHERE id=$1 FOR UPDATE',[playlistId]);
  const current=await client.query('SELECT COUNT(*)::int AS count FROM social_tracks WHERE playlist_id=$1',[playlistId]);
  if(Number(current.rows[0].count)+rows.length>max)fail(409,`Playlist limit is ${max} tracks`);
  let added=0;
  for(const item of rows){
    const t=cleanTrack(item);
    const source=key(item.addedBy);
    const result=await client.query(`INSERT INTO social_tracks
      (playlist_id,track_id,title,artist,album,cover_art,duration,added_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(playlist_id,track_id) DO NOTHING RETURNING id`,
      [playlistId,t.id,t.title,t.artist,t.album,t.coverArt,t.duration,source]);
    added+=result.rowCount;
  }
  await client.query('UPDATE social_playlists SET updated_at=now() WHERE id=$1',[playlistId]);
  return added;
}
const avatarType=bytes=>{
  if(!Buffer.isBuffer(bytes)||bytes.length<16||bytes.length>1024*1024)return null;
  if(bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'image/png';
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return null;
};
function respond(handler){
  return async(req,res,next)=>{
    try{await handler(req,res,next);}
    catch(err){
      if(err instanceof SocialError) return res.status(err.status).json({error:err.message});
      if(err?.code==='23505')return res.status(409).json({error:'That entry already exists'});
      if(err?.code==='23503')return res.status(409).json({error:'Referenced account or playlist no longer exists'});
      if(err?.code==='22P02')return res.status(400).json({error:'Invalid identifier'});
      console.error('Social request failed:',err?.code||err?.name||'unknown');
      if(!res.headersSent)res.status(503).json({error:'Social service unavailable. Please try again.'});
    }
  };
}
export function createSocialRouter({mustAuth,subsonic}){
  const r=express.Router();
  r.use(mustAuth);
  r.use((req,res,next)=>{
    if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
    const name=key(req.user?.username)||'invalid';
    const now=Date.now(),entry=socialMutations.get(name)||{start:now,count:0};
    if(now-entry.start>600000){entry.start=now;entry.count=0;}
    entry.count++;socialMutations.set(name,entry);
    if(entry.count>80)return res.status(429).json({error:'Too many changes. Please try again later.'});
    next();
  });
  r.use(respond(async(req,res,next)=>{
    req.socialName=await ensureSocialProfile(req.user.username);
    next();
  }));
  r.get('/home',respond(async(req,res)=>{
    const me=req.socialName;
    const [profile,connections,incoming,outgoing,mine,publics]=await Promise.all([
      socialQuery('SELECT username,display_name,bio,discoverable,blend_opt_in,created_at,avatar_mime IS NOT NULL AS has_avatar FROM social_profiles WHERE username=$1',[me]),
      socialQuery(`SELECT p.username,p.display_name,p.bio,p.blend_opt_in,p.avatar_mime IS NOT NULL AS has_avatar
        FROM social_friends f JOIN social_profiles p ON p.username=CASE WHEN f.a=$1 THEN f.b ELSE f.a END
        WHERE f.a=$1 OR f.b=$1 ORDER BY p.display_name LIMIT 200`,[me]),
      socialQuery(`SELECT p.username,p.display_name,p.avatar_mime IS NOT NULL AS has_avatar FROM social_friend_requests fr
        JOIN social_profiles p ON p.username=fr.requester WHERE fr.recipient=$1 AND fr.status='pending' ORDER BY fr.created_at DESC LIMIT 100`,[me]),
      socialQuery(`SELECT p.username,p.display_name FROM social_friend_requests fr
        JOIN social_profiles p ON p.username=fr.recipient WHERE fr.requester=$1 AND fr.status='pending' ORDER BY fr.created_at DESC LIMIT 100`,[me]),
      socialQuery(`SELECT DISTINCT p.id,p.title,p.description,p.owner,p.visibility,p.kind,p.updated_at,
        (SELECT COUNT(*)::int FROM social_tracks t WHERE t.playlist_id=p.id) AS song_count,
        m.can_edit FROM social_playlists p LEFT JOIN social_members m ON m.playlist_id=p.id AND m.username=$1
        WHERE p.owner=$1 OR m.username IS NOT NULL ORDER BY p.updated_at DESC LIMIT 100`,[me]),
      socialQuery(`SELECT p.id,p.title,p.description,p.owner,p.visibility,p.kind,p.updated_at,
        (SELECT COUNT(*)::int FROM social_tracks t WHERE t.playlist_id=p.id) AS song_count
        FROM social_playlists p WHERE p.visibility='public' ORDER BY p.updated_at DESC LIMIT 40`)
    ]);
    res.json({me:profile.rows[0],friends:connections.rows,incoming:incoming.rows,outgoing:outgoing.rows,
      playlists:mine.rows,discover:publics.rows});
  }));
  r.get('/people',respond(async(req,res)=>{
    const q=short(req.query.q,60).trim().toLowerCase();
    if(q.length<2)return res.json({users:[]});
    const data=await socialQuery(`SELECT username,display_name,avatar_mime IS NOT NULL AS has_avatar
      FROM social_profiles WHERE discoverable=TRUE AND username<>$1
      AND (username ILIKE $2 OR display_name ILIKE $2) ORDER BY username LIMIT 25`,
      [req.socialName,'%'+q.replace(/[%_\\]/g,'\\$&')+'%']);
    res.json({users:data.rows});
  }));
  r.get('/profiles/:username',respond(async(req,res)=>{
    const target=key(req.params.username),viewer=req.socialName;
    if(!target)fail(404,'Profile unavailable');
    const found=await socialQuery(`SELECT username,display_name,bio,discoverable,blend_opt_in,created_at,
      avatar_mime IS NOT NULL AS has_avatar FROM social_profiles WHERE username=$1`,[target]);
    if(!found.rowCount)fail(404,'Profile unavailable');
    const isFriend=target!==viewer&&await friends(viewer,target);
    if(!found.rows[0].discoverable&&target!==viewer&&!isFriend)fail(404,'Profile unavailable');
    const available=`(p.visibility='public' OR p.owner=$2 OR EXISTS
      (SELECT 1 FROM social_members sm WHERE sm.playlist_id=p.id AND sm.username=$2))`;
    const [owned,stats]=await Promise.all([
      socialQuery(`SELECT p.id,p.title,p.description,p.kind,p.visibility,p.owner,p.updated_at,
       (SELECT COUNT(*)::int FROM social_tracks t WHERE t.playlist_id=p.id) AS song_count
       FROM social_playlists p WHERE p.owner=$1 AND ${available} ORDER BY p.updated_at DESC LIMIT 100`,[target,viewer]),
      socialQuery(`SELECT
        (SELECT COUNT(*)::int FROM social_playlists p WHERE p.owner=$1 AND ${available}) AS playlists_created,
        (SELECT COUNT(*)::int FROM social_tracks t JOIN social_playlists p ON p.id=t.playlist_id
         WHERE t.added_by=$1 AND ${available}) AS songs_added`,[target,viewer])
    ]);
    res.json({profile:found.rows[0],isFriend,stats:stats.rows[0],playlists:owned.rows});
  }));
  r.get('/profiles/:username/avatar',respond(async(req,res)=>{
    const name=key(req.params.username);if(!name)fail(404,'Avatar not found');
    const result=await socialQuery('SELECT avatar_mime,avatar_bytes,discoverable FROM social_profiles WHERE username=$1',[name]);
    if(!result.rows[0]?.avatar_mime||!result.rows[0]?.avatar_bytes)fail(404,'Avatar not found');
    if(!result.rows[0].discoverable&&name!==req.socialName&&!await friends(name,req.socialName))fail(404,'Avatar not found');
    res.setHeader('Content-Type',result.rows[0].avatar_mime);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','private, max-age=60');
    res.send(result.rows[0].avatar_bytes);
  }));
  r.patch('/me',respond(async(req,res)=>{
    const {displayName,bio,discoverable}=req.body||{};
    if(displayName!==undefined&&!safeText(displayName,80))fail(400,'Display name must contain 1–80 characters');
    if(bio!==undefined&&(typeof bio!=='string'||bio.length>300))fail(400,'Bio must contain at most 300 characters');
    if(discoverable!==undefined&&typeof discoverable!=='boolean')fail(400,'Invalid discoverability preference');
    const result=await socialQuery(`UPDATE social_profiles SET
      display_name=COALESCE($2,display_name),bio=COALESCE($3,bio),
      discoverable=COALESCE($4,discoverable),updated_at=now()
      WHERE username=$1 RETURNING username,display_name,bio,discoverable,blend_opt_in`,
      [req.socialName,displayName?.trim()??null,bio??null,discoverable??null]);
    res.json({profile:result.rows[0]});
  }));
  r.post('/me/avatar',express.raw({type:['image/png','image/jpeg','image/webp'],limit:'1mb'}),respond(async(req,res)=>{
    const mime=avatarType(req.body);
    if(!mime)fail(400,'Upload a real PNG, JPEG, or WebP image up to 1 MB');
    await socialQuery('UPDATE social_profiles SET avatar_mime=$2,avatar_bytes=$3,updated_at=now() WHERE username=$1',
      [req.socialName,mime,req.body]);
    res.json({saved:true,avatarUrl:`/api/social/profiles/${encodeURIComponent(req.socialName)}/avatar?v=${Date.now()}`});
  }));
  r.delete('/me/avatar',respond(async(req,res)=>{
    await socialQuery('UPDATE social_profiles SET avatar_mime=NULL,avatar_bytes=NULL,updated_at=now() WHERE username=$1',[req.socialName]);
    res.json({removed:true});
  }));
  r.post('/friends/request',respond(async(req,res)=>{
    const from=req.socialName,to=key(req.body?.username);
    if(!to||to===from)fail(400,'Choose another account');
    const target=await socialQuery('SELECT username,discoverable FROM social_profiles WHERE username=$1',[to]);
    if(!target.rowCount||!target.rows[0].discoverable)fail(404,'User not found');
    if(await friends(from,to))fail(409,'Already friends');
    const reversed=await socialQuery(`SELECT 1 FROM social_friend_requests WHERE requester=$1 AND recipient=$2 AND status='pending'`,[to,from]);
    if(reversed.rowCount)fail(409,'This person already sent you a request. Accept it instead.');
    const pending=await socialQuery(`SELECT status FROM social_friend_requests WHERE requester=$1 AND recipient=$2`,[from,to]);
    if(pending.rows[0]?.status==='pending')fail(409,'Friend request already sent');
    await socialQuery(`INSERT INTO social_friend_requests(requester,recipient,status,created_at)
      VALUES($1,$2,'pending',now()) ON CONFLICT(requester,recipient)
      DO UPDATE SET status='pending',created_at=now()`,[from,to]);
    res.status(201).json({requested:true});
  }));
  r.post('/friends/:username/respond',respond(async(req,res)=>{
    const from=key(req.params.username),me=req.socialName;
    if(!from||from===me||typeof req.body?.accept!=='boolean')fail(400,'Invalid friend request');
    await withSocialTransaction(async client=>{
      const result=await client.query(`UPDATE social_friend_requests SET status=$3
       WHERE requester=$1 AND recipient=$2 AND status='pending' RETURNING requester`,
       [from,me,req.body.accept?'accepted':'declined']);
      if(!result.rowCount)fail(404,'Pending request not found');
      if(req.body.accept){
        const [a,b]=ordered(me,from);
        await client.query('INSERT INTO social_friends(a,b) VALUES($1,$2) ON CONFLICT DO NOTHING',[a,b]);
      }
    });
    res.json({accepted:req.body.accept});
  }));
  r.delete('/friends/:username',respond(async(req,res)=>{
    const other=key(req.params.username),me=req.socialName;
    if(!other||other===me)fail(400,'Invalid friend');
    const [a,b]=ordered(me,other);
    await withSocialTransaction(async client=>{
      // Blends contain both users' expressly contributed favorite-track metadata.
      // Unfriending destroys shared blends rather than leaving stale private picks.
      await client.query(`DELETE FROM social_playlists p WHERE p.kind='blend' AND
        ((p.owner=$1 AND EXISTS(SELECT 1 FROM social_members m WHERE m.playlist_id=p.id AND m.username=$2))
          OR (p.owner=$2 AND EXISTS(SELECT 1 FROM social_members m WHERE m.playlist_id=p.id AND m.username=$1)))`,[me,other]);
      await client.query('DELETE FROM social_friends WHERE a=$1 AND b=$2',[a,b]);
      await client.query(`DELETE FROM social_members m USING social_playlists p
        WHERE m.playlist_id=p.id
        AND ((p.owner=$1 AND m.username=$2) OR (p.owner=$2 AND m.username=$1))`,[me,other]);
      await client.query(`DELETE FROM social_friend_requests
        WHERE (requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)`,[me,other]);
    });
    res.json({unfriended:true,sharedAccessRevoked:true});
  }));
  r.post('/playlists',respond(async(req,res)=>{
    const title=req.body?.title,description=req.body?.description??'',vis=req.body?.visibility??'private';
    if(!safeText(title,100)||typeof description!=='string'||description.length>300||!visibility(vis))
      fail(400,'Invalid playlist details');
    const id=crypto.randomUUID();
    const result=await socialQuery(`INSERT INTO social_playlists(id,owner,title,description,visibility)
      VALUES($1,$2,$3,$4,$5) RETURNING *`,[id,req.socialName,title.trim(),description.trim(),vis]);
    res.status(201).json({playlist:result.rows[0]});
  }));
  r.post('/playlists/import',respond(async(req,res)=>{
    const id=req.body?.navidromePlaylistId,vis=req.body?.visibility??'private';
    if(typeof id!=='string'||!id||id.length>150||!visibility(vis))fail(400,'Invalid import request');
    const nav=await subsonic(req.user,'getPlaylist',{id});
    const old=nav.playlist;
    if(!old?.id)fail(404,'Navidrome playlist unavailable');
    const songs=(old.entry||[]).slice(0,1000);
    if((old.entry||[]).length>1000)fail(400,'Import supports playlists up to 1,000 tracks');
    const name=short(old.name||'Imported playlist',100);
    const newId=crypto.randomUUID();
    await withSocialTransaction(async client=>{
      await client.query(`INSERT INTO social_playlists(id,owner,title,description,visibility)
        VALUES($1,$2,$3,$4,$5)`,[newId,req.socialName,name,'Imported from my Navidrome playlist',vis]);
      await addTracks(client,newId,songs.map(s=>({...s,addedBy:req.socialName})));
    });
    res.status(201).json({id:newId,imported:songs.length,note:'Social playlist is a separate copy; edits do not change the original Navidrome playlist.'});
  }));
  r.get('/playlists/:id',respond(async(req,res)=>{
    const p=await loadPlaylist(req.params.id,req.socialName);
    const [tracks,members]=await Promise.all([
      socialQuery(`SELECT id::text AS id,track_id,title,artist,album,cover_art AS "coverArt",duration,added_by,added_at
        FROM social_tracks WHERE playlist_id=$1 ORDER BY id LIMIT 1000`,[p.id]),
      socialQuery(`SELECT username,can_edit,joined_at FROM social_members WHERE playlist_id=$1 ORDER BY joined_at`,[p.id])
    ]);
    res.json({playlist:p,tracks:tracks.rows,members:p.owner===req.socialName||p.is_member?members.rows:[]});
  }));
  r.patch('/playlists/:id',respond(async(req,res)=>{
    const p=await loadPlaylist(req.params.id,req.socialName),body=req.body||{};
    if(p.owner!==req.socialName)fail(403,'Only the playlist owner can edit its details');
    const title=body.title??p.title,description=body.description??p.description,vis=body.visibility??p.visibility;
    if(!safeText(title,100)||typeof description!=='string'||description.length>300||!visibility(vis))
      fail(400,'Invalid playlist details');
    if(p.kind==='blend'&&vis==='public')fail(403,'Blends are always private');
    const result=await socialQuery(`UPDATE social_playlists SET title=$2,description=$3,visibility=$4,updated_at=now()
      WHERE id=$1 RETURNING *`,[p.id,title.trim(),description.trim(),vis]);
    res.json({playlist:result.rows[0]});
  }));
  r.delete('/playlists/:id',respond(async(req,res)=>{
    const p=await loadPlaylist(req.params.id,req.socialName);
    if(p.owner!==req.socialName)fail(403,'Only the owner can delete this playlist');
    await socialQuery('DELETE FROM social_playlists WHERE id=$1',[p.id]);
    res.json({deleted:true});
  }));
  r.post('/playlists/:id/members',respond(async(req,res)=>{
    const p=await loadPlaylist(req.params.id,req.socialName);
    if(p.owner!==req.socialName)fail(403,'Only the owner can share this playlist');
    if(p.kind==='blend')fail(403,'Blend membership is fixed');
    const other=key(req.body?.username),canEdit=req.body?.canEdit;
    if(!other||other===req.socialName||typeof canEdit!=='boolean')fail(400,'Invalid collaborator');
    if(!await friends(req.socialName,other))fail(403,'Share playlists with accepted friends');
    await socialQuery(`INSERT INTO social_members(playlist_id,username,can_edit) VALUES($1,$2,$3)
      ON CONFLICT(playlist_id,username) DO UPDATE SET can_edit=EXCLUDED.can_edit`,
      [p.id,other,canEdit]);
    res.json({shared:true,username:other,canEdit});
  }));
  r.delete('/playlists/:id/members/:username',respond(async(req,res)=>{
    const p=await loadPlaylist(req.params.id,req.socialName);
    const target=key(req.params.username);
    if(!target)fail(400,'Invalid member');
    if(p.owner!==req.socialName&&req.socialName!==target)fail(403,'Cannot remove another member');
    if(p.kind==='blend')fail(403,'Blends can only be deleted by their owner or revoked by opting out');
    await socialQuery('DELETE FROM social_members WHERE playlist_id=$1 AND username=$2',[p.id,target]);
    res.json({removed:true});
  }));
  r.post('/playlists/:id/tracks',respond(async(req,res)=>{
    const p=await loadPlaylist(req.params.id,req.socialName);
    editPermission(p,req.socialName);
    const trackId=req.body?.trackId;
    if(typeof trackId!=='string'||trackId.length>180||!trackId)fail(400,'Invalid track');
    const data=await subsonic(req.user,'getSong',{id:trackId});
    if(!data?.song?.id)fail(404,'Song not found in your music library');
    const count=await withSocialTransaction(async client=>addTracks(client,p.id,[{...data.song,addedBy:req.socialName}]));
    res.status(count?201:200).json({added:count>0});
  }));
  r.delete('/playlists/:id/tracks/:entryId',respond(async(req,res)=>{
    const p=await loadPlaylist(req.params.id,req.socialName);
    editPermission(p,req.socialName);
    if(!/^\d{1,18}$/.test(req.params.entryId))fail(400,'Invalid track entry');
    const result=await socialQuery('DELETE FROM social_tracks WHERE id=$1 AND playlist_id=$2',[req.params.entryId,p.id]);
    if(!result.rowCount)fail(404,'Track entry not found');
    await socialQuery('UPDATE social_playlists SET updated_at=now() WHERE id=$1',[p.id]);
    res.json({removed:true});
  }));
  r.post('/blend/picks',respond(async(req,res)=>{
    const result=await subsonic(req.user,'getStarred2');
    const songs=(result.starred2?.song||[]).slice(0,100).map(s=>({...s,addedBy:req.socialName}));
    await withSocialTransaction(async client=>{
      await client.query('DELETE FROM social_blend_picks WHERE username=$1',[req.socialName]);
      for(const song of songs){
        const t=cleanTrack(song);
        await client.query(`INSERT INTO social_blend_picks(username,track_id,title,artist,album,cover_art,duration)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(username,track_id) DO NOTHING`,
          [req.socialName,t.id,t.title,t.artist,t.album,t.coverArt,t.duration]);
      }
      await client.query('UPDATE social_profiles SET blend_opt_in=true WHERE username=$1',[req.socialName]);
    });
    res.json({optedIn:true,contributed:songs.length,note:'Only the tracks you explicitly share here are used to build blends. Your full listening history stays private.'});
  }));
  r.delete('/blend/picks',respond(async(req,res)=>{
    await withSocialTransaction(async client=>{
      await client.query(`DELETE FROM social_playlists p WHERE p.kind='blend' AND
        (p.owner=$1 OR EXISTS(SELECT 1 FROM social_members m WHERE m.playlist_id=p.id AND m.username=$1))`,[req.socialName]);
      await client.query('DELETE FROM social_blend_picks WHERE username=$1',[req.socialName]);
      await client.query('UPDATE social_profiles SET blend_opt_in=false WHERE username=$1',[req.socialName]);
    });
    res.json({optedOut:true,blendsRemoved:true});
  }));
  async function refillBlend(client,id,first,second){
    const left=(await client.query('SELECT * FROM social_blend_picks WHERE username=$1 ORDER BY md5(track_id || $2) LIMIT 60',[first,id])).rows;
    const right=(await client.query('SELECT * FROM social_blend_picks WHERE username=$1 ORDER BY md5(track_id || $2) LIMIT 60',[second,id])).rows;
    if(!left.length||!right.length)fail(409,'Both friends must share at least one favorite track to make a blend');
    const ordered=[],seen=new Set();
    for(let i=0;i<60&&ordered.length<60;i++){
      for(const t of [left[i],right[i]]){
        if(t&&!seen.has(t.track_id)){seen.add(t.track_id);ordered.push({...t,id:t.track_id,addedBy:t.username});}
      }
    }
    await client.query('DELETE FROM social_tracks WHERE playlist_id=$1',[id]);
    await addTracks(client,id,ordered,{max:120});
    return ordered.length;
  }
  r.post('/blends',respond(async(req,res)=>{
    const other=key(req.body?.username),me=req.socialName;
    if(!other||other===me||!await friends(me,other))fail(403,'Create blends only with accepted friends');
    const x=await socialQuery('SELECT username,blend_opt_in FROM social_profiles WHERE username=ANY($1)',[[me,other]]);
    if(x.rows.length!==2||x.rows.some(z=>!z.blend_opt_in))fail(409,'Both friends must opt in by sharing their favorite tracks first');
    const id=crypto.randomUUID();
    const count=await withSocialTransaction(async client=>{
      await client.query(`INSERT INTO social_playlists(id,owner,title,description,visibility,kind)
        VALUES($1,$2,$3,$4,'private','blend')`,
        [id,me,short('Blend · '+me+' + '+other,100),'A private mix of favorites, shared by both friends']);
      await client.query('INSERT INTO social_members(playlist_id,username,can_edit) VALUES($1,$2,false)',[id,other]);
      return refillBlend(client,id,me,other);
    });
    res.status(201).json({id,count});
  }));
  r.post('/blends/:id/refresh',respond(async(req,res)=>{
    const p=await loadPlaylist(req.params.id,req.socialName);
    if(p.kind!=='blend')fail(400,'Not a blend');
    const members=await socialQuery('SELECT username FROM social_members WHERE playlist_id=$1',[p.id]);
    const friend=members.rows[0]?.username;
    if(!friend||!(p.owner===req.socialName||friend===req.socialName))fail(403,'Not a blend participant');
    if(!await friends(p.owner,friend))fail(403,'Blend participants are no longer friends');
    const prefs=await socialQuery('SELECT username,blend_opt_in FROM social_profiles WHERE username=ANY($1)',[[p.owner,friend]]);
    if(prefs.rows.length!==2||prefs.rows.some(z=>!z.blend_opt_in))fail(403,'Both people must opt into blending');
    const count=await withSocialTransaction(client=>refillBlend(client,p.id,p.owner,friend));
    res.json({updated:true,count});
  }));
  return r;
}
