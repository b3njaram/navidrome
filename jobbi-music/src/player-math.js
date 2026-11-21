// Progressive streams may report Infinity even when Navidrome knows duration.
export const finiteSeconds=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
// Use actual decoded media duration when finite; Navidrome metadata can be stale.
// The catalog is still the fallback for progressive streams reporting Infinity.
export const preferredDuration=(catalog,stream)=>finiteSeconds(stream)||finiteSeconds(catalog);
// A failed seek to the end of a truncated file must never silently replay it.
export const canSeekToSeconds=(ranges,target)=>{
  const seconds=Number(target);
  if(!Number.isFinite(seconds)||seconds<=0||!ranges)return false;
  try{for(let i=0;i<ranges.length;i++){
    if(ranges.start(i)<=seconds+0.25&&ranges.end(i)>=seconds-0.25)return true;
  }}catch{return false;}
  return false;
};
export const cappedPosition=(position,length)=>{const n=Number(position);if(!Number.isFinite(n))return 0;return Math.max(0,Math.min(n,finiteSeconds(length)||Number.MAX_SAFE_INTEGER));};
export const progressPercent=(position,length)=>{const total=finiteSeconds(length);return total?Math.max(0,Math.min(100,cappedPosition(position,total)*100/total)):0;};
export const endedTooEarly=(position,expected)=>{const total=finiteSeconds(expected),played=Number(position);return total>0&&Number.isFinite(played)&&total-played>Math.max(7,Math.min(18,total*.04));};

/** Count the same qualified listen on the web and Android native player.
 * Playback time (not seek position) must exceed half of the recording
 * or four minutes, whichever comes first. Very short songs use >=5 sec.
 */
export const listenThresholdSeconds=duration=>{
  const seconds=finiteSeconds(duration);
  return seconds?Math.min(240,Math.max(5,seconds/2)):30;
};
