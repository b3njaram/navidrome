package com.jobbisoft.music.nativeplayer

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class MusicViewModel(application: Application) : AndroidViewModel(application) {
    var signedIn by androidx.compose.runtime.mutableStateOf(false)
        private set
    var restoringSession by androidx.compose.runtime.mutableStateOf(true)
        private set
    var savedSignInAvailable by androidx.compose.runtime.mutableStateOf(false)
        private set
    var isAdmin by androidx.compose.runtime.mutableStateOf(false)
        private set
    var busy by androidx.compose.runtime.mutableStateOf(false)
        private set
    var visibilityUpdating by androidx.compose.runtime.mutableStateOf(false)
        private set
    var error by androidx.compose.runtime.mutableStateOf("")
        private set
    var message by androidx.compose.runtime.mutableStateOf("")
        private set
    var server by androidx.compose.runtime.mutableStateOf("")
        private set
    var selected by androidx.compose.runtime.mutableStateOf("Home")
        private set
    var detail by androidx.compose.runtime.mutableStateOf<Listing?>(null)
        private set
    var home by androidx.compose.runtime.mutableStateOf(HomeResult(emptyList(),emptyList(),emptyList(),emptyList()))
        private set
    var albums by androidx.compose.runtime.mutableStateOf<List<Album>>(emptyList())
        private set
    var playlists by androidx.compose.runtime.mutableStateOf<List<MusicPlaylist>>(emptyList())
        private set
    var favorites by androidx.compose.runtime.mutableStateOf<List<Song>>(emptyList())
        private set
    var searchQuery by androidx.compose.runtime.mutableStateOf("")
        private set
    var serverSearchSeed by androidx.compose.runtime.mutableStateOf("")
        private set
    fun openServerSearch() {
        serverSearchSeed = searchQuery.trim()
        select("Server")
    }
    var searchResult by androidx.compose.runtime.mutableStateOf(SearchResult(emptyList(),emptyList()))
        private set
    var searchingLibrary by androidx.compose.runtime.mutableStateOf(false)
        private set
    var lastSearchedTerm by androidx.compose.runtime.mutableStateOf("")
        private set
    var favoriteIds by androidx.compose.runtime.mutableStateOf<Set<String>>(emptySet())
        private set
    var account by androidx.compose.runtime.mutableStateOf("")
        private set
    var quality by androidx.compose.runtime.mutableStateOf("balanced")
        private set

    private var searchJob: Job? = null
    init {
        JobbiApi.configure(application)
        server = JobbiApi.serverUrl()
        quality = JobbiApi.quality
        restoreSavedSignIn()
    }

    private fun restoreSavedSignIn() {
        if(signedIn)return
        viewModelScope.launch {
            restoringSession = true
            error = ""
            try {
                val saved = withContext(Dispatchers.IO) {
                    SecureLoginStorage.load(getApplication())
                }
                savedSignInAvailable = saved != null
                if(saved != null){
                    // A new process has no usable Jobbi cookie. Establish a new
                    // HTTPS session using only the Keystore-encrypted account.
                    JobbiApi.changeServer(getApplication(), saved.server)
                    server = JobbiApi.serverUrl()
                    account = JobbiApi.login(saved.username, saved.password)
                    isAdmin = JobbiApi.isAdmin
                    signedIn = true
                    refresh()
                }
            }catch(e: Exception){
                JobbiApi.clearSession()
                account = ""
                isAdmin = false
                if(e is JobbiException && e.status == 401){
                    withContext(Dispatchers.IO) {
                        runCatching { SecureLoginStorage.clear(getApplication()) }
                    }
                    savedSignInAvailable = false
                    error = "Your saved credentials are no longer valid. Please sign in again."
                }else{
                    // Offline/network/server failures must NOT erase the encrypted
                    // account. Users can retry without retyping their password.
                    error = "Couldn't restore your session: "+
                        (e.message ?: "Server unavailable")+
                        ". Your saved sign-in is still on this device; tap Retry."
                }
            }finally{
                restoringSession = false
            }
        }
    }
    fun retrySavedSignIn() {
        if(!signedIn && !restoringSession && savedSignInAvailable) restoreSavedSignIn()
    }

    private fun execute(block: suspend () -> Unit) {
        viewModelScope.launch {
            busy = true
            error = ""
            try { block() }
            catch (e: Exception) { error = e.message ?: "Something went wrong" }
            finally { busy = false }
        }
    }
    fun dismissMessage() { message = ""; error = "" }
    fun login(username: String,password: String,configuredServer: String,
              remember: Boolean = true) = execute {
        JobbiApi.changeServer(getApplication(),configuredServer)
        server = JobbiApi.serverUrl()
        val confirmedAccount = JobbiApi.login(username,password)
        account = confirmedAccount
        isAdmin = JobbiApi.isAdmin
        signedIn = true
        try {
            withContext(Dispatchers.IO) {
                if(remember) {
                    SecureLoginStorage.save(getApplication(),
                        RememberedLogin(server,confirmedAccount,password))
                }else {
                    SecureLoginStorage.clear(getApplication())
                }
            }
            savedSignInAvailable = remember
        }catch (_: Exception){
            savedSignInAvailable = false
            message = "Signed in, but could not safely save your login. "+
                "You may need to sign in again the next time."
        }
        refresh()
    }
    fun logout(onComplete: () -> Unit = {}) = execute {
        // Forget the saved account before sending the logout request, even
        // when the server is unavailable. Never silently log in after Sign out.
        withContext(Dispatchers.IO) { SecureLoginStorage.clear(getApplication()) }
        savedSignInAvailable = false
        runCatching { JobbiApi.logout() }
        JobbiApi.clearSession()
        signedIn = false
        isAdmin = false
        account = ""
        selected = "Home"
        detail = null; home = HomeResult(emptyList(),emptyList(),emptyList(),emptyList())
        favorites = emptyList(); favoriteIds = emptySet(); playlists = emptyList()
        onComplete()
    }
    fun select(tab: String) {
        selected = tab
        detail = null
        when(tab) {
            "Home" -> refresh()
            "Library" -> loadLibrary()
            "Favorites" -> loadFavorites()
            "Search" -> if(searchQuery.isNotBlank()) search(searchQuery)
            "Community", "Profile", "Admin" -> Unit
        }
    }
    fun refresh() = execute {
        home = JobbiApi.home()
        playlists = home.playlists
        val stars = JobbiApi.favorites()
        favorites = stars
        favoriteIds = stars.map(Song::id).toSet()
    }
    fun loadLibrary() = execute {
        albums = JobbiApi.albums()
        playlists = JobbiApi.playlists()
    }
    fun loadFavorites() = execute {
        favorites = JobbiApi.favorites()
        favoriteIds = favorites.map(Song::id).toSet()
    }
    fun search(term: String) {
        searchQuery = term
        searchJob?.cancel()
        lastSearchedTerm = ""
        if(term.isBlank()){
            searchingLibrary = false
            searchResult = SearchResult(emptyList(),emptyList())
            return
        }
        searchingLibrary = true
        searchJob = viewModelScope.launch {
            delay(280)
            try {
                searchResult = JobbiApi.search(term.trim())
                lastSearchedTerm = term.trim()
                error = ""
            } catch(e: Exception){
                error = "Navidrome library search failed: "+(e.message ?: "Connection error")
            } finally { searchingLibrary = false }
        }
    }
    fun openAlbum(id: String) = execute {
        detail = JobbiApi.openAlbum(id)
        selected = "Detail"
    }
    fun openPlaylist(id: String) = execute {
        detail = JobbiApi.openPlaylist(id)
        selected = "Detail"
    }
    fun back() {
        detail = null
        selected = "Library"
        loadLibrary()
    }
    fun updateQuality(value: String) {
        JobbiApi.changeQuality(getApplication(), value)
        quality = JobbiApi.quality
        message = "Quality applies to newly started tracks."
    }
    fun toggleFavorite(song: Song) = execute {
        val add = song.id !in favoriteIds
        favoriteIds = if (add) favoriteIds + song.id else favoriteIds - song.id
        try {
            JobbiApi.setFavorite(song.id, add)
            if (selected == "Favorites") {
                favorites = JobbiApi.favorites()
                favoriteIds = favorites.map(Song::id).toSet()
            }
        } catch(e: Exception) {
            favoriteIds = if(add) favoriteIds - song.id else favoriteIds + song.id
            throw e
        }
    }
    fun heartAll() = execute {
        val listing = detail ?: return@execute
        if (!listing.isPlaylist) return@execute
        val ids = JobbiApi.favoriteAll(listing.id)
        favoriteIds = favoriteIds + ids
        message = "Favorited ${ids.size} tracks in this playlist."
    }
    fun setPlaylistPublic(value: Boolean) {
        val listing = detail ?: return
        if (!listing.isPlaylist || visibilityUpdating || listing.public == value) return
        if (listing.owner.isNotBlank() && !listing.owner.equals(account, ignoreCase = true)) {
            error = "Only the playlist owner (${listing.owner}) can change its visibility."
            return
        }
        viewModelScope.launch {
            visibilityUpdating = true
            error = ""
            message = ""
            try {
                val response = JobbiApi.editPlaylist(
                    listing.id, JSONObject().put("public", value)
                )
                val returned = response.optJSONObject("playlist")
                    ?: throw JobbiException("The music server did not confirm the visibility change.")
                if (!returned.has("public") || returned.optBoolean("public") != value) {
                    throw JobbiException("The playlist visibility was not saved. Please retry.")
                }
                // Keep the playlist screen open and show the confirmed server value.
                if (detail?.id == listing.id) {
                    detail = listing.copy(public = value)
                }
                playlists = playlists.map { playlist ->
                    if (playlist.id == listing.id) playlist.copy(public = value) else playlist
                }
                message = if (value) "Playlist is now public." else "Playlist is now private."
            } catch (e: Exception) {
                // Never flip the switch when a request failed or was not confirmed.
                error = e.message ?: "Could not change playlist visibility."
            } finally {
                visibilityUpdating = false
            }
        }
    }
    fun favoriteSelected(songs: List<Song>, value: Boolean) = execute {
        val unique = songs.distinctBy { it.id }
        require(unique.isNotEmpty() && unique.size <= 500) { "Select 1–500 songs." }
        var changed = 0
        val failed = mutableListOf<String>()
        for(song in unique){
            try { JobbiApi.setFavorite(song.id,value); changed++ }
            catch(e: Exception){ failed.add(song.title+": "+(e.message ?: "failed")) }
        }
        favoriteIds = if(value) favoriteIds + unique.map { it.id }
            .filterNot { id -> failed.any { it.startsWith(unique.first { s -> s.id == id }.title+":") } }
            else favoriteIds - unique.map { it.id }.toSet()
        favorites = JobbiApi.favorites()
        favoriteIds = favorites.map(Song::id).toSet()
        message = "$changed of ${unique.size} songs ${if(value) "added to" else "removed from"} Favorites."
        if(failed.isNotEmpty())error = "${failed.size} failed. First: ${failed.first()}"
    }
    fun copyOrMoveSelected(songs: List<Song>, destinationId: String,
                           sourceId: String? = null, sourceIndices: List<Int> = emptyList()) = execute {
        require(songs.isNotEmpty() && songs.size <= 500) { "Select 1–500 songs." }
        require(sourceId == null || sourceId != destinationId) { "Choose another playlist to move songs." }
        var added = 0
        for (song in songs) {
            try {
                JobbiApi.editPlaylist(destinationId, JSONObject().put("addSongId", song.id))
                added++
            } catch(e:Exception){
                throw JobbiException("Added $added of ${songs.size}; stopped on '${song.title}': ${e.message}. No source songs were removed.")
            }
        }
        if(sourceId != null){
            for(position in sourceIndices.distinct().sortedDescending()){
                try{JobbiApi.editPlaylist(sourceId,JSONObject().put("removeIndex",position))}
                catch(e:Exception){ throw JobbiException("Copied $added songs but could not finish removing the originals: ${e.message}") }
            }
            if(detail?.id == sourceId)detail = JobbiApi.openPlaylist(sourceId)
        }
        playlists = JobbiApi.playlists()
        message = if(sourceId == null) "Added $added songs to playlist."
            else "Moved $added songs to another playlist."
    }
    fun removeSelectedFromPlaylist(indices: List<Int>) = execute {
        val listing = detail ?: return@execute
        require(listing.isPlaylist) { "Open a playlist first." }
        val ordered = indices.distinct().sortedDescending()
        require(ordered.isNotEmpty() && ordered.size <= 500) { "Select 1–500 songs." }
        var removed = 0
        for(index in ordered){
            try { JobbiApi.editPlaylist(listing.id, JSONObject().put("removeIndex", index)); removed++ }
            catch(e:Exception) { throw JobbiException("Removed $removed songs. The next removal failed: ${e.message}. Reload playlist to reconcile.") }
        }
        detail = JobbiApi.openPlaylist(listing.id)
        playlists = JobbiApi.playlists()
        message = "Removed $removed entries from this playlist. Audio files are untouched."
    }
    fun quarantineSelected(songs: List<Song>) = execute {
        require(isAdmin) { "Administrator access required." }
        val unique = songs.distinctBy { it.id }
        require(unique.isNotEmpty() && unique.size <= 20) { "Select 1–20 tracks for NAS quarantine." }
        var moved = 0
        for(song in unique){
            try {
                JobbiApi.post("/api/admin/songs/"+Uri.encode(song.id)+"/quarantine",
                    JSONObject().put("confirm","QUARANTINE"))
                moved++
            }catch(e:Exception){
                throw JobbiException("Moved $moved of ${unique.size} files. Stopped at ${song.title}: ${e.message}")
            }
        }
        message = "Quarantined $moved recording(s). Audio was moved out of the active library, not permanently erased. It may take a scan to disappear."
        if(detail?.isPlaylist == true)detail = JobbiApi.openPlaylist(detail!!.id)
    }
    fun addToPlaylist(song: Song, id: String) = execute {
        JobbiApi.editPlaylist(id,JSONObject().put("addSongId",song.id))
        message = "Added ${song.title} to playlist."
    }
    fun createPlaylist(name: String) = execute {
        if (name.isBlank()) throw IllegalArgumentException("Enter a playlist name")
        JobbiApi.createPlaylist(name.trim())
        playlists = JobbiApi.playlists()
        message = "Playlist created."
    }
    fun invite(username: String) = execute {
        val listing = detail ?: return@execute
        if (!listing.isPlaylist) return@execute
        if (username.isBlank()) throw IllegalArgumentException("Enter a username")
        JobbiApi.inviteToPlaylist(listing.id,username.trim())
        message = "Invitation sent. Collaboration uses a separate shared copy."
    }
    fun uploadArt(uri: Uri) = execute {
        val listing = detail ?: return@execute
        val content = getApplication<Application>().contentResolver
        val mime = content.getType(uri) ?: "image/jpeg"
        val bytes = withContext(Dispatchers.IO) {
            content.openInputStream(uri)?.use { stream ->
                stream.readNBytes(1_048_577)
            } ?: throw IllegalArgumentException("Could not open picture")
        }
        if(bytes.size > 1_048_576)throw IllegalArgumentException("The cover must be smaller than 1 MB")
        if(mime !in listOf("image/jpeg","image/png","image/webp"))
            throw IllegalArgumentException("Choose JPG, PNG or WebP")
        JobbiApi.uploadArt(if(listing.isPlaylist)"playlist" else "album",listing.id,bytes,mime)
        message = "Your cover picture was saved."
    }
    fun rescan() = execute {
        JobbiApi.scanLibrary()
        message = "Navidrome library scan requested."
    }
}
