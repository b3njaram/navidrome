package com.jobbisoft.music.nativeplayer

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Check JSON contracts shared by native Library, Search, playlist operations,
 * Favorites, original-quality offline downloads and recommendations.
 * API/network/UI behavior is covered separately by integration/emulator tests.
 */
class NativeFeatureContractTest {
    @Test fun songAndOfflineMetadataSurviveApiParsing(){
        val raw=JSONObject("""{"id":"a1","title":"Tu geografía","artist":"Indios",
          "album":"Indios","albumId":"al-1","coverArt":"cover-1",
          "duration":190,"suffix":"flac","size":28700000}""")
        val song=raw.song()
        assertEquals("a1",song.id)
        assertEquals("Tu geografía",song.title)
        assertEquals("Indios",song.artist)
        assertEquals("al-1",song.albumId)
        assertEquals("flac",song.suffix)
        assertEquals(28700000L,song.size)
    }

    @Test fun playlistOwnershipVisibilityAndTrackCountReadCorrectly(){
        val raw=JSONObject("""{"id":"p1","name":"Road Trip",
          "songCount":284,"public":true,"owner":"listener"}""")
        val playlist=raw.playlist()
        assertEquals("p1",playlist.id)
        assertEquals(284,playlist.count)
        assertTrue(playlist.public)
    }

    @Test fun emptyAndBrokenSearchTracksDoNotBecomeClickableSongs(){
        val songs=JSONArray("""[
            {"id":"valid","title":"Saved","artist":"Artist","duration":150},
            {"id":"","title":"Invalid"},
            {"title":"No ID"}
        ]""").songs()
        assertEquals(1,songs.size)
        assertEquals("valid",songs[0].id)
    }

    @Test fun coverAndAlbumMetadataAreParsedAsExpected(){
        val album=JSONObject("""{"id":"album-1","name":"Indios",
          "artist":"Indios","coverArt":"cover-id"}""").album()
        assertEquals("album-1",album.id)
        assertEquals("Indios",album.name)
        assertEquals("cover-id",album.cover)
    }

    @Test fun importedSongUnknownFieldsCannotReplaceRequiredProperties(){
        val raw=JSONObject("""{"id":"s3","title":"Song","artist":"Artist",
          "contentType":"application/octet-stream","duration":0}""")
        val s=raw.song()
        assertEquals("s3",s.id)
        assertEquals("",s.suffix)
        assertEquals(0L,s.size)
        assertEquals(0L,s.duration)
        assertFalse(s.title.isEmpty())
    }
}
