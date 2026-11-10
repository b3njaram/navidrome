package com.jobbisoft.music.nativeplayer

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import java.net.URI

/**
 * Invidious is a second music-discovery source, not a proxy for arbitrary URLs.
 * The server performs instance failover and checks the optional NAS audio worker.
 * This native client only uses authenticated Jobbi API routes and opens video
 * results with Android ACTION_VIEW (never an embedded WebView).
 */
data class InvidiousVideo(
    val videoId:String,
    val title:String,
    val artist:String,
    val durationSeconds:Long,
    val watchUrl:String
)

private val VIDEO_ID_PATTERN=Regex("^[A-Za-z0-9_-]{11}$")

private fun verifiedWatchUrl(raw:String,id:String):Boolean {
    return try {
        val url=URI(raw)
        url.scheme.equals("https",ignoreCase=true) &&
            !url.host.isNullOrBlank() &&
            url.userInfo==null && url.path=="/watch" &&
            url.rawQuery.orEmpty().split('&').any{it=="v=$id"}
    } catch (_:Exception) {false}
}

/** Strict parsing for untrusted remote video metadata. */
fun parseInvidiousVideos(payload:JSONObject):List<InvidiousVideo> {
    val rows=payload.optJSONArray("results")?:return emptyList()
    val seen=mutableSetOf<String>()
    val output=mutableListOf<InvidiousVideo>()
    for(i in 0 until minOf(rows.length(),80)){
        val row=rows.optJSONObject(i)?:continue
        val id=row.optString("videoId")
        if(!VIDEO_ID_PATTERN.matches(id))continue
        val url=row.optString("url")
        if(!verifiedWatchUrl(url,id)||!seen.add(id))continue
        output.add(InvidiousVideo(
            videoId=id,
            title=row.optString("title","Untitled recording").take(200),
            artist=row.optString("artist","Unknown channel").take(120),
            durationSeconds=row.optLong("duration",0L).coerceIn(0,10800),
            watchUrl=url
        ))
        if(output.size>=30)break
    }
    return output
}

class InvidiousUiState {
    var results by mutableStateOf<List<InvidiousVideo>>(emptyList())
        private set
    var searching by mutableStateOf(false)
        private set
    var searched by mutableStateOf(false)
        private set
    var message by mutableStateOf("")
        private set
    var instance by mutableStateOf("")
        private set
    var importEnabled by mutableStateOf(false)
        private set
    var workerMessage by mutableStateOf("")
        private set
    var jobs by mutableStateOf<List<JSONObject>>(emptyList())
        private set

    suspend fun loadStatus() {
        try {
            val reply=JobbiApi.getObject("/api/invidious/status")
            importEnabled=reply.optBoolean("importEnabled",false)
            workerMessage=reply.optString("message","")
        } catch(e:Exception) {
            importEnabled=false
            workerMessage="Unable to check alternate-source imports: "+(e.message?:"unknown error")
        }
    }
    suspend fun refreshJobs() {
        try {
            val arr=JobbiApi.getObject("/api/invidious/jobs").optJSONArray("jobs")
            jobs=arr?.let{(0 until minOf(it.length(),80)).mapNotNull(it::optJSONObject)}
                ?:emptyList()
        } catch(_:Exception) {
            // Worker is optional: absence of jobs must not break discovery.
            jobs=emptyList()
        }
    }
    suspend fun search(query:String) {
        searching=true
        searched=true
        results=emptyList()
        message=""
        instance=""
        try {
            val reply=JobbiApi.getObject("/api/invidious/search?q="+Uri.encode(query.trim().take(150)))
            results=parseInvidiousVideos(reply)
            instance=reply.optString("instance","")
            message=reply.optString("message","")
                .ifBlank{if(results.isEmpty())"No alternate-source results." else "Invidious results loaded."}
        } catch(e:Exception) {
            message="Invidious unavailable: "+(e.message?:"Unknown error")
        } finally {searching=false}
    }
    suspend fun queue(video:InvidiousVideo,title:String,artist:String):JSONObject {
        if(!importEnabled)throw IllegalStateException("The optional Invidious import worker is not enabled on your NAS")
        val result=JobbiApi.post("/api/invidious/import",
            JSONObject().put("videoId",video.videoId)
                .put("title",title.trim().take(200))
                .put("artist",artist.trim().take(140))
                .put("authorized",true))
        refreshJobs()
        return result
    }
}

private fun length(seconds:Long):String {
    val safe=seconds.coerceAtLeast(0)
    return if(safe>=3600)"${safe/3600}:${((safe/60)%60).toString().padStart(2,'0')}:${(safe%60).toString().padStart(2,'0')}"
    else "${safe/60}:${(safe%60).toString().padStart(2,'0')}"
}

@Composable
fun NativeInvidiousResults(state:InvidiousUiState) {
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val imageLoader=remember {ImageLoader.Builder(context.applicationContext)
        .okHttpClient(JobbiApi.client).build()}
    var showAll by remember {mutableStateOf(false)}
    var selected by remember {mutableStateOf<InvidiousVideo?>(null)}
    var requestBusy by remember {mutableStateOf(false)}
    var feedback by remember {mutableStateOf("")}
    fun openVideo(video:InvidiousVideo){
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(video.watchUrl))
                .addCategory(Intent.CATEGORY_BROWSABLE))
        } catch(e:Exception) {
            feedback="Cannot open Invidious: "+(e.message?:"No browser available")
        }
    }
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
        HorizontalDivider()
        Row(verticalAlignment=Alignment.CenterVertically,modifier=Modifier.fillMaxWidth()) {
            Icon(Icons.Rounded.TravelExplore,null,
                tint=MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Invidious fallback",style=MaterialTheme.typography.titleLarge,
                    fontWeight=FontWeight.Bold)
                Text("Alternative music discovery · your configured instance",
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if(state.searching)CircularProgressIndicator(Modifier.size(23.dp),
                strokeWidth=2.dp)
        }
        if(state.searched) {
            Text(state.message,style=MaterialTheme.typography.bodySmall,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            if(state.instance.isNotBlank())Text(state.instance,
                style=MaterialTheme.typography.labelSmall,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            state.results.take(if(showAll)30 else 6).forEach{video->
                Card(shape=RoundedCornerShape(18.dp),modifier=Modifier.fillMaxWidth()){
                    Column(Modifier.padding(12.dp),
                        verticalArrangement=Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment=Alignment.CenterVertically) {
                            AsyncImage(
                                model=ImageRequest.Builder(context)
                                    .data(JobbiApi.authenticatedUrl(
                                        "/api/invidious/thumbnail/"+video.videoId))
                                    .crossfade(true).build(),
                                imageLoader=imageLoader,
                                contentDescription="Invidious video thumbnail",
                                contentScale=ContentScale.Crop,
                                modifier=Modifier.size(102.dp,68.dp))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(video.title,fontWeight=FontWeight.SemiBold,
                                    maxLines=2,overflow=TextOverflow.Ellipsis)
                                Text(video.artist+" · "+length(video.durationSeconds),
                                    style=MaterialTheme.typography.bodySmall,
                                    color=MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines=1,overflow=TextOverflow.Ellipsis)
                            }
                        }
                        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            OutlinedButton(onClick={openVideo(video)}){
                                Icon(Icons.Rounded.OpenInNew,null)
                                Spacer(Modifier.width(5.dp))
                                Text("Open in Invidious")
                            }
                            if(state.importEnabled) {
                                FilledTonalButton(onClick={selected=video}){
                                    Icon(Icons.Rounded.CloudDownload,null)
                                    Spacer(Modifier.width(5.dp))
                                    Text("Import audio")
                                }
                            }
                        }
                    }
                }
            }
            if(!showAll&&state.results.size>6)TextButton(onClick={showAll=true}){
                Text("Show all ${state.results.size} results")
            }
            if(state.results.isNotEmpty()&&!state.importEnabled){
                Text("You can open the videos, but NAS audio importing requires the optional Invidious import worker.",
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            Text("Your music search also checks Invidious automatically.",
                style=MaterialTheme.typography.bodySmall)
        }
        if(state.workerMessage.isNotBlank()){
            Text(state.workerMessage,style=MaterialTheme.typography.bodySmall,
                color=MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if(feedback.isNotBlank())Text(feedback,
            style=MaterialTheme.typography.bodySmall,
            color=MaterialTheme.colorScheme.primary)
        if(state.jobs.isNotEmpty()) {
            Row(verticalAlignment=Alignment.CenterVertically) {
                Text("Alternate-source imports",
                    style=MaterialTheme.typography.titleMedium,modifier=Modifier.weight(1f))
                TextButton(onClick={scope.launch{state.refreshJobs()}}){Text("Refresh")}
            }
            state.jobs.take(10).forEach{job->
                val title=job.optString("title").ifBlank{job.optString("videoId")}
                val stage=job.optString("status","Unknown")
                Row(modifier=Modifier.fillMaxWidth(),
                    verticalAlignment=Alignment.CenterVertically){
                    Icon(Icons.Rounded.Downloading,null,
                        tint=MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(9.dp))
                    Column(Modifier.weight(1f)){
                        Text(title,maxLines=1,overflow=TextOverflow.Ellipsis)
                        Text(job.optString("artist"),style=MaterialTheme.typography.bodySmall)
                    }
                    Text(stage,style=MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
    selected?.let{video->
        var title by remember(video.videoId){mutableStateOf(video.title)}
        var artist by remember(video.videoId){mutableStateOf(video.artist)}
        var authorized by remember(video.videoId){mutableStateOf(false)}
        AlertDialog(
            onDismissRequest={if(!requestBusy)selected=null},
            title={Text("Import audio from Invidious")},
            text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
                Text("This saves an audio recording to your NAS through the optional worker, not to your phone.",
                    style=MaterialTheme.typography.bodySmall)
                OutlinedTextField(title,{title=it.take(200)},
                    label={Text("Recording title")},singleLine=true)
                OutlinedTextField(artist,{artist=it.take(140)},
                    label={Text("Artist / channel")},singleLine=true)
                Row(verticalAlignment=Alignment.CenterVertically){
                    Checkbox(authorized,{authorized=it})
                    Text("I have permission to obtain and store this recording.",
                        style=MaterialTheme.typography.bodySmall)
                }
                Text("The server applies its storage, duplicate and daily import limits.",
                    style=MaterialTheme.typography.bodySmall)
            }},
            confirmButton={Button(
                enabled=authorized&&title.isNotBlank()&&artist.isNotBlank()&&!requestBusy,
                onClick={scope.launch{
                    requestBusy=true
                    try {
                        state.queue(video,title,artist)
                        feedback="Invidious audio import queued on your NAS."
                        selected=null
                    }catch(e:Exception){
                        feedback=e.message?:"Invidious import failed"
                    }finally{requestBusy=false}
                }}
            ){Text(if(requestBusy)"Queueing…" else "Queue audio")}},
            dismissButton={TextButton(enabled=!requestBusy,
                onClick={selected=null}){Text("Cancel")}}
        )
    }
}
