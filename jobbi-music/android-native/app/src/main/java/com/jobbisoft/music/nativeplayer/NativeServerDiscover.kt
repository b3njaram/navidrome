package com.jobbisoft.music.nativeplayer

import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject

data class ServerCandidate(
    val username:String,val filename:String,val size:Long,
    val bitrate:Int?,val format:String,val freeSlot:Boolean
) {
    val suggestedTitle:String get() =
        filename.substringAfterLast('/').substringAfterLast('\\')
            .substringBeforeLast('.').replace(Regex("^\\d{1,3}[ ._-]+"),"").take(180)
    val suggestedArtist:String get() {
        val parts=filename.split('/', '\\')
        val title=suggestedTitle
        if(title.contains(" - "))return title.substringBefore(" - ").trim().take(180)
        return parts.getOrNull(parts.size-2)?.trim().orEmpty().take(180)
    }
}

fun parseServerCandidates(data:JSONObject):List<ServerCandidate>{
    val results=data.optJSONArray("results") ?: return emptyList()
    return (0 until results.length()).mapNotNull{i->
        val row=results.optJSONObject(i)?:return@mapNotNull null
        val peer=row.optString("username"),file=row.optString("filename")
        val size=row.optLong("size")
        if(peer.isBlank()||file.isBlank()||size<1024)return@mapNotNull null
        val format=row.optString("format").ifBlank{file.substringAfterLast('.')}.uppercase()
        if(format !in setOf("FLAC","MP3","M4A","AAC","OGG","OPUS","WAV","AIFF","ALAC"))return@mapNotNull null
        ServerCandidate(peer,file,size,
            row.optInt("bitrate").takeIf{it>0},format,row.optBoolean("freeUploadSlot"))
    }.sortedWith(compareByDescending<ServerCandidate>{it.format=="FLAC"}
        .thenByDescending{it.freeSlot}.thenByDescending{it.bitrate?:0}).take(180)
}

@Composable
fun ServerDiscoverScreen(onBack:()->Unit){
    val scope=rememberCoroutineScope()
    var query by remember{mutableStateOf("")}
    var results by remember{mutableStateOf<List<ServerCandidate>>(emptyList())}
    var sourceMessage by remember{mutableStateOf("")}
    var busy by remember{mutableStateOf(false)}
    var error by remember{mutableStateOf("")}
    var selected by remember{mutableStateOf<ServerCandidate?>(null)}
    var history by remember{mutableStateOf<List<JSONObject>>(emptyList())}

    fun refreshHistory(){
        scope.launch{
            try{
                val items=JobbiApi.getObject("/api/music-imports").optJSONArray("items")
                history=items?.let{a->(0 until a.length()).mapNotNull(a::optJSONObject)} ?: emptyList()
            }catch(e:Exception){error=e.message?:"Cannot load import history"}
        }
    }
    LaunchedEffect(Unit){
        refreshHistory()
        try{
            val status=JobbiApi.getObject("/api/soulseek/status")
            sourceMessage=status.optString("message").ifBlank{
                if(status.optBoolean("serverConnected",false))"Soulseek connected"
                else "Soulseek server status not confirmed"
            }
        }catch(e:Exception){sourceMessage="Peer status unavailable"}
    }
    Column(Modifier.fillMaxSize()){
        Row(Modifier.fillMaxWidth().padding(horizontal=15.dp,vertical=6.dp),
            verticalAlignment=Alignment.CenterVertically){
            IconButton(onClick=onBack){Icon(Icons.Rounded.ArrowBack,"Back")}
            Column(Modifier.weight(1f)){
                Text("Find new music",style=MaterialTheme.typography.headlineSmall,
                    fontWeight=FontWeight.Bold)
                Text("Search Soulseek · import to your private NAS library",
                    style=MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick=::refreshHistory){Icon(Icons.Rounded.Refresh,"Refresh import history")}
        }
        if(sourceMessage.isNotBlank())Text(sourceMessage,
            Modifier.padding(horizontal=19.dp,vertical=4.dp),
            style=MaterialTheme.typography.bodySmall,
            color=MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=6.dp),
            verticalAlignment=Alignment.CenterVertically){
            OutlinedTextField(query,{query=it.take(150)},singleLine=true,
                label={Text("Artist and song title")},
                leadingIcon={Icon(Icons.Rounded.Search,null)},modifier=Modifier.weight(1f),
                shape=RoundedCornerShape(24.dp))
            Spacer(Modifier.width(8.dp))
            FilledIconButton(onClick={
                scope.launch{
                    busy=true;error="";results=emptyList()
                    try {
                        val response=JobbiApi.post("/api/soulseek/search",
                            JSONObject().put("query",query.trim()))
                        results=parseServerCandidates(response)
                        sourceMessage=response.optString("message").ifBlank{
                            "${results.size} recordings found. FLAC shown first."
                        }
                    }catch(e:Exception){error=e.message?:"Search unavailable"}
                    finally{busy=false}
                }
            },enabled=query.trim().length>=2&&!busy,modifier=Modifier.size(50.dp)){
                Icon(Icons.Rounded.Search,"Search Soulseek")
            }
        }
        if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
        if(error.isNotBlank())Text(error,Modifier.padding(16.dp),
            color=MaterialTheme.colorScheme.error)
        LazyColumn(contentPadding=PaddingValues(horizontal=16.dp,vertical=10.dp),
            verticalArrangement=Arrangement.spacedBy(9.dp)){
            if(results.isEmpty()){
                item{
                    ElevatedCard(Modifier.fillMaxWidth(),shape=RoundedCornerShape(20.dp)){
                        Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
                            Text("Download music directly to your NAS",
                                style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
                            Text("Search above, inspect the filename and quality, then explicitly queue each recording. Imported songs appear after Navidrome indexes them.")
                        }
                    }
                }
            }
            items(results,key={it.username+"|"+it.filename}){item->
                ElevatedCard(Modifier.fillMaxWidth().clickable{selected=item},
                    shape=RoundedCornerShape(18.dp)){
                    Row(Modifier.padding(13.dp),verticalAlignment=Alignment.CenterVertically){
                        Surface(color=MaterialTheme.colorScheme.secondaryContainer,
                            shape=RoundedCornerShape(14.dp)){
                            Icon(Icons.Rounded.MusicNote,null,Modifier.padding(12.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)){
                            Text(item.suggestedTitle,
                                fontWeight=FontWeight.SemiBold,maxLines=2,
                                overflow=TextOverflow.Ellipsis)
                            Text("@${item.username} · ${item.format} · ${item.bitrate?.let{"$it kbps"}?:"unknown bitrate"}",
                                style=MaterialTheme.typography.bodySmall,
                                color=MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(item.filename,style=MaterialTheme.typography.labelSmall,
                                maxLines=1,overflow=TextOverflow.Ellipsis)
                        }
                        Icon(Icons.Rounded.Download,"Choose this recording")
                    }
                }
            }
            item{
                Spacer(Modifier.height(12.dp))
                Text("Recent imports",style=MaterialTheme.typography.titleLarge,
                    fontWeight=FontWeight.Bold)
            }
            if(history.isEmpty())item{Text("No imports found yet.",
                color=MaterialTheme.colorScheme.onSurfaceVariant)}
            items(history,key={it.optString("id",it.toString())}){entry->
                val song=entry.optString("title").ifBlank{entry.optString("label")}
                val stage=entry.optString("stage",entry.optString("status","Unknown"))
                ListItem(
                    headlineContent={Text(song.ifBlank{"Music import"})},
                    supportingContent={Text(stage+" · "+entry.optString("artist"))},
                    leadingContent={Icon(if(stage=="available")Icons.Rounded.CheckCircle
                        else Icons.Rounded.CloudDownload,null)}
                )
            }
        }
    }
    selected?.let{candidate->
        var title by remember(candidate.filename){mutableStateOf(candidate.suggestedTitle.substringAfter(" - ",candidate.suggestedTitle))}
        var artist by remember(candidate.filename){mutableStateOf(candidate.suggestedArtist)}
        var approved by remember(candidate.filename){mutableStateOf(false)}
        AlertDialog(onDismissRequest={if(!busy)selected=null},
            title={Text("Import ${candidate.format} recording")},
            text={
                Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Text(candidate.filename,style=MaterialTheme.typography.bodySmall,
                        maxLines=3,overflow=TextOverflow.Ellipsis)
                    OutlinedTextField(title,{title=it.take(180)},singleLine=true,
                        label={Text("Correct song title")})
                    OutlinedTextField(artist,{artist=it.take(180)},singleLine=true,
                        label={Text("Correct artist")})
                    Row(verticalAlignment=Alignment.CenterVertically){
                        Checkbox(approved,{approved=it})
                        Text("I have permission to obtain this recording.",
                            style=MaterialTheme.typography.bodySmall)
                    }
                    Text("This imports to the NAS, not directly to your phone. Daily limits and duplicate checks still apply.",
                        style=MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton={Button(enabled=approved&&title.trim().isNotEmpty()&&
                artist.trim().isNotEmpty()&&!busy,onClick={
                scope.launch{
                    busy=true;error=""
                    try{
                        val response=JobbiApi.post("/api/music-imports",JSONObject()
                            .put("username",candidate.username).put("filename",candidate.filename)
                            .put("size",candidate.size).put("artist",artist.trim())
                            .put("title",title.trim()))
                        sourceMessage=response.optString("message").ifBlank{"Import queued"}
                        selected=null
                        refreshHistory()
                    }catch(e:Exception){error=e.message?:"Import rejected"}
                    finally{busy=false}
                }
            }){Text("Queue on NAS")}},
            dismissButton={TextButton(onClick={selected=null},enabled=!busy){Text("Cancel")}}
        )
    }
}
