import React,{useRef,useState} from 'react';
import {ArrowDownToLine,CheckCircle2,FileUp,Heart,LoaderCircle,Search,ShieldCheck,Music2} from 'lucide-react';
import {parsePlaylistExport,findLocalSong,pickSoulseekCandidate} from './playlist-export.js';

const LIMIT=5; // Keep within existing Soulseek API search and NAS import quotas.
export default function PlaylistTransfer({api,onLibrary}){
  const [tracks,setTracks]=useState([]),[name,setName]=useState('Imported playlist');
  const [cursor,setCursor]=useState(0),[working,setWorking]=useState(false);
  const [authorized,setAuthorized]=useState(false),[notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const running=useRef(false);
  const patchRow=(id,values)=>setTracks(all=>all.map(row=>row.id===id?{...row,...values}:row));
  const load=async file=>{
    if(!file)return;
    setError('');setNotice('');
    try{
      if(file.size>2_000_000)throw new Error('Choose a track-list file under 2 MB');
      const parsed=parsePlaylistExport(await file.text(),file.name);
      setTracks(parsed.map(row=>({...row,status:'unsearched',note:''})));
      setName(file.name.replace(/\.(csv|tsv|txt|json)$/i,'').slice(0,100)||'Imported playlist');
      setCursor(0);
      setNotice(`Parsed ${parsed.length} tracks locally. Nothing has been downloaded yet.`);
    }catch(e){setError(e.message)}
  };
  const lookUp=async item=>{
    const query=(item.artist+' '+item.title).slice(0,140);
    const local=await api('/api/search?q='+encodeURIComponent(query));
    const found=findLocalSong(item,local.song||[]);
    if(found?.id)return {status:'available',note:'Already in your Navidrome library',songId:found.id};
    const remote=await api('/api/soulseek/search',{method:'POST',body:JSON.stringify({query})});
    const candidate=pickSoulseekCandidate(item,remote.results||[]);
    if(candidate)return {status:'matched',note:/(\.flac)$/i.test(candidate.filename)?'Matching FLAC found':'Best available matching format',candidate};
    return {status:'review',note:'No safe artist/title match found. Search manually in Discover.'};
  };
  const scan=async()=>{
    if(running.current||!tracks.length||cursor>=tracks.length)return;
    running.current=true;setWorking(true);setNotice('');setError('');
    let processed=0;
    try{
      for(const row of tracks.slice(cursor,cursor+LIMIT)){
        patchRow(row.id,{status:'searching',note:'Searching your library and available peers…'});
        try{patchRow(row.id,await lookUp(row))}
        catch(e){patchRow(row.id,{status:'review',note:e.message||'Search unavailable'})}
        processed++;
      }
      setNotice('Reviewed '+processed+' tracks. FLAC is preferred only when both artist and title match.');
    }finally{setCursor(old=>old+processed);setWorking(false);running.current=false}
  };
  const queue=async row=>{
    if(!authorized){setError('Confirm you are authorized to obtain these recordings before importing.');return;}
    if(!row.candidate)return;
    patchRow(row.id,{status:'queueing',note:'Submitting to NAS downloader…'});
    try{
      const c=row.candidate;
      const outcome=await api('/api/music-imports',{method:'POST',body:JSON.stringify({
        username:c.username,filename:c.filename,size:Number(c.size),artist:row.artist,title:row.title
      })});
      patchRow(row.id,{status:'queued',note:outcome.queued?'Queued for import. Follow progress in Discover.':'Submitted'});
    }catch(e){patchRow(row.id,{status:'matched',note:'Could not queue: '+e.message})}
  };
  const queueMatching=async()=>{
    if(!authorized){setError('Confirm that you have rights to import the selected recordings first.');return;}
    if(running.current)return;
    running.current=true;setWorking(true);setError('');
    try{
      for(const row of tracks.filter(r=>r.status==='matched').slice(0,LIMIT))await queue(row);
    }finally{running.current=false;setWorking(false)}
  };
  const makePlaylist=async()=>{
    const songs=tracks.filter(r=>r.songId).slice(0,100);
    if(!songs.length)return setError('Search for existing library songs first. Pending downloads must finish and be indexed before adding them.');
    setWorking(true);setError('');
    try{
      const result=await api('/api/playlists',{method:'POST',body:JSON.stringify({name:name.trim()||'Imported playlist'})});
      const id=result.playlist?.id;
      if(!id)throw new Error('Playlist was not returned by Navidrome');
      let added=0;
      for(const row of songs){
        try{await api('/api/playlists/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({addSongId:row.songId})});added++}
        catch(e){setError('Playlist created, but only '+added+' tracks were added: '+e.message);break;}
      }
      setNotice('Saved '+added+' available songs into '+name+'. Downloading tracks can be added after Navidrome indexes them.');
      onLibrary?.();
    }catch(e){setError(e.message)}finally{setWorking(false)}
  };
  const ready=tracks.filter(row=>row.status==='matched').length;
  return <section className="transfer-page">
    <div className="page-title"><div className="eyebrow">BRING YOUR MUSIC</div><h1>Import a playlist<span className="spark-dot">.</span></h1>
      <p>Bring your track list from Spotify or Apple Music. Compare it to Navidrome and search Soulseek for FLAC or the best matching audio.</p></div>
    <div className="transfer-grid">
      <div className="transfer-card"><h2><FileUp size={20}/> Choose a track list</h2>
        <p>Export a playlist as CSV, TSV, TXT, or JSON. Spotify playlist exports and Apple Music playlist exports with Name/Artist columns work. No account passwords or browser extensions required.</p>
        <label className="playlist-tool-button transfer-file">Choose CSV / TSV / JSON
          <input aria-label="Upload music playlist export" type="file" accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json" onChange={e=>{load(e.target.files?.[0]);e.target.value=''}}/>
        </label>
        <label className="transfer-name">Destination playlist name<input value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></label>
        <p className="transfer-help">Spotify: export your playlist track metadata to CSV using a trusted exporter. Apple Music on desktop: File → Library → Export Playlist. Only song metadata is read until you start a search.</p>
      </div>
      <div className="transfer-card"><h2><ShieldCheck size={20}/> Review and queue</h2>
        <p>Automatically compares titles and artists; searches the NAS downloader only when a song is missing. Finds FLAC first where a trustworthy match exists.</p>
        <label className="transfer-checkbox"><input type="checkbox" checked={authorized} onChange={e=>setAuthorized(e.target.checked)}/> I have permission to obtain and store the recordings I queue.</label>
        <p className="transfer-help">Imports are shared on your NAS, subject to Jobbi Music's existing per-user limits (20 tracks/day). Searches run in groups of five while this page remains open. No silent downloads.</p>
      </div>
    </div>
    {error&&<p className="inline-error">{error}</p>}
    {notice&&<p className="import-notice">{notice}</p>}
    {!!tracks.length&&<>
      <div className="transfer-controls"><span>{tracks.length} songs · {cursor} checked · {ready} ready to queue</span>
        <button type="button" className="primary" disabled={working||cursor>=tracks.length} onClick={scan}>{working?<LoaderCircle size={17}/>:<Search size={17}/>} Find next {Math.min(LIMIT,tracks.length-cursor)} matches</button>
        <button type="button" className="playlist-tool-button" disabled={working||!authorized||!ready} onClick={queueMatching}><ArrowDownToLine size={17}/> Queue matched ({Math.min(ready,LIMIT)})</button>
        <button type="button" className="playlist-tool-button" disabled={working||!tracks.some(r=>r.songId)} onClick={makePlaylist}><Music2 size={17}/> Save found songs as playlist</button>
      </div>
      <div className="transfer-rows">{tracks.slice(0,1000).map(row=><div className="transfer-row" key={row.id}>
        <div><strong>{row.title}</strong><small>{row.artist}{row.album?' · '+row.album:''}</small>
          <span className="transfer-status">{row.note||'Not searched yet'}</span></div>
        {row.status==='available'?<span className="transfer-found"><CheckCircle2 size={17}/> In library</span>:
          row.status==='matched'?<button className="playlist-tool-button" disabled={working||!authorized} onClick={()=>queue(row)}><ArrowDownToLine size={16}/> Queue {row.candidate.filename.split('.').pop().toUpperCase()}</button>:
          <span className="transfer-stage">{row.status}</span>}
      </div>)}</div>
    </>}
    {!tracks.length&&<div className="transfer-empty"><Music2 size={32}/><p>Choose a playlist export to begin matching songs.</p></div>}
  </section>;
}
