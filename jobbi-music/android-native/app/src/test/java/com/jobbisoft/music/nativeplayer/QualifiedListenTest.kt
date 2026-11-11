package com.jobbisoft.music.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QualifiedListenTest {
    @Test fun halfOfNormalSong() {
        assertEquals(105_000L,qualifiedListenThresholdMs(210_000L))
        assertFalse(isQualifiedListen(210_000L,104_999L))
        assertTrue(isQualifiedListen(210_000L,105_000L))
    }
    @Test fun veryLongSongsCappedAtFourMinutes() {
        assertEquals(240_000L,qualifiedListenThresholdMs(900_000L))
        assertTrue(isQualifiedListen(900_000L,240_000L))
    }
    @Test fun shortSongsAndUnknownLength() {
        assertEquals(5_000L,qualifiedListenThresholdMs(8_000L))
        assertEquals(30_000L,qualifiedListenThresholdMs(0L))
        assertFalse(isQualifiedListen(0L,29_999L))
        assertTrue(isQualifiedListen(8_000L,5_000L))
    }
}
