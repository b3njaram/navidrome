// ==UserScript==
// @name         Jobbi Music — My Collection Exporter
// @namespace    https://music.jobbisoft.com.mx
// @version      1.2.0
// @description  Export YOUR currently displayed Spotify or Apple Music playlist metadata to a Jobbi Music JSON manifest; never copies audio or login credentials.
// @match        https://open.spotify.com/*
// @match        https://music.apple.com/*
// @updateURL    https://music.jobbisoft.com.mx/tools/jobbi-collection-export.user.js
// @downloadURL  https://music.jobbisoft.com.mx/tools/jobbi-collection-export.user.js
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';
  const STORE='jobbi_collection_export_v1',VERSION='jobbi-collection-export/v1';
  const provider=location.hostname==='open.spotify.com'?'spotify':'apple';
  const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const state={collections:[]};
  try{
    const saved=GM_getValue(STORE,{collections:[]});
    if(Array.isArray(saved?.collections))state.collections=saved.collections.slice(0,150);
  }catch{}
  let busy=false,stop=false;
  const persist=()=>GM_setValue(STORE,{collections:state.collections});
  const pick=(root,selectors)=>{
    for(const selector of selectors){
      const element=root.querySelector(selector);
      if(element&&clean(element.textContent))return clean(element.textContent);
    }
    return '';
  };
  const sourceLink=(root,kind)=>root.querySelector('a[href*="/'+kind+'/"]')?.getAttribute('href')||'';
  const spotifyRow=row=>{
    const track=row.querySelector('a[href*="/track/"]');
    if(!track)return null; // never export podcasts or episodes as songs
    const title=clean(track.textContent)||pick(row,['[data-testid="internal-track-link"]']);
    const artist=[...row.querySelectorAll('a[href*="/artist/"]')].map(a=>clean(a.textContent)).filter(Boolean).join(', ')||
      pick(row,['[data-testid="tracklist-row"] [role="gridcell"]:nth-child(2)']);
    const album=pick(row,['a[href*="/album/"]']);
    const number=Number(row.closest('[aria-rowindex]')?.getAttribute('aria-rowindex')||0);
    const duration=pick(row,['[data-testid="track-duration"]','[role="gridcell"]:last-child']);
    const trackUrl=new URL(track.getAttribute('href'),location.origin).href.split('?')[0];
    if(!title||!artist)return null;
    return {position:number>0?number-1:null,title,artist,album,sourceUrl:trackUrl,duration,version:''};
  };
  // Prefer title and artist elements inside the actual track row. Apple Music
  // ships different desktop, responsive and library layouts concurrently.
  const appleRow=row=>{
    const titleSelectors=[
      '[data-testid="track-title"]','[data-testid="song-title"]',
      '.songs-list-row__song-name','.songs-list__song-name',
      '.product-lockup__title','[class*="track-lockup__title"]',
      '[class*="song-name"]','[data-testid="track-name"]',
      '[class*="track-title"]','[data-testid="title"]'
    ];
    const artistSelectors=[
      '[data-testid="track-title-by-line"]','[data-testid="track-artist"]',
      '[data-testid="track-column-secondary"]','[data-testid="song-artist"]',
      '.songs-list-row__by-line','.songs-list-row__artist',
      '.songs-list__col-artist','.product-lockup__subtitle',
      '[class*="track-lockup__subtitle"]','[class*="artist-name"]',
      '[class*="song-artist"]','[class*="by-line"]','[class*="subtitle"]'
    ];
    const primary=row.querySelector('[data-testid="track-column-primary"], [class*="song-info"], [class*="track-info"]');
    const titleFromLink=[...row.querySelectorAll('a[href*="?i="],a[href*="/song/"]')]
      .map(a=>clean(a.textContent)).find(Boolean)||'';
    let title=pick(row,titleSelectors)||titleFromLink;
    let artist=pick(row,artistSelectors)||
      [...row.querySelectorAll('a[href*="/artist/"]')]
        .map(a=>clean(a.textContent)).filter(Boolean).join(', ');
    // In compact Apple rows, title and artist can both be inside the primary
    // column. Read distinct text lines instead of returning its combined text.
    if(primary){
      const lines=String(primary.innerText||primary.textContent||'').split(/\s*\n\s*/).map(clean).filter(Boolean);
      if(!title)title=lines[0]||'';
      if(!artist&&lines.length>1)artist=lines.find(line=>line!==title)||'';
      if(!title||!artist){
        const bits=[...primary.querySelectorAll('a,span,div')]
          .filter(e=>!e.querySelector('a,span,div'))
          .map(e=>clean(e.textContent)).filter(Boolean);
        if(!title)title=bits[0]||'';
        if(!artist)artist=bits.find(bit=>bit!==title)||'';
      }
    }
    // Accessible labels are a last resort; only use explicit "by Artist".
    const label=clean(row.getAttribute('aria-label')||'');
    const named=label.match(/^(.+?)\s+by\s+(.+?)(?:[,·]|$)/i);
    if(named){if(!title)title=clean(named[1]);if(!artist)artist=clean(named[2])}
    // Some Apple views render the artist as a sibling of the title link.
    if(!artist&&titleFromLink){
      const sibling=pick(row,['[data-testid="artist"]','[class*="secondary"]']);
      if(sibling&&sibling!==title)artist=sibling;
    }
    const album=pick(row,[
      '[data-testid="track-column-tertiary"]','[data-testid="track-album"]',
      '.songs-list__col-album','[class*="album-name"]'
    ]);
    const rawIndex=row.getAttribute('aria-rowindex')||
      row.getAttribute('data-row-index')||row.getAttribute('data-index')||
      row.closest('[aria-rowindex]')?.getAttribute('aria-rowindex')||
      row.closest('[data-row-index]')?.getAttribute('data-row-index')||
      row.closest('[data-index]')?.getAttribute('data-index');
    const index=rawIndex===null?null:Number(rawIndex);
    const position=Number.isSafeInteger(index)&&index>=0?index:null;
    const link=row.querySelector('a[href*="?i="],a[href*="/song/"],a[href*="/album/"]');
    const sourceUrl=link?.getAttribute('href')
      ?new URL(link.getAttribute('href'),location.origin).href.split('#')[0]:'';
    const duration=pick(row,['[data-testid="track-duration"]',
      '[data-testid="duration"]','[class*="duration"]']);
    if(!title||!artist)return null;
    return {position,title,artist,album,sourceUrl,duration,version:''};
  };
  const selectors=provider==='spotify'
    ?'[data-testid="tracklist-row"], [role="row"][data-testid*="track"]'
    :[
      '[data-testid="track-list-item"]','[data-testid^="track-item-"]',
      '[data-testid="song-row"]','[data-testid="song-list-item"]',
      '[data-testid="track-row"]','.songs-list-row',
      '[class*="songs-list-row"]','[class*="track-list-item"]',
      '[role="row"][aria-label]','[role="row"][data-row-index]'
    ].join(',');
  let diagnostics={rows:0,readable:0,scroll:'none'};
  const getRowCandidates=()=>{
    const scope=document.querySelector('#scrollable-page main, [data-testid="main-view-container"], #scrollable-page, main')||document;
    const candidates=[...scope.querySelectorAll(selectors)]
      .filter(e=>!e.closest('#jobbi-collection-exporter'));
    if(provider==='apple'&&!candidates.length){
      // Row class names occasionally change, but song links are still present.
      for(const link of scope.querySelectorAll('a[href*="?i="],a[href*="/song/"]')){
        const row=link.closest('[role="row"],li,[class*="song-row"],[class*="track-row"]');
        if(row&&!candidates.includes(row))candidates.push(row);
      }
    }
    // Suppress outer wrapper rows that contain actual song rows.
    return candidates.filter(row=>!row.matches('[role="row"]')||!row.querySelector(
      '[data-testid="track-list-item"], [data-testid^="track-item-"], .songs-list-row, [class*="songs-list-row"]'
    ));
  };
  const readRows=()=>{
    const rows=getRowCandidates();
    const results=[],seen=new Set(),occurrences=new Map();
    diagnostics.rows=Math.max(diagnostics.rows,rows.length);
    for(const row of rows){
      const song=provider==='spotify'?spotifyRow(row):appleRow(row);
      if(!song)continue;
      const fingerprint=[song.sourceUrl,song.title,song.artist,song.album,song.duration].join('|');
      const number=(occurrences.get(fingerprint)||0)+1;
      occurrences.set(fingerprint,number);
      const key=song.position!=null?'position:'+song.position:
        'track:'+fingerprint+':occurrence:'+number;
      if(!seen.has(key)){seen.add(key);results.push({key,song})}
    }
    diagnostics.readable=Math.max(diagnostics.readable,results.length);
    return results;
  };
  function scroller(){
    const first=getRowCandidates()[0];
    const candidates=[];
    if(first){
      for(let el=first.parentElement;el;el=el.parentElement)candidates.push(el);
    }
    if(provider==='apple'){
      for(const selector of ['#scrollable-page','[data-testid="scrollable-page"]','[class*="scrollable"]']){
        const node=document.querySelector(selector);
        if(node&&!candidates.includes(node))candidates.push(node);
      }
    }
    for(const el of candidates){
      const style=getComputedStyle(el);
      if(el.scrollHeight>el.clientHeight+40&&/auto|scroll/.test(style.overflowY)){
        diagnostics.scroll=el.id||el.getAttribute('data-testid')||el.tagName.toLowerCase();
        return el;
      }
    }
    const root=document.scrollingElement||document.documentElement;
    diagnostics.scroll=root.tagName.toLowerCase();
    return root;
  }
  function expectedCount(){
    if(provider!=='spotify')return null;
    const first=document.querySelector('[data-testid="tracklist-row"]');
    const count=Number(first?.closest('[aria-rowcount]')?.getAttribute('aria-rowcount'));
    return Number.isFinite(count)&&count>1?count-1:null;
  }
  function inferredName(){
    const heading=pick(document,['[data-testid="entityTitle"]','main h1','h1']);
    const current=location.pathname;
    if(provider==='spotify'&&/\/collection\/tracks/.test(current))return 'Liked Songs';
    return heading&&heading.length<110?heading:'My Playlist';
  }
  function inferredFavorites(){
    if(provider==='spotify')return /\/collection\/tracks/.test(location.pathname);
    return /favorite/i.test(inferredName()) && /songs/i.test(inferredName());
  }
  function currentCollectionId(){
    return provider+':'+location.pathname.replace(/\/$/,'').slice(0,220);
  }
  const host=document.createElement('aside');
  host.id='jobbi-collection-exporter';
  host.style.cssText='position:fixed;right:15px;bottom:18px;z-index:2147483646;max-width:min(400px,calc(100vw - 30px));';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML='<style>'+
    ':host{all:initial} *{box-sizing:border-box;font-family:system-ui,Arial,sans-serif}'+
    '.panel{width:min(375px,calc(100vw - 30px));background:#17131d;color:#faf6fc;border:1px solid #9f738f;border-radius:17px;box-shadow:0 12px 45px #0009;padding:15px;font-size:13px}'+
    '.header{display:flex;align-items:center;justify-content:space-between;gap:12px}h3{font-size:16px;margin:0 0 9px;color:#ffb7ce}'+
    'label{display:flex;flex-direction:column;gap:5px;margin:9px 0;color:#e8d8e3}input{font:inherit;padding:9px;border:1px solid #82677a;background:#2a232f;border-radius:8px;color:#fff;min-width:0}'+
    '.check{flex-direction:row;align-items:center;gap:8px}.check input{width:15px;height:15px}'+
    '.actions{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}button{color:#fff;border-radius:9px;border:1px solid #806173;padding:9px 12px;cursor:pointer;background:#34283a;font-size:12px;font-weight:600}button.primary{background:#dc5084;border-color:#ee77a4}button:disabled{opacity:.5;cursor:default}'+
    '.small{font-size:11px;color:#c1b1c2;line-height:1.5}.status{white-space:pre-line;max-height:85px;overflow:auto;color:#b9f0d9;font-size:12px}'+
    '.saved{max-height:135px;overflow:auto;font-size:11px;color:#f0d3e0}.saved div{padding:5px;border-bottom:1px solid #413242}'+
    '#collapse{padding:5px 8px}#body[hidden]{display:none}'+
    '</style>'+
    '<div class="panel"><div class="header"><h3>♫ Export to Jobbi Music</h3><button id="collapse">−</button></div>'+
    '<div id="body"><div class="small" id="provider"></div>'+
    '<label>Collection name<input id="title" maxlength="100"></label>'+
    '<label class="check"><input type="checkbox" id="favorites">This is my Favorite / Liked Songs collection (add hearts, not a playlist)</label>'+
    '<div class="actions"><button class="primary" id="scan">Capture current collection</button><button id="stop" disabled>Stop</button></div>'+
    '<div class="status" id="status">Open a playlist or Liked Songs, then choose Capture.</div>'+
    '<div class="saved" id="saved"></div>'+
    '<div class="actions"><button class="primary" id="download">Download all as JSON</button><button id="clear">Clear saved collections</button></div>'+
    '<p class="small">You choose which playlists to capture. Sign in only through Spotify or Apple Music. This script reads visible track metadata, never passwords or music audio. Web layouts can change; always inspect the captured counts. Some providers restrict automated collection access.</p></div></div>';
  document.documentElement.appendChild(host);
  const $=id=>shadow.getElementById(id);
  $('provider').textContent=(provider==='spotify'?'Spotify':'Apple Music')+' · exporter v1.2.0 · Saves one combined file across both providers';
  const resetForm=()=>{$('title').value=inferredName();$('favorites').checked=inferredFavorites()};
  resetForm();
  let lastUrl=location.href;
  setInterval(()=>{if(lastUrl!==location.href && !busy){lastUrl=location.href;resetForm()}},900);
  $('collapse').onclick=()=>{
    const hidden=!$('body').hidden;$('body').hidden=hidden;$('collapse').textContent=hidden?'+':'−';
  };
  $('stop').onclick=()=>{stop=true;$('status').textContent='Finishing current scan…'};
  const updateSaved=()=>{
    $('saved').innerHTML='';
    if(!state.collections.length){$('saved').textContent='No collections captured yet.';return}
    for(const c of state.collections){
      const div=document.createElement('div');
      div.textContent=(c.kind==='favorites'?'♥ ':'♫ ')+c.name+' · '+c.tracks.length+' songs ('+c.provider+')'+(c.incomplete?' ⚠ partial':'');
      $('saved').appendChild(div);
    }
  };
  $('scan').onclick=async()=>{
    if(busy)return;
    const name=clean($('title').value);
    if(!name){$('status').textContent='Give this collection a name.';return}
    if(provider==='spotify'&&!(/\/playlist\/|\/collection\/tracks/.test(location.pathname))){
      $('status').textContent='Open a Spotify playlist or Liked Songs first.';return
    }
    if(provider==='apple'&&!(/playlist|library|favorite/i.test(location.pathname))){
      $('status').textContent='Open an Apple Music playlist or your Favorite Songs library first.';return
    }
    busy=true;stop=false;$('scan').disabled=true;$('stop').disabled=false;
    diagnostics={rows:0,readable:0,scroll:'none'};
    const found=new Map(),expected=expectedCount(),target=scroller();
    const original=target.scrollTop;
    let previous=0,stall=0,lastTop=-1,steps=0;
    try{
      target.scrollTop=0;
      await sleep(650);
      for(steps=0;steps<650&&!stop;steps++){
        for(const {key,song} of readRows())found.set(key,song);
        if(expected&&found.size>=expected)break;
        const count=found.size;
        const maxScroll=Math.max(0,target.scrollHeight-target.clientHeight);
        const atBottom=target.scrollTop>=maxScroll-6;
        if(atBottom && previous===count)stall++;
        else if(lastTop===target.scrollTop&&previous===count)stall++;
        else stall=0;
        if(steps%5===0)$('status').textContent='Capturing: '+count+(expected?' / '+expected:'')+' songs · scroll step '+steps;
        // A static, non-scrollable list should finish quickly. For empty lists
        // wait a little longer to allow delayed Apple Music hydration.
        if(stall>=(maxScroll<10?(count?3:8):14))break;
        previous=count;lastTop=target.scrollTop;
        target.scrollTop=Math.min(maxScroll,target.scrollTop+Math.max(260,target.clientHeight*.72));
        await sleep(provider==='apple'?480:180);
      }
      for(const {key,song} of readRows())found.set(key,song);
      const tracks=[...found.values()].sort((a,b)=>{
        if(a.position!=null&&b.position!=null)return a.position-b.position;
        return 0;
      }).map(({position,title,artist,album,duration,sourceUrl,version},i)=>({
        position:position??i+1,title,artist,album,duration,sourceUrl,version
      }));
      if(!tracks.length)throw new Error(
        'No readable songs detected. Found '+diagnostics.rows+' possible rows, '+
        diagnostics.readable+' with a title and artist. Scrolling: '+diagnostics.scroll+
        '. The page may still be loading, or Apple Music changed its markup. '+
        'Open the playlist songs (not its overview), refresh, then try again. '+
        'Send these diagnostic numbers if it still fails.'
      );
      const incomplete=Boolean(stop||(expected&&tracks.length<expected));
      const item={
        id:currentCollectionId(),provider,
        kind:$('favorites').checked?'favorites':'playlist',
        name,sourceUrl:location.href.split('#')[0],
        expectedCount:expected,actualCount:tracks.length,incomplete,tracks
      };
      const index=state.collections.findIndex(c=>c.id===item.id);
      if(index<0)state.collections.push(item);else state.collections[index]=item;
      persist();updateSaved();
      $('status').textContent='Saved '+tracks.length+' songs as '+(item.kind==='favorites'?'Favorites':'playlist')+'.'+
        (incomplete?' ⚠ Some songs may be missing. Scroll/check the page and capture again.':'')+
        '\nOpen another collection and capture it, or download your file.';
    }catch(error){
      $('status').textContent='Capture stopped: '+(error?.message||error);
    }finally{
      try{target.scrollTop=original}catch{}
      busy=false;$('scan').disabled=false;$('stop').disabled=true;
    }
  };
  $('download').onclick=()=>{
    if(!state.collections.length){$('status').textContent='Capture at least one collection first.';return}
    const manifest={format:VERSION,exportedAt:new Date().toISOString(),
      collections:state.collections.map(c=>({
        id:c.id,provider:c.provider,kind:c.kind,name:c.name,sourceUrl:c.sourceUrl,
        expectedCount:c.expectedCount,incomplete:c.incomplete,tracks:c.tracks
      }))
    };
    const blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='jobbi-music-collections-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    $('status').textContent='Exported '+state.collections.length+' collections, '+
      state.collections.reduce((sum,c)=>sum+c.tracks.length,0)+' song entries.';
  };
  $('clear').onclick=()=>{
    if(!window.confirm('Clear collected playlist metadata from this browser? This does not touch your Spotify or Apple Music account.'))return;
    state.collections=[];persist();updateSaved();$('status').textContent='Cleared saved collections.';
  };
  updateSaved();
})();
