# Topovo

Streckennummer und Kilometer eingeben — Position auf der Karte sehen und in Google Maps öffnen.
Oder umgekehrt: auf eine Stelle der Karte lange drücken und ablesen, welcher Kilometer das ist.

Eine einzelne statische Webseite, kein Server, keine Anmeldung. Läuft auf dem Handy genauso wie
am Rechner und lässt sich als App auf den Startbildschirm legen.

**→ [steidlmichael2000-stack.github.io/topovo](https://steidlmichael2000-stack.github.io/topovo/)**

## Was es kann

- **Beide Richtungen.** Strecke + km → Position, und ein langer Druck auf die Karte →
  Strecke + km.
- **Mehrere Achspunkte auf einmal.** Im Kilometerfeld dürfen mehrere Angaben stehen, getrennt
  durch `&` oder ein Leerzeichen — `1,304 & 2,5 & 14+250`. Alle stehen danach mit ihrem Kilometer
  auf der Karte, und die Zeile in der unteren Leiste geht sie durch. Der Link nimmt die ganze
  Liste mit.
- **Der eigene Kilometer läuft mit.** Ein Tipp auf den blauen Standortpunkt in der Karte wirft
  die Rechnung an; von da an steht in der Zeile unter der Suchleiste bei jeder neuen Ortung, bei
  welchem Kilometer welcher Strecke man gerade steht — ohne Netz und ohne weiteres Zutun. Wer an
  der Strecke läuft, schaut also nur hin. Ein Tipp auf die Zahl oder ein zweiter auf den Punkt
  hält sie fest. Der Standortknopf allein rechnet nichts: Er zeigt, wo man steht, mehr nicht.
- **Kilometrierung der DB InfraGO.** Für das Netz der DB InfraGO rechnet die App mit deren offenen
  Infrastrukturdaten statt mit den OSM-Steinen — an Bahnübergängen nachgemessen typisch 2,5 m
  statt 10 m daneben, und ohne Netz, sobald eine Strecke einmal geladen war (siehe unten). Die
  Steine bleiben für alles, was InfraGO nicht kennt. Die Betriebsstellensuche kennt damit auch
  Abzweige, Blockstellen und Überleitstellen und nennt die Strecken mit Kilometer. Als Auflage
  **DB-Netz** zeigt sie das ganze Netz mit Nummern, Kilometern, Betriebsstellen, Bahnübergängen,
  Brücken und Tunneln — was davon, wählt ein langer Druck auf den Knopf.
- **Kilometer sind sichtbar.** Die Strecke steht als Linie mit beschrifteten Kilometern auf der
  Karte — bei InfraGO-Strecken genau dort, wo die Suche sie hinlegt, sonst die erfassten Steine.
  Man sieht also, worauf sich die Angabe stützt, und kann einen Punkt direkt antippen. Am
  gefundenen Punkt selbst steht der Kilometer
  neben dem Pin, damit er auch ohne die untere Leiste und auf einem Bildschirmfoto ablesbar ist.
  Gleisweg und Streckenlinie (grün und blau) zeichnet die App seit November 2026 nicht mehr — sie
  brachten im Gelände nichts; die Steine bleiben.
- **Gemessene Genauigkeitsangabe.** Zu jedem Punkt steht dabei, wie weit er danebenliegen kann —
  nicht geschätzt, sondern an 1474 Steintripeln nachgemessen (siehe unten).
- **Exakt auf dem Gleis.** Stehen die Steine weit auseinander, wird entlang des tatsächlichen
  Gleisverlaufs gerechnet statt entlang der Luftlinie — in der Richtung km → Position auf
  Knopfdruck, in der Gegenrichtung von selbst, sobald die Steine über 3 km auseinanderstehen und
  die Gerade zwischen ihnen nichts mehr taugt. Klafft zwischen zwei Steinen eine Lücke von 8 bis
  25 km, wird auch in der Richtung km → Position von selbst am Gleis entlang abgetragen, statt
  den nächsten Stein mit „x km daneben" zu zeigen.
- **Grundkarte und Auflagen getrennt.** Als Grundkarte Karte, dunkle Karte (OpenFreeMap), Luftbild, DOP20
  oder Geländerelief; darüber beliebig kombinierbar Bahn-Layer, Flurstücksgrenzen (in wählbarer
  Farbe), Straßennetz, Ortsnamen und das **Regenradar des DWD** — Straßen und Ortsnamen für die
  Bildgrundkarten, auf denen sie sonst fehlen, und für die dunkle Karte, deren eigene sie durch
  deutlichere ersetzen. Dazu
  eigener Standort, Link zum Teilen, Betriebsstellensuche über Name, DS100 oder UIC.
- **Regenradar** mit Zeitleiste: eine Stunde Messung zurück, zwei Stunden Vorhersage voraus,
  stufenlos zu schieben und abzuspielen — der Regen zieht zwischen den Fünfminutenbildern weiter,
  statt zu springen. Für die Frage, ob man den Außentermin noch trocken schafft (siehe unten).
- **Abstecken.** Punkte aus geladenen KML-Dateien ansteuern: Liste nach Entfernung, Name oder
  Dateireihenfolge, dann Entfernung, Richtungspfeil und Versatz nach Nord und Ost vom eigenen
  Standort, *Nächster* geht zum nächstgelegenen noch nicht angesteuerten Punkt. Der Pfeil richtet
  sich nach der Karte oder — ein Tipp auf ihn — nach dem Kompass des Handys (siehe unten).
- **Eigene KML- und KMZ-Dateien** öffnen — beliebig viele, jede einzeln ein- und ausschaltbar wie
  in einer Ebenenliste, mit wählbarer Farbe, wählbarem Symbol und Namen auf der Karte. Sie bleiben
  auf dem Gerät und sind auch offline wieder da (siehe unten).
- **Eigener WMS-Layer** als Overlay, auch für zugangsgeschützte Dienste (siehe unten).
- **Standort dauerhaft verfolgt** — ein Tipp auf den Standortknopf schaltet die Verfolgung ein, der
  Punkt bleibt von allein aktuell. Die Karte fährt dabei nur beim ersten Fix hin und bewegt sich
  danach **nie von selbst**: Beim Zielen und Messen würde eine nachziehende Karte gegen die eigene
  Hand arbeiten. Ein Tipp auf den Knopf holt die Karte zum Standort zurück, der nächste beendet die
  Verfolgung. Die Ortungsgenauigkeit zeigt der Kreis um den Punkt. Darüber erscheint eine Zeile,
  sobald es etwas zu zeigen gibt: der **eigene Kilometer** (nach einem Tipp auf den Punkt, mit
  der Ortungsgenauigkeit als Zahl) und der Abstand zum letzten Messpunkt. Nur zum Verfolgen
  bleibt die Zeile weg — auch bei geladenen KML-Dateien: Das Ansteuern eines Punkts läuft über
  das Abstecken, in dem man ihn auswählt.
- **Tour durch die App** — das **?** unten links neben dem © führt in elf Schritten durch alle
  Funktionen und führt sie live vor: Es tippt eine Beispielstrecke ein und sucht sie, setzt einen
  Punkt, öffnet Messmenü und Einstellungen und zeichnet ein Profil. Beim allerersten Start bietet
  die App die Tour einmal an (siehe unten). Die Leisten von Profil, Profilmappe, Polygon, Live und
  Abstecken haben oben rechts ein eigenes **?**, das nur diese Leiste Knopf für Knopf erklärt.
- **Querprofil** — zwei oder mehr Punkte antippen, unten steht der Geländeschnitt aus dem amtlichen
  DGM1 (1 m Gitter); auf Knopfdruck kommt die Oberfläche mit Gebäuden und Bewuchs aus dem DOM20 als
  gestrichelte Linie dazu. Ein Finger auf dem Diagramm zeigt die Stelle auf der Karte, die Knöpfe
  −10 bis +10 schieben den Schnitt parallel zur Seite. Nur in Bayern (siehe unten).
- **Profil am Gleis** — der orange Knopf im Ergebnis zeichnet den Querschnitt senkrecht zum Gleis
  (±10 bis ±200 m) oder das Längsprofil am Gleis entlang mit der mittleren Neigung in Promille. Die
  Knöpfe darunter springen meterweise die Kilometrierung entlang.
- **Geländehöhe** unter dem Ergebnis, in den Sprechblasen und beim Abstecken — aus dem DGM1, für
  rund 25 kB je Punkt. Nur in Bayern.
- **Polygon aus Punkten** — Punkte auf der Karte antippen, die Luftlinie steht als Maßzahl an jedem
  Abschnitt und als Summe in der Leiste; ein Tipp auf den ersten Punkt schließt die Fläche, dann
  stehen Fläche und Umfang da. Liegen Anfang und Ende auf der geladenen Strecke, steht die Differenz
  **nach Kilometrierung** daneben; die Abweichung zwischen beiden Zahlen zeigt gleich, wie stark es
  dort krümmt oder wie widersprüchlich die Steine stehen.
- **Live messen** — ein Startpunkt, und die Entfernung zum Fadenkreuz läuft beim Schieben der Karte
  mit; bei laufender Ortung steht oben die zum eigenen Standort.
- **Hintergrund verblassen** — Karte oder Luftbild stufenlos bis auf null, dann bleibt nur der
  Bahn- bzw. WMS-Layer stehen; darunter liegt Weiß, damit schwarze Strichzeichnungen auch im
  Dunkelmodus lesbar bleiben.
- **Karte drehen** mit zwei Fingern — erst ab 15° Verdrehung der Finger, vorher bleibt sie
  genordet, damit ein Zweifinger-Zoom sie nicht nebenbei kippt; sobald sie verdreht ist, erscheint rechts oben auf der Knopfsäule ein Kompass,
  dessen Nadel samt N mitdreht und nach Norden zeigt — ein Tipp darauf stellt die Karte gerade.
- **Das Gleisnetz liegt bei.** Welche Strecke an einer Stelle liegt und wie das Gleis dort
  verläuft, beantwortet die App aus mitgelieferten Kacheln statt über eine Fremdabfrage —
  gemessen 18 ms statt Sekunden, und es geht ohne Netz.
- **Eine Suchzeile für alles** — Betriebsstellen, Ortschaften, Straßen und Adressen (bevorzugt in
  der Nähe des gezeigten Ausschnitts), Streckennummer mit Kilometer, oder eine eingefügte
  Koordinate.
- **Offlinefähig** — die App selbst und bereits geladene Kartenkacheln bleiben ohne Netz nutzbar.

**Oben steht nur eine Zeile**, und sie nimmt alles entgegen. Was darin steht, entscheidet, was
passiert:

- **Ein Name** — `Zapfendorf`, `Ebing`, `Ludwigstraße Bamberg` — sucht Betriebsstellen und Orte.
  Betriebsstellen stehen oben, mit DS100 und UIC; darunter Ortschaften, Straßen und Adressen.
  Ein Tipp setzt den Punkt auf die Karte, mit derselben unteren Leiste wie alles andere — samt
  Koordinate, Google Maps und Teilen. Die Treffer werden nach der Kartenmitte sortiert:
  Wer an der Strecke steht und `Ebing` tippt, meint das Ebing vor sich.
- **Eine Koordinate** — `50.004918, 10.917318`, so wie sie hinter dem i-Knopf der unteren Leiste steht —
  setzt einen Punkt an dieser Stelle, mit dem Knopf *Kilometer bestimmen* daran. Damit ist der
  Weg zurück da: Koordinate aus einer Nachricht einfügen und den Kilometer dazu rechnen lassen.
- **Nur Zahlen** heißt Streckennummer und Kilometer. Dann klappen darunter die beiden Felder
  *Strecke* und *Kilometer* auf, gefüllt aus dem, was in der Zeile steht — `5100 12,5`
  → Strecke 5100, km 12,5. Eine Änderung im Feld schreibt sich in die Zeile zurück.

Sobald ein Buchstabe vorkommt, wird nach Namen gesucht; das ist hart, aber eindeutig, und man
weiß beim Tippen jederzeit, was gerade passiert.

**Gesucht wird mit der Eingabetaste oder der Lupe.** Auf dem Handy heißt die Eingabetaste
„Suchen"; die Lupe links in der Zeile ist derselbe Knopf für den Fall, dass die Tastatur schon
zu ist. Einen zusätzlichen Pfeil daneben gibt es nicht — er täte nur dasselbe ein drittes Mal.

Das **×** in der Zeile leert sie samt beider Felder, ohne dass die Leiste zuklappt. Ein Tipp in
die zugeklappte Zeile markiert den bisherigen Text ganz — Tippen ersetzt ihn dann einfach. Am
Rechner führen ↑ und ↓ durch die Trefferliste, Enter nimmt die markierte Zeile.

Enter in der Zeile springt weiter ins Kilometerfeld, wenn dort noch nichts steht; ein zweites
Enter sucht. Bei einem Namen nimmt Enter gleich den ersten Treffer.

Ein Tipp neben die Leiste oder eine fertige Suche faltet alles wieder zu einer Zeile zusammen,
damit von der Karte so wenig wie möglich verdeckt bleibt. **Der Verlauf merkt sich beides** —
gesuchte Strecken mit Kilometer und gewählte Orte —, sodass die leere Zeile beide Wege wieder
einen Tipp entfernt anbietet.

Die Ortssuche läuft über [Photon](https://photon.komoot.io/) und weicht auf Nominatim aus, wenn
Photon nicht antwortet — beides OpenStreetMap-Daten, beides nur mit Netz. Die Betriebsstellen
kommen über die OpenRailwayMap-API. Eine eigene Betriebsstellensuche im Menü gibt es nicht mehr:
Die Zeile oben kann dasselbe und mehr.

Eingabe: `12,5` oder `12.5`, auch Hektometer-Schreibweise `14+250` (= km 14,250).
Nur die Streckennummer ohne Kilometer zeigt den Streckenverlauf.

**Lange drücken setzt einen Punkt** (am Rechner die rechte Maustaste). Es erscheint eine
Sprechblase mit der Koordinate, dem Weg zu Google Maps und einem Knopf *Kilometer bestimmen* —
genau wie bei einem Punkt aus einer KML-Datei. Das **×** schließt sie und nimmt den Punkt mit.

**Ein kurzer Tipp liest bewusst nichts ab.** Früher tat er das sofort, und ein Fadenkreuz-Knopf
schaltete es ab, weil im Gelände ständig versehentlich getippt wird. Beides ist überflüssig,
seit der lange Druck einen Punkt setzt: Der Griff ist dann bewusst, und die Sprechblase fragt,
was damit geschehen soll. Kilometersteine und KML-Objekte bleiben antippbar — die trifft man
nicht zufällig. Die Anzeige unten lässt sich über ihr eigenes **×** wegdrücken.

Der Knopf mit dem Lineal darüber öffnet ein kleines Menü mit drei getrennten Abläufen: **Profil**
(siehe *Querprofil* weiter unten), **Polygon aus Punkten** und **Live**. Läuft einer davon, beendet
ein Tipp auf den Knopf ihn wieder. Bis Oktober 2026 war das ein einziger Modus, der alles zugleich
anbot — fünf Knöpfe, eine Linie zur Bildmitte, die immer mitlief, und keine Fläche; die Aufteilung
macht jeden Ablauf schlank und seine Leiste klein.

In allen dreien setzt jeder Tipp einen Punkt, statt einen Kilometer abzulesen. **Kilometersteine
und Objekte aus geladenen KML-Dateien werden dabei gefangen** — bei einem KML-Punkt auf seine genaue
Koordinate, bei einer Linie oder Fläche auf den nächstgelegenen Stützpunkt; die Sprechblase mit den
Merkmalen bleibt solange weg. Gerechnet wird ohne Netzabfrage im Browser, und zwar auf dem
Ellipsoid: Die Kugel, mit der die App sonst rechnet, liegt in Ost-West-Richtung um 0,31 % zu kurz —
31 cm auf 100 m, nachgerechnet bei Bamberg (Nord-Süd 0,03 %). Unter 100 m stehen die Längen auf den
Dezimeter. Die Länge entlang des Gleises bleibt der Feinrechnung in der Richtung km → Position
vorbehalten.

**Polygon aus Punkten.** Die Maßzahl steht an jedem Abschnitt, die Summe in der Leiste. Ab drei
Punkten liegt ein gestrichelter Ring um den ersten — ein Tipp darauf (bis 24 Bildpunkte daneben)
schließt die Fläche. Dann steht die Fläche groß in der Leiste und in der Mitte des Polygons, dazu der
Umfang. Gerechnet wird mit der Gaußschen Trapezformel in UTM, geteilt durch das Quadrat des
UTM-Maßstabs — die Abbildung vergrößert in Bayern um bis zu 0,12 %, Flächen also um bis zu 0,24 %.
Eine unabhängige Gegenprobe über die Krümmungsradien ergab für ein Viereck von 5.492 m² dasselbe auf
den Hundertstel-Quadratmeter. Kreuzt sich der Umring, steht statt einer Zahl die Warnung: Eine
Fläche ergibt eine Acht nicht. **Zurück** öffnet eine geschlossene Fläche wieder, sonst nimmt es den
letzten Punkt. Jeder Punkt lässt sich ziehen (Griff 26 px wie bei A und B im Profil); Linie und
Fläche laufen mit, gefangen und neu gerechnet wird beim Loslassen. Fadenkreuz, *Mitte* und
*Standort* hat das Polygon seit Oktober 2026 nicht mehr — gebraucht wurden sie nur beim Live-Messen.

**Live.** Ein Tipp setzt den Startpunkt, jeder weitere setzt ihn neu. Vom Start läuft eine
gestrichelte Linie zum Fadenkreuz in der Bildmitte, die Entfernung steht direkt daneben — beim
Schieben der Karte läuft sie mit, in jedem Bild, und steht immer an derselben Stelle des
Bildschirms, ruhig zu lesen. Für „genau 20 m von diesem Punkt" schiebt man also, bis 20,0 m dasteht.

Der Finger trifft keine 20 cm — deshalb beim Live-Messen diese Wege statt des Antippens:
**Mitte** setzt auf das Fadenkreuz, **Standort** übernimmt die eigene Position. Läuft die
Standortverfolgung, steht der Abstand vom eigenen Standort zum Start (Live) bzw. zum letzten Punkt
(Polygon) außerdem in der Zeile oben; im Gelände ist „genau 20 m" damit eine Laufaufgabe: hingehen,
bis die Zahl stimmt.

Gefangen wird nur, was auch in Metern nah liegt (bis 20 m). Der Umkreis von 26 Bildpunkten allein
genügte nicht: Auf Zoomstufe 15 sind das rund 125 m, und bei einer dichten Punktdatei wäre so jeder
Tipp still auf irgendeinen Punkt gesprungen — die Messung um diese Strecke falsch, ohne dass man es
sieht. Weiter entfernte Punkte stehen weiter zur Auswahl, nur nicht automatisch.

**Zoomknöpfe gibt es nicht** — am Rechner zoomt das Mausrad, am Gerät zwei Finger oder ein
Doppeltipp. Der Platz rechts unten gehört den eigenen Knöpfen: von unten Standort, Messen und —
sobald eine eingeschaltete KML-Datei Punkte hat — das Fähnchen zum Abstecken; ganz oben bei
gedrehter Karte der Kompass.

### Mehrere Achspunkte in einem Durchgang

Aus einer Liste von Achspunkten sollen alle auf einmal auf die Karte, nicht einer nach dem
anderen von Hand. Das Kilometerfeld nimmt deshalb mehrere Angaben an, getrennt durch `&`,
Semikolon oder schlicht ein Leerzeichen; jede darf in beiden Schreibweisen stehen, also
`2,5` ebenso wie `2+500`. Höchstens 20 auf einmal — ein verrutschtes Einfügen soll nicht
hunderte Abfragen auslösen.

Gerechnet wird nacheinander mit genau derselben Funktion wie bei einem einzelnen Punkt, die
Genauigkeitsangaben unten gelten also unverändert. Teuer ist davon nur der erste Punkt: Danach
stehen die Steine der Strecke im Speicher, und auch der Gleisweg zwischen zwei Steinen bleibt
gepuffert. Ein Punkt, der sich nicht bestimmen lässt, wirft die übrigen nicht weg — er wird
unter der Leiste benannt.

Auf der Karte trägt jeder Pin seinen Kilometer, sonst wären sie nicht auseinanderzuhalten. Die
untere Leiste beschreibt immer einen davon; umgeschaltet wird über die Kilometerzeile darüber
oder durch Antippen eines Pins, ohne neu zu rechnen. Der geteilte Link enthält alle Kilometer
und stellt die Reihe beim Öffnen wieder her.

**Wo man das auf dem Handy tippt.** Das Kilometerfeld hat bewusst den Zahlenblock — der häufige
Fall ist eine einzelne Zahl. Der kennt aber weder `&` noch Leertaste. Für eine Reihe gehört die
Eingabe deshalb in die Suchzeile oben, die eine vollständige Tastatur hat:
`5100 1,304 & 2,5 & 14+250`. Sie zerlegt das genauso in Strecke und Kilometer.

## Kilometrierung nach DB InfraGO

Seit Oktober 2026 rechnet die App zuerst mit den **Infrastrukturdaten der DB InfraGO** aus der
[Mobilithek](https://mobilithek.info/) (Datenstand Mai 2026,
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de), Quellenvermerk „DB InfraGO"). Darin ist jede Strecke in Abschnitte mit Kilometer von/bis zerlegt, im Median
0,86 km lang, mit einer Linie, die auf die Kilometrierung abgestimmt ist: Ihre Länge weicht im
Median 0,1 m von der Kilometerdifferenz ab, Kilometersprünge sind Abschnittsgrenzen. Ein Kilometer
wird deshalb einfach anteilig auf der Linie abgetragen, und umgekehrt wird der Anteil des
Lotfußpunkts als Kilometer gelesen (`infrago.js`).

**Gemessen, nicht geglaubt.** Wie genau das ist, wurde an Bahnübergängen geprüft: In OpenStreetMap
liegt ein Bahnübergang dort, wo Straße und Gleis sich kreuzen — unabhängig von jeder
Kilometrierung. InfraGO nennt für dieselben Übergänge den Kilometer. An 6271 eindeutig
zuzuordnenden Übergängen:

| km → Lage über … | Median | 90. Perzentil | ≤ 5 m | ≤ 10 m |
| --- | --- | --- | --- | --- |
| die InfraGO-Linie | 2,5 m | 6,3 m | 84 % | 96 % |
| zwei OSM-Steine (≤ 400 m auseinander, 1438 Fälle) | 9,9 m | 44 m | 37 % | 50 % |

Im direkten Vergleich lag InfraGO in drei von vier Fällen näher. Die Marke am Ergebnis zeigt
deshalb ±6 m, beim Live-Kilometer kommt die Ortungsgenauigkeit dazu.

**Welches Gleis.** Eingleisige Abschnitte sind als Streckenachse erfasst, zweigleisige als
Richtungs- und Gegenrichtungsgleis, beide je für sich kilometriert. Meist lesen sie sich am selben
Querschnitt auf Zentimeter gleich — aber nicht überall: Auf Strecke 1902 bei km 5,8 liegen beide
auf derselben Linie und unterscheiden sich um 1153 m, im Rundlauf über alle Strecken traf das 15
von 64 053 Stellen. An Bahnübergängen gemessen liegt das Richtungsgleis besser (ungünstiges
Hundertstel 28 m gegen 38 m). Gerechnet wird deshalb in beiden Richtungen an Achse bzw.
Richtungsgleis; das Gegengleis zählt nur, wo es mehr als 8 m daneben allein verläuft.

**Ein Kilometer an zwei Stellen.** An Kilometersprüngen mit Überlänge kommt derselbe Wert auf
einer Strecke zweimal vor. Dann zeigt die App die erste Stelle und sagt in der Leiste, wie weit
die zweite entfernt ist.

**Ohne Netz.** Die Daten liegen unter `infrago/`: ein Index (welche Strecken in welcher
0,1-Grad-Zelle liegen, 64 kB), je Strecke eine Datei (zusammen 3 MB) und die Betriebsstellen
(0,9 MB). Geladen wird nur, was gebraucht wird; der Service Worker legt es in einen eigenen Vorrat
(`topovo-infrago-…`). Eine Strecke, die einmal gesucht oder angetippt war, geht danach ohne
Netz. Scheitert ein Abruf, fragt die App dieselbe Datei erst nach einer Minute wieder — die
Live-Anzeige rechnet im Sekundentakt.

**Was bleibt bei den Steinen.** Strecken, die InfraGO nicht führt (andere Betreiber, Werks- und
Straßenbahnen, Ausland), und Kilometer außerhalb der InfraGO-Abschnitte. Dort gilt alles, was in
den folgenden Abschnitten über die OSM-Steine steht.

**Als Kartenauflage.** Unter *Karte → Auflagen* schaltet **DB-Netz** das ganze InfraGO-Netz im
Ausschnitt ein. Lange drücken oder Rechtsklick auf den Knopf öffnet die Auswahl, was gezeigt wird —
jedes einzeln:

| Inhalt | ab Zoom | Antippen |
| --- | --- | --- |
| Strecken mit Nummer | 10 | — (ein kurzer Tipp liest bewusst nichts ab) |
| Betriebsstellen, ab 13 mit DS100, ab 15 mit Namen | 12 | Betriebsstelle mit Strecken und km |
| Tunnel (gestricheltes Band) | 12 | km an der Stelle, mit Name und Bereich |
| Bahnübergänge (Andreaskreuz) | 14 | km des Übergangs, Sicherung, Straßenart |
| Kilometer auf allen Strecken | 15 | genau dieser km |
| Brücken (dunkles Band) | 15 | km an der Stelle, mit Bauwerk und Kreuzungsart |

Ein Tipp auf eine Anlage ist ein Ergebnis wie jedes andere — mit Profil am Gleis, Google Maps und
Teilen. Beim Messen und im Profil ist sie nur ein Fangpunkt. Bei Brücke und Tunnel gilt der
Kilometer an der getippten Stelle, sofern er im Bereich der Anlage liegt; sonst ihre Mitte (an 15
von 240 geprüften Brücken lag die Linienmitte auf einem Nachbargleis mit anderem km). „Bauwerk …
m lang" ist die Länge des Bauwerks aus den Daten, nicht die Spanne am Gleis — ein
Überwerfungsbauwerk an 5100 kreuzt auf 104 m Gleis und ist 430 m lang.

Die Anlagen liegen je Strecke unter `infrago/o/` (zusammen 4,4 MB: 12 193 Bahnübergänge, 27 367
Brücken, 694 Tunnel) und werden nur geladen, wo die Auflage sie zeigt. Gezeichnet wird auf Canvas;
Streckennummern und Kilometer, deren Schild ein anderes träfe, lässt die Auflage weg (der Punkt
bleibt). Auf der dunklen Karte ist die Linie hell. Gemessen beim ersten Laden ohne Vorrat:
Ruhrgebiet bei Zoom 10 rund 1,7 s, danach unter 50 ms je Verschieben.

**Neu erzeugen**, wenn ein neuer Datenstand erscheint: das GeoPackage aus der Mobilithek laden und

```bash
python werkzeug/infrago-bauen.py Pfad/zu/Infrastrukturdaten.gpkg
node werkzeug/infrago-pruefen.mjs
```

Das Werkzeug prüft vorab die Umrechnung UTM → Grad gegen die Gradspalten der Datei (schlechtester
Punkt 1 mm) und schreibt jeden achten Bahnübergang als Prüffall nach
`werkzeug/infrago-probe.json`. Die Prüfung rechnet auf allen Strecken km → Lage → km (schlechtester
Fall 0,5 mm), legt die Bahnübergänge auf die Linie (Median 0,3 m gegen den Punkt, den InfraGO selbst
angibt) und probiert Ränder und die Betriebsstellensuche. Danach `VERSION` in `sw.js` hochzählen,
sonst behalten installierte Apps den alten Stand.

## Wie genau ist das?

Für die Strecken der DB InfraGO steht es im Abschnitt darüber. Für alle anderen gilt:
Die Positionen stammen aus den in [OpenStreetMap](https://www.openstreetmap.org/) erfassten
Kilometersteinen (`railway=milestone`), abgefragt über die
[OpenRailwayMap-API v2](https://wiki.openstreetmap.org/wiki/OpenRailwayMap/API). Liegt für den
gesuchten Kilometer ein Stein vor, ist die Position so gut wie dessen Erfassung. Sonst wird
zwischen den beiden Nachbarsteinen **geradlinig** interpoliert — und genau da entsteht der Fehler:
im Bogen liegt die Sehne innerhalb des Gleisbogens.

Theoretisch beträgt die Abweichung $L^2/(8R)$ mit $L$ = Steinabstand und $R$ = Bogenhalbmesser.
Statt das zu glauben, wurde es gemessen: auf vierzehn Strecken wurde über **1474 Steintripel**
jeweils der mittlere Stein übersprungen, über die Lücke interpoliert und mit seiner tatsächlichen
Lage verglichen — getrennt nach nahezu geraden Abschnitten und engen Bögen.

| Steinabstand | gerade ($R$ > 4000 m) | Bogen ($R$ < 800 m) |
| --- | --- | --- |
| 150–250 m | 10 m / 27 m | 10 m / 24 m |
| 250–400 m | 29 m / 47 m | 27 m / 50 m |
| 400–700 m | 16 m / 43 m | 32 m / 64 m |
| über 700 m | 22 m / 77 m | 40 m / 149 m |

*Median / 90. Perzentil.*

**Der Bogen ist nicht der begrenzende Faktor.** Auf geraden Abschnitten müsste die Interpolation
exakt sein — gemessen werden trotzdem 10–29 m. Was den Fehler dominiert, ist also nicht die
Rechnung, sondern **wie genau die Steine überhaupt in OpenStreetMap sitzen**. Erst ab etwa 700 m
Steinabstand schlägt die Krümmung sichtbar durch (40 m statt 22 m im Median).

Die Zahlen sind eine Obergrenze für den Fehler des Verfahrens: Sie enthalten die Streuung des
Vergleichssteins mit. Umgekehrt heißt das, dass auch ein *exakt* getroffener Kilometerstein nur
auf etwa 10 m genau ist — das ist die Erfassungsgenauigkeit, keine Eigenschaft der App.

Ein zwischenzeitlich eingebauter Schätzer, der $R$ aus drei benachbarten Steinen berechnet, wurde
wieder entfernt: Er hat Rauschen gefittet, lag in fast der Hälfte der Fälle zu **niedrig** und
sagte bei großen Steinabständen absurd hohe Werte voraus. Eine falsche Zahl ist schlimmer als
gar keine.

### Genauer: dem Gleisverlauf folgen

Stehen die Steine weit auseinander, schneidet die Gerade den Bogen ab. Dann bietet die App den
Knopf **„Punkt auf das Gleis rechnen"** an (ab 700 m Steinabstand, darunter bringt es nichts).
Dahinter steckt: Gleisgeometrie über [Overpass](https://overpass-api.de/) holen, aus den
Wegstücken ein Knotennetz bauen, mit Dijkstra den kürzesten Gleisweg zwischen den beiden Steinen
suchen und den Punkt anteilig entlang dieses Wegs setzen — statt entlang der Luftlinie.

Am Beispiel Strecke 5321 km 99,0 (Steine bei km 96,42 und 100,0, 3,1 km Luftlinie):

| | |
| --- | --- |
| geradlinig interpoliert | 375 m neben dem Gleis |
| entlang des Gleises | **0 m**, exakt auf der Achse |
| gefundener Gleisweg | 3549 m gegenüber 3580 m Kilometerdifferenz (99,1 %) |
| Dauer | rund 16 s |

Das Verhältnis von Gleisweg zu Kilometerdifferenz dient gleich als Prüfung: Passt es nicht auf
±20–30 %, wurde das falsche Gleis erwischt und die App lehnt das Ergebnis ab, statt es zu zeigen.

**Seit die Kacheln beiliegen, passiert das von selbst.** Die Begründung gegen einen Automatismus
lautete: Die Abfrage dauert Sekunden, ist ratenbegrenzt und funktioniert nicht offline. Aus der
Kachel dauert sie 34 ms — dann gibt es keinen Grund, erst eine Schätzung hinzulegen, die der
Nutzer wegdrücken muss. Gemessen an denselben Stellen:

| | Verschiebung auf das Gleis | Dauer |
| --- | --- | --- |
| 5321 km 99,0 | 377 m | 238 ms |
| 5741 km 5,6 | 158 m | 94 ms |
| 5741 km 11,388 | 142 m | 65 ms |
| 5251 km 3,2 | 29 m | 58 ms |

Der Knopf bleibt für alles, was über Overpass geht — also außerhalb des erzeugten Gebiets.

### Jenseits des äußersten Steins

Für einen Kilometer vor dem ersten oder hinter dem letzten Stein fehlt das einschließende Paar.
Bisher zeigte die App dort den nächstgelegenen Stein mit „1,0 km daneben" — gemeldet an Strecke
5251 km 0,5, wo der erste erfasste Stein bei km 1,5 steht.

Jetzt wird vom äußersten Stein aus am Gleis entlang hinausgelaufen. Dass die Trasse dabei über den
Nullpunkt hinausgeht, ist kein Widerspruch: Die Kilometrierungslinie beginnt oft später als die
Achse.

**Gelaufen wird geradeaus, nicht kürzest.** Dijkstra sucht sich an einer Verzweigung irgendeinen
Ast und landet auf dem Nachbargleis; eine Strecke folgt aber dem geraden Durchgang — an einer
Weiche biegt das durchgehende Hauptgleis nicht ab. An 148 übersprungenen Außensteinen gemessen
machte das den Unterschied zwischen 84 m und 38 m im Median. (Diese beiden Zahlen stammen aus der
ersten Messung, also von vor dem weiter unten beschriebenen Fehler im Lauf; der Vergleich war für
beide Verfahren derselbe.)

**Und der Lauf prüft sich selbst.** Mit demselben Verfahren wird die *bekannte* Strecke zum
Nachbarstein gelaufen; trifft es dort nicht auf 100 m, wird nicht extrapoliert. Das fängt genau die
Ausreißer ab:

Nachgemessen über alle 310 mitgelieferten Kacheln: je Strecke der äußerste Stein übersprungen,
vom nächsten aus hinausgelaufen, mit der wahren Lage verglichen. 3224 Fälle, davon 295
aussortiert, weil der Vergleichsstein weiter Luftlinie entfernt liegt, als der Weg am Gleis lang
ist — dieselbe Streckennummer an zwei Orten, da taugt der Vergleichswert nicht. Bleiben 2929:

| | Fälle | Median | 90. Perzentil | schlechtester |
| --- | --- | --- | --- | --- |
| ohne Selbstprobe | 1172 | 14 m | 67 m | 2036 m |
| mit Selbstprobe | 1073 | **13 m** | **57 m** | **2008 m** |
| nächstgelegener Stein (ohne all das) | 1073 | 208 m | 989 m | 2934 m |

Besser als der nächstgelegene Stein in 1026 von 1073 Fällen; über 100 m daneben liegen 26, über
750 m sieben. Wo die Probe scheitert oder mehr als 3 km hinausgerechnet werden müssten, bleibt es
bei der alten, ehrlichen Warnung.

Die Selbstprobe trägt seit der Fehlerbehebung weniger als vorher — der Lauf selbst irrt kaum noch,
und die Ausreißer, die sie früher abfing, entstehen gar nicht erst. Sie bleibt trotzdem: 99 der
1172 Fälle lehnt sie ab, und das 90. Perzentil sinkt dabei von 67 auf 57 m.

Bei Strecke 5251 km 0,5 heißt das: 1000 m vom Stein bei km 1,5 hinaus, Selbstprobe trifft den
Nachbarstein auf 2 m, Ergebnis in 131 ms.

#### Der Lauf lief zu weit — und die Probe in die falsche Richtung

Gemeldet an Strecke 5062, km 1,034: Der Punkt stand 510 m südöstlich des Steins bei km 1,2, obwohl
nur 166 m hinauszurechnen waren — in einem ganz anderen Abschnitt. Dahinter steckten zwei Fehler,
die sich gegenseitig verdeckt haben.

**Die erste Kante wurde immer ganz gegangen.** Geteilt wurde erst ab der zweiten: Wer 166 m
hinauslaufen wollte, landete am Ende der ersten Kante, wie lang die auch war. Auf Geraden lässt
die Vereinfachung auf 5 m Stützpunkte weg — hier waren es 510 m am Stück, und genau so weit lief
der Punkt hinaus. Nachgeprüft an derselben Stelle: Für 10, 50, 100, 166 und 300 m kam fünfmal
derselbe Punkt heraus, 510 m weit draußen; erst ab 600 m stimmte es wieder.

**Die Richtung entschied der Abstand statt der Peilung.** Losgehen soll der Lauf *weg* vom zweiten
Stein, und dafür wurde der Nachbarknoten genommen, der am weitesten von ihm entfernt liegt. Am
Stein bei km 1,2 geht es zur richtigen Seite aber nur 30 m bis zum nächsten Stützpunkt und zur
falschen 510 m am Stück — der falsche Knoten lag weiter weg und gewann. Aufgefallen ist das erst,
als der erste Fehler weg war: Solange der Lauf am Ende der 510-m-Kante stehen blieb, zeigte die
Selbstprobe zufällig in die richtige Richtung und traf den Nachbarstein auf 1 m. Jetzt vergleicht
beides die Peilung: Der erste Schritt muss mehr als 90° von der Richtung zum Bezugspunkt abweichen,
sonst wird nicht gelaufen.

Was das gekostet hat, zeigt dieselbe Messung mit dem alten Lauf: Median 20 statt 13 m, 90.
Perzentil 137 statt 57 m, und beantwortet wurden 934 statt 1073 Fälle. Auf den 927 Fällen, die
beide Fassungen annehmen, ist der neue Lauf in 183 besser, in 720 gleich und in 24 schlechter.

**Und in der Gegenrichtung genauso.** Wer jenseits des äußersten Steins auf die Karte tippt, bekam
weiter „der Punkt liegt 1.015 m vom Gleis entfernt" — die App lotete ihn auf das letzte Steinpaar,
statt hinauszulaufen. Jetzt wird bis 3 km hinaus gelaufen und der Tipp auf diesen Weg gelotet; die
Weglänge bis zum Lot ist die Kilometerdifferenz. An der gemeldeten Stelle 49,447926 / 10,271642:
Strecke 5251, **km 0,634**, 866 m hinaus, 6 m querab, Selbstprobe auf 2 m.

### Interpolieren oder einfach den nächsten Stein zeigen?

Dieselben Daten, andere Frage — für jeden Testpunkt wurde verglichen, wie weit die Interpolation
danebenlag und wie weit der jeweils nächstgelegene Stein entfernt war:

| Steinabstand | interpoliert | nächster Stein | interpoliert besser in |
| --- | --- | --- | --- |
| unter 200 m | 13 m | 22 m | 52 % der Fälle |
| 200–400 m | 26 m | 154 m | 96 % |
| 400–800 m | 19 m | 196 m | 98 % |
| 800–1500 m | 36 m | 233 m | 98 % |
| über 1500 m | 39 m | 581 m | 98 % |

*Median über 1128 Fälle; insgesamt schneidet die Interpolation in 95 % besser ab (23 m gegenüber
176 m).* Interpolieren ist also praktisch immer die bessere Wahl — nur wo ohnehin alle 100 m ein
Stein steht, ist es fast egal. Deshalb interpoliert Topovo grundsätzlich und fällt nur dann auf
den nächstgelegenen Stein zurück, wenn es kein brauchbares Steinpaar gibt.

### Und umgekehrt: Wie genau ist ein Tipp auf die Karte?

Dieselbe Prüfmethode auf die andere Richtung angewandt — über **2060 Steintripel** den mittleren
Stein übersprungen, seine tatsächliche Lage auf die Sehne der beiden Nachbarn projiziert und den
dort abgelesenen Kilometer mit seinem echten verglichen. Das ist genau der Fall „auf das Gleis
getippt", nur mit bekannter Wahrheit:

| Steinabstand | Median | 90. Perzentil |
| --- | --- | --- |
| unter 250 m | 10 m | 33 m |
| 250–700 m | 14 m | 47 m |
| 700–1200 m | 20 m | 57 m |
| 1200–2000 m | 19 m | 56 m |
| 2000–3100 m | 17 m | 60 m |

Zwei Dinge fallen auf: Jenseits von 700 m wächst der Fehler **nicht weiter**, und getrennt nach
Krümmung liegen nahezu gerade Abschnitte bei 14 m / 49 m, ausgeprägte Bögen bei 19 m / 71 m. Die
Sehnennäherung ist hier also kaum schuld — anders als in der Richtung km → Position, wo sie bei
3 km Steinabstand 375 m Fehler machte.

Der Grund ist Geometrie: Beim Tippen steht die Position schon fest, gesucht ist nur der Kilometer.
Entlang eines Kreisbogens verhält sich die Projektion auf die Sehne aber fast proportional zur
Bogenlänge — der Sehnenanteil wächst mit dem Sinus des überstrichenen Winkels, der Bogenanteil mit
dem Winkel selbst, und beide fallen zur Bogenmitte hin zusammen. Übrig bleiben ein paar Meter aus
der Krümmung; der Rest ist die Erfassungsgenauigkeit der Steine.

**Die Ausnahme steht nicht in der Tabelle.** 1,6 % der Testfälle lagen über 100 m daneben — und zwar
nicht in Bögen: Der übersprungene Stein lag dort im Median nur 13,6 m von der Sehne entfernt, also auf
gerader Strecke, wo der tatsächliche Gleisverlauf mit der Sehne zusammenfällt. Ihr Kennzeichen ist ein
anderes, nämlich das Verhältnis von Luftlinie zu Kilometerdifferenz: im Median 0,93 gegenüber 0,99 bei
den übrigen. Unterhalb von 0,75 lag das ungünstige Zehntel bei **183 m statt 49 m**. Dahinter stecken
Kilometersprünge und falsch erfasste Steine — nichts, was ein Gleisverlauf reparieren könnte. Genau
diese Prüfung machte die App bisher nur in der Richtung km → Position; jetzt warnt sie auch nach einem
Kartentipp.

Ebenfalls geprüft und verworfen: eine Ausgleichsgerade über ein Fenster von acht Steinen statt der
beiden Nachbarn. Median 15 m gegenüber 14 m, 90. Perzentil 45 m gegenüber 48 m, besser in genau 50 %
der Fälle. Die Streuung der beiden Klammersteine ist also nicht der begrenzende Faktor — was bleibt,
ist die Streuung des Vergleichssteins selbst, mit dem gemessen wird. Die Zahlen der Tabelle sind damit
wie in der anderen Richtung eine Obergrenze und nicht der Fehler des Verfahrens.

### Kilometer live aus dem Standort

Gewünscht im Gelände: den eigenen Standpunkt auf die Trasse gerechnet sehen, während man an der
Strecke läuft, statt dafür jedes Mal einen Punkt zu setzen. Solange die Standortverfolgung läuft,
steht der Kilometer deshalb in der Zeile unter der Suchleiste und rechnet sich bei jeder Meldung
des Geräts neu; auf der Karte zeigt ein gestricheltes Lot vom Standortpunkt auf die Stelle, an der
er auf dem Gleis landet.

**Angeworfen wird sie von Hand.** Der Standortknopf zeigt nur die eigene Stelle; erst ein Tipp auf
den blauen Standortpunkt in der Karte schaltet das Mitrechnen ein. Vorher lief es mit der
Verfolgung automatisch an, und das heißt: Wer bloß sehen will, wo er steht, löst eine Kette von
Kachelgriffen und notfalls Overpass-Abfragen aus, die im Sekundentakt weiterläuft. Jede neue
Verfolgung fängt wieder ohne Rechnung an — der Schalter merkt sich nichts.

**Gerechnet wird nichts Neues.** Es ist dieselbe Funktion wie bei einem gesetzten Punkt: Standort
auf den Zug der Kilometersteine loten, Kilometer aus der Sehne lesen, und wo die Sehne über 200 m
Weg abschneidet, am tatsächlichen Gleisverlauf entlang messen. Damit gilt auch die Tabelle
darüber unverändert. Hinzu kommt allein die Ortungsungenauigkeit des Geräts — die verschiebt den
Punkt auch **längs** der Strecke und wirkt damit unmittelbar auf den Kilometer. Festgehalten steht
deshalb `±X m` in der Marke, mit X als Summe beider Anteile — auch bei der Rechnung am Gleis
entlang: die obere Schranke, denn ohne die Richtung des Ortungsfehlers zu kennen geht es nicht
enger. In der Zeile oben steht die Ortungsgenauigkeit allein als `GPS ±X m` unter dem Kilometer,
damit sie nicht wie dessen Genauigkeit aussieht.

**Ohne Netz, sonst wäre es nicht brauchbar.** Eine Abfrage im Sekundentakt kommt nicht in Frage,
also kommen die Steine aus der geladenen Strecke oder aus den mitgelieferten Kacheln. Letzteres ist
neu: Die Kacheln lieferten bisher nur Startwerte für die ORM-Abfrage, ihre Kilometerpunkte tragen
keine Streckennummer. Zugeordnet werden sie über die Lage — was auf dem Gleis dieser Strecke steht,
gehört zu ihr, dieselbe Prüfung, mit der die App auch die Startwerte sortiert. Der Gleisweg zwischen
zwei Steinen bleibt außerdem gepuffert: Der Standort wandert, das Steinpaar um ihn herum bleibt
minutenlang dasselbe, und der Aufbau des Wegegraphen ist die teuerste Rechnung der App.

Gemessen im Testbrowser an der gemeldeten Stelle 49,520913 / 10,274394: 4 ms für die Frage, welche
Strecke hier liegt, 3 ms für die Steine aus der Kachel, 10 ms für das ganze Ergebnis samt Weg über
die 9-km-Lücke zwischen km 87,2 und 96,2 — bei jeder weiteren Meldung unter einer Millisekunde,
weil dann alles gepuffert ist. Die Kacheln lagen dabei schon entschlüsselt im Speicher; der erste
Griff in eine neue Gegend kostet zusätzlich das Laden der Kachel, wie beim Antippen auch. Herausgekommen ist km 91,527, entlang des Gleises gerechnet.

**Die Strecke bleibt kleben.** An einem Bahnhof liegen ein halbes Dutzend Nummern in Reichweite,
und eine Anzeige, die im Gehen zwischen ihnen springt, ist unbrauchbar. Gefunden wird die Strecke
deshalb einmal und bleibt, solange der Standort in Reichweite ihrer Steine liegt: bis zu 80 m
querab plus die gemeldete Ortungsgenauigkeit, gedeckelt bei 250 m. Diese Grenze ist hergeleitet und
nicht nachgemessen — 80 m ist derselbe Umkreis, mit dem die App nach der Strecke unter einem
gesetzten Punkt sucht, und die Ortungsgenauigkeit muss dazu, weil unter Bäumen oder im Einschnitt
schnell 30 m gemeldet werden.

Zwei Sparmaßnahmen, damit im Gelände nicht der Akku dafür draufgeht: Unter 5 m Bewegung wird nicht
neu gerechnet — der Fix wandert im Stand um einige Meter, und eine Zahl, die dabei zappelt, liest
sich schlechter als eine, die steht. Und solange keine Strecke gefunden ist, wird erst nach 30 m
Bewegung wieder gesucht, denn diese Frage geht über alle Gleise im Umkreis.

**Wo nichts herauskommt, steht der Grund** statt eines leeren Feldes: „keine Strecke in Reichweite",
„kein Kilometerpunkt in Reichweite", „Gleisnetz dieser Gegend nicht auf dem Gerät", „außerhalb des
mitgelieferten Gleisnetzes". Ein Tipp darauf nimmt den bekannten Weg über die Streckensuche — der
ist ein bewusster Griff und darf deshalb ins Netz gehen.

**Ein Tipp auf die Zahl hält sie fest.** Dann steht der Punkt unten wie jeder andere, mit
Koordinate, Herkunft, Genauigkeit, Google Maps und Teilen; die Steine der Strecke
werden dazu nachgeladen. Die Zeile oben läuft daneben weiter.

### Der Marker gehört aufs Gleis, nicht auf die Sehne

Gemeldet mit zwei Bildschirmfotos an Strecke 5321: Der gesetzte Punkt springt auf die gerade
Verbindung zwischen den Kilometersteinen und liegt damit sichtbar im Feld neben der Schiene. Das
war kein Anzeigefehler, sondern genau das, was die App gerechnet hat — und diese Koordinate geht
in *In Google Maps öffnen* und *Teilen*.

Nachgemessen an denselben 234 Zwischensteinen wie oben liegt der Punkt auf der Sehne im Median
16 m neben dem Gleis, im ungünstigen Zehntel 87 m, im schlechtesten Fall 378 m. An den beiden
gemeldeten Stellen waren es 128 m und **245 m**.

Solange der Verlauf mitgeliefert ist, kostet die Abhilfe nichts: Der angezeigte Punkt wird auf das
tatsächlich erfasste Gleis dieser Strecke gesetzt.

| gemeldeter Fall | Abstand vom Gleis vorher | nachher |
| --- | --- | --- |
| KML-Punkt `5321CW00300` | 124 m | **8 m** |
| Tipp bei km 62,4 | 245 m | **0 m** |
| Meldepunkt Bischofswiesen | 92 m (zur Sehne) | **50 m** (echter Abstand zum Gleis) |

Die 8 m beim KML-Punkt sind der wahre Abstand zur OSM-Gleisachse, die 50 m bei Bischofswiesen
ebenso — dieselben 51 m, die eine unabhängige Overpass-Abfrage zu Beginn ergeben hatte. Was vorher
als „querab der Linie" dastand, war der Abstand zur Sehne und damit die falsche Zahl.

**Der Kilometer bleibt davon unberührt.** Angezeigt wird „deine Stelle, auf die Schiene gesetzt",
nicht „der Ort von Kilometer X".

### Wann die Sehne den Bogen doch zu weit abschneidet

Eingewandt wurde: Das Argument mit dem Kreisbogen trage nur, solange zwischen den Steinen *ein*
Bogen liegt — bei mehreren Bögen plus Geraden hebe sich nichts mehr auf. Das stimmt, und es lässt
sich seit den Kacheln billig prüfen. An 553 übersprungenen Zwischensteinen:

| | n | km über Sehne | km über Gleis | Gleis besser |
| --- | --- | --- | --- | --- |
| unter 1,5 km, gerade | 211 | **14** / 47 m | 23 / 62 m | 33 % |
| unter 1,5 km, krumm | 240 | **14** / 50 m | 22 / 59 m | 38 % |
| über 1,5 km, gerade | 33 | **18** / 51 m | 26 / 88 m | 27 % |
| über 1,5 km, krumm | 69 | 34 / 115 m | **22** / **72** m | **57 %** |

*Median / 90. Perzentil; „krumm" heißt Gleisweg mindestens 2 % länger als die Luftlinie.*

Der Einwand trifft also zu, aber weder die Länge noch die Krümmung allein ist der Auslöser — es
ist, **wie viel Weg die Sehne abschneidet**. Ab 200 m Umweg wird deshalb entlang des Gleises
gerechnet. Das greift in 4 % der Fälle und räumt die Ausreißer weg: Fälle über 100 m Fehler gehen
von 7 auf 1, das 99. Perzentil von 144 auf 106 m, bei unverändertem Median. Ein großer Sprung ist
es nicht — der Rest ist die Erfassungsgenauigkeit der Steine, gegen die kein Verlauf hilft.

**Unterhalb dieser Schwelle gibt es weiter keine Feinrechnung des Kilometers.** Sie könnte nur diese wenigen Meter wegnehmen und kostet eine Overpass-Abfrage von
15–40 s. Angezeigt wird stattdessen die gemessene Zahl: Das Etikett lautet „±57 m",
und hinter dem i-Knopf steht, woher der Wert kommt.

### Wenn gar kein Steinpaar da ist

Die Tabelle oben endet bei 3,1 km Steinabstand, und das ist kein Zufall: Weiter auseinanderliegende
Steine verbindet die App fürs Zeichnen und Antippen gar nicht erst (`MAX_DRAW_GAP_KM`), weil eine
Gerade über Kilometer unbekannten Verlaufs auf der Karte falsch aussieht und Tipps weit neben dem
echten Gleis an sich zöge. Bisher war damit auch die Kilometersuche zu Ende — obwohl der Punkt
sichtbar neben dem Gleis lag.

Jetzt holt die App in diesem Fall den Gleisverlauf und misst daran entlang, mit demselben Baustein
wie in der Gegenrichtung: Geometrie über Overpass, Knotennetz, kürzester Weg zwischen den beiden
Steinen, anteilige Weglänge statt Sehnenanteil. Der Kilometer heißt dann *entlang des Gleises*.

Nachgemessen wie überall sonst hier — übersprungene Zwischensteine mit bekanntem Kilometer,
Steinabstand 3,0–6,8 km, 13 auswertbare Fälle auf drei Strecken:

| Strecke | Steine | Lücke | Sehne | Gleisweg |
| --- | --- | --- | --- | --- |
| 5321 | km 1,2–7,6 | 6400 m | **114 m** | 19 m |
| 5321 | km 13,8–17,2 | 3400 m | 0 m | 16 m |
| 5321 | km 53–57,6 | 4600 m | 16 m | 6 m |
| 5321 | km 54–58,4 | 4400 m | 20 m | 26 m |
| 5321 | km 58,4–61,4 | 3000 m | 4 m | 21 m |
| 5321 | km 60,2–63,6 | 3400 m | 22 m | 13 m |
| 5321 | km 96,42–100,2 | 3780 m | 39 m | 45 m |
| 5500 | km 23,4–30 | 6600 m | 4 m | 88 m |
| 5741 | km 0,243–3,396 | 3153 m | 75 m | 22 m |
| 5741 | km 2,4–7,8 | 5400 m | **186 m** | 12 m |
| 5741 | km 3,396–10,2 | 6804 m | 93 m | 27 m |
| 5741 | km 10,759–16,18 | 5421 m | 4 m | 23 m |
| 5741 | km 12,6–17,743 | 5143 m | **179 m** | 4 m |

**Im Median nehmen sich beide nichts** — 22 m gegenüber 21 m. Der Unterschied steckt im Schwanz:
Die Sehne lag in **3 von 13 Fällen über 100 m** daneben, bis zu 186 m; der Gleisweg in keinem
einzigen, im schlechtesten Fall 88 m.

Die Sehne ist also nicht durchgehend schlecht: Oft liegt sie ebenfalls unter 25 m, weil der
gesuchte Punkt zufällig nahe der Verbindungslinie liegt. **Man sieht dem Ergebnis aber nicht an,
ob man in diesem Fall steckt oder im 186-Meter-Fall** — und genau deshalb wird gerechnet statt
geschätzt, obwohl der Median dasselbe sagt.

Zwei Testfälle stehen nicht in der Tabelle. Einer wurde von der Wegprüfung abgelehnt (siehe unten).
Beim anderen — Strecke 5500, Vergleichsstein bei km 5,6 zwischen km 5,2 und 10,4 — lagen **beide**
Verfahren um 4,3 km daneben, bei sauberem Weg-zu-Kilometer-Verhältnis von 0,995 und null Abstand
quer zum Gleis. Der Stein selbst passt dort also nicht zur Kilometrierung seiner Nachbarn; das sagt
etwas über die Daten und nichts über das Verfahren.

Die Prüfung Gleisweg gegen Kilometerdifferenz greift auch hier und ist kein Zierrat: In einem der
Testfälle (Strecke 5321, km 9,9–13,7) fand Dijkstra einen 5958 m langen Weg für 3800 m
Kilometerdifferenz — über ein Nachbargleis. Das Ergebnis wäre 579 m danebengelegen; das Verhältnis
1,57 liegt außerhalb von 0,8–1,3, und die App lehnt es ab, statt es zu zeigen.

### Drei Fehler, die erst die Kacheln sichtbar gemacht haben

Gemeldet an 49,520913 / 10,274394: *„Der Punkt liegt 4.120 m von der Verbindungslinie der Steine
bei km 96,2 und 96,21 entfernt."* Der Punkt liegt in Wahrheit **15 m** vom Gleis der Strecke 5321,
aber in einer Steinlücke von 9 km. Drei Ursachen auf einmal:

**1. Punkte wurden an Stützpunkte gehängt, nicht ans Gleis.** Die Wegsuche hakt Anfang und Ende
am nächsten Knoten des Gleisnetzes ein und bricht über 80 m Abstand ab. Das ging, solange die
Geometrie von Overpass kam. In den Kacheln lässt die Vereinfachung auf 5 m auf Geraden aber
Stützpunkte weg: 23 % der Kanten sind länger als 160 m, die längste 1579 m. Die beiden Steine bei
km 87,2 und 96,2 stehen 0 m und 2 m neben der Linie — und waren 204 m und 271 m vom nächsten
Stützpunkt entfernt.

An 1802 Fällen nachgemessen: Anhängen am Knoten ergibt im Median 56 m Abstand und **überschreitet
die 80-m-Grenze in 42 % der Fälle**; Anhängen an der Kante ergibt 1 m und in **0 %**. Die
Wegsuche ist also seit den Kacheln in fast jedem zweiten Fall still gescheitert. Jetzt wird auf
die Kante projiziert und dort ein Knoten eingefügt.

**1b. Und selbst eingehängt hing es im falschen Teil.** Kaum war das behoben, kam der nächste
Bericht: Sprünge zwischen km 95 und 98 der Strecke 5321 hingen 40 Sekunden. Beide Steine hängten
sich auf **1 m** ein — und trotzdem fand die Wegsuche keinen Weg. Grund: Das Gleisnetz zerfällt in
den Kacheln stellenweise in mehrere Teile, und die geometrisch nächste Kante gehört dann womöglich
zu einem abgehängten Stummel, während das durchgehende Gleis zwei Meter weiter liegt. Ohne Weg
fiel die App auf Overpass zurück — daher die 40 Sekunden.

Jetzt werden erst die Zusammenhangskomponenten bestimmt und beide Steine in dieselbe eingehängt.
Über **2978 Steinpaare** geprüft:

| | verbunden |
| --- | --- |
| nächste Kante, ohne Rücksicht auf den Zusammenhang | 2187 (**73,4 %**) |
| Komponente wählen, in der beide Steine liegen | 2977 (**100,0 %**) |

Jedes vierte Steinpaar lief also in die Overpass-Wartezeit. Übrig bleibt ein einziges Paar
(Strecke 3530, km 30,2–30,4, bester Abstand 99 m bei zehn Teilstücken im Ausschnitt).

**2. Der Suchradius für den Startwert war 38 m zu klein.** Der nächste Kilometerpunkt lag 4038 m
entfernt, der Radius bei 4000 m. Die Suche fiel auf einen Notbehelf zurück, der die falsche Seite
erwischte. Der Radius steht jetzt bei 12 km — unbedenklich, weil sich die Punkte aus den Kacheln
der Strecke zuordnen lassen, auf deren Gleis sie stehen. Und statt nur des nächsten werden bis zu
vier deutlich verschiedene Startwerte angeboten und der Reihe nach geladen, bis der Punkt
zwischen zwei Steinen liegt: Der nächste war km 96,2, gebraucht wurde zusätzlich km 87,2 auf der
anderen Seite.

**3. Der Rand um die Sehne war zu knapp.** Feste 1,3 km reichen bei kurzen Abständen; über 9 km
läuft das Gleis aus dem Ausschnitt heraus. Der Rand wächst jetzt mit dem Steinabstand.

Dazu wurde die Grenze für die Rechnung entlang des Gleises von 8 auf 25 km angehoben. Die 8 km
galten der *geradlinigen* Interpolation. Am Gleis entlang trägt es weiter — an 1802 Fällen
gemessen liegt der Fehler bei 8–15 km Steinabstand im Median bei 16 m und im ungünstigen Zehntel
bei 52 m, bei 15–25 km bei 19 und 42 m, also nicht schlechter als bei 3–8 km (25 und 106 m).

Der gemeldete Punkt löst sich damit in 247 ms auf: Strecke 5321, **km 91,537**, entlang von
9031 m Gleisweg zwischen km 87,2 und 96,2 — laut Kilometrierung 9000 m.

### Woran die Suche vorher scheiterte

Gemeldet mit einer Koordinate bei Bischofswiesen (47,667669 / 12,944516), 51 m vom Gleis der
Strecke 5741 entfernt: *„Strecke 5741 liegt hier, aber im Umkreis von 900 m ist kein Kilometerstein
erfasst."*

Die Overpass-Abfrage suchte nach `[railway=milestone]` mit dem Tag `railway:position`, und zwar im
Umkreis von 900 m. Was dort tatsächlich steht:

| Abstand | Objekt | Tag | Kilometer |
| --- | --- | --- | --- |
| 596 m | `railway=level_crossing` | `railway:position:exact` | 10,759 |
| 1138 m | `railway=milestone` | `railway:position` | 12,6 |
| 1181 m | `railway=level_crossing` | `railway:position` | 10,2 |

Der nächste brauchbare Wert lag also 596 m entfernt und fiel durch **beide** Maschen zugleich: kein
Stein, und das Tag heißt anders. Der übernächste war ein Stein mit dem richtigen Tag, stand aber
1138 m weit weg. Die Abfrage nimmt jetzt jeden Bahnknoten mit `railway:position` oder
`railway:position:exact` und schaut 4 km weit — der Wert dient ohnehin nur als Startposition für
die ORM-Abfrage, die danach die Steine ringsum liefert. Findet sich auch so nichts, wird die
Strecke selbst abgefragt, statt aufzugeben.

Der gemeldete Punkt löst sich damit in 0,6 s auf: Strecke 5741, km 11,388, 92 m querab der
Verbindungslinie zwischen den Angaben bei km 10,759 und 12,6.

### Zwei weitere Fallstricke, die die App abfängt

1. **Die API antwortet unsortiert.** Sie liefert Steine im Umkreis von 10 km um die angefragte
   Position und kappt bei `limit`. Mit `limit=1` bekommt man deshalb einen quasi beliebigen Stein
   aus diesem Fenster — für Strecke 5100 km 12,5 etwa den bei km 20,8. Topovo lädt bis zu 200
   Steine und sucht das passende Paar selbst.
2. **Streckennummern tauchen mehrfach auf.** Auf Strecke 4201 liegen Steine, deren Kilometerwerte
   nur 165 m auseinanderliegen, geografisch aber 28 km. Ohne Prüfung würde quer durchs Land
   interpoliert. Topovo verwirft Paare, deren Luftlinie länger ist als die Kilometerdifferenz
   zulässt.

## Amtliche bayerische Dienste

Drei offene Dienste der Bayerischen Vermessungsverwaltung sind fest eingebaut, alle unter
**CC BY 4.0** und mit `EPSG:3857`, laufen also ohne Umprojektion in Leaflet:

| Knopf | Dienst | Layer |
| --- | --- | --- |
| **DOP20** | `geoservices.bayern.de/od/wms/dop/v1/dop20` | `by_dop20c` |
| **Relief** | `geoservices.bayern.de/od/wms/dgm/v1/relief` | `by_relief_schraeglicht` |
| **Parzellen** | `geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte` | `by_alkis_parzellarkarte_umr_schwarz`, in der App gefärbt |

**DOP20** ist das amtliche Orthophoto mit 20 cm Bodenauflösung und damit wesentlich feiner als das
weltweite Esri-Luftbild (das seit November 2026 raus ist: Esri verlangt einen API-Schlüssel oder ein
ArcGIS-Konto; der Knopf „Luftbild“ zeigt seitdem das DOP20). **Relief** ist das Schräglicht aus dem Geländemodell — Dämme, Einschnitte
und alte Trassen sind darauf deutlich zu sehen; die ebenfalls angebotene kombinierte Darstellung
wäscht genau diese kleinen Formen weg und ist deshalb nicht eingebaut. Beides deckt nur Bayern ab;
außerhalb antworten die Dienste mit einem leeren Bild und Status 200, also nicht mit einem Fehler,
den man abfangen könnte — die App warnt daher selbst, wenn die Kartenmitte außerhalb liegt.

**DOP20 auch in Baden-Württemberg** (seit 14.10.2026). Das LGL bietet sein Orthophoto ebenfalls
offen an (`owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C`, Layer `IMAGES_DOP_20_RGB`,
EPSG:3857, CORS frei, Datenlizenz Deutschland – Namensnennung 2.0). Auch dieser Dienst liefert
außerhalb seines Landes eine leere Kachel. Als PNG wäre sie durchsichtig, und man könnte beide
Dienste einfach übereinanderlegen — aber ein Luftbild als PNG ist gemessen 11-mal (BVV, 17 kB →
192 kB je Kachel) bzw. knapp 3-mal (LGL, 23 kB → 63 kB) so groß wie als JPEG. Die App entscheidet
deshalb je Kachel an der Landesgrenze (damals `bw-grenze.json`, aus dem Basis-DLM über die OGC API
des LGL, auf 50 m vereinfacht, 79 kB; seit 02.11.2026 `laender-grenzen.json`, s. u.): ganz in BW
das LGL, ganz außerhalb die BVV, nur im Saum von 300 m plus halber Kachel beide, und dann je
Bildpunkt das Land, in dem er liegt (die Grenze als Fläche auf die Kachel gezeichnet). Alles als
JPEG. Ist ein Bildpunkt beim zuständigen Land weiß, kommt er vom anderen: Beide Dienste reichen
ein Stück über die Grenze, und das LGL hat Löcher. Die Entscheidung kostet 0,2 ms je Kachel.

**DOP20 aus allen 16 Ländern** (seit 02.11.2026). Alle Länder bieten ihr Orthophoto offen als WMS
mit EPSG:3857 und CORS an (geprüft am 02.11.2026, Adressen und Layer in `LAND_WMS` in `app.js`).
Ein bundesweiter Dienst des BKG (`sgx.geodatenzentrum.de/wms_dop`) ist nicht offen (403). Die
Landesgrenzen kommen jetzt aus dem VG250 des BKG (WFS `vg250_lan`, nur Landflächen,
dl-de/by-2-0), auf 100 m vereinfacht und als Abstände in Zehntausendstel Grad gespeichert:
`laender-grenzen.json`, 198 kB (gepackt 77 kB); neu bauen mit
`node werkzeug/laender-grenzen-bauen.mjs`. `bw-grenze.json` ist damit entfallen. Die Wahl je Kachel
ist dieselbe wie vorher, nur mit beliebig vielen Ländern: ganz in einem Land durchgereicht, im
Saum alle beteiligten mit Maske je Land. Ganz außerhalb Deutschlands bleibt die Kachel
durchsichtig, an der Staatsgrenze die Bildpunkte, für die kein Dienst etwas hat (diese Kacheln
dann als PNG). Fällt ein Dienst aus, bleibt nur sein Teil leer.
Was dabei auffiel:
- Hessen mit `he_dop_rgb`, nicht `he_dop20_rgb` (zeichnet nur bis 1:9000).
- Bremen sind zwei Ebenen (`DOP20_2023_HB,DOP20_2023_BHV`).
- Hamburg hat nur Zeitreihen; ohne `TIME` kommt das neueste Jahr (unbelaubt 2026).
- Thüringen und Mecklenburg-Vorpommern zeichnen weit draußen nicht (gemessen bis 1:690 000 bzw.
  1:162 000) — wie bei der BVV fragt die App dort größer ab (`LAND_MASSSTAB_MAX`), bis 4096
  Bildpunkte (der Dienst in M-V gibt höchstens 4192 her). M-V auf Stufe 6 bräuchte 8192; dort setzt
  `dopLandPixel` die Kachel aus vier Teilen der Stufe 7 zusammen (gemessen 12 s beim ersten Laden),
  je zwei zugleich und schon beim Entpacken auf 128 Bildpunkte verkleinert (`dopBitmap`), damit
  nicht 64 MB je Bild im Speicher liegen. Weiter draußen bleibt M-V weiß.
- Mecklenburg-Vorpommern stempelt seinen Quellenvermerk ins Bild.
- Schleswig-Holstein und Sachsen-Anhalt geben CORS nur für https-Herkünfte frei; unter
  `http://localhost` fehlen sie.
- Weit herausgezoomt hört an einer Grenze oft jeder Dienst einen Bildpunkt zu früh auf; diese
  Lücken füllt `dopLueckenFuellen` aus den Nachbarn, sonst stand ein heller Strich auf der Grenze.
Die Quellenangabe des DOP20 nennt die Länder, deren Rahmen den Ausschnitt berührt
(`dopQuelleErneuern`).

**Relief und Flurstücke ebenso** (14.10.2026). Das Relief in BW ist die Schummerung des LGL aus dem
DGM025 (`WMS_LGL-BW_ATKIS_DGM_025_Schummerung`, Layer `Schummerung_DGM_025_BW`) — dunkler und
flacher als das bayerische Schräglicht, an der Grenze wechselt das Aussehen. Der früher genannte
Dienst aus dem DGM1 (`…DGM_1_Schummerung`) antwortet mit 500. Bei Ulm-Wiblingen fehlt in der
Schummerung ein Rechteck (in jeder Zoomstufe weiß); dort füllt der bayerische Dienst, der so weit
über die Grenze reicht — deshalb holt eine Kachel in BW, die zu mehr als 1 % weiß ist, auch den
bayerischen Dienst dazu. Tief in Bayern wird nicht nachgesehen.

Die Flurstücke kommen in BW aus dem INSPIRE-WMS des LGL (`WMS_INSP_BW_Flst_ALKIS`, Layer
`alkis:CP.CadastralParcel`, dl-de/by-2-0): schwarze Umringe mit Flurstücksnummer auf durchsichtigem
Grund, also genau wie die bayerische Parzellarkarte, und laufen durch dasselbe Umfärben. Beide
Dienste fragen nur im Rahmen ihres Landes, der des LGL erst ab Zoomstufe 17 (er zeichnet in jedem
Maßstab, auf Stufe 15 sind es 66 kB je Kachel und ein Gewirr). Die OGC API Features des LGL hätte die
Flurstücke auch als Vektoren (mit Fläche und Gemarkung, 87 kB gepackt für 400 × 400 m), ist aber
eine Beta; der Bilddienst passt zur bayerischen Lösung.

Die Gebäudeumringe stehen in Bayern in der Parzellarkarte; in BW hat der Flurstücksdienst nur
Flurstücke und Fluren, die Gebäude sind ein eigener INSPIRE-WMS (`WMS_INSP_BW_Gebaeude_ALKIS`, Layer
`BU.Building`). Er zeichnet graue Flächen (128, 128, 128) mit dunklem Rand und nimmt keine eigenen
Stile (SLD) an; die App macht das Grau durchsichtig (`parzFuellungWeg`), übrig bleibt der Umring wie
in Bayern. Der Dienst braucht je Abfrage rund 2,3 s, fast unabhängig von der Größe (256 px 2,0–3,3 s,
1024 px 2,4–2,7 s) — die Ebene holt deshalb Kacheln zu 1024 px: ein Bildschirm in 2 Abfragen und
3,9 s statt 20 Abfragen und bis 11 s.

**Ganz nah weich statt blockig.** Geholt wird das DOP20 bis Zoomstufe 19 (in Bayern 0,20 m je
Bildpunkt, so fein wie das Bild selbst), das Relief bis 18; darüber vergrößert Leaflet bzw. MapLibre
die letzte Stufe weich. Bis Oktober 2026 ging es bis 22 — der MapServer der BVV rechnet so feine
Kacheln pixelweise hoch, ganz nah standen Blöcke von 8 × 8 Bildpunkten. Glättungsparameter
(`INTERPOLATIONS`, `RESAMPLING`) ignoriert er, die Antwort war bitgleich.

Bei den Rasterbildern wird **JPEG statt PNG** angefragt: gemessen 13 kB gegenüber 172 kB je Kachel
beim Orthophoto, ohne sichtbaren Unterschied.

Die **Parzellarkarte** liegt als Auflage darüber, aber nur als Umring: Die Farbfassung mit
Nutzungsarten bringt einen deckend weißen Grund mit (gemessen 0 % durchsichtig gegenüber 98 % beim
Umring) und würde alles darunter verdecken. Wer sie braucht, kann sie unter *Eigener WMS-Layer* mit
`by_alkis_parzellarkarte_farbe` laden. Der Dienst zeichnet sie erst unterhalb
1:5000, also etwa ab Zoomstufe 17 — davor bleibt die Auflage leer, und die App sagt das beim
Einschalten.

**Die Farbe ist wählbar** — lange auf *Parzellen* drücken (am Rechner Rechtsklick), dann klappt
die Wahl auf: *Auto* (gelb über Luftbildern, schwarz über der Karte, sonst verschwinden sie im
Untergrund), sechs feste Farben oder über *+* eine beliebige. Ein kurzer Tipp schaltet weiter nur
ein und aus; das kleine Feld im Knopf zeigt die Farbe, in der gerade gezeichnet wird.

Der Dienst selbst kennt nur Schwarz und Gelb. Nachgemessen ist die schwarze Fassung reines Schwarz,
geglättet über den Alphakanal, dazu einzelne weiße Pixel — und die gelbe Pixel für Pixel dieselbe
Kachel mit Schwarz durch Gelb ersetzt. Die App holt deshalb immer die schwarze und färbt sie selbst
um: Grauwert 0 wird die gewählte Farbe, Weiß bleibt Weiß, der Alphakanal bleibt. Gelb kommt so
**bitgleich** zu dem heraus, was der Dienst liefert (0 von 262 144 Werten abweichend). Ein
Farbwechsel färbt die geladenen Kacheln ohne neue Abfrage um. Das geht nur, weil der Dienst CORS
freigibt — ohne wäre die Kachel für das Auslesen gesperrt.

**Punktraster abschaltbar.** Der Dienst hat keine Unterebenen: Grenzen, Gebäude, Beschriftung und
die Signaturen der tatsächlichen Nutzung kommen in einem Bild. Grünland, Gärten und ähnliche Flächen
sind dabei mit einem feinen Punktraster gefüllt, das auf dem Luftbild alles überzieht. In der
Farbwahl schaltet *Punktraster der Nutzung* es ab (Vorgabe: an); die Punkte fallen dann beim
Umfärben weg: Gemessen am 11.10.2026 bei 49,567 / 10,189 ist jeder Punkt in jeder
Zoomstufe genau 2 × 2 Pixel samt geglättetem Rand (3742 auf einer 512er-Kachel), das kleinste andere
Element hatte 13 Pixel. Zusammenhängende Teile bis 4 sichtbare Pixel werden durchsichtig; dort
verschwanden auf einem Handyausschnitt 46 158 Punktpixel, Grenzen, Gebäude und Straßennamen blieben
unverändert.

## Festpunkte (Baden-Württemberg und Bayern)

**Bayern** (seit 14.10.2026): WMS Festpunkte der BVV (`geoservices.bayern.de/od/wms/afis/v1/festpunkte`,
CC BY 4.0, CORS frei) mit Höhenfestpunkten (`by_hoehenfestpunkte`, DHHN2016), TP
(`by_lagefestpunkte`) und historischen TP (`by_lagefestpunkte_hist`, heute Katasterfestpunkte
beim ADBV); „TP" in der Auswahl schaltet beide. Aufnahme-, Polygon- und Grenzpunkte gibt es in
Bayern nicht offen — die Grenzpunktkoordinaten sind das Produkt „ALKIS-Punktkoordinaten". Gezeigt
wird das Bild der BVV (rote Höhenfestpunkte, grüne TP, eng Beieinanderliegendes als Kreis mit
Anzahl), ab Zoomstufe 13. Eigene Zeichen aus GetFeatureInfo über einen Ausschnitt waren nicht
verlässlich: 5 × 5 km um Bamberg ergaben in 1-km-Zellen 79 Höhenfestpunkte, in 500-m-Zellen 74, in
2-km-Zellen 71 und in einer 5-km-Zelle keinen. Ein Tipp auf die Karte fragt deshalb nur die Stelle
ab (41 × 41 Abfragepunkte zu je vier Bildschirmpunkten, der nächste Punkt im Umkreis von 16
Bildschirmpunkten, 0,14 s): Punktkennung, Koordinate in UTM 32 und der Festpunktnachweis als PDF
(`geodaten.bayern.de/odd_data/festpunkte/pdf/…`); die Höhe steht nur dort. Beim Messen fängt der
Tipp den Punkt (geprüft: 4 mm Rundungsrest).

### Baden-Württemberg

Eigene Auflage **Festpunkte** (Knopf unter den Auflagen, langer Druck wählt die Arten), aus der
OGC API Features des LGL (`ogcapi.lgl-bw.de/beta/pygeoapi`, Beta, dl-de/by-2-0, CORS frei):

| Art | Sammlung | ab Zoom | Vorgabe |
| --- | --- | --- | --- |
| Höhenfestpunkte | `hoehenfestpunkte` — mit Höhe (NHN), Ordnung, Vermarkung, Lagebeschreibung | 13 | an |
| Trigonometrische Punkte | `trigonometrische_punkte` | 13 | an |
| Aufnahmepunkte | `aufnahmepunkte` | 16 | an |
| Polygonpunkte | `punkte_pl` | 16 | an |
| Sicherungspunkte | `versicherungspunkte` | 17 | aus |
| Grenzpunkte | `grenzpunkt` | 18 | aus |

Die Koordinaten kommen mit `crs=EPSG:25832` gleich in UTM 32 — so liegen sie dort gespeichert,
auf den Zentimeter, ohne Umweg über WGS84. Geholt wird je Zelle (Web-Mercator-Kachel der Stufe 12,
14 bzw. 16) und Art, nur im Rahmen um BW; die API blättert ab 5000 Punkten weiter („next").
Gemessen am 14.10.2026, 1 km² Stuttgart-West: 16 TP, 189 Aufnahme-, 62 Polygon-, 227 Sicherungs-
und über 2000 Grenzpunkte; ein Bildschirm auf Stufe 17 mit 73 Punkten in 0,5 s, auf Stufe 18 mit
Grenzpunkten 375 in 0,4 s.

Die Zeichen liegen wie die KML-Symbole in der nicht mitdrehenden Ebene (`map._norotatePane`), sonst
lagen sie über den Sprechblasen.

## Tour

Das **?** im ©-Kasten unten links startet sie, jederzeit. Die Karte wird abgedunkelt, nur das
gerade erklärte Element bleibt hell und bekommt einen Rahmen in der Signalfarbe; daneben steht
eine Blase mit Text, *Zurück* und *Weiter*. Am Rechner gehen auch die Pfeiltasten, Escape oder ×
beendet sie. Während der Tour nimmt die Ebene alle Griffe ab — die Karte bewegt sich nur durch die
Vorführung.

Die elf Schritte: Suchzeile, Ergebnis, langer Druck setzt einen Punkt, Standort und mitlaufender
Kilometer, Messmenü mit seinen vier Werkzeugen, Geländeprofil, das ? in der Profilleiste, Karten und
Auflagen, Wetter, eigene Dateien und Abstecken, Quellen und das ?. Was sie erklärt, führt sie vor: Sie tippt `5100 12,5` Zeichen für Zeichen ein (ohne die
Tastatur des Handys aufzuklappen), sucht die Strecke wirklich, setzt einen Punkt, öffnet Messmenü
und Einstellungen und zeichnet den Querschnitt am Gleis des Ergebnisses (ohne Ergebnis ein freies
300-m-Profil durch die Kartenmitte). Klappt eine Vorführung nicht — ohne
Netz, außerhalb Bayerns —, sagt die Blase das, statt zu warten; nach höchstens 12 s geht es weiter.

Die Blase steht unter dem Ziel, wenn dort Platz ist, sonst darüber, sonst daneben (am großen
Bildschirm neben dem offenen Menü); passt sie nirgends, steht sie unten am Rand — auf dem Handy
beim Menü, dessen Knöpfe dann oben sichtbar bleiben.

**Das ? in den Werkzeugleisten** (Profil, Profilmappe, Polygon, Live, Abstecken) nutzt dieselbe Ebene
für eine kurze Tour nur durch diese Leiste: Diagramm, Ebenen, Regler, Sprünge, PDF und so weiter, je
nachdem, was gerade dasteht — ein noch nicht geladenes Profil hat weniger Schritte. Sie räumt nichts
weg und führt nichts vor; nur beim PDF klappt sie die Auswahl kurz auf und danach wieder zu. Danach
steht der Fokus wieder auf dem ?.

**Beim allerersten Start** bietet die App die Tour einmal an, in einer kleinen Blase über dem
©-Kasten. Sie gilt als gemacht, sobald sie gezeigt wurde: Wer *Nein, danke* sagt, wird nicht wieder
gefragt. Wer die App über einen geteilten Link öffnet, sieht zuerst sein Ergebnis und kein Angebot.

## Querprofil

Im Außendienst schnell sehen, wie das Gelände zwischen zwei Punkten verläuft — keine
Planungsgenauigkeit, eine Übersicht. Messknopf → *Profil*, dann Punkte antippen. Gefangen wird wie
beim Messen (Kilometersteine, KML-Punkte bis 20 m); Fadenkreuz, *Mitte* und *Standort* gibt es im
Profil nicht — für eine Geländeübersicht reicht der Finger, und die Leiste bleibt frei fürs Diagramm.
Ab zwei Punkten lädt das Profil von selbst. **Es sind genau zwei, A und B:** Stehen beide, setzt ein
Tipp in die Karte nichts mehr — er sagt nur, dass man A und B ziehen kann. Gezogen wird mit dem Finger
oder der Maus (Griff 26 px), die Linie läuft mit, gerechnet und gefangen wird beim Loslassen. Bis
Oktober 2026 hängte jeder Tipp einen weiteren Punkt an; gebraucht wurde das praktisch nie, ein
versehentlicher Tipp verdarb dafür den Schnitt. Kennwerte stehen nicht über
dem Bild (bis Oktober 2026 eine unbeschriftete Zahlenzeile, die keiner deuten konnte): Wischen übers
Diagramm zeigt an jeder Stelle Station und Höhe mit Fadenkreuz und einem Ring auf der Karte, das PDF
führt die Kennwerte mit Erklärung.

**Überhöhung.** Gezeichnet wird zunächst **unüberhöht** — so, wie das Gelände tatsächlich
verläuft. Der Regler *Überhöht* unter dem Bild reicht von 1× bis so steil, wie das Bild in die
160 px der Leiste passt (höchstens 20×), logarithmisch geteilt; die Wahl bleibt gespeichert. Am
rechten Ende steht „max“ hinter dem Wert. Mit Bäumen oder Gebäuden ist das oft schon bei 1,5×
erreicht, bei flachem Gelände erst bei 20×. Die Bildhöhe richtet sich nach dem Gelände: Flaches
Gelände unüberhöht gibt ein flaches Bild und eine kleinere Leiste. Bis Oktober 2026 gab es feste
Stufen 1/2/5/10×; davon gingen mit DOM oder Gebäuden oft nur eine oder zwei. Anfangs passte sich die
Höhenachse immer dem Schnitt an; zwei Meter auf 300 m sahen dann wie ein Berg aus.

**Oberfläche DOM20** ist der Legendeneintrag und zugleich der Schalter. Er nennt vorher die
Datenmenge; danach kommt die Oberfläche gestrichelt dazu, der Zeiger nennt die Objekthöhe
(DOM − DGM) an der Stelle, das PDF die größte.

**Parallel verschieben.** Ab zwei Punkten steht unter dem Diagramm die Reihe −10 −5 −1 +1 +5 +10
(am Rechner ← und →, mit Umschalt 10 m). Sie schiebt den ganzen Schnitt senkrecht zur Linie vom
ersten zum letzten Punkt, plus nach links von A → B — wer den Schnitt ansieht wie im Diagramm, A links
und B rechts, schiebt ihn damit nach vorn. Die getippte Linie bleibt blass auf der Karte, oben steht
der Versatz; ein Tipp darauf holt sie zurück, Ziehen von A oder B, *Zurück* oder *Leeren* ebenso.

### Profil am Gleis

Aus dem Ergebnis heraus, über den orangen Knopf neben *Google Maps* — bei jedem Ergebnis mit
Kilometer, nicht bei Orten, Betriebsstellen und wenn statt des Kilometers nur der nächste Stein
dasteht.

- **Quer**: senkrecht zum Gleis, 0 = Gleisachse, links und rechts in Richtung steigender Kilometer.
  Die Richtung kommt aus der Lage 5 m davor und danach. Der Regler *Breite* stellt 10, 25, 50,
  100 oder 200 m je Seite ein; geladen wird beim Loslassen.
- **Längs**: das Gelände am Gleis entlang von km − L bis km + L, alle 2–10 m eine Lage auf dem
  Gleis. Die Achse zeigt Kilometer, die Neigung ist eine Ausgleichsgerade über den ganzen Schnitt
  (zwei Endpunkte allein hingen an einem Graben). Regler *Länge*: 100, 250, 500 oder 1000 m je Richtung.
  Überhöht 10×, getrennt gemerkt — unüberhöht sind ein paar Promille auf 500 m ein flacher Strich.
- **Springen**: quer 1, 5, 10 m, längs 10, 50, 100 m entlang der Kilometrierung; am Rechner ← und
  →, mit Umschalt der große Schritt. Das Diagramm bleibt stehen, bis das nächste da ist, und die
  Sprungreihe wird dabei nicht neu gezeichnet — sonst ginge ein schneller zweiter Tipp verloren.

**Die Lage auf dem Gleis** ist dieselbe Rechnung wie beim Suchergebnis: das Steinpaar um den
Kilometer und darauf der Gleisweg aus dem mitgelieferten Netz, sonst die Sehne. Nur rastet sie nicht
an Steinen ein (das Ergebnis zeigt bis 0,5 m daneben den Stein selbst) — für Meterschritte muss
jeder Kilometer gleich gerechnet werden. Auf Strecke 5100 zwischen km 12,0 und 13,2 alle 2 m
nachgeprüft: Profil und Suchergebnis liegen auf 0,0 m beieinander, zurück über den Kartentipp alle
601 Stellen auf unter 1 m (höchstens 0,07 m). Die Schrittweite liegt bei 1-m-Sprüngen zwischen 0,75
und 1,3 m, mit zwei Ausnahmen von gut 5 m an Doppelsteinen: Die beiden Gleise sind in den Kacheln auf
5 m vereinfacht und liegen 4 m auseinander, welches näher am Stein ist, entscheidet dort der Zufall
der Vereinfachung. Vor der Überarbeitung, die der nächste Abschnitt beschreibt, waren es 488 von 601
Stellen, bis 55 m daneben, und Schritte zwischen 0,19 und 4,6 m.

### Zwei Gleise, zwei Steinreihen

Bei Breitengüßbach stehen auf der 5100 die Schilder beider Gleise in OSM (Wege 19211940 und
51155936): auf Gleis 1 12,4 · 12,6 · 12,8, auf Gleis 2 an denselben Stellen 12,393 · 12,612 · 12,819 —
dort mit `railway:position:exact`, und genau diesen Wert gibt die API als Kilometer aus. Die API
selbst unterscheidet die Reihen nicht (gleiche Strecke, gleicher Betreiber). In der Steinliste
wechselten sie sich ab, und das legte drei Schwächen offen, die weit über diese Stelle hinausreichen.
Gemessen an denselben 1919 Steinen auf sechs Strecken (5100, 5302, 5320, 5850, 5900, 5910), alle
200 m: Lage aus der Suche, zurück über den Kartentipp.

| | vorher | nachher |
| --- | --- | --- |
| Nachbarpaare mit Gleisweg | 791 von 1362 (58 %) | 1123 von 1312 (86 %) |
| Rundlauf unter 1 m | 1893 von 2481 (76 %) | 1974 von 2491 (79 %) |
| unter 5 m | 2249 (91 %) | 2329 (93 %) |
| unter 25 m | 2417 (97,4 %) | 2462 (98,8 %) |
| ab 25 m daneben | 65 | 29, alle schon vorher dabei |

1. **Zwei Steine auf derselben Kante.** Die Kacheln kommen auf Geraden mit Kanten über 500 m aus, Steine
   stehen alle 100–200 m — oft hängen beide Steine eines Paars auf derselben Kante. Die eingefügten
   Knoten waren nur mit den Kantenenden verbunden, nicht miteinander; der Weg lief bis zum Ende und
   zurück, 922 m statt 188 m, und die Plausibilitätsprüfung verwarf ihn. Dann rechnete die Suche auf
   der Sehne und der Kartentipp anders. Allein diese Verbindung hob die Paare mit Gleisweg von 384 auf
   542 von 714 (`kanteVerbinden`).
2. **Doppelsteine** — zwei Schilder am selben Querschnitt, 0–25 m Kilometer und bis 78 m auseinander
   (bei gleichem Kilometer bis 150 m): Als Nachbarn ergaben sie Paare von 7–24 m Kilometer auf 1–2 m
   Gleis, die Lage sprang zwischen den Gleisen. Fürs Rechnen werden sie zu einem Stein mit gemitteltem
   Kilometer vereint, an der Stelle des Schildes am linken Gleis (in Richtung steigender Kilometer, damit
   alle am selben Gleis hängen). Auf der Karte stehen weiter alle. Die Suche nach einem solchen Kilometer
   zeigt deshalb „auf dem Gleis" statt „exakt": Die beiden Schilder widersprechen sich um bis zu 25 m.
3. **Stein am Nachbargleis.** Hängen die Steine eines Paars an verschiedenen Gleisen, läuft der kürzeste
   Weg über die nächste Weiche (5100 km 40,2–40,4: 1738 m für 200 m). Ist der Weg ein solcher Umweg,
   hängt die App jeden Stein auch an das Gleis bis 10 m weiter und nimmt den kürzesten Weg aller
   Paarungen (`paarUmGleis`). Und sie sucht zuerst nur auf den Gleisen der eigenen Strecke — bei Fürth
   stand ein Stein der 5900 direkt auf einem S-Bahn-Gleis, das eigene lag 18 m weiter.

Dazu ein Fall, den erst das Vereinen sichtbar machte: zwei Doppelsteine „55,8" und „55,846" stehen
200 m neben km 46 der 5100, der echte km 56 liegt 10 km weiter — vertippt, gemeint ist 45,8. Solche
**Inseln** (ein einzelnes Paar, das zu beiden Nachbarn geometrisch unmöglich passt und dabei keine
100 m neben dem Streckenzug der übrigen Steine liegt) nimmt die App aus der Rechnung; auf den sechs
Strecken waren es dieses und eines an der 5320 bei km 36,2. Steinreihen, die unter derselben Nummer an
zwei Orten liegen und sich im Kilometer verzahnen, bleiben unberührt — sie liegen fern jedes fremden
Streckenzugs.

Was bleibt, sind Steine, deren Abstand nicht zur Kilometrierung passt (Luftlinie länger als die
Kilometerdifferenz, oder der Gleisweg deutlich kürzer): ein Fehler in den Daten, gegen den kein
Gleisweg hilft.

## Gebäude im Profil (LoD2)

*Gebäude* in der Legende legt das 3D-Gebäudemodell LoD2 der Vermessungsverwaltung in den Schnitt —
graue Blöcke mit senkrechten Wänden und der Dachform. Ein Finger auf einem Block nennt Art, Dachform,
Höhe und, wo hinterlegt, die Adresse. Quer am Gleis steht in den Kennwerten der Abstand von der
Gleisachse zur nächsten Wand links und rechts. Das DOM20 bleibt daneben sinnvoll: Es zeigt auch
Bäume, Masten und Lärmschutzwände, das LoD2 unterscheidet dafür Haus und Baum.

**Daten.** CityGML 1.0 in Kacheln von 2 × 2 km (`…/a/lod2/citygml/{O}_{N}.gml`), dasselbe System wie
das DGM1. Im Landkreis Bamberg im Median 3,7 MB je Kachel, bei 90 % höchstens 17,6 MB, die größte
50,5 MB — das XML packt sich aber auf ein Sechzehntel, und der Worker liefert es gzip-gepackt aus.
`gebaeude.js` liest die Datei Stück für Stück, wie sie ankommt, und behält je Gebäude nur Dachflächen,
Bodenhöhe und Angaben: Aus 16,7 MB werden 0,6 MB in IndexedDB. Der Schnitt selbst ist exakt: je
Dachfläche das Stück der Linie darin, die Höhe aus der Ebene der Fläche, aus allen Stücken die obere
Hülle; unten schließt der Block am Gelände.

**Nachgeprüft** mit `node werkzeug/gebaeude-pruefen.mjs`, Schnitte durch 40 zufällige Gebäude in
Bamberg gegen das unabhängig entstandene DOM20, jeweils in der Mitte der Dachflächen: Median 0,16 m,
90 % innerhalb 0,50 m, kein systematischer Versatz (−0,03 m). An First und Graten liegt das DOM
rund einen halben Meter tiefer — es rundet scharfe Kanten ab. First minus Boden trifft die
angegebene Gebäudehöhe bei 90 % auf 0,22 m.

## Profil als PDF

Das Teilen-Zeichen im Kopf der Profilleiste erzeugt eine Seite A4 quer: Titel mit Strecke und
Kilometer (frei: A–B), das Profil als Vektorgrafik im selben Maßstab wie in der Leiste, daneben ein
Luftbild DOP20 mit der Schnittlinie, Maßstab und Nordpfeil, die Kennwerte mit je einer Erklärzeile,
die Lage in Grad, UTM 32 und **DB_REF Gauß-Krüger**, ein Block **Genauigkeit** und unten die Quellen
nach CC BY 4.0 — nur die, die auf der Seite vorkommen. Vorher fragt die Leiste: dieser Schnitt, quer
am Gleis auch eine **Serie** (±50 m alle 10 m, 11 Schnitte) oder *+ In die Profilmappe*. Die Serie steht
auf Seite 1 als Linien im Luftbild und auf den folgenden Seiten in zwei Spalten, alle im selben
Höhenfenster und Maßstab, damit man sie vergleichen kann — so viele Reihen je Seite, wie die Höhe
zulässt.

**Profilmappe.** Eigener Eintrag im Messmenü: Querprofile an vielen Stellen, auch auf
verschiedenen Strecken, als ein PDF mit einer Seite je Schnitt. Eingegeben wird eine Liste — je Zeile
eine Strecke, dahinter ein oder mehrere Kilometer wie im Suchfeld (`5321 106,0 & 106,2`). Unlesbare
Zeilen nennt die Leiste beim Tippen. *+ Aktuelles Ergebnis* hängt Strecke und km des Suchergebnisses
an, aus dem Querprofil tut es *+ In die Profilmappe* in der PDF-Zeile. Breite, Gebäude, Oberfläche und
Überhöhung (1/2/5/10×; zu steil für die Seite wird gestaucht und im Kopf vermerkt) gelten für alle
Schnitte, damit die Seiten vergleichbar sind. Erst werden alle Schnitte gerechnet, dann gezeichnet;
was nicht zustande kommt (kein Gleisverlauf, außerhalb Bayerns), steht danach unter der Leiste, die
übrigen Seiten zählen ohne Lücke. Die Liste bleibt gespeichert. Eine erste Fassung sammelte im Oktober
2026 Schnappschüsse offener Profile in der PDF-Zeile — man sah nicht, was drin war, und nach einem
Neustart war sie leer.

**DB_REF.** ETRS89 → DB_REF mit der Umkehrung von EPSG:5826 („DB_REF to ETRS89 (1)", Coordinate
Frame, 7 Parameter), dann Gauß-Krüger auf dem Bessel-Ellipsoid im 3°-Streifen 3 (9° O) bzw. 4
(12° O). Die Streifengrenze bei 10,5° O läuft mitten durch Bayern; bis 0,5° daneben stehen beide
Streifen da. Gegen proj4 2.6.2 mit denselben Parametern auf 0,6 mm geprüft
(`node werkzeug/dbref-pruefen.mjs`). Die Koordinaten stehen auf ganze Meter — die Lage selbst ist
nur so genau wie die Gleislage aus OpenStreetMap.

**Genauigkeit.** Was die Quellen selbst angeben: DGM1 Höhe ±0,2 m und Lage ±0,5 m (freies,
ebenes Gelände), LoD2 Dachhöhe typisch ±0,2–0,3 m bis über 1 m, DOP20 Lage ±0,4–0,6 m (Produktseiten
und Metadaten der BVV); für das DOM20 nennt die BVV keine feste Zahl („regional und lokal
unterschiedlich"). Gleislage und Kilometer typisch ±10–30 m nach den Messungen oben unter
*Wie genau ist das?*. Die Zeile „Gelände am Rand" (Höhenversatz außen gegen das Gleis) ist seit
Oktober 2026 draußen — sie sagte im Plan nichts.

Geschrieben wird das PDF von `pdf.js` in der App, ohne Fremdbibliothek: Helvetica als Grundschrift
(nichts eingebettet), Text über WinAnsi, das Luftbild als JPEG unverändert. Eine Seite mit Luftbild
hat rund 100 kB, die Serie 130 kB. Auf dem Handy öffnet sich danach das Teilen-Menü; dauert es zu
lang (das Teilen braucht eine frische Geste), steht in der Leiste „PDF fertig · Teilen · Speichern".
Am Rechner wird gespeichert. Geprüft mit `node werkzeug/pdf-pruefen.mjs` (Aufbau, Zeichensatz, Bild)
und `node werkzeug/dbref-pruefen.mjs` (DB_REF).

## Höhe am Punkt

Unter dem Ergebnis, in der Sprechblase nach langem Druck, bei KML-Punkten und beim Abstecken steht
die Geländehöhe aus dem DGM1 in m ü. NHN. Für eine einzelne Höhe holt `hoehenPunkt` nicht die ganze
Kachel, sondern per Range-Abfrage nur Kopf und Streifen: gemessen 24 kB bzw. 37 kB beim ersten Punkt
einer Kachel (das TIFF-Verzeichnis steht mal vorn, mal hinten), 5–13 kB für jeden weiteren. Liegt die
Kachel schon auf dem Gerät, kostet es nichts. Die Zeile steht als Platzhalter da, bis der Wert kommt
— die Leiste springt nicht. Klar außerhalb von Bayern und Baden-Württemberg gibt es sie nicht; liegt
der Punkt im Rahmen, aber außerhalb (Thüringen, Hessen), oder fehlt das Netz, verschwindet sie wieder.
In Baden-Württemberg geht das Stück nicht — dort kommt der ganze Kilometer, siehe unten.

### Woher die Höhen kommen

DGM1 und DOM20 der Bayerischen Vermessungsverwaltung, OpenData unter CC BY 4.0, als GeoTIFF-Kacheln
von 1 km × 1 km. Am 10.10.2026 nachgemessen:

| | DGM1 | DOM20 |
| --- | --- | --- |
| Adresse | `download1.bayernwolke.de/a/dgm/dgm1/636_5528.tif` | `…/a/dom20/DOM/32638_5526_20_DOM.tif` |
| Raster | 1000 × 1000, Float32, LZW | 5000 × 5000, Float32, LZW |
| Aufbau | Streifen zu je 2 Zeilen, kein COG | intern 256 × 256 Pixel gekachelt |
| Größe je Kachel | 1,5–3,9 MB (Median 2,1 flach, 3,5 Alpen) | 13–64 MB (Median 42 bzw. 55) |

Vom DGM holt die App fürs Profil deshalb die ganze Kachel — eine schräge Linie braucht ohnehin fast
alle Streifen; für eine einzelne Höhe nur ein Stück, siehe *Höhe am Punkt* —, vom DOM per
Range-Abfrage nur die Blöcke entlang der Linie: rund 100 kB je 51 × 51 m,
auf 300 m gemessen 0,6 MB statt 40 MB. Gelesen wird ohne Fremdbibliothek (`hoehen.js`: TIFF-Kopf,
LZW, UTM-Umrechnung nach Krüger), bilinear zwischen den Rasterwerten.

**Geländekacheln bleiben auf dem Gerät** (IndexedDB, höchstens 40, die am längsten unbenutzten
gehen zuerst): Ein zweites Profil in derselben Gegend kommt nach einem Neustart in rund 60 ms und
ohne Netz. Berührt eine Linie mehr als vier Kacheln, fragt die Leiste vorher — mit Kachelzahl und
Datenmenge.

### Warum über einen eigenen Worker

Der Server der Vermessungsverwaltung gibt kein CORS frei: Der Browser lädt die Kacheln, reicht die
Bytes aber nicht an die App weiter. Der WMS liefert nur gerenderte Bilder, und der Höhendienst der
BVV (REST, bis 3000 Punkte je Anfrage) lässt im Browser nur die eigenen Portale und `localhost` zu.
Die App holt die Kacheln deshalb über einen kleinen Cloudflare Worker
(`werkzeug/proxy/worker.js`), der nur feste Kachelpfade durchreicht und nur dieser App die Freigabe
gibt — kein offener Proxy. Den Höhendienst reicht er absichtlich nicht durch: Wem er sich im Browser
öffnet, entscheidet der Betreiber.

Gemessen über den Worker, 300 m bei Bamberg: Gelände 0,4–1 s beim ersten Mal, Oberfläche 0,3 s.
Teilabfragen gehen dabei am Zwischenspeicher von Cloudflare vorbei — sonst holte Cloudflare beim
ersten Bereich erst die ganze DOM-Kachel, und der erste Abruf dauerte 4,8 s statt 0,19 s.

### Nachgeprüft

`node werkzeug/hoehen-pruefen.mjs` vergleicht den Leser mit unabhängigen Quellen:

| Prüfung | Ergebnis |
| --- | --- |
| UTM gegen proj4 2.6.2, 8 Punkte über Bayern | höchstens 0,05 mm |
| Höhe am Punkt per Teilabfrage gegen die ganze Kachel, beide Bauarten | gleich auf 0,000 mm |
| DGM1 gegen die XYZ-Fassung derselben Kachel, je 4000 Werte | Bamberg exakt, Berchtesgaden 0,5 cm (Rundung der XYZ-Datei) |
| DGM1 gegen den Höhendienst, je 400 Stellen | 400 von 400 — mit ½ m Versatz, siehe unten |
| DOM − DGM auf 300 m | 5-%-Wert +0,06 m, Lage und Höhenbezug passen |

**Der Höhendienst liegt einen halben Meter versetzt.** GeoTIFF und XYZ setzen den ersten Wert der
Kachel 636_5528 auf 636000,50 / 5528999,50, also in die Pixelmitte; der Dienst ordnet ihn der Ecke
zu. Am Hang macht das bis 1,7 m aus. Die App hält sich an GeoTIFF und XYZ.

**Die DGM1-Dateien sind nicht einheitlich gebaut:** Bei 636_5528 beginnt das TIFF-Verzeichnis bei
Byte 8, bei 778_5292 erst kurz vor dem Dateiende. Der Leser sucht es dort, wo es steht.

**An der Landesgrenze sind die bayerischen Kacheln beschnitten:** 573_5361 bei Neu-Ulm ist nur
875 px breit und beginnt 125 m weiter östlich. Bis Oktober 2026 brach das Profil dort mit „anderes
Raster" ab; seit BW dazukam, liest der Leser solche Kacheln mit ihrem Versatz.

### Baden-Württemberg

Seit 13.10.2026 kommt das Gelände auch aus dem DGM1 des Landesamts für Geoinformation und
Landentwicklung (LGL), [Datenlizenz Deutschland – Namensnennung 2.0](https://www.govdata.de/dl-de/by-2-0).
Es springt ein, wo Bayern keinen Wert hat — außerhalb Bayerns, aber auch auf dem Streifen an der
Grenze, wo die bayerische Kachel schon liegt, aber nur NoData trägt. Wo beide Länder Werte haben,
gilt Bayern. Profilleiste und PDF nennen, wessen Höhen im Schnitt stecken.

| | DGM1 BW |
| --- | --- |
| Adresse | `opengeodata.lgl-bw.de/data/dgm/dgm1_32_513_5402_2_bw.zip` |
| Archiv | 2 × 2 km, Südwestecke Ost ungerade, Nord gerade; darin vier Kilometer |
| Datei je km | XYZ-Text, 1000 × 1000 Werte von Nord nach Süd, Pixelmitte bei ,50 wie in Bayern |
| Größe je km | 29 MB entpackt, rund 3,2–3,4 MB gepackt |

Das LGL bietet auch einen WCS mit offener CORS-Freigabe an; der lieferte am 13.10.2026 aber
16-Bit-Ganzzahlen statt Metern, die nicht zu den Höhen aus dem XYZ passten — deshalb die Archive.
Die gibt es nur ohne CORS, also wie in Bayern über den Worker (`/bw/dgm1/{O}_{N}.zip`). Der Server
nimmt Teilabfragen an: Die App holt erst das Verzeichnis am Ende des Archivs (64 kB), dann nur die
Datei des einen Kilometers, entpackt sie im Browser (`DecompressionStream`) und liest den Text.
Im Gerätespeicher liegen danach die Werte (4 MB), nicht der Text.

**Der Server des LGL drosselt jede einzelne Verbindung.** Am Stück kamen 3 MB über den Worker im
Browser erst nach 6–9 s, einmal 18 s (rund 170–450 kB/s), über dieselbe Strecke aus Bayern in
0,4–0,6 s. Die App holt den Kilometer deshalb in Stücken zu 384 kB, bis zu acht gleichzeitig. Über
den echten Worker gemessen, je ein neuer Kilometer samt Verzeichnis, Entpacken und Lesen:
Heidelberg 1,9 s, Karlsruhe 1,4 s, Reutlingen 1,8 s. Der allererste Abruf nach längerer Pause kann
einige Sekunden länger dauern, bis der Worker wach ist.

Ein Stück für die *Höhe am Punkt* geht aus einem gepackten Archiv nicht; dort kommt der ganze
Kilometer.

**Oberfläche und Gebäude.** Auch DOM1 und LoD2 kommen aus den Archiven des LGL (`/bw/dom1/…`,
`/bw/lod2/…`) und springen ein, wo Bayern nichts hat. Das DOM1 ist ein GeoTIFF mit 1 m Raster
(in Bayern 20 cm), Float32, LZW mit Gleitkomma-Prädiktor, rund 3,3 MB je Kilometer; es liegt danach
im Vorrat. Aus der CSV neben jeder Datei liest die App die Befliegung und zeigt sie an
(„DGM1 · DOM1 2016"); DGM und DOM eines Kilometers stammen aus derselben Befliegung (Stuttgart
2016, Reutlingen 2017, Ulm 2021) — die Jahreszahl im Dateinamen ist die der Fortführung. Das LoD2 ist
dasselbe CityGML-1.0-Profil wie in Bayern, je Kilometer 18–50 MB, gepackt 2–5 MB; die Adresse steht
unter `xal:` statt `xAL:`, `HoeheGrund` fehlt (der Boden kommt im Profil ohnehin aus dem DGM).

Nachgeprüft am 13.10.2026: Das nDOM1 des LGL taugt nicht als Gegenprobe für das DOM1 — es passt in
keiner Kachel zu DOM − DGM. `hoehen-pruefen.mjs` prüft deshalb, was nur bei richtig gelesenen Werten
gilt: In Reutlingen liegen 0 von 3000 Stellen mehr als 0,3 m unter dem Gelände, 19 % genau darauf.
`gebaeude-pruefen.mjs` schneidet bei Stuttgart 40 zufällige Gebäude: alle getroffen, Dach LoD2
gegen DOM1 im Median 0,19 m, bei 90 % unter 1,7 m (das 1-m-Raster verschmiert Kanten stärker als
das DOM20 in Bayern, dort 0,16 bzw. 0,50 m).

**Luftbild im PDF.** Liegt das Gelände nur in Baden-Württemberg, kommt das Luftbild der PDF-Seite
aus dem DOP20-WMS des LGL (`WMS_LGL-BW_ATKIS_DOP_20_C`, Ebene `IMAGES_DOP_20_RGB`), das CORS für alle
freigibt — 880 × 660 px in 1,3 s. Vorher kam es auch dort vom bayerischen Dienst und blieb weiß.
An der Grenze, wo das Profil beide Länder berührt, bleibt es beim bayerischen.

`hoehen-pruefen.mjs` prüft BW gegen den Text derselben Datei, unabhängig gelesen (2000 Stellen,
exakt), und die Grenze an der Donau zwischen Ulm und Neu-Ulm: 300 Punkte über 2,3 km alle mit Wert;
im Überlappungsstreifen weichen beide Länder im Median 6 cm voneinander ab, 90 % unter 16 cm, an
zwei kurzen Stellen bis 4,3 m — Geländeänderungen zwischen den Befliegungen.

## Wetter: Luftdruck und Temperatur

Unter *Wetter* in den Einstellungen stehen absoluter Luftdruck, Temperatur und relative Feuchte —
die Eingaben für die atmosphärische Korrektur (ppm) am Tachymeter. Für den eigenen Standort, wenn
er läuft, sonst für die Kartenmitte; geholt beim Aufklappen (höchstens alle 5 Minuten neu) und mit
*Aktualisieren*. Quelle ist [Open-Meteo](https://open-meteo.com/) (frei, ohne Schlüssel, in
Deutschland das ICON-Modell des DWD, viertelstündlich). Mit `elevation=` rechnet der Dienst den Druck
auf die Geländehöhe um; in Bayern kommt sie aus dem DGM1 (`hoehenPunkt`), gemessen am 11.10.2026:
278 m → 982,5 hPa, 500 m → 956,4 hPa. Ohne Höhe nimmt er sein eigenes 90-m-Modell. Ein Modell ist
keine Messung vor Ort: rund ±1 hPa und ±1–2 °C, zusammen etwa ±2 ppm (2 mm auf 1 km). Die Lage geht
auf drei Nachkommastellen gerundet hinaus; der Service Worker legt nichts davon ab.

## Regenradar

Unter *Wetter → Regenradar* liegt das Niederschlagsradar des Deutschen Wetterdienstes über der
Karte: das RV-Produkt mit 1 km Raster, alle 5 Minuten neu. Es liegt über der Grundkarte und unter
Parzellen und Bahn-Layer — eine Fläche, über der die Linien scharf bleiben, statt eingefärbt zu
werden.

Solange es an ist, steht unter der Suchzeile eine **Zeitleiste**: links eine Stunde Messung
(durchgezogen), rechts zwei Stunden Vorhersage (gestrichelt), dazwischen eine Marke für die letzte
Messung. Daneben die Uhrzeit und ob es Messung oder Vorhersage ist; darunter die Farbstufen des
Dienstes. Der Regler läuft **stufenlos**: Zwischen zwei Fünfminutenbildern zieht der Regen weiter,
wie in der DWD-App WarnWetter. Die Uhrzeit springt dabei wie dort von Messung zu Messung. **▶**
spielt den Verlauf gleitend ab, 20 Minuten je Sekunde, steht am Ende kurz und beginnt von vorn.
Das **×** schaltet das Radar ab. Bei offenem Menü tritt die Leiste zurück. Solange noch Bilder
fehlen, steht „lädt … %" unter der Uhrzeit.

### Zahlen statt Bilder

Bis 13.10.2026 kamen fertig eingefärbte WMS-Kacheln, je Zeitpunkt ein Bild, und der Regler sprang in
Fünfminutenschritten. Zum Gleiten braucht es Werte: WarnWetter blendet nicht über, es verschiebt. In
einem Bildschirmvideo der App wandert das Regenband weiter, während die Uhr noch auf derselben
Marke steht, scharfrandig und ohne die Doppelkontur, die ein Überblenden zeigen würde. Aus zwei
Farbbildern lässt sich so ein Zwischenstand nicht rechnen.

Deshalb holt die App die Rohwerte über den **WCS** desselben GeoServers
(`maps.dwd.de/geoserver/dwd/ows`, Coverage `dwd__Niederschlagsradar`): je Zeitpunkt ein GeoTIFF des
Ausschnitts, Float32 in **mm je 5 Minuten** (× 12 = mm/h — gegen GetFeatureInfo und die Farben des
WMS geprüft), Deflate-gepackt, in `EPSG:3857` vom Dienst selbst gerechnet. Gemessen 15–80 KB und
0,3–3 s je Zeitpunkt; die WMS-Kacheln brauchten 1–7 s. Ohne `geotiff:compression=Deflate` wären es
1 MB statt 26 KB. Der Ausschnitt ist doppelt so groß wie die Sicht, mindestens 250 km; größere
verkleinert der Dienst (`scalesize`) auf höchstens 400 Zellen je Richtung. Das Raster der Antwort
weicht vom angefragten Rahmen ab, die Lage kommt deshalb immer aus dem TIFF. Alle 37 Zeitpunkte
werden vorgeladen, die um den Regler zuerst — gemessen 6–8 s für alle, drei Abrufe zugleich (der
Dienst spricht nur HTTP/1.1).

**Bewegung** (`radar-werk.js`, ein Worker): Je Paar benachbarter Zeitpunkte sucht er für Blöcke von
etwa 15 km, wohin der Regen am besten passt (Summe der Abweichungen von log(1 + mm/h), bis rund
140 km/h), verfeinert auf Bruchteile einer Zelle, glättet über die Nachbarn und füllt regenfreie
Blöcke von dort auf. Eine Strafe für weite Wege gibt es nicht — schon eine kleine machte aus einer
Verschiebung von (4, −3) Zellen (3,74, −2,64), weil schwacher Regen so glatt ist, dass die Strafe
den Ausschlag gibt. Gemessen an einem echten Paar sinkt die Abweichung zum nächsten Bild mit der
geschätzten Bewegung von 24,3 auf 15,6.

**Zeichnen** (WebGL2, `RADAR_FS` in `app.js`): Für einen Zeitpunkt zwischen A und B wird A um den
Anteil der Bewegung vorgeschoben, B um den Rest zurück, beide gemischt und **erst danach**
eingefärbt — so bleiben die Stufen scharf abgesetzt, statt zu verschwimmen. Zwischen den Zellen
bilinear, wie zuvor `INTERPOLATIONS=bilinear` beim WMS; *bicubic* schwingt über und erfindet kleine
Inseln. Die Flächen decken nur zu 45 %, dafür trägt **jede Stufengrenze eine Linie**, einen
Bildschirmpixel breit, in der Farbe der höheren Stufe — abgedunkelt auf Karte und Relief,
unverdunkelt auf Dunkel und den Luftbildern, wo dunkle Linien im Wald untergingen. So bleiben die
gewohnten DWD-Farben, und das Radar bekommt trotzdem harte Kanten; Luftbild und Gleise scheinen
besser durch als bei den früheren 70 %. Die Legende in der Leiste zeigt die vollen Farben: mit 45 %
wurden die Stufen auf dem dunklen Leistengrund trüb. Gemessen 2,6 ms je Bild bei
1920 × 1200 Bildpunkten; die Fläche ist auf 4 Millionen Bildpunkte begrenzt.

Weitere Punkte, die nicht offensichtlich sind:

- **Ohne Zeitangabe geht es nicht.** Ohne `TIME` nimmt der Dienst „current", und das ist nicht die
  letzte Messung, sondern der Zeitschritt, der der Uhr am nächsten liegt — meist schon einer der
  Vorhersage. Die letzte Messung steht als Vorgabe von `REFERENCE_TIME` in den Capabilities der
  WMS-Ebene; über den Ebenenpfad (`…/dwd/Niederschlagsradar/wms`) sind die 38 KB klein statt 875 KB
  für den ganzen Dienst. Gemessen lag sie 6 Minuten hinter der Uhr. `TIME` allein genügt dann: Für
  einen vergangenen Zeitpunkt liefert der Dienst die Messung, für einen künftigen die Vorhersage des
  neuesten Laufs.
- **Neue Messung, neuer Lauf.** Die App sieht alle fünf Minuten nach. Messungen bleiben, alles nach
  der alten Messung war Vorhersage des alten Laufs und wird neu geholt — Vorhersagen deshalb ohne
  Zwischenspeicher, und eine verspätete Antwort des alten Laufs wird verworfen. Ein gewählter
  Zeitpunkt bleibt stehen, nur „letzte Messung" geht mit.
- **Die Zeichenfläche liegt in der Kachelebene** (`tilePane`) und sortiert sich wie die Kacheln per
  z-index. In der Vektorebene läge sie über dem Bahn-Layer und würde bei großen KML-Dateien während
  einer Geste ausgeblendet. Ihre Lage rechnet sie wie Leaflets Kachelebenen: gemessen 0 px Versatz
  nach Schieben und Zoomen, unter 0,6 px bei gedrehter Karte.
- Braucht **WebGL2** (wie MapLibre für die dunkle Karte); ohne steht „braucht WebGL2" in der Leiste.
  Der Service Worker lässt `maps.dwd.de` durch: Ein Radarbild ist nach fünf Minuten alt und gehört
  nicht in den Offlinevorrat.

Prüfen: `node werkzeug/radar-pruefen.mjs` liest ein aktuelles GeoTIFF, vergleicht den Höchstwert
mit GetFeatureInfo, verschiebt ein Bild um eine bekannte Strecke und lässt sie finden und prüft an
einem echten Paar, dass die geschätzte Bewegung das nächste Bild besser trifft als keine.

## Laserpunkte in 3D

Am Handy der runde Knopf mit der Punktwolke über dem Messknopf, am Desktop „Laser“ in der Symbolspalte. Solange das offen ist, zeigt die Karte das Raster
der Laserkacheln (1 × 1 km); ein Tipp setzt einen Rahmen, der sich ziehen und von 50 bis 1000 m
vergrößern lässt. Berührt er mehrere Kacheln (an einer Ecke vier), werden alle geladen. „Nur Boden“
lässt Bewuchs und Gebäude weg. Die 3D-Ansicht (`laser.js`, three.js) färbt nach Klasse, Höhe,
Intensität oder Normalen (graue Schummerung mit Licht von Nordwesten, für Böschungskanten), blendet
Klassen ein und aus, zeigt perspektivisch oder orthografisch und misst wie Potree Distanz
(Linienzug), Fläche und Höhe (Δh zweier Punkte mit Neigung); Messpunkte lassen sich ziehen.

**Daten:** Laserpunkte der Bayerischen Vermessungsverwaltung (CC BY 4.0),
`geodaten.bayern.de/odd_data/laser/{O}_{N}.laz`. Am 04.11.2026 nachgesehen: LAS 1.2, Punktformat 1
(Klasse und Intensität, keine Farbe), **nicht** als COPC und in Fluglinien-Reihenfolge — ein
Ausschnitt braucht deshalb die ganze Kachel, 40–255 MB in Mittelfranken, laut BVV bis 1 GB. Kein
CORS: über den Worker (`/laser/…`). Der Server packt die Dateien zusätzlich mit gzip, sobald der
Abrufer es anbietet, und Cloudflare bietet es immer an — durch den Worker kommt deshalb **keine
Dateigröße** und kein Bytebereich. Die App lädt trotzdem (`ohneLaenge` in `laser-werk.js`), die
Leiste nennt dann nur die übliche Spanne.

**Laden und Speicher:** `laser-werk.js` entpackt mit laz-perf (WebAssembly) Punkt für Punkt und
behält, was im Rahmen liegt, ausgedünnt auf höchstens 2 Mio. Punkte. Dazu Normalen je Punkt
(Hauptachsen der Nachbarn, Umkreis nach der Dichte, mindestens 0,8 m). Geladene Kacheln bleiben
**nur im Arbeitsspeicher** des Workers (am PC bis 800 MB, am Handy 400 MB, die älteste fliegt
zuerst) und gehen mit dem Schließen von „Laserpunkte“ verloren — nichts landet auf dem Gerät: der
Service Worker lässt `.laz` durch, der Worker schickt `no-store`. Laden und Entpacken lassen sich
abbrechen.

Gemessen am 04.11.2026: Kachel 586_5491 (Gollhofen, 45 MB) über den Worker in 3,9 s geladen; mit
Entpacken und Normalen 11,7 s bis zur Ansicht (482.000 Punkte auf 200 × 200 m). Eine ganze Kachel
„nur Boden“ (8,4 Mio. Punkte) aus dem Speicher in 11 s.

**Sehr große Kacheln kommen über Cloudflare abgeschnitten an** (gemessen 05.11.2026): 650_5254
(Zugspitze, 713 MB) über den Worker zweimal geholt, angekommen 540 MB und 214 MB — jedes Mal mit
sauberem Ende, ohne Fehler. Direkt von der BVV kam sie ganz (178 s). Bis rund 100 MB lief es ohne
Abbruch (613_5478, 92 MB). Weil ohne Dateigröße niemand das Ende prüft, schaut `vollstaendig` in
`laser-werk.js` nach, ob die Datei bis zu ihrer Chunk-Tabelle reicht (LAZ legt sie ans Ende, der
Verweis steht am Beginn der Punktdaten). Abgeschnitten gilt als Abbruch mittendrin, höchstens drei
Versuche, dann eine Meldung. Vermutete Ursache: Cloudflare verlangt bei der BVV selbst gzip (die
`Accept-Encoding: identity` des Workers kommt nicht an — die Antwort trägt das ETag `…-gzip`), und weil
der Worker `Content-Encoding` nicht weitergab, musste die Laufzeit die ganze Kachel im Worker entpacken.
Seit 05.11.2026 reicht der Worker Laserkacheln gepackt durch (`packung`), der Browser entpackt. Ob das
den Abbruch behebt, zeigt sich erst im Betrieb — im Browser kam die Kachel auch vorher zweimal ganz an,
nur über curl nicht. Direkt bei der BVV gilt: ungepackt mit Größe und Bytebereichen (206), gepackt
ohne beides.

**Zwei Kachelformate** (Stichprobe 05.11.2026, 78 Kacheln alle 30 km): Die älteren Befliegungen
(Mittelfranken, 586_5491, 612_5478) sind LAS 1.2, Format 1, 40–100 MB. Die neueren sind **LAS 1.4,
Format 6**, und viel größer: Mittel aller Stichproben 246 MB, 12 von 78 über 400 MB — nicht nur in den
Alpen (690_5270 Karwendel 1,9 GB, 780_5300 Berchtesgaden 1,36 GB), auch in Oberfranken (720_5570 762 MB),
der Oberpfalz und um Nürnberg (660_5480 533 MB). In LAS 1.4 ist das alte 32-Bit-Feld der Punktzahl 0;
laz-perf meldet dann `getCount() === 0`, die Zahl steht im 64-Bit-Feld des Kopfes. Bis 05.11.2026
zeigte der Viewer für all diese Kacheln „keine Laserpunkte“. Zugspitze 650_5254 (713 MB, 75 Mio.
Punkte) danach im Browser: Laden 74 s, Entpacken 55 s, Normalen 10 s.

**Begrenzung je IP-Adresse** (seit 05.11.2026, `GRENZEN` in `worker.js`): 30 Laserkacheln je Stunde,
3000 sonstige Abrufe je 10 Minuten; darüber 429 mit `Retry-After`. HEAD zählt nicht. Gezählt wird im
Speicher des Workers — wirkt nach Einfügen im Dashboard, gilt aber je Instanz und Rechenzentrum: eine
Bremse gegen Skripte, keine harte Grenze. Strenger geht es mit der Rate-Limiting-Bindung von Cloudflare,
die sich nur über `wrangler` einrichten lässt (im Dashboard nicht sichtbar), etwa mit einer
`wrangler.toml` neben `worker.js`:

```toml
name = "trackpilot-hoehen"
main = "worker.js"
compatibility_date = "2026-11-01"

[[ratelimits]]
name = "LASER_GRENZE"
namespace_id = "1001"
simple = { limit = 5, period = 60 }
```

und `npx wrangler deploy`. Der Worker nimmt `LASER_GRENZE` dann zusätzlich, für Laserkacheln. Achtung:
Ein Deploy mit wrangler überschreibt den Code im Dashboard.

Lokal liest die App zuerst `laser-probe/{O}_{N}.laz` (nicht im Repo), sonst den Worker.

## Eigener WMS-Layer

Im Menü lässt sich ein beliebiger WMS als Overlay einblenden — Adresse, Layer-Name und Deckkraft
werden lokal gespeichert. Getestet mit
[TopPlusOpen](https://gdz.bkg.bund.de/index.php/default/wms-topplusopen-wms-topplus-open.html)
des BKG (`https://sgx.geodatenzentrum.de/wms_topplus_open`, Layer `web`).

**Geschützte Dienste** funktionieren, brauchen aber einen Umweg. Die App kann die Zugangsdaten
nicht selbst mitschicken: Dafür müssten die Kacheln per `fetch` mit `Authorization`-Header geholt
werden, und das verlangt CORS-Freigaben, die solche Dienste praktisch nie senden — der Browser
bricht bereits beim Preflight ab. Als Bild geladen entfällt die CORS-Prüfung, und der Browser
hängt von sich aus die Zugangsdaten an, die er für die Domain gespeichert hat.

Deshalb der Knopf **Anmelden**: Er öffnet die GetCapabilities-Adresse in einem neuen Tab, der
Browser fragt Benutzer und Kennwort ab und merkt sie sich. Danach lädt der Layer. Nebenbei sieht
man dort die verfügbaren Layer-Namen und Koordinatensysteme.

Die Zugangsdaten liegen damit im Passwortspeicher des Browsers — verschlüsselt und mit dem
Betriebssystem verzahnt. **Die App kennt sie nicht und speichert sie nicht**, weder im Code noch
im lokalen Speicher.

Voraussetzung ist, dass der Dienst `EPSG:3857` anbietet; andernfalls bräuchte es Proj4Leaflet.
Die Layer-Liste zeigt auch die Maßstabsgrenzen an, falls der Dienst welche angibt — die sind der
häufigste Grund, warum ein Layer beim Zoomen plötzlich verschwindet.

Der Layer selbst bekommt `maxZoom: 22`. Leaflet setzt bei Kachel-Layern standardmäßig 18, wodurch
ein WMS-Overlay beim Hineinzoomen verschwand; ein WMS rendert aber jeden Maßstab auf Anfrage und
hat keine natürliche Obergrenze.

## Eigene KML-Dateien

**KML oder KMZ öffnen** im Menü lädt beliebig viele Dateien vom Gerät. Jede bleibt als Eintrag in
einer Liste stehen und lässt sich einzeln ein- und ausschalten; das Symbol links öffnet Farbe und
Form, die beiden Knöpfe rechts zoomen auf die Datei bzw. nehmen sie aus der Liste. Ein Tipp auf ein
Objekt zeigt Name, Beschreibung und die Merkmale, bei Punkten zusätzlich die Koordinate und einen
Link zu Google Maps. Am Rechner geht auch, die Datei einfach ins Fenster zu ziehen. Die Objekte
liegen in einer eigenen Pane über allem anderen, auch über den Kilometersteinen der App.

**Symbole nach Merkmal.** Viele Ausgabeprogramme schreiben ihre Merkmale als Text in die
Beschreibung, etwa `Code: PS2, Marker type: 3`. Besteht eine Zeile vollständig aus solchen
`Schlüssel: Wert`-Stücken, wird sie in Merkmale zerlegt — bewusst streng, damit von einem Fließtext
kein Trümmerfeld übrig bleibt. Danach lassen sich die Symbole **automatisch** unterscheiden: eine
der zehn Formen je Merkmalswert, numerisch sortiert (2 vor 14), mit Legende in der Klappe. Trägt
eine Datei ein Merkmal, dessen Name nach Typ aussieht, ist das beim Öffnen gleich voreingestellt;
sonst liegt alles einheitlich als Kreis. Dieselben Merkmale lassen sich in die Beschriftung
aufnehmen, etwa `5062AA00001 · PS2`.

**Einzelne Merkmalswerte aus- und einblenden.** Unter *Sichtbar* steht jeder Wert des gewählten
Merkmals mit seiner Häufigkeit — ein Tipp nimmt ihn aus der Karte. Aus einer Datei mit 61 Objekten
werden so etwa nur die 36 Neubau-Querungen gezeigt; die Zeile in der Liste sagt dann „59 von 61
Objekten". Ausgeblendetes wird auch nicht beschriftet, nicht beim Messen gefangen und nicht zum
Abstecken angeboten. Der Zustand bleibt gespeichert.

**Namen auf der Karte** erscheinen ab Zoomstufe 16 und höchstens 200 auf einmal, jeweils nur was
im Bild liegt. Ohne diese Grenzen hängen bei einer Datei mit tausend Punkten tausend Textknoten in
der Karte, und lesbar ist davon nichts.

Beschreibungen werden vor dem Auswerten an `<br>` und Absatzenden umgebrochen — `textContent` kennt
kein `<br>`, sonst lief ein ganzer Beschreibungsblock zu einer einzigen Zeile zusammen und die
Merkmale darin waren nicht mehr zu erkennen. Führt eine Datei dieselben Felder in `ExtendedData`
*und* in der Beschreibung, werden sie zusammengelegt; bei gleichem Schlüssel gewinnt der längere
Wert.

Gelesen werden `Point`, `LineString`, `LinearRing`, `Polygon` (auch mit Löchern), `MultiGeometry`
und `gx:Track`, dazu `Style` und `StyleMap` (Zustand *normal*) mit Linienfarbe, Linienstärke und
Flächenfarbe — eine selbst gewählte Farbe hat Vorrang, sonst hätte das Auswählen bei Dateien mit
eigenem Stil keine Wirkung. Ordner werden nicht als eigene Schalter angeboten, der Ordnerpfad steht aber in der
Sprechblase. Nicht unterstützt sind eigene Symbolbilder, `GroundOverlay`, `NetworkLink` und
Modelle. Beschreibungen enthalten oft ganze HTML-Tabellen — übernommen wird nur deren Text, gelesen
über `DOMParser`, damit nichts davon ausgeführt oder nachgeladen wird.

**KMZ ohne Fremdbibliothek.** Ein KMZ ist ein ZIP mit einer KML darin. Gelesen wird das zentrale
Verzeichnis am Dateiende: Nur dort stehen die Größen verlässlich — bei gestreamt geschriebenen ZIPs
sind sie im lokalen Kopf null. Das Aufblasen macht `DecompressionStream('deflate-raw')`, das jeder
aktuelle Browser mitbringt.

**Gespeichert wird in IndexedDB**, nicht in localStorage: Dessen rund 5 MB sprengt schon ein
mittelgroßes KML. Abgelegt wird die ausgewertete Geometrie statt des XML, sodass beim Start nichts
mehr zu parsen ist. Kopfdaten (Name, Farbe, sichtbar) und Geometrie liegen in getrennten Stores —
das Ein- und Ausschalten schreibt damit ein paar Byte statt der ganzen Datei. Die Dateien liegen
auf dem Gerät und sind auch ohne Netz wieder da; hochgeladen wird nichts.

Punktsymbole und Namen liegen in einer eigenen Leaflet-Pane über allen Markern, Linien und Flächen
in Leaflets normaler Vektorebene.

### Warum Linien beim Drehen und Zoomen sprangen

Gemeldet als „wenn ich drehe und zoome, verspringt alles — aber nur die Linien". Zutreffend, und die
Ursache liegt nicht bei den KML-Dateien: **leaflet-rotate zieht die SVG-Vektorebene während einer
laufenden Zweifingergeste nicht mit.** Nachgemessen mit einer nachgebauten Geste (Pinch und Drehung
gleichzeitig) und der Bildschirmmatrix des Pfades: Der Endpunkt einer Linie wanderte mitten in der
Geste um bis zu **171 Pixel** und sprang am Ende zurück auf 0. Betroffen sind alle Vektoren gleich —
in einer selbst angelegten Pane genauso wie in Leaflets eigener; Marker und Symbole bleiben ruhig,
weil die einzeln gesetzt werden. Deshalb sah es aus, als sprängen nur die Linien.

Zwei Messfehler von mir haben das lange verdeckt: Erst habe ich bei Linien `_parts` verglichen, also
Leaflets *interne* Rechenpunkte — die stimmen auch dann, wenn der Container falsch transformiert
ist. Dann habe ich die Mitte des Umschließungsrechtecks genommen, und die bleibt bei einer geraden
Strecke selbst dann richtig, wenn die Linie falsch gedreht gezeichnet wird.

Die Abhilfe: Der Renderer wird während der Geste **bei jedem Bild neu gesetzt**, dann bleibt alles
auf 0 Pixel. Das kostet Rechenzeit — gemessen 0,6 ms bei den üblichen Dateien und bei 23 Linien,
2 ms bei 200 Kreisen, aber 14 ms bei einer einzigen Linie mit 5000 Stützpunkten, was bei 60 Bildern
je Sekunde zu viel wäre. Deshalb gilt ein Budget von 2500 Stützpunkten: darunter wird nachgezogen,
darüber die Vektorebene für die Dauer der Geste ausgeblendet und danach einmal neu gesetzt.
Verschwundene Linien irritieren weniger als umherfliegende.

### Kilometer zu einem KML-Objekt

Ein Tipp auf ein KML-Objekt löst die Kilometersuche nicht von selbst aus — sonst würde jeder Blick
in die Merkmale eine Netzabfrage anstoßen. In der Sprechblase steht dafür der Knopf **„Kilometer
bestimmen"**: Bei einem Punkt gilt dessen eigene Koordinate, bei einer Linie oder Fläche die
angetippte Stelle. Gerechnet wird danach genau wie bei einem Tipp auf die Karte, nur mit festem
Fangradius von 80 m statt der zoomabhängigen Fingerbreite — die Koordinate eines gesetzten Punktes
steht ja fest und soll nicht je nach Zoomstufe an eine andere Linie springen.

### Abstecken

Bis Oktober 2026 stand das nächste KML-Objekt von selbst in der Zeile oben, sobald der Standort
lief — ungefragt und immer nur das nächste. Jetzt ist das ein eigener Griff: Hat eine
eingeschaltete Datei Punkte, steht rechts über dem Messen ein **Fähnchen**. Es öffnet über der
unteren Leiste eine eigene Leiste mit der Liste der Punkte — *Nächste zuerst*, nach *Name* (2 vor
10) oder wie in der *Datei*, dazu ein Filter über Namen und Merkmale. Entfernung und Pfeil je Zeile
laufen mit, umsortiert wird beim Laufen aber nicht: Eine Liste, die unter dem Finger die
Reihenfolge wechselt, trifft man nicht. Ein Tipp auf einen Punkt in der Karte bietet in der
Sprechblase dasselbe an.

Nach der Wahl stehen dort die **Entfernung** groß, ein **Pfeil**, der **Versatz nach Nord und
Ost** und die Ortungsgenauigkeit; auf der Karte ein Ring um den Punkt und eine gestrichelte Linie
vom Standort (gestrichelt, weil gepunktet in der OSM-Karte die Fußwege sind). Nachkommastellen
richten sich nach der Ortung: Ein Handy meldet ±3 bis 5 m, da wären Dezimeter Rauschen; hängt ein
RTK-Empfänger am Gerät, kommen ±2 cm und Zentimeter dazu. *am Ziel* erscheint, sobald der Abstand
kleiner ist als die Ortungsgenauigkeit — näher lässt sich nicht herankommen. **Nächster** geht nach
Entfernung zum nächstgelegenen Punkt, der in dieser Sitzung noch nicht Ziel war, sonst zum nächsten
der Liste; **Zurück** zum vorigen Ziel. Die Leiste ist eine eigene, damit ein unterwegs
festgehaltener Kilometer in der unteren das Ziel nicht verdrängt.

**Der Pfeil** richtet sich nach der Karte oder nach dem Handy — ein Tipp auf ihn schaltet um,
darunter steht, wonach er gerade zeigt. *Karte*: dorthin, wo der Punkt auf dem Bildschirm liegt,
samt Kartendrehung, gerechnet über die ungerundete Projektion (`latLngToContainerPoint` rundet auf
ganze Pixel, auf wenige Meter sprang der Pfeil damit in groben Stufen). *Kompass*: die Peilung zum
Punkt abzüglich der Richtung, in die das Handy zeigt — Oberkante vorn, also dorthin gehen, wohin der
Pfeil zeigt. Die Richtung kommt unter Android aus `deviceorientationabsolute`, unter iOS aus
`webkitCompassHeading` nach einer Freigabe, die nur aus einem Tipp heraus erfragt werden darf. Der
Magnetfeldsensor streut typisch 5 bis 15 Grad und an der Strecke mehr — Schienen, Fahrleitung und
Fahrzeuge lenken ihn ab. Für den letzten Meter zählt deshalb der Versatz nach Nord und Ost. Meldet
das Gerät nichts, bleibt der Pfeil bei der Karte, und die App sagt das.

## Das mitgelieferte Gleisnetz

Zwei Fragen brauchten zwingend [Overpass](https://overpass-api.de/): *welche Strecke liegt hier*
und *wie verläuft das Gleis zwischen diesen beiden Steinen*. Das ist der unzuverlässigste Teil der
App. Beim Bau dieser Fassung antwortete Overpass reihenweise mit 429 und 504 und brauchte **bis zu
92 s**, bis alle drei Instanzen aufgegeben hatten, während die ORM-API jedes Mal unter einer
Sekunde lieferte.

Deshalb liegen die Gleise jetzt unter `netz/` bei, erzeugt von `werkzeug/netz-bauen.py` aus
OpenStreetMap. Gemessen am selben Punkt bei Bischofswiesen:

| | über Overpass | aus der Kachel |
| --- | --- | --- |
| Strecke + Startwert bestimmen | 596 ms – 25 s (oft Fehlschlag) | **18 ms** |
| Punkt in der 4,4-km-Lücke, mit Gleisverlauf | 11,5 s | **114 ms** |
| „Punkt auf das Gleis rechnen" (km → Ort) | 15–40 s | **34 ms** |

Am ausgelieferten Stand nachgeprüft, nicht nur lokal: derselbe Punkt über
`steidlmichael2000-stack.github.io` in 231 ms, die 4,4-km-Lücke in 122 ms.

### Warum Linienzüge und keine fertigen Kilometerpunkte

Die naheliegende Idee wäre, alle 10–100 m einen Punkt vorzurechnen und abzulegen. Das ist dieselbe
Auskunft, nur teurer geschrieben: Die Stützpunkte aus OpenStreetMap stehen gemessen im Mittel alle
46–55 m, kosten weniger Platz und häufen sich dort, wo es krümmt, statt gleichmäßig über Geraden
verteilt zu liegen. Ein Raster fester Punkte beantwortet außerdem die erste Frage nicht besser.
Gerechnet mit echten Daten:

| Ablage | Punkte | gzip |
| --- | --- | --- |
| alle 10 m | 3,3 Mio. | rund 12 MB (hochgerechnet) |
| alle 100 m | 330.000 | rund 1,2 MB (hochgerechnet) |
| OSM-Stützpunkte, auf 5 m vereinfacht | **652.527** | **3,54 MB** (gebaut, nicht geschätzt) |

Der gebaute Satz deckt dabei mehr ab als die Hochrechnungen: 90.900 km Gleis über Deutschland und
die Grenzgebiete, nicht nur 33.000 km deutsches Streckennetz.

### Was in den Kacheln steht

Gleise mit `railway=rail`, `light_rail` oder `narrow_gauge` **ohne** `service`-Tag. Das lässt
Anschluss-, Abstell- und Rangiergleise weg und behält die durchgehenden Haupt- und
Bahnhofsgleise — an einem dichten Ausschnitt im Ruhrgebiet gemessen 334 km statt 291 km wie bei
einer reinen `ref`-Auswahl. Die zusätzlichen 238 Wege *ohne* Nummer sind genau die, die den
Graphen an Bahnhöfen zusammenhalten. Dazu kommen alle Bahnknoten mit `railway:position` oder
`railway:position:exact` als Startwert für die Kilometrierung.

**Plus, was trotz `service`-Tag eine Streckennummer trägt.** Das fiel bei der Gegenprobe im
Ruhrgebiet auf: Bei 51,467606 / 7,059896 bot Overpass die Strecke **2505** mit 22 m Abstand an
(„ehem. Rheinische Bahn", `service=spur`), die Kachel kannte nur die 2163 mit 26 m. Eine Nummer
ist eine Nummer, auch auf einem Anschlussgleis — und die ORM-API kennt deren Kilometrierung, die
App könnte also antworten und tat es nur deshalb nicht, weil ihr das Gleis fehlte. Der Erzeuger
holt diese Wege deshalb in einem zweiten, leichten Durchgang nach.

Die beiden Durchgänge liegen getrennt im Zwischenspeicher, mit der Durchgangs-Marke im
Dateinamen. Sonst hätte die Änderung am zweiten stillschweigend die alten Antworten des ersten
weiterbenutzt — beim Nachrüsten genau diese Falle.

Die Geometrie wird mit Douglas-Peucker auf 5 m vereinfacht — **aber nicht über Verzweigungen
hinweg**. Zwei Gleise hängen in OpenStreetMap zusammen, indem sie sich einen Knoten teilen, und
der muss nicht das Ende eines Weges sein. Wirft die Vereinfachung so einen Knoten weg, fällt der
Graph an dieser Weiche auseinander und die Wegsuche findet keinen durchgehenden Verlauf mehr.
Deshalb wird erst gezählt, wo sich Wege berühren, und nur zwischen diesen Punkten vereinfacht.

Was die Vereinfachung kostet, am Testfall der 4,4-km-Lücke der Strecke 5741 nachgerechnet:

| | voller Overpass-Auszug | vereinfachte Kachel |
| --- | --- | --- |
| Gleisweg zwischen km 3,396 und 7,8 | 4412 m | 4419 m |
| abgelesener Kilometer | 5,599 | 5,590 |

9 m Unterschied — gegenüber den gemessenen 21 m typischer und 88 m schlechtester Abweichung des
Verfahrens selbst fällt das nicht ins Gewicht.

### Kacheln, Deckung und Rückfall

Ein Raster von 0,5°, benannt `netz/t_<y>_<x>.json` mit `y = floor(lat/0,5)`. Eine Kachel deckt
rund 55 × 55 km ab. Ausgeliefert werden **340 Kacheln, davon 310 mit Inhalt und 30 nachweislich
leer** — denn „hier liegt kein Gleis" ist eine Auskunft und kein fehlender Datensatz, und
`netz/index.json` führt beides getrennt.

Geholt wird immer nur, worauf man steht. Am Server gemessen:

| Kachel | roh | über die Leitung |
| --- | --- | --- |
| `index.json` | 3,9 kB | 852 B |
| `t_95_25` (Berchtesgaden) | 24,7 kB | 10,0 kB |
| `t_102_13` (Ruhrgebiet, die größte) | 216 kB | 85 kB |

Median über alle Kacheln: 21 kB roh.

Die Kacheln kommen **beim ersten Hinschauen** aufs Gerät und bleiben dort. Wer ohne Empfang in
eine Gegend fährt, deren Kachel er noch nie geladen hat, bekommt deshalb weder aus den Kacheln
noch von Overpass eine Antwort — und die Fehlermeldung sagt das dann auch so, statt es auf
Overpass zu schieben.

**Fehlt auch nur eine berührte Kachel, geht die Anfrage vollständig über Overpass.** Halb aus
Kacheln und halb aus dem Netz zu antworten hieße, stillschweigend Gleise zu verlieren. Overpass
bleibt ebenso der Rückfall, wenn die Kachel keinen durchgehenden Weg hergibt — die weggelassenen
Rangiergleise können an einer Stelle genau die fehlende Verbindung sein.

**Ein leeres Ergebnis ist dagegen eine Antwort und kein Rückfallgrund.** Die Kacheln führen jede
nummerierte Strecke, die Overpass hier fände: Der erste Durchgang holt alle Gleise ohne
`service`-Tag, der zweite alles, was trotz `service`-Tag eine Nummer trägt — zusammen also jeden
Weg mit `ref`. Sagt die Kachel „hier liegt keine nummerierte Strecke", stimmt das. Anfangs wurde
trotzdem noch Overpass gefragt, und ein Tipp ins Feld brauchte darum eine halbe Minute bis zur
Fehlermeldung; jetzt sind es gemessen 10 bis 67 ms.

Der Service Worker legt Kacheln „erst Cache" ab, anders als alle übrigen eigenen Dateien: Sie
ändern sich nur, wenn der Erzeuger neu läuft, und dann wird ohnehin `VERSION` in `sw.js`
hochgezählt.

### Neu erzeugen

```bash
python werkzeug/netz-bauen.py
```

Die rohen Overpass-Antworten landen in `.cache/overpass` und werden beim nächsten Lauf
wiederverwendet — der Abruf darf also abbrechen und später weiterlaufen. `--nur-bauen` schreibt
die Kacheln allein aus dem Zwischenspeicher, ohne eine einzige Netzabfrage.

**Danach `VERSION` in `sw.js` hochzählen.** Der Service Worker legt Kacheln „erst Cache" ab; ohne
neue Versionsnummer behält ein Gerät die alten für immer. Beim Bau dieser Fassung ist genau das
passiert — zwei Kachelstände unter derselben Version `v9` ausgeliefert —, und es fällt nicht auf,
weil auf dem eigenen Rechner der Cache ohnehin leer ist. Ein Anlass ist eine Änderung an
`netz/`, nicht nur eine am Programm.

Ein ganzes Landesnetz ist für eine freie Overpass-Instanz eine Zumutung, wenn man es an einem
Stück holt: `overpass.openstreetmap.fr` hat nach rund 1600 Abfragen mit 403 dichtgemacht. Den
Abruf also über mehrere Tage strecken oder `--warten` hochsetzen — der Zwischenspeicher macht das
Abbrechen billig. Der volle Lauf brauchte hier rund fünfeinhalb Stunden für 2720 Abfragen.

Die Daten stammen aus OpenStreetMap und stehen unter der **ODbL**; das gilt auch für die erzeugten
Kacheln. `netz/index.json` trägt Stand und Herkunft mit.

## Grenzen

**Keine amtliche Quelle.** Zur groben Verortung im Gelände gut geeignet, nicht für Vermessung,
Disposition oder sicherheitsrelevante Entscheidungen.

Das Tippen auf die Karte funktioniert ohne Netzabfrage, solange die Strecke schon geladen ist.
Wird weit abseits getippt, beantwortet das mitgelieferte Netz, welche Strecke dort liegt; nur
außerhalb des erzeugten Gebiets muss [Overpass](https://overpass-api.de/) ran — das dauert einige
Sekunden und ist aus manchen Netzen gesperrt. An Knotenbahnhöfen liegen mehrere Strecken
nebeneinander; dann fragt die App nach, sortiert nach Abstand zum Tippen.

Auf Strecken der DB InfraGO geht beides ohne Netz, sobald die Strecke einmal geladen war. Für
alle anderen kommt die Kilometrierung weiter von der OpenRailwayMap-API — ohne Netz lässt sich zu
einer neuen Strecke dort also kein Kilometer bestimmen, auch wenn ihr Verlauf mitgeliefert ist.

## Selbst betreiben

Es gibt keinen Build-Schritt — die Dateien auf einen beliebigen Webspace legen genügt. Das gilt
auch für `netz/`: Die Kacheln liegen fertig im Verzeichnis und werden nur neu erzeugt, wenn man
`werkzeug/netz-bauen.py` selbst laufen lässt (siehe oben).
Lokal zum Ausprobieren:

```bash
python -m http.server 8000
```

Über `file://` funktionieren Standortbestimmung und Offline-Modus nicht, der Rest schon.

## Lizenz und Attribution

Code: **[GPL-3.0](LICENSE)**.

Das Projekt lag ursprünglich unter MIT. Für die Kartendrehung wird
[leaflet-rotate](https://github.com/Raruto/leaflet-rotate) gebraucht — Leaflet selbst kann nicht
drehen —, und das steht unter GPL-3.0. Weil GPL Copyleft ist, lässt sich ein Werk, das GPL-Code
enthält, nicht unter MIT weitergeben; das ganze Projekt folgt deshalb der GPL-3.0. Praktisch heißt
das: Nutzen, ändern und weitergeben ist frei, wer es weitergibt muss den Quellcode ebenfalls unter
GPL-3.0 offenhalten.

Kilometrierung und Betriebsstellen unter `infrago/`: DB InfraGO, Infrastrukturdaten aus der
[Mobilithek](https://mobilithek.info/),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de) — für die App umgerechnet,
vereinfacht (0,5 m) und je Strecke aufgeteilt.

Karten- und Bahndaten: © OpenStreetMap-Mitwirkende
([ODbL](https://www.openstreetmap.org/copyright)) — das schließt die mitgelieferten Netzkacheln
unter `netz/` ein, die aus OSM abgeleitet sind und damit ebenfalls unter der ODbL stehen.
Bahn-Layer von
[OpenRailwayMap](https://www.openrailwaymap.org/) (CC-BY-SA 2.0), Luftbilder von den
Vermessungsverwaltungen der Länder (siehe Quellenangabe in der App),
dunkle Karte, Straßen und Ortsnamen von [OpenFreeMap](https://openfreemap.org/) (© OpenMapTiles,
Daten © OpenStreetMap). Regenradar: Quelle [Deutscher Wetterdienst](https://www.dwd.de/).
DOP20, Geländerelief, Parzellarkarte und die Höhen in Profil und Höhenangabe (DGM1, DOM20): Bayerische
Vermessungsverwaltung – [www.geodaten.bayern.de](https://www.geodaten.bayern.de/) (CC BY 4.0); das
Profil ist daraus berechnet. DOP20, DGM1, DOM1, LoD2 und Landesgrenze in Baden-Württemberg: LGL-BW (2026), Datenlizenz Deutschland –
Namensnennung – Version 2.0, [www.lgl-bw.de](https://www.lgl-bw.de/), bearbeitet.
Unter `vendor/` liegen [Leaflet](https://leafletjs.com/) (BSD-2-Clause),
[leaflet-rotate](https://github.com/Raruto/leaflet-rotate) (GPL-3.0) und
[MapLibre GL JS](https://maplibre.org/) 6.10.0 (BSD-3-Clause, `vendor/maplibre/`) bei, damit die
App ohne CDN und offline läuft. MapLibre zeichnet die dunkle Karte sowie Straßen und Ortsnamen
über den Bildern und wird erst geladen, wenn eines davon gewählt ist. Für die Laserpunkte:
[three.js](https://threejs.org/) r160 (MIT, `vendor/three/`) und
[copc.js](https://github.com/connormanning/copc.js) (MIT) mit
[laz-perf](https://github.com/hobuinc/laz-perf) (Apache-2.0, `vendor/copc/`), aus dem PW-Viewer
übernommen; beide werden erst geladen, wenn jemand Laserpunkte öffnet. Laserpunkte: Bayerische
Vermessungsverwaltung (CC BY 4.0).
