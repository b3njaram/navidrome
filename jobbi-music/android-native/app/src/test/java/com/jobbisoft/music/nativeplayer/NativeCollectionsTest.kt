package com.jobbisoft.music.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeCollectionsTest {
    private val sample="""{
      "format":"jobbi-collection-export/v1",
      "collections":[
        {"id":"liked","name":"Liked Songs","provider":"spotify","kind":"favorites",
         "tracks":[{"title":"Dark Beach","artist":"PASTEL GHOST","album":"Abyss"}]},
        {"id":"banjo","name":"Banjo","provider":"apple","kind":"playlist",
         "tracks":[{"title":"Roving Gambler","artist":"The Country Gentlemen"},
                   {"title":"Roving Gambler","artist":"The Country Gentlemen"}]}
      ]
    }"""

    @Test fun keepsFavoritesSeparateFromPlaylists() {
        val values=parseNativeCollections(sample)
        assertEquals(2,values.size)
        assertEquals("favorites",values[0].kind)
        assertEquals("playlist",values[1].kind)
        assertEquals(2,values[1].songs.size)
        assertEquals("Dark Beach",values[0].songs[0].title)
    }

    @Test fun serializesProgressAndPreservesDestination() {
        val original=parseNativeCollections(sample).mapIndexed {i,col->
            if(i==0)col.copy(songs=col.songs.map{it.copy(status="hearted",songId="s1")})
            else col.copy(destinationId="p2")
        }
        val saved=serializeNativeCollections(original)
        val restored=restoreNativeCollections(saved)
        assertEquals("hearted",restored[0].songs[0].status)
        assertEquals("s1",restored[0].songs[0].songId)
        assertEquals("p2",restored[1].destinationId)
    }

    @Test fun rejectsUnexpectedCollectionTypes() {
        val bad=sample.replace("\"kind\":\"favorites\"","\"kind\":\"whatever\"")
        assertTrue(runCatching {parseNativeCollections(bad)}.isFailure)
    }
}
