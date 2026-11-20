package com.jobbisoft.music.nativeplayer

import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException

private data class NativeLyricLine(val text:String,val at:Long?)

/**
 * Native Android peer to the iPhone lyrics panel: inline, scrollable synced
 * or plain lyrics retrieved from the same authenticated NAS endpoint.
 * No WebView, independent browser state, or third-party lyric service.
 */
@Composable
fun NativeLyricsPanel(songId:String,positionMs:Long,onSeek:(Long)->Unit,
                      modifier:Modifier=Modifier) {
    var lines by remember(songId){mutableStateOf<List<NativeLyricLine>>(emptyList())}
    var loading by remember(songId){mutableStateOf(true)}
    var error by remember(songId){mutableStateOf<String?>(null)}
    var synced by remember(songId){mutableStateOf(false)}
    val state=rememberLazyListState()
    LaunchedEffect(songId){
        loading=true
        error=null
        try{
            val data=JobbiApi.getObject("/api/lyrics/"+Uri.encode(songId))
            synced=data.optBoolean("synced",false)
            val source=data.optJSONArray("lines")
            lines=if(source==null)emptyList() else (0 until source.length()).mapNotNull{index->
                val entry=source.optJSONObject(index)?:return@mapNotNull null
                val text=entry.optString("text","").trim()
                if(text.isBlank())return@mapNotNull null
                val at=if(entry.has("at")&&!entry.isNull("at"))entry.optLong("at") else null
                NativeLyricLine(text,at)
            }
        }catch(cancel:CancellationException){throw cancel}
        catch(ex:Exception){error=ex.message?:"Could not load lyrics"}
        finally{loading=false}
    }
    val active=if(synced)lines.indexOfLast{it.at!=null&&it.at<=positionMs}else -1
    LaunchedEffect(active){
        if(active>=0)state.animateScrollToItem((active-1).coerceAtLeast(0))
    }
    Box(modifier.fillMaxWidth().heightIn(min=270.dp,max=410.dp)){
        when{
            loading->Column(Modifier.fillMaxSize(),
                verticalArrangement=Arrangement.Center,
                horizontalAlignment=androidx.compose.ui.Alignment.CenterHorizontally){
                CircularProgressIndicator(color=Color.White)
                Spacer(Modifier.height(14.dp))
                Text("Loading lyrics…",color=Color.White)
            }
            error!=null->Text("Lyrics unavailable\n"+error,
                color=Color.White.copy(alpha=.8f),
                modifier=Modifier.padding(24.dp))
            lines.isEmpty()->Text("No lyrics available for this recording.",
                color=Color.White.copy(alpha=.8f),modifier=Modifier.padding(24.dp))
            else->LazyColumn(state=state,contentPadding=PaddingValues(
                horizontal=12.dp,vertical=42.dp),verticalArrangement=Arrangement.spacedBy(23.dp)){
                itemsIndexed(lines,key={index,_->index}){index,line->
                    val selected=!synced||active==index
                    Text(line.text,modifier=Modifier.fillMaxWidth()
                        .clickable(enabled=synced&&line.at!=null){
                            line.at?.let(onSeek)
                        },
                        fontSize=if(selected)25.sp else 22.sp,lineHeight=32.sp,
                        fontWeight=if(selected)FontWeight.Bold else FontWeight.SemiBold,
                        color=Color.White.copy(alpha=if(selected)1f else .42f))
                }
            }
        }
    }
}
