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
# Nativer Entpacker für Laserkacheln (nativ/, Nativ.java): mit dem NDK für arm64, Teile parallel übersetzt.
# Seiten von 16 KB (Android 15+) mit max-page-size. Ohne NDK entsteht die APK ohne — die Seite entpackt dann selbst.
NDK="$(ls -d "$SDK"/ndk/*/ 2>/dev/null | sort -V | tail -1)"
if [ -n "$NDK" ]; then
  CXX="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android29-clang++"
  mkdir -p "$aus/nativ" "$aus/lib/arm64-v8a"
  find "$hier/nativ" -name '*.cpp' | xargs -P "$(nproc)" -I{} sh -c \
    '"$1" -O3 -DNDEBUG -std=c++17 -fPIC -fvisibility=hidden -I"$2" -c "$3" -o "$4/$(echo "$3" | md5sum | cut -c1-12).o"' _ "$CXX" "$hier/nativ" {} "$aus/nativ"
  "$CXX" -shared -static-libstdc++ -Wl,-z,max-page-size=16384 -Wl,--gc-sections -s "$aus"/nativ/*.o -o "$aus/lib/arm64-v8a/libtopovo.so"
  echo "Nativ: $(du -h "$aus/lib/arm64-v8a/libtopovo.so" | cut -f1)"
else
  echo "Kein NDK unter $SDK/ndk — APK ohne nativen Entpacker" >&2
fi
"$BT/d8" --release --min-api 29 --lib "$JAR" --output "$aus/dex" $(find "$aus/klassen" -name '*.class')
cp "$aus/basis.apk" "$aus/roh.apk"
(cd "$aus/dex" && zip -q -j "$aus/roh.apk" classes.dex)
[ -f "$aus/lib/arm64-v8a/libtopovo.so" ] && (cd "$aus" && zip -q -0 "$aus/roh.apk" lib/arm64-v8a/libtopovo.so)
"$BT/zipalign" -p -f 4 "$aus/roh.apk" "$aus/ausgerichtet.apk"
"$BT/apksigner" sign --ks "$SCHL" --ks-pass "file:$PW" --ks-key-alias topovo \
  --out "$aus/topovo.apk" "$aus/ausgerichtet.apk"
"$BT/apksigner" verify "$aus/topovo.apk"
echo "Fertig: $aus/topovo.apk ($(du -h "$aus/topovo.apk" | cut -f1))"

# Ablage in Google Drive (12.11.2026 gewünscht), Name mit versionName aus dem Manifest.
# Abschalten mit TOPOVO_DRIVE= (leer).
DRIVE="${TOPOVO_DRIVE-gdrive:Topovo APK}"
if [ -n "$DRIVE" ] && command -v rclone >/dev/null; then
  ver="$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$hier/AndroidManifest.xml")"
  rclone copyto "$aus/topovo.apk" "$DRIVE/Topovo-$ver.apk" && echo "In Drive: $DRIVE/Topovo-$ver.apk"
fi
