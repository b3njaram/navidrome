package com.jobbisoft.music.nativeplayer

import android.content.ComponentName
import android.content.Context
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaBrowser
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/**
 * Exercises the real exported MediaLibraryService binder on Android.
 * This catches a service that builds but remains invisible to Android Auto.
 * A physical car/One UI still requires device testing.
 */
@RunWith(AndroidJUnit4::class)
class AndroidAutoSessionTest {
    @Test fun carBrowserCanConnectAndReadLibraryRoot() {
        val context: Context = ApplicationProvider.getApplicationContext()
        val token = SessionToken(context,
            ComponentName(context, MusicPlaybackService::class.java))
        val pending = MediaBrowser.Builder(context, token).buildAsync()
        try {
            val browser = pending.get(20, TimeUnit.SECONDS)
            val root = browser.getLibraryRoot(null).get(15, TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS, root.resultCode)
            assertNotNull(root.value)
            assertEquals(AndroidAutoLibrary.ROOT, root.value?.mediaId)
            assertTrue(root.value?.mediaMetadata?.isBrowsable == true)

            val children = browser.getChildren(
                AndroidAutoLibrary.ROOT, 0, 20, null).get(15, TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS, children.resultCode)
            assertTrue(children.value?.isNotEmpty() == true)
            assertTrue(children.value?.all {
                it.mediaMetadata.isBrowsable == true &&
                    it.mediaMetadata.isPlayable == false
            } == true)
        } finally {
            MediaController.releaseFuture(pending)
        }
    }
}
