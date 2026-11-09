
package com.jobbisoft.music;

import android.app.DownloadManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Tracks device-private downloads; no broad filesystem permissions. */
public final class OfflineStore {
    private static final String PREF = "jobbi_offline_v1";
    private static final String LIBRARY = "songs";
    private static final Object LOCK = new Object();
    private OfflineStore(){}

    public static final class Song {
        public final String key, owner, trackId, title, artist, album, fileName, format;
        public final long downloadId;
        public final String quality;
        public int status;
        public long bytes;
        Song(JSONObject obj) {
            key=obj.optString("key");
            owner=obj.optString("owner");
            trackId=obj.optString("trackId");
            title=obj.optString("title","Unknown song");
            artist=obj.optString("artist","Unknown artist");
            album=obj.optString("album");
            fileName=obj.optString("fileName");
            format=obj.optString("format","mp3");
            quality=obj.optString("quality","original");
            downloadId=obj.optLong("downloadId",-1);
            status=obj.optInt("status",DownloadManager.STATUS_PENDING);
            bytes=obj.optLong("bytes",0);
        }
        JSONObject json(){
            JSONObject o=new JSONObject();
            try{
                o.put("key",key);o.put("owner",owner);o.put("trackId",trackId);
                o.put("title",title);o.put("artist",artist);o.put("album",album);
                o.put("fileName",fileName);o.put("format",format);o.put("quality",quality);
                o.put("downloadId",downloadId);o.put("status",status);o.put("bytes",bytes);
            }catch(Exception ignored){}
            return o;
        }
        public boolean complete(){return status==DownloadManager.STATUS_SUCCESSFUL;}
        public File file(Context context){return new File(musicDir(context),fileName);}
    }

    static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREF,Context.MODE_PRIVATE);}
    static File musicDir(Context c){
        File dir=c.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if(dir==null)dir=new File(c.getFilesDir(),"music");
        if(!dir.exists())dir.mkdirs();
        return dir;
    }
    public static String lastUser(Context c){return prefs(c).getString("last_user","");}
    public static void setLastUser(Context c,String user){
        if(user!=null&&user.matches("[a-zA-Z0-9_.@-]{1,80}"))
            prefs(c).edit().putString("last_user",user.toLowerCase(java.util.Locale.ROOT)).apply();
    }
    public static String newFileName(String ext){
        if(ext==null||!ext.matches("(?i)mp3|flac|m4a|aac|ogg|opus|wav|aif|aiff|alac|wma"))
            ext="mp3";
        return UUID.randomUUID().toString()+"."+ext.toLowerCase(java.util.Locale.ROOT);
    }
    public static List<Song> all(Context c){
        synchronized(LOCK){return read(c);}
    }
    private static List<Song> read(Context c){
        List<Song> result=new ArrayList<>();
        try{
            JSONArray a=new JSONArray(prefs(c).getString(LIBRARY,"[]"));
            for(int i=0;i<a.length();i++){
                JSONObject obj=a.optJSONObject(i);
                if(obj!=null)result.add(new Song(obj));
            }
        }catch(Exception ignored){}
        return result;
    }
    private static void write(Context c,List<Song> songs){
        JSONArray a=new JSONArray();
        for(Song s:songs)a.put(s.json());
        prefs(c).edit().putString(LIBRARY,a.toString()).commit();
    }
    public static void upsert(Context c,Song entry){
        synchronized(LOCK){
            List<Song> list=read(c);
            list.removeIf(s->s.key.equals(entry.key));
            list.add(0,entry);
            write(c,list);
        }
    }
    public static Song create(Context c,String owner,String trackId,String title,String artist,String album,
                              String ext,String quality,long downloadId,String fileName){
        JSONObject obj=new JSONObject();
        try{
            obj.put("key",UUID.randomUUID().toString());obj.put("owner",owner);
            obj.put("trackId",trackId);obj.put("title",title);obj.put("artist",artist);
            obj.put("album",album);obj.put("format",ext);obj.put("quality",quality);
            obj.put("downloadId",downloadId);obj.put("fileName",fileName);
        }catch(Exception ignored){}
        Song song=new Song(obj);upsert(c,song);return song;
    }
    public static boolean alreadySaving(Context c,String user,String trackId){
        synchronized(LOCK){
            for(Song s:read(c)){
                if(s.owner.equals(user)&&s.trackId.equals(trackId)
                   &&s.status!=DownloadManager.STATUS_FAILED)return true;
            }
            return false;
        }
    }
    public static void reconcile(Context c){
        DownloadManager dm=(DownloadManager)c.getSystemService(Context.DOWNLOAD_SERVICE);
        if(dm==null)return;
        synchronized(LOCK){
            List<Song> entries=read(c);
            boolean changed=false;
            for(Song s:entries){
                if(s.status==DownloadManager.STATUS_SUCCESSFUL && s.file(c).isFile())continue;
                if(s.downloadId<=0)continue;
                try(Cursor cursor=dm.query(new DownloadManager.Query().setFilterById(s.downloadId))){
                    if(cursor!=null&&cursor.moveToFirst()){
                        int ix=cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                        if(ix<0)continue;
                        int status=cursor.getInt(ix);
                        if(status==DownloadManager.STATUS_SUCCESSFUL && (!s.file(c).isFile()||s.file(c).length()==0))
                            status=DownloadManager.STATUS_FAILED;
                        if(status!=s.status){s.status=status;changed=true;}
                        if(status==DownloadManager.STATUS_SUCCESSFUL){
                            long bytes=s.file(c).length();
                            if(s.bytes!=bytes){s.bytes=bytes;changed=true;}
                        }
                    }
                }catch(Exception ignored){}
            }
            if(changed)write(c,entries);
        }
    }
    public static List<Song> forUser(Context c,String username){
        reconcile(c);
        List<Song> output=new ArrayList<>();
        if(username==null||username.isEmpty())return output;
        for(Song s:all(c))if(username.equals(s.owner))output.add(s);
        return output;
    }
    public static void remove(Context c,Song song){
        DownloadManager dm=(DownloadManager)c.getSystemService(Context.DOWNLOAD_SERVICE);
        if(dm!=null&&song.downloadId>0)dm.remove(song.downloadId);
        File target=song.file(c);
        try{
            File canonicalBase=musicDir(c).getCanonicalFile();
            if(target.getCanonicalFile().getParentFile().equals(canonicalBase))target.delete();
        }catch(Exception ignored){}
        synchronized(LOCK){List<Song> list=read(c);list.removeIf(s->s.key.equals(song.key));write(c,list);}
    }
}
