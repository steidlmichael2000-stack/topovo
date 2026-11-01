/* Topovo — Höhendaten für das Querprofil
 *
 * Gelände (DGM1, 1 m Gitter) und Oberfläche mit Gebäuden und Bewuchs (DOM20,
 * 20 cm) der Bayerischen Vermessungsverwaltung, OpenData unter CC BY 4.0. Beide
 * liegen als GeoTIFF-Kacheln von 1 km × 1 km auf download1.bayernwolke.de —
 * ohne CORS-Freigabe. Die App holt sie deshalb über einen eigenen Cloudflare
 * Worker (werkzeug/proxy/worker.js). Der WMS liefert nur gerenderte Bilder,
 * und der Höhendienst der BVV lässt im Browser nur die eigenen Portale zu.
 *
 * Am 10.10.2026 nachgemessen:
 *
 *   DGM1   1000 × 1000 Float32, LZW, Streifen zu je 2 Zeilen, kein COG,
 *          1,5–3,9 MB je Kachel (Median 2,1 MB im Flachland, 3,5 MB in den Alpen)
 *   DOM20  5000 × 5000 Float32, LZW, intern in 256 × 256 Pixel gekachelt,
 *          13–64 MB je Kachel, rund 100 kB je Block von 51,2 × 51,2 m
 *
 * Vom DGM kommt deshalb die ganze Datei — eine schräge Linie bräuchte ohnehin
 * fast alle Streifen —, vom DOM per Range-Abfrage nur die Blöcke entlang der
 * Linie. Damit sind auch die rund 100 MB, die eine DOM-Kachel entpackt hätte,
 * kein Thema für den Speicher des Handys. Für eine einzelne Höhe (hoehenPunkt)
 * holt auch das DGM nur Kopf und Streifen: am 10.10.2026 24 kB bzw. 37 kB
 * beim ersten Punkt einer Kachel, 5–13 kB für jeden weiteren.
 *
 * Seit 13.10.2026 auch Baden-Württemberg: das DGM1 des LGL springt ein, wo
 * Bayern keinen Wert hat (HOEHEN_ARTEN → weiter, Einzelheiten bei
 * LGL_PRODUKTE). Es liegt auf demselben Raster; wo beide Länder Werte haben,
 * gilt Bayern. Welche Länder in einem Profil stecken, steht in quellen.
 *
 * Bewusst ohne geotiff.js und proj4: Der Aufbau ist bekannt und eng. Weicht
 * eine Datei davon ab, bricht das Lesen mit einer klaren Meldung ab, statt
 * still falsche Höhen zu liefern. Geprüft wird mit werkzeug/hoehen-pruefen.mjs.
 */

const HOEHEN = {
  /* Der Worker aus werkzeug/proxy/worker.js. Auch beim Entwickeln auf
   * localhost: Die CSP der App lässt nur https-Verbindungen zu, und der Worker
   * gibt localhost ohnehin frei. werkzeug/proxy/lokal.mjs ist nur zum Prüfen
   * des Workers selbst. */
  proxy: 'https://trackpilot-hoehen.steidl-michael2000.workers.dev',
  /* Nur für die Prüfung unter Node: Dort gilt kein CORS, und die Kacheln
   * kommen direkt vom Server der Vermessungsverwaltung. */
  direkt: false,
  geladen: 0,         // Bytes über die Leitung, seit dem Start
  /* Wer den Fortschritt sehen will, setzt hier eine Funktion: Sie bekommt
   * { kacheln, fertig } beim Abgreifen und wird bei jedem Stück, das über die
   * Leitung kommt, ohne Argument gerufen (dann steht geladen schon weiter). */
  fortschritt: null
};

const BVV_DOWNLOAD = 'https://download1.bayernwolke.de/a';

/* land: wessen Daten, für Rahmen und Quellenvermerk. weiter: die Art, die
 * einspringt, wo diese keinen Wert hat — außerhalb Bayerns, aber auch auf dem
 * Streifen an der Grenze, wo die bayerische Kachel NoData trägt. */
const HOEHEN_ARTEN = {
  dgm1: { aufloesung: 1, pixel: 1000, ganz: true, land: 'by', weiter: 'dgm1-bw',
    direkt: (e, n) => `${BVV_DOWNLOAD}/dgm/dgm1/${e}_${n}.tif` },
  dom20: { aufloesung: 0.2, pixel: 5000, ganz: false, land: 'by', weiter: 'dom1-bw',
    direkt: (e, n) => `${BVV_DOWNLOAD}/dom20/DOM/32${e}_${n}_20_DOM.tif` },
  'dgm1-bw': { aufloesung: 1, pixel: 1000, ganz: true, land: 'bw', lgl: 'dgm1' },
  'dom1-bw': { aufloesung: 1, pixel: 1000, ganz: true, land: 'bw', lgl: 'dom1' }
};

/* Baden-Württemberg: Landesamt für Geoinformation und Landentwicklung (LGL),
 * Datenlizenz Deutschland – Namensnennung 2.0. Am 13.10.2026 nachgemessen:
 *
 *   ZIP je 2 × 2 km, Südwestecke Ost ungerade, Nord gerade (513_5402, 413_5316,
 *   461_5482, 573_5360); darin je Kilometer eine Datei, deren Name das Jahr
 *   trägt (dgm1_32_513_5402_1_bw_2023.xyz) — gesucht wird deshalb im Verzeichnis.
 *   DGM1   XYZ-Text, 1000 × 1000 Werte von Nord nach Süd, Pixelmitte bei ,50
 *          wie in Bayern; 29 MB entpackt, rund 3,4 MB gepackt je Kilometer
 *   DOM1   GeoTIFF 1000 × 1000, Float32, LZW mit Gleitkomma-Prädiktor, Blöcke
 *          zu 512 × 512; rund 3,3 MB je Kilometer, im Archiv kaum kleiner.
 *          Aus derselben Befliegung wie das DGM daneben (Stuttgart 2016,
 *          Reutlingen 2017, Ulm 2021)
 *   LoD2   CityGML 1.0 wie in Bayern, je Kilometer 18–50 MB, gepackt 2–5 MB
 *          (gelesen in gebaeude.js)
 *
 * Kein CORS für fremde Seiten, also auch hier über den Worker. Der Server nimmt
 * Teilabfragen an: Erst das Verzeichnis am Dateiende (64 kB), dann nur die eine
 * Datei, die gebraucht wird. Entpackt wird im Browser (DecompressionStream). */
const LGL_DOWNLOAD = 'https://opengeodata.lgl-bw.de/data';
const LGL_PRODUKTE = {
  dgm1: { ordner: 'dgm', datei: 'dgm1', endung: 'xyz' },
  dom1: { ordner: 'dom1', datei: 'dom1', endung: 'tif' },
  lod2: { ordner: 'lod2', datei: 'LoD2', endung: 'gml' }
};

/* ============================ UTM Zone 32 ============================
 * ETRS89 / UTM 32N (EPSG:25832). Krüger-Reihen bis n⁴ in der Form von
 * Karney (2011); innerhalb Bayerns weit unter einem Millimeter. Ganz Bayern
 * rechnet die Vermessungsverwaltung in Zone 32, auch östlich von 12° —
 * die Kacheln tragen deshalb überall die 32 im Namen. */

const UTM = (() => {
  const a = 6378137, f = 1 / 298.257222101;          // GRS80
  const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  return {
    a, f, n, k0: 0.9996, e0: 500000, l0: 9 * Math.PI / 180,
    A: a / (1 + n) * (1 + n2 / 4 + n4 / 64),
    alpha: [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180,
      13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440,
      61 * n3 / 240 - 103 * n4 / 140,
      49561 * n4 / 161280],
    beta: [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360,
      n2 / 48 + n3 / 15 - 437 * n4 / 1440,
      17 * n3 / 480 - 37 * n4 / 840,
      4397 * n4 / 161280],
    delta: [2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45,
      7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45,
      56 * n3 / 15 - 136 * n4 / 35,
      4279 * n4 / 630]
  };
})();

/** Geografisch (Grad) → [Ost, Nord] in Metern. */
function utm32Hin(lat, lon) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180 - UTM.l0;
  const ex = 2 * Math.sqrt(UTM.n) / (1 + UTM.n);     // erste Exzentrizität
  const t = Math.sinh(Math.atanh(Math.sin(p)) - ex * Math.atanh(ex * Math.sin(p)));
  const xi1 = Math.atan2(t, Math.cos(l));
  const eta1 = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let xi = xi1, eta = eta1;
  for (let j = 1; j <= 4; j++) {
    xi += UTM.alpha[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
    eta += UTM.alpha[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
  }
  return [UTM.e0 + UTM.k0 * UTM.A * eta, UTM.k0 * UTM.A * xi];
}

/** [Ost, Nord] in Metern → [lat, lon] in Grad. */
function utm32Zurueck(e, n) {
  const xi = n / (UTM.k0 * UTM.A), eta = (e - UTM.e0) / (UTM.k0 * UTM.A);
  let xi1 = xi, eta1 = eta;
  for (let j = 1; j <= 4; j++) {
    xi1 -= UTM.beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    eta1 -= UTM.beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let p = chi;
  for (let j = 1; j <= 4; j++) p += UTM.delta[j - 1] * Math.sin(2 * j * chi);
  return [p * 180 / Math.PI, (UTM.l0 + Math.atan2(Math.sinh(eta1), Math.cos(xi1))) * 180 / Math.PI];
}

/** Länge eines kurzen Abschnitts auf dem Ellipsoid, [lat, lon] in Grad.
 *  Mit den Krümmungsradien in der Mitte; bis 10 km auf Zentimeter genau. */
function ellipsoidAbstand(a, b) {
  const pm = (a[0] + b[0]) / 2 * Math.PI / 180;
  const e2 = UTM.f * (2 - UTM.f);
  const w = Math.sqrt(1 - e2 * Math.sin(pm) ** 2);
  const M = UTM.a * (1 - e2) / (w * w * w), N = UTM.a / w;
  const dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180;
  return Math.hypot(M * dp, N * Math.cos(pm) * dl);
}

/* ============================ GeoTIFF ============================
 * Nur, was die beiden Produkte tatsächlich brauchen: ein einziges Bild,
 * Float32, LZW ohne Prädiktor, in Streifen oder Kacheln. */

const TIFF_GROESSE = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 };

/** Liest den Kopf. lies(von, laenge) liefert ein Uint8Array.
 *
 *  Wo die Verzeichnisse stehen, ist nicht einheitlich: Bei der DGM1-Kachel
 *  636_5528 beginnt es bei Byte 8, bei 778_5292 erst kurz vor dem Dateiende.
 *  Gelesen wird deshalb aus den Stücken, die schon da sind, und nur, was
 *  fehlt, wird nachgeholt. */
async function tiffKopf(lies, anfang) {
  const stuecke = [{ von: 0, b: anfang || await lies(0, 16384) }];
  const bei = async (von, laenge) => {
    let s = stuecke.find(x => von >= x.von && von + laenge <= x.von + x.b.byteLength);
    if (!s) {
      s = { von, b: await lies(von, Math.max(laenge, 4096)) };
      if (s.b.byteLength < laenge) throw new Error('Höhendaten: TIFF-Datei abgeschnitten');
      stuecke.push(s);
    }
    return { dv: new DataView(s.b.buffer, s.b.byteOffset, s.b.byteLength), p: von - s.von };
  };

  const kopf = await bei(0, 8);
  const ord = kopf.dv.getUint16(0);
  if (ord !== 0x4949 && ord !== 0x4D4D) throw new Error('Höhendaten: keine TIFF-Datei');
  const le = ord === 0x4949;
  if (kopf.dv.getUint16(2, le) !== 42) throw new Error('Höhendaten: BigTIFF wird nicht gelesen');

  const ifd = kopf.dv.getUint32(4, le);
  const zahlStelle = await bei(ifd, 2);
  const anzahl = zahlStelle.dv.getUint16(zahlStelle.p, le);
  const verz = await bei(ifd + 2, 12 * anzahl + 4);
  const eintraege = {};
  for (let i = 0; i < anzahl; i++) {
    const o = verz.p + 12 * i;
    eintraege[verz.dv.getUint16(o, le)] = { typ: verz.dv.getUint16(o + 2, le), zahl: verz.dv.getUint32(o + 4, le), ort: o + 8 };
  }

  /* Werte bis vier Byte stehen im Eintrag selbst, längere an einer eigenen
   * Stelle, die wiederum irgendwo in der Datei liegen kann. */
  const lesen = async tag => {
    const e = eintraege[tag];
    if (!e || !TIFF_GROESSE[e.typ]) return null;
    const groesse = TIFF_GROESSE[e.typ] * e.zahl;
    let quelle = verz.dv, start = e.ort;
    if (groesse > 4) {
      const s = await bei(verz.dv.getUint32(e.ort, le), groesse);
      quelle = s.dv;
      start = s.p;
    }
    if (e.typ === 2) {
      let s = '';
      for (let k = 0; k < e.zahl; k++) s += String.fromCharCode(quelle.getUint8(start + k));
      return s.replace(/\0+$/, '');
    }
    const aus = new Array(e.zahl);
    for (let k = 0; k < e.zahl; k++) {
      const p = start + k * TIFF_GROESSE[e.typ];
      aus[k] = e.typ === 3 ? quelle.getUint16(p, le)
        : e.typ === 4 ? quelle.getUint32(p, le)
        : e.typ === 12 ? quelle.getFloat64(p, le)
        : quelle.getUint8(p);
    }
    return aus;
  };
  const eins = async (tag, vorgabe) => { const w = await lesen(tag); return w ? w[0] : vorgabe; };

  const k = {
    le,
    breite: await eins(256), hoehe: await eins(257),
    bits: await eins(258, 1), kompression: await eins(259, 1), praediktor: await eins(317, 1),
    format: await eins(339, 1), ebenen: await eins(277, 1),
    skala: await lesen(33550), tie: await lesen(33922),
    kacheln: !!eintraege[322]
  };
  if (k.kacheln) {
    k.bw = await eins(322); k.bh = await eins(323);
    k.offsets = await lesen(324); k.laengen = await lesen(325);
  } else {
    k.bw = k.breite; k.bh = await eins(278, k.hoehe);
    k.offsets = await lesen(273); k.laengen = await lesen(279);
  }
  k.quer = Math.ceil(k.breite / k.bw);

  if (k.bits !== 32 || k.format !== 3 || k.ebenen !== 1) {
    throw new Error(`Höhendaten: unerwartetes Format (${k.bits} bit, Typ ${k.format}, ${k.ebenen} Kanäle)`);
  }
  if (k.kompression !== 1 && k.kompression !== 5) throw new Error(`Höhendaten: Kompression ${k.kompression} wird nicht gelesen`);
  // 3: Gleitkomma-Prädiktor, so liegt das DOM1 des LGL vor
  if (k.praediktor !== 1 && k.praediktor !== 3) throw new Error(`Höhendaten: Prädiktor ${k.praediktor} wird nicht gelesen`);
  if (!k.skala || !k.tie || !k.offsets || !k.laengen) throw new Error('Höhendaten: Georeferenz oder Blocktabelle fehlt');

  /* GeoKeys: Raster als Fläche (Tiepunkt an der Pixelecke) oder als Punkt
   * (Tiepunkt in der Pixelmitte), dazu das Koordinatensystem. Das DGM1 ist als
   * Fläche ausgezeichnet, und die XYZ-Fassung bestätigt das: Der erste Wert der
   * Kachel 636_5528 steht bei 636000,50 / 5528999,50. Der Höhendienst der BVV
   * setzt ihn dagegen auf die Ecke und liegt damit einen halben Meter versetzt
   * — wer beide vergleicht, sieht am Hang Unterschiede bis 1,7 m. */
  const geo = await lesen(34735) || [];
  const schluessel = id => {
    for (let i = 4; i + 3 < geo.length; i += 4) if (geo[i] === id && geo[i + 1] === 0) return geo[i + 3];
    return undefined;
  };
  const epsg = schluessel(3072);
  if (epsg !== undefined && epsg !== 25832) throw new Error(`Höhendaten: EPSG:${epsg} statt 25832`);
  k.versatz = schluessel(1025) === 2 ? 0 : 0.5;

  const nodata = await lesen(42113);
  k.nodata = nodata ? parseFloat(nodata) : NaN;
  return k;
}

/** TIFF-LZW (MSB zuerst, Codebreite 9–12 Bit mit vorgezogenem Wechsel). */
function lzwEntpacken(daten, soll) {
  const aus = new Uint8Array(soll);
  const vor = new Int16Array(4096);       // Vorgänger in der Kette
  const letztes = new Uint8Array(4096);   // letztes Byte des Eintrags
  const erstes = new Uint8Array(4096);    // erstes Byte des Eintrags
  const lang = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) { vor[i] = -1; letztes[i] = i; erstes[i] = i; lang[i] = 1; }

  let naechster = 258, breite = 9, alt = -1, pos = 0, bit = 0;
  const bits = daten.length * 8;

  const schreiben = code => {
    const l = lang[code];
    let p = pos + l - 1;
    for (let c = code; c !== -1; c = vor[c], p--) if (p < soll) aus[p] = letztes[c];
    pos += l;
  };

  while (bit + breite <= bits && pos < soll) {
    const i = bit >> 3;
    const w = (daten[i] << 16) | ((daten[i + 1] || 0) << 8) | (daten[i + 2] || 0);
    const code = (w >> (24 - (bit & 7) - breite)) & ((1 << breite) - 1);
    bit += breite;

    if (code === 257) break;                         // Ende
    if (code === 256) { naechster = 258; breite = 9; alt = -1; continue; }
    if (alt === -1) { schreiben(code); alt = code; continue; }

    if (naechster < 4096) {
      vor[naechster] = alt;
      erstes[naechster] = erstes[alt];
      letztes[naechster] = code < naechster ? erstes[code] : erstes[alt];
      lang[naechster] = lang[alt] + 1;
      naechster++;
    }
    if (code >= naechster) throw new Error('Höhendaten: LZW-Strom beschädigt');
    schreiben(code);
    alt = code;
    if (naechster + 1 >= (1 << breite) && breite < 12) breite++;
  }
  return aus;
}

/* ============================ Kacheln und Blöcke ============================ */

const HOEHEN_KACHELN_MAX = 12;           // Kacheln samt Kopf; beim DGM mit Datei (bis 4 MB)
const HOEHEN_BLOECKE_MAX = 48 * 2 ** 20; // entpackte Blöcke, in Byte
const hoehenKacheln = new Map();          // "dgm1/636_5528" → Promise<Kachel|null>
const hoehenBloecke = new Map();          // "dgm1/636_5528#17" → Float32Array
let hoehenBloeckeByte = 0;
/* Kacheln, die es nicht gibt (404). In Württemberg liegt jeder Punkt auch im
 * Rahmen um Bayern; ohne dieses Merken fragte jedes Profil dort erst wieder
 * den Server der BVV. */
const hoehenFehlen = new Set();

function hoehenAdresse(art, e, n) {
  return HOEHEN.direkt ? HOEHEN_ARTEN[art].direkt(e, n) : `${HOEHEN.proxy}/${art}/${e}_${n}.tif`;
}

/** Liest die Antwort und zählt dabei mit — in Stücken, damit eine Anzeige
 *  schon während einer 3-MB-Kachel weiterläuft und nicht nur nach jeder. */
async function hoehenKoerper(r) {
  if (!HOEHEN.fortschritt || !r.body || !r.body.getReader) {
    const b = new Uint8Array(await r.arrayBuffer());
    HOEHEN.geladen += b.byteLength;
    return b;
  }
  const leser = r.body.getReader(), teile = [];
  let summe = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    teile.push(value);
    summe += value.byteLength;
    HOEHEN.geladen += value.byteLength;
    if (HOEHEN.fortschritt) HOEHEN.fortschritt();
  }
  if (teile.length === 1) return teile[0];
  const b = new Uint8Array(summe);
  let o = 0;
  for (const t of teile) { b.set(t, o); o += t.byteLength; }
  return b;
}

/** Holt eine Datei oder einen Bytebereich daraus; null, wenn es sie nicht gibt.
 *  Negatives von: die letzten −von Byte (für das Verzeichnis einer ZIP-Datei). */
async function hoehenHolen(url, von, laenge) {
  const bereich = von < 0 ? `bytes=${von}` : laenge ? `bytes=${von}-${von + laenge - 1}` : '';
  const r = await fetch(url, bereich ? { headers: { Range: bereich } } : {});
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Höhendaten: HTTP ${r.status}`);
  const b = await hoehenKoerper(r);
  // Hat der Server den Bereich übergangen, kam die ganze Datei
  if (!bereich || r.status === 206) return b;
  return von < 0 ? b.subarray(Math.max(0, b.byteLength + von)) : b.subarray(von, von + laenge);
}

/* ---- ZIP-Dateien des LGL ----
 * Nur, was die Archive tatsächlich enthalten: kein ZIP64, Einträge gespeichert
 * oder mit Deflate gepackt. */
const lglVerzeichnisse = new Map();       // Adresse → Promise<Einträge|null>

function lglAdresse(produkt, e, n) {
  const p = LGL_PRODUKTE[produkt];
  const ze = e % 2 ? e : e - 1, zn = n % 2 ? n - 1 : n;
  return HOEHEN.direkt ? `${LGL_DOWNLOAD}/${p.ordner}/${p.datei}_32_${ze}_${zn}_2_bw.zip`
    : `${HOEHEN.proxy}/bw/${produkt}/${ze}_${zn}.zip`;
}

/** Das zentrale Verzeichnis vom Ende der Datei; null, wenn es sie nicht gibt. */
function zipVerzeichnis(url) {
  let v = lglVerzeichnisse.get(url);
  if (v) return v;
  v = (async () => {
    const ende = await hoehenHolen(url, -65536);
    if (!ende) return null;
    const dv = new DataView(ende.buffer, ende.byteOffset, ende.byteLength);
    let p = ende.byteLength - 22;
    while (p >= 0 && dv.getUint32(p, true) !== 0x06054b50) p--;
    if (p < 0) throw new Error('Höhendaten: ZIP ohne Verzeichnis');
    const anzahl = dv.getUint16(p + 10, true);
    let q = p - dv.getUint32(p + 12, true);
    if (q < 0) throw new Error('Höhendaten: ZIP-Verzeichnis zu groß');
    const eintraege = [];
    for (let i = 0; i < anzahl; i++) {
      if (dv.getUint32(q, true) !== 0x02014b50) throw new Error('Höhendaten: ZIP-Verzeichnis beschädigt');
      const nl = dv.getUint16(q + 28, true);
      let name = '';
      for (let k = 0; k < nl; k++) name += String.fromCharCode(ende[q + 46 + k]);
      eintraege.push({ name, methode: dv.getUint16(q + 10, true), gepackt: dv.getUint32(q + 20, true),
        roh: dv.getUint32(q + 24, true), ort: dv.getUint32(q + 42, true) });
      q += 46 + nl + dv.getUint16(q + 30, true) + dv.getUint16(q + 32, true);
    }
    if (eintraege.some(x => x.gepackt === 0xFFFFFFFF || x.ort === 0xFFFFFFFF)) throw new Error('Höhendaten: ZIP64 wird nicht gelesen');
    return eintraege;
  })();
  lglVerzeichnisse.set(url, v);
  v.catch(() => lglVerzeichnisse.delete(url));
  while (lglVerzeichnisse.size > 64) lglVerzeichnisse.delete(lglVerzeichnisse.keys().next().value);
  return v;
}

/* Der Server des LGL drosselt jede einzelne Verbindung: Am 13.10.2026 kamen
 * 3 MB über den Worker im Browser am Stück in 6–9 s, in 8 Stücken parallel in
 * 2,2 s (aus PowerShell mal 0,8 s, mal 11 s). Deshalb in Stücken. */
const LGL_STUECK = 384 * 1024, LGL_PARALLEL = 8;

/** Ein Eintrag, entpackt. Kopf und Daten in einem Bereich: Das Zusatzfeld im
 *  lokalen Kopf kann länger sein als im Verzeichnis, 1 kB Luft reicht dafür. */
async function zipEintrag(url, e) {
  const laenge = 30 + 1024 + e.gepackt;
  const roh = new Uint8Array(laenge);
  const stuecke = Array.from({ length: Math.ceil(laenge / LGL_STUECK) }, (_, i) => i * LGL_STUECK);
  let ende = laenge;      // am Dateiende liefert der Server weniger als erbeten
  await hoehenParallel(stuecke, LGL_PARALLEL, async von => {
    const b = await hoehenHolen(url, e.ort + von, Math.min(LGL_STUECK, laenge - von));
    if (!b) throw new Error('Höhendaten: ZIP-Datei verschwunden');
    roh.set(b, von);
    if (b.byteLength < Math.min(LGL_STUECK, laenge - von)) ende = Math.min(ende, von + b.byteLength);
  });
  const dv = new DataView(roh.buffer, roh.byteOffset, roh.byteLength);
  if (dv.getUint32(0, true) !== 0x04034b50) throw new Error('Höhendaten: ZIP-Eintrag beschädigt');
  const start = 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
  if (start + e.gepackt > ende) throw new Error('Höhendaten: ZIP-Eintrag abgeschnitten');
  const daten = roh.subarray(start, start + e.gepackt);
  if (e.methode === 0) return daten;
  if (e.methode !== 8) throw new Error(`Höhendaten: ZIP-Methode ${e.methode} wird nicht gelesen`);
  const strom = new Blob([daten]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const aus = new Uint8Array(await new Response(strom).arrayBuffer());
  if (aus.byteLength !== e.roh) throw new Error('Höhendaten: ZIP-Eintrag unvollständig entpackt');
  return aus;
}

/** Die Datei eines Kilometers aus dem LGL-Archiv: { daten, stand }; null, wo es
 *  keine gibt. stand ist die Aktualität aus der CSV neben der Datei, also die
 *  Befliegung („2016-04-06" bei Stuttgart) — die Jahreszahl im Dateinamen ist
 *  die der Fortführung (beim DGM dort 2023). Fehlt die CSV oder geht ihr Abruf
 *  schief, bleibt stand leer. */
async function lglDatei(produkt, e, n) {
  const url = lglAdresse(produkt, e, n), p = LGL_PRODUKTE[produkt];
  const liste = await zipVerzeichnis(url);
  if (!liste) return null;
  const muster = endung => new RegExp(`(^|/)${p.datei}_32_${e}_${n}_1_bw[^/]*\\.${endung}$`, 'i');
  const eintrag = liste.find(x => muster(p.endung).test(x.name));
  if (!eintrag) return null;
  const csv = liste.find(x => muster('csv').test(x.name));
  const [daten, stand] = await Promise.all([
    zipEintrag(url, eintrag),
    csv ? zipEintrag(url, csv).then(lglStand, () => '') : ''
  ]);
  return { daten, stand };
}

/** „Aktualitaet" aus der Kachel-CSV des LGL (Semikolon, Kopfzeile). */
function lglStand(bytes) {
  const [kopf, zeile] = new TextDecoder().decode(bytes).split(/\r?\n/);
  const i = (kopf || '').split(';').indexOf('Aktualitaet');
  const wert = i >= 0 && zeile ? zeile.split(';')[i] : '';
  return /^\d{4}-\d\d-\d\d$/.test(wert) ? wert : '';
}

/** XYZ-Text eines Kilometers → Float32Array, Zeile 0 im Norden wie im GeoTIFF.
 *  Jeder Wert kommt an die Stelle, die seine Koordinate nennt — fehlt eine
 *  Zeile, bleibt dort NaN, statt dass alles danach verrutscht. Von Hand statt
 *  mit split: 1 Mio. Zeilen, 29 MB. */
function xyzLesen(text, e, n, npx = 1000) {
  const werte = new Float32Array(npx * npx).fill(NaN);
  const x0 = e * npx, y0 = n * npx + npx - 1;
  const f = [0, 0, 0];
  let feld = 0, wert = 0, teiler = 0, minus = false, ziffern = false;
  for (let i = 0, l = text.length; i <= l; i++) {
    const c = i < l ? text[i] : 10;
    if (c >= 48 && c <= 57) { wert = wert * 10 + c - 48; if (teiler) teiler *= 10; ziffern = true; continue; }
    if (c === 46) { teiler = 1; continue; }
    if (c === 45) { minus = true; continue; }
    if (ziffern) {
      if (feld < 3) f[feld] = (minus ? -wert : wert) / (teiler || 1);
      feld++;
    }
    wert = 0; teiler = 0; minus = false; ziffern = false;
    if (c === 10) {
      if (feld === 3 && f[2] > -1000) {
        const C = Math.floor(f[0]) - x0, R = y0 - Math.floor(f[1]);
        if (C >= 0 && C < npx && R >= 0 && R < npx) werte[R * npx + C] = f[2];
      }
      feld = 0;
    }
  }
  return werte;
}

/** Ein Kilometer DGM1 aus BW als Raster: { werte, stand }; null, wo es keinen
 *  gibt. Im Vorrat liegen die Werte (4 MB), nicht der Text. */
async function lglRaster(art, e, n) {
  const def = HOEHEN_ARTEN[art], schluessel = `${art}/${e}_${n}`;
  const imVorrat = await vorratLesen(schluessel);
  if (imVorrat) {
    return { werte: new Float32Array(imVorrat.buffer, imVorrat.byteOffset, imVorrat.byteLength / 4), stand: imVorrat.stand };
  }
  const datei = await lglDatei(def.lgl, e, n);
  if (!datei) return null;
  const werte = xyzLesen(datei.daten, e, n, def.pixel);
  vorratSchreiben(schluessel, new Uint8Array(werte.buffer), datei.stand);
  return { werte, stand: datei.stand };
}

/* ---- Vorrat auf dem Gerät ----
 * DGM-Kacheln bleiben in IndexedDB: Ein zweites Profil in derselben Gegend ist
 * dann auch nach einem Neustart sofort da, und ohne Netz. Datei und Zeitpunkt
 * der letzten Nutzung liegen getrennt wie bei den KML-Dateien — das Merken der
 * Nutzung schreibt ein paar Byte statt wieder die ganze Kachel. Die am längsten
 * unbenutzten gehen zuerst. Vom DOM wird nichts abgelegt: 13–64 MB je Kachel.
 * Ohne IndexedDB (privates Fenster, gesperrt) geht es eben ohne Vorrat. */
const HOEHEN_DB = 'topovo-hoehen';
/* Hieß bis November 2026 nach dem alten App-Namen. Der Vorrat wird beim ersten
 * Öffnen nebenher herüberkopiert (hoehenUmziehen) und die alte Datenbank danach
 * gelöscht — rund 80–150 MB lädt sonst niemand gern ein zweites Mal. */
const HOEHEN_DB_ALT = 'trackpilot-hoehen';
const HOEHEN_VORRAT_MAX = 40;            // rund 80–150 MB
let hoehenDbVersprechen = null;

function hoehenDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!hoehenDbVersprechen) {
    hoehenDbVersprechen = new Promise(ok => {
      let anfrage;
      try { anfrage = indexedDB.open(HOEHEN_DB, 1); } catch { ok(null); return; }
      anfrage.onupgradeneeded = () => {
        anfrage.result.createObjectStore('dateien');
        anfrage.result.createObjectStore('genutzt');
      };
      anfrage.onsuccess = () => { ok(anfrage.result); hoehenUmziehen(anfrage.result); };
      anfrage.onerror = () => ok(null);
      anfrage.onblocked = () => ok(null);
    });
  }
  return hoehenDbVersprechen;
}

/* Einmaliger Umzug aus der Datenbank unter dem alten Namen, nebenher: Was noch
 * nicht kopiert ist, wird bis dahin eben neu geladen. Je Kachel eine eigene
 * Transaktion, damit nie der ganze Vorrat auf einmal im Speicher liegt. Wie
 * beim KML-Umzug ohne indexedDB.databases(): Gab es die alte Datenbank nicht,
 * entsteht hier eine leere, die gleich wieder gelöscht wird. Bricht der Umzug
 * ab, bleibt der alte Bestand liegen und der nächste Start macht weiter. */
async function hoehenUmziehen(neu) {
  let alt = null;
  const rq = (r) => new Promise((ok, fehl) => { r.onsuccess = () => ok(r.result); r.onerror = () => fehl(r.error); });
  try {
    const anfrage = indexedDB.open(HOEHEN_DB_ALT, 1);
    anfrage.onupgradeneeded = () => {
      anfrage.result.createObjectStore('dateien');
      anfrage.result.createObjectStore('genutzt');
    };
    alt = await rq(anfrage);
    const schluessel = await rq(alt.transaction('dateien').objectStore('dateien').getAllKeys());
    for (const s of schluessel) {
      const lesen = alt.transaction(['dateien', 'genutzt']);
      const [daten, zeit] = await Promise.all([rq(lesen.objectStore('dateien').get(s)), rq(lesen.objectStore('genutzt').get(s))]);
      if (daten === undefined) continue;
      await new Promise((ok, fehl) => {
        const tx = neu.transaction(['dateien', 'genutzt'], 'readwrite');
        // Schon im neuen Vorrat (inzwischen frisch geladen)? Dann gilt der neue.
        const da = tx.objectStore('dateien').getKey(s);
        da.onsuccess = () => {
          if (da.result !== undefined) return;
          tx.objectStore('dateien').put(daten, s);
          tx.objectStore('genutzt').put(zeit || Date.now(), s);
        };
        tx.oncomplete = ok;
        tx.onerror = tx.onabort = () => fehl(tx.error);
      });
    }
    alt.close();
    alt = null;
    indexedDB.deleteDatabase(HOEHEN_DB_ALT);
  } catch {
    if (alt) { try { alt.close(); } catch { /* egal */ } }
  }
}

async function vorratLesen(schluessel) {
  try {
    const db = await hoehenDb();
    if (!db) return null;
    const daten = await new Promise((ok, fehl) => {
      const r = db.transaction('dateien').objectStore('dateien').get(schluessel);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fehl(r.error);
    });
    if (!daten) return null;
    db.transaction('genutzt', 'readwrite').objectStore('genutzt').put(Date.now(), schluessel);
    // Mit Stand abgelegt: { b, stand } — sonst nur die Bytes, wie vor Oktober 2026
    const bytes = new Uint8Array(daten.b || daten);
    bytes.stand = daten.stand || '';
    return bytes;
  } catch {
    return null;
  }
}

async function vorratSchreiben(schluessel, bytes, stand = '') {
  try {
    const db = await hoehenDb();
    if (!db) return;
    await new Promise((ok, fehl) => {
      const tx = db.transaction(['dateien', 'genutzt'], 'readwrite');
      const b = bytes.slice().buffer;
      tx.objectStore('dateien').put(stand ? { b, stand } : b, schluessel);
      tx.objectStore('genutzt').put(Date.now(), schluessel);
      tx.oncomplete = ok;
      tx.onerror = tx.onabort = () => fehl(tx.error);     // auch: Speicher voll
    });
    // Aufräumen: Schlüssel und Zeiten kommen in derselben Reihenfolge zurück
    const tx = db.transaction(['dateien', 'genutzt'], 'readwrite');
    const genutzt = tx.objectStore('genutzt');
    const schluesselListe = genutzt.getAllKeys(), zeiten = genutzt.getAll();
    zeiten.onsuccess = () => {
      const alt = schluesselListe.result.map((s, i) => [s, zeiten.result[i]]).sort((a, b) => a[1] - b[1]);
      for (const [s] of alt.slice(0, Math.max(0, alt.length - HOEHEN_VORRAT_MAX))) {
        genutzt.delete(s);
        tx.objectStore('dateien').delete(s);
      }
    };
  } catch {
    // Kein Platz oder gesperrt: Die Kachel ist trotzdem geladen, nur nicht gemerkt
  }
}

/** Lädt Kopf (und beim DGM die Datei) einer Kachel; null, wenn sie fehlt.
 *  teil: vom DGM nur die nötigen Streifen per Range-Abfrage, wie beim DOM —
 *  für einzelne Höhen, wo eine ganze Kachel von 2–4 MB unverhältnismäßig wäre.
 *  Liegt die ganze Datei schon im Speicher oder im Vorrat, wird die genommen. */
function hoehenKachel(art, e, n, teil = false) {
  const def = HOEHEN_ARTEN[art];
  const voll = `${art}/${e}_${n}`;
  // Aus einem gepackten Archiv geht kein Stück, nur die ganze Datei
  if (def.lgl || (teil && hoehenKacheln.has(voll))) teil = false;
  const schluessel = teil ? `${art}-teil/${e}_${n}` : voll;
  if (hoehenFehlen.has(voll)) return Promise.resolve(null);
  const bekannt = hoehenKacheln.get(schluessel);
  if (bekannt) {
    hoehenKacheln.delete(schluessel);        // nach hinten: zuletzt benutzt
    hoehenKacheln.set(schluessel, bekannt);
    return bekannt;
  }

  const laden = def.lgl && LGL_PRODUKTE[def.lgl].endung === 'xyz' ? (async () => {
    const r = await lglRaster(art, e, n);
    if (!r) { hoehenFehlen.add(voll); return null; }
    // Pixelmitte bei ,50 und Zeile 0 im Norden — wie die bayerischen Kacheln
    if (!def.schema) def.schema = { versatz: 0.5, links: 0, oben: def.pixel - 1 };
    const npx = def.pixel;
    return { schluessel, art, e, n, stand: r.stand, werte: r.werte,
      kopf: { breite: npx, hoehe: npx, bw: npx, bh: npx, quer: 1, dl: 0, dr: 0 } };
  })() : (async () => {
    let lies, anfang, stand = '';
    // Beim teilweisen Lesen zuerst nachsehen, ob die ganze Datei im Vorrat liegt
    const imVorrat = def.ganz ? await vorratLesen(voll) : null;
    if (imVorrat) {
      stand = imVorrat.stand;
      lies = async (von, laenge) => imVorrat.subarray(von, Math.min(von + laenge, imVorrat.byteLength));
    } else if (def.ganz && !teil) {
      // DOM1 aus BW: das GeoTIFF aus dem Archiv, sonst die Datei der BVV
      const geholt = def.lgl ? await lglDatei(def.lgl, e, n) : await hoehenHolen(hoehenAdresse(art, e, n));
      if (!geholt) { hoehenFehlen.add(voll); return null; }   // keine Kachel: außerhalb des Landes
      const datei = def.lgl ? geholt.daten : geholt;
      if (def.lgl) stand = geholt.stand;
      vorratSchreiben(voll, datei, stand);   // im Hintergrund
      lies = async (von, laenge) => datei.subarray(von, Math.min(von + laenge, datei.byteLength));
    } else {
      const url = hoehenAdresse(art, e, n);
      anfang = await hoehenHolen(url, 0, 16384);
      if (!anfang) { hoehenFehlen.add(voll); return null; }
      lies = async (von, laenge) => {
        const b = await hoehenHolen(url, von, laenge);
        if (!b) throw new Error(`Höhendaten: ${schluessel} verschwunden`);
        return b;
      };
    }
    const kopf = await tiffKopf(lies, anfang);

    /* Wo liegt die Kachel im durchgehenden Pixelraster? Spalte C und Zeile R
     * (von Süden gezählt) haben ihre Mitte bei ((C + v)·Auflösung, (R + v)·Auflösung). */
    const res = def.aufloesung, npx = def.pixel;
    if (kopf.breite > npx || kopf.hoehe > npx || Math.abs(kopf.skala[0] - res) > 1e-9 || Math.abs(kopf.skala[1] - res) > 1e-9) {
      throw new Error(`Höhendaten: ${schluessel} hat ein anderes Raster (${kopf.breite} px, ${kopf.skala[0]} m)`);
    }
    /* Alle bisher gesehenen Kacheln (DGM1 und DOM20) haben ihre linke obere
     * Pixelmitte bei (e·1000 + ½ Pixel, n·1000 + 1000 − ½ Pixel). An der
     * Landesgrenze sind sie beschnitten — 573_5361 bei Neu-Ulm ist nur 875 px
     * breit und beginnt 125 m weiter östlich. dl und dr sagen, um wie viele
     * Pixel sie gegenüber einer vollen Kachel versetzt beginnt. */
    const v = kopf.versatz;
    if (v !== 0.5) throw new Error(`Höhendaten: ${schluessel} ist als Punktraster ausgezeichnet`);
    kopf.dl = Math.round(kopf.tie[3] / res - kopf.tie[0]) - e * npx;
    kopf.dr = (npx - 1) - (Math.round(kopf.tie[4] / res + kopf.tie[1] - 2 * v) - n * npx);
    if (kopf.dl < 0 || kopf.dr < 0 || kopf.dl + kopf.breite > npx || kopf.dr + kopf.hoehe > npx) {
      throw new Error(`Höhendaten: ${schluessel} liegt anders im Raster als die übrigen Kacheln`);
    }
    if (!def.schema) def.schema = { versatz: v, links: 0, oben: npx - 1 };
    return { schluessel, art, e, n, kopf, lies, stand };
  })();

  hoehenKacheln.set(schluessel, laden);
  laden.catch(() => hoehenKacheln.delete(schluessel));   // beim nächsten Mal neu versuchen
  while (hoehenKacheln.size > HOEHEN_KACHELN_MAX) hoehenKacheln.delete(hoehenKacheln.keys().next().value);
  return laden;
}

function blockEntpacken(kopf, roh, i) {
  const zeilen = kopf.kacheln ? kopf.bh : Math.min(kopf.bh, kopf.hoehe - i * kopf.bh);
  const soll = kopf.bw * zeilen * 4;
  if (!roh || !roh.length) return new Float32Array(soll / 4).fill(NaN);   // leerer Block
  let bytes = kopf.kompression === 5 ? lzwEntpacken(roh, soll) : roh.slice(0, soll);
  if (kopf.praediktor === 3) {
    /* Gleitkomma-Prädiktor (TIFF Technical Note 3): Je Zeile stehen erst die
     * höchstwertigen Bytes aller Werte, dann die nächsten …, und jedes Byte als
     * Differenz zum vorigen. Aufsummieren, dann wieder zu Werten zusammensetzen —
     * die Ebenen sind unabhängig von der Byte-Reihenfolge der Datei. */
    const w = kopf.bw, zb = w * 4, aus = new Uint8Array(soll);
    for (let o = 0; o < soll; o += zb) {
      for (let i = 1; i < zb; i++) bytes[o + i] = (bytes[o + i] + bytes[o + i - 1]) & 255;
      for (let i = 0; i < w; i++) {
        const p = o + 4 * i;
        aus[p] = bytes[o + 3 * w + i]; aus[p + 1] = bytes[o + 2 * w + i];
        aus[p + 2] = bytes[o + w + i]; aus[p + 3] = bytes[o + i];
      }
    }
    bytes = aus;                                   // jetzt little-endian
  } else if (!kopf.le) {
    for (let p = 0; p < soll; p += 4) {
      let t = bytes[p]; bytes[p] = bytes[p + 3]; bytes[p + 3] = t;
      t = bytes[p + 1]; bytes[p + 1] = bytes[p + 2]; bytes[p + 2] = t;
    }
  }
  const werte = new Float32Array(bytes.buffer, bytes.byteOffset, soll / 4);
  if (!Number.isNaN(kopf.nodata)) for (let p = 0; p < werte.length; p++) if (werte[p] === kopf.nodata) werte[p] = NaN;
  return werte;
}

function blockMerken(schluessel, werte) {
  hoehenBloecke.set(schluessel, werte);
  hoehenBloeckeByte += werte.byteLength;
  for (const [s, w] of hoehenBloecke) {
    if (hoehenBloeckeByte <= HOEHEN_BLOECKE_MAX) break;
    hoehenBloecke.delete(s);
    hoehenBloeckeByte -= w.byteLength;
  }
}

/** Einfache Warteschlange: höchstens n Aufgaben gleichzeitig. */
async function hoehenParallel(liste, n, aufgabe) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, async () => {
    while (i < liste.length) await aufgabe(liste[i++]);
  }));
}

/** Liefert die genannten Blöcke einer Kachel entpackt, als Map Index → Werte.
 *  Beim DOM werden benachbarte Blöcke zu einer Abfrage zusammengelegt. Die
 *  Map hält sie fest, auch wenn der Zwischenspeicher sie für ein langes Profil
 *  schon wieder verwerfen muss. */
async function hoehenBloeckeLaden(kachel, indizes) {
  if (kachel.werte) return new Map([[0, kachel.werte]]);   // BW: die Kachel ist ein Block
  const k = kachel.kopf, raus = new Map(), fehlen = [];
  for (const i of indizes) {
    const da = hoehenBloecke.get(`${kachel.schluessel}#${i}`);
    if (da) raus.set(i, da);
    else fehlen.push(i);
  }
  if (!fehlen.length) return raus;
  fehlen.sort((a, b) => k.offsets[a] - k.offsets[b]);

  const gruppen = [];
  for (const i of fehlen) {
    const von = k.offsets[i], bis = von + k.laengen[i];
    const g = gruppen[gruppen.length - 1];
    if (g && von - g.bis < 65536 && bis - g.von < 4 * 2 ** 20) { g.bis = Math.max(g.bis, bis); g.indizes.push(i); }
    else gruppen.push({ von, bis, indizes: [i] });
  }
  await hoehenParallel(gruppen, 4, async g => {
    const b = g.bis > g.von ? await kachel.lies(g.von, g.bis - g.von) : new Uint8Array(0);
    for (const i of g.indizes) {
      const roh = b.subarray(k.offsets[i] - g.von, k.offsets[i] - g.von + k.laengen[i]);
      const werte = blockEntpacken(k, roh, i);
      blockMerken(`${kachel.schluessel}#${i}`, werte);
      raus.set(i, werte);
    }
  });
  return raus;
}

/* ============================ Abgreifen ============================ */

/** Höhen an UTM-Koordinaten (Float64Array ost, nord). Verfahren „bilinear"
 *  oder „nachbar". Wo es keine Daten gibt (außerhalb der Länder, Lücke), NaN.
 *  teil: vom DGM nur die nötigen Streifen holen (siehe hoehenKachel).
 *  quellen: ein Set, in das die Länder kommen, deren Werte verwendet wurden.
 *
 *  Erst die Art selbst, dann für die Punkte ohne Wert die nächste (weiter) —
 *  so füllt BW auch den Streifen an der Grenze, auf dem die bayerische Kachel
 *  schon liegt, aber nur NoData trägt. Gefragt wird ein Land nur im Rahmen
 *  um sein Gebiet. */
async function hoehenWerte(art, ost, nord, verfahren = 'bilinear', { teil = false, quellen = null, staende = null } = {}) {
  const aus = new Float32Array(ost.length).fill(NaN);
  let offen = Array.from({ length: ost.length }, (_, i) => i);
  for (let a = art; a && offen.length; a = HOEHEN_ARTEN[a].weiter) {
    const land = HOEHEN_ARTEN[a].land;
    const drin = offen.filter(i => inLandRahmen(land, ...utm32Zurueck(ost[i], nord[i])));
    if (!drin.length) continue;
    const w = await hoehenWerteArt(a, Float64Array.from(drin, i => ost[i]), Float64Array.from(drin, i => nord[i]), verfahren, teil, staende);
    let treffer = false;
    drin.forEach((i, j) => { if (Number.isFinite(w[j])) { aus[i] = w[j]; treffer = true; } });
    if (treffer && quellen) quellen.add(land);
    offen = offen.filter(i => !Number.isFinite(aus[i]));
  }
  return aus;
}

/** staende: ein Set für die Aktualität der benutzten Kacheln (nur BW kennt sie). */
async function hoehenWerteArt(art, ost, nord, verfahren, teil, staende = null) {
  const def = HOEHEN_ARTEN[art], res = def.aufloesung, npx = def.pixel;
  const anzahl = ost.length;
  const aus = new Float32Array(anzahl).fill(NaN);
  if (!anzahl) return aus;

  /* Wie das Raster liegt, steht erst im Kopf einer Kachel. */
  if (!def.schema) {
    const versucht = new Set();
    for (let i = 0; i < anzahl && !def.schema && versucht.size < 8; i++) {
      const s = `${Math.floor(ost[i] / 1000)}_${Math.floor(nord[i] / 1000)}`;
      if (versucht.has(s)) continue;
      versucht.add(s);
      await hoehenKachel(art, Math.floor(ost[i] / 1000), Math.floor(nord[i] / 1000), teil);
    }
    if (!def.schema) return aus;
  }
  const { versatz: v, links, oben } = def.schema;
  const ort = (C, R) => {
    const e = Math.floor((C - links) / npx), n = Math.floor((R - oben + npx - 1) / npx);
    return { e, n, c: C - e * npx - links, r: n * npx + oben - R };
  };

  /* Welche Pixel braucht jeder Punkt? Beim bilinearen Abgreifen die vier um
   * ihn herum — die können in der Nachbarkachel liegen. */
  const nachbar = verfahren === 'nachbar';
  const pix = new Int32Array(anzahl * 2);
  const gew = new Float32Array(anzahl * 2);
  for (let i = 0; i < anzahl; i++) {
    const fx = ost[i] / res - v, fy = nord[i] / res - v;
    const C = nachbar ? Math.round(fx) : Math.floor(fx), R = nachbar ? Math.round(fy) : Math.floor(fy);
    pix[2 * i] = C; pix[2 * i + 1] = R;
    gew[2 * i] = fx - C; gew[2 * i + 1] = fy - R;
  }
  const versatz = nachbar ? [[0, 0]] : [[0, 0], [1, 0], [0, 1], [1, 1]];

  const bedarf = new Map();      // Kachel → Set der Blöcke
  for (let i = 0; i < anzahl; i++) {
    for (const [dc, dr] of versatz) {
      const o = ort(pix[2 * i] + dc, pix[2 * i + 1] + dr);
      const s = `${o.e}_${o.n}`;
      if (!bedarf.has(s)) bedarf.set(s, { e: o.e, n: o.n, pixel: [] });
      bedarf.get(s).pixel.push(o.c, o.r);
    }
  }

  const geladen = new Map();     // Kachel → { kopf, bloecke }
  const melden = HOEHEN.fortschritt;
  let fertig = 0;
  if (melden) melden({ kacheln: bedarf.size, fertig });
  await hoehenParallel([...bedarf.values()], 4, async b => {
    const kachel = await hoehenKachel(art, b.e, b.n, teil);
    if (!kachel) { if (melden && HOEHEN.fortschritt === melden) melden({ kacheln: bedarf.size, fertig: ++fertig }); return; }
    const k = kachel.kopf, noetig = new Set();
    for (let j = 0; j < b.pixel.length; j += 2) {
      const c = b.pixel[j] - k.dl, r = b.pixel[j + 1] - k.dr;
      if (c >= 0 && r >= 0 && c < k.breite && r < k.hoehe) noetig.add(Math.floor(r / k.bh) * k.quer + Math.floor(c / k.bw));
    }
    geladen.set(`${b.e}_${b.n}`, { kopf: k, bloecke: await hoehenBloeckeLaden(kachel, noetig) });
    if (staende && kachel.stand && noetig.size) staende.add(kachel.stand);
    if (melden && HOEHEN.fortschritt === melden) melden({ kacheln: bedarf.size, fertig: ++fertig });
  });

  const wert = (C, R) => {
    const o = ort(C, R);
    const g = geladen.get(`${o.e}_${o.n}`);
    if (!g) return NaN;
    const k = g.kopf, c = o.c - k.dl, r = o.r - k.dr;   // in der (womöglich beschnittenen) Datei
    if (c < 0 || r < 0 || c >= k.breite || r >= k.hoehe) return NaN;
    const block = g.bloecke.get(Math.floor(r / k.bh) * k.quer + Math.floor(c / k.bw));
    return block ? block[(r % k.bh) * k.bw + (c % k.bw)] : NaN;
  };

  for (let i = 0; i < anzahl; i++) {
    const C = pix[2 * i], R = pix[2 * i + 1];
    if (nachbar) { aus[i] = wert(C, R); continue; }
    const tx = gew[2 * i], ty = gew[2 * i + 1];
    const w = [wert(C, R), wert(C + 1, R), wert(C, R + 1), wert(C + 1, R + 1)];
    const g = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    if (w.every(Number.isFinite)) aus[i] = w[0] * g[0] + w[1] * g[1] + w[2] * g[2] + w[3] * g[3];
    else {
      // Am Rand einer Lücke: der nächstgelegene gültige Nachbar
      let best = -1;
      for (let j = 0; j < 4; j++) if (Number.isFinite(w[j]) && (best < 0 || g[j] > g[best])) best = j;
      if (best >= 0) aus[i] = w[best];
    }
  }
  return aus;
}

/* Geländehöhe an einem einzelnen Punkt — für das Ergebnis, die Sprechblasen und
 * das Abstecken. Vom DGM kommt nur der Streifen, in dem der Punkt liegt, samt
 * Kopf der Datei: rund 25 kB statt 2–4 MB. Liegt die Kachel schon im Vorrat,
 * kostet es nichts. In BW geht das nicht — aus dem gepackten Archiv kommt nur
 * die ganze Datei des Kilometers, rund 3,4 MB, danach liegt sie im Vorrat.
 * Klar außerhalb beider Länder wird gar nicht erst gefragt. */
const HOEHEN_RAHMEN = {
  by: { s: 47.26, n: 50.57, w: 8.97, o: 13.84 },
  bw: { s: 47.52, n: 49.80, w: 7.50, o: 10.50 }
};

function inLandRahmen(land, lat, lon) {
  const r = HOEHEN_RAHMEN[land];
  return lat >= r.s && lat <= r.n && lon >= r.w && lon <= r.o;
}

function inBayernRahmen(lat, lon) {
  return inLandRahmen('by', lat, lon);
}

/** Gibt es hier überhaupt ein Land mit Höhendaten? */
function inHoehenRahmen(lat, lon) {
  return Object.keys(HOEHEN_RAHMEN).some(land => inLandRahmen(land, lat, lon));
}

/** Höhe am Punkt; mit quellen wie bei hoehenWerte. */
async function hoehenPunkt(lat, lon, quellen = null) {
  if (!inHoehenRahmen(lat, lon)) return NaN;
  const [e, n] = utm32Hin(lat, lon);
  return (await hoehenWerte('dgm1', Float64Array.of(e), Float64Array.of(n), 'bilinear', { teil: true, quellen }))[0];
}

/** Profil entlang eines Linienzugs [[lat, lon], …].
 *  Stützpunkte gleichmäßig je Abschnitt, höchstens maxPunkte insgesamt. */
async function hoehenProfil(punkte, art, { abstand, maxPunkte = 8000 } = {}) {
  if (!punkte || punkte.length < 2) return null;
  const utm = punkte.map(p => utm32Hin(p[0], p[1]));
  const laengen = [];
  let gesamt = 0;
  for (let i = 1; i < punkte.length; i++) {
    const l = ellipsoidAbstand(punkte[i - 1], punkte[i]);
    laengen.push(l);
    gesamt += l;
  }
  let schritt = abstand || HOEHEN_ARTEN[art].aufloesung;
  if (gesamt / schritt > maxPunkte) schritt = gesamt / maxPunkte;

  const station = [], ost = [], nord = [], ecken = [0];
  let s0 = 0;
  laengen.forEach((L, i) => {
    const stuecke = Math.max(1, Math.ceil(L / schritt));
    for (let j = i ? 1 : 0; j <= stuecke; j++) {     // Eckpunkt nur einmal
      const t = j / stuecke;
      station.push(s0 + t * L);
      ost.push(utm[i][0] + t * (utm[i + 1][0] - utm[i][0]));
      nord.push(utm[i][1] + t * (utm[i + 1][1] - utm[i][1]));
    }
    s0 += L;
    ecken.push(s0);
  });

  const vorher = HOEHEN.geladen;
  const ostF = Float64Array.from(ost), nordF = Float64Array.from(nord);
  const quellen = new Set(), staende = new Set();
  const hoehe = await hoehenWerte(art, ostF, nordF, 'bilinear', { quellen, staende });
  return { art, station: Float64Array.from(station), ost: ostF, nord: nordF, hoehe, ecken,
    laenge: gesamt, schritt, geladen: HOEHEN.geladen - vorher, quellen: [...quellen], staende: [...staende].sort() };
}

// Für die Prüfung unter Node (werkzeug/hoehen-pruefen.mjs); im Browser ohne Wirkung
if (typeof module === 'object' && module.exports) {
  module.exports = { HOEHEN, HOEHEN_ARTEN, utm32Hin, utm32Zurueck, ellipsoidAbstand,
    lzwEntpacken, tiffKopf, hoehenKachel, hoehenWerte, hoehenWerteArt, hoehenPunkt, hoehenProfil,
    LGL_PRODUKTE, lglAdresse, zipVerzeichnis, lglDatei, xyzLesen, inHoehenRahmen, inLandRahmen, hoehenFehlen };
}
