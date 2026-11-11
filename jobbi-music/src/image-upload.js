/**
 * Resize large phone pictures before POSTing them to the fixed 1 MiB image
 * endpoints. Kept on the device; the server receives only the final JPEG.
 * HEIC conversion depends on native image decode support of the browser.
 */
export const MAX_UPLOAD_BYTES=1048576;
export function usableOriginalImage(file) {
  return Boolean(file && file.size>=16 && file.size<=MAX_UPLOAD_BYTES &&
    ['image/jpeg','image/png','image/webp'].includes(file.type));
}
export async function prepareImageUpload(file,options={}){
  if(!file || typeof file.size!=='number')throw new Error('Select a picture first');
  if(file.size>40*1024*1024)throw new Error('This picture is too large (maximum source size is 40 MB)');
  if(usableOriginalImage(file))return file;
  if(file.size<16)throw new Error('This file is not a valid picture');
  const maxBytes=options.maxBytes||MAX_UPLOAD_BYTES;
  let source=null,url=null;
  try {
    if(typeof createImageBitmap==='function'){
      try{source=await createImageBitmap(file)}catch{}
    }
    if(!source){
      url=URL.createObjectURL(file);
      source=await new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>resolve(img);
        img.onerror=()=>reject(new Error('This browser cannot decode the picture. Export it as JPEG or PNG first.'));
        img.src=url;
      });
    }
    const w=source.width||source.naturalWidth,h=source.height||source.naturalHeight;
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||w>30000||h>30000)
      throw new Error('Invalid image dimensions');
    let maxSide=1400;
    for(let scaleStep=0;scaleStep<7;scaleStep++){
      const factor=Math.min(1,maxSide/Math.max(w,h));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(w*factor));
      canvas.height=Math.max(1,Math.round(h*factor));
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('Picture converter is unavailable in this browser');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(source,0,0,canvas.width,canvas.height);
      for(const quality of [0.88,0.75,0.62,0.49,0.38]){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if(blob&&blob.size>=16&&blob.size<=maxBytes)
          return new File([blob],(file.name||'jobbi-photo').replace(/\.[^.]*$/,'')+'.jpg',
            {type:'image/jpeg'});
      }
      maxSide=Math.round(maxSide*0.75);
    }
    throw new Error('Picture could not be reduced to the server 1 MB limit');
  }finally{
    if(url)URL.revokeObjectURL(url);
    if(source&&typeof source.close==='function')source.close();
  }
}
