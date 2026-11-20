package com.jobbisoft.music.nativeplayer

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.CommandButton

/**
 * The Subsonic catalog knows the song length even if an MP3 stream arrives
 * with unknown byte length. Media3's platform session needs a positive
 * duration to publish a progress bar on Samsung's lock screen/Now Bar.
 *
 * This only supplies duration INFORMATION; seeks still go to the real player.
 * We don't pretend an actually non-seekable stream supports scrubbing.
 */
internal object SystemMediaControls {
    private const val MAX_TRACK_SECONDS = 24L * 60L * 60L

    fun durationMillis(seconds: Long): Long? =
        seconds.takeIf { it in 1..MAX_TRACK_SECONDS }?.times(1000L)

    fun durationForSystem(playerMs: Long, catalogMs: Long?): Long {
        if (playerMs != C.TIME_UNSET && playerMs > 0) return playerMs
        return catalogMs?.takeIf { it > 0 && it <= MAX_TRACK_SECONDS * 1000L }
            ?: C.TIME_UNSET
    }

    fun transportButtons(): List<CommandButton> = listOf(
        CommandButton.Builder(CommandButton.ICON_PREVIOUS)
            .setDisplayName("Previous")
            .setPlayerCommand(Player.COMMAND_SEEK_TO_PREVIOUS)
            .build(),
        CommandButton.Builder(CommandButton.ICON_NEXT)
            .setDisplayName("Next")
            .setPlayerCommand(Player.COMMAND_SEEK_TO_NEXT)
            .build()
    )
}

/**
 * Exposes a known catalog duration when the stream doesn't report one.
 * We do not override seekability or available commands: a real unsupported
 * seek remains unsupported, while elapsed-time progress is still visible.
 */
/**
 * An uncached Navidrome MP3 transcode may be non-seekable until caching
 * finishes. Navidrome advertises OpenSubsonic transcodeOffset, so the client
 * can reopen a fresh stream at the requested *absolute* song time.
 */
internal object TranscodeSeekOffset {
    fun millis(item:MediaItem?):Long {
        val uri=item?.localConfiguration?.uri ?:return 0L
        if(uri.scheme!="https")return 0L
        val seconds=runCatching{uri.getQueryParameter("timeOffset")?.toLongOrNull()}
            .getOrNull() ?:return 0L
        return seconds.takeIf{it in 0L..86400L}?.times(1000L) ?:0L
    }

    fun withTimeOffset(item:MediaItem,serverQuality:String,targetMs:Long):MediaItem {
        val seconds=(targetMs.coerceAtLeast(0L)/1000L).coerceAtMost(86400L)
        val oldUri=item.localConfiguration?.uri
        val quality=oldUri?.getQueryParameter("quality")
            ?.takeIf{it in listOf("original","balanced","saver")}
            ?:serverQuality
        val resumed=Uri.parse(JobbiApi.streamUrl(item.mediaId,quality))
            .buildUpon().appendQueryParameter("timeOffset",seconds.toString()).build()
        return item.buildUpon().setUri(resumed).build()
    }

    fun absolutePositionMs(decodedMs:Long,offsetMs:Long,totalMs:Long?):Long {
        if(decodedMs==C.TIME_UNSET)return C.TIME_UNSET
        val absolute=(decodedMs.coerceAtLeast(0L)+offsetMs).coerceAtLeast(0L)
        return if(totalMs!=null&&totalMs>0)absolute.coerceAtMost(totalMs)
            else absolute
    }

    fun relativeSeekMs(targetMs:Long,offsetMs:Long):Long =
        (targetMs-offsetMs).coerceAtLeast(0L)
}

internal class SystemTimelinePlayer(player: Player) : ForwardingPlayer(player) {
    private fun knownMs(): Long? =
        currentMediaItem?.mediaMetadata?.durationMs
            ?: super.getMediaMetadata().durationMs

    private fun offsetMs():Long=TranscodeSeekOffset.millis(currentMediaItem)
    private fun adjusted(ms:Long):Long =
        TranscodeSeekOffset.absolutePositionMs(ms,offsetMs(),knownMs())

    override fun getCurrentPosition():Long = adjusted(super.getCurrentPosition())
    override fun getBufferedPosition():Long = adjusted(super.getBufferedPosition())
    override fun getContentPosition():Long = adjusted(super.getContentPosition())
    override fun getContentBufferedPosition():Long =
        adjusted(super.getContentBufferedPosition())

    override fun getDuration(): Long {
        // Offset transcodes report their *remaining* stream duration, but
        // Samsung's timeline must show the full original recording.
        if(offsetMs()>0 && knownMs()!=null)return knownMs()!!
        return SystemMediaControls.durationForSystem(super.getDuration(),knownMs())
    }

    override fun getContentDuration(): Long {
        if(offsetMs()>0 && knownMs()!=null)return knownMs()!!
        return SystemMediaControls.durationForSystem(super.getContentDuration(),knownMs())
    }

    override fun seekTo(positionMs:Long) {
        super.seekTo(TranscodeSeekOffset.relativeSeekMs(positionMs,offsetMs()))
    }

    override fun seekTo(mediaItemIndex:Int,positionMs:Long) {
        val offset=if(mediaItemIndex in 0 until mediaItemCount)
            TranscodeSeekOffset.millis(getMediaItemAt(mediaItemIndex)) else 0L
        super.seekTo(mediaItemIndex,TranscodeSeekOffset.relativeSeekMs(positionMs,offset))
    }

    override fun getMediaMetadata(): MediaMetadata {
        val source = super.getMediaMetadata()
        if (source.durationMs != null) return source
        val known = currentMediaItem?.mediaMetadata?.durationMs ?: return source
        return source.buildUpon().setDurationMs(known).build()
    }
}
