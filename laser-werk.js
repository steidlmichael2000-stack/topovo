/* Topovo — Laserpunkte im Hintergrund laden und ausschneiden
 *
 * Läuft als klassischer Worker (app.js, laserWerk). Die BVV gibt die
 * Laserpunkte als LAZ-Kacheln zu 1 × 1 km heraus (geodaten.bayern.de/odd_data/
 * laser/, CC BY 4.0). Am 04.11.2026 nachgesehen: LAS 1.2, Punktformat 1 (ohne
 * Farbe), nicht als COPC und in Fluglinien-Reihenfolge — für jeden Ausschnitt
 * muss deshalb die ganze Kachel geladen werden, 58–255 MB im Landkreis
 * Neustadt/Aisch, laut BVV bis 1 GB. Sie kommt Stück für Stück direkt in den
 * Speicher von laz-perf; entpackt wird Punkt für Punkt, behalten nur, was im
 * Ausschnitt liegt.
 *
 * Geladene Kacheln bleiben gepackt im Speicher (vorrat), solange die App den
 * Worker hält — ein anderer Ausschnitt daraus kostet dann nur das Entpacken.
 * Wird es mehr als vorratMax, fliegt die am längsten nicht gebrauchte Kachel
 * heraus, nie eine des laufenden Auftrags.
 *
 * laz-perf (Apache 2.0) steckt in der Bündelung von copc.js (MIT), wie im
 * PW-Viewer: vendor/copc/.
 *
 * Auftrag { kacheln: [{ kachel, url }], bereich: { e0, n0, e1, n1 }, max,
 * nurBoden, vorratMax } → Meldungen
 *   { art: 'laden', nr, von, geladen, gesamt }   beim Herunterladen (nr von von Kacheln)
 *   { art: 'lesen', nr, von, gelesen, gesamt }   beim Entpacken
 *   { art: 'normalen', fertig, gesamt }          beim Rechnen der Normalen
 *   { art: 'vorrat', kacheln }                   welche Kacheln gerade im Speicher liegen
 *   { art: 'fertig', … }                         Punkte relativ zur Mitte des Ausschnitts
 *   { art: 'fehler', text }
 *   { art: 'abgebrochen' }
 *
 * { art: 'abbrechen' } bricht den laufenden Auftrag ab: das Herunterladen über
 * den AbortController, das Entpacken an der nächsten Pause (alle 2^20 Punkte
 * gibt die Schleife den Faden kurz frei, sonst käme die Nachricht gar nicht an).
 * Fertig geladene Kacheln bleiben im Vorrat.
 */
importScripts('vendor/copc/copc.js');

// Boden im Sinne der BVV: Boden, Gewässer, abgeleiteter Boden (Klassen 2, 9, 23, 24)
const BODEN = new Set([2, 9, 23, 24]);

let lazPerf = null;
let abbruch = null;             // AbortController des laufenden Auftrags
const ABGEBROCHEN = 'abgebrochen';
const vorrat = new Map();       // Kachel → { zeiger, groesse }, in der Reihenfolge der Nutzung

function vorratMelden() {
  self.postMessage({ art: 'vorrat', kacheln: [...vorrat.keys()] });
}

/** Platz für bedarf Byte schaffen; die Kacheln in behalten bleiben. */
function platzMachen(LP, bedarf, behalten, vorratMax) {
  let summe = bedarf;
  for (const v of vorrat.values()) summe += v.groesse;
  for (const [k, v] of vorrat) {
    if (summe <= vorratMax) break;
    if (behalten.has(k)) continue;
    LP._free(v.zeiger);
    vorrat.delete(k);
    summe -= v.groesse;
  }
}

/** Lädt eine Kachel in den Speicher von laz-perf; null, wenn es sie nicht gibt. */
async function herunterladen(LP, url, melden, behalten, vorratMax) {
  // Nie in den HTTP-Zwischenspeicher des Browsers: der läge auf dem Gerät
  const r = await fetch(url, { cache: 'no-store', signal: abbruch.signal });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Laserkachel: HTTP ${r.status}`);
  if (!r.body) throw new Error('Laserkachel: keine Daten');
  const gesamt = Number(r.headers.get('Content-Length')) || 0;
  const leser = r.body.getReader();
  if (!gesamt) return ohneLaenge(LP, leser, melden, behalten, vorratMax);
  platzMachen(LP, gesamt, behalten, vorratMax);
  /* Gleich in den Speicher von laz-perf, ohne Umweg über einen zweiten Puffer
   * derselben Größe. HEAPU8 neu holen: Wächst der Speicher, ist es ein anderes. */
  const zeiger = LP._malloc(gesamt);
  if (!zeiger) throw new Error('Zu wenig Speicher — einen kleineren Ausschnitt oder weniger Kacheln wählen.');
  let o = 0, gemeldet = 0;
  for (;;) {
    let stueck;
    try { stueck = await leser.read(); } catch (err) { LP._free(zeiger); throw err; }
    const { done, value } = stueck;
    if (done) break;
    const n = Math.min(value.byteLength, gesamt - o);
    LP.HEAPU8.set(value.subarray(0, n), zeiger + o);
    o += n;
    if (o - gemeldet > 1 << 20 || o === gesamt) {
      gemeldet = o;
      melden(o, gesamt);
    }
  }
  if (o !== gesamt) { LP._free(zeiger); throw new Error('Laserkachel unvollständig geladen.'); }
  return { zeiger, groesse: gesamt };
}

/* Rückfall ohne Content-Length (gzip unterwegs, siehe worker.js): erst in
 * Stücken sammeln, dann am Stück in den Speicher von laz-perf — kurz doppelt
 * so viel Speicher, aber es läuft. */
async function ohneLaenge(LP, leser, melden, behalten, vorratMax) {
  const teile = [];
  let o = 0, gemeldet = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    teile.push(value);
    o += value.byteLength;
    if (o - gemeldet > 1 << 20) { gemeldet = o; melden(o, 0); }
  }
  platzMachen(LP, o, behalten, vorratMax);
  const zeiger = LP._malloc(o);
  if (!zeiger) throw new Error('Zu wenig Speicher — einen kleineren Ausschnitt oder weniger Kacheln wählen.');
  let p = 0;
  for (const t of teile) { LP.HEAPU8.set(t, zeiger + p); p += t.byteLength; }
  melden(o, o);
  return { zeiger, groesse: o };
}

/** Der Kopf einer LAS-Datei (1.0–1.4), soweit hier gebraucht. */
function kopfLesen(b) {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'LASF') throw new Error('Keine LAS-Datei');
  return {
    format: b[104] & 0x3f, laenge: d.getUint16(105, true),
    anzahl: d.getUint32(107, true) || Number(d.getBigUint64(247, true)),
    skala: [d.getFloat64(131, true), d.getFloat64(139, true), d.getFloat64(147, true)],
    versatz: [d.getFloat64(155, true), d.getFloat64(163, true), d.getFloat64(171, true)],
    max: [d.getFloat64(179, true), d.getFloat64(195, true), d.getFloat64(211, true)],
    min: [d.getFloat64(187, true), d.getFloat64(203, true), d.getFloat64(219, true)]
  };
}

async function ausschneiden({ kacheln, bereich, max, nurBoden, vorratMax }) {
  if (!lazPerf) lazPerf = await Copc.Las.PointData.createLazPerf({ locateFile: f => 'vendor/copc/' + f });
  const LP = lazPerf;
  const von = kacheln.length, behalten = new Set(kacheln.map(k => k.kachel));

  // Erst alle Kacheln da haben, eine nach der anderen
  const da = [], fehlen = [];
  for (let i = 0; i < von; i++) {
    const { kachel, url } = kacheln[i];
    let v = vorrat.get(kachel);
    if (v) vorrat.delete(kachel);               // nach hinten: zuletzt benutzt
    else {
      v = await herunterladen(LP, url, (geladen, gesamt) =>
        self.postMessage({ art: 'laden', nr: i, von, geladen, gesamt }), behalten, vorratMax);
      if (!v) { fehlen.push(kachel); continue; }
    }
    vorrat.set(kachel, v);
    vorratMelden();
    da.push({ kachel, ...v, kopf: kopfLesen(LP.HEAPU8.subarray(v.zeiger, v.zeiger + 375)) });
  }
  if (!da.length) throw new Error('Für diese Stelle gibt es keine Laserkachel.');

  /* Wie viele Punkte liegen etwa im Ausschnitt? Danach die Ausdünnung, damit
   * es höchstens rund max werden — gleichmäßig, jeder schritt-te Punkt. Beim
   * Boden allein grob die Hälfte (gezählt wird beim Lesen nur, was passt). */
  const { e0, n0, e1, n1 } = bereich;
  let erwartet = 0;
  for (const { kopf: k } of da) {
    const flaeche = Math.max(1, (k.max[0] - k.min[0]) * (k.max[1] - k.min[1]));
    const ueber = Math.max(0, Math.min(e1, k.max[0]) - Math.max(e0, k.min[0])) * Math.max(0, Math.min(n1, k.max[1]) - Math.max(n0, k.min[1]));
    erwartet += k.anzahl * Math.min(1, ueber / flaeche) * (nurBoden ? 0.5 : 1);
  }
  const schritt = Math.max(1, Math.ceil(erwartet / max));
  const ce = (e0 + e1) / 2, cn = (n0 + n1) / 2;

  let platz = Math.ceil(erwartet / schritt * 1.3) + 1024;
  let xyz = new Float32Array(platz * 3), klasse = new Uint8Array(platz), staerke = new Uint16Array(platz);
  const klassen = new Map();
  let n = 0, drin = 0, zMin = Infinity, zMax = -Infinity, iMax = 0;
  const punkt = LP._malloc(64);
  try {
    for (let t = 0; t < da.length; t++) {
      const { zeiger, groesse, kopf: k } = da[t];
      const laszip = new LP.LASZip();
      try {
        laszip.open(zeiger, groesse);
        const anzahl = laszip.getCount();
        const [sx, sy, sz] = k.skala, [ox, oy, oz] = k.versatz;
        // Ganzzahlige Grenzen: der Vergleich je Punkt ohne Umrechnung
        const X0 = (e0 - ox) / sx, X1 = (e1 - ox) / sx, Y0 = (n0 - oy) / sy, Y1 = (n1 - oy) / sy;
        let puffer = null, d = null;
        for (let i = 0; i < anzahl; i++) {
          laszip.getPoint(punkt);
          if (puffer !== LP.HEAPU8.buffer) { puffer = LP.HEAPU8.buffer; d = new DataView(puffer, punkt, k.laenge); }
          if ((i & 0xfffff) === 0) {
            self.postMessage({ art: 'lesen', nr: t, von: da.length, gelesen: i, gesamt: anzahl });
            await new Promise(r => setTimeout(r));          // Nachrichten (Abbrechen) durchlassen
            if (abbruch.signal.aborted) throw new Error(ABGEBROCHEN);
          }
          const X = d.getInt32(0, true), Y = d.getInt32(4, true);
          if (X < X0 || X > X1 || Y < Y0 || Y > Y1) continue;
          // Formate 0–5: Klasse in den unteren 5 Bit von Byte 15; ab 6 ein ganzes Byte 16
          const kl = k.format >= 6 ? d.getUint8(16) : d.getUint8(15) & 31;
          if (nurBoden && !BODEN.has(kl)) continue;
          if (drin++ % schritt) continue;
          if (n === platz) {
            platz *= 2;
            const a = new Float32Array(platz * 3); a.set(xyz); xyz = a;
            const b = new Uint8Array(platz); b.set(klasse); klasse = b;
            const c = new Uint16Array(platz); c.set(staerke); staerke = c;
          }
          const z = d.getInt32(8, true) * sz + oz;
          xyz[3 * n] = X * sx + ox - ce; xyz[3 * n + 1] = Y * sy + oy - cn; xyz[3 * n + 2] = z;
          klasse[n] = kl;
          staerke[n] = d.getUint16(12, true);
          klassen.set(kl, (klassen.get(kl) || 0) + 1);
          if (z < zMin) zMin = z;
          if (z > zMax) zMax = z;
          if (staerke[n] > iMax) iMax = staerke[n];
          n++;
        }
      } finally {
        laszip.delete();
      }
    }
  } finally {
    LP._free(punkt);
  }
  if (!n) throw new Error('Im Ausschnitt liegen keine Laserpunkte.');
  // Höhen relativ zum tiefsten Punkt — Float32 reicht dann auf den Millimeter
  for (let j = 0; j < n; j++) xyz[3 * j + 2] -= zMin;
  /* Umkreis für die Normalen nach der Dichte: rund ein Dutzend Nachbarn, bei
   * voller Dichte (7–10 Punkte je m²) 0,8 m, ausgedünnt entsprechend mehr. */
  const dichte = n / Math.max(1, (e1 - e0) * (n1 - n0));
  const normalen = normalenRechnen(xyz, n, Math.max(0.8, Math.sqrt(12 / (Math.PI * dichte))));
  const ergebnis = {
    art: 'fertig', anzahl: n, schritt, fehlen,
    mitte: [ce, cn], zMin, zMax, iMax,
    xyz: xyz.slice(0, n * 3), klasse: klasse.slice(0, n), staerke: staerke.slice(0, n), normalen,
    klassen: [...klassen].sort((a, b) => a[0] - b[0])
  };
  self.postMessage(ergebnis, [ergebnis.xyz.buffer, ergebnis.klasse.buffer, ergebnis.staerke.buffer, normalen.buffer]);
}

/* Normalen je Punkt: Hauptachsen der Nachbarn im Umkreis r (Kovarianz, die
 * Richtung mit der kleinsten Streuung). Die Nachbarn kommen aus einem Gitter
 * mit Zellen der Größe r in der Ebene — bei Laserdaten liegt fast alles in
 * 2,5 D, und neun Zellen reichen. Ausgerichtet nach oben; als Int8 (×127),
 * damit 1,5 Mio. Punkte 4,5 MB brauchen statt 18. */
function normalenRechnen(xyz, n, r = 0.8) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xyz[3 * i], y = xyz[3 * i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / r) + 1), ny = Math.max(1, Math.ceil((y1 - y0) / r) + 1);
  const zelleVon = i => Math.floor((xyz[3 * i + 1] - y0) / r) * nx + Math.floor((xyz[3 * i] - x0) / r);
  // Zählsortierung der Punkte nach Zelle
  const start = new Uint32Array(nx * ny + 1);
  for (let i = 0; i < n; i++) start[zelleVon(i) + 1]++;
  for (let c = 0; c < nx * ny; c++) start[c + 1] += start[c];
  const pos = start.slice(0, nx * ny), folge = new Uint32Array(n);
  for (let i = 0; i < n; i++) folge[pos[zelleVon(i)]++] = i;

  const aus = new Int8Array(n * 3), r2 = r * r;
  for (let i = 0; i < n; i++) {
    const px = xyz[3 * i], py = xyz[3 * i + 1], pz = xyz[3 * i + 2];
    const cx = Math.floor((px - x0) / r), cy = Math.floor((py - y0) / r);
    let k = 0, sx = 0, sy = 0, sz = 0, xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(ny - 1, cy + 1); gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(nx - 1, cx + 1); gx++) {
        const c = gy * nx + gx;
        for (let j = start[c]; j < start[c + 1]; j++) {
          const q = folge[j];
          const dx = xyz[3 * q] - px, dy = xyz[3 * q + 1] - py, dz = xyz[3 * q + 2] - pz;
          if (dx * dx + dy * dy + dz * dz > r2) continue;
          k++; sx += dx; sy += dy; sz += dz;
          xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz;
        }
      }
    }
    let ox = 0, oy = 0, oz = 1;
    if (k >= 4) {
      const mx = sx / k, my = sy / k, mz = sz / k;
      const a = xx / k - mx * mx, b = xy / k - mx * my, c = xz / k - mx * mz;
      const d = yy / k - my * my, e = yz / k - my * mz, f = zz / k - mz * mz;
      [ox, oy, oz] = kleinsteAchse(a, b, c, d, e, f);
      if (oz < 0) { ox = -ox; oy = -oy; oz = -oz; }
    }
    aus[3 * i] = Math.round(ox * 127); aus[3 * i + 1] = Math.round(oy * 127); aus[3 * i + 2] = Math.round(oz * 127);
    if ((i & 0x3ffff) === 0) self.postMessage({ art: 'normalen', fertig: i, gesamt: n });
  }
  return aus;
}

/** Eigenvektor zum kleinsten Eigenwert der symmetrischen Matrix
 *  [[a b c] [b d e] [c e f]] — Eigenwerte geschlossen (trigonometrisch),
 *  der Vektor als größtes Kreuzprodukt zweier Zeilen von (M − λI). */
function kleinsteAchse(a, b, c, d, e, f) {
  const p1 = b * b + c * c + e * e;
  let lam;
  if (p1 < 1e-18) lam = Math.min(a, d, f);
  else {
    const q = (a + d + f) / 3;
    const p2 = (a - q) ** 2 + (d - q) ** 2 + (f - q) ** 2 + 2 * p1, p = Math.sqrt(p2 / 6);
    const B = [(a - q) / p, b / p, c / p, (d - q) / p, e / p, (f - q) / p];
    const det = B[0] * (B[3] * B[5] - B[4] * B[4]) - B[1] * (B[1] * B[5] - B[4] * B[2]) + B[2] * (B[1] * B[4] - B[3] * B[2]);
    const phi = Math.acos(Math.max(-1, Math.min(1, det / 2))) / 3;
    lam = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3);    // der kleinste
  }
  const r0 = [a - lam, b, c], r1 = [b, d - lam, e], r2 = [c, e, f - lam];
  const kreuz = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  let best = [0, 0, 1], bl = 0;
  for (const v of [kreuz(r0, r1), kreuz(r0, r2), kreuz(r1, r2)]) {
    const l = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    if (l > bl) { bl = l; best = v; }
  }
  const l = Math.sqrt(bl) || 1;
  return [best[0] / l, best[1] / l, best[2] / l];
}

self.onmessage = async ev => {
  if (ev.data.art === 'abbrechen') { if (abbruch) abbruch.abort(); return; }
  abbruch = new AbortController();
  try {
    await ausschneiden(ev.data);
  } catch (err) {
    if (abbruch.signal.aborted) self.postMessage({ art: 'abgebrochen' });
    else self.postMessage({ art: 'fehler', text: String(err && err.message || err) });
  } finally {
    abbruch = null;
  }
};
