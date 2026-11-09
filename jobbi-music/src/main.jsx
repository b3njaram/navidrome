import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MoreHorizontal, Album, ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Disc3, Heart, Home, Library, ListMusic, LoaderCircle, LogOut, Maximize2, Music2, Pause, Play, Plus, Repeat2, Search, Settings2, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Volume2, VolumeX, Waves, X, Mic2, Radio, RefreshCw, Headphones, HardDrive } from 'lucide-react';
import './style.css';
import SocialSpace from './SocialSpace.jsx';
import NowPlaying from './NowPlaying.jsx';
import './nowplaying.css';

let currentCsrfToken='';
const api = async (url, opts={}) => {
  const method=(opts.method||'GET').toUpperCase();
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  if(method!=='GET'&&method!=='HEAD'&&currentCsrfToken)headers['X-CSRF-Token']=currentCsrfToken;
  const res = await fetch(url, {credentials:'same-origin', ...opts, headers});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  if((url==='/api/session'||url==='/api/login')&&data?.csrfToken)currentCsrfToken=data.csrfToken;
  if(url==='/api/logout')currentCsrfToken='';
  return data;
};
const post = (url,payload) => api(url,{method:'POST',body:JSON.stringify(payload)});

// The Android bridge is injected only on the configured trusted server origin.
// Normal browsers do not get the native offline buttons.
const isNativeAndroid=()=>typeof window!=='undefined'&&typeof window.JobbiAndroid?.postMessage==='function';
if(isNativeAndroid())document.documentElement.classList.add('native-android');
const nativeCommand=(type,extra={})=>{
  if(!isNativeAndroid())return false;
  window.JobbiAndroid.postMessage(JSON.stringify({type,...extra}));
  return true;
};

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
const navs=[{id:'home',label:'Listen Now',icon:Home},{id:'search',label:'Discover',icon:Search},{id:'library',label:'Your Library',icon:Library},{id:'social',label:'Community',icon:Heart}];
function Sidebar({page,setPage,user,logout,playlists}) {
  return <aside className="sidebar"><button className="brand" onClick={()=>setPage({id:'home'})}><span className="brand-symbol"><Waves size={19}/></span><span>jobbi<span className="brand-soft">music</span></span></button>
    <div className="sidebar-section"><span className="sidebar-heading">DISCOVER</span>{navs.map(n=><button key={n.id} onClick={()=>setPage({id:n.id})} className={`nav-item ${page.id===n.id?'active':''}`}><n.icon size={19} strokeWidth={1.8}/><span>{n.label}</span></button>)}</div>
    <div className="sidebar-section library-sidebar"><span className="sidebar-heading">YOUR COLLECTION</span><button className={`nav-item ${page.id==='favorites'?'active':''}`} onClick={()=>setPage({id:'favorites'})}><Heart size={19} strokeWidth={1.8}/> Favorites</button><button className="nav-item" onClick={()=>setPage({id:'library'})}><ListMusic size={19} strokeWidth={1.8}/> Playlists</button><div className="sidebar-playlists">{(playlists||[]).slice(0,10).map(p=><button key={p.id} onClick={()=>setPage({id:'playlist',idValue:p.id})}>{p.name}</button>)}</div></div>
    <div className="sidebar-section"><span className="sidebar-heading">ACCOUNT</span>
      {user.admin&&<button className={`nav-item ${page.id==='admin'?'active':''}`} onClick={()=>setPage({id:'admin'})}><Settings2 size={19}/> Admin console</button>}
      <button className={`nav-item ${page.id==='settings'?'active':''}`} onClick={()=>setPage({id:'settings'})}><SlidersHorizontal size={19}/> Settings</button>
    </div>
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
function SongList({songs,onPlay,currentTrack,starred,onFavorite,onAdd,onRemove,onSave,onArtist,onAlbum,head=true}) {
  const [busy,setBusy]=useState('');
  return <div className="track-list">{head&&<div className="track-header"><span>#</span><span>TITLE</span><span>ALBUM</span><span className="track-time"><Clock3 size={15}/></span></div>}
    {(songs||[]).map((song,index)=><div className={`track-row ${currentTrack?.id===song.id?'is-playing':''}`} key={song.id||index}>
      <button className="track-number" onClick={()=>onPlay(songs,index)}>{currentTrack?.id===song.id ? <Waves size={16}/>:<><span className="track-index">{index+1}</span><Play size={14} className="row-play" fill="currentColor"/></>}</button>
      <div className="track-main"><button className="track-art-click" aria-label={'Play '+(song.title||song.name)} onClick={()=>onPlay(songs,index)}><Art item={song} size="tiny"/></button><span className="track-meta"><button className="track-song-title" onClick={()=>onPlay(songs,index)}>{song.title||song.name}</button><button className="track-artist-link" title={'More songs by '+(song.artist||'this artist')} onClick={()=>onArtist?.(song)}>{song.artist||'Unknown artist'}</button></span></div>
      <span className="track-album">{song.album&&<button className="track-album-link" title={'View '+song.album+' album'} onClick={()=>onAlbum?.(song)}>{song.album}</button>}</span>
      <div className="track-actions"><button className={`icon-button ${starred?.has(song.id)?'hearted':''}`} title="Favorite" disabled={busy===song.id} onClick={async()=>{setBusy(song.id);await onFavorite(song).catch(()=>{});setBusy('')}}><Heart size={15} fill={starred?.has(song.id)?'currentColor':'none'}/></button>{onAdd&&<button className="icon-button" title="Add to playlist" onClick={()=>onAdd(song)}><Plus size={16}/></button>}{onSave&&<button className="icon-button" title="Save on Android for offline playback" onClick={()=>onSave(song)}><ArrowDownToLine size={16}/></button>}{onRemove&&<button className="icon-button" title="Remove from playlist" onClick={()=>onRemove(index)}><X size={16}/></button>}<span>{duration(song.duration)}</span></div>
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
  const [mobileMore,setMobileMore]=useState(false);
  const [nowPlayingOpen,setNowPlayingOpen]=useState(false),[nowPlayingMode,setNowPlayingMode]=useState('artwork'),[lyricsLoading,setLyricsLoading]=useState(false);
  const [user,setUser]=useState(undefined),[page,setPage]=useState(()=>{const id=new URLSearchParams(window.location.search).get('community');return id&&/^[0-9a-f-]{36}$/i.test(id)?{id:'social',idValue:id}:{id:'home'}}),[home,setHome]=useState(null),[loading,setLoading]=useState(false),[detail,setDetail]=useState(null),[starred,setStarred]=useState(new Set());
  const [q,setQ]=useState(''),[results,setResults]=useState(null),[searchTab,setSearchTab]=useState('library'),[remote,setRemote]=useState(null),[remoteBusy,setRemoteBusy]=useState(false),[remoteStatus,setRemoteStatus]=useState(null),[formatFilter,setFormatFilter]=useState('all'),[sortRemote,setSortRemote]=useState('relevance');
  const [invidious,setInvidious]=useState(null),[invidiousBusy,setInvidiousBusy]=useState(false),[invidiousSong,setInvidiousSong]=useState(null),[permitVideo,setPermitVideo]=useState(false),[importWorker,setImportWorker]=useState({importEnabled:false}),[invidiousJobs,setInvidiousJobs]=useState([]);
  const [quality,setQuality]=useState(()=>{try{const v=localStorage.getItem('jobbi-quality');return ['original','balanced','saver'].includes(v)?v:'balanced'}catch{return 'balanced'}});
  const activeAudioTrack=useRef(null);
  const androidApp=isNativeAndroid();
  const [queue,setQueue]=useState([]),[currentIndex,setCurrentIndex]=useState(-1),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[length,setLength]=useState(0),[volume,setVolume]=useState(0.78),[shuffle,setShuffle]=useState(false),[repeat,setRepeat]=useState(false),[panel,setPanel]=useState(null),[lyrics,setLyrics]=useState(null),[error,setError]=useState('');
  const audio=useRef(null);
  const [newPlaylist,setNewPlaylist]=useState(''),[playlistBusy,setPlaylistBusy]=useState(false),[pickerSong,setPickerSong]=useState(null),[downloads,setDownloads]=useState(null),[downloadBusy,setDownloadBusy]=useState(false),[importSong,setImportSong]=useState(null),[importArtist,setImportArtist]=useState(''),[importTitle,setImportTitle]=useState(''),[importBusy,setImportBusy]=useState(false),[importNotice,setImportNotice]=useState('');
  const [musicImports,setMusicImports]=useState([]);
  const [libraryAlbums,setLibraryAlbums]=useState([]),[libraryArtists,setLibraryArtists]=useState([]),[libraryOffset,setLibraryOffset]=useState(0),[libraryMore,setLibraryMore]=useState(true),[libraryLoading,setLibraryLoading]=useState(false);
  const [adminOverview,setAdminOverview]=useState(null),[adminUsers,setAdminUsers]=useState(null),[adminLoading,setAdminLoading]=useState(false),[adminBusy,setAdminBusy]=useState(false);
  const [accountForm,setAccountForm]=useState({username:'',name:'',email:'',password:''}),[adminNotice,setAdminNotice]=useState('');
  const [socialSelf,setSocialSelf]=useState(null),[socialAvatarVersion,setSocialAvatarVersion]=useState(0);
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
  useEffect(()=>{if(user?.username)nativeCommand('syncSession');},[user?.username]);
  useEffect(()=>{
    if(!user)return;
    api('/api/social/home').then(d=>setSocialSelf(d.me)).catch(()=>{});
  },[user?.username,page.id==='social']);
  const updateSocialProfile=()=>{api('/api/social/home').then(d=>{setSocialSelf(d.me);setSocialAvatarVersion(Date.now())}).catch(()=>{});};
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
  useEffect(()=>{if(!audio.current||!currentTrack)return;
    const a=audio.current,src=`/api/stream/${encodeURIComponent(currentTrack.id)}?quality=${quality}`;
    const sameTrack=activeAudioTrack.current===currentTrack.id;
    const pos=sameTrack?a.currentTime:0;
    const shouldPlay=!sameTrack||!a.paused;
    if(a.getAttribute('src')!==src){
      a.src=src;
      if(pos>0&&Number.isFinite(pos))a.addEventListener('loadedmetadata',()=>{try{a.currentTime=pos}catch{}},{once:true});
      a.load();
    }
    if(shouldPlay)a.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));
    activeAudioTrack.current=currentTrack.id;
    if(!sameTrack){setPosition(0);setLength(Number(currentTrack.duration||0));}
  },[currentTrack?.id,quality]);
  useEffect(()=>{
    if(!currentTrack||!nowPlayingOpen||nowPlayingMode!=='lyrics')return;
    let active=true;
    setLyrics(null);setLyricsLoading(true);
    api(`/api/lyrics/${encodeURIComponent(currentTrack.id)}`)
      .then(data=>{if(active)setLyrics(data);})
      .catch(()=>{if(active)setLyrics({available:false,synced:false,lines:[]});})
      .finally(()=>{if(active)setLyricsLoading(false);});
    return()=>{active=false};
  },[currentTrack?.id,nowPlayingOpen,nowPlayingMode]);
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
  const playTracks=(tracks,index=0)=>{const track=tracks?.[index];if(!track)return;const a=audio.current;if(a){const src=`/api/stream/${encodeURIComponent(track.id)}?quality=${quality}`;if(a.getAttribute('src')!==src){a.src=src;a.load();}a.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));}setQueue(tracks);setCurrentIndex(index);};
  const next=()=>{if(!queue.length)return;setCurrentIndex(i=>shuffle?Math.floor(Math.random()*queue.length):repeat?i:(i+1)%queue.length)};
  const prev=()=>{if(!queue.length)return;if(audio.current?.currentTime>3){audio.current.currentTime=0;return;}setCurrentIndex(i=>(i-1+queue.length)%queue.length)};
  const changeQuality=value=>{setQuality(value);try{localStorage.setItem('jobbi-quality',value)}catch{}};
  const saveOffline=track=>nativeCommand('download',{track:{id:track.id,title:track.title||track.name,artist:track.artist,album:track.album,suffix:track.suffix||'mp3'},quality});
  const openNowPlaying=(mode='artwork')=>{if(!currentTrack)return;setNowPlayingMode(mode);setNowPlayingOpen(true);};
  const toggle=()=>{if(!audio.current||!currentTrack)return;if(audio.current.paused)audio.current.play().then(()=>setPlaying(true)).catch(()=>{});else{audio.current.pause();setPlaying(false);}};
  const favorite=async item=>{const shouldStar=!starred.has(item.id);await post('/api/star',{id:item.id,starred:shouldStar});setStarred(old=>{const a=new Set(old);shouldStar?a.add(item.id):a.delete(item.id);return a;});};
  const logout=async()=>{await post('/api/logout',{}).catch(()=>{});audio.current?.pause();setCurrentIndex(-1);setQueue([]);setUser(null);};

  const loadAdmin=async()=>{
    setAdminLoading(true);setError('');
    try{
      const [overview,accounts]=await Promise.all([
        api('/api/admin/overview'),api('/api/admin/accounts')
      ]);
      setAdminOverview(overview);setAdminUsers(accounts);
    }catch(err){setError(err.message)}
    finally{setAdminLoading(false)}
  };
  useEffect(()=>{if(user?.admin&&page.id==='admin')loadAdmin();},[user?.admin,page.id]);
  const createAccount=async e=>{
    e.preventDefault();setAdminBusy(true);setAdminNotice('');setError('');
    try{
      await post('/api/admin/accounts',accountForm);
      setAdminNotice('Listener account created. Share credentials using a secure channel.');
      setAccountForm({username:'',name:'',email:'',password:''});
      await loadAdmin();
    }catch(err){setError(err.message)}finally{setAdminBusy(false)}
  };
  const deleteAccount=async account=>{
    if(account.isAdmin)return;
    if(!window.confirm(`Permanently delete the listener account "${account.username}"? Personal playlists and preferences may be lost.`))return;
    const typed=window.prompt(`To confirm deletion, type: ${account.username}`);
    if(typed!==account.username)return;
    setAdminBusy(true);setAdminNotice('');setError('');
    try{
      await api(`/api/admin/accounts/${encodeURIComponent(account.id)}?confirm=delete`,{method:'DELETE'});
      setAdminNotice('Listener account deleted.');await loadAdmin();
    }catch(err){setError(err.message)}finally{setAdminBusy(false)}
  };
  const humanBytes=value=>{
    const bytes=Number(value);if(!Number.isFinite(bytes)||bytes<0)return 'Unavailable';
    if(bytes===0)return '0 B';
    const units=['B','KB','GB','TB','PB']; // The first non-byte step uses MB.
    const exponent=Math.min(5,Math.floor(Math.log(bytes)/Math.log(1024)));
    return (bytes/1024**exponent).toFixed(exponent===0?0:1)+' '+['B','KB','MB','GB','TB','PB'][exponent];
  };
  const openAlbum = item=>setPage({id:'album',idValue:item.id});
  const openArtistSong=async song=>{
    if(song.artistId)return setPage({id:'artist',idValue:song.artistId});
    if(!song.artist)return;
    try{
      const result=await api('/api/search?q='+encodeURIComponent(song.artist));
      const match=(result.artist||[]).find(a=>a.name?.trim().toLowerCase()===song.artist.trim().toLowerCase());
      if(match?.id)return setPage({id:'artist',idValue:match.id});
    }catch{}
    setQ(song.artist);setSearchTab('library');setPage({id:'search'});
  };
  const openAlbumSong=async song=>{
    if(song.albumId)return setPage({id:'album',idValue:song.albumId});
    if(!song.album)return;
    try{
      const result=await api('/api/search?q='+encodeURIComponent(song.album));
      const match=(result.album||[]).find(a=>a.name?.trim().toLowerCase()===song.album.trim().toLowerCase()&&
        (!song.artist||!a.artist||a.artist.toLowerCase()===song.artist.toLowerCase()));
      if(match?.id)return setPage({id:'album',idValue:match.id});
    }catch{}
    setQ(song.album);setSearchTab('library');setPage({id:'search'});
  };

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
  const refreshMusicImports=async()=>{
    try{
      const result=await api('/api/music-imports');
      setMusicImports(result.items||[]);
    }catch(e){setError(e.message)}
  };
  const refreshInvidiousJobs=async()=>{
    try{
      const result=await api('/api/invidious/jobs');
      setInvidiousJobs(result.jobs||[]);
    }catch{}
  };
  const submitImport=async e=>{
    e.preventDefault();if(!importSong||!importArtist.trim()||!importTitle.trim())return;
    setImportBusy(true);setError('');
    try{
      await post('/api/music-imports',{
        username:importSong.username,filename:importSong.filename,size:Number(importSong.size),
        artist:importArtist.trim(),title:importTitle.trim()
      });
      setImportSong(null);
      setImportNotice('Import queued for your shared NAS library. Your new song will appear after indexing.');
      await refreshMusicImports();
      if(user.admin)await refreshDownloads();
    }catch(e){setError(e.message)}finally{setImportBusy(false)}
  };
  const submitInvidious=async e=>{
    e.preventDefault();if(!invidiousSong||!permitVideo)return;
    setImportBusy(true);setError('');
    try{
      await post('/api/invidious/import',{
        videoId:invidiousSong.videoId,title:invidiousSong.title,artist:invidiousSong.artist,authorized:true
      });
      setImportNotice('Audio import queued from the alternate source. You can track progress below.');
      setInvidiousSong(null);setPermitVideo(false);
      await refreshInvidiousJobs();
    }catch(e){setError(e.message)}finally{setImportBusy(false)}
  };
  const scanLibrary=async()=>{
    setError('');
    try{await post('/api/library/scan',{});setImportNotice('Library scan requested. New songs may take a moment to appear.');}
    catch(e){setError(e.message)}
  };
  useEffect(()=>{
    if(!user?.username||page.id!=='search'||searchTab!=='soulseek')return;
    let active=true;
    api('/api/soulseek/status').then(d=>{if(active)setRemoteStatus(d)})
      .catch(()=>{if(active)setRemoteStatus({configured:false,message:'Soulseek status unavailable'})});
    api('/api/invidious/status').then(d=>{if(active)setImportWorker(d)}).catch(()=>{});
    const update=()=>{
      api('/api/music-imports').then(d=>{if(active)setMusicImports(d.items||[])}).catch(()=>{});
      api('/api/invidious/jobs').then(d=>{if(active)setInvidiousJobs(d.jobs||[])}).catch(()=>{});
      if(user.admin)api('/api/soulseek/downloads').then(d=>{if(active)setDownloads(d)}).catch(()=>{});
    };
    update();
    const timer=setInterval(update,30000);
    return()=>{active=false;clearInterval(timer)};
  },[user?.username,user?.admin,page.id,searchTab]);

  async function remoteSearch(){
    const query=q.trim();if(query.length<2)return;
    setRemoteBusy(true);setInvidiousBusy(true);setRemote(null);setInvidious(null);setError('');
    const soulseek=post('/api/soulseek/search',{query})
      .then(d=>setRemote(d))
      .catch(e=>setRemote({results:[],total:0,peerCount:0,failed:true,
        message:'Soulseek could not complete this search: '+e.message}))
      .finally(()=>setRemoteBusy(false));
    const alternate=api('/api/invidious/search?q='+encodeURIComponent(query))
      .then(d=>setInvidious(d))
      .catch(e=>setInvidious({results:[],available:false,message:'Invidious fallback unavailable: '+e.message}))
      .finally(()=>setInvidiousBusy(false));
    await Promise.allSettled([soulseek,alternate]);
  }
  if(user===undefined)return <div className="loading-page"><div className="brand-symbol"><Waves/></div><span>Loading your music...</span></div>;
  if(!user)return <Login onLogin={setUser}/>;
  let main=null;
  if(page.id==='home')main=<>
    <div className="home-welcome"><div><div className="eyebrow"><Sparkles size={14}/> YOUR PERSONAL SOUNDTRACK</div><h1>{greeting()}<span className="spark-dot">.</span></h1><p>Pick up where the music left off.</p></div><span className="date-label">{new Intl.DateTimeFormat('en',{weekday:'long',month:'long',day:'numeric'}).format(new Date())}</span></div>
    <div className="hero-card"><div className="hero-glow"/><div className="hero-copy"><span className="hero-kicker"><span className="live-indicator"/> MADE FOR YOUR EARS</span><h2>All your music.<br/><em>One beautiful place.</em></h2><p>Rediscover the songs that move you. Your collection, your way.</p><div className="hero-buttons"><button className="primary" onClick={()=>playTracks(home?.songs||[],0)}><Play size={16} fill="currentColor"/> Play something good</button><button className="ghost-button" onClick={()=>setPage({id:'library'})}>Explore library <ArrowRight size={15}/></button><button className="ghost-button" onClick={()=>{setSearchTab('soulseek');setPage({id:'search'})}}><Radio size={15}/> Find new music</button></div></div><div className="hero-art"><div className="hero-record"><div className="record-core">{albums[0]&&<Art item={albums[0]}/>}</div></div></div></div>
    {loading&&!home?<div className="loading-block"><LoaderCircle className="spin"/> Loading albums…</div>:null}
    <AlbumRow items={home?.recent} title="Fresh in your library" tagline="The latest additions to your collection" onClick={openAlbum}/>
    <AlbumRow items={home?.played} title="On repeat" tagline="The music you come back to" onClick={openAlbum}/>
    <AlbumRow items={home?.featured} title="Rediscover something" tagline="A little surprise from your shelves" onClick={openAlbum}/>
    {!loading&&!albums.length?<div className="empty-state"><Disc3 size={36}/><h3>Your library is ready</h3><p>Once Navidrome indexes your music, your albums will show up here.</p></div>:null}
  </>;
  if(page.id==='search')main=<><div className="page-title"><div className="eyebrow">EXPLORE MUSIC</div><h1>Discover<span className="spark-dot">.</span></h1><p>Search your library, Soulseek peers, and your private Invidious fallback.</p></div><div className="search-bar"><Search size={22}/><input className="search-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Songs, artists, albums..." autoFocus/>{q&&<button className="icon-button" onClick={()=>{setQ('');setRemote(null);setInvidious(null)}}><X size={18}/></button>}<span>⌘ K</span></div>
    <div className="segmented"><button className={searchTab==='library'?'selected':''} onClick={()=>setSearchTab('library')}><Library size={16}/> Your library</button><button className={searchTab==='soulseek'?'selected':''} onClick={()=>setSearchTab('soulseek')}><Radio size={16}/> Soulseek · New music <span className="experimental">IMPORT</span></button></div>
    {searchTab==='library'?<>{results?<><AlbumRow items={results.album||[]} title="Albums" onClick={openAlbum}/>{(results.artist||[]).length>0&&<section className="shelf"><div className="shelf-title"><h2>Artists</h2></div><div className="artist-strip">{results.artist.map(a=><button key={a.id} onClick={()=>setPage({id:'artist',idValue:a.id})}><Art item={a} round/><strong>{a.name}</strong></button>)}</div></section>}{(results.song||[]).length>0&&<section className="shelf"><div className="shelf-title"><h2>Songs</h2></div><SongList songs={results.song} onPlay={playTracks} currentTrack={currentTrack} starred={starred} onFavorite={favorite} onAdd={setPickerSong} onSave={androidApp?saveOffline:undefined} onArtist={openArtistSong} onAlbum={openAlbumSong}/></section>}{!results.album?.length&&!results.song?.length&&!results.artist?.length&&<div className="empty-state">No matches in your library.</div>}</>:<div className="search-suggestion"><Search size={35}/><h3>Every great listen starts somewhere.</h3><p>Search your own albums, artists, and tracks.</p><button className="discover-peer-cta" onClick={()=>setSearchTab('soulseek')}><Radio size={18}/> Discover new songs on Soulseek <ArrowRight size={16}/></button></div>}</>:
    <section className="remote-search"><div className="remote-notice"><Radio size={21}/><div><strong>Search beyond your library</strong><p>Search Soulseek and your Invidious instance for music. All signed-in users can import permitted audio to the shared NAS library, subject to fair-use storage and rate limits.</p></div></div>
      <div className="source-indicator"><span className={remoteStatus?.serverConnected?'source-online':'source-unknown'}/><span>{remoteStatus?.mode==='slskd'?remoteStatus.serverConnected?'Soulseek connected':'Soulseek connection needs attention':remoteStatus?.mode==='legacy'?'Legacy search · direct slskd connection recommended':'Checking Soulseek connection…'}</span></div>
      {remoteStatus?.message&&<div className="search-notice">{remoteStatus.message}</div>}
      <div className="search-actions"><button className="primary" disabled={remoteBusy||invidiousBusy||q.trim().length<2} onClick={remoteSearch}>{remoteBusy||invidiousBusy?<LoaderCircle className="spin" size={17}/>:<Search size={17}/>} {remoteBusy?'Searching Soulseek and Invidious…':'Search music sources'}</button><span className="search-helper">Try artist, album, or track names in multiple languages.</span></div>
      {q.trim().toLowerCase()==='kino'&&<div className="search-alternatives">Looking for the rock band? Try <button onClick={()=>setQ('Кино')}>Кино</button> or <button onClick={()=>setQ('Виктор Цой')}>Виктор Цой</button>.</div>}
      {remote&&<div className="remote-results"><div className="remote-head"><div><h2>Music from Soulseek</h2><p>{remote.total??extractRemote(remote).length} available audio results · {remote.peerCount??'Multiple'} peers{remote.elapsedMs?' · '+Math.round(remote.elapsedMs/1000)+'s':''}</p></div><div className="search-filters"><label>Format<select value={formatFilter} onChange={e=>setFormatFilter(e.target.value)}><option value="all">All audio</option><option value="flac">FLAC</option><option value="mp3">MP3</option><option value="m4a">M4A</option><option value="opus">Opus</option><option value="wav">WAV</option></select></label><label>Sort<select value={sortRemote} onChange={e=>setSortRemote(e.target.value)}><option value="relevance">Best match</option><option value="quality">Quality</option><option value="speed">Upload speed</option><option value="size">File size</option></select></label></div></div>
      {remoteItems.length?remoteItems.map((item,i)=><div className="remote-item" key={item.username+'|'+item.filename+'|'+i}><Music2 size={17}/><div><strong>{(item.filename||item.fileName||'Unknown').split(/[\\/]/).pop()}</strong><small>{item.username||item.user||'Peer'} · {item.size?((Number(item.size)/1048576).toFixed(1)+' MB · '):''}{item.format||item.filename?.split('.').pop()?.toUpperCase()}{item.bitrate?' · '+item.bitrate+' kbps':''}{item.freeUploadSlot?' · Free slot':''}</small></div>{item.username&&Number(item.size)>0&&<button className="import-button" onClick={()=>chooseImport(item)} title="Import permitted audio to the NAS library"><Plus size={15}/> Import song</button>}</div>):
      <div className="remote-empty"><Search size={30}/><h3>{extractRemote(remote).length?'No results match these filters':'No Soulseek audio results yet'}</h3><p>{remote.message||'Try a broader search, alternate artist spelling, or check that slskd is connected to the Soulseek network.'}</p><button className="ghost-button" onClick={()=>{setFormatFilter('all');setSortRemote('relevance')}}>Reset filters</button></div>}</div>}
      {importNotice&&<div className="import-notice"><Check size={17}/>{importNotice}</div>}
      <section className="request-section"><div className="shelf-title"><div><h2>My NAS imports</h2><p>Tracks you submitted for the shared Navidrome library. No administrator approval needed.</p></div><button className="ghost-button" onClick={refreshMusicImports}><RefreshCw size={15}/> Refresh</button></div>
        <div className="music-request-list">{musicImports.length?musicImports.map(item=><div className="music-request-row" key={item.id}><div><strong>{item.title}</strong><small>{item.artist} · {item.filename?.split(/[\\/]/).pop()}</small></div><span className={'request-status '+item.status}>{item.status==='queued'?'Queued at NAS':item.status==='processing'?'Importing':'Check NAS transfers'}</span></div>):<p className="request-empty">Nothing imported yet. Choose a Soulseek track and tap Import song.</p>}</div>
      </section>
      {user.admin&&<section className="transfer-section"><div className="shelf-title"><div><h2>Soulseek transfers</h2><p>Active and completed transfers handled by your NAS downloader.</p></div><button className="ghost-button" onClick={refreshDownloads} disabled={downloadBusy}><RefreshCw size={15}/> Refresh</button><button className="ghost-button" onClick={scanLibrary}><RefreshCw size={15}/> Scan library</button></div>
        {downloads&&<div className="remote-results">{extractRemote(downloads).length?extractRemote(downloads).map((item,i)=><div className="remote-item" key={i}><Music2 size={17}/><div><strong>{(item.filename||item.fileName||'Unknown').split(/[\\/]/).pop()}</strong><small>{item.state||item.status||'Transferring'} · {item.percentage||0}%</small></div></div>):<p className="request-empty">No active Soulseek transfers.</p>}</div>}
      </section>}
      {invidiousJobs.length>0&&<section className="request-section"><div className="shelf-title"><div><h2>Alternate-source imports</h2><p>Local audio jobs from your optional Invidious import worker.</p></div><button className="ghost-button" onClick={refreshInvidiousJobs}><RefreshCw size={15}/> Refresh</button></div>
        <div className="music-request-list">{invidiousJobs.map(job=><div className="music-request-row" key={job.id}><div><strong>{job.title||job.videoId}</strong><small>{job.artist}</small></div><span className={'request-status '+job.status}>{job.status==='completed'?'Saved':job.status==='failed'?'Failed':job.status==='running'?'Importing':job.status}</span></div>)}</div>
      </section>}
    </section>}
  </>;
  if(page.id==='library')main=<><div className="page-title"><div className="eyebrow">COLLECTION</div><h1>Your library<span className="spark-dot">.</span></h1><p>A home for every sound you love.</p></div><form className="playlist-create" onSubmit={createPlaylist}><label htmlFor="new-playlist">Create a playlist</label><input id="new-playlist" maxLength="100" value={newPlaylist} onChange={e=>setNewPlaylist(e.target.value)} placeholder="Give your playlist a name"/><button className="primary" disabled={playlistBusy||!newPlaylist.trim()} type="submit"><Plus size={16}/> Create</button></form><div className="library-shortcuts"><button onClick={()=>setPage({id:'favorites'})}><span className="shortcut-icon red"><Heart size={25} fill="currentColor"/></span><strong>Favorites</strong><ArrowRight size={17}/></button><button onClick={()=>{setSearchTab('soulseek');setPage({id:'search'})}}><span className="shortcut-icon purple"><Radio size={25}/></span><strong>Find new music</strong><ArrowRight size={17}/></button></div><AlbumRow items={libraryAlbums} title="All albums" tagline="Browse your complete music collection" onClick={openAlbum}/>{libraryLoading&&<div className="loading-block"><LoaderCircle className="spin" size={17}/> Loading library…</div>}{libraryMore&&!libraryLoading&&<button className="ghost-button load-more" onClick={loadMoreAlbums}>Load more albums <ArrowDownToLine size={16}/></button>}{libraryArtists.length>0&&<section className="shelf"><div className="shelf-title"><div><h2>Artists</h2><p>Explore your favorite musicians</p></div></div><div className="artist-strip">{libraryArtists.slice(0,80).map(a=><button key={a.id} onClick={()=>setPage({id:'artist',idValue:a.id})}><Art item={a} round/><strong>{a.name}</strong></button>)}</div></section>}{(home?.playlists||[]).length>0&&<section className="shelf"><div className="shelf-title"><h2>Your playlists</h2></div><div className="playlist-grid">{home.playlists.map(p=><button onClick={()=>setPage({id:'playlist',idValue:p.id})} key={p.id}><div className="playlist-graphic"><ListMusic size={31}/></div><strong>{p.name}</strong><span>{p.songCount||0} songs</span></button>)}</div></section>}</>;
  if(page.id==='social')main=<SocialSpace api={api} user={user} playTracks={playTracks} onSave={androidApp?saveOffline:undefined} nativePlaylists={home?.playlists||[]} initialPlaylistId={page.idValue} onProfileUpdate={updateSocialProfile} onDiscoverMusic={()=>{setSearchTab('soulseek');setPage({id:'search'})}}/>;
  if(page.id==='settings')main=<section className="admin-page"><div className="page-title"><div className="eyebrow">MY ACCOUNT</div><h1>Settings<span className="spark-dot">.</span></h1><p>Your personal listening preferences.</p></div><div className="admin-card"><h2>Signed in as {user.username}</h2><p>Role: {user.admin?'Administrator':'Listener'}. Your playlists, favorites and playback history are managed by Navidrome.</p><div className="settings-row"><label htmlFor="personal-quality">Streaming quality</label><select id="personal-quality" value={quality} onChange={e=>changeQuality(e.target.value)}><option value="original">Original / lossless where supported</option><option value="balanced">High quality · 320 kbps</option><option value="saver">Data saver · 128 kbps</option></select></div><button className="ghost-button" onClick={logout}>Sign out</button></div></section>;
  if(page.id==='admin'&&user.admin)main=<section className="admin-page"><div className="page-title"><div className="eyebrow">PRIVATE SERVER OPERATIONS</div><h1>Admin console<span className="spark-dot">.</span></h1><p>Manage your music service, storage and access.</p></div>
    <div className="admin-head"><span className="admin-verified"><Check size={16}/> Verified Navidrome administrator</span><button className="ghost-button" onClick={loadAdmin} disabled={adminLoading}><RefreshCw size={16}/> Refresh dashboard</button></div>
    {adminLoading&&!adminOverview&&<div className="loading-block"><LoaderCircle className="spin"/> Loading server overview…</div>}
    {adminOverview&&<div className="admin-grid">
      <div className="admin-card"><div className="admin-card-head"><HardDrive size={22}/><h2>NAS storage</h2></div>
        {adminOverview.storage?.status==='ready'?<><div className="storage-figure">{humanBytes(adminOverview.storage.musicBytes)}<small>Music files</small></div>
        <div className="storage-track"><div style={{width:Math.min(100,100*Number(adminOverview.storage.usedBytes||0)/Math.max(1,Number(adminOverview.storage.totalBytes||1)))+'%'}}/></div>
        <div className="storage-stats"><span>Volume used <b>{humanBytes(adminOverview.storage.usedBytes)}</b></span><span>Available <b>{humanBytes(adminOverview.storage.freeBytes)}</b></span><span>Capacity <b>{humanBytes(adminOverview.storage.totalBytes)}</b></span><span>Audio tracks <b>{Number(adminOverview.storage.files||0).toLocaleString()}</b></span><span>Library folder total <b>{humanBytes(adminOverview.storage.libraryBytes)}</b></span></div>
        <p className="admin-help">Library scanning checked at {new Date(adminOverview.storage.checkedAt).toLocaleString()}. Used capacity includes other NAS data, not only music.</p>
        </>:<p className="admin-help">Storage statistics unavailable. Check the isolated storage-agent container and its read-only library mount.</p>}
      </div>
      <div className="admin-card"><div className="admin-card-head"><Library size={22}/><h2>Service access</h2></div>
        <div className="stat-figure">{adminOverview.usersCount??'—'} <small>Navidrome accounts</small></div>
        <div className="admin-stat"><span>Direct Soulseek configured</span><b>{adminOverview.directSearchConfigured?'Yes':'No'}</b></div>
        <div className="admin-stat"><span>HTTPS-only cookies</span><b>{adminOverview.httpsOnlyCookies?'Enabled':'Disabled (private preview)'}</b></div>
        <div className="admin-stat"><span>Account provisioning</span><b>{adminOverview.accountManagementEnabled?'Enabled':'Needs verification'}</b></div>
        {!adminOverview.httpsOnlyCookies&&<p className="admin-help">For a public production domain, use Cloudflare HTTPS and set PUBLIC_HTTPS=true.</p>}
      </div>
    </div>}
    <div className="admin-card admin-users"><div className="admin-card-head"><Settings2 size={22}/><div><h2>Accounts & permissions</h2><p>Administrator access is verified against Navidrome and the local allowlist.</p></div></div>
      {adminNotice&&<div className="import-notice"><Check size={16}/>{adminNotice}</div>}
      {adminUsers?.message&&<div className="search-notice">{adminUsers.message}</div>}
      <div className="user-table">{(adminUsers?.users||[]).map(person=><div className="user-row" key={person.id}><div className="user-avatar">{(person.username||'?').slice(0,1).toUpperCase()}</div><div><strong>{person.name||person.username}</strong><small>@{person.username}</small></div><span className={person.isAdmin?'admin-role':'listener-role'}>{person.isAdmin?'Administrator':'Listener'}</span>{!adminUsers.readOnly&&!person.isAdmin&&<button className="user-delete" disabled={adminBusy} onClick={()=>deleteAccount(person)}>Delete</button>}</div>)}</div>
      {!adminOverview?.accountManagementEnabled?<p className="admin-help">Account changes are disabled until the server's native API is verified. Existing accounts can still sign in normally.</p>:
      <form className="account-form" onSubmit={createAccount}><h3>Create listener account</h3><div className="account-fields"><label>Username<input required minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]+" value={accountForm.username} autoComplete="off" onChange={e=>setAccountForm(p=>({...p,username:e.target.value}))}/></label><label>Display name<input maxLength={80} value={accountForm.name} onChange={e=>setAccountForm(p=>({...p,name:e.target.value}))}/></label><label>Email (optional)<input type="email" maxLength={200} value={accountForm.email} onChange={e=>setAccountForm(p=>({...p,email:e.target.value}))}/></label><label>Temporary password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={accountForm.password} onChange={e=>setAccountForm(p=>({...p,password:e.target.value}))}/></label></div><button type="submit" className="primary" disabled={adminBusy||adminUsers?.readOnly}><Plus size={16}/> Create listener</button><p>New accounts are listeners by default. There is no public sign-up or privilege escalation from this form.</p></form>}
    </div>
  </section>;
  if(page.id==='favorites')main=<><div className="page-title"><div className="eyebrow">SAVED FOR LATER</div><h1>Favorites<span className="spark-dot">.</span></h1><p>Only the good stuff.</p></div><AlbumRow items={(home?.recent||[]).filter(x=>starred.has(x.id))} title="Loved albums" onClick={openAlbum}/><Favorites starred={starred} currentTrack={currentTrack} playTracks={playTracks} favorite={favorite} openAlbum={openAlbum} onAdd={setPickerSong} onSave={androidApp?saveOffline:undefined} onArtist={openArtistSong} onAlbum={openAlbumSong}/></>;
  if(['album','artist','playlist'].includes(page.id))main=detail?<><button className="back-link" onClick={()=>setPage({id:'library'})}><ArrowLeft size={18}/> Back to library</button><div className="detail-hero"><Art item={detail} size="big" round={page.id==='artist'}/><div className="detail-info"><span className="eyebrow">{page.id.toUpperCase()}</span><h1>{detail.name||detail.title||'Untitled'}</h1><p>{page.id==='artist'?`${detail.albumCount||0} albums`:(detail.artist||'Your collection')} · {detail.songCount||detail.song?.length||detail.entry?.length||0} tracks</p><button className="primary" onClick={()=>{const tracks=detail.song||detail.entry||[];if(tracks.length)playTracks(tracks);else if(detail.album?.length)openAlbum(detail.album[0])}}><Play size={18} fill="currentColor"/> Play {page.id==='artist'?'music':'album'}</button>{page.id==='playlist'&&<div className="playlist-edit"><button className="ghost-button" onClick={()=>renamePlaylist(page.idValue)}>Rename</button><button className="ghost-button" onClick={()=>deletePlaylist(page.idValue)}>Delete playlist</button></div>}</div></div>{detail.album?.length?<AlbumRow items={detail.album} title="Albums" onClick={openAlbum}/>:null}{(detail.song||detail.entry||[]).length>0?<section className="shelf"><div className="shelf-title"><h2>Tracks</h2></div><SongList songs={detail.song||detail.entry} onPlay={playTracks} currentTrack={currentTrack} starred={starred} onFavorite={favorite} onAdd={setPickerSong} onSave={androidApp?saveOffline:undefined} onArtist={openArtistSong} onAlbum={openAlbumSong} onRemove={page.id==='playlist'?i=>removeFromPlaylist(page.idValue,i):undefined}/></section>:null}</>:<div className="loading-block"><LoaderCircle className="spin"/> Loading music…</div>;
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} user={user} logout={logout} playlists={home?.playlists}/><div className="main-column"><header className="topbar"><div className="topbar-left"><button className="icon-button" onClick={()=>setPage({id:'home'})} title="Home"><Home size={18}/></button><button className="topbar-search" onClick={()=>setPage({id:'search'})}><Search size={17}/><span>Search your music</span><kbd>⌘ K</kbd></button></div><div className="topbar-right"><span className="server-dot"/> <span className="connected">Your private library</span>{androidApp&&<button className="native-offline-link" title="Open downloaded music" onClick={()=>nativeCommand("openOffline")}><ArrowDownToLine size={15}/> Offline</button>}<label className="quality-control" title="Playback quality"><SlidersHorizontal size={14}/><select aria-label="Playback quality" value={quality} onChange={e=>changeQuality(e.target.value)}><option value="original">Original · Lossless</option><option value="balanced">High · 320 kbps</option><option value="saver">Data Saver · 128 kbps</option></select></label><button className="header-avatar" title="Open community profile" onClick={()=>setPage({id:'social'})}>{socialSelf?.has_avatar?<img className="header-profile-photo" src={`/api/social/profiles/${encodeURIComponent(user.username.toLowerCase())}/avatar?v=${socialAvatarVersion}`} alt="My profile"/>:user.username.slice(0,1).toUpperCase()}</button></div></header><main className="content">{error&&<div className="inline-error"><span>{error}</span><button onClick={()=>setError('')}><X size={17}/></button></div>}{main}<footer className="page-footer">JOBBI MUSIC <span>·</span> YOUR LIBRARY, REIMAGINED.</footer></main></div>
    <audio ref={audio} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)} onLoadedMetadata={e=>setLength(e.currentTarget.duration)} onEnded={()=>{if(currentTrack)post('/api/scrobble',{id:currentTrack.id}).catch(()=>{});if(repeat&&audio.current){audio.current.currentTime=0;audio.current.play().catch(()=>{});}else{next()}}} onError={e=>{setPlaying(false);if(e.currentTarget.error && currentTrack)setError('Playback failed. Check the track format or connection, then try again.')}}/>
    <div className={`player ${currentTrack?'player-active':''}`}><div className="player-song"><button className="player-open" aria-label={currentTrack?'Open now playing for '+currentTrack.title:'Nothing playing'} onClick={()=>openNowPlaying()} disabled={!currentTrack}><Art item={currentTrack} size="small"/><div className="player-song-text"><strong>{currentTrack?.title||'Nothing playing yet'}</strong><span>{currentTrack?.artist||'Your soundtrack starts here'}</span></div></button>{currentTrack&&androidApp&&<button className="icon-button" title="Download this song to Android" onClick={()=>saveOffline(currentTrack)}><ArrowDownToLine size={18}/></button>}{currentTrack&&<button className={`icon-button ${starred.has(currentTrack.id)||currentTrack.starred?'hearted':''}`} onClick={()=>favorite(currentTrack).catch(e=>setError(e.message))} title="Favorite"><Heart size={18} fill={starred.has(currentTrack.id)||currentTrack.starred?'currentColor':'none'}/></button>}</div>
    <div className="player-center"><div className="playback-controls"><button className={`icon-button ${shuffle?'control-on':''}`} onClick={()=>setShuffle(v=>!v)} title="Shuffle"><Shuffle size={16}/></button><button className="icon-button" onClick={prev} disabled={!currentTrack}><SkipBack size={19} fill="currentColor"/></button><button className="play-round" onClick={toggle} disabled={!currentTrack}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button><button className="icon-button" onClick={next} disabled={!currentTrack}><SkipForward size={19} fill="currentColor"/></button><button className={`icon-button ${repeat?'control-on':''}`} onClick={()=>setRepeat(v=>!v)} title="Repeat"><Repeat2 size={16}/></button></div><div className="seek"><small>{duration(position)}</small><input type="range" min="0" max={Math.max(length,1)} value={Math.min(position,length||0)} onChange={e=>{if(audio.current){audio.current.currentTime=Number(e.target.value);setPosition(Number(e.target.value))}}} disabled={!currentTrack}/><small>{duration(length)}</small></div></div>
    <div className="player-extras"><button className={`icon-button ${panel==='lyrics'?'control-on':''}`} title="Lyrics" onClick={()=>openNowPlaying('lyrics')} disabled={!currentTrack}><Mic2 size={18}/></button><button className={`icon-button ${panel==='queue'?'control-on':''}`} title="Queue" onClick={()=>setPanel(panel==='queue'?null:'queue')}><ListMusic size={19}/></button><Volume2 size={18}/><input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))} aria-label="Volume"/></div></div>
    {nowPlayingOpen&&currentTrack&&<NowPlaying
      track={currentTrack} queue={queue} currentIndex={currentIndex}
      playing={playing} position={position} length={length} mode={nowPlayingMode}
      setMode={setNowPlayingMode} lyrics={lyrics} lyricsLoading={lyricsLoading}
      onClose={()=>setNowPlayingOpen(false)} onToggle={toggle} onNext={next} onPrev={prev}
      onSeek={seconds=>{if(audio.current){audio.current.currentTime=seconds;setPosition(seconds)}}}
      onSelect={setCurrentIndex}
      favorited={starred.has(currentTrack.id)||currentTrack.starred}
      onFavorite={()=>favorite(currentTrack).catch(e=>setError(e.message))}
      onAdd={()=>{setPickerSong(currentTrack);setNowPlayingOpen(false)}}
      onDownload={androidApp?()=>saveOffline(currentTrack):null}
      onArtist={()=>{setNowPlayingOpen(false);openArtistSong(currentTrack)}}
      onAlbum={()=>{setNowPlayingOpen(false);openAlbumSong(currentTrack)}}
      onShare={()=>{const details=`${currentTrack.artist||'Unknown artist'} — ${currentTrack.title||'Unknown track'} · Jobbi Music`;navigator.clipboard?.writeText(details).catch(()=>{});}}
      shuffle={shuffle} repeat={repeat} onShuffle={()=>setShuffle(v=>!v)}
      onRepeat={()=>setRepeat(v=>!v)}/>}
    <nav className="mobile-nav" aria-label="Main navigation">{navs.map(n=><button key={n.id} type="button" aria-label={n.label} className={page.id===n.id?'selected':''} onClick={()=>{setPage({id:n.id});setMobileMore(false)}}><n.icon size={21} strokeWidth={2}/><span>{n.id==='home'?'Home':n.id==='library'?'Library':n.id==='social'?'Friends':n.label}</span></button>)}<button type="button" aria-label="More options" aria-expanded={mobileMore} className={mobileMore||['favorites','settings','admin'].includes(page.id)?'selected':''} onClick={()=>setMobileMore(v=>!v)}><MoreHorizontal size={22}/><span>More</span></button></nav>
    {mobileMore&&<div className="mobile-more-backdrop" onClick={()=>setMobileMore(false)}><div className="mobile-more-sheet" role="dialog" aria-label="More navigation" onClick={e=>e.stopPropagation()}><div className="mobile-more-heading"><strong>More in Jobbi Music</strong><button aria-label="Close menu" onClick={()=>setMobileMore(false)}><X size={20}/></button></div><button onClick={()=>{setPage({id:'favorites'});setMobileMore(false)}}><Heart size={19}/> Favorites</button><button onClick={()=>{setPage({id:'settings'});setMobileMore(false)}}><SlidersHorizontal size={19}/> Settings</button>{user.admin&&<button onClick={()=>{setPage({id:'admin'});setMobileMore(false)}}><Settings2 size={19}/> Admin console</button>}{androidApp&&<button onClick={()=>{nativeCommand('openOffline');setMobileMore(false)}}><ArrowDownToLine size={19}/> Downloads & offline</button>}</div></div>}
    {importSong&&<div className="panel-backdrop" onClick={()=>setImportSong(null)}><aside className="side-panel" onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">IMPORT AUDIO</span><h2>Import song to NAS</h2></div><button className="icon-button" onClick={()=>setImportSong(null)}><X size={22}/></button></header><form onSubmit={submitImport} className="import-form"><p className="import-filename">{importSong.filename?.split(/[\\/]/).pop()}</p><p>Source: {importSong.username||'Unknown peer'} · {(Number(importSong.size)/1048576).toFixed(1)} MB</p><label>Artist<input value={importArtist} maxLength="180" onChange={e=>setImportArtist(e.target.value)} required placeholder="Artist name"/></label><label>Track title<input value={importTitle} maxLength="180" onChange={e=>setImportTitle(e.target.value)} required placeholder="Song title"/></label><p className="import-disclaimer">Import only audio that you have permission to save. A shared NAS import budget protects remaining disk space. All users import directly, with no approval queue.</p><button type="submit" className="primary wide" disabled={importBusy||!importArtist.trim()||!importTitle.trim()}>{importBusy?<LoaderCircle className="spin" size={16}/>:<ArrowDownToLine size={16}/>} Queue import</button></form></aside></div>}
    {pickerSong&&<div className="panel-backdrop" onClick={()=>setPickerSong(null)}><aside className="side-panel" onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">YOUR PLAYLISTS</span><h2>Add to playlist</h2></div><button className="icon-button" onClick={()=>setPickerSong(null)}><X size={22}/></button></header><p>{pickerSong.title} · {pickerSong.artist}</p><div className="queue-content">{(home?.playlists||[]).map(p=><button className="queue-item" key={p.id} disabled={playlistBusy} onClick={()=>addToPlaylist(p.id)}><ListMusic size={19}/><div><strong>{p.name}</strong><small>{p.songCount||0} songs</small></div><Plus size={19}/></button>)}{!(home?.playlists||[]).length&&<p>Make your first playlist under Your Library.</p>}</div></aside></div>}
    {panel&&<div className="panel-backdrop" onClick={()=>setPanel(null)}><aside className="side-panel" onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">NOW PLAYING</span><h2>{panel==='queue'?'Up next':'Lyrics'}</h2></div><button className="icon-button" onClick={()=>setPanel(null)}><X size={22}/></button></header>{panel==='queue'?<div className="queue-content">{queue.map((s,i)=><button className={`queue-item ${i===currentIndex?'selected':''}`} key={i} onClick={()=>setCurrentIndex(i)}><Art item={s} size="tiny"/><div><strong>{s.title}</strong><small>{s.artist}</small></div>{i===currentIndex&&<Waves size={18}/>}</button>)}</div>:<div className="lyrics-content"><Art item={currentTrack} size="big"/><h3>{currentTrack?.title}</h3><p>{currentTrack?.artist}</p>{(lyrics?.structuredLyrics||[]).length?<div className="lyrics-lines">{lyrics.structuredLyrics.flatMap((o,i)=>(o.line||[]).map((l,j)=><p key={`${i}-${j}`}>{l.value||'♪'}</p>))}</div>:<div className="lyrics-empty"><Mic2 size={24}/><p>No synced lyrics found for this track.</p><small>Your existing LRCLIB downloader may be able to add them.</small></div>}</div>}</aside></div>}
  </div>;
}
function Favorites({currentTrack,playTracks,favorite,openAlbum,starred,onAdd,onSave,onArtist,onAlbum}){
  const [data,setData]=useState(null);const[err,setErr]=useState('');useEffect(()=>{api('/api/starred').then(setData).catch(e=>setErr(e.message))},[starred]);
  return <>{err&&<p>{err}</p>}<AlbumRow items={data?.album||[]} title="Favorite albums" onClick={openAlbum}/><section className="shelf"><div className="shelf-title"><h2>Favorite songs</h2></div>{data?.song?.length?<SongList songs={data.song} currentTrack={currentTrack} onPlay={playTracks} onFavorite={favorite} starred={starred} onAdd={onAdd} onSave={onSave} onArtist={onArtist} onAlbum={onAlbum}/>:<div className="empty-state"><Heart size={28}/><p>Tap a heart on any song to save it here.</p></div>}</section></>;
}
createRoot(document.getElementById('root')).render(<App/>);
