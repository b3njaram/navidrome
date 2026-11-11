package com.jobbisoft.music.nativeplayer

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.core.content.ContextCompat
import android.os.SystemClock
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.TimeZone
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * True native Android Media3 foreground player, not a WebView or a browser
 * media session. The OS owns the notification and exposes next/previous
 * through the lock screen, Bluetooth, headphones and Android Auto controls.
 */
class MusicPlaybackService : MediaSessionService() {
    private var session: MediaSession? = null
    private var playback: ExoPlayer? = null
    // Account-aware listening history must live with the playback service,
    // not only the activity. Background playback still gets counted.
    private val scrobbleScope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private var activeSongId:String?=null
    private var activeDurationMs:Long=0L
    private var listenedMs:Long=0L
    private var lastClockMs=0L
    private var wasPlaying=false
    private var counted=false
    private var failed=false
    private val progressHandler=Handler(Looper.getMainLooper())
    private val listenTick=object:Runnable{
        override fun run(){
            sampleClock()
            recordIfQualified()
            val deadline=getSharedPreferences("jobbi-playback-timer",Context.MODE_PRIVATE)
                .getLong("pause-at",0L)
            if(deadline>0 && System.currentTimeMillis()>=deadline){
                playback?.pause()
                getSharedPreferences("jobbi-playback-timer",Context.MODE_PRIVATE)
                    .edit().remove("pause-at").apply()
            }
            progressHandler.postDelayed(this,5000L)
        }
    }

    private fun sampleClock(){
        val now=SystemClock.elapsedRealtime()
        if(wasPlaying&&lastClockMs>0L)
            listenedMs+=(now-lastClockMs).coerceIn(0L,10L*60L*1000L)
        lastClockMs=now
    }
    private fun recordIfQualified(){
        val songId=activeSongId?.takeIf{it.isNotBlank()}?:return
        if(counted||failed)return
        if(!isQualifiedListen(activeDurationMs,listenedMs))return
        counted=true
        val offset=-TimeZone.getDefault().getOffset(System.currentTimeMillis())/60000
        scrobbleScope.launch {
            runCatching {
                JobbiApi.post("/api/scrobble",JSONObject().put("id",songId)
                    .put("source","android").put("timezoneOffsetMinutes",offset))
            }
            // Offline play is local and no session can submit this event. It
            // never blocks playback, and errors aren't mistaken for song errors.
        }
    }
    private fun listenTo(player:ExoPlayer) {
        player.addListener(object:Player.Listener {
            override fun onIsPlayingChanged(isPlaying:Boolean){
                sampleClock()
                recordIfQualified()
                wasPlaying=isPlaying
            }
            override fun onEvents(player:Player,events:Player.Events){
                if(player.duration>0&&player.duration!=androidx.media3.common.C.TIME_UNSET)
                    activeDurationMs=player.duration
            }
            override fun onMediaItemTransition(mediaItem:MediaItem?,reason:Int){
                sampleClock()
                // Manual skip and queue changes also count if the old song has
                // already reached the qualified-play threshold.
                recordIfQualified()
                activeSongId=mediaItem?.mediaId?.takeIf{it.isNotBlank()}
                activeDurationMs=0L
                listenedMs=0L
                lastClockMs=SystemClock.elapsedRealtime()
                wasPlaying=player.isPlaying
                counted=false
                failed=false
            }
            override fun onPlaybackStateChanged(playbackState:Int){
                sampleClock()
                if(playbackState==Player.STATE_ENDED)recordIfQualified()
            }
            override fun onPlayerError(error:androidx.media3.common.PlaybackException){
                sampleClock()
                failed=true
            }
        })
    }

    override fun onCreate() {
        super.onCreate()
        val http = OkHttpDataSource.Factory(JobbiApi.client)
        val mediaSource = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(DefaultDataSource.Factory(this, http))
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSource)
            .build()
        playback=player
        player.setHandleAudioBecomingNoisy(true)
        player.setAudioAttributes(AudioAttributes.DEFAULT, true)
        player.repeatMode = Player.REPEAT_MODE_OFF
        listenTo(player)
        progressHandler.postDelayed(listenTick,5000L)
        session = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onDestroy() {
        progressHandler.removeCallbacks(listenTick)
        scrobbleScope.cancel()
        session?.run { player.release(); release() }
        session = null
        playback = null
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
    var currentIndex by mutableIntStateOf(-1)
        private set
    var shuffleEnabled by mutableStateOf(false)
        private set
    var repeatMode by mutableIntStateOf(Player.REPEAT_MODE_OFF)
        private set
    var sleepUntil by mutableLongStateOf(0L)
        private set
    private val songIndex=mutableMapOf<String,Song>()
    private fun timerPrefs()=context.getSharedPreferences("jobbi-playback-timer",Context.MODE_PRIVATE)

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
        val actual=(0 until player.mediaItemCount).map{n->
            val item=player.getMediaItemAt(n)
            songIndex[item.mediaId] ?: Song(
                id=item.mediaId,
                title=item.mediaMetadata.title?.toString() ?: "Unknown track",
                artist=item.mediaMetadata.artist?.toString() ?: "Unknown artist",
                album=item.mediaMetadata.albumTitle?.toString() ?: "",
                cover=null,duration=0L
            ).also{songIndex[item.mediaId]=it}
        }
        if(queue!=actual)queue=actual
        currentIndex=index
        val song=queue.getOrNull(index)
        active = song
        // The explicit upcoming-order shuffle is separate from Media3's
        // random traversal, so Play Next always remains the next song.
        repeatMode=player.repeatMode
        duration = if (player.duration > 0 && player.duration != androidx.media3.common.C.TIME_UNSET)
            player.duration else (song?.duration ?: 0L) * 1000L
        position = player.currentPosition.coerceAtLeast(0)
        hasPrevious = player.hasPreviousMediaItem()
        hasNext = player.hasNextMediaItem()
    }

    fun tick() {
        controller?.let { syncFromPlayer(it) }
        sleepUntil=timerPrefs().getLong("pause-at",0L)
    }

    private fun mediaItem(song:Song):MediaItem {
        songIndex[song.id]=song
        val metadata=MediaMetadata.Builder()
            .setTitle(song.title)
            .setArtist(song.artist)
            .setAlbumTitle(song.album)
            .setArtworkUri(JobbiApi.coverUrl(song.cover)?.let(Uri::parse))
            .build()
        return MediaItem.Builder()
            .setMediaId(song.id)
            .setUri(JobbiDownloads.playableUri(context,JobbiApi.username,
                JobbiApi.serverUrl(),song.id) ?: Uri.parse(JobbiApi.streamUrl(song.id)))
            .setMediaMetadata(metadata)
            .build()
    }

    fun play(songs: List<Song>, start: Int = 0) {
        if (songs.isEmpty()) return
        val chosen = start.coerceIn(0, songs.lastIndex)
        val ordered = if(shuffleEnabled)
            songs.take(chosen+1)+songs.drop(chosen+1).shuffled()
            else songs
        queue = ordered
        val c = controller
        if (c == null) { pending = ordered to chosen; connect(); return }
        val items = ordered.map(::mediaItem)
        error = ""
        c.setMediaItems(items,chosen,0)
        c.prepare()
        c.play()
        syncFromPlayer(c)
    }

    fun playNext(song:Song){
        if(song.id.isBlank())return
        val c=controller
        if(c==null){
            val waiting=pending
            if(waiting!=null){
                val at=(waiting.second+1).coerceIn(0,waiting.first.size)
                val modified=waiting.first.toMutableList().apply{add(at,song)}
                pending=modified to waiting.second
                queue=modified
            }else play(listOf(song))
            return
        }
        if(c.mediaItemCount==0){play(listOf(song));return}
        c.addMediaItem(UpcomingQueuePolicy.nextInsertIndex(c.currentMediaItemIndex,c.mediaItemCount),
            mediaItem(song))
        syncFromPlayer(c)
    }
    fun addToQueue(song:Song){
        if(song.id.isBlank())return
        val c=controller
        if(c==null){
            val waiting=pending
            if(waiting!=null){
                val modified=waiting.first+song
                pending=modified to waiting.second
                queue=modified
            }else play(listOf(song))
            return
        }
        if(c.mediaItemCount==0){play(listOf(song));return}
        c.addMediaItem(mediaItem(song))
        syncFromPlayer(c)
    }
    fun moveUpcoming(from:Int,to:Int){
        val c=controller?:return
        if(!UpcomingQueuePolicy.canMove(c.currentMediaItemIndex,c.mediaItemCount,from,to))return
        c.moveMediaItem(from,to)
        syncFromPlayer(c)
    }
    fun removeUpcoming(index:Int){
        val c=controller?:return
        if(!UpcomingQueuePolicy.canRemove(c.currentMediaItemIndex,c.mediaItemCount,index))return
        c.removeMediaItem(index)
        syncFromPlayer(c)
    }
    fun clearUpcoming(){
        val c=controller?:return
        val start=c.currentMediaItemIndex+1
        if(start>=0&&start<c.mediaItemCount)c.removeMediaItems(start,c.mediaItemCount)
        syncFromPlayer(c)
    }
    fun jumpTo(index:Int){
        val c=controller?:return
        if(index<0||index>=c.mediaItemCount)return
        c.seekTo(index,0L)
        c.play()
        syncFromPlayer(c)
    }
    fun toggleShuffle(){
        val c=controller?:return
        if(!shuffleEnabled){
            val start=c.currentMediaItemIndex+1
            if(start>=0&&start<c.mediaItemCount){
                val upcoming=(start until c.mediaItemCount).map(c::getMediaItemAt).shuffled()
                c.removeMediaItems(start,c.mediaItemCount)
                c.addMediaItems(start,upcoming)
            }
        }
        // Shuffle acts on the upcoming list, without hiding manually enqueued
        // Play Next tracks behind Media3's randomized traversal.
        shuffleEnabled=!shuffleEnabled
        c.shuffleModeEnabled=false
        syncFromPlayer(c)
    }
    fun cycleRepeat(){
        val c=controller?:return
        c.repeatMode=when(c.repeatMode){
            Player.REPEAT_MODE_OFF->Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL->Player.REPEAT_MODE_ONE
            else->Player.REPEAT_MODE_OFF
        }
        syncFromPlayer(c)
    }
    fun setSleepTimer(minutes:Int){
        val deadline=if(minutes>0)System.currentTimeMillis()+minutes*60_000L else 0L
        if(deadline>0)timerPrefs().edit().putLong("pause-at",deadline).apply()
        else timerPrefs().edit().remove("pause-at").apply()
        sleepUntil=deadline
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
        setSleepTimer(0)
        pending = null
        controller?.stop()
        controller?.clearMediaItems()
        queue = emptyList()
        songIndex.clear()
        currentIndex = -1
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
