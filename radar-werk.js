/* Topovo — Regenradar im Hintergrund
 *
 * Läuft als Modul-Worker (app.js, radarWerk). Zwei Aufgaben, beide zu schwer
 * für den Hauptfaden, solange der Nutzer am Zeitregler zieht:
 *
 * 1. Die GeoTIFFs des DWD lesen (WCS, Float32, Deflate, gekachelt). Werte in
 *    mm je 5 Minuten; Lücken (-999, 4294967296) werden zu 0.
 * 2. Zwischen zwei Zeitpunkten schätzen, wohin der Regen zieht. Daraus
 *    rechnet der Shader in app.js die Bilder dazwischen: Die Flächen wandern,
 *    statt an der alten Stelle zu verblassen und an der neuen aufzutauchen.
 *
 * Die Funktionen sind exportiert, damit werkzeug/radar-pruefen.mjs sie unter
 * Node prüfen kann.
 */

const FUENF_MIN = 5 * 60000;

/* ---------- GeoTIFF ---------- */

const TYP_GROESSE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

async function entpacken(bytes) {
  const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(strom).arrayBuffer());
}

/** Liefert { w, h, werte, x0, yOben, dx, dy } — Lage in EPSG:3857, Ecke links oben. */
export async function tiffLesen(puffer) {
  const dv = new DataView(puffer);
  const bo = dv.getUint16(0);
  if (bo !== 0x4949 && bo !== 0x4d4d) throw new Error('kein TIFF');
  const le = bo === 0x4949;
  if (dv.getUint16(2, le) !== 42) throw new Error('kein klassisches TIFF');
  const ifd = dv.getUint32(4, le);
  const anzahl = dv.getUint16(ifd, le);
  const tag = {};
  for (let k = 0; k < anzahl; k++) {
    const e = ifd + 2 + k * 12;
    const id = dv.getUint16(e, le), typ = dv.getUint16(e + 2, le), n = dv.getUint32(e + 4, le);
    if (id === 42113 || typ === 2) continue;     // Texte braucht es nicht
    const gr = TYP_GROESSE[typ] || 1;
    const off = n * gr <= 4 ? e + 8 : dv.getUint32(e + 8, le);
    const liste = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = off + i * gr;
      liste[i] = typ === 3 ? dv.getUint16(o, le) : typ === 4 ? dv.getUint32(o, le)
        : typ === 12 ? dv.getFloat64(o, le) : typ === 11 ? dv.getFloat32(o, le)
        : typ === 5 ? dv.getUint32(o, le) / dv.getUint32(o + 4, le) : dv.getUint8(o);
    }
    tag[id] = liste;
  }

  const w = tag[256][0], h = tag[257][0];
  const komp = tag[259] ? tag[259][0] : 1;
  // Float32 vom Radar, Float64 vom Modell (ICON-EU)
  const bits = (tag[258] || [0])[0];
  if ((bits !== 32 && bits !== 64) || (tag[339] || [1])[0] !== 3) throw new Error('keine Gleitkommawerte');
  const bps = bits / 8;
  if ((tag[277] || [1])[0] !== 1) throw new Error('mehr als ein Kanal');
  if ((tag[317] || [1])[0] !== 1) throw new Error('Predictor nicht unterstützt');
  if (komp !== 1 && komp !== 8 && komp !== 32946) throw new Error('Kompression ' + komp);

  const gekachelt = !!tag[322];
  const bw = gekachelt ? tag[322][0] : w;
  const bh = gekachelt ? tag[323][0] : (tag[278] || [h])[0];
  const offs = gekachelt ? tag[324] : tag[273];
  const laengen = gekachelt ? tag[325] : tag[279];
  const quer = Math.ceil(w / bw);

  const werte = new Float32Array(w * h);
  const roh = new Uint8Array(puffer);
  await Promise.all(offs.map(async (o, b) => {
    let bytes = roh.subarray(o, o + laengen[b]);
    if (komp !== 1) bytes = await entpacken(bytes);
    const bdv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const bx = (b % quer) * bw, by = Math.floor(b / quer) * bh;
    const zeilen = Math.min(bh, h - by), spalten = Math.min(bw, w - bx);
    for (let y = 0; y < zeilen; y++) {
      const ziel = (by + y) * w + bx, quelle = y * bw * bps;
      for (let x = 0; x < spalten; x++) {
        const v = bps === 8 ? bdv.getFloat64(quelle + x * 8, le) : bdv.getFloat32(quelle + x * 4, le);
        werte[ziel + x] = v > 0 && v < 1e6 ? v : 0;
      }
    }
  }));

  let x0, yOben, dx, dy;
  if (tag[34264]) {
    const m = tag[34264];
    if (m[1] || m[4]) throw new Error('gedrehtes Raster');
    [dx, x0, dy, yOben] = [m[0], m[3], -m[5], m[7]];
  } else if (tag[33550] && tag[33922]) {
    const [sx, sy] = tag[33550], t = tag[33922];
    [dx, dy, x0, yOben] = [sx, sy, t[3] - t[0] * sx, t[4] + t[1] * sy];
  } else {
    throw new Error('keine Lageangabe');
  }
  return { w, h, werte, x0, yOben, dx, dy };
}

/* ---------- Modell ---------- */

const ERDE = 6378137;

/** Das Modell (ICON-EU, Grad, rund 7 km je Zelle, mm in der Stunde) auf das
 *  Raster des Radars umrechnen: bilinear, damit die Stufenlinien nicht als
 *  Treppe aus 7-km-Kästchen erscheinen, und in mm je 5 Minuten wie das Radar
 *  (der Shader rechnet × 12 auf mm/h). Außerhalb des Modells 0. */
export function modellUmrechnen(m, ziel) {
  const aus = new Float32Array(ziel.w * ziel.h);
  for (let j = 0; j < ziel.h; j++) {
    const Y = ziel.yOben - (j + 0.5) * ziel.dy;
    const lat = (2 * Math.atan(Math.exp(Y / ERDE)) - Math.PI / 2) * 180 / Math.PI;
    const fy = (m.yOben - lat) / m.dy - 0.5;
    const y0 = Math.floor(fy), ty = fy - y0;
    if (y0 < -1 || y0 >= m.h) continue;
    for (let i = 0; i < ziel.w; i++) {
      const lon = (ziel.x0 + (i + 0.5) * ziel.dx) / ERDE * 180 / Math.PI;
      const fx = (lon - m.x0) / m.dx - 0.5;
      const x0 = Math.floor(fx), tx = fx - x0;
      if (x0 < -1 || x0 >= m.w) continue;
      const wert = (x, y) => m.werte[Math.min(m.h - 1, Math.max(0, y)) * m.w + Math.min(m.w - 1, Math.max(0, x))];
      const v = (wert(x0, y0) * (1 - tx) + wert(x0 + 1, y0) * tx) * (1 - ty) +
        (wert(x0, y0 + 1) * (1 - tx) + wert(x0 + 1, y0 + 1) * tx) * ty;
      aus[j * ziel.w + i] = v / 12;
    }
  }
  return aus;
}

async function modellNehmen(m) {
  const meinSatz = m.satz;
  try {
    const g = await tiffLesen(m.puffer);
    if (meinSatz !== satz) return;
    const z = m.geo;
    const werte = modellUmrechnen(g, z);
    // Nicht in bilder: Zwischen Modellstunden wird überblendet, keine Bewegung geschätzt
    self.postMessage({ art: 'bild', satz, t: m.t, ref: m.ref, lauf: m.lauf, modell: true,
      w: z.w, h: z.h, x0: z.x0, yOben: z.yOben, dx: z.dx, dy: z.dy, werte }, [werte.buffer]);
  } catch (err) {
    if (meinSatz === satz) self.postMessage({ art: 'fehler', satz, t: m.t, text: String(err && err.message || err) });
  }
}

/* ---------- Bewegung ---------- */

const FLUSS_RASTER = 100;     // so viele Zellen höchstens je Richtung für die Suche
const BLOCK_ABSTAND = 4;      // Abstand der Blockmitten, in Suchzellen (gerade Zahl)
const BLOCK_HALB = 5;         // halbe Fensterbreite: 10 × 10 Zellen
const SUCHWEITE_M = 15000;    // in 5 Minuten höchstens so weit (Mercator-Meter, rund 140 km/h)
/* Keine Strafe für weite Wege, nur bei Gleichstand gewinnt der kürzere. Mit
 * einer Strafe von 0,003 je Zelle und Quadrat der Verschiebung wurde eine
 * Verschiebung von (4, −3) Zellen als (0,65, −0,35) gefunden, mit 0,0002 noch
 * als (3,74, −2,64): Schwacher Regen ist so glatt, dass die Strafe den
 * Ausschlag gab. */

/** Werte als log(1 + mm/h), auf ein Raster ≤ FLUSS_RASTER gemittelt. */
function verkleinern(werte, w, h, s, fw, fh) {
  const aus = new Float32Array(fw * fh), anz = new Uint16Array(fw * fh);
  for (let y = 0; y < h; y++) {
    const zy = Math.floor(y / s) * fw;
    for (let x = 0; x < w; x++) {
      const i = zy + Math.floor(x / s);
      aus[i] += Math.log1p(werte[y * w + x] * 12);
      anz[i]++;
    }
  }
  for (let i = 0; i < aus.length; i++) if (anz[i]) aus[i] /= anz[i];
  return aus;
}

/** Verschiebung von a nach b je Block, in Zellen von a/b.
 *  Liefert { fw, fh, s, fluss } — fluss interleaved (x, y), Blockmitte i bei
 *  ((i + 0.5) · s) Zellen; s = Zellen je Block. */
export function flussRechnen(a, b, w, h, zelleM) {
  const s = Math.max(1, Math.ceil(Math.max(w, h) / FLUSS_RASTER));
  const fw = Math.ceil(w / s), fh = Math.ceil(h / s);
  const A = verkleinern(a, w, h, s, fw, fh), B = verkleinern(b, w, h, s, fw, fh);
  const r = Math.max(1, Math.min(8, Math.ceil(SUCHWEITE_M / (s * zelleM))));
  const S = BLOCK_ABSTAND, H = BLOCK_HALB;
  const nx = Math.ceil(fw / S), ny = Math.ceil(fh / S);
  const vx = new Float32Array(nx * ny), vy = new Float32Array(nx * ny), gew = new Float32Array(nx * ny);
  const seite = 2 * r + 1, kosten = new Float32Array(seite * seite);
  const bWert = (x, y) => (x < 0 || y < 0 || x >= fw || y >= fh) ? 0 : B[y * fw + x];

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = (i + 0.5) * S, cy = (j + 0.5) * S;
      const x0 = Math.max(0, cx - H), x1 = Math.min(fw, cx + H);
      const y0 = Math.max(0, cy - H), y1 = Math.min(fh, cy + H);
      let sa = 0, sb = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sa += A[y * fw + x]; sb += B[y * fw + x]; }
      if (sa < 0.05 || sb < 0.05) continue;     // kein Regen, nichts zu verfolgen
      let best = Infinity, bi = 0, bd = 0, summe = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          let c = 0;
          for (let y = y0; y < y1; y++) {
            const za = y * fw;
            for (let x = x0; x < x1; x++) c += Math.abs(A[za + x] - bWert(x + dx, y + dy));
          }
          const k = (dy + r) * seite + dx + r, d = dx * dx + dy * dy;
          kosten[k] = c;
          summe += c;
          if (c < best || (c === best && d < bd)) { best = c; bi = k; bd = d; }
        }
      }
      const bdx = (bi % seite) - r, bdy = Math.floor(bi / seite) - r;
      // Bruchteile aus einer Parabel durch die Nachbarn
      const fein = (m, l, rr) => { const n = l - 2 * m + rr; return n > 1e-9 ? 0.5 * (l - rr) / n : 0; };
      const ux = bdx > -r && bdx < r ? fein(best, kosten[bi - 1], kosten[bi + 1]) : 0;
      const uy = bdy > -r && bdy < r ? fein(best, kosten[bi - seite], kosten[bi + seite]) : 0;
      const k = j * nx + i;
      vx[k] = bdx + ux;
      vy[k] = bdy + uy;
      const mittel = summe / kosten.length;
      gew[k] = Math.sqrt(sa * sb) * Math.max(0, (mittel - best) / (mittel + 1e-6));
    }
  }

  glaetten(vx, vy, gew, nx, ny);
  const fluss = new Float32Array(nx * ny * 2);
  for (let k = 0; k < nx * ny; k++) { fluss[2 * k] = vx[k] * s; fluss[2 * k + 1] = vy[k] * s; }
  return { fw: nx, fh: ny, s: S * s, fluss };
}

/** Gewichtet mitteln (3 × 3, zweimal) und Lücken von den Nachbarn her füllen.
 *  Ohne jede Schätzung bleibt alles 0: Dann wird nur überblendet. */
function glaetten(vx, vy, gew, nx, ny) {
  const n = nx * ny;
  let gx = new Float32Array(n), gy = new Float32Array(n), gg = new Float32Array(n);
  for (let k = 0; k < n; k++) { gx[k] = vx[k] * gew[k]; gy[k] = vy[k] * gew[k]; gg[k] = gew[k]; }
  const runde = () => {
    const ox = new Float32Array(n), oy = new Float32Array(n), og = new Float32Array(n);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let sx = 0, sy = 0, sg = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const x = i + a, y = j + b;
        if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
        const q = y * nx + x, f = a === 0 && b === 0 ? 2 : 1;
        sx += gx[q] * f; sy += gy[q] * f; sg += gg[q] * f;
      }
      const k = j * nx + i;
      ox[k] = sx / 10; oy[k] = sy / 10; og[k] = sg / 10;
    }
    gx = ox; gy = oy; gg = og;
  };
  runde(); runde();
  let offen = 0;
  for (let k = 0; k < n; k++) {
    if (gg[k] > 1e-9) { vx[k] = gx[k] / gg[k]; vy[k] = gy[k] / gg[k]; gew[k] = 1; }
    else { gew[k] = 0; offen++; }
  }
  if (offen === n) { vx.fill(0); vy.fill(0); return; }
  // Lücken wachsen von den Rändern her zu, je Runde ein Block
  while (offen > 0) {
    const neu = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (gew[k]) continue;
      let sx = 0, sy = 0, c = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const x = i + a, y = j + b;
        if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
        const q = y * nx + x;
        if (gew[q]) { sx += vx[q]; sy += vy[q]; c++; }
      }
      if (c) neu.push([k, sx / c, sy / c]);
    }
    for (const [k, x, y] of neu) { vx[k] = x; vy[k] = y; gew[k] = 1; }
    offen -= neu.length;
  }
}

/* ---------- Nachrichten ---------- */

/* Je Ausschnitt ein „Satz". Ein neuer Satz verwirft den alten: Dessen Bilder
 * passen auf ein anderes Raster. */
let satz = -1;
let stand = null;            // letzte Messung, nach der die Vorhersagen gerechnet sind
let bilder = new Map();      // t → { w, h, werte, zelleM }
const gerechnet = new Set(); // t des früheren Bildes eines fertigen Paars

function paarRechnen(t) {
  const a = bilder.get(t), b = bilder.get(t + FUENF_MIN);
  if (!a || !b || gerechnet.has(t) || a.w !== b.w || a.h !== b.h) return;
  gerechnet.add(t);
  const f = flussRechnen(a.werte, b.werte, a.w, a.h, a.zelleM);
  self.postMessage({ art: 'fluss', satz, t, fw: f.fw, fh: f.fh, s: f.s, fluss: f.fluss }, [f.fluss.buffer]);
}

async function bildNehmen(m) {
  const meinSatz = m.satz;
  // Vorhersage aus einem Lauf, der inzwischen abgelöst ist
  const veraltet = () => m.t > m.ref && m.ref !== stand;
  try {
    const g = await tiffLesen(m.puffer);
    if (meinSatz !== satz || veraltet()) return;
    bilder.set(m.t, { w: g.w, h: g.h, werte: g.werte, zelleM: Math.max(g.dx, g.dy) });
    const kopie = g.werte.slice();
    self.postMessage({ art: 'bild', satz, t: m.t, ref: m.ref, w: g.w, h: g.h, x0: g.x0, yOben: g.yOben, dx: g.dx, dy: g.dy, werte: kopie },
      [kopie.buffer]);
    paarRechnen(m.t - FUENF_MIN);
    paarRechnen(m.t);
  } catch (err) {
    if (meinSatz === satz) self.postMessage({ art: 'fehler', satz, t: m.t, text: String(err && err.message || err) });
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = e => {
    const m = e.data;
    if (m.art === 'satz') {
      satz = m.satz;
      stand = m.ref;
      bilder = new Map();
      gerechnet.clear();
    } else if (m.art === 'weg' && m.satz === satz) {
      // Vorhersagen eines alten Laufs: Bild und beide Paare daran vergessen
      stand = m.ref;
      for (const t of m.zeiten) {
        bilder.delete(t);
        gerechnet.delete(t);
        gerechnet.delete(t - FUENF_MIN);
      }
    } else if (m.art === 'bild' && m.satz === satz) {
      bildNehmen(m);
    } else if (m.art === 'modell' && m.satz === satz) {
      modellNehmen(m);
    }
  };
}
