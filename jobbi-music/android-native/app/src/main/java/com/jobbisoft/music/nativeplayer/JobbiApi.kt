package com.jobbisoft.music.nativeplayer

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

data class RemoteCollectionImport(
    val id:String,
    val filename:String,
    val status:String,
    val message:String,
    val total:Int,
    val completed:Int,
    val queued:Int,
    val review:Int,
    val pending:Int,
    val authorized:Boolean
)
fun JSONObject.collectionImport():RemoteCollectionImport=RemoteCollectionImport(
    id=optStr("id"),
    filename=optStr("filename","Collection"),
    status=optStr("status"),
    message=optStr("message"),
    total=optInt("total"),
    completed=optInt("completed"),
    queued=optInt("queued"),
    review=optInt("review"),
    pending=optInt("pending"),
    authorized=optBoolean("authorized")
)

data class Song(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val cover: String?,
    val duration: Long,
    val albumId: String? = null,
    val suffix: String = "",
    val size: Long = 0L
)
data class Album(val id: String, val name: String, val artist: String, val cover: String?)
data class MusicPlaylist(val id: String, val name: String, val count: Int, val public: Boolean)
data class Listing(
    val title: String,
    val songs: List<Song> = emptyList(),
    val albums: List<Album> = emptyList(),
    val isPlaylist: Boolean = false,
    val public: Boolean = false,
    val id: String = "",
    val owner: String = ""
)
data class SearchResult(val songs: List<Song>, val albums: List<Album>)
data class HomeResult(val recent: List<Album>, val featured: List<Album>, val songs: List<Song>, val playlists: List<MusicPlaylist>)
data class RecommendationsResult(
    val recentTracks: List<Song> = emptyList(),
    val topWeek: List<Song> = emptyList(),
    val topMonth: List<Song> = emptyList(),
    val madeForYou: List<Song> = emptyList(),
    val timeMix: List<Song> = emptyList(),
    val timeLabel: String = "Daily Mix",
    val weatherMix: List<Song> = emptyList(),
    val weatherLabel: String = "",
    val weatherCity: String = "",
    val weatherError: String = "",
    val trackingAvailable: Boolean = true,
    val trackingNote: String = ""
)

fun JSONObject.optStr(key: String, fallback: String = ""): String =
    if (isNull(key)) fallback else optString(key, fallback).takeUnless { it == "null" } ?: fallback

fun JSONObject.song(): Song = Song(
    id = optStr("id"),
    title = optStr("title", optStr("name", "Untitled")),
    artist = optStr("artist", "Unknown artist"),
    album = optStr("album", "Unknown album"),
    cover = optStr("coverArt").ifEmpty { null },
    duration = optLong("duration", 0L),
    albumId = optStr("albumId").ifEmpty { null },
    suffix = optStr("suffix"),
    size = optLong("size",0L)
)
fun JSONObject.album(): Album = Album(
    optStr("id"), optStr("name", optStr("title", "Untitled")),
    optStr("artist", "Unknown artist"), optStr("coverArt").ifEmpty { null }
)
fun JSONObject.playlist(): MusicPlaylist = MusicPlaylist(
    optStr("id"), optStr("name", "Untitled playlist"),
    optInt("songCount", optInt("song_count", 0)), optBoolean("public", false)
)
fun JSONArray?.songs(): List<Song> = this?.let { a ->
    (0 until a.length()).mapNotNull { a.optJSONObject(it)?.song()?.takeIf { song -> song.id.isNotBlank() } }
} ?: emptyList()
fun JSONArray?.albums(): List<Album> = this?.let { a ->
    (0 until a.length()).mapNotNull { a.optJSONObject(it)?.album()?.takeIf { album -> album.id.isNotBlank() } }
} ?: emptyList()
fun JSONArray?.playlists(): List<MusicPlaylist> = this?.let { a ->
    (0 until a.length()).mapNotNull { a.optJSONObject(it)?.playlist()?.takeIf { playlist -> playlist.id.isNotBlank() } }
} ?: emptyList()

class JobbiException(message: String, val status: Int = 0) : IOException(message)

/**
 * Account-scoped HTTP-only cookie jar. Nothing is written to disk except the
 * user's configured HTTPS server and quality. No Navidrome password is saved.
 * ExoPlayer, Coil images, and metadata all use this same OkHttp client.
 */
object JobbiApi {
    private const val DEFAULT_SERVER = "https://music.jobbisoft.com.mx"
    private val lock = Any()
    private val cookies = mutableListOf<Cookie>()
    @Volatile private var base = DEFAULT_SERVER
    @Volatile var csrf: String = ""
        private set
    @Volatile var username: String = ""
        private set
    @Volatile var isAdmin: Boolean = false
        private set
    @Volatile var quality: String = "balanced"
        private set

    private val jar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, received: List<Cookie>) {
            if (url.host != base.toHttpUrl().host) return
            synchronized(lock) {
                for (cookie in received) {
                    cookies.removeAll { it.name == cookie.name && it.domain == cookie.domain }
                    if (cookie.expiresAt > System.currentTimeMillis()) cookies.add(cookie)
                }
            }
        }
        override fun loadForRequest(url: HttpUrl): List<Cookie> =
            if (url.host != base.toHttpUrl().host) emptyList()
            else synchronized(lock) { cookies.filter { it.matches(url) } }
    }

    val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(jar).followRedirects(false).followSslRedirects(false)
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()

    fun configure(context: Context) {
        val prefs = context.getSharedPreferences("jobbi-native", Context.MODE_PRIVATE)
        val saved = prefs.getString("server", DEFAULT_SERVER) ?: DEFAULT_SERVER
        base = validateUrl(saved)
        quality = prefs.getString("quality", "balanced").orEmpty()
            .takeIf { it in listOf("original", "balanced", "saver") } ?: "balanced"
    }
    fun serverUrl(): String = base

    fun changeServer(context: Context, input: String) {
        val newBase = validateUrl(input)
        if (newBase != base) {
            synchronized(lock) { cookies.clear() }
            username = ""
            isAdmin = false
            csrf = ""
        }
        base = newBase
        context.getSharedPreferences("jobbi-native", Context.MODE_PRIVATE)
            .edit().putString("server", base).apply()
    }
    fun changeQuality(context: Context, input: String) {
        require(input in listOf("original", "balanced", "saver"))
        quality = input
        context.getSharedPreferences("jobbi-native", Context.MODE_PRIVATE)
            .edit().putString("quality", input).apply()
    }
    fun clearSession() {
        username = ""; isAdmin = false; csrf = ""
        synchronized(lock) { cookies.clear() }
    }
    /** Display the account's own downloaded recordings after offline key unlock.
     * Does not create a session, cookie, or access to remote APIs.
     */
    fun useOfflineIdentity(rememberedUsername:String){
        clearSession()
        username=rememberedUsername
    }
    private fun validateUrl(input: String): String {
        val value = input.trim().trimEnd('/')
        val url = try { value.toHttpUrl() } catch (e: Exception) {
            throw IllegalArgumentException("Enter a valid HTTPS server URL")
        }
        require(url.scheme == "https" && url.username.isEmpty() && url.password.isEmpty()
            && url.encodedPath == "/" && url.query == null && url.fragment == null) {
            "Use an HTTPS server address without a path, query, or password"
        }
        return value
    }
    private fun url(path: String): String = base + (if (path.startsWith("/")) path else "/$path")
    fun coverUrl(cover: String?): String? =
        cover?.takeIf { it.isNotBlank() }?.let { url("/api/cover/" + Uri.encode(it)) }
    fun streamUrl(id: String, chosenQuality: String = quality): String =
        url("/api/stream/" + Uri.encode(id) + "?quality=" + Uri.encode(chosenQuality))

    private suspend fun request(path: String, method: String = "GET",
                                payload: JSONObject? = null,
                                bytes: ByteArray? = null,
                                mime: String = "application/json"): String =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder().url(url(path))
                .header("Accept", "application/json")
                .header("User-Agent", "Jobbi-Music-Native/1.0")
            if (method != "GET" && csrf.isNotBlank()) builder.header("X-CSRF-Token", csrf)
            val body = when {
                bytes != null -> bytes.toRequestBody(mime.toMediaType())
                method != "GET" -> (payload ?: JSONObject()).toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                else -> null
            }
            val req = builder.method(method, body).build()
            val response = try { client.newCall(req).execute() } catch (e: IOException) {
                throw JobbiException("Cannot reach your music server. Check Wi-Fi or mobile data: ${e.message}")
            }
            response.use {
                val data = it.body?.string().orEmpty()
                if (!it.isSuccessful) {
                    val message = runCatching { JSONObject(data).optStr("error") }.getOrNull()
                        .orEmpty().ifBlank { "Request failed (HTTP ${it.code})" }
                    throw JobbiException(message, it.code)
                }
                data
            }
        }

    suspend fun getObject(path: String): JSONObject = JSONObject(request(path))
    suspend fun getArray(path: String): JSONArray = JSONArray(request(path))
    suspend fun post(path: String, payload: JSONObject = JSONObject()): JSONObject =
        JSONObject(request(path, "POST", payload))
    suspend fun patch(path: String, payload: JSONObject): JSONObject =
        JSONObject(request(path, "PATCH", payload))
    suspend fun delete(path: String): JSONObject =
        JSONObject(request(path, "DELETE"))
    suspend fun uploadAvatar(bytes: ByteArray, mime: String) {
        require(bytes.size in 16..1_048_576 && mime in listOf("image/jpeg","image/png","image/webp"))
        request("/api/social/me/avatar", method="POST",bytes=bytes,mime=mime)
    }
    fun cookieHeader(relative: String): String {
        val target = authenticatedUrl(relative).toHttpUrl()
        return jar.loadForRequest(target).joinToString("; ") { it.name + "=" + it.value }
    }
    fun authenticatedUrl(relative: String): String {
        require(relative.startsWith("/api/") && !relative.contains("..") && !relative.startsWith("//"))
        return url(relative)
    }

    suspend fun login(user: String, password: String): String {
        val data = post("/api/login", JSONObject().put("username", user.trim()).put("password", password))
        csrf = data.optStr("csrfToken")
        username = data.optStr("username")
        isAdmin = data.optBoolean("admin",false)
        check(csrf.isNotBlank() && username.isNotBlank()) { "Login did not return an active session" }
        return username
    }
    suspend fun logout() {
        try { post("/api/logout") } finally { clearSession() }
    }

    suspend fun home(): HomeResult {
        val data = getObject("/api/home")
        return HomeResult(
            data.optJSONArray("recent").albums(),
            data.optJSONArray("featured").albums(),
            data.optJSONArray("songs").songs(),
            data.optJSONArray("playlists").playlists()
        )
    }
    suspend fun recommendations(city: String = ""): RecommendationsResult {
        val offset=-java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis())/60000
        val path="/api/recommendations?timezoneOffsetMinutes="+offset+
            (if(city.isNotBlank())"&city="+Uri.encode(city.take(80)) else "")
        val data=getObject(path)
        return RecommendationsResult(
            recentTracks=data.optJSONArray("recentTracks").songs(),
            topWeek=data.optJSONArray("topWeek").songs(),
            topMonth=data.optJSONArray("topMonth").songs(),
            madeForYou=data.optJSONArray("madeForYou").songs(),
            timeMix=data.optJSONArray("timeMix").songs(),
            timeLabel=data.optStr("timeLabel","Daily Mix"),
            weatherMix=data.optJSONArray("weatherMix").songs(),
            weatherLabel=data.optStr("weatherLabel"),
            weatherCity=data.optJSONObject("weather")?.optStr("city") ?: "",
            weatherError=data.optStr("weatherError"),
            trackingAvailable=data.optBoolean("trackingAvailable",true),
            trackingNote=data.optStr("trackingNote")
        )
    }
    suspend fun search(term: String): SearchResult {
        val data = getObject("/api/search?q=" + Uri.encode(term.take(120)))
        return SearchResult(data.optJSONArray("song").songs(), data.optJSONArray("album").albums())
    }
    suspend fun collectionJobs():List<RemoteCollectionImport>{
        val jobs=getObject("/api/collection-jobs").optJSONArray("jobs")?:JSONArray()
        return (0 until jobs.length()).mapNotNull { idx ->
            jobs.optJSONObject(idx)?.collectionImport()
        }
    }
    suspend fun controlCollectionJob(id:String,action:String){
        require(action in setOf("pause","resume","retry"))
        post("/api/collection-jobs/"+Uri.encode(id)+"/control",
            JSONObject().put("action",action))
    }
    suspend fun albums(): List<Album> =
        getObject("/api/library/albums?offset=0&size=100").optJSONArray("albums").albums()
    suspend fun playlists(): List<MusicPlaylist> = getArray("/api/playlists").playlists()
    suspend fun favorites(): List<Song> = getObject("/api/starred").optJSONArray("song").songs()

    suspend fun openAlbum(id: String): Listing {
        val data = getObject("/api/albums/" + Uri.encode(id))
        return Listing(title = data.optStr("name", "Album"),songs = data.optJSONArray("song").songs(),
            id = id)
    }
    suspend fun openPlaylist(id: String): Listing {
        val data = getObject("/api/playlists/" + Uri.encode(id))
        return Listing(title = data.optStr("name", "Playlist"),songs = data.optJSONArray("entry").songs(),
            id = id, isPlaylist = true, public = data.optBoolean("public"),
            owner = data.optStr("owner"))
    }

    suspend fun setFavorite(id: String, favorite: Boolean) {
        post("/api/star", JSONObject().put("id", id).put("starred", favorite))
    }
    suspend fun createPlaylist(name: String): MusicPlaylist =
        post("/api/playlists", JSONObject().put("name", name))
            .getJSONObject("playlist").playlist()
    suspend fun editPlaylist(id: String, update: JSONObject): JSONObject =
        patch("/api/playlists/" + Uri.encode(id), update)
    suspend fun favoriteAll(id: String): Set<String> {
        val data = post("/api/playlists/" + Uri.encode(id) + "/favorite-all")
        return data.optJSONArray("ids")?.let { a ->
            (0 until a.length()).mapNotNull { a.optString(it).takeIf(String::isNotEmpty) }.toSet()
        } ?: emptySet()
    }
    suspend fun inviteToPlaylist(playlistId: String, member: String) {
        val data = post("/api/social/playlists/import",
            JSONObject().put("navidromePlaylistId", playlistId).put("visibility", "private"))
        val copyId = data.optStr("id")
        if (copyId.isBlank()) throw JobbiException("Shared playlist unavailable")
        post("/api/social/playlists/" + Uri.encode(copyId) + "/invitations",
            JSONObject().put("username", member).put("canEdit", true))
    }
    suspend fun uploadArt(kind: String, id: String, bytes: ByteArray, mime: String) {
        require(kind in setOf("album", "playlist") && bytes.size <= 1_048_576 && bytes.size >= 16)
        request("/api/artwork/$kind/" + Uri.encode(id), method = "POST", bytes = bytes, mime = mime)
    }
    suspend fun scanLibrary() { post("/api/library/scan") }
}
