// Normalize OpenSubsonic structured and legacy lyrics, without inventing text.
const timePattern=/^\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\](.*)$/;
export function parseLrc(raw){
  if(typeof raw!=='string')return [];
  const lines=[];
  for(const original of raw.split(/\r?\n/).slice(0,6000)){
    const matches=[...original.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    if(!matches.length)continue;
    const content=original.replace(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g,'').trim();
    for(const match of matches){
      const frac=match[3]||'';
      const ms=(Number(match[1])*60+Number(match[2]))*1000+
        (frac?Number((frac+'00').slice(0,3)):0);
      if(Number.isFinite(ms))lines.push({at:ms,text:content||'♪'});
    }
  }
  return lines.sort((a,b)=>a.at-b.at).slice(0,2500);
}
export function normalizeLyrics(structured,legacy){
  for(const group of structured?.structuredLyrics||[]){
    if(!Array.isArray(group.line)||!group.line.length)continue;
    const lines=group.line.map(x=>({
      at:Number.isFinite(Number(x.start))?Math.max(0,Number(x.start)):null,
      text:String(x.value||'♪').slice(0,1000)
    })).filter(x=>x.text).slice(0,2500);
    if(!lines.length)continue;
    const timed=group.synced===true&&lines.some(x=>x.at!==null);
    return {available:true,synced:timed,source:'Navidrome',lines:timed?lines:lines.map(x=>({...x,at:null}))};
  }
  const text=typeof legacy==='string'?legacy:typeof legacy?.lyrics==='string'?legacy.lyrics:'';
  const parsed=parseLrc(text);
  if(parsed.length)return {available:true,synced:true,source:'Navidrome',lines:parsed};
  const plain=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,2500);
  return {available:plain.length>0,synced:false,source:'Navidrome',lines:plain.map(text=>({at:null,text}))};
}
export function lineAt(lines,seconds){
  if(!lines?.length||!Number.isFinite(seconds))return -1;
  const position=seconds*1000;
  let found=-1;
  for(let i=0;i<lines.length;i++){
    if(lines[i].at===null)continue;
    if(lines[i].at>position)break;
    found=i;
  }
  return found;
}