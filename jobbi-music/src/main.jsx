import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Album, ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Disc3, Heart, Home, Library, ListMusic, LoaderCircle, LogOut, Maximize2, Music2, Pause, Play, Plus, Repeat2, Search, Settings2, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Volume2, VolumeX, Waves, X, Mic2, Radio, RefreshCw, Headphones } from 'lucide-react';
import './style.css';

const api = async (url, opts={}) => {
  const res = await fetch(url, {credentials:'same-origin', ...opts, headers:{'Content-Type':'application/json', ...(opts.headers || {})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};
const post = (url,payload) => api(url,{method:'POST',body:JSON.stringify(payload)});
const covers = item => item?.coverArt || item?.id;
const coverUrl = item => covers(item) ? `/api/cover/${encodeURIComponent(covers(item))}` : '';
const duration = seconds => `${Math.floor((Number(seconds)||0)/60)}:${String(Math.floor((Number(seconds)||0)%60)).padStart(2,'0')}`;
const greeting = () => {const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'};

function Art({item, size='normal', className='', round=false}) {
  const [failed,setFailed] = useState(false);
  useEffect(()=>setFailed(false),[item?.id,item?.coverArt]);
  return <div className={`art ${size} ${round?'round':''} ${className}`}>
    {coverUrl(item) && !failed ? <img src={coverUrl(item)} alt="" loading="lazy" onError={()=>setFailed(true)}/> : <div className="art-fallback"><Disc3 size={size==='tiny'?18:38} strokeWidth={1.1}/></div>}
  </div>;
}
function Login({onLogin}) {
  const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{const user=await post('/api/login',{username,password});onLogin(user);}catch(err){setError(err.message);}finally{setBusy(false)}}
  return <div className="login-page"><div className="login-orb orb-one"/><div className="login-orb orb-two"/>
    <header className="login-head"><div className="brand-symbol"><Waves size={21}/></div><strong>jobbi<span>music</span></strong><span className="private-tag">YOUR PRIVATE MUSIC SPACE</span></header>
    <main className="login-layout"><div className="login-promo"><div className="eyebrow"><Sparkles size={14}/> THE MUSIC EXPERIENCE, REIMAGINED</div><h1>Your music.<br/><em>Beautifully</em> yours.</h1><p>Every album, every memory, every favorite song. One gorgeous place to listen.</p><div className="login-disc"><div className="disc-center"><Music2 size={30}/></div></div></div>
    <form className="login-card" onSubmit={submit}><div className="login-icon"><Headphones size={25}/></div><h2>Welcome back</h2><p>Sign in using your existing Navidrome account.</p><label>Username<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Your username" required/></label><label>Password<input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password" required/></label>{error&&<div className="error-note">{error}</div>}<button className="primary wide" disabled={busy} type="submit">{busy?<LoaderCircle className="spin" size={18}/>:<Play size={17} fill="currentColor"/>} Sign in to Jobbi Music</button><small>Secure connection to your personal music library.</small></form></main>
  </div>;
}
const navs=[{id:'home',label:'Listen Now',icon:Home},{id:'search',label:'Search',icon:Search},{id:'library',label:'Your Library',icon:Library}];
function Sidebar({page,setPage,user,logout,playlists}) {
  return <aside className="sidebar"><button className="brand" onClick={()=>setPage({id:'home'})}><span className="brand-symbol"><Waves size={19}/></span><span>jobbi<span className="brand-soft">music</span></span></button>
    <div className="sidebar-section"><span className="sidebar-heading">DISCOVER</span>{navs.map(n=><button key={n.id} onClick={()=>setPage({id:n.id})} className={`nav-item ${page.id===n.id?'active':''}`}><n.icon size={19} strokeWidth={1.8}/><span>{n.label}</span></button>)}</div>
    <div className="sidebar-section library-sidebar"><span className="sidebar-heading">YOUR COLLECTION</span><button className={`nav-item ${page.id==='favorites'?'active':''}`} onClick={()=>setPage({id:'favorites'})}><Heart size={19} strokeWidth={1.8}/> Favorites</button><button className="nav-item" onClick={()=>setPage({id:'library'})}><ListMusic size={19} strokeWidth={1.8}/> Playlists</button><div className="sidebar-playlists">{(playlists||[]).slice(0,10).map(p=><button key={p.id} onClick={()=>setPage({id:'playlist',idValue:p.id})}>{p.name}</button>)}</div></div>
    <div className="sidebar-bottom"><div className="user-avatar">{(user.username||'?').slice(0,1).toUpperCase()}</div><div className="account-name"><strong>{user.username}</strong><span>Personal library</span></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={18}/></button></div>
  </aside>;
}
function AlbumCard({item,onClick,subtitle}) {
  return <button className="album-card" onClick={()=>onClick(item)}><div className="album-art-wrap"><Art item={item}/><span className="album-play"><Play size={19} fill="currentColor"/></span></div><strong title={item.name||item.title}>{item.name||item.title||'Untitled'}</strong><span title={subtitle||item.artist}>{subtitle||item.artist||'Unknown artist'}</span></button>;
}
function AlbumRow({items,title,tagline,onClick,action}) {
  if(!items?.length)return null;
  return <section className="shelf"><div className="shelf-title"><div><h2>{title}</h2>{tagline&&<p>{tagline}</p>}</div>{action&&<span className="section-kicker">{action}</span>}</div><div className="album-grid">{items.map((x,i)=><AlbumCard key={x.id || i} item={x} onClick={onClick}/>)}</div></section>;
}
function SongList({songs,onPlay,currentTrack,starred,onFavorite,onAdd,onRemove,head=true}) {
  const [busy,setBusy]=useState('');
  return <div className="track-list">{head&&<div className="track-header"><span>#</span><span>TITLE</span><span>ALBUM</span><span className="track-time"><Clock3 size={15}/></span></div>}
    {(songs||[]).map((song,index)=><div className={`track-row ${currentTrack?.id===song.id?'is-playing':''}`} key={song.id||index}>
      <button className="track-number" onClick={()=>onPlay(songs,index)}>{currentTrack?.id===song.id ? <Waves size={16}/>:<><span className="track-index">{index+1}</span><Play size={14} className="row-play" fill="currentColor"/></>}</button>
      <button className="track-main" onClick={()=>onPlay(songs,index)}><Art item={song} size="tiny"/><span className="track-meta"><strong>{song.title||song.name}</strong><small>{song.artist||'Unknown artist'}</small></span></button>
      <span className="track-album">{song.album||''}</span>
      <div className="track-actions"><button className={`icon-button ${starred?.has(song.id)?'hearted':''}`} title="Favorite" disabled={busy===song.id} onClick={async()=>{setBusy(song.id);await onFavorite(song).catch(()=>{});setBusy('')}}><Heart size={15} fill={starred?.has(song.id)?'currentColor':'none'}/></button>{onAdd&&<button className="icon-button" title="Add to playlist" onClick={()=>onAdd(song)}><Plus size={16}/></button>}{onRemove&&<button className="icon-button" title="Remove from playlist" onClick={()=>onRemove(index)}><X size={16}/></button>}<span>{duration(song.duration)}</span></div>
    </div>)}</div>;
}
const extractRemote = data => {
  const found=[], visited=new Set();
  const walk=(node,peer='',depth=0)=>{
    if(depth>8||found.length>=120||!node||typeof node!=='object'||visited.has(node))return;
    visited.add(node);
    if(Array.isArray(node)){node.forEach(x=>walk(x,peer,depth+1));return;}
    const username=(typeof node.username==='string'&&node.username)||(typeof node.user==='string'&&node.user)||(typeof node.peer==='string'&&node.peer)||peer;
    const filename=node.filename||node.fileName;
    if(typeof filename==='string'){found.push({...node,filename,username});return;}
    for(const value of Object.values(node))if(value&&typeof value==='object')walk(value,username,depth+1);
  };
  walk(data);return found;
};
function App() {
  const [user,setUser]=useState(undefined),[page,setPage]=useState({id:'home'}),[home,setHome]=useState(null),[loading,setLoading]=useState(false),[detail,setDetail]=useState(null),[starred,setStarred]=useState(new Set());
  const [q,setQ]=useState(''),[results,setResults]=useState(null),[searchTab,setSearchTab]=useState('library'),[remote,setRemote]=useState(null),[remoteBusy,setRemoteBusy]=useState(false),[remoteStatus,setRemoteStatus]=useState(null),[formatFilter,setFormatFilter]=useState('all'),[sortRemote,setSortRemote]=useState('relevance');
  const [queue,setQueue]=useState([]),[currentIndex,setCurrentIndex]=useState(-1),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[length,setLength]=useState(0),[volume,setVolume]=useState(0.78),[shuffle,setShuffle]=useState(false),[repeat,setRepeat]=useState(false),[panel,setPanel]=useState(null),[lyrics,setLyrics]=useState(null),[error,setError]=useState('');
  const audio=useRef(null);
  const [newPlaylist,setNewPlaylist]=useState(''),[playlistBusy,setPlaylistBusy]=useState(false),[pickerSong,setPickerSong]=useState(null),[downloads,setDownloads]=useState(null),[downloadBusy,setDownloadBusy]=useState(false),[importSong,setImportSong]=useState(null),[importArtist,setImportArtist]=useState(''),[importTitle,setImportTitle]=useState(''),[importBusy,setImportBusy]=useState(false),[importNotice,setImportNotice]=useState('');
  const [libraryAlbums,setLibraryAlbums]=useState([]),[libraryArtists,setLibraryArtists]=useState([]),[libraryOffset,setLibraryOffset]=useState(0),[libraryMore,setLibraryMore]=useState(true),[libraryLoading,setLibraryLoading]=useState(false);
  const currentTrack=queue[currentIndex]||null;
  const albums = useMemo(()=>[...(home?.recent||[]),...(home?.featured||[])],[home]);
  const remoteItems = useMemo(()=>{
    const rows=extractRemote(remote);
    const filtered=rows.filter(item=>formatFilter==='all'||String(item.format||item.filename?.split('.').pop()||'').toLowerCase()===formatFilter);
    return [...filtered].sort((a,b)=>{
      if(sortRemote==='size')return Number(b.size||0)-Number(a.size||0);
      if(sortRemote==='speed')return Number(b.uploadSpeed||0)-Number(a.uploadSpeed||0);
      if(sortRemote==='quality')return (Number(b.bitrate||0)+(/flac/i.test(b.format||b.filename||'')?1000:0))-(Number(a.bitrate||0)+(/flac/i.test(a.format||a.filename||'')?1000:0));
      return Number(b.relevanceScore||0)-Number(a.relevanceScore||0);
    });
  },[remote,formatFilter,sortRemote]);


  useEffect(()=>{api('/api/session').then(setUser).catch(()=>setUser(null));},[]);
  useEffect(()=>{if(!user)return;setLoading(true);Promise.allSettled([api('/api/home'),api('/api/starred')]).then(([h,s])=>{if(h.status==='fulfilled')setHome(h.value);else setError(h.reason.message);if(s.status==='fulfilled')setStarred(new Set([...(s.value.song||[]),...(s.value.album||[])].map(x=>x.id)));}).finally(()=>setLoading(false));},[user]);
  useEffect(()=>{if(page.id==='album'||page.id==='playlist'||page.id==='artist'){setDetail(null);const type=page.id==='album'?'albums':page.id==='playlist'?'playlists':'artists';api(`/api/${type}/${encodeURIComponent(page.idValue)}`).then(setDetail).catch(err=>setError(err.message));}},[page.id,page.idValue]);
  useEffect(()=>{if(page.id!=='search'||searchTab!=='library'||!q.trim()){setResults(null);return;}const timer=setTimeout(()=>api(`/api/search?q=${encodeURIComponent(q)}`).then(setResults).catch(err=>setError(err.message)),260);return()=>clearTimeout(timer);},[q,page.id,searchTab]);
  useEffect(()=>{
    if(!user||page.id!=='library')return;
    let cancelled=false;
    setLibraryLoading(true);setLibraryAlbums([]);setLibraryOffset(0);setLibraryMore(true);
    Promise.allSettled([api('/api/library/albums?offset=0&size=48'),api('/api/library/artists')]).then(([a,b])=>{
      if(cancelled)return;
      if(a.status==='fulfilled'){setLibraryAlbums(a.value.albums||[]);setLibraryOffset((a.value.albums||[]).length);setLibraryMore((a.value.albums||[]).length===48);}
      else setError(a.reason.message);
      if(b.status==='fulfilled')setLibraryArtists(b.value.artists||[]);
    }).finally(()=>{if(!cancelled)setLibraryLoading(false)});
    return()=>{cancelled=true};
  },[user?.username,page.id]);
  const loadMoreAlbums=async()=>{
    if(libraryLoading||!libraryMore)return;
    setLibraryLoading(true);
    try{
      const data=await api(`/api/library/albums?offset=${libraryOffset}&size=48`);
      setLibraryAlbums(prev=>[...prev,...(data.albums||[])]);
      setLibraryOffset(n=>n+(data.albums||[]).length);
      setLibraryMore((data.albums||[]).length===48);
    }catch(e){setError(e.message)}finally{setLibraryLoading(false)}
  };
  useEffect(()=>{if(!audio.current)return;audio.current.volume=volume;},[volume,user]);
  useEffect(()=>{if(!audio.current||!currentTrack)return;const a=audio.current;const src=`/api/stream/${encodeURIComponent(currentTrack.id)}`;if(a.getAttribute('src')!==src){a.src=src;a.load();}a.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));setPosition(0);setLength(Number(currentTrack.duration||0));},[currentTrack?.id]);
  useEffect(()=>{if(!currentTrack||panel!=='lyrics')return;setLyrics(null);api(`/api/lyrics/${encodeURIComponent(currentTrack.id)}`).then(setLyrics).catch(()=>setLyrics({}));},[currentTrack?.id,panel]);
  useEffect(()=>{const listener=e=>{if(e.target?.tagName==='INPUT')return;if(e.code==='Space'&&currentTrack){e.preventDefault();toggle();}if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();setPage({id:'search'});document.querySelector('.search-input')?.focus();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[currentTrack,playing]);
  // Integrate with OS media controls when the browser supports Media Session.
  useEffect(()=>{
    if(!currentTrack||!('mediaSession' in navigator))return;
    const session=navigator.mediaSession;
    if('MediaMetadata' in window){
      const art=coverUrl(currentTrack);
      session.metadata=new window.MediaMetadata({
        title:currentTrack.title||'Unknown track',
        artist:currentTrack.artist||'Unknown artist',
        album:currentTrack.album||'Jobbi Music',
        artwork:art?[{src:new URL(art,window.location.href).href}]:[]
      });
    }
    const handlers={
      play:()=>audio.current?.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false)),
      pause:()=>{audio.current?.pause();setPlaying(false);},
      previoustrack:()=>prev(),
      nexttrack:()=>next(),
      seekbackward:({seekOffset}={})=>{if(audio.current)audio.current.currentTime=Math.max(0,audio.current.currentTime-(seekOffset||10));},
      seekforward:({seekOffset}={})=>{if(audio.current)audio.current.currentTime=Math.min(audio.current.duration||Infinity,audio.current.currentTime+(seekOffset||10));},
      seekto:({seekTime})=>{if(audio.current&&Number.isFinite(seekTime))audio.current.currentTime=Math.max(0,seekTime);}
    };
    for(const [action,handler] of Object.entries(handlers)){try{session.setActionHandler(action,handler);}catch{}}
    return()=>{for(const action of Object.keys(handlers)){try{session.setActionHandler(action,null);}catch{}}};
  },[currentTrack?.id,queue.length,shuffle,repeat]);
  useEffect(()=>{if('mediaSession' in navigator)navigator.mediaSession.playbackState=!currentTrack?'none':playing?'playing':'paused';},[currentTrack?.id,playing]);
  useEffect(()=>{if(!currentTrack||!Number.isFinite(length)||length<=0||!('mediaSession' in navigator)||!navigator.mediaSession.setPositionState)return;
    try{navigator.mediaSession.setPositionState({duration:length,playbackRate:1,position:Math.max(0,Math.min(length,position))});}catch{}
  },[position,length,currentTrack?.id]);
  const playTracks=(tracks,index=0)=>{const track=tracks?.[index];if(!track)return;const a=audio.current;if(a){const src=`/api/stream/${encodeURIComponent(track.id)}`;if(a.getAttribute('src')!==src){a.src=src;a.load();}a.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));}setQueue(tracks);setCurrentIndex(index);};
  const next=()=>{if(!queue.length)return;setCurrentIndex(i=>shuffle?Math.floor(Math.random()*queue.length):repeat?i:(i+1)%queue.length)};
  const prev=()=>{if(!queue.length)return;if(audio.current?.currentTime>3){audio.current.currentTime=0;return;}setCurrentIndex(i=>(i-1+queue.length)%queue.length)};
  const toggle=()=>{if(!audio.current||!currentTrack)return;if(audio.current.paused)audio.current.play().then(()=>setPlaying(true)).catch(()=>{});else{audio.current.pause();setPlaying(false);}};
  const favorite=async item=>{const shouldStar=!starred.has(item.id);await post('/api/star',{id:item.id,starred:shouldStar});setStarred(old=>{const a=new Set(old);shouldStar?a.add(item.id):a.delete(item.id);return a;});};
  const logout=async()=>{await post('/api/logout',{}).catch(()=>{});audio.current?.pause();setCurrentIndex(-1);setQueue([]);setUser(null);};
  const openAlbum = item=>setPage({id:'album',idValue:item.id});
  const refreshPlaylists=async()=>{const playlists=await api('/api/playlists');setHome(h=>({...h,playlists}));return playlists;};
  const createPlaylist=async e=>{e.preventDefault();if(!newPlaylist.trim())return;setPlaylistBusy(true);setError('');try{await post('/api/playlists',{name:newPlaylist.trim()});setNewPlaylist('');await refreshPlaylists();}catch(e){setError(e.message)}finally{setPlaylistBusy(false)}};
  const addToPlaylist=async id=>{if(!pickerSong)return;setPlaylistBusy(true);setError('');try{const result=await api(`/api/playlists/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({addSongId:pickerSong.id})});setPickerSong(null);if(page.id==='playlist'&&page.idValue===id)setDetail(result.playlist);await refreshPlaylists();}catch(e){setError(e.message)}finally{setPlaylistBusy(false)}};
  const removeFromPlaylist=async(id,index)=>{setError('');try{const result=await api(`/api/playlists/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({removeIndex:index})});setDetail(result.playlist);await refreshPlaylists();}catch(e){setError(e.message)}};
  const renamePlaylist=async id=>{const name=window.prompt('New playlist name:',detail?.name||'');if(name===null)return;setError('');try{const r=await api(`/api/playlists/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({name})});setDetail(r.playlist);await refreshPlaylists();}catch(e){setError(e.message)}};
  const deletePlaylist=async id=>{if(!window.confirm('Delete this playlist? Songs in your music library will not be deleted.'))return;setError('');try{await api(`/api/playlists/${encodeURIComponent(id)}`,{method:'DELETE'});await refreshPlaylists();setPage({id:'library'});}catch(e){setError(e.message)}};
  const refreshDownloads=async()=>{setDownloadBusy(true);setError('');try{setDownloads(await api('/api/soulseek/downloads'));}catch(e){setError(e.message)}finally{setDownloadBusy(false)}};
  const chooseImport=item=>{
    const basename=item.filename?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/,'')||'';
    const parts=basename.split(/\s+-\s+/);
    setImportSong(item);
    setImportArtist(parts.length>1?parts.shift():'');
    setImportTitle(parts.length?parts.join(' - '):basename);
    setImportNotice('');
  };
  const submitImport=async e=>{
    e.preventDefault();if(!importSong||!importArtist.trim()||!importTitle.trim())return;
    setImportBusy(true);setError('');
    try{
      await post('/api/soulseek/download',{
        username:importSong.username,filename:importSong.filename,size:Number(importSong.size),
        artist:importArtist.trim(),title:importTitle.trim()
      });
      setImportSong(null);setImportNotice('Transfer queued on your NAS. It will appear in Navidrome after importing and indexing.');
      await refreshDownloads();
    }catch(e){setError(e.message)}finally{setImportBusy(false)}
  };
  const scanLibrary=async()=>{
    setError('');
    try{await post('/api/library/scan',{});setImportNotice('Library scan requested. New songs may take a moment to appear.');}
    catch(e){setError(e.message)}
  };
  useEffect(()=>{
    if(!user?.admin||page.id!=='search'||searchTab!=='soulseek')return;
    api('/api/soulseek/downloads').then(setDownloads).catch(()=>{});
    api('/api/soulseek/status').then(setRemoteStatus).catch(()=>setRemoteStatus({configured:false,message:'Unable to reach the Soulseek service'}));
    const timer=setInterval(()=>api('/api/soulseek/downloads').then(setDownloads).catch(()=>{}),30000);
    return()=>clearInterval(timer);
  },[user?.admin,page.id,searchTab]);


  async function remoteSearch(){if(!q.trim())return;setRemoteBusy(true);setRemote(null);setError('');try{setRemote(await post('/api/soulseek/search',{query:q}));}catch(e){setError(e.message)}finally{setRemoteBusy(false)}}
  if(user===undefined)return <div className="loading-page"><div className="brand-symbol"><Waves/></div><span>Loading your music...</span></div>;
  if(!user)return <Login onLogin={setUser}/>;
  let main=null;
  if(page.id==='home')main=<>
    <div className="home-welcome"><div><div className="eyebrow"><Sparkles size={14}/> YOUR PERSONAL SOUNDTRACK</div><h1>{greeting()}<span className="spark-dot">.</span></h1><p>Pick up where the music left off.</p></div><span className="date-label">{new Intl.DateTimeFormat('en',{weekday:'long',month:'long',day:'numeric'}).format(new Date())}</span></div>
    <div className="hero-card"><div className="hero-glow"/><div className="hero-copy"><span className="hero-kicker"><span className="live-indicator"/> MADE FOR YOUR EARS</span><h2>All your music.<br/><em>One beautiful place.</em></h2><p>Rediscover the songs that move you. Your collection, your way.</p><div className="hero-buttons"><button className="primary" onClick={()=>playTracks(home?.songs||[],0)}><Play size={16} fill="currentColor"/> Play something good</button><button className="ghost-button" onClick={()=>setPage({id:'library'})}>Explore library <ArrowRight size={15}/></button></div></div><div className="hero-art"><div className="hero-record"><div className="record-core">{albums[0]&&<Art item={albums[0]}/>}</div></div></div></div>
    {loading&&!home?<div className="loading-block"><LoaderCircle className="spin"/> Loading albums…</div>:null}
    <AlbumRow items={home?.recent} title="Fresh in your library" tagline="The latest additions to your collection" onClick={openAlbum}/>
    <AlbumRow items={home?.played} title="On repeat" tagline="The music you come back to" onClick={openAlbum}/>
    <AlbumRow items={home?.featured} title="Rediscover something" tagline="A little surprise from your shelves" onClick={openAlbum}/>
    {!loading&&!albums.length?<div className="empty-state"><Disc3 size={36}/><h3>Your library is ready</h3><p>Once Navidrome indexes your music, your albums will show up here.</p></div>:null}
  </>;
  if(page.id==='search')main=<><div className="page-title"><div className="eyebrow">EXPLORE MUSIC</div><h1>Search<span className="spark-dot">.</span></h1><p>Find the sounds you're looking for.</p></div><div className="search-bar"><Search size={22}/><input className="search-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Songs, artists, albums..." autoFocus/>{q&&<button className="icon-button" onClick={()=>{setQ('');setRemote(null)}}><X size={18}/></button>}<span>⌘ K</span></div>
    <div className="segmented"><button className={searchTab==='library'?'selected':''} onClick={()=>setSearchTab('library')}><Library size={16}/> Your library</button>{user.admin&&<button className={searchTab==='soulseek'?'selected':''} onClick={()=>setSearchTab('soulseek')}><Radio size={16}/> Find more music <span className="experimental">PRIVATE</span></button>}</div>
    {searchTab==='library'?<>{results?<><AlbumRow items={results.album||[]} title="Albums" onClick={openAlbum}/>{(results.artist||[]).length>0&&<section className="shelf"><div className="shelf-title"><h2>Artists</h2></div><div className="artist-strip">{results.artist.map(a=><button key={a.id} onClick={()=>setPage({id:'artist',idValue:a.id})}><Art item={a} round/><strong>{a.name}</strong></button>)}</div></section>}{(results.song||[]).length>0&&<section className="shelf"><div className="shelf-title"><h2>Songs</h2></div><SongList songs={results.song} onPlay={playTracks} currentTrack={currentTrack} starred={starred} onFavorite={favorite} onAdd={setPickerSong}/></section>}{!results.album?.length&&!results.song?.length&&!results.artist?.length&&<div className="empty-state">No matches in your library.</div>}</>:<div className="search-suggestion"><Search size={35}/><h3>Every great listen starts somewhere.</h3><p>Search your own albums, artists, and tracks.</p></div>}</>:
    <section className="remote-search"><div className="remote-notice"><Radio size={21}/><div><strong>Search beyond your library</strong><p>Search the Soulseek peer network for recordings you may legally access. Selected files transfer to your NAS, not your phone. Existing music plays instantly through Navidrome.</p></div></div>
      <div className="source-indicator"><span className={remoteStatus?.serverConnected?'source-online':'source-unknown'}/><span>{remoteStatus?.mode==='slskd'?remoteStatus.serverConnected?'Soulseek connected':'Soulseek connection needs attention':remoteStatus?.mode==='legacy'?'Legacy search · direct slskd connection recommended':'Checking Soulseek connection…'}</span></div>
      {remoteStatus?.message&&<div className="search-notice">{remoteStatus.message}</div>}
      <div className="search-actions"><button className="primary" disabled={remoteBusy||q.trim().length<2} onClick={remoteSearch}>{remoteBusy?<LoaderCircle className="spin" size={17}/>:<Search size={17}/>} {remoteBusy?'Searching peers (up to 25s)…':'Search Soulseek'}</button><span className="search-helper">Try artist, album, or track names in multiple languages.</span></div>
      {q.trim().toLowerCase()==='kino'&&<div className="search-alternatives">Looking for the rock band? Try <button onClick={()=>setQ('Кино')}>Кино</button> or <button onClick={()=>setQ('Виктор Цой')}>Виктор Цой</button>.</div>}
      {remote&&<div className="remote-results"><div className="remote-head"><div><h2>Music from Soulseek</h2><p>{remote.total??extractRemote(remote).length} available audio results · {remote.peerCount??'Multiple'} peers{remote.elapsedMs?' · '+Math.round(remote.elapsedMs/1000)+'s':''}</p></div><div className="search-filters"><label>Format<select value={formatFilter} onChange={e=>setFormatFilter(e.target.value)}><option value="all">All audio</option><option value="flac">FLAC</option><option value="mp3">MP3</option><option value="m4a">M4A</option><option value="opus">Opus</option><option value="wav">WAV</option></select></label><label>Sort<select value={sortRemote} onChange={e=>setSortRemote(e.target.value)}><option value="relevance">Best match</option><option value="quality">Quality</option><option value="speed">Upload speed</option><option value="size">File size</option></select></label></div></div>
      {remoteItems.length?remoteItems.map((item,i)=><div className="remote-item" key={item.username+'|'+item.filename+'|'+i}><Music2 size={17}/><div><strong>{(item.filename||item.fileName||'Unknown').split(/[\\/]/).pop()}</strong><small>{item.username||item.user||'Peer'} · {item.size?((Number(item.size)/1048576).toFixed(1)+' MB · '):''}{item.format||item.filename?.split('.').pop()?.toUpperCase()}{item.bitrate?' · '+item.bitrate+' kbps':''}{item.freeUploadSlot?' · Free slot':''}</small></div>{item.username&&Number(item.size)>0&&<button className="import-button" onClick={()=>chooseImport(item)} title="Queue transfer to NAS"><Plus size={15}/> Add to library</button>}</div>):
      <div className="remote-empty"><Search size={30}/><h3>{extractRemote(remote).length?'No results match these filters':'No Soulseek audio results yet'}</h3><p>{remote.message||'Try a broader search, alternate artist spelling, or check that slskd is connected to the Soulseek network.'}</p><button className="ghost-button" onClick={()=>{setFormatFilter('all');setSortRemote('relevance')}}>Reset filters</button></div>}</div>}
      {importNotice&&<div className="import-notice"><Check size={17}/>{importNotice}</div>}
      <div className="transfer-section"><div className="shelf-title"><div><h2>Your transfers</h2><p>Existing Soulseek transfers are monitored on your NAS.</p></div><button className="ghost-button" onClick={refreshDownloads} disabled={downloadBusy}><RefreshCw size={15}/> Refresh transfers</button><button className="ghost-button" onClick={scanLibrary} title="Ask Navidrome to scan for newly imported music"><RefreshCw size={15}/> Refresh library</button></div>
      {downloads&&<div className="remote-results">{extractRemote(downloads).length?extractRemote(downloads).map((item,i)=><div className="remote-item" key={i}><Music2 size={17}/><div><strong>{(item.filename||item.fileName||'Unknown').split(/[\\/]/).pop()}</strong><small>{item.state||item.status||'Transferring'} · {item.percentage||0}%</small></div></div>):<pre className="transfer-empty">{JSON.stringify(downloads,null,2).slice(0,1500)}</pre>}</div>}
      </div></section>}
  </>;
  if(page.id==='library')main=<><div className="page-title"><div className="eyebrow">COLLECTION</div><h1>Your library<span className="spark-dot">.</span></h1><p>A home for every sound you love.</p></div><form className="playlist-create" onSubmit={createPlaylist}><label htmlFor="new-playlist">Create a playlist</label><input id="new-playlist" maxLength="100" value={newPlaylist} onChange={e=>setNewPlaylist(e.target.value)} placeholder="Give your playlist a name"/><button className="primary" disabled={playlistBusy||!newPlaylist.trim()} type="submit"><Plus size={16}/> Create</button></form><div className="library-shortcuts"><button onClick={()=>setPage({id:'favorites'})}><span className="shortcut-icon red"><Heart size={25} fill="currentColor"/></span><strong>Favorites</strong><ArrowRight size={17}/></button><button onClick={()=>setPage({id:'search'})}><span className="shortcut-icon purple"><Search size={25}/></span><strong>Discover more</strong><ArrowRight size={17}/></button></div><AlbumRow items={libraryAlbums} title="All albums" tagline="Browse your complete music collection" onClick={openAlbum}/>{libraryLoading&&<div className="loading-block"><LoaderCircle className="spin" size={17}/> Loading library…</div>}{libraryMore&&!libraryLoading&&<button className="ghost-button load-more" onClick={loadMoreAlbums}>Load more albums <ArrowDownToLine size={16}/></button>}{libraryArtists.length>0&&<section className="shelf"><div className="shelf-title"><div><h2>Artists</h2><p>Explore your favorite musicians</p></div></div><div className="artist-strip">{libraryArtists.slice(0,80).map(a=><button key={a.id} onClick={()=>setPage({id:'artist',idValue:a.id})}><Art item={a} round/><strong>{a.name}</strong></button>)}</div></section>}{(home?.playlists||[]).length>0&&<section className="shelf"><div className="shelf-title"><h2>Your playlists</h2></div><div className="playlist-grid">{home.playlists.map(p=><button onClick={()=>setPage({id:'playlist',idValue:p.id})} key={p.id}><div className="playlist-graphic"><ListMusic size={31}/></div><strong>{p.name}</strong><span>{p.songCount||0} songs</span></button>)}</div></section>}</>;
  if(page.id==='favorites')main=<><div className="page-title"><div className="eyebrow">SAVED FOR LATER</div><h1>Favorites<span className="spark-dot">.</span></h1><p>Only the good stuff.</p></div><AlbumRow items={(home?.recent||[]).filter(x=>starred.has(x.id))} title="Loved albums" onClick={openAlbum}/><Favorites starred={starred} currentTrack={currentTrack} playTracks={playTracks} favorite={favorite} openAlbum={openAlbum} onAdd={setPickerSong}/></>;
  if(['album','artist','playlist'].includes(page.id))main=detail?<><button className="back-link" onClick={()=>setPage({id:'library'})}><ArrowLeft size={18}/> Back to library</button><div className="detail-hero"><Art item={detail} size="big" round={page.id==='artist'}/><div className="detail-info"><span className="eyebrow">{page.id.toUpperCase()}</span><h1>{detail.name||detail.title||'Untitled'}</h1><p>{page.id==='artist'?`${detail.albumCount||0} albums`:(detail.artist||'Your collection')} · {detail.songCount||detail.song?.length||detail.entry?.length||0} tracks</p><button className="primary" onClick={()=>{const tracks=detail.song||detail.entry||[];if(tracks.length)playTracks(tracks);else if(detail.album?.length)openAlbum(detail.album[0])}}><Play size={18} fill="currentColor"/> Play {page.id==='artist'?'music':'album'}</button>{page.id==='playlist'&&<div className="playlist-edit"><button className="ghost-button" onClick={()=>renamePlaylist(page.idValue)}>Rename</button><button className="ghost-button" onClick={()=>deletePlaylist(page.idValue)}>Delete playlist</button></div>}</div></div>{detail.album?.length?<AlbumRow items={detail.album} title="Albums" onClick={openAlbum}/>:null}{(detail.song||detail.entry||[]).length>0?<section className="shelf"><div className="shelf-title"><h2>Tracks</h2></div><SongList songs={detail.song||detail.entry} onPlay={playTracks} currentTrack={currentTrack} starred={starred} onFavorite={favorite} onAdd={setPickerSong} onRemove={page.id==='playlist'?i=>removeFromPlaylist(page.idValue,i):undefined}/></section>:null}</>:<div className="loading-block"><LoaderCircle className="spin"/> Loading music…</div>;
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} user={user} logout={logout} playlists={home?.playlists}/><div className="main-column"><header className="topbar"><div className="topbar-left"><button className="icon-button" onClick={()=>setPage({id:'home'})} title="Home"><Home size={18}/></button><button className="topbar-search" onClick={()=>setPage({id:'search'})}><Search size={17}/><span>Search your music</span><kbd>⌘ K</kbd></button></div><div className="topbar-right"><span className="server-dot"/> <span className="connected">Your private library</span><button className="header-avatar" title="Your account">{user.username.slice(0,1).toUpperCase()}</button></div></header><main className="content">{error&&<div className="inline-error"><span>{error}</span><button onClick={()=>setError('')}><X size={17}/></button></div>}{main}<footer className="page-footer">JOBBI MUSIC <span>·</span> YOUR LIBRARY, REIMAGINED.</footer></main></div>
    <audio ref={audio} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)} onLoadedMetadata={e=>setLength(e.currentTarget.duration)} onEnded={()=>{if(currentTrack)post('/api/scrobble',{id:currentTrack.id}).catch(()=>{});if(repeat&&audio.current){audio.current.currentTime=0;audio.current.play().catch(()=>{});}else{next()}}} onError={e=>{setPlaying(false);if(e.currentTarget.error && currentTrack)setError('Playback failed. Check the track format or connection, then try again.')}}/>
    <div className={`player ${currentTrack?'player-active':''}`}><div className="player-song"><Art item={currentTrack} size="small"/><div className="player-song-text"><strong>{currentTrack?.title||'Nothing playing yet'}</strong><span>{currentTrack?.artist||'Your soundtrack starts here'}</span></div>{currentTrack&&<button className={`icon-button ${starred.has(currentTrack.id)||currentTrack.starred?'hearted':''}`} onClick={()=>favorite(currentTrack).catch(e=>setError(e.message))} title="Favorite"><Heart size={18} fill={starred.has(currentTrack.id)||currentTrack.starred?'currentColor':'none'}/></button>}</div>
    <div className="player-center"><div className="playback-controls"><button className={`icon-button ${shuffle?'control-on':''}`} onClick={()=>setShuffle(v=>!v)} title="Shuffle"><Shuffle size={16}/></button><button className="icon-button" onClick={prev} disabled={!currentTrack}><SkipBack size={19} fill="currentColor"/></button><button className="play-round" onClick={toggle} disabled={!currentTrack}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button><button className="icon-button" onClick={next} disabled={!currentTrack}><SkipForward size={19} fill="currentColor"/></button><button className={`icon-button ${repeat?'control-on':''}`} onClick={()=>setRepeat(v=>!v)} title="Repeat"><Repeat2 size={16}/></button></div><div className="seek"><small>{duration(position)}</small><input type="range" min="0" max={Math.max(length,1)} value={Math.min(position,length||0)} onChange={e=>{if(audio.current){audio.current.currentTime=Number(e.target.value);setPosition(Number(e.target.value))}}} disabled={!currentTrack}/><small>{duration(length)}</small></div></div>
    <div className="player-extras"><button className={`icon-button ${panel==='lyrics'?'control-on':''}`} title="Lyrics" onClick={()=>setPanel(panel==='lyrics'?null:'lyrics')} disabled={!currentTrack}><Mic2 size={18}/></button><button className={`icon-button ${panel==='queue'?'control-on':''}`} title="Queue" onClick={()=>setPanel(panel==='queue'?null:'queue')}><ListMusic size={19}/></button><Volume2 size={18}/><input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))} aria-label="Volume"/></div></div>
    <nav className="mobile-nav">{navs.map(n=><button key={n.id} className={page.id===n.id?'selected':''} onClick={()=>setPage({id:n.id})}><n.icon size={21}/><span>{n.label}</span></button>)}</nav>
    {importSong&&<div className="panel-backdrop" onClick={()=>setImportSong(null)}><aside className="side-panel" onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">IMPORT AUDIO</span><h2>Add to your library</h2></div><button className="icon-button" onClick={()=>setImportSong(null)}><X size={22}/></button></header><form onSubmit={submitImport} className="import-form"><p className="import-filename">{importSong.filename?.split(/[\\/]/).pop()}</p><p>Source: {importSong.username||'Unknown peer'} · {(Number(importSong.size)/1048576).toFixed(1)} MB</p><label>Artist<input value={importArtist} maxLength="180" onChange={e=>setImportArtist(e.target.value)} required placeholder="Artist name"/></label><label>Track title<input value={importTitle} maxLength="180" onChange={e=>setImportTitle(e.target.value)} required placeholder="Song title"/></label><p className="import-disclaimer">Only transfer recordings you have permission to access. Files are saved on your NAS, not on this device.</p><button type="submit" className="primary wide" disabled={importBusy||!importArtist.trim()||!importTitle.trim()}>{importBusy?<LoaderCircle className="spin" size={16}/>:<ArrowDownToLine size={16}/>} Queue download</button></form></aside></div>}
    {pickerSong&&<div className="panel-backdrop" onClick={()=>setPickerSong(null)}><aside className="side-panel" onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">YOUR PLAYLISTS</span><h2>Add to playlist</h2></div><button className="icon-button" onClick={()=>setPickerSong(null)}><X size={22}/></button></header><p>{pickerSong.title} · {pickerSong.artist}</p><div className="queue-content">{(home?.playlists||[]).map(p=><button className="queue-item" key={p.id} disabled={playlistBusy} onClick={()=>addToPlaylist(p.id)}><ListMusic size={19}/><div><strong>{p.name}</strong><small>{p.songCount||0} songs</small></div><Plus size={19}/></button>)}{!(home?.playlists||[]).length&&<p>Make your first playlist under Your Library.</p>}</div></aside></div>}
    {panel&&<div className="panel-backdrop" onClick={()=>setPanel(null)}><aside className="side-panel" onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">NOW PLAYING</span><h2>{panel==='queue'?'Up next':'Lyrics'}</h2></div><button className="icon-button" onClick={()=>setPanel(null)}><X size={22}/></button></header>{panel==='queue'?<div className="queue-content">{queue.map((s,i)=><button className={`queue-item ${i===currentIndex?'selected':''}`} key={i} onClick={()=>setCurrentIndex(i)}><Art item={s} size="tiny"/><div><strong>{s.title}</strong><small>{s.artist}</small></div>{i===currentIndex&&<Waves size={18}/>}</button>)}</div>:<div className="lyrics-content"><Art item={currentTrack} size="big"/><h3>{currentTrack?.title}</h3><p>{currentTrack?.artist}</p>{(lyrics?.structuredLyrics||[]).length?<div className="lyrics-lines">{lyrics.structuredLyrics.flatMap((o,i)=>(o.line||[]).map((l,j)=><p key={`${i}-${j}`}>{l.value||'♪'}</p>))}</div>:<div className="lyrics-empty"><Mic2 size={24}/><p>No synced lyrics found for this track.</p><small>Your existing LRCLIB downloader may be able to add them.</small></div>}</div>}</aside></div>}
  </div>;
}
function Favorites({currentTrack,playTracks,favorite,openAlbum,starred,onAdd}){
  const [data,setData]=useState(null);const[err,setErr]=useState('');useEffect(()=>{api('/api/starred').then(setData).catch(e=>setErr(e.message))},[starred]);
  return <>{err&&<p>{err}</p>}<AlbumRow items={data?.album||[]} title="Favorite albums" onClick={openAlbum}/><section className="shelf"><div className="shelf-title"><h2>Favorite songs</h2></div>{data?.song?.length?<SongList songs={data.song} currentTrack={currentTrack} onPlay={playTracks} onFavorite={favorite} starred={starred} onAdd={onAdd}/>:<div className="empty-state"><Heart size={28}/><p>Tap a heart on any song to save it here.</p></div>}</section></>;
}
createRoot(document.getElementById('root')).render(<App/>);
