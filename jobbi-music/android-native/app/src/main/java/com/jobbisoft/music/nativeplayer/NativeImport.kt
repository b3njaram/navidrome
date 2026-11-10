package com.jobbisoft.music.nativeplayer

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.FileOpen
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.text.Normalizer

data class ImportedTrack(val title:String,val artist:String,val album:String="") {
    val key: String get() = "${artist.lowercase()}|${title.lowercase()}"
}
data class ImportCandidate(val username:String,val filename:String,val size:Long,val format:String)
data class ImportEntry(val track:ImportedTrack,
    val status:String="Not checked",val candidate:ImportCandidate?=null)

/** RFC 4180-style CSV/TSV parser that preserves Unicode titles and quoted commas. */
fun parseTrackExport(text:String):List<ImportedTrack> {
    if(text.length>2_000_000)throw IllegalArgumentException("Track list must be under 2 MB")
    val delimiter = if(text.lineSequence().firstOrNull().orEmpty().contains('\t')) '\t' else ','
    val rows=mutableListOf<List<String>>()
    var current=mutableListOf<String>()
    val cell=StringBuilder()
    var quoted=false
    var i=0
    while(i<text.length){
        val ch=text[i]
        if(quoted) {
            if(ch=='"' && i+1<text.length && text[i+1]=='"'){cell.append('"');i++}
            else if(ch=='"') quoted=false
            else cell.append(ch)
        } else when(ch) {
            '"' -> quoted=true
            delimiter -> {current.add(cell.toString());cell.clear()}
            '\r','\n' -> {
                if(ch=='\r'&&i+1<text.length&&text[i+1]=='\n')i++
                current.add(cell.toString());cell.clear()
                if(current.any(String::isNotBlank))rows.add(current)
                current=mutableListOf()
            }
            else -> cell.append(ch)
        }
        i++
    }
    if(quoted)throw IllegalArgumentException("Unclosed quote in CSV export")
    current.add(cell.toString())
    if(current.any(String::isNotBlank))rows.add(current)
    if(rows.size<2)throw IllegalArgumentException("Choose a CSV or TSV playlist export")
    val headings=rows.removeAt(0).map{it.lowercase().replace(Regex("[^a-z0-9]"),"")}
    fun findIndex(vararg names:String):Int = headings.indexOfFirst{it in names}
    val titleIndex=findIndex("trackname","title","name","song","songname")
    val artistIndex=findIndex("artistname","artistnames","artist","artists")
    val albumIndex=findIndex("album","albumname")
    if(titleIndex<0||artistIndex<0)
        throw IllegalArgumentException("The export needs song title and artist columns")
    return rows.take(1000).mapNotNull{columns->
        val title=columns.getOrNull(titleIndex).orEmpty().trim()
        val artist=columns.getOrNull(artistIndex).orEmpty().trim()
        if(title.isEmpty()||artist.isEmpty()) null
        else ImportedTrack(title.take(180),artist.take(180),columns.getOrNull(albumIndex).orEmpty().trim().take(180))
    }
}
private fun clean(s:String) = Normalizer.normalize(s,Normalizer.Form.NFKD)
    .replace(Regex("\\p{M}+"),"").lowercase()
    .replace(Regex("[^\\p{L}\\p{N}]+")," ").trim()
private fun matchesTitleAndArtist(track:ImportedTrack,title:String,artist:String):Boolean =
    clean(title)==clean(track.title) && (
        clean(artist)==clean(track.artist)||
        clean(artist).contains(clean(track.artist)) ||
        clean(track.artist).contains(clean(artist))
    )

private suspend fun candidateFor(track:ImportedTrack): Pair<String,ImportCandidate?> {
    val local = JobbiApi.search(track.title).songs
    if(local.any{matchesTitleAndArtist(track,it.title,it.artist)})
        return "Already in your Navidrome library" to null
    val request=JSONObject().put("query",track.artist+" "+track.title)
    val response=JobbiApi.post("/api/soulseek/search",request)
    val choices=response.optJSONArray("results")?:return "No peer results" to null
    val found=mutableListOf<ImportCandidate>()
    for(i in 0 until choices.length()) {
        val item=choices.optJSONObject(i)?:continue
        val filename=item.optString("filename")
        val username=item.optString("username")
        if(filename.isBlank()||username.isBlank())continue
        val bare=filename.substringAfterLast('/').substringAfterLast('\\').substringBeforeLast('.')
        val fileType=filename.substringAfterLast('.',missingDelimiterValue="").lowercase()
        if(fileType !in listOf("flac","mp3","ogg","opus","wav","m4a"))continue
        // Reject unrelated peers or dubious fuzzy matches; don't silently pick a song.
        val titleWords=clean(track.title).split(' ').filter{it.length>1}
        val artistWords=clean(track.artist).split(' ').filter{it.length>1}
        val pathname=clean(filename)
        if(titleWords.isEmpty()||artistWords.isEmpty()||
            !titleWords.all{it in clean(bare).split(' ')}||
            !artistWords.all{it in pathname.split(' ')})continue
        found+=ImportCandidate(username,filename,item.optLong("size",0L),fileType)
    }
    val best=found.sortedWith(compareByDescending<ImportCandidate> {it.format=="flac"}
        .thenByDescending{it.size}).firstOrNull()
    return if(best==null) "No reliable artist/title match; review manually" to null
    else "Matched ${best.format.uppercase()} from ${best.username}" to best
}

@Composable
fun ImportScreen(onBack:()->Unit) {
    var collectionMode by remember { mutableStateOf(false) }
    if(collectionMode){
        NativeCollectionsImportScreen(onBack={collectionMode=false})
        return
    }
    val context= LocalContext.current
    val scope=rememberCoroutineScope()
    val entries=remember{mutableStateListOf<ImportEntry>()}
    var authorized by remember{mutableStateOf(false)}
    var status by remember{mutableStateOf("No track list loaded")}
    var busy by remember{mutableStateOf(false)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri: Uri?->
        if(uri!=null)scope.launch {
            busy=true
            try {
                val text=withContext(Dispatchers.IO){
                    context.contentResolver.openInputStream(uri)?.use{
                        val bytes=it.readNBytes(2_000_001)
                        if(bytes.size>2_000_000)throw IllegalArgumentException("CSV too large")
                        bytes.toString(Charsets.UTF_8)
                    } ?: throw IllegalArgumentException("Unable to read export")
                }
                entries.clear()
                entries.addAll(parseTrackExport(text).map{ImportEntry(it)})
                status="Loaded ${entries.size} tracks. Choose Find matches."
            }catch(e:Exception){status=e.message?:"Could not import track list"}
            finally{busy=false}
        }
    }
    Column(modifier=Modifier.fillMaxWidth().padding(horizontal=15.dp),
        verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text("Move your music",style=MaterialTheme.typography.headlineMedium,
            fontWeight=FontWeight.Bold)
        Text("Import Spotify/Apple Music track metadata without account passwords. " +
            "Find FLAC first; you approve each download.",
            style=MaterialTheme.typography.bodyMedium,
            color=MaterialTheme.colorScheme.onSurfaceVariant)
        FilledTonalButton(onClick={collectionMode=true}) {
            Icon(Icons.Rounded.FileOpen,null)
            Spacer(Modifier.width(8.dp))
            Text("Import multiple playlists & Liked Songs (JSON)")
        }
        FilledTonalButton(onClick={picker.launch(arrayOf("text/*","application/csv","application/octet-stream"))}) {
            Icon(Icons.Rounded.FileOpen,null)
            Spacer(Modifier.width(8.dp))
            Text("Select playlist CSV / TSV")
        }
        Row(verticalAlignment=Alignment.CenterVertically) {
            Checkbox(authorized,{authorized=it})
            Text("I have rights to obtain the recordings I queue.",
                style=MaterialTheme.typography.bodySmall)
        }
        if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
        Text(status,style=MaterialTheme.typography.bodySmall)
        if(entries.isNotEmpty()){
            FilledTonalButton(enabled=!busy,onClick={
                scope.launch {
                    busy=true
                    try {
                        for(i in 0 until entries.size.coerceAtMost(10)) {
                            val item=entries[i]
                            entries[i]=item.copy(status="Searching…")
                            try {
                                val (message,candidate)=candidateFor(item.track)
                                entries[i]=item.copy(status=message,candidate=candidate)
                            } catch(e:Exception){entries[i]=item.copy(status=e.message?:"Search failed")}
                        }
                        status="Checked first ${entries.size.coerceAtMost(10)} songs. Review matches individually."
                    } finally {busy=false}
                }
            }){
                Icon(Icons.Rounded.Search,null);Text("Find first 10 matches")
            }
        }
        LazyColumn(verticalArrangement=Arrangement.spacedBy(9.dp)) {
            items(entries.size){index->
                val entry=entries[index]
                Card(Modifier.fillMaxWidth()){
                    Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                        Text(entry.track.title,fontWeight=FontWeight.SemiBold)
                        Text(entry.track.artist,style=MaterialTheme.typography.bodySmall)
                        Text(entry.status,style=MaterialTheme.typography.labelSmall)
                        entry.candidate?.let{candidate->
                            Button(onClick={
                                scope.launch{
                                    entries[index]=entry.copy(status="Queueing…")
                                    try {
                                        val reply=JobbiApi.post("/api/music-imports",
                                            JSONObject().put("username",candidate.username)
                                                .put("filename",candidate.filename).put("size",candidate.size)
                                                .put("title",entry.track.title).put("artist",entry.track.artist))
                                        entries[index]=entry.copy(status=if(reply.optBoolean("queued"))"Queued" else "Submitted",
                                            candidate=null)
                                    }catch(e:Exception){entries[index]=entry.copy(status=e.message?:"Queue failed")}
                                }
                            },enabled=authorized&&!busy){
                                Icon(Icons.Rounded.CloudDownload,null)
                                Text("Queue ${candidate.format.uppercase()}")
                            }
                        }
                    }
                }
            }
        }
    }
}
