export class NativeAdminError extends Error {
  constructor(message,status=502){super(message);this.status=status;}
}
const recognizedToken=obj=>obj?.token||obj?.accessToken||obj?.access_token||obj?.data?.token||obj?.data?.accessToken;
function safeName(x){return typeof x==='string'&&/^[a-zA-Z0-9_-]{3,40}$/.test(x);}
export function validateNewAccount(data){
  const {username,password,name,email}=data||{};
  if(!safeName(username))throw new NativeAdminError('Username must contain 3–40 letters, numbers, underscores or hyphens',400);
  if(typeof password!=='string'||password.length<12||password.length>128)throw new NativeAdminError('Password must contain 12–128 characters',400);
  if(name!==undefined&&(typeof name!=='string'||name.length>80))throw new NativeAdminError('Invalid display name',400);
  if(email!==undefined&&(typeof email!=='string'||email.length>200||(email.length>0&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))throw new NativeAdminError('Invalid email',400);
  return {userName:username,password,name:String(name||username).trim(),email:String(email||'').trim(),isAdmin:false};
}
async function request(url,options={}){
  const result=await fetch(url,{...options,signal:AbortSignal.timeout(9000)});
  const raw=await result.text();
  let data;try{data=raw?JSON.parse(raw):{}}catch{throw new NativeAdminError('Navidrome returned an unexpected response');}
  if(!result.ok)throw new NativeAdminError(result.status===401||result.status===403?'Navidrome administrator authentication failed':data?.message||data?.error||'Account service unavailable',result.status);
  return data;
}
export async function nativeToken(base,credentials){
  let error;
  for(const endpoint of ['/auth/login','/api/authenticate']){
    try{
      const data=await request(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:credentials.username,password:credentials.password})});
      const token=recognizedToken(data);
      if(typeof token!=='string'||token.length<20)throw new NativeAdminError('Navidrome login did not return an authentication token');
      return token;
    }catch(err){
      error=err;
      if(err.status!==404&&err.status!==405)break;
    }
  }
  throw error||new NativeAdminError('Navidrome native authentication is unavailable');
}
export async function nativeAccounts(base,credentials,{action,payload,id}={}){
  const token=await nativeToken(base,credentials);
  const headers={'X-ND-Authorization':'Bearer '+token,'Accept':'application/json','Content-Type':'application/json'};
  if(action==='list')return request(base+'/api/user',{headers});
  if(action==='create'){
    const body=validateNewAccount(payload);
    return request(base+'/api/user',{method:'POST',headers,body:JSON.stringify(body)});
  }
  if(action==='delete'){
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new NativeAdminError('Invalid user ID',400);
    return request(base+'/api/user/'+encodeURIComponent(id),{method:'DELETE',headers});
  }
  throw new NativeAdminError('Unsupported account action',400);
}
