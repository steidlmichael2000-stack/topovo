/* Baut dgm-nw-jahre.json: zu jedem Kilometer des DGM1 NRW das Jahr im Dateinamen.
 *
 *   node werkzeug/dgm-nw-jahre-bauen.mjs
 *
 * Geobasis NRW legt das DGM1 als dgm1_32_{e}_{n}_1_nw_{Jahr}.tif ab — das Jahr
 * ist nicht zu raten, und eine falsche Adresse kommt als 404 ohne CORS-Kopf
 * zurück, also im Browser als Netzfehler. Das Verzeichnis index.json hat alles,
 * ist aber 3,6 MB groß und ungepackt. Diese Tabelle ist ein Gitter über NRW,
 * ein Zeichen je Kilometer: '0' gibt es nicht, '1' … das erste … Jahr aus
 * jahre. Rund 70 kB, gepackt ein Bruchteil davon (hoehen.js, nwJahr).
 *
 * Neu bauen, wenn NRW Kacheln neu befliegt (dann ändert sich das Jahr, und die
 * alte Adresse geht ins Leere). Stand am 20.11.2026: 35 860 Kacheln, 2020–2025. */

import fs from 'node:fs';

const INDEX = 'https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff/index.json';
const r = await fetch(INDEX);
if (!r.ok) throw new Error(`HTTP ${r.status}`);
const j = await r.json();
const ds = j.datasets.find(d => d.name === 'dgm1_tiff_kacheln');
if (!ds) throw new Error('Datensatz dgm1_tiff_kacheln fehlt im Verzeichnis');

const kacheln = [];
for (const { name } of ds.files) {
  const m = /^dgm1_32_(\d+)_(\d+)_1_nw_(\d{4})\.tif$/.exec(name);
  if (m) kacheln.push([+m[1], +m[2], +m[3]]);
}
if (kacheln.length < 30000) throw new Error(`Nur ${kacheln.length} Kacheln — Verzeichnis geändert?`);

const jahre = [...new Set(kacheln.map(k => k[2]))].sort();
if (jahre.length > 9) throw new Error('Mehr als neun Jahre passen nicht in ein Zeichen');
const e0 = Math.min(...kacheln.map(k => k[0])), n0 = Math.min(...kacheln.map(k => k[1]));
const breite = Math.max(...kacheln.map(k => k[0])) - e0 + 1, hoehe = Math.max(...kacheln.map(k => k[1])) - n0 + 1;
const zellen = new Uint8Array(breite * hoehe).fill(48);
for (const [e, n, jahr] of kacheln) {
  const i = (n - n0) * breite + (e - e0);
  // Doppelt (zwei Jahre für denselben Kilometer)? Dann das neuere
  const neu = 49 + jahre.indexOf(jahr);
  if (neu > zellen[i]) zellen[i] = neu;
}

const aus = { quelle: 'Geobasis NRW, DGM1 (index.json), dl-de/zero-2-0', stand: new Date().toISOString().slice(0, 10),
  e0, n0, breite, hoehe, jahre, zellen: new TextDecoder().decode(zellen) };
const ziel = new URL('../dgm-nw-jahre.json', import.meta.url);
fs.writeFileSync(ziel, JSON.stringify(aus));
console.log(`${kacheln.length} Kacheln, ${breite} × ${hoehe} km, Jahre ${jahre.join(', ')}, ` +
  `${(fs.statSync(ziel).size / 1024).toFixed(1)} kB → dgm-nw-jahre.json`);
