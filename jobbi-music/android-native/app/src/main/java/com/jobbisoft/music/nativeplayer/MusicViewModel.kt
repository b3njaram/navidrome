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
    var busy by androidx.compose.runtime.mutableStateOf(false)
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
    var searchResult by androidx.compose.runtime.mutableStateOf(SearchResult(emptyList(),emptyList()))
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
    fun login(username: String,password: String,configuredServer: String) = execute {
        JobbiApi.changeServer(getApplication(),configuredServer)
        server = JobbiApi.serverUrl()
        account = JobbiApi.login(username,password)
        signedIn = true
        refresh()
    }
    fun logout(onComplete: () -> Unit = {}) = execute {
        runCatching { JobbiApi.logout() }
        JobbiApi.clearSession()
        signedIn = false
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
        if (term.isBlank()) { searchResult = SearchResult(emptyList(),emptyList()); return }
        searchJob = viewModelScope.launch {
            delay(280)
            try {
                searchResult = JobbiApi.search(term.trim())
                error = ""
            } catch (e: Exception) { error = e.message ?: "Search failed" }
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
    fun setPlaylistPublic(value: Boolean) = execute {
        val listing = detail ?: return@execute
        JobbiApi.editPlaylist(listing.id, JSONObject().put("public",value))
        detail = listing.copy(public=value)
        playlists = JobbiApi.playlists()
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
