package com.jobbisoft.music.nativeplayer

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import java.util.concurrent.ConcurrentHashMap

/**
 * Driver-safe, read-only music browser for Android Auto.
 *
 * Uses the same authenticated Navidrome endpoints as the phone app; it never
 * publishes passwords/cookies, performs account changes or submits downloads.
 * External browsing requires the listener to have signed in on the phone.
 * Android Auto is responsible for rendering and distraction limits.
 */
internal class AndroidAutoLibrary(private val context: Context) {
    companion object {
        const val ROOT = "jobbi:auto:root"
        const val HOME = "jobbi:auto:home"
        const val QUEUE = "jobbi:auto:queue"
        const val HOME_PLAYLISTS = "jobbi:auto:home-playlists"
        const val HOME_RECENT = "jobbi:auto:home-recent"
        const val HOME_WEEK = "jobbi:auto:home-week"
        const val HOME_MIX = "jobbi:auto:home-mix"
        const val FAVORITES = "jobbi:auto:favorites"
        const val PLAYLISTS = "jobbi:auto:playlists"
        const val ALBUMS = "jobbi:auto:albums"
        const val RECENT = "jobbi:auto:recent"
        const val DOWNLOADED = "jobbi:auto:downloaded"
        const val SIGN_IN = "jobbi:auto:sign-in"
        const val PREFIX_PLAYLIST = "jobbi:auto:playlist:"
        const val PREFIX_ALBUM = "jobbi:auto:album:"
    }

    private val index = ConcurrentHashMap<String, Song>()
    private val browseIndex = ConcurrentHashMap<String, MediaItem>()
    private val songCollections = ConcurrentHashMap<String, String>()
    @Volatile private var indexedAccount = ""

    private fun syncAccount() {
        val current = JobbiApi.username
        if (current != indexedAccount) {
            index.clear()
            browseIndex.clear()
            songCollections.clear()
            indexedAccount = current
        }
    }

    fun root(): MediaItem = category(ROOT, "Jobbi Music")
    private fun category(id: String, title: String, subtitle: String = ""): MediaItem {
        return MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(MediaMetadata.Builder()
                .setTitle(title)
                .setDescription(subtitle)
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .build())
            .build()
    }

    fun cachedItem(id: String): MediaItem? {
        syncAccount()
        if (id == ROOT) return root()
        browseIndex[id]?.let { return it }
        val parent = when (id) {
            HOME -> "Home"
            QUEUE -> "Up Next"
            HOME_PLAYLISTS -> "Your Playlists"
            HOME_RECENT -> "Jump Back In"
            HOME_WEEK -> "Most Played This Week"
            HOME_MIX -> "Made for You"
            FAVORITES -> "Favorite Songs"
            PLAYLISTS -> "Playlists"
            ALBUMS -> "Albums"
            RECENT -> "Recently Added"
            DOWNLOADED -> "Downloads"
            SIGN_IN -> "Open Jobbi Music on your phone to sign in"
            else -> null
        }
        if (parent != null) return category(id, parent)
        return index[id]?.let(::playable)
    }

    private fun album(album: Album): MediaItem =
        MediaItem.Builder()
            .setMediaId(PREFIX_ALBUM + album.id)
            .setMediaMetadata(MediaMetadata.Builder()
                .setTitle(album.name)
                .setArtist(album.artist)
                .setArtworkUri(JobbiApi.coverUrl(album.cover)?.let(Uri::parse))
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .build())
            .build().also { browseIndex[it.mediaId] = it }

    private fun playlist(playlist: MusicPlaylist): MediaItem =
        category(PREFIX_PLAYLIST + playlist.id,
            playlist.name, "${playlist.count} songs")
            .also { browseIndex[it.mediaId] = it }

    private fun playable(song: Song): MediaItem {
        val offline = JobbiDownloads.playableUri(context, JobbiApi.username,
            JobbiApi.serverUrl(), song.id)
        return MediaItem.Builder()
            .setMediaId(song.id)
            .setUri(offline ?: Uri.parse(JobbiApi.streamUrl(song.id)))
            .setMediaMetadata(MediaMetadata.Builder()
                .setTitle(song.title)
                .setArtist(song.artist)
                .setAlbumTitle(song.album)
                .setDurationMs(SystemMediaControls.durationMillis(song.duration))
                .setArtworkUri(JobbiApi.coverUrl(song.cover)?.let(Uri::parse))
                .setIsBrowsable(false)
                .setIsPlayable(true)
                .build())
            .build()
    }

    private fun songs(items: List<Song>, parentId: String? = null): List<MediaItem> {
        syncAccount()
        return items.filter { it.id.isNotBlank() }.take(500).map {
            index[it.id] = it
            if(parentId!=null) songCollections[it.id]=parentId
            playable(it)
        }
    }

    private fun hasOfflineIdentity(): Boolean {
        val name=JobbiApi.username
        return name.isNotBlank() &&
            JobbiDownloads.downloadedSongs(context,name,JobbiApi.serverUrl()).isNotEmpty()
    }

    /** Public only in structure; every child checks the active verified session
     * or an account-scoped offline identity before revealing private titles.
     */
    suspend fun children(parentId: String): List<MediaItem> {
        syncAccount()
        val online=JobbiApi.csrf.isNotBlank() && JobbiApi.username.isNotBlank()
        val offline=if(!online)hasOfflineIdentity() else false
        if(parentId==ROOT) {
            if(!online&&!offline)
                return listOf(category(SIGN_IN,"Open Jobbi Music on your phone to sign in"))
            if(!online) return listOf(
                category(HOME,"Home"),
                category(DOWNLOADED,"Downloaded Music"),
                category(QUEUE,"Up Next"))
            return listOf(
                category(HOME,"Home"),
                category(PLAYLISTS,"Your Playlists"),
                category(FAVORITES,"Liked Songs"),
                category(ALBUMS,"Albums"),
                category(QUEUE,"Up Next"),
                category(DOWNLOADED,"Downloaded Music"),
                category(RECENT,"Recently Added"))
        }
        if(!online&&!offline)return emptyList()
        if(parentId==HOME){
            return if(!online)listOf(
                category(DOWNLOADED,"Play Downloaded Music"),
                category(QUEUE,"Up Next"))
            else listOf(
                category(HOME_PLAYLISTS,"Your Playlists"),
                category(HOME_RECENT,"Jump Back In"),
                category(HOME_WEEK,"Most Played This Week"),
                category(HOME_MIX,"Made for You"),
                category(FAVORITES,"Liked Songs"),
                category(QUEUE,"Up Next"),
                category(DOWNLOADED,"Offline Downloads"))
        }
        if(parentId==DOWNLOADED)return songs(JobbiDownloads.downloadedSongs(
            context,JobbiApi.username,JobbiApi.serverUrl()),DOWNLOADED)
        if(!online)return emptyList()
        return when(parentId){
            HOME_PLAYLISTS -> JobbiApi.playlists().take(300).map(::playlist)
            HOME_RECENT -> songs(JobbiApi.recommendations().recentTracks,HOME_RECENT)
            HOME_WEEK -> songs(JobbiApi.recommendations().topWeek,HOME_WEEK)
            HOME_MIX -> songs(JobbiApi.recommendations().madeForYou,HOME_MIX)
            RECENT -> songs(JobbiApi.home().songs,RECENT)
            FAVORITES -> songs(JobbiApi.favorites(),FAVORITES)
            PLAYLISTS -> JobbiApi.playlists().take(300).map(::playlist)
            ALBUMS -> JobbiApi.albums().take(300).map(::album)
            else -> when {
                parentId.startsWith(PREFIX_PLAYLIST) ->
                    songs(JobbiApi.openPlaylist(parentId.removePrefix(PREFIX_PLAYLIST)).songs,parentId)
                parentId.startsWith(PREFIX_ALBUM) ->
                    songs(JobbiApi.openAlbum(parentId.removePrefix(PREFIX_ALBUM)).songs,parentId)
                else -> emptyList()
            }
        }
    }

    /** When Android Auto selects a single track, preserve its containing
     * playlist instead of replacing the entire listening queue with one song.
     */
    suspend fun browseQueueForSelection(mediaId: String): Pair<List<MediaItem>,Int>? {
        syncAccount()
        val parent=songCollections[mediaId] ?:return null
        val all=children(parent).filter {it.mediaMetadata.isPlayable==true}
        val start=all.indexOfFirst{it.mediaId==mediaId}
        return if(start>=0)all to start else null
    }

    /** Real Media3 player queue, not a stale NAS playlist cache. */
    fun upcoming(player: androidx.media3.common.Player): List<MediaItem> {
        if(JobbiApi.username.isBlank())return emptyList()
        if(JobbiApi.csrf.isBlank()&&!hasOfflineIdentity())return emptyList()
        val current=player.currentMediaItemIndex
        if(current<0)return emptyList()
        return (current+1 until player.mediaItemCount).take(300).map { position ->
            val playing=player.getMediaItemAt(position)
            playing.buildUpon().setMediaMetadata(
                playing.mediaMetadata.buildUpon().setIsPlayable(true)
                    .setIsBrowsable(false).build()).build()
        }
    }

    suspend fun search(query: String): List<MediaItem> {
        if (JobbiApi.csrf.isBlank() || query.isBlank()) return emptyList()
        return songs(JobbiApi.search(query.take(120)).songs)
    }

    /**
     * Old Android Auto hosts may send only a media ID rather than the stream
     * URI when choosing a browser item. Resolve from the authenticated catalog.
     * The regular phone controller already supplies playable local URIs.
     */
    fun resolveRequested(item: MediaItem): MediaItem {
        if (item.localConfiguration != null) return item
        return cachedItem(item.mediaId) ?: item
    }
}
