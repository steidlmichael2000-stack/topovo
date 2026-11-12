/* Prüft die Umrechnung ETRS89 → DB_REF Gauß-Krüger (dbrefGk in app.js).
 *
 * Die Referenzwerte wurden einmalig mit proj4 2.6.2 gerechnet:
 *   von  +proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0
 *   nach EPSG:5683 bzw. 5684 (DB_REF / 3-degree Gauss-Kruger zone 3 bzw. 4) mit
 *        +towgs84=584.9636,107.7175,413.8067,1.1155214628,0.2824339890,-3.1384490633,7.992235
 * Das ist EPSG:5826 „DB_REF to ETRS89 (1)" in der Schreibweise von proj (Position Vector).
 *
 * Aufruf: node werkzeug/dbref-pruefen.mjs
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const stueck = src.slice(src.indexOf('const DBREF = {'), src.indexOf('/* Die Streifengrenze'));
const { dbrefGk, gkZurueck, DBREF } = new Function(stueck + '; return { dbrefGk, gkZurueck, DBREF };')();

// [lat, lon, Streifen, Rechts, Hoch]
const REFERENZ = [
  [49.66417, 10.05845, 3, 3576487.882, 5503592.619],
  [49.66417, 10.05845, 4, 4359942.384, 5504861.550],
  [47.5, 10.2, 3, 3590488.546, 5263093.495],
  [50.4, 9.6, 3, 3542733.587, 5585072.532],
  [48.1, 11.6, 4, 4470315.123, 5329181.897],
  [49.45, 11.08, 4, 4433397.293, 5479638.427],
  [47.6, 12.98, 4, 4573804.024, 5273976.990],
  [50.3, 12.1, 4, 4507230.446, 5573779.456],
  [49.0, 10.5, 3, 3609831.479, 5430272.810],
  [49.0, 10.5, 4, 4390350.785, 5430269.208],
];

let groesste = 0;
for (const [lat, lon, s, r, h] of REFERENZ) {
  const [rr, hh] = dbrefGk(lat, lon, s);
  groesste = Math.max(groesste, Math.hypot(rr - r, hh - h));
}
const ok = groesste < 0.002;
console.log(`${ok ? 'ok    ' : 'FEHLER'}  DB_REF GK3/GK4 gegen proj4: größte Abweichung ${(groesste * 1000).toFixed(1)} mm an ${REFERENZ.length} Punkten`);

/* Rückweg (Koordinatensuche, gkZurueck): die proj4-Werte zurück auf lat/lon.
 * Abstand in Metern über eine einfache Näherung — auf diese Entfernungen genügt sie. */
const meter = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180));
let zurueck = 0;
for (const [lat, lon, , r, h] of REFERENZ) zurueck = Math.max(zurueck, meter([lat, lon], gkZurueck(r, h, DBREF)));
const ok2 = zurueck < 0.002;
console.log(`${ok2 ? 'ok    ' : 'FEHLER'}  DB_REF zurück auf ETRS89 gegen proj4: größte Abweichung ${(zurueck * 1000).toFixed(1)} mm`);
/* Export der Laserpunkte (laser-werk.js, dbrefPunkt): UTM32 mit Höhe → DB_REF, mit den
 * Hin-Parametern der Ril 883.9010. Referenz proj4 2.12.1, UTM32 → EPSG:5683/5684 wie oben,
 * Ellipsoidhöhe = Höhe + 47 m. Die Ril-Parameter der Hinrichtung weichen von der Umkehrung
 * der Rückrichtung (proj4) überall um rund 0,7 mm ab — Rundung der veröffentlichten Werte. */
const werk = readFileSync(new URL('../laser-werk.js', import.meta.url), 'utf8');
const wStueck = werk.slice(werk.indexOf('const DBREF_HIN'), werk.indexOf('/* Streng gerechnet'));
const { dbrefPunkt } = new Function(wStueck + '; return { dbrefPunkt };')();
// [Rechts UTM, Hoch UTM, Höhe, Streifen, Rechts GK, Hoch GK]
const MIT_HOEHE = [
  [613500, 5478500, 400, 3, 3613620.5286, 5480253.0816],
  [613500, 5478500, 400, 4, 4396118.2317, 5480059.3095],
  [690000, 5290000, 1800, 4, 4465171.1771, 5288667.8200],
  [560000, 5520000, 150, 3, 3560098.7762, 5521769.2529],
  [640000, 5400000, 600, 4, 4419499.3379, 5400548.0567],
];
let mitH = 0;
for (const [e, n, h, s, r, hh] of MIT_HOEHE) {
  const [rr, h2] = dbrefPunkt(e, n, h, s);
  mitH = Math.max(mitH, Math.hypot(rr - r, h2 - hh));
}
const ok3 = mitH < 0.001;
console.log(`${ok3 ? 'ok    ' : 'FEHLER'}  Export UTM32 mit Höhe → DB_REF gegen proj4: größte Abweichung ${(mitH * 1000).toFixed(1)} mm`);
/* DHDN über BeTA2007 (DXF-Import, dhdnBetaZurueck + beta2007.bin). Referenz PROJ 9 (pyproj 3.8.0),
 * ETRS89 → inv hgridshift de_adv_BETA2007.tif → tmerc Bessel, GK2–GK4, 12.11.2026. */
const dStueck = src.slice(src.indexOf('function dxfNachGrad'), src.indexOf('/** Auswahl des Systems'));
const { dhdnBetaZurueck } = new Function(stueck + dStueck + '; return { dhdnBetaZurueck };')();
const gitter = new Float32Array(readFileSync(new URL('../beta2007.bin', import.meta.url)).buffer.slice(0));
// [lat, lon, Rechts, Hoch]
const BETA_REF = [
  [49.66417, 10.05845, 3576487.953, 5503592.698], [47.5, 10.2, 3590487.183, 5263092.928],
  [50.4, 9.6, 3542733.895, 5585072.687], [48.1, 11.6, 4470314.801, 5329181.12],
  [49.45, 11.08, 4433397.284, 5479638.123], [47.6, 12.98, 4573803.675, 5273975.731],
  [50.3, 12.1, 4507231.066, 5573779.105], [52.52, 13.4, 4595132.426, 5821685.882],
  [53.55, 10.0, 3566350.279, 5935856.645], [51.0, 7.0, 2570240.367, 5652122.837],
  [48.78, 9.18, 3513304.182, 5404737.975], [54.3, 13.1, 4571714.123, 6019426.737],
  [47.7, 7.6, 3394996.798, 5285581.695],
];
let beta = 0;
for (const [lat, lon, r, h] of BETA_REF) {
  const [la, lo] = dhdnBetaZurueck(r, h, gitter);
  beta = Math.max(beta, Math.hypot((la - lat) * 111320, (lo - lon) * 111320 * Math.cos(lat * Math.PI / 180)));
}
const ok4 = beta < 0.002;
console.log(`${ok4 ? 'ok    ' : 'FEHLER'}  DHDN über BeTA2007 gegen PROJ: größte Abweichung ${(beta * 1000).toFixed(1)} mm an ${BETA_REF.length} Punkten`);
process.exit(ok && ok2 && ok3 && ok4 ? 0 : 1);
