const AUDIO_EXTENSION = /\.(mp3|flac|m4a|aac|ogg|opus|wav|aif|aiff|wma|alac)$/i;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const lower = x => String(x||'').toLowerCase();
const first = (...values) => values.find(x=>x!==undefined&&x!==null&&x!=='');
function attrNumber(attrs, type) {
  if(!Array.isArray(attrs))return undefined;
  const a=attrs.find(a=>String(a.type).toLowerCase()===String(type));
  return a ? Number(a.value) : undefined;
}

export function normalizeSlskdResponses(raw, query='', limit=180) {
  const peers=Array.isArray(raw)?raw:Array.isArray(raw?.responses)?raw.responses:Array.isArray(raw?.items)?raw.items:[];
  const rows=[],seen=new Set();
  const tokens=lower(query).trim().split(/\s+/).filter(Boolean);
  for(const response of peers){
    const username=first(response.username,response.user?.username,response.user,response.peer);
    if(typeof username!=='string'||!username)continue;
    const files=first(response.files,response.fileList,response.items,[]);
    if(!Array.isArray(files))continue;
    for(const file of files){
      const filename=first(file.filename,file.fileName,file.name);
      if(typeof filename!=='string'||!AUDIO_EXTENSION.test(filename))continue;
      const size=Number(first(file.size,file.fileSize,0));
      if(!Number.isSafeInteger(size)||size<1024)continue;
      const key=lower(username+'|'+filename);
      if(seen.has(key))continue;
      seen.add(key);
      const attrs=first(file.attributes,file.attr,[]);
      const bitrate=first(file.bitRate,file.bitrate,attrNumber(attrs,0));
      const duration=first(file.duration,attrNumber(attrs,1));
      const queueLength=Number(first(response.queueLength,response.queue,0))||0;
      const uploadSpeed=Number(first(response.uploadSpeed,response.speed,0))||0;
      const free=Boolean(first(response.hasFreeUploadSlot,response.freeUploadSlot,false));
      const name=filename.split(/[\\/]/).pop();
      const hits=tokens.filter(word=>lower(name).includes(word)).length;
      const ext=name.split('.').pop().toUpperCase();
      const row={username,filename,size,bitrate:bitrate==null?null:Number(bitrate)||null,
        duration:duration==null?null:Number(duration)||null,
        queueLength,uploadSpeed,freeUploadSlot:free,format:ext};
      const formatScore=ext==='FLAC'?40:ext==='MP3'?25:['M4A','ALAC','OPUS'].includes(ext)?20:10;
      row.relevanceScore=hits*100+formatScore+Math.min(40,Math.max(0,Number(bitrate)||0)/15)+(free?30:0)+Math.min(20,uploadSpeed/1024/1024)-Math.min(20,queueLength/10);
      rows.push(row);
    }
  }
  rows.sort((a,b)=>b.relevanceScore-a.relevanceScore||a.filename.localeCompare(b.filename));
  return {results:rows.slice(0,limit),total:rows.length,peerCount:peers.length};
}
async function jsonRequest(url,{method='GET',key,body,timeout=9000}={}){
  const r=await fetch(url,{method,headers:{'X-API-Key':key,'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
  const raw=await r.text();
  if(!r.ok){const reason=r.status===401||r.status===403?'Check the slskd API key and permissions':r.status===404?'slskd API endpoint unavailable':`slskd responded with HTTP ${r.status}`;const e=new Error(reason);e.httpStatus=r.status;throw e;}
  if(raw.length>3_000_000)throw new Error('slskd response exceeded the allowed size');
  try{return JSON.parse(raw)}catch{throw new Error('slskd returned an invalid JSON response')}
}
function complete(state){
  const value=lower(state?.state||state?.status);
  return state?.isComplete===true||state?.completed===true||['completed','complete','cancelled','timedout','timed out','failed'].includes(value);
}
export async function searchSlskd({url,key,query,searchTimeoutMs=18000,onProgress}){
  if(!/^https?:\/\//.test(url)||!key)throw new Error('slskd URL or API key is not configured');
  const base=url.replace(/\/$/,'');
  const body={searchText:query,searchTimeout:searchTimeoutMs,responseLimit:140,fileLimit:5000,filterResponses:false};
  const started=await jsonRequest(`${base}/api/v0/searches`,{method:'POST',key,body,timeout:9500});
  const id=started?.id;
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{10,80}$/.test(id))throw new Error('slskd did not return a valid search identifier');
  const startedAt=Date.now();
  const responses=new Map();
  let state=started,attempts=0;
  try {
    while(attempts<18 && Date.now()-startedAt<26000){
      attempts++;
      await wait(attempts===1?1200:1100);
      const returned=await jsonRequest(`${base}/api/v0/searches/${encodeURIComponent(id)}/responses`,{key,timeout:8000});
      const batch=Array.isArray(returned)?returned:returned?.responses||[];
      if(Array.isArray(batch))for(const peer of batch){const name=first(peer.username,peer.user?.username,peer.user);if(name)responses.set(String(name),peer);}
      if(attempts%3===0){
        try{state=await jsonRequest(`${base}/api/v0/searches/${encodeURIComponent(id)}`,{key,timeout:5000});}catch(e){if(e.httpStatus!==404)throw e;}
      }
      onProgress?.({attempts,peers:responses.size});
      if(complete(state))break;
    }
    const normalized=normalizeSlskdResponses([...responses.values()],query);
    return {...normalized,source:'slskd',searchId:id,elapsedMs:Date.now()-startedAt,
      message:normalized.total?'':"No audio files were returned by Soulseek peers. Try a broader query, alternate spelling, or check your slskd connection."};
  } finally {
    // Remove only the transient search started by this request.
    jsonRequest(`${base}/api/v0/searches/${encodeURIComponent(id)}`,{method:'DELETE',key,timeout:3000}).catch(()=>{});
  }
}
export async function slskdConnection({url,key}){
  const base=url.replace(/\/$/,'');
  const server=await jsonRequest(`${base}/api/v0/server`,{key,timeout:4500});
  return {serverConnected:Boolean(first(server.isConnected,server.connected,lower(server.state)==='connected')),
    state:first(server.state,server.status,'unknown')};
}
