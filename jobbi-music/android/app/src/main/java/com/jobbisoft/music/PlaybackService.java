package com.jobbisoft.music;

import android.net.Uri;
import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.LibraryResult;
import androidx.media3.session.MediaLibraryService;
import androidx.media3.session.MediaSession;
import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Driver-safe Android Auto browsing of locally downloaded music.
 * No WebView, private session tokens, or Soulseek UI is exposed to the vehicle.
 */
@OptIn(markerClass = UnstableApi.class)
public final class PlaybackService extends MediaLibraryService {
    private static final String ROOT = "jobbi-offline-root";
    private MediaLibrarySession mediaSession;

    private MediaItem rootItem(){
        return new MediaItem.Builder().setMediaId(ROOT)
            .setMediaMetadata(new MediaMetadata.Builder()
                .setTitle("Downloaded music")
                .setIsBrowsable(true).setIsPlayable(false).build())
            .build();
    }
    private List<MediaItem> savedTracks(){
        final List<MediaItem> items=new ArrayList<>();
        final String current=OfflineStore.lastUser(this);
        if(current.isEmpty())return items;
        for(OfflineStore.Song song:OfflineStore.forUser(this,current)){
            final File file=song.file(this);
            if(!song.complete()||!file.isFile()||file.length()==0)continue;
            MediaMetadata data=new MediaMetadata.Builder()
                .setTitle(song.title).setArtist(song.artist).setAlbumTitle(song.album)
                .setIsPlayable(true).setIsBrowsable(false).build();
            items.add(new MediaItem.Builder().setMediaId(song.key)
                .setUri(Uri.fromFile(file)).setMediaMetadata(data).build());
        }
        return items;
    }
    @Override public void onCreate(){
        super.onCreate();
        ExoPlayer player=new ExoPlayer.Builder(this).build();
        player.setHandleAudioBecomingNoisy(true);
        mediaSession=new MediaLibrarySession.Builder(this,player,new MediaLibrarySession.Callback(){
            @Override public ListenableFuture<LibraryResult<MediaItem>> onGetLibraryRoot(
                MediaLibrarySession session,MediaSession.ControllerInfo browser,LibraryParams params){
                return Futures.immediateFuture(LibraryResult.ofItem(rootItem(),params));
            }
            @Override public ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetChildren(
                MediaLibrarySession session,MediaSession.ControllerInfo browser,
                String parentId,int page,int pageSize,LibraryParams params){
                if(!ROOT.equals(parentId))return Futures.immediateFuture(LibraryResult.ofItemList(new ArrayList<>(),params));
                final List<MediaItem> tracks=savedTracks();
                final int from=(int)Math.min((long)tracks.size(),(long)page*pageSize);
                final int to=Math.min(tracks.size(),from+pageSize);
                return Futures.immediateFuture(LibraryResult.ofItemList(tracks.subList(from,to),params));
            }
            @Override public ListenableFuture<LibraryResult<MediaItem>> onGetItem(
                MediaLibrarySession session,MediaSession.ControllerInfo browser,String mediaId){
                if(ROOT.equals(mediaId))return Futures.immediateFuture(LibraryResult.ofItem(rootItem(),null));
                for(MediaItem item:savedTracks())if(item.mediaId.equals(mediaId))
                    return Futures.immediateFuture(LibraryResult.ofItem(item,null));
                return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE));
            }
            @Override public ListenableFuture<List<MediaItem>> onAddMediaItems(
                MediaSession session,MediaSession.ControllerInfo controller,List<MediaItem> requested){
                final List<MediaItem> available=savedTracks();
                final List<MediaItem> chosen=new ArrayList<>();
                for(MediaItem item:requested){
                    for(MediaItem own:available)if(own.mediaId.equals(item.mediaId)){chosen.add(own);break;}
                }
                return Futures.immediateFuture(chosen);
            }
        }).build();
    }
    @Override public MediaLibrarySession onGetSession(MediaSession.ControllerInfo controllerInfo){
        return mediaSession;
    }
    @Override public void onDestroy(){
        if(mediaSession!=null){
            mediaSession.getPlayer().release();
            mediaSession.release();
            mediaSession=null;
        }
        super.onDestroy();
    }
}
