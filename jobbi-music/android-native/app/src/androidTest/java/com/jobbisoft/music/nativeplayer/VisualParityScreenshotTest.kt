package com.jobbisoft.music.nativeplayer

import android.graphics.Bitmap
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Screenshots of real production Compose screens using deterministic test-only
 * data. No NAS sign-in, streaming, deletions, or HTTP requests are required.
 * The screenshots are uploaded as an Actions artifact for comparison with
 * iPhone SwiftUI screenshots of the same fixture.
 */
@RunWith(AndroidJUnit4::class)
class VisualParityScreenshotTest {
    @get:Rule val rule=createAndroidComposeRule<MainActivity>()

    @Test fun captureHomeLibrarySearchAndAccount() {
        val vm=ViewModelProvider(rule.activity)[MusicViewModel::class.java]
        rule.waitUntil(25000) { !vm.restoringSession }
        rule.runOnUiThread { vm.installParityScreenshotFixture() }
        rule.waitForIdle()
        val labels=linkedMapOf(
            "Home" to listOf("PERSONAL RADIO","Play something good"),
            "Library" to listOf("Playlists","Artists","Favorite Songs"),
            "Search" to listOf("My Library","Find New Music"),
            "More" to listOf("Account","Signed in as")
        )
        // Use the actual target app package, not the separate instrumentation
        // APK package; adb run-as can retrieve these private files safely.
        val target=InstrumentationRegistry.getInstrumentation().targetContext
        val folder=File(target.filesDir,"jobbi-parity")
        assertTrue("Cannot create test-only screenshot directory",folder.mkdirs()||folder.isDirectory)
        for((screen,texts) in labels){
            rule.runOnUiThread { vm.showParityScreenshotScreen(screen) }
            rule.waitForIdle()
            for(label in texts){
                assertTrue("Missing $screen screen control: $label",
                    rule.onAllNodesWithText(label,substring=true,useUnmergedTree=true)
                        .fetchSemanticsNodes().isNotEmpty())
            }
            // Compose semantics can update before SurfaceFlinger presents
            // the frame. Wait for the actual window buffer after navigation.
            Thread.sleep(900)
            rule.waitForIdle()
            val screenshot=requireNotNull(
                InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
            ) { "Android emulator could not capture the full UI display" }
            val output=File(folder,"parity-android-"+screen.lowercase()+".png")
            output.outputStream().use { stream ->
                assertTrue("Failed to export screenshot "+output.name,
                    screenshot.compress(Bitmap.CompressFormat.PNG,100,stream))
            }
            assertTrue("Screenshot is empty: "+output.name,output.length()>1000)
            println("PARITY_ANDROID_FILE="+output.absolutePath)
            screenshot.recycle()
        }
        // Validate the actual full-screen Compose player, not only its
        // Kotlin layout source. No media is streamed by this debug fixture.
        rule.runOnUiThread { vm.showParityScreenshotScreen("Home") }
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Open Now Playing",useUnmergedTree=true)
            .performClick()
        rule.waitUntil(10000) {
            rule.onAllNodesWithText("PLAYING FROM",substring=true,useUnmergedTree=true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        // The ModalBottomSheet entrance also animates after semantics
        // become available; otherwise UiAutomation captures the Home frame.
        Thread.sleep(1100)
        rule.waitForIdle()
        val playerImage=requireNotNull(
            InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        ) { "Android emulator could not capture the Now Playing display" }
        val playerFile=File(folder,"parity-android-nowplaying.png")
        playerFile.outputStream().use {
            assertTrue("Could not export Android Now Playing",playerImage.compress(
                Bitmap.CompressFormat.PNG,100,it))
        }
        assertTrue(playerFile.length()>1000)
        playerImage.recycle()
    }
}
