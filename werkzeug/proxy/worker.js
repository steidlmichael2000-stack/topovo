/* Topovo — Höhendaten-Proxy als Cloudflare Worker
 *
 * Die GeoTIFF-Kacheln der Bayerischen Vermessungsverwaltung (DGM1 und DOM20)
 * liegen auf download1.bayernwolke.de ohne CORS-Freigabe: Der Browser lädt sie
 * zwar, gibt die Bytes aber nicht an die App heraus. Dieser Worker holt sie
 * serverseitig und hängt die Freigabe für Topovo an. Die Daten stehen unter
 * CC BY 4.0; eine Anfrage oder Vereinbarung ist laut Nutzungsbedingungen nicht
 * nötig.
 *
 * Seit Oktober 2026 auch das 3D-Gebäudemodell LoD2 (CityGML, 2 × 2 km je
 * Datei). Das XML packt sich auf ein Sechzehntel; der Worker liefert es deshalb
 * gzip-gepackt aus (16,7 MB → rund 1 MB).
 *
 * Seit 13.10.2026 auch Baden-Württemberg: DGM1, DOM1 und LoD2 des LGL als
 * ZIP-Archive zu 2 × 2 km (Datenlizenz Deutschland – Namensnennung 2.0), auf
 * opengeodata.lgl-bw.de ebenfalls ohne CORS für fremde Seiten. Die App holt
 * daraus per Bytebereich nur Verzeichnis und einen Eintrag; entpackt wird im
 * Browser.
 *
 * Bewusst eng gefasst, damit kein offener Proxy daraus wird: feste Pfade,
 * Kachelnamen nur als Ziffernmuster, nur GET und HEAD, höchstens ein
 * Bytebereich. Den Höhendienst der BVV reicht er absichtlich nicht durch — der
 * lässt im Browser nur die eigenen Portale zu, und das ist eine Entscheidung
 * des Betreibers.
 *
 *   GET /dgm1/636_5528.tif       →  …bayernwolke.de/a/dgm/dgm1/636_5528.tif
 *   GET /dom20/638_5526.tif      →  …bayernwolke.de/a/dom20/DOM/32638_5526_20_DOM.tif
 *   GET /lod2/638_5532.gml       →  …bayernwolke.de/a/lod2/citygml/638_5532.gml
 *   GET /bw/dgm1/513_5402.zip    →  …lgl-bw.de/data/dgm/dgm1_32_513_5402_2_bw.zip
 *   GET /bw/dom1/513_5402.zip    →  …lgl-bw.de/data/dom1/dom1_32_513_5402_2_bw.zip
 *   GET /bw/lod2/513_5402.zip    →  …lgl-bw.de/data/lod2/LoD2_32_513_5402_2_bw.zip
 *   GET /laser/614_5478.laz      →  geodaten.bayern.de/odd_data/laser/614_5478.laz
 *
 * Seit November 2026 auch die Laserpunkte der BVV (LAZ, 1 × 1 km, CC BY 4.0,
 * 58 MB bis 1 GB je Kachel) für die 3D-Ansicht. Ebenfalls ohne CORS.
 *
 * Einrichten über das Dashboard: Worker öffnen → „Edit code" → diese Datei
 * hineinkopieren → „Deploy". Die Adresse (…workers.dev) gehört danach in
 * HOEHEN.proxy in hoehen.js. Kostenloser Plan: 100.000 Abfragen am Tag,
 * darüber antwortet Cloudflare mit Fehler 1027 statt einer Rechnung.
 *
 * Lokal läuft derselbe Code mit:  node werkzeug/proxy/lokal.mjs
 */

const QUELLE = 'https://download1.bayernwolke.de/a';
const LGL = 'https://opengeodata.lgl-bw.de/data';
const LASER = 'https://geodaten.bayern.de/odd_data/laser';
const ZIELE = {
  dgm1: (e, n) => `${QUELLE}/dgm/dgm1/${e}_${n}.tif`,
  dom20: (e, n) => `${QUELLE}/dom20/DOM/32${e}_${n}_20_DOM.tif`,
  lod2: (e, n) => `${QUELLE}/lod2/citygml/${e}_${n}.gml`,
  'bw-dgm1': (e, n) => `${LGL}/dgm/dgm1_32_${e}_${n}_2_bw.zip`,
  'bw-dom1': (e, n) => `${LGL}/dom1/dom1_32_${e}_${n}_2_bw.zip`,
  'bw-lod2': (e, n) => `${LGL}/lod2/LoD2_32_${e}_${n}_2_bw.zip`,
  laser: (e, n) => `${LASER}/${e}_${n}.laz`
};
const PFAD = /^\/(?:(dgm1|dom20)\/(\d{3})_(\d{4})\.tif|(lod2)\/(\d{3})_(\d{4})\.gml|bw\/(dgm1|dom1|lod2)\/(\d{3})_(\d{4})\.zip|(laser)\/(\d{3})_(\d{4})\.laz)$/;
const BEREICH = /^bytes=(\d+-\d*|-\d+)$/;

const HERKUNFT = ['https://steidlmichael2000-stack.github.io'];

/* Begrenzung je IP-Adresse (05.11.2026). Ohne sie ließe sich das Tageskontingent
 * (100.000 Abfragen) mit einer Schleife leerziehen — und eine Laserkachel geht
 * jedes Mal ganz von der BVV durch. Gezählt wird im Speicher des Workers: Das
 * wirkt nach Einfügen im Dashboard ohne weitere Einrichtung, zählt aber je
 * Rechenzentrum und Instanz, ist also eine Bremse, keine harte Grenze. Das reicht
 * gegen ein Skript, das immer wieder dieselbe Instanz trifft. Großzügig bemessen:
 * Ein Querprofil braucht ein paar Dutzend Bytebereiche, eine Profilmappe einige
 * hundert. Ist zusätzlich die Bindung LASER_GRENZE eingerichtet (nur über wrangler,
 * siehe README), zählt Cloudflare die Laserkacheln dort gemeinsam je Standort. */
const GRENZEN = {
  laser: { anzahl: 30, sekunden: 3600 },      // ganze Kacheln, 60 MB bis 1 GB
  sonst: { anzahl: 3000, sekunden: 600 }      // Bytebereiche, LoD2, BW-Archive
};
const zaehler = new Map();                    // `${gruppe}|${ip}` → { bis, n }

function zuViel(gruppe, ip, jetzt) {
  const g = GRENZEN[gruppe], schluessel = `${gruppe}|${ip}`;
  let z = zaehler.get(schluessel);
  if (!z || z.bis <= jetzt) {
    // Abgelaufene ab und zu wegräumen, damit die Liste nicht wächst
    if (zaehler.size > 5000) for (const [k, w] of zaehler) if (w.bis <= jetzt) zaehler.delete(k);
    z = { bis: jetzt + g.sekunden * 1000, n: 0 };
    zaehler.set(schluessel, z);
  }
  z.n++;
  return z.n > g.anzahl ? Math.ceil((z.bis - jetzt) / 1000) : 0;
}
const LOKAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const DURCHREICHEN = ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified'];

export default {
  async fetch(request, env) {
    /* Fremde Seiten bekommen nichts. Ohne Origin — im Adressfeld geöffnet oder
     * von der Kommandozeile — kommt die Datei trotzdem: Sie ist ohnehin
     * öffentlich, und so lässt sich der Worker von Hand prüfen. */
    const herkunft = request.headers.get('Origin');
    if (herkunft && !HERKUNFT.includes(herkunft) && !LOKAL.test(herkunft)) {
      return new Response('Herkunft nicht freigegeben', { status: 403 });
    }
    /* Vary immer, auch ohne Origin: Sonst nähme der Browser eine im Adressfeld
     * geholte Kachel (ohne CORS-Kopf) eine Woche lang auch für die App. */
    const cors = herkunft ? {
      'Access-Control-Allow-Origin': herkunft,
      // Content-Range braucht die App, um Teilantworten zu erkennen
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag',
      'Vary': 'Origin'
    } : { 'Vary': 'Origin' };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, HEAD',
          'Access-Control-Allow-Headers': 'Range', 'Access-Control-Max-Age': '86400' }
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { ...cors, Allow: 'GET, HEAD, OPTIONS' } });
    }

    const t = PFAD.exec(new URL(request.url).pathname);
    if (!t) return new Response('Unbekannter Pfad', { status: 404, headers: cors });
    // [Pfad, Art, Ost, Nord]
    const treffer = t[1] ? t : t[4] ? [t[0], t[4], t[5], t[6]] : t[10] ? [t[0], t[10], t[11], t[12]]
      : [t[0], `bw-${t[7]}`, t[8], t[9]];
    const lod2 = treffer[1] === 'lod2';

    /* Nur GET zählt: Die App fragt vor dem Laden mit HEAD nach der Größe */
    if (request.method === 'GET') {
      const ip = request.headers.get('CF-Connecting-IP') || 'lokal';
      const gruppe = treffer[1] === 'laser' ? 'laser' : 'sonst';
      let warte = zuViel(gruppe, ip, Date.now());
      if (!warte && gruppe === 'laser' && env && env.LASER_GRENZE) {
        const { success } = await env.LASER_GRENZE.limit({ key: ip });
        if (!success) warte = 60;
      }
      if (warte) {
        return new Response('Zu viele Abfragen — bitte später noch einmal.', {
          status: 429, headers: { ...cors, 'Retry-After': String(warte), 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }

    const kopf = new Headers();
    const bereich = request.headers.get('Range');
    if (bereich) {
      if (!BEREICH.test(bereich)) return new Response(null, { status: 416, headers: cors });
      kopf.set('Range', bereich);
    }
    /* geodaten.bayern.de packt die LAZ-Dateien unterwegs noch einmal mit gzip,
     * sobald der Abrufer es anbietet — und Cloudflare bietet es immer an. Dann
     * fehlt Content-Length, und Bytebereiche gehen nicht (am 04.11.2026 so
     * gesehen). LAZ ist schon gepackt; also ungepackt verlangen. Geholfen hat es
     * nicht — Cloudflare bietet gzip trotzdem an, die Größe fehlt weiter. Die App
     * kommt ohne aus (ohneLaenge in laser-werk.js); die Zeile schadet nicht. */
    if (treffer[1] === 'laser') kopf.set('Accept-Encoding', 'identity');

    /* Teilabfragen am Zwischenspeicher von Cloudflare vorbei: Bei einem
     * Fehltreffer holt Cloudflare sonst erst die ganze Datei — beim DOM20 bis
     * 64 MB — und liefert den Bereich danach. Am 10.10.2026 gemessen: erster
     * Bereich aus einer neuen Kachel 4,8 s über den Worker, 0,19 s direkt vom
     * Server. Ganze DGM-Kacheln dürfen in den Zwischenspeicher. */
    const quelle = await fetch(ZIELE[treffer[1]](treffer[2], treffer[3]),
      bereich ? { method: request.method, headers: kopf, cache: 'no-store' } : { method: request.method, headers: kopf });
    const antwort = new Headers(cors);
    for (const k of DURCHREICHEN) {
      const wert = quelle.headers.get(k);
      if (wert) antwort.set(k, wert);
    }
    /* Eine Kachel ändert sich nur mit einer neuen Befliegung oder Auswertung.
     * Fehlt sie (außerhalb Bayerns), bleibt die Fehlerseite des Servers
     * draußen — die App braucht nur den Status. */
    if (!quelle.ok) {
      antwort.delete('Content-Type');
      antwort.delete('Content-Length');
      return new Response(null, { status: quelle.status, headers: antwort });
    }
    /* Laserkacheln (60 MB bis 1 GB) nie im Browser ablegen — der Zwischenspeicher
     * läge auf dem Gerät. Die App hält sie nur im Arbeitsspeicher. */
    antwort.set('Cache-Control', treffer[1] === 'laser' ? 'no-store' : 'public, max-age=604800');
    /* LoD2 gepackt: Mit Content-Encoding gzip packt die Laufzeit des Workers den
     * Körper selbst (encodeBody „automatic"); die Länge ist dann eine andere. */
    if (lod2 && !bereich && /gzip/.test(request.headers.get('Accept-Encoding') || '')) {
      antwort.set('Content-Type', 'application/xml; charset=utf-8');
      antwort.set('Content-Encoding', 'gzip');
      antwort.delete('Content-Length');
    }
    /* Laserkacheln gepackt durchreichen, wie sie kommen. Ohne Content-Encoding in der
     * Antwort entpackt die Laufzeit den gzip-Strom der BVV im Worker — bei der
     * 713-MB-Kachel 650_5254 endete das zweimal still nach 540 bzw. 214 MB, direkt
     * kam sie ganz (05.11.2026). Mit der Kopfzeile reicht Cloudflare die Bytes
     * unverändert weiter, und der Browser entpackt selbst. */
    const packung = quelle.headers.get('Content-Encoding');
    if (treffer[1] === 'laser' && packung && !bereich) {
      antwort.set('Content-Encoding', packung);
      antwort.delete('Content-Length');
    }
    return new Response(request.method === 'HEAD' ? null : quelle.body, { status: quelle.status, headers: antwort });
  }
};
