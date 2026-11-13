package com.jobbisoft.music.nativeplayer

import androidx.media3.common.C
import androidx.media3.common.Player
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Lock-screen progress must not confuse unknown, zero or implausible lengths. */
class SystemMediaControlsTest {
    @Test fun knownCatalogSecondsProduceMillisecondsForMedia3() {
        assertEquals(187_000L, SystemMediaControls.durationMillis(187L))
        assertEquals(3_600_000L, SystemMediaControls.durationMillis(3600L))
        assertNull(SystemMediaControls.durationMillis(0))
        assertNull(SystemMediaControls.durationMillis(-1))
        assertNull(SystemMediaControls.durationMillis(900_000))
    }

    @Test fun realPlayerLengthWinsAndUnknownPlayerFallsBackToCatalog() {
        assertEquals(185_230L,
            SystemMediaControls.durationForSystem(185_230L, 187_000L))
        assertEquals(187_000L,
            SystemMediaControls.durationForSystem(C.TIME_UNSET, 187_000L))
        assertEquals(187_000L,
            SystemMediaControls.durationForSystem(0L, 187_000L))
        assertEquals(C.TIME_UNSET,
            SystemMediaControls.durationForSystem(C.TIME_UNSET, null))
        assertEquals(C.TIME_UNSET,
            SystemMediaControls.durationForSystem(C.TIME_UNSET, -1L))
    }

    @Test fun previousAndNextAreExplicitSystemButtons() {
        val buttons=SystemMediaControls.transportButtons()
        assertEquals(2,buttons.size)
        assertEquals(Player.COMMAND_SEEK_TO_PREVIOUS,buttons[0].playerCommand)
        assertEquals(Player.COMMAND_SEEK_TO_NEXT,buttons[1].playerCommand)
        assertTrue(buttons.all { it.isEnabled })
    }
}
