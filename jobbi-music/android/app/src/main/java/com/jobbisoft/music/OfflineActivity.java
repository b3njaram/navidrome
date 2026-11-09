
package com.jobbisoft.music;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.app.DownloadManager;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.ArrayList;
import java.util.List;
import java.io.File;

/** Fully offline Android library, playable without a server or even a network. */
public final class OfflineActivity extends Activity {
    private final Handler handler=new Handler(Looper.getMainLooper());
    private LinearLayout list,root;
    private TextView countLabel,nowPlaying,timeLabel;
    private Button playButton;
    private SeekBar seekBar;
    private MediaController controller;
    private ListenableFuture<MediaController> future;
    private List<OfflineStore.Song> songs=new ArrayList<>();
    private final Runnable tick=new Runnable(){@Override public void run(){updatePlayer();handler.postDelayed(this,800);}};

    private int dp(float v){return MainActivity.dp(this,v);}
    private int color(String hex){return Color.parseColor(hex);}
    private TextView label(String value,int sp,String shade,boolean bold){
        TextView v=MainActivity.text(this,value,sp,color(shade),bold);
        v.setGravity(Gravity.CENTER_VERTICAL);
        return v;
    }
    private LinearLayout vertical(){
        LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;
    }
    private Button button(String title,boolean bright){
        Button b=new Button(this);
        b.setText(title);b.setTextSize(12);b.setAllCaps(false);
        b.setTextColor(color(bright?"#291B2E":"#F4DAE5"));
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(color(bright?"#F393B2":"#413046")));
        return b;
    }
    @Override public void onCreate(Bundle savedInstanceState){
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(color("#17131D"));
        getWindow().setNavigationBarColor(color("#17131D"));
        root=vertical();root.setBackgroundColor(color("#17131D"));
        root.setPadding(dp(15),dp(14),dp(15),dp(7));
        setContentView(root);
        LinearLayout toolbar=new LinearLayout(this);toolbar.setGravity(Gravity.CENTER_VERTICAL);
        Button back=button("‹  Listen Now",false);back.setOnClickListener(v->finish());
        toolbar.addView(back,new LinearLayout.LayoutParams(0,dp(45),1));
        Button refresh=button("↻",false);refresh.setContentDescription("Refresh downloads");
        refresh.setOnClickListener(v->refresh());
        toolbar.addView(refresh,new LinearLayout.LayoutParams(dp(55),dp(45)));
        root.addView(toolbar);
        TextView eyebrow=label("YOUR PRIVATE MUSIC SPACE",11,"#BCA1B5",true);
        eyebrow.setLetterSpacing(.14f);
        root.addView(eyebrow);
        TextView headline=label("Saved for offline.",29,"#FFE7F1",true);
        LinearLayout.LayoutParams h=new LinearLayout.LayoutParams(-1,dp(55));
        root.addView(headline,h);
        countLabel=label("",12,"#AFA0B0",false);countLabel.setPadding(0,0,0,dp(16));root.addView(countLabel);
        ScrollView scroll=new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        list=vertical();
        scroll.addView(list,new ScrollView.LayoutParams(-1,-2));
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        createPlayer();
        refresh();
        connectPlayer();
        handler.post(tick);
    }
    private void refresh(){
        String owner=OfflineStore.lastUser(this);
        songs=OfflineStore.forUser(this,owner);
        list.removeAllViews();
        int ready=0;long bytes=0;
        for(OfflineStore.Song s:songs)if(s.complete()&&s.file(this).isFile()){ready++;bytes+=s.bytes;}
        countLabel.setText(ready+" saved  ·  "+String.format(java.util.Locale.US,"%.1f MB",bytes/1048576.0)+
            "  ·  @"+(owner.isEmpty()?"no account":owner));
        if(songs.isEmpty()){
            TextView empty=label("No music saved yet.\n\nConnect to your NAS and tap the ↓ next to songs. They will appear here even without an internet connection.",15,"#BDAABD",false);
            empty.setPadding(dp(13),dp(35),dp(13),dp(35));list.addView(empty);
        }
        for(OfflineStore.Song entry:songs){
            LinearLayout card=vertical();
            card.setPadding(dp(14),dp(11),dp(11),dp(11));
            android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
                new int[]{color("#372B3D"),color("#241F2D")});
            bg.setCornerRadius(dp(15));bg.setStroke(dp(1),color("#4E3B50"));
            card.setBackground(bg);
            LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout info=vertical();
            TextView title=label(entry.title,15,"#FFF2F7",true);title.setMaxLines(1);
            info.addView(title);
            TextView artist=label(entry.artist,12,"#BFAEBC",false);artist.setMaxLines(1);info.addView(artist);
            String state=entry.complete()?"Downloaded · "+entry.format.toUpperCase():
                entry.status==DownloadManager.STATUS_FAILED?"Download failed":
                entry.status==DownloadManager.STATUS_PAUSED?"Paused — refresh":"Downloading / queued…";
            TextView status=label(state,10,entry.complete()?"#9FE4C0":"#EEB0CB",false);
            status.setPadding(0,dp(4),0,0);info.addView(status);
            line.addView(info,new LinearLayout.LayoutParams(0,-2,1));
            Button play=button("▶",true);play.setEnabled(entry.complete()&&entry.file(this).isFile());
            play.setOnClickListener(v->playSong(entry));
            line.addView(play,new LinearLayout.LayoutParams(dp(51),dp(45)));
            Button remove=button("×",false);remove.setContentDescription("Delete "+entry.title+" from this device");
            remove.setOnClickListener(v->new AlertDialog.Builder(this)
                .setTitle("Remove download?")
                .setMessage("Remove “"+entry.title+"” from this device? The song stays on the NAS.")
                .setNegativeButton("Cancel",null)
                .setPositiveButton("Remove",(d,w)->{OfflineStore.remove(this,entry);refresh();}).show());
            line.addView(remove,new LinearLayout.LayoutParams(dp(48),dp(45)));
            card.addView(line);
            LinearLayout.LayoutParams clp=new LinearLayout.LayoutParams(-1,-2);
            clp.bottomMargin=dp(9);list.addView(card,clp);
        }
    }
    private void createPlayer(){
        LinearLayout controls=vertical();
        controls.setPadding(dp(12),dp(12),dp(12),dp(10));
        android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable(
          android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT,
          new int[]{color("#3F293D"),color("#292130")});
        background.setCornerRadius(dp(18));controls.setBackground(background);
        nowPlaying=label("Choose a downloaded song",14,"#FFE7F1",true);
        nowPlaying.setMaxLines(1);controls.addView(nowPlaying);
        seekBar=new SeekBar(this);seekBar.setMax(1000);
        seekBar.setProgressTintList(android.content.res.ColorStateList.valueOf(color("#F393B2")));
        seekBar.setThumbTintList(android.content.res.ColorStateList.valueOf(color("#F393B2")));
        controls.addView(seekBar);
        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            @Override public void onProgressChanged(SeekBar s,int progress,boolean fromUser){}
            @Override public void onStartTrackingTouch(SeekBar s){}
            @Override public void onStopTrackingTouch(SeekBar s){
                if(controller!=null&&controller.getDuration()>0)
                    controller.seekTo(controller.getDuration()*s.getProgress()/1000);
            }
        });
        LinearLayout buttons=new LinearLayout(this);buttons.setGravity(Gravity.CENTER_VERTICAL);
        Button prev=button("❮❮",false);prev.setOnClickListener(v->{if(controller!=null)controller.seekToPreviousMediaItem();});
        buttons.addView(prev,new LinearLayout.LayoutParams(0,dp(45),1));
        playButton=button("▶ Play",true);
        playButton.setOnClickListener(v->{if(controller!=null){if(controller.isPlaying())controller.pause();else controller.play();updatePlayer();}});
        buttons.addView(playButton,new LinearLayout.LayoutParams(0,dp(45),1));
        Button next=button("❯❯",false);next.setOnClickListener(v->{if(controller!=null)controller.seekToNextMediaItem();});
        buttons.addView(next,new LinearLayout.LayoutParams(0,dp(45),1));
        timeLabel=label("00:00",11,"#BFAEBF",false);
        timeLabel.setGravity(Gravity.CENTER);
        buttons.addView(timeLabel,new LinearLayout.LayoutParams(0,dp(45),1));
        controls.addView(buttons);
        LinearLayout.LayoutParams pad=new LinearLayout.LayoutParams(-1,-2);pad.topMargin=dp(6);
        root.addView(controls,pad);
    }
    private void connectPlayer(){
        SessionToken token=new SessionToken(this,new ComponentName(this,PlaybackService.class));
        future=new MediaController.Builder(this,token).buildAsync();
        future.addListener(()->{
            try{
                controller=future.get();
                controller.addListener(new Player.Listener(){
                    @Override public void onIsPlayingChanged(boolean isPlaying){updatePlayer();}
                    @Override public void onMediaItemTransition(MediaItem item,int reason){updatePlayer();}
                });
                updatePlayer();
            }catch(Exception ignored){
                nowPlaying.setText("Offline player unavailable");
            }
        },this::runOnUiThread);
    }
    private void playSong(OfflineStore.Song selected){
        if(controller==null){android.widget.Toast.makeText(this,"Preparing offline player…",0).show();return;}
        List<MediaItem> items=new ArrayList<>();
        int selectedIndex=-1;
        for(OfflineStore.Song song:songs){
            File f=song.file(this);
            if(song.complete()&&f.isFile()&&f.length()>0){
                if(song.key.equals(selected.key))selectedIndex=items.size();
                MediaMetadata md=new MediaMetadata.Builder()
                    .setTitle(song.title).setArtist(song.artist).setAlbumTitle(song.album).build();
                items.add(new MediaItem.Builder().setUri(Uri.fromFile(f)).setMediaId(song.key)
                    .setMediaMetadata(md).build());
            }
        }
        if(selectedIndex<0)return;
        controller.setMediaItems(items,selectedIndex,0);
        controller.prepare();controller.play();updatePlayer();
    }
    private static String time(long ms){
        long sec=Math.max(0,ms/1000);
        return String.format(java.util.Locale.US,"%02d:%02d",sec/60,sec%60);
    }
    private void updatePlayer(){
        if(controller==null||nowPlaying==null)return;
        MediaItem item=controller.getCurrentMediaItem();
        nowPlaying.setText(item!=null&&item.mediaMetadata.title!=null?
            item.mediaMetadata.title:"Choose a downloaded song");
        playButton.setText(controller.isPlaying()?"❚❚ Pause":"▶ Play");
        long dur=controller.getDuration(),pos=controller.getCurrentPosition();
        if(dur!=C.TIME_UNSET&&dur>0){
            seekBar.setProgress((int)Math.max(0,Math.min(1000,pos*1000/dur)));
            timeLabel.setText(time(pos));
        }else{seekBar.setProgress(0);timeLabel.setText("00:00");}
    }
    @Override protected void onResume(){super.onResume();if(list!=null)refresh();}
    @Override protected void onDestroy(){
        handler.removeCallbacks(tick);
        if(future!=null)MediaController.releaseFuture(future);
        super.onDestroy();
    }
}
