package com.jobbisoft.music.nativeplayer

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private fun JSONArray?.objects():List<JSONObject> =
    this?.let{ array->(0 until array.length()).mapNotNull(array::optJSONObject) } ?: emptyList()
private fun JSONObject.str(key:String):String = optString(key,"").takeUnless{it=="null"} ?: ""
private fun JSONObject.titleName():String = str("display_name").ifBlank{str("username")}

@Composable
private fun SocialAvatar(user:JSONObject,modifier:Modifier=Modifier,revision:Int=0) {
    val context=LocalContext.current
    val name=user.str("username")
    val loader=remember { ImageLoader.Builder(context).okHttpClient(JobbiApi.client).build() }
    Surface(modifier=modifier.size(45.dp),shape=CircleShape,
        color=MaterialTheme.colorScheme.secondaryContainer) {
        Box(contentAlignment=Alignment.Center) {
            Icon(Icons.Rounded.Person,null,Modifier.size(23.dp))
            if(user.optBoolean("has_avatar")&&name.isNotBlank()){
                AsyncImage(model=ImageRequest.Builder(context)
                    .data(JobbiApi.authenticatedUrl("/api/social/profiles/"+Uri.encode(name)+"/avatar")+"?v="+revision)
                    .crossfade(true).build(),imageLoader=loader,contentDescription="Profile picture",
                    contentScale=ContentScale.Crop,modifier=Modifier.fillMaxSize())
            }
        }
    }
}

@Composable
private fun SocialCard(title:String,subtitle:String?=null,content:@Composable ColumnScope.()->Unit){
    ElevatedCard(modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(22.dp)){
        Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){
            Text(title,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold)
            if(subtitle!=null)Text(subtitle,style=MaterialTheme.typography.bodySmall,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            content()
        }
    }
}

@Composable
fun CommunityScreen(vm:MusicViewModel,player:NativePlayer,onDiscoverMusic:()->Unit){
    val scope=rememberCoroutineScope()
    var home by remember{mutableStateOf<JSONObject?>(null)}
    var people by remember{mutableStateOf<List<JSONObject>>(emptyList())}
    var query by remember{mutableStateOf("")}
    var tab by remember{mutableStateOf("Discover")}
    var profileTarget by remember{mutableStateOf<String?>(null)}
    var openPlaylist by remember{mutableStateOf<JSONObject?>(null)}
    var playlistTitle by remember{mutableStateOf("")}
    var createPlaylist by remember{mutableStateOf(false)}
    var inviteName by remember{mutableStateOf("")}
    var issue by remember{mutableStateOf("")}
    var busy by remember{mutableStateOf(false)}

    fun refresh(){
        scope.launch{
            busy=true
            try {home=JobbiApi.getObject("/api/social/home"); issue=""}
            catch(e:Exception){issue=e.message?:"Community service unavailable"}
            finally{busy=false}
        }
    }
    fun mutate(action:suspend()->Unit){
        scope.launch{
            busy=true
            try{action();refresh();issue=""}
            catch(e:Exception){issue=e.message?:"Action unsuccessful"}
            finally{busy=false}
        }
    }
    LaunchedEffect(vm.account){refresh()}
    if(profileTarget!=null){
        Column(Modifier.fillMaxSize()){
            TextButton(onClick={profileTarget=null}){Icon(Icons.Rounded.ArrowBack,null);Text("Community")}
            ProfileScreen(vm,targetUser=profileTarget!!,onUpdated={refresh()})
        }
        return
    }
    if(openPlaylist!=null){
        val pl=openPlaylist!!
        val id=pl.str("id")
        var details by remember(id){mutableStateOf<JSONObject?>(null)}
        LaunchedEffect(id){
            try{details=JobbiApi.getObject("/api/social/playlists/"+Uri.encode(id))}
            catch(e:Exception){issue=e.message ?: "Could not open playlist"}
        }
        val songs=details?.optJSONArray("tracks").objects().mapNotNull{track->
            track.str("track_id").takeIf(String::isNotBlank)?.let{trackId->
                Song(trackId,track.str("title"),track.str("artist"),track.str("album"),
                    track.str("coverArt").ifBlank{null},track.optLong("duration"))
            }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal=18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
            TextButton(onClick={openPlaylist=null}){Icon(Icons.Rounded.ArrowBack,null);Text("Community")}
            Text(pl.str("title"),style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
            Text("Shared playlist · ${pl.str("visibility")}",
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            if(songs.isNotEmpty()){
                Button(onClick={player.play(songs)}){Icon(Icons.Rounded.PlayArrow,null);Text("Play all")}
                songs.forEachIndexed{index,song->
                    ListItem(headlineContent={Text(song.title,maxLines=1)},
                        supportingContent={Text(song.artist)},
                        leadingContent={Icon(Icons.Rounded.MusicNote,null)},
                        modifier=Modifier.clickable{player.play(songs,index)})
                }
            }else Text("No songs added yet.")
            val owner=details?.optJSONObject("playlist")?.str("owner")
            if(owner==vm.account.lowercase()){
                SocialCard("Invite a collaborator","They must accept before your private playlist becomes visible."){
                    OutlinedTextField(inviteName,{inviteName=it},label={Text("Username")},
                        singleLine=true,modifier=Modifier.fillMaxWidth())
                    Button(onClick={mutate{
                        JobbiApi.post("/api/social/playlists/"+Uri.encode(id)+"/invitations",
                            JSONObject().put("username",inviteName.trim()).put("canEdit",true))
                        inviteName=""
                    }},enabled=inviteName.isNotBlank()){Text("Send invitation")}
                }
            }
        }
        return
    }
    Column(Modifier.fillMaxSize()){
        if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
        if(issue.isNotBlank())Text(issue,Modifier.padding(14.dp),
            color=MaterialTheme.colorScheme.error)
        ScrollableTabRow(selectedTabIndex=listOf("Discover","Friends","Playlists","Me").indexOf(tab),
            edgePadding=8.dp){
            listOf("Discover","Friends","Playlists","Me").forEach{name->
                Tab(selected=tab==name,onClick={tab=name},text={Text(name)})
            }
        }
        LazyColumn(contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
            if(tab=="Discover"){
                item {
                    SocialCard("Your community","Share playlists and discover listeners—not your private library."){
                        Button(onClick=onDiscoverMusic){
                            Icon(Icons.Rounded.TravelExplore,null)
                            Spacer(Modifier.width(8.dp));Text("Find music on server")
                        }
                    }
                }
                item {
                    SocialCard("Find people"){
                        Row(verticalAlignment=Alignment.CenterVertically){
                            OutlinedTextField(query,{query=it},label={Text("Username or display name")},
                                singleLine=true,modifier=Modifier.weight(1f))
                            IconButton(onClick={
                                scope.launch {
                                    try{people=JobbiApi.getObject("/api/social/people?q="+Uri.encode(query.trim()))
                                        .optJSONArray("users").objects();issue=""}
                                    catch(e:Exception){issue=e.message?:"Search failed"}
                                }
                            },enabled=query.trim().length>=2){Icon(Icons.Rounded.Search,"Find people")}
                        }
                        people.forEach{person->
                            Row(Modifier.fillMaxWidth().clickable{profileTarget=person.str("username")}
                                .padding(vertical=6.dp),verticalAlignment=Alignment.CenterVertically){
                                SocialAvatar(person)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)){
                                    Text(person.titleName(),fontWeight=FontWeight.Medium)
                                    Text("@"+person.str("username"),style=MaterialTheme.typography.bodySmall)
                                }
                                Icon(Icons.Rounded.ChevronRight,null)
                            }
                        }
                    }
                }
                item {
                    SocialCard("Public collaborative playlists"){
                        val public=home?.optJSONArray("discover").objects()
                        if(public.isEmpty())Text("No public playlists yet.")
                        public.forEach{p->
                            ListItem(
                                headlineContent={Text(p.str("title"))},
                                supportingContent={Text("By @"+p.str("owner")+" · "+p.optInt("song_count")+" songs")},
                                leadingContent={Icon(Icons.Rounded.Groups,null)},
                                modifier=Modifier.clickable{openPlaylist=p}
                            )
                        }
                    }
                }
            }
            if(tab=="Friends"){
                val incoming=home?.optJSONArray("incoming").objects()
                val invitations=home?.optJSONArray("playlistInvitations").objects()
                item {
                    SocialCard("Friend requests"){
                        if(incoming.isEmpty())Text("No pending friend requests.")
                        incoming.forEach{person->
                            Text(person.titleName(),fontWeight=FontWeight.Medium)
                            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                Button(onClick={mutate{
                                    JobbiApi.post("/api/social/friends/"+Uri.encode(person.str("username"))+"/respond",
                                        JSONObject().put("accept",true))
                                }}){Text("Accept")}
                                OutlinedButton(onClick={mutate{
                                    JobbiApi.post("/api/social/friends/"+Uri.encode(person.str("username"))+"/respond",
                                        JSONObject().put("accept",false))
                                }}){Text("Decline")}
                            }
                        }
                    }
                }
                item {
                    SocialCard("Playlist invitations"){
                        if(invitations.isEmpty())Text("No pending invitations.")
                        invitations.forEach{inv->
                            Text(inv.str("title")+" · from @"+inv.str("sender"))
                            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                Button(onClick={mutate{JobbiApi.post(
                                    "/api/social/invitations/"+Uri.encode(inv.str("id"))+"/respond",
                                    JSONObject().put("accept",true))}}){Text("Join")}
                                OutlinedButton(onClick={mutate{JobbiApi.post(
                                    "/api/social/invitations/"+Uri.encode(inv.str("id"))+"/respond",
                                    JSONObject().put("accept",false))}}){Text("Decline")}
                            }
                        }
                    }
                }
                item {
                    SocialCard("Your friends"){
                        val friends=home?.optJSONArray("friends").objects()
                        if(friends.isEmpty())Text("Search for people in Discover to add friends.")
                        friends.forEach{person->
                            Row(Modifier.fillMaxWidth().clickable{profileTarget=person.str("username")}
                                .padding(5.dp),verticalAlignment=Alignment.CenterVertically){
                                SocialAvatar(person)
                                Spacer(Modifier.width(10.dp))
                                Text(person.titleName(),Modifier.weight(1f))
                                Icon(Icons.Rounded.ChevronRight,null)
                            }
                        }
                    }
                }
            }
            if(tab=="Playlists"){
                item{
                    SocialCard("Create a shared playlist"){
                        OutlinedTextField(playlistTitle,{playlistTitle=it},singleLine=true,
                            label={Text("Playlist name")},modifier=Modifier.fillMaxWidth())
                        Button(enabled=playlistTitle.trim().isNotBlank(),onClick={mutate{
                            JobbiApi.post("/api/social/playlists",JSONObject()
                                .put("title",playlistTitle.trim()).put("visibility","private"))
                            playlistTitle=""
                        }}){Icon(Icons.Rounded.Add,null);Text("Create privately")}
                    }
                }
                item{
                    SocialCard("Collaborative playlists"){
                        val playlists=home?.optJSONArray("playlists").objects()
                        if(playlists.isEmpty())Text("Create one above or accept an invitation.")
                        playlists.forEach{p->
                            ListItem(
                                headlineContent={Text(p.str("title"))},
                                supportingContent={Text(p.str("visibility")+" · "+p.optInt("song_count")+" tracks")},
                                leadingContent={Icon(Icons.Rounded.QueueMusic,null)},
                                trailingContent={Icon(Icons.Rounded.ChevronRight,null)},
                                modifier=Modifier.clickable{openPlaylist=p}
                            )
                        }
                    }
                }
            }
            if(tab=="Me"){
                item{
                    SocialCard("My Jobbi profile"){
                        home?.optJSONObject("me")?.let{person->
                            Row(verticalAlignment=Alignment.CenterVertically){
                                SocialAvatar(person,Modifier.size(60.dp))
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)){
                                    Text(person.titleName(),style=MaterialTheme.typography.titleLarge,
                                        fontWeight=FontWeight.Bold)
                                    Text("@"+person.str("username"))
                                }
                            }
                        }
                        Button(onClick={profileTarget=vm.account}) {
                            Icon(Icons.Rounded.Edit,null);Text("Edit my profile")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ProfileScreen(vm:MusicViewModel,targetUser:String=vm.account,onUpdated:()->Unit={}){
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val mine=targetUser.equals(vm.account,ignoreCase=true)
    var data by remember(targetUser){mutableStateOf<JSONObject?>(null)}
    var name by remember(targetUser){mutableStateOf("")}
    var bio by remember(targetUser){mutableStateOf("")}
    var discoverable by remember(targetUser){mutableStateOf(true)}
    var error by remember{mutableStateOf("")}
    var busy by remember{mutableStateOf(false)}
    var avatarVersion by remember{mutableIntStateOf(0)}
    fun reload(){
        scope.launch{
            try {
                data=JobbiApi.getObject("/api/social/profiles/"+Uri.encode(targetUser))
                val p=data?.optJSONObject("profile")
                if(mine&&p!=null){
                    name=p.str("display_name");bio=p.str("bio")
                    discoverable=p.optBoolean("discoverable",true)
                }
                error=""
            }catch(e:Exception){error=e.message?:"Profile unavailable"}
        }
    }
    LaunchedEffect(targetUser){reload()}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->
        if(uri!=null)scope.launch{
            busy=true
            error=""
            try{
                val image=JobbiImageUpload.prepare(context,uri)
                JobbiApi.uploadAvatar(image.bytes,image.mime)
                avatarVersion++
                reload()
                onUpdated()
            }catch(e:Exception){
                error="Profile picture wasn't uploaded: "+(e.message?:"Please try again.")
            }finally{busy=false}
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement=Arrangement.spacedBy(15.dp)){
        Text(if(mine)"My profile" else "@$targetUser",
            style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold)
        data?.optJSONObject("profile")?.let{user->
            Row(verticalAlignment=Alignment.CenterVertically){
                key(avatarVersion){SocialAvatar(user,Modifier.size(80.dp),revision=avatarVersion)}
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(user.titleName(),style=MaterialTheme.typography.titleLarge)
                    Text("@"+user.str("username"),
                        style=MaterialTheme.typography.bodySmall)
                    Text(user.str("bio"),style=MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if(!mine&&data!=null){
            Button(onClick={scope.launch{
                try {
                    JobbiApi.post("/api/social/friends/request",JSONObject().put("username",targetUser))
                    error="Friend request sent."
                }catch(e:Exception){error=e.message?:"Unable to send request"}
            }}){Icon(Icons.Rounded.PersonAdd,null);Text("Send friend request")}
        }
        if(mine){
            ElevatedCard {
                Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                    Text("Profile settings",style=MaterialTheme.typography.titleMedium,
                        fontWeight=FontWeight.Bold)
                    OutlinedTextField(name,{name=it.take(80)},label={Text("Display name")},
                        singleLine=true,modifier=Modifier.fillMaxWidth())
                    OutlinedTextField(bio,{bio=it.take(300)},label={Text("About you")},
                        modifier=Modifier.fillMaxWidth(),minLines=3,maxLines=5)
                    Row(verticalAlignment=Alignment.CenterVertically){
                        Switch(discoverable,{discoverable=it})
                        Spacer(Modifier.width(10.dp))
                        Text("Let other listeners find me")
                    }
                    FilledTonalButton(onClick={picker.launch("image/*")},enabled=!busy){
                        Icon(Icons.Rounded.PhotoCamera,null)
                        Text(if(busy)"Uploading…" else "Change profile picture")
                    }
                    Text("Camera photos, HEIC, PNG and WebP are resized to fit the server's 1 MB limit.",
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick={scope.launch{
                        busy=true
                        try{
                            JobbiApi.patch("/api/social/me",JSONObject()
                                .put("displayName",name.trim())
                                .put("bio",bio)
                                .put("discoverable",discoverable))
                            reload();onUpdated()
                        }catch(e:Exception){error=e.message?:"Could not save profile"}
                        finally{busy=false}
                    }},enabled=!busy&&name.trim().isNotEmpty()){
                        Icon(Icons.Rounded.Save,null);Text("Save profile")
                    }
                }
            }
        }
        if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.primary)
    }
}
