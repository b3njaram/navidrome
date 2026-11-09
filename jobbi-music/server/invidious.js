const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const TIMEOUT_MS=8000;
const MAX_BYTES=1_500_000;
function validateInstance(input){
  try{
    const u=new URL(String(input||''));
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/' ||
      u.port||!u.hostname.includes('.')||u.hostname==='localhost')return null;
    return u.origin;
  }catch{return null;}
}
export function configuredInvidious(env=process.env){
  const raw=[env.INVIDIOUS_URL||'https://yt.jobbisoft.com.mx',
    ...(env.INVIDIOUS_BACKUPS||'').split(',')];
  return [...new Set(raw.map(x=>validateInstance(x.trim())).filter(Boolean))].slice(0,4);
}
export function normalizeInvidiousResults(rows,origin){
  if(!Array.isArray(rows))return [];
  return rows.filter(x=>x?.type==='video'&&VIDEO_ID.test(String(x.videoId||''))&&
    !x.liveNow&&!x.paid&&!x.premium)
    .slice(0,30).map(x=>({
      source:'invidious',id:x.videoId,
      title:String(x.title||'Untitled video').slice(0,200),
      artist:String(x.author||'Unknown channel').slice(0,120),
      duration:Math.max(0,Math.min(10800,Number(x.lengthSeconds)||0)),
      url:origin+'/watch?v='+encodeURIComponent(x.videoId),
      thumbnail:'/api/invidious/thumbnail/'+x.videoId,
      videoId:x.videoId,
      description:String(x.description||'').slice(0,500)
    }));
}
async function getJson(url){
  const res=await fetch(url,{redirect:'error',headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(TIMEOUT_MS)});
  if(!res.ok)throw Error('Invidious responded HTTP '+res.status);
  const raw=await res.text();
  if(raw.length>MAX_BYTES)throw Error('Invidious response exceeded size limit');
  let json;try{json=JSON.parse(raw)}catch{throw Error('Invidious returned invalid JSON')}
  return json;
}
export async function searchInvidious(query,{instances=configuredInvidious(),fetcher=getJson}={}){
  const q=String(query||'').trim().slice(0,150);
  if(q.length<2)return {source:'invidious',results:[],available:false,message:'Enter at least 2 characters'};
  const failures=[];
  for(const origin of instances){
    try{
      const url=new URL(origin+'/api/v1/search');
      url.searchParams.set('q',q);
      url.searchParams.set('type','video');
      url.searchParams.set('sort','relevance');
      const raw=await fetcher(url.toString());
      if(!Array.isArray(raw))throw Error('Unexpected search response');
      const results=normalizeInvidiousResults(raw,origin);
      // A healthy empty result should still try other configured instances.
      if(results.length)return {source:'invidious',instance:origin,results,available:true,
        message:'Videos are hosted on Invidious. Only import audio you have permission to save.'};
    }catch(e){failures.push(String(e.message||'Instance unavailable').slice(0,100))}
  }
  return {source:'invidious',available:false,results:[],message:
    failures.length===instances.length?'Invidious instances could not return usable results. Check your yt.jobbisoft.com.mx /api/v1/search endpoint.':
    'No matching videos found on the configured Invidious instances.'};
}
export function videoIdValid(id){return VIDEO_ID.test(String(id||''));}
