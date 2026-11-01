/* Topovo — Tour durch die App
 *
 * Das „?" im ©-Kasten unten links startet sie; beim allerersten Start bietet die
 * App sie einmal an (prefs.tourAngeboten). Die Ebene #tour dunkelt alles ab bis
 * auf ein „Loch" über dem gerade erklärten Element, daneben steht eine Blase mit
 * Text, Weiter und Zurück. Am Rechner gehen auch die Pfeiltasten; Escape beendet.
 *
 * Dieselbe Ebene erklärt auch einzelne Werkzeuge: Das ? oben rechts in den Leisten
 * von Profil, Profilmappe, Polygon, Live und Abstecken (hilfeKnopf in app.js)
 * startet eine kurze Tour aus HILFE, die nur diese Leiste Knopf für Knopf
 * durchgeht. Sie räumt vorher nichts weg und führt nichts vor — sie erklärt, was
 * gerade dasteht; Schritte, deren Element fehlt, fallen heraus.
 *
 * Die Tour führt live vor, was sie erklärt: Sie tippt eine Strecke ein und sucht,
 * setzt einen Punkt, öffnet Messmenü und Einstellungen und zeichnet ein Profil.
 * Dafür ruft sie dieselben Funktionen auf wie die Knöpfe — search, merkPunkt,
 * messMenueAuf, profStart, openSheet und so weiter, alle aus app.js. Wer dort
 * etwas umbenennt, zieht es hier nach. Klappt eine Vorführung nicht (ohne Netz,
 * außerhalb Bayerns), sagt die Blase das, statt zu hängen.
 *
 * Während der Tour nimmt die Ebene alle Griffe ab: Die Karte bewegt sich nur
 * durch die Vorführung, und ein versehentlicher Tipp bringt nichts durcheinander.
 */

const TOUR_TIPPEN_MS = 85;          // je Zeichen beim Vorführen der Eingabe
const TOUR_GEDULD_MS = 12000;       // so lange wartet eine Vorführung höchstens aufs Netz
const TOUR_BEISPIEL = '5100 12,5';  // Strecke Bamberg–Hof bei Breitengüßbach: in Bayern, mit Steinen

let tourIndex = -1;
let tourLauf = 0;                   // jeder Schritt bekommt eine Nummer; überholte Vorführungen brechen ab
let tourSchritte = [];              // die laufende Tour: TOUR_SCHRITTE oder eine aus HILFE
let tourHilfe = null;               // bei einer Werkzeug-Tour ihr Name — dorthin geht danach der Fokus

const tourWarte = ms => new Promise(r => setTimeout(r, ms));

/** Wartet, bis bedingung() wahr ist — oder die Geduld aus ist. */
async function tourBis(bedingung, ms = TOUR_GEDULD_MS) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (bedingung()) return true;
    await tourWarte(100);
  }
  return bedingung();
}

/** Das Element, wenn es zu sehen ist; sonst null — dann gibt es kein Loch. */
function tourSichtbar(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  return el && !el.hidden && el.getClientRects().length ? el : null;
}

/* Tippt den Text Zeichen für Zeichen in die Suchzeile — ohne sie zu fokussieren:
 * Auf dem Handy klappte sonst mitten in der Tour die Tastatur auf. Das
 * input-Ereignis lässt die Felder Strecke und Kilometer mitlaufen wie beim
 * Tippen von Hand. */
async function tourTippen(text, lauf) {
  const q = $('#q');
  suchAuf();
  q.value = '';
  for (const zeichen of text) {
    if (lauf !== tourLauf) return;
    q.value += zeichen;
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await tourWarte(TOUR_TIPPEN_MS);
  }
  closeSuggest();
}

function tourAbschnitt(name) {
  openSheet();
  document.querySelectorAll('#sheet [data-sec]').forEach(s => { s.open = s.dataset.sec === name; });
  $('#sheet').scrollTop = 0;
}

/* Die Schritte. ziel() liefert das Element fürs Loch, vorher() führt vor und
 * darf einen Text zurückgeben, der den regulären ersetzt (wenn es nicht
 * geklappt hat), nachher() räumt auf, bevor der nächste Schritt beginnt. */
const TOUR_SCHRITTE = [
  {
    titel: 'Eine Zeile für alles',
    text: `Ort, Bahnhof, Strecke mit Kilometer oder eine Koordinate — alles kommt hier hinein. ` +
      `Zum Ausprobieren tippe ich „${TOUR_BEISPIEL}" ein: Strecke 5100, Kilometer 12,5.`,
    ziel: () => $('.bar-top'),
    vorher: lauf => tourTippen(TOUR_BEISPIEL, lauf)
  },
  {
    titel: 'Das Ergebnis',
    text: 'Unten steht, wo der Kilometer liegt — mit der Genauigkeit und der Geländehöhe. Daneben ' +
      'Google Maps, das i für Koordinate und Herkunft der Rechnung und Teilen. Der orange Knopf zeichnet ' +
      'das Profil am Gleis. Die Kilometer der Strecke stehen beschriftet auf der Karte.',
    ziel: () => tourSichtbar('#bottom'),
    vorher: async lauf => {
      if ($('#q').value.trim() !== TOUR_BEISPIEL) await tourTippen(TOUR_BEISPIEL, lauf);
      if (lauf !== tourLauf) return;
      try { await Promise.race([search(), tourWarte(TOUR_GEDULD_MS)]); } catch { /* unten bewertet */ }
      if (view.point && view.ref === '5100') return;
      return 'Gerade antwortet der Dienst für die Kilometersteine nicht — eine neue Strecke braucht ' +
        'Netz. Mit Netz steht hier unten, wo der Kilometer liegt, wie genau, und der Weg zu Google Maps.';
    }
  },
  {
    titel: 'Lange drücken setzt einen Punkt',
    text: 'Lange auf die Karte drücken (am Rechner: Rechtsklick) setzt einen Punkt — mit Koordinate, ' +
      'Google Maps und „Kilometer bestimmen". Ein kurzer Tipp tut absichtlich nichts: Im Gelände tippt ' +
      'man oft aus Versehen.',
    ziel: () => tourSichtbar('.leaflet-popup'),
    vorher: async () => {
      const c = map.getCenter();
      merkPunkt(c.lat, c.lng);
      await tourWarte(350);          // die Karte schiebt die Blase notfalls ins Bild
    },
    nachher: () => map.closePopup()  // schließt die Blase und nimmt den Punkt mit
  },
  {
    titel: 'Wo stehe ich?',
    text: 'Der Standortknopf verfolgt die eigene Position. Ein Tipp auf den blauen Punkt lässt den ' +
      'Kilometer beim Gehen mitlaufen — ohne Netz, aus dem mitgelieferten Gleisnetz.',
    ziel: () => $('#mapLocBtn')
  },
  {
    titel: 'Messen und Profil',
    text: 'Der Messknopf öffnet vier Werkzeuge. Profil: der Geländeschnitt zwischen zwei getippten ' +
      'Punkten. Profilmappe: Querprofile an einer Liste von Kilometern, als ein PDF. Polygon: Strecken ' +
      'und — geschlossen — Flächen. Live: die Entfernung vom Startpunkt zum Fadenkreuz. Ein zweiter ' +
      'Tipp auf den Messknopf beendet, was gerade läuft.',
    ziel: () => tourSichtbar('#messMenue'),
    vorher: () => messMenueAuf(true),
    nachher: () => messMenueAuf(false)
  },
  {
    titel: 'Das Geländeprofil',
    text: 'Der Querschnitt am Gleis aus dem amtlichen Geländemodell DGM1. Ein Finger auf dem Bild zeigt ' +
      'Höhe und Stelle auf der Karte. Darunter: Gebäude und Oberfläche dazuladen, Breite und Überhöhung ' +
      'einstellen, meterweise die Strecke entlangspringen. „Längs" zeigt das Gelände am Gleis entlang, ' +
      'das Teilen-Zeichen macht ein PDF. In Bayern und Baden-Württemberg.',
    ziel: () => tourSichtbar('#bottom'),
    vorher: async lauf => {
      /* Am Gleis, wenn das Ergebnis aus Schritt 2 noch dasteht — sonst frei,
       * 300 m quer zur Blickrichtung durch die Kartenmitte */
      if (view.point && view.ref && view.km != null) {
        gpStart('quer');           // die Tour zeigt den Querschnitt, ohne die gemerkte Wahl zu ändern
      } else {
        const c = map.getCenter(), d = 150 / (111320 * Math.cos(c.lat * Math.PI / 180));
        profStart();
        profPunkte = [[c.lat, c.lng - d], [c.lat, c.lng + d]];
        profGeaendert();
      }
      await tourBis(() => lauf !== tourLauf || (!profLaedt && (profDgm || profFehler)));
      if (lauf === tourLauf && !profDgm) {
        return 'Hier kam kein Profil zustande — es braucht Netz und geht nur in Bayern und Baden-Württemberg. Sonst steht unten ' +
          'der Geländeschnitt am Gleis oder zwischen getippten Punkten, auf Wunsch mit Gebäuden und Bewuchs.';
      }
    },
    // Der nächste Schritt zeigt auf das ? in dieser Leiste — dafür bleibt das Profil offen
    nachher: neu => { if (!(neu && neu.mitProfil) && profModus) profEnde(); }
  },
  {
    titel: 'Genauer erklärt',
    text: 'Dieses ? steht oben in jeder Werkzeugleiste — bei Profil, Profilmappe, Polygon, Live und ' +
      'Abstecken. Es geht die Leiste Knopf für Knopf durch, genau so wie diese Tour.',
    ziel: () => tourSichtbar('#bottom [data-hilfe]'),
    mitProfil: true,
    nachher: () => { if (profModus) profEnde(); }
  },
  {
    titel: 'Karten und Auflagen',
    text: 'Hinter dem Regler-Symbol: Karte, dunkle Karte, Luftbild, das amtliche Orthophoto DOP20 und ' +
      'das Geländerelief. Darüber lassen sich Bahn-Layer, Parzellen, Straßen und Ortsnamen legen — ' +
      'lange drücken auf „Parzellen" wählt ihre Farbe. Unter „Erklärung" steht zu jedem mehr.',
    ziel: () => tourSichtbar('#sheet'),
    vorher: () => tourAbschnitt('karte'),
    nachher: () => closeSheet()
  },
  {
    titel: 'Wetter',
    text: 'Luftdruck, Temperatur und Feuchte für die atmosphärische Korrektur am Tachymeter — am eigenen ' +
      'Standort, sonst in der Kartenmitte. Der Druck ist der absolute auf Geländehöhe, nicht der auf ' +
      'Meereshöhe. Darunter das Regenradar des DWD: eine Stunde zurück, zwei voraus.',
    ziel: () => tourSichtbar('#sheet [data-sec="wetter"]'),
    vorher: () => tourAbschnitt('wetter'),
    nachher: () => closeSheet()
  },
  {
    titel: 'Eigene Dateien und Abstecken',
    text: 'KML- und KMZ-Dateien bleiben auf dem Gerät, auch ohne Netz. Haben sie Punkte, erscheint ' +
      'rechts ein Fähnchen: Punkt wählen, dann zeigen Pfeil und Entfernung den Weg dorthin — auf ' +
      'Wunsch nach dem Kompass des Handys.',
    ziel: () => tourSichtbar('#sheet [data-sec="kml"]'),
    vorher: () => tourAbschnitt('kml'),
    nachher: () => closeSheet()
  },
  {
    titel: 'Quellen und diese Tour',
    text: 'Hinter dem © stehen Quellen und Lizenzen. Das ? daneben startet diese Tour jederzeit ' +
      'wieder. Viel Erfolg im Gelände!',
    ziel: () => $('.quellen-kasten')
  }
];

/* ---- Werkzeug-Touren (das ? in den Leisten) ----
 * Je Werkzeug eine Funktion, die beim Start die Schritte baut — so passen Texte
 * wie Sprungweiten und Quer/Längs zu dem, was gerade offen ist. Was nicht
 * dasteht (Profil noch nicht geladen, keine Fangpunkte), filtert hilfeStart weg. */

/** Name, Regler und Wert einer Reglerzeile — sie gehören zusammen ins Loch. */
function tourRegler(id) {
  const r = document.getElementById(id);
  const teile = r ? [document.querySelector(`label[for="${id}"]`), r.closest('.prof-weite'),
    document.querySelector(`output[for="${id}"]`)].map(tourSichtbar).filter(Boolean) : [];
  return teile.length ? teile : null;
}

/** „1, 5 oder 10" */
const tourAufzaehlen = zahlen => zahlen.map(z => nfM.format(z)).join(', ').replace(/, (?=[^,]*$)/, ' oder ');

const HILFE = {
  profil: () => {
    const g = profGleis, quer = g && g.art === 'quer';
    const spruenge = tourAufzaehlen(PROF_SPRUENGE[g ? g.art : 'frei']);
    let pdfAufgemacht = false;
    return [
      !g && {
        titel: 'A und B',
        text: 'Der erste Tipp auf die Karte setzt A, der zweite B. Liegt ein Kilometerstein oder KML-Punkt ' +
          'in der Nähe, springt der Punkt darauf. Stehen beide, werden sie gezogen statt neu getippt — ein ' +
          'versehentlicher Tipp verdirbt so den Schnitt nicht. Zurück nimmt B weg, Leeren beide.',
        ziel: () => tourSichtbar('#profUnten .bb-actions')
      },
      g && {
        titel: 'Quer oder längs',
        text: 'Quer schneidet senkrecht durchs Gleis am Kilometer im Schild daneben; links und rechts gelten ' +
          'in Richtung steigender Kilometer. Längs zeigt das Gelände am Gleis entlang, mit der mittleren ' +
          'Neigung in Promille.',
        ziel: () => tourSichtbar('#bottom .prof-art')
      },
      {
        titel: 'Gelände laden',
        text: 'Vor dem ersten Laden nennt der Knopf, wie viele Kacheln des DGM1 es braucht und wie viel das ' +
          'ist. Geladene Kacheln bleiben auf dem Gerät — dort geht das Profil danach auch ohne Netz.',
        ziel: () => tourSichtbar('#profFreigeben')
      },
      {
        titel: 'Das Bild',
        text: (g ? 'Links und rechts vom Gleis, ' : 'A steht links, B rechts, ') + 'im 1-m-Gitter des DGM1. ' +
          'Ein Finger auf dem Bild — am Rechner die Maus — nennt Höhe und Abstand an dieser Stelle und ' +
          'markiert sie auf der Karte. Mit Gebäuden nennt ein Finger auf einem Block Art, Höhe und, wo ' +
          'vorhanden, die Adresse.',
        ziel: () => tourSichtbar('#profBild')
      },
      {
        titel: 'Gebäude und Oberfläche',
        text: 'Gebäude legt das 3D-Gebäudemodell LoD2 als graue Blöcke mit Dachform in den Schnitt' +
          (quer ? ', dazu den Abstand von der Gleisachse zur nächsten Wand' : '') + '. Oberfläche legt das ' +
          'DOM20 gestrichelt darüber — Häuser und Bewuchs. Die Angabe im Knopf ist die Datenmenge, die ' +
          'einmal geladen wird. Ein zweiter Tipp blendet wieder aus.',
        ziel: () => tourSichtbar('#bottom .prof-ebenen')
      },
      g && {
        titel: quer ? 'Breite' : 'Länge',
        text: quer
          ? `Wie weit der Schnitt zu jeder Seite des Gleises reicht, ${tourAufzaehlen(GP_BREITEN)} m. ` +
            'Geladen wird beim Loslassen; die Wahl bleibt für das nächste Querprofil.'
          : `Wie weit das Längsprofil in jede Richtung am Gleis entlang reicht, ${tourAufzaehlen(GP_LAENGEN)} m. ` +
            'Geladen wird beim Loslassen.',
        ziel: () => tourRegler('profWeite')
      },
      {
        titel: 'Überhöhung',
        text: 'Ganz links ist das Bild unüberhöht, also maßstäblich. Nach rechts werden die Höhen gestreckt, ' +
          'bis das Bild die Leiste füllt — dann steht „max" dahinter. Die Skala ist logarithmisch: von 1× auf ' +
          '2× ist derselbe Weg wie von 5× auf 10×. ' +
          (g && !quer ? 'Längs gilt eine eigene Wahl, vorgegeben 10×.' : 'Längs am Gleis gilt eine eigene Wahl.'),
        ziel: () => tourRegler('profUeber')
      },
      {
        titel: 'Schnitt verschieben',
        text: g
          ? `Springt ${spruenge} m die Kilometrierung entlang — Minus zurück, Plus vor — und rechnet den ` +
            'Schnitt dort neu. Am Rechner gehen auch ← und →, mit Umschalt der große Schritt.'
          : `Schiebt den Schnitt ${spruenge} m parallel zur Seite, Plus nach links von A→B. Der Versatz ` +
            'steht dann oben im Kopf; ein Tipp darauf holt die getippte Linie zurück. Am Rechner gehen ' +
            'auch ← und →.',
        ziel: () => tourSichtbar('#profSprung')
      },
      {
        titel: 'Als PDF',
        text: 'Das Teilen-Zeichen fragt, was ins PDF soll. „Dieser Schnitt" ist eine Seite A4 quer: Profil, ' +
          'Luftbild mit Schnittlinie, Kennwerte und Quellen.' +
          (quer ? ' „Serie" macht ±50 m alle 10 m eine Seite, alle im selben Höhenfenster. ' +
            '„+ In die Profilmappe" merkt Strecke und Kilometer für eine Mappe vor.' : '') +
          ' Auf dem Handy öffnet sich danach das Teilen-Menü, am Rechner wird gespeichert.',
        ziel: () => tourSichtbar('#bottom .prof-pdf') || tourSichtbar('#profPdfBtn'),
        // Die Auswahl aufklappen, damit man sieht, wovon die Rede ist — und danach wieder zu
        vorher: () => {
          if (profPdf || !profDgm) return;
          profPdf = { wahl: true };
          pdfAufgemacht = true;
          profLeiste();
        },
        nachher: () => {
          if (!pdfAufgemacht) return;
          pdfAufgemacht = false;
          if (profModus && profPdf && profPdf.wahl) { profPdf = null; profLeiste(); }
        }
      }
    ].filter(Boolean);
  },

  mappe: () => [
    {
      titel: 'Die Liste',
      text: 'Je Zeile eine Strecke, dahinter ein oder mehrere Kilometer — wie in der Suchzeile, etwa ' +
        '„5321 106,0 & 106,2". Jeder Kilometer wird eine Seite. Die Liste bleibt auf dem Gerät gespeichert; ' +
        'was sich nicht lesen lässt, steht darunter mit Zeilennummer.',
      ziel: () => tourSichtbar('#mappeText')
    },
    {
      titel: 'Für alle Seiten gleich',
      text: 'Gebäude, Oberfläche, Breite und Überhöhung gelten für jeden Schnitt der Mappe — so lassen sich ' +
        'die Seiten nebeneinanderlegen.',
      ziel: () => tourSichtbar('#bottom .prof-regler')
    },
    {
      titel: 'Kilometer dazulegen',
      text: '„+ Aktuelles Ergebnis" hängt Strecke und Kilometer der letzten Suche an — an die letzte Zeile, ' +
        'wenn es dieselbe Strecke ist. Aus dem Querprofil am Gleis geht das über das Teilen-Zeichen und ' +
        '„+ In die Profilmappe".',
      ziel: () => tourSichtbar('#mappeAktuell')
    },
    {
      titel: 'PDF erstellen',
      text: 'Rechnet die Schnitte nacheinander, eine Seite je Kilometer; das braucht Netz für Kacheln, die ' +
        'noch nicht auf dem Gerät liegen. Was nicht zustande kommt, etwa außerhalb von Bayern und BW, steht danach ' +
        'unter „Ohne Seite". Zum Schluss Teilen oder Speichern.',
      ziel: () => tourSichtbar('#mappeLos')
    }
  ],

  polygon: () => [
    {
      titel: 'Punkte setzen',
      text: 'Jeder Tipp auf die Karte setzt einen Punkt; liegt ein Kilometerstein oder KML-Punkt nahe, ' +
        'springt er darauf. An jedem Abschnitt steht seine Länge, hier oben die Summe — gerechnet auf dem ' +
        'Ellipsoid. Liegen zwei Punkte auf Steinen derselben Strecke, steht auch die Länge nach ' +
        'Kilometrierung da.',
      ziel: () => tourSichtbar('#bottom .mess-zahl')
    },
    {
      titel: 'Fangen',
      text: 'Der letzte Punkt ist auf einen Stein oder KML-Punkt gesprungen. Diese Knöpfe wechseln ' +
        'zwischen dem Fangpunkt und der Stelle, die getippt wurde.',
      ziel: () => tourSichtbar('#bottom .pick')
    },
    {
      titel: 'Fläche schließen',
      text: 'Ab drei Punkten trägt der erste einen gestrichelten Ring. Ein Tipp darauf schließt die Fläche — ' +
        'dann stehen Fläche und Umfang da. „Zurück" öffnet sie wieder.',
      ziel: () => tourSichtbar('#bottom .mess-zahl')
    },
    {
      titel: 'Punkte verschieben',
      text: 'Jeder Punkt lässt sich mit dem Finger oder der Maus ziehen; Linie und Fläche laufen mit. ' +
        'Beim Loslassen wird wieder gefangen und neu gerechnet. „Zurück" nimmt den letzten Punkt, ' +
        '„Leeren" alle.',
      ziel: () => tourSichtbar('#bottom .bb-actions')
    }
  ],

  live: () => [
    {
      titel: 'Vom Start zum Fadenkreuz',
      text: 'Ein Tipp setzt den Startpunkt, ein neuer Tipp setzt ihn neu. Dann die Karte schieben: Die ' +
        'Luftlinie vom Start zum Fadenkreuz in der Bildmitte läuft hier und am Kreuz mit. Steine und ' +
        'KML-Punkte werden gefangen wie beim Polygon.',
      ziel: () => tourSichtbar('#bottom .mess-zahl')
    },
    {
      titel: 'Fangen',
      text: 'Der Start ist auf einen Stein oder KML-Punkt gesprungen. Diese Knöpfe wechseln zwischen dem ' +
        'Fangpunkt und der Stelle, die getippt wurde.',
      ziel: () => tourSichtbar('#bottom .pick')
    },
    {
      titel: 'Mitte und Standort',
      text: '„Mitte" legt den Start aufs Fadenkreuz, „Standort" auf die eigene Position. Läuft die ' +
        'Standortverfolgung, steht oben zusätzlich die Entfernung vom Start zum eigenen Standort.',
      ziel: () => tourSichtbar('#bottom .bb-actions')
    }
  ],

  abstecken: () => [
    {
      titel: 'Punkt suchen',
      text: 'Der Filter sucht in Namen und Merkmalen der Punkte aus allen eingeschalteten KML-Dateien.',
      ziel: () => tourSichtbar('#abFilter')
    },
    {
      titel: 'Reihenfolge',
      text: '„Nächste zuerst" sortiert nach Entfernung vom eigenen Standort, „Name" nach dem Alphabet, ' +
        '„Datei" wie in der Datei.',
      ziel: () => tourSichtbar('#ziel .ab-sort')
    },
    {
      titel: 'Ziel wählen',
      text: 'Jede Zeile zeigt Entfernung und Richtung vom Standort. Beim Gehen ändern sich die Werte, die ' +
        'Reihenfolge aber nicht — sonst träfe man die Zeile nicht. Ein Tipp macht den Punkt zum Ziel.',
      ziel: () => tourSichtbar('#abListe')
    },
    {
      titel: 'Der Pfeil',
      text: 'Er zeigt zum Ziel. Darunter steht, wonach er sich richtet: nach der Karte, oder — nach einem ' +
        'Tipp auf den Pfeil — nach dem Kompass des Handys. Dann das Handy flach vor sich halten und dem ' +
        'Pfeil folgen.',
      ziel: () => tourSichtbar('#ziel .ab-richtung')
    },
    {
      titel: 'Entfernung und Versatz',
      text: 'Groß die Entfernung vom eigenen Standort, darunter Name, Datei und Geländehöhe des Punkts. Die ' +
        'Zeile darunter zerlegt den Weg nach Nord und Ost.',
      ziel: () => tourSichtbar('#ziel .ab-kopf-txt')
    },
    {
      titel: 'Weiter zum nächsten',
      text: '„Liste" wählt einen anderen Punkt, „Zurück" holt das vorige Ziel. „Nächster" geht zum ' +
        'nächstgelegenen Punkt, der noch nicht Ziel war. Die Stecknadel öffnet Google Maps.',
      ziel: () => tourSichtbar('#ziel .bb-actions')
    }
  ]
};

/* ---- Ablauf ---- */

function tourOeffnen(schritte, hilfe) {
  tourAngebotZu();
  tourSchritte = schritte;
  tourHilfe = hilfe;
  $('#tour').hidden = false;
  document.addEventListener('keydown', tourTaste);
  window.addEventListener('resize', tourLage);
  // Fenster gleiten beim Aufklappen herein (style.css, „Aufklappen“): danach neu messen
  document.addEventListener('animationend', tourLage);
  tourZeigen(0);
}

function tourStart() {
  // Von einem ruhigen Ausgangspunkt aus: laufende Abläufe und Menüs zu
  if (messModus) messEnde();
  if (profModus) profEnde();
  if (mappeOffen) mappeEnde();
  messMenueAuf(false);
  closeSheet();
  map.closePopup();
  tourOeffnen(TOUR_SCHRITTE, null);
}

/** Das ? einer Werkzeugleiste: nur die Schritte, deren Element gerade dasteht. */
function hilfeStart(art) {
  const bau = HILFE[art];
  if (!bau || tourIndex >= 0) return;
  const schritte = bau().filter(s => s.ziel());
  if (schritte.length) tourOeffnen(schritte, art);
}

function tourEnde() {
  const s = tourSchritte[tourIndex];
  tourIndex = -1;
  tourLauf++;
  if (s && s.nachher) s.nachher();
  closeSuggest();
  $('#tour').hidden = true;
  document.removeEventListener('keydown', tourTaste);
  window.removeEventListener('resize', tourLage);
  document.removeEventListener('animationend', tourLage);
  // Zurück auf das ?, das die Tour gestartet hat — die Leiste ist inzwischen womöglich neu gebaut
  const zurueck = tourHilfe && document.querySelector(`[data-hilfe="${tourHilfe}"]`);
  (zurueck || $('#tourBtn')).focus();
}

async function tourZeigen(i) {
  if (i < 0) return;
  if (i >= tourSchritte.length) { tourEnde(); return; }
  const alt = tourSchritte[tourIndex];
  const s = tourSchritte[i];
  if (alt && alt.nachher) alt.nachher(s);
  tourIndex = i;
  const lauf = ++tourLauf;

  $('#tourZahl').textContent = `${i + 1} / ${tourSchritte.length}`;
  $('#tourTitel').textContent = s.titel;
  $('#tourText').textContent = s.text;
  $('#tourZurueck').disabled = i === 0;
  $('#tourWeiter').textContent = i === tourSchritte.length - 1 ? 'Fertig' : 'Weiter';
  $('#tourPunkte').innerHTML = tourSchritte.map((_, j) => `<i${j === i ? ' class="is-on"' : ''}></i>`).join('');
  $('#tourWeiter').focus();
  $('#tour').classList.toggle('laeuft', !!s.vorher);
  tourLage();

  if (!s.vorher) return;
  /* Während der Vorführung erscheinen Ziele erst oder wachsen noch (die
   * Profil-Leiste, sobald das Diagramm steht): Loch und Blase laufen mit. */
  const nachfuehren = setInterval(tourLage, 250);
  let ersatz;
  try { ersatz = await s.vorher(lauf); } catch { /* dann bleibt der reguläre Text */ }
  clearInterval(nachfuehren);
  if (lauf !== tourLauf) return;
  $('#tour').classList.remove('laeuft');
  if (ersatz) $('#tourText').textContent = ersatz;
  tourLage();
}

function tourTaste(ev) {
  if (ev.key === 'Escape') { ev.preventDefault(); tourEnde(); }
  else if (ev.key === 'ArrowRight') { ev.preventDefault(); tourZeigen(tourIndex + 1); }
  else if (ev.key === 'ArrowLeft') { ev.preventDefault(); tourZeigen(tourIndex - 1); }
}

/* Loch und Blase an das Ziel legen. Die Blase steht unter dem Ziel, wenn dort
 * Platz ist, sonst darüber, sonst daneben (am großen Bildschirm neben dem
 * offenen Menü); passt sie nirgends (das Menü füllt auf dem Handy fast den
 * Schirm), steht sie unten am Rand. */
function tourLage() {
  if (tourIndex < 0) return;
  const s = tourSchritte[tourIndex];
  // Ein Element oder mehrere (eine Reglerzeile): dann das Loch um alle zusammen
  const ziele = [].concat((s.ziel && s.ziel()) || []);
  const ziel = ziele[0];
  const loch = $('#tour .tour-loch'), blase = $('#tour .tour-blase');
  const W = window.innerWidth, H = window.innerHeight, rand = 10, abstand = 10, pad = 6;
  const bw = blase.offsetWidth, bh = blase.offsetHeight;

  let r = null;
  for (const el of ziele) {
    const e = el.getBoundingClientRect();
    r = r ? { left: Math.min(r.left, e.left), top: Math.min(r.top, e.top),
      right: Math.max(r.right, e.right), bottom: Math.max(r.bottom, e.bottom) } : e;
  }
  if (r) r = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.right - r.left, height: r.bottom - r.top };
  if (r && (r.width < 1 || r.height < 1)) r = null;

  if (!r) {
    /* Erscheint das Ziel erst durch die Vorführung (die Sprechblase eines
     * gesetzten Punkts), bleibt das Loch solange, wo es war — statt erst auf die
     * Bildmitte zu schrumpfen und gleich wieder aufzugehen. */
    if ($('#tour').classList.contains('laeuft') && loch.style.width) return;
    loch.classList.add('leer');
    Object.assign(loch.style, { left: W / 2 + 'px', top: H / 2 + 'px', width: '0px', height: '0px' });
    blase.style.left = Math.round((W - bw) / 2) + 'px';
    blase.style.top = Math.round((H - bh) / 2) + 'px';
    return;
  }

  loch.classList.remove('leer');
  const kreis = getComputedStyle(ziel).borderRadius.includes('50%');
  loch.classList.toggle('kreis', kreis);
  Object.assign(loch.style, {
    left: r.left - pad + 'px', top: r.top - pad + 'px',
    width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px'
  });

  let top, links = r.left + r.width / 2 - bw / 2;
  const seitlich = r.top - pad;                        // neben dem Ziel: oben bündig
  if (H - (r.bottom + pad) >= bh + abstand + rand) top = r.bottom + pad + abstand;
  else if (r.top - pad >= bh + abstand + rand) top = r.top - pad - abstand - bh;
  else if (W - (r.right + pad) >= bw + abstand + rand) { top = seitlich; links = r.right + pad + abstand; }
  else if (r.left - pad >= bw + abstand + rand) { top = seitlich; links = r.left - pad - abstand - bw; }
  else top = H - bh - rand;
  links = Math.min(Math.max(links, rand), W - bw - rand);
  blase.style.left = Math.round(links) + 'px';
  blase.style.top = Math.round(Math.min(Math.max(rand, top), H - bh - rand)) + 'px';
}

/* ---- Angebot beim ersten Start ----
 * Einmal, über dem ©-Kasten. Gilt als gemacht, sobald es gezeigt wurde — wer
 * Nein sagt, wird nicht wieder gefragt; das ? bleibt. Wer die App über einen
 * geteilten Link öffnet, will zuerst sein Ergebnis sehen: dann kein Angebot. */

function tourAngebotLage() {
  for (const el of [$('#tourAngebot'), $('#datenHinweis')]) angebotSetzen(el);
}

function angebotSetzen(el) {
  if (el.hidden) return;
  const k = $('.quellen-kasten').getBoundingClientRect();
  el.style.left = Math.round(Math.min(k.left, window.innerWidth - el.offsetWidth - 10)) + 'px';
  el.style.bottom = Math.round(window.innerHeight - k.top + 8) + 'px';
}

function tourAngebotZu() {
  $('#tourAngebot').hidden = true;
  if ($('#datenHinweis').hidden) window.removeEventListener('resize', tourAngebotLage);
}

/* Wie die App mit Daten umgeht — einmal für alle, auch wer die Tour schon kennt
 * oder über einen Link kommt. Steht das Tour-Angebot gerade da, trägt es den
 * Satz schon mit (.tour-angebot-daten), dann kein zweites Kästchen. */
function datenHinweis() {
  if (prefs.datenHinweis) return;
  prefs.datenHinweis = true;
  saveStore();
  if (!$('#tourAngebot').hidden) return;
  $('#datenHinweis').hidden = false;
  angebotSetzen($('#datenHinweis'));
  window.addEventListener('resize', tourAngebotLage);
  map.getContainer().addEventListener('pointerdown', datenHinweisZu, { once: true, passive: true });
}

function datenHinweisZu() {
  $('#datenHinweis').hidden = true;
  if ($('#tourAngebot').hidden) window.removeEventListener('resize', tourAngebotLage);
}

function tourAngebot() {
  if (prefs.tourAngeboten || location.hash.length > 1) return;
  prefs.tourAngeboten = true;
  saveStore();
  $('#tourAngebot').hidden = false;
  tourAngebotLage();
  window.addEventListener('resize', tourAngebotLage);
  // Ein Griff auf die Karte heißt: jetzt nicht
  map.getContainer().addEventListener('pointerdown', tourAngebotZu, { once: true, passive: true });
}

function tourEinrichten() {
  $('#tourBtn').addEventListener('click', tourStart);
  $('#tourZu').addEventListener('click', tourEnde);
  $('#tourWeiter').addEventListener('click', () => tourZeigen(tourIndex + 1));
  $('#tourZurueck').addEventListener('click', () => tourZeigen(tourIndex - 1));
  $('#tourAngebotJa').addEventListener('click', tourStart);
  $('#tourAngebotNein').addEventListener('click', tourAngebotZu);
  $('#datenHinweisOk').addEventListener('click', datenHinweisZu);
  // Die ? der Werkzeugleisten: Die Leisten werden ständig neu gebaut, also ein Zuhörer am Dokument
  document.addEventListener('click', ev => {
    const k = ev.target.closest && ev.target.closest('[data-hilfe]');
    if (k) hilfeStart(k.dataset.hilfe);
  });
  // Erst wenn die Karte steht, sonst springt das Angebot beim Aufbau umher
  setTimeout(() => { tourAngebot(); datenHinweis(); }, 1500);
}

// Nach boot() aus app.js: der Zuhörer dort ist zuerst eingetragen
document.addEventListener('DOMContentLoaded', tourEinrichten);
