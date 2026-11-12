package com.jobbisoft.music.nativeplayer

import android.app.DownloadManager
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import android.os.StatFs
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

data class JobbiDownloadStats(val saved:Int=0,val queued:Int=0,val failed:Int=0,
                              val bytesSaved:Long=0,val lastNotice:String="")
data class JobbiQueuedResult(val queued:Int,val alreadySaved:Int,val failed:Int,
                             val estimatedBytes:Long,val notice:String)
data class OfflineCollection(val id:String,val title:String,val songs:List<Song>)
data class JobbiRemovalResult(val removed:Int,val keptShared:Int)

/** A pending Android DownloadManager job may not have created its file yet.
 * Do not schedule the same recording again until the OS has marked it failed.
 */
/** A track can be erased only if no other downloaded collection owns it. */
internal fun offlineSongsSafeToDelete(requested:Set<String>, referencedElsewhere:Set<String>):Set<String> =
    requested - referencedElsewhere

internal fun shouldEnqueueDownload(status:Int?,fileReady:Boolean):Boolean =
    when(status){
        DownloadManager.STATUS_PENDING,DownloadManager.STATUS_RUNNING,
        DownloadManager.STATUS_PAUSED -> false
        DownloadManager.STATUS_SUCCESSFUL -> !fileReady
        else -> true
    }

private data class OfflineEntry(
    val id:String,val title:String,val artist:String,val album:String,
    val fileName:String,val downloadId:Long,val status:Int,val size:Long
) {
    fun json():String = JSONObject().put("id",id).put("title",title).put("artist",artist)
        .put("album",album).put("fileName",fileName).put("downloadId",downloadId)
        .put("status",status).put("size",size).toString()
    companion object {
        fun from(value:String):OfflineEntry? = runCatching {
            val j=JSONObject(value)
            OfflineEntry(j.getString("id"),j.optString("title"),
                j.optString("artist"),j.optString("album"),j.getString("fileName"),
                j.getLong("downloadId"),j.getInt("status"),j.optLong("size"))
        }.getOrNull()
    }
}

/**
 * Device-private, per-account downloads using Android DownloadManager.
 * Jobs keep running in the OS after the app closes; no exported storage
 * permissions or passwords are needed. The HTTP-only session cookie is passed
 * to the system download service over HTTPS, never persisted in app preferences.
 */
object JobbiDownloads {
    private const val PREFS="jobbi-native-downloads-v1"
    private fun hash(value:String):String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString(""){"%02x".format(it)}
    private fun scope(user:String,server:String):String =
        hash(server+"\n"+user.lowercase()).take(24)
    private fun prefix(user:String,server:String):String = scope(user,server)+":"
    private fun key(user:String,server:String,id:String):String = prefix(user,server)+hash(id)
    private fun collectionKey(user:String,server:String,id:String):String =
        "collection:"+scope(user,server)+":"+hash(id)
    private fun manualKey(user:String,server:String,id:String):String =
        "manual:"+scope(user,server)+":"+hash(id)
    private fun prefs(c:Context)=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
    private fun manager(c:Context)=c.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private fun extension(song:Song):String =
        when(song.suffix.lowercase()){
            "flac","mp3","m4a","aac","ogg","opus","wav","aif","aiff","wma" -> song.suffix.lowercase()
            else -> "bin"
        }
    private fun root(c:Context):File = requireNotNull(c.getExternalFilesDir(Environment.DIRECTORY_MUSIC)){
        "App-private device music storage is not available"
    }
    private fun file(c:Context,user:String,server:String,item:OfflineEntry):File =
        File(root(c),"jobbi/"+scope(user,server)+"/"+item.fileName)
    private fun entries(c:Context,user:String,server:String):List<OfflineEntry> =
        prefs(c).all.filterKeys {it.startsWith(prefix(user,server))}
            .values.mapNotNull { (it as? String)?.let(OfflineEntry::from) }
    private fun status(c:Context,downloadId:Long):Int {
        if(downloadId<=0)return DownloadManager.STATUS_FAILED
        val cursor=manager(c).query(DownloadManager.Query().setFilterById(downloadId))
        cursor.use {
            if(!it.moveToFirst())return DownloadManager.STATUS_FAILED
            return it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        }
    }
    fun playableUri(c:Context,user:String,server:String,id:String):Uri? {
        if(user.isBlank()||id.isBlank())return null
        val entry=prefs(c).getString(key(user,server,id),null)?.let(OfflineEntry::from)
            ?:return null
        val downloaded=file(c,user,server,entry)
        if(!downloaded.isFile||downloaded.length()==0L)return null
        if(entry.status==DownloadManager.STATUS_SUCCESSFUL||
            runCatching{status(c,entry.downloadId)}.getOrNull()==DownloadManager.STATUS_SUCCESSFUL)
            return Uri.fromFile(downloaded)
        return null
    }
    fun downloadedSongs(c:Context,user:String,server:String):List<Song> {
        if(user.isBlank())return emptyList()
        return entries(c,user,server).filter {entry->
            val target=file(c,user,server,entry)
            target.isFile&&target.length()>0L&&
                (entry.status==DownloadManager.STATUS_SUCCESSFUL||
                  runCatching{status(c,entry.downloadId)}.getOrNull()==DownloadManager.STATUS_SUCCESSFUL)
        }.sortedWith(compareBy<OfflineEntry> {it.artist.lowercase()}
            .thenBy{it.album.lowercase()}.thenBy{it.title.lowercase()})
            .map {Song(id=it.id,title=it.title,artist=it.artist,
                album=it.album,cover=null,duration=0L)}
    }
    fun rememberCollection(c:Context,user:String,server:String,
                           collectionId:String,title:String,songs:List<Song>){
        if(user.isBlank()||collectionId.isBlank())return
        val ids=JSONArray()
        for(song in songs.distinctBy(Song::id))if(song.id.isNotBlank())ids.put(song.id)
        val key=collectionKey(user,server,collectionId)
        // Preserve tracks saved earlier even when the NAS playlist has changed.
        val old=prefs(c).getString(key,null)?.let {runCatching {JSONObject(it)}.getOrNull()}
        val oldIds=old?.optJSONArray("ids")
        if(oldIds!=null)for(i in 0 until oldIds.length()){
            val id=oldIds.optString(i)
            if(id.isNotBlank() && (0 until ids.length()).none{ids.optString(it)==id})ids.put(id)
        }
        val value=JSONObject().put("id",collectionId).put("title",title).put("ids",ids)
        check(prefs(c).edit().putString(key,value.toString()).commit()){
            "Could not remember your offline playlist."
        }
    }
    fun rememberIndividual(c:Context,user:String,server:String,id:String){
        if(user.isBlank()||id.isBlank())return
        check(prefs(c).edit().putBoolean(manualKey(user,server,id),true).commit()){
            "Could not remember this individual offline download."
        }
    }
    fun hasPlaylist(c:Context,user:String,server:String,id:String):Boolean =
        user.isNotBlank() && prefs(c).contains(collectionKey(user,server,"playlist:"+id))

    /** Cancel queued files and delete local copies only when no other saved
     * collection or explicit single-song download claims those recordings.
     * This never contacts the server or removes songs from the NAS.
     */
    fun removePlaylist(c:Context,user:String,server:String,id:String):JobbiRemovalResult {
        require(user.isNotBlank()){"Select an offline account first."}
        val store=prefs(c)
        val targetKey=collectionKey(user,server,"playlist:"+id)
        val record=store.getString(targetKey,null)?.let {runCatching{JSONObject(it)}.getOrNull()}
            ?:return JobbiRemovalResult(0,0)
        val ids=record.optJSONArray("ids") ?: JSONArray()
        val target=(0 until ids.length()).map {ids.optString(it)}.filter(String::isNotBlank).toSet()
        val protected=mutableSetOf<String>()
        val collectionPrefix="collection:"+scope(user,server)+":"
        for((name,raw) in store.all){
            if(name==targetKey || !name.startsWith(collectionPrefix))continue
            val refs=runCatching {JSONObject(raw as String).optJSONArray("ids")}.getOrNull()
                ?:continue
            for(i in 0 until refs.length())protected.add(refs.optString(i))
        }
        val accountFolder=File(root(c),"jobbi/"+scope(user,server)).canonicalFile
        for(songId in target)if(store.getBoolean(manualKey(user,server,songId),false))
            protected.add(songId)
        val removable=offlineSongsSafeToDelete(target,protected)
        val dm=manager(c)
        val editor=store.edit()
        var removed=0
        val kept=target.size-removable.size
        for(songId in removable){
            val item=store.getString(key(user,server,songId),null)?.let(OfflineEntry::from)
                ?:continue
            val targetFile=file(c,user,server,item).canonicalFile
            check(targetFile.parentFile==accountFolder){"Invalid offline recording path."}
            if(item.downloadId>0)dm.remove(item.downloadId) // Cancels queued/running jobs too.
            if(targetFile.exists()&&!targetFile.delete()){
                throw JobbiException("Could not delete "+item.title+" from device storage.")
            }
            editor.remove(key(user,server,songId))
            removed++
        }
        editor.remove(targetKey)
        check(editor.commit()){"Could not update the offline download library."}
        return JobbiRemovalResult(removed,kept)
    }

    fun completedCollections(c:Context,user:String,server:String):List<OfflineCollection>{
        if(user.isBlank())return emptyList()
        val available=downloadedSongs(c,user,server).associateBy(Song::id)
        val prefix="collection:"+scope(user,server)+":"
        return prefs(c).all.filterKeys {it.startsWith(prefix)}.values.mapNotNull{raw->
            runCatching{
                val j=JSONObject(raw as String)
                val ids=j.optJSONArray("ids") ?: JSONArray()
                val songs=(0 until ids.length()).mapNotNull{available[ids.optString(it)]}
                if(songs.isEmpty())null
                else OfflineCollection(j.getString("id"),j.optString("title"),songs)
            }.getOrNull()
        }.sortedBy{it.title.lowercase()}
    }
    fun enqueue(c:Context,user:String,server:String,songs:List<Song>,
                wifiOnly:Boolean=true):JobbiQueuedResult {
        require(user.isNotBlank()){"Sign in before downloading."}
        val unique=songs.filter {it.id.isNotBlank()}.distinctBy(Song::id)
        require(unique.isNotEmpty()){"No songs to download."}
        require(unique.size<=10000){"Too many songs to queue at once."}
        val root=root(c)
        val existing=entries(c,user,server).associateBy(OfflineEntry::id)
        val pending=unique.filter {song->
            val current=existing[song.id]
            if(current==null)true
            else shouldEnqueueDownload(
                runCatching{status(c,current.downloadId)}.getOrNull(),
                file(c,user,server,current).let{it.isFile&&it.length()>0L})
        }
        val bytes=pending.sumOf {it.size.coerceAtLeast(0)}
        val free=StatFs(root.absolutePath).availableBytes
        // A preflight cannot guarantee sufficient space for files whose lengths
        // Navidrome hasn't supplied, but avoid knowingly filling the device.
        if(bytes>0 && bytes>free*9/10)
            throw JobbiException("Insufficient phone storage. Need at least ${bytes/1024/1024} MB; "+
                "available ${free/1024/1024} MB.")
        val cookie=JobbiApi.cookieHeader("/api/download/song/"+Uri.encode(unique.first().id))
        if(cookie.isBlank())throw JobbiException("Please sign in again before downloading songs.")
        val dm=manager(c)
        val pendingIds=pending.map(Song::id).toSet()
        var queued=0
        var failed=0
        var skipped=0
        val editor=prefs(c).edit()
        for(song in unique){
            val current=existing[song.id]
            if(song.id !in pendingIds){skipped++;continue}
            val relative=hash(song.id).take(48)+"."+extension(song)
            val folder="jobbi/"+scope(user,server)
            val target=File(root,folder+"/"+relative)
            try{
                check(File(root,folder).isDirectory || File(root,folder).mkdirs()) {
                    "Cannot create app-private offline music directory"
                }
                if(target.isFile && (current==null||current.status!=DownloadManager.STATUS_SUCCESSFUL))
                    target.delete() // only the named app-private incomplete file
                val uri=Uri.parse(JobbiApi.authenticatedUrl("/api/download/song/"+Uri.encode(song.id)))
                val request=DownloadManager.Request(uri)
                    .addRequestHeader("Cookie",cookie)
                    .setAllowedOverMetered(!wifiOnly)
                    .setAllowedOverRoaming(false)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setTitle(song.title.take(80))
                    .setDescription("Jobbi Music • "+song.artist.take(80))
                    .setDestinationInExternalFilesDir(c,Environment.DIRECTORY_MUSIC,
                        folder+"/"+relative)
                val id=dm.enqueue(request)
                editor.putString(key(user,server,song.id),
                    OfflineEntry(song.id,song.title,song.artist,song.album,
                        relative,id,DownloadManager.STATUS_PENDING,song.size).json())
                queued++
            }catch(_:Exception){failed++}
        }
        if(!editor.commit())throw JobbiException("Could not save offline download records.")
        return JobbiQueuedResult(queued,skipped,failed,bytes,
            if(wifiOnly) "Queued for Wi-Fi; Android continues downloading in the background."
            else "Queued for download; Android continues in the background.")
    }
    fun stats(c:Context,user:String,server:String):JobbiDownloadStats {
        if(user.isBlank())return JobbiDownloadStats()
        var saved=0;var queued=0;var failed=0;var bytes=0L
        val editor=prefs(c).edit()
        for(item in entries(c,user,server)){
            val status=runCatching{status(c,item.downloadId)}.getOrDefault(item.status)
            val path=file(c,user,server,item)
            when {
                status==DownloadManager.STATUS_SUCCESSFUL && path.isFile && path.length()>0 -> {
                    saved++;bytes+=path.length()
                }
                status==DownloadManager.STATUS_FAILED -> failed++
                else -> queued++
            }
            if(item.status!=status)
                editor.putString(key(user,server,item.id),item.copy(status=status).json())
        }
        editor.apply()
        return JobbiDownloadStats(saved,queued,failed,bytes)
    }
}
