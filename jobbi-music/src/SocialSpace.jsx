import React,{useCallback,useEffect,useState} from 'react';
import {Users,UserPlus,UserCheck,UserX,Search,Globe2,LockKeyhole,HeartHandshake,
  Plus,Music2,Play,Trash2,RefreshCw,Camera,Upload,Check,ArrowLeft,ShieldCheck,
  ListMusic,Settings2,X,Image as ImageIcon,Share2,Sparkles,Heart,UserRound,ChevronRight} from 'lucide-react';
import './social.css';

const root='/api/social';
const apiPath=(suffix)=>root+suffix;
function SocialAvatar({person,size=42,version=0}){
  const name=person?.username||'';
  return <span className="social-avatar" style={{width:size,height:size,fontSize:Math.max(14,size/3)}} aria-label={name+' profile picture'}>
    {person?.has_avatar?<img src={apiPath('/profiles/'+encodeURIComponent(name)+'/avatar?v='+version)} alt=""/>:
      (person?.display_name||name||'?').slice(0,1).toUpperCase()}
  </span>;
}
function PlaylistTile({entry,onOpen}){
  return <button className="social-playlist-tile" onClick={()=>onOpen(entry.id)}>
    <span className="social-playlist-icon"><ListMusic size={26}/></span>
    <strong>{entry.title}</strong>
    <small>by @{entry.owner}</small>
    <span className="social-playlist-meta">{entry.visibility==='public'?<Globe2 size={13}/>:<LockKeyhole size={13}/>}
      {entry.kind==='blend'?'Blend · ':''}{entry.song_count||0} tracks</span>
  </button>;
}
const initialPlaylist={title:'',description:'',visibility:'private'};
function CardTitle({icon:Icon,title,subtitle,action}){
  return <div className="social-card-title"><span className="social-title-icon"><Icon size={19}/></span>
    <div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action&&<span className="social-card-action">{action}</span>}</div>;
}
export default function SocialSpace({api,user,playTracks,nativePlaylists=[],onProfileUpdate=()=>{}}){
  const [overview,setOverview]=useState(null),[tab,setTab]=useState('discover');
  const [profileName,setProfileName]=useState(''),[profile,setProfile]=useState(null),[profileDraft,setProfileDraft]=useState(null);
  const [currentId,setCurrentId]=useState(null),[playlist,setPlaylist]=useState(null);
  const [query,setQuery]=useState(''),[people,setPeople]=useState([]),[searching,setSearching]=useState(false);
  const [libraryQ,setLibraryQ]=useState(''),[librarySongs,setLibrarySongs]=useState([]);
  const [createForm,setCreateForm]=useState(initialPlaylist),[importId,setImportId]=useState('');
  const [visibility,setVisibility]=useState('private'),[shareName,setShareName]=useState(''),[shareEdit,setShareEdit]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[avatarVersion,setAvatarVersion]=useState(0);
  const [blendFriend,setBlendFriend]=useState('');
  const post=(url,body)=>api(apiPath(url),{method:'POST',body:JSON.stringify(body)});
  const patch=(url,body)=>api(apiPath(url),{method:'PATCH',body:JSON.stringify(body)});
  const remove=url=>api(apiPath(url),{method:'DELETE'});
  const handle=async work=>{
    setBusy(true);setError('');setNotice('');
    try{await work()}catch(e){setError(e.message||'Request failed')}finally{setBusy(false)}
  };
  const refresh=useCallback(async()=>{
    const result=await api(apiPath('/home'));
    setOverview(result);
    return result;
  },[api]);
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[refresh]);
  const openProfile=async name=>{
    setTab('profile');setProfileName(name);setProfile(null);setCurrentId(null);
    try{
      const result=await api(apiPath('/profiles/'+encodeURIComponent(name)));
      setProfile(result);
      if(name.toLowerCase()===user.username.toLowerCase())setProfileDraft({displayName:result.profile.display_name,bio:result.profile.bio,discoverable:result.profile.discoverable});
    }catch(e){setError(e.message)}
  };
  const loadPlaylist=async id=>{
    setTab('playlist');setCurrentId(id);setPlaylist(null);setProfile(null);
    try{
      const result=await api(apiPath('/playlists/'+encodeURIComponent(id)));
      setPlaylist(result);setVisibility(result.playlist.visibility);
    }catch(e){setError(e.message)}
  };
  const act=fn=>handle(async()=>{await fn();await refresh()});
  const searchPeople=()=>handle(async()=>{
    if(query.trim().length<2){setPeople([]);return}
    setSearching(true);
    try{const r=await api(apiPath('/people?q='+encodeURIComponent(query.trim())));setPeople(r.users||[])}
    finally{setSearching(false)}
  });
  const sendRequest=name=>act(async()=>{await post('/friends/request',{username:name});setNotice('Friend request sent')});
  const answer=(name,accept)=>act(async()=>{await post('/friends/'+encodeURIComponent(name)+'/respond',{accept});setNotice(accept?'Friend added':'Request declined')});
  const unfriend=name=>{if(!window.confirm('Remove this friend and revoke your shared playlist access?'))return;
    act(async()=>{await remove('/friends/'+encodeURIComponent(name));setNotice('Friend removed')})};
  const createPlaylist=()=>act(async()=>{
    const r=await post('/playlists',{...createForm});
    setCreateForm(initialPlaylist);await loadPlaylist(r.playlist.id);setNotice('Social playlist created');
  });
  const importPlaylist=()=>act(async()=>{
    if(!importId)return;
    const r=await post('/playlists/import',{navidromePlaylistId:importId,visibility:'private'});
    setImportId('');await loadPlaylist(r.id);
    setNotice('Imported a separate social copy. Your original Navidrome playlist was not changed.');
  });
  const savePlaylist=()=>act(async()=>{
    const p=playlist?.playlist;if(!p)return;
    await patch('/playlists/'+p.id,{visibility,title:p.title,description:p.description});
    await loadPlaylist(p.id);setNotice('Playlist settings saved');
  });
  const deletePlaylist=()=>{if(!playlist||!window.confirm('Delete this shared playlist? Your original songs are not deleted.'))return;
    act(async()=>{await remove('/playlists/'+playlist.playlist.id);setPlaylist(null);setCurrentId(null);setTab('playlists')})};
  const share=()=>act(async()=>{
    if(!shareName||!playlist)return;
    await post('/playlists/'+playlist.playlist.id+'/members',{username:shareName,canEdit:shareEdit});
    await loadPlaylist(playlist.playlist.id);setNotice('Playlist access updated');
  });
  const revoke=username=>act(async()=>{
    await remove('/playlists/'+playlist.playlist.id+'/members/'+encodeURIComponent(username));
    await loadPlaylist(playlist.playlist.id);setNotice('Access revoked');
  });
  const findTracks=()=>handle(async()=>{
    if(libraryQ.trim().length<2){setLibrarySongs([]);return}
    const data=await api('/api/search?q='+encodeURIComponent(libraryQ.trim()));
    setLibrarySongs((data.song||[]).slice(0,30));
  });
  const addTrack=song=>act(async()=>{
    await post('/playlists/'+playlist.playlist.id+'/tracks',{trackId:song.id});
    await loadPlaylist(playlist.playlist.id);setNotice('Added to playlist');
  });
  const deleteTrack=id=>act(async()=>{
    await remove('/playlists/'+playlist.playlist.id+'/tracks/'+id);
    await loadPlaylist(playlist.playlist.id);
  });
  const saveProfile=()=>act(async()=>{
    const r=await patch('/me',profileDraft);
    await openProfile(user.username);onProfileUpdate();setNotice('Profile updated');
  });
  const uploadAvatar=e=>{
    const f=e.target.files?.[0];if(!f)return;
    if(f.size>1024*1024||!['image/png','image/jpeg','image/webp'].includes(f.type)){setError('Choose a PNG, JPEG or WebP image under 1 MB');return}
    act(async()=>{
      await api(apiPath('/me/avatar'),{method:'POST',body:f,headers:{'Content-Type':f.type}});
      setAvatarVersion(Date.now());await refresh();await openProfile(user.username);onProfileUpdate();onProfileUpdate();setNotice('Profile picture saved');
    });
  };
  const removeAvatar=()=>act(async()=>{await remove('/me/avatar');setAvatarVersion(Date.now());await refresh();await openProfile(user.username)});
  const contribute=()=>act(async()=>{const r=await post('/blend/picks',{});setNotice('Shared '+r.contributed+' favorite tracks for your opt-in blends')});
  const optOut=()=>{if(!window.confirm('Stop sharing favorites for blends? Existing blends you participate in will be deleted.'))return;
    act(async()=>{await remove('/blend/picks');setNotice('Blend sharing disabled')})};
  const makeBlend=()=>act(async()=>{
    const r=await post('/blends',{username:blendFriend});
    await loadPlaylist(r.id);setNotice('Created private blend with '+r.count+' tracks');
  });
  const refreshBlend=()=>act(async()=>{
    const r=await post('/blends/'+playlist.playlist.id+'/refresh',{});
    await loadPlaylist(playlist.playlist.id);setNotice('Blend refreshed with '+r.count+' tracks');
  });
  const mine=overview?.me;
  const friends=overview?.friends||[];
  const own=(overview?.playlists||[]).filter(p=>p.owner===user.username.toLowerCase());
  const shared=(overview?.playlists||[]).filter(p=>p.owner!==user.username.toLowerCase());
  const owner=playlist?.playlist?.owner===user.username.toLowerCase();
  const canEdit=Boolean(owner||playlist?.playlist?.can_edit);
  const avatar=(p,size=42)=><SocialAvatar person={p} size={size} version={avatarVersion}/>;
  return <section className="social-page">
    <div className="social-intro"><div><div className="eyebrow"><HeartHandshake size={15}/> CONNECT THROUGH MUSIC</div>
      <h1>Music is better <em>together.</em></h1>
      <p>Find friends, build shared playlists and mix your favorites. Your private library stays yours.</p></div>
      {mine&&<button className="social-me" onClick={()=>openProfile(user.username)}>{avatar(mine,46)}<span><strong>{mine.display_name}</strong><small>My profile</small></span><ChevronRight size={17}/></button>}
    </div>
    <div className="social-tabs" role="navigation" aria-label="Community pages">
      {[['discover','Discover',Globe2],['friends','Friends',Users],['playlists','Playlists',ListMusic],['blends','Blends',Sparkles],['profile','My profile',UserRound]].map(([id,label,Icon])=>
        <button key={id} className={tab===id||tab==='playlist'&&id==='playlists'?'active':''}
          onClick={()=>id==='profile'?openProfile(user.username):(setTab(id),setCurrentId(null))}><Icon size={16}/>{label}{id==='friends'&&overview?.incoming?.length>0&&<span className="social-count">{overview.incoming.length}</span>}</button>)}
    </div>
    {error&&<div className="social-alert" role="alert"><X size={17}/>{error}<button onClick={()=>setError('')} aria-label="Dismiss"><X size={15}/></button></div>}
    {notice&&<div className="social-good" role="status"><Check size={17}/>{notice}</div>}
    {!overview&&<div className="social-loading"><RefreshCw size={20}/> Loading community…</div>}

    {tab==='discover'&&overview&&<div className="social-columns">
      <div className="social-section">
        <CardTitle icon={Globe2} title="Public playlists" subtitle="Shared with everyone signed into Jobbi Music"/>
        <div className="social-playlist-grid">{overview.discover?.length?overview.discover.map(p=><PlaylistTile key={p.id} entry={p} onOpen={loadPlaylist}/>):<div className="social-empty">No public playlists yet. Be the first to share one.</div>}</div>
      </div>
      <div className="social-card">
        <CardTitle icon={Search} title="Find people" subtitle="Search registered Jobbi Music profiles"/>
        <form className="social-inline" onSubmit={e=>{e.preventDefault();searchPeople()}}>
          <input aria-label="Find users" placeholder="Search usernames…" value={query} onChange={e=>setQuery(e.target.value)} maxLength={60}/>
          <button className="social-primary" type="submit" disabled={busy||searching}><Search size={16}/> Search</button>
        </form>
        {people.map(p=><div className="social-person" key={p.username}>
          {avatar(p)}<div><strong>{p.display_name}</strong><small>@{p.username}</small></div>
          <button className="social-outline" onClick={()=>openProfile(p.username)}>View</button>
          <button className="social-icon" aria-label={'Add '+p.username+' as friend'} onClick={()=>sendRequest(p.username)} disabled={busy}><UserPlus size={19}/></button>
        </div>)}
        <div className="social-note"><LockKeyhole size={17}/> Public means visible to signed-in users only. Your private playlists and listening history are never published automatically.</div>
      </div>
    </div>}
    {tab==='friends'&&overview&&<div className="social-columns">
      <div className="social-card">
        <CardTitle icon={Users} title={'My friends · '+friends.length} subtitle="Share playlists and create blends together"/>
        {friends.length===0&&<div className="social-empty">No friends yet. Find someone on the Discover tab.</div>}
        {friends.map(p=><div className="social-person" key={p.username}>{avatar(p)}
          <div><strong>{p.display_name}</strong><small>@{p.username} {p.blend_opt_in?'· Blend ready':''}</small></div>
          <button className="social-outline" onClick={()=>openProfile(p.username)}>Profile</button>
          <button className="social-icon" title="Remove friend" onClick={()=>unfriend(p.username)} disabled={busy}><UserX size={18}/></button>
        </div>)}
      </div>
      <div className="social-card">
        <CardTitle icon={UserPlus} title="Friend requests" subtitle="Only accepted requests grant friendship"/>
        {overview.incoming?.length>0?overview.incoming.map(p=><div className="social-person" key={p.username}>{avatar(p)}<div><strong>{p.display_name}</strong><small>@{p.username} wants to connect</small></div>
          <button className="social-outline" onClick={()=>answer(p.username,false)} disabled={busy}>Decline</button>
          <button className="social-primary" onClick={()=>answer(p.username,true)} disabled={busy}><Check size={15}/> Accept</button>
        </div>):<p className="social-empty">No new requests.</p>}
        {!!overview.outgoing?.length&&<><h3 className="social-subtitle">Sent requests</h3>{overview.outgoing.map(p=><p className="social-secondary" key={p.username}>@{p.username} · Pending</p>)}</>}
      </div>
    </div>}
    {tab==='playlists'&&overview&&<div>
      <div className="social-columns">
        <div className="social-card"><CardTitle icon={Plus} title="Create shared playlist" subtitle="Set visibility and invite friends to collaborate"/>
          <form className="social-form" onSubmit={e=>{e.preventDefault();createPlaylist()}}>
            <label>Playlist name<input required maxLength={100} value={createForm.title} onChange={e=>setCreateForm(p=>({...p,title:e.target.value}))} placeholder="Our favorite songs"/></label>
            <label>Description<textarea rows={2} maxLength={300} value={createForm.description} onChange={e=>setCreateForm(p=>({...p,description:e.target.value}))} placeholder="A little something about this mix"/></label>
            <label>Visibility<select value={createForm.visibility} onChange={e=>setCreateForm(p=>({...p,visibility:e.target.value}))}><option value="private">Private — me and invited friends</option><option value="public">Public — all signed-in users</option></select></label>
            <button className="social-primary" disabled={busy} type="submit"><Plus size={17}/> Create playlist</button>
          </form>
        </div>
        <div className="social-card"><CardTitle icon={Upload} title="Share a Navidrome playlist" subtitle="Copy one of your personal playlists into the social collection"/>
          <form className="social-form" onSubmit={e=>{e.preventDefault();importPlaylist()}}>
            <label>My personal playlist<select value={importId} onChange={e=>setImportId(e.target.value)}><option value="">Choose a playlist</option>
              {nativePlaylists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <p className="social-secondary">Imported playlists start private. Changes to the shared copy won't modify your original Navidrome playlist.</p>
            <button className="social-outline" disabled={busy||!importId} type="submit"><Share2 size={16}/> Import private copy</button>
          </form>
        </div>
      </div>
      <div className="social-section"><CardTitle icon={ListMusic} title={'Created by you · '+own.length}/>
        <div className="social-playlist-grid">{own.length?own.map(p=><PlaylistTile key={p.id} entry={p} onOpen={loadPlaylist}/>):<div className="social-empty">Create a playlist to start sharing music.</div>}</div>
      </div>
      <div className="social-section"><CardTitle icon={HeartHandshake} title={'Shared with you · '+shared.length}/>
        <div className="social-playlist-grid">{shared.length?shared.map(p=><PlaylistTile key={p.id} entry={p} onOpen={loadPlaylist}/>):<div className="social-empty">Playlists shared by friends will appear here.</div>}</div>
      </div>
    </div>}
    {tab==='blends'&&overview&&<div className="social-columns">
      <div className="social-card"><CardTitle icon={Sparkles} title="Your blend preferences" subtitle="Blend only the favorites you explicitly choose to share"/>
        <p className="social-secondary">A blend alternates favorites from two accepted friends. You control whether your favorites are available for blending.</p>
        <div className="social-permission">{mine.blend_opt_in?<><Check size={19}/> Favorite sharing is enabled</>:<><LockKeyhole size={19}/> Favorite sharing is off</>}</div>
        <button className="social-primary" disabled={busy} onClick={contribute}><RefreshCw size={16}/> {mine.blend_opt_in?'Refresh my favorite picks':'Share my favorites for blends'}</button>
        {mine.blend_opt_in&&<button className="social-outline" disabled={busy} onClick={optOut}>Opt out and remove my blends</button>}
      </div>
      <div className="social-card"><CardTitle icon={Heart} title="Create a two-person blend" subtitle="Both friends must opt in first"/>
        <form className="social-form" onSubmit={e=>{e.preventDefault();makeBlend()}}>
          <label>Blend with<select value={blendFriend} onChange={e=>setBlendFriend(e.target.value)}>
            <option value="">Choose a friend</option>{friends.filter(p=>p.blend_opt_in).map(p=><option value={p.username} key={p.username}>{p.display_name} (@{p.username})</option>)}</select></label>
          <button className="social-primary" disabled={busy||!blendFriend||!mine.blend_opt_in} type="submit"><Sparkles size={17}/> Make blend</button>
        </form>
        <p className="social-secondary">Blends always stay private. Either person can refresh the mix. Opting out removes shared blend content.</p>
        <div className="social-playlist-grid">{overview.playlists?.filter(p=>p.kind==='blend').map(p=><PlaylistTile key={p.id} entry={p} onOpen={loadPlaylist}/>)}</div>
      </div>
    </div>}
    {tab==='profile'&&<div className="social-columns">
      <div className="social-card">
        <CardTitle icon={UserRound} title={profile?.profile?.display_name||'User profile'} subtitle={'@'+(profileName||user.username)}/>
        {profile&&<><div className="social-profilehero">{avatar(profile.profile,92)}
          <div><strong>{profile.profile.display_name}</strong><small>@{profile.profile.username}</small><p>{profile.profile.bio||'Music says it all.'}</p></div></div>
          <div className="social-stat-grid"><div><b>{profile.stats.playlists_created}</b><span>Visible playlists created</span></div><div><b>{profile.stats.songs_added}</b><span>Songs added to visible playlists</span></div></div>
          {profile.profile.username!==user.username.toLowerCase()&&!profile.isFriend&&<button className="social-primary" onClick={()=>sendRequest(profile.profile.username)} disabled={busy}><UserPlus size={16}/> Send friend request</button>}
          {profile.profile.username===user.username.toLowerCase()&&<><div className="social-divider"/>
            <label className="social-avatar-upload"><Camera size={16}/> Change profile picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} disabled={busy}/></label>
            {profile.profile.has_avatar&&<button className="social-outline" onClick={removeAvatar} disabled={busy}>Remove picture</button>}
            <div className="social-form"><label>Display name<input maxLength={80} value={profileDraft?.displayName||''} onChange={e=>setProfileDraft(p=>({...p,displayName:e.target.value}))}/></label>
              <label>About you<textarea rows={3} maxLength={300} value={profileDraft?.bio||''} onChange={e=>setProfileDraft(p=>({...p,bio:e.target.value}))}/></label>
              <label className="social-checkbox"><input type="checkbox" checked={profileDraft?.discoverable??true} onChange={e=>setProfileDraft(p=>({...p,discoverable:e.target.checked}))}/> Allow other users to find my profile</label>
              <button className="social-primary" onClick={saveProfile} disabled={busy||!profileDraft?.displayName?.trim()}><Check size={16}/> Save profile</button>
            </div>
          </>}
        </>}
      </div>
      <div className="social-section">
        <CardTitle icon={ListMusic} title="Playlists" subtitle="Only playlists you're allowed to view appear here"/>
        <div className="social-playlist-grid">{profile?.playlists?.length?profile.playlists.map(p=><PlaylistTile key={p.id} entry={p} onOpen={loadPlaylist}/>):<div className="social-empty">No playlists to display.</div>}</div>
      </div>
    </div>}
    {tab==='playlist'&&<div className="social-playlist-details">
      <button className="social-back" onClick={()=>{setTab('playlists');setCurrentId(null)}}><ArrowLeft size={17}/> All social playlists</button>
      {!playlist&&<div className="social-loading">Loading playlist…</div>}
      {playlist&&<><div className="social-detailhero"><span className="social-playlist-icon"><ListMusic size={39}/></span>
        <div><div className="eyebrow">{playlist.playlist.kind==='blend'?'PRIVATE BLEND':playlist.playlist.visibility==='public'?'PUBLIC PLAYLIST':'PRIVATE PLAYLIST'}</div>
          <h2>{playlist.playlist.title}</h2><p>{playlist.playlist.description||'Music to share.'}</p><small>Created by @{playlist.playlist.owner} · {playlist.tracks.length} tracks</small></div>
        <button className="social-primary" disabled={!playlist.tracks.length} onClick={()=>playTracks(playlist.tracks.map(t=>({...t,id:t.track_id})),0)}><Play size={18} fill="currentColor"/> Play all</button></div>
        {playlist.playlist.kind==='blend'&&<button className="social-outline" onClick={refreshBlend} disabled={busy}><RefreshCw size={16}/> Refresh blend from current shared favorites</button>}
        <div className="social-columns">
          <div className="social-card social-song-panel"><CardTitle icon={Music2} title="Tracks" subtitle="Contributors are credited on each addition"/>
            {playlist.tracks.map((t,index)=><div className="social-track" key={t.id}>
              <button className="social-track-play" aria-label={'Play '+t.title} onClick={()=>playTracks(playlist.tracks.map(s=>({...s,id:s.track_id})),index)}><Play size={16}/></button>
              <div><strong>{t.title}</strong><small>{t.artist||'Unknown artist'} · added by @{t.added_by}</small></div>
              {canEdit&&playlist.playlist.kind!=='blend'&&<button className="social-icon" disabled={busy} aria-label={'Remove '+t.title} onClick={()=>deleteTrack(t.id)}><Trash2 size={16}/></button>}
            </div>)}
            {playlist.tracks.length===0&&<p className="social-empty">No songs yet.</p>}
            {canEdit&&playlist.playlist.kind!=='blend'&&<div className="social-addsong"><form className="social-inline" onSubmit={e=>{e.preventDefault();findTracks()}}>
              <input aria-label="Find songs to add" placeholder="Search your library to add…" value={libraryQ} onChange={e=>setLibraryQ(e.target.value)} maxLength={100}/>
              <button type="submit" className="social-outline" disabled={busy}><Search size={17}/></button></form>
              {librarySongs.map(s=><div className="social-person" key={s.id}><div><strong>{s.title}</strong><small>{s.artist}</small></div><button className="social-outline" onClick={()=>addTrack(s)} disabled={busy}><Plus size={14}/> Add</button></div>)}
            </div>}
          </div>
          <div className="social-card">
            <CardTitle icon={ShieldCheck} title="Sharing & collaborators" subtitle="Only invited friends can edit"/>
            <div className="social-privacy"><span>{playlist.playlist.visibility==='public'?<Globe2 size={19}/>:<LockKeyhole size={19}/>}
              {playlist.playlist.visibility==='public'?'Public to signed-in users':'Private to owner and invited users'}</span></div>
            {owner&&<><div className="social-form">
              <label>Playlist name<input maxLength={100} value={playlist.playlist.title} onChange={e=>setPlaylist(p=>({...p,playlist:{...p.playlist,title:e.target.value}}))}/></label>
              <label>Description<textarea rows={2} maxLength={300} value={playlist.playlist.description} onChange={e=>setPlaylist(p=>({...p,playlist:{...p.playlist,description:e.target.value}}))}/></label>
              {playlist.playlist.kind!=='blend'&&<label>Privacy<select value={visibility} onChange={e=>setVisibility(e.target.value)}>
                <option value="private">Private (invited users only)</option><option value="public">Public (all signed-in users)</option></select></label>}
              <button className="social-primary" disabled={busy} onClick={savePlaylist}><Check size={15}/> Save playlist</button>
            </div><div className="social-divider"/></>}
            {playlist.members?.map(m=><div className="social-person" key={m.username}>
              {avatar({username:m.username})}<div><strong>@{m.username}</strong><small>{m.can_edit?'Can edit':'Can listen'}</small></div>
              {owner&&playlist.playlist.kind!=='blend'&&<button className="social-icon" title="Remove access" disabled={busy} onClick={()=>revoke(m.username)}><X size={16}/></button>}
            </div>)}
            {owner&&playlist.playlist.kind!=='blend'&&<form className="social-form" onSubmit={e=>{e.preventDefault();share()}}>
              <label>Share with an accepted friend<select value={shareName} onChange={e=>setShareName(e.target.value)}><option value="">Choose a friend</option>
                {friends.map(p=><option key={p.username} value={p.username}>{p.display_name} (@{p.username})</option>)}</select></label>
              <label className="social-checkbox"><input type="checkbox" checked={shareEdit} onChange={e=>setShareEdit(e.target.checked)}/> Let this friend add and remove songs</label>
              <button className="social-outline" type="submit" disabled={busy||!shareName}><Share2 size={16}/> Share playlist</button>
            </form>}
            {owner&&<button className="social-danger" onClick={deletePlaylist} disabled={busy}><Trash2 size={16}/> Delete playlist</button>}
          </div>
        </div>
      </>}
    </div>}
  </section>;
}
