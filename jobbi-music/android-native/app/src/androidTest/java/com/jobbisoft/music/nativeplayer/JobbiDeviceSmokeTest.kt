package com.jobbisoft.music.nativeplayer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
        for(label in listOf("Navidrome username","Password","Keep me signed in","Listen now")){
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
}
