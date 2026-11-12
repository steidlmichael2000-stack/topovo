package de.topovo.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Locale;

/** Reicht Dateien aus cache/teilen/ lesend an die App weiter, mit der geteilt wird (statt FileProvider aus AndroidX). */
public class Teilen extends ContentProvider {
    static final String STELLE = "de.topovo.app.teilen";

    static String sauber(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        return n.isEmpty() || n.startsWith(".") ? "Topovo" + n : n;
    }

    static String typ(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".kml")) return "application/vnd.google-earth.kml+xml";
        if (n.endsWith(".kmz")) return "application/vnd.google-earth.kmz";
        if (n.endsWith(".gpx")) return "application/gpx+xml";
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".zip")) return "application/zip";
        return "application/octet-stream";
    }

    File datei(Uri u) throws FileNotFoundException {
        try {
            File ordner = new File(getContext().getCacheDir(), "teilen").getCanonicalFile();
            File f = new File(ordner, sauber(u.getLastPathSegment())).getCanonicalFile();
            if (!ordner.equals(f.getParentFile()) || !f.isFile()) throw new FileNotFoundException(u.toString());
            return f;
        } catch (IOException e) {
            throw new FileNotFoundException(u.toString());
        }
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri u, String modus) throws FileNotFoundException {
        return ParcelFileDescriptor.open(datei(u), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri u) { return typ(u.getLastPathSegment() == null ? "" : u.getLastPathSegment()); }

    @Override
    public Cursor query(Uri u, String[] spalten, String auswahl, String[] args, String sortierung) {
        File f;
        try { f = datei(u); } catch (FileNotFoundException e) { return null; }
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    @Override public Uri insert(Uri u, ContentValues w) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri u, String a, String[] b) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri u, ContentValues w, String a, String[] b) { throw new UnsupportedOperationException(); }
}
