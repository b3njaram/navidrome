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
    // Screenshot-test-only sample state. Never signs into or changes NAS data.
    // The release APK rejects this entry point.
    var parityScreenshotFixture by androidx.compose.runtime.mutableStateOf(false)
        private set
    fun installParityScreenshotFixture() {
        check(BuildConfig.DEBUG) { "Visual fixtures are debug-only" }
        val sample=Song(
            id="fixture-track-1",title="Sunset Drive",artist="Jobbi Studio",
            album="Evening Sounds",cover=null,duration=213L,suffix="flac"
        )
        val second=sample.copy(
            id="fixture-track-2",title="Ocean Lights",duration=198L
        )
        parityScreenshotFixture=true
        account="fixture.listener"
        isAdmin=false
        offlineMode=false
        restoringSession=false
        signedIn=true
        server="https://music.jobbisoft.com.mx"
        selected="Home"
        home=HomeResult(
            recent=listOf(Album("fixture-album","Evening Sounds","Jobbi Studio",null)),
            featured=listOf(Album("fixture-album-2","New Horizons","Jobbi Studio",null)),
            songs=listOf(sample,second),
            playlists=listOf(MusicPlaylist("fixture-playlist","Evening Mix",2,false)),
            played=listOf(Album("fixture-album","Evening Sounds","Jobbi Studio",null))
        )
        albums=home.recent+home.featured
        playlists=home.playlists
        favorites=listOf(sample)
        favoriteIds=setOf(sample.id)
        recommendations=RecommendationsResult(
            recentTracks=listOf(second),topWeek=listOf(sample),
            topMonth=listOf(second),madeForYou=listOf(sample,second),
            timeMix=listOf(second),timeLabel="Evening Mix",
            weatherMix=listOf(sample),weatherLabel="Weather Mix",
            weatherCity="Test City",weatherTemperature=21.0
        )
        savedSignInAvailable=false
    }
    fun showParityScreenshotScreen(screen:String) {
        check(BuildConfig.DEBUG && parityScreenshotFixture)
        require(screen in listOf("Home","Library","Search","More"))
        selected=screen
    }

    var offlineMode by androidx.compose.runtime.mutableStateOf(false)
        private set
    var downloadedSongs by androidx.compose.runtime.mutableStateOf<List<Song>>(emptyList())
        private set
    var offlineCollections by androidx.compose.runtime.mutableStateOf<List<OfflineCollection>>(emptyList())
        private set
    var collectionJobs by androidx.compose.runtime.mutableStateOf<List<RemoteCollectionImport>>(emptyList())
        private set
    var collectionJobsError by androidx.compose.runtime.mutableStateOf("")
        private set
    fun refreshCollectionJobs(){
        if(!signedIn||offlineMode)return
        viewModelScope.launch {
            try{
                collectionJobs=JobbiApi.collectionJobs()
                collectionJobsError=""
            }catch(e:Exception){
                collectionJobsError=e.message ?: "Saved imports are temporarily unavailable."
            }
        }
    }
    fun controlCollectionJob(id:String,action:String)=execute{
        JobbiApi.controlCollectionJob(id,action)
        collectionJobs=JobbiApi.collectionJobs()
    }
    var offlineCollectionId by androidx.compose.runtime.mutableStateOf<String?>(null)
        private set
    fun viewOfflineCollection(id:String){offlineCollectionId=id}
    fun closeOfflineCollection(){offlineCollectionId=null}
    var restoringSession by androidx.compose.runtime.mutableStateOf(true)
        private set
    var savedSignInAvailable by androidx.compose.runtime.mutableStateOf(false)
        private set
    // For the login UI only: account name is not secret, but the saved
    // password never leaves encrypted Android Keystore-backed storage.
    var savedUsername by androidx.compose.runtime.mutableStateOf("")
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
    var artists by androidx.compose.runtime.mutableStateOf<List<MusicArtist>>(emptyList())
        private set
    var artistName by androidx.compose.runtime.mutableStateOf("")
        private set
    var artistSongs by androidx.compose.runtime.mutableStateOf<List<Song>>(emptyList())
        private set
    var artistAlbums by androidx.compose.runtime.mutableStateOf<List<Album>>(emptyList())
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
    var avatarRevision by androidx.compose.runtime.mutableIntStateOf(0)
        private set
    fun avatarUpdated() { avatarRevision++ }
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

    /** Enter the cached library for a previously server-verified identity.
     * This function does no DNS, HTTP, or Navidrome login at all. Its songs
     * are restricted to actual completed files scoped by server and username.
     */
    private suspend fun openRememberedDownloads(saved:RememberedLogin):Boolean {
        val app=getApplication<android.app.Application>()
        val cached=withContext(Dispatchers.IO) {
            val songs=JobbiDownloads.downloadedSongs(app,saved.username,saved.server)
            val groups=JobbiDownloads.completedCollections(app,saved.username,saved.server)
            val statistics=JobbiDownloads.stats(app,saved.username,saved.server)
            Triple(songs,groups,statistics)
        }
        if(cached.first.isEmpty())return false
        JobbiApi.changeServer(app,saved.server)
        JobbiApi.useOfflineIdentity(saved.username)
        account=saved.username
        server=saved.server
        isAdmin=false
        offlineMode=true
        signedIn=true
        selected="Downloads"
        downloadedSongs=cached.first
        offlineCollections=cached.second
        downloadStats=cached.third
        error=""
        message="Playing ${cached.first.size} saved songs from your device. "+
            "No internet or NAS sign-in required."
        return true
    }

    private fun restoreSavedSignIn(forceOnline:Boolean=false) {
        if(signedIn && !offlineMode)return
        viewModelScope.launch {
            restoringSession=true
            error=""
            var remembered:RememberedLogin?=null
            try {
                remembered=withContext(Dispatchers.IO){
                    SecureLoginStorage.load(getApplication())
                }
                val saved=remembered
                savedUsername=saved?.username.orEmpty()
                savedSignInAvailable=saved!=null
                if(saved!=null){
                    JobbiApi.changeServer(getApplication(),saved.server)
                    server=JobbiApi.serverUrl()
                    // On a flight / airplane mode / no validated network,
                    // NEVER wait for a DNS timeout before showing offline music.
                    if(!forceOnline&&!OfflineNetwork.isOnline(getApplication())){
                        if(!openRememberedDownloads(saved)){
                            if(!signedIn){
                                error="No internet connection and no completed offline "+
                                    "downloads for this saved account. Download music "+
                                    "while online to listen without a connection."
                            }
                        }
                        return@launch
                    }
                    // A connection is present. First try the user's normal
                    // saved sign-in; any temporary outage falls back to local
                    // downloads without logging them out.
                    account=JobbiApi.login(saved.username,saved.password)
                    isAdmin=JobbiApi.isAdmin
                    offlineMode=false
                    signedIn=true
                    selected="Home"
                    loadWeatherPreference()
                    refresh()
                }
            }catch(e:Exception){
                JobbiApi.clearSession()
                isAdmin=false
                if(e is JobbiException && e.status==401){
                    withContext(Dispatchers.IO){
                        runCatching{SecureLoginStorage.clear(getApplication())}
                    }
                    savedSignInAvailable=false
                    savedUsername=""
                    signedIn=false
                    offlineMode=false
                    account=""
                    error="Saved credentials were rejected by the server. "+
                        "Sign in again once online."
                }else{
                    val recovered=remembered?.let{
                        runCatching{openRememberedDownloads(it)}.getOrDefault(false)
                    } ?: false
                    if(!recovered){
                        signedIn=false
                        offlineMode=false
                        account=""
                        error="Couldn't connect to your music server. "+
                            "Your saved sign-in is still on this device. "+
                            "Connect to download music, or retry when online."
                    }
                }
            }finally{
                restoringSession=false
            }
        }
    }
    /**
     * Explicit offline unlock: never performs DNS, HTTP, or a saved-login
     * retry. Downloads are private to the last account whose credentials
     * were verified by the NAS and encrypted using Android Keystore.
     * No remembered identity, or no finished files, means no offline access.
     */
    fun listenOffline() {
        if(restoringSession||busy)return
        viewModelScope.launch {
            busy=true
            error=""
            try {
                val app=getApplication<android.app.Application>()
                val remembered=withContext(Dispatchers.IO){
                    SecureLoginStorage.load(app)
                } ?: throw JobbiException(
                    "Offline listening needs a previously saved sign-in. "+
                    "Sign in once online with Keep me signed in enabled.")
                savedSignInAvailable=true
                val data=withContext(Dispatchers.IO) {
                    val songs=JobbiDownloads.downloadedSongs(app,
                        remembered.username,remembered.server)
                    val groups=JobbiDownloads.completedCollections(app,
                        remembered.username,remembered.server)
                    val stats=JobbiDownloads.stats(app,
                        remembered.username,remembered.server)
                    Triple(songs,groups,stats)
                }
                if(data.first.isEmpty()){
                    throw JobbiException(
                        "No completed downloads for this account on this device. "+
                        "${data.third.queued} queued, ${data.third.failed} failed. "+
                        "Finish downloading at least one song while online; "+
                        "a queued download is not an offline copy.")
                }
                JobbiApi.changeServer(app,remembered.server)
                JobbiApi.useOfflineIdentity(remembered.username)
                account=remembered.username
                server=remembered.server
                isAdmin=false
                offlineMode=true
                signedIn=true
                selected="Downloads"
                downloadedSongs=data.first
                offlineCollections=data.second
                downloadStats=data.third
                message="Offline library: ${data.first.size} locally saved songs. "+
                    "No internet or server connection required."
            }catch(e:Exception){
                error=e.message?:"Offline downloads are unavailable on this device."
            }finally{busy=false}
        }
    }
    fun retrySavedSignIn() {
        if((!signedIn || offlineMode)&&!restoringSession&&savedSignInAvailable)
            // A user-requested reconnect must try HTTPS even if Android's
            // network validation is blocked by a VPN or private DNS.
            restoreSavedSignIn(forceOnline=true)
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
            savedUsername=if(remember)confirmedAccount else ""
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
        savedUsername = ""
        if(!offlineMode)runCatching { JobbiApi.logout() }
        JobbiApi.clearSession()
        signedIn = false
        offlineMode = false
        downloadedSongs = emptyList()
        offlineCollections = emptyList()
        collectionJobs = emptyList()
        collectionJobsError = ""
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
            "Library" -> {loadLibrary();refreshCollectionJobs()}
            "PlaylistDirectory","AlbumDirectory" -> loadLibrary()
            "SavedImports" -> refreshCollectionJobs()
            "Favorites" -> loadFavorites()
            "Search" -> if(searchQuery.isNotBlank()) search(searchQuery)
            "Artists" -> loadArtists()
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
    fun loadArtists() = execute {
        artists = JobbiApi.artists()
    }
    fun openArtist(id:String) = execute {
        val detail=JobbiApi.artistDetails(id)
        artistName=detail.optStr("name","Artist")
        artistSongs=detail.optJSONArray("song").songs()
        artistAlbums=detail.optJSONArray("album").albums()
        selected="ArtistDetail"
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
    fun removeOfflineSong(song:Song)=execute {
        val removed=withContext(Dispatchers.IO){
            JobbiDownloads.removeSong(getApplication(),account,server,song.id)
        }
        refreshDownloadedSongs()
        message=if(removed)"Removed only the device copy of "+song.title+
            ". NAS recording and playlists are unchanged."
        else "No offline copy of "+song.title+" was found."
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
        if(selected=="ArtistDetail"){
            selected="Artists"
            return
        }
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
            val sourceSongs=sourceIndices.zip(songs).associate { it.first to it.second.id }
            for(position in sourceIndices.distinct().sortedDescending()){
                try{
                    val expected=sourceSongs[position]
                        ?: throw JobbiException("No matching source song for playlist position $position.")
                    val updated=JobbiApi.editPlaylist(sourceId,
                        JSONObject().put("removeIndex",position).put("expectedSongId",expected))
                    if(!updated.optBoolean("verified")||
                        updated.optJSONObject("removedEntry")?.optString("id")!=expected)
                        throw JobbiException("Navidrome did not confirm which playlist entry was removed.")
                }catch(e:Exception){ throw JobbiException("Copied $added songs but could not finish removing the originals: ${e.message}") }
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
            try {
                val songId=listing.songs.getOrNull(index)?.id
                    ?: throw JobbiException("Playlist order changed; reload before removing.")
                val result=JobbiApi.editPlaylist(listing.id,
                    JSONObject().put("removeIndex",index).put("expectedSongId",songId))
                if(!result.optBoolean("verified")||
                    result.optJSONObject("removedEntry")?.optString("id")!=songId)
                    throw JobbiException("Navidrome did not confirm playlist removal.")
                removed++
            }
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
            var missingScans=0
            try{
                for(impact in confirmed){
                    val songId=impact.getJSONObject("song").getString("id")
                    val result=JobbiApi.post("/api/songs/"+Uri.encode(songId)+"/quarantine",
                        JSONObject().put("ticket",impact.getString("ticket"))
                            .put("confirm","REMOVE_FROM_SHARED_LIBRARY"))
                    if(!result.optBoolean("quarantined"))
                        throw JobbiException("NAS did not confirm the file move. Inspect quarantine before retrying.")
                    moved++
                    if(!result.optBoolean("scanRequested"))missingScans++
                }
                message="Confirmed: $moved audio file(s) moved to recoverable NAS quarantine. "+
                    (if(missingScans>0)"Navidrome scan could not be requested for $missingScans file(s). "
                     else "Navidrome library scan requested. ")+
                    "The song may still APPEAR in playlists, Favorites or Search while Navidrome "+
                    "refreshes its index. The original playlist entries were not automatically removed."
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
                if(searchQuery.isNotBlank() && lastSearchedTerm.isNotBlank())
                    search(searchQuery)
            }
        }
    }
    fun addToPlaylist(song: Song, id: String) = execute {
        // Older NAS deployments did not return an add-receipt. Verify the
        // actual playlist delta on Android too, so both old and new servers
        // work without claiming success for silently ignored updates.
        val before=JobbiApi.openPlaylist(id).songs.count{it.id==song.id}
        JobbiApi.editPlaylist(id,JSONObject().put("addSongId",song.id))
        val updated=JobbiApi.openPlaylist(id)
        if(updated.songs.count{it.id==song.id}<=before)
            throw JobbiException("Navidrome has not confirmed the song was added. Refresh before retrying.")
        if(detail?.id==id)detail=updated
        playlists=JobbiApi.playlists()
        message="Verified: ${song.title} was added to the playlist."
    }
    fun renameOpenedPlaylist(name:String) = execute {
        val current=detail ?: throw IllegalStateException("Open a playlist first.")
        require(current.isPlaylist){"This action only renames playlists."}
        val trimmed=name.trim()
        require(trimmed.isNotBlank()&&trimmed.length<=100){"Enter a playlist name of 1–100 characters."}
        val updated=JobbiApi.editPlaylist(current.id,JSONObject().put("name",trimmed))
        val result=updated.optJSONObject("playlist")
            ?:throw JobbiException("Navidrome did not confirm the playlist rename.")
        if(result.optStr("name")!=trimmed)
            throw JobbiException("Navidrome did not save the new playlist name.")
        detail=JobbiApi.openPlaylist(current.id)
        playlists=JobbiApi.playlists()
        message="Playlist renamed."
    }
    fun deleteOpenedPlaylist() = execute {
        val current=detail ?: throw IllegalStateException("Open a playlist first.")
        require(current.isPlaylist){"Only playlists can be deleted."}
        JobbiApi.deletePlaylist(current.id)
        playlists=JobbiApi.playlists()
        detail=null
        selected="Library"
        message="Playlist deleted. Recordings on your NAS are unchanged."
    }
    fun downloadOpenedAlbum(wifiOnly:Boolean=true) = execute {
        val current=detail ?: throw IllegalStateException("Open an album first.")
        require(!current.isPlaylist){"Use Download playlist for playlists."}
        enqueueOffline(current.songs,current.title,wifiOnly)
        withContext(Dispatchers.IO){
            JobbiDownloads.rememberCollection(getApplication(),account,server,
                "album:"+current.id,current.title,current.songs)
        }
        refreshDownloadedSongs()
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
