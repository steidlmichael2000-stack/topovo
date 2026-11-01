/* TrackPilot — Service Worker
 *
 * Ziel: Die App startet auch ohne Netz, und bereits angesehene Kartenkacheln
 * bleiben sichtbar. Für alles Eigene gilt "erst Netz, dann Cache", damit eine
 * neue Version sofort ankommt statt hinter einem alten Cache zu hängen.
 */

const VERSION = 'v78';
const SHELL = `trackpilot-shell-${VERSION}`;
const TILES = `trackpilot-tiles-${VERSION}`;
const DATA = `trackpilot-data-${VERSION}`;
const NETZ = `trackpilot-netz-${VERSION}`;
const IFG = `trackpilot-infrago-${VERSION}`;
const KEEP = [SHELL, TILES, DATA, NETZ, IFG];

/* Die App hiess bis zur Umbenennung "Railnav" und lag unter /railnav/. Die
 * Caches von damals liegen auf derselben Herkunft und wuerden sonst ewig
 * liegenbleiben - deshalb wird der alte Praefix hier mit aufgeraeumt. */
const ALT_PRAEFIX = 'railnav-';

const SHELL_FILES = [
  './', 'index.html', 'style.css', 'app.js', 'hoehen.js', 'pdf.js', 'gebaeude.js', 'tour.js', 'radar-werk.js',
  'infrago.js', 'bw-grenze.json',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/leaflet-rotate.js',
  // Mit ?v=lapis, genau wie index.html und das Manifest es anfordern: Der Cache
  // vergleicht die volle Adresse, ohne den Zusatz fände er offline nichts.
  'manifest.webmanifest', 'icon.svg?v=lapis'
];

const TILE_HOSTS = ['tile.openstreetmap.org', 'tiles.openrailwaymap.org', 'server.arcgisonline.com',
  'geoservices.bayern.de', 'owsproxy.lgl-bw.de'];
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
      .filter(n => (n.startsWith('trackpilot-') || n.startsWith(ALT_PRAEFIX)) && !KEEP.includes(n))
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

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

async function cacheSchreiben(cacheName, request, response, max) {
  /* Nur echte, vollständige Treffer ablegen. Undurchsichtige Antworten (opaque)
   * haben ok = false und bleiben draußen: Sie können eine 429- oder 5xx-Seite
   * sein, und Chrome rechnet jede mit mehreren MB auf den gemeinsamen Speicher an. */
  if (!response || !response.ok || response.status === 206) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    if (max) await trim(cacheName, max);
  } catch { /* Die Netzantwort bleibt auch bei vollem Speicher nutzbar. */ }
}

async function networkFirst(request, cacheName, frisch, max) {
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
    await cacheSchreiben(cacheName, request, res, max);
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

async function cacheFirst(request, cacheName, max) {
  const hit = await cacheLesen(cacheName, request);
  if (hit) return hit;
  // Scheitert das Ablegen, kostet das die Kachel nicht — und keinen zweiten Abruf
  const res = await fetch(request);
  await cacheSchreiben(cacheName, request, res, max);
  return res;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  /* Teilabfragen und angemeldete Abrufe gehen am Worker vorbei: Eine 206-Antwort
   * gehört nicht in den Vorrat, und Zugangsdaten auch nicht. */
  if (request.method !== 'GET' || request.headers.has('range') || request.headers.has('authorization')) return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (!/^https?:$/.test(url.protocol)) return;

  if (url.origin === self.location.origin) {
    /* Die Nachbar-Apps teilen die Herkunft, nicht diesen Vorrat: Was außerhalb
     * von /trackpilot/ liegt, reicht der Worker unverändert durch. */
    if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    event.respondWith(url.pathname.includes('/netz/')
      ? cacheFirst(request, NETZ, MAX_NETZ)
      : url.pathname.includes('/infrago/')
      ? cacheFirst(request, IFG, MAX_IFG)
      : networkFirst(request, SHELL, true));
  } else if (url.hostname === 'tiles.openfreemap.org') {
    /* Die dunkle Karte. Stil (/styles/dark) und Kachelbeschreibung (/planet)
     * haben feste Adressen, zeigen aber jede Woche auf einen neuen Datenstand
     * (/planet/20260927_080001_pt/…). Aus dem Cache zuerst hielte ein Gerät den
     * alten Verweis fest, bis die Kacheln dahinter gelöscht sind — deshalb diese
     * beiden "erst Netz". Kacheln, Schriften und Symbole liegen unter
     * versionierten Pfaden und ändern sich nie: "erst Cache". */
    const beschreibung = url.pathname.startsWith('/styles/') || url.pathname === '/planet';
    event.respondWith(beschreibung
      ? networkFirst(request, DATA, false, MAX_DATA)
      : cacheFirst(request, TILES, MAX_TILES));
  } else if (TILE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(cacheFirst(request, TILES, MAX_TILES));
  } else if (url.hostname === 'api.openrailwaymap.org') {
    event.respondWith(networkFirst(request, DATA, false, MAX_DATA));
  }
});
