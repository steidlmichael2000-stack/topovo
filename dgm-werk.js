/* Topovo — Höhenkacheln für die Höhenfarben im Hintergrund
 *
 * Läuft als klassischer Worker (app.js, dgmKachel), damit die Karte beim
 * Einfärben nicht ruckelt: Gemessen kostete eine Kachel im Hauptfaden rund
 * 190 ms, auch mit allen Höhen im Vorrat. Die Höhen kommen aus hoehen.js —
 * dieselben Kacheln und derselbe Vorrat (IndexedDB) wie im Profil, hier mit
 * eigenem Zwischenspeicher im Arbeitsspeicher.
 *
 * Auftrag { id, z, x, y } → Antwort { id, png, probe } oder { id, fehler }:
 * png ist die Kachel als Terrarium-PNG (Höhe = R·256 + G + B/256 − 32768),
 * probe 32 × 32 Höhen alle 8 Bildpunkte für die Skala.
 */
importScripts('hoehen.js');

const KEIN = -32768;   // „keine Höhe" — in Terrarium alle Kanäle 0, wie DGM_KEIN in app.js

/** Breite und Länge der linken oberen Ecke von Bildpunkt (px, py) der Kachel. */
function kachelLatLon(z, x, y, px, py) {
  const n = 256 * 2 ** z, gx = x * 256 + px, gy = y * 256 + py;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * gy / n))) * 180 / Math.PI, gx / n * 360 - 180];
}

async function terrariumPng(hoehen) {
  const bild = new ImageData(256, 256), d = bild.data;
  for (let i = 0; i < hoehen.length; i++) {
    const v = (Number.isFinite(hoehen[i]) ? hoehen[i] : KEIN) - KEIN, g = Math.floor(v);
    d[4 * i] = g >> 8; d[4 * i + 1] = g & 255; d[4 * i + 2] = Math.floor((v - g) * 256); d[4 * i + 3] = 255;
  }
  const c = new OffscreenCanvas(256, 256);
  c.getContext('2d').putImageData(bild, 0, 0);
  return (await c.convertToBlob({ type: 'image/png' })).arrayBuffer();
}

/* Je Bildpunkt die Höhe in seiner Mitte, bilinear aus dem DGM1. UTM wird nur
 * auf einem Gitter alle 16 Bildpunkte gerechnet und dazwischen geradlinig
 * verteilt — über die 0,6 km einer Kachel weicht das weit unter einem
 * Millimeter ab. */
async function kachel(z, x, y) {
  const S = 16, G = 256 / S + 1;
  const ge = new Float64Array(G * G), gn = new Float64Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    [ge[j * G + i], gn[j * G + i]] = utm32Hin(...kachelLatLon(z, x, y, i * S, j * S));
  }
  const ost = new Float64Array(256 * 256), nord = new Float64Array(256 * 256);
  for (let py = 0; py < 256; py++) {
    const fy = (py + 0.5) / S, j = Math.min(Math.floor(fy), G - 2), ty = fy - j;
    for (let px = 0; px < 256; px++) {
      const fx = (px + 0.5) / S, i = Math.min(Math.floor(fx), G - 2), tx = fx - i;
      const a = j * G + i, b = a + 1, c = a + G, d = c + 1, k = py * 256 + px;
      ost[k] = (ge[a] * (1 - tx) + ge[b] * tx) * (1 - ty) + (ge[c] * (1 - tx) + ge[d] * tx) * ty;
      nord[k] = (gn[a] * (1 - tx) + gn[b] * tx) * (1 - ty) + (gn[c] * (1 - tx) + gn[d] * tx) * ty;
    }
  }
  const hoehen = await hoehenWerte('dgm1', ost, nord, 'bilinear');
  const probe = new Float32Array(32 * 32);
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) probe[j * 32 + i] = hoehen[(8 * j + 4) * 256 + 8 * i + 4];
  return { png: await terrariumPng(hoehen), probe };
}

self.onmessage = async ev => {
  const { id, z, x, y } = ev.data;
  try {
    const { png, probe } = await kachel(z, x, y);
    self.postMessage({ id, png, probe }, [png, probe.buffer]);
  } catch (err) {
    self.postMessage({ id, fehler: String(err && err.message || err) });
  }
};
