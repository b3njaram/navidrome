// Progressive streams may report Infinity even when Navidrome knows duration.
export const finiteSeconds=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
export const preferredDuration=(catalog,stream)=>finiteSeconds(catalog)||finiteSeconds(stream);
export const cappedPosition=(position,length)=>{const n=Number(position);if(!Number.isFinite(n))return 0;return Math.max(0,Math.min(n,finiteSeconds(length)||Number.MAX_SAFE_INTEGER));};
export const progressPercent=(position,length)=>{const total=finiteSeconds(length);return total?Math.max(0,Math.min(100,cappedPosition(position,total)*100/total)):0;};
export const endedTooEarly=(position,expected)=>{const total=finiteSeconds(expected),played=Number(position);return total>0&&Number.isFinite(played)&&total-played>Math.max(7,Math.min(18,total*.04));};
