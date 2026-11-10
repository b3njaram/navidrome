package com.jobbisoft.music.nativeplayer

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

data class NativeCollectionRow(
    val position:Int,
    val title:String,
    val artist:String,
    val album:String,
    val version:String,
    val duration:String,
    val status:String="unsearched",
    val note:String="",
    val songId:String="",
    val peer:String="",
    val filename:String="",
    val size:Long=0L
)
data class NativeCollection(
    val id:String,val name:String,val provider:String,val kind:String,
    val incomplete:Boolean,val expectedCount:Int?,
    val destinationId:String="",
    val songs:List<NativeCollectionRow>
)

fun parseNativeCollections(text:String):List<NativeCollection> {
    require(text.length<=8_000_000){"The collection export is larger than 8 MB"}
    val parsed=JSONObject(text)
    require(parsed.optString("format")=="jobbi-collection-export/v1"){
        "Choose a Jobbi Music combined collection JSON (or use the CSV importer)."
    }
    val collections=parsed.optJSONArray("collections")
        ?:throw IllegalArgumentException("The export has no collections")
    require(collections.length() in 1..150){"An export must contain between 1 and 150 collections"}
    var total=0
    val seen=mutableSetOf<String>()
    return (0 until collections.length()).map { index->
        val c=collections.optJSONObject(index)
            ?:throw IllegalArgumentException("Collection is malformed")
        val id=c.optString("id",index.toString()).take(240)
        val name=c.optString("name").trim()
        val kind=c.optString("kind")
        val provider=c.optString("provider")
        require(seen.add(id)&&name.isNotBlank()&&name.length<=100 &&
            kind in listOf("favorites","playlist") &&
            provider in listOf("spotify","apple")){"Invalid collection metadata"}
        val songs=c.optJSONArray("tracks")
            ?:throw IllegalArgumentException("Missing songs for "+name)
        total+=songs.length()
        require(total<=16000){"This export has more than 16,000 song entries"}
        val rows=(0 until songs.length()).map { pos->
            val entry=songs.optJSONObject(pos)
                ?:throw IllegalArgumentException("Malformed song row")
            val title=entry.optString("title").trim()
            val artist=entry.optString("artist").trim()
            require(title.isNotBlank()&&title.length<=200&&artist.isNotBlank()&&artist.length<=200){
                "A song is missing its title or artist in "+name
            }
            NativeCollectionRow(pos,title,artist,
                entry.optString("album").take(200),
                entry.optString("version").take(100),
                entry.opt("duration")?.toString().orEmpty().take(30))
        }
        NativeCollection(id,name,provider,kind,c.optBoolean("incomplete"),
            c.optInt("expectedCount").takeIf{it>0},songs=rows)
    }
}

fun serializeNativeCollections(collections:List<NativeCollection>):String {
    val collectionsJson=JSONArray()
    collections.forEach { collection->
        val rows=JSONArray()
        collection.songs.forEach{row->
            rows.put(JSONObject().put("position",row.position).put("title",row.title)
                .put("artist",row.artist).put("album",row.album).put("version",row.version)
                .put("duration",row.duration).put("status",row.status).put("note",row.note)
                .put("songId",row.songId).put("peer",row.peer)
                .put("filename",row.filename).put("size",row.size))
        }
        collectionsJson.put(JSONObject().put("id",collection.id)
            .put("name",collection.name).put("kind",collection.kind)
            .put("provider",collection.provider).put("incomplete",collection.incomplete)
            .put("expectedCount",collection.expectedCount)
            .put("destinationId",collection.destinationId).put("tracks",rows))
    }
    return JSONObject().put("format","jobbi-collection-export/v1")
        .put("generatedAt",System.currentTimeMillis())
        .put("collections",collectionsJson).toString(2)
}
fun restoreNativeCollections(text:String):List<NativeCollection> {
    val original=parseNativeCollections(text)
    val collections=JSONObject(text).getJSONArray("collections")
    return original.mapIndexed{index,col->
        val stored=collections.optJSONObject(index)?:return@mapIndexed col
        val rows=stored.optJSONArray("tracks")?:return@mapIndexed col
        col.copy(destinationId=stored.optString("destinationId"),
            songs=col.songs.mapIndexed{n,row->
                val data=rows.optJSONObject(n)
                if(data==null)row else row.copy(
                    status=data.optString("status","unsearched"),
                    note=data.optString("note"),songId=data.optString("songId"),
                    peer=data.optString("peer"),filename=data.optString("filename"),
                    size=data.optLong("size",0)
                )
            })
    }
}
private fun normalized(value:String):String =
    Normalizer.normalize(value,Normalizer.Form.NFKD)
        .replace(Regex("\\p{M}+"),"")
        .lowercase()
        .replace(Regex("[^\\p{L}\\p{N}]+")," ").trim()

private val alteredEditions=Regex("\\b(live|remix|acoustic|karaoke|instrumental|demo|cover version|cover song|bootleg|concert|slowed|sped up|nightcore|reverb|radio edit|extended mix)\\b")
private fun safeCandidate(row:NativeCollectionRow,data:JSONObject):ImportCandidate? {
    val all=data.optJSONArray("results")?:return null
    val title=normalized(row.title),artist=normalized(row.artist)
    if(title.isBlank()||artist.isBlank())return null
    val requested=alteredEditions.findAll(normalized(row.title+" "+row.version))
        .map{it.value}.toSet()
    val candidates=mutableListOf<ImportCandidate>()
    for(i in 0 until all.length()){
        val obj=all.optJSONObject(i)?:continue
        val file=obj.optString("filename"),peer=obj.optString("username")
        val size=obj.optLong("size")
        val ext=file.substringAfterLast('.',missingDelimiterValue="").lowercase()
        if(peer.isBlank()||size<1024||ext !in listOf("flac","mp3"))continue
        val normalizedPath=normalized(file)
        val base=normalized(file.substringAfterLast('/').substringAfterLast('\\')
            .substringBeforeLast('.').replace(Regex("^\\d{1,3}[ ._-]+"),""))
        if(!base.contains(title)||!normalizedPath.contains(artist))continue
        val foundEdition=alteredEditions.findAll(normalizedPath).map{it.value}.toSet()
        if(foundEdition!=requested)continue
        val candidateDuration=obj.optInt("duration")
        val expectedDuration=row.duration.split(':').mapNotNull{it.toIntOrNull()}
        val expected=when(expectedDuration.size){
            2->expectedDuration[0]*60+expectedDuration[1]
            3->expectedDuration[0]*3600+expectedDuration[1]*60+expectedDuration[2]
            else->0
        }
        if(candidateDuration>0&&expected>0&&
            kotlin.math.abs(candidateDuration-expected)>maxOf(9,expected/12))continue
        candidates.add(ImportCandidate(peer,file,size,ext))
    }
    return candidates.sortedWith(compareByDescending<ImportCandidate>{it.format=="flac"}
        .thenByDescending{it.size}).firstOrNull()
}

@Composable
fun NativeCollectionsImportScreen(onBack:()->Unit) {
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val user=JobbiApi.username.lowercase()
    val prefs=remember(user){
        context.getSharedPreferences("jobbi-collection-import-"+user,0)
    }
    val collections=remember(user){mutableStateListOf<NativeCollection>()}
    var selected by remember(user){mutableStateOf("")}
    var busy by remember{mutableStateOf(false)}
    var authorized by remember{mutableStateOf(false)}
    var message by remember{mutableStateOf("")}
    var running by remember{mutableStateOf(false)}
    var stop by remember{mutableStateOf(false)}
    fun save(){
        try{prefs.edit().putString("state",serializeNativeCollections(collections)).apply()}
        catch(e:Exception){message="Progress save failed; use Export report: "+e.message}
    }
    LaunchedEffect(user){
        try {
            val saved=prefs.getString("state",null)
            if(saved!=null){
                collections.clear();collections.addAll(restoreNativeCollections(saved))
                selected=collections.firstOrNull()?.id.orEmpty()
            }
        }catch(e:Exception){message="Could not resume previous import: "+e.message}
    }
    fun editRow(collectionId:String,position:Int,change:(NativeCollectionRow)->NativeCollectionRow){
        val ci=collections.indexOfFirst{it.id==collectionId}
        if(ci<0)return
        val col=collections[ci]
        collections[ci]=col.copy(songs=col.songs.map{if(it.position==position)change(it) else it})
        save()
    }
    suspend fun playlistFor(collectionId:String):String{
        val ci=collections.indexOfFirst{it.id==collectionId}
        if(ci<0)error("Destination collection disappeared")
        val col=collections[ci]
        if(col.destinationId.isNotEmpty())return col.destinationId
        val created=JobbiApi.createPlaylist(col.name)
        require(created.id.isNotBlank()){"Could not create destination playlist"}
        collections[ci]=col.copy(destinationId=created.id)
        save()
        return created.id
    }
    suspend fun applySong(collectionId:String,row:NativeCollectionRow,song:Song){
        val col=collections.first{it.id==collectionId}
        if(col.kind=="favorites")JobbiApi.setFavorite(song.id,true)
        else JobbiApi.editPlaylist(playlistFor(collectionId),
            JSONObject().put("addSongId",song.id))
        editRow(collectionId,row.position){
            it.copy(status=if(col.kind=="favorites")"hearted" else "added",
                songId=song.id,note=if(col.kind=="favorites")
                    "Saved to Jobbi Music Favorites" else "Added to "+col.name)
        }
    }
    suspend fun localSong(row:NativeCollectionRow):Song? =
        JobbiApi.search(row.title).songs.find{
            normalized(it.title)==normalized(row.title)&&
                normalized(it.artist)==normalized(row.artist)
        }
    suspend fun queueSong(collectionId:String,row:NativeCollectionRow,c:ImportCandidate){
        if(!authorized)error("Confirm permission to queue recordings first")
        val result=JobbiApi.post("/api/music-imports",
            JSONObject().put("username",c.username).put("filename",c.filename)
                .put("size",c.size).put("artist",row.artist).put("title",row.title))
        editRow(collectionId,row.position){
            it.copy(status="queued",peer=c.username,filename=c.filename,size=c.size,
                note=if(result.optBoolean("existing"))"Already on NAS; recheck after indexing"
                else "Queued; recheck when Navidrome has indexed the recording")
        }
    }
    suspend fun checkNext(all:Boolean=false,onlyQueued:Boolean=false){
        if(busy)return
        busy=true;running=true;stop=false
        var checked=0,passed=0,failed=0
        try{
            val source=collections.firstOrNull{it.id==selected}?:return
            val pending=source.songs.filter {
                if(onlyQueued)it.status in listOf("queued","failed","review")
                else it.status=="unsearched"
            }.take(if(all)16000 else 3)
            for(row in pending){
                if(stop)break
                editRow(selected,row.position){it.copy(status="checking",note="Searching Navidrome…")}
                try{
                    val local=localSong(row)
                    if(local!=null){
                        applySong(selected,row,local);passed++
                    }else if(onlyQueued){
                        editRow(selected,row.position){it.copy(
                            status=if(row.peer.isNotBlank())"queued" else "review",
                            note="Not indexed yet. Check again after download.")}
                    }else{
                        val response=JobbiApi.post("/api/soulseek/search",
                            JSONObject().put("query",(row.artist+" "+row.title).take(140)))
                        val candidate=safeCandidate(row,response)
                        if(candidate==null)editRow(selected,row.position){
                            it.copy(status="review",note="No reliable studio FLAC or MP3 match.")}
                        else {
                            editRow(selected,row.position){
                                it.copy(status="matched",peer=candidate.username,
                                    filename=candidate.filename,size=candidate.size,
                                    note="Matched "+candidate.format.uppercase()+" · "+
                                        candidate.filename.substringAfterLast('/').take(130))
                            }
                            passed++
                        }
                    }
                }catch(e:Exception){
                    failed++
                    val reason=e.message?:"Search failed"
                    editRow(selected,row.position){it.copy(status="failed",note=reason)}
                    if(reason.contains("limit",true)||reason.contains("429")||
                        reason.contains("Too many",true)){stop=true}
                }
                checked++
            }
            message="Checked "+checked+", completed/matched "+passed+
                ", failed "+failed+(if(stop)" · Paused; resume after limits reset" else "")
        }finally{busy=false;running=false;save()}
    }
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri:Uri?->
        if(uri!=null)scope.launch {
            busy=true
            try{
                val text=withContext(Dispatchers.IO){
                    context.contentResolver.openInputStream(uri)?.use{
                        val bytes=it.readNBytes(8_000_001)
                        require(bytes.size<=8_000_000){"The export exceeds 8 MB"}
                        bytes.toString(Charsets.UTF_8)
                    }?:error("Could not open export")
                }
                collections.clear();collections.addAll(parseNativeCollections(text))
                selected=collections.firstOrNull()?.id.orEmpty()
                save()
                message="Loaded "+collections.size+" collections. Favorites stay separate from playlists."
            }catch(e:Exception){message=e.message?:"Could not read file"}
            finally{busy=false}
        }
    }
    val exporterLink="https://music.jobbisoft.com.mx/tools/jobbi-collection-export.user.js"
    val report=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")){uri:Uri?->
        if(uri!=null)scope.launch(Dispatchers.IO){
            try{
                val output=serializeNativeCollections(collections)
                context.contentResolver.openOutputStream(uri)?.use{
                    it.write(output.toByteArray(Charsets.UTF_8))
                }
            }catch(e:Exception){message=e.message?:"Report could not be saved"}
        }
    }
    val active=collections.firstOrNull{it.id==selected}
    val counts=active?.songs?.groupingBy{it.status}?.eachCount().orEmpty()
    Column(Modifier.fillMaxSize().padding(horizontal=16.dp)){
        Row(verticalAlignment=Alignment.CenterVertically){
            IconButton(onClick=onBack){Icon(Icons.Rounded.ArrowBack,"Back")}
            Text("Import collections",style=MaterialTheme.typography.headlineSmall,
                fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
        }
        if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(contentPadding=PaddingValues(bottom=30.dp),
            verticalArrangement=Arrangement.spacedBy(13.dp)){
            item{
                ElevatedCard(shape=RoundedCornerShape(23.dp)){
                    Column(Modifier.padding(17.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){
                        Text("Spotify & Apple Music",style=MaterialTheme.typography.titleLarge,
                            fontWeight=FontWeight.Bold)
                        Text("Export multiple playlists and Liked Songs on your desktop browser, "+
                            "then import the single JSON file here. Favorites become hearts.")
                        FilledTonalButton(onClick={
                            try{context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(exporterLink)))}
                            catch(e:Exception){message="Open "+exporterLink+" in a browser"}
                        }){Icon(Icons.Rounded.OpenInNew,null);Text("Get free browser exporter")}
                        Button(onClick={picker.launch(arrayOf("application/json","text/plain","*/*"))},
                            enabled=!busy){Icon(Icons.Rounded.FileOpen,null);Text("Choose collection JSON")}
                        Row(verticalAlignment=Alignment.CenterVertically){
                            Checkbox(authorized,{authorized=it})
                            Text("I have permission to obtain any recordings I queue",
                                style=MaterialTheme.typography.bodySmall)
                        }
                        Text("No provider passwords are collected. Searches and NAS downloads "+
                            "use your existing quota-limited Jobbi Music account.",
                            style=MaterialTheme.typography.labelSmall,
                            color=MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if(message.isNotEmpty())item{
                Text(message,color=MaterialTheme.colorScheme.primary,
                    style=MaterialTheme.typography.bodySmall)
            }
            if(collections.isNotEmpty()){
                item{
                    Text("Select a collection",fontWeight=FontWeight.Bold,
                        style=MaterialTheme.typography.titleLarge)
                    Column(verticalArrangement=Arrangement.spacedBy(7.dp)){
                        collections.forEach{col->
                            val done=col.songs.count{it.status in listOf("added","hearted")}
                            FilterChip(selected=col.id==selected,onClick={selected=col.id},
                                label={Text((if(col.kind=="favorites")"♥ " else "♫ ")+
                                    col.name+" · "+done+"/"+col.songs.size)},
                                leadingIcon={Icon(if(col.kind=="favorites")
                                    Icons.Rounded.Favorite else Icons.Rounded.LibraryMusic,null)})
                        }
                    }
                }
                item{
                    Text(active?.name.orEmpty(),style=MaterialTheme.typography.titleLarge,
                        fontWeight=FontWeight.Bold)
                    Text(if(active?.kind=="favorites")
                        "This collection goes to your Favorite songs, not a playlist."
                        else "This collection becomes a separate Navidrome playlist.",
                        style=MaterialTheme.typography.bodySmall)
                    if(active?.incomplete==true)Text(
                        "The browser export reported an incomplete playlist; verify the source song count.",
                        color=MaterialTheme.colorScheme.error,
                        style=MaterialTheme.typography.bodySmall)
                    Text((counts["added"]?:0).toString()+" added · "+
                        (counts["hearted"]?:0)+" hearted · "+
                        (counts["queued"]?:0)+" queued · "+
                        (counts["matched"]?:0)+" matched · "+
                        (counts["review"]?:0)+" review · "+
                        (counts["failed"]?:0)+" failed",
                        style=MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                        Button(onClick={scope.launch{checkNext()}},enabled=!busy&&
                            (counts["unsearched"]?:0)>0){
                            Icon(Icons.Rounded.Search,null);Text("Check next 3")
                        }
                        FilledTonalButton(onClick={scope.launch{checkNext(true)}},
                            enabled=!busy&&(counts["unsearched"]?:0)>0){
                            Icon(Icons.Rounded.PlayArrow,null);Text("Scan remaining")
                        }
                    }
                    Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                        FilledTonalButton(onClick={scope.launch{checkNext(false,true)}},
                            enabled=!busy){
                            Icon(Icons.Rounded.Refresh,null);Text("Recheck downloads")
                        }
                        OutlinedButton(onClick={stop=true},enabled=busy){
                            Icon(Icons.Rounded.Pause,null);Text("Stop")
                        }
                    }
                    Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                        OutlinedButton(onClick={report.launch("jobbi-migration-report.json")},
                            enabled=!busy){
                            Icon(Icons.Rounded.Download,null);Text("Save report")
                        }
                        OutlinedButton(onClick={collections.clear();selected="";prefs.edit().remove("state").apply()},
                            enabled=!busy){
                            Icon(Icons.Rounded.DeleteOutline,null);Text("Clear local progress")
                        }
                    }
                }
                itemsIndexed(active?.songs?.take(500)?:emptyList()){_,row->
                    ElevatedCard(shape=RoundedCornerShape(17.dp)){
                        Column(Modifier.padding(13.dp),
                            verticalArrangement=Arrangement.spacedBy(7.dp)){
                            Text(row.title,fontWeight=FontWeight.SemiBold,maxLines=2)
                            Text(row.artist,style=MaterialTheme.typography.bodySmall,
                                color=MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(row.status+": "+row.note,style=MaterialTheme.typography.labelSmall,
                                color=MaterialTheme.colorScheme.onSurfaceVariant)
                            if(row.status=="matched"&&row.peer.isNotBlank()){
                                Button(onClick={scope.launch{
                                    busy=true
                                    try{
                                        queueSong(selected,row,ImportCandidate(row.peer,row.filename,
                                            row.size,row.filename.substringAfterLast('.')))
                                        message="Queued "+row.title+" for NAS download."
                                    }catch(e:Exception){message=e.message?:"Queue failed"}
                                    finally{busy=false}
                                }},enabled=!busy&&authorized){
                                    Icon(Icons.Rounded.CloudDownload,null)
                                    Text("Queue "+row.filename.substringAfterLast('.').uppercase())
                                }
                            }
                        }
                    }
                }
                if((active?.songs?.size?:0)>500)item{
                    Text("Showing the first 500 entries. Full status is included in Save report.",
                        style=MaterialTheme.typography.bodySmall)
                }
            }else item{
                Text("Choose a combined exporter JSON to begin.",
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
