#!/usr/bin/env bash
# Baut LibreDWG (GNU, GPLv3) als WebAssembly: nur dwg2dxf, für das Öffnen von DWG in Topovo
# (12.11.2026 gewünscht). Ergebnis: vendor/libredwg/dwg2dxf.js + dwg2dxf.wasm.
#
# Voraussetzungen (im Home, ohne sudo):
#   ~/.local/share/emsdk          Emscripten 6.0.13 (git clone emsdk; ./emsdk install/activate 6.0.13)
#   ~/.local/share/libredwg/dl    libredwg-0.14.tar.xz + .sig von ftp.gnu.org (Signatur geprüft
#                                 mit gnu-keyring.gpg, Reini Urban)
# LibreDWG braucht pkg-config nur für Zusätze, die hier aus sind — ohne pkg-config auf dem System
# hilft der Platzhalter unter ~/.local/share/libredwg/fake.
#
# STACK_SIZE=8MB ist Pflicht: Mit den 64 KB von Emscripten läuft LibreDWG über den Stapel in die
# eigenen Zeichenketten — die DXF hatte dann Gruppencodes ohne Werte (12.11.2026 gefunden).
#
# Nach jedem Neubau DWG_MODUL in dwg-werk.js hochzählen (Service Worker hält vendor/ fest).
#
# Aufruf: werkzeug/libredwg-bauen.sh
set -euo pipefail
VER=0.14
L="$HOME/.local/share/libredwg"
hier="$(cd "$(dirname "$0")/.." && pwd)"
ziel="$hier/vendor/libredwg"
# shellcheck disable=SC1091
source "$HOME/.local/share/emsdk/emsdk_env.sh" >/dev/null 2>&1
export PATH="$L/fake:$PATH"

rm -rf "$L/wasm"; mkdir -p "$L/wasm"
tar xJf "$L/dl/libredwg-$VER.tar.xz" -C "$L/wasm" --strip-components=1
cd "$L/wasm"
emconfigure ./configure --host=wasm32-unknown-emscripten --disable-shared --enable-static \
  --disable-bindings --disable-docs --disable-python \
  CFLAGS="-O2" > "$L/wasm-configure.log" 2>&1 || { tail -20 "$L/wasm-configure.log"; exit 1; }
emmake make -j"$(nproc)" -C src > "$L/wasm-make.log" 2>&1 || { tail -20 "$L/wasm-make.log"; exit 1; }
emcc -O2 -DHAVE_CONFIG_H -I. -Iinclude -Isrc programs/dwg2dxf.c src/.libs/libredwg.a -o "$ziel/dwg2dxf.js" \
  -sMODULARIZE=1 -sEXPORT_NAME=Dwg2Dxf -sENVIRONMENT=worker -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 \
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2gb -sSTACK_SIZE=8MB -sDYNAMIC_EXECUTION=0 -sFILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS -sFORCE_FILESYSTEM=1 -lm
cp COPYING "$ziel/COPYING"
cat > "$ziel/QUELLE.txt" <<TXT
LibreDWG $VER (GNU, GPLv3 oder später), als WebAssembly gebaut mit Emscripten 6.0.13
durch werkzeug/libredwg-bauen.sh (nur das Programm dwg2dxf).
Quelltext: https://ftp.gnu.org/gnu/libredwg/libredwg-$VER.tar.xz
Projekt:   https://www.gnu.org/software/libredwg/
TXT
ls -la "$ziel"
