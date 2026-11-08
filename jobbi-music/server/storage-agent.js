import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function scanTree(root,{maxEntries=2000000}={}){
  const folders=[root];
  const AUDIO_EXTENSIONS=new Set(['.mp3','.flac','.m4a','.aac','.ogg','.opus','.wav','.aif','.aiff','.alac','.wma']);
  let musicBytes=0,libraryBytes=0,files=0,allFiles=0,foldersVisited=0,skipped=0;
  while(folders.length){
    const dir=folders.pop();
    let items;
    try{items=await fs.opendir(dir);}catch{skipped++;continue;}
    foldersVisited++;
    for await (const entry of items){
      const filepath=path.join(dir,entry.name);
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory()){folders.push(filepath);continue;}
      if(!entry.isFile())continue;
      try{
        const stat=await fs.lstat(filepath,{bigint:true});
        if(!stat.isFile())continue;
        libraryBytes+=Number(stat.size);
        allFiles++;
        if(AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())){
          musicBytes+=Number(stat.size);
          files++;
        }
      }catch{skipped++;}
      if(allFiles+foldersVisited>=maxEntries)throw new Error('Music library exceeds the configured scan limit');
    }
  }
  return {musicBytes,libraryBytes,files,allFiles,folders:foldersVisited,skipped};
}
export async function snapshot(musicDir='/music'){
  const mount=await fs.statfs(musicDir,{bigint:true});
  const blockBytes=Number(mount.bsize);
  const totalBytes=Number(mount.blocks)*blockBytes;
  const freeBytes=Number(mount.bavail)*blockBytes;
  const music=await scanTree(musicDir);
  return {status:'ready',checkedAt:new Date().toISOString(),totalBytes,freeBytes,
    usedBytes:totalBytes-(Number(mount.bfree)*blockBytes),...music};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const output=process.env.STORAGE_OUTPUT||'/stats/storage.json';
  const musicDir=process.env.MUSIC_ROOT||'/music';
  const intervalMs=Math.max(5*60000,Number(process.env.STORAGE_INTERVAL_MS)||30*60000);
  let running=false;
  const refresh=async()=>{
    if(running)return;running=true;
    try{
      const stats=await snapshot(musicDir);
      const temp=output+'.tmp';
      await fs.writeFile(temp,JSON.stringify(stats),{mode:0o644});
      await fs.rename(temp,output);
      process.stdout.write('Storage statistics refreshed\n');
    }catch(err){
      process.stderr.write('Storage scan unavailable: '+String(err.code||err.name||'unknown')+'\n');
      try{
        const failed={status:'unavailable',checkedAt:new Date().toISOString(),reason:'Storage scan could not finish'};
        await fs.writeFile(output,JSON.stringify(failed),{mode:0o644});
      }catch{}
    }finally{running=false;}
  };
  await refresh();
  setInterval(refresh,intervalMs);
}
