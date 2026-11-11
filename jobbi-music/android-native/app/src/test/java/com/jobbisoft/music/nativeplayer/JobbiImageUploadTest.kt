package com.jobbisoft.music.nativeplayer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Random

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28])
class JobbiImageUploadTest {
    @Test fun phoneCameraBitmapCompressesBelowServerLimitWithValidJpegBytes() {
        val bitmap=Bitmap.createBitmap(1600,1200,Bitmap.Config.ARGB_8888)
        val pixels=IntArray(1600*1200)
        val random=Random(2026)
        for(i in pixels.indices)
            pixels[i]=Color.rgb(random.nextInt(256),random.nextInt(256),random.nextInt(256))
        bitmap.setPixels(pixels,0,1600,0,0,1600,1200)
        try {
            val image=JobbiImageUpload.jpegUnderLimit(bitmap)
            assertEquals("image/jpeg",image.mime)
            assertTrue(image.bytes.size in 16..1_048_576)
            assertEquals(0xff,image.bytes[0].toInt() and 0xff)
            assertEquals(0xd8,image.bytes[1].toInt() and 0xff)
            val decoded=BitmapFactory.decodeByteArray(image.bytes,0,image.bytes.size)
            assertTrue(decoded.width>0&&decoded.height>0)
            decoded.recycle()
        }finally{bitmap.recycle()}
    }

    @Test fun smallAvatarPreservesUsefulDimensionsAndDoesNotProduceEmptyImage(){
        val bitmap=Bitmap.createBitmap(300,400,Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.CYAN)
        try{
            val image=JobbiImageUpload.jpegUnderLimit(bitmap)
            val decoded=BitmapFactory.decodeByteArray(image.bytes,0,image.bytes.size)
            assertEquals(300,decoded.width)
            assertEquals(400,decoded.height)
            assertFalse(image.bytes.isEmpty())
            decoded.recycle()
        }finally{bitmap.recycle()}
    }

    @Test fun imageLimitCanNeverExceedBackendLimit(){
        val bitmap=Bitmap.createBitmap(100,100,Bitmap.Config.ARGB_8888)
        try{
            assertTrue(runCatching{
                JobbiImageUpload.jpegUnderLimit(bitmap,1_048_577)
            }.isFailure)
        }finally{bitmap.recycle()}
    }
}
