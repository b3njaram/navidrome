package com.jobbisoft.music.nativeplayer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Android photo pickers frequently return multi-megabyte HEIC, JPEG or PNG
 * originals; the NAS correctly accepts at most 1 MiB JPEG/PNG/WebP.
 * Decode into a bounded bitmap and encode a real JPEG rather than trusting
 * a content-provider MIME type or silently rejecting ordinary camera photos.
 */
data class PreparedJobbiImage(val bytes: ByteArray, val mime: String = "image/jpeg")

object JobbiImageUpload {
    const val MAX_BYTES = 1_048_576
    private const val MAX_SIDE = 1400

    private fun decode(context: Context, uri: Uri): Bitmap {
        val resolver = context.contentResolver
        if (Build.VERSION.SDK_INT >= 28) {
            val source = ImageDecoder.createSource(resolver, uri)
            return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                val width = info.size.width
                val height = info.size.height
                require(width in 1..30000 && height in 1..30000) {
                    "Picture dimensions are invalid"
                }
                val scale = minOf(1.0, MAX_SIDE.toDouble() / max(width, height))
                if (scale < 1.0) decoder.setTargetSize(
                    max(1, (width * scale).roundToInt()),
                    max(1, (height * scale).roundToInt())
                )
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        }
        val bounds = BitmapFactory.Options().also { it.inJustDecodeBounds = true }
        val boundsStream = resolver.openInputStream(uri)
            ?: throw IllegalArgumentException("Cannot open the selected picture")
        boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth in 1..30000 && bounds.outHeight in 1..30000) {
            "Picture format or dimensions are unsupported"
        }
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / sample > MAX_SIDE) sample *= 2
        val options = BitmapFactory.Options().also {
            it.inSampleSize = sample
            it.inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: throw IllegalArgumentException("Cannot decode the selected picture")
        // BitmapFactory does not honor camera EXIF rotation on Android 8/8.1.
        val rotation = runCatching {
            resolver.openInputStream(uri)?.use {
                when (ExifInterface(it).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
                )) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                    else -> 0f
                }
            } ?: 0f
        }.getOrDefault(0f)
        if (rotation == 0f) return decoded
        return try {
            Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height,
                Matrix().apply { postRotate(rotation) }, true)
        } finally { decoded.recycle() }
    }

    fun jpegUnderLimit(bitmap: Bitmap, maxBytes: Int = MAX_BYTES): PreparedJobbiImage {
        require(maxBytes in 128..MAX_BYTES)
        var current = bitmap
        try {
            repeat(6) {
                for (quality in intArrayOf(88, 76, 65, 52, 40)) {
                    val bytes = ByteArrayOutputStream().use { stream ->
                        check(current.compress(Bitmap.CompressFormat.JPEG, quality, stream)) {
                            "Picture could not be encoded"
                        }
                        stream.toByteArray()
                    }
                    if (bytes.size in 16..maxBytes) return PreparedJobbiImage(bytes)
                }
                if (max(current.width, current.height) <= 220) return@repeat
                val scaled = Bitmap.createScaledBitmap(current,
                    max(1, (current.width * 0.76f).roundToInt()),
                    max(1, (current.height * 0.76f).roundToInt()), true)
                if (current !== bitmap) current.recycle()
                current = scaled
            }
            throw IllegalArgumentException("Picture could not be reduced below 1 MB")
        } finally {
            if (current !== bitmap) current.recycle()
        }
    }

    suspend fun prepare(context: Context, uri: Uri): PreparedJobbiImage =
        withContext(Dispatchers.IO) {
            require(uri.scheme == "content" || uri.scheme == "file") {
                "Select a picture from your phone's gallery"
            }
            val bitmap = try { decode(context, uri) }
            catch (e: IllegalArgumentException) { throw e }
            catch (e: Exception) {
                throw IllegalArgumentException("Unable to read this picture. Try a JPEG or PNG.", e)
            }
            try { jpegUnderLimit(bitmap) }
            finally { bitmap.recycle() }
        }
}
