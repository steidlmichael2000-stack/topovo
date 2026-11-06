#!/usr/bin/env python3
"""KOSTRA-DWD-2020 für den Regen in der Laseransicht (regen.js) aufbereiten.

Holt vom Open-Data-Server des DWD die Niederschlagshöhen Hn (mm) je
Dauerstufe und Jährlichkeit als ASCII-Raster (5 km, ETRS89-LAEA = EPSG:3035,
300 × 300 Zellen) und legt sie in Blöcken zu 10 × 10 Zellen (50 km) unter
kostra/ ab — die App lädt nur den Block der Stelle (rund 23 kB).

Aufbau eines Blocks kostra/{bx}_{by}.bin: Uint16 little endian, Hn × 10,
in der Reihenfolge [Zeile im Block (von Süden)][Spalte][Dauer][Jährlichkeit],
65535 = keine Angabe (außerhalb Deutschlands). Was dazu gehört, steht in
kostra/index.json.

Quelle: Deutscher Wetterdienst, KOSTRA-DWD-2020 (Stand der Dateien
Dezember 2022), Nutzung nach GeoNutzV mit Quellenvermerk.

Aufruf: python3 werkzeug/kostra-bauen.py   (aus dem Ordner trackpilot/)
"""
import io
import json
import struct
import sys
import urllib.request
import zipfile
from pathlib import Path

BASIS = ('https://opendata.dwd.de/climate_environment/CDC/grids_germany/'
         'return_periods/precipitation/KOSTRA/KOSTRA_DWD_2020/asc/')
# Dauerstufen in Minuten: 15 min bis 24 h (länger regnet es in der Ansicht nicht)
DAUERN = [15, 30, 45, 60, 90, 120, 180, 240, 360, 540, 720, 1080, 1440]
JAHRE = [1, 2, 3, 5, 10, 20, 30, 50, 100]
BLOCK = 10
LEER = 65535


def raster_lesen(text):
    zeilen = text.splitlines()
    kopf = {}
    for z in zeilen[:6]:
        k, v = z.split()
        kopf[k.lower()] = float(v)
    werte = [[float(v) for v in z.split()] for z in zeilen[6:] if z.strip()]
    return kopf, werte


def main():
    ziel = Path(__file__).resolve().parent.parent / 'kostra'
    ziel.mkdir(exist_ok=True)
    gitter = None
    # hn[dauer][jahr] = Zeilen von Norden nach Süden
    hn = []
    for dauer in DAUERN:
        name = f'StatRR_KOSTRA-DWD-2020_D{dauer:05d}_ASC.zip'
        print('hole', name, file=sys.stderr)
        with urllib.request.urlopen(BASIS + name, timeout=120) as antwort:
            zipdaten = zipfile.ZipFile(io.BytesIO(antwort.read()))
        je_jahr = []
        for jahr in JAHRE:
            datei = f'Hn_KOSTRA-DWD-2020_D{dauer:05d}_T{jahr:03d}.asc'
            kopf, werte = raster_lesen(zipdaten.read(datei).decode('ascii'))
            if gitter is None:
                gitter = kopf
            elif kopf != gitter:
                sys.exit(f'{datei}: anderes Raster als die erste Datei')
            je_jahr.append(werte)
        hn.append(je_jahr)

    spalten, zeilen = int(gitter['ncols']), int(gitter['nrows'])
    leer_wert = gitter['nodata_value']
    bloecke = []
    for by in range((zeilen + BLOCK - 1) // BLOCK):
        for bx in range((spalten + BLOCK - 1) // BLOCK):
            daten, belegt = [], False
            for ry in range(BLOCK):
                zeile_s = by * BLOCK + ry            # Zeile von Süden
                zeile_n = zeilen - 1 - zeile_s       # im ASCII-Raster von Norden
                for rx in range(BLOCK):
                    spalte = bx * BLOCK + rx
                    for di in range(len(DAUERN)):
                        for ji in range(len(JAHRE)):
                            v = LEER
                            if zeile_s < zeilen and spalte < spalten:
                                w = hn[di][ji][zeile_n][spalte]
                                if w != leer_wert and w >= 0:
                                    v = round(w * 10)
                                    belegt = True
                            daten.append(v)
            if belegt:
                (ziel / f'{bx}_{by}.bin').write_bytes(struct.pack(f'<{len(daten)}H', *daten))
                bloecke.append(f'{bx}_{by}')
    index = {
        'quelle': 'Deutscher Wetterdienst, KOSTRA-DWD-2020',
        'crs': 'EPSG:3035',
        'x0': gitter['xllcorner'], 'y0': gitter['yllcorner'], 'zelle': gitter['cellsize'],
        'spalten': spalten, 'zeilen': zeilen, 'block': BLOCK,
        'dauern': DAUERN, 'jahre': JAHRE, 'faktor': 10, 'leer': LEER,
        'bloecke': sorted(bloecke)
    }
    (ziel / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(bloecke)} Blöcke nach {ziel}', file=sys.stderr)


if __name__ == '__main__':
    main()
