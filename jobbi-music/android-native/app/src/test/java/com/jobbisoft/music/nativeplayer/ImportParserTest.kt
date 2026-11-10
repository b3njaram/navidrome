package com.jobbisoft.music.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ImportParserTest {
    @Test fun parsesSpotifyQuotedCommas() {
        val input = "Track Name,Artist Name(s),Album Name\n\"Long Journey, Home\",Billy Strings,Home\n"
        val songs = parseTrackExport(input)
        assertEquals(1,songs.size)
        assertEquals("Long Journey, Home",songs[0].title)
        assertEquals("Billy Strings",songs[0].artist)
    }
    @Test fun preservesUnicodeAndAppleMusicTsv() {
        val input = "Name\tArtist\tAlbum\nГруппа крови\tКино\tГруппа крови\n"
        val songs = parseTrackExport(input)
        assertEquals("Группа крови",songs[0].title)
        assertEquals("Кино",songs[0].artist)
    }
    @Test fun refusesMalformedExports() {
        val result = runCatching {parseTrackExport("A,B\n1,2")}
        assertTrue(result.isFailure)
    }
}
