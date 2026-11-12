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
    var offlineMode by androidx.compose.runtime.mutableStateOf(false)
        private set
    var downloadedSongs by androidx.compose.runtime.mutableStateOf<List<Song>>(emptyList())
        private set
    var offlineCollections by androidx.compose.runtime.mutableStateOf<List<OfflineCollection>>(emptyList())
        private set
    var offlineCollectionId by androidx.compose.runtime.mutableStateOf<String?>(null)
        private set
    fun viewOfflineCollection(id:String){offlineCollectionId=id}
    fun closeOfflineCollection(){offlineCollectionId=null}
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
    var removalBusy by androidx.compose.runtime.mutableStateOf(false)
        private set
    var removalPreviews by androidx.compose.runtime.mutableStateOf<List<JSONObject>>(emptyList())
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
    var downloadStats by androidx.compose.runtime.mutableStateOf(JobbiDownloadStats())
        private set
    var artRevision by androidx.compose.runtime.mutableIntStateOf(0)
        private set
    var recommendations by androidx.compose.runtime.mutableStateOf<RecommendationsResult?>(null)
        private set
    var recommendationsLoading by androidx.compose.runtime.mutableStateOf(false)
        private set
    var recommendationsError by androidx.compose.runtime.mutableStateOf("")
        private set
    var weatherCity by androidx.compose.runtime.mutableStateOf("")
        private set
    private fun loadWeatherPreference(){
        if(account.isBlank())return
        weatherCity=getApplication<Application>().getSharedPreferences(
            "jobbi-native-weather",android.content.Context.MODE_PRIVATE)
            .getString("city:"+account.lowercase(),"").orEmpty()
    }
    fun chooseWeatherCity(city:String){
        val trimmed=city.trim().take(80)
        if(trimmed.isNotBlank()&&trimmed.length<2){
            recommendationsError="Enter at least two characters for your city."
            return
        }
        weatherCity=trimmed
        getApplication<Application>().getSharedPreferences(
            "jobbi-native-weather",android.content.Context.MODE_PRIVATE)
            .edit().putString("city:"+account.lowercase(),trimmed).apply()
        refreshRecommendations()
    }
    fun refreshRecommendations(){
        if(!signedIn||offlineMode||account.isBlank())return
        viewModelScope.launch {
            recommendationsLoading=true
            recommendationsError=""
            try{ recommendations=JobbiApi.recommendations(weatherCity) }
            catch(e:Exception){
                recommendationsError="Personalized recommendations unavailable: "+
                    (e.message ?: "Server unavailable")
            }finally{ recommendationsLoading=false }
        }
    }

    private var searchJob: Job? = null
    init {
        JobbiApi.configure(application)
        server = JobbiApi.serverUrl()
        quality = JobbiApi.quality
        restoreSavedSignIn()
    }

    private fun restoreSavedSignIn() {
        if(signedIn && !offlineMode)return
        viewModelScope.launch {
            restoringSession = true
            error = ""
            var remembered: RememberedLogin? = null
            try {
                remembered=withContext(Dispatchers.IO){
                    SecureLoginStorage.load(getApplication())
                }
                savedSignInAvailable = remembered != null
                val saved = remembered
                if(saved != null){
                    JobbiApi.changeServer(getApplication(),saved.server)
                    server = JobbiApi.serverUrl()
                    account = JobbiApi.login(saved.username,saved.password)
                    isAdmin = JobbiApi.isAdmin
                    offlineMode = false
                    signedIn = true
                    selected = "Home"
                    loadWeatherPreference()
                    refresh()
                }
            }catch(e: Exception){
                JobbiApi.clearSession()
                isAdmin = false
                if(e is JobbiException && e.status == 401){
                    withContext(Dispatchers.IO){
                        runCatching{SecureLoginStorage.clear(getApplication())}
                    }
                    savedSignInAvailable = false
                    signedIn = false
                    offlineMode = false
                    account = ""
                    error = "Saved credentials are no longer valid. Sign in again."
                }else{
                    // Remembered account unlocks ONLY its own locally downloaded
                    // music; no server actions or admin privileges are granted.
                    val cached=remembered?.let {saved ->
                        withContext(Dispatchers.IO){
                            JobbiDownloads.downloadedSongs(getApplication(),saved.username,saved.server)
                        }
                    }.orEmpty()
                    if(remembered!=null && cached.isNotEmpty()){
                        account=remembered!!.username
                        server=remembered!!.server
                        JobbiApi.useOfflineIdentity(account)
                        downloadedSongs=cached
                        offlineCollections=withContext(Dispatchers.IO){
                            JobbiDownloads.completedCollections(getApplication(),account,server)
                        }
                        offlineMode=true
                        signedIn=true
                        selected="Downloads"
                        message="You're offline. Playing ${cached.size} downloaded recordings. "+
                            "Reconnect from More when the server becomes available."
                        updateDownloadStats()
                    }else{
                        signedIn=false
                        account=""
                        error="Couldn't connect to your music server. "+
                            "Your saved sign-in is still on this device; retry when online."
                    }
                }
            }finally{restoringSession=false}
        }
    }
    fun retrySavedSignIn() {
        if((!signedIn || offlineMode)&&!restoringSession&&savedSignInAvailable)
            restoreSavedSignIn()
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
        offlineMode = false
        loadWeatherPreference()
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
        if(!offlineMode)runCatching { JobbiApi.logout() }
        JobbiApi.clearSession()
        signedIn = false
        offlineMode = false
        downloadedSongs = emptyList()
        offlineCollections = emptyList()
        offlineCollectionId = null
        isAdmin = false
        account = ""
        selected = "Home"
        detail = null; home = HomeResult(emptyList(),emptyList(),emptyList(),emptyList())
        favorites = emptyList(); favoriteIds = emptySet(); playlists = emptyList()
        downloadStats = JobbiDownloadStats()
        recommendations = null
        recommendationsError = ""
        weatherCity = ""
        onComplete()
    }
    fun select(tab: String) {
        if(offlineMode && tab !in setOf("Downloads","More")){
            message="Reconnect in More to access online music. Your downloads are available."
            selected="Downloads"
            return
        }
        selected = tab
        detail = null
        when(tab) {
            "Downloads" -> refreshDownloadedSongs()
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
        updateDownloadStats()
        refreshRecommendations()
    }
    fun loadLibrary() = execute {
        albums = JobbiApi.albums()
        playlists = JobbiApi.playlists()
    }
    fun loadFavorites() = execute {
        favorites = JobbiApi.favorites()
        favoriteIds = favorites.map(Song::id).toSet()
        updateDownloadStats()
    }

    fun refreshDownloadedSongs() {
        if(account.isBlank())return
        viewModelScope.launch {
            val output=withContext(Dispatchers.IO){
                JobbiDownloads.downloadedSongs(getApplication(),account,server) to
                    JobbiDownloads.completedCollections(getApplication(),account,server)
            }
            downloadedSongs=output.first
            offlineCollections=output.second
            updateDownloadStats()
        }
    }
    fun updateDownloadStats() {
        if(!signedIn||account.isBlank())return
        viewModelScope.launch {
            val count=withContext(Dispatchers.IO) {
                JobbiDownloads.stats(getApplication(),account,server)
            }
            downloadStats=count
        }
    }
    private suspend fun enqueueOffline(songs:List<Song>,label:String,wifiOnly:Boolean){
        val result=withContext(Dispatchers.IO){
            JobbiDownloads.enqueue(getApplication(),account,server,songs,wifiOnly)
        }
        message="$label: ${result.queued} queued, ${result.alreadySaved} already saved"+
            (if(result.failed>0)", ${result.failed} failed to queue" else "")+
            ". "+result.notice
        refreshDownloadedSongs()
    }
    fun downloadSong(song:Song,wifiOnly:Boolean=false)=execute {
        enqueueOffline(listOf(song),song.title,wifiOnly)
        withContext(Dispatchers.IO){
            JobbiDownloads.rememberIndividual(getApplication(),account,server,song.id)
        }
    }
    fun hasOfflinePlaylist(id:String):Boolean =
        account.isNotBlank() &&
            JobbiDownloads.hasPlaylist(getApplication(),account,server,id)

    fun removePlaylistDownloads(id:String)=execute {
        val result=withContext(Dispatchers.IO) {
            JobbiDownloads.removePlaylist(getApplication(),account,server,id)
        }
        if(offlineCollectionId=="playlist:"+id)closeOfflineCollection()
        refreshDownloadedSongs()
        message="Removed "+result.removed+" offline recordings from this device. "+
            result.keptShared+" shared songs kept. The NAS playlist was not changed."
    }
    fun downloadPlaylist(id:String,wifiOnly:Boolean=true)=execute {
        val playlist=JobbiApi.openPlaylist(id)
        enqueueOffline(playlist.songs,playlist.title,wifiOnly)
        withContext(Dispatchers.IO){
            JobbiDownloads.rememberCollection(getApplication(),account,server,
                "playlist:"+id,playlist.title,playlist.songs)
        }
        refreshDownloadedSongs()
    }
    fun downloadFavorites(wifiOnly:Boolean=true)=execute {
        val songs=JobbiApi.favorites()
        enqueueOffline(songs,"Favorites",wifiOnly)
        withContext(Dispatchers.IO){
            JobbiDownloads.rememberCollection(getApplication(),account,server,
                "favorites","Favorites",songs)
        }
        refreshDownloadedSongs()
    }
    fun downloadAllPlaylists(wifiOnly:Boolean=true)=execute {
        val list=JobbiApi.playlists()
        require(list.isNotEmpty()){"You have no playlists to download."}
        val tracks=mutableListOf<Song>()
        val collections=mutableListOf<Pair<String,Listing>>()
        for(playlist in list){
            val loaded=JobbiApi.openPlaylist(playlist.id)
            tracks.addAll(loaded.songs)
            collections.add(playlist.id to loaded)
        }
        enqueueOffline(tracks.distinctBy(Song::id),"All playlists",wifiOnly)
        withContext(Dispatchers.IO){
            for((id,entry) in collections)
                JobbiDownloads.rememberCollection(getApplication(),account,server,
                    "playlist:"+id,entry.title,entry.songs)
        }
        refreshDownloadedSongs()
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
    fun prepareSongRemoval(songs: List<Song>) {
        if(removalBusy)return
        val unique=songs.distinctBy(Song::id)
        if(unique.isEmpty()||unique.size>20){
            error="Select 1–20 recordings to remove from the shared NAS library."
            return
        }
        viewModelScope.launch {
            removalBusy=true
            error=""
            removalPreviews=emptyList()
            try{
                val reviewed=mutableListOf<JSONObject>()
                for(song in unique){
                    reviewed.add(JobbiApi.getObject("/api/songs/"+
                        Uri.encode(song.id)+"/removal-impact"))
                }
                removalPreviews=reviewed
            }catch(e:Exception){
                error="Could not review playlist usage. Nothing removed: "+
                    (e.message?:"Server unavailable")
            }finally{removalBusy=false}
        }
    }
    fun dismissSongRemoval(){ if(!removalBusy)removalPreviews=emptyList() }
    fun confirmSongRemoval() {
        if(removalBusy||removalPreviews.isEmpty())return
        val confirmed=removalPreviews
        viewModelScope.launch {
            removalBusy=true
            error=""
            var moved=0
            try{
                for(impact in confirmed){
                    val songId=impact.getJSONObject("song").getString("id")
                    JobbiApi.post("/api/songs/"+Uri.encode(songId)+"/quarantine",
                        JSONObject().put("ticket",impact.getString("ticket"))
                            .put("confirm","REMOVE_FROM_SHARED_LIBRARY"))
                    moved++
                }
                message="Moved $moved recording(s) to recoverable NAS quarantine. "+
                    "Other listeners' playlists may be affected."
            }catch(e:Exception){
                error="Moved $moved of ${confirmed.size} recordings. Remaining "+
                    "recordings were NOT removed: ${e.message}"
            }finally{
                removalPreviews=emptyList()
                removalBusy=false
                // Refresh to show current Navidrome library/index state.
                runCatching {
                    home=JobbiApi.home()
                    playlists=home.playlists
                    favorites=JobbiApi.favorites()
                    favoriteIds=favorites.map(Song::id).toSet()
                    if(detail?.id?.isNotBlank()==true){
                        detail=if(detail!!.isPlaylist)JobbiApi.openPlaylist(detail!!.id)
                            else JobbiApi.openAlbum(detail!!.id)
                    }
                }
            }
        }
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
        val listing = detail ?: throw IllegalArgumentException("Open an album or playlist first")
        val kind=if(listing.isPlaylist)"playlist" else "album"
        val prepared=JobbiImageUpload.prepare(getApplication(),uri)
        JobbiApi.uploadArt(kind,listing.id,prepared.bytes,prepared.mime)
        artRevision++
        message = "Picture uploaded. Your custom ${if(listing.isPlaylist)"playlist" else "album"} cover is ready."
    }
    fun rescan() = execute {
        JobbiApi.scanLibrary()
        message = "Navidrome library scan requested."
    }
}
