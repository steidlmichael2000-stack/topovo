/* Topovo — Service Worker
 *
 * Ziel: Die App startet auch ohne Netz, und bereits angesehene Kartenkacheln
 * bleiben sichtbar. Für alles Eigene gilt "erst Netz, dann Cache", damit eine
 * neue Version sofort ankommt statt hinter einem alten Cache zu hängen.
 */

const VERSION = 'v139';
const SHELL = `topovo-shell-${VERSION}`;
const TILES = `topovo-tiles-${VERSION}`;
const DATA = `topovo-data-${VERSION}`;
const NETZ = `topovo-netz-${VERSION}`;
const IFG = `topovo-infrago-${VERSION}`;
const KEEP = [SHELL, TILES, DATA, NETZ, IFG];

/* Die App hieß bis November 2026 „TrackPilot“ (/trackpilot/), davor „Railnav“
 * (/railnav/). Die Caches von damals liegen auf derselben Herkunft und würden
 * sonst ewig liegenbleiben — deshalb werden die alten Präfixe mit aufgeräumt. */
const ALT_PRAEFIXE = ['trackpilot-', 'railnav-'];

const SHELL_FILES = [
  './', 'index.html', 'style.css', 'app.js', 'hoehen.js', 'pdf.js', 'gebaeude.js', 'tour.js', 'radar-werk.js',
  'infrago.js', 'dgm-werk.js', 'laender-grenzen.json', 'impressum.html', 'beta2007.bin',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/leaflet-rotate.js',
  // Mit ?v=topovo, genau wie index.html und das Manifest es anfordern: Der Cache
  // vergleicht die volle Adresse, ohne den Zusatz fände er offline nichts.
  'manifest.webmanifest', 'icon.svg?v=topovo'
];

// Mit den Orthophoto-Diensten der Länder (LAND_WMS in app.js)
const TILE_HOSTS = ['tile.openstreetmap.org', 'tiles.openrailwaymap.org',
  'geoservices.bayern.de', 'owsproxy.lgl-bw.de', 'www.wms.nrw.de', 'opendata.lgln.niedersachsen.de',
  'www.gds-srv.hessen.de', 'geo4.service24.rlp.de', 'geoportal.saarland.de', 'www.geoproxy.geoportal-th.de',
  'geodienste.sachsen.de', 'www.geodatenportal.sachsen-anhalt.de', 'isk.geobasis-bb.de', 'gdi.berlin.de',
  'www.geodaten-mv.de', 'dienste.gdi-sh.de', 'geodienste.bremen.de', 'geodienste.hamburg.de'];
const MAX_TILES = 600;

/* Die Netzkacheln unter netz/ ändern sich nur, wenn werkzeug/netz-bauen.py neu
 * läuft — und dann wird hier ohnehin VERSION hochgezählt. Deshalb "erst Cache":
 * Für die übrigen eigenen Dateien gilt bewusst das Gegenteil, aber bei 300
 * Kacheln wäre eine Netzabfrage je Kachel nur Wartezeit ohne Gewinn. */
const MAX_NETZ = 500;

/* Dasselbe für die InfraGO-Daten unter infrago/ (werkzeug/infrago-bauen.py):
 * Index, Betriebsstellen, je Strecke eine Datei und für die Auflage je Strecke
 * die Anlagen, zusammen rund 2900. Eigener Vorrat, damit sie nicht die
 * Netzkacheln verdrängen. */
const MAX_IFG = 3000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    /* Nur eine vollständige App aktivieren: Fehlt ein Kernbestandteil, scheitert
     * die Installation, und der bisherige Worker bleibt samt seiner Offline-
     * Fassung im Dienst. Vorher wurde einzeln abgelegt — dann konnte eine neue
     * Fassung mit Lücken übernehmen. Wer SHELL_FILES ändert, prüft, dass jede
     * Datei existiert; sonst käme nie wieder ein Update an. */
    await cache.addAll(SHELL_FILES.map(f => new Request(f, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => [`topovo-`, ...ALT_PRAEFIXE].some(p => n.startsWith(p)) && !KEEP.includes(n))
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* Aufräumen höchstens alle TRIM_PAUSE_MS je Vorrat: cache.keys() über 600
 * Einträge kostet in Firefox spürbar, und bis November 2026 lief es nach jeder
 * einzelnen Kachel — bei 30 Kacheln zugleich stand die Karte, bis alle durch
 * waren, und erschien dann auf einmal. Der Vorrat darf dazwischen ein paar
 * Einträge über max liegen. */
const TRIM_PAUSE_MS = 20000;
const trimZuletzt = new Map();

async function trimSelten(cacheName, max) {
  const jetzt = Date.now();
  if (jetzt - (trimZuletzt.get(cacheName) || 0) < TRIM_PAUSE_MS) return;
  trimZuletzt.set(cacheName, jetzt);
  await trim(cacheName, max);
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

const MAX_DATA = 300;

/* Bis zur Antwort des Servers höchstens so lange warten, dann gilt der Abruf als
 * gescheitert und der Offlinevorrat springt ein. Im Gelände mit einem Balken
 * Empfang hinge die App sonst minutenlang auf einer Antwort, die nie kommt.
 * Gemessen wird bis zu den Antwortköpfen, nicht der ganze Download. */
const NETZ_GEDULD_MS = 6000;

/* Cache Storage ist nur ein Vorrat: Volle Quote (alle Apps dieser Herkunft
 * teilen sie sich), privates Fenster oder eine Teilantwort dürfen eine
 * erfolgreiche Netzantwort nie in einen Ladefehler verwandeln. Vorher stand das
 * Ablegen im selben try wie der Abruf — scheiterte es, war auch die frisch
 * geladene Datei weg. */
async function cacheLesen(cacheName, request) {
  try { return await (await caches.open(cacheName)).match(request); }
  catch { return undefined; }
}

/** response muss eine eigene Kopie sein (clone() vor dem Ausliefern): Das
 *  Ablegen läuft nebenher, während die Seite das Original schon liest. */
async function cacheSchreiben(cacheName, request, response, max) {
  /* Nur echte, vollständige Treffer ablegen. Undurchsichtige Antworten (opaque)
   * haben ok = false und bleiben draußen: Sie können eine 429- oder 5xx-Seite
   * sein, und Chrome rechnet jede mit mehreren MB auf den gemeinsamen Speicher an. */
  if (!response || !response.ok || response.status === 206) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    if (max) await trimSelten(cacheName, max);
  } catch { /* Die Netzantwort bleibt auch bei vollem Speicher nutzbar. */ }
}

/* Abgelegt wird nebenher (event.waitUntil), nicht vor dem Ausliefern: Die
 * Karte bekommt jede Kachel, sobald sie da ist, statt erst nach dem Schreiben. */
function nebenbeiAblegen(event, cacheName, request, res, max) {
  if (!res || !res.ok || res.status === 206) return;
  /* Ein WMS meldet Fehler mit Status 200 und XML statt Bild — Sachsen-Anhalt tut
   * das gemessen bei jeder zweiten Abfrage. Im Vorrat bliebe die Kachel sonst
   * für immer kaputt. */
  if (cacheName === TILES && !/^image\//.test(res.headers.get('content-type') || '')) return;
  event.waitUntil(cacheSchreiben(cacheName, request, res.clone(), max));
}

async function networkFirst(event, request, cacheName, frisch, max) {
  let res, fehler;
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), NETZ_GEDULD_MS);
  try {
    /* Eigene Dateien bewusst ohne HTTP-Cache holen. GitHub Pages setzt
     * Cache-Control max-age=600, dadurch kam eine neue Fassung auf dem Gerät bis
     * zu zehn Minuten später an — beim Entfernen der Zoomknöpfe fiel genau das
     * auf. Über die nackte Adresse, nicht über das Request-Objekt: Das einer
     * Seitennavigation lässt sich nicht mit neuen Optionen weiterreichen. */
    res = frisch
      ? await fetch(request.url, { cache: 'reload', credentials: 'same-origin', signal: abbruch.signal })
      : await fetch(request, { signal: abbruch.signal });
  } catch (err) {
    fehler = err;
  } finally {
    clearTimeout(wecker);
  }

  if (res && res.ok) {
    nebenbeiAblegen(event, cacheName, request, res, max);
    return res;
  }
  /* Ohne Antwort oder bei einem Serverfehler (5xx) hilft der Vorrat. Ein 404
   * dagegen ist eine Auskunft und bleibt sichtbar. */
  if (!res || res.status >= 500) {
    const hit = await cacheLesen(cacheName, request);
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const page = await cacheLesen(SHELL, 'index.html') || await cacheLesen(SHELL, './');
      if (page) return page;
    }
  }
  if (res) return res;
  throw fehler;
}

async function cacheFirst(event, request, cacheName, max) {
  const hit = await cacheLesen(cacheName, request);
  if (hit) return hit;
  // Scheitert das Ablegen, kostet das die Kachel nicht — und keinen zweiten Abruf
  const res = await fetch(request);
  nebenbeiAblegen(event, cacheName, request, res, max);
  return res;
}

/** Aus dem Vorrat sofort, und nebenher frisch geholt für das nächste Mal. */
async function vorratDannNetz(event, request, cacheName, max) {
  const hit = await cacheLesen(cacheName, request);
  const frisch = fetch(request).then(res => { nebenbeiAblegen(event, cacheName, request, res, max); return res; });
  if (hit) { event.waitUntil(frisch.catch(() => {})); return hit; }
  return frisch;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  /* Teilabfragen und angemeldete Abrufe gehen am Worker vorbei: Eine 206-Antwort
   * gehört nicht in den Vorrat, und Zugangsdaten auch nicht. */
  if (request.method !== 'GET' || request.headers.has('range') || request.headers.has('authorization')) return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (!/^https?:$/.test(url.protocol)) return;

  /* Routen (Valhalla beim FOSSGIS e.V.) gehören nicht in den Vorrat: Jede Anfrage
   * hat ihre eigenen Punkte, und eine alte Route wäre offline falsch statt fehlend. */
  if (url.hostname === 'valhalla1.openstreetmap.de') return;

  /* Laserkacheln (laser-werk.js) sind 60–1000 MB groß und werden je Ansicht
   * einmal gelesen — nie in den Vorrat, auch nicht die lokale Probe. */
  if (url.pathname.endsWith('.laz')) return;

  if (url.origin === self.location.origin) {
    /* Die Nachbar-Apps teilen die Herkunft, nicht diesen Vorrat: Was außerhalb
     * von /topovo/ liegt, reicht der Worker unverändert durch. */
    if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    /* vendor/: fremde Bibliotheken (Leaflet, MapLibre 1,1 MB), die sich nur mit
     * einer neuen VERSION ändern — "erst Cache". Vorher holte jeder Start
     * MapLibre komplett neu, am HTTP-Cache vorbei. */
    event.respondWith(url.pathname.includes('/netz/')
      ? cacheFirst(event, request, NETZ, MAX_NETZ)
      : url.pathname.includes('/infrago/')
      ? cacheFirst(event, request, IFG, MAX_IFG)
      : url.pathname.includes('/vendor/')
      ? cacheFirst(event, request, SHELL)
      : networkFirst(event, request, SHELL, true));
  } else if (url.hostname === 'tiles.openfreemap.org') {
    /* Die dunkle Karte. Stil (/styles/dark) und Kachelbeschreibung (/planet)
     * haben feste Adressen, zeigen aber jede Woche auf einen neuen Datenstand
     * (/planet/20260927_080001_pt/…). Aus dem Cache zuerst hielte ein Gerät den
     * alten Verweis fest, bis die Kacheln dahinter gelöscht sind — deshalb werden
     * beide bei jedem Abruf nebenher erneuert; ausgeliefert wird aber sofort der
     * Vorrat (Stand eine Woche alt: dessen Kacheln gab es am 01.11.2026 noch),
     * statt bei jedem Start auf zwei Netzabrufe nacheinander zu warten.
     * Kacheln, Schriften und Symbole liegen unter versionierten Pfaden und
     * ändern sich nie: "erst Cache". */
    const beschreibung = url.pathname.startsWith('/styles/') || url.pathname === '/planet';
    event.respondWith(beschreibung
      ? vorratDannNetz(event, request, DATA, MAX_DATA)
      : cacheFirst(event, request, TILES, MAX_TILES));
  } else if (TILE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(cacheFirst(event, request, TILES, MAX_TILES));
  } else if (url.hostname === 'api.openrailwaymap.org') {
    event.respondWith(networkFirst(event, request, DATA, false, MAX_DATA));
  }
});
