import http from 'node:http';
import https from 'node:https';

// Fixed-origin passthrough for existing Subsonic/OpenSubsonic clients.
// Navidrome continues authenticating each request. This service neither
// generates credentials nor permits the client to choose an upstream host.
const OMIT=new Set([
  'connection','keep-alive','proxy-connection','transfer-encoding',
  'te','trailer','upgrade','proxy-authorization','proxy-authenticate',
  'host','cookie','x-forwarded-for','x-real-ip','true-client-ip','cf-connecting-ip',
  'x-nd-authorization'
]);

export function subsonicProxy(upstreamOrigin){
  const upstream=new URL(upstreamOrigin);
  if(!['http:','https:'].includes(upstream.protocol))throw Error('Navidrome upstream must use HTTP(S)');
  const client=upstream.protocol==='https:'?https:http;
  return function forward(req,res){
    const path=req.originalUrl.split('?')[0];
    if(!/^\/rest(?:\/|$)/.test(path))return res.status(404).end();
    if(!['GET','HEAD','POST'].includes(req.method)){
      res.setHeader('Allow','GET, HEAD, POST');
      return res.status(405).end();
    }
    const url=new URL(req.originalUrl,upstream);
    if(url.origin!==upstream.origin||!url.pathname.startsWith('/rest/'))return res.status(400).end();
    const headers={};
    for(const [key,value] of Object.entries(req.headers)){
      if(!OMIT.has(key)&&value!==undefined)headers[key]=value;
    }
    const proxyReq=client.request(url,{method:req.method,headers},upstreamRes=>{
      res.statusCode=upstreamRes.statusCode||502;
      for(const [key,value] of Object.entries(upstreamRes.headers)){
        if(!OMIT.has(key)&&key!=='set-cookie'&&value!==undefined)res.setHeader(key,value);
      }
      upstreamRes.pipe(res);
    });
    proxyReq.on('error',()=>{
      if(!res.headersSent){res.status(502).json({error:'Navidrome API unavailable'});}
      else res.destroy();
    });
    proxyReq.setTimeout(120000,()=>proxyReq.destroy());
    req.on('aborted',()=>proxyReq.destroy());
    res.on('close',()=>{if(!res.writableEnded)proxyReq.destroy();});
    req.pipe(proxyReq);
  };
}
