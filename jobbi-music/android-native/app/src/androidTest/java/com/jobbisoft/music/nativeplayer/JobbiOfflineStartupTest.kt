package com.jobbisoft.music.nativeplayer

import android.app.DownloadManager
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
            // Content is a fixture, not remotely sourced; the saved status
            // proves it was previously downloaded and safe to expose.
            recording.writeBytes(byteArrayOf(82,73,70,70,0,0,0,0))
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
        } finally {
            clean()
        }
    }
}
