package com.jobbisoft.music.nativeplayer

import android.app.DownloadManager
import android.content.ComponentName
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import android.content.Context
import android.os.Environment
import androidx.lifecycle.ViewModelProvider
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit
import java.security.MessageDigest

/**
 * Offline sign-in integration test uses an .invalid hostname and locally
 * seeded, already-completed music. It MUST succeed without any DNS or NAS.
 */
@RunWith(AndroidJUnit4::class)
class JobbiOfflineStartupTest {
    @get:Rule val rule=createAndroidComposeRule<MainActivity>()
    private val app:Context get()=ApplicationProvider.getApplicationContext()
    private val user="jobbi-offline-test-account"
    private val server="https://no-network-test.invalid"
    private val songId="no-network-offline-song"
    private fun hash(text:String):String=MessageDigest.getInstance("SHA-256")
        .digest(text.toByteArray(Charsets.UTF_8))
        .joinToString(""){"%02x".format(it)}
    private val scope get()=hash(server+"\n"+user.lowercase()).take(24)
    private fun clean(){
        val prefs=app.getSharedPreferences("jobbi-native-downloads-v1",Context.MODE_PRIVATE)
        val edit=prefs.edit()
        prefs.all.keys.filter{it.startsWith(scope+":")||
            it.startsWith("collection:"+scope+":")||
            it.startsWith("manual:"+scope+":")}.forEach(edit::remove)
        edit.commit()
        File(app.getExternalFilesDir(Environment.DIRECTORY_MUSIC),
            "jobbi/"+scope).deleteRecursively()
        SecureLoginStorage.clear(app)
        JobbiApi.clearSession()
    }

    @Test fun listenOfflineUsesOnlyCompletedDeviceFilesDespiteUnresolvableServer(){
        val vm=ViewModelProvider(rule.activity)[MusicViewModel::class.java]
        rule.waitUntil(25000){!vm.restoringSession}
        try {
            val dir=File(app.getExternalFilesDir(Environment.DIRECTORY_MUSIC),
                "jobbi/"+scope)
            assertTrue(dir.mkdirs()||dir.isDirectory)
            val recording=File(dir,"local.wav")
            // A genuine 8-second silent WAV exercises the actual Media3
            // decoder with a file:// URI, not merely a local-file lookup.
            val rate=8000
            val pcmBytes=rate*8*2
            val wav=ByteBuffer.allocate(44+pcmBytes).order(ByteOrder.LITTLE_ENDIAN)
            wav.put("RIFF".toByteArray(Charsets.US_ASCII))
            wav.putInt(36+pcmBytes)
            wav.put("WAVEfmt ".toByteArray(Charsets.US_ASCII))
            wav.putInt(16)
            wav.putShort(1.toShort())
            wav.putShort(1.toShort())
            wav.putInt(rate)
            wav.putInt(rate*2)
            wav.putShort(2.toShort())
            wav.putShort(16.toShort())
            wav.put("data".toByteArray(Charsets.US_ASCII))
            wav.putInt(pcmBytes)
            recording.writeBytes(wav.array())
            val prefs=app.getSharedPreferences("jobbi-native-downloads-v1",
                Context.MODE_PRIVATE)
            val entry=JSONObject().put("id",songId)
                .put("title","Offline fixture recording")
                .put("artist","Local test")
                .put("album","Offline testing")
                .put("fileName",recording.name)
                .put("downloadId",0)
                .put("status",DownloadManager.STATUS_SUCCESSFUL)
                .put("size",recording.length()).toString()
            assertTrue(prefs.edit().putString(scope+":"+hash(songId),entry).commit())
            SecureLoginStorage.save(app,RememberedLogin(
                server,user,"saved-verified-test-password"))
            rule.runOnUiThread{vm.listenOffline()}
            rule.waitUntil(15000){vm.offlineMode||vm.error.isNotBlank()}
            assertTrue("Offline button attempted a server request or failed: "+vm.error,
                vm.offlineMode)
            assertTrue(vm.signedIn)
            assertEquals("Downloads",vm.selected)
            assertEquals(user,vm.account)
            assertEquals(1,vm.downloadedSongs.size)
            assertEquals(songId,vm.downloadedSongs.single().id)
            assertNotNull(JobbiDownloads.playableUri(app,user,server,songId))
            rule.waitUntil(8000){
                rule.onAllNodesWithText("Offline fixture recording",
                    useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()
            }
            rule.onNodeWithText("Offline fixture recording",useUnmergedTree=true)
                .performClick()
            val token=SessionToken(app,ComponentName(app,
                MusicPlaybackService::class.java))
            val pending=MediaController.Builder(app,token).buildAsync()
            try{
                val controller=pending.get(20,TimeUnit.SECONDS)
                rule.waitUntil(15000){
                    controller.currentMediaItem?.mediaId==songId &&
                    controller.currentMediaItem?.localConfiguration?.uri?.scheme=="file"
                }
                assertEquals("file",controller.currentMediaItem
                    ?.localConfiguration?.uri?.scheme)
                rule.waitUntil(15000){
                    controller.playbackState==Player.STATE_READY
                }
                assertTrue("Offline PCM recording did not enter playback",
                    controller.playWhenReady)
                rule.runOnUiThread{controller.pause()}
            }finally{
                rule.runOnUiThread{MediaController.releaseFuture(pending)}
            }
        } finally {
            clean()
        }
    }
}
