package com.twosistersstudio.app;

// Two Sisters Studio tablet app.
// Opens the site's Add art page first (a photo catcher), and lets the girls look at the rest of the site.
// Amazon Kids' own browser will not let a web page use the camera or pick photos; inside this app the page can:
//   - "Take a photo" and "Choose photos" open the tablet's camera or photo picker (onShowFileChooser)
//   - "Camera with light" gets the live camera (onPermissionRequest)
// It only ever shows twosistersstudio.com; any other address is ignored.
import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
  static final String HOST = "twosistersstudio.com";
  static final String START = "https://" + HOST + "/upload/";
  static final int PICK = 1, ASK_CAMERA = 2;

  WebView web;
  ValueCallback<Uri[]> waiting;      // the page's "Take a photo" / "Choose photos", waiting for pictures
  Uri cameraOut;                     // where the camera app saves a new photo
  PermissionRequest liveCamera;      // the page's "Camera with light", waiting for the camera permission

  @Override protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    web = new WebView(this);
    web.setBackgroundColor(Color.parseColor("#fdf8ef"));
    setContentView(web);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);           // the page keeps unsent photos on the tablet (IndexedDB)
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setUserAgentString(s.getUserAgentString() + " TwoSistersApp/1");
    CookieManager.getInstance().setAcceptCookie(true);   // stay logged in

    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        return !("https".equals(u.getScheme()) && HOST.equals(u.getHost()));   // stay on the family site
      }
      @Override public void onPageFinished(WebView v, String url) { CookieManager.getInstance().flush(); }
    });

    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        if (waiting != null) waiting.onReceiveValue(null);
        waiting = cb;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
        Intent camera = cameraIntent();
        Intent go;
        if (p.isCaptureEnabled() && camera != null) go = camera;            // "Take a photo": straight to the camera
        else {
          go = Intent.createChooser(pick, "Pick a picture");                 // "Choose photos": photos, or the camera
          if (camera != null) go.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { camera });
        }
        try { startActivityForResult(go, PICK); }
        catch (Exception e) { waiting = null; return false; }
        return true;
      }
      @Override public void onPermissionRequest(PermissionRequest r) {
        if (!HOST.equals(r.getOrigin().getHost())) { r.deny(); return; }
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { r.grant(r.getResources()); return; }
        liveCamera = r;
        requestPermissions(new String[] { Manifest.permission.CAMERA }, ASK_CAMERA);
      }
    });

    if (saved != null) web.restoreState(saved); else web.loadUrl(START);
  }

  Intent cameraIntent() {
    Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
    if (i.resolveActivity(getPackageManager()) == null) return null;
    try {
      File dir = new File(getCacheDir(), "photos");
      dir.mkdirs();
      File f = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
      cameraOut = FileProvider.getUriForFile(this, "com.twosistersstudio.app.files", f);
      i.putExtra(MediaStore.EXTRA_OUTPUT, cameraOut);
      i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
      return i;
    } catch (Exception e) { return null; }
  }

  @Override protected void onActivityResult(int code, int result, Intent data) {
    super.onActivityResult(code, result, data);
    if (code != PICK || waiting == null) return;
    Uri[] out = null;
    if (result == RESULT_OK) {
      List<Uri> got = new ArrayList<>();
      if (data != null && data.getClipData() != null) {
        ClipData c = data.getClipData();
        for (int i = 0; i < c.getItemCount(); i++) got.add(c.getItemAt(i).getUri());
      } else if (data != null && data.getData() != null) got.add(data.getData());
      else if (cameraOut != null) got.add(cameraOut);                        // the camera saved to our file
      if (!got.isEmpty()) out = got.toArray(new Uri[0]);
    }
    waiting.onReceiveValue(out);
    waiting = null;
  }

  @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
    if (code != ASK_CAMERA || liveCamera == null) return;
    if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) liveCamera.grant(liveCamera.getResources());
    else liveCamera.deny();
    liveCamera = null;
  }

  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

  @Override public void onBackPressed() {
    if (web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
}
