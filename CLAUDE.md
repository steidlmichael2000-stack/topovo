# Topovo

Streckennummer und Kilometer eingeben, Position auf der Karte sehen.
Live unter <https://steidlmichael2000-stack.github.io/topovo/>.

## Die App hieß bis November 2026 „TrackPilot"

Umbenannt im November 2026: Beim DPMA sind „PLT TrackPilot" (PLT GmbH, Software zur Ortung und
Tourenplanung, Klassen 9/39/42) und „TRACKPILOT platinum" (Wärtsilä, Navigation und Vermessung,
Klasse 9) eingetragen, beide bis 2030 — für eine spätere Nutzung in der Firma zu nah. Als
Produktname darf „TrackPilot" nicht wieder auftauchen. Der neue Name ist ein Kunstwort (Topo =
Gelände), weil die App längst mehr ist als ein Gleiswerkzeug; Domain topovo.com gehört einem
Domainhändler, topovo.de war frei. Kontakt: kontakt.topovo@gmail.com.

Wie beim ersten Wechsel tragen die Speicher den alten Namen nur noch im Umzug: `STORE_KEYS_ALT`
(`app.js`), `KML_DBS_ALT` (`kmlUmziehen`), `HOEHEN_DB_ALT` (`hoehenUmziehen` in `hoehen.js`, kopiert
den DGM-Vorrat je Kachel nebenher) und `ALT_PRAEFIXE` (`sw.js`). Unter `/trackpilot/` bleibt eine
Weiterleitung. Den alten Namen behalten absichtlich: der Cloudflare-Worker `trackpilot-hoehen`
(Umbenennen hieße neue Adresse im Dashboard) und der lokale Ordner samt Server `trackpilot-5192`.

## Die App hieß bis September 2026 „Railnav"

Umbenannt am 15.09.2026, weil Geo++ unter <https://db.geopp.de/gnportal/> ein
kommerzielles Produkt namens **RaiLNav** vertreibt (Android-App und Web-Dienst
für das Streckennetz der DB InfraGO). Der alte Name darf nirgends wieder
auftauchen — weder als Produktname noch in Texten, Titeln oder Repo-Pfaden.

Mit umgezogen sind: Repo-Name, GitHub-Pages-Pfad (`/railnav/` → `/trackpilot/`),
`manifest.webmanifest` (`name`, `short_name`, `id`), Seitentitel, README und
alle Cache-Namen im Service Worker.

### Drei Stellen tragen den alten Namen absichtlich weiter

Nicht „aufräumen" — sie hängen an gespeicherten Nutzerdaten, und die liegen am
Origin, nicht am Pfad. Ein neuer Name würde sie verwaisen lassen:

| Stelle | Datei | Warum |
|---|---|---|
| `STORE_KEYS_ALT` (`'railnav.v3'`) | `app.js` | Einstellungen und Verlauf werden beim ersten Start übernommen und danach unter dem neuen Schlüssel gespeichert. |
| `KML_DBS_ALT` (`'railnav-kml'`) | `app.js` | Die Datenbank mit den importierten KML-Dateien. Sie heißt seit November 2026 `topovo-kml`; die alten Namen stehen nur noch im einmaligen Umzug (`kmlUmziehen`), der den Bestand herüberkopiert und die alte Datenbank danach löscht. |
| `ALT_PRAEFIXE` (`'railnav-'`) | `sw.js` | Räumt die Caches der alten Fassung weg, die sonst dauerhaft auf dem Gerät lägen. |

Diese drei Migrationspfade dürfen frühestens weg, wenn sicher ist, dass niemand
mehr eine Fassung von vor der Umbenennung installiert hat. Sie sind **nicht**
der Produktname, sondern die Schlüssel, unter denen fremde Geräte ihre eigenen
Daten liegen haben — wer sie streicht, löscht die Daten dieser Geräte mit.

## Signalfarbe

Umschaltbar, Standard ist **Lapis** (`#1761A3`) — der Blauton des Firmenlogos.
Die Farben stehen in `PALETTEN` in `app.js`, **nicht** im Stylesheet: jede Farbe
braucht einen eigenen Ton für Hell und für Dunkel, und die Wahl muss zur
Laufzeit umschaltbar sein. `applyPalette()` setzt `--accent` und `--accent-ink`
als Inline-Wert auf `<html>` und schlägt damit beide Themenblöcke in `style.css`,
die nur noch Rückfallwerte tragen.

Der Logoton selbst steht auf dem dunklen Grund nur bei 3:1 und ist dort für
Beschriftungen zu dunkel — im Dunkelmodus läuft deshalb ein aufgehellter Ton
derselben Farbe (`#55A5E7`). `ink` ist die Schrift auf gefüllten Flächen und
wechselt je Ton zwischen Schwarz und Weiß. Wer eine Farbe ergänzt, prüft beide
Richtungen.

Bei `theme: 'auto'` hängt die Wahl am Betriebssystem — dafür liegt ein
`matchMedia`-Zuhörer in `bind()`. Ohne ihn bliebe der Ton beim Umschalten des
Geräts stehen.

`icon.svg`, die PNGs und die Kachel `.card-rail` auf MS Tools sind Lapis. Die
Icon-Adressen tragen `?v=topovo` (vorher `?v=lapis`), damit installierte Apps das
alte Icon nicht aus dem Zwischenspeicher weiter zeigen — bei einem neuen Motiv
den Wert ändern, an allen drei Stellen: `index.html`, Manifest, `SHELL_FILES`.

## Icons

Seit November 2026 ein **gefülltes** Icon (Motiv D aus `../_design/topovo-icons/v2/`): drei
Geländekämme in Lapis-Tönen, darüber die weiße Ortsmarke mit weichem Schatten. Der Nutzer wollte
es kräftig und mit Tiefe wie Noteshelf 3, Proton VPN und Bitwarden — Strichzeichnungen holten ihn
nicht ab. `icon.svg` ist die Vorlage, `node werkzeug/icons-bauen.mjs` rastert daraus die PNGs in
`icons/` (kopfloser Firefox, eigenes Profil; ersetzt das Windows-Skript `make-icons.ps1`). Für
maskable und iOS (180) nimmt das Werkzeug die randlose Fassung (clipPath ohne rx).

Die Kachel auf der Übersichtsseite (`start/index.html`, `.card-rail`) bleibt eine **Strichfassung**
desselben Motivs (Kämme + Marke), weil dort alle Kacheln Strich-Symbole im MESSWERK-Stil tragen.
Wer das Motiv ändert, zieht beide nach.

## Dunkle Karte, Straßen und Ortsnamen: OpenFreeMap über MapLibre

OpenFreeMap gibt es nur als Vektorkarte. MapLibre GL (`vendor/maplibre/`) zeichnet sie in
`#glKarte` **hinter** der Leaflet-Karte und folgt ihr nur (`glNachziehen` in `app.js`). Nicht
als Leaflet-Ebene einbauen: leaflet-rotate dreht die Kachelebene per CSS, eine gedrehte
bildschirmgroße Fläche hätte leere Ecken.

MapLibre zeichnet zweierlei (`glStil`): die dunkle Karte als fertigen Stil, oder ein Bild
(Luftbild, DOP20, Relief) mit **Straßen und Ortsnamen** als Vektoren darüber. Im zweiten Fall
zeichnet MapLibre auch das Bild, und die Leaflet-Grundkarte ist aus (`grundAnwenden`) — nur so
liegen die Straßen zwischen Bild und Bahn-Layer. Die Bilddienste stehen dafür zweimal im Code:
als Leaflet-Ebene in `initMap` und in `GL_BILDER`. Wer einen Dienst ändert, ändert beide.
Ausnahme DOP20 und Relief (Dienste in `LAND_WMS`; DOP20 seit 02.11.2026 alle 16 Länder, Relief
Bayern + BW): Beide Wege holen ihre Kacheln aus `dopKachel(art, …)` — Leaflet über `DopWms` (Canvas,
Option `art`), MapLibre über das Protokoll `land://{art}/{z}/{x}/{y}` (`addProtocol` in `glLaden`).
Je Kachel entscheidet `dopWahl` an `laender-grenzen.json` (VG250 des BKG, 100 m vereinfacht,
Delta-kodiert; neu: `node werkzeug/laender-grenzen-bauen.mjs`): ganz in einem Land durchgereicht,
im 300-m-Saum je Bildpunkt per `dopMaske`, (fast) weiße Bildpunkte von einem anderen Land,
1–2-px-Lücken auf der Grenze aus den Nachbarn (`dopLueckenFuellen`), außerhalb aller Länder
durchsichtig (dann PNG). Ein ausfallender Dienst lässt nur seinen Teil leer. Weit draußen fragen
Länder mit Maßstabsgrenze größer ab (`LAND_MASSSTAB_MAX`: BY, TH, MV; bis 4096 px, darüber vier
Teile der nächsten Stufe in `dopLandPixel` — M-V auf Stufe 6). Die Quellenangabe des DOP20
setzt `dopQuelleErneuern` nach den Ländern im Ausschnitt. SH und ST geben CORS nur für https frei —
unter localhost fehlen sie, auf github.io nicht. Nicht auf „PNG obendrauf" zurückbauen: Das
LGL-Relief reicht deckend über die Grenze und hat Löcher (Ulm-Wiblingen).
Parzellen sind eine `ParzGruppe` aus drei `ParzWms` (BVV; LGL-Flurstücke; LGL-Gebäude mit
`fuellungWeg` und 1024er-Kacheln, weil der Dienst je Abfrage ~2,3 s braucht), je mit `bounds` des Landes.
Straßen und Ortsnamen kamen bis 30.09.2026 als Rasterkacheln von Esri: auf dem Land ab
Zoomstufe 16 leer und auf dem Handy unscharf. Nicht zurückbauen.
**Weit draußen** (02.11.2026): `str-fern` zeigt Autobahnen ab GL-Stufe 4 (bis 8, dann `str-gross`);
`glGrenzen` (mit `prefs.ort`, unter den Straßen) Staaten/Länder ab 0, Regierungsbezirke (admin_level 5)
ab GL 9 — früher haben die OpenFreeMap-Kacheln sie nicht. `land-namen` (place class state) GL 4–8.
In Dunkel ersetzen sie deren eigene Grenzen (`glDunkelErsetzt`, source-layer boundary).
**Kein Esri mehr** (seit 02.11.2026): Das World-Imagery-Luftbild (`sat`) ist raus — Esri verlangt
API-Schlüssel oder ArcGIS-Konto, der Abruf ohne war nur geduldet. Der Knopf „Luftbild“ ist jetzt
`data-base="dop"`; ein gespeichertes `prefs.base = 'sat'` wird in `setBase` zu `'dop'`.
Über der dunklen Karte ersetzen unsere Straßen und Namen deren eigene (`glDunkelErsetzt`,
Bahnlinien `railway…` bleiben). Dafür wird der dunkle Stil einmal als JSON geholt; bis er da
ist, steht die dunkle Karte unverändert.

- Beide Karten liegen nachgemessen auf 0,000 px übereinander — verschoben, gezoomt, gedreht,
  mitten in der Zweifinger-Geste und nach animiertem Zoom. Wer an `glLage` oder den Ereignissen
  dreht, misst das nach (Punkte mit `map.project` ungerundet gegen `gl.project`).
  `map.getCenter()` taugt dafür nicht: Nach `setView` meldet es die gewünschte Mitte, gezeichnet
  ist die auf ganze Pixel gerundete (0,47 px daneben).
- MapLibre wird erst geladen, wenn die Wahl es braucht (`glGebraucht`): rund 1,2 MB.
- **Update nur bewusst:** Version aus der npm-Registry holen, gegen `dist.integrity` (SHA-512)
  prüfen, keine Version nehmen, die erst ein paar Tage alt ist. Am 30.09.2026 so mit 6.10.0
  gemacht. Kopiert werden `maplibre-gl.mjs`, `maplibre-gl-shared.mjs`, `maplibre-gl-worker.mjs`,
  `maplibre-gl.css` und `LICENSE.txt`.
- Der Worker startet als eigene Datei vom selben Ort. Die CSP bleibt dadurch bei
  `script-src 'self'` und `worker-src 'self'` — nicht auf `blob:` oder `unsafe-eval` lockern.
- Im Service Worker: Stil (`/styles/…`) und Kachelbeschreibung (`/planet`) von OpenFreeMap
  „erst Netz", weil sie auf den wöchentlich neuen Datenstand zeigen; Kacheln, Schriften und
  Symbole „erst Cache".

## Abstecken, Parzellenfarbe, Regenradar (Oktober 2026)

- **Abstecken** (`ab…` in `app.js`): Die Zeile oben zeigt beim Standort **kein** KML-Objekt
  mehr von selbst — das war ausdrücklich nicht gewünscht. Ansteuern nur über das Fähnchen bzw. die
  Sprechblase. Eigene Leiste `#ziel` über `#bottom`; `updateBH` zählt beide, gerundet wird erst die
  Summe (einzeln gerundet lag der Standortknopf 1 px unter dem ©-Kasten). Pfeil nach Karte über
  `map.project` (ungerundet) plus Kartendrehung, nach Kompass über `peilung` minus Gerätekurs.
  Antippen des Pfeils schaltet um.
- **Parzellen** (`ParzWms`): immer `…_umr_schwarz` holen und auf Canvas umfärben, Gelb ist
  bitgleich zum Dienst. `farbe` muss in `options` deklariert bleiben, sonst hängt Leaflet es als
  WMS-Parameter an. `tile.complete` wird von Hand gesetzt, sonst räumt `_abortLoading` beim Zoomen
  auch fertige Canvas-Kacheln weg. Farbwahl: lange drücken oder Rechtsklick auf *Parzellen*.
  Das Punktraster der Nutzung (2 × 2 px) filtert `parzPunkteWeg` heraus; `punkte` steht deshalb wie
  `farbe` in `options`.
- **Regenradar** (`radar…` in `app.js`, `radar-werk.js`): seit 13.10.2026 **Zahlen statt Bilder** —
  WCS-GeoTIFF (Float32, mm je 5 min, × 12 = mm/h) statt WMS-Kacheln, damit der Zeitregler gleitet
  wie in WarnWetter: Der Worker schätzt je Paar, wohin der Regen zieht, der Shader (`RADAR_FS`)
  schiebt beide Bilder zur Zwischenzeit, mischt und färbt erst dann ein. Nicht auf Überblenden
  zurückbauen — WarnWetter verschiebt (Video vom 11.10.2026, scharfe Kanten, keine Doppelkontur).
  - Zeitachse zuerst, dann die Ebene; Zeitpunkte immer mit `TIME`. Vorhersagen ohne Cache holen und
    nach einer neuen Messung verwerfen (`radarAchseNeu`, im Worker `stand`).
  - **Vorhersagen immer mit `subset=REFERENCE_TIME(…)`** (`radarUrl`). Ohne nimmt der WCS je nach
    Ausschnitt einen anderen Lauf — am 13.10.2026 sprang das Band nach dem Verschieben 22 km.
    Prüfung 4 in `radar-pruefen.mjs`.
  - Die Zeichenfläche (`RadarSchicht`) liegt in der **tilePane** und sortiert sich per z-index wie die
    Kachelebenen (`ordneAuflagen`); die Lage rechnet sie wie `GridLayer._setZoomTransform`. Gemessen
    0 px Versatz nach Schieben und Zoomen, < 0,6 px gedreht.
  - Ausschnitt 2 × die Sicht, mindestens 250 km, höchstens 400 Zellen (`scalesize`); das Raster des
    Dienstes weicht vom angefragten Rahmen ab — **immer die Lage aus dem TIFF nehmen**.
  - Bewegungsschätzung **ohne Strafe für weite Wege**: schon 0,0002 je Zelle und d² verfälschte eine
    Verschiebung von (4, −3) zu (3,74, −2,64). Nach Änderungen `node werkzeug/radar-pruefen.mjs`.
  - **Aussehen gewählt am 13.10.2026:** DWD-Farben, Fläche 45 % (`RADAR_FLAECHE`), an **jeder**
    der 15 Stufengrenzen eine Linie (Farbe der höheren Stufe, × `RADAR_LINIE_TON`, auf
    `RADAR_GRUND_DUNKEL` unverdunkelt). Verworfen: eigene Blaupalette, Linien nur an Hauptstufen.
    `setBase` zeichnet das Radar neu, weil der Linienton am Grund hängt.
  - Braucht WebGL2 (wie MapLibre). `maps.dwd.de` bleibt aus dem Service Worker draußen,
    `radar-werk.js` steht in `SHELL_FILES`.
  - Beim Prüfen im Testbrowser: Ist das Fenster verdeckt, läuft kein `requestAnimationFrame` —
    Abspielen dann mit untergeschobenem rAF testen, Bilder per `readPixels` direkt nach
    `radarZeichnenJetzt()`.

## Messmenü und Querprofil (Oktober 2026)

Messknopf → Menü mit drei Abläufen: *Profil* (`prof…`, Höhen aus `hoehen.js`), *Polygon aus
Punkten* und *Live* (beide `mess…`, unterschieden durch `messArt`). Der Nutzer wollte das Menü
ausdrücklich so — getrennte Abläufe statt eines Modus mit allem; die sonstige Vorliebe für Gesten
statt Knöpfen tritt hier zurück. Messen und Fläche rechnen auf dem Ellipsoid (`ellipsoidAbstand`,
`utm32Hin`), nicht mit `haversine` — die Kugel ist Ost-West 0,31 % zu kurz. Einzelheiten und
Messwerte stehen in der README, hier nur, was beim Weiterbauen nicht übersehen werden darf:

- **Die Kacheln kommen über den Worker `trackpilot-hoehen`** (Cloudflare, Code in
  `werkzeug/proxy/worker.js`, Adresse in `HOEHEN.proxy`). Der Server der BVV gibt kein CORS frei.
  Der Worker ist **nicht** an Git gebunden: Eine Änderung an `worker.js` wirkt erst, wenn sie im
  Dashboard unter *Edit code* eingefügt und bereitgestellt ist. Der Editor dort lief in Brave erst
  ohne Shields.
- **Teilabfragen im Worker mit `cache: 'no-store'`.** Sonst holt Cloudflare beim ersten Bereich die
  ganze DOM-Kachel (bis 64 MB) in seinen Zwischenspeicher: 4,8 s statt 0,19 s.
- **Den Worker nicht in `TILE_HOSTS` von `sw.js` aufnehmen.** Teilantworten (206) kann Cache Storage
  nicht ablegen, und die DGM-Kacheln liegen bewusst in IndexedDB (`topovo-hoehen`, Stores
  `dateien` und `genutzt`): Der Service Worker löscht beim Aktivieren die Caches alter Versionen, der
  Offline-Vorrat wäre bei jedem Deploy weg.
- **Auch auf localhost nimmt die App den Worker auf Cloudflare.** Die CSP lässt nur `https` zu;
  `werkzeug/proxy/lokal.mjs` ist nur zum Prüfen des Workers selbst.
- **Den Höhendienst der BVV nicht einbauen.** Er lässt im Browser nur die eigenen Portale zu (den
  über den Worker zu umgehen widerspräche dem Betreiber), und er liegt ½ m versetzt gegenüber
  GeoTIFF und XYZ. In `werkzeug/hoehen-pruefen.mjs` dient er nur als Gegenprobe.
- **Nach Änderungen an `hoehen.js`:** `node werkzeug/hoehen-pruefen.mjs` — UTM gegen proj4, DGM1
  gegen die XYZ-Fassung, Höhendienst, Kachelgrenze, DOM. Alles muss „ok" melden.
- Die DGM1-Dateien sind nicht einheitlich gebaut (TIFF-Verzeichnis mal am Anfang, mal am Ende).
  Wer den Leser vereinfacht, prüft mindestens 636_5528 und 778_5292.
- **Baden-Württemberg** (seit 13.10.2026): Art `dgm1-bw` springt über `HOEHEN_ARTEN.dgm1.weiter` ein,
  wo Bayern NaN liefert; Bayern hat Vorrang. Daten als ZIP des LGL über den Worker (`/bw/…`), App liest
  Verzeichnis + einen Eintrag per Range und entpackt mit `DecompressionStream`. Wer neue Länder anhängt:
  eigene Art mit `land`, Rahmen in `HOEHEN_RAHMEN`, Quellenvermerk in `PROF_QUELLEN` und `pdfFuss`.
  `hoehenProfil` liefert `quellen` (`['by']`, `['bw']` oder beide) — Leiste und PDF richten den Vermerk
  danach. Das LGL verlangt das Jahr des Datenbezugs in Klammern.
  DOM1 (`dom1-bw`, hinter `dom20.weiter`) ist GeoTIFF mit **Prädiktor 3** (`blockEntpacken`), LoD2 BW in
  1-km-Dateien (`gebaeudeKachel(e, n, 'bw')`, `gebKachelnFuer` liefert `[e, n, land]`). `lglDatei` gibt
  `{ daten, stand }` — stand = Befliegung aus der CSV, nicht das Jahr im Dateinamen; `hoehenProfil`
  liefert sie als `staende`, die Leiste zeigt sie über `domName`. Gebäude-Land im PDF über die
  ALKIS-Kennung (`DEBW…`). Das nDOM1 des LGL ist keine Gegenprobe für das DOM1 (passt nicht zu DOM − DGM).
- **Bayerische Randkacheln sind beschnitten** (573_5361: 875 px, 125 m eingerückt). Der Leser rechnet mit
  `kopf.dl`/`kopf.dr`; die Raster-Lage ist für DGM1 und DOM20 fest (links 0, oben npx − 1).
- **Höhe am Punkt** (`hoehenPunkt`, in der App `hoeheZeile`/`hoeheFuellen`): vom DGM nur Kopf und
  Streifen per Range (`teil`), rund 25 kB. Die Teilkachel liegt im Speicher unter `dgm1-teil/…`, nicht
  im Vorrat; liegt die ganze Datei schon da, wird die genommen. Die Prüfung dafür läuft in
  `hoehen-pruefen.mjs` vor allen anderen — danach läge die ganze Kachel im Speicher.

## Profil am Gleis (Oktober 2026)

Oranger Knopf in der Ergebnisleiste → `gpStart`; Zustand `profGleis`, sonst dieselbe Profil-Engine
(`profRechnen`, `profLeiste`, `profBildSetzen`). Quer: zwei Punkte aus `gleisLage` und `gleisRichtung`;
längs: rund 200 Lagen als Linienzug, `g.kms` gehört zu `profDgm.ecken`.

- **`gleisLage` muss dieselbe Lage liefern wie das Suchergebnis** (Steinpaar A ≤ km < B, Gleisweg aus
  den Kacheln, sonst Sehne — wie `gleisGenau`), nur ohne das Einrasten an Steinen. Wer an
  `resolvePoint`, `gleisGenau` oder `kmEntlangGleis` dreht, prüft beide Richtungen mit dem Rundlauf
  aus der README (Abschnitte *Profil am Gleis* und *Zwei Gleise, zwei Steinreihen*).

## Gebäude (LoD2) und PDF (Oktober 2026)

- **LoD2 kommt über den Worker** (`/lod2/{O}_{N}.gml`, 2-km-Kacheln mit geraden Kilometern), gzip-gepackt
  über `Content-Encoding` im Worker. Auch diese Änderung wirkt erst nach Einfügen im Dashboard.
- `gebaeude.js` hängt an `hoehen.js` (`HOEHEN`, `vorratLesen`/`vorratSchreiben`, `utm32Hin`); Vorrat unter
  `lod2/{O}_{N}` als JSON. Nach Änderungen `node werkzeug/gebaeude-pruefen.mjs` — Vergleich mit dem DOM20
  in der Dachmitte, nicht an Firsten (die rundet das DOM ab).
- `pdf.js` ist ein eigener PDF-Schreiber (Helvetica, WinAnsi, JPEG). Zeichen außerhalb von WinAnsi
  werden zu „?" — „Δ" deshalb im PDF ausgeschrieben. Nach Änderungen `node werkzeug/pdf-pruefen.mjs`.
- Diagramm und PDF teilen sich `profHoehenfenster`, `profZSpanne`, `profAchse` und `profPfad` (der liefert
  `d` fürs SVG und `punkte` fürs PDF). Wer den Maßstab ändert, ändert ihn an einer Stelle.
- Das PDF-Luftbild ist ein GetMap am DOP20-WMS der BVV bzw. — liegt das Gelände nur in BW — des LGL
  (`PDF_DOP.by`/`.bw`, beide mit CORS) — nicht über den Worker. `pdfKarte` gibt das Land zurück.
- **Eine PDF-Seite zeichnet `pdfSchnittSeite` aus einem Schnappschuss (`profSchnitt()`), nicht aus den
  `prof…`-Variablen.** Die Profilmappe (`mappe…`) baut solche Schnitte selbst aus ihrer km-Liste;
  wer der Seite etwas hinzufügt, nimmt es aus `z` — auch `profAchse(L, z)` —, sonst zeigt eine
  Mappenseite die Werte des gerade offenen Profils.
- Das freie Profil hat genau zwei Punkte (`PROF_PUNKTE_MAX`), A und B werden gezogen. Ausdrücklich so
  gewünscht: ein versehentlicher Tipp setzte sonst einen Punkt C.
- Wetter (`wetterHolen`): Open-Meteo mit `elevation` aus dem DGM1 — ohne sie wäre es der Druck auf der
  Modellhöhe, nicht auf dem Gelände.
- DB_REF (`dbrefGk`): nach Änderungen `node werkzeug/dbref-pruefen.mjs`. Die Genauigkeitsangaben im PDF
  (`pdfGenauigkeit`) stammen aus Produktseiten und Metadaten der BVV — keine erfundenen Zahlen
  nachtragen; für das DOM20 nennt die BVV ausdrücklich keine.

## Kilometrierung nach DB InfraGO (Oktober 2026)

`infrago.js` ist die **erste** Quelle für km ↔ Lage; die OSM-Steine (alles darunter) sind nur noch
der Rückfall für Strecken und Kilometer, die InfraGO nicht kennt. Eingehängt an genau fünf Stellen:
`resolvePoint` und `gleisLage` (km → Lage), `kmAnStelle` und `liveKmRechnen` (Lage → km),
`ortSuchen` (Betriebsstellen). Dazu zeichnet `ifgZeichnen` statt der Steine Linie und Kilometer.

- Daten unter `infrago/`, erzeugt mit `python werkzeug/infrago-bauen.py <GeoPackage>` aus den
  Infrastrukturdaten der Mobilithek (CC BY 4.0, Quellenvermerk „DB InfraGO" — steht in ©-Kasten,
  Hinweisen und Kartenattribution). Liegen im Repo, kein Abruf bei DB. Nach jedem Neubau
  `node werkzeug/infrago-pruefen.mjs` (alles „ok") und `VERSION` in `sw.js` hochzählen.
- **Beide Richtungen rechnen mit denselben Längen** (`ifgLaengen`, `ifgAbstand`) und am selben Gleis
  (Achse/Richtungsgleis vor Gegengleis, `IFG_GLEIS_M`). Wer daran dreht, prüft den Rundlauf —
  gemessen schlechtester Fall 0,5 mm. Das Gegengleis ist an einigen Stellen anders kilometriert
  (1902 km 5,8: 1153 m), deshalb nicht „das nächste Gleis" nehmen.
- Index in 0,1-Grad-Zellen, je Kante jede Zelle ihres Rechtecks. Stichproben entlang der Kante ließen
  Zellen aus, und zwei Rundläufe fanden ihre Strecke nicht mehr.
- `IFG_ERR` (2,5 / 6,3 m) stammt aus der Messung an 6271 OSM-Bahnübergängen — keine Zahlen erfinden;
  bei neuem Datenstand die Messung wiederholen, nicht die Konstante raten.
- Fehlgeschlagene Abrufe pausieren `IFG_PAUSE_MS`: Die Live-Anzeige ruft im Sekundentakt.
- **Auflage DB-Netz** seit November 2026 nur Anlagen: Bahnübergänge, Brücken (Signatur mit Geländern),
  Tunnel (gestrichelt, Portale), Betriebsstellen — Strecken und Kilometer aller Strecken hat der Nutzer
  nie gebraucht. Signaturen rechnet `ifgSignatur` in Bildpunkten bei jedem Zeichnen. **`ifgPane` muss in
  `map._rotatePane` liegen** — direkt in der mapPane lag sie unter den Kacheln, bis dahin war von den
  Linien nie etwas zu sehen.
- **Auflage DB-Netz** (`ifgAuflage…` in `app.js`, Daten `infrago/o/`): Knopf `#ifgBtn` wie `#parzBtn` —
  Tippen schaltet, lang/Rechtsklick öffnet `#ifgWahl` (Inhalt aus `IFG_INHALT`, gespeichert in
  `prefs.ifgInhalt`, fehlender Schlüssel = an). Beide Auswahlen klappen **unter** der Reihe
  Straßen/Ortsnamen auf, nicht dazwischen. Linien auf Canvas in `ifgPane` (z 390, unter Steinen und
  Pin). Streckenlinien nicht antippbar (kurzer Tipp liest nichts ab), Anlagen schon. Schilder ohne
  Überlappung (`gesetzt`, `frei`) — nachgemessen mit `getBoundingClientRect`, 0 an fünf Stellen.
- Der Pin zeigt mit `rotate(-45deg)` nach unten, Anker (13, 31) = Spitze. Mit +45° lag sie 18 px
  links und 11 px über der Stelle.

## Steinliste und Gleisweg (Oktober 2026)

- **`e.alle` für die Karte, `e.sorted` für jede Rechnung.** `e.sorted` = `inselnWeg(steineVereinen(e.alle))`:
  Doppelsteine (zwei Schilder am selben Querschnitt) vereint, vertippte Inseln heraus. Beide
  Richtungen müssen dieselbe Liste nehmen — wer irgendwo zum Rechnen `e.alle` nimmt, bricht den
  Rundlauf. `netzSteine` (Kacheln, Live-Anzeige) läuft durch dieselben beiden Schritte.
- **`kanteVerbinden` nicht wegnehmen.** Ohne die Verbindung zweier Punkte auf derselben Kante läuft der
  Weg übers Kantenende; das betraf rund jedes fünfte Nachbarpaar (384 → 542 von 714 mit Gleisweg).
- `wegSuchen` probiert erst die Gleise der eigenen Strecke, dann alle; `wegAusWegen` fällt bei einem
  Umweg über 1,3 × Kilometerdifferenz auf `paarUmGleis` zurück (Steine an verschiedenen Gleisen).
- Vergleichsmessungen mit festem Laden machen (`probe` alle 4 km), nicht mit `coverage`: Die API gibt
  je Abfrage höchstens 200 Steine, und je nach Reihenfolge fehlen sonst einzelne — zwei Läufe sind dann
  nicht vergleichbar. Alt gegen neu lässt sich auf der Live-Seite gegen localhost messen.
- **Die Sprungreihe wird nicht neu gezeichnet** (`#profRahmen` mit `data-ansicht`, nur `#profOben`
  und `#profUnten` wechseln). Sonst verliert ein schneller zweiter Tipp seinen Klick.
- Pfeiltasten: `profTaste` hängt in der Einfangphase, damit Leaflet die Karte nicht verschiebt.
- Ein neues Ergebnis (`renderBottom`) beendet ein offenes Profil.
- Freies Profil: `profVersatz` und `profLinie()` — gerechnet wird immer auf `profLinie()`, nicht auf
  `profPunkte`.

## Koordinatensuche (`projLesen`, Oktober 2026)

Die Suchzeile nimmt Rechts-/Hochwert in UTM 32 und Gauß-Krüger, erkannt an der
Stellenzahl. GK wird immer als DB_REF gerechnet (`gkZurueck`/`tmZurueck`) und steht als
**eine** Zeile da: Als DHDN gelesen lägen dieselben Zahlen in BY/BW höchstens 0,48 m
daneben — die erst gebaute Wahl zwischen DB_REF und DHDN hat der Nutzer am 15.10.2026
zugunsten einer Zeile verworfen. Geografische Grad zeigt die Zeile nicht als Beispiel:
Die gibt dort niemand ein. Nach Änderungen `node werkzeug/dbref-pruefen.mjs` (prüft auch
den Rückweg).

## Tour (`tour.js`, Oktober 2026)

Das ? im ©-Kasten startet sie; beim ersten Start einmal angeboten (`prefs.tourAngeboten`). Die
Tour führt vor, indem sie dieselben Funktionen aufruft wie die Knöpfe: `search`, `merkPunkt`,
`messMenueAuf`, `profStart`/`profGeaendert`/`profEnde`, `gpStart`, `openSheet`/`closeSheet`, `suchAuf`,
`closeSuggest`, `laserEnde` und die Variablen `view`, `profDgm`, `profLaedt`, `profFehler`, `laserAn`,
`laserStelle`. **Wer davon etwas
umbenennt oder neue Funktionen einbaut, zieht die Schritte in `TOUR_SCHRITTE` nach** — sonst
erklärt die Tour eine App, die es so nicht mehr gibt.

- Das ? macht den ©-Kasten 21 px breiter; die Grenze für die Ecken-Anordnung (1010 px) hängt daran.
- **Werkzeug-Touren** (`HILFE` in `tour.js`, Knopf `hilfeKnopf` in `app.js`): das ? links neben dem ×
  in den Leisten von Profil, Profilmappe, Polygon, Live, Abstecken, Route und Laserpunkte. Die Schritte zielen auf
  Elemente der Leisten (`#profBild`, `.prof-ebenen`, `#profWeite`, `#mappeText`, `.ab-richtung` …).
  Wer eine Leiste umbaut, zieht `HILFE` nach — Schritte ohne Ziel fallen still heraus, ein
  umbenanntes Element fehlt dann in der Erklärung, ohne dass es auffällt.
- Das ? braucht 32 px im Kopf der Leiste. Am Gleis heißt das Profil deshalb nur noch „Profil" (Quer
  oder Längs sagt der Umschalter); mit „Querprofil" rutschte das Teilen-Zeichen auf 375 px in eine
  zweite Zeile.
- Beim Prüfen im Testbrowser: Ohne Bildanforderung friert er die 0,25-s-Übergänge von Loch und
  Blase ein, `getBoundingClientRect` meldet dann Zwischenstände. Die gesetzten Werte in `style`
  vergleichen oder vorher einen Screenshot auslösen.

## Festpunkte BW (`fp…`, Oktober 2026)

Auflage `fp` (in `AUFLAGEN`), Knopf `#fpBtn` wie DB-Netz über `auswahlKnopfBinden`, Arten in
`FP_ARTEN`, gewählt in `prefs.fpInhalt`. Daten aus der OGC API des LGL (Beta) mit
`crs=EPSG:25832` — die Koordinaten im Popup sind die gespeicherten, nicht zurückgerechnet. Ebene
`fpPane` in `map._norotatePane` (sonst über den Sprechblasen). Ein Tipp beim Messen fängt den Punkt
(`tippZiel`). Abstecken auf Festpunkte gibt es noch nicht — `abZielSetzen` erwartet KML-Objekte.
Bayern: WMS-Bild der BVV (`fpByLayer`, `fpBayernSetzen`) plus GetFeatureInfo beim Tippen
(`fpBayernAntippen` in `onMapClick`). Nicht auf „Punkte per GetFeatureInfo sammeln und selbst zeichnen"
umbauen — das lieferte je nach Zellgröße verschieden viele Punkte (README).

## Menü (Einstellungen), Oktober 2026

- Reihenfolge: Karte, Wetter, KML, **Ansicht**, Eigener WMS-Layer, Hinweise (Ansicht über WMS
  ausdrücklich so gewünscht). Alle Knöpfe im Menü sind `.seg-btn` — die großen `.btn` gibt es
  nicht mehr; Regler zeigen ihren Wert (`.slider-val`).
- **Bei offenem Menü treten die Leisten unten zurück** (`body.menue-offen`, `openSheet`/`closeSheet`,
  `updateBH` rechnet sie dann nicht mit). Standort-, Mess- und Absteckknopf schließen das Menü.
- Der Standortknopf ist aktiv in der Signalfarbe; der Standort auf der Karte (`.me-dot`, Kreis, Lot)
  bleibt **blau** — die Signalfarbe trägt schon der gefundene Punkt.

## Desktop-Anordnung ab 1010 px (November 2026)

Ab 1010 px Fensterbreite (Desktop, Tablet quer; nur nach Breite, nicht nach Maus oder Finger):
Symbolspalte `#schiene` ganz links (wie BayernAtlas, 64 px), daneben `.ui` als feste Leiste aus Glas (320 px)
(Glas als `.ui::before` — auf `.ui` selbst würde es die festen Anwendungen an der Leiste statt am
Fenster ausrichten). In der Leiste: Suche, Ergebnis und der über die Spalte gewählte Menüabschnitt
(`schieneWaehlen`, `#sheet[data-nur]`). Anwendungen (Profil, Polygon, Live, Mappe, Abstecken,
Live-Zeile) stehen unten mittig über der Karte, gestapelt von `updateBH` über `--unten`, zwischen Leiste
und Werkzeugleiste. Das **Regenradar oben mittig** (03.11.2026, so gewünscht: kam unten den Werkzeugen in
die Quere); `kartePassen` hält oben seinen Platz frei.
`#bottom[data-art="werkzeug"]` unterscheidet Werkzeug von Ergebnis — wer eine neue Leiste in
`#bottom` schreibt, setzt oder löscht das. Standort, Abstecken, Nord oben rechts;
`#werkzeuge` unten rechts ist seit 06.11.2026 nur noch der **runde Messknopf** (`#werkzeugMessBtn`, 42 px =
`--werkzeug-b`), Polygon und Abstand klappen **nach oben** aus (`#werkzeugMessMenue`), als Pillen aus Glas (Name + Symbol,
rechts bündig, Symbol über der Knopfmitte) — ein eckiger Block „passte gar nicht“, getrennte Namensschilder neben
runden Knöpfen sahen auch nicht gut aus; Messknopf und Messmenü
des Handys sind aus. **Profil und Mappe** stehen als Felder in der Spalte (`#profilSchieneBtn`,
`#mappeSchieneBtn`, `schieneWerkzeug`), ihre ganze Bedienung in der Leiste unter der Suche
(`#bottom[data-art="profil"]`, wie die Route; rollt, wenn sie nicht passt). Steht sie dort, ist ihr Feld gefüllt
(`.gewaehlt`, `werkzeugInLeiste`), liegt ein Menüabschnitt darüber oder ist die Leiste zu, nur getönt — ein Tipp
holt sie dann nach vorn, sonst beendet er das Werkzeug. Zugeklappt ist die Bedienung weg (nicht unten mittig);
`profStart`/`mappeStart` klappen die Leiste auf. Die Tour zeigt am Desktop auf `#profilSchieneBtn`.

**Abstand mit der Maus** (06.11.2026, nach Zeiger `(pointer: fine)` = `MAUS`, nicht nach Breite): Die Linie läuft vom
Start zum Mauszeiger (`messMaus`, Stelle im Kartenbild aus `mousemove`), nicht zur Kartenmitte; `#mitteKreuz` folgt
dem Zeiger unsichtbar (`.maus`) und trägt nur die Zahl, „Mitte“ fehlt. `HILFE.live` hat dafür eigene Schritte. Beim **Polygon** ebenso: gestrichelt vom letzten Punkt zum Zeiger, daneben
die Länge dieses Abschnitts; bei geschlossener Fläche nichts.
Ebenso ohne „lang drücken“ am Rechner: der Street-View-Hinweis ist ganz raus, die Tour sagt dort „Rechtsklick“.

Der Griff `#leisteGriff` mittig an der Kante oder ein Tipp aufs gewählte Symbol klappt die Leiste zu (`leisteZu`, `body.leiste-zu`), jedes Symbol
und jedes neue Ergebnis (`renderBottom`, `showStatus`, `showError`, `showPicker`, `openSheet`) wieder auf.
Glasstufen: Werkzeuge über der Karte `--glass`, Leiste `--glass-dicht`, Spalte `--schiene-grund` — drei
Stufen, damit sich die Flächen voneinander abheben (so gewünscht). Kein Plus/Minus zum Zoomen,
ebenfalls ausdrücklich gewünscht.

**Kopfzeile oben links** (`.marke`, November 2026, wie BayernAtlas/Apple Karten): App-Icon 52 × 52 über
der Spalte (links 6, Mitte 32, Ecken 12 px wie die Knöpfe), daneben „Topovo“ als **Umriss** aus Comfortaa 700
(SIL OFL, mit Unterschneidung, per Kontur etwas kräftiger) — keine Schriftdatei; als HTML-Text hing die Lage
an der Systemschrift (Firefox 3 px tiefer als Chromium). Icon und Name sind ein Zeichen: 16 px Abstand, Name
bündig mit der Außenkante des Suchfelds (74), optisch mittig (Mitte zwischen Versal- und Kleinbuchstabenmitte
auf 32). Darunter 16 px, dann Suche und Spaltenknöpfe (alle 52 × 52) ab `--marke-h` 74. Zugeklappt bleibt der
Name stehen, mit Hof in `--bg`. Nachgemessen per Bildschirmfoto im kopflosen Firefox.

**Handy quer** (unter 1010 px breit, höchstens 500 px hoch, 05.11.2026): Knopfsäule ins Eck unten rechts
(`--saeule`, `--grund` wie ab 1010 px), Leisten beidseits um die Säule schmaler, Messmenü über der Leiste.
Vorher rutschte die Säule über einer offenen Leiste unter die Suchzeile. Der Block steht am Ende von
`style.css`, damit er die Breiten der einzelnen Leisten überstimmt.

Die Grenze steht zweimal: in `style.css` („Desktop und Tablet quer“) und als `SEITENLEISTE` in
`app.js`. **Ausschnitte nur über `kartePassen` (statt `map.fitBounds`) und `sichtSetzen` (statt
`setView`/`panTo`) setzen**, sonst landet das Gezeigte unter Leiste oder Anwendungen.

## Aussehen: Apple-Rundung, Glas, Knöpfe ohne Rahmen (November 2026)

Aus einem Vergleich von sechs Stilen (`../_design/stilvergleich/`, außerhalb des Repos) gewählt:
MESSWERK bleibt, aber gerundet und mit Glas. Alles hängt an Tokens oben in `style.css`.

- Rundung `--r` 20 px (Flächen), `--r-knopf` 12 px, `--r-klein` 7 px.
- Glas `--glass` (dunkel .62, hell .5) mit `--blur`, **überall gleich** — Menü, Suche, Radar,
  Leisten. Ein dichteres Menü hat der Nutzer abgelehnt. Hell war .74 zu deckend („das Durchsichtige
  hat es nicht ins Helle geschafft").
- Knöpfe ohne Rahmen: `border: 1px solid transparent` statt weg, damit die Maße pixelgleich
  bleiben. Gewählt = gefüllt in `--accent`; Kartenknöpfe an = getöntes Glas (`color-mix`), nicht
  gefüllt (gefüllt sah „komisch" aus).
- Regler mit rundem weißem Knauf (`--knauf`), kein blauer Klotz. `--warn` kräftiger (#ff9f0a / #d96400).
- Höhenprofil: Fläche mit Verlauf `#profVerlauf` (oben kräftig, unten durchsichtig) — ausdrücklich
  gewünscht, nur in der App, im PDF darf es anders sein. Zeigerschild ohne schwarze Kontur.
- Aufklapp-Animationen (`von-oben`, `von-unten`, `vom-knopf`, `einblenden`, Kurve `--auf`) nur mit
  transform/opacity, sonst stimmen die Höhen in `updateBH` nicht. Die Tour misst nach `animationend`.

**Stand 03.11.2026:** Desktop durchgeklickt (Suche, Leiste zu/auf, alle Abschnitte, Grundkarten, Hell,
Profil, Mappe, Polygon, Live, Radar, Route, Tour mit allen 11 Zielen, KML-Import mit sieben Dateien des
Nutzers, ~890 Objekte, und Abstecken mit vorgetäuschtem Standort). KML-Namen brechen zweizeilig nach
„_“/„-“/„.“ um (`<wbr>` in der Liste), am Desktop stand sonst nur „AP_PS-Punk…“. Der Nutzer will Schalter als Knopf in der Symbolspalte, keine Pfeile an Leisten
(der Pfeil an der Werkzeugleiste wurde verworfen), und kein Plus/Minus.

## November 2026, Rückmeldungen vom Handy

- **KML-Farbe „wie Datei"** (`kmlDateiFarben`): erscheint, wenn die Datei eigene Farben trägt; setzt
  `farbeFest: false`.
- **Profilpunkte ohne `autoPan`** (auch Polygon): Leaflet schob die Karte, solange der Finger am Rand
  unter Leiste oder Suchzeile stand — der Punkt landete Kilometer weiter.
- **Ladebalken im Profil**: `HOEHEN.fortschritt` in `hoehen.js` meldet Kacheln und Bytes (gelesen in
  Stücken, `hoehenKoerper`); `profLadeBeginnen`/`profLadeEnde` in `app.js`.
- **× in der Suchzeile** räumt Ergebnis und Strecke weg (außer bei offenem Werkzeug). Hervorgehoben wird
  eine Strecke nur, solange `view.hervor` steht (nur Strecke gesucht).
- **Regenradar**: Ein DWD-Server liefert seit 28.10.2026 eine alte Zeitachse. `radarRefHolen` nimmt nur
  eine Messung ≤ 30 min alt, sonst neu fragen; je Bild bis `RADAR_VERSUCHE` (6).
- **Modell hinter dem Radar** (`modell…`, `MODELL_*`): ICON-EU `dwd__Icon-eu_reg00625_fd_sl_TOTPREC01H`,
  stündlich bis 48 h, in Grad als Float64 geholt (`modellUrl`), im Worker bilinear aufs Raster des
  Radarsatzes gerechnet und durch 12 geteilt (`modellUmrechnen`) — deshalb erst laden, wenn `satz.geo`
  steht. Bilder liegen mit im Satz (`satz.modell` merkt, welche), Paare über `radarPaar` (t0/t1), Bewegung
  nur bei 5 min Abstand. Regler: Positionen −60…120 = Minuten, dahinter `MODELL_BREITE` Einheiten
  (`radarPosZuVersatz`). Abspielen steht, solange ein Satz lädt (`radarSatzFertig`), auch nach dem Zoomen.
- Gleisweg und Streckenlinie werden nicht mehr gezeichnet (`zeichneGleiswegNeu` räumt nur noch weg).
- **Radarleiste, Aussehen (01.11.2026 abgestimmt):** Abspielknopf rund und in `--accent` gefüllt. Zeitspur
  ein Verlauf mit harten Stufen (`--spur`) in drei Grautönen — Messung, Radarvorhersage, Modell; **kein
  Orange** (abgelehnt). Darunter Marken −1 h / jetzt / +2 h / Ende (`radarMarken`). Legende in den **vollen**
  DWD-Farben; eine Fassung in den blassen Kartenfarben (45 % auf dem Kartenton) gefiel schlechter.
  Mehrere Hintergründe nebeneinander nicht mit Prozent in `background-position` setzen — die rechnet vom
  Rest (Fläche − Bild), die Teile saßen versetzt.
- **DB-Netz** zeigt nur noch Anlagen; Signaturen siehe Abschnitt InfraGO. Lag bis dahin unter den Kacheln.
- **Firefox:** Schieberegler haben dort gut 130 px Mindestbreite — `input[type="range"] { min-width: 0 }`
  steht global, sonst drückt ein Regler in einer Flex-Zeile seine Nachbarn hinaus (die Prozentzahl lag
  unter dem Griff der Leiste). Der Nutzer arbeitet am Rechner mit Firefox (seit 01.11.2026 das deb-Paket
  von Mozilla, kein Flatpak mehr — das Flatpak-Dateiportal konnte keine Dateien aus dem rclone-Laufwerk
  „Google Drive“ lesen). Prüfen ohne seinen Firefox anzufassen: `firefox --headless --no-remote --profile
  <leerer Ordner> --remote-debugging-port 9333` und über WebDriver BiDi (`ws://127.0.0.1:9333/session`,
  `session.new`, `browsingContext.navigate`, `script.evaluate`) messen; danach Prozess beenden, Profil löschen.

## Route mit dem Auto (`route…`, November 2026)

Auto-Symbol in der Ergebnisleiste und „Route mit dem Auto" in den Sprechblasen → `routeOeffnen`. Gerechnet
von Valhalla beim FOSSGIS (`ROUTE_DIENST`, höchstens eine Anfrage je Sekunde, `ROUTE_ABSTAND_MS`); der
Service Worker lässt den Dienst durch. Start: Standort, Tipp auf die Karte, Ziehen oder eine Adresse im
Startfeld (`routeSuchen` über `searchOrt`, Treffer in `#routeVorschlag`). Den Standort nimmt das Fadenkreuz
rechts im Feld (`#routeOrt`) oder „Mein Standort" oben in der Liste bei leerem Feld — einen eigenen Knopf
„Vom Standort" fand der Nutzer nicht elegant. Die Routenleiste hat keinen Google-Maps-Knopf (der Nutzer: den wählt man vor der
Route); in der Ergebnisleiste heißt er nur „Google Maps" („In Google Maps öffnen" brach neben den Symbolen
dreizeilig um). Info und Teilen stehen klein im Kopf neben dem × (`.bb-eck`), unten nur
Google Maps, Route, Profil — so bleibt die Ergebnisleiste auf 375 px bei 136 px.
Aufgebaut wie die Route in Google Maps (Bildschirmfoto des Nutzers, 03.11.2026): oben `#routeKopf` mit Start
(Feld) und Ziel (Punkt an der Strecke), am Handy **statt** der Suchzeile; unten `#bottom` mit
`data-art="route"` (nicht `werkzeug`) als „Mit dem Auto" mit Dauer, Länge, Hinweisen. Ab 1010 px stehen beide
in der Leiste unter der Suche. `routeKopfZeichnen` baut den Kopf nicht neu, solange im Feld getippt wird.
`kartePassen` hält am Handy oben den Kopf und unten `--bh` frei.

## Service Worker: nichts vor dem Ausliefern abwarten (November 2026)

Kacheln und Dateien gehen sofort an die Seite; abgelegt wird nebenher (`nebenbeiAblegen`,
`event.waitUntil`, mit `res.clone()` vor dem Ausliefern). Aufgeräumt wird höchstens alle 20 s je Vorrat
(`trimSelten`). Vorher wartete jede Kachel auf `cache.put` plus `cache.keys()` über 600 Einträge —
gemessen 0,8–1,8 s statt 0,3–0,45 s je neuer Ansicht, in Firefox schlimmer („hängt, dann auf einmal da“).
`vendor/` kommt „erst Cache“ (MapLibre 1,1 MB wurde vorher bei jedem Start neu geholt), Stil und
`/planet` von OpenFreeMap aus dem Vorrat und nebenher erneuert (`vorratDannNetz`).

## Kacheln nach Netzfehler neu holen (`kachelnNeu`, 04.11.2026)

Leaflet und MapLibre fragen eine fehlgeschlagene Kachel **nie von selbst** neu an. Nach dem
Wiederöffnen der App mit noch schlafendem Netz blieb so das Luftbild leer, bis man die Grundkarte
wechselte (nachgestellt: 17 von 17 Kacheln „errored“). Jetzt: ein Init-Hook an `L.GridLayer` merkt
`tileerror` (`_fehler`), MapLibre-Fehler je Quelle in `glFehlerQuellen`; `kachelnNeu` zeichnet
Leaflet-Ebenen neu (`redraw`) und setzt bei MapLibre die Adressen neu (`setTiles` bzw. `setUrl`) —
bei `online`, bei `visibilitychange` und sonst mit Pause 3–30 s. Gilt für alle Ebenen. `dopBild`
wiederholt Netzfehler zusätzlich zweimal. Nicht entfernen: der Fehler zeigt sich nur am Handy.

## Laserpunkte in 3D (`laser…`, November 2026)

Eigener Einstieg (seit 04.11.2026, so gewünscht — nicht im Messmenü): am Handy der runde Knopf `#mapLaserBtn` über dem Messen (Abstecken und Nord eine Stufe höher), am Desktop das Feld „Laser“ `#laserSchieneBtn` in der Symbolspalte unter „Profil“ (Spalte seit 04.11.2026: Suche, Karte, Profil, Laser, Wetter, KML, WMS, Ansicht, unten Hinweise) (`laserStart`, `laserLeiste` in `app.js`), entpackt in `laser-werk.js`,
angezeigt in `laser.js` (Modul, three.js aus `vendor/three/`, laz-perf aus `vendor/copc/`). Einzelheiten
und Messwerte in der README (*Laserpunkte in 3D*).

- **Kacheln der BVV sind keine COPC** (LAS 1.2, Format 1, Fluglinien-Reihenfolge): jeder Ausschnitt
  lädt die ganzen Kacheln. Nicht versuchen, per Bytebereich nur Teile zu holen — durch den Worker
  kommen weder Größe noch Bereiche an (der BVV-Server gzippt, sobald Cloudflare gzip anbietet;
  `Accept-Encoding: identity` im Worker half nicht). `ohneLaenge` in `laser-werk.js` ist deshalb
  der Normalfall, nicht der Rückfall.
- **Kacheln nur im Arbeitsspeicher** (`vorrat` im Worker, `LASER_VORRAT`), weg mit `laserEnde`. Nicht in
  IndexedDB oder Cache Storage legen; `sw.js` lässt `.laz` durch, der Worker schickt `no-store`.
- **Abbrechen** über `{ art: 'abbrechen' }`: die Entpackschleife gibt alle 2^20 Punkte den Faden frei
  (`setTimeout`), sonst käme die Nachricht nicht an.
- **CSP:** `script-src` trägt `'wasm-unsafe-eval'` — nur dafür (laz-perf). Nicht auf `unsafe-eval`
  ausweiten.
- `laser.js`, `laser-werk.js` und `vendor/three|copc` stehen bewusst **nicht** in `SHELL_FILES`:
  ohne Netz gibt es keine Laserkacheln. `vendor/` legt der Service Worker beim ersten Gebrauch ab.
- Der Rahmen wird über die Pointer-Ereignisse des Pfads gezogen (`laserZiehenBinden`), Lage über
  `map.mouseEventToLatLng` (samt Drehung). Ein Tipp direkt nach dem Ziehen setzt nicht neu
  (`laserGezogen`).
- Bedienung der Ansicht am Handy wie im PW-Viewer: Darstellung links oben, × rechts oben, Messen
  links unten (Distanz, Fläche, Höhe, Löschen), Startansicht rechts unten. **Ab 1010 px wie Topovo**:
  Symbolspalte (Zurück, Darstellung, Messen, Ansicht) und Glasleiste links (`anordnen` hängt Tafel,
  Messwahl und Messleiste dorthin um), Tipp aufs gewählte Symbol klappt zu, die Wolke rückt per
  `setViewOffset` in die freie Fläche. Kein Vollbildknopf (so gewünscht). „Normalen“ ist
  graue Schummerung, nicht die Richtung als Farbe (die war fast überall lila, so verworfen).
  Hintergrund „Verlauf | Schwarz | Weiß“ wie im PW-Viewer („Wie die App“ war unklar); der Verlauf ist
  **immer dunkel**, auch im hellen Modus (hell sah flau aus); `.laser-ansicht` setzt dafür die dunklen
  Glas- und Schrift-Tokens selbst, Messlinien fest in #ff9f0a. Kleine Löcher zwischen Punkten füllt `EDL_FS`. Die Pflichtangabe steht oben mittig (`.lz-fuss`), Bedienung, Kachel, Zeiten in der Tafel (`.lz-info`).
- Lokal: `laser-probe/` (in `.gitignore`) wird vor dem Worker gefragt.
- **Neuere Kacheln sind LAS 1.4, Format 6** (Alpen, Oberfranken, Oberpfalz, Nürnberg …, oft 300 MB bis
  1,9 GB). Punktzahl dort aus dem 64-Bit-Feld (`kopf.anzahl`), nicht aus `getCount()` (liefert 0). Die
  Probekacheln in `laser-probe/` sind LAS 1.2 — wer am Leser dreht, prüft auch eine 1.4-Kachel.
- **Über Cloudflare kamen Kacheln ab einigen hundert MB still abgeschnitten an** (05.11.2026, README).
  `vollstaendig` prüft gegen die Chunk-Tabelle; nicht entfernen, sonst entpackt laz-perf eine halbe Datei.
- **Begrenzung je IP** im Worker (`GRENZEN`, im Speicher, optional Bindung `LASER_GRENZE`): Wer der App
  neue Abrufe über den Worker gibt, prüft, dass ein normaler Gebrauch (Profilmappe!) unter 3000 je 10 min bleibt.
- **Kamera Perspektive | Orthografisch** (wie PW-Viewer): zwei Kameras, `kamera` ist die aktive,
  `steuerung.object` wird umgehängt. Orthografisch braucht eigene Punktgröße (`orthoSkala`) und lineare
  Tiefe in `EDL_FS` (`ortho`-Uniform) — wer an Shader oder Kamera dreht, prüft beide.
- Nach Code-Durchsicht (04.11.2026) behoben: Leiste beim Laden nicht neu bauen (`laserFortschritt`,
  sonst geht „Abbrechen“ verloren), Tipp nur mit einem Finger, `forceContextLoss` beim Schließen,
  Kachel erst nach Kopfprüfung in den Vorrat, `Content-Encoding` → ohne Länge, WebGL2-Prüfung.
- **Netzabbruch:** `mitWiederholung` in `laser-werk.js` wiederholt nur Netzfehler (TypeError), 2…15 s
  oder beim `online`-Ereignis, bis `NETZ_VERSUCHE`; die Kachel lädt von vorn. Unten in der Ansicht
  stehen die Zeiten je Schritt (`zeiten`), um „lädt ewig“ zuordnen zu können.
- **EDL liest mit `texelFetch` an ganzen Bildpunkten** (`EDL_FS`), das Ziel genau so groß wie die
  Zeichenfläche (`getDrawingBufferSize`). Über Bildkoordinaten 0…1 lagen am Handy bei hoher Stärke
  Linien fest im Bild (drehten nicht mit) — nicht auf Flugstreifen schieben, das war es nicht. Dazu
  Float-Tiefe, Nah/Fern eng um die Wolke (`tiefeAnpassen`) und 5 cm `schwelle`.
- **Messen wie Potree im PW-Viewer:** Höhe = Δh zweier Punkte (waagerecht oben, senkrecht am tieferen, Neigung in %),
  Distanz = Linienzug mit Abschnitten und Σ, Fläche mit Seitenlängen; Punkte lassen sich ziehen
  (`messpunktAn`, Einfangphase an der Wurzel vor OrbitControls). Weil das Ziehen jeden Tipp auf einen
  Messpunkt abfängt, schließt `zugEnde` die Fläche (Zug ohne Weg auf dem ersten Punkt) — die Prüfung in
  `messTipp` kam nie zum Zug (bis 05.11.2026). Kleine Schilder, die ein großes (Fläche, Σ, Δh)
  berühren, blendet `bild` aus. Messfarbe `--warn` wie in der App. Regler „Schatten“ (nicht „Licht“), Intensität per Histogrammausgleich (`iRang`).
- **Standort, Luftbild, Gebäude** (05.11.2026, v103): `laserAnsicht` bekommt `utm`,
  `luftbild` (`laserLuftbildUrl`, DOP20 BVV direkt in EPSG:25832, CORS auch für localhost) und `gebaeude`
  (`laserGebaeude` → `gebaeudeKachel`) aus `app.js`. Standort: eigenes `watchPosition` im Viewer (Knopf über
  der Startansicht bzw. „Standort“ in der Spalte), Höhe = Median der Bodenpunkte (2, 9, 23, 24) im Umkreis
  1 m aus `bodenGitter`, ohne Boden dort ausgeglichene Ebene (`ebeneDurch`, 2…32 m, Punkte auf ≥ 3 Seiten) —
  die GNSS-Höhe wird nicht benutzt; geprüft gegen DGM1 (376,00 / 375,99; in fünf Häusern 0,03–0,40 m).
  Die Kamera gleitet nach (`fahrtSchritt`), wenn der Standort in den 15-%-Rand läuft, nicht beim Bedienen
  und 4 s danach (`bedient`).
  Luftbild: höchstens 3000 px je Seite, je Punkt der Bildpunkt darunter, unverändert als sRGB in `farben`.
  Gebäude: nur Dachflächen gelesen, Wände unter Dachkanten, die kein zweites Dach teilt, bis `gr`; nur
  Gebäude mit Mitte im Ausschnitt. Gezeichnet **nach** dem EDL-Bild halb durchsichtig (`GEB_FS`), verdeckt
  von Hand gegen die Tiefe der Punkte mit 0,3 m Spielraum (sonst zersieben die Dachpunkte das Dach).
  Quellenangabe oben setzt `quellenNeu` nach dem, was geladen ist.
- **Auflagen** (05.11.2026): Streckenachsen der DB InfraGO (`laserAchsen`, alle Abschnitte jeder Strecke, die
  den Rahmen berührt — parallele mit), sichtbare KML-Objekte (`laserKml`, ohne KML-Höhen) und die gesuchte
  Stelle (`laserZiel`, Knopf „3D“ `#laser3dBtn` in der Ergebnisleiste, nur Bayern → `laserAufErgebnis`).
  `laser.js` legt alles alle 1 m (Ausschnitt > 300 m: 2 m) per `bodenHoehe` auf den Laserboden, ohne
  Tiefentest (sichtbar unter Bäumen); ohne Boden im Umkreis von 32 m setzt die Linie aus. Schalter unter
  „Auflagen“ in der Tafel. Kleine Schilder, die ein großes berühren, treten über alle Gruppen zurück (`bild`).
- Namensnennung CC BY 4.0: `LASER_QUELLE` (unten in der Ansicht, mit „ausgeschnitten und
  ausgedünnt") und `LASER_ATTR` (Kartenattribution, solange Laserpunkte offen ist).
- **Tafel, Effekte, Straßen, Export getrennt** (06.11.2026): Tafel oben fest „Punktgröße“, darunter
  `<details class="sheet-sec">` (Färbung, Effekte, Klassen, Auflagen, Ansicht, Ausschnitt) — so gewünscht,
  sie wurde zu lang. Effekte frei kombinierbar: Schatten/Kanten (Regler), *Verdeckung* (SSAO im `EDL_FS`,
  Uniform `verdeckung`), *Kugeln* (Define `KUGELN`, schreibt `gl_FragDepth` — nur dann, sonst ist die frühe
  Tiefenprüfung weg), *Höhenlinien* als echte Linien (`hoehenlinienBauen`: Bodenraster 1/2 m, Lücken gefüllt,
  geglättet, Marching Squares, verdeckt über `GEB_FS`); Punkte einfärben fand der Nutzer schlechter.
  „Neigung“ ist eine Färbung. Zwei-Spalten-Raster: `breitSetzen` zählt nur sichtbare Knöpfe
  (`:nth-child` zählte ausgeblendete mit). Klassenliste heißt `.lz-klassenliste` — nicht über `.lz-klassen`
  greifen, das trifft auch Effekte/Auflagen. *Straßen* (Auflage): `laserStrassen` in `app.js` liest die
  OpenFreeMap-Vektorkacheln (Stufe 14, `mvtLesen`, Ebenen transportation/transportation_name, ohne Tunnel),
  drei Stufen in Gelb (`STR_FARBEN`), Namen höchstens 40. Export „Boden + Rest“: `lasBauen` mit `getrennt`
  schreibt in einem Durchgang zwei LAS (`_boden`, `_rest`) — für ReCap (je Datei ein Scan, in Civil ausblendbar).
- **Der PW-Viewer zeigt seine Drohnenwolken mit demselben `laser.js`** (seit 06.11.2026, Kopie in
  `../pw-viewer/topovo/`, geholt mit `pw-viewer/werkzeug/topovo-holen.sh`; dort `wolke.html` und
  `topovo/wolke-werk.js`, der `laser-werk.js` per `importScripts` lädt und dessen `onmessage` ersetzt).
  Deshalb ist in `laser.js` alles Topovo-Eigene nur da, wenn `info` es mitbringt (`luftbild`, `gebaeude`,
  `achsen`, `kml`, `exportieren`, `utm`); dazu `info.titel`, `unterzeile`, `datenName`, `zurueck` und
  `d.rgb` (Färbung „Farbe“). Normalen darf der PW-Viewer nachreichen (`d.normalen` null, `info.normalen`
  als Promise). Wer `laser.js`/`laser-werk.js` ändert, holt die Kopie neu und prüft `wolke.html`.

## Beim Deployen

**Seit 01.11.2026 erst lokal:** Änderungen nicht gleich pushen. Der Nutzer sieht sie in seinem Firefox
unter <http://localhost:5192/trackpilot/> (Server: `trackpilot-5192` aus `../.claude/launch.json`, muss
laufen) und gibt den Push frei. Erst dann `VERSION` hochzählen, committen, pushen.

`VERSION` in `sw.js` hochzählen. Der Worker arbeitet zwar „erst Netz, dann
Cache", aber die Kachel- und Netzdaten-Caches hängen an der Version.

Seit v38 installiert der Worker nur, wenn **jede** Datei aus `SHELL_FILES` geladen
werden kann (sonst bleibt der alte im Dienst). Steht dort eine Datei, die es nicht
gibt, kommt nie wieder ein Update an — beim Ändern der Liste jede Datei prüfen.

Unter Node 18 laden `radar-pruefen.mjs` (radar-werk.js als ESM) und Prüfung 8 in `hoehen-pruefen.mjs`
(`deflate-raw`) nicht — dafür Node ≥ 22 nehmen. Weicht Berchtesgaden in `hoehen-pruefen.mjs` ab, meldet
die Prüfung HINWEIS: Die BVV hat dort XYZ und Höhendienst am 29.10.2026 erneuert, das TIFF noch nicht.

Vorher `node --test tests/robustheit.test.mjs` (Service Worker, WMS, KMZ; von
Codex übernommen) und nach Änderungen an `hoehen.js` `node werkzeug/hoehen-pruefen.mjs`,
an `radar-werk.js` `node werkzeug/radar-pruefen.mjs`.
