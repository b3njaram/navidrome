// Separate authenticated search budgets prevent automated playlist migration
// from exhausting both sources after a handful of missing tracks.
export function createMusicSearchLimiter({source,limit=60,windowMs=10*60*1000,clock=Date.now}={}){
  if(!source||!Number.isInteger(limit)||limit<1)throw Error('Invalid music search budget');
  const buckets=new Map();
  return (req,res,next)=>{
    const account=String(req.user?.username||'').toLowerCase();
    if(!account)return res.status(401).json({error:'Sign in to search music'});
    const now=clock();
    const previous=buckets.get(account);
    const state=!previous||now-previous.start>=windowMs
      ?{start:now,count:0}:previous;
    if(state.count>=limit){
      const seconds=Math.max(1,Math.ceil((state.start+windowMs-now)/1000));
      res.setHeader('Retry-After',String(seconds));
      return res.status(429).json({
        error:source+' search pause: '+limit+' searches per '+Math.ceil(windowMs/60000)+
          ' minutes. Resume in '+seconds+' seconds.',
        retryAfterSeconds:seconds,
        quota:'search',
        source
      });
    }
    state.count++;
    buckets.set(account,state);
    // Clean up idle accounts so long-running NAS processes do not leak memory.
    if(buckets.size>3000)for(const [name,bucket] of buckets){
      if(now-bucket.start>=windowMs)buckets.delete(name);
    }
    next();
  };
}
