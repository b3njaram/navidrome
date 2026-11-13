package com.jobbisoft.music.nativeplayer

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import kotlinx.coroutines.runBlocking

@RunWith(RobolectricTestRunner::class)
class AndroidAutoMediaContractTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()

    @Test fun carRootExposesBrowsableNonPlayableMusicLibrary() {
        JobbiApi.configure(context)
        val catalog=AndroidAutoLibrary(context)
        val root=catalog.root()
        assertEquals(AndroidAutoLibrary.ROOT,root.mediaId)
        assertEquals(true,root.mediaMetadata.isBrowsable)
        assertEquals(false,root.mediaMetadata.isPlayable)
    }

    @Test fun carBrowseRequestsSignInRatherThanExposingAnotherAccountsTracks()=runBlocking {
        JobbiApi.clearSession()
        JobbiApi.configure(context)
        val catalog=AndroidAutoLibrary(context)
        val children=catalog.children(AndroidAutoLibrary.ROOT)
        assertEquals(1,children.size)
        assertEquals(AndroidAutoLibrary.SIGN_IN,children[0].mediaId)
        assertEquals(true,children[0].mediaMetadata.isBrowsable)
        assertEquals(false,children[0].mediaMetadata.isPlayable)
        assertTrue(catalog.children(AndroidAutoLibrary.FAVORITES).isEmpty())
    }

    @Test fun normalPhoneMediaItemsRemainPlayableWithoutAutoRewriting() {
        val item=MediaItem.Builder().setMediaId("song1")
            .setUri(Uri.parse("https://music.jobbisoft.com.mx/api/stream/song1"))
            .setMediaMetadata(MediaMetadata.Builder()
                .setTitle("Track").setArtist("Artist").build())
            .build()
        val catalog=AndroidAutoLibrary(context)
        val resolved=catalog.resolveRequested(item)
        assertEquals(item.mediaId,resolved.mediaId)
        assertEquals(item.localConfiguration?.uri,resolved.localConfiguration?.uri)
    }

    @Test fun systemArtworkRejectsExternalUrlsWithoutAUserSession()=runBlocking {
        JobbiApi.clearSession()
        val artwork=SystemAlbumArtwork()
        assertNull(artwork.get(Uri.parse("https://external.example.com/art.jpg")))
        assertNull(artwork.get(Uri.parse("http://music.jobbisoft.com.mx/api/cover/s1")))
    }

    @Test fun mediaMetadataSupportsEmbeddedAlbumArtForSamsungSystemUi() {
        val art=byteArrayOf(1,2,3,4)
        val metadata=MediaMetadata.Builder()
            .setTitle("Song")
            .setArtist("Artist")
            .setArtworkData(art, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
            .build()
        assertNotNull(metadata.artworkData)
        assertEquals(4,metadata.artworkData?.size)
        assertFalse(metadata.title.isNullOrEmpty())
    }
}
