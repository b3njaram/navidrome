package com.jobbisoft.music.nativeplayer

import android.net.Uri
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat

private fun JSONArray?.asJsonList():List<JSONObject> =
    this?.let{arr->(0 until arr.length()).mapNotNull(arr::optJSONObject)}?:emptyList()
private fun JSONObject?.humanCount(key:String):String =
    if(this==null||!has(key)||isNull(key))"Unavailable"
    else NumberFormat.getIntegerInstance().format(optLong(key))
private fun String.shortByteCount():String = toLongOrNull()?.let{size->
    if(size>=1_000_000_000)"%.2f GB".format(size/1_000_000_000.0)
    else if(size>=1_000_000)"%.1f MB".format(size/1_000_000.0)
    else "${size/1024} KB"
}?:"Unavailable"

@Composable
fun NativeAdminScreen(vm:MusicViewModel,onBack:()->Unit){
    val scope=rememberCoroutineScope()
    var overview by remember{mutableStateOf<JSONObject?>(null)}
    var accounts by remember{mutableStateOf<JSONObject?>(null)}
    var requests by remember{mutableStateOf<List<JSONObject>>(emptyList())}
    var busy by remember{mutableStateOf(false)}
    var problem by remember{mutableStateOf("")}
    var createAccount by remember{mutableStateOf(false)}
    var deleteTarget by remember{mutableStateOf<JSONObject?>(null)}
    var decision by remember{mutableStateOf<Pair<JSONObject,String>?>(null)}

    fun load(){
        scope.launch{
            busy=true;problem=""
            try{
                val o=JobbiApi.getObject("/api/admin/overview")
                val a=JobbiApi.getObject("/api/admin/accounts")
                overview=o;accounts=a
                requests=try{
                    JobbiApi.getObject("/api/music-requests/admin")
                        .optJSONArray("requests").asJsonList()
                }catch(_:Exception){emptyList()}
            }catch(e:Exception){problem=e.message?:"Admin overview unavailable"}
            finally{busy=false}
        }
    }
    fun action(block:suspend()->Unit){
        scope.launch{
            busy=true;problem=""
            try{block();load()}
            catch(e:Exception){problem=e.message?:"Operation unavailable";busy=false}
        }
    }
    LaunchedEffect(vm.isAdmin){if(vm.isAdmin)load()}
    if(!vm.isAdmin){
        Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){
            Text("Administrator permissions are required.")
        }
        return
    }
    Column(Modifier.fillMaxSize()){
        Row(Modifier.fillMaxWidth().padding(14.dp),verticalAlignment=Alignment.CenterVertically){
            IconButton(onClick=onBack){Icon(Icons.Rounded.ArrowBack,"Back to settings")}
            Column(Modifier.weight(1f)){
                Text("Admin console",style=MaterialTheme.typography.headlineSmall,
                    fontWeight=FontWeight.Bold)
                Text("Verified server statistics and listeners",
                    style=MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick=::load,enabled=!busy){
                Icon(Icons.Rounded.Refresh,"Refresh statistics")
            }
        }
        if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
        if(problem.isNotBlank())Text(problem,Modifier.padding(13.dp),
            color=MaterialTheme.colorScheme.error)
        LazyColumn(contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
            item{
                ElevatedCard(shape=RoundedCornerShape(22.dp),modifier=Modifier.fillMaxWidth()){
                    Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(11.dp)){
                        Text("Library health",style=MaterialTheme.typography.titleLarge,
                            fontWeight=FontWeight.Bold)
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)){
                            AdminMetric("Indexed songs",overview.humanCount("indexedSongs"),
                                Modifier.weight(1f))
                            AdminMetric("Accounts",overview.humanCount("usersCount"),
                                Modifier.weight(1f))
                        }
                        HorizontalDivider()
                        Text("Song source: "+(overview?.optString("indexedSongsSource")
                            ?:"Unavailable"),style=MaterialTheme.typography.bodySmall,
                            color=MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("User count source: "+(overview?.optString("usersCountSource")
                            ?:"Unavailable"),style=MaterialTheme.typography.bodySmall,
                            color=MaterialTheme.colorScheme.onSurfaceVariant)
                        AdminKeyValue("Indexed albums",overview.humanCount("indexedAlbums"))
                        AdminKeyValue("Audio files on NAS",overview.humanCount("physicalAudioFiles"))
                        AdminKeyValue("Physical music size",
                            overview?.optJSONObject("storage")?.opt("musicBytes")?.toString()
                                .orEmpty().shortByteCount())
                        AdminKeyValue("Available NAS storage",
                            overview?.optJSONObject("storage")?.opt("freeBytes")?.toString()
                                .orEmpty().shortByteCount())
                        Text("The indexed-song count and the physical-file count may differ. Unavailable or incomplete counts are never reported as zero.",
                            style=MaterialTheme.typography.bodySmall,
                            color=MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            item{
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
                    Text("Accounts & permissions",style=MaterialTheme.typography.titleLarge,
                        modifier=Modifier.weight(1f),fontWeight=FontWeight.Bold)
                    if(accounts?.optBoolean("readOnly",true)==false&&
                        overview?.optBoolean("accountManagementEnabled",false)==true){
                        FilledTonalButton(onClick={createAccount=true}){
                            Icon(Icons.Rounded.PersonAdd,null);Text("Add")
                        }
                    }
                }
                if(accounts?.optBoolean("readOnly",true)!=false)
                    Text("Account creation and removal are read-only on this Navidrome server.",
                        style=MaterialTheme.typography.bodySmall)
            }
            items(accounts?.optJSONArray("users").asJsonList()?:emptyList(),
                key={it.optString("id",it.optString("username"))}){person->
                ElevatedCard(Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp)){
                    Row(Modifier.padding(13.dp),verticalAlignment=Alignment.CenterVertically){
                        Icon(Icons.Rounded.Person,null,Modifier.size(29.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)){
                            Text(person.optString("name").ifBlank{person.optString("username")},
                                fontWeight=FontWeight.SemiBold)
                            Text("@"+person.optString("username")+" · "+
                                if(person.optBoolean("isAdmin"))"Admin" else "Listener",
                                style=MaterialTheme.typography.bodySmall)
                        }
                        if(!person.optBoolean("isAdmin")&&
                            accounts?.optBoolean("readOnly",true)==false){
                            IconButton(onClick={deleteTarget=person}){
                                Icon(Icons.Rounded.DeleteOutline,"Remove listener")
                            }
                        }
                    }
                }
            }
            item{
                Text("Music import requests",style=MaterialTheme.typography.titleLarge,
                    fontWeight=FontWeight.Bold)
            }
            if(requests.isEmpty())item{Text("No import requests to review.")}
            items(requests.take(60),key={it.optString("id")}){request->
                ElevatedCard(Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp)){
                    Column(Modifier.padding(13.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                        Text(request.optString("title"),fontWeight=FontWeight.SemiBold)
                        Text(request.optString("artist")+" · requested by @"+request.optString("requester"),
                            style=MaterialTheme.typography.bodySmall)
                        Text("Status: "+request.optString("status"),
                            color=MaterialTheme.colorScheme.onSurfaceVariant,
                            style=MaterialTheme.typography.labelMedium)
                        if(request.optString("status")=="pending"){
                            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                Button(onClick={decision=request to "approve"}){Text("Approve")}
                                OutlinedButton(onClick={decision=request to "reject"}){Text("Reject")}
                            }
                        }
                    }
                }
            }
        }
    }

    if(createAccount){
        var username by remember{mutableStateOf("")}
        var display by remember{mutableStateOf("")}
        var password by remember{mutableStateOf("")}
        AlertDialog(onDismissRequest={createAccount=false},
            title={Text("Create listener account")},
            text={
                Column(verticalArrangement=Arrangement.spacedBy(9.dp)){
                    OutlinedTextField(username,{username=it.take(40)},
                        label={Text("Username")},singleLine=true)
                    OutlinedTextField(display,{display=it.take(80)},
                        label={Text("Display name")},singleLine=true)
                    OutlinedTextField(password,{password=it.take(128)},
                        label={Text("Temporary password (12+ characters)")},
                        singleLine=true)
                    Text("New accounts are listeners, never administrators.",
                        style=MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton={
                Button(enabled=username.matches(Regex("[A-Za-z0-9_-]{3,40}"))&&
                    password.length>=12&&!busy,onClick={
                    action {
                        JobbiApi.post("/api/admin/accounts",JSONObject()
                            .put("username",username).put("name",display)
                            .put("email","").put("password",password))
                    }
                    createAccount=false
                }){Text("Create")}
            },
            dismissButton={TextButton(onClick={createAccount=false}){Text("Cancel")}}
        )
    }
    deleteTarget?.let{person->
        AlertDialog(onDismissRequest={deleteTarget=null},
            title={Text("Remove @"+person.optString("username")+"?")},
            text={Text("This permanently removes this listener account from Navidrome. Their personal playlists and server data may be affected.")},
            confirmButton={
                Button(onClick={
                    val id=person.optString("id")
                    action{JobbiApi.delete("/api/admin/accounts/"+Uri.encode(id)+"?confirm=delete")}
                    deleteTarget=null
                }){Text("Delete account")}
            },
            dismissButton={TextButton(onClick={deleteTarget=null}){Text("Cancel")}}
        )
    }
    decision?.let{(request,choice)->
        AlertDialog(onDismissRequest={decision=null},
            title={Text(if(choice=="approve")"Approve download?" else "Reject request?")},
            text={Text(request.optString("artist")+" — "+request.optString("title")+
                "\n\nThis operation may queue a file on your NAS.")},
            confirmButton={Button(onClick={
                val id=request.optString("id")
                action{
                    JobbiApi.post("/api/music-requests/"+Uri.encode(id)+"/decision",
                        JSONObject().put("decision",choice))
                }
                decision=null
            }){Text("Confirm")}},
            dismissButton={TextButton(onClick={decision=null}){Text("Cancel")}}
        )
    }
}

@Composable
private fun AdminMetric(label:String,number:String,modifier:Modifier){
    Surface(modifier=modifier,shape=RoundedCornerShape(16.dp),
        color=MaterialTheme.colorScheme.primaryContainer){
        Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
            Text(number,style=MaterialTheme.typography.headlineMedium,
                fontWeight=FontWeight.Bold,color=MaterialTheme.colorScheme.onPrimaryContainer)
            Text(label,style=MaterialTheme.typography.labelMedium,
                color=MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}
@Composable
private fun AdminKeyValue(label:String,value:String){
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,
        verticalAlignment=Alignment.CenterVertically){
        Text(label,style=MaterialTheme.typography.bodySmall,modifier=Modifier.weight(1f))
        Text(value,style=MaterialTheme.typography.bodyMedium,
            fontWeight=FontWeight.SemiBold)
    }
}
