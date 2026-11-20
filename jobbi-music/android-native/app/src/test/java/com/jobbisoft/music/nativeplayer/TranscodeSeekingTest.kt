package com.jobbisoft.music.nativeplayer

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Test OpenSubsonic time-offset fallback independently of the physical NAS.
 * Song IDs, album metadata and data-saver quality must survive a timestamp
 * jump even when the uncached transcoded stream does not support byte Range.
 */
@RunWith(RobolectricTestRunner::class)
class TranscodeSeekingTest {
    private fun stream(url:String)=MediaItem.Builder()
        .setMediaId("test-song")
        .setUri(Uri.parse(url))
        .setMediaMetadata(MediaMetadata.Builder().setTitle("Track")
            .setArtist("Artist").setDurationMs(240000L).build())
        .build()

    @Test fun uncachedTranscodeRestartKeepsQualityAndMetadata() {
        val original=stream(
            "https://music.jobbisoft.com.mx/api/stream/test-song?quality=saver")
        val resumed=TranscodeSeekOffset.withTimeOffset(
            original,"balanced",123456L)
        assertEquals("test-song",resumed.mediaId)
        assertEquals("Track",resumed.mediaMetadata.title)
        assertEquals(240000L,resumed.mediaMetadata.durationMs)
        assertEquals("saver",
            resumed.localConfiguration?.uri?.getQueryParameter("quality"))
        assertEquals("123",
            resumed.localConfiguration?.uri?.getQueryParameter("timeOffset"))
        assertNotEquals(original.localConfiguration?.uri,
            resumed.localConfiguration?.uri)
        assertEquals(123000L,TranscodeSeekOffset.millis(resumed))
    }

    @Test fun absoluteAndRelativeProgressRemainCorrectForAndroidAuto() {
        val track=stream(
            "https://music.jobbisoft.com.mx/api/stream/test-song?quality=balanced&timeOffset=90")
        val base=TranscodeSeekOffset.millis(track)
        assertEquals(90000L,base)
        assertEquals(97000L,
            TranscodeSeekOffset.absolutePositionMs(7000L,base,240000L))
        assertEquals(240000L,
            TranscodeSeekOffset.absolutePositionMs(170000L,base,240000L))
        assertEquals(7000L,TranscodeSeekOffset.relativeSeekMs(97000L,base))
        assertEquals(0L,TranscodeSeekOffset.relativeSeekMs(15000L,base))
        assertEquals(C.TIME_UNSET,
            TranscodeSeekOffset.absolutePositionMs(C.TIME_UNSET,base,240000L))
    }

    @Test fun unoffsetOrOfflineMediaDoesNotInventAStreamOffset() {
        val raw=stream("https://music.jobbisoft.com.mx/api/stream/test-song?quality=original")
        val offline=stream("file:///storage/emulated/0/Music/test.flac")
        assertEquals(0L,TranscodeSeekOffset.millis(raw))
        assertEquals(0L,TranscodeSeekOffset.millis(offline))
        assertEquals(0L,TranscodeSeekOffset.millis(null))
    }
}
