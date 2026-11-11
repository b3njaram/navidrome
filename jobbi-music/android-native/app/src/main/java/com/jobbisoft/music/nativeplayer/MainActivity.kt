package com.jobbisoft.music.nativeplayer

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.PlaylistAdd
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Switch
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= 33) {
            registerForActivityResult(ActivityResultContracts.RequestPermission()) {}.launch(
                android.Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent { JobbiMaterialApp() }
    }
}

private val Rose = Color(0xFFBA4E7D)
private val Plum = Color(0xFFBBA7D1)

@Composable
private fun JobbiTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val ctx = LocalContext.current
    val colors = if (Build.VERSION.SDK_INT >= 31) {
        if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
    } else if (dark) {
        darkColorScheme(primary = Color(0xFFFFADCF), secondary = Color(0xFFDFBED0),
            surface = Color(0xFF151218), background = Color(0xFF100F14),
            surfaceContainer = Color(0xFF242029))
    } else {
        lightColorScheme(primary = Rose, secondary = Color(0xFF825A89),
            surface = Color(0xFFFFF7FB), background = Color(0xFFFFFAFD))
    }
    MaterialTheme(colorScheme = colors, content = content)
}

private data class DownloadChoice(val kind:String,val title:String,val id:String="")
private data class BulkChoice(val songs:List<Song>,val sourceId:String?=null,
    val indices:List<Int> = emptyList(), val move:Boolean=false)
private data class Dest(val name: String, val icon: ImageVector)
private val tabs = listOf(
    Dest("Home", Icons.Rounded.Home),
    Dest("Search", Icons.Rounded.Search),
    Dest("Library", Icons.Rounded.LibraryMusic),
    Dest("Community", Icons.Rounded.Groups),
    Dest("More", Icons.Rounded.MoreHoriz)
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobbiMaterialApp(vm: MusicViewModel = viewModel()) {
    val context = LocalContext.current
    val player = remember { NativePlayer(context.applicationContext).also { it.connect() } }
    val snack = remember { SnackbarHostState() }
    var showNowPlaying by remember { mutableStateOf(false) }
    var addSong by remember { mutableStateOf<Song?>(null) }
    var createPlaylist by remember { mutableStateOf(false) }
    var invite by remember { mutableStateOf(false) }
    var bulkChoice by remember { mutableStateOf<BulkChoice?>(null) }
    var downloadChoice by remember { mutableStateOf<DownloadChoice?>(null) }
    var downloadWifiOnly by remember { mutableStateOf(true) }
    var removalConfirm by remember { mutableStateOf("") }
    LaunchedEffect(vm.removalPreviews) { removalConfirm = "" }

    DisposableEffect(player) { onDispose { player.disconnect() } }
    LaunchedEffect(player) {
        while (isActive) { player.tick(); delay(450) }
    }
    LaunchedEffect(vm.signedIn,vm.account) {
        while(isActive&&vm.signedIn){
            vm.updateDownloadStats()
            delay(20000)
        }
    }
    LaunchedEffect(vm.error,vm.message,player.error) {
        val value = vm.error.ifBlank { vm.message }.ifBlank { player.error }
        if(value.isNotBlank())snack.showSnackbar(value,withDismissAction=true)
    }
    JobbiTheme {
        if(vm.restoringSession){
            Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){
                Column(horizontalAlignment=Alignment.CenterHorizontally,
                    verticalArrangement=Arrangement.spacedBy(15.dp)){
                    CircularProgressIndicator()
                    Text("Restoring your Jobbi Music session…")
                    Text("Signing in securely",style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            return@JobbiTheme
        }
        if (!vm.signedIn) {
            LoginScreen(vm)
            return@JobbiTheme
        }
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            topBar = {
                CenterAlignedTopAppBar(
                    title = {
                        Text(if(vm.selected=="Detail")vm.detail?.title ?: "Collection"
                            else if(vm.selected=="More") "Jobbi Music"
                            else vm.selected, fontWeight=FontWeight.Bold)
                    },
                    navigationIcon = {
                        if(vm.selected=="Detail") IconButton(onClick=vm::back) {
                            Icon(Icons.Rounded.ArrowBack,contentDescription="Back to library")
                        }
                    },
                    actions = {
                        if(vm.selected=="Library")IconButton(onClick={createPlaylist=true}){
                            Icon(Icons.Rounded.Add,contentDescription="Create playlist")
                        }
                        if(vm.selected=="Home")IconButton(onClick=vm::refresh){
                            Icon(Icons.Rounded.AutoAwesome,contentDescription="Refresh music")
                        }
                    }
                )
            },
            snackbarHost = { SnackbarHost(snack) },
            bottomBar = {
                Column {
                    AnimatedVisibility(player.active!=null,enter=slideInVertically{it}+fadeIn(),
                        exit=slideOutVertically{it}+fadeOut()) {
                        MiniPlayer(player,onOpen={showNowPlaying=true})
                    }
                    NavigationBar {
                        tabs.forEach { destination ->
                            NavigationBarItem(
                                selected=vm.selected==destination.name ||
                                     (destination.name=="Search"&&vm.selected=="Server") ||
                                     (destination.name=="More"&&vm.selected in listOf("Admin","Profile","Import","Favorites","Downloads")),
                                onClick={vm.select(destination.name)},
                                icon={Icon(destination.icon,contentDescription=null)},
                                label={Text(destination.name)},
                                alwaysShowLabel=false
                            )
                        }
                    }
                }
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                AnimatedContent(targetState = vm.selected, label="material navigation") { page ->
                    when(page) {
                        "Home" -> HomeScreen(vm,player,onSongAdd={addSong=it})
                        "Search" -> SearchScreen(vm,player,onSongAdd={addSong=it},
                            onBulkPlaylist={bulkChoice=BulkChoice(it)},onQuarantine={vm.prepareSongRemoval(it)})
                        "Server" -> ServerDiscoverScreen(onBack={vm.select("Search")},initialQuery=vm.serverSearchSeed)
                        "Community" -> CommunityScreen(vm,player,onDiscoverMusic={vm.select("Server")})
                        "Profile" -> ProfileScreen(vm)
                        "Admin" -> NativeAdminScreen(vm,onBack={vm.select("More")})
                        "Library" -> LibraryScreen(vm,onCreate={createPlaylist=true},
                            onDownloadPlaylist={p->downloadChoice=DownloadChoice("playlist",p.name,p.id)},
                            onDownloadAll={downloadChoice=DownloadChoice("all","All playlists")},
                            onDownloadFavorites={downloadChoice=DownloadChoice("favorites","Favorites")})
                        "Downloads" -> DownloadedSongsScreen(vm,player)
                        "Favorites" -> SongsScreen(vm.favorites,vm,player,onSongAdd={addSong=it},
                            emptyText="Heart songs to save them here.",isFavorites=true,
                            onDownloadFavorites={downloadChoice=DownloadChoice("favorites","Favorites")},
                            onBulkPlaylist={songs->bulkChoice=BulkChoice(songs)},
                            onQuarantine={vm.prepareSongRemoval(it)})
                        "Detail" -> DetailScreen(vm,player,onSongAdd={addSong=it},onInvite={invite=true},
                            onDownloadPlaylist={id,title->downloadChoice=DownloadChoice("playlist",title,id)},
                            onBulkPlaylist={songs,indices,move->
                                bulkChoice=BulkChoice(songs,if(move)vm.detail?.id else null,indices,move)
                            },onQuarantine={vm.prepareSongRemoval(it)})
                        "Import" -> ImportScreen(onBack={vm.select("More")})
                        else -> MoreScreen(vm,player)
                    }
                }
                if(vm.busy||vm.removalBusy) LinearProgressIndicator(modifier=Modifier.fillMaxWidth().align(Alignment.TopCenter))
            }
        }
        if(showNowPlaying) ModalBottomSheet(onDismissRequest={showNowPlaying=false}) {
            NowPlayingScreen(vm,player)
        }
        if(addSong!=null) AlertDialog(
            onDismissRequest={addSong=null}, title={Text("Add to playlist")},
            text={
                Column(verticalArrangement=Arrangement.spacedBy(4.dp)) {
                    if(vm.playlists.isEmpty())Text("Create a playlist in Library first.")
                    vm.playlists.forEach { playlist ->
                        TextButton(onClick={
                            addSong?.let { vm.addToPlaylist(it,playlist.id) }
                            addSong=null
                        }) { Icon(Icons.Rounded.PlaylistAdd,null); Spacer(Modifier.width(8.dp)); Text(playlist.name) }
                    }
                }
            },
            confirmButton={TextButton(onClick={addSong=null}) {Text("Close")}}
        )
        if(downloadChoice!=null){
            val choice=downloadChoice!!
            AlertDialog(
                onDismissRequest={downloadChoice=null},
                title={Text("Download "+choice.title+"?")},
                text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Text("Save original audio on this device for offline playback. "+
                        "Already saved recordings are skipped, even when they appear "+
                        "in several playlists. Downloads continue in the background.")
                    Row(verticalAlignment=Alignment.CenterVertically){
                        Checkbox(downloadWifiOnly,onCheckedChange={downloadWifiOnly=it})
                        Text("Wi-Fi only (recommended for large collections)",
                            style=MaterialTheme.typography.bodyMedium)
                    }
                    if(choice.kind=="all")Text("Every accessible playlist will be queued. "+
                        "Large libraries can use significant phone storage.",
                        style=MaterialTheme.typography.bodySmall)
                }},
                confirmButton={TextButton(onClick={
                    when(choice.kind){
                        "favorites"->vm.downloadFavorites(downloadWifiOnly)
                        "all"->vm.downloadAllPlaylists(downloadWifiOnly)
                        else->vm.downloadPlaylist(choice.id,downloadWifiOnly)
                    }
                    downloadChoice=null
                }){Text("Download")}},
                dismissButton={TextButton(onClick={downloadChoice=null}){Text("Cancel")}}
            )
        }
        if(bulkChoice!=null) {
            val request=bulkChoice!!
            AlertDialog(onDismissRequest={bulkChoice=null},
                title={Text(if(request.move)"Move selected songs" else "Add selected to playlist")},
                text={Column(verticalArrangement=Arrangement.spacedBy(5.dp)) {
                    Text("${request.songs.size} selected song(s). "+
                        (if(request.move)"Move adds to the destination first, then removes source entries."
                         else "Copies stay in the original collection."),
                        style=MaterialTheme.typography.bodySmall)
                    vm.playlists.filter { !request.move || it.id != request.sourceId }.forEach{p->
                        TextButton(onClick={
                            vm.copyOrMoveSelected(request.songs,p.id,
                                if(request.move)request.sourceId else null,request.indices)
                            bulkChoice=null
                        }){Text(p.name)}
                    }
                }},
                confirmButton={TextButton(onClick={bulkChoice=null}){Text("Cancel")}}
            )
        }
        if(vm.removalPreviews.isNotEmpty()) {
            val reviews=vm.removalPreviews
            AlertDialog(
                onDismissRequest=vm::dismissSongRemoval,
                title={Text("Remove from shared music server?")},
                text={
                    Column(Modifier.heightIn(max=420.dp).verticalScroll(rememberScrollState()),
                        verticalArrangement=Arrangement.spacedBy(8.dp)){
                        Text("This moves ${reviews.size} recording(s) to recoverable NAS quarantine. "+
                            "It removes the recording for EVERY listener, not just your playlists.",
                            color=MaterialTheme.colorScheme.error)
                        reviews.forEach { impact ->
                            val song=impact.optJSONObject("song")
                            Text((song?.optString("artist")?:"")+" — "+
                                (song?.optString("title")?:"Recording"),
                                fontWeight=FontWeight.SemiBold)
                            val refs=impact.optJSONArray("references")
                            if(refs==null||refs.length()==0)Text(
                                "No references found in accessible playlists.",
                                style=MaterialTheme.typography.bodySmall)
                            else for(i in 0 until minOf(refs.length(),12)){
                                val ref=refs.optJSONObject(i)?:continue
                                val description=when {
                                    ref.optBoolean("restricted") ->
                                        "Another user has this recording in a private playlist (name hidden)"
                                    ref.optBoolean("own") ->
                                        "You have this song in: "+ref.optString("name")
                                    else ->
                                        ref.optString("owner","Another user")+
                                            " has this song in: "+ref.optString("name")
                                }
                                Text("• "+description,style=MaterialTheme.typography.bodySmall)
                            }
                            if(refs!=null&&refs.length()>12)
                                Text("And ${refs.length()-12} more playlist references…",
                                    style=MaterialTheme.typography.bodySmall)
                        }
                        Text("Important: Other users' private Navidrome playlists "+
                            "cannot all be inspected. Even if none appear above, this "+
                            "recording may still be used by other listeners.",
                            style=MaterialTheme.typography.bodySmall,
                            color=MaterialTheme.colorScheme.error)
                        OutlinedTextField(removalConfirm,{removalConfirm=it},
                            label={Text("Type REMOVE to confirm")},
                            singleLine=true,modifier=Modifier.fillMaxWidth())
                    }
                },
                confirmButton={TextButton(enabled=removalConfirm=="REMOVE"&&!vm.removalBusy,
                    onClick=vm::confirmSongRemoval){Text("Move recording(s) to quarantine")}},
                dismissButton={TextButton(onClick=vm::dismissSongRemoval,
                    enabled=!vm.removalBusy){Text("Cancel")}}
            )
        }
        if(createPlaylist) {
            var name by remember { mutableStateOf("") }
            AlertDialog(onDismissRequest={createPlaylist=false},
                title={Text("Create a playlist")},
                text={OutlinedTextField(name,{name=it},label={Text("Playlist name")},singleLine=true)},
                confirmButton={TextButton(onClick={vm.createPlaylist(name);createPlaylist=false},enabled=name.isNotBlank()){
                    Text("Create")
                }},
                dismissButton={TextButton(onClick={createPlaylist=false}){Text("Cancel")}}
            )
        }
        if(invite) {
            var username by remember { mutableStateOf("") }
            AlertDialog(onDismissRequest={invite=false},
                title={Text("Invite a collaborator")},
                text={Column {
                    Text("Jobbi Music creates a separate shared playlist. The original stays yours.",
                        style=MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(username,{username=it},label={Text("Jobbi username")},singleLine=true)
                }},
                confirmButton={TextButton(onClick={vm.invite(username);invite=false},enabled=username.isNotBlank()){Text("Invite")}},
                dismissButton={TextButton(onClick={invite=false}){Text("Cancel")}}
            )
        }
    }
}

@Composable
private fun LoginScreen(vm: MusicViewModel) {
    var user by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var server by remember { mutableStateOf(vm.server) }
    var keepSignedIn by remember { mutableStateOf(true) }
    Box(Modifier.fillMaxSize().background(
        Brush.verticalGradient(listOf(MaterialTheme.colorScheme.surface,
            MaterialTheme.colorScheme.primaryContainer.copy(alpha=.5f),
            MaterialTheme.colorScheme.background))
    ),contentAlignment=Alignment.Center){
        Column(Modifier.fillMaxWidth().widthIn(max=440.dp).padding(28.dp),
            horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(14.dp)){
            Surface(shape=RoundedCornerShape(28.dp),
                color=MaterialTheme.colorScheme.primaryContainer,modifier=Modifier.size(86.dp)){
                Box(contentAlignment=Alignment.Center){ Icon(Icons.Rounded.MusicNote,null,Modifier.size(46.dp),
                    tint=MaterialTheme.colorScheme.onPrimaryContainer) }
            }
            Spacer(Modifier.height(8.dp))
            Text("Jobbi Music",style=MaterialTheme.typography.headlineLarge,fontWeight=FontWeight.Bold)
            Text("Your music. Made for Android.",style=MaterialTheme.typography.bodyLarge,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(server,{server=it},label={Text("Music server (HTTPS)")},
                singleLine=true,modifier=Modifier.fillMaxWidth())
            OutlinedTextField(user,{user=it},label={Text("Navidrome username")},
                singleLine=true,modifier=Modifier.fillMaxWidth())
            OutlinedTextField(password,{password=it},label={Text("Password")},
                visualTransformation=PasswordVisualTransformation(),
                singleLine=true,modifier=Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                Checkbox(checked=keepSignedIn,onCheckedChange={keepSignedIn=it},
                    enabled=!vm.busy)
                Column(Modifier.weight(1f)){
                    Text("Keep me signed in",style=MaterialTheme.typography.bodyMedium)
                    Text("Encrypted on this device with Android Keystore",
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Button(onClick={vm.login(user,password,server,keepSignedIn)},
                enabled=!vm.busy&&user.isNotBlank()&&password.isNotBlank(),
                modifier=Modifier.fillMaxWidth().height(54.dp)) {
                Icon(Icons.Rounded.PlayArrow,null); Spacer(Modifier.width(9.dp)); Text("Listen now")
            }
            if(vm.savedSignInAvailable) OutlinedButton(onClick=vm::retrySavedSignIn,
                enabled=!vm.busy && !vm.restoringSession,
                modifier=Modifier.fillMaxWidth()) {
                Icon(Icons.Rounded.Refresh,null)
                Spacer(Modifier.width(8.dp))
                Text("Retry saved sign-in")
            }
            Text("Native playback · No WebView · Secured HTTPS",
                style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            if(vm.error.isNotBlank())Text(vm.error,color=MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun HomeScreen(vm: MusicViewModel, player: NativePlayer,onSongAdd:(Song)->Unit) {
    LazyColumn(contentPadding=PaddingValues(bottom=25.dp),
        verticalArrangement=Arrangement.spacedBy(22.dp)) {
        item {
            Column(Modifier.padding(horizontal=22.dp,vertical=10.dp)){
                Text("Made for your ears",style=MaterialTheme.typography.labelMedium,
                    color=MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(8.dp))
                Text("Your soundtrack.",style=MaterialTheme.typography.headlineLarge,fontWeight=FontWeight.Bold)
                Spacer(Modifier.height(14.dp))
                Card(
                    modifier=Modifier.fillMaxWidth(),
                    colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.primaryContainer),
                    shape=RoundedCornerShape(28.dp)
                ){
                    Column(Modifier.padding(24.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Rounded.AutoAwesome,null,Modifier.size(32.dp),
                            tint=MaterialTheme.colorScheme.onPrimaryContainer)
                        Text("Good music. Beautifully yours.",style=MaterialTheme.typography.headlineSmall,
                            fontWeight=FontWeight.Bold,color=MaterialTheme.colorScheme.onPrimaryContainer)
                        Text("Pick up where the music left off.",
                            color=MaterialTheme.colorScheme.onPrimaryContainer)
                        Button(onClick={player.play(vm.home.songs)},
                            enabled=vm.home.songs.isNotEmpty()) {
                            Icon(Icons.Rounded.PlayArrow,null)
                            Spacer(Modifier.width(6.dp));Text("Play something good")
                        }
                    }
                }
            }
        }
        item { AlbumShelf("Fresh in your library",vm.home.recent,vm::openAlbum) }
        item { AlbumShelf("Explore something new",vm.home.featured,vm::openAlbum) }
        item { Text("Quick picks",Modifier.padding(horizontal=22.dp),
            style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold) }
        itemsIndexed(vm.home.songs,key={_,s->s.id}) { index,song ->
            SongRow(song,index,vm.favoriteIds.contains(song.id),
                play={player.play(vm.home.songs,index)},favorite={vm.toggleFavorite(song)},
                add={onSongAdd(song)},removeFromNas={vm.prepareSongRemoval(listOf(song))})
        }
    }
}

@Composable
private fun AlbumShelf(title:String,albums:List<Album>,open:(String)->Unit) {
    if(albums.isEmpty())return
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text(title,Modifier.padding(horizontal=22.dp),style=MaterialTheme.typography.titleLarge,
            fontWeight=FontWeight.Bold)
        LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp),contentPadding=PaddingValues(horizontal=20.dp)){
            items(albums,key={it.id}) { album ->
                Column(Modifier.width(156.dp).clip(RoundedCornerShape(18.dp))
                    .clickable{open(album.id)},verticalArrangement=Arrangement.spacedBy(7.dp)){
                    Cover(album.cover,156.dp)
                    Text(album.name,maxLines=1,overflow=TextOverflow.Ellipsis,
                        fontWeight=FontWeight.SemiBold)
                    Text(album.artist,maxLines=1,overflow=TextOverflow.Ellipsis,
                        style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun Cover(art:String?,size: androidx.compose.ui.unit.Dp,modifier:Modifier=Modifier) {
    val context=LocalContext.current
    val loader=remember { ImageLoader.Builder(context.applicationContext).okHttpClient(JobbiApi.client).build() }
    Box(modifier.size(size).clip(RoundedCornerShape(18.dp))
        .background(MaterialTheme.colorScheme.secondaryContainer),contentAlignment=Alignment.Center) {
        Icon(Icons.Rounded.Album,null,Modifier.size(size*.38f),
            tint=MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha=.65f))
        if(art!=null) {
            AsyncImage(
                model=ImageRequest.Builder(context).data(JobbiApi.coverUrl(art))
                    .crossfade(true).build(),
                contentDescription="Album cover",imageLoader=loader,
                contentScale=ContentScale.Crop,modifier=Modifier.fillMaxSize()
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SongRow(song: Song,index:Int,hearted:Boolean,play:()->Unit,favorite:()->Unit,
                    add:()->Unit, removeFromNas:()->Unit={},
                    selected:Boolean=false,selectionMode:Boolean=false,
                    onSelect:()->Unit={},onLongSelect:()->Unit={}) {
    Row(Modifier.fillMaxWidth()
        .background(if(selected)MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
        .combinedClickable(onClick={if(selectionMode)onSelect()else play()},
            onLongClick=onLongSelect)
        .padding(horizontal=13.dp,vertical=7.dp),verticalAlignment=Alignment.CenterVertically) {
        if(selectionMode){
            Checkbox(checked=selected,onCheckedChange={onSelect()},
                modifier=Modifier.width(45.dp))
        }else Text("${index+1}",Modifier.width(23.dp),style=MaterialTheme.typography.labelMedium,
            color=MaterialTheme.colorScheme.onSurfaceVariant,textAlign=TextAlign.Center)
        Cover(song.cover,52.dp)
        Spacer(Modifier.width(11.dp))
        Column(Modifier.weight(1f)) {
            Text(song.title,maxLines=1,overflow=TextOverflow.Ellipsis,
                style=MaterialTheme.typography.bodyLarge,fontWeight=FontWeight.SemiBold)
            Text(song.artist,maxLines=1,overflow=TextOverflow.Ellipsis,
                style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if(!selectionMode){
            IconButton(onClick=favorite,modifier=Modifier.size(44.dp)) {
                Icon(if(hearted)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                    contentDescription=if(hearted)"Remove from Favorites" else "Add to Favorites",
                    tint=if(hearted)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick=add,modifier=Modifier.size(40.dp)){
                Icon(Icons.Rounded.Add,contentDescription="Add to playlist")
            }
            IconButton(onClick=removeFromNas,modifier=Modifier.size(40.dp)) {
                Icon(Icons.Rounded.DeleteOutline,
                    contentDescription="Remove ${song.title} from NAS",
                    tint=MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun SelectionActions(count:Int,total:Int,onAll:()->Unit,onClear:()->Unit,
                             onFavorite:()->Unit,onPlaylist:()->Unit,
                             onMove:(()->Unit)?=null,onRemove:(()->Unit)?=null,
                             onQuarantine:(()->Unit)?=null) {
    Column(Modifier.fillMaxWidth().padding(horizontal=12.dp,vertical=6.dp)) {
        Text("$count of $total songs selected",style=MaterialTheme.typography.labelMedium)
        LazyRow(horizontalArrangement=Arrangement.spacedBy(7.dp)) {
            item{AssistChip(onClick=onAll,label={Text("Select all")})}
            item{AssistChip(onClick=onClear,label={Text("Clear")})}
            item{AssistChip(onClick=onFavorite,label={Text("Add to Favorites")},enabled=count>0)}
            item{AssistChip(onClick=onPlaylist,label={Text("Add to playlist")},enabled=count>0)}
            if(onMove!=null)item{AssistChip(onClick=onMove,label={Text("Move to playlist")},enabled=count>0)}
            if(onRemove!=null)item{AssistChip(onClick=onRemove,label={Text("Remove from this list")},enabled=count>0)}
            if(onQuarantine!=null)item{AssistChip(onClick=onQuarantine,label={Text("Remove from NAS")},enabled=count in 1..20)}
        }
    }
}

@Composable
private fun SongsScreen(songs:List<Song>,vm:MusicViewModel,player:NativePlayer,
                        onSongAdd:(Song)->Unit,emptyText:String,isFavorites:Boolean=false,
                        onDownloadFavorites:()->Unit={},
                        onBulkPlaylist:(List<Song>)->Unit={},
                        onQuarantine:(List<Song>)->Unit={}) {
    var selecting by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Set<Int>>(emptySet()) }
    if(songs.isEmpty()){
        Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center) {
            Text(emptyText,color=MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    Column {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
            .padding(horizontal=14.dp,vertical=5.dp),
            horizontalArrangement=Arrangement.spacedBy(9.dp)) {
            if(isFavorites){
                FilledTonalButton(onClick={player.play(songs.shuffled())}){
                    Icon(Icons.Rounded.Shuffle,null);Spacer(Modifier.width(6.dp));Text("Shuffle")}
                OutlinedButton(onClick=onDownloadFavorites){
                    Icon(Icons.Rounded.Download,null);Spacer(Modifier.width(6.dp));Text("Download all")}
            }
            TextButton(onClick={selecting=!selecting;selected=emptySet()}) {
                Text(if(selecting)"Done" else "Select songs")
            }
        }
        if(selecting)SelectionActions(selected.size,songs.size,
            onAll={selected=songs.indices.toSet()},onClear={selected=emptySet()},
            onFavorite={vm.favoriteSelected(selected.sorted().map(songs::get),true)},
            onPlaylist={onBulkPlaylist(selected.sorted().map(songs::get));selected=emptySet();selecting=false},
            onRemove=if(isFavorites){{vm.favoriteSelected(selected.sorted().map(songs::get),false);
                selected=emptySet();selecting=false}}else null,
            onQuarantine={onQuarantine(selected.sorted().map(songs::get))})
        LazyColumn(contentPadding=PaddingValues(vertical=10.dp)) {
            itemsIndexed(songs,key={i,s->"$i:${s.id}"}){index,song->
                SongRow(song,index,song.id in vm.favoriteIds,
                    play={player.play(songs,index)},favorite={vm.toggleFavorite(song)},add={onSongAdd(song)},removeFromNas={vm.prepareSongRemoval(listOf(song))},
                    selected=index in selected,selectionMode=selecting,
                    onSelect={selected=if(index in selected)selected-index else selected+index},
                    onLongSelect={selecting=true;selected=selected+index})
            }
        }
    }
}

@Composable
private fun SearchScreen(vm:MusicViewModel,player:NativePlayer,onSongAdd:(Song)->Unit,
                         onBulkPlaylist:(List<Song>)->Unit,
                         onQuarantine:(List<Song>)->Unit) {
    var selecting by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Set<Int>>(emptySet()) }
    Column {
        Row(Modifier.fillMaxWidth().padding(horizontal=18.dp,vertical=7.dp),
            horizontalArrangement=Arrangement.spacedBy(9.dp)){
            FilterChip(selected=true,onClick={},label={Text("My library")},
                leadingIcon={Icon(Icons.Rounded.LibraryMusic,null)})
            FilterChip(selected=false,onClick=vm::openServerSearch,
                label={Text("Search server")},
                leadingIcon={Icon(Icons.Rounded.UploadFile,null)})
        }
        OutlinedTextField(vm.searchQuery,{selecting=false;selected=emptySet();vm.search(it)},
            modifier=Modifier.fillMaxWidth().padding(horizontal=18.dp,vertical=12.dp),
            placeholder={Text("Songs, albums, artists...")},
            leadingIcon={Icon(Icons.Rounded.Search,null)},singleLine=true,
            shape=RoundedCornerShape(28.dp))
        if(vm.searchingLibrary)LinearProgressIndicator(Modifier.fillMaxWidth())
        if(!vm.searchingLibrary&&vm.searchQuery.isNotBlank()&&
            vm.lastSearchedTerm==vm.searchQuery.trim()&&
            vm.searchResult.albums.isEmpty()&&vm.searchResult.songs.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(horizontal=19.dp,vertical=12.dp)){
                Text("No matches in your indexed library.",
                    style=MaterialTheme.typography.bodyMedium)
                Text("This does not mean the song is unavailable on Soulseek. "+
                    "Search server to check remote peers and connection diagnostics.",
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick=vm::openServerSearch){
                    Icon(Icons.Rounded.Cloud,null);Spacer(Modifier.width(6.dp))
                    Text("Search this song on server")
                }
            }
        }
        LazyColumn(contentPadding=PaddingValues(bottom=20.dp)) {
            if(vm.searchResult.albums.isNotEmpty()) {
                item { AlbumShelf("Albums",vm.searchResult.albums,vm::openAlbum) }
                item { Spacer(Modifier.height(14.dp)) }
            }
            if(vm.searchResult.songs.isNotEmpty()) {
                item {
                    Row(Modifier.fillMaxWidth().padding(horizontal=18.dp,vertical=7.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        Text("Tracks",Modifier.weight(1f),style=MaterialTheme.typography.titleLarge,
                            fontWeight=FontWeight.Bold)
                        TextButton(onClick={selecting=!selecting;selected=emptySet()}){
                            Text(if(selecting)"Done" else "Select songs")
                        }
                    }
                }
                if(selecting)item {
                    val chosen=selected.sorted().mapNotNull(vm.searchResult.songs::getOrNull)
                    SelectionActions(selected.size,vm.searchResult.songs.size,
                        onAll={selected=vm.searchResult.songs.indices.toSet()},
                        onClear={selected=emptySet()},
                        onFavorite={vm.favoriteSelected(chosen,true)},
                        onPlaylist={onBulkPlaylist(chosen);selected=emptySet();selecting=false},
                        onQuarantine={onQuarantine(chosen)})
                }
                itemsIndexed(vm.searchResult.songs,key={i,s->"$i:${s.id}"}) {index,song->
                    SongRow(song,index,song.id in vm.favoriteIds,
                        play={player.play(vm.searchResult.songs,index)},
                        favorite={vm.toggleFavorite(song)},add={onSongAdd(song)},
                        removeFromNas={vm.prepareSongRemoval(listOf(song))},
                        selected=index in selected,selectionMode=selecting,
                        onSelect={selected=if(index in selected)selected-index else selected+index},
                        onLongSelect={selecting=true;selected=selected+index})
                }
            }
        }
    }
}

@Composable
private fun DownloadedSongsScreen(vm:MusicViewModel,player:NativePlayer) {
    val collection=vm.offlineCollections.firstOrNull{it.id==vm.offlineCollectionId}
    val visibleSongs=collection?.songs ?: vm.downloadedSongs
    Column {
        Column(Modifier.padding(horizontal=18.dp,vertical=13.dp),
            verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically){
                if(collection!=null)IconButton(onClick=vm::closeOfflineCollection){
                    Icon(Icons.Rounded.ArrowBack,contentDescription="All downloads")
                }
                Column(Modifier.weight(1f)){
                    Text(collection?.title ?: "Downloaded music",
                        style=MaterialTheme.typography.headlineMedium,
                        fontWeight=FontWeight.Bold)
                    Text("Original recordings on this device · ${visibleSongs.size} songs",
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                OutlinedButton(onClick=vm::refreshDownloadedSongs){
                    Icon(Icons.Rounded.Refresh,null);Spacer(Modifier.width(6.dp))
                    Text("Refresh")
                }
                if(vm.offlineMode)FilledTonalButton(onClick=vm::retrySavedSignIn,
                    enabled=!vm.restoringSession){
                    Icon(Icons.Rounded.Cloud,null);Spacer(Modifier.width(6.dp))
                    Text("Reconnect")
                }
            }
            if(vm.offlineMode)Text("Offline mode: only downloaded recordings play. "+
                "Online library features will return after reconnecting.",
                style=MaterialTheme.typography.bodySmall,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${vm.downloadStats.queued} queued · ${vm.downloadStats.failed} failed",
                style=MaterialTheme.typography.bodySmall)
        }
        if(vm.downloadedSongs.isEmpty()){
            Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){
                Text("No completed downloads yet. "+
                    "Use Download on a playlist or Favorites while connected.",
                    Modifier.padding(22.dp),textAlign=TextAlign.Center)
            }
        }else{
            LazyColumn(contentPadding=PaddingValues(bottom=30.dp),
                verticalArrangement=Arrangement.spacedBy(3.dp)){
                if(collection==null && vm.offlineCollections.isNotEmpty()){
                    item {
                        Text("Downloaded playlists and Favorites",
                            Modifier.padding(horizontal=20.dp,vertical=10.dp),
                            fontWeight=FontWeight.SemiBold,
                            style=MaterialTheme.typography.titleMedium)
                    }
                    items(vm.offlineCollections,key={it.id}){entry->
                        Card(Modifier.fillMaxWidth()
                            .padding(horizontal=16.dp,vertical=2.dp)
                            .clickable{vm.viewOfflineCollection(entry.id)},
                            shape=RoundedCornerShape(16.dp)){
                            Row(Modifier.padding(13.dp),
                                verticalAlignment=Alignment.CenterVertically){
                                Icon(if(entry.id=="favorites")Icons.Rounded.Favorite
                                    else Icons.Rounded.PlaylistPlay,
                                    contentDescription=null)
                                Spacer(Modifier.width(11.dp))
                                Column(Modifier.weight(1f)){
                                    Text(entry.title,fontWeight=FontWeight.SemiBold)
                                    Text("${entry.songs.size} downloaded songs",
                                        style=MaterialTheme.typography.bodySmall)
                                }
                                Icon(Icons.Rounded.ChevronRight,contentDescription=null)
                            }
                        }
                    }
                }
                if(collection==null)item{
                    Text("All downloaded songs",
                        Modifier.padding(horizontal=20.dp,vertical=10.dp),
                        fontWeight=FontWeight.SemiBold,
                        style=MaterialTheme.typography.titleMedium)
                }
                itemsIndexed(visibleSongs,key={_,song->song.id}){index,song->
                    Row(Modifier.fillMaxWidth().clickable{
                        player.play(visibleSongs,index)
                    }.padding(horizontal=20.dp,vertical=11.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        Icon(Icons.Rounded.MusicNote,null,
                            tint=MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)){
                            Text(song.title,maxLines=1,overflow=TextOverflow.Ellipsis,
                                fontWeight=FontWeight.SemiBold)
                            Text(song.artist,style=MaterialTheme.typography.bodySmall,
                                color=MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Rounded.PlayArrow,contentDescription="Play downloaded song")
                    }
                }
            }
        }
    }
}

@Composable
private fun LibraryScreen(vm:MusicViewModel,onCreate:()->Unit,
                          onDownloadPlaylist:(MusicPlaylist)->Unit,
                          onDownloadAll:()->Unit,onDownloadFavorites:()->Unit) {
    LazyColumn(contentPadding=PaddingValues(horizontal=18.dp,vertical=12.dp),
        verticalArrangement=Arrangement.spacedBy(12.dp)) {
        item {
            FilledTonalButton(onClick={vm.select("Favorites")},
                modifier=Modifier.fillMaxWidth()){
                Icon(Icons.Rounded.Favorite,null)
                Spacer(Modifier.width(8.dp))
                Text("Favorites · Saved songs")
            }
        }
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement=Arrangement.spacedBy(8.dp),
                verticalAlignment=Alignment.CenterVertically){
                OutlinedButton(onClick=onDownloadAll){
                    Icon(Icons.Rounded.Download,null);Spacer(Modifier.width(5.dp))
                    Text("Download all playlists")
                }
                TextButton(onClick=onDownloadFavorites){Text("Download Favorites")}
            }
        }
        item {
            Row(verticalAlignment=Alignment.CenterVertically) {
                Text("Your playlists",style=MaterialTheme.typography.titleLarge,
                    fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
                FilledTonalButton(onClick=onCreate){Icon(Icons.Rounded.Add,null);Text("New")}
            }
        }
        items(vm.playlists,key={it.id}){playlist->
            Card(Modifier.fillMaxWidth().clickable{vm.openPlaylist(playlist.id)},
                shape=RoundedCornerShape(18.dp)) {
                Row(Modifier.padding(16.dp),verticalAlignment=Alignment.CenterVertically) {
                    Surface(color=MaterialTheme.colorScheme.secondaryContainer,shape=RoundedCornerShape(16.dp)){
                        Icon(Icons.Rounded.LibraryMusic,null,Modifier.padding(13.dp),
                            tint=MaterialTheme.colorScheme.onSecondaryContainer)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(playlist.name,fontWeight=FontWeight.Bold)
                        Text("${playlist.count} tracks · ${if(playlist.public)"Public" else "Private"}",
                            color=MaterialTheme.colorScheme.onSurfaceVariant,
                            style=MaterialTheme.typography.bodySmall)
                    }
                    IconButton(onClick={onDownloadPlaylist(playlist)}){
                        Icon(Icons.Rounded.Download,contentDescription="Download ${playlist.name}")
                    }
                }
            }
        }
        item { Text("Albums",style=MaterialTheme.typography.titleLarge,
            modifier=Modifier.padding(top=15.dp),fontWeight=FontWeight.Bold) }
        items(vm.albums,key={it.id}) {album ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                .clickable{vm.openAlbum(album.id)}.padding(5.dp),verticalAlignment=Alignment.CenterVertically){
                Cover(album.cover,65.dp)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(album.name,fontWeight=FontWeight.SemiBold,maxLines=1,
                        overflow=TextOverflow.Ellipsis)
                    Text(album.artist,style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun DetailScreen(vm:MusicViewModel,player:NativePlayer,onSongAdd:(Song)->Unit,
                         onInvite:()->Unit,onDownloadPlaylist:(String,String)->Unit,
                         onBulkPlaylist:(List<Song>,List<Int>,Boolean)->Unit,
                         onQuarantine:(List<Song>)->Unit) {
    val detail = vm.detail ?: return
    var filter by remember(detail.id) { mutableStateOf("") }
    var selecting by remember(detail.id) { mutableStateOf(false) }
    var selected by remember(detail.id) { mutableStateOf<Set<Int>>(emptySet()) }
    val listed=remember(detail.songs,filter){
        detail.songs.mapIndexed {i,s->i to s}.filter { (_,s)->
            filter.isBlank()||s.title.contains(filter,true)||s.artist.contains(filter,true)
        }
    }
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) {uri->
        if(uri!=null)vm.uploadArt(uri)
    }
    LazyColumn(contentPadding=PaddingValues(bottom=36.dp)) {
        item {
            Column(Modifier.padding(19.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                Row(verticalAlignment=Alignment.CenterVertically) {
                    Cover(detail.songs.firstOrNull()?.cover,122.dp)
                    Spacer(Modifier.width(17.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if(detail.isPlaylist)"PLAYLIST" else "ALBUM",
                            style=MaterialTheme.typography.labelMedium,
                            color=MaterialTheme.colorScheme.primary)
                        Text(detail.title,style=MaterialTheme.typography.headlineMedium,
                            fontWeight=FontWeight.Bold,maxLines=3)
                        Text("${detail.songs.size} tracks",
                            style=MaterialTheme.typography.bodyMedium,
                            color=MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement=Arrangement.spacedBy(9.dp),
                    verticalAlignment=Alignment.CenterVertically) {
                    Button(onClick={player.play(detail.songs)},enabled=detail.songs.isNotEmpty()){
                        Icon(Icons.Rounded.PlayArrow,null);Text("Play all")
                    }
                    AssistChip(onClick={picker.launch("image/*")},
                        label={Text("Cover")},leadingIcon={Icon(Icons.Rounded.CloudUpload,null)})
                    if(detail.isPlaylist)
                        OutlinedButton(onClick={onDownloadPlaylist(detail.id,detail.title)}){
                            Icon(Icons.Rounded.Download,null);Spacer(Modifier.width(5.dp))
                            Text("Download")
                        }
                }
                Row(verticalAlignment=Alignment.CenterVertically){
                    TextButton(onClick={selecting=!selecting;selected=emptySet()}){
                        Text(if(selecting)"Done selecting" else "Select songs")
                    }
                    if(!detail.isPlaylist)Text("Long press a song to select",
                        style=MaterialTheme.typography.bodySmall)
                }
                if(detail.isPlaylist) {
                    val canChangeVisibility = detail.owner.isBlank() ||
                        detail.owner.equals(vm.account, ignoreCase = true)
                    Surface(shape=RoundedCornerShape(15.dp),
                        color=MaterialTheme.colorScheme.surfaceContainer) {
                        Row(Modifier.fillMaxWidth().padding(horizontal=13.dp,vertical=9.dp),
                            verticalAlignment=Alignment.CenterVertically) {
                            Icon(if(detail.public)Icons.Rounded.Public else Icons.Rounded.Lock,
                                contentDescription=null)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(if(detail.public)"Public" else "Private",
                                    fontWeight=FontWeight.SemiBold)
                                Text(if(detail.public)"Visible to other Jobbi Music listeners"
                                    else "Only you can see this playlist",
                                    style=MaterialTheme.typography.bodySmall,
                                    color=MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if(vm.visibilityUpdating){
                                CircularProgressIndicator(Modifier.size(20.dp),strokeWidth=2.dp)
                                Spacer(Modifier.width(12.dp))
                            }
                            Switch(checked=detail.public,onCheckedChange={vm.setPlaylistPublic(it)},
                                enabled=canChangeVisibility&&!vm.visibilityUpdating)
                        }
                    }
                    if(!canChangeVisibility) Text(
                        "Only ${detail.owner} can change this playlist's visibility.",
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                    AssistChip(onClick=onInvite,label={Text("Collaborate")},
                        leadingIcon={Icon(Icons.Rounded.PersonAdd,null)})
                    FilledTonalButton(onClick=vm::heartAll) {
                        Icon(Icons.Rounded.Favorite,null)
                        Spacer(Modifier.width(7.dp))
                        Text("Heart all songs")
                    }
                    OutlinedTextField(filter,{filter=it},label={Text("Find a song in playlist")},
                        leadingIcon={Icon(Icons.Rounded.Search,null)},singleLine=true,
                        modifier=Modifier.fillMaxWidth())
                }
            }
        }
        if(selecting)item {
            val chosen=selected.sorted().mapNotNull { position->detail.songs.getOrNull(position) }
            SelectionActions(selected.size,listed.size,
                onAll={selected=listed.map {it.first}.toSet()},
                onClear={selected=emptySet()},
                onFavorite={vm.favoriteSelected(chosen,true)},
                onPlaylist={onBulkPlaylist(chosen,selected.sorted(),false);selecting=false;selected=emptySet()},
                onMove=if(detail.isPlaylist){{onBulkPlaylist(chosen,selected.sorted(),true);
                    selecting=false;selected=emptySet()}}else null,
                onRemove=if(detail.isPlaylist){{vm.removeSelectedFromPlaylist(selected.toList());
                    selected=emptySet();selecting=false}}else null,
                onQuarantine={onQuarantine(chosen)})
        }
        itemsIndexed(listed,key={_,pair->"${pair.first}:${pair.second.id}"}){index,pair->
            val song=pair.second
            val playingList=listed.map{it.second}
            SongRow(song,index,song.id in vm.favoriteIds,
                play={player.play(playingList,index)},favorite={vm.toggleFavorite(song)},add={onSongAdd(song)},
                removeFromNas={vm.prepareSongRemoval(listOf(song))},
                selected=pair.first in selected,selectionMode=selecting,
                onSelect={selected=if(pair.first in selected)selected-pair.first else selected+pair.first},
                onLongSelect={selecting=true;selected=selected+pair.first})
        }
    }
}

@Composable
private fun MiniPlayer(player:NativePlayer,onOpen:()->Unit) {
    val song=player.active ?: return
    Surface(tonalElevation=6.dp,shadowElevation=3.dp,
        modifier=Modifier.padding(horizontal=9.dp,vertical=4.dp).clip(RoundedCornerShape(22.dp)),
        shape=RoundedCornerShape(22.dp),color=MaterialTheme.colorScheme.secondaryContainer) {
        Column {
            Row(Modifier.fillMaxWidth().height(72.dp).clickable(onClick=onOpen).padding(9.dp),
                verticalAlignment=Alignment.CenterVertically) {
                Cover(song.cover,53.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(song.title,maxLines=1,overflow=TextOverflow.Ellipsis,
                        fontWeight=FontWeight.Bold)
                    Text(song.artist,maxLines=1,overflow=TextOverflow.Ellipsis,
                        style=MaterialTheme.typography.bodySmall)
                }
                IconButton(onClick=player::previous) {
                    Icon(Icons.Rounded.SkipPrevious,"Previous track")
                }
                FilledIconButton(onClick=player::toggle) {
                    Icon(if(player.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        if(player.playing)"Pause" else "Play")
                }
                IconButton(onClick=player::next) { Icon(Icons.Rounded.SkipNext,"Next track") }
            }
            if(player.duration>0){
                LinearProgressIndicator(progress={ (player.position.toFloat()/player.duration)
                    .coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth().height(3.dp))
            }
        }
    }
}

@Composable
private fun NowPlayingScreen(vm: MusicViewModel,player:NativePlayer) {
    val song=player.active ?:return
    var drag by remember(song.id) { mutableFloatStateOf(-1f) }
    val max=player.duration.coerceAtLeast(1L).toFloat()
    Column(Modifier.fillMaxWidth().fillMaxHeight(.83f).padding(horizontal=27.dp),
        horizontalAlignment=Alignment.CenterHorizontally,
        verticalArrangement=Arrangement.spacedBy(22.dp)) {
        Spacer(Modifier.height(10.dp))
        Cover(song.cover,258.dp)
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment=Alignment.CenterVertically){
            Column(Modifier.weight(1f)){
                Text(song.title,style=MaterialTheme.typography.headlineSmall,
                    fontWeight=FontWeight.Bold,maxLines=2)
                Text(song.artist,style=MaterialTheme.typography.titleMedium,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick={vm.toggleFavorite(song)}) {
                Icon(if(song.id in vm.favoriteIds)Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                    "Favorite",tint=MaterialTheme.colorScheme.primary)
            }
        }
        Slider(value=(if(drag>=0f)drag else player.position.toFloat()).coerceIn(0f,max),
            onValueChange={drag=it},onValueChangeFinished={player.seek(drag.toLong());drag=-1f},
            valueRange=0f..max,modifier=Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
            Text(time((if(drag>=0f)drag.toLong() else player.position)/1000),
                style=MaterialTheme.typography.labelMedium)
            Text(time(player.duration/1000),style=MaterialTheme.typography.labelMedium)
        }
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceEvenly,
            verticalAlignment=Alignment.CenterVertically) {
            IconButton(onClick=player::previous,modifier=Modifier.size(64.dp)){
                Icon(Icons.Rounded.SkipPrevious,"Previous track",Modifier.size(38.dp))
            }
            FilledIconButton(onClick=player::toggle,modifier=Modifier.size(86.dp)){
                Icon(if(player.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                    if(player.playing)"Pause" else "Play",Modifier.size(46.dp))
            }
            IconButton(onClick=player::next,modifier=Modifier.size(64.dp)){
                Icon(Icons.Rounded.SkipNext,"Next track",Modifier.size(38.dp))
            }
        }
        Text("High fidelity playback · Android Media3",style=MaterialTheme.typography.bodySmall,
            color=MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
private fun time(seconds:Long): String =
    "${seconds.coerceAtLeast(0)/60}:${(seconds.coerceAtLeast(0)%60).toString().padStart(2,'0')}"

@Composable
private fun MoreScreen(vm:MusicViewModel,player:NativePlayer) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())
        .padding(22.dp),verticalArrangement=Arrangement.spacedBy(15.dp)){
        Text("Music settings",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
        Text("Signed in as ${vm.account}",color=MaterialTheme.colorScheme.onSurfaceVariant)
        Text(if(vm.savedSignInAvailable)
            "Automatic sign-in enabled · encrypted on this device"
            else "Automatic sign-in disabled · you'll sign in again after closing the app",
            style=MaterialTheme.typography.bodySmall,
            color=MaterialTheme.colorScheme.onSurfaceVariant)
        FilledTonalButton(onClick={vm.select("Profile")},modifier=Modifier.fillMaxWidth()){
            Icon(Icons.Rounded.PersonAdd,null)
            Spacer(Modifier.width(8.dp))
            Text("Edit my profile")
        }
        FilledTonalButton(onClick={vm.select("Community")},modifier=Modifier.fillMaxWidth()){
            Icon(Icons.Rounded.Groups,null)
            Spacer(Modifier.width(8.dp))
            Text("Community & Friends")
        }
        FilledTonalButton(onClick={vm.select("Downloads")},modifier=Modifier.fillMaxWidth()){
            Icon(Icons.Rounded.Download,null)
            Spacer(Modifier.width(8.dp))
            Text("Offline downloads")
        }
        if(vm.offlineMode) OutlinedButton(onClick=vm::retrySavedSignIn,
            enabled=!vm.restoringSession,modifier=Modifier.fillMaxWidth()){
            Icon(Icons.Rounded.Refresh,null)
            Spacer(Modifier.width(8.dp))
            Text("Reconnect to Jobbi Music")
        }
        FilledTonalButton(onClick={vm.select("Favorites")},modifier=Modifier.fillMaxWidth()){
            Icon(Icons.Rounded.Favorite,null)
            Spacer(Modifier.width(8.dp))
            Text("Favorite songs")
        }
        FilledTonalButton(onClick={vm.select("Server")},modifier=Modifier.fillMaxWidth()){
            Icon(Icons.Rounded.UploadFile,null)
            Spacer(Modifier.width(8.dp))
            Text("Find and download songs on NAS")
        }
        if(vm.isAdmin)Button(onClick={vm.select("Admin")},modifier=Modifier.fillMaxWidth()){
            Icon(Icons.Rounded.Settings,null)
            Spacer(Modifier.width(8.dp))
            Text("Admin console")
        }
        Text("Offline downloads",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)
        Text("${vm.downloadStats.saved} saved · ${vm.downloadStats.queued} queued · "+
            "${vm.downloadStats.failed} failed",
            style=MaterialTheme.typography.bodyMedium)
        Text("Saved original recordings play locally whenever they're available. "+
            "Android handles background transfers; large bulk downloads default to Wi-Fi only.",
            style=MaterialTheme.typography.bodySmall,
            color=MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick=vm::updateDownloadStats){
            Icon(Icons.Rounded.Refresh,null);Text("Refresh downloads")
        }
        Text("Streaming quality",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
            listOf("original" to "Lossless","balanced" to "High","saver" to "Data saver").forEach { (value,label)->
                FilterChip(selected=vm.quality==value,onClick={vm.updateQuality(value)},label={Text(label)})
            }
        }
        Card(shape=RoundedCornerShape(22.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                Text("Native Android",style=MaterialTheme.typography.titleLarge,
                    fontWeight=FontWeight.SemiBold)
                Text("Built with Jetpack Compose and Material 3. Playback runs in Media3 with true background audio, headset controls, and a native system notification.")
                Text("Server: ${vm.server}",style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if(vm.isAdmin)FilledTonalButton(onClick=vm::rescan){
            Icon(Icons.Rounded.SwapHoriz,null);Spacer(Modifier.width(8.dp));Text("Scan new music")
        }
        FilledTonalButton(onClick={vm.select("Import")}) {
            Icon(Icons.Rounded.UploadFile,null);Spacer(Modifier.width(8.dp));Text("Import track list")
        }
        OutlinedButton(onClick={vm.logout {player.stop()}},modifier=Modifier.fillMaxWidth()){
            Text("Sign out")
        }
    }
}
