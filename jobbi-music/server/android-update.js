const URL='https://api.github.com/repos/b3njaram/navidrome/releases?per_page=20';
let cache={when:0,data:{available:false,reason:'No public signed Android release has been published'}};
const parseVersion=tag=>{
  const m=/^android-v(\d+)\.(\d+)\.(\d+)$/.exec(String(tag||''));
  if(!m)return null;
  return {version:`${m[1]}.${m[2]}.${m[3]}`,numbers:[Number(m[1]),Number(m[2]),Number(m[3])]};
};
export function findAndroidRelease(releases){
  if(!Array.isArray(releases))return {available:false};
  const matches=[];
  for(const release of releases){
    if(release.draft||release.prerelease)continue;
    const parsed=parseVersion(release.tag_name);
    if(!parsed)continue;
    const asset=(release.assets||[]).find(a=>{
      const url=String(a.browser_download_url||'');
      return /\.apk$/i.test(a.name||'')&&
        url.startsWith('https://github.com/b3njaram/navidrome/releases/download/android-v');
    });
    if(!asset)continue;
    matches.push({...parsed,downloadUrl:asset.browser_download_url,
      notesUrl:`https://github.com/b3njaram/navidrome/releases/tag/${release.tag_name}`,
      sizeBytes:asset.size||0,sha256:typeof asset.digest==='string'&&asset.digest.startsWith('sha256:')?asset.digest.slice(7):null});
  }
  matches.sort((a,b)=>{for(let i=0;i<3;i++)if(a.numbers[i]!==b.numbers[i])return b.numbers[i]-a.numbers[i];return 0});
  if(!matches.length)return {available:false,reason:'No signed Android release has been published yet'};
  const {numbers,...best}=matches[0];return {available:true,...best};
}
export async function androidLatest(){
  if(Date.now()-cache.when<60*60*1000)return cache.data;
  try{
    const response=await fetch(URL,{headers:{Accept:'application/vnd.github+json','User-Agent':'Jobbi-Music-Updater'},signal:AbortSignal.timeout(7000)});
    if(!response.ok)throw Error('Release metadata unavailable');
    const data=await response.json();
    cache={when:Date.now(),data:findAndroidRelease(data)};
  }catch{
    // Fail closed on remote errors; don't invent a latest version or URL.
    cache={when:Date.now(),data:{available:false,reason:'Could not check releases right now'}};
  }
  return cache.data;
}