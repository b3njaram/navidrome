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
    @Volatile private var indexedAccount = ""

    private fun syncAccount() {
        val current = JobbiApi.username
        if (current != indexedAccount) {
            index.clear()
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
        val parent = when (id) {
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
            .build()

    private fun playlist(playlist: MusicPlaylist): MediaItem =
        category(PREFIX_PLAYLIST + playlist.id,
            playlist.name, "${playlist.count} songs")

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
                .setArtworkUri(JobbiApi.coverUrl(song.cover)?.let(Uri::parse))
                .setIsBrowsable(false)
                .setIsPlayable(true)
                .build())
            .build()
    }

    private fun songs(items: List<Song>): List<MediaItem> {
        syncAccount()
        return items.filter { it.id.isNotBlank() }.take(500).map {
            index[it.id] = it
            playable(it)
        }
    }

    suspend fun children(parentId: String): List<MediaItem> {
        syncAccount()
        if (parentId == ROOT) {
            if (JobbiApi.csrf.isBlank() || JobbiApi.username.isBlank()) {
                return listOf(category(SIGN_IN, "Open Jobbi Music to sign in"))
            }
            return listOf(
                category(RECENT, "Recently Added"),
                category(FAVORITES, "Favorite Songs"),
                category(PLAYLISTS, "Playlists"),
                category(ALBUMS, "Albums"),
                category(DOWNLOADED, "Downloads")
            )
        }
        if (JobbiApi.csrf.isBlank() || JobbiApi.username.isBlank()) return emptyList()
        return when (parentId) {
            RECENT -> songs(JobbiApi.home().songs)
            FAVORITES -> songs(JobbiApi.favorites())
            PLAYLISTS -> JobbiApi.playlists().take(300).map(::playlist)
            ALBUMS -> JobbiApi.albums().take(300).map(::album)
            DOWNLOADED -> songs(JobbiDownloads.downloadedSongs(
                context, JobbiApi.username, JobbiApi.serverUrl()))
            else -> when {
                parentId.startsWith(PREFIX_PLAYLIST) ->
                    songs(JobbiApi.openPlaylist(parentId.removePrefix(PREFIX_PLAYLIST)).songs)
                parentId.startsWith(PREFIX_ALBUM) ->
                    songs(JobbiApi.openAlbum(parentId.removePrefix(PREFIX_ALBUM)).songs)
                else -> emptyList()
            }
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
