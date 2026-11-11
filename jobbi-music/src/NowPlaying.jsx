import React,{useEffect,useRef,useMemo,useState} from 'react';
import {cappedPosition,progressPercent} from './player-math.js';
import {ArrowDown,ArrowDownToLine,ArrowUp,ChevronDown,Clock3,Disc3,Heart,ListMusic,Maximize2,Mic2,MoreHorizontal,Pause,Play,Plus,Repeat2,Share2,Shuffle,SkipBack,SkipForward,Volume2,Waves,X,Check} from 'lucide-react';
const duration = s => {
  const x=Math.max(0,Math.floor(Number(s)||0));return `${Math.floor(x/60)}:${String(x%60).padStart(2,'0')}`;
};
const artUrl=t=>t?.coverArt||t?.id?`/api/cover/${encodeURIComponent(t.coverArt||t.id)}`:'';
const activeLineAt=(lines,sec)=>{
  if(!lines?.length)return -1;
  let index=-1;
  for(let i=0;i<lines.length;i++){if(lines[i].at===null)continue;if(lines[i].at>sec*1000)break;index=i;}
  return index;
};

export default function NowPlaying({
  track,queue=[],currentIndex=0,playing,position=0,length=0,
  lyrics,lyricsLoading=false,mode,setMode,onClose,onToggle,onNext,onPrev,
  onSeek,onSelect,onMove,onRemove,onClear,onPlayNext,onAddToQueue,
  sleepMinutes=0,onSleepTimer,onFavorite,favorited,onAdd,onDownload,
  shuffle,repeat,onShuffle,onRepeat,onShare,onArtist,onAlbum
}){
  const lines=lyrics?.lines||[];
  const lineIndex=useMemo(()=>activeLineAt(lines,position),[lines,position]);
  const lyricRefs=useRef([]);
  const dialog=useRef(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const artwork=artUrl(track);
  useEffect(()=>{if(!dialog.current)return;const prev=document.activeElement;dialog.current.focus({preventScroll:true});return()=>prev?.focus?.({preventScroll:true})},[]);
  useEffect(()=>{
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const escape=e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};
    window.addEventListener('keydown',escape);
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',escape)};
  },[onClose]);
  useEffect(()=>{
    if(mode!=='lyrics'||lineIndex<0)return;
    lyricRefs.current[lineIndex]?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  },[lineIndex,mode,track?.id]);
  if(!track)return null;
  return <div className="immersive-player" role="dialog" aria-modal="true" aria-label="Now playing" tabIndex={-1} ref={dialog}>
    <div className="immersive-backdrop" style={artwork?{backgroundImage:`linear-gradient(160deg,rgba(21,15,27,.6),rgba(14,13,20,.93)),url("${artwork}")`}:{}}/>
    <div className="immersive-shell">
      <header className="immersive-top">
        <button className="immersive-top-button" aria-label="Close now playing" onClick={onClose}><ChevronDown size={25}/></button>
        <div className="immersive-heading"><span>NOW PLAYING</span><button className="immersive-album-link" onClick={onAlbum} title="See album songs">{track.album||'Jobbi Music'}</button></div>
        <button className="immersive-top-button" aria-label="Track options" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}><MoreHorizontal size={25}/></button>
      </header>
      {menuOpen&&<div className="immersive-actions-menu">
        <button onClick={()=>{onFavorite();setMenuOpen(false)}}><Heart size={18}/> {favorited?'Remove favorite':'Add to favorites'}</button>
        <button onClick={()=>{onAdd();setMenuOpen(false)}}><Plus size={18}/> Add to playlist</button>
        <button onClick={()=>{onPlayNext?.(track);setMenuOpen(false)}}><ListMusic size={18}/> Play next</button>
        <button onClick={()=>{onAddToQueue?.(track);setMenuOpen(false)}}><ListMusic size={18}/> Add to queue</button>
        <div className="immersive-sleep-options"><label htmlFor="immersive-sleep-timer"><Clock3 size={17}/> Sleep timer</label>
          <select id="immersive-sleep-timer" value={sleepMinutes} onChange={event=>onSleepTimer?.(Number(event.target.value))}>
            <option value={0}>Off</option><option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option><option value={45}>45 minutes</option>
            <option value={60}>1 hour</option>
          </select>
        </div>
        {onDownload&&<button onClick={()=>{onDownload();setMenuOpen(false)}}><ArrowDownToLine size={18}/> Save offline</button>}
        <button onClick={()=>{onShare();setMenuOpen(false)}}><Share2 size={18}/> Copy track details</button>
      </div>}
      <div className="immersive-grid">
        <section className="immersive-art-area">
          <div className={`immersive-art ${playing?'is-playing':''}`}>
            {artwork?<img src={artwork} alt={`${track.album||track.title} cover art`}/>:<div className="immersive-art-fallback"><Disc3 size={110}/></div>}
            <div className="immersive-art-glow"/>
          </div>
          <div className="immersive-track-head">
            <div className="immersive-title"><h2 title={track.title}>{track.title||'Unknown track'}</h2><button className="immersive-artist-link" title="More songs by this artist" onClick={onArtist}>{track.artist||'Unknown artist'}</button></div>
            <button className={`immersive-like ${favorited?'hearted':''}`} aria-label={favorited?'Remove favorite':'Add favorite'} onClick={onFavorite}><Heart size={24} fill={favorited?'currentColor':'none'}/></button>
          </div>
          <div className="immersive-seek"><input aria-label="Seek in song" type="range" min="0" max={Math.max(length,1)} step=".1" value={cappedPosition(position,length)} style={{'--seek-progress':progressPercent(position,length)+'%'}} disabled={!length} onChange={e=>onSeek(Number(e.target.value))}/><div><span>{duration(position)}</span><span>-{duration(Math.max(0,length-position))}</span></div></div>
          <div className="immersive-controls">
            <button className={shuffle?'active':''} onClick={onShuffle} title="Shuffle" aria-label="Shuffle"><Shuffle size={19}/></button>
            <button onClick={onPrev} title="Previous" aria-label="Previous song"><SkipBack size={31} fill="currentColor"/></button>
            <button className="immersive-main-play" onClick={onToggle} title={playing?'Pause':'Play'} aria-label={playing?'Pause':'Play'}>{playing?<Pause size={31} fill="currentColor"/>:<Play size={31} fill="currentColor"/>}</button>
            <button onClick={onNext} title="Next" aria-label="Next song"><SkipForward size={31} fill="currentColor"/></button>
            <button className={repeat?'active':''} onClick={onRepeat} title="Repeat" aria-label="Repeat"><Repeat2 size={20}/></button>
          </div>
          <div className="immersive-bottom-actions">
            <button onClick={()=>setMode('lyrics')} className={mode==='lyrics'?'selected':''} aria-label="Show lyrics"><Mic2 size={21}/><span>Lyrics</span></button>
            <button onClick={()=>setMode('artwork')} className={mode==='artwork'?'selected':''} aria-label="Show artwork"><Disc3 size={21}/><span>Artwork</span></button>
            <button onClick={()=>setMode('queue')} className={mode==='queue'?'selected':''} aria-label="Show queue"><ListMusic size={21}/><span>Queue</span></button>
          </div>
        </section>
        <section className={`immersive-detail ${mode==='artwork'?'immersive-detail-artwork':''}`}>
          {mode==='lyrics'?<div className="immersive-lyrics">
            <div className="immersive-detail-label"><Mic2 size={17}/> LYRICS <span>{lyrics?.synced?'LIVE SYNC':'SCROLL TO READ'}</span></div>
            {lyricsLoading?<div className="immersive-lyrics-empty">Finding lyrics for this song…</div>:
              lyrics?.available?<div className={`immersive-lyrics-scroll ${lyrics.synced?'sync':''}`} aria-label="Song lyrics">
                {lines.map((line,i)=><button key={i} ref={el=>lyricRefs.current[i]=el}
                  className={`immersive-lyric-line ${lyrics.synced&&i===lineIndex?'active':''} ${lyrics.synced&&i<lineIndex?'past':''}`}
                  onClick={()=>line.at!==null&&onSeek(line.at/1000)} title={line.at!==null?'Jump to this line':undefined}>{line.text||'♪'}</button>)}
                <div className="immersive-lyrics-end">♪</div>
              </div>:
              <div className="immersive-lyrics-empty"><Mic2 size={40}/><h3>No lyrics available yet</h3><p>Navidrome can read embedded lyrics and matching .lrc files beside music tracks. If lyrics aren't indexed yet, refresh the library after adding them.</p></div>}
            <div className="immersive-lyrics-foot">Lyrics supplied by your private Navidrome library</div>
          </div>:mode==='queue'?<div className="immersive-queue">
            <div className="immersive-detail-label"><ListMusic size={17}/> UP NEXT <span>{Math.max(0,queue.length-currentIndex-1)} UPCOMING</span></div>
            <div className="immersive-queue-toolbar"><span>{queue.length} tracks · songs added manually play in order</span>
              <button type="button" onClick={onClear} disabled={currentIndex>=queue.length-1}>Clear upcoming</button>
            </div>
            <div className="immersive-queue-items">{queue.map((item,i)=><div key={item.id+'-'+i}
              className={'immersive-queue-row '+(i===currentIndex?'current':'')}>
              <button type="button" className="immersive-queue-track" onClick={()=>onSelect(i)}
                aria-label={'Play '+item.title+' from queue'}>
                {artUrl(item)?<img src={artUrl(item)} alt=""/>:<Disc3 size={27}/>}
                <span><strong>{item.title||'Unknown'}</strong><small>{item.artist||'Unknown artist'}</small></span>
                {i===currentIndex&&<Waves size={17}/>}
              </button>
              {i>currentIndex&&<div className="immersive-queue-controls">
                <button type="button" aria-label={'Move '+item.title+' up'} disabled={i===currentIndex+1}
                  onClick={()=>onMove?.(i,i-1)}><ArrowUp size={17}/></button>
                <button type="button" aria-label={'Move '+item.title+' down'} disabled={i===queue.length-1}
                  onClick={()=>onMove?.(i,i+1)}><ArrowDown size={17}/></button>
                <button type="button" aria-label={'Remove '+item.title+' from queue'}
                  onClick={()=>onRemove?.(i)}><X size={16}/></button>
              </div>}
            </div>)}</div>
          </div>:<div className="immersive-art-caption"><Waves size={46}/><h3>Every note, your way.</h3><p>Beautiful music, from your personal collection.</p></div>}
        </section>
      </div>
    </div>
  </div>;
}