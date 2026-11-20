package com.jobbisoft.music.nativeplayer

import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** Session callback shared by Android Auto, legacy car hosts and voice search. */
internal class CarMediaSessionCallback(
    private val library: AndroidAutoLibrary,
    private val scope: CoroutineScope
) : MediaLibraryService.MediaLibrarySession.Callback {
    override fun onGetLibraryRoot(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        params: MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<MediaItem>> =
        Futures.immediateFuture(LibraryResult.ofItem(library.root(), params))

    override fun onGetChildren(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        parentId: String,
        page: Int,
        pageSize: Int,
        params: MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        val result = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
        scope.launch {
            try {
                val all = if(parentId==AndroidAutoLibrary.QUEUE)
                    library.upcoming(session.player) else library.children(parentId)
                val start = page.toLong() * pageSize.toLong()
                val shown = if (start < all.size && page >= 0) {
                    all.drop(start.toInt()).take(pageSize.coerceIn(1, 500))
                } else emptyList()
                result.set(LibraryResult.ofItemList(shown, params))
            } catch (e: Exception) {
                // Keep the rest of the phone app functional if the NAS is off.
                result.set(LibraryResult.ofItemList(emptyList(), params))
            }
        }
        return result
    }

    override fun onGetItem(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        mediaId: String
    ): ListenableFuture<LibraryResult<MediaItem>> {
        val item = library.cachedItem(mediaId)
        return if (item != null)
            Futures.immediateFuture(LibraryResult.ofItem(item, null))
        else
            Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE))
    }

    override fun onSearch(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        query: String,
        params: MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<Void>> {
        val result = SettableFuture.create<LibraryResult<Void>>()
        scope.launch {
            try {
                val tracks = library.search(query)
                result.set(LibraryResult.ofVoid(params))
                if (query.isNotBlank()) {
                    session.notifySearchResultChanged(browser, query, tracks.size, params)
                }
            } catch (e: Exception) {
                result.set(LibraryResult.ofVoid(params))
                if (query.isNotBlank()) {
                    session.notifySearchResultChanged(browser, query, 0, params)
                }
            }
        }
        return result
    }

    override fun onGetSearchResult(
        session: MediaLibraryService.MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        query: String,
        page: Int,
        pageSize: Int,
        params: MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        val result = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
        scope.launch {
            try {
                val all = library.search(query)
                val start = page.toLong() * pageSize.toLong()
                val shown = if (start < all.size && page >= 0) {
                    all.drop(start.toInt()).take(pageSize.coerceIn(1, 500))
                } else emptyList()
                result.set(LibraryResult.ofItemList(shown, params))
            } catch (e: Exception) {
                result.set(LibraryResult.ofItemList(emptyList(), params))
            }
        }
        return result
    }

    override fun onSetMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: List<MediaItem>,
        startIndex: Int,
        startPositionMs: Long
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
        val future=SettableFuture.create<MediaSession.MediaItemsWithStartPosition>()
        scope.launch {
            try {
                val requested=mediaItems.map(library::resolveRequested)
                // Tapping an item inside Up Next should jump in the current
                // session queue, not discard everything after that song.
                val playing=mediaSession.player
                val queueIndex=if(mediaItems.size==1)
                    (playing.currentMediaItemIndex+1 until playing.mediaItemCount)
                        .firstOrNull { playing.getMediaItemAt(it).mediaId==
                            mediaItems.first().mediaId } else null
                val queued=queueIndex?.let{index->
                    (0 until playing.mediaItemCount).map(playing::getMediaItemAt) to index
                }
                // Selecting a track inside a browsed album or playlist must
                // preserve the entire collection for next/previous.
                val collection=if(queued==null&&mediaItems.size==1 &&
                    JobbiApi.username.isNotBlank())
                    library.browseQueueForSelection(mediaItems.first().mediaId)
                    else null
                val chosen=queued?:collection
                val tracks=chosen?.first?:requested
                val index=chosen?.second?:startIndex
                future.set(MediaSession.MediaItemsWithStartPosition(
                    tracks,if(index==C.INDEX_UNSET)0 else index,
                    startPositionMs))
            } catch(e: Exception) {
                val resolved=mediaItems.map(library::resolveRequested)
                future.set(MediaSession.MediaItemsWithStartPosition(
                    resolved,startIndex.coerceAtLeast(0),startPositionMs))
            }
        }
        return future
    }

    override fun onAddMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: List<MediaItem>
    ): ListenableFuture<List<MediaItem>> {
        // Phone playback already passes playable URIs. Legacy Android Auto
        // browsers may send only the media ID; map it to the same private stream.
        return Futures.immediateFuture(mediaItems.map(library::resolveRequested))
    }
}
