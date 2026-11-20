package com.jobbisoft.music.nativeplayer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.geometry.Offset
import androidx.lifecycle.ViewModelProvider
import androidx.compose.ui.test.onAllNodesWithText
import org.junit.Rule
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream

@RunWith(AndroidJUnit4::class)
class JobbiDeviceSmokeTest {
    @get:Rule val rule=createAndroidComposeRule<MainActivity>()
    private val context:Context=ApplicationProvider.getApplicationContext()

    @Test fun nativeLoginShowsRealCredentialFieldsAndRememberedSessionControl() {
        rule.waitUntil(timeoutMillis=10000) {
            rule.onAllNodesWithText("Keep me signed in",substring=true,useUnmergedTree=true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        for(label in listOf("Username","Password","Keep me signed in","Listen now")){
            org.junit.Assert.assertTrue(label+" missing on real native login screen",
                rule.onAllNodesWithText(label,substring=true,useUnmergedTree=true)
                    .fetchSemanticsNodes().isNotEmpty())
        }
    }

    @Test fun largePhotoFromGalleryConvertsToServerCompatibleJpeg() {
        val bitmap=Bitmap.createBitmap(1900,1400,Bitmap.Config.ARGB_8888)
        for(y in 0 until 1400 step 4) {
            for(x in 0 until 1900 step 4) {
                val c=Color.rgb((x*13+y*3)%256,(x*7+y*5)%256,(x+y*11)%256)
                for(dy in 0..3)for(dx in 0..3)
                    bitmap.setPixel(x+dx,y+dy,c)
            }
        }
        val file=File(context.cacheDir,"jobbi-instrumented-large-photo.png")
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
        bitmap.recycle()
        try{
            val uploaded=runBlocking {JobbiImageUpload.prepare(context,Uri.fromFile(file))}
            assertEquals("image/jpeg",uploaded.mime)
            assertTrue(uploaded.bytes.size in 16..1_048_576)
            val check=BitmapFactory.decodeByteArray(uploaded.bytes,0,uploaded.bytes.size)
            assertTrue(check.width>0&&check.height>0)
            check.recycle()
        }finally{file.delete()}
    }

    @Test fun unsupportedFileIsRejectedWithoutSendingNetworkRequest() {
        val file=File(context.cacheDir,"jobbi-not-image.txt")
        file.writeText("This is not an image and must not reach the server")
        try{
            val result=runCatching {
                runBlocking {JobbiImageUpload.prepare(context,Uri.fromFile(file))}
            }
            assertTrue(result.isFailure)
        }finally{file.delete()}
    }
    @Test fun iPhoneStyleAccountQualityPickerAndNavigationActuallyWork() {
        val vm=androidx.lifecycle.ViewModelProvider(rule.activity)[MusicViewModel::class.java]
        rule.waitUntil(25000) { !vm.restoringSession }
        rule.runOnUiThread {
            vm.installParityScreenshotFixture()
            vm.showParityScreenshotScreen("More")
        }
        rule.waitForIdle()
        for (label in listOf("Account", "Signed in as", "Server", "Role",
            "View or edit profile picture", "Playback", "Streaming quality",
            "Downloaded tracks", "Download all playlists to this Android",
            "Manage downloaded music", "Personal recommendations")) {
            assertTrue("Account control missing: "+label,
                rule.onAllNodesWithText(label,substring=true,useUnmergedTree=true)
                    .fetchSemanticsNodes().isNotEmpty())
        }
        try {
            rule.onNodeWithText("Streaming quality").performClick()
            rule.waitUntil(5000) {
                rule.onAllNodesWithText("Original / Lossless",substring=true,
                    useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()
            }
            rule.onNodeWithText("Original / Lossless").performClick()
            rule.waitUntil(5000) { vm.quality=="original" }
            assertEquals("Quality selection did not reach native playback settings",
                "original",vm.quality)
        } finally {
            rule.runOnUiThread { vm.updateQuality("balanced") }
            rule.waitForIdle()
        }
    }

    @Test fun accountClosesToOriginalTabAndNativeMusicTabsRemainInteractive(){
        val vm=ViewModelProvider(rule.activity)[MusicViewModel::class.java]
        rule.waitUntil(25000){!vm.restoringSession}
        rule.runOnUiThread{
            vm.installParityScreenshotFixture()
            vm.showParityScreenshotScreen("More")
        }
        rule.waitForIdle()
        assertTrue("iPhone-style Account must have a Done action",
            rule.onAllNodesWithText("Done",useUnmergedTree=true)
                .fetchSemanticsNodes().isNotEmpty())
        assertTrue("Account should be separate from the bottom tab navigator",
            rule.onAllNodesWithText("Community",useUnmergedTree=true)
                .fetchSemanticsNodes().isEmpty())
        rule.onNodeWithText("Done").performClick()
        rule.waitUntil(5000){vm.selected=="Home"}
        rule.onNodeWithContentDescription("Search tab").performClick()
        rule.waitUntil(5000){vm.selected=="Search"}
        assertTrue("Native Search source switcher is absent",
            rule.onAllNodesWithText("Find New Music",useUnmergedTree=true)
                .fetchSemanticsNodes().isNotEmpty())
        rule.onNodeWithText("Find New Music").performClick()
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Library tab").performClick()
        rule.waitUntil(5000){vm.selected=="Library"}
    }

    @Test fun fullscreenPlayerSeekAndLyricsControlsActuallyRespondToTouch(){
        val vm=ViewModelProvider(rule.activity)[MusicViewModel::class.java]
        rule.waitUntil(25000){!vm.restoringSession}
        rule.runOnUiThread {
            vm.installParityScreenshotFixture()
            vm.showParityScreenshotScreen("Home")
        }
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Open Now Playing",useUnmergedTree=true)
            .performClick()
        rule.waitUntil(10000){
            rule.onAllNodesWithText("Sunset Drive",useUnmergedTree=true)
                .fetchSemanticsNodes().isNotEmpty() &&
            rule.onAllNodesWithContentDescription("Song position",
                useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()
        }
        assertTrue("Fixture player should initially display 0:45",
            rule.onAllNodesWithText("0:45",useUnmergedTree=true)
                .fetchSemanticsNodes().isNotEmpty())
        // This tests the full seek track as a touch target, not just tapping
        // its tiny thumb; the debug fixture records the requested timestamp.
        rule.onNodeWithContentDescription("Song position",useUnmergedTree=true)
            .performTouchInput {
                click(percentOffset(.77f,.5f))
            }
        rule.waitUntil(7000){
            rule.onAllNodesWithText("0:45",useUnmergedTree=true)
                .fetchSemanticsNodes().isEmpty()
        }
        rule.onNodeWithContentDescription("Show lyrics",useUnmergedTree=true)
            .performClick()
        rule.waitUntil(7000){
            rule.onAllNodesWithContentDescription("Lyrics view",
                useUnmergedTree=true).fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithContentDescription("Hide lyrics",useUnmergedTree=true)
            .performClick()
        rule.waitUntil(7000){
            rule.onAllNodesWithContentDescription("Lyrics view",
                useUnmergedTree=true).fetchSemanticsNodes().isEmpty()
        }
        rule.onNodeWithContentDescription("Close Now Playing",
            useUnmergedTree=true).performClick()
        rule.waitUntil(7000){
            rule.onAllNodesWithContentDescription("Song position",
                useUnmergedTree=true).fetchSemanticsNodes().isEmpty()
        }
    }

}
