package com.jobbisoft.music.nativeplayer

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.FileNotFoundException
import java.util.UUID

/**
 * Android Auto cannot authenticate to the private NAS artwork URL or read our
 * app's cookie jar. Advertise an opaque, app-owned content URI instead.
 *
 * The read-only provider checks the live account and resolves only validated
 * /api/cover/ URLs; the random token never exposes a server URL or song ID.
 * Android Auto is in a separate process and may read images long after the
 * corresponding MediaBrowser item was delivered.
 */
class CarArtworkProvider : ContentProvider() {
    private data class Entry(val remote: Uri, val owner: String)

    companion object {
        private val lock = Any()
        private val byToken = LinkedHashMap<String, Entry>()
        private val byRemote = HashMap<String, String>()
        private const val MAX_ART_ENTRIES = 2000
        private val artwork = SystemAlbumArtwork()
        private var registeredOwner = ""

        internal fun isTrustedCoverUri(source: Uri?, server: Uri?): Boolean {
            if (source == null || server == null) return false
            return source.scheme == "https" && server.scheme == "https" &&
                source.host == server.host && source.port == server.port &&
                source.userInfo == null && source.fragment == null &&
                source.pathSegments.size == 3 &&
                source.pathSegments[0] == "api" &&
                source.pathSegments[1] == "cover" &&
                !source.pathSegments[2].isNullOrBlank() &&
                source.query == null
        }

        private fun owner(): String =
            JobbiApi.serverUrl() + "|" + JobbiApi.username

        /** Only call with JobbiApi.coverUrl() outputs. Invalid or unsigned-in
         * sources become no artwork, never a link to the private NAS. */
        fun localUri(context: Context, remote: Uri?): Uri? {
            if (JobbiApi.username.isBlank() || JobbiApi.csrf.isBlank()) return null
            val server = Uri.parse(JobbiApi.serverUrl())
            if (!isTrustedCoverUri(remote, server)) return null
            val owner = owner()
            val token: String = synchronized(lock) {
                if (registeredOwner != owner) {
                    byToken.clear()
                    byRemote.clear()
                    registeredOwner = owner
                }
                val key = remote.toString()
                byRemote[key]?.takeIf { byToken.containsKey(it) } ?: run {
                    // Clean old handles when thousands of tracks are browsed.
                    if (byToken.size >= MAX_ART_ENTRIES) {
                        val oldToken = byToken.keys.first()
                        val oldRemote = byToken.remove(oldToken)?.remote?.toString()
                        if (oldRemote != null) byRemote.remove(oldRemote)
                    }
                    UUID.randomUUID().toString().also {
                        byToken[it] = Entry(remote!!, owner)
                        byRemote[key] = it
                    }
                }
            }
            return Uri.Builder().scheme("content")
                .authority(context.packageName + ".carart")
                .appendPath("cover").appendPath(token).build()
        }

        /** The service uses the original HTTPS URL for authenticated artwork
         * hydration; Android Auto sees only the content:// URI. */
        fun originalUri(local: Uri): Uri? {
            if (local.scheme != "content" || local.pathSegments.size != 2 ||
                local.pathSegments[0] != "cover") return null
            return synchronized(lock) {
                byToken[local.lastPathSegment]?.takeIf {
                    it.owner == owner() && JobbiApi.csrf.isNotBlank()
                }?.remote
            }
        }
    }

    override fun onCreate(): Boolean = true

    override fun getType(uri: Uri): String? =
        if (uri.pathSegments.size == 2 && uri.pathSegments[0] == "cover")
            "image/jpeg" else null

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val context = context ?: throw FileNotFoundException("No app context")
        if (mode != "r" || uri.scheme != "content" ||
            uri.authority != context.packageName + ".carart" ||
            uri.pathSegments.size != 2 || uri.pathSegments[0] != "cover")
            throw FileNotFoundException("Artwork is read-only")

        val token = uri.lastPathSegment ?: throw FileNotFoundException("Missing artwork token")
        val entry = synchronized(lock) { byToken[token] }
            ?: throw FileNotFoundException("Artwork token not registered")
        if (JobbiApi.csrf.isBlank() || JobbiApi.username.isBlank() ||
            entry.owner != owner())
            throw FileNotFoundException("No active matching music session")

        val directory = File(context.cacheDir, "jobbi-car-art")
        if (!directory.isDirectory && !directory.mkdirs())
            throw FileNotFoundException("Cannot create artwork cache")
        val target = File(directory, token + ".jpg")
        if (!target.isFile || target.length() == 0L) {
            val image = runBlocking {
                withTimeoutOrNull(9000L) { artwork.get(entry.remote) }
            } ?: throw FileNotFoundException("Artwork not available")
            if (image.isEmpty() || image.size > 512_000)
                throw FileNotFoundException("Artwork failed validation")
            // The filename is an opaque UUID, never caller-supplied file paths.
            target.writeBytes(image)
        }
        return ParcelFileDescriptor.open(target, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun query(uri: Uri, projection: Array<out String>?,
                       selection: String?, selectionArgs: Array<out String>?,
                       sortOrder: String?): Cursor? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?,
                        selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?,
                        selectionArgs: Array<out String>?): Int = 0
}
