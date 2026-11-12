package de.topovo.app;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Laserkacheln nativ entpacken (Stufe 2, 12.11.2026; Schalter „Nativ“ in der Laserleiste).
 *
 * 1. Lädt laser-werk.js eine Kachel mit „?nativ=1“ von der Weiterleitung (Cloudflare-Worker), holt die
 *    App sie selbst und reicht sie unverändert an die Seite weiter — dabei schreibt sie eine Kopie in
 *    den Cache-Ordner (kachelAbgreifen). Liegt die Kopie schon da, kommt sie gleich von dort.
 * 2. Danach fragt laser-werk.js „…/topovo/_nativ/schneiden?kachel=…&X0=…“: libtopovo.so
 *    (nativ/laser_nativ.cpp, laz-perf in C++) entpackt die Kopie auf allen Kernen und schreibt die
 *    Punkte im Rechteck in eine Datei, die als Antwort zurückgeht (binär, ohne Base64).
 * Klappt etwas nicht (keine Bibliothek, keine Kopie, Fehler), antwortet die App mit 404/500 und die
 * Seite entpackt wie bisher selbst.
 */
final class Nativ {
    static final boolean DA;

    static {
        boolean d = false;
        try { System.loadLibrary("topovo"); d = true; } catch (Throwable t) { /* ohne Bibliothek: Seite entpackt selbst */ }
        DA = d;
    }

    static native long schneiden(String laz, String aus, int X0, int X1, int Y0, int Y1, int faeden);
    static native String fehler();

    /** So viel dürfen die Kopien zusammen belegen; die am längsten nicht gebrauchten gehen zuerst. */
    static final long VORRAT_MAX = 2_000_000_000L;
    static final Pattern KACHEL = Pattern.compile("^/laser/(\\d{3}_\\d{4})\\.laz$");
    static final Pattern NAME = Pattern.compile("^\\d{3}_\\d{4}$");

    static File ordner(Context c) {
        File o = new File(c.getCacheDir(), "laser");
        o.mkdirs();
        return o;
    }

    static WebResourceResponse abfangen(Context c, WebResourceRequest r) {
        if (!DA || !"GET".equals(r.getMethod())) return null;
        Uri u = r.getUrl();
        String pfad = u.getPath();
        if (pfad == null) return null;
        if (pfad.endsWith("/_nativ/schneiden")) return schneidenAntwort(c, u);
        if (!"1".equals(u.getQueryParameter("nativ")) || u.getHost() == null || !u.getHost().endsWith(".workers.dev")) return null;
        Matcher m = KACHEL.matcher(pfad);
        return m.matches() ? kachelAbgreifen(c, u, m.group(1)) : null;
    }

    static Map<String, String> kopf() {
        Map<String, String> k = new HashMap<>();
        k.put("Access-Control-Allow-Origin", "*");
        k.put("Cache-Control", "no-store");
        return k;
    }

    static WebResourceResponse text(int code, String grund, String text) {
        return new WebResourceResponse("text/plain", "utf-8", code, grund, kopf(),
                new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
    }

    /** Kachel holen und dabei mitschreiben; null = die WebView holt sie selbst (Netzfehler beim Verbinden). */
    static WebResourceResponse kachelAbgreifen(Context c, Uri u, String name) {
        File ziel = new File(ordner(c), name + ".laz");
        try {
            if (ziel.isFile() && ziel.length() > 375) {
                ziel.setLastModified(System.currentTimeMillis());
                Map<String, String> k = kopf();
                k.put("Content-Length", String.valueOf(ziel.length()));
                return new WebResourceResponse("application/octet-stream", null, 200, "OK", k, new FileInputStream(ziel));
            }
            String ohne = u.buildUpon().clearQuery().build().toString();
            HttpURLConnection v = (HttpURLConnection) new URL(ohne).openConnection();
            v.setConnectTimeout(20000);
            v.setReadTimeout(60000);
            int code = v.getResponseCode();
            Map<String, String> k = kopf();
            if (code != 200) {
                InputStream fehler = v.getErrorStream();
                return new WebResourceResponse("text/plain", "utf-8", code, grund(code), k,
                        fehler != null ? fehler : new ByteArrayInputStream(new byte[0]));
            }
            // Gepackt unterwegs entpackt HttpURLConnection selbst — die Länge stimmt dann nicht mehr
            long laenge = v.getHeaderField("Content-Encoding") == null ? v.getContentLengthLong() : -1;
            if (laenge > 0) k.put("Content-Length", String.valueOf(laenge));
            File teil = new File(ordner(c), name + ".teil");
            return new WebResourceResponse("application/octet-stream", null, 200, "OK", k,
                    new Mitschreiben(v.getInputStream(), teil, ziel, laenge, c));
        } catch (IOException e) {
            return null;
        }
    }

    static String grund(int code) {
        switch (code) {
            case 404: return "Not Found";
            case 429: return "Too Many Requests";
            default: return "Error";
        }
    }

    /** Reicht die Bytes durch und schreibt sie in teil; vollständig gelesen wird daraus ziel. */
    static final class Mitschreiben extends FilterInputStream {
        final File teil, ziel;
        final long laenge;
        final Context c;
        FileOutputStream aus;
        long zahl;
        boolean fertig;

        Mitschreiben(InputStream ein, File teil, File ziel, long laenge, Context c) throws IOException {
            super(ein);
            this.teil = teil;
            this.ziel = ziel;
            this.laenge = laenge;
            this.c = c;
            aus = new FileOutputStream(teil);
        }

        @Override public int read() throws IOException {
            byte[] b = new byte[1];
            int n = read(b, 0, 1);
            return n < 0 ? -1 : b[0] & 0xff;
        }

        @Override public int read(byte[] b, int o, int n) throws IOException {
            int r = super.read(b, o, n);
            if (r > 0 && aus != null) {
                try { aus.write(b, o, r); zahl += r; } catch (IOException e) { verwerfen(); }   // Platz voll: nur nicht mitschreiben
            } else if (r < 0 && aus != null) {
                aus.close();
                aus = null;
                if ((laenge < 0 || zahl == laenge) && zahl > 375 && teil.renameTo(ziel)) {
                    fertig = true;
                    aufraeumen(c, ziel);
                } else teil.delete();
            }
            return r;
        }

        void verwerfen() {
            try { if (aus != null) aus.close(); } catch (IOException ignoriert) { }
            aus = null;
            teil.delete();
        }

        @Override public void close() throws IOException {
            if (!fertig) verwerfen();        // abgebrochen: keine halbe Kopie liegen lassen
            super.close();
        }
    }

    static void aufraeumen(Context c, File behalten) {
        File[] l = ordner(c).listFiles((d, n) -> n.endsWith(".laz"));
        if (l == null) return;
        Arrays.sort(l, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        long summe = 0;
        for (File f : l) {
            summe += f.length();
            if (summe > VORRAT_MAX && !f.equals(behalten)) f.delete();
        }
    }

    /** Punkte im Rechteck aus der Kopie (Format siehe laser_nativ.cpp). Läuft im eigenen Faden, die Antwort steht sofort. */
    static WebResourceResponse schneidenAntwort(Context c, Uri u) {
        String name = u.getQueryParameter("kachel");
        if (name == null || !NAME.matcher(name).matches()) return text(400, "Bad Request", "kachel fehlt");
        File laz = new File(ordner(c), name + ".laz");
        if (!laz.isFile()) return text(404, "Not Found", "keine Kopie von " + name);
        int X0, X1, Y0, Y1;
        try {
            X0 = Integer.parseInt(u.getQueryParameter("X0")); X1 = Integer.parseInt(u.getQueryParameter("X1"));
            Y0 = Integer.parseInt(u.getQueryParameter("Y0")); Y1 = Integer.parseInt(u.getQueryParameter("Y1"));
        } catch (RuntimeException e) { return text(400, "Bad Request", "Rechteck fehlt"); }
        laz.setLastModified(System.currentTimeMillis());
        Map<String, String> k = kopf();
        return new WebResourceResponse("application/octet-stream", null, 200, "OK", k,
                new Schnitt(laz, ordner(c), X0, X1, Y0, Y1));
    }

    /** Startet das Schneiden gleich, liefert die Ergebnisdatei, sobald sie fertig ist. */
    static final class Schnitt extends InputStream {
        final Thread faden;
        volatile InputStream datei;
        volatile String fehler;

        Schnitt(File laz, File ordner, int X0, int X1, int Y0, int Y1) {
            faden = new Thread(() -> {
                File aus = null;
                try {
                    aus = File.createTempFile("schnitt", ".tpn", ordner);
                    long n = schneiden(laz.getPath(), aus.getPath(), X0, X1, Y0, Y1, Runtime.getRuntime().availableProcessors());
                    if (n < 0) fehler = fehler();
                    else datei = new FileInputStream(aus);
                } catch (Throwable t) {
                    fehler = String.valueOf(t);
                } finally {
                    if (aus != null) aus.delete();   // offen bleibt sie lesbar, danach ist der Platz frei
                }
            }, "topovo-schnitt");
            faden.start();
        }

        InputStream warten() throws IOException {
            try { faden.join(); } catch (InterruptedException e) { throw new IOException("unterbrochen"); }
            if (datei == null) throw new IOException("nativ: " + fehler);
            return datei;
        }

        @Override public int read() throws IOException { return warten().read(); }
        @Override public int read(byte[] b, int o, int n) throws IOException { return warten().read(b, o, n); }
        @Override public void close() throws IOException {
            try { faden.join(); } catch (InterruptedException ignoriert) { }
            if (datei != null) datei.close();
        }
    }
}
