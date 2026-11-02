/* Baut laender-grenzen.json: die Grenzen aller 16 Länder, vereinfacht.
 *
 *   node werkzeug/laender-grenzen-bauen.mjs
 *
 * Quelle: VG250 des BKG über dessen WFS (vg250_lan), Datenlizenz Deutschland –
 * Namensnennung 2.0. Gebraucht werden die Grenzen nur, um je Kartenkachel zu
 * entscheiden, wessen DOP20 sie zeigt (app.js, dopKachel). Kacheln nahe einer
 * Grenze holen ohnehin alle beteiligten Bilder und legen sie übereinander; die
 * Vereinfachung muss also nur deutlich feiner sein als dieser Saum (DOP_SAUM_M
 * in app.js). Bis November 2026 kam nur BW als bw-grenze.json aus dem Basis-DLM
 * des LGL (werkzeug/bw-grenze-bauen.mjs) — das reichte für zwei Länder.
 *
 * Genommen werden nur die Landflächen (GF 4); Bodensee, Haff und Küstenmeer
 * nicht. Wo eine Kachel über das Meer reicht, füllt dopKachel die Bildpunkte
 * außerhalb aller Länder aus dem Dienst, der dort etwas hat.
 *
 * Vereinfacht nach Douglas-Peucker in UTM 32 mit TOLERANZ Metern. Gespeichert
 * je Ring als eine flache Zahlenreihe in Zehntausendstel Grad (rund 10 m): der
 * erste Punkt ganz (lat, lon), jeder weitere als Abstand zum vorigen. Das
 * drückt die Datei von 487 auf 198 kB (gepackt 77 kB); app.js packt sie aus
 * (laenderGrenzenHolen). */

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const H = require('../hoehen.js');
const QUELLE = 'https://sgx.geodatenzentrum.de/wfs_vg250?SERVICE=WFS&REQUEST=GetFeature&VERSION=2.0.0' +
  '&TYPENAMES=vg250:vg250_lan&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326';
const TOLERANZ = 100;  // m; mit 50 waren es 774 kB statt 487 (vor dem Packen)
const MIN_FLAECHE = 20000;   // m²; kleinere Inseln und Splitter fallen weg

// Regionalschlüssel des Landes → Kürzel wie in LAND_WMS (app.js)
const KUERZEL = { '01': 'sh', '02': 'hh', '03': 'ni', '04': 'hb', '05': 'nw', '06': 'he', '07': 'rp', '08': 'bw',
  '09': 'by', '10': 'sl', '11': 'be', '12': 'bb', '13': 'mv', '14': 'sn', '15': 'st', '16': 'th' };

function dp(punkte, tol) {
  if (punkte.length < 3) return punkte;
  const behalten = new Uint8Array(punkte.length);
  behalten[0] = behalten[punkte.length - 1] = 1;
  const stapel = [[0, punkte.length - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop();
    const [ax, ay] = punkte[a], [bx, by] = punkte[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let weit = -1, wo = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = punkte[i];
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d > weit) { weit = d; wo = i; }
    }
    if (weit > tol) { behalten[wo] = 1; stapel.push([a, wo], [wo, b]); }
  }
  return punkte.filter((_, i) => behalten[i]);
}

function flaeche(utm) {
  let a = 0;
  for (let i = 0, k = utm.length - 1; i < utm.length; k = i++) a += utm[k][0] * utm[i][1] - utm[i][0] * utm[k][1];
  return Math.abs(a / 2);
}

const r = await fetch(QUELLE);
if (!r.ok) throw new Error(`HTTP ${r.status}`);
const fc = await r.json();

const laender = {};
let vorher = 0, nachher = 0;
for (const f of fc.features) {
  if (f.properties.gf !== 4) continue;
  const k = KUERZEL[f.properties.sn_l];
  if (!k) throw new Error(`Unbekanntes Land ${f.properties.sn_l} (${f.properties.gen})`);
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of polys) for (const ring of poly) {
    const [lon0, lat0] = ring[0];
    if (Math.abs(lon0) > 180 || Math.abs(lat0) > 90) throw new Error('Koordinaten sind nicht geografisch');
    const utm = ring.map(([lon, lat]) => H.utm32Hin(lat, lon));
    vorher += ring.length;
    if (flaeche(utm) < MIN_FLAECHE) continue;
    const einfach = dp(utm, TOLERANZ);
    if (einfach.length < 4) continue;
    nachher += einfach.length;
    const ganz = einfach.map(([e, n]) => H.utm32Zurueck(e, n).map(x => Math.round(x * 1e4)));
    (laender[k] ||= []).push(ganz.flatMap(([lat, lon], i) => i ? [lat - ganz[i - 1][0], lon - ganz[i - 1][1]] : [lat, lon]));
  }
}
const fehlt = Object.values(KUERZEL).filter(k => !laender[k]);
if (fehlt.length) throw new Error(`Ohne Grenze: ${fehlt.join(', ')}`);

const aus = { quelle: 'GeoBasis-DE / BKG, VG250 (WFS), dl-de/by-2-0',
  stand: new Date().toISOString().slice(0, 10), toleranz_m: TOLERANZ, einheit: 1e-4, laender };
const ziel = new URL('../laender-grenzen.json', import.meta.url);
fs.writeFileSync(ziel, JSON.stringify(aus));
console.log(`${Object.keys(laender).length} Länder, ${Object.values(laender).flat().length} Ringe, ` +
  `${vorher} → ${nachher} Punkte, ${(fs.statSync(ziel).size / 1024).toFixed(1)} kB → laender-grenzen.json`);
