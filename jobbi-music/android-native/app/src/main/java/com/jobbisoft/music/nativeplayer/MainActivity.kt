package com.jobbisoft.music.nativeplayer

import android.net.Uri
import android.content.Context
import android.media.AudioManager

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
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MediumTopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
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
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.abs

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        // A MediaSession playback notification is exempt from Android 13's
        // general POST_NOTIFICATIONS permission prompt. Never interrupt first
        // launch (and UI tests) with an OS permission dialog before Compose
        // has even rendered the login screen.
        setContent { JobbiMaterialApp() }
    }
}

// Mirrors the existing native SwiftUI Jobbi palette while keeping Material 3
// system bars, typography, touch targets and Android accessibility native.
private val JobbiIndigo = Color(0xFF6154EB)
private val JobbiViolet = Color(0xFF8C5CE0)
private val JobbiTeal = Color(0xFF0AABA3)
private val JobbiCoral = Color(0xFFF55773)
private val JobbiSky = Color(0xFF2991EB)
private val JobbiAmber = Color(0xFFE6942B)

@Composable
private fun JobbiTheme(content: @Composable () -> Unit) {
    val dark=isSystemInDarkTheme()
    val colors=if(dark) darkColorScheme(
        primary=Color(0xFFA9A2FF),onPrimary=Color(0xFF16112B),
        secondary=Color(0xFF80DED4),onSecondary=Color(0xFF0E302C),
        tertiary=Color(0xFFE0ABFF),
        background=Color(0xFF111217),surface=Color(0xFF16171D),
        surfaceVariant=Color(0xFF272933),
        surfaceContainer=Color(0xFF22232D),
        surfaceContainerHigh=Color(0xFF2D2D38),
        secondaryContainer=Color(0xFF26243C),
        onSecondaryContainer=Color(0xFFECE8FF),
        primaryContainer=Color(0xFF312B56),
        onPrimaryContainer=Color(0xFFEAE5FF)
    ) else lightColorScheme(
        primary=Color(0xFF4F46E5),onPrimary=Color.White,
        secondary=Color(0xFF087C77),onSecondary=Color.White,
        tertiary=Color(0xFF7A38BC),
        background=Color.White,surface=Color.White,
        surfaceVariant=Color(0xFFEEEFF7),
        surfaceContainer=Color(0xFFF0F1F8),
        surfaceContainerHigh=Color(0xFFE8E9F4),
        secondaryContainer=Color(0xFFE8E5FE),
        onSecondaryContainer=Color(0xFF23204C),
        primaryContainer=Color(0xFFE4E2FF),
        onPrimaryContainer=Color(0xFF24205D)
    )
    MaterialTheme(colorScheme=colors,content=content)
}

@Composable
private fun JobbiAccountAvatar(vm:MusicViewModel,onClick:()->Unit) {
    val context=LocalContext.current
    val loader=remember(context){ImageLoader.Builder(context.applicationContext)
        .okHttpClient(JobbiApi.client).build()}
    val username=vm.account
    Surface(modifier=Modifier.padding(end=10.dp).size(36.dp).clip(CircleShape)
        .semantics { contentDescription="Your profile and settings" }
        .clickable(onClick=onClick),
        shape=CircleShape,color=JobbiViolet) {
        Box(contentAlignment=Alignment.Center) {
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(
                listOf(JobbiViolet,JobbiTeal))),contentAlignment=Alignment.Center) {
                Text(username.firstOrNull()?.uppercaseChar()?.toString()?:"J",
                    color=Color.White,fontWeight=FontWeight.Bold,fontSize=16.sp)
            }
            if(username.isNotBlank() && !vm.parityScreenshotFixture){
                AsyncImage(
                    model=ImageRequest.Builder(context)
                        .data(JobbiApi.authenticatedUrl("/api/social/profiles/"+
                            Uri.encode(username)+"/avatar?v="+vm.avatarRevision))
                        .crossfade(true).build(),
                    imageLoader=loader,contentDescription="Your profile and settings",
                    contentScale=ContentScale.Crop,modifier=Modifier.fillMaxSize()
                )
            }
        }
    }
}

private data class DownloadChoice(val kind:String,val title:String,val id:String="")
private data class BulkChoice(val songs:List<Song>,val sourceId:String?=null,
    val indices:List<Int> = emptyList(), val move:Boolean=false)
private data class Dest(val name: String, val icon: ImageVector)
private val tabs = listOf(
    Dest("Home", Icons.Rounded.Home),
    Dest("Community", Icons.Rounded.Groups),
    Dest("Library", Icons.Rounded.LibraryMusic),
    Dest("Search", Icons.Rounded.Search)
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobbiMaterialApp(vm: MusicViewModel = viewModel()) {
    val context = LocalContext.current
    val player = remember { NativePlayer(context.applicationContext).also { it.connect() } }
    val snack = remember { SnackbarHostState() }
    var showNowPlaying by remember { mutableStateOf(false) }
    var openQueueFirst by remember { mutableStateOf(false) }
    var addSong by remember { mutableStateOf<Song?>(null) }
    var createPlaylist by remember { mutableStateOf(false) }
    var invite by remember { mutableStateOf(false) }
    var bulkChoice by remember { mutableStateOf<BulkChoice?>(null) }
    var downloadChoice by remember { mutableStateOf<DownloadChoice?>(null) }
    var offlineRemovalChoice by remember { mutableStateOf<DownloadChoice?>(null) }
    var downloadWifiOnly by remember { mutableStateOf(true) }
    var removalConfirm by remember { mutableStateOf("") }
    var accountReturnTab by remember { mutableStateOf("Home") }
    var communityCreateSignal by remember{androidx.compose.runtime.mutableIntStateOf(0)}
    var communityRefreshSignal by remember{androidx.compose.runtime.mutableIntStateOf(0)}
    LaunchedEffect(vm.removalPreviews) { removalConfirm = "" }

    DisposableEffect(player) { onDispose { player.disconnect() } }
    LaunchedEffect(player) {
        while (isActive) { player.tick(); delay(450) }
    }
    LaunchedEffect(vm.parityScreenshotFixture) {
        if(vm.parityScreenshotFixture) {
            vm.home.songs.firstOrNull()?.let(player::installVisualParityFixture)
        }
    }
    LaunchedEffect(vm.signedIn,vm.account,vm.parityScreenshotFixture) {
        while(isActive&&vm.signedIn&&!vm.parityScreenshotFixture){
            vm.updateDownloadStats()
            if(vm.selected=="Library")vm.refreshCollectionJobs()
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
        // iPhone opens Account from the avatar as a separate NavigationStack
        // sheet. Do not leave Android's tab bar and mini player underneath it.
        if(vm.selected=="More") {
            val accountBackground=if(isSystemInDarkTheme())Color(0xFF1C1C1E)
                else Color(0xFFF2F2F7)
            Scaffold(
                containerColor=accountBackground,
                topBar={
                    MediumTopAppBar(
                        title={Text("Account",fontSize=32.sp,fontWeight=FontWeight.Bold)},
                        actions={
                            TextButton(onClick={vm.select(accountReturnTab)}){Text("Done")}
                        },
                        colors=TopAppBarDefaults.mediumTopAppBarColors(
                            containerColor=accountBackground,
                            scrolledContainerColor=accountBackground)
                    )
                },
                snackbarHost={SnackbarHost(snack)}
            ){ accountPadding ->
                Box(Modifier.fillMaxSize().padding(accountPadding)
                    .background(accountBackground)) {
                    MoreScreen(vm,player)
                }
            }
            return@JobbiTheme
        }
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            topBar = {
                val label=when(vm.selected){
                    "Detail"->vm.detail?.title?:"Collection"
                    "More"->"Account"
                    "Profile"->"Profile"
                    "Admin"->"Admin"
                    "ArtistDetail"->vm.artistName.ifBlank{"Artist"}
                    "PlaylistDirectory"->"Playlists"
                    "AlbumDirectory"->"Albums"
                    "SavedImports"->"Saved imports"
                    "Server"->"Search"
                    "Favorites"->"Favorite Songs"
                    "Downloads"->"Downloaded"
                    "Import"->"Import Music"
                    else->vm.selected
                }
                // SwiftUI NavigationStack places its large titles BELOW the
                // toolbar row. The earlier Android single-line TopAppBar
                // stacked title and actions side by side instead.
                val large=vm.selected in setOf(
                    "Home","Community","Library","Search","More")
                val heading: @Composable () -> Unit = {
                    Text(label,fontWeight=FontWeight.Bold,
                        fontSize=if(large)32.sp else 21.sp,
                        maxLines=1,overflow=TextOverflow.Ellipsis)
                }
                val leading: @Composable () -> Unit = {
                    if(vm.selected=="Home"){
                        IconButton(onClick=vm::refresh) {
                            Icon(Icons.Rounded.Refresh,contentDescription="Refresh music")
                        }
                    }else if(vm.selected=="Search"){
                        IconButton(onClick={vm.search(vm.searchQuery)},
                            enabled=vm.searchQuery.trim().length>=2){
                            Icon(Icons.Rounded.ArrowForward,contentDescription="Search")
                        }
                    }else if(vm.selected=="Community"){
                        Row(verticalAlignment=Alignment.CenterVertically){
                            IconButton(onClick={communityCreateSignal++}){
                                Icon(Icons.Rounded.GroupAdd,
                                    contentDescription="New shared playlist")
                            }
                            IconButton(onClick={communityRefreshSignal++}){
                                Icon(Icons.Rounded.Refresh,
                                    contentDescription="Refresh community")
                            }
                        }
                    }else if(vm.selected !in tabs.map{it.name}){
                        IconButton(onClick={
                            when(vm.selected){
                                "Detail","ArtistDetail"->vm.back()
                                "Server"->vm.select("Search")
                                "More"->vm.select(accountReturnTab)
                                "Admin","Profile","Import"->vm.select("More")
                                else->vm.select("Library")
                            }
                        }){
                            Icon(Icons.Rounded.ArrowBack,contentDescription="Back")
                        }
                    }
                }
                val trailing: @Composable RowScope.() -> Unit = {
                    if(vm.selected=="Library")IconButton(onClick={createPlaylist=true}){
                        Icon(Icons.Rounded.Add,contentDescription="Create playlist")
                    }
                    if(vm.selected in tabs.map{it.name})JobbiAccountAvatar(vm,onClick={
                        accountReturnTab=vm.selected
                        vm.select("More")
                    })
                }
                if(large){
                    MediumTopAppBar(
                        title=heading,navigationIcon=leading,actions=trailing,
                        colors=TopAppBarDefaults.mediumTopAppBarColors(
                            containerColor=MaterialTheme.colorScheme.background,
                            scrolledContainerColor=MaterialTheme.colorScheme.background)
                    )
                }else{
                    TopAppBar(title=heading,navigationIcon=leading,actions=trailing,
                        colors=TopAppBarDefaults.topAppBarColors(
                            containerColor=MaterialTheme.colorScheme.background))
                }
            },
            snackbarHost = { SnackbarHost(snack) },
            bottomBar = {
                Column {
                    AnimatedVisibility(player.active!=null,enter=slideInVertically{it}+fadeIn(),
                        exit=slideOutVertically{it}+fadeOut()) {
                        MiniPlayer(player,onOpen={showNowPlaying=true})
                    }
                    val darkTabs=isSystemInDarkTheme()
                    Surface(
                        modifier=Modifier.fillMaxWidth()
                            .padding(horizontal=13.dp,vertical=4.dp)
                            .height(61.dp),
                        shape=RoundedCornerShape(32.dp),
                        color=if(darkTabs)Color(0xE633333B)else Color(0xF9FCFCFD),
                        shadowElevation=3.dp
                    ){
                        Row(Modifier.fillMaxSize().padding(horizontal=5.dp),
                            verticalAlignment=Alignment.CenterVertically){
                            tabs.forEach { destination ->
                                val active=vm.selected==destination.name ||
                                    (destination.name=="Search"&&vm.selected=="Server") ||
                                    (destination.name=="Library"&&vm.selected in listOf(
                                        "Detail","Favorites","Downloads","Artists","ArtistDetail",
                                        "PlaylistDirectory","AlbumDirectory","SavedImports"))
                                val activeColor=if(darkTabs)Color(0xFF8FB4FF)
                                    else Color(0xFF2384E9)
                                val iconTint=if(active)activeColor
                                    else MaterialTheme.colorScheme.onSurface
                                Column(
                                    modifier=Modifier.weight(1f).fillMaxHeight()
                                        .clip(RoundedCornerShape(28.dp))
                                        .clickable{vm.select(destination.name)}
                                        .semantics{contentDescription=destination.name+" tab"},
                                    horizontalAlignment=Alignment.CenterHorizontally,
                                    verticalArrangement=Arrangement.Center
                                ){
                                    Box(
                                        modifier=Modifier.width(49.dp).height(28.dp)
                                            .clip(RoundedCornerShape(18.dp))
                                            .background(if(active)activeColor.copy(alpha=.13f)
                                                else Color.Transparent),
                                        contentAlignment=Alignment.Center
                                    ){
                                        Icon(destination.icon,contentDescription=null,
                                            tint=iconTint,modifier=Modifier.size(21.dp))
                                    }
                                    Text(destination.name,fontSize=10.sp,
                                        fontWeight=if(active)FontWeight.SemiBold
                                            else FontWeight.Normal,
                                        color=iconTint,maxLines=1)
                                }
                            }
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
                        "Community" -> CommunityScreen(vm,player,
                            onDiscoverMusic={vm.select("Server")},
                            refreshSignal=communityRefreshSignal,
                            createSignal=communityCreateSignal)
                        "Profile" -> ProfileScreen(vm)
                        "Admin" -> NativeAdminScreen(vm,onBack={vm.select("More")})
                        "PlaylistDirectory" -> PlaylistDirectoryScreen(vm,onCreate={createPlaylist=true})
                        "AlbumDirectory" -> AlbumDirectoryScreen(vm)
                        "SavedImports" -> SavedImportsDirectoryScreen(vm)
                        "Artists" -> ArtistDirectoryScreen(vm)
                        "ArtistDetail" -> ArtistDetailScreen(vm,player,onSongAdd={addSong=it})
                        "Library" -> LibraryScreen(vm,onCreate={createPlaylist=true},
                            onDownloadPlaylist={p->downloadChoice=DownloadChoice("playlist",p.name,p.id)},
                            onRemovePlaylist={p->offlineRemovalChoice=DownloadChoice("playlist",p.name,p.id)},
                            onDownloadAll={downloadChoice=DownloadChoice("all","All playlists")},
                            onDownloadFavorites={downloadChoice=DownloadChoice("favorites","Favorites")})
                        "Downloads" -> DownloadedSongsScreen(vm,player,
                            onRemovePlaylist={id,title->
                                offlineRemovalChoice=DownloadChoice("playlist",title,id)
                            })
                        "Favorites" -> SongsScreen(vm.favorites,vm,player,onSongAdd={addSong=it},
                            emptyText="Heart songs to save them here.",isFavorites=true,
                            onDownloadFavorites={downloadChoice=DownloadChoice("favorites","Favorites")},
                            onBulkPlaylist={songs->bulkChoice=BulkChoice(songs)},
                            onQuarantine={vm.prepareSongRemoval(it)})
                        "Detail" -> DetailScreen(vm,player,onSongAdd={addSong=it},onInvite={invite=true},
                            onDownloadPlaylist={id,title->downloadChoice=DownloadChoice("playlist",title,id)},
                            onRemovePlaylist={id,title->
                                offlineRemovalChoice=DownloadChoice("playlist",title,id)
                            },
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
        if(showNowPlaying) ModalBottomSheet(
            onDismissRequest={showNowPlaying=false;openQueueFirst=false},
            sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),
            dragHandle={},
            containerColor=Color(0xFF201C30)
        ) {
            NowPlayingScreen(vm,player,startWithQueue=openQueueFirst,
                onClose={showNowPlaying=false;openQueueFirst=false})
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
        if(offlineRemovalChoice!=null){
            val choice=offlineRemovalChoice!!
            AlertDialog(
                onDismissRequest={offlineRemovalChoice=null},
                title={Text("Remove offline copies of "+choice.title+"?")},
                text={Text("Cancel this playlist's pending downloads and remove its "+
                    "device-only recordings. Songs also saved through other playlists, "+
                    "Favorites or individually are kept. The playlist and all original "+
                    "files on your NAS will remain untouched.")},
                confirmButton={TextButton(onClick={
                    vm.removePlaylistDownloads(choice.id)
                    offlineRemovalChoice=null
                },enabled=!vm.busy){
                    Text("Remove downloads",color=MaterialTheme.colorScheme.error)
                }},
                dismissButton={TextButton(onClick={offlineRemovalChoice=null}){Text("Cancel")}}
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
private fun HomeScreen(vm:MusicViewModel,player:NativePlayer,
                       onSongAdd:(Song)->Unit){
    LazyColumn(contentPadding=PaddingValues(top=12.dp,bottom=34.dp),
        verticalArrangement=Arrangement.spacedBy(28.dp)){
        // The SwiftUI Home uses its large navigation title; don't add a
        // second, redundant "Listen Now" headline above the featured card.
        if(vm.home.songs.isNotEmpty())item {
            Box(Modifier.fillMaxWidth().padding(horizontal=16.dp)
                .height(313.dp).clip(RoundedCornerShape(20.dp))
                .background(Brush.linearGradient(listOf(
                    JobbiIndigo,JobbiViolet.copy(alpha=.92f),Color(0xFF125E78))))) {
                vm.home.songs.firstOrNull()?.let{song->
                    Cover(song.cover,245.dp,modifier=Modifier.align(Alignment.TopEnd)
                        .offset(x=47.dp,y=(-33).dp)
                        .graphicsLayer(rotationZ=11f)
                        .shadow(20.dp,RoundedCornerShape(16.dp)))
                }
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(
                    listOf(Color.Transparent,Color(0x26000000),Color(0xA3000000)))))
                Column(Modifier.align(Alignment.BottomStart).padding(23.dp),
                    verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Text("PERSONAL RADIO",fontSize=10.sp,fontWeight=FontWeight.ExtraBold,
                        letterSpacing=1.6.sp,color=Color.White.copy(alpha=.85f))
                    Text("Your music.\nYour way.",fontSize=31.sp,lineHeight=35.sp,
                        fontWeight=FontWeight.Bold,letterSpacing=(-.8f).sp,
                        color=Color.White)
                    Text("The next great song is already in your library.",
                        fontSize=14.sp,maxLines=2,color=Color.White.copy(alpha=.88f))
                    Button(onClick={player.play(vm.home.songs)},
                        colors=ButtonDefaults.buttonColors(
                            containerColor=Color.White,contentColor=Color.Black),
                        shape=CircleShape){
                        Icon(Icons.Rounded.PlayArrow,null)
                        Spacer(Modifier.width(5.dp))
                        Text("Play something good",fontWeight=FontWeight.SemiBold)
                    }
                }
            }
        }
        item{AlbumShelf("Recently Added",vm.home.recent,vm::openAlbum)}
        item{AlbumShelf("Jump Back In",vm.home.played,vm::openAlbum)}
        if(vm.recommendations!=null){
            item{RecommendationShelf("New in Your Library",
                vm.recommendations?.recentTracks.orEmpty(),player,
                subtitle="Just added to your collection",accent=JobbiTeal)}
            item{RecommendationShelf("Heavy Rotation",
                vm.recommendations?.topWeek.orEmpty(),player,
                subtitle="Your most played songs this week",showPlays=true,
                accent=JobbiCoral)}
            item{RecommendationShelf("Top Songs This Month",
                vm.recommendations?.topMonth.orEmpty(),player,
                subtitle="Your last 30 days",showPlays=true,accent=JobbiViolet)}
            item{RecommendationShelf("Made for You",
                vm.recommendations?.madeForYou.orEmpty(),player,
                subtitle="A mix of your favorites and discoveries",accent=JobbiSky)}
            item{RecommendationShelf(vm.recommendations?.timeLabel?:"Daily Mix",
                vm.recommendations?.timeMix.orEmpty(),player,
                subtitle="Music for this time of day",accent=JobbiAmber)}
            if(vm.recommendations?.topMonth.isNullOrEmpty())item{
                Text("Your listening charts will appear as you play more music.",
                    modifier=Modifier.padding(horizontal=16.dp),
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if(vm.recommendations?.weatherCity?.isNotBlank()==true)item {
                Column(verticalArrangement=Arrangement.spacedBy(9.dp)){
                    Row(Modifier.padding(horizontal=16.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        Icon(Icons.Rounded.WbCloudy,null,tint=JobbiAmber)
                        Spacer(Modifier.width(8.dp))
                        Text(vm.recommendations?.weatherCity?:"",
                            fontWeight=FontWeight.Bold)
                        vm.recommendations?.weatherTemperature?.let{temperature->
                            Spacer(Modifier.width(8.dp))
                            Text(temperature.toInt().toString()+"°C",
                                color=MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    RecommendationShelf(vm.recommendations?.weatherLabel?:"Weather Mix",
                        vm.recommendations?.weatherMix.orEmpty(),player,
                        subtitle="Selected for your weather",accent=JobbiSky)
                }
            }
            if(vm.recommendations?.weatherError?.isNotBlank()==true)item{
                Text(vm.recommendations?.weatherError?:"",
                    modifier=Modifier.padding(horizontal=16.dp),
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }else if(vm.recommendationsLoading)item{
            LinearProgressIndicator(Modifier.fillMaxWidth()
                .padding(horizontal=16.dp))
        }
        item{AlbumShelf("Explore Your Collection",vm.home.featured,vm::openAlbum)}
        if(vm.home.songs.isNotEmpty())item{
            RecommendationShelf("Play Something Good",vm.home.songs,player,
                subtitle="Rediscover songs from your collection",accent=JobbiTeal)
        }
        item{WeatherCitySection(vm)}
        // Retain the Android-only full song row actions: bulk list access,
        // direct queue insertion, offline downloads and NAS removal review.
        if(vm.home.songs.isNotEmpty()){
            item{
                Text("Quick picks",Modifier.padding(horizontal=20.dp),
                    style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
            }
            itemsIndexed(vm.home.songs,key={index,song->song.id+":"+index}){index,song->
                SongRow(song,index,vm.favoriteIds.contains(song.id),
                    play={player.play(vm.home.songs,index)},
                    favorite={vm.toggleFavorite(song)},
                    playNext={player.playNext(song)},addQueue={player.addToQueue(song)},
                    downloadOffline={vm.downloadSong(song)},
                    offlineSaved=vm.downloadedSongs.any{it.id==song.id},
                    removeOffline={vm.removeOfflineSong(song)},
                    add={onSongAdd(song)},
                    removeFromNas={vm.prepareSongRemoval(listOf(song))})
            }
        }
    }
}

@Composable
private fun RecommendationShelf(title:String,songs:List<Song>,player:NativePlayer,
                                subtitle:String="",showPlays:Boolean=false,
                                accent:Color=JobbiIndigo) {
    if(songs.isEmpty())return
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
        Row(Modifier.fillMaxWidth().padding(horizontal=22.dp),
            verticalAlignment=Alignment.CenterVertically){
            Box(Modifier.width(4.dp).height(31.dp)
                .clip(RoundedCornerShape(5.dp)).background(accent))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)){
                Text(title,style=MaterialTheme.typography.titleLarge,
                    fontWeight=FontWeight.Bold)
                if(subtitle.isNotBlank())Text(subtitle,
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick={player.play(songs)},colors=ButtonDefaults.textButtonColors(contentColor=accent)){
                Icon(Icons.Rounded.PlayArrow,null)
                Text("Play all")
            }
        }
        LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp),
            contentPadding=PaddingValues(horizontal=20.dp)){
            itemsIndexed(songs,key={index,song->"$index:${song.id}"}){index,song->
                Column(Modifier.width(150.dp).clip(RoundedCornerShape(15.dp))
                    .clickable{player.play(songs,index)},
                    verticalArrangement=Arrangement.spacedBy(6.dp)){
                    Cover(song.cover,150.dp)
                    Text(song.title,maxLines=1,overflow=TextOverflow.Ellipsis,
                        fontWeight=FontWeight.SemiBold)
                    Text(song.artist,maxLines=1,overflow=TextOverflow.Ellipsis,
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun WeatherCitySection(vm:MusicViewModel){
    var showing by remember{mutableStateOf(false)}
    var draft by remember(vm.account){mutableStateOf(vm.weatherCity)}
    OutlinedButton(onClick={draft=vm.weatherCity;showing=true},
        modifier=Modifier.padding(horizontal=16.dp)){
        Icon(Icons.Rounded.WbCloudy,null,tint=JobbiAmber)
        Spacer(Modifier.width(8.dp))
        Text(if(vm.weatherCity.isBlank())"Set up Weather Mix"
             else "Weather Mix · "+vm.weatherCity)
    }
    if(showing)AlertDialog(
        onDismissRequest={showing=false},
        title={Text("Weather Mix")},
        text={
            Column(verticalArrangement=Arrangement.spacedBy(13.dp)){
                OutlinedTextField(draft,{draft=it.take(80)},
                    label={Text("City, e.g. Ciudad Juárez")},
                    modifier=Modifier.fillMaxWidth(),singleLine=true)
                Text("Location services are never requested. Weather data comes from the city you enter.",
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
                if(vm.weatherCity.isNotBlank())TextButton(onClick={
                    vm.chooseWeatherCity("")
                    showing=false
                }){Text("Turn off weather recommendations",color=JobbiCoral)}
            }
        },
        confirmButton={TextButton(onClick={
            vm.chooseWeatherCity(draft.trim())
            showing=false
        }){Text("Save")}},
        dismissButton={TextButton(onClick={showing=false}){Text("Cancel")}}
    )
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
    Box(modifier.size(size).clip(RoundedCornerShape(12.dp))
        .background(JobbiSky.copy(alpha=.15f)),contentAlignment=Alignment.Center) {
        Icon(Icons.Rounded.MusicNote,null,Modifier.size(size*.38f),
            tint=JobbiSky)
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
private fun SongRow(song:Song,index:Int,hearted:Boolean,play:()->Unit,
                    favorite:()->Unit,add:()->Unit,removeFromNas:()->Unit={},
                    playNext:()->Unit={},addQueue:()->Unit={},
                    downloadOffline:()->Unit={},offlineSaved:Boolean=false,
                    removeOffline:()->Unit={},removeFromPlaylist:(()->Unit)?=null,
                    showTrackNumber:Boolean=false,showAlbum:Boolean=true,
                    selected:Boolean=false,selectionMode:Boolean=false,
                    onSelect:()->Unit={},onLongSelect:()->Unit={}){
    var moreOpen by remember{mutableStateOf(false)}
    var confirmPlaylistRemoval by remember(song.id,index){mutableStateOf(false)}
    Row(Modifier.fillMaxWidth()
        .background(if(selected)MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
        .combinedClickable(onClick={if(selectionMode)onSelect()else play()},
            onLongClick=onLongSelect)
        .padding(horizontal=13.dp,vertical=6.dp),
        verticalAlignment=Alignment.CenterVertically){
        if(selectionMode){
            Checkbox(checked=selected,onCheckedChange={onSelect()},
                modifier=Modifier.width(42.dp))
        }else if(showTrackNumber){
            Text((index+1).toString(),modifier=Modifier.width(42.dp),
                style=MaterialTheme.typography.bodySmall,
                textAlign=TextAlign.Center,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
        }else{
            Cover(song.cover,48.dp)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)){
            Text(song.title,fontSize=16.sp,fontWeight=FontWeight.Medium,
                maxLines=1,overflow=TextOverflow.Ellipsis)
            Text(if(showAlbum && song.album.isNotBlank())
                    song.artist+" · "+song.album else song.artist,
                fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines=1,overflow=TextOverflow.Ellipsis)
        }
        if(!selectionMode){
            Box{
                IconButton(onClick={moreOpen=true},modifier=Modifier.size(44.dp)){
                    Icon(Icons.Rounded.MoreVert,
                        contentDescription="More options for "+song.title)
                }
                // Matches SwiftUI SongRow: the dangerous server action belongs
                // in the menu, NOT as a red trash icon beside every recording.
                DropdownMenu(expanded=moreOpen,onDismissRequest={moreOpen=false}){
                    DropdownMenuItem(text={Text("Play Next")},
                        leadingIcon={Icon(Icons.Rounded.PlaylistPlay,null)},
                        onClick={moreOpen=false;playNext()})
                    DropdownMenuItem(text={Text("Add to Queue")},
                        leadingIcon={Icon(Icons.Rounded.QueueMusic,null)},
                        onClick={moreOpen=false;addQueue()})
                    HorizontalDivider()
                    DropdownMenuItem(text={Text(if(hearted)
                        "Remove from Favorites" else "Add to Favorites")},
                        leadingIcon={Icon(if(hearted)Icons.Rounded.Favorite
                             else Icons.Rounded.FavoriteBorder,null)},
                        onClick={moreOpen=false;favorite()})
                    DropdownMenuItem(text={Text("Add to playlist")},
                        leadingIcon={Icon(Icons.Rounded.PlaylistAdd,null)},
                        onClick={moreOpen=false;add()})
                    if(offlineSaved){
                        DropdownMenuItem(text={Text("Saved offline")},
                            leadingIcon={Icon(Icons.Rounded.CheckCircle,null)},
                            enabled=false,onClick={})
                        DropdownMenuItem(text={Text("Remove offline copy")},
                            leadingIcon={Icon(Icons.Rounded.DeleteOutline,null)},
                            onClick={moreOpen=false;removeOffline()})
                    }else{
                        DropdownMenuItem(text={Text("Download song")},
                            leadingIcon={Icon(Icons.Rounded.Download,null)},
                            onClick={moreOpen=false;downloadOffline()})
                    }
                    HorizontalDivider()
                    if(removeFromPlaylist!=null){
                        DropdownMenuItem(text={Text("Remove from this playlist")},
                            leadingIcon={Icon(Icons.Rounded.RemoveCircleOutline,null)},
                            onClick={moreOpen=false;confirmPlaylistRemoval=true})
                    }
                    DropdownMenuItem(text={Text("Remove recording from NAS…",
                        color=MaterialTheme.colorScheme.error)},
                        leadingIcon={Icon(Icons.Rounded.DeleteOutline,null,
                            tint=MaterialTheme.colorScheme.error)},
                        onClick={moreOpen=false;removeFromNas()})
                }
            }
        }
    }
    if(confirmPlaylistRemoval&&removeFromPlaylist!=null)AlertDialog(
        onDismissRequest={confirmPlaylistRemoval=false},
        title={Text("Remove from playlist?")},
        text={Text(song.title+" will leave this playlist, but its recording "+
            "will stay on the NAS and in other playlists.")},
        confirmButton={TextButton(onClick={
            confirmPlaylistRemoval=false
            removeFromPlaylist()
        }){Text("Remove from playlist",color=JobbiCoral)}},
        dismissButton={TextButton(onClick={confirmPlaylistRemoval=false}){
            Text("Cancel")
        }}
    )
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
                    play={player.play(songs,index)},favorite={vm.toggleFavorite(song)},
                    playNext={player.playNext(song)},addQueue={player.addToQueue(song)},
                    downloadOffline={vm.downloadSong(song)},
                    offlineSaved=vm.downloadedSongs.any{it.id==song.id},
                    removeOffline={vm.removeOfflineSong(song)},
                    add={onSongAdd(song)},removeFromNas={vm.prepareSongRemoval(listOf(song))},
                    selected=index in selected,selectionMode=selecting,
                    onSelect={selected=if(index in selected)selected-index else selected+index},
                    onLongSelect={selecting=true;selected=selected+index})
            }
        }
    }
}

@Composable
private fun CompactMusicSearchField(
    value:String,onValueChange:(String)->Unit,placeholder:String,
    modifier:Modifier=Modifier
){
    val foreground=MaterialTheme.colorScheme.onSurface
    val hint=MaterialTheme.colorScheme.onSurfaceVariant
    BasicTextField(
        value=value,onValueChange=onValueChange,singleLine=true,
        textStyle=TextStyle(color=foreground,fontSize=13.sp),
        cursorBrush=SolidColor(MaterialTheme.colorScheme.primary),
        modifier=modifier.heightIn(min=40.dp)
            .clip(RoundedCornerShape(23.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .padding(horizontal=12.dp,vertical=10.dp),
        decorationBox={field->
            Row(verticalAlignment=Alignment.CenterVertically) {
                Icon(Icons.Rounded.Search,contentDescription=null,
                    tint=hint,modifier=Modifier.size(17.dp))
                Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f)) {
                    if(value.isEmpty()) Text(placeholder,color=hint,fontSize=13.sp,
                        maxLines=1,overflow=TextOverflow.Ellipsis)
                    field()
                }
            }
        }
    )
}

@Composable
private fun SearchScreen(vm:MusicViewModel,player:NativePlayer,onSongAdd:(Song)->Unit,
                         onBulkPlaylist:(List<Song>)->Unit,
                         onQuarantine:(List<Song>)->Unit) {
    var source by remember { mutableStateOf(0) }
    var selecting by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Set<Int>>(emptySet()) }
    Column {
        // SwiftUI Search has the search field in the navigation drawer,
        // above the two-way source selector.
        if(source==0)CompactMusicSearchField(
            value=vm.searchQuery,
            onValueChange={selecting=false;selected=emptySet();vm.search(it)},
            modifier=Modifier.fillMaxWidth().padding(horizontal=18.dp,vertical=9.dp),
            placeholder="Songs, artists, albums")
        Row(Modifier.fillMaxWidth()
            .padding(horizontal=18.dp,vertical=8.dp)
            .height(35.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .padding(3.dp),
            verticalAlignment=Alignment.CenterVertically){
            listOf("My Library","Find New Music").forEachIndexed{index,label->
                val active=source==index
                Surface(
                    modifier=Modifier.weight(1f).fillMaxHeight()
                        .clip(RoundedCornerShape(16.dp))
                        .clickable{source=index},
                    shape=RoundedCornerShape(16.dp),
                    color=if(active)MaterialTheme.colorScheme.surface
                        else Color.Transparent,
                    shadowElevation=if(active)1.dp else 0.dp
                ){
                    Box(contentAlignment=Alignment.Center){
                        Text(label,fontSize=12.sp,maxLines=1,
                            fontWeight=if(active)FontWeight.SemiBold
                                else FontWeight.Medium)
                    }
                }
            }
        }
        if(source==1){
            // Same source choices as the native iPhone Search tab. All existing
            // Soulseek / Invidious / NAS import controls stay in this screen.
            ServerDiscoverScreen(onBack={source=0},
                initialQuery=vm.searchQuery.ifBlank{vm.serverSearchSeed},
                showBack=false)
        }else{
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
            if(vm.searchQuery.isBlank()&&vm.home.recent.isNotEmpty()){
                item{AlbumShelf("Recently Added",vm.home.recent,vm::openAlbum)}
            }
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
                        favorite={vm.toggleFavorite(song)},
                        playNext={player.playNext(song)},addQueue={player.addToQueue(song)},
                        downloadOffline={vm.downloadSong(song)},
                        offlineSaved=vm.downloadedSongs.any{it.id==song.id},
                        removeOffline={vm.removeOfflineSong(song)},
                        add={onSongAdd(song)},
                        removeFromNas={vm.prepareSongRemoval(listOf(song))},
                        selected=index in selected,selectionMode=selecting,
                        onSelect={selected=if(index in selected)selected-index else selected+index},
                        onLongSelect={selecting=true;selected=selected+index})
                }
            }
        }
        }
    }
}

@Composable
private fun DownloadedSongsScreen(vm:MusicViewModel,player:NativePlayer,
                                  onRemovePlaylist:(String,String)->Unit) {
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
                                if(entry.id.startsWith("playlist:")) {
                                    IconButton(onClick={
                                        onRemovePlaylist(entry.id.removePrefix("playlist:"),entry.title)
                                    },enabled=!vm.busy){
                                        Icon(Icons.Rounded.Delete,
                                            contentDescription="Remove offline downloads for "+entry.title)
                                    }
                                }else{
                                    Icon(Icons.Rounded.ChevronRight,contentDescription=null)
                                }
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
                          onRemovePlaylist:(MusicPlaylist)->Unit,
                          onDownloadAll:()->Unit,onDownloadFavorites:()->Unit) {
    val listState=rememberLazyListState()
    val scope=rememberCoroutineScope()
    var playlistSearch by remember{mutableStateOf("")}
    LazyColumn(state=listState,
        contentPadding=PaddingValues(horizontal=18.dp,vertical=12.dp),
        verticalArrangement=Arrangement.spacedBy(12.dp)) {
        item {
            CompactMusicSearchField(value=playlistSearch,
                onValueChange={playlistSearch=it},
                modifier=Modifier.fillMaxWidth().padding(bottom=7.dp),
                placeholder="Search playlists by name")
        }
        item {
            Column {
                LibraryCategoryRow("Playlists",Icons.Rounded.QueueMusic,JobbiViolet){
                    vm.select("PlaylistDirectory")
                }
                LibraryCategoryRow("Artists",Icons.Rounded.Mic,JobbiAmber){
                    vm.select("Artists")
                }
                LibraryCategoryRow("Albums",Icons.Rounded.Album,JobbiSky){
                    vm.select("AlbumDirectory")
                }
                LibraryCategoryRow("Songs",Icons.Rounded.MusicNote,JobbiTeal){
                    vm.select("Search")
                }
                LibraryCategoryRow("Favorite Songs",Icons.Rounded.Favorite,JobbiCoral){
                    vm.select("Favorites")
                }
                LibraryCategoryRow("Downloaded",Icons.Rounded.Download,JobbiTeal){
                    vm.select("Downloads")
                }
                LibraryCategoryRow("Saved Music Imports",Icons.Rounded.FileDownload,JobbiViolet){
                    vm.select("SavedImports")
                }
            }
        }
        if(vm.albums.isNotEmpty())item {
            AlbumShelf("Recently Added",vm.albums.take(12),vm::openAlbum)
        }
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
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
                Text("Saved NAS imports",
                    style=MaterialTheme.typography.titleLarge,
                    fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
                TextButton(onClick={vm.refreshCollectionJobs()}){
                    Icon(Icons.Rounded.Refresh,contentDescription=null)
                    Text("Refresh")
                }
            }
            Text("Uploaded JSON and progress are saved on your NAS. Imports continue after you close the app.",
                style=MaterialTheme.typography.bodySmall,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            if(vm.collectionJobsError.isNotBlank())
                Text(vm.collectionJobsError,style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.error)
            if(vm.collectionJobs.isEmpty())
                Text("Upload your Spotify or Apple Music collection on the website to see progress here.",
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(vm.collectionJobs,key={ "import:"+it.id }){job->
            Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp)){
                Column(Modifier.padding(15.dp),
                    verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Text(job.filename,fontWeight=FontWeight.SemiBold)
                    Text(job.status.replaceFirstChar{it.uppercase()}+" · "+
                        job.completed+"/"+job.total+" added",
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                    LinearProgressIndicator(
                        progress={ (job.completed+job.review).toFloat() /
                            job.total.coerceAtLeast(1).toFloat() },
                        modifier=Modifier.fillMaxWidth())
                    Text(job.queued.toString()+" queued / indexing · "+
                        job.pending+" pending · "+job.review+" review",
                        style=MaterialTheme.typography.bodySmall)
                    if(job.message.isNotBlank())
                        Text(job.message,style=MaterialTheme.typography.bodySmall,
                            color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        if(job.status in listOf("running","monitoring","reauth"))
                            TextButton(onClick={vm.controlCollectionJob(job.id,"pause")}) {
                                Text("Pause")
                            }
                        if(job.status in listOf("paused","reauth") && job.authorized)
                            TextButton(onClick={vm.controlCollectionJob(job.id,"resume")}) {
                                Text("Resume")
                            }
                        if(job.status in listOf("running","monitoring","paused","finished") && job.review>0)
                            TextButton(onClick={vm.controlCollectionJob(job.id,"retry")}) {
                                Text("Retry unmatched")
                            }
                    }
                }
            }
        }
        item {
            Row(verticalAlignment=Alignment.CenterVertically) {
                Text("Your playlists",style=MaterialTheme.typography.titleLarge,
                    fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
                FilledTonalButton(onClick=onCreate){Icon(Icons.Rounded.Add,null);Text("New")}
            }
        }
        items(vm.playlists.filter{
            playlistSearch.isBlank()||it.name.contains(playlistSearch,ignoreCase=true)
        },key={it.id}){playlist->
            Card(Modifier.fillMaxWidth().clickable{vm.openPlaylist(playlist.id)},
                shape=RoundedCornerShape(18.dp)) {
                Row(Modifier.padding(16.dp),verticalAlignment=Alignment.CenterVertically) {
                    Surface(color=JobbiViolet.copy(alpha=.16f),shape=RoundedCornerShape(16.dp)){
                        Icon(Icons.Rounded.LibraryMusic,null,Modifier.padding(13.dp),
                            tint=JobbiViolet)
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
                    if(vm.hasOfflinePlaylist(playlist.id)){
                        IconButton(onClick={onRemovePlaylist(playlist)},enabled=!vm.busy){
                            Icon(Icons.Rounded.Delete,
                                contentDescription="Remove offline downloads for "+playlist.name)
                        }
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
private fun LibraryCategoryRow(title:String,icon:ImageVector,tint:Color,
                               onClick:()->Unit) {
    Column {
        Row(Modifier.fillMaxWidth()
            .clickable(onClick=onClick)
            .heightIn(min=52.dp)
            .padding(horizontal=8.dp,vertical=11.dp),
            verticalAlignment=Alignment.CenterVertically) {
            Icon(icon,contentDescription=null,tint=tint,
                modifier=Modifier.size(23.dp))
            Spacer(Modifier.width(15.dp))
            Text(title,modifier=Modifier.weight(1f),
                fontWeight=FontWeight.Medium,fontSize=16.sp)
            Icon(Icons.Rounded.ChevronRight,contentDescription=null,
                tint=MaterialTheme.colorScheme.onSurfaceVariant,
                modifier=Modifier.size(20.dp))
        }
        HorizontalDivider(color=MaterialTheme.colorScheme.onSurface.copy(alpha=.08f))
    }
}

@Composable
private fun PlaylistDirectoryScreen(vm:MusicViewModel,onCreate:()->Unit){
    var query by remember{mutableStateOf("")}
    val filtered=vm.playlists.filter{
        it.name.contains(query,ignoreCase=true)
    }
    LazyColumn(contentPadding=PaddingValues(horizontal=17.dp,vertical=16.dp),
        verticalArrangement=Arrangement.spacedBy(9.dp)){
        item{
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
                Spacer(Modifier.weight(1f))
                TextButton(onClick=onCreate){
                    Icon(Icons.Rounded.Add,null)
                    Text("New")
                }
            }
            OutlinedTextField(value=query,onValueChange={query=it},
                singleLine=true,modifier=Modifier.fillMaxWidth(),
                placeholder={Text("Search playlists")},
                leadingIcon={Icon(Icons.Rounded.Search,null)})
        }
        if(filtered.isEmpty())item{
            Text(if(query.isBlank())"No playlists yet." else "No matching playlists.",
                color=MaterialTheme.colorScheme.onSurfaceVariant,
                modifier=Modifier.padding(vertical=15.dp))
        }
        items(filtered,key={it.id}){playlist->
            Row(Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(13.dp))
                .clickable{vm.openPlaylist(playlist.id)}
                .padding(vertical=9.dp,horizontal=6.dp),
                verticalAlignment=Alignment.CenterVertically){
                Surface(color=JobbiViolet.copy(alpha=.15f),
                    shape=RoundedCornerShape(13.dp)){
                    Icon(Icons.Rounded.LibraryMusic,null,tint=JobbiViolet,
                        modifier=Modifier.size(54.dp).padding(14.dp))
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)){
                    Text(playlist.name,maxLines=1,overflow=TextOverflow.Ellipsis,
                        fontWeight=FontWeight.SemiBold)
                    Text(playlist.count.toString()+" songs",
                        color=MaterialTheme.colorScheme.onSurfaceVariant,
                        style=MaterialTheme.typography.bodySmall)
                }
                Icon(Icons.Rounded.ChevronRight,null,
                    tint=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun AlbumDirectoryScreen(vm:MusicViewModel){
    var query by remember{mutableStateOf("")}
    val filtered=vm.albums.filter{
        it.name.contains(query,ignoreCase=true)||
        it.artist.contains(query,ignoreCase=true)
    }
    LazyColumn(contentPadding=PaddingValues(horizontal=16.dp,vertical=14.dp),
        verticalArrangement=Arrangement.spacedBy(10.dp)){
        item{
            OutlinedTextField(value=query,onValueChange={query=it},
                modifier=Modifier.fillMaxWidth(),singleLine=true,
                placeholder={Text("Search albums and artists")},
                leadingIcon={Icon(Icons.Rounded.Search,null)})
        }
        if(filtered.isEmpty())item{
            Text("No matching albums.",modifier=Modifier.padding(15.dp))
        }
        items(filtered,key={it.id}){album->
            Row(Modifier.fillMaxWidth().clickable{vm.openAlbum(album.id)}
                .padding(vertical=6.dp),verticalAlignment=Alignment.CenterVertically){
                Cover(album.cover,66.dp)
                Spacer(Modifier.width(13.dp))
                Column(Modifier.weight(1f)){
                    Text(album.name,fontWeight=FontWeight.SemiBold,maxLines=1,
                        overflow=TextOverflow.Ellipsis)
                    Text(album.artist,style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Icon(Icons.Rounded.ChevronRight,null,
                    tint=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun SavedImportsDirectoryScreen(vm:MusicViewModel){
    LazyColumn(contentPadding=PaddingValues(horizontal=17.dp,vertical=16.dp),
        verticalArrangement=Arrangement.spacedBy(12.dp)){
        item{
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
                Spacer(Modifier.weight(1f))
                TextButton(onClick=vm::refreshCollectionJobs){
                    Icon(Icons.Rounded.Refresh,null)
                    Text("Refresh")
                }
            }
            Text("Your imported collection JSON and song-by-song progress are saved on the NAS. Imports continue when this Android phone is offline.",
                style=MaterialTheme.typography.bodySmall,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            if(vm.collectionJobsError.isNotBlank())
                Text(vm.collectionJobsError,color=MaterialTheme.colorScheme.error)
        }
        if(vm.collectionJobs.isEmpty())item{
            Text("No saved imports yet. Use Import Music to start one.",
                color=MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(vm.collectionJobs,key={it.id}){job->
            Card(Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp)){
                Column(Modifier.padding(16.dp),
                    verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Text(job.filename,fontWeight=FontWeight.SemiBold)
                    Text(job.status.replaceFirstChar{it.uppercase()},
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(job.completed.toString()+" / "+job.total+" added",
                        fontWeight=FontWeight.Bold)
                    LinearProgressIndicator(
                        progress={job.completed.toFloat()/job.total.coerceAtLeast(1)},
                        modifier=Modifier.fillMaxWidth())
                    Text(job.queued.toString()+" queued / indexing · "+
                         job.pending+" pending · "+job.review+" review",
                        style=MaterialTheme.typography.bodySmall)
                    if(job.message.isNotBlank())Text(job.message,
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        if(job.status in setOf("running","monitoring","reauth"))
                            TextButton(onClick={vm.controlCollectionJob(job.id,"pause")}){
                                Text("Pause")
                            }
                        if(job.status in setOf("paused","reauth")&&job.authorized)
                            TextButton(onClick={vm.controlCollectionJob(job.id,"resume")}){
                                Text("Resume")
                            }
                        if(job.review>0 && job.status in
                            setOf("running","monitoring","paused","finished"))
                            TextButton(onClick={vm.controlCollectionJob(job.id,"retry")}){
                                Text("Retry unmatched")
                            }
                    }
                }
            }
        }
    }
}

@Composable
private fun ArtistDirectoryScreen(vm:MusicViewModel) {
    var query by remember{mutableStateOf("")}
    val filtered=vm.artists.filter{
        it.name.contains(query,ignoreCase=true)
    }.sortedBy{it.name.lowercase(Locale.getDefault())}
    LazyColumn(contentPadding=PaddingValues(horizontal=18.dp,vertical=15.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        item {
            OutlinedTextField(value=query,onValueChange={query=it},
                modifier=Modifier.fillMaxWidth(),singleLine=true,
                placeholder={Text("Find an artist")},
                leadingIcon={Icon(Icons.Rounded.Search,null)})
        }
        if(filtered.isEmpty())item {
            Text(if(query.isBlank())"No artists found yet. Try refreshing the library."
                 else "No matching artists.",
                modifier=Modifier.padding(vertical=18.dp),
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick=vm::loadArtists){Text("Refresh artists")}
        }
        items(filtered,key={it.id}){artist->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                .clickable{vm.openArtist(artist.id)}
                .padding(vertical=10.dp,horizontal=7.dp),
                verticalAlignment=Alignment.CenterVertically) {
                Surface(color=JobbiAmber.copy(alpha=.16f),
                    shape=RoundedCornerShape(14.dp)){
                    Icon(Icons.Rounded.Mic,null,
                        Modifier.size(54.dp).padding(14.dp),tint=JobbiAmber)
                }
                Spacer(Modifier.width(14.dp))
                Text(artist.name,modifier=Modifier.weight(1f),
                    fontWeight=FontWeight.SemiBold)
                Icon(Icons.Rounded.ChevronRight,null,
                    tint=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ArtistDetailScreen(vm:MusicViewModel,player:NativePlayer,
                               onSongAdd:(Song)->Unit) {
    LazyColumn(contentPadding=PaddingValues(bottom=30.dp),
        verticalArrangement=Arrangement.spacedBy(14.dp)) {
        item {
            Column(Modifier.padding(horizontal=21.dp,vertical=13.dp)){
                Text(vm.artistName,fontSize=29.sp,fontWeight=FontWeight.Bold)
                Text("${vm.artistSongs.size} recordings",
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    Button(enabled=vm.artistSongs.isNotEmpty(),
                        onClick={player.play(vm.artistSongs)}){
                        Icon(Icons.Rounded.PlayArrow,null)
                        Text("Play")
                    }
                    OutlinedButton(enabled=vm.artistSongs.isNotEmpty(),
                        onClick={player.play(vm.artistSongs.shuffled())}){
                        Icon(Icons.Rounded.Shuffle,null)
                        Text("Shuffle")
                    }
                }
            }
        }
        if(vm.artistAlbums.isNotEmpty())
            item{AlbumShelf("Albums",vm.artistAlbums,vm::openAlbum)}
        item {
            Text("Songs",modifier=Modifier.padding(horizontal=21.dp),
                style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
        }
        itemsIndexed(vm.artistSongs,key={index,song->"${song.id}:$index"}){index,song->
            SongRow(song,index,song.id in vm.favoriteIds,
                play={player.play(vm.artistSongs,index)},
                favorite={vm.toggleFavorite(song)},
                playNext={player.playNext(song)},addQueue={player.addToQueue(song)},
                downloadOffline={vm.downloadSong(song)},
                offlineSaved=vm.downloadedSongs.any{it.id==song.id},
                removeOffline={vm.removeOfflineSong(song)},
                add={onSongAdd(song)},
                removeFromNas={vm.prepareSongRemoval(listOf(song))})
        }
    }
}

@Composable
private fun CustomCollectionCover(detail:Listing,revision:Int){
    val context=LocalContext.current
    val loader=remember { ImageLoader.Builder(context.applicationContext)
        .okHttpClient(JobbiApi.client).build() }
    Box(Modifier.size(122.dp).clip(RoundedCornerShape(18.dp))){
        Cover(detail.songs.firstOrNull()?.cover,122.dp)
        val kind=if(detail.isPlaylist)"playlist" else "album"
        val overlay=JobbiApi.authenticatedUrl(
            "/api/artwork/"+kind+"/"+Uri.encode(detail.id))+"?v="+revision
        AsyncImage(
            model=ImageRequest.Builder(context).data(overlay).crossfade(true).build(),
            imageLoader=loader,contentDescription="Custom collection cover",
            contentScale=ContentScale.Crop,modifier=Modifier.fillMaxSize()
        )
    }
}

@Composable
private fun DetailScreen(vm:MusicViewModel,player:NativePlayer,onSongAdd:(Song)->Unit,
                         onInvite:()->Unit,onDownloadPlaylist:(String,String)->Unit,
                          onRemovePlaylist:(String,String)->Unit,
                         onBulkPlaylist:(List<Song>,List<Int>,Boolean)->Unit,
                         onQuarantine:(List<Song>)->Unit) {
    val detail = vm.detail ?: return
    var filter by remember(detail.id) { mutableStateOf("") }
    var renameDraft by remember(detail.id){mutableStateOf(detail.title)}
    var showingRename by remember(detail.id){mutableStateOf(false)}
    var confirmingDelete by remember(detail.id){mutableStateOf(false)}
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
                    CustomCollectionCover(detail,vm.artRevision)
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
                    if(detail.isPlaylist && vm.hasOfflinePlaylist(detail.id))
                        OutlinedButton(onClick={onRemovePlaylist(detail.id,detail.title)},
                            enabled=!vm.busy){
                            Icon(Icons.Rounded.Delete,null);Spacer(Modifier.width(5.dp))
                            Text("Remove offline")
                        }
                    if(!detail.isPlaylist)
                        OutlinedButton(onClick=vm::downloadOpenedAlbum,enabled=detail.songs.isNotEmpty()){
                            Icon(Icons.Rounded.Download,null)
                            Spacer(Modifier.width(5.dp))
                            Text("Download album")
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
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        OutlinedButton(onClick={
                            renameDraft=detail.title
                            showingRename=true
                        }){
                            Icon(Icons.Rounded.Edit,null,Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Rename playlist")
                        }
                        TextButton(onClick={confirmingDelete=true}){
                            Icon(Icons.Rounded.Delete,null,tint=JobbiCoral,
                                modifier=Modifier.size(18.dp))
                            Spacer(Modifier.width(3.dp))
                            Text("Delete playlist",color=JobbiCoral)
                        }
                    }
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
                play={player.play(playingList,index)},favorite={vm.toggleFavorite(song)},
                playNext={player.playNext(song)},addQueue={player.addToQueue(song)},
                downloadOffline={vm.downloadSong(song)},
                offlineSaved=vm.downloadedSongs.any{it.id==song.id},
                removeOffline={vm.removeOfflineSong(song)},
                add={onSongAdd(song)},
                removeFromNas={vm.prepareSongRemoval(listOf(song))},
                removeFromPlaylist=if(detail.isPlaylist){{
                    vm.removeSelectedFromPlaylist(listOf(pair.first))
                }}else null,
                showTrackNumber=!detail.isPlaylist,
                showAlbum=false,
                selected=pair.first in selected,selectionMode=selecting,
                onSelect={selected=if(pair.first in selected)selected-pair.first else selected+pair.first},
                onLongSelect={selecting=true;selected=selected+pair.first})
        }
    }
    if(showingRename)AlertDialog(
        onDismissRequest={showingRename=false},
        title={Text("Rename playlist")},
        text={OutlinedTextField(value=renameDraft,onValueChange={renameDraft=it.take(100)},
            modifier=Modifier.fillMaxWidth(),singleLine=true,
            label={Text("Playlist name")})},
        confirmButton={TextButton(enabled=renameDraft.isNotBlank()&&!vm.busy,
            onClick={showingRename=false;vm.renameOpenedPlaylist(renameDraft)}){
            Text("Save")
        }},
        dismissButton={TextButton(onClick={showingRename=false}){Text("Cancel")}}
    )
    if(confirmingDelete)AlertDialog(
        onDismissRequest={confirmingDelete=false},
        title={Text("Delete this playlist?")},
        text={Text("This deletes the playlist, not its songs. Recordings on the NAS, Favorites, and other playlists remain unchanged.")},
        confirmButton={TextButton(enabled=!vm.busy,onClick={
            confirmingDelete=false
            vm.deleteOpenedPlaylist()
        }){Text("Delete playlist",color=JobbiCoral)}},
        dismissButton={TextButton(onClick={confirmingDelete=false}){Text("Cancel")}}
    )
}

@Composable
private fun MiniPlayer(player:NativePlayer,onOpen:()->Unit) {
    val song=player.active ?: return
    var dragAmount by remember(song.id){mutableFloatStateOf(0f)}
    val iosBlue=if(isSystemInDarkTheme())Color(0xFF8FB4FF) else Color(0xFF2384E9)
    Surface(
        tonalElevation=0.dp,shadowElevation=3.dp,
        modifier=Modifier.padding(horizontal=8.dp,vertical=4.dp)
            .fillMaxWidth()
            .pointerInput(song.id){
                detectHorizontalDragGestures(
                    onDragStart={dragAmount=0f},
                    onDragEnd={
                        if(abs(dragAmount)>45f){
                            if(dragAmount<0f)player.next() else player.previous()
                        }
                        dragAmount=0f
                    },
                    onHorizontalDrag={_,delta->dragAmount+=delta}
                )
            },
        shape=RoundedCornerShape(21.dp),
        color=if(isSystemInDarkTheme())Color(0xF53A3A44) else Color(0xF6F8F8FB)
    ){
        Row(Modifier.fillMaxWidth().padding(horizontal=10.dp,vertical=5.dp),
            verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.spacedBy(11.dp)){
            Row(Modifier.weight(1f)
                .semantics { contentDescription="Open Now Playing" }
                .clickable(onClick=onOpen),
                verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.spacedBy(11.dp)){
                Cover(song.cover,42.dp)
                Column(Modifier.weight(1f)){
                    Text(song.title,fontSize=14.sp,fontWeight=FontWeight.Bold,
                        maxLines=1,overflow=TextOverflow.Ellipsis)
                    Text(song.artist,fontSize=12.sp,
                        color=MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines=1,overflow=TextOverflow.Ellipsis)
                }
            }
            IconButton(onClick=player::toggle,modifier=Modifier.size(38.dp)){
                Icon(if(player.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                    if(player.playing)"Pause" else "Play",tint=iosBlue,modifier=Modifier.size(23.dp))
            }
            IconButton(onClick=player::next,modifier=Modifier.size(35.dp)){
                Icon(Icons.Rounded.SkipNext,"Next track",tint=iosBlue,modifier=Modifier.size(24.dp))
            }
        }
    }
}

@Composable
private fun NowPlayingScreen(vm: MusicViewModel,player:NativePlayer,
                             startWithQueue:Boolean=false,onClose:()->Unit={}) {
    var viewingQueue by remember { mutableStateOf(startWithQueue) }
    var showingLyrics by remember { mutableStateOf(false) }
    var showingMenu by remember { mutableStateOf(false) }
    if(viewingQueue){
        PlaybackQueueScreen(player,onBack={viewingQueue=false})
        return
    }
    val song=player.active ?: return
    val context=LocalContext.current
    val imageLoader=remember(context) {
        ImageLoader.Builder(context.applicationContext).okHttpClient(JobbiApi.client).build()
    }
    val audioManager=remember(context){
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }
    val maxVolume=remember(audioManager){
        audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
    }
    var volume by remember(audioManager){
        mutableFloatStateOf(audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat())
    }
    LaunchedEffect(audioManager){
        while(isActive){
            volume=audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat()
            delay(1400)
        }
    }
    var scrubbing by remember(song.id){mutableFloatStateOf(-1f)}
    val duration=player.duration.coerceAtLeast(1L)
    val shownTime=if(scrubbing>=0f)scrubbing.toLong() else player.position
    val white=Color.White
    val muted=white.copy(alpha=.75f)
    Box(Modifier.fillMaxWidth().fillMaxHeight().background(Color(0xFF311F2A))) {
        // Match the SwiftUI player: derive the atmosphere from the *current
        // album artwork*. The image remains behind an opaque dark scrim.
        if(!song.cover.isNullOrBlank())AsyncImage(
            model=ImageRequest.Builder(context).data(JobbiApi.coverUrl(song.cover))
                .crossfade(true).build(),
            imageLoader=imageLoader,contentDescription=null,
            contentScale=ContentScale.Crop,
            modifier=Modifier.fillMaxSize().blur(70.dp).graphicsLayer(alpha=.65f)
        )
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(
            listOf(Color(0x35000000),Color(0x3C000000),Color(0xBD000000)))))
        Column(Modifier.fillMaxSize().widthIn(max=482.dp)
            .align(Alignment.Center).padding(horizontal=25.dp,vertical=6.dp),
            horizontalAlignment=Alignment.CenterHorizontally) {
            // iPhone: fixed 52pt header, centered source independent of buttons.
            Box(Modifier.fillMaxWidth().height(53.dp)) {
                Column(Modifier.align(Alignment.Center),
                    horizontalAlignment=Alignment.CenterHorizontally){
                    Text("PLAYING FROM",fontSize=10.sp,letterSpacing=1.5.sp,
                        fontWeight=FontWeight.SemiBold,color=white.copy(alpha=.64f))
                    Text("Your Library",fontSize=14.sp,fontWeight=FontWeight.SemiBold,
                        color=white)
                }
                IconButton(onClick=onClose,modifier=Modifier.align(Alignment.CenterStart)
                    .size(44.dp)){
                    Icon(Icons.Rounded.KeyboardArrowDown,
                        contentDescription="Close Now Playing",tint=white,
                        modifier=Modifier.size(28.dp))
                }
                Box(Modifier.align(Alignment.CenterEnd)){
                    IconButton(onClick={showingMenu=true},modifier=Modifier.size(44.dp)){
                        Icon(if(player.sleepUntil>0)Icons.Rounded.Bedtime
                             else Icons.Rounded.MoreHoriz,
                            contentDescription="More and Sleep Timer",
                            tint=white,modifier=Modifier.size(24.dp))
                    }
                    DropdownMenu(expanded=showingMenu,onDismissRequest={showingMenu=false}){
                        DropdownMenuItem(text={Text("Toggle Favorite")},
                            leadingIcon={Icon(Icons.Rounded.Star,null)},
                            onClick={vm.toggleFavorite(song);showingMenu=false})
                        DropdownMenuItem(text={Text("Play Next")},
                            leadingIcon={Icon(Icons.Rounded.PlaylistPlay,null)},
                            onClick={player.playNext(song);showingMenu=false})
                        HorizontalDivider()
                        for(minutes in listOf(15,30,45,60)){
                            DropdownMenuItem(text={Text("Pause in "+minutes+" minutes")},
                                onClick={player.setSleepTimer(minutes);showingMenu=false})
                        }
                        DropdownMenuItem(text={Text("Cancel sleep timer")},
                            onClick={player.setSleepTimer(0);showingMenu=false})
                        if(player.repeatMode==androidx.media3.common.Player.REPEAT_MODE_ALL)
                            DropdownMenuItem(text={Text("Repeat all is enabled")},
                                onClick={player.cycleRepeat();showingMenu=false})
                    }
                }
            }
            BoxWithConstraints(Modifier.fillMaxWidth().weight(1f),
                contentAlignment=Alignment.Center){
                val artSize=minOf((maxWidth-22.dp).coerceAtLeast(130.dp),
                    (maxHeight-20.dp).coerceAtLeast(130.dp),385.dp)
                if(showingLyrics){
                    NativeLyricsPanel(songId=song.id,positionMs=player.position,
                        onSeek={player.seek(it)},modifier=Modifier.fillMaxWidth())
                }else{
                    Cover(song.cover,artSize,modifier=Modifier
                        .shadow(18.dp,RoundedCornerShape(13.dp)))
                }
            }
            // iPhone: metadata + favorite, scrubber, five playback buttons,
            // volume and lyrics / output / Up Next in predictable rows.
            Column(Modifier.fillMaxWidth(),
                verticalArrangement=Arrangement.spacedBy(10.dp)){
                Row(Modifier.fillMaxWidth().heightIn(min=55.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    Column(Modifier.weight(1f)){
                        Text(song.title,fontSize=22.sp,fontWeight=FontWeight.Bold,
                            maxLines=1,overflow=TextOverflow.Ellipsis,color=white)
                        Text(song.artist,fontSize=18.sp,maxLines=1,
                            overflow=TextOverflow.Ellipsis,color=muted)
                    }
                    IconButton(onClick={vm.toggleFavorite(song)},modifier=Modifier.size(48.dp)){
                        Icon(if(song.id in vm.favoriteIds)Icons.Rounded.Star
                             else Icons.Rounded.StarBorder,
                            contentDescription="Toggle Favorite",tint=white,
                            modifier=Modifier.size(24.dp))
                    }
                }
                Column(verticalArrangement=Arrangement.spacedBy(1.dp)){
                    Slider(
                        value=shownTime.toFloat().coerceIn(0f,duration.toFloat()),
                        onValueChange={scrubbing=it},
                        onValueChangeFinished={
                            if(scrubbing>=0f)player.seek(scrubbing.toLong())
                            scrubbing=-1f
                        },
                        valueRange=0f..duration.toFloat(),
                        colors=SliderDefaults.colors(thumbColor=white,
                            activeTrackColor=white,
                            inactiveTrackColor=white.copy(alpha=.26f)),
                        modifier=Modifier.fillMaxWidth().height(33.dp))
                    Row(Modifier.fillMaxWidth(),
                        horizontalArrangement=Arrangement.SpaceBetween){
                        Text(time(shownTime/1000),fontSize=11.sp,color=muted)
                        Text("-"+time((duration-shownTime).coerceAtLeast(0L)/1000),
                            fontSize=11.sp,color=muted)
                    }
                }
                Row(Modifier.fillMaxWidth().height(65.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    IconButton(onClick=player::toggleShuffle,modifier=Modifier.weight(1f)){
                        Icon(Icons.Rounded.Shuffle,contentDescription="Shuffle",
                            tint=if(player.shuffleEnabled)JobbiSky else muted,
                            modifier=Modifier.size(23.dp))
                    }
                    IconButton(onClick=player::previous,modifier=Modifier.weight(1f)){
                        Icon(Icons.Rounded.SkipPrevious,contentDescription="Previous",
                            tint=white,modifier=Modifier.size(36.dp))
                    }
                    IconButton(onClick=player::toggle,modifier=Modifier.weight(1f)){
                        Icon(if(player.playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription=if(player.playing)"Pause" else "Play",
                            tint=white,modifier=Modifier.size(47.dp))
                    }
                    IconButton(onClick=player::next,modifier=Modifier.weight(1f)){
                        Icon(Icons.Rounded.SkipNext,contentDescription="Next",
                            tint=white,modifier=Modifier.size(36.dp))
                    }
                    IconButton(onClick=player::cycleRepeat,modifier=Modifier.weight(1f)){
                        Icon(if(player.repeatMode==androidx.media3.common.Player.REPEAT_MODE_ONE)
                                Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                            contentDescription="Repeat",
                            tint=if(player.repeatMode!=androidx.media3.common.Player.REPEAT_MODE_OFF)
                                JobbiSky else muted,
                            modifier=Modifier.size(23.dp))
                    }
                }
                Row(Modifier.fillMaxWidth().height(34.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    Icon(Icons.Rounded.VolumeDown,contentDescription="Volume down",
                        tint=muted,modifier=Modifier.size(18.dp))
                    Slider(value=volume.coerceIn(0f,maxVolume.toFloat()),
                        onValueChange={value->
                            volume=value
                            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC,value.toInt(),0)
                        },
                        valueRange=0f..maxVolume.toFloat(),
                        colors=SliderDefaults.colors(thumbColor=white,
                            activeTrackColor=white,inactiveTrackColor=white.copy(alpha=.25f)),
                        modifier=Modifier.weight(1f).padding(horizontal=8.dp))
                    Icon(Icons.Rounded.VolumeUp,contentDescription="Volume up",
                        tint=muted,modifier=Modifier.size(18.dp))
                }
                Row(Modifier.fillMaxWidth().height(55.dp),
                    horizontalArrangement=Arrangement.SpaceEvenly,
                    verticalAlignment=Alignment.CenterVertically){
                    Box(Modifier.weight(1f),contentAlignment=Alignment.Center){
                        IconButton(onClick={showingLyrics=!showingLyrics}){
                            Icon(Icons.Rounded.ChatBubbleOutline,
                                contentDescription=if(showingLyrics)"Hide lyrics" else "Show lyrics",
                                tint=white.copy(alpha=if(showingLyrics)1f else .8f),
                                modifier=Modifier.size(26.dp))
                        }
                    }
                    Box(Modifier.weight(1f),contentAlignment=Alignment.Center){
                        IconButton(onClick={
                            // Android 14+ exposes the genuine device picker,
                            // including Bluetooth and other system media routes.
                            // Older devices use Android's native volume panel.
                            val opened=if(Build.VERSION.SDK_INT>=34)
                                android.media.MediaRouter2.getInstance(context)
                                    .showSystemOutputSwitcher()
                            else false
                            if(!opened)audioManager.adjustStreamVolume(
                                AudioManager.STREAM_MUSIC,AudioManager.ADJUST_SAME,
                                AudioManager.FLAG_SHOW_UI)
                        }){
                            Icon(Icons.Rounded.Airplay,
                                contentDescription="Audio output",tint=muted,
                                modifier=Modifier.size(25.dp))
                        }
                    }
                    Box(Modifier.weight(1f),contentAlignment=Alignment.Center){
                        IconButton(onClick={viewingQueue=true}){
                            Icon(Icons.Rounded.QueueMusic,
                                contentDescription="Show Up Next queue",tint=muted,
                                modifier=Modifier.size(25.dp))
                        }
                    }
                }
            }
        }
    }
}
@Composable
private fun PlaybackQueueScreen(player:NativePlayer,onBack:()->Unit) {
    Column(Modifier.fillMaxWidth().fillMaxHeight(.83f).padding(horizontal=13.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        Row(Modifier.fillMaxWidth().padding(vertical=6.dp),
            verticalAlignment=Alignment.CenterVertically){
            IconButton(onClick=onBack){
                Icon(Icons.Rounded.ArrowBack,contentDescription="Back to Now Playing")
            }
            Column(Modifier.weight(1f)){
                Text("Up Next",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
                Text("${(player.queue.size-player.currentIndex-1).coerceAtLeast(0)} upcoming · ${player.queue.size} total",
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick=player::clearUpcoming,
                enabled=player.currentIndex<player.queue.lastIndex){
                Text("Clear upcoming")
            }
        }
        if(player.queue.isEmpty()){
            Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center) {
                Text("Play a song, then choose Play next or Add to queue.")
            }
        }else LazyColumn(contentPadding=PaddingValues(bottom=24.dp)){
            itemsIndexed(player.queue,key={i,s->"$i:${s.id}"}){index,song->
                Row(Modifier.fillMaxWidth()
                    .background(if(index==player.currentIndex)
                        MaterialTheme.colorScheme.secondaryContainer else Color.Transparent,
                        RoundedCornerShape(13.dp))
                    .padding(vertical=4.dp,horizontal=4.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    Cover(song.cover,46.dp)
                    Spacer(Modifier.width(9.dp))
                    Column(Modifier.weight(1f).clickable{player.jumpTo(index)}){
                        Text(song.title,maxLines=1,overflow=TextOverflow.Ellipsis,
                            fontWeight=FontWeight.SemiBold)
                        Text(if(index==player.currentIndex)"Now playing · ${song.artist}"
                            else song.artist,maxLines=1,overflow=TextOverflow.Ellipsis,
                            style=MaterialTheme.typography.bodySmall,
                            color=MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if(index>player.currentIndex){
                        IconButton(onClick={player.moveUpcoming(index,index-1)},
                            enabled=index>player.currentIndex+1,
                            modifier=Modifier.size(35.dp)){
                            Icon(Icons.Rounded.KeyboardArrowUp,contentDescription="Move ${song.title} up")
                        }
                        IconButton(onClick={player.moveUpcoming(index,index+1)},
                            enabled=index<player.queue.lastIndex,
                            modifier=Modifier.size(35.dp)){
                            Icon(Icons.Rounded.KeyboardArrowDown,contentDescription="Move ${song.title} down")
                        }
                        IconButton(onClick={player.removeUpcoming(index)},
                            modifier=Modifier.size(35.dp)){
                            Icon(Icons.Rounded.Close,contentDescription="Remove ${song.title} from queue")
                        }
                    }else if(index==player.currentIndex){
                        Icon(Icons.Rounded.GraphicEq,contentDescription="Now playing",
                            tint=MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

private fun time(seconds:Long): String =
    "${seconds.coerceAtLeast(0)/60}:${(seconds.coerceAtLeast(0)%60).toString().padStart(2,'0')}"

@Composable
private fun AccountSettingRow(title:String,subtitle:String="",
                              icon:ImageVector,tint:Color=JobbiIndigo,
                              onClick:()->Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick=onClick)
        .padding(horizontal=16.dp,vertical=13.dp),
        verticalAlignment=Alignment.CenterVertically) {
        Surface(color=tint.copy(alpha=.13f),shape=RoundedCornerShape(10.dp)){
            Icon(icon,null,tint=tint,modifier=Modifier.padding(9.dp).size(22.dp))
        }
        Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f)){
            Text(title,fontWeight=FontWeight.Medium)
            if(subtitle.isNotBlank())Text(subtitle,
                style=MaterialTheme.typography.bodySmall,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.Rounded.ChevronRight,null,
            tint=MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AccountValueRow(label:String,value:String) {
    Row(Modifier.fillMaxWidth().heightIn(min=47.dp)
        .padding(horizontal=14.dp,vertical=11.dp),
        verticalAlignment=Alignment.CenterVertically) {
        Text(label,fontSize=14.sp,modifier=Modifier.weight(1f))
        Text(value,fontSize=13.sp,maxLines=2,overflow=TextOverflow.Ellipsis,
            textAlign=TextAlign.End,
            color=MaterialTheme.colorScheme.onSurfaceVariant,
            modifier=Modifier.weight(1.1f))
    }
}

@Composable
private fun AccountLinkRow(title:String,icon:ImageVector,tint:Color=JobbiSky,
                           onClick:()->Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min=49.dp)
        .clickable(onClick=onClick)
        .padding(horizontal=14.dp,vertical=10.dp),
        verticalAlignment=Alignment.CenterVertically) {
        Icon(icon,contentDescription=null,tint=tint,modifier=Modifier.size(19.dp))
        Spacer(Modifier.width(10.dp))
        Text(title,fontSize=14.sp,modifier=Modifier.weight(1f))
        Icon(Icons.Rounded.ChevronRight,contentDescription=null,
            tint=MaterialTheme.colorScheme.onSurfaceVariant,
            modifier=Modifier.size(20.dp))
    }
}

@Composable
private fun MoreScreen(vm:MusicViewModel,player:NativePlayer) {
    var signingOut by remember { mutableStateOf(false) }
    var qualityPicker by remember { mutableStateOf(false) }
    var cityDraft by remember(vm.account){mutableStateOf(vm.weatherCity)}
    LaunchedEffect(vm.weatherCity){cityDraft=vm.weatherCity}
    val sectionColor=MaterialTheme.colorScheme.onSurfaceVariant
    val divider: @Composable () -> Unit = {
        HorizontalDivider(modifier=Modifier.padding(horizontal=14.dp),
            color=MaterialTheme.colorScheme.outlineVariant.copy(alpha=.45f))
    }
    val qualityLabel=when(vm.quality){
        "original"->"Original / Lossless"
        "saver"->"Data saver · 128 kbps"
        else->"High quality · 320 kbps"
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())
        .padding(horizontal=18.dp,vertical=8.dp),
        verticalArrangement=Arrangement.spacedBy(10.dp)) {
        Text("Account",fontSize=13.sp,color=sectionColor,
            modifier=Modifier.padding(start=12.dp,top=6.dp,bottom=2.dp))
        Surface(shape=RoundedCornerShape(17.dp),
            color=MaterialTheme.colorScheme.surface) {
            Column {
                AccountValueRow("Signed in as",vm.account)
                divider()
                AccountValueRow("Server",vm.server)
                divider()
                AccountValueRow("Role",if(vm.isAdmin)"Administrator" else "Listener")
                divider()
                AccountLinkRow("View or edit profile picture",
                    Icons.Rounded.AccountCircle,JobbiSky,onClick={vm.select("Profile")})
            }
        }
        if(vm.isAdmin) {
            Text("Server administration",fontSize=13.sp,color=sectionColor,
                modifier=Modifier.padding(start=12.dp,top=12.dp,bottom=2.dp))
            Surface(shape=RoundedCornerShape(17.dp),
                color=MaterialTheme.colorScheme.surface) {
                Column {
                    AccountLinkRow("Admin Console",Icons.Rounded.AdminPanelSettings,
                        onClick={vm.select("Admin")})
                    divider()
                    AccountLinkRow("Scan new music",Icons.Rounded.Refresh,JobbiTeal,
                        onClick=vm::rescan)
                }
            }
            Text("NAS storage, user management, library rescans and import configuration.",
                fontSize=12.sp,color=sectionColor,
                modifier=Modifier.padding(horizontal=12.dp))
        }
        Text("Playback",fontSize=13.sp,color=sectionColor,
            modifier=Modifier.padding(start=12.dp,top=12.dp,bottom=2.dp))
        Surface(shape=RoundedCornerShape(17.dp),
            color=MaterialTheme.colorScheme.surface) {
            Column {
                Row(Modifier.fillMaxWidth().clickable{qualityPicker=true}
                    .padding(horizontal=14.dp,vertical=13.dp),
                    verticalAlignment=Alignment.CenterVertically) {
                    Text("Streaming quality",fontSize=14.sp,
                        modifier=Modifier.weight(1f))
                    Text(qualityLabel,fontSize=12.sp,color=sectionColor)
                    Spacer(Modifier.width(5.dp))
                    Icon(Icons.Rounded.UnfoldMore,contentDescription="Choose streaming quality",
                        modifier=Modifier.size(18.dp),tint=sectionColor)
                }
                divider()
                Text("Changing quality applies to the next streamed track.",
                    fontSize=12.sp,color=sectionColor,
                    modifier=Modifier.padding(horizontal=14.dp,vertical=11.dp))
            }
        }
        Text("Your Android",fontSize=13.sp,color=sectionColor,
            modifier=Modifier.padding(start=12.dp,top=12.dp,bottom=2.dp))
        Surface(shape=RoundedCornerShape(17.dp),
            color=MaterialTheme.colorScheme.surface) {
            Column {
                AccountValueRow("Downloaded tracks",vm.downloadStats.saved.toString())
                divider()
                AccountLinkRow("Download all playlists to this Android",
                    Icons.Rounded.FileDownload,JobbiSky,
                    onClick={vm.downloadAllPlaylists(true)})
                divider()
                AccountLinkRow("Manage downloaded music",Icons.Rounded.Download,JobbiTeal,
                    onClick={vm.select("Downloads")})
                divider()
                AccountLinkRow("Refresh offline downloads",Icons.Rounded.Sync,JobbiTeal,
                    onClick=vm::updateDownloadStats)
                if(vm.offlineMode){
                    divider()
                    AccountLinkRow("Reconnect to Jobbi Music",Icons.Rounded.CloudSync,
                        onClick=vm::retrySavedSignIn)
                }
            }
        }
        Text("Offline copies are stored privately for this signed-in account. "+
            "Downloading a playlist does not change your NAS music library.",
            fontSize=12.sp,color=sectionColor,
            modifier=Modifier.padding(horizontal=12.dp))
        Text("Personal recommendations",fontSize=13.sp,color=sectionColor,
            modifier=Modifier.padding(start=12.dp,top=12.dp,bottom=2.dp))
        Surface(shape=RoundedCornerShape(17.dp),
            color=MaterialTheme.colorScheme.surface) {
            Column(Modifier.padding(14.dp),
                verticalArrangement=Arrangement.spacedBy(9.dp)) {
                OutlinedTextField(cityDraft,{cityDraft=it.take(80)},
                    modifier=Modifier.fillMaxWidth(),singleLine=true,
                    label={Text("Weather city (optional)")})
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    FilledTonalButton(onClick={vm.chooseWeatherCity(cityDraft)}){
                        Text("Save city")
                    }
                    if(vm.weatherCity.isNotBlank())TextButton(onClick={
                        cityDraft=""
                        vm.chooseWeatherCity("")
                    }){Text("Disable Weather Mix")}
                }
                Text("We don't request GPS access. City names are sent only when "+
                    "you enable Weather Mix.",
                    style=MaterialTheme.typography.bodySmall,color=sectionColor)
            }
        }
        // Android-only quick links remain available without displacing the
        // iPhone-matched account, playback and offline controls above.
        Text("Your music",fontSize=13.sp,color=sectionColor,
            modifier=Modifier.padding(start=12.dp,top=12.dp,bottom=2.dp))
        Surface(shape=RoundedCornerShape(17.dp),
            color=MaterialTheme.colorScheme.surface) {
            Column {
                AccountLinkRow("Community & Friends",Icons.Rounded.Groups,JobbiSky,
                    onClick={vm.select("Community")})
                divider()
                AccountLinkRow("Favorite Songs",Icons.Rounded.Favorite,JobbiCoral,
                    onClick={vm.select("Favorites")})
                divider()
                AccountLinkRow("Find new music on NAS",Icons.Rounded.TravelExplore,
                    JobbiTeal,onClick={vm.select("Server")})
                divider()
                AccountLinkRow("Import track list",Icons.Rounded.UploadFile,
                    JobbiAmber,onClick={vm.select("Import")})
            }
        }
        Surface(shape=RoundedCornerShape(17.dp),
            color=MaterialTheme.colorScheme.surface) {
            Row(Modifier.fillMaxWidth().clickable{signingOut=true}
                .padding(15.dp),verticalAlignment=Alignment.CenterVertically) {
                Text("Sign out",fontSize=14.sp,color=JobbiCoral)
            }
        }
        Text("Your Navidrome credentials are kept securely only when you "+
            "enable remembered sign-in. Signing out clears the saved credentials.",
            fontSize=12.sp,color=sectionColor,
            modifier=Modifier.padding(horizontal=12.dp))
        Text("Jobbi Music · Native Android\nKotlin · Jetpack Compose · Media3",
            style=MaterialTheme.typography.bodySmall,color=sectionColor,
            modifier=Modifier.padding(horizontal=12.dp,vertical=12.dp))
    }
    if(qualityPicker)AlertDialog(
        onDismissRequest={qualityPicker=false},
        title={Text("Streaming quality")},
        text={Column(verticalArrangement=Arrangement.spacedBy(5.dp)) {
            listOf(
                "original" to "Original / Lossless",
                "balanced" to "High quality · 320 kbps",
                "saver" to "Data saver · 128 kbps"
            ).forEach { (value,label)->
                TextButton(onClick={vm.updateQuality(value);qualityPicker=false},
                    modifier=Modifier.fillMaxWidth()) {
                    Text((if(vm.quality==value)"✓  " else "")+label)
                }
            }
        }},
        confirmButton={TextButton(onClick={qualityPicker=false}){Text("Cancel")}}
    )
    if(signingOut)AlertDialog(
        onDismissRequest={signingOut=false},
        title={Text("Sign out of Jobbi Music?")},
        text={Text("You can continue listening to downloaded music offline after reconnecting.")},
        confirmButton={TextButton(onClick={
            signingOut=false
            vm.logout{player.stop()}
        }){Text("Sign out",color=JobbiCoral)}},
        dismissButton={TextButton(onClick={signingOut=false}){Text("Cancel")}}
    )
}
