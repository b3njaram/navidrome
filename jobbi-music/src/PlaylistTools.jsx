import React,{useState} from 'react';
import {Heart,UsersRound,Globe2,Lock,Search,ImagePlus,LoaderCircle} from 'lucide-react';

/** Native Navidrome playlist tools. Collaboration creates a separate social
 * copy because Subsonic playlist edits are restricted to the owner. */
export default function PlaylistTools({
  detail,playlistId,isPlaylist,api,onUpdate,onSocial,onFavoriteAll,
  onArtwork,onError,search,onSearch,viewer,disabled=false
}){
  const [busy,setBusy]=useState('');
  const work=async(label,fn)=>{
    setBusy(label);
    try{await fn()}catch(e){onError(e.message||'Operation failed')}finally{setBusy('')}
  };
  const visibility=detail?.public===true||detail?.public==='true';
  const owner=String(detail?.owner||'').trim();
  const canEdit=!owner || owner.toLowerCase()===String(viewer||'').toLowerCase();
  return <div className="playlist-tools">
    {isPlaylist&&<>
      <div className="playlist-tools-row">
        <button type="button" className="playlist-tool-button" disabled={!!busy||disabled} onClick={()=>work('share',async()=>{
          const out=await api('/api/social/playlists/import',{method:'POST',body:JSON.stringify({navidromePlaylistId:playlistId,visibility:'private'})});
          onSocial(out.id);
        })}>{busy==='share'?<LoaderCircle size={16}/>:<UsersRound size={16}/>} Invite collaborators</button>
        <button type="button" role="switch" aria-checked={visibility}
          aria-label={visibility?'Public · Make private':'Private · Make public'}
          title={canEdit?'Change playlist visibility':'Only the playlist owner can change visibility'}
          className="playlist-tool-button playlist-visibility-switch"
          disabled={!!busy||disabled||!canEdit}
          onClick={()=>work('privacy',async()=>{
            const desired=!visibility;
            const out=await api('/api/playlists/'+encodeURIComponent(playlistId),{
              method:'PATCH',body:JSON.stringify({public:desired})
            });
            if(!out?.playlist||out.playlist.public!==desired)
              throw new Error('The music server did not confirm the visibility change.');
            onUpdate(out.playlist);
          })}>
          {visibility?<Globe2 size={16}/>:<Lock size={16}/>}
          <span>{visibility?'Public':'Private'}</span>
          <span className={'playlist-switch-track'+(visibility?' is-on':'')} aria-hidden="true"><span/></span>
        </button>
        <button type="button" className="playlist-tool-button" disabled={!!busy||disabled||!(detail?.entry||[]).length} onClick={()=>work('all',onFavoriteAll)}>{busy==='all'?<LoaderCircle size={16}/>:<Heart size={16}/>} Heart all songs</button>
      </div>
      {!canEdit&&<p className="playlist-tools-note">Only the playlist owner ({owner}) can change visibility.</p>}
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
