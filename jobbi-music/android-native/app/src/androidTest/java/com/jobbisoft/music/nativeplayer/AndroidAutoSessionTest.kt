package com.jobbisoft.music.nativeplayer

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Environment
import org.json.JSONObject
import java.security.MessageDigest
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaBrowser
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.util.concurrent.ListenableFuture
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Exercises Jobbi's real exported MediaLibraryService through the same
 * MediaBrowser connection used by Android Auto (not a mocked UI).
 * Physical head-unit, Samsung Now Bar and Bluetooth vehicle testing remain
 * separate, hardware-only acceptance requirements.
 */
@RunWith(AndroidJUnit4::class)
class AndroidAutoSessionTest {
    private val instrument get() = InstrumentationRegistry.getInstrumentation()
    private val context:Context get() = ApplicationProvider.getApplicationContext()

    private fun <T> main(block:()->T):T {
        val value=AtomicReference<T>()
        instrument.runOnMainSync { value.set(block()) }
        return value.get()
    }

    private fun connected(block:(MediaBrowser)->Unit) {
        val token=SessionToken(context,
            ComponentName(context,MusicPlaybackService::class.java))
        val pending=MediaBrowser.Builder(context,token).buildAsync()
        try {
            val browser=pending.get(20,TimeUnit.SECONDS)
            block(browser)
        } finally {
            main { MediaController.releaseFuture(pending) }
        }
    }

    private fun until(message:String,limitMs:Long=12000L,condition:()->Boolean) {
        val deadline=System.currentTimeMillis()+limitMs
        while(System.currentTimeMillis()<deadline) {
            if(condition())return
            Thread.sleep(120L)
        }
        assertTrue(message,condition())
    }

    @Test fun carBrowserCanConnectAndReadLibraryRoot() {
        JobbiApi.clearSession()
        connected { browser ->
            val root=main {browser.getLibraryRoot(null)}.get(15,TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS,root.resultCode)
            assertNotNull(root.value)
            assertEquals(AndroidAutoLibrary.ROOT,root.value?.mediaId)
            assertTrue(root.value?.mediaMetadata?.isBrowsable==true)

            val children=main {
                browser.getChildren(AndroidAutoLibrary.ROOT,0,20,null)
            }.get(15,TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS,children.resultCode)
            assertEquals(1,children.value?.size)
            assertEquals(AndroidAutoLibrary.SIGN_IN,children.value?.first()?.mediaId)
            assertTrue(children.value?.all {
                it.mediaMetadata.isBrowsable==true &&
                    it.mediaMetadata.isPlayable==false
            }==true)
        }
    }

    @Test fun signedOutCarCannotBrowsePrivateFavoritesOrPlaylists() {
        JobbiApi.clearSession()
        connected { browser ->
            for(id in listOf(AndroidAutoLibrary.HOME,AndroidAutoLibrary.QUEUE,
                AndroidAutoLibrary.HOME_PLAYLISTS,AndroidAutoLibrary.HOME_WEEK,
                AndroidAutoLibrary.FAVORITES,AndroidAutoLibrary.PLAYLISTS,
                AndroidAutoLibrary.ALBUMS,AndroidAutoLibrary.DOWNLOADED,
                AndroidAutoLibrary.OFFLINE_PLAYLISTS,
                AndroidAutoLibrary.ARTISTS,AndroidAutoLibrary.RECENT)) {
                val children=main { browser.getChildren(id,0,20,null) }
                    .get(15,TimeUnit.SECONDS)
                assertEquals("Error browsing $id",
                    LibraryResult.RESULT_SUCCESS,children.resultCode)
                assertTrue("Signed-out vehicle exposed private $id",
                    children.value.isNullOrEmpty())
            }
            val signIn=main {browser.getItem(AndroidAutoLibrary.SIGN_IN)}
                .get(15,TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS,signIn.resultCode)
            assertTrue(signIn.value?.mediaMetadata?.isBrowsable==true)
            val missing=main {browser.getItem("unindexed-private-recording")}
                .get(15,TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_ERROR_BAD_VALUE,missing.resultCode)
            val search=main {browser.getSearchResult("private track",0,20,null)}
                .get(15,TimeUnit.SECONDS)
            assertEquals(LibraryResult.RESULT_SUCCESS,search.resultCode)
            assertTrue(search.value.isNullOrEmpty())
        }
    }

    /** 12 seconds of local, silent PCM lets the actual Media3 session run in CI.
     * No account, NAS streaming, or purchased/copyrighted recording is involved.
     */
    private fun wavFixture():File {
        val rate=8000
        val pcmBytes=rate*12*2
        val b=ByteBuffer.allocate(44+pcmBytes).order(ByteOrder.LITTLE_ENDIAN)
        b.put("RIFF".toByteArray(Charsets.US_ASCII))
        b.putInt(pcmBytes+36)
        b.put("WAVEfmt ".toByteArray(Charsets.US_ASCII))
        b.putInt(16)
        b.putShort(1.toShort()) // PCM
        b.putShort(1.toShort()) // mono
        b.putInt(rate)
        b.putInt(rate*2)
        b.putShort(2.toShort())
        b.putShort(16.toShort())
        b.put("data".toByteArray(Charsets.US_ASCII))
        b.putInt(pcmBytes)
        val file=File(context.cacheDir,"jobbi-auto-session-fixture.wav")
        file.writeBytes(b.array())
        return file
    }

    @Test fun carTransportNextPreviousSeekAndMetadataUseRealPlaybackSession() {
        JobbiApi.clearSession()
        val wav=wavFixture()
        try {
            connected { browser ->
                val tracks=listOf("fixture-track-a","fixture-track-b").mapIndexed { i,id ->
                    MediaItem.Builder().setMediaId(id)
                        .setUri(Uri.fromFile(wav))
                        .setMediaMetadata(MediaMetadata.Builder()
                            .setTitle(if(i==0)"Session Test A" else "Session Test B")
                            .setArtist("Local test fixture")
                            .setDurationMs(12000L)
                            .build())
                        .build()
                }
                main { browser.setMediaItems(tracks); browser.prepare() }
                until("Car session didn't publish its media queue") {
                    main {browser.mediaItemCount==2 && browser.currentMediaItem?.mediaId=="fixture-track-a"}
                }
                until("Media3 could not prepare local PCM playback") {
                    main {browser.playbackState==Player.STATE_READY}
                }
                assertEquals("Session Test A",
                    main {browser.mediaMetadata.title?.toString()})
                assertTrue("Android Auto missing Next command",
                    main {browser.isCommandAvailable(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)})
                main {browser.play()}
                until("Vehicle controller couldn't start actual PCM playback") {
                    main {browser.isPlaying}
                }
                main {browser.seekTo(2200L)}
                until("Vehicle seek request didn't update playback position") {
                    main {browser.currentPosition >= 1500L}
                }
                main {browser.seekToNextMediaItem()}
                until("Next track was not reflected to vehicle session") {
                    main {browser.currentMediaItem?.mediaId=="fixture-track-b"}
                }
                assertEquals("Session Test B",
                    main {browser.mediaMetadata.title?.toString()})
                main {browser.seekToPreviousMediaItem()}
                until("Previous track was not reflected to vehicle session") {
                    main {browser.currentMediaItem?.mediaId=="fixture-track-a"}
                }
                main {browser.pause()}
                until("Vehicle pause didn't stop playback") {
                    main {!browser.isPlaying}
                }
                main {browser.stop();browser.clearMediaItems()}
            }
        } finally {
            wav.delete()
        }
    }
    @Test fun offlineCarHomeQueueAndDownloadsWorkWithoutNAS() {
        JobbiApi.clearSession()
        val name="car-verified-offline-fixture"
        val host="https://android-auto-offline.invalid"
        val id="car-local-playable-track"
        val hash: (String)->String={value->
            MessageDigest.getInstance("SHA-256")
                .digest(value.toByteArray(Charsets.UTF_8))
                .joinToString(""){"%02x".format(it)}
        }
        val scope=hash(host+"\n"+name.lowercase()).take(24)
        val dir=File(context.getExternalFilesDir(Environment.DIRECTORY_MUSIC),
            "jobbi/"+scope)
        val prefs=context.getSharedPreferences("jobbi-native-downloads-v1",
            Context.MODE_PRIVATE)
        val audio=wavFixture()
        try {
            JobbiApi.changeServer(context,host)
            assertTrue(dir.mkdirs()||dir.isDirectory)
            val local=File(dir,"car-cache.wav")
            audio.copyTo(local,overwrite=true)
            val saved=JSONObject().put("id",id)
                .put("title","Downloaded Drive Song")
                .put("artist","Local music")
                .put("album","Offline")
                .put("fileName",local.name)
                .put("downloadId",0)
                .put("status",android.app.DownloadManager.STATUS_SUCCESSFUL)
                .put("size",local.length())
            assertTrue(prefs.edit().putString(scope+":"+hash(id),saved.toString())
                .commit())
            JobbiApi.useOfflineIdentity(name)
            JobbiDownloads.rememberCollection(context,name,host,
                "playlist:roadtrip","Road Trip",
                listOf(Song(id,"Downloaded Drive Song","Local music","Offline",
                    null,12L)))
            connected { browser ->
                val root=main{browser.getChildren(AndroidAutoLibrary.ROOT,0,20,null)}
                    .get(15,TimeUnit.SECONDS)
                assertEquals(LibraryResult.RESULT_SUCCESS,root.resultCode)
                assertEquals(listOf(AndroidAutoLibrary.HOME,
                    AndroidAutoLibrary.OFFLINE_PLAYLISTS,AndroidAutoLibrary.DOWNLOADED,
                    AndroidAutoLibrary.QUEUE),root.value?.map{it.mediaId})
                val home=main{browser.getChildren(AndroidAutoLibrary.HOME,0,20,null)}
                    .get(15,TimeUnit.SECONDS)
                assertTrue(home.value?.any{it.mediaId==AndroidAutoLibrary.DOWNLOADED}==true)
                val lists=main{browser.getChildren(AndroidAutoLibrary.OFFLINE_PLAYLISTS,0,20,null)}
                    .get(15,TimeUnit.SECONDS)
                val offlineFolder=AndroidAutoLibrary.PREFIX_OFFLINE_PLAYLIST+"playlist:roadtrip"
                assertEquals(offlineFolder,lists.value?.singleOrNull()?.mediaId)
                val savedPlaylist=main{browser.getChildren(offlineFolder,0,20,null)}
                    .get(15,TimeUnit.SECONDS)
                assertEquals(id,savedPlaylist.value?.singleOrNull()?.mediaId)
                assertEquals("file",savedPlaylist.value?.singleOrNull()
                    ?.localConfiguration?.uri?.scheme)
                val downloads=main{browser.getChildren(AndroidAutoLibrary.DOWNLOADED,0,20,null)}
                    .get(15,TimeUnit.SECONDS)
                assertEquals(id,downloads.value?.singleOrNull()?.mediaId)
                assertEquals("file",downloads.value?.singleOrNull()
                    ?.localConfiguration?.uri?.scheme)
                val queueTracks=listOf("current-fixture","next-fixture").mapIndexed{index,mediaId->
                    MediaItem.Builder().setMediaId(mediaId).setUri(Uri.fromFile(audio))
                        .setMediaMetadata(MediaMetadata.Builder()
                            .setTitle(if(index==0)"Playing" else "Up Next")
                            .setArtist("Fixture").build()).build()
                }
                main{browser.setMediaItems(queueTracks,0,0L)}
                until("Car queue was not created"){
                    main{browser.mediaItemCount==2&&browser.currentMediaItemIndex==0}
                }
                val upNext=main{browser.getChildren(AndroidAutoLibrary.QUEUE,0,20,null)}
                    .get(15,TimeUnit.SECONDS)
                assertEquals(LibraryResult.RESULT_SUCCESS,upNext.resultCode)
                assertEquals("next-fixture",upNext.value?.singleOrNull()?.mediaId)
                // Selecting a queued song from the car should retain the
                // entire playback list and preserve Previous/Now Playing.
                main {browser.setMediaItem(queueTracks[1])}
                until("Up Next selection discarded the source queue") {
                    main {browser.mediaItemCount==2 &&
                        browser.currentMediaItemIndex==1 &&
                        browser.currentMediaItem?.mediaId=="next-fixture"}
                }
                main{browser.clearMediaItems()}
            }
        } finally {
            val edit=prefs.edit()
            prefs.all.keys.filter{it.startsWith(scope+":")||
                it.startsWith("collection:"+scope+":")}.forEach(edit::remove)
            edit.commit()
            dir.deleteRecursively()
            audio.delete()
            JobbiApi.clearSession()
        }
    }

}
