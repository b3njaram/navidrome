package com.jobbisoft.music.nativeplayer

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.ListenableFuture
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
            // Media3 controllers require calls on their application looper,
            // which is the main thread. Await futures off main to avoid deadlock.
            val instrument = InstrumentationRegistry.getInstrumentation()
            lateinit var rootCall: ListenableFuture<LibraryResult<MediaItem>>
            instrument.runOnMainSync { rootCall = browser.getLibraryRoot(null) }
            val root = rootCall.get(15, TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS, root.resultCode)
            assertNotNull(root.value)
            assertEquals(AndroidAutoLibrary.ROOT, root.value?.mediaId)
            assertTrue(root.value?.mediaMetadata?.isBrowsable == true)

            lateinit var childrenCall:
                ListenableFuture<LibraryResult<ImmutableList<MediaItem>>>
            instrument.runOnMainSync {
                childrenCall = browser.getChildren(AndroidAutoLibrary.ROOT, 0, 20, null)
            }
            val children = childrenCall.get(15, TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS, children.resultCode)
            assertTrue(children.value?.isNotEmpty() == true)
            assertTrue(children.value?.all {
                it.mediaMetadata.isBrowsable == true &&
                    it.mediaMetadata.isPlayable == false
            } == true)
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                MediaController.releaseFuture(pending)
            }
        }
    }
}
