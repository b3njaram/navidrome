package com.jobbisoft.music.nativeplayer

import androidx.media3.common.C
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
internal class SystemTimelinePlayer(player: Player) : ForwardingPlayer(player) {
    private fun knownMs(): Long? =
        currentMediaItem?.mediaMetadata?.durationMs
            ?: super.getMediaMetadata().durationMs

    override fun getDuration(): Long =
        SystemMediaControls.durationForSystem(super.getDuration(), knownMs())

    override fun getContentDuration(): Long =
        SystemMediaControls.durationForSystem(super.getContentDuration(), knownMs())

    override fun getMediaMetadata(): MediaMetadata {
        val source = super.getMediaMetadata()
        if (source.durationMs != null) return source
        val known = currentMediaItem?.mediaMetadata?.durationMs ?: return source
        return source.buildUpon().setDurationMs(known).build()
    }
}
