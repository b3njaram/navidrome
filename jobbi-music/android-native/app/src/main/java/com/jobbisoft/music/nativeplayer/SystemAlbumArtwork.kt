package com.jobbisoft.music.nativeplayer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import java.io.ByteArrayOutputStream

/**
 * The NAS artwork endpoint requires the user's cookie. SystemUI and Samsung's
 * lock screen don't share the app's cookie jar, so they cannot fetch this URI.
 * Download with the authenticated app client and publish a small, compressed
 * bitmap in Media3's MediaMetadata.artworkData instead.
 */
internal class SystemAlbumArtwork {
    private val cache = object : LruCache<String, ByteArray>(6 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray): Int = value.size
    }
    @Volatile private var owner = ""

    suspend fun get(uri: Uri): ByteArray? = withContext(Dispatchers.IO) {
        val account = JobbiApi.username
        if (account.isBlank() || JobbiApi.csrf.isBlank()) return@withContext null
        if (owner != account) {
            synchronized(cache) { cache.evictAll(); owner = account }
        }
        // No untrusted URLs, redirects, embedded credentials or external hosts.
        val target = runCatching { uri.toString().toHttpUrl() }.getOrNull()
            ?: return@withContext null
        val server = runCatching { JobbiApi.serverUrl().toHttpUrl() }.getOrNull()
            ?: return@withContext null
        if (target.scheme != "https" || target.host != server.host ||
            target.port != server.port || !target.encodedPath.startsWith("/api/cover/"))
            return@withContext null

        val key = account + "|" + uri.toString()
        synchronized(cache) { cache.get(key) }?.let { return@withContext it }

        val request = Request.Builder().url(target)
            .header("Accept", "image/*")
            .build()
        val raw = runCatching {
            JobbiApi.client.newCall(request).execute().use { response ->
                if (!response.isSuccessful || response.isRedirect ||
                    !response.header("Content-Type", "").orEmpty().startsWith("image/") ||
                    (response.body?.contentLength() ?: -1L) > 2_500_000L)
                    return@use null
                response.body?.byteStream()?.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(16384)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        if (output.size() + count > 2_500_000)
                            return@use null
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                }
            }
        }.getOrNull() ?: return@withContext null

        // Reject malicious image dimensions and avoid decoding a giant bitmap.
        val probe = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(raw, 0, raw.size, probe)
        if (probe.outWidth !in 1..8192 || probe.outHeight !in 1..8192)
            return@withContext null
        var sample = 1
        while (probe.outWidth / sample > 640 || probe.outHeight / sample > 640)
            sample *= 2
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.RGB_565
        }
        val bitmap = BitmapFactory.decodeByteArray(raw, 0, raw.size, options)
            ?: return@withContext null
        val compressed = try {
            val output = ByteArrayOutputStream()
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 84, output))
                return@withContext null
            output.toByteArray()
        } finally { bitmap.recycle() }
        if (compressed.isEmpty() || compressed.size > 512_000)
            return@withContext null
        synchronized(cache) { cache.put(key, compressed) }
        compressed
    }
}
