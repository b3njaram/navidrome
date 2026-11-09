
package com.jobbisoft.music;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.widget.ImageView;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.TextUtils;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.JavaScriptReplyProxy;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Online: exact Jobbi Music React UI, Offline: native persistent downloaded library. */
public final class MainActivity extends Activity {
    private static final String DEFAULT_SERVER="http://nasjobbi:3131";
    private static final int PICK_FILE=7024;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private WebView web;
    private LinearLayout root;
    private String serverUrl;
    private android.webkit.ValueCallback<Uri[]> fileChooser;
    private boolean connectionErrorShown=false;

    static int dp(Context c,float value){return (int)(value*c.getResources().getDisplayMetrics().density+0.5f);}
    static int color(String hex){return Color.parseColor(hex);}
    static TextView text(Context context,String value,int sp,int shade,boolean bold){
        TextView label=new TextView(context);
        label.setText(value);label.setTextSize(sp);label.setTextColor(shade);
        if(bold)label.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        return label;
    }
    private void toast(String text){runOnUiThread(()->Toast.makeText(this,text,Toast.LENGTH_LONG).show());}
    @Override public void onCreate(Bundle savedInstanceState){
        super.onCreate(savedInstanceState);
        // Android 15+ draws activities behind system bars. Reserve real safe-area
        // insets instead of letting the status icons cover the app toolbar.
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView()).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView()).setAppearanceLightNavigationBars(false);
        getWindow().setStatusBarColor(color("#17131D"));
        getWindow().setNavigationBarColor(color("#17131D"));
        serverUrl=getPreferences(MODE_PRIVATE).getString("server",DEFAULT_SERVER);
        if(!validServer(serverUrl))serverUrl=DEFAULT_SERVER;
        root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(color("#17131D"));
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root,(v,insets)->{
            Insets safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() |
                WindowInsetsCompat.Type.displayCutout());
            root.setPadding(safe.left,safe.top,safe.right,safe.bottom);
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
        createShell();
        loadServer();
    }
    private void createShell(){
        LinearLayout bar=new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(this,14),dp(this,4),dp(this,12),dp(this,4));
        bar.setBackgroundColor(color("#17131D"));
        bar.setMinimumHeight(dp(this,56));

        ImageView logo=new ImageView(this);
        logo.setImageResource(R.drawable.ic_wave_mark);
        logo.setContentDescription("Jobbi Music");
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams logoParams=new LinearLayout.LayoutParams(dp(this,30),dp(this,30));
        logoParams.rightMargin=dp(this,8);
        bar.addView(logo,logoParams);

        SpannableString brand=new SpannableString("jobbi music");
        brand.setSpan(new ForegroundColorSpan(color("#F49DBF")),6,11,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        TextView name=text(this,"",18,color("#F5E5EF"),true);
        name.setText(brand);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        name.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(name,new LinearLayout.LayoutParams(0,dp(this,44),1));

        TextView offline=text(this,"Offline",12,color("#F4C7DB"),true);
        offline.setGravity(Gravity.CENTER);
        offline.setCompoundDrawablePadding(dp(this,5));
        offline.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_download_small,0,0,0);
        offline.setPadding(dp(this,10),0,dp(this,10),0);
        GradientDrawable offlineBg=new GradientDrawable();
        offlineBg.setColor(color("#382735"));
        offlineBg.setCornerRadius(dp(this,12));
        offlineBg.setStroke(dp(this,1),color("#70465F"));
        offline.setBackground(offlineBg);
        offline.setContentDescription("Open downloaded songs");
        offline.setOnClickListener(v->openOffline());
        bar.addView(offline,new LinearLayout.LayoutParams(-2,dp(this,38)));

        ImageView settings=new ImageView(this);
        settings.setImageResource(R.drawable.ic_settings_small);
        settings.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        settings.setPadding(dp(this,11),dp(this,11),dp(this,11),dp(this,11));
        settings.setContentDescription("Change Jobbi Music server");
        settings.setOnClickListener(v->chooseServer());
        LinearLayout.LayoutParams settingsParams=new LinearLayout.LayoutParams(dp(this,44),dp(this,44));
        settingsParams.leftMargin=dp(this,4);
        bar.addView(settings,settingsParams);
        root.addView(bar,new LinearLayout.LayoutParams(-1,dp(this,56)));
    }
    private Button barButton(String text){
        Button b=new Button(this);
        b.setText(text);b.setTextSize(12);
        b.setTextColor(color("#F6D1E1"));
        b.setAllCaps(false);
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(color("#362736")));
        return b;
    }
    private static boolean validServer(String input){
        try{
            URI uri=new URI(input.trim());
            if(uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null)return false;
            if(uri.getRawPath()!=null&&!uri.getRawPath().isEmpty()&&!uri.getRawPath().equals("/"))return false;
            String host=uri.getHost();
            if(host==null||host.length()>253)return false;
            if("https".equalsIgnoreCase(uri.getScheme()))return true;
            return "http".equalsIgnoreCase(uri.getScheme())&&
                (host.equalsIgnoreCase("nasjobbi")||host.equals("192.168.1.20"));
        }catch(Exception e){return false;}
    }
    private void chooseServer(){
        EditText field=new EditText(this);
        field.setSingleLine(true);
        field.setText(serverUrl);
        field.setSelectAllOnFocus(true);
        field.setTextColor(color("#FFE5F0"));
        field.setHint("https://music.example.com");
        LinearLayout container=new LinearLayout(this);
        container.setPadding(dp(this,22),dp(this,10),dp(this,22),dp(this,6));
        container.addView(field,new LinearLayout.LayoutParams(-1,-2));
        new AlertDialog.Builder(this)
            .setTitle("Connect to your music server")
            .setMessage("Use HTTPS for public access, or your private Tailscale/LAN NAS address.")
            .setView(container)
            .setNegativeButton("Cancel",null)
            .setNeutralButton("Offline library",(d,w)->openOffline())
            .setPositiveButton("Connect",(d,w)->{
                String url=field.getText().toString().trim().replaceAll("/+$","");
                if(!validServer(url)){toast("Use HTTPS, or http://nasjobbi:3131 for your private NAS.");return;}
                serverUrl=url;
                getPreferences(MODE_PRIVATE).edit().putString("server",url).apply();
                loadServer();
            }).show();
    }
    private void loadServer(){
        connectionErrorShown=false;
        if(web!=null){
            root.removeView(web);
            web.loadUrl("about:blank");
            web.destroy();
        }
        web=new WebView(this);
        web.setBackgroundColor(color("#17131D"));
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);
        // Honor the page viewport width; never scale a desktop layout into a phone.
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);
        settings.setSaveFormData(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        if(android.os.Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);
        final String expectedOrigin=serverUrl;
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            WebViewCompat.addWebMessageListener(web,"JobbiAndroid",
                Collections.singleton(expectedOrigin),
                (view,message,origin,isMainFrame,reply)->{
                    if(!isMainFrame||!expectedOrigin.equals(origin.toString()))return;
                    if(message.getType()!=WebMessageCompat.TYPE_STRING)return;
                    try{handleBridge(new JSONObject(message.getData()));}
                    catch(Exception ignored){toast("Invalid app request");}
                });
        }
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri url=request.getUrl();
                if(url==null)return true;
                String scheme=url.getScheme();
                if(!"https".equalsIgnoreCase(scheme)&&!"http".equalsIgnoreCase(scheme))return true;
                if(sameOrigin(url.toString(),serverUrl))return false;
                if(request.isForMainFrame()&&request.hasGesture()){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,url));}catch(Exception ignored){}
                }
                return true;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){
                if(req.isForMainFrame()&&!connectionErrorShown){
                    connectionErrorShown=true;
                    runOnUiThread(()->new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Music server unavailable")
                        .setMessage("Your NAS may be offline or Tailscale may be disconnected. Your saved songs are still available.")
                        .setPositiveButton("Offline music",(d,w)->openOffline())
                        .setNeutralButton("Change server",(d,w)->chooseServer())
                        .setNegativeButton("Retry",(d,w)->web.reload())
                        .show());
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView w,android.webkit.ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileChooser!=null)fileChooser.onReceiveValue(null);
                fileChooser=callback;
                try{startActivityForResult(params.createIntent(),PICK_FILE);return true;}
                catch(Exception e){fileChooser=null;return false;}
            }
        });
        root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        web.loadUrl(serverUrl+"/");
    }
    private static boolean sameOrigin(String candidate,String expected){
        try{
            URI a=new URI(candidate),b=new URI(expected);
            int ap=a.getPort()<0?("https".equals(a.getScheme())?443:80):a.getPort();
            int bp=b.getPort()<0?("https".equals(b.getScheme())?443:80):b.getPort();
            return a.getScheme().equalsIgnoreCase(b.getScheme())&&a.getHost().equalsIgnoreCase(b.getHost())&&ap==bp;
        }catch(Exception e){return false;}
    }
    private void handleBridge(JSONObject payload){
        String type=payload.optString("type");
        if("openOffline".equals(type))openOffline();
        else if("download".equals(type))saveTrack(payload.optJSONObject("track"),payload.optString("quality","original"));
        else if("syncSession".equals(type))io.execute(()->getVerifiedUsername());
    }
    private String getVerifiedUsername(){
        HttpURLConnection c=null;
        try{
            String cookies=CookieManager.getInstance().getCookie(serverUrl);
            if(cookies==null||cookies.isEmpty())return null;
            c=(HttpURLConnection)new URL(serverUrl+"/api/session").openConnection();
            c.setConnectTimeout(9000);c.setReadTimeout(9000);
            c.setRequestProperty("Cookie",cookies);
            c.setRequestProperty("Accept","application/json");
            c.setInstanceFollowRedirects(false);
            if(c.getResponseCode()!=200)return null;
            StringBuilder s=new StringBuilder();
            try(BufferedReader br=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
                String line;while((line=br.readLine())!=null&&s.length()<4096)s.append(line);
            }
            String username=new JSONObject(s.toString()).optString("username","");
            if(username.isEmpty())return null;
            OfflineStore.setLastUser(this,username);
            return username.toLowerCase(java.util.Locale.ROOT);
        }catch(Exception ignored){return null;}
        finally{if(c!=null)c.disconnect();}
    }
    private static String limited(String raw,int max,String fallback){
        if(raw==null||raw.isBlank())return fallback;
        return raw.length()<=max?raw:raw.substring(0,max);
    }
    private void saveTrack(JSONObject track,String rawQuality){
        if(track==null){toast("Select a song first");return;}
        final String trackId=track.optString("id","");
        if(trackId.length()<1||trackId.length()>180){toast("Invalid track");return;}
        final String title=limited(track.optString("title"),200,"Unknown song");
        final String artist=limited(track.optString("artist"),200,"Unknown artist");
        final String album=limited(track.optString("album"),200,"");
        final String quality=rawQuality.equals("saver")?"saver":rawQuality.equals("balanced")?"balanced":"original";
        String suffix=track.optString("suffix","mp3").replace(".","");
        if(!suffix.matches("(?i)mp3|flac|m4a|aac|ogg|opus|wav|aif|aiff|alac|wma"))suffix="mp3";
        final String ext=quality.equals("original")?suffix:"mp3";
        io.execute(()->{
            String user=getVerifiedUsername();
            if(user==null){toast("Sign in to Jobbi Music before downloading.");return;}
            if(OfflineStore.alreadySaving(this,user,trackId)){toast("This song is already saved or downloading.");return;}
            try{
                String name=OfflineStore.newFileName(ext);
                String url=serverUrl+"/api/stream/"+URLEncoder.encode(trackId,"UTF-8")+"?quality="+quality;
                String cookies=CookieManager.getInstance().getCookie(serverUrl);
                if(cookies==null||cookies.isEmpty())throw new Exception("No active session");
                DownloadManager.Request request=new DownloadManager.Request(Uri.parse(url));
                request.setTitle(title);
                request.setDescription("Jobbi Music · "+artist);
                request.setMimeType(ext.equals("flac")?"audio/flac":"audio/mpeg");
                request.addRequestHeader("Cookie",cookies);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(false);
                request.setDestinationInExternalFilesDir(this,Environment.DIRECTORY_MUSIC,name);
                DownloadManager dm=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);
                if(dm==null)throw new Exception("Android DownloadManager unavailable");
                long id=dm.enqueue(request);
                OfflineStore.create(this,user,trackId,title,artist,album,ext,quality,id,name);
                toast("Saving "+title+" · Open Offline to see progress.");
            }catch(Exception e){toast("Download could not start: "+limited(e.getMessage(),100,"Please retry"));}
        });
    }
    private void openOffline(){startActivity(new Intent(this,OfflineActivity.class));}
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==PICK_FILE&&fileChooser!=null){
            Uri[] result=WebChromeClient.FileChooserParams.parseResult(resultCode,data);
            fileChooser.onReceiveValue(result);fileChooser=null;
        }
    }
    @Override public void onBackPressed(){
        if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();
    }
    @Override protected void onDestroy(){
        if(web!=null){web.destroy();web=null;}
        io.shutdown();
        super.onDestroy();
    }
}
