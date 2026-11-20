package com.jobbisoft.music.nativeplayer

import android.app.DownloadManager
import android.content.Context
import android.os.Environment
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

/** Real device-private Android offline file and playlist deletion semantics.
 * Never connects to, reads from, or deletes anything on the NAS.
 */
@RunWith(AndroidJUnit4::class)
class JobbiOfflineDeletionTest {
    private val context:Context get()=ApplicationProvider.getApplicationContext()
    private val user="jobbi-offline-e2e-fixture"
    private val server="https://fixture-music.invalid"
    private fun hash(value:String):String=MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString(""){"%02x".format(it)}
    private val scope get()=hash(server+"\n"+user.lowercase()).take(24)
    private fun prefs()=context.getSharedPreferences(
        "jobbi-native-downloads-v1",Context.MODE_PRIVATE)
    private fun folder():File=File(context.getExternalFilesDir(Environment.DIRECTORY_MUSIC),
        "jobbi/"+scope)
    private fun prepareSong(id:String):File {
        val output=File(folder(),id+".flac")
        assertTrue(output.parentFile?.mkdirs()==true||output.parentFile?.isDirectory==true)
        output.writeBytes(byteArrayOf(0x66,0x4C,0x61,0x43,0x00,0x00,0x00,0x01))
        val metadata=JSONObject().put("id",id).put("title",id)
            .put("artist","Fixture").put("album","Test collection")
            .put("fileName",output.name).put("downloadId",0)
            .put("status",DownloadManager.STATUS_SUCCESSFUL)
            .put("size",output.length())
        assertTrue(prefs().edit().putString(
            scope+":"+hash(id),metadata.toString()).commit())
        return output
    }
    private fun song(id:String)=Song(id=id,title=id,artist="Fixture",album="Test",cover=null,duration=12)

    private fun cleanup(){
        val prefixes=listOf(scope+":","collection:"+scope+":","manual:"+scope+":")
        val edit=prefs().edit()
        prefs().all.keys.filter{key->prefixes.any(key::startsWith)}.forEach(edit::remove)
        edit.commit()
        folder().deleteRecursively()
    }

    @Test fun deletingOneOfflinePlaylistPreservesSharedAndIndividuallySavedTracks(){
        cleanup()
        try {
            val unique=prepareSong("unique")
            val shared=prepareSong("shared")
            val manual=prepareSong("manual")
            JobbiDownloads.rememberCollection(context,user,server,
                "playlist:p1","First test playlist",
                listOf(song("unique"),song("shared"),song("manual")))
            JobbiDownloads.rememberCollection(context,user,server,
                "playlist:p2","Other test playlist",listOf(song("shared")))
            JobbiDownloads.rememberIndividual(context,user,server,"manual")
            assertTrue(JobbiDownloads.hasPlaylist(context,user,server,"p1"))
            assertTrue(JobbiDownloads.hasPlaylist(context,user,server,"p2"))
            for(id in listOf("unique","shared","manual"))
                assertNotNull("Missing ready offline file: "+id,
                    JobbiDownloads.playableUri(context,user,server,id))

            val removed=JobbiDownloads.removePlaylist(context,user,server,"p1")
            assertEquals("Should remove only unshared copy",1,removed.removed)
            assertEquals("Should preserve both protected copies",2,removed.keptShared)
            assertFalse("Unshared local file must be deleted",unique.exists())
            assertTrue("Another playlist's file was deleted",shared.exists())
            assertTrue("Individually saved file was deleted",manual.exists())
            assertFalse(JobbiDownloads.hasPlaylist(context,user,server,"p1"))
            assertTrue(JobbiDownloads.hasPlaylist(context,user,server,"p2"))
            assertEquals(setOf("shared","manual"),
                JobbiDownloads.downloadedSongs(context,user,server).map{it.id}.toSet())
            assertFalse(JobbiDownloads.removeSong(context,user,server,"unique"))
        } finally {
            cleanup()
        }
    }

    @Test fun removingIndividualOfflineCopyDoesNotRemoveOtherAccountFile(){
        cleanup()
        val shared=prepareSong("single")
        try {
            assertTrue(JobbiDownloads.removeSong(context,user,server,"single"))
            assertFalse("Local file survived individual deletion",shared.exists())
            assertFalse(JobbiDownloads.removeSong(context,user,server,"single"))
            assertTrue(JobbiDownloads.downloadedSongs(context,user,server).isEmpty())
        } finally {
            cleanup()
        }
    }
}
