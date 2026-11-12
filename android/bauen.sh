#!/usr/bin/env bash
# Baut die Topovo-APK ohne Gradle: aapt2 → javac → d8 → zipalign → apksigner.
# Werkzeuge (JDK 17, Android-SDK) unter ~/.local/share/android-werkzeug, siehe README.md.
# Der Signierschlüssel liegt außerhalb des Repos (ins Backup!): ohne ihn lässt sich die App
# später nicht mehr über die installierte Fassung aktualisieren.
#
# Aufruf: android/bauen.sh   → android/bau/topovo.apk
set -euo pipefail
W="${ANDROID_WERKZEUG:-$HOME/.local/share/android-werkzeug}"
export JAVA_HOME="$W/jdk17" PATH="$W/jdk17/bin:$PATH"
SDK="$W/sdk"; BT="$SDK/build-tools/35.0.0"; JAR="$SDK/platforms/android-35/android.jar"
SCHL="${TOPOVO_SCHLUESSEL:-$HOME/.local/share/topovo-android/topovo.jks}"
PW="$(dirname "$SCHL")/passwort.txt"
hier="$(cd "$(dirname "$0")" && pwd)"; aus="$hier/bau"

[ -f "$JAR" ] && [ -x "$BT/aapt2" ] || { echo "Android-SDK fehlt unter $SDK (README.md)" >&2; exit 1; }

if [ ! -f "$SCHL" ]; then
  mkdir -p "$(dirname "$SCHL")"; chmod 700 "$(dirname "$SCHL")"
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$PW"; chmod 600 "$PW"
  keytool -genkeypair -keystore "$SCHL" -storetype PKCS12 -alias topovo -keyalg RSA -keysize 4096 \
    -validity 36500 -dname "CN=Topovo" -storepass:file "$PW" -keypass:file "$PW" >/dev/null
  chmod 600 "$SCHL"
  echo "Neuer Signierschlüssel: $SCHL (Passwort daneben) — ins Backup"
fi

rm -rf "$aus"; mkdir -p "$aus/klassen" "$aus/dex" "$aus/gen"
"$BT/aapt2" compile --dir "$hier/res" -o "$aus/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest "$hier/AndroidManifest.xml" -o "$aus/basis.apk" "$aus/res.zip" --java "$aus/gen"
javac -nowarn -source 11 -target 11 -encoding UTF-8 -classpath "$JAR" -d "$aus/klassen" \
  $(find "$hier/src" "$aus/gen" -name '*.java') 2>&1 | grep -v 'bootstrap class path\|^Hinweis\|^warning\|^1 warning\|^Warnung' || true
[ -f "$aus/klassen/de/topovo/app/Haupt.class" ] || { echo "javac fehlgeschlagen" >&2; exit 1; }
"$BT/d8" --release --min-api 29 --lib "$JAR" --output "$aus/dex" $(find "$aus/klassen" -name '*.class')
cp "$aus/basis.apk" "$aus/roh.apk"
(cd "$aus/dex" && zip -q -j "$aus/roh.apk" classes.dex)
"$BT/zipalign" -p -f 4 "$aus/roh.apk" "$aus/ausgerichtet.apk"
"$BT/apksigner" sign --ks "$SCHL" --ks-pass "file:$PW" --ks-key-alias topovo \
  --out "$aus/topovo.apk" "$aus/ausgerichtet.apk"
"$BT/apksigner" verify "$aus/topovo.apk"
echo "Fertig: $aus/topovo.apk ($(du -h "$aus/topovo.apk" | cut -f1))"
