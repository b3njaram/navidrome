package com.jobbisoft.music.nativeplayer

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * True native Android Media3 foreground player, not a WebView or a browser
 * media session. The OS owns the notification and exposes next/previous
 * through the lock screen, Bluetooth, headphones and Android Auto controls.
 */
class MusicPlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val http = OkHttpDataSource.Factory(JobbiApi.client)
        val mediaSource = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(DefaultDataSource.Factory(this, http))
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSource)
            .build()
        player.setHandleAudioBecomingNoisy(true)
        player.setAudioAttributes(AudioAttributes.DEFAULT, true)
        player.repeatMode = Player.REPEAT_MODE_OFF
        session = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onDestroy() {
        session?.run { player.release(); release() }
        session = null
        super.onDestroy()
    }
}

class NativePlayer(private val context: Context) {
    var controller by mutableStateOf<MediaController?>(null)
        private set
    var playing by mutableStateOf(false)
        private set
    var active by mutableStateOf<Song?>(null)
        private set
    var position by mutableLongStateOf(0L)
        private set
    var duration by mutableLongStateOf(0L)
        private set
    var hasPrevious by mutableStateOf(false)
        private set
    var hasNext by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set
    var queue by mutableStateOf<List<Song>>(emptyList())
        private set

    private var pending: Pair<List<Song>,Int>? = null
    private var future: ListenableFuture<MediaController>? = null
    private var listener: Player.Listener? = null

    fun connect() {
        if (future != null) return
        val token = SessionToken(context, ComponentName(context, MusicPlaybackService::class.java))
        val handle = MediaController.Builder(context, token).buildAsync()
        future = handle
        handle.addListener({
            try {
                val mediaController = handle.get()
                controller = mediaController
                val sync = object : Player.Listener {
                    override fun onEvents(player: Player, events: Player.Events) { syncFromPlayer(player) }
                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        this@NativePlayer.error = error.localizedMessage ?: "Audio playback failed"
                    }
                }
                listener = sync
                mediaController.addListener(sync)
                syncFromPlayer(mediaController)
                pending?.let { (items, index) -> pending = null; play(items, index) }
            } catch (e: Exception) {
                error = "Cannot connect to native audio service: ${e.message}"
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun syncFromPlayer(player: Player) {
        playing = player.isPlaying
        val index = player.currentMediaItemIndex
        val song = queue.getOrNull(index)
        active = song
        duration = if (player.duration > 0 && player.duration != androidx.media3.common.C.TIME_UNSET)
            player.duration else (song?.duration ?: 0L) * 1000L
        position = player.currentPosition.coerceAtLeast(0)
        hasPrevious = player.hasPreviousMediaItem()
        hasNext = player.hasNextMediaItem()
    }

    fun tick() {
        controller?.let { syncFromPlayer(it) }
    }

    fun play(songs: List<Song>, start: Int = 0) {
        if (songs.isEmpty()) return
        queue = songs
        val chosen = start.coerceIn(0, songs.lastIndex)
        val c = controller
        if (c == null) { pending = songs to chosen; connect(); return }
        val items = songs.map { song ->
            val metadata = MediaMetadata.Builder()
                .setTitle(song.title)
                .setArtist(song.artist)
                .setAlbumTitle(song.album)
                .setArtworkUri(JobbiApi.coverUrl(song.cover)?.let(Uri::parse))
                .build()
            MediaItem.Builder()
                .setMediaId(song.id)
                .setUri(Uri.parse(JobbiApi.streamUrl(song.id)))
                .setMediaMetadata(metadata)
                .build()
        }
        error = ""
        c.setMediaItems(items,chosen,0)
        c.prepare()
        c.play()
        syncFromPlayer(c)
    }

    fun toggle() {
        controller?.let { if(it.isPlaying) it.pause() else {it.prepare();it.play()} }
    }
    fun next() {
        controller?.let { if(it.hasNextMediaItem())it.seekToNextMediaItem() }
    }
    fun previous() {
        controller?.let {
            if (it.hasPreviousMediaItem()) it.seekToPreviousMediaItem()
            else it.seekTo(0)
        }
    }
    fun seek(ms: Long) { controller?.seekTo(ms.coerceIn(0L,duration.coerceAtLeast(0L))) }
    fun shuffle(enabled: Boolean) { controller?.shuffleModeEnabled=enabled }
    fun repeat(mode: Int) { controller?.repeatMode=mode }
    fun stop() {
        pending = null
        controller?.stop()
        controller?.clearMediaItems()
        queue = emptyList()
        active = null
        playing = false
    }
    fun disconnect() {
        listener?.let { listener -> controller?.removeListener(listener) }
        controller?.release()
        future?.let(MediaController::releaseFuture)
        controller = null
        future = null
    }
}
