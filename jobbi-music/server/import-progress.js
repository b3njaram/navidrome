// Downloader-to-listener state adapter. Never infer an available library song from
// the mere success of a Soulseek peer transfer.
const tidy=x=>String(x||'').replace(/\\/g,'/').split('/').pop().trim().toLowerCase();
const text=x=>typeof x==='string'?x:'';
const stateOf=x=>text(x?.state||x?.status||x?.downloadState||x?.transferState).trim().toLowerCase();
export function downloadRows(raw){
  if(Array.isArray(raw))return raw;
  if(!raw||typeof raw!=='object')return [];
  for(const k of ['jobs','downloads','transfers','items','results','files']){
    if(Array.isArray(raw[k]))return raw[k];
    if(raw[k]&&typeof raw[k]==='object'&&Array.isArray(raw[k].items))return raw[k].items;
  }
  return [];
}
export function findTransfer(importRow,raw){
  const rows=downloadRows(raw),ourId=text(importRow.downloader_job_id);
  const jobId=row=>text(row?.job_id||row?.jobId||row?.id||row?.downloadId);
  if(ourId){
    const exact=rows.find(row=>jobId(row)===ourId);
    if(exact)return exact;
    // If the downloader supplies identifiers, an unrelated transfer with a
    // matching basename must never be confused with this listener's job.
    if(rows.some(row=>jobId(row)))return null;
  }
  const base=tidy(importRow.filename),peer=text(importRow.peer_username).toLowerCase();
  const matching=rows.filter(row=>{
    if(!row||typeof row!=='object')return false;
    const filename=tidy(row.filename||row.fileName||row.path||row.name||row.file?.filename);
    if(!filename||filename!==base)return false;
    const actualPeer=text(row.username||row.peer||row.user).toLowerCase();
    return !peer||!actualPeer||actualPeer===peer;
  });
  // If neither the job identifier nor a peer is reported, we only accept a
  // unique filename match. Ambiguous matches remain explicitly unconfirmed.
  return matching.length===1?matching[0]:null;
}
export function transferStage(row,found,upstreamHealthy){
  if(!found){
    if(row.status==='needs_review')return {
      stage:'unconfirmed',
      label:upstreamHealthy?
        'No active transfer found · this attempt was not confirmed':
        'No transfer confirmed · downloader status unavailable',
      progress:null
    };
    const age=Date.now()-Date.parse(row.created_at||row.submittedAt||'');
    if(upstreamHealthy&&row.status==='queued'&&Number.isFinite(age)&&age>10*60*1000)
      return {stage:'unconfirmed',label:'Queue entry not found after 10 minutes · check NAS',progress:null};
    return upstreamHealthy?
      {stage:'queued',label:'Queued · waiting for peer / transfer',progress:null}:
      {stage:'unconfirmed',label:'Transfer service unavailable · retry status check',progress:null};
  }
  const status=stateOf(found);
  const rawPercent=found.percentage??found.percent??found.progress??found.progressPercent;
  let progress=Number(rawPercent);
  if(!Number.isFinite(progress))progress=null;
  else{
    if(progress>=0&&progress<=1&&found.progress!==undefined&&found.percentage===undefined&&found.percent===undefined)
      progress*=100;
    progress=Math.max(0,Math.min(100,Math.round(progress)));
  }
  if(['failed','error','aborted','rejected','cancelled','canceled','timedout','timeout'].some(x=>status.includes(x)))
    return {stage:'failed',label:'Transfer failed · inspect downloader logs',progress:null};
  if(['imported','moved','indexed','in_library','in library','library'].some(x=>status.includes(x)))
    return {stage:'imported',label:'Imported · checking Navidrome library',progress:100};
  if(['complete','completed','finished','success','done'].some(x=>status.includes(x)))
    return {stage:'indexing',label:'Download completed · waiting for NAS import/indexing',progress:100};
  if(['download','transferr','receiv','active','running','in_progress','in progress'].some(x=>status.includes(x))||
     (progress!==null&&progress>0))
    return {stage:'downloading',label:progress===null?'Downloading from Soulseek peer':`Downloading · ${progress}%`,progress};
  if(['queued','waiting','pending','requested','paused','retry'].some(x=>status.includes(x)))
    return {stage:'queued',label:'Queued · waiting for Soulseek peer',progress:null};
  return {stage:'unconfirmed',label:'Transfer status unknown · inspect NAS transfer',progress:null};
}
export async function latestTransferSnapshot(downloader){
  if(!downloader)return {healthy:false,rows:[]};
  try{
    const response=await fetch(downloader+'/api/downloads',{
      signal:AbortSignal.timeout(6500),headers:{Accept:'application/json'},redirect:'error'});
    if(!response.ok)return {healthy:false,rows:[]};
    const body=await response.text();
    if(body.length>600000)return {healthy:false,rows:[]};
    const data=JSON.parse(body);
    return {healthy:true,rows:downloadRows(data).slice(0,1000)};
  }catch{return {healthy:false,rows:[]};}
}
