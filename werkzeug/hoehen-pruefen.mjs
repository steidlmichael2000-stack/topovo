/* Prüft hoehen.js gegen unabhängige Quellen — unter Node, wo kein CORS gilt.
 *
 *   node werkzeug/hoehen-pruefen.mjs
 *
 * 1. UTM gegen proj4 2.6.2 (die Werte unten wurden einmalig damit gerechnet)
 * 2. Rundlauf geografisch → UTM → geografisch über ganz Bayern
 * 3. Einzelne Höhe per Teilabfrage (hoehenPunkt) gegen die ganze Kachel
 * 4. DGM1 gegen die XYZ-Fassung derselben Kachel: Die nennt zu jedem Wert die
 *    Koordinate im Klartext und ist damit der Maßstab für die Lage im Raster.
 *    Verglichen werden die ersten Zeilen (aus dem Anfang der ZIP-Datei).
 * 5. DGM1 gegen den Höhendienst der BVV, als zweite Gegenprobe. Der Dienst
 *    nimmt den nächsten Rasterwert, rundet auf 0,1 m — und liegt einen halben
 *    Meter versetzt: Er ordnet jeden Wert der Pixelecke zu, während GeoTIFF und
 *    XYZ ihn in die Pixelmitte setzen (636000,50 / 5528999,50 für den ersten
 *    Wert der Kachel 636_5528). Am 10.10.2026 traf er mit diesem Versatz 400 von
 *    400 Stellen, ohne nur 308 bzw. 120.
 * 6. Über eine Kachelgrenze hinweg
 * 7. DOM20: Datenmenge, Dauer und DOM − DGM
 * 8. DGM1 Baden-Württemberg: ZIP-Eintrag und XYZ, unabhängig gelesen
 * 9. Landesgrenze Ulm/Neu-Ulm: keine Lücke, beide Länder stimmen überein
 *
 * Der Höhendienst dient hier allein als Prüfwert; aus der App heraus wird er
 * nicht benutzt (im Browser lässt er nur die Portale der BVV und localhost zu).
 */

import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const H = require('../hoehen.js');
H.HOEHEN.direkt = true;

// [lat, lon, Ost, Nord] aus proj4 2.6.2, EPSG:4326 → EPSG:25832
const REFERENZ = [
  [49.8918, 10.8862, 635477.4426, 5528306.4863],
  [47.63, 12.98, 798984.8509, 5282855.5637],
  [49.79, 9.95, 568379.3058, 5515715.3071],
  [50.31, 11.92, 707902.6382, 5577177.1204],
  [48.574, 13.46, 828947.394, 5389710.0461],
  [47.55, 9.68, 551164.3845, 5266510.596],
  [48, 9, 500000, 5316300.2243],
  [50.5, 13.9, 847432.3489, 5605701.669]
];

const HOEHENDIENST = 'https://geoservices.bayern.de/bvvapi/od/hoehen/v1/elevation/list';

let fehler = 0;
const pruefe = (ok, text) => {
  console.log(`${ok ? 'ok    ' : 'FEHLER'}  ${text}`);
  if (!ok) fehler++;
};
/* Die BVV erneuert XYZ-Fassung und Höhendienst nicht immer zugleich mit dem
 * GeoTIFF, das die App liest: 778_5292 (Lattengebirge) kam am 29.10.2026 als
 * XYZ neu, das TIFF blieb vom 30.04.2024 — median 5 cm, am Hang bis 7 m anders.
 * Ist die Vergleichsfassung mehr als 30 Tage jünger, ist eine Abweichung kein
 * Fehler im Leser, sondern ein neuer Datenstand: dann HINWEIS statt FEHLER. */
const geaendert = async url => Date.parse((await fetch(url, { method: 'HEAD' })).headers.get('last-modified') || '');
async function standVerschieden(ke, kn) {
  const tif = await geaendert(`https://download1.bayernwolke.de/a/dgm/dgm1/${ke}_${kn}.tif`);
  const xyz = await geaendert(`https://download1.bayernwolke.de/a/dgm/dgm1xyz/${ke}_${kn}.zip`);
  return xyz - tif > 30 * 86400000
    ? `XYZ vom ${new Date(xyz).toLocaleDateString('de-DE')}, TIFF vom ${new Date(tif).toLocaleDateString('de-DE')}` : '';
}
const pruefeStand = (ok, text, neuer) => {
  if (!ok && neuer) console.log(`HINWEIS ${text} — neuer Datenstand (${neuer}), die App liest das ältere TIFF`);
  else pruefe(ok, text);
};
const zahl = (x, stellen = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const quantil = (werte, q) => {
  const s = [...werte].filter(Number.isFinite).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** Fester Zufall, damit jeder Lauf dieselben Stellen prüft (mulberry32). */
function zufall(saat) {
  return () => {
    saat |= 0; saat = saat + 0x6D2B79F5 | 0;
    let t = Math.imul(saat ^ saat >>> 15, 1 | saat);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

async function hoehendienst(ost, nord) {
  const aus = new Float32Array(ost.length).fill(NaN);
  for (let von = 0; von < ost.length; von += 2500) {
    const coords = [];
    for (let i = von; i < Math.min(ost.length, von + 2500); i++) coords.push([+ost[i].toFixed(2), +nord[i].toFixed(2)]);
    const r = await fetch(HOEHENDIENST, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ srid: 25832, coords }) });
    if (!r.ok) throw new Error(`Höhendienst: HTTP ${r.status}`);
    (await r.json()).coords.forEach((c, j) => { if (c[2] !== null) aus[von + j] = c[2]; });
  }
  return aus;
}

/* ---- 1. UTM gegen proj4 ---- */
{
  let groesste = 0;
  for (const [lat, lon, e, n] of REFERENZ) {
    const [e2, n2] = H.utm32Hin(lat, lon);
    groesste = Math.max(groesste, Math.hypot(e2 - e, n2 - n));
  }
  pruefe(groesste < 0.001, `UTM gegen proj4: größte Abweichung ${zahl(groesste * 1000, 3)} mm an ${REFERENZ.length} Punkten`);
}

/* ---- 2. Rundlauf ---- */
{
  let groesste = 0, n = 0;
  for (let lat = 47.2; lat <= 50.65; lat += 0.05) {
    for (let lon = 8.9; lon <= 13.9; lon += 0.05) {
      const [e, no] = H.utm32Hin(lat, lon);
      const [la, lo] = H.utm32Zurueck(e, no);
      const [e2, n2] = H.utm32Hin(la, lo);
      groesste = Math.max(groesste, Math.hypot(e2 - e, n2 - no));
      n++;
    }
  }
  pruefe(groesste < 0.001, `Rundlauf geografisch ↔ UTM: größte Abweichung ${zahl(groesste * 1000, 4)} mm an ${n} Punkten`);
}

/* ---- 3. Einzelne Höhe per Teilabfrage ----
 * Vor allen anderen Prüfungen: Liegt die ganze Kachel schon im Speicher, nimmt
 * hoehenPunkt die, und die Teilabfrage wäre gar nicht geprüft. Beide Bauarten
 * der DGM-Dateien — Verzeichnis vorn (636_5528) und hinten (778_5292). */
for (const [name, ke, kn] of [['Bamberg', 636, 5528], ['Berchtesgaden', 778, 5292]]) {
  const r = zufall(ke + kn);
  const orte = Array.from({ length: 6 }, () => H.utm32Zurueck(ke * 1000 + 5 + r() * 990, kn * 1000 + 5 + r() * 990));
  let vorher = H.HOEHEN.geladen;
  const t0 = performance.now();
  const teil = [await H.hoehenPunkt(...orte[0])];
  const erste = { kb: (H.HOEHEN.geladen - vorher) / 1024, ms: performance.now() - t0 };
  vorher = H.HOEHEN.geladen;
  for (const o of orte.slice(1)) teil.push(await H.hoehenPunkt(...o));
  const weitere = (H.HOEHEN.geladen - vorher) / 1024 / (orte.length - 1);
  const utm = orte.map(o => H.utm32Hin(...o));
  const ganz = await H.hoehenWerte('dgm1', Float64Array.from(utm, u => u[0]), Float64Array.from(utm, u => u[1]));
  const groesste = Math.max(...teil.map((z, i) => Math.abs(z - ganz[i])));
  pruefe(teil.every(Number.isFinite) && groesste < 1e-3 && erste.kb < 60,
    `Höhe am Punkt ${name}: ${orte.length} Punkte wie aus der ganzen Kachel (größte Abweichung ${zahl(groesste * 1000, 3)} mm); ` +
    `erster ${zahl(erste.kb, 1)} kB in ${zahl(erste.ms, 0)} ms, weitere je ${zahl(weitere, 1)} kB`);
}
{
  const vorher = H.HOEHEN.geladen;
  const berlin = await H.hoehenPunkt(52.52, 13.40);
  pruefe(Number.isNaN(berlin) && H.HOEHEN.geladen === vorher, 'Höhe am Punkt außerhalb des Rahmens (Berlin): kein Wert, nichts geladen');
  const erfurt = await H.hoehenPunkt(50.98, 11.03);
  pruefe(Number.isNaN(erfurt), 'Höhe am Punkt im Rahmen, aber außerhalb Bayerns und BW (Erfurt): kein Wert');
}

/** Die ersten Zeilen der XYZ-Fassung einer DGM1-Kachel, aus den ersten 64 kB
 *  der ZIP-Datei — der Rest des Archivs wird nicht gebraucht. */
async function xyzAnfang(ke, kn) {
  const r = await fetch(`https://download1.bayernwolke.de/a/dgm/dgm1xyz/${ke}_${kn}.zip`, { headers: { Range: 'bytes=0-65535' } });
  const b = Buffer.from(await r.arrayBuffer());
  if (b.readUInt32LE(0) !== 0x04034b50 || b.readUInt16LE(8) !== 8) throw new Error('XYZ: unerwarteter ZIP-Aufbau');
  const daten = b.subarray(30 + b.readUInt16LE(26) + b.readUInt16LE(28));
  const text = zlib.inflateRawSync(daten, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('latin1');
  const zeilen = text.split(/\r?\n/);
  zeilen.pop();                                   // die letzte ist abgeschnitten
  return zeilen.map(z => z.trim().split(/\s+/).map(Number)).filter(z => z.length === 3);
}

/* ---- 4. DGM1 gegen die XYZ-Fassung ---- */
for (const [name, ke, kn] of [['Bamberg', 636, 5528], ['Berchtesgaden', 778, 5292]]) {
  const xyz = (await xyzAnfang(ke, kn)).slice(0, 4000);
  const ost = Float64Array.from(xyz, z => z[0]), nord = Float64Array.from(xyz, z => z[1]);
  const nn = await H.hoehenWerte('dgm1', ost, nord, 'nachbar');
  const bl = await H.hoehenWerte('dgm1', ost, nord);
  let groesste = 0, fehlt = 0;
  xyz.forEach((z, i) => {
    if (!Number.isFinite(nn[i]) || !Number.isFinite(bl[i])) { fehlt++; return; }
    groesste = Math.max(groesste, Math.abs(nn[i] - z[2]), Math.abs(bl[i] - z[2]));
  });
  pruefeStand(!fehlt && groesste < 0.006,
    `DGM1 ${name} gegen XYZ: ${xyz.length} Werte, ${fehlt} ohne Wert, größte Abweichung ${zahl(groesste * 100, 2)} cm ` +
    `(nächster Nachbar und bilinear an der Pixelmitte)`, await standVerschieden(ke, kn));
}

/* ---- 5. DGM1 gegen den Höhendienst ---- */
for (const [name, ke, kn] of [['Bamberg', 636, 5528], ['Berchtesgaden', 778, 5292]]) {
  const r = zufall(ke * 7919 + kn);
  const ost = [], nord = [];
  while (ost.length < 400) {
    const x = ke * 1000 + 2 + r() * 996, y = kn * 1000 + 2 + r() * 996;
    const fx = x % 0.5, fy = y % 0.5;
    if (Math.min(fx, 0.5 - fx) < 0.1 || Math.min(fy, 0.5 - fy) < 0.1) continue;
    ost.push(x); nord.push(y);
  }
  const t0 = performance.now();
  const ohne = await H.hoehenWerte('dgm1', Float64Array.from(ost), Float64Array.from(nord), 'nachbar');
  const dauer = performance.now() - t0;
  // Was der Dienst an (x, y) meldet, steht im Raster bei (x + 0,5, y − 0,5)
  const mit = await H.hoehenWerte('dgm1', Float64Array.from(ost, x => x + 0.5), Float64Array.from(nord, y => y - 0.5), 'nachbar');
  const ihre = await hoehendienst(ost, nord);

  /* Das DGM speichert Zentimeter, der Dienst rundet auf Dezimeter: Aus
   * demselben Pixel liegen beide also höchstens 5 cm auseinander. */
  const vergleich = werte => {
    let gleich = 0, fehlt = 0, groesste = 0;
    for (let i = 0; i < ost.length; i++) {
      if (!Number.isFinite(werte[i]) || !Number.isFinite(ihre[i])) { fehlt++; continue; }
      const d = Math.abs(werte[i] - ihre[i]);
      if (d <= 0.05 + 1e-4) gleich++;
      groesste = Math.max(groesste, d);
    }
    return { gleich, fehlt, groesste };
  };
  const a = vergleich(mit), b = vergleich(ohne);
  pruefeStand(a.gleich === ost.length,
    `DGM1 ${name} gegen Höhendienst (um ½ m versetzt): ${a.gleich} von ${ost.length} aus demselben Pixel, ` +
    `${a.fehlt} ohne Wert, größte Abweichung ${zahl(a.groesste)} m (${zahl(dauer, 0)} ms samt Laden) — ` +
    `ohne Versatz ${b.gleich} gleich, größte ${zahl(b.groesste)} m`, await standVerschieden(ke, kn));
}

/* ---- 6. Über die Kachelgrenze 636/637 ---- */
{
  const ost = [], nord = [];
  for (let x = 636980.3; x <= 637020.3; x += 0.25) { ost.push(x); nord.push(5528500.3); }
  const z = await H.hoehenWerte('dgm1', Float64Array.from(ost), Float64Array.from(nord));
  let sprung = 0;
  for (let i = 1; i < z.length; i++) sprung = Math.max(sprung, Math.abs(z[i] - z[i - 1]));
  pruefe(z.every(Number.isFinite) && sprung < 0.3,
    `Kachelgrenze: ${z.length} Werte über 40 m, alle vorhanden, größter Schritt ${zahl(sprung, 3)} m je 0,25 m`);
}

/* ---- 7. DOM20 ---- */
{
  // 300 m quer durch die Kachel 638_5526 (Bamberg), als Linienzug wie aus der App
  const a = H.utm32Zurueck(638150, 5526250), b = H.utm32Zurueck(638440, 5526330);
  const vorher = H.HOEHEN.geladen;
  let t0 = performance.now();
  const dgm = await H.hoehenProfil([a, b], 'dgm1');
  const tDgm = performance.now() - t0, mbDgm = (H.HOEHEN.geladen - vorher) / 2 ** 20;

  t0 = performance.now();
  const dom = await H.hoehenProfil([a, b], 'dom20');
  const tDom = performance.now() - t0;

  // DGM an den Stützpunkten des DOM, damit beide auf derselben Station stehen
  const dgmFein = await H.hoehenWerte('dgm1', dom.ost, dom.nord);
  const diff = Array.from(dom.hoehe, (z, i) => z - dgmFein[i]);
  const vorhanden = dom.hoehe.filter(Number.isFinite).length / dom.hoehe.length;
  let maxI = 0;
  diff.forEach((d, i) => { if (d > diff[maxI]) maxI = i; });

  console.log(`        DGM-Profil: ${dgm.station.length} Punkte, ${zahl(dgm.laenge, 1)} m, ${zahl(tDgm, 0)} ms, ${zahl(mbDgm)} MB`);
  console.log(`        DOM-Profil: ${dom.station.length} Punkte, ${zahl(tDom, 0)} ms, ${zahl(dom.geladen / 2 ** 20)} MB`);
  console.log(`        DOM − DGM: 5 % ${zahl(quantil(diff, 0.05))} m · Median ${zahl(quantil(diff, 0.5))} m · ` +
    `95 % ${zahl(quantil(diff, 0.95))} m · höchstens ${zahl(diff[maxI])} m bei Station ${zahl(dom.station[maxI], 1)} m`);
  pruefe(vorhanden > 0.99, `DOM20: ${zahl(vorhanden * 100, 1)} % der Stützpunkte mit Wert`);
  pruefe(quantil(diff, 0.05) > -0.5, 'DOM20 liegt nicht unter dem Gelände (5-%-Wert über −0,5 m) — Lage und Höhenbezug passen');
}

/* ---- 8. Baden-Württemberg (DGM1 des LGL) ---- */
{
  // Die Datei eines Kilometers aus dem Archiv, und ihr Text unabhängig gelesen
  const vorher = H.HOEHEN.geladen;
  let t0 = performance.now();
  const { daten: text, stand } = await H.lglDatei('dgm1', 513, 5402);
  const tLaden = performance.now() - t0, mb = (H.HOEHEN.geladen - vorher) / 2 ** 20;
  t0 = performance.now();
  const raster = H.xyzLesen(text, 513, 5402);
  const tLesen = performance.now() - t0;
  const zeilen = Buffer.from(text).toString('latin1').split(/\r?\n/).filter(Boolean).map(z => z.trim().split(/\s+/).map(Number));
  pruefe(zeilen.length === 1e6 && raster.every(Number.isFinite) && stand === '2016-04-06',
    `BW-Kachel 513_5402 (Stuttgart): ${zeilen.length} Zeilen, Stand ${stand}, ${zahl(mb)} MB geladen in ${zahl(tLaden, 0)} ms, gelesen in ${zahl(tLesen, 0)} ms`);

  const r = zufall(5135402), probe = Array.from({ length: 2000 }, () => zeilen[Math.floor(r() * zeilen.length)]);
  const ost = Float64Array.from(probe, z => z[0]), nord = Float64Array.from(probe, z => z[1]);
  const quellen = new Set();
  const nn = await H.hoehenWerte('dgm1', ost, nord, 'nachbar', { quellen });
  const bl = await H.hoehenWerte('dgm1', ost, nord);
  let groesste = 0, fehlt = 0;
  probe.forEach((z, i) => {
    if (!Number.isFinite(nn[i]) || !Number.isFinite(bl[i])) { fehlt++; return; }
    groesste = Math.max(groesste, Math.abs(nn[i] - z[2]), Math.abs(bl[i] - z[2]));
  });
  pruefe(!fehlt && groesste < 0.006 && [...quellen].join() === 'bw',
    `DGM1 BW gegen XYZ: ${probe.length} Stellen, ${fehlt} ohne Wert, größte Abweichung ${zahl(groesste * 100, 2)} cm, Quelle ${[...quellen]}`);

  const stuttgart = await H.hoehenPunkt(48.78, 9.18);
  pruefe(Number.isFinite(stuttgart) && stuttgart > 200 && stuttgart < 300, `Höhe am Punkt Stuttgart: ${zahl(stuttgart)} m aus BW`);
}

/* ---- 9. Landesgrenze an der Donau (Ulm/Neu-Ulm) ----
 * Die bayerischen Kacheln am Rand sind beschnitten (573_5361: 875 px breit,
 * beginnt 125 m weiter östlich), und beide Länder überlappen auf einem
 * Streifen. Am 13.10.2026 dort: Median 6 cm, 90 % unter 16 cm, an zwei
 * Stellen bis 4,3 m — Geländeänderungen zwischen den Befliegungen. */
{
  const [e0, n0] = H.utm32Hin(48.405, 9.995), [e1, n1] = H.utm32Hin(48.385, 10.005);
  const N = 300, ost = new Float64Array(N), nord = new Float64Array(N);
  for (let i = 0; i < N; i++) { ost[i] = e0 + (e1 - e0) * i / (N - 1); nord[i] = n0 + (n1 - n0) * i / (N - 1); }
  const by = await H.hoehenWerteArt('dgm1', ost, nord, 'nachbar', false);
  const bw = await H.hoehenWerteArt('dgm1-bw', ost, nord, 'nachbar', false);
  const quellen = new Set();
  const alle = await H.hoehenWerte('dgm1', ost, nord, 'bilinear', { quellen });
  const d = [];
  for (let i = 0; i < N; i++) if (Number.isFinite(by[i]) && Number.isFinite(bw[i])) d.push(Math.abs(by[i] - bw[i]));
  const nurBy = by.filter(Number.isFinite).length, nurBw = bw.filter(Number.isFinite).length;
  pruefe(alle.every(Number.isFinite) && quellen.size === 2,
    `Grenze Ulm/Neu-Ulm: ${N} Punkte über ${zahl(Math.hypot(e1 - e0, n1 - n0), 0)} m alle mit Wert (BY ${nurBy}, BW ${nurBw}, beide ${d.length})`);
  pruefe(d.length > 20 && quantil(d, 0.5) < 0.1,
    `Grenze Ulm/Neu-Ulm: BY und BW im Überlappungsstreifen Median ${zahl(quantil(d, 0.5) * 100, 1)} cm, 90 % ${zahl(quantil(d, 0.9) * 100, 1)} cm`);
}

/* ---- 10. DOM1 Baden-Württemberg ----
 * GeoTIFF mit Gleitkomma-Prädiktor. Ein unabhängiger Leser fehlt hier, und das
 * nDOM1 des LGL taugt nicht als Gegenprobe (es passt in keiner Kachel zu
 * DOM − DGM, das LGL rechnet es offenbar aus einer anderen Oberfläche). Geprüft
 * wird deshalb, was nur bei richtig gelesenen Werten gilt: Die Oberfläche liegt
 * praktisch nie unter dem Gelände derselben Befliegung, und auf freiem Boden
 * genau darauf. Falsch zusammengesetzte Bytes gäben Werte quer durch den
 * Zahlenraum. Reutlingen 541_5378, Befliegung 2017; am 13.10.2026 dort 0 von
 * 3000 Stellen unter dem Gelände, 19 % auf dem Boden (Stadt, deshalb nicht mehr). */
{
  const r = zufall(5415378), N = 3000;
  const ost = Float64Array.from({ length: N }, () => 541000.5 + Math.floor(r() * 1000));
  const nord = Float64Array.from({ length: N }, () => 5378000.5 + Math.floor(r() * 1000));
  const t0 = performance.now(), vorher = H.HOEHEN.geladen, staende = new Set(), quellen = new Set();
  const dom = await H.hoehenWerte('dom20', ost, nord, 'nachbar', { staende, quellen });
  const tDom = performance.now() - t0, mb = (H.HOEHEN.geladen - vorher) / 2 ** 20;
  const dgm = await H.hoehenWerteArt('dgm1-bw', ost, nord, 'nachbar', false);
  let unter = 0, boden = 0, n = 0;
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(dom[i]) || !Number.isFinite(dgm[i])) continue;
    n++;
    if (dom[i] - dgm[i] < -0.3) unter++;
    if (Math.abs(dom[i] - dgm[i]) < 0.1) boden++;
  }
  pruefe(n === N && [...quellen].join() === 'bw' && [...staende].join() === '2017-03-13',
    `DOM1 BW Reutlingen: ${n} von ${N} Stellen mit Wert, Quelle ${[...quellen]}, Stand ${[...staende]}, ${zahl(mb)} MB in ${zahl(tDom, 0)} ms`);
  pruefe(unter / n < 0.005 && boden / n > 0.1,
    `DOM1 BW Reutlingen: ${unter} Stellen mehr als 0,3 m unter dem Gelände, ${zahl(boden / n * 100, 1)} % auf dem Boden (±0,1 m)`);
}

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden.');
process.exitCode = fehler ? 1 : 0;
