// ==UserScript==
// @name         Jobbi Music — My Collection Exporter
// @namespace    https://music.jobbisoft.com.mx
// @version      1.1.0
// @description  Export YOUR currently displayed Spotify or Apple Music playlist metadata to a Jobbi Music JSON manifest; never copies audio or login credentials.
// @match        https://open.spotify.com/*
// @match        https://music.apple.com/*
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
  const appleRow=row=>{
    // Apple Music's 2026 web player uses "track-list-item" and
    // "track-column-secondary" rather than legacy songs-list-row classes.
    // Read only one row at a time; never scrape sidebar suggestions.
    const title=pick(row,[
      '[data-testid="track-title"]','[data-testid="track-column-primary"]',
      '[data-testid="song-title"]','.songs-list-row__song-name',
      '.songs-list__song-name','.product-lockup__title',
      '[class*="song-name"]','[class*="track-lockup__title"]'
    ]);
    const artist=pick(row,[
      '[data-testid="track-title-by-line"]','[data-testid="track-column-secondary"]',
      '[data-testid="track-artist"]','.songs-list-row__artist',
      '.songs-list__col-artist','.product-lockup__subtitle',
      '[class*="song-artist"]','[class*="artist-name"]'
    ]);
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
    const link=row.querySelector('a[href*="/song/"],a[href*="?i="],a[href*="/album/"]');
    const sourceUrl=link?.getAttribute('href')
      ?new URL(link.getAttribute('href'),location.origin).href.split('#')[0]:'';
    const duration=pick(row,['[data-testid="track-duration"]',
      '[data-testid="duration"]','[class*="duration"]']);
    if(!title||!artist)return null;
    return {position,title,artist,album,sourceUrl,duration,version:''};
  };
  const selectors=provider==='spotify'
    ?'[data-testid="tracklist-row"]'
    :'[data-testid="track-list-item"], [data-testid^="track-item-"], .songs-list-row, [class*="songs-list-row"], [role="row"][aria-label]';
  const readRows=()=>{
    const all=[...document.querySelectorAll(selectors)]
      .filter(e=>e.closest('#jobbi-collection-exporter')===null);
    // Ignore wrapper rows if a nested canonical Apple Music track row exists.
    const rows=provider==='apple'&&all.some(r=>r.matches('[data-testid="track-list-item"]'))
      ?all.filter(r=>r.matches('[data-testid="track-list-item"]')):all;
    const results=[],seen=new Set(),occurrences=new Map();
    for(const row of rows){
      const song=provider==='spotify'?spotifyRow(row):appleRow(row);
      if(!song)continue;
      const fingerprint=[song.sourceUrl,song.title,song.artist,song.album,song.duration].join('|');
      const number=(occurrences.get(fingerprint)||0)+1;
      occurrences.set(fingerprint,number);
      // An explicit row position is best; same-song playlist duplicates are
      // preserved when both are visible, even without a stable index.
      const key=song.position!=null?'position:'+song.position:
        'track:'+fingerprint+':occurrence:'+number;
      if(!seen.has(key)){seen.add(key);results.push({key,song})}
    }
    return results;
  };
  function scroller(){
    // Apple Music scrolls this specific inner pane, not the document/body.
    if(provider==='apple'){
      const pane=document.querySelector('#scrollable-page');
      if(pane)return pane;
    }
    const first=document.querySelector(selectors);
    if(first){
      for(let element=first.parentElement;element;element=element.parentElement){
        const style=getComputedStyle(element);
        if(element.scrollHeight>element.clientHeight+70 && /auto|scroll/.test(style.overflowY))
          return element;
      }
    }
    const main=document.querySelector('[data-testid="main-view-container"], #main-view, main');
    if(main&&main.scrollHeight>main.clientHeight+70)return main;
    return document.scrollingElement||document.documentElement;
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
  $('provider').textContent=(provider==='spotify'?'Spotify':'Apple Music')+' · Saves one combined file across both providers';
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
        if(stall>=14)break;
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
        'No songs detected. Apple Music may not have finished loading, or its layout has changed. '+
        'Verify that songs and artists are visible, refresh the playlist, then capture again.'
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
