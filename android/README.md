# Topovo als Android-App

Ein randloser WebView um die Live-Seite (12.11.2026 gewünscht: Karte unter der Statusleiste wie
Google Maps — eine installierte PWA darf die Statusleiste unter Android nicht durchsichtig machen).
Die App lädt `https://steidlmichael2000-stack.github.io/topovo/`; Updates der Seite kommen wie
bisher, die APK muss nur neu, wenn sich hier etwas ändert.

- `Haupt.java`: randlos, Höhe von Status-/Gestenleiste als CSS-Pixel an die Seite
  (`TopovoAndroid.raender()`, `window.androidRaender` → `--sa-oben`/`--sa-unten` in `style.css`).
  Fremde Links in der passenden App, Zurück im Verlauf der Seite, Standort mit Android-Recht,
  Dateiauswahl ohne Typfilter (KML/GPX/DXF kennt Android oft nicht).
- Downloads (`a[download]` mit blob:) und `navigator.share` kann der WebView nicht — app.js reicht
  die Dateien in 3-MB-Stücken als Base64 an die Brücke (`beginn`/`teil`/`ende`), gespeichert unter
  Downloads (MediaStore) bzw. geteilt über `Teilen.java` (eigener ContentProvider statt AndroidX).
- „Öffnen mit“ und Teilen an Topovo (KML, KMZ, GPX, DXF; Filter nach MIME, auch octet-stream/XML, weil
  Android die Typen oft nicht kennt): `eingangAufnehmen` liest die Datei sofort (bis 100 MB), die Seite holt
  sie über `eingang`/`eingangTeil`/`eingangFertig` ab (`androidEingang` in app.js) → `kmlOeffnen`.
- Icon: maskable-Grafik auf die sichtbaren 72 von 108 dp verkleinert, Rand mit den Randpixeln verlängert.
- Keine Bibliotheken, kein Gradle: `./bauen.sh` (aapt2, javac, d8, zipalign, apksigner).
- **Debugging vom Laptop** (1.3, 12.11.2026, so gewünscht drin gelassen): `setWebContentsDebuggingEnabled(true)` — nur
  über USB mit eingeschaltetem USB-Debugging und am Handy bestätigtem Rechner. Seite fernsteuern:
  `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`, dann CDP (`/json`, `Runtime.evaluate`).
  `res/xml/netz.xml` erlaubt http **nur** zu `localhost`: mit `adb reverse tcp:5192 tcp:5192` lässt sich die lokale
  Fassung in der App öffnen, bevor sie gepusht ist. Vor einer Weitergabe der App das Debugging wieder ausbauen.

Werkzeuge unter `~/.local/share/android-werkzeug/`: JDK 17 (Temurin) und Android-SDK
(cmdline-tools, `platforms;android-35`, `build-tools;35.0.0`, `platform-tools`), Lizenz vom Nutzer
angenommen. **Signierschlüssel** `~/.local/share/topovo-android/topovo.jks` + `passwort.txt` — ins
Backup; ohne ihn lässt sich die installierte App nicht aktualisieren. Bei neuer Fassung
`versionCode` im Manifest hochzählen.
