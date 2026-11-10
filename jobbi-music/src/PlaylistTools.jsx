import React,{useState} from 'react';
import {Heart,UsersRound,Globe2,Lock,Search,ImagePlus,LoaderCircle} from 'lucide-react';

/** Native Navidrome playlist tools. Collaboration creates a separate social
 * copy because Subsonic playlist edits are restricted to the owner. */
export default function PlaylistTools({
  detail,playlistId,isPlaylist,api,onUpdate,onSocial,onFavoriteAll,
  onArtwork,onError,search,onSearch,disabled=false
}){
  const [busy,setBusy]=useState('');
  const work=async(label,fn)=>{
    setBusy(label);
    try{await fn()}catch(e){onError(e.message||'Operation failed')}finally{setBusy('')}
  };
  const visibility=detail?.public===true||detail?.public==='true';
  return <div className="playlist-tools">
    {isPlaylist&&<>
      <div className="playlist-tools-row">
        <button type="button" className="playlist-tool-button" disabled={!!busy||disabled} onClick={()=>work('share',async()=>{
          const out=await api('/api/social/playlists/import',{method:'POST',body:JSON.stringify({navidromePlaylistId:playlistId,visibility:'private'})});
          onSocial(out.id);
        })}>{busy==='share'?<LoaderCircle size={16}/>:<UsersRound size={16}/>} Invite collaborators</button>
        <button type="button" className="playlist-tool-button" disabled={!!busy||disabled} onClick={()=>work('privacy',async()=>{
          if(!visibility&&!window.confirm('Make this playlist visible to all signed-in Navidrome listeners?'))return;
          const out=await api('/api/playlists/'+encodeURIComponent(playlistId),{method:'PATCH',body:JSON.stringify({public:!visibility})});
          onUpdate(out.playlist);
        })}>{visibility?<><Globe2 size={16}/> Public · Make private</>:<><Lock size={16}/> Private · Make public</>}</button>
        <button type="button" className="playlist-tool-button" disabled={!!busy||disabled||!(detail?.entry||[]).length} onClick={()=>work('all',onFavoriteAll)}>{busy==='all'?<LoaderCircle size={16}/>:<Heart size={16}/>} Heart all songs</button>
      </div>
      <p className="playlist-tools-note">Invitations open a collaborative Jobbi Music copy. Changes in that copy do not change your original Navidrome playlist.</p>
      <label className="playlist-find"><Search size={17}/><input aria-label="Find a song in this playlist" type="search" placeholder="Find a song within this playlist…" value={search} onChange={e=>onSearch(e.target.value)}/>{search&&<button type="button" onClick={()=>onSearch('')}>Clear</button>}</label>
    </>}
    <label className="playlist-tool-button artwork-upload"><ImagePlus size={16}/> Upload {isPlaylist?'playlist':'album'} picture
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={e=>{
        const file=e.currentTarget.files?.[0];
        if(!file)return;
        if(file.size>1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){onError('Choose a JPEG, PNG, or WebP picture under 1 MB');e.currentTarget.value='';return}
        work('art',()=>onArtwork(file)).finally(()=>{e.target.value=''});
      }}/>
    </label>
  </div>;
}
