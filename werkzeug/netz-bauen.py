#!/usr/bin/env python3
"""Baut die mitgelieferten Netzkacheln aus OpenStreetMap.

Topovo brauchte fuer zwei Fragen den fremden Dienst Overpass: "welche Strecke
liegt hier" und "wie verlaeuft das Gleis zwischen diesen beiden Steinen".
Overpass ist haeufig ueberlastet -- gemessen bis zu 92 s, bis alle drei
Instanzen aufgegeben hatten. Beide Fragen beantwortet die App jetzt aus
mitgelieferten Kacheln; Overpass bleibt nur der Rueckfall ausserhalb des
erzeugten Gebiets.

Aufruf:

    python werkzeug/netz-bauen.py                     # ganz Deutschland
    python werkzeug/netz-bauen.py --gebiet 47.0 12.5 48.0 13.5
    python werkzeug/netz-bauen.py --nur-bauen         # nichts holen, nur schreiben

Die rohen Overpass-Antworten landen im Zwischenspeicher (--speicher) und werden
beim naechsten Lauf wiederverwendet. Der Abruf darf also jederzeit abbrechen
und spaeter weiterlaufen.

Die Daten stammen aus OpenStreetMap und stehen unter der ODbL; das gilt auch
fuer die erzeugten Kacheln.
"""

import argparse
import json
import math
import os
import time
import urllib.parse
import urllib.request

RASTER = 0.5                 # Kantenlaenge einer ausgelieferten Kachel in Grad
VEREINFACHUNG = 5.0          # Douglas-Peucker in Metern
# Auf das Kachelraster ausgerichtet, nicht auf die Landesgrenze. Beim ersten
# Lauf stand hier der knappe Umriss (47,2 / 5,8 / 55,1 / 15,1) -- damit fielen
# 52 Kacheln durch, weil der Ausschnitt sie mittendrin abschnitt und eine nur
# halb abgefragte Kachel bewusst aussen vor bleibt. Betroffen war unter anderem
# der Zipfel bei Aachen. Ganze Kacheln kosten rund hundert Abfragen mehr.
DEUTSCHLAND = (47.0, 5.5, 55.5, 15.5)

# Abgefragt wird feiner als ausgeliefert. Eine 0,5-Grad-Zelle sind rund
# 55 x 55 km; um Muenchen herum hat Overpass die dafuer noetige Antwort
# regelmaessig mit 504 abgelehnt, auch die reine Wegabfrage. Bei 0,25 Grad
# kommen dieselben Daten in ein paar Sekunden. Vier Abfragen je Kachel sind
# billiger als eine, die immer wieder scheitert.
ABFRAGE = 0.25

# overpass.openstreetmap.fr war anfangs die schnellste Instanz (1,8 s gegen
# 3,7 s bei der Hauptinstanz fuer eine 0,25-Grad-Zelle bei Muenchen) und steht
# trotzdem nicht mehr in der Liste: Nach rund 1600 Abfragen antwortete sie mit
# 403. Das ist ihr gutes Recht, und der Erzeuger soll dort nicht weiter
# anklopfen -- ein ganzes Landesnetz ist fuer eine freie Instanz eine Zumutung,
# wenn man es an einem Stueck holt.
#
# Wer das Skript laufen laesst, sollte es deshalb ueber mehrere Tage strecken
# oder --warten hochsetzen. Der Zwischenspeicher macht das Abbrechen billig.
SPIEGEL = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]
ZEITGRENZE = 90        # Sekunden je Abruf; laenger heisst nur laenger warten

# Womit sich das Skript bei Overpass meldet. Sich zu erkennen zu geben gehoert
# zum guten Ton -- anonym abzusaugen waere schlechter Stil. Der Name des
# Werkzeugs reicht dafuer; eine Adresse mit Kontoname stand hier vorher und
# hat den Betreiber nichts angegangen. Wer eine Kontaktmoeglichkeit angeben
# will, traegt sie hier ein.
KENNUNG = 'topovo-netz-bauen/1.0'

# Zwei Durchgaenge, und zwar getrennt, damit eine Aenderung am zweiten nicht
# den ganzen ersten neu holen muss.
#
# Durchgang "haupt": Gleise ohne service-Tag, also ohne Anschluss-, Abstell-
# und Rangiergleise, dazu alle Bahnknoten mit einer Kilometerangabe. Gemessen
# an einem dichten Ausschnitt im Ruhrgebiet sind das 334 km statt 291 km wie
# bei einer reinen ref-Auswahl -- die zusaetzlichen 238 Wege ohne Nummer sind
# genau die, die den Graphen an Bahnhoefen zusammenhalten.
#
# Durchgang "nummer": Was trotz service-Tag eine Streckennummer traegt. Ohne
# ihn fehlte bei 51,467606 / 7,059896 die Strecke 2505 ("ehem. Rheinische
# Bahn", service=spur) -- Overpass bot sie mit 22 m Abstand an, die Kachel
# kannte nur die 2163 mit 26 m. Eine Nummer ist eine Nummer, auch auf einem
# Anschlussgleis, und die ORM-API kennt deren Kilometrierung.
ABFRAGEN = [
    ('haupt',
     'way(%(b)s)[railway~"^(rail|light_rail|narrow_gauge)$"][!service];'
     'node(%(b)s)[railway]["railway:position"];'
     'node(%(b)s)[railway]["railway:position:exact"];'),
    ('nummer',
     'way(%(b)s)[railway~"^(rail|light_rail|narrow_gauge)$"][service][ref];'),
]


def hav(a, b, c, d):
    R = 6371000.0
    r = math.pi / 180
    dla, dlo = (c - a) * r, (d - b) * r
    s = math.sin(dla / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(s))


# ---------------------------------------------------------------- Abruf

def abfrage(rumpf, sued, west, nord, ost):
    bbox = '%s,%s,%s,%s' % (sued, west, nord, ost)
    return '[out:json][timeout:180];(' + rumpf % {'b': bbox} + ');out geom;'


def hole(q, warten, runden=2):
    """Ueber alle Spiegel, und bei Fehlschlag mit wachsender Pause noch einmal.

    HTTP 504 heisst bei Overpass "gerade zu beschaeftigt" und nicht "zu grosse
    Abfrage". Frueher hat dieses Skript dann sofort in vier Viertel zerlegt --
    also vier weitere Abfragen an denselben ueberlasteten Server geschickt.
    Abwarten ist in diesem Fall sowohl schneller als auch hoeflicher.
    """
    letzter = None
    for runde in range(runden):
        for ep in SPIEGEL:
            try:
                daten = urllib.parse.urlencode({'data': q}).encode()
                rq = urllib.request.Request(ep, daten, headers={
                    'User-Agent': KENNUNG,
                    'Accept': 'application/json'})
                with urllib.request.urlopen(rq, timeout=ZEITGRENZE) as r:
                    return json.load(r)
            except Exception as e:
                letzter = e
                time.sleep(warten)
        if runde < runden - 1:
            time.sleep(warten * 5 * (runde + 1))
    raise RuntimeError('kein Overpass-Server hat geantwortet (%s)' % letzter)


def speichername(speicher, marke, sued, west, weite):
    # Die Marke steht im Namen, damit ein geaenderter Durchgang nicht stillschweigend
    # alte Antworten weiterbenutzt -- genau das ist beim zweiten Durchgang aufgefallen.
    vorn = 'z' if marke == 'haupt' else marke
    return os.path.join(speicher, '%s_%+08.3f_%+08.3f_%.3f.json' % (vorn, sued, west, weite))


def zelle_holen(speicher, marke, rumpf, sued, west, tiefe, warten, weite=ABFRAGE):
    """Eine Zelle abrufen; erst wenn auch Abwarten nichts hilft, vierteln."""
    name = speichername(speicher, marke, sued, west, weite)
    if os.path.exists(name):
        with open(name, encoding='utf-8') as f:
            return json.load(f)

    nord, ost = sued + weite, west + weite
    try:
        d = hole(abfrage(rumpf, sued, west, nord, ost), warten)
    except RuntimeError:
        if tiefe <= 0:
            raise
        h = weite / 2
        teile = []
        for ds in (0, h):
            for dw in (0, h):
                teile.append(zelle_holen(speicher, marke, rumpf, sued + ds, west + dw,
                                         tiefe - 1, warten, h))
        d = {'elements': [e for t in teile for e in t.get('elements', [])]}

    with open(name, 'w', encoding='utf-8') as f:
        json.dump(d, f)
    return d


# ---------------------------------------------------------------- Geometrie

def rdp(pts, tol):
    """Douglas-Peucker; Abstaende in Metern ueber eine ebene Naeherung."""
    if len(pts) < 3:
        return pts[:]
    ky = 110540.0
    kx = math.cos(pts[0][0] * math.pi / 180) * 111320.0
    P = [(p[1] * kx, p[0] * ky) for p in pts]
    behalten = [False] * len(pts)
    behalten[0] = behalten[-1] = True
    stapel = [(0, len(pts) - 1)]
    while stapel:
        i, j = stapel.pop()
        if j <= i + 1:
            continue
        ax, ay = P[i]
        bx, by = P[j]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        weit, wo = -1.0, None
        for k in range(i + 1, j):
            px, py = P[k]
            t = ((px - ax) * dx + (py - ay) * dy) / L2 if L2 > 0 else 0.0
            t = max(0.0, min(1.0, t))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > weit:
                weit, wo = d, k
        if weit > tol:
            behalten[wo] = True
            stapel.append((i, wo))
            stapel.append((wo, j))
    return [p for p, b in zip(pts, behalten) if b]


def kodieren(pts, faktor=1e5):
    """Google-Polyline. 1e-5 Grad sind rund 1 m -- feiner als die Erfassung."""
    raus = []
    plat = plon = 0
    for lat, lon in pts:
        for wert, vorher in ((lat, plat), (lon, plon)):
            d = int(round(wert * faktor)) - vorher
            d = ~(d << 1) if d < 0 else (d << 1)
            while d >= 0x20:
                raus.append(chr((0x20 | (d & 0x1f)) + 63))
                d >>= 5
            raus.append(chr(d + 63))
        plat, plon = int(round(lat * faktor)), int(round(lon * faktor))
    return ''.join(raus)


def schluessel(lat, lon):
    """Koordinate als eine einzige ganze Zahl.

    Nicht als Tupel zweier Fliesskommazahlen: Die Verzweigungssuche unten legt
    einen Eintrag je Stuetzpunkt an, und bei ueber zwei Millionen davon ist der
    Unterschied zwischen 28 und 120 Byte je Eintrag mehrere hundert Megabyte.

    Gerundet wird dabei genauso wie in kodieren(), also int(round(x * 1e5)) und
    nicht round(x, 5). Die beiden weichen bei knapp einem Prozent der Punkte um
    die letzte Stelle voneinander ab, und massgeblich ist die Rundung, die
    nachher tatsaechlich in der Datei steht: Was gleich geschrieben wird, soll
    hier auch als derselbe Punkt gelten.
    """
    return (int(round(lat * 1e5)) + 9000000) * 100000000 + int(round(lon * 1e5)) + 18000000


def vereinfachen(wege):
    """Vereinfachen, aber Verzweigungen stehenlassen.

    Zwei Gleise haengen in OpenStreetMap zusammen, indem sie sich denselben
    Knoten teilen -- und der muss nicht das Ende eines Weges sein. Wirft die
    Vereinfachung so einen Knoten weg, faellt der Graph an dieser Weiche
    auseinander und die Wegsuche findet keinen durchgehenden Verlauf mehr.
    Deshalb erst zaehlen, wo sich Wege beruehren, und nur zwischen diesen
    Punkten vereinfachen.
    """
    # Zwei Mengen statt einer Zaehltabelle: gebraucht wird nur "mehr als einmal
    # gesehen", und ein Wert je Eintrag ist Speicher, den es nicht kostet.
    einmal, mehrfach = set(), set()
    for _, pts in wege:
        for p in pts:
            k = schluessel(*p)
            if k in einmal:
                mehrfach.add(k)
            else:
                einmal.add(k)
    einmal = None

    raus = []
    for ref, pts in wege:
        fest = set([0, len(pts) - 1])
        for i in range(1, len(pts) - 1):
            if schluessel(*pts[i]) in mehrfach:
                fest.add(i)
        fest = sorted(fest)
        neu = []
        for a, b in zip(fest, fest[1:]):
            stueck = rdp(pts[a:b + 1], VEREINFACHUNG)
            neu.extend(stueck if not neu else stueck[1:])
        raus.append((ref, neu if len(neu) > 1 else pts))
    return raus


# ---------------------------------------------------------------- Kacheln

def kachel_von(lat, lon):
    return (int(math.floor(lat / RASTER)), int(math.floor(lon / RASTER)))


def auswerten(d, wege, punkte):
    """Eine Overpass-Antwort ausschlachten und wegwerfen.

    Bewusst sofort und nicht erst am Ende: 340 Zellen roh im Speicher zu halten
    waren im ersten Anlauf einige hundert Megabyte, bevor ueberhaupt etwas
    gerechnet wurde. Die Kennung raeumt dabei gleich die Ueberschneidungen weg,
    denn Overpass liefert jeden Weg mit, der die Zelle nur beruehrt.
    """
    for e in d.get('elements', []):
        if e.get('type') == 'way':
            g = e.get('geometry') or []
            if len(g) < 2:
                continue
            t = e.get('tags', {})
            wege[e['id']] = (str(t.get('ref', '')), [(p['lat'], p['lon']) for p in g])
        elif e.get('type') == 'node':
            t = e.get('tags', {})
            roh = t.get('railway:position', t.get('railway:position:exact'))
            try:
                km = float(str(roh).replace(',', '.'))
            except (TypeError, ValueError):
                continue
            if math.isfinite(km):
                punkte[e['id']] = (e['lat'], e['lon'], km)


def bauen(wege, punkte, ziel, gebiet, erzeugte):
    roh_knoten = sum(len(p) for _, p in wege.values())
    laenge = 0.0
    for _, pts in wege.values():
        for i in range(1, len(pts)):
            laenge += hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])

    liste = vereinfachen(list(wege.values()))
    knoten = sum(len(p) for _, p in liste)
    print('  %d Wege, %.0f km, %d Stuetzpunkte -> %d nach Vereinfachung, %d Kilometerpunkte'
          % (len(wege), laenge / 1000, roh_knoten, knoten, len(punkte)))

    # Nur in Zellen schreiben, die auch wirklich abgefragt wurden
    fertig = set(erzeugte)
    nach_kachel = {}

    def fach(k):
        return nach_kachel.setdefault(k, {'w': [], 'p': [], 'km': []})

    def drin(k):
        return '%d_%d' % k in fertig

    for ref, pts in liste:
        # Jeder beruehrten Kachel zuordnen. Wege sind im Mittel keine 500 m
        # lang, Kacheln rund 55 km -- das betrifft weniger als ein Prozent.
        # Kacheln ausserhalb des abgefragten Gebiets bekommen nichts: Dort
        # laege sonst ein Bruchstueck, das wie eine fertige Kachel aussieht.
        kodiert = kodieren(pts)
        eintrag = {'r': ref, 'p': kodiert} if ref else {'p': kodiert}
        for k in set(kachel_von(lat, lon) for lat, lon in pts):
            if drin(k):
                fach(k)['w'].append(eintrag)

    for lat, lon, km in punkte.values():
        k = kachel_von(lat, lon)
        if not drin(k):
            continue
        e = fach(k)
        e['p'].append((lat, lon))
        e['km'].append(round(km, 3))

    os.makedirs(ziel, exist_ok=True)
    for alt in os.listdir(ziel):
        if alt.startswith('t_') and alt.endswith('.json'):
            os.remove(os.path.join(ziel, alt))

    namen, bytes_ges = [], 0
    for (y, x), e in sorted(nach_kachel.items()):
        inhalt = {'w': e['w']}
        if e['p']:
            inhalt['p'] = kodieren(e['p'])
            inhalt['km'] = e['km']
        text = json.dumps(inhalt, separators=(',', ':'), ensure_ascii=False)
        with open(os.path.join(ziel, 't_%d_%d.json' % (y, x)), 'w', encoding='utf-8') as f:
            f.write(text)
        namen.append('%d_%d' % (y, x))
        bytes_ges += len(text.encode())

    mit_inhalt = set(namen)
    index = {
        'raster': RASTER,
        'stand': time.strftime('%Y-%m-%d'),
        'quelle': 'OpenStreetMap, ODbL - erzeugt mit werkzeug/netz-bauen.py',
        'vereinfachung_m': VEREINFACHUNG,
        'gebiet': [round(v, 3) for v in gebiet],
        'kacheln': namen,
        'leer': sorted(k for k in erzeugte if k not in mit_inhalt),
    }
    with open(os.path.join(ziel, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, separators=(',', ':'), ensure_ascii=False)

    print('\n%d Kacheln mit Inhalt, %d leer, %.2f MB unkomprimiert'
          % (len(namen), len(index['leer']), bytes_ges / 1048576.0))
    return index


# ---------------------------------------------------------------- Hauptlauf

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gebiet', nargs=4, type=float, metavar=('SUED', 'WEST', 'NORD', 'OST'),
                    default=list(DEUTSCHLAND))
    ap.add_argument('--ziel', default='netz')
    ap.add_argument('--speicher', default=os.path.join('.cache', 'overpass'))
    ap.add_argument('--warten', type=float, default=2.0, help='Pause zwischen Abfragen (s)')
    ap.add_argument('--nur-bauen', action='store_true')
    a = ap.parse_args()

    sued, west, nord, ost = a.gebiet
    os.makedirs(a.speicher, exist_ok=True)

    # Abfragezellen sind feiner als Kacheln; eine Kachel gilt erst als erzeugt,
    # wenn alle ihre Abfragezellen da sind. Sonst faende die App in einer halb
    # gefuellten Kachel weniger Gleise als es gibt, ohne es zu merken.
    zellen = []
    s = math.floor(sued / ABFRAGE) * ABFRAGE
    while s < nord:
        w = math.floor(west / ABFRAGE) * ABFRAGE
        while w < ost:
            zellen.append((round(s, 3), round(w, 3)))
            w += ABFRAGE
        s += ABFRAGE
    teile_je_kachel = int(round((RASTER / ABFRAGE) ** 2))

    print('%d Abfragezellen a %s Grad fuer %s (%d je Kachel), %d Durchgaenge'
          % (len(zellen), ABFRAGE, a.gebiet, teile_je_kachel, len(ABFRAGEN)))

    wege, punkte = {}, {}
    fertig, fehlend = {}, []
    t_start = time.time()
    for marke, rumpf in ABFRAGEN:
        print('\n--- Durchgang "%s" ---' % marke, flush=True)
        for i, (s, w) in enumerate(zellen, 1):
            kachel = '%d_%d' % (int(math.floor(s / RASTER)), int(math.floor(w / RASTER)))
            vorhanden = os.path.exists(speichername(a.speicher, marke, s, w, ABFRAGE))
            if a.nur_bauen and not vorhanden:
                fehlend.append('%s %.2f,%.2f' % (marke, s, w))
                continue
            try:
                if not vorhanden:
                    time.sleep(a.warten)
                d = zelle_holen(a.speicher, marke, rumpf, s, w, 1, a.warten)
            except Exception as e:
                print('[%s %d/%d] %.2f,%.2f: FEHLT (%s)'
                      % (marke, i, len(zellen), s, w, e), flush=True)
                fehlend.append('%s %.2f,%.2f' % (marke, s, w))
                continue
            auswerten(d, wege, punkte)
            d = None
            # Nur der erste Durchgang zaehlt fuer die Deckung: Er bringt die
            # durchgehenden Gleise, der zweite liefert nur Nachtraege.
            if marke == ABFRAGEN[0][0]:
                fertig[kachel] = fertig.get(kachel, 0) + 1
            if not vorhanden:
                dauer = time.time() - t_start
                print('[%s %d/%d] %.2f,%.2f: %d Wege, %d Kilometerpunkte, %.0f min gelaufen'
                      % (marke, i, len(zellen), s, w, len(wege), len(punkte), dauer / 60),
                      flush=True)

    erzeugte = sorted(k for k, n in fertig.items() if n >= teile_je_kachel)
    unvollstaendig = sorted(k for k, n in fertig.items() if n < teile_je_kachel)
    print('\n%d Kacheln vollstaendig, %d nur teilweise, %d Abfragezellen fehlen'
          % (len(erzeugte), len(unvollstaendig), len(fehlend)))
    if unvollstaendig:
        print('  unvollstaendig (bleiben aussen vor):', ' '.join(unvollstaendig[:30]),
              '...' if len(unvollstaendig) > 30 else '')
    bauen(wege, punkte, a.ziel, a.gebiet, erzeugte)


if __name__ == '__main__':
    main()
