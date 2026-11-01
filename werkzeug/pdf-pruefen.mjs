/* Prüft pdf.js unter Node: baut ein Muster-PDF und kontrolliert den Aufbau.
 *
 *   node werkzeug/pdf-pruefen.mjs [ausgabe.pdf]
 *
 * 1. Jeder Eintrag der xref-Tabelle zeigt genau auf „N 0 obj"
 * 2. startxref zeigt auf die Tabelle
 * 3. Umlaute, ß, ‰, ° und das Minuszeichen landen als WinAnsi-Codes im Text
 * 4. Ein JPEG aus dem DOP20-Dienst geht unverändert hinein (braucht Netz)
 * Die Datei bleibt liegen, damit man sie ansehen kann. */

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const P = require('../pdf.js');

let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? 'ok    ' : 'FEHLER'}  ${text}`); if (!ok) fehler++; };

const dok = new P.PdfDokument({ titel: 'Prüfseite — Querprofil' });
const s = dok.seite();
s.text(40, 50, 'Querprofil Strecke 5100 · km 12,513', { groesse: 16, fett: true, farbe: '#1761a3' });
s.text(800, 50, '10.10.2026 · ±50 m · unüberhöht', { groesse: 9, farbe: '#5f5e5a', anker: 'end' });
s.linie([[40, 58], [800, 58]], { farbe: '#1761a3', breite: 0.8 });
s.text(40, 90, 'Gleis 244,6 m ü. NHN · links −3,6 · rechts −2,3 m · Neigung +0,7 ‰ · 20 °C · Größe (Test) \\', { groesse: 11 });
// Gelände als Fläche, Gebäude als Block, gestrichelte Oberfläche
const gel = [[40, 300], [120, 296], [200, 280], [260, 262], [320, 262], [380, 280], [460, 298], [560, 300]];
s.linie([...gel, [560, 340], [40, 340]], { farbe: null, fuellung: '#faeeda' });
s.linie(gel, { farbe: '#ba7517', breite: 1.4 });
s.linie([[70, 297], [70, 230], [100, 205], [130, 230], [130, 295]], { farbe: '#5f5e5a', fuellung: '#b4b2a9', breite: 0.7 });
s.linie([[40, 250], [560, 250]], { farbe: '#444441', breite: 0.6, strichel: [3, 2] });
s.rechteck(40, 120, 520, 220, { farbe: '#d3d1c7', breite: 0.5 });

let mitBild = false;
try {
  const r = await fetch('https://geoservices.bayern.de/od/wms/dop/v1/dop20?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    '&LAYERS=by_dop20c&STYLES=&CRS=EPSG:25832&BBOX=638150,5526150,638450,5526350&WIDTH=900&HEIGHT=600&FORMAT=image/jpeg');
  if (r.ok) {
    const jpeg = new Uint8Array(await r.arrayBuffer());
    const id = dok.bild(jpeg);
    s.beschnitten(590, 120, 210, 140, () => s.bild(id, 590, 120, 210, 140));
    s.linie([[600, 240], [780, 140]], { farbe: '#f59e0b', breite: 2, strichel: [6, 4] });
    mitBild = true;
  }
} catch { /* ohne Netz eben ohne Bild */ }
s.text(40, 570, 'Gelände DGM1, Luftbild DOP20: Bayerische Vermessungsverwaltung, CC BY 4.0', { groesse: 7.5, farbe: '#5f5e5a' });
dok.seite().text(40, 60, 'Seite 2', { groesse: 12 });

const bytes = await dok.bytes();
const datei = process.argv[2] || join(tmpdir(), 'topovo-pdf-pruefung.pdf');
writeFileSync(datei, bytes);

const text = Buffer.from(bytes).toString('latin1');
const xref = Number(/startxref\n(\d+)/.exec(text)[1]);
pruefe(text.slice(xref, xref + 4) === 'xref', `startxref zeigt auf die Tabelle (Byte ${xref})`);
const tabelle = text.slice(xref).split('\n');
const anzahl = Number(tabelle[1].split(' ')[1]);
let treffer = 0;
for (let nr = 1; nr < anzahl; nr++) {
  const off = Number(tabelle[2 + nr].slice(0, 10));
  if (text.startsWith(`${nr} 0 obj`, off)) treffer++;
}
pruefe(treffer === anzahl - 1, `xref: ${treffer} von ${anzahl - 1} Objekten an der richtigen Stelle`);
const codes = P.pdfCodes('ü−‰°ß');
pruefe(codes.join(',') === [0xFC, 0x96, 0x89, 0xB0, 0xDF].join(','), `WinAnsi: ü − ‰ ° ß → ${codes.map(c => c.toString(16)).join(' ')}`);
pruefe(Math.abs(P.pdfTextBreite('Höhe', 10) - (722 + 556 + 556 + 556) / 100) < 1e-9, 'Laufweite „Höhe" in 10 pt wie aus den AFM-Werten');
pruefe(mitBild, mitBild ? 'DOP20-Ausschnitt eingebettet' : 'DOP20-Ausschnitt nicht geladen (Netz?)');
console.log(`        ${(bytes.length / 1024).toFixed(1)} kB → ${datei}`);
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden.');
process.exitCode = fehler ? 1 : 0;
