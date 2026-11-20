package com.jobbisoft.music.nativeplayer

import android.app.DownloadManager
import android.content.Context
import android.os.Environment
import android.os.SystemClock
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.MessageDigest

/**
 * Actual cold app launch, using encrypted account credentials and a saved
 * local recording. The debug-only network probe reports airplane mode even
 * though the Android emulator has Wi-Fi; this proves startup never waits for
 * login or DNS when connectivity is absent.
 */
@RunWith(AndroidJUnit4::class)
class JobbiOfflineColdStartTest {
    private val app:Context get()=ApplicationProvider.getApplicationContext()
    private val user="jobbi-cold-start-fixture"
    private val server="https://offline-cold-start.invalid"
    private val songId="song-without-a-network"
    private fun hash(text:String)=MessageDigest.getInstance("SHA-256")
        .digest(text.toByteArray(Charsets.UTF_8))
        .joinToString(""){"%02x".format(it)}
    private val scope get()=hash(server+"\n"+user.lowercase()).take(24)

    private fun cleanFixture() {
        val prefs=app.getSharedPreferences("jobbi-native-downloads-v1",Context.MODE_PRIVATE)
        val editor=prefs.edit()
        prefs.all.keys.filter{it.startsWith(scope+":")||
            it.startsWith("collection:"+scope+":")||
            it.startsWith("manual:"+scope+":")}.forEach(editor::remove)
        editor.commit()
        File(app.getExternalFilesDir(Environment.DIRECTORY_MUSIC),
            "jobbi/"+scope).deleteRecursively()
        SecureLoginStorage.clear(app)
        JobbiApi.clearSession()
    }

    @Test fun savedServerAndEncryptedAccountOpenDownloadsOnColdStartWithoutDNS() {
        cleanFixture()
        var scenario:ActivityScenario<MainActivity>?=null
        try {
            val folder=File(app.getExternalFilesDir(Environment.DIRECTORY_MUSIC),
                "jobbi/"+scope)
            assertTrue(folder.mkdirs()||folder.isDirectory)
            val file=File(folder,"saved-song.wav")
            file.writeBytes(byteArrayOf(82,73,70,70,0,0,0,0))
            val record=JSONObject()
                .put("id",songId)
                .put("title","Saved offline recording")
                .put("artist","Test artist")
                .put("album","Offline music")
                .put("fileName",file.name)
                .put("downloadId",0)
                .put("status",DownloadManager.STATUS_SUCCESSFUL)
                .put("size",file.length()).toString()
            assertTrue(app.getSharedPreferences("jobbi-native-downloads-v1",
                Context.MODE_PRIVATE).edit()
                .putString(scope+":"+hash(songId),record).commit())
            SecureLoginStorage.save(app,RememberedLogin(server,user,"test-secret"))
            assertEquals(server,SecureLoginStorage.load(app)?.server)
            OfflineNetwork.debugOnlineOverride=false
            val start=SystemClock.elapsedRealtime()
            scenario=ActivityScenario.launch(MainActivity::class.java)
            var vm:MusicViewModel?=null
            scenario.onActivity { activity->
                vm=ViewModelProvider(activity)[MusicViewModel::class.java]
            }
            while(SystemClock.elapsedRealtime()-start<10000L &&
                vm?.offlineMode!=true && vm?.error.isNullOrBlank()) {
                Thread.sleep(75)
            }
            assertTrue("Cold startup did not unlock saved music: "+vm?.error,
                vm?.offlineMode==true)
            assertTrue(vm?.signedIn==true)
            assertEquals(user,vm?.account)
            assertEquals(server,vm?.server)
            assertEquals("Downloads",vm?.selected)
            assertEquals(songId,vm?.downloadedSongs?.singleOrNull()?.id)
            assertNotNull(JobbiDownloads.playableUri(app,user,server,songId))
            assertTrue("Startup should not wait for an HTTP/DNS timeout",
                SystemClock.elapsedRealtime()-start<10000L)
            assertFalse("No remote session is authorized in offline mode",
                JobbiApi.csrf.isNotBlank())
            // Offline unlock must not discard the saved encrypted credentials.
            assertEquals(user,SecureLoginStorage.load(app)?.username)
        } finally {
            scenario?.close()
            OfflineNetwork.debugOnlineOverride=null
            cleanFixture()
        }
    }
}
