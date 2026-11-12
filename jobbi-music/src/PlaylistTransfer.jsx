import React,{useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,CheckCircle2,FileUp,Heart,LoaderCircle,Search,ShieldCheck,Music2,Pause,RefreshCw,Download,Check,AlertTriangle} from 'lucide-react';
import {parseCollectionManifest,findLocalSong,pickSoulseekCandidate,pickInvidiousCandidate,songKey} from './playlist-export.js';

const SCAN_LIMIT=3;
const REPORT_LIMIT=16000;
const sameSong=row=>songKey(row.artist)+'|'+songKey(row.title);
const jsonOptions=(method,body)=>({method,body:JSON.stringify(body)});
const stageTotals=collection=>{
  const out={total:collection.tracks.length,added:0,hearted:0,matched:0,queued:0,
    waiting:0,review:0,failed:0,unsearched:0};
  for(const song of collection.tracks){
    const status=song.status||'unsearched';
    if(Object.prototype.hasOwnProperty.call(out,status))out[status]++;
    else out.review++;
  }
  return out;
};
function DownloadReport({collections}){
  const save=()=>{
    const data=JSON.stringify({format:'jobbi-migration-report/v1',
      generatedAt:new Date().toISOString(),collections},null,2);
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    const a=document.createElement('a');a.download='jobbi-import-progress.json';
    a.href=url;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  };
  return <button className="playlist-tool-button" type="button" onClick={save}>
    <Download size={16}/> Export detailed report
  </button>;
}
/**
 * Client-side, resumable personal library migration. All account passwords
 * stay with Spotify / Apple Music. Imported metadata is stored in this
 * browser only, namespaced to the signed-in Navidrome account.
 * Queueing uses the existing quota-checked server endpoint.
 */
export default function PlaylistTransfer({api,onLibrary,user}){
  const storageKey='jobbi-collection-migrate/v2/'+String(user||'signed-in').toLowerCase();
  const [collections,setCollections]=useState([]);
  const [selected,setSelected]=useState('');
  const [working,setWorking]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [showAll,setShowAll]=useState(false);
  const stateRef=useRef([]);
  const activeRef=useRef(false);
  const stopRef=useRef(false);
  const queryCache=useRef(new Map());
  const matchCache=useRef(new Map());

  useEffect(()=>{
    let restored=[];
    try{
      const value=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(value?.format==='jobbi-migration-state/v2'&&Array.isArray(value.collections))
        restored=value.collections.slice(0,150);
    }catch{}
    stateRef.current=restored;setCollections(restored);
    setSelected(restored[0]?.id||'');
    queryCache.current.clear();
    matchCache.current.clear();
  },[storageKey]);
  const persist=updated=>{
    stateRef.current=updated;setCollections(updated);
    try{
      localStorage.setItem(storageKey,JSON.stringify({
        format:'jobbi-migration-state/v2',updatedAt:new Date().toISOString(),collections:updated
      }));
    }catch{
      setNotice('Your browser cannot store all this progress. Use Export detailed report to keep a backup.');
    }
  };
  const patchCollection=(collectionId,change)=>{
    persist(stateRef.current.map(c=>c.id===collectionId?{...c,...change}:c));
  };
  const patchTrack=(collectionId,trackId,change)=>{
    persist(stateRef.current.map(c=>c.id===collectionId?{
      ...c,tracks:c.tracks.map(row=>row.id===trackId?{...row,...change}:row)
    }:c));
  };
  const load=async file=>{
    if(!file)return;
    setError('');setNotice('');
    try{
      if(file.size>8_000_000)throw new Error('The metadata export must be below 8 MB.');
      const parsed=parseCollectionManifest(await file.text(),file.name);
      if(stateRef.current.length&&!window.confirm('Replace the saved import progress in this browser with this new export?'))return;
      persist(parsed.collections.map(c=>({...c,destinationId:null,
        tracks:c.tracks.map(t=>({status:'unsearched',note:'',...t}))})));
      setSelected(parsed.collections[0]?.id||'');
      queryCache.current.clear();
      matchCache.current.clear();
      const fixed=parsed.collections.reduce((n,c)=>n+(c.removedDuplicates||0),0);
      setNotice('Loaded '+parsed.collections.length+' collection(s), '+
        parsed.collections.reduce((n,c)=>n+c.tracks.length,0)+
        ' track entries.'+(fixed?' Repaired '+fixed+
          ' duplicate entries from an older Apple Music export.':'')+
        ' Favorites remain favorites; playlists remain separate.');
    }catch(e){setError(e.message||'Unable to parse the export');}
  };
  const fetchLocal=async(row,{refresh=false}={})=>{
    const key=sameSong(row);
    if(!refresh&&queryCache.current.has(key))return queryCache.current.get(key);
    const data=await api('/api/search?q='+encodeURIComponent(row.title.slice(0,100)));
    const song=findLocalSong(row,data.song||[])||null;
    queryCache.current.set(key,song);
    return song;
  };
  const ensurePlaylist=async collectionId=>{
    const c=stateRef.current.find(item=>item.id===collectionId);
    if(!c)throw new Error('Selected collection is missing');
    if(c.kind==='favorites')return null;
    if(c.destinationId)return c.destinationId;
    const result=await api('/api/playlists',jsonOptions('POST',{name:c.name}));
    const id=result?.playlist?.id;
    if(!id)throw new Error('Navidrome did not return a playlist identifier');
    patchCollection(collectionId,{destinationId:id});
    onLibrary?.();
    return id;
  };
  const applyLocal=async(col,row,song)=>{
    if(!song?.id)return false;
    if(col.kind==='favorites'){
      await api('/api/star',jsonOptions('POST',{id:song.id,starred:true}));
      patchTrack(col.id,row.id,{songId:song.id,status:'hearted',
        note:'Saved in your Jobbi Music Favorites'});
    }else{
      const id=await ensurePlaylist(col.id);
      await api('/api/playlists/'+encodeURIComponent(id),
        jsonOptions('PATCH',{addSongId:song.id}));
      patchTrack(col.id,row.id,{songId:song.id,status:'added',
        note:'Added to playlist '+col.name});
    }
    return true;
  };
  const remoteMatch=async row=>{
    const key=sameSong(row);
    if(matchCache.current.has(key))return matchCache.current.get(key);
    let soulseekNote='';
    try {
      const search=await api('/api/soulseek/search',jsonOptions('POST',{
        query:(row.artist+' '+row.title).slice(0,140)
      }));
      const candidate=pickSoulseekCandidate(row,search.results||[]);
      if(candidate){
        const matched={candidate,note:'Soulseek '+candidate.format};
        matchCache.current.set(key,matched);
        return matched;
      }
      soulseekNote=search.message||'No matching studio FLAC or MP3 on Soulseek.';
    }catch(e){
      // A quota error is not permission to bypass the server limit.
      if(/429|rate limit|allowance|quota/i.test(String(e.message||'')))throw e;
      soulseekNote='Soulseek unavailable: '+String(e.message||'Search failed');
    }
    let fallbackNote='';
    try {
      const data=await api('/api/invidious/search?q='+
        encodeURIComponent((row.artist+' '+row.title).slice(0,140)));
      const candidate=pickInvidiousCandidate(row,data.results||[]);
      if(candidate){
        const matched={candidate,note:'Invidious verified video'};
        matchCache.current.set(key,matched);
        return matched;
      }
      fallbackNote=data.message||'No verified matching video.';
    }catch(e){
      if(/429|rate limit|allowance|quota/i.test(String(e.message||'')))throw e;
      fallbackNote='Invidious unavailable: '+String(e.message||'Search failed');
    }
    return {candidate:null,note:soulseekNote+' '+fallbackNote};
  };
  const queue=async(col,row,candidate)=>{
    if(!authorized)throw new Error('Confirm you have permission to obtain the recordings before queueing.');
    const c=candidate||row.candidate;
    if(!c)throw new Error('No verified candidate to queue');
    // Avoid requesting the same recording twice just because it occurs in
    // two different source playlists.
    const other=stateRef.current.flatMap(x=>x.tracks).find(x=>x.id!==row.id&&
      sameSong(x)===sameSong(row)&&['queued','waiting'].includes(x.status));
    if(other){
      patchTrack(col.id,row.id,{status:'queued',source:other.source,
        note:'Waiting for previously queued recording',importId:other.importId});
      return true;
    }
    if(c.format==='INVIDIOUS'){
      let available;
      try{available=await api('/api/invidious/status')}
      catch(e){available={importEnabled:false,message:e.message}}
      if(!available?.importEnabled){
        patchTrack(col.id,row.id,{status:'review',candidate:c,
          note:'Invidious match found, but automatic downloads are unavailable: '+
            (available?.message||'Enable the NAS Invidious import worker.')});
        return false;
      }
    }
    patchTrack(col.id,row.id,{status:'waiting',note:'Submitting '+c.format+' to NAS…'});
    try{
      if(c.format==='INVIDIOUS'){
        const result=await api('/api/invidious/import',jsonOptions('POST',{
          videoId:c.videoId,title:row.title,artist:row.artist,authorized:true
        }));
        patchTrack(col.id,row.id,{status:'queued',source:'invidious',
          importId:result.jobId,note:'Invidious audio queued; waiting for NAS indexing'});
      }else{
        const result=await api('/api/music-imports',jsonOptions('POST',{
          username:c.username,filename:c.filename,size:Number(c.size),
          artist:row.artist,title:row.title
        }));
        patchTrack(col.id,row.id,{status:'queued',source:'soulseek',
          importId:result.importId,
          note:result.existing?'Already on NAS; waiting for Navidrome index':
            'Queued '+c.format+' on NAS; waiting for indexing'});
      }
      return true;
    }catch(e){
      patchTrack(col.id,row.id,{status:'failed',note:'Queue failed: '+e.message,candidate:c});
      throw e;
    }
  };
  const scanRow=async(col,row,autoQueue=false)=>{
    patchTrack(col.id,row.id,{status:'waiting',note:'Searching your own music library…'});
    const local=await fetchLocal(row);
    if(local?.id){await applyLocal(col,row,local);return}
    const duplicate=stateRef.current.flatMap(c=>c.tracks).find(x=>
      x.id!==row.id&&sameSong(x)===sameSong(row)&&x.candidate);
    const match=duplicate?.candidate
      ?{candidate:duplicate.candidate,note:'Already matched another collection'}
      :await remoteMatch(row);
    const candidate=match.candidate;
    if(candidate){
      patchTrack(col.id,row.id,{status:'matched',candidate,
        note:'Verified '+match.note+' · '+candidate.matchReason+
          ' · '+(candidate.filename||candidate.title)});
      if(autoQueue&&authorized)await queue(col,row,candidate);
    }else patchTrack(col.id,row.id,{status:'review',
      note:match.note||'No verified studio match on Soulseek or Invidious. Review in Discover.'});
  };
  const run=async({autoQueue=false,all=false,recheck=false}={})=>{
    if(activeRef.current)return;
    activeRef.current=true;stopRef.current=false;
    setWorking(true);setError('');setNotice('');
    let attempted=0,updated=0,failed=0;
    try{
      for(const col of stateRef.current.filter(c=>c.id===selected)){
        const eligible=col.tracks.filter(row=>recheck
          ?['queued','waiting','review','failed'].includes(row.status)
          :row.status==='unsearched');
        for(const row of eligible.slice(0,all?REPORT_LIMIT:recheck?5:SCAN_LIMIT)){
          if(stopRef.current)break;
          try{
            if(recheck){
              const found=await fetchLocal(row,{refresh:true});
              if(found?.id){
                await applyLocal(col,row,found);updated++;
              }else{
                patchTrack(col.id,row.id,{status:row.importId?'queued':'review',
                  note:row.importId?'Not indexed yet. Recheck after downloads finish.':
                    'Still missing; review the match or retry search.'});
              }
            }else{
              await scanRow(col,row,autoQueue);updated++;
            }
          }catch(e){
            failed++;
            const message=String(e?.message||'Import failed');
            patchTrack(col.id,row.id,{status:'failed',note:message});
            if(/429|limit reached|allowance|too many|rate/i.test(message)){
              setError('Import paused due to the server quota: '+message+
                '. Your progress is saved. Continue after the limit resets.');
              stopRef.current=true;
            }
          }
          attempted++;
          if(all&&attempted%3===0)await new Promise(resolve=>setTimeout(resolve,250));
        }
      }
      setNotice('Checked '+attempted+' songs; '+updated+' processed, '+failed+
        ' failed. '+(stopRef.current?'Stopped; your progress is saved.':'Report is available below.'));
      onLibrary?.();
    }finally{activeRef.current=false;setWorking(false)}
  };
  const checkQueueStatus=async({silent=false}={})=>{
    if(activeRef.current)return;
    activeRef.current=true;
    if(!silent){setWorking(true);setError('')}
    try{
      let data={items:[]};
      try{data=await api('/api/music-imports')}
      catch(e){if(!silent)throw e}
      const statuses=new Map((data.items||[]).map(row=>[
        songKey(row.artist)+'|'+songKey(row.title),row
      ]));
      let updated=0,checked=0;
      for(const col of stateRef.current){
        for(const row of col.tracks){
          if(!['queued','waiting'].includes(row.status))continue;
          const match=row.source==='invidious'?null:statuses.get(sameSong(row));
          if(match?.stage==='available'&&match.songId){
            try{await applyLocal(col,row,{id:match.songId});updated++}
            catch(e){patchTrack(col.id,row.id,{status:'failed',note:'Could not apply song: '+e.message})}
            continue;
          }
          // Also recheck Navidrome itself: the Invidious worker and previously
          // queued Soulseek imports can finish without a music-imports result.
          if(checked<8){
            checked++;
            try{
              const local=await fetchLocal(row,{refresh:true});
              if(local?.id){await applyLocal(col,row,local);updated++;continue}
            }catch{/* Keep the queued state until the library is available. */}
          }
          if(match&&['failed','unconfirmed'].includes(match.stage))
            patchTrack(col.id,row.id,{note:match.reason||match.label||'Transfer needs review'});
          else if(match?.label)patchTrack(col.id,row.id,{note:match.label});
        }
      }
      if(!silent||updated) {
        setNotice('Applied '+updated+' newly indexed songs to their playlists/Favorites. '+
          (checked?'Checked '+checked+' pending recordings. ':'')+
          'Remaining transfers will be rechecked while this page is open.');
      }
      if(updated)onLibrary?.();
    }catch(e){if(!silent)setError(e.message)}
    finally{activeRef.current=false;if(!silent)setWorking(false)}
  };
  // System downloads continue after the page closes, but applying their
  // finished tracks to playlists requires an authenticated browser session.
  useEffect(()=>{
    const timer=setInterval(()=>{
      if(!activeRef.current&&stateRef.current.some(c=>
        c.tracks.some(t=>['queued','waiting'].includes(t.status))))
        void checkQueueStatus({silent:true});
    },45000);
    return ()=>clearInterval(timer);
  },[api,storageKey]);
  const clear=()=>{
    if(!window.confirm('Clear your saved migration data in this browser? It will not delete playlists or favorites already imported to Navidrome.'))return;
    queryCache.current.clear();matchCache.current.clear();persist([]);setSelected('');
    setNotice('Cleared browser progress. Previously imported music remains untouched.');
  };
  const retry=()=>{
    const col=stateRef.current.find(c=>c.id===selected);
    if(!col)return;
    persist(stateRef.current.map(c=>c.id===selected?{...c,
      tracks:c.tracks.map(row=>['review','failed'].includes(row.status)
        ?{...row,status:'unsearched',note:'Ready to retry'}:row)}:c));
    setNotice('Unmatched and failed rows reset to Ready to retry.');
  };
  const current=collections.find(c=>c.id===selected);
  const totals=current?stageTotals(current):null;
  const candidates=current?.tracks.filter(r=>r.status==='matched')||[];
  const incomplete=collections.filter(c=>c.incomplete||c.expectedCount&&c.expectedCount>c.tracks.length);
  return <section className="transfer-page">
    <div className="page-title">
      <div className="eyebrow">YOUR MUSIC, YOUR COLLECTIONS</div>
      <h1>Bring your music<span className="spark-dot">.</span></h1>
      <p>Move Spotify or Apple Music playlists and favorites into Jobbi Music.
        Songs already on your NAS are added immediately. Missing tracks are searched
        on Soulseek (FLAC first, then MP3), then Invidious for a verified video.
        When you authorize downloading, matched audio is queued on your NAS.</p>
    </div>
    <div className="transfer-grid">
      <div className="transfer-card">
        <h2><FileUp size={20}/> Export from your music provider</h2>
        <p>On your computer, install the free Jobbi browser userscript in a userscript manager.
          Open each Spotify or Apple Music playlist, capture it, then export one combined JSON file.
          Mark Liked Songs or Favorite Songs as Favorites in the exporter.</p>
        <div className="playlist-tools-row">
          <a className="playlist-tool-button" href="/tools/jobbi-collection-export.user.js" download="jobbi-collection-export.user.js">
            <Download size={16}/> Download exporter v1.3.0
          </a>
          <a className="playlist-tool-button" href="https://github.com/b3njaram/navidrome/blob/main/jobbi-music/tools/README.md" target="_blank" rel="noopener noreferrer">
            Read setup guide
          </a>
        </div>
        <p className="transfer-help">After installing the script in a desktop browser, choose your source:</p>
        <div className="playlist-tools-row">
          <a className="playlist-tool-button" href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer">Open Spotify</a>
          <a className="playlist-tool-button" href="https://music.apple.com/" target="_blank" rel="noopener noreferrer">Open Apple Music</a>
        </div>
        <p className="transfer-help">Capture each playlist and Liked/Favorite Songs, then select “Download all as JSON.”
          You log in only on the provider’s website. No passwords, audio files,
          or cookies enter your export. Use exporter v1.3.0 with Violentmonkey or Tampermonkey on desktop. Reinstall if an earlier version is already installed. Browser-layout changes can cause incomplete captures;
          check the track counts before importing. Desktop browsers work best.</p>
      </div>
      <div className="transfer-card">
        <h2><ShieldCheck size={20}/> Upload your collection file</h2>
        <p>One JSON file can contain many playlists plus Favorites.
          A regular CSV/TSV export still works as one playlist.
          This browser keeps your progress so you can resume.</p>
        <label className="playlist-tool-button transfer-file">Choose export (JSON, CSV, TSV)
          <input type="file" aria-label="Upload Spotify or Apple Music collection export"
            accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/plain"
            onChange={e=>{load(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/>
        </label>
        <label className="transfer-checkbox"><input type="checkbox" checked={authorized}
            onChange={e=>setAuthorized(e.target.checked)}/>
          I have permission to obtain and store recordings that I queue on the NAS.</label>
        <p className="transfer-help">Matching your existing library never needs this authorization.
          Queued downloads are limited by the NAS’s existing daily and search quotas.
          Provider subscriptions do not grant rights to copy their protected recordings.</p>
      </div>
    </div>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {notice&&<p className="import-notice">{notice}</p>}
    {incomplete.length>0&&<p className="inline-error"><AlertTriangle size={16}/> {incomplete.length} source collection(s)
      appear partially captured. Their saved counts may be incomplete; check the exporter before processing.</p>}
    {!!collections.length&&<>
      <div className="transfer-summary">
        {collections.map(c=>{
          const n=stageTotals(c);return <button type="button" key={c.id}
            className={'transfer-collection '+(selected===c.id?'selected':'')}
            onClick={()=>{setSelected(c.id);setShowAll(false)}}>
            <span>{c.kind==='favorites'?'♥':'♫'} {c.name}</span>
            <small>{c.provider} · {n.total} tracks</small>
            <small>{n.added+n.hearted} added · {n.queued+n.waiting} queued · {n.review+n.failed} need attention</small>
          </button>
        })}
      </div>
      {current&&<div className="transfer-main">
        <h2>{current.kind==='favorites'?<Heart size={19}/>:<Music2 size={19}/>}
          {current.kind==='favorites'?'Import into Jobbi Favorites':current.name}</h2>
        <p className="transfer-help">{current.kind==='favorites'
          ?'Each confirmed song gets a heart, not a new playlist.'
          :'Create or populate its own Navidrome playlist. Songs are added as they become available.'}
          {current.destinationId?' Destination playlist created.':''}</p>
        <div className="transfer-stats">
          <span><b>{totals?.total}</b> total</span>
          <span><b>{(totals?.added||0)+(totals?.hearted||0)}</b> added / hearted</span>
          <span><b>{totals?.queued||0}</b> queued</span>
          <span><b>{totals?.matched||0}</b> ready to queue</span>
          <span><b>{(totals?.review||0)+(totals?.failed||0)}</b> review / failed</span>
          <span><b>{totals?.unsearched||0}</b> not checked</span>
        </div>
        <div className="transfer-controls">
          <button type="button" className="primary" disabled={working||!totals?.unsearched}
            onClick={()=>run({all:false,autoQueue:authorized})}>{working?<LoaderCircle size={17}/>:<Search size={17}/>}
            Check next {Math.min(SCAN_LIMIT,totals?.unsearched||0)}</button>
          <button type="button" className="playlist-tool-button"
            disabled={working||!totals?.unsearched} onClick={()=>run({all:true,autoQueue:authorized})}>
            <RefreshCw size={16}/> Process remaining songs {authorized?'and queue matches':'(no downloads)'}</button>
          <button type="button" className="playlist-tool-button" disabled={!working}
            onClick={()=>{stopRef.current=true}}>
            <Pause size={16}/> Stop after current song</button>
          <button type="button" className="playlist-tool-button"
            disabled={!authorized||working||!candidates.length}
            onClick={async()=>{
              setWorking(true);setError('');stopRef.current=false;
              try{
                let count=0;
                for(const row of candidates.slice(0,5)){
                  if(stopRef.current)break;
                  try{await queue(current,row);count++}
                  catch(e){setError(e.message)}
                }
                setNotice('Submitted '+count+' previously reviewed candidates to NAS');
              }finally{setWorking(false)}
            }}>
            <ArrowDownToLine size={16}/> Queue verified matches ({Math.min(candidates.length,5)})</button>
          <button type="button" className="playlist-tool-button"
            disabled={working||!(totals?.queued||totals?.waiting||totals?.review||totals?.failed)}
            onClick={()=>run({recheck:true})}>
            <CheckCircle2 size={16}/> Recheck selected (5)</button>
          <button type="button" className="playlist-tool-button" disabled={working}
            onClick={checkQueueStatus}><RefreshCw size={16}/> Update download progress</button>
          {current.kind==='playlist'&&!current.destinationId&&<button type="button"
            className="playlist-tool-button" disabled={working}
            onClick={async()=>{setWorking(true);try{await ensurePlaylist(current.id);setNotice('Created '+current.name+' playlist.')}catch(e){setError(e.message)}finally{setWorking(false)}}}>
            <Music2 size={16}/> Create empty destination</button>}
          <button type="button" className="playlist-tool-button" disabled={working}
            onClick={retry}><RefreshCw size={16}/> Retry failed matches</button>
        </div>
        <div className="transfer-controls">
          <DownloadReport collections={collections}/>
          <button className="playlist-tool-button" type="button" disabled={working}
            onClick={clear}>Clear local progress</button>
        </div>
        <div className="transfer-rows">
          {(showAll?current.tracks:current.tracks.slice(0,100)).map(row=>
            <div className="transfer-row" key={row.id}>
              <div>
                <strong>{row.title}</strong>
                <small>{row.artist}{row.album?' · '+row.album:''}</small>
                <span className="transfer-status">{row.note||'Not searched yet'}</span>
              </div>
              {['added','hearted'].includes(row.status)?<span className="transfer-found">
                <Check size={17}/>{row.status==='hearted'?'Favorited':'Added'}</span>:
                row.status==='matched'?<button className="playlist-tool-button"
                  disabled={!authorized||working}
                  onClick={async()=>{setWorking(true);try{await queue(current,row)}
                    catch(e){setError(e.message)}finally{setWorking(false)}}}>
                  <ArrowDownToLine size={16}/> Queue {row.candidate?.format||'audio'}</button>:
                <span className="transfer-stage">{row.status}</span>}
            </div>
          )}
        </div>
        {current.tracks.length>100&&!showAll&&<button type="button" className="playlist-tool-button"
          onClick={()=>setShowAll(true)}>Show all {current.tracks.length} song entries</button>}
      </div>}
    </>}
    {!collections.length&&<div className="transfer-empty">
      <Music2 size={32}/><p>Export a playlist or Liked Songs, then upload the JSON here.</p>
      <p className="transfer-help">Your file preserves separate collection names, song order,
        provider, and whether each collection belongs in Favorites.</p>
    </div>}
  </section>;
}
