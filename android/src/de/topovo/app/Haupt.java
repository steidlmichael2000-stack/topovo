package de.topovo.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;

/**
 * Topovo als App: ein randloser WebView um die Live-Seite. Die Karte läuft unter Status- und
 * Gestenleiste durch; deren Höhe geht als CSS-Pixel an die Seite (TopovoAndroid.raender(),
 * window.androidRaender), die damit --sa-oben/--sa-unten setzt. Updates kommen wie bisher über
 * GitHub Pages, die App selbst muss dafür nicht neu.
 */
public class Haupt extends Activity {
    static final String START = "https://steidlmichael2000-stack.github.io/topovo/";
    static final String HOST = "steidlmichael2000-stack.github.io";
    static final String PFAD = "/topovo";
    static final int DATEI_WAHL = 1, ORT_RECHT = 2;

    WebView web;
    float oben, unten;
    ValueCallback<Uri[]> dateiRueckruf;
    GeolocationPermissions.Callback ortRueckruf;
    String ortHerkunft;

    @Override
    protected void onCreate(Bundle stand) {
        super.onCreate(stand);
        Window w = getWindow();
        w.setDecorFitsSystemWindows(false);   // randlos (ab Android 15 ohnehin Pflicht)
        if (Build.VERSION.SDK_INT >= 30) w.getAttributes().layoutInDisplayCutoutMode =
                android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;

        web = new WebView(this);
        web.setBackgroundColor(0xff14181d);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);   // target=_blank landet in shouldOverrideUrlLoading
        s.setTextZoom(100);                   // Systemschriftgröße würde sonst die Leisten sprengen
        s.setUserAgentString(s.getUserAgentString() + " TopovoAndroid/1");

        web.addJavascriptInterface(new Bruecke(), "TopovoAndroid");

        web.setOnApplyWindowInsetsListener((v, ins) -> {
            Insets i = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            float d = getResources().getDisplayMetrics().density;
            oben = i.top / d;
            unten = i.bottom / d;
            raenderSenden();
            return ins;
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("https".equals(u.getScheme()) && HOST.equals(u.getHost())
                        && u.getPath() != null && u.getPath().startsWith(PFAD)) return false;
                aussenOeffnen(u);
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) { raenderSenden(); }

            @Override
            public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
                // Der Seitenprozess ist weg (Speicher): neu aufbauen statt abzustürzen
                recreate();
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String herkunft, GeolocationPermissions.Callback cb) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(herkunft, true, false);
                    return;
                }
                ortRueckruf = cb;
                ortHerkunft = herkunft;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION}, ORT_RECHT);
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (dateiRueckruf != null) dateiRueckruf.onReceiveValue(null);
                dateiRueckruf = cb;
                // Alle Dateien zeigen: Android kennt für KML, GPX und DXF oft keinen Typ und blendet sie sonst aus
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(i, "Datei öffnen"), DATEI_WAHL);
                } catch (ActivityNotFoundException e) {
                    dateiRueckruf = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest r) { r.deny(); }
        });

        // Echte Downloads (keine blob:, die laufen über die Brücke) öffnet der Browser
        web.setDownloadListener((url, ua, cd, mime, laenge) -> aussenOeffnen(Uri.parse(url)));

        if (stand != null) web.restoreState(stand);
        else web.loadUrl(START);
    }

    void raenderSenden() {
        if (web == null) return;
        String js = String.format(Locale.ROOT,
                "window.androidRaender&&window.androidRaender({oben:%.2f,unten:%.2f})", oben, unten);
        web.post(() -> web.evaluateJavascript(js, null));
    }

    void aussenOeffnen(Uri u) {
        try {
            Intent i = "intent".equals(u.getScheme())
                    ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.setComponent(null);
            i.setSelector(null);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Keine App für diesen Link", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int code, int ergebnis, Intent daten) {
        if (code == DATEI_WAHL && dateiRueckruf != null) {
            Uri[] uris = null;
            if (ergebnis == RESULT_OK && daten != null) {
                if (daten.getClipData() != null) {
                    int n = daten.getClipData().getItemCount();
                    uris = new Uri[n];
                    for (int k = 0; k < n; k++) uris[k] = daten.getClipData().getItemAt(k).getUri();
                } else if (daten.getData() != null) uris = new Uri[]{daten.getData()};
            }
            dateiRueckruf.onReceiveValue(uris);
            dateiRueckruf = null;
            return;
        }
        super.onActivityResult(code, ergebnis, daten);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] rechte, int[] ergebnisse) {
        if (code == ORT_RECHT && ortRueckruf != null) {
            boolean ja = false;
            for (int e : ergebnisse) ja |= e == PackageManager.PERMISSION_GRANTED;
            ortRueckruf.invoke(ortHerkunft, ja, false);
            ortRueckruf = null;
        }
    }

    @Override
    public void onBackPressed() {
        // Die Seite fängt Zurück über ihre Wache im Verlauf ab (Leisten schließen, 3D-Ansicht)
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle aus) {
        super.onSaveInstanceState(aus);
        web.saveState(aus);
    }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    /** Was die Seite aufrufen kann (window.TopovoAndroid). Läuft nicht im UI-Faden. */
    class Bruecke {
        final HashMap<Integer, Ausgabe> offen = new HashMap<>();
        int naechste = 1;

        class Ausgabe {
            OutputStream aus;
            Uri download;     // in Downloads, sonst Teilen
            File datei;
            String name, mime;
        }

        @JavascriptInterface
        public String raender() {
            return String.format(Locale.ROOT, "{\"oben\":%.2f,\"unten\":%.2f}", oben, unten);
        }

        @JavascriptInterface
        public synchronized int beginn(String name, String mime, boolean teilen) {
            try {
                Ausgabe a = new Ausgabe();
                a.name = Teilen.sauber(name);
                a.mime = mime == null || mime.isEmpty() ? Teilen.typ(a.name) : mime;
                if (teilen) {
                    File ordner = new File(getCacheDir(), "teilen");
                    File[] alt = ordner.listFiles();
                    if (alt != null) for (File f : alt) f.delete();   // nur die letzte geteilte Datei behalten
                    ordner.mkdirs();
                    a.datei = new File(ordner, a.name);
                    a.aus = new FileOutputStream(a.datei);
                } else {
                    ContentValues w = new ContentValues();
                    w.put(MediaStore.MediaColumns.DISPLAY_NAME, a.name);
                    w.put(MediaStore.MediaColumns.MIME_TYPE, a.mime);
                    w.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    ContentResolver cr = getContentResolver();
                    a.download = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, w);
                    if (a.download == null) return -1;
                    a.aus = cr.openOutputStream(a.download);
                }
                int id = naechste++;
                offen.put(id, a);
                return id;
            } catch (Exception e) {
                return -1;
            }
        }

        @JavascriptInterface
        public synchronized boolean teil(int id, String b64) {
            Ausgabe a = offen.get(id);
            if (a == null) return false;
            try {
                a.aus.write(Base64.decode(b64, Base64.DEFAULT));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public synchronized void abbrechen(int id) {
            Ausgabe a = offen.remove(id);
            if (a == null) return;
            try { a.aus.close(); } catch (Exception ignoriert) { }
            if (a.download != null) getContentResolver().delete(a.download, null, null);
            if (a.datei != null) a.datei.delete();
        }

        @JavascriptInterface
        public synchronized void ende(int id) {
            Ausgabe a = offen.remove(id);
            if (a == null) return;
            try { a.aus.close(); } catch (Exception ignoriert) { }
            if (a.download != null) {
                ContentValues w = new ContentValues();
                w.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContentResolver().update(a.download, w, null, null);
                runOnUiThread(() -> Toast.makeText(Haupt.this, "In Downloads gespeichert: " + a.name, Toast.LENGTH_LONG).show());
            } else {
                Uri u = new Uri.Builder().scheme("content").authority(Teilen.STELLE).appendPath(a.name).build();
                Intent i = new Intent(Intent.ACTION_SEND).setType(a.mime).putExtra(Intent.EXTRA_STREAM, u)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                i.setClipData(android.content.ClipData.newRawUri(a.name, u));
                runOnUiThread(() -> startActivity(Intent.createChooser(i, a.name)));
            }
        }

        @JavascriptInterface
        public void teilenText(String titel, String text) {
            Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, titel).putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(i, titel)));
        }
    }
}
