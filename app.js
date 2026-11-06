/* Topovo — Streckenkilometer auf der Karte
 *
 * Zwei Richtungen:
 *   Strecke + km  → Position   (OpenRailwayMap-API, dazwischen wird interpoliert)
 *   Klick/Karte   → Strecke + km (Projektion auf die geladenen Kilometersteine)
 *
 * Die API kennt nur die erste Richtung; die zweite rechnet der Browser aus den
 * bereits geladenen Steinen. Nur wenn weit weg von der geladenen Strecke geklickt
 * wird, muss Overpass sagen, welche Strecke dort überhaupt liegt.
 *
 * Copyright (C) 2026 Michael Steidl
 *
 * Dieses Programm ist freie Software: Sie können es unter den Bedingungen der
 * GNU General Public License, Version 3, weitergeben und/oder verändern.
 * Es wird ohne jede Gewährleistung bereitgestellt — siehe die Datei LICENSE
 * oder <https://www.gnu.org/licenses/>.
 */

'use strict';

const API = 'https://api.openrailwaymap.org/v2';
const LIMIT = 200;           // Maximum der API je Abfrage
/* Bis zu welcher Lücke zwischen zwei Steinen wird interpoliert?
 *
 * Gemessen über 1869 Steintripel (ein Stein übersprungen, über die Lücke
 * interpoliert, mit seiner echten Lage verglichen) schlägt die Interpolation
 * die Anzeige des nächstgelegenen Steins über den ganzen Bereich:
 *
 *   Steinabstand   interpoliert   nächster Stein   interpoliert besser
 *   250– 700 m       22 m            176 m              99 %
 *   700–1200 m       33 m            206 m              98 %
 *  1200–2000 m       36 m            401 m              98 %
 *  2000–4000 m       49 m            836 m             100 %
 *  4000–7000 m      265 m           1617 m             100 %
 *
 * Eine engere Grenze verschenkt also nur Genauigkeit. Jenseits von 8 km ist
 * die Datenlage zu dünn, um es zu belegen — dort bleibt es beim nächsten Stein.
 */
const MAX_GAP_KM = 8;

/* Für die gezeichnete Linie und das Antippen der Karte gilt eine engere Grenze:
 * Eine Gerade über viele Kilometer unbekannten Verlaufs sieht auf der Karte
 * falsch aus und würde Klicks weit neben dem echten Gleis an sich ziehen. */
const MAX_DRAW_GAP_KM = 3;

/* Und für die Rechnung entlang des echten Gleises noch einmal weiter.
 *
 * MAX_GAP_KM begrenzt die geradlinige Interpolation, weil dort jenseits von
 * 8 km die Datenlage zu dünn war, um sie zu belegen. Am Gleisverlauf entlang
 * gilt das nicht: An 1802 übersprungenen Zwischensteinen nachgemessen liegt
 * der Fehler bei 8–15 km Steinabstand im Median bei 16 m und im ungünstigen
 * Zehntel bei 52 m, bei 15–25 km bei 19 und 42 m — also nicht schlechter als
 * bei 3–8 km (25 und 106 m). Die Prüfung Gleisweg gegen Kilometerdifferenz
 * fängt die Fehlpaare ohnehin ab.
 *
 * Gemeldet an Strecke 5321 bei 49,520913 / 10,274394: Der Punkt liegt 15 m
 * vom Gleis, aber in einer Steinlücke von 9 km zwischen km 87,2 und 96,2 —
 * mit der alten Grenze wurde dieses Paar gar nicht erst gebildet. */
const MAX_GLEIS_GAP_KM = 25;
const CLICK_TOL_PX = 34;     // Klicktoleranz quer zur Strecke
/* Ab wie viel abgeschnittenem Weg lohnt es, den Kilometer entlang des Gleises
 * statt über die Sehne zu lesen? Gemessen an 553 Zwischensteinen — siehe
 * kartePunkt(). Nur wirksam, wo der Verlauf mitgeliefert ist. */
const UMWEG_GRENZE = 200;
/* Toleranz quer zur Strecke für einen gesetzten Punkt statt eines Fingertipps —
 * etwa aus einer KML-Datei. Dessen Koordinate steht fest und soll nicht je nach
 * Zoomstufe an eine andere Linie springen; 80 m ist derselbe Umkreis, mit dem
 * linesNear nach der Strecke unter dem Punkt sucht. */
const PUNKT_TOL = 80;
/* Und für die laufende Anzeige aus dem Standort: Wie weit darf man querab der
 * Steine stehen, damit noch ein Kilometer angezeigt wird?
 *
 * Hergeleitet, nicht nachgemessen: PUNKT_TOL ist der feste Anteil — derselbe
 * Umkreis, mit dem linesNear nach der Strecke unter einem Punkt sucht. Dazu
 * kommt die vom Gerät gemeldete Ortungsgenauigkeit, denn unter Bäumen oder im
 * Einschnitt sind das schnell 30 m, und die sollen die Anzeige nicht ausgehen
 * lassen. Nach oben gedeckelt, weil ein schlechter Fix sonst eine Strecke
 * einfängt, an der man gar nicht läuft. */
const LIVE_TOL_MAX = 250;
/* Unter dieser Bewegung wird nicht neu gerechnet: Im Stand wandert der Fix um
 * einige Meter, und die angezeigte Zahl soll dabei stehen bleiben. */
const LIVE_MIN_WEG = 5;
/* Wie weit wird nach einer Kilometerangabe gesucht, die der ORM-Abfrage als
 * Startwert dient? Der Wert muss nur grob stimmen — die API liefert danach die
 * Steine ringsum.
 *
 * Anfangs standen hier 4 km, mit der Begründung, weiter hinauszuschauen bringe
 * Angaben fremder Strecken ins Spiel. Gemeldet an Strecke 5321 bei 49,520913 /
 * 10,274394 lag der nächste Kilometerpunkt aber 4038 m entfernt — 38 m zu weit,
 * und die Suche fiel auf einen Notbehelf zurück, der die falsche Seite erwischte.
 * Aus den Kacheln lassen sich die Punkte ohnehin der Strecke zuordnen, auf der
 * sie stehen; damit ist der weite Radius unbedenklich. */
const SEED_RADIUS = 12000;
const STORE_KEY = 'topovo.v3';
/* Frühere Namen der App (TrackPilot bis November 2026, davor Railnav), neuester
 * zuerst. Beim ersten Start übernommen, damit Einstellungen und Verlauf die
 * Umbenennungen überleben, und danach gelöscht. */
const STORE_KEYS_ALT = ['trackpilot.v3', 'railnav.v3'];

/* Mehrere Instanzen, weil einzelne zeitweise ausfallen: Die Hauptinstanz war
 * zwischenzeitlich aus dem Testnetz gar nicht erreichbar (HTTP 406), kumi hat
 * bei der schweren Geometrieabfrage mit 504 abgebrochen. Der Reihe nach
 * durchprobieren, die erste brauchbare Antwort gewinnt. */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

/* Ortssuche. Photon ist genau dafür gebaut — Treffer schon beim Tippen, und
 * es nimmt einen Punkt entgegen, um in der Nähe zu bevorzugen. Das ist hier
 * der halbe Nutzen: Wer an der Strecke steht und „Ebing“ tippt, meint das
 * Ebing vor sich und nicht eines drei Länder weiter.
 *
 * Nominatim liegt dahinter, falls Photon nicht antwortet. Es bittet
 * ausdrücklich darum, nicht für Tippvorschläge benutzt zu werden — deshalb
 * nur als Ausweichweg und nie während Photon läuft. */
const PHOTON = 'https://photon.komoot.io/api/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/* ============================ Helfer ============================ */

const $ = sel => document.querySelector(sel);

/* Ereignis und Wert nur setzen, wenn das Element existiert.
 * Passen HTML und Skript einmal nicht zusammen — etwa weil der Browser eine
 * ältere Seite aus dem Cache hält —, soll nicht die ganze App an einer
 * fehlenden Schaltfläche scheitern. */
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); return el; };
const setVal = (sel, v) => { const el = $(sel); if (el) el.value = v; };
const nfKm = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const nfM = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nfH = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const fmtKm = v => nfKm.format(v);
const fmtCoord = (lat, lon) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Keine eigene Route mehr: In Google Maps ist sie ein Tipp, zwei Knöpfe dafür waren zu viel
const gmapsUrl = (lat, lon) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;

/* Street View als Deep-Link. Kein Google-Code und kein Schlüssel in der App —
 * Google erfährt die Stelle erst, wenn man dorthin springt. Google sucht das nächste
 * Panorama selbst; gibt es keins, steht dort die Karte. Eingebettet (Embed API) ginge
 * auch, aber Google untersagt seine Dienste neben einer fremden Karte. blick in Grad
 * ab Nord, am Gleis die Richtung steigender Kilometer.
 *
 * Überall derselbe Griff: Street View liegt hinter einem langen Druck auf „In Google
 * Maps öffnen" (svBinden), am Rechner hinter dem Rechtsklick. Ohne Hinweis darunter
 * (06.11.2026 so gewünscht: am Rechner ergab „lang drücken“ keinen Sinn und brach den
 * Knopf zweizeilig um, dann auch am Handy weg). In den Sprechblasen ist der
 * Maps-Link dafür ein Knopf wie „Kilometer bestimmen" und steht zuerst (mapsKnopf) —
 * als kleiner Textlink war er dort zu umständlich zu treffen. */
const svUrl = (lat, lon, blick) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}` +
  (Number.isFinite(blick) ? `&heading=${Math.round(((blick % 360) + 360) % 360)}` : '');
const svAttr = (lat, lon) => ` data-sv="${lat.toFixed(6)},${lon.toFixed(6)}"`;
const mapsKnopf = (lat, lon) =>
  `<a class="kml-km" href="${gmapsUrl(lat, lon)}"${svAttr(lat, lon)} target="_blank" rel="noopener">` +
  'In Google Maps öffnen</a>';

/** "12+250" → 12.25, "12,5" → 12.5 */
function toKm(token) {
  const t = String(token).trim();
  const hm = /^(-?)(\d+)\+(\d{1,3})$/.exec(t);
  if (hm) {
    const frac = parseInt(hm[3].padEnd(3, '0'), 10) / 1000;
    return (hm[1] === '-' ? -1 : 1) * (parseInt(hm[2], 10) + frac);
  }
  return parseFloat(t.replace(',', '.'));
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/* ============================ API ============================ */

async function tryFetch(url, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (err) {
    /* Bricht der Abruf an der Zeitgrenze ab, meldet der Browser das als
     * "signal is aborted without reason" — das hilft niemandem weiter. */
    if (err.name === 'AbortError') throw new Error(`keine Antwort binnen ${Math.round(timeout / 1000)} s`);
    if (err.name === 'TypeError') throw new Error('keine Verbindung');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Nur Direktabruf. Bis 29.09.2026 ging jede gescheiterte Anfrage still an den
 * öffentlichen Proxy allorigins.win: Suchtexte landeten bei einem Dritten, und
 * der hätte die Lage der Kilometersteine beliebig verfälschen können. Die
 * ORM-API sendet selbst CORS-Header, der Umweg bringt nichts. */
async function getJson(url) {
  return tryFetch(url, 15000);
}

/* Je Strecke werden alle geladenen Steine gesammelt. Die API antwortet im festen
 * Umkreis von 10 km um die angefragte Position, unsortiert und auf LIMIT gekappt. */
const lineCache = new Map();

function bracketOf(sorted, km) {
  let lower = null, upper = null, exact = null;
  for (const p of sorted) {
    if (Math.abs(p.km - km) < 5e-4) { exact = p; break; }
    if (p.km < km) lower = p;
    else if (upper === null) { upper = p; break; }
  }
  return { lower, upper, exact };
}

/** Sind zwei Steine plausibel benachbart?
 *
 *  Die Luftlinie zwischen zwei Punkten kann nie länger sein als die Strecke
 *  entlang des Gleises. Ist sie es doch, gehören die beiden nicht zusammen:
 *  Streckennummern tauchen in den Daten mehrfach auf, an Abzweigen und bei
 *  Nummernwechseln liegen gleiche Kilometerwerte an ganz anderen Orten.
 *  Ohne diese Prüfung würde quer durchs Land interpoliert.
 */
function segmentOk(a, b, maxGap = MAX_GAP_KM) {
  const dkm = b.km - a.km;
  if (dkm <= 0 || dkm > maxGap) return false;
  return haversine(a.lat, a.lon, b.lat, b.lon) <= dkm * 1000 * 1.25 + 50;
}

/** Warum ein Paar nicht taugt — für die Anzeige, damit dort kein falscher Grund steht. */
function rejectReason(a, b) {
  const dkm = b.km - a.km;
  if (dkm <= 0) return null;
  if (dkm > MAX_GAP_KM) return 'luecke';
  if (haversine(a.lat, a.lon, b.lat, b.lon) > dkm * 1000 * 1.25 + 50) return 'geometrie';
  return null;
}

function hasBracket(sorted, km) {
  const b = bracketOf(sorted, km);
  return !!(b.exact || (b.lower && b.upper && segmentOk(b.lower, b.upper)));
}

/* Doppelsteine. An zweigleisigen Strecken trägt jedes Gleis sein eigenes
 * Schild, und beide stehen am selben Querschnitt — mal mit demselben Kilometer,
 * mal mit verschiedenem. An Strecke 5100 bei Breitengüßbach stehen auf Gleis 1
 * 12,4 · 12,6 · 12,8, auf Gleis 2 an denselben Stellen 12,393 · 12,612 · 12,819
 * (in OSM `railway:position:exact`, die API gibt diesen Wert als Kilometer
 * aus), 4 m quer daneben. Als Nachbarn in der Liste ergaben sie Paare von 7 bis
 * 24 m Kilometerdifferenz auf 1–2 m Gleis: Kein Gleisweg passte, die Lage
 * sprang zwischen den Gleisen hin und her, und Suche und Kartentipp lagen dort
 * bis 18 m auseinander.
 *
 * Fürs Rechnen werden solche Steine zu einem zusammengefasst, Lage und
 * Kilometer gemittelt — welcher der beiden Werte stimmt, sagen die Daten nicht.
 * Auf der Karte stehen weiter alle (e.alle). Als Doppelstein gilt, was
 * höchstens DOPPEL_KM auseinander und DOPPEL_M voneinander entfernt steht.
 * Gesehen auf sechs Strecken (5100, 5302, 5320, 5850, 5900, 5910): 0 bis 25 m
 * Kilometerdifferenz — echte Nachbarsteine liegen 100 m auseinander, die
 * Grenze von 30 m lässt auch ein 50-m-Raster in Ruhe. Und bis zu 78 m Abstand:
 * Die Schilder sitzen an Oberleitungsmasten, und gleiche Werte stehen auf den
 * beiden Gleisen auch mal ein Mastfeld versetzt (5100 zweimal km 6,2 74 m
 * auseinander, 5320 zweimal 27,8 78 m). Ungeteilt lief die Steinkette dort im
 * Zickzack, und Suche und Kartentipp wählten verschiedene Paare. Bei genau
 * gleichem Kilometer reicht es bis DOPPEL_GLEICH_M: dieselbe Zahl heißt
 * derselbe Querschnitt, auch wo die Gleise im Bahnhof auseinanderlaufen
 * (5320 ein dritter km 27,8 94 m neben den beiden anderen). */
const DOPPEL_KM = 0.03;
const DOPPEL_M = 80;
const DOPPEL_GLEICH_M = 150;

function steineVereinen(sorted) {
  const gruppen = [];
  for (const p of sorted) {
    /* Rückwärts durch die Gruppen, die im Kilometer nah genug liegen — nicht nur
     * die letzte: Dazwischen kann ein Stein derselben Nummer von ganz woanders
     * stehen, Streckennummern kommen mehrfach vor. */
    let ziel = null;
    for (let i = gruppen.length - 1; i >= 0 && p.km - gruppen[i][0].km <= DOPPEL_KM + 1e-9; i--) {
      const grenze = Math.abs(p.km - gruppen[i][0].km) < 1e-6 ? DOPPEL_GLEICH_M : DOPPEL_M;
      if (gruppen[i].some(q => haversine(q.lat, q.lon, p.lat, p.lon) <= grenze)) { ziel = gruppen[i]; break; }
    }
    if (ziel) ziel.push(p);
    else gruppen.push([p]);
  }
  const liste = gruppen.map(g => {
    if (g.length === 1) return g[0];
    const mittel = f => g.reduce((s, p) => s + p[f], 0) / g.length;
    return { ...g[0], km: Math.round(mittel('km') * 1e6) / 1e6, lat: mittel('lat'), lon: mittel('lon'), doppel: g };
  }).sort((a, b) => a.km - b.km);

  /* Die Lage aber nicht gemittelt, sondern die des Schildes am linken Gleis (in
   * Richtung steigender Kilometer, aus den Nachbarsteinen). Die Mitte lag
   * zwischen beiden Gleisen gleich weit von jedem; ein Steinpaar hängte sie an
   * das eine, das nächste an das andere, und an jedem Doppelstein sprang die
   * Lage um den Gleisabstand quer — auf 5100 bei km 12,4 um 7,7 m. Immer links
   * heißt: alle Doppelsteine einer Strecke am selben Gleis. */
  liste.forEach((p, i) => {
    if (!p.doppel) return;
    const vor = [liste[i - 1], liste[i - 2]].find(q => q && segmentOk(q, p));
    const nach = [liste[i + 1], liste[i + 2]].find(q => q && segmentOk(p, q));
    const a = vor || p, b = nach || p;
    if (a === b) return;                   // ohne Nachbarn keine Richtung — dann bleibt die Mitte
    const kx = Math.cos(p.lat * Math.PI / 180);
    const dx = (b.lon - a.lon) * kx, dy = b.lat - a.lat;
    let links = null, wert = -Infinity;
    for (const q of p.doppel) {
      const w = dx * (q.lat - p.lat) - dy * (q.lon - p.lon) * kx;
      if (w > wert) { wert = w; links = q; }
    }
    p.lat = links.lat;
    p.lon = links.lon;
  });
  return liste;
}

/* Vertippte Steine. An Strecke 5100 stehen zwei Doppelsteine „55,8" und
 * „55,846" 200 m neben km 46; der echte km 56 liegt 10 km weiter. Gemeint ist
 * 45,8. Als Paar passen die beiden zueinander, aber zu keinem Nachbarn. Solange
 * sie im Zickzack zwischen beiden Gleisen standen, verloren sie beim Antippen
 * knapp gegen das richtige Paar (44,8–46, 1–2 m daneben); vereint am selben
 * Gleis lagen sie genau darauf, und ein Tipp dort ergab km 55,84 — umgekehrt
 * landete die Suche nach km 55,84 bei km 45,8.
 *
 * Herausgenommen wird deshalb ein einzelnes Paar, dessen Nachbarn auf beiden
 * Seiten geometrisch unmöglich sind (Luftlinie länger als der Kilometer erlaubt)
 * und das keine INSEL_M neben dem Streckenzug der übrigen Steine liegt. Die
 * letzte Bedingung schützt Steinreihen, die unter derselben Nummer an zwei
 * Orten liegen und sich im Kilometer verzahnen — die liegen fern jedes fremden
 * Streckenzugs. Auf sechs Strecken traf das genau dieses eine Paar. */
const INSEL_M = 100;

function inselnWeg(liste) {
  const ok = liste.map((b, i) => i > 0 && segmentOk(liste[i - 1], b, MAX_GLEIS_GAP_KM));
  const weg = new Set();
  for (let i = 2; i < liste.length - 1; i++) {
    if (!ok[i] || ok[i - 1] || ok[i + 1]) continue;          // ein Paar, das allein steht
    const a = liste[i - 1], b = liste[i];
    if (rejectReason(liste[i - 2], a) !== 'geometrie' || rejectReason(b, liste[i + 1]) !== 'geometrie') continue;
    const nahe = p => liste.some((q, j) => {
      if (j === 0 || j === i || !ok[j]) return false;
      const r = liste[j - 1], ky = 110540, kx = Math.cos(p.lat * Math.PI / 180) * 111320;
      const ax = r.lon * kx, ay = r.lat * ky, dx = q.lon * kx - ax, dy = q.lat * ky - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.lon * kx - ax) * dx + (p.lat * ky - ay) * dy) / len2)) : 0;
      return Math.hypot(p.lon * kx - ax - t * dx, p.lat * ky - ay - t * dy) <= INSEL_M;
    });
    if (nahe(a) && nahe(b)) { weg.add(a); weg.add(b); }
  }
  return weg.size ? liste.filter(p => !weg.has(p)) : liste;
}

/* e.alle: jeder Stein, wie er erfasst ist — für die Karte. e.sorted: Doppelsteine
 * zusammengefasst, vertippte Inseln heraus — für jede Rechnung, in beiden
 * Richtungen dieselbe Liste. */
function storeFor(ref) {
  let e = lineCache.get(ref);
  if (!e) { e = { pts: new Map(), alle: [], sorted: [], probes: [], lastCount: 0 }; lineCache.set(ref, e); }
  return e;
}

async function probe(ref, e, km) {
  const data = await getJson(`${API}/milestone?ref=${encodeURIComponent(ref)}&position=${km}&limit=${LIMIT}`);
  // Erst nach erfolgreicher Antwort merken — sonst würde ein Netzfehler die
  // Strecke dauerhaft als „schon abgefragt" markieren.
  e.probes.push(km);
  e.lastCount = Array.isArray(data) ? data.length : 0;
  if (Array.isArray(data)) {
    for (const d of data) {
      if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number' || d.position == null) continue;
      e.pts.set(d.osm_id, {
        id: d.osm_id, km: Number(d.position),
        lat: d.latitude, lon: d.longitude,
        operator: d.operator || '', ref: d.ref || ref
      });
    }
    e.alle = [...e.pts.values()].sort((a, b) => a.km - b.km);
    e.sorted = inselnWeg(steineVereinen(e.alle));
  }
}

async function coverage(ref, km) {
  const e = storeFor(ref);
  const probedHere = e.probes.some(p => Math.abs(p - km) < 0.75);
  if (hasBracket(e.sorted, km) || probedHere) return e;

  await probe(ref, e, km);

  // Auf dicht erfassten Strecken (Steine alle 100 m) kann der passende Nachbar
  // durch das LIMIT abgeschnitten sein — dann das Fenster verschieben.
  if (e.lastCount >= LIMIT && !hasBracket(e.sorted, km)) {
    for (const shift of [-6, 6]) {
      if (e.probes.some(p => Math.abs(p - (km + shift)) < 0.75)) continue;
      await probe(ref, e, km + shift);
      if (hasBracket(e.sorted, km)) break;
    }
  }
  return e;
}

/* ============================ Auflösung ============================ */

async function resolvePoint(ref, km) {
  /* Zuerst die Kilometrierung der DB InfraGO (infrago.js): an Bahnübergängen
   * nachgemessen 2,5 m im Median gegen 9,9 m zwischen zwei OSM-Steinen, und
   * ohne Netz, sobald die Strecke einmal geladen war. Die Steine bleiben für
   * alles, was InfraGO nicht kennt. */
  const ifg = await ifgLage(ref, km).catch(() => null);
  if (ifg) return ifg;

  const e = await coverage(ref, km);
  if (!e.sorted.length) {
    throw new Error(`Für Strecke ${ref} sind keine Kilometersteine erfasst — Nummer prüfen.`);
  }

  const { lower, upper, exact } = bracketOf(e.sorted, km);

  if (exact) {
    return { lat: exact.lat, lon: exact.lon, quality: 'exakt', operator: exact.operator, lineRef: exact.ref };
  }

  // Ein Paar, das die Plausibilitätsprüfung nicht besteht, wird unten als Grund
  // ausgewiesen — sonst steht da nur „kein Stein erfasst" und niemand versteht,
  // warum trotz zweier Nachbarsteine nicht interpoliert wurde.
  let verworfen = null;

  if (lower && upper) {
    const span = upper.km - lower.km;
    const grund = rejectReason(lower, upper);
    if (grund) {
      verworfen = {
        grund, von: lower.km, bis: upper.km,
        luftlinie: haversine(lower.lat, lower.lon, upper.lat, upper.lon),
        entlang: span * 1000
      };
    }
    if (segmentOk(lower, upper)) {
      const t = (km - lower.km) / span;
      const geo = haversine(lower.lat, lower.lon, upper.lat, upper.lon);
      return {
        lat: lower.lat + t * (upper.lat - lower.lat),
        lon: lower.lon + t * (upper.lon - lower.lon),
        quality: 'interpoliert',
        between: [lower.km, upper.km],
        spanRatio: geo / (span * 1000),
        chord: geo,
        err: interpolationError(geo),
        operator: lower.operator || upper.operator,
        lineRef: lower.ref || upper.ref
      };
    }
  }

  /* Steinlücke über MAX_GAP_KM: geradlinig nicht mehr, am Gleisverlauf entlang
   * aber schon — bis MAX_GLEIS_GAP_KM, dieselbe Grenze wie beim Antippen der
   * Karte. Vorher galt sie nur in dieser einen Richtung: An Strecke 5321 lieferte
   * ein Tipp in der Lücke km 87,2–96,2 den Kilometer am Gleis entlang, die
   * Eingabe „5321 90" dagegen den Stein bei km 87,2 mit „2,8 km daneben". */
  if (verworfen && verworfen.grund === 'luecke') {
    /* rejectReason prüft die Lücke vor der Geometrie. Für die Anzeige zählt aber
     * der wahre Grund: Ein 12-km-Paar, das geometrisch nicht zusammenpasst, ist
     * kein „über 25 km". */
    if (upper.km - lower.km > MAX_GLEIS_GAP_KM) verworfen.zuWeit = true;
    else if (!segmentOk(lower, upper, MAX_GLEIS_GAP_KM)) verworfen.grund = 'geometrie';
    else {
      const weit = await gleisWeit(lower, upper, km);
      if (weit) return weit;
    }
  }

  // Jenseits des äußersten Steins: am Gleis entlang hinauslaufen statt aufgeben
  if (e.sorted.length > 1) {
    const hinaus = await extrapolieren(ref, km, e.sorted);
    if (hinaus) return hinaus;
  }

  const near = e.sorted.reduce((a, b) => Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a);
  return {
    lat: near.lat, lon: near.lon, quality: 'naechster',
    delta: near.km - km, nearKm: near.km, verworfen,
    operator: near.operator, lineRef: near.ref
  };
}

/** Position zu einem Kilometer in einer weiten Steinlücke, am Gleisweg abgetragen.
 *
 *  Erst aus den mitgelieferten Kacheln, sonst über Overpass: Die Suche ist ein
 *  bewusster Griff, da darf sie ein paar Sekunden kosten. Ob der Weg zum Paar
 *  passt, prüft wegAusWegen (Gleisweg gegen Kilometerdifferenz). Klappt beides
 *  nicht, gibt es null, und es bleibt beim nächsten Stein. */
async function gleisWeit(A, B, km) {
  let weg = null;
  try {
    weg = await gleisWegZwischen(A, B, true);
    if (!weg) {
      /* Nicht in den Kacheln: Overpass braucht dafür 15–40 s. Ohne Zeile unten
       * liefe nur der dünne Balken, und die App sähe aus, als hinge sie. */
      showStatus(`Zwischen km ${fmtKm(A.km)} und ${fmtKm(B.km)} ist kein Stein erfasst. ` +
        `Hole den Gleisverlauf von Overpass — das dauert einige Sekunden …`);
      weg = await gleisWegZwischen(A, B);
    }
  } catch { return null; }
  if (!weg) return null;
  const t = (km - A.km) / (B.km - A.km);
  const pos = pointAlong(weg.path, t * weg.length);
  return {
    lat: pos.lat, lon: pos.lon, quality: 'gleis-weit',
    between: [A.km, B.km], chord: haversine(A.lat, A.lon, B.lat, B.lon),
    wegLaenge: weg.length, nominal: weg.nominal, pfad: weg.path,
    operator: A.operator || B.operator, lineRef: A.ref || B.ref
  };
}

async function searchFacility(query) {
  const data = await getJson(`${API}/facility?q=${encodeURIComponent(query)}&limit=8`);
  if (!Array.isArray(data)) return [];
  return data
    .filter(d => typeof d.latitude === 'number' && typeof d.longitude === 'number')
    .sort((a, b) => (b.rank || 0) - (a.rank || 0))
    .slice(0, 5)
    .map(d => ({
      lat: d.latitude, lon: d.longitude,
      name: d.name || d.short_name || query,
      kind: d.railway || '',
      ds100: d['railway:ref'] || '',
      uic: d.uic_ref || '',
      operator: d.operator || ''
    }));
}

/* Freitext → Orte. Antwort ist GeoJSON; `extent` ist die Ausdehnung des
 * Objekts als [West, Nord, Ost, Süd] und erlaubt, eine Stadt passend zu
 * zeigen statt mit festem Zoom mitten hinein. */
async function searchOrt(text, signal) {
  const c = map.getCenter();
  // Zwei Stellen (etwa 1 km) reichen, um nahe Treffer vorzuziehen. Nach einer
  // Ortung ist die Kartenmitte der eigene Standort, der soll nicht genauer raus.
  const nah = `&lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}`;
  try {
    const j = await holJson(`${PHOTON}?q=${encodeURIComponent(text)}&lang=de&limit=10${nah}`, signal);
    /* Bahnobjekte fliegen raus: Nach „Bamberg“ kamen von dort drei weitere
     * Zeilen namens Bamberg zurück — Bahnhof, zwei Haltestellen —, die alle
     * dasselbe meinen wie der Treffer, der schon oben in der Liste steht.
     * Der stammt aus der OpenRailwayMap-Suche und bringt DS100 und UIC mit. */
    return entdoppeln((j.features || [])
      .filter(f => (f.properties || {}).osm_key !== 'railway')
      .map(photonZeile).filter(Boolean));
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    const j = await holJson(
      `${NOMINATIM}?format=jsonv2&limit=8&accept-language=de&q=${encodeURIComponent(text)}`, signal);
    return entdoppeln((Array.isArray(j) ? j : []).map(nominatimZeile).filter(Boolean));
  }
}

/* Gleicher Name an derselben Stelle (auf rund 100 m genau) kommt nur einmal
 * in die Liste — Gemeinde und Ortsteil sind dort oft doppelt erfasst. */
function entdoppeln(liste) {
  const gesehen = new Set();
  const raus = [];
  for (const t of liste) {
    const schluessel = `${t.name}|${t.lat.toFixed(3)}|${t.lon.toFixed(3)}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    raus.push(t);
    if (raus.length >= 5) break;
  }
  return raus;
}

/* Eigener Abruf statt getJson: beim Tippen darf nichts 15 Sekunden hängen und
 * erst recht nicht über einen fremden Proxy laufen. */
async function holJson(url, signal) {
  const ctrl = new AbortController();
  const ab = () => ctrl.abort();
  if (signal) { if (signal.aborted) ab(); else signal.addEventListener('abort', ab); }
  const timer = setTimeout(ab, 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', ab);
  }
}

/* Was für ein Ding ist der Treffer? Ohne das stehen in der Liste mehrere
 * Zeilen „Bamberg · Bayern“ untereinander, und es ist nicht zu erkennen,
 * welche die Stadt ist und welche die Straße darin. */
const ORT_ART = {
  city: 'Stadt', town: 'Stadt', village: 'Dorf', hamlet: 'Weiler',
  suburb: 'Ortsteil', quarter: 'Ortsteil', neighbourhood: 'Ortsteil', borough: 'Stadtbezirk',
  municipality: 'Gemeinde', isolated_dwelling: 'Wohnplatz', farm: 'Hof', locality: 'Örtlichkeit',
  county: 'Landkreis', state: 'Land', region: 'Region', country: 'Staat'
};

function ortArt(key, value, hausnummer) {
  if (hausnummer) return 'Adresse';
  if (key === 'highway') return 'Straße';
  if (key === 'place') return ORT_ART[value] || 'Ort';
  if (key === 'boundary') return ORT_ART[value] || 'Gebiet';
  if (key === 'waterway' || key === 'natural') return 'Gewässer';
  return '';
}

function photonZeile(f) {
  const p = f.properties || {};
  const c = (f.geometry || {}).coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const strasse = [p.street, p.housenumber].filter(Boolean).join(' ');
  const name = p.name || strasse || p.city || p.county || p.state;
  if (!name) return null;

  const teile = [ortArt(p.osm_key, p.osm_value, p.housenumber)];
  if (strasse && strasse !== name) teile.push(strasse);
  if (p.postcode) teile.push(p.postcode);
  for (const s of [p.city, p.county, p.state]) {
    if (s && s !== name && !teile.includes(s)) teile.push(s);
  }
  if (p.country && p.country !== 'Deutschland') teile.push(p.country);

  const e = p.extent;
  return {
    art: 'ort', name, sub: teile.filter(Boolean).slice(0, 4).join(' · '),
    lat: c[1], lon: c[0],
    bbox: Array.isArray(e) && e.length === 4 ? [[e[3], e[0]], [e[1], e[2]]] : null,
    typ: p.osm_value || p.type || ''
  };
}

function nominatimZeile(d) {
  const lat = Number(d.lat), lon = Number(d.lon);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const teile = String(d.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
  const bb = d.boundingbox;   // [Süd, Nord, West, Ost] als Zeichenketten
  return {
    art: 'ort',
    name: d.name || teile[0] || '',
    sub: [ortArt(d.category, d.type, 0), ...teile.slice(1, 4)].filter(Boolean).join(' · '),
    lat, lon,
    bbox: Array.isArray(bb) && bb.length === 4
      ? [[Number(bb[0]), Number(bb[2])], [Number(bb[1]), Number(bb[3])]] : null,
    typ: d.type || ''
  };
}

/* ============================ Geometrie ============================ */

/* Wie weit liegt die geradlinige Interpolation zwischen zwei Steinen daneben?
 *
 * Gemessen statt gerechnet: auf vierzehn Strecken wurde über 1474 Steintripel
 * jeweils der mittlere Stein übersprungen, über die Lücke interpoliert und mit
 * seiner tatsächlichen Lage verglichen.
 *
 * Das überraschende Ergebnis: auf nahezu geraden Abschnitten (Bogenhalbmesser
 * über 4000 m), wo die Interpolation exakt sein müsste, wurden trotzdem 10–29 m
 * Abweichung gemessen — praktisch dasselbe wie in engen Bögen. Der Bogen ist
 * also nicht der begrenzende Faktor, sondern die Erfassungsgenauigkeit der
 * Steine in OpenStreetMap. Erst ab etwa 700 m Steinabstand schlägt die Krümmung
 * durch (Median 40 m im Bogen gegenüber 22 m auf der Geraden).
 *
 * Eine Formel über den Bogenhalbmesser hat deshalb nichts getaugt — sie hat
 * Rauschen gefittet. Hier stehen stattdessen die gemessenen Verteilungen.
 * Sie enthalten die Streuung der Steinerfassung mit, sind also eine Obergrenze
 * für den Fehler des Verfahrens selbst.
 */
const ERR_TABLE = [
  { upTo: 250, typical: 10, worst: 29 },
  { upTo: 700, typical: 22, worst: 46 },
  { upTo: 1200, typical: 33, worst: 81 },
  { upTo: 2000, typical: 36, worst: 95 },
  { upTo: 4000, typical: 49, worst: 263 },
  { upTo: Infinity, typical: 265, worst: 707 }
];

function interpolationError(chordM) {
  return ERR_TABLE.find(r => chordM < r.upTo);
}

/* Und in der anderen Richtung: Wie genau ist der Kilometer, der aus einem Tipp
 * auf die Karte gelesen wird? Nachgemessen an 2060 echten Steintripeln — den
 * mittleren Stein übersprungen, seine wahre Lage auf die Sehne der beiden
 * Nachbarn projiziert und den dort gelesenen Kilometer mit seinem echten
 * verglichen. Das ist genau dieser Fall, nur mit bekannter Wahrheit:
 *
 *   Steinabstand   Median   90. Perzentil
 *   unter 250 m      10 m       33 m
 *   250– 700 m       14 m       47 m
 *   700–1200 m       20 m       57 m
 *  1200–2000 m       19 m       56 m
 *  2000–3100 m       17 m       60 m
 *
 * Zwei Dinge fallen auf: Jenseits von 700 m wächst der Fehler nicht weiter, und
 * getrennt nach Krümmung liegen nahezu gerade Abschnitte bei 14/49 m, ausgeprägte
 * Bögen bei 19/71 m. Die Sehnennäherung ist hier also kaum schuld — beim Tippen
 * steht die Position ja fest, und entlang eines Kreisbogens ist die Projektion
 * auf die Sehne fast proportional zur Bogenlänge, weil sich die Abweichung zur
 * Mitte hin aufhebt. Übrig bleibt die Erfassungsgenauigkeit der Steine.
 *
 * Deshalb gibt es in dieser Richtung bewusst keine Feinrechnung entlang des
 * Gleises: Sie könnte nur diese wenigen Meter wegnehmen und kostet eine
 * Overpass-Abfrage von einigen Sekunden.
 *
 * Mehr als 3 km Steinabstand kommen hier nicht vor: Weiter auseinanderliegende
 * Steine werden fürs Zeichnen und Antippen gar nicht verbunden (MAX_DRAW_GAP_KM).
 */
const TAP_ERR = [
  { upTo: 250, typical: 10, worst: 33 },
  { upTo: 700, typical: 14, worst: 47 },
  { upTo: 1200, typical: 20, worst: 57 },
  { upTo: 2000, typical: 19, worst: 56 },
  { upTo: Infinity, typical: 17, worst: 60 }
];

function tapError(chordM) {
  return TAP_ERR.find(r => chordM < r.upTo);
}

/* Und der dritte Fall: Kilometer aus der Karte gelesen, wo überhaupt kein
 * brauchbares Steinpaar mehr da ist und stattdessen der echte Gleisverlauf
 * gemessen wird.
 *
 * Nachgemessen wie die beiden Tabellen darüber, an 13 übersprungenen
 * Zwischensteinen auf den Strecken 5321, 5500 und 5741 mit 3,0–6,8 km
 * Steinabstand. Das überraschende Ergebnis: Im Mittel nehmen sich Sehne und
 * Gleisweg nichts (22 m gegenüber 21 m). Der Unterschied steckt im Schwanz —
 * die Sehne lag in 3 der 13 Fälle über 100 m daneben, bis zu 186 m, der
 * Gleisweg in keinem einzigen. Und man sieht dem Ergebnis nicht an, in welchem
 * der beiden Fälle man gerade steckt.
 *
 * Deshalb wird hier gerechnet und nicht geschätzt, obwohl der Median dasselbe
 * sagt. Die Streuung des Vergleichssteins steckt in beiden Zahlen mit drin. */
const GLEIS_ERR = { typical: 21, worst: 88, sehne: 186, ueber100: 3, faelle: 13 };

/* Und jenseits des äußersten Steins, wo es gar kein Paar mehr gibt.
 *
 * Nachgemessen über alle 310 mitgelieferten Kacheln: je Strecke den äußersten
 * Stein übersprungen, vom nächsten aus am Gleis entlang hinausgelaufen und mit
 * seiner wahren Lage verglichen. 3224 Fälle, davon 295 aussortiert, weil der
 * Vergleichsstein weiter Luftlinie entfernt liegt als der Weg am Gleis lang
 * ist — dieselbe Streckennummer an zwei Orten, da taugt der Vergleichswert
 * nicht. Bleiben 2929; mit der Selbstprobe (siehe extrapolieren()) werden
 * davon 1073 beantwortet: Median 13 m, ungünstiges Zehntel 57 m, 99. Perzentil
 * 215 m, schlechtester 2008 m — über 750 m liegen 7 der 1073. Der
 * nächstgelegene Stein, den die App ohne all das zeigen müsste, lag im Median
 * 208 m daneben; besser ist die Rechnung in 1026 der 1073 Fälle.
 *
 * Die Zahlen sind neu: Die alten (Median 35 m, Zehntel 93 m) stammen von vor
 * dem Fehler, den entlangLaufen() beschreibt — dieselbe Messung mit dem alten
 * Lauf ergibt heute Median 20 m und Zehntel 137 m. */
const EXTRA_ERR = { typical: 13, worst: 57, stein: 208, faelle: 2929, beantwortet: 1073 };

/* Am Gleis entlang über weite Steinlücken (8–25 km), die Zahlen aus der Messung
 * bei MAX_GLEIS_GAP_KM: 1802 übersprungene Zwischensteine, im Median 16–19 m,
 * im ungünstigen Zehntel bis 52 m. */
const WEIT_ERR = { typical: 19, worst: 52, faelle: 1802 };

/** Welche Messung für eine Rechnung am Gleis entlang gilt — nach dem Steinabstand,
 *  nicht nach der Richtung. Sonst stand an derselben Stelle der 9-km-Lücke bei
 *  5321 nach dem Tipp „±88 m" (gemessen an 3–7 km) und nach der Eingabe „±52 m". */
const gleisErr = p =>
  p && p.between && p.between[1] - p.between[0] > MAX_GAP_KM ? WEIT_ERR : GLEIS_ERR;

/** Nächster Punkt auf dem Streckenzug der Kilometersteine — liefert auch den Kilometer dort.
 *
 * maxGap steuert, wie weit zwei Steine auseinanderstehen dürfen, um noch
 * verbunden zu werden. Voreinstellung ist die enge Grenze fürs Zeichnen und
 * Antippen; die Feinrechnung entlang des Gleises sucht mit MAX_GAP_KM ein
 * Steinpaar auch über weite Lücken, weil sie danach ohnehin dem echten Verlauf
 * folgt und nicht der Sehne. */
function projectOnLine(sorted, lat, lon, maxGap = MAX_DRAW_GAP_KM) {
  if (!sorted || sorted.length < 2) return null;

  // Lokale ebene Näherung in Metern; auf diesen Entfernungen völlig ausreichend
  const ky = 110540, kx = Math.cos(lat * Math.PI / 180) * 111320;
  const px = lon * kx, py = lat * ky;
  let best = null;

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (!segmentOk(a, b, maxGap)) continue;   // Lücken und Fehlpaare überspringen
    const dkm = b.km - a.km;

    const ax = a.lon * kx, ay = a.lat * ky;
    const dx = b.lon * kx - ax, dy = b.lat * ky - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + t * dx, cy = ay + t * dy;
    const dist = Math.hypot(px - cx, py - cy);
    if (!best || dist < best.dist) {
      // chord entscheidet, welche Zeile von TAP_ERR gilt; spanRatio verraet
      // Kilometerspruenge und falsch zusammengepaarte Steine.
      const chord = Math.sqrt(len2);
      best = { dist, km: a.km + t * dkm, lat: cy / ky, lon: cx / kx,
        between: [a.km, b.km], chord, a, b,
        spanRatio: dkm ? chord / (Math.abs(dkm) * 1000) : null };
    }
  }
  return best;
}

/* ============================ Mitgeliefertes Netz ============================ */

/* Zwei Fragen brauchten bisher zwingend Overpass: „welche Strecke liegt hier"
 * und „wie verläuft das Gleis zwischen diesen beiden Steinen". Beides ist der
 * unzuverlässigste Teil der App — beim Bau dieser Fassung antwortete Overpass
 * reihenweise mit 429 und 504 und brauchte bis zu 92 s, bis alle drei
 * Instanzen aufgegeben hatten, während die ORM-API jedes Mal unter einer
 * Sekunde lieferte.
 *
 * Deshalb liegen die Gleise jetzt als Kacheln bei, erzeugt von
 * werkzeug/netz-bauen.py aus OpenStreetMap. Overpass bleibt der Rückfall für
 * alles außerhalb des erzeugten Gebiets und für den Fall, dass die Kachel
 * keinen durchgehenden Weg hergibt.
 *
 * Warum nicht, wie zuerst überlegt, fertige Kilometerpunkte alle 100 m? Weil
 * das dieselbe Auskunft teurer schreibt: Die Stützpunkte aus OpenStreetMap
 * stehen gemessen im Mittel alle 46–55 m, kosten weniger Platz und häufen sich
 * dort, wo es krümmt, statt gleichmäßig über Geraden verteilt zu liegen. Und
 * ein Raster fester Punkte beantwortet die erste Frage nicht besser. */

const NETZ_PFAD = 'netz/';

/** Google-Polyline zurücklesen — dasselbe Format, das netz-bauen.py schreibt. */
function polylineDekodieren(s, faktor = 1e5) {
  const pts = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    let wert, verschub, b;
    for (let achse = 0; achse < 2; achse++) {
      wert = 0; verschub = 0;
      do {
        b = s.charCodeAt(i++) - 63;
        wert |= (b & 0x1f) << verschub;
        verschub += 5;
      } while (b >= 0x20);
      const d = (wert & 1) ? ~(wert >> 1) : (wert >> 1);
      if (achse === 0) lat += d; else lon += d;
    }
    pts.push({ lat: lat / faktor, lon: lon / faktor });
  }
  return pts;
}

let netzIndexHolen = null;

/** Index einmal laden; false heißt „kein mitgeliefertes Netz vorhanden". */
function netzBereit() {
  if (!netzIndexHolen) {
    netzIndexHolen = (async () => {
      try {
        const r = await fetch(NETZ_PFAD + 'index.json');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const kacheln = d.kacheln || [];
        return {
          raster: d.raster || 0.5,
          stand: d.stand || '',
          mitInhalt: new Set(kacheln),
          da: new Set([...kacheln, ...(d.leer || [])])
        };
      } catch {
        return false;      // App läuft dann wie zuvor über Overpass
      }
    })();
  }
  return netzIndexHolen;
}

/* Entschlüsselte Kacheln bleiben liegen, aber nicht beliebig viele: Eine dichte
 * Kachel bringt einige zehntausend Stützpunkte mit, und wer quer durchs Land
 * fährt, sammelt sonst alles ein. Zwölf Kacheln sind rund 150 x 150 km um den
 * Arbeitsplatz herum — mehr braucht niemand gleichzeitig, und die Datei ist
 * über den Zwischenspeicher des Browsers sofort wieder da. */
const NETZ_KACHELN_MAX = 12;
const netzKacheln = new Map();     // Name → Versprechen auf {wege, punkte}

function netzKachel(name) {
  if (netzKacheln.has(name)) {
    // Wieder ans Ende der Map, damit die älteste zuerst weicht
    const p = netzKacheln.get(name);
    netzKacheln.delete(name);
    netzKacheln.set(name, p);
  } else {
    netzKacheln.set(name, (async () => {
      try {
        const r = await fetch(`${NETZ_PFAD}t_${name}.json`);
        if (!r.ok) return null;
        const d = await r.json();
        const wege = (d.w || []).map(w => {
          const geometry = polylineDekodieren(w.p);
          let s = 90, we = 180, n = -90, o = -180;
          for (const p of geometry) {
            if (p.lat < s) s = p.lat;
            if (p.lat > n) n = p.lat;
            if (p.lon < we) we = p.lon;
            if (p.lon > o) o = p.lon;
          }
          return { ref: w.r || '', geometry, bb: [s, we, n, o] };
        });
        const koord = d.p ? polylineDekodieren(d.p) : [];
        const punkte = koord.map((k, i) => ({ lat: k.lat, lon: k.lon, km: d.km[i] }));
        return { wege, punkte };
      } catch {
        return null;
      }
    })());
    while (netzKacheln.size > NETZ_KACHELN_MAX) {
      netzKacheln.delete(netzKacheln.keys().next().value);
    }
  }
  return netzKacheln.get(name);
}

/* Den angezeigten Punkt auf das wirklich erfasste Gleis setzen.
 *
 * Der Kilometer wird weiter aus der Sehne zwischen zwei Steinen gelesen — an
 * 234 uebersprungenen Zwischensteinen nachgemessen ist die Sehne dabei besser
 * als die Rechnung entlang des Gleises (Median 15 gegen 25 m), weil beim
 * Tippen die Position ja feststeht und sich die Bogenabweichung zur Mitte hin
 * aufhebt. Uebrig bleibt die Erfassungsgenauigkeit der Steine.
 *
 * Die angezeigte Lage ist eine andere Frage. Der Punkt auf der Sehne liegt in
 * denselben 234 Faellen im Median 16 m neben dem Gleis, im ungünstigen Zehntel
 * 87 m, im schlechtesten Fall 378 m — bei einem gemeldeten Punkt an Strecke
 * 5321 waren es 128 m. Diese Koordinate geht in „In Google Maps öffnen",
 * „Route", „Kopieren" und „Teilen": Sie muss auf der Schiene liegen und nicht
 * im Feld daneben. Solange der Verlauf mitgeliefert ist, kostet das nichts.
 */
async function aufGleisSetzen(ref, lat, lon, umkreis) {
  const d = umkreis / 110540;
  const dLon = umkreis / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const bereich = await netzBereich(lat - d, lon - dLon, lat + d, lon + dLon);
  if (!bereich) return null;

  const passt = w => w.ref && String(w.ref).split(';').some(t => t.trim() === String(ref));
  let best = null;
  for (const w of bereich.wege) {
    if (!passt(w)) continue;                 // nur das Gleis dieser Strecke
    const t = projectOnPath(w.geometry.map(p => [p.lat, p.lon]), lat, lon);
    if (t && (!best || t.dist < best.dist)) best = t;
  }
  return best && best.dist <= umkreis ? best : null;
}

/** Kilometerpunkte einer Strecke aus den Kacheln, nach Kilometer sortiert.
 *
 * Damit kommt die Richtung Position → Kilometer ganz ohne Netz aus: Bisher
 * lieferten die Kacheln nur Startwerte, die eigentlichen Steine holte danach
 * die ORM-API. Fürs Antippen ist das richtig — eine Abfrage, unter einer
 * Sekunde, und die API führt Betreiber und Steinkennung mit. Die laufende
 * Anzeige aus dem Standort kann sich das nicht leisten.
 *
 * Die Punkte in der Kachel tragen keine Streckennummer; zugeordnet werden sie
 * wie in netzLinesNear über die Lage: Was auf dem Gleis dieser Strecke steht,
 * gehört zu ihr. */
async function netzSteine(ref, lat, lon, umkreis) {
  const dLat = umkreis / 110540;
  const dLon = umkreis / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const bereich = await netzBereich(lat - dLat, lon - dLon, lat + dLat, lon + dLon);
  if (!bereich) return null;

  const gleise = bereich.wege.filter(w =>
    w.ref && String(w.ref).split(';').some(t => t.trim() === String(ref)));
  if (!gleise.length) return null;

  const steine = [];
  for (const p of bereich.punkte) {
    if (!gleise.some(w => distToWay(p.lat, p.lon, w.geometry) < 25)) continue;
    steine.push({ lat: p.lat, lon: p.lon, km: p.km, ref: String(ref) });
  }
  // In den Kacheln stehen Doppelsteine meist mit demselben Kilometer (der gerundete Wert)
  return inselnWeg(steineVereinen(steine.sort((a, b) => a.km - b.km)));
}

/** Alles Mitgelieferte in einem Rechteck — oder null, wenn dort nichts erzeugt wurde. */
async function netzBereich(sued, west, nord, ost) {
  const ix = await netzBereit();
  if (!ix) return null;

  const namen = [];
  for (let y = Math.floor(sued / ix.raster); y <= Math.floor(nord / ix.raster); y++) {
    for (let x = Math.floor(west / ix.raster); x <= Math.floor(ost / ix.raster); x++) {
      namen.push(y + '_' + x);
    }
  }
  // Eine einzige nicht erzeugte Kachel macht die Auskunft unvollständig —
  // dann lieber ganz über Overpass, als stillschweigend Gleise zu verlieren.
  if (!namen.length || !namen.every(n => ix.da.has(n))) return null;

  const teile = await Promise.all(namen.filter(n => ix.mitInhalt.has(n)).map(netzKachel));
  if (teile.some(t => t === null)) return null;

  const wege = [], punkte = [];
  for (const t of teile) {
    // Eine Kachel deckt rund 55 km ab; für den Graphen zählt nur das Rechteck
    for (const w of t.wege) {
      if (w.bb[0] > nord || w.bb[2] < sued || w.bb[1] > ost || w.bb[3] < west) continue;
      wege.push(w);
    }
    for (const p of t.punkte) {
      if (p.lat >= sued && p.lat <= nord && p.lon >= west && p.lon <= ost) punkte.push(p);
    }
  }
  return { wege, punkte };
}

/* ============================ Feinrechnung entlang des Gleises ============================ */

/* Die geradlinige Interpolation schneidet Bögen ab. Wer den tatsächlichen
 * Gleisverlauf kennt, kann den Punkt exakt darauf setzen — gemessen an
 * Strecke 5321 km 99,0 waren das 375 m Unterschied.
 *
 * Das kostet allerdings eine Overpass-Abfrage (Sekunden, nicht offline) und
 * lohnt nur bei weit auseinanderliegenden Steinen: bei 200 m Abstand liegt die
 * Interpolation ohnehin nur 10 m daneben, und das ist die Erfassungsgenauigkeit
 * der Steine, gegen die kein Gleisverlauf hilft. Deshalb kein Automatismus,
 * sondern ein Knopf, der erst ab REFINE_MIN_CHORD auftaucht.
 */
const REFINE_MIN_CHORD = 700;

async function railGeometry(a, b, pad = 0.012) {
  const bbox = [
    Math.min(a.lat, b.lat) - pad, Math.min(a.lon, b.lon) - pad,
    Math.max(a.lat, b.lat) + pad, Math.max(a.lon, b.lon) + pad
  ].join(',');
  const q = `[out:json][timeout:60];way(${bbox})[railway~"^(rail|light_rail|narrow_gauge)$"];out geom;`;

  let data = null, lastErr = null;
  for (const ep of OVERPASS) {
    try { data = await tryFetch(ep + '?data=' + encodeURIComponent(q), 40000); break; }
    catch (err) { lastErr = err; }
  }
  if (!data) {
    throw new Error('kein Overpass-Server hat geantwortet (' + (lastErr && lastErr.message || 'unbekannt') + ')');
  }
  return (data.elements || []).filter(w => w.geometry && w.geometry.length > 1);
}

/* Eine Strecke besteht aus vielen Wegstücken, unsortiert und mit Abzweigen.
 * Statt sie zu sortieren wird ein Knotennetz gebaut und darin der kürzeste Weg
 * gesucht — das findet den Verlauf auch über Weichen und Wegegrenzen hinweg.
 * Zusammenhängende Wege teilen in OSM denselben Knoten, also dieselbe Koordinate. */
function buildGraph(ways) {
  const keyOf = p => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
  const nodes = new Map();

  const ensure = p => {
    const k = keyOf(p);
    if (!nodes.has(k)) nodes.set(k, { lat: p.lat, lon: p.lon, adj: [] });
    return k;
  };

  for (const w of ways) {
    for (let i = 1; i < w.geometry.length; i++) {
      const k1 = ensure(w.geometry[i - 1]);
      const k2 = ensure(w.geometry[i]);
      if (k1 === k2) continue;
      const n1 = nodes.get(k1), n2 = nodes.get(k2);
      const d = haversine(n1.lat, n1.lon, n2.lat, n2.lon);
      n1.adj.push([k2, d]);
      n2.adj.push([k1, d]);
    }
  }
  return nodes;
}

/* Einen Punkt in das Knotennetz einhängen — auch mitten auf einer Kante.
 *
 * Der nächste Stützpunkt allein genügt seit den mitgelieferten Kacheln nicht
 * mehr: Die Vereinfachung auf 5 m lässt auf Geraden Punkte weg. Gemessen sind
 * 23 % der Kanten länger als 160 m, die längste 1579 m. Ein Stein, der exakt
 * auf dem Gleis steht, lag damit plötzlich 271 m vom nächsten Stützpunkt
 * entfernt, und die Wegsuche brach mit „die Steine liegen zu weit vom Gleis"
 * ab — gemeldet an Strecke 5321 zwischen km 87,2 und 96,2, wo die Steine in
 * Wahrheit 0 m und 2 m neben der Linie stehen.
 *
 * Deshalb wird auf die Kante projiziert und, wenn der Fuß mittendrin liegt,
 * ein Knoten eingefügt. Die ursprüngliche Kante bleibt daneben stehen; sie ist
 * genauso lang wie der Umweg über den neuen Knoten und stört deshalb nicht. */
/* Nächste Kante — je Zusammenhangskomponente in einem einzigen Durchgang.
 *
 * Zuerst stand hier eine Suche je Komponente, also O(Teile × Kanten). In einem
 * weiten Ausschnitt mit vielen Teilstücken war das der Grund, warum ein weit
 * abgesetzter Tipp wieder ewig lud. Eine Runde reicht: Zu jeder Kante ist die
 * Komponente bekannt, das Beste wird je Nummer gemerkt. */
function kantenJeTeil(nodes, teil, lat, lon) {
  const ky = 110540, kx = Math.cos(lat * Math.PI / 180) * 111320;
  const px = lon * kx, py = lat * ky;
  const best = new Map();

  for (const [k1, n1] of nodes) {
    const nr = teil ? teil.get(k1) : 0;
    const ax = n1.lon * kx, ay = n1.lat * ky;
    for (const [k2] of n1.adj) {
      const n2 = nodes.get(k2);
      const dx = n2.lon * kx - ax, dy = n2.lat * ky - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cy = ay + t * dy;
      const dist = Math.hypot(px - cx, py - cy);
      const alt = best.get(nr);
      if (!alt || dist < alt.dist) {
        best.set(nr, { dist, t, von: k1, nach: k2, lat: cy / ky, lon: cx / kx });
      }
    }
  }
  return best;
}

/** Beide Punkte in dieselbe Komponente einhängen; null, wenn keine beide trägt. */
function paarEinhaengen(nodes, A, B, grenze = 80) {
  const teil = komponenten(nodes);
  const a = kantenJeTeil(nodes, teil, A.lat, A.lon);
  const b = kantenJeTeil(nodes, teil, B.lat, B.lon);
  let wahl = null;
  for (const [nr, ka] of a) {
    const kb = b.get(nr);
    if (!kb) continue;
    const schlechter = Math.max(ka.dist, kb.dist);
    if (!wahl || schlechter < wahl.schlechter) wahl = { a: ka, b: kb, schlechter };
  }
  if (!wahl) return null;
  wahl.na = einfuegen(nodes, wahl.a);
  wahl.nb = einfuegen(nodes, wahl.b);
  kanteVerbinden(nodes, wahl.a, wahl.na, wahl.b, wahl.nb);
  return wahl;
}

/* Hängen zwei Punkte auf derselben Kante, kennen sich die eingefügten Knoten
 * nicht: Jeder ist nur mit den beiden Enden verbunden, und der Weg zwischen
 * ihnen liefe bis zum Kantenende und zurück. Auf Geraden ist das der
 * Normalfall — die Kacheln kommen dort mit Kanten über 500 m aus, Steine stehen
 * alle 100–200 m. Bis Oktober 2026 fehlte diese Verbindung: An Strecke 5100
 * zwischen km 12,0 und 13,2 hingen in 11 von 12 Steinpaaren beide Steine auf
 * derselben Kante, der Weg wurde 266 bis 1256 m lang statt 12 bis 227 m, und
 * die Plausibilitätsprüfung verwarf ihn. Auf sechs Strecken gezählt fanden
 * damit 384 von 714 Nachbarpaaren ihren Gleisweg, mit der Verbindung 542. */
function kanteVerbinden(nodes, ka, na, kb, nb) {
  if (!na.key || !nb.key || na.key === nb.key) return;
  if (!((ka.von === kb.von && ka.nach === kb.nach) || (ka.von === kb.nach && ka.nach === kb.von))) return;
  const n1 = nodes.get(na.key), n2 = nodes.get(nb.key);
  if (n1.adj.some(([k]) => k === nb.key)) return;
  const d = haversine(n1.lat, n1.lon, n2.lat, n2.lon);
  n1.adj.push([nb.key, d]);
  n2.adj.push([na.key, d]);
}

/** Die nächsten Stellen auf dem Gleisnetz: die nächste Kante und alles, was
 *  höchstens spielraum weiter weg liegt — an einer zweigleisigen Strecke also
 *  auch das Nachbargleis. Je Stelle nur eine, höchstens vier. */
function kantenNahe(nodes, lat, lon, spielraum, grenze) {
  const ky = 110540, kx = Math.cos(lat * Math.PI / 180) * 111320;
  const px = lon * kx, py = lat * ky;
  const alle = [];
  for (const [k1, n1] of nodes) {
    const ax = n1.lon * kx, ay = n1.lat * ky;
    for (const [k2] of n1.adj) {
      if (k2 < k1) continue;               // jede Kante steht in beiden Richtungen da
      const n2 = nodes.get(k2);
      const dx = n2.lon * kx - ax, dy = n2.lat * ky - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cy = ay + t * dy;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist <= grenze) alle.push({ dist, t, von: k1, nach: k2, lat: cy / ky, lon: cx / kx });
    }
  }
  alle.sort((a, b) => a.dist - b.dist);
  const raus = [];
  for (const k of alle) {
    if (k.dist > alle[0].dist + spielraum || raus.length >= 4) break;
    // Am Knick zweier Kanten fällt das Lot auf beide an dieselbe Stelle
    if (raus.some(r => Math.hypot((r.lon - k.lon) * kx, (r.lat - k.lat) * ky) < 2)) continue;
    raus.push(k);
  }
  return raus;
}

/* Die Steine stehen an verschiedenen Gleisen derselben Strecke: Jeder hängt
 * sich an sein nächstes Gleis, und der kürzeste Weg zwischen beiden läuft über
 * die nächste Weiche — an Strecke 5100 zwischen km 40,2 und 40,4 1738 m für
 * 200 m. Dann jeden Stein auch an das Nachbargleis hängen (alles bis 10 m
 * weiter als die nächste Kante) und unter allen Paarungen den kürzesten Weg
 * nehmen; gesucht wird nur bis bisher (wegAusWegen gibt 1,3-mal die
 * Kilometerdifferenz) und danach nur noch kürzer als der beste. Auf sechs
 * Strecken gezählt: 21 von 714 Nachbarpaaren. */
function paarUmGleis(nodes, A, B, bisher, grenze = 80) {
  const ka = kantenNahe(nodes, A.lat, A.lon, 10, grenze);
  const kb = kantenNahe(nodes, B.lat, B.lon, 10, grenze);
  if (!ka.length || !kb.length) return null;
  const na = ka.map(k => ({ k, n: einfuegen(nodes, k) }));
  const nb = kb.map(k => ({ k, n: einfuegen(nodes, k) }));
  for (const a of na) for (const b of nb) kanteVerbinden(nodes, a.k, a.n, b.k, b.n);

  let best = null;
  for (const a of na) {
    for (const b of nb) {
      const sp = shortestPath(nodes, a.n.key, b.n.key, best ? best.length : bisher);
      if (sp && sp.length < (best ? best.length : bisher)) best = sp;
    }
  }
  return best;
}

function naechsteKante(nodes, lat, lon) {
  return kantenJeTeil(nodes, null, lat, lon).get(0) || null;
}

/** Die gefundene Stelle wirklich als Knoten einsetzen. */
function einfuegen(nodes, best) {
  if (!best) return { key: null, dist: Infinity };
  if (best.t <= 1e-9) return { key: best.von, dist: best.dist };
  if (best.t >= 1 - 1e-9) return { key: best.nach, dist: best.dist };

  const key = best.lat.toFixed(7) + ',' + best.lon.toFixed(7);
  if (!nodes.has(key)) {
    const neu = { lat: best.lat, lon: best.lon, adj: [] };
    nodes.set(key, neu);
    for (const k of [best.von, best.nach]) {
      const n = nodes.get(k);
      if (!n) continue;
      const d = haversine(neu.lat, neu.lon, n.lat, n.lon);
      neu.adj.push([k, d]);
      n.adj.push([key, d]);
    }
  }
  return { key, dist: best.dist };
}

/** Zusammenhangskomponenten: Knotenschlüssel → Nummer. */
function komponenten(nodes) {
  const teil = new Map();
  let nr = 0;
  for (const start of nodes.keys()) {
    if (teil.has(start)) continue;
    const stapel = [start];
    teil.set(start, nr);
    while (stapel.length) {
      const k = stapel.pop();
      for (const [nk] of nodes.get(k).adj) {
        if (teil.has(nk)) continue;
        teil.set(nk, nr);
        stapel.push(nk);
      }
    }
    nr++;
  }
  return teil;
}

/** Kleinster Eintrag zuerst — ein Binärhaufen, damit Dijkstra nicht jedes Mal
 *  die ganze Entfernungstabelle durchsuchen muss. Bei einem Bahnhof mit
 *  zehntausenden Stützpunkten war genau das der Unterschied zwischen einer
 *  Sekunde und einer stehenden Seite. */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(prio, val) {
    const a = this.a;
    a.push([prio, val]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Dijkstra über das Knotennetz. grenze: weiter wird nicht gesucht, dann null. */
function shortestPath(nodes, startKey, endKey, grenze = Infinity) {
  const dist = new Map([[startKey, 0]]);
  const prev = new Map();
  const done = new Set();
  const offen = new MinHeap();
  offen.push(0, startKey);

  for (;;) {
    let cur = null, curD = 0;
    // Veraltete Einträge stehen doppelt im Haufen — den schon erledigten Knoten
    // einfach überspringen ist billiger, als im Haufen zu suchen.
    while (offen.size) {
      const [d, k] = offen.pop();
      if (!done.has(k)) { cur = k; curD = d; break; }
    }
    if (cur === null) return null;          // nicht verbunden
    if (curD > grenze) return null;         // nur noch Wege, die länger wären
    if (cur === endKey) break;
    done.add(cur);
    for (const [nk, w] of nodes.get(cur).adj) {
      if (done.has(nk)) continue;
      const nd = curD + w;
      if (nd < (dist.has(nk) ? dist.get(nk) : Infinity)) {
        dist.set(nk, nd); prev.set(nk, cur); offen.push(nd, nk);
      }
    }
  }

  const path = [];
  let k = endKey;
  while (k !== undefined) {
    const n = nodes.get(k);
    path.push([n.lat, n.lon]);
    if (k === startKey) break;
    k = prev.get(k);
  }
  return { path: path.reverse(), length: dist.get(endKey) };
}

/** Punkt in gegebener Entfernung entlang eines Streckenzugs. */
function pointAlong(path, target) {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
    if (acc + d >= target) {
      const t = d > 0 ? (target - acc) / d : 0;
      return {
        lat: path[i - 1][0] + t * (path[i][0] - path[i - 1][0]),
        lon: path[i - 1][1] + t * (path[i][1] - path[i - 1][1])
      };
    }
    acc += d;
  }
  const last = path[path.length - 1];
  return { lat: last[0], lon: last[1] };
}

/** Umgekehrt: nächster Punkt auf dem Streckenzug — mit der Weglänge bis dorthin.
 *  along und len kommen aus derselben ebenen Näherung, ihr Verhältnis ist also
 *  frei vom kleinen Maßstabsfehler dieser Näherung. */
function projectOnPath(path, lat, lon) {
  if (!path || path.length < 2) return null;

  const ky = 110540, kx = Math.cos(lat * Math.PI / 180) * 111320;
  const px = lon * kx, py = lat * ky;
  let acc = 0, best = null;

  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][1] * kx, ay = path[i - 1][0] * ky;
    const dx = path[i][1] * kx - ax, dy = path[i][0] * ky - ay;
    const len2 = dx * dx + dy * dy, seg = Math.sqrt(len2);
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + t * dx, cy = ay + t * dy;
    const dist = Math.hypot(px - cx, py - cy);
    if (!best || dist < best.dist) {
      best = { dist, along: acc + t * seg, lat: cy / ky, lon: cx / kx };
    }
    acc += seg;
  }
  if (best) best.len = acc;
  return best;
}

/** Der gefundene Verlauf wird gemerkt, aber nicht mehr gezeichnet: Die grüne
 *  Linie (und die blaue durch die Steine) brachten dem Nutzer nichts und waren
 *  bis November 2026 unter „Rechenhilfen" abschaltbar — jetzt immer aus. */
let gleiswegZuletzt = null;

function zeichneGleisweg(path) {
  gleiswegZuletzt = path && path.length ? path : null;
  zeichneGleiswegNeu();
}

function zeichneGleiswegNeu() {
  if (!trackLayer) return;
  trackLayer.clearLayers();
}

/* Der Gleisweg zwischen zwei Steinen — beide Richtungen brauchen genau das:
 * km → Position folgt ihm vorwärts, Position → km misst daran entlang.
 *
 * Zuerst aus den mitgelieferten Kacheln; nur wenn dort nichts liegt oder sich
 * kein brauchbarer Weg findet, muss Overpass ran. Der Rückfall ist wichtig:
 * Die Kacheln lassen Anschluss- und Rangiergleise weg, und an einer Stelle,
 * wo der Verlauf ausgerechnet darüber führt, käme sonst gar nichts heraus. */
/* Rand um die Sehne, damit Bögen mitkommen, die daneben ausschlagen. Fest
 * 0,012° (gut 1,3 km) reichten nur bei kurzen Abständen: Zwischen den Steinen
 * bei km 87,2 und 96,2 der Strecke 5321 lief das Gleis aus dem Ausschnitt
 * heraus, der Weg wurde nicht gefunden und die Suche fiel auf Overpass zurück.
 * Mit dem Abstand wachsen lassen, aber gedeckelt. */
const verlaufRand = (A, B) => Math.min(0.06, 0.012 + Math.abs(B.km - A.km) * 0.002);

/** Liegt der Verlauf zwischen diesen Steinen mitgeliefert vor? Nur für die
 *  Wortwahl der Statusmeldung — die Kachel ist danach im Speicher. */
async function netzHatVerlauf(A, B) {
  const pad = verlaufRand(A, B);
  const b = await netzBereich(
    Math.min(A.lat, B.lat) - pad, Math.min(A.lon, B.lon) - pad,
    Math.max(A.lat, B.lat) + pad, Math.max(A.lon, B.lon) + pad);
  return !!(b && b.wege.length);
}

/* Der Gleisweg zwischen zwei Steinen bleibt liegen.
 *
 * Bisher wurde er je Tipp einmal gebraucht, da fiel der Aufbau des Graphen
 * nicht auf. Die laufende Anzeige aus dem Standort fragt ihn dagegen bei jeder
 * Meldung des Geräts — im Sekundentakt —, während der Standort wandert und das
 * Steinpaar um ihn herum minutenlang dasselbe bleibt. Ohne Puffer wäre die
 * teuerste Rechnung der App in Dauerschleife unterwegs.
 *
 * Gescheiterte Versuche werden nicht gemerkt: Das ist meist der überlastete
 * Fremddienst und nicht die Geometrie, und der darf beim nächsten Mal wieder
 * gefragt werden. Der Rückfall auf „nichts gefunden" ohne Netz (nurLokal)
 * scheitert nicht, sondern liefert null — das bleibt gepuffert. */
const WEG_PUFFER_MAX = 24;
const wegPuffer = new Map();      // Schlüssel → Versprechen auf den Weg

async function gleisWegZwischen(A, B, nurLokal = false) {
  const schluessel = `${nurLokal ? 'l' : 'o'}|${A.km}|${A.lat.toFixed(6)},${A.lon.toFixed(6)}` +
    `|${B.km}|${B.lat.toFixed(6)},${B.lon.toFixed(6)}`;

  let versprechen = wegPuffer.get(schluessel);
  if (versprechen) {
    // Wieder ans Ende der Map, damit der älteste Eintrag zuerst weicht
    wegPuffer.delete(schluessel);
    wegPuffer.set(schluessel, versprechen);
    return versprechen;
  }

  versprechen = wegSuchen(A, B, nurLokal);
  wegPuffer.set(schluessel, versprechen);
  versprechen.catch(() => {
    if (wegPuffer.get(schluessel) === versprechen) wegPuffer.delete(schluessel);
  });
  while (wegPuffer.size > WEG_PUFFER_MAX) wegPuffer.delete(wegPuffer.keys().next().value);
  return versprechen;
}

async function wegSuchen(A, B, nurLokal) {
  const pad = verlaufRand(A, B);
  const lokal = await netzBereich(
    Math.min(A.lat, B.lat) - pad, Math.min(A.lon, B.lon) - pad,
    Math.max(A.lat, B.lat) + pad, Math.max(A.lon, B.lon) + pad);

  if (lokal && lokal.wege.length) {
    /* Erst nur die Gleise der eigenen Strecke, dann alle. Laufen mehrere
     * Strecken nebeneinander, hängt sich ein Stein sonst womöglich an das Gleis
     * der Nachbarstrecke: Bei Fürth stand ein Stein der 5900 direkt auf einem
     * Gleis der S-Bahn, das eigene lag 18 m weiter, und der Weg lief 1,6 km über
     * die nächste Verbindung. Alle Gleise bleiben der Rückfall — die Kacheln
     * tragen die Streckennummer nicht überall. */
    const ref = String(A.ref || B.ref || '');
    const eigene = ref ? lokal.wege.filter(w => w.ref && String(w.ref).split(';').some(t => t.trim() === ref)) : [];
    if (eigene.length && eigene.length < lokal.wege.length) {
      try { return wegAusWegen(eigene, A, B); } catch { /* dann mit allen Gleisen */ }
    }
    try { return wegAusWegen(lokal.wege, A, B); } catch { /* dann eben über Overpass */ }
  }
  // nurLokal: für Rechnungen, die sich nur lohnen, solange sie nichts kosten
  if (nurLokal) return null;

  const ways = await railGeometry(A, B, pad);
  if (!ways.length) throw new Error('keine Gleisgeometrie im Ausschnitt');
  return wegAusWegen(ways, A, B);
}

/** Aus Wegstücken den Gleisweg zwischen zwei Steinen suchen und plausibilisieren. */
function wegAusWegen(ways, A, B) {
  const nodes = buildGraph(ways);
  if (nodes.size > 60000) throw new Error('zu viele Gleise im Ausschnitt');

  /* Beide Steine in dieselbe Zusammenhangskomponente einhängen.
   *
   * Die geometrisch nächste Kante genügt nicht: In den Kacheln zerfällt das
   * Gleisnetz an manchen Stellen in mehrere Teile, und ein Stein sitzt dann
   * womöglich einen Meter neben einem abgehängten Stummel, während das
   * durchgehende Gleis zwei Meter weiter liegt. Gemeldet an Strecke 5321
   * zwischen km 96,42 und 100,0: Beide Steine hingen sich auf 1 m ein, und
   * trotzdem gab es keinen Weg — sie hingen in verschiedenen Teilen. */
  const wahl = paarEinhaengen(nodes, A, B);
  if (!wahl) throw new Error('keine Gleisgeometrie im Ausschnitt');
  if (wahl.schlechter > 80) {
    throw new Error(`die Steine liegen bis ${nfM.format(wahl.schlechter)} m vom nächsten durchgehenden Gleis entfernt`);
  }

  let sp = shortestPath(nodes, wahl.na.key, wahl.nb.key);
  const nominal = (B.km - A.km) * 1000;
  // Ein Umweg über die Weiche: die Steine stehen an verschiedenen Gleisen (paarUmGleis)
  if (!sp || sp.length > nominal * 1.3) {
    // Länger als 1,3-mal die Kilometerdifferenz wird unten ohnehin verworfen — so weit muss niemand suchen
    const um = paarUmGleis(nodes, A, B, nominal * 1.3);
    if (um) sp = um;
  }
  if (!sp) throw new Error('kein durchgehender Gleisweg zwischen den beiden Steinen');

  /* Der kürzeste Weg im Gleisnetz muss nicht die Strecke sein — an einem
   * Bahnhof führt er auch mal über ein Nachbargleis. Passt seine Länge nicht
   * zur Kilometerdifferenz, ist er der falsche Weg. */
  const ratio = sp.length / nominal;
  if (ratio < 0.8 || ratio > 1.3) {
    throw new Error(`der gefundene Gleisweg ist ${nfM.format(sp.length)} m lang, die Kilometerdifferenz aber ${nfM.format(nominal)} m`);
  }
  return { path: sp.path, length: sp.length, nominal };
}

/* ============================ Über den letzten Stein hinaus ============================ */

/* Wo die Kilometrierung anfängt oder aufhört, gab es bisher gar nichts: Für
 * einen Kilometer jenseits des äußersten Steins fehlt das einschließende Paar,
 * und die App zeigte den nächstgelegenen Stein mit „1,0 km daneben".
 *
 * Mit dem mitgelieferten Verlauf lässt sich stattdessen vom äußersten Stein aus
 * am Gleis entlanglaufen. Dass die Trasse dabei über den Nullpunkt hinausgeht,
 * ist kein Widerspruch — die Kilometrierungslinie beginnt oft später als die
 * Achse.
 */
const EXTRA_MAX_M = 3000;      // so weit hinaus reichen die Messwerte
const EXTRA_PROBE_M = 100;     // so nah muss die Selbstprobe den Nachbarstein treffen

/** Richtung von a nach b in Grad. */
function peilung(a, b) {
  const lat = (a.lat + b.lat) / 2 * Math.PI / 180;
  return (Math.atan2((b.lon - a.lon) * Math.cos(lat), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
}

/** Am Gleis entlanglaufen, an jeder Weiche geradeaus.
 *
 * Bewusst nicht Dijkstra: Der kürzeste Weg sucht sich an einer Verzweigung
 * irgendeinen Ast und landet auf dem Nachbargleis. Eine Strecke folgt aber dem
 * geraden Durchgang — an einer Weiche biegt das durchgehende Hauptgleis nicht ab.
 */
function entlangLaufen(nodes, startKey, wegVon, strecke) {
  const start = nodes.get(startKey);
  if (!start || !start.adj.length) return null;

  /* „Weg von wegVon" heißt: in die Gegenrichtung losgehen — und das entscheidet
   * die Richtung, nicht der Abstand. Verglichen wurden vorher die Abstände der
   * Nachbarknoten zu wegVon, und daran scheiterte die Selbstprobe an Strecke
   * 5062: Vom Stein bei km 1,2 geht es zur richtigen Seite nur 30 m bis zum
   * nächsten Stützpunkt, zur falschen 510 m am Stück. Der 510 m entfernte
   * Knoten lag damit weiter von wegVon weg als der richtige 30-m-Schritt, und
   * die Probe lief nach außen statt zum Nachbarstein. */
  const hin = peilung(start, wegVon);
  const abweichung = k =>
    Math.abs(((peilung(start, nodes.get(k)) - hin + 540) % 360) - 180);
  let vorher = startKey;
  let jetzt = start.adj.map(([k]) => k).reduce((a, b) => abweichung(b) > abweichung(a) ? b : a);
  if (abweichung(jetzt) < 90) return null;      // alles führt zu wegVon hin — nicht raten

  const besucht = new Set([startKey]);
  const pfad = [[start.lat, start.lon]];
  let gelaufen = 0;

  /* Jede Kante geht durch dieselbe Prüfung — auch die erste. Vorher wurde die
   * erste ganz gegangen und erst ab der zweiten geteilt. Weil die
   * mitgelieferten Kacheln auf Geraden über 500 m ohne Stützpunkt auskommen,
   * landete damit jeder Lauf, der kürzer war als die erste Kante, an deren
   * Ende statt dort, wo er hingehört. Gemeldet an Strecke 5062, km 1,034:
   * 166 m über den Stein bei km 1,2 hinaus gesucht, 510 m weit gezeichnet. */
  for (;;) {
    const a = nodes.get(vorher), b = nodes.get(jetzt);
    const d = haversine(a.lat, a.lon, b.lat, b.lon);

    if (gelaufen + d >= strecke) {
      const t = d > 0 ? (strecke - gelaufen) / d : 0;
      const ziel = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
      pfad.push([ziel.lat, ziel.lon]);
      return { lat: ziel.lat, lon: ziel.lon, pfad, gelaufen: strecke };
    }
    gelaufen += d;
    besucht.add(jetzt);
    pfad.push([b.lat, b.lon]);

    const ein = peilung(a, b);
    const weiter = b.adj.map(([k]) => k).filter(k => k !== vorher && !besucht.has(k));
    if (!weiter.length) break;

    const kurve = k => Math.abs(((peilung(b, nodes.get(k)) - ein + 540) % 360) - 180);
    const naechst = weiter.reduce((x, y) => kurve(y) < kurve(x) ? y : x);
    if (kurve(naechst) > 75) break;                // das ist ein Abzweig, keine Fortsetzung

    vorher = jetzt;
    jetzt = naechst;
  }
  const z = nodes.get(jetzt);
  return { lat: z.lat, lon: z.lon, pfad, gelaufen };
}

/** Kilometer jenseits des äußersten Steins — nur aus den mitgelieferten Kacheln. */
async function extrapolieren(ref, km, sorted) {
  const erster = sorted[0], letzter = sorted[sorted.length - 1];
  const unten = km < erster.km;
  if (!unten && km <= letzter.km) return null;

  const A = unten ? erster : letzter;
  const B = unten ? sorted[1] : sorted[sorted.length - 2];
  if (!B || !segmentOk(unten ? A : B, unten ? B : A, MAX_GLEIS_GAP_KM)) return null;

  const hinaus = Math.abs(A.km - km) * 1000;
  if (hinaus > EXTRA_MAX_M) return null;

  const weite = (hinaus + haversine(A.lat, A.lon, B.lat, B.lon)) * 1.6;
  const dLat = Math.max(0.02, weite / 110540);
  const dLon = dLat / Math.max(0.2, Math.cos(A.lat * Math.PI / 180));
  const bereich = await netzBereich(A.lat - dLat, A.lon - dLon, A.lat + dLat, A.lon + dLon);
  if (!bereich) return null;

  const gleise = bereich.wege.filter(w =>
    w.ref && String(w.ref).split(';').some(t => t.trim() === String(ref)));
  if (!gleise.length) return null;

  const nodes = buildGraph(gleise);
  if (!nodes.size || nodes.size > 60000) return null;
  // Auch hier beide Steine in dieselbe Zusammenhangskomponente — sonst läuft
  // der Lauf auf einem abgehängten Stummel los.
  const wahl = paarEinhaengen(nodes, A, B);
  if (!wahl || wahl.schlechter > 80) return null;
  const na = wahl.na, nb = wahl.nb;

  const ziel = entlangLaufen(nodes, na.key, nodes.get(nb.key), hinaus);
  // Der Lauf bricht ab, wo das Gleis endet oder abzweigt — dann nicht raten
  if (!ziel || ziel.gelaufen < hinaus - 5) return null;

  /* Selbstprobe: mit demselben Verfahren die bekannte Strecke zum Nachbarstein
   * laufen. Trifft es dort nicht, hat der Lauf hier nichts zu suchen. An 148
   * Fällen nachgemessen fängt das genau die Ausreißer ab — ohne Probe bis zu
   * 4333 m daneben, mit Probe höchstens 746 m, und in 119 von 127 Fällen besser
   * als der nächstgelegene Stein. */
  const nachB = Math.abs(B.km - A.km) * 1000;
  const probe = entlangLaufen(nodes, na.key, ziel, nachB);
  if (!probe || probe.gelaufen < nachB - 5) return null;
  const treffer = haversine(B.lat, B.lon, probe.lat, probe.lon);
  if (treffer > EXTRA_PROBE_M) return null;

  return {
    lat: ziel.lat, lon: ziel.lon, quality: 'extrapoliert',
    hinaus, abStein: A.km, probe: treffer,
    operator: A.operator, lineRef: A.ref || ref
  };
}

/* Und dieselbe Sache in der Gegenrichtung: getippt jenseits des äußersten
 * Steins. Gemeldet an 49,447926 / 10,271642, wo Strecke 5251 weitergeht, die
 * Kilometrierung aber erst bei km 1,5 anfängt — die App meldete „1.015 m vom
 * Gleis entfernt", weil sie den Punkt auf das letzte Steinpaar projizierte.
 *
 * Gelaufen wird bis EXTRA_MAX_M hinaus, dann wird der Tipp auf diesen Weg
 * gelotet; die Weglänge bis zum Lot ist die Kilometerdifferenz. */
async function kmExtrapoliert(ref, lat, lon, sorted) {
  if (sorted.length < 2) return null;

  let best = null;
  for (const unten of [true, false]) {
    const A = unten ? sorted[0] : sorted[sorted.length - 1];
    const B = unten ? sorted[1] : sorted[sorted.length - 2];
    if (!B || A === B) continue;
    // Nur nach draußen: liegt der Tipp näher am Nachbarstein, ist es kein Fall dafür
    if (haversine(lat, lon, A.lat, A.lon) > haversine(lat, lon, B.lat, B.lon)) continue;
    if (!segmentOk(unten ? A : B, unten ? B : A, MAX_GLEIS_GAP_KM)) continue;

    const weite = (EXTRA_MAX_M + haversine(A.lat, A.lon, B.lat, B.lon)) * 1.3;
    const dLat = Math.max(0.02, weite / 110540);
    const dLon = dLat / Math.max(0.2, Math.cos(A.lat * Math.PI / 180));
    const bereich = await netzBereich(A.lat - dLat, A.lon - dLon, A.lat + dLat, A.lon + dLon);
    if (!bereich) continue;

    const gleise = bereich.wege.filter(w =>
      w.ref && String(w.ref).split(';').some(t => t.trim() === String(ref)));
    if (!gleise.length) continue;

    const nodes = buildGraph(gleise);
    if (!nodes.size || nodes.size > 60000) continue;
    const wahl = paarEinhaengen(nodes, A, B);
    if (!wahl || wahl.schlechter > 80) continue;

    const lauf = entlangLaufen(nodes, wahl.na.key, nodes.get(wahl.nb.key), EXTRA_MAX_M);
    if (!lauf || lauf.pfad.length < 2) continue;

    const t = projectOnPath(lauf.pfad, lat, lon);
    if (!t || t.along < 1) continue;               // liegt nicht draußen, sondern beim Stein

    const nachB = Math.abs(B.km - A.km) * 1000;
    const probe = entlangLaufen(nodes, wahl.na.key, lauf, nachB);
    if (!probe || probe.gelaufen < nachB - 5) continue;
    const treffer = haversine(B.lat, B.lon, probe.lat, probe.lon);
    if (treffer > EXTRA_PROBE_M) continue;

    const km = A.km + (unten ? -1 : 1) * (t.along / 1000);
    const kandidat = {
      km, lat: t.lat, lon: t.lon, quality: 'extrapoliert',
      hinaus: t.along, abStein: A.km, probe: treffer, offset: t.dist,
      operator: A.operator, lineRef: A.ref || ref
    };
    if (t.dist <= 400 && (!best || t.dist < best.offset)) best = kandidat;
  }
  return best;
}

/* Position → Kilometer entlang des echten Gleisverlaufs.
 *
 * Die Sehnenrechnung braucht zwei Steine, die nah genug beieinanderstehen —
 * jenseits von MAX_DRAW_GAP_KM wird gar nicht mehr verbunden, und dort endete
 * die Kilometersuche bisher mit einer Fehlermeldung. Der Ausweg ist derselbe
 * wie in der Gegenrichtung: den Verlauf holen und daran entlang messen.
 *
 * Wie genau das ist, steht bei GLEIS_ERR. Unterhalb von MAX_DRAW_GAP_KM wird
 * weiter die Sehne genommen: Dort ist sie gemessen genauso gut und kostet keine
 * Overpass-Abfrage von Sekunden. */
async function kmEntlangGleis(ref, lat, lon, nurLokal = false, steine = null) {
  /* steine: eine fertige Steinliste anstelle der geladenen Strecke. Die
   * laufende Anzeige aus dem Standort rechnet auf Steinen aus den Kacheln, für
   * die es keinen Eintrag in lineCache gibt. */
  const e = steine ? { sorted: steine } : lineCache.get(ref);
  if (!e || e.sorted.length < 2) return null;

  const grob = projectOnLine(e.sorted, lat, lon, MAX_GLEIS_GAP_KM);
  if (!grob) return null;

  const weg = await gleisWegZwischen(grob.a, grob.b, nurLokal);
  if (!weg) return null;
  const t = projectOnPath(weg.path, lat, lon);
  if (!t || !t.len) return null;

  const dkm = grob.b.km - grob.a.km;
  return {
    km: grob.a.km + (t.along / t.len) * dkm,
    lat: t.lat, lon: t.lon, quality: 'karte-gleis',
    between: [grob.a.km, grob.b.km], offset: t.dist,
    chord: grob.chord, wegLaenge: weg.length, nominal: weg.nominal,
    sehneKm: grob.km, pfad: weg.path,
    operator: grob.a.operator || grob.b.operator, lineRef: grob.a.ref || ref
  };
}

/* Geradlinig interpoliert, obwohl der Verlauf mitgeliefert ist? Dann gleich
 * darauf rechnen.
 *
 * Der Knopf „Punkt auf das Gleis rechnen" bleibt für alles, was über Overpass
 * geht — dort kostet es 15 bis 40 s und lohnt erst ab REFINE_MIN_CHORD. Aus der
 * Kachel dauert es 34 ms, und dann gibt es keinen Grund, dem Nutzer eine
 * Schätzung hinzulegen, die er erst wegdrücken muss: An Strecke 5321 km 99,0
 * lag die Gerade 375 m neben dem Gleis. */
async function gleisGenau(ref, km, res) {
  if (!res || res.quality !== 'interpoliert') return res;
  const store = lineCache.get(ref);
  const A = store && store.sorted.find(x => Math.abs(x.km - res.between[0]) < 1e-6);
  const B = store && store.sorted.find(x => Math.abs(x.km - res.between[1]) < 1e-6);
  if (!A || !B) return res;

  let weg = null;
  try { weg = await gleisWegZwischen(A, B, true); } catch { return res; }
  if (!weg) return res;

  const t = (km - A.km) / (B.km - A.km);
  const pos = pointAlong(weg.path, t * weg.length);
  return {
    ...res, lat: pos.lat, lon: pos.lon, quality: 'gleis',
    korrektur: haversine(res.lat, res.lon, pos.lat, pos.lon),
    wegLaenge: weg.length, nominal: weg.nominal, pfad: weg.path
  };
}

async function refineOnTrack() {
  const p = view.point;
  if (!p || p.quality !== 'interpoliert' || view.busy) return;

  const store = lineCache.get(view.ref);
  const A = store && store.sorted.find(x => Math.abs(x.km - p.between[0]) < 1e-6);
  const B = store && store.sorted.find(x => Math.abs(x.km - p.between[1]) < 1e-6);
  if (!A || !B) { toast('Nachbarsteine nicht mehr im Speicher — bitte neu suchen.'); return; }

  setBusy(true);
  const zuvor = $('#bottom').innerHTML;
  showStatus('Hole den Gleisverlauf von Overpass — das dauert einige Sekunden …');

  try {
    const weg = await gleisWegZwischen(A, B);

    const t = (view.km - A.km) / (B.km - A.km);
    const pos = pointAlong(weg.path, t * weg.length);
    const korrektur = haversine(p.lat, p.lon, pos.lat, pos.lon);

    zeichneGleisweg(weg.path);

    view.point = {
      ...p, lat: pos.lat, lon: pos.lon, quality: 'gleis',
      korrektur, wegLaenge: weg.length, nominal: weg.nominal
    };
    drawPoint();
    renderBottom();
    sichtSetzen([pos.lat, pos.lon], Math.max(map.getZoom(), 16));
    toast(`Auf das Gleis gerechnet — ${nfM.format(korrektur)} m verschoben`);
  } catch (err) {
    $('#bottom').innerHTML = zuvor;
    bindBottom();
    updateBH();
    toast('Feinrechnung nicht möglich: ' + err.message);
  } finally {
    setBusy(false);
  }
}

/* ============================ Zustand ============================ */

const view = {
  ref: '',        // aktuell geladene Strecke
  km: null,
  point: null,    // {lat, lon, quality, …}
  hervor: false,  // Strecke ohne Kilometer gesucht: Linie kräftig in der Signalfarbe (ifgZeichnen)
  busy: false
};

/* Signalfarben. Standard ist Lapis — der Blauton des Logos.
 * Je Farbe ein Ton fürs Dunkle und einer fürs Helle: der Logoton selbst
 * steht auf schwarzem Grund nur bei 3:1 und ist dort für Beschriftungen
 * zu dunkel, im Hellen sitzt er dagegen genau richtig. `ink` ist die
 * Schrift auf gefüllten Flächen — mal Schwarz, mal Weiß, je nachdem,
 * wie hell die Fläche ist. */
const PALETTEN = {
  lapis:   { name: 'Lapis',   dark: { accent: '#55a5e7', ink: '#06070b' }, light: { accent: '#1761a3', ink: '#ffffff' } },
  grau:    { name: 'Grau',    dark: { accent: '#7d7d7d', ink: '#06070b' }, light: { accent: '#5f5f5f', ink: '#ffffff' } },
  violett: { name: 'Violett', dark: { accent: '#a78bfa', ink: '#06070b' }, light: { accent: '#6d4fd6', ink: '#ffffff' } },
  orange:  { name: 'Orange',  dark: { accent: '#f5a524', ink: '#06070b' }, light: { accent: '#96590a', ink: '#ffffff' } },
  gruen:   { name: 'Grün',    dark: { accent: '#34d399', ink: '#06070b' }, light: { accent: '#0f8a62', ink: '#ffffff' } },
  // Seit 11.10.2026; jeder Ton gegen Grund und Fläche nachgerechnet, mindestens 4,8:1
  tuerkis: { name: 'Türkis',  dark: { accent: '#22d3ee', ink: '#06070b' }, light: { accent: '#0e7490', ink: '#ffffff' } },
  rot:     { name: 'Rot',     dark: { accent: '#ff3b30', ink: '#06070b' }, light: { accent: '#d50000', ink: '#ffffff' } },
  pink:    { name: 'Pink',    dark: { accent: '#f472b6', ink: '#06070b' }, light: { accent: '#be185d', ink: '#ffffff' } },
  gelb:    { name: 'Gelb',    dark: { accent: '#facc15', ink: '#06070b' }, light: { accent: '#8a6500', ink: '#ffffff' } },
  oliv:    { name: 'Oliv',    dark: { accent: '#a3c95a', ink: '#06070b' }, light: { accent: '#53701a', ink: '#ffffff' } },
};

let prefs = {
  theme: 'auto', palette: 'lapis', base: 'osm', orm: true, baseOpacity: 100,
  dopFarbe: 100,                         // Sättigung des DOP20 in %, 100 = wie geliefert
  bildHell: 100,                         // Helligkeit von DOP20 und Relief in %, 100 = wie geliefert
  reliefFarbe: false,                    // Relief als Höhenfarben aus dem DGM1 statt Schräglicht
  abSort: 'nah',                         // Abstecken: Punktliste nach Entfernung, Name oder Datei
  abKompass: false,                      // Abstecken: Pfeil nach dem Handy statt nach der Karte
  parzFarbe: 'auto',                     // 'auto' (nach Grundkarte) oder '#rrggbb'
  parzPunkte: true,                      // Punktraster der Nutzung (Grünland …) in den Parzellen zeigen
  ifg: false,                            // Auflage DB-Netz (InfraGO)
  ifgInhalt: null,                       // was sie zeigt: { strecken, km, bs, bue, bruecken, tunnel } — fehlt = an
  profUeber: 1,                          // Querprofil: Überhöhung, 1 bis 20
  gpArt: 'quer', gpBreite: 50, gpLaenge: 250,   // Profil am Gleis: Quer/Längs, je Seite bzw. Richtung in m
  gpUeberLaengs: 10,                     // Profil am Gleis, längs: eigene Überhöhung
  mappeText: '', mappeBreite: 50, mappeUeber: 1, mappeGeb: false, mappeDom: false,   // Profilmappe
  tourAngeboten: false,                  // die Tour wurde beim ersten Start schon einmal angeboten
  wms: { url: '', layers: '', opacity: 75, on: false }   // nur Adresse und Layer, nie Zugangsdaten
};
let recent = [];   // nicht "history" nennen — das ist window.history

/* Mehrere Achspunkte auf einmal: Im Feld stehen dann mehrere Kilometer, durch
 * & oder Leerzeichen getrennt. Alle stehen gleichberechtigt auf der Karte;
 * view.point ist der, den die untere Leiste gerade beschreibt. Bei einem
 * einzelnen Punkt bleibt die Reihe leer und alles läuft wie bisher. */
let reihe = [];          // [{ km, punkt, pfad }]
let reiheAktiv = 0;
let reiheFehler = [];    // Kilometer der Reihe, die nicht zu bestimmen waren
const REIHE_MAX = 20;    // ein verrutschtes Einfügen soll nicht 500 Abfragen auslösen

/** Kilometer aus einem Feldinhalt herauslösen — & oder Leerzeichen trennen. */
const kmTokens = s => String(s).split(/[&;\s]+/).filter(Boolean);

/* ============================ Karte ============================ */

let map, baseOsm, baseDop, baseRelief, ormLayer, parzLayer, glGrund;
let msLayer, trackLayer, pointLayer, meLayer, merkLayer, liveLayer;
/* Hintergründe schließen sich aus, Auflagen nicht — als Verzeichnis gehalten,
 * damit ein weiterer Dienst nur ein Eintrag und ein Knopf ist. */
let baseLayers = {};
let overlayLayers = {};
let pointMarker = null;

/* Zwei Finger drehen die Karte erst, wenn sie sich um DREH_SCHWELLE Grad
 * gegeneinander verdreht haben — wie bei Google Maps. Vorher bleibt die Karte
 * genordet, und ein Zweifinger-Zoom kippt sie nicht nebenbei ein paar Grad.
 * Ist die Schwelle erreicht, dreht die Karte von dort aus weiter, ohne den
 * aufgelaufenen Winkel nachzuholen: kein Ruck.
 *
 * leaflet-rotate kennt keine Schwelle. Statt die Bibliothek unter vendor/ zu
 * ändern, wird ihr Gestenhandler hier umhüllt: Solange die Schwelle nicht
 * erreicht ist, steht sein _rotating auf false — der Zoom läuft dabei normal
 * weiter —, und beim Überschreiten wird _startBearing so verschoben, dass die
 * Rechnung der Bibliothek genau beim aktuellen Winkel ansetzt. */
const DREH_SCHWELLE = 15;

function drehSchwelleEinbauen() {
  const G = L.Map.TouchGestures && L.Map.TouchGestures.prototype;
  if (!G || G._drehSchwelle) return;
  G._drehSchwelle = true;
  const start = G._onTouchStart, zug = G._onTouchMove, ende = G._onTouchEnd;

  G._onTouchStart = function (e) {
    /* Nur wenn die Bibliothek wirklich eine neue Geste beginnt — ihre eigenen
     * Bedingungen. Ein dritter Finger mitten in einer Drehung löst ebenfalls
     * touchstart aus; ohne diese Prüfung fiele die laufende Drehung dann zurück
     * in die Wartestellung und bräuchte noch einmal 15°. */
    const neu = e.touches && e.touches.length === 2 &&
      !this._map._animatingZoom && !this._zooming && !this._rotating;
    start.call(this, e);
    if (!neu) return;
    this._drehWartet = !!this._rotating;
    if (this._drehWartet) this._rotating = false;
  };

  G._onTouchMove = function (e) {
    if (this._drehWartet && e.touches && e.touches.length === 2) {
      const m = this._map;
      const v = m.mouseEventToContainerPoint(e.touches[0])
        .subtract(m.mouseEventToContainerPoint(e.touches[1]));
      // Dieselbe Rechnung wie in leaflet-rotate, samt Halbkreis-Ausgleich
      let d = (Math.atan(v.x / v.y) - this._startTheta) * L.DomUtil.RAD_TO_DEG;
      if (v.y < 0) d += 180;
      const r = ((this._startBearing - d - m.getBearing()) % 360 + 540) % 360 - 180;
      if (Math.abs(r) >= DREH_SCHWELLE) {
        this._startBearing -= r;
        this._rotating = true;
        this._drehWartet = false;
      }
    }
    zug.call(this, e);
  };

  G._onTouchEnd = function (e) {
    this._drehWartet = false;
    ende.call(this, e);
  };
}

/* ---- MapLibre-Grund: dunkle Karte, scharfe Straßen und Ortsnamen ----
 *
 * OpenFreeMap gibt es nur als Vektorkarte, und die zeichnet Leaflet nicht.
 * Deshalb läuft dafür eine zweite Karte (MapLibre GL, vendor/maplibre/, BSD-3)
 * in #glKarte hinter der Leaflet-Karte. Sie nimmt keine Eingaben an; Leaflet
 * bleibt die eine Karte, die bedient wird, und MapLibre zieht bei jeder
 * Bewegung, jedem Zoom und jeder Drehung nach (glNachziehen).
 *
 * Sie zeichnet zweierlei (glStil):
 * - die dunkle Grundkarte, den fertigen Stil von OpenFreeMap;
 * - ein Bild (Luftbild, DOP20, Relief) mit Straßen und Ortsnamen als Vektoren
 *   darüber. Die kamen bis 30.09.2026 als Rasterkacheln von Esri — auf dem
 *   Land ab Zoomstufe 16 leer (gemessen bei Ermetzhofen: nur noch 872-Byte-
 *   Leerbilder) und auf dem Handy unscharf hochgezogen. Als Vektoren sind sie
 *   in jeder Zoomstufe scharf und reichen bis ganz nah.
 *   Das Bild zeichnet dann MapLibre mit, nicht Leaflet: Nur so liegen die
 *   Straßen zwischen Bild und Bahn-Layer. Leaflet legt Parzellen, Bahn-Layer,
 *   eigenen WMS und Pins weiter obendrauf.
 * Über Dunkel ersetzen unsere Straßen und Namen die sehr zurückhaltenden der
 * dunklen Karte (glDunkelErsetzt). Über der OSM-Karte braucht es sie nicht,
 * dort zeichnet Leaflet wie immer (glGebraucht).
 *
 * Warum nicht als Leaflet-Ebene (maplibre-gl-leaflet): Die legt ihre Fläche in
 * die Kachelebene, und die dreht leaflet-rotate per CSS. Eine gedrehte
 * bildschirmgroße Fläche lässt an den Ecken Lücken. Hinter der Karte dreht
 * MapLibre selbst und füllt das Bild immer ganz.
 *
 * Geladen wird MapLibre erst, wenn es gebraucht wird: rund 1,2 MB, die sonst
 * jeder Start mitschleppen müsste. Version 6.10.0, am 30.09.2026 aus
 * der npm-Registry geholt und gegen deren SHA-512-Prüfsumme geprüft; bewusst
 * nicht die damals sechs Tage alte 6.11.2. Der Worker startet als eigene Datei
 * vom selben Ort, die CSP (script-src/worker-src 'self') bleibt dadurch streng.
 *
 * Zoom: Leaflet rechnet mit 256-px-Kacheln, MapLibre mit 512 px — dieselbe
 * Ansicht ist in MapLibre eine Stufe kleiner. */
const OFM_DUNKEL = 'https://tiles.openfreemap.org/styles/dark';
const OFM_KACHELN = 'https://tiles.openfreemap.org/planet';
const OFM_GLYPHEN = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const OFM_QUELLE = '<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; OpenMapTiles, Daten &copy; OpenStreetMap';
// Nur noch die Parzellen — DOP20 und Relief nennen die Länder selbst (LAND_URHEBER)
const BVV_QUELLE = 'Parzellen: <a href="https://www.geodaten.bayern.de/">Bayerische Vermessungsverwaltung</a> (CC BY 4.0)';
/* Urheber je Land, wie es die Dienste verlangen; wo ein Jahr des Datenbezugs
 * gefordert ist, das laufende. Das DOP20 nennt nur die Länder, die gerade im
 * Bild sind (dopQuelleErneuern), das Relief kommt immer aus Bayern und BW. */
const JAHR = new Date().getFullYear();
const LAND_URHEBER = {
  by: '<a href="https://www.geodaten.bayern.de/">Bayerische Vermessungsverwaltung</a> (CC BY 4.0)',
  bw: `<a href="https://www.lgl-bw.de/">LGL-BW</a> (${JAHR}, dl-de/by-2-0)`,
  nw: 'Geobasis NRW (dl-de/zero-2-0)',
  ni: `LGLN (${JAHR}, CC BY 4.0)`,
  he: 'HVBG (dl-de/zero-2-0)',
  rp: `GeoBasis-DE / LVermGeoRP (${JAHR}, dl-de/by-2-0)`,
  sl: 'GeoBasis-DE / LVGL-SL (dl-de/by-2-0)',
  th: '© GDI-Th (CC BY 4.0)',
  sn: 'GeoSN (dl-de/by-2-0)',
  st: 'GeoBasis-DE / LVermGeo LSA (dl-de/by-2-0)',
  bb: 'GeoBasis-DE/LGB (dl-de/by-2-0)',
  be: 'Geoportal Berlin (dl-de/zero-2-0)',
  mv: `GeoBasis-DE/M-V ${JAHR}`,
  sh: 'GeoBasis-DE/LVermGeo SH (CC BY 4.0)',
  hb: 'Landesamt GeoInformation Bremen (CC BY)',
  hh: 'FHH, LGV (dl-de/by-2-0)'
};
const landQuelle = (was, laender) => `${was}: ${laender.map(l => LAND_URHEBER[l]).join(', ')}`;
const RELIEF_QUELLE = landQuelle('Relief', ['by', 'bw']);

/* Die Bilder für MapLibre — dieselben Dienste und Grenzen wie die Leaflet-
 * Ebenen in initMap. DOP20 und Relief kommen über das Protokoll land:// aus
 * dopKachel (das Land je Kachel entschieden). Eine 256er-Rasterkachel holt
 * MapLibre auf derselben Zoomstufe wie Leaflet. */
/* Bis zu welcher Zoomstufe die Bilder der BVV geholt werden; darüber wird das
 * Bild der letzten Stufe weich vergrößert (Leaflet per CSS, MapLibre linear).
 * Das DOP20 hat 20 cm Bodenpixel, in Bayern ist das Zoomstufe 19 (0,20 m/px);
 * das Relief kommt aus dem DGM1, 1 m, also Stufe 18 (0,40 m/px) mit etwas
 * Reserve. Bis Oktober 2026 ging es bis 22: Der MapServer der BVV rechnet so
 * feine Kacheln pixelweise hoch (Glättungsparameter ignoriert er, gemessen
 * bitgleich), ganz nah sah man Blöcke von 8 × 8 Bildpunkten. */
const BVV_NATIV = { dop: 19, relief: 18 };

const GL_BILDER = {
  // Alle Länder, je Kachel entschieden (dopKachel, Protokoll in glLaden); Quelle nach Ausschnitt
  dop: { url: 'land://dop/{z}/{x}/{y}', maxzoom: BVV_NATIV.dop, quelle: null },
  relief: { url: 'land://relief/{z}/{x}/{y}', maxzoom: BVV_NATIV.relief, quelle: RELIEF_QUELLE }
};

let gl = null;            // die MapLibre-Karte, sobald geladen
let glVersprechen = null; // läuft das Laden schon?
let glAn = false;         // zeichnet MapLibre gerade den Grund?
let glKaputt = false;     // ließ es sich nicht laden (kein WebGL, offline beim ersten Mal)?
let glDeckung = 1;
let glStilZuletzt = '';   // der zuletzt gesetzte Stil, als Text — gleich heißt: nichts tun
let glQuellenZuletzt = [];

/** Braucht die Ansicht MapLibre? Für die dunkle Karte immer, für Straßen und
 *  Ortsnamen nur über einem Bild. */
function glGebraucht() {
  if (glKaputt) return false;
  const b = prefs.base || 'osm';
  return b === 'dark' || (!!GL_BILDER[b] && (!!prefs.str || !!prefs.ort)) || hoehenGezeichnet();
}

/* Straßen und Namen über dem Bild: helle Linien mit dunklem Umriss, damit sie
 * auf hellem Acker wie auf dunklem Wald stehen; Fernstraßen gelb, Hauptstraßen
 * blassgelb, der Rest weiß. Keine Bahn — die zeichnet der Bahn-Layer. Kleine
 * Straßen erst ab Zoomstufe 13 (Leaflet 14), sonst deckt das Netz das Bild zu. */
const GL_NAME = ['coalesce', ['get', 'name:de'], ['get', 'name']];
const GL_GROSS = ['motorway', 'trunk', 'primary', 'secondary'];
const GL_KLEIN = ['tertiary', 'minor', 'service'];
const glLinie = klassen => ['all',
  ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
  ['match', ['get', 'class'], klassen, true, false]];
const glBreite = (fern, haupt, sonst) => ['interpolate', ['exponential', 1.5], ['zoom'],
  9, ['match', ['get', 'class'], ['motorway', 'trunk'], fern[0], ['primary', 'secondary'], haupt[0], sonst[0]],
  18, ['match', ['get', 'class'], ['motorway', 'trunk'], fern[1], ['primary', 'secondary'], haupt[1], sonst[1]]];
const GL_UMRISS = glBreite([2.6, 14], [2.2, 11], [1.4, 7]);
const GL_STRICH = glBreite([1.2, 10], [0.9, 7.5], [0.5, 4.5]);
/* Kleine Straßen: auf dem Bild fast deckend weiß, damit sie gegen hellen Acker
 * bestehen; auf der dunklen Karte gedämpft — dort war das volle Weiß ein
 * grelles Netz über allem. */
const glFarbe = dunkel => ['match', ['get', 'class'], ['motorway', 'trunk'], '#ffd166',
  ['primary', 'secondary'], '#fff1b8', dunkel ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.85)'];
const GL_SCHRIFT_WEISS = { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0, 0, 0, 0.8)', 'text-halo-width': 1.3 };

/* src: Name der OpenFreeMap-Quelle im Stil — im zusammengesetzten Bildstil
 * „ofm", im dunklen Stil von OpenFreeMap selbst „openmaptiles". */
function glStrassen(src = 'ofm') {
  const quelle = { source: src, 'source-layer': 'transportation' };
  const farbe = glFarbe(src === 'openmaptiles');
  const rund = { 'line-cap': 'round', 'line-join': 'round' };
  return [
    /* Weit draußen nur die Autobahnen, dünner — ab Stufe 8 übernehmen die
     * großen Straßen. Die Kacheln haben Autobahnen ab Stufe 4. */
    { id: 'str-umriss-fern', type: 'line', ...quelle, minzoom: 4, maxzoom: 8, filter: glLinie(['motorway']), layout: rund,
      paint: { 'line-color': 'rgba(0, 0, 0, 0.45)', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.6, 8, 2.6] } },
    { id: 'str-fern', type: 'line', ...quelle, minzoom: 4, maxzoom: 8, filter: glLinie(['motorway']), layout: rund,
      paint: { 'line-color': farbe, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.2] } },
    { id: 'str-umriss-klein', type: 'line', ...quelle, minzoom: 13, filter: glLinie(GL_KLEIN), layout: rund,
      paint: { 'line-color': 'rgba(0, 0, 0, 0.45)', 'line-width': GL_UMRISS } },
    { id: 'str-umriss-gross', type: 'line', ...quelle, minzoom: 8, filter: glLinie(GL_GROSS), layout: rund,
      paint: { 'line-color': 'rgba(0, 0, 0, 0.45)', 'line-width': GL_UMRISS } },
    { id: 'str-klein', type: 'line', ...quelle, minzoom: 13, filter: glLinie(GL_KLEIN), layout: rund,
      paint: { 'line-color': farbe, 'line-width': GL_STRICH } },
    { id: 'str-gross', type: 'line', ...quelle, minzoom: 8, filter: glLinie(GL_GROSS), layout: rund,
      paint: { 'line-color': farbe, 'line-width': GL_STRICH } },
    { id: 'str-namen', type: 'symbol', source: src, 'source-layer': 'transportation_name', minzoom: 13,
      filter: ['match', ['get', 'class'], [...GL_GROSS, ...GL_KLEIN], true, false],
      layout: { 'symbol-placement': 'line', 'text-field': GL_NAME, 'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 13], 'text-max-angle': 30 },
      paint: GL_SCHRIFT_WEISS }
  ];
}

/* Ortsnamen: Städte groß und fett, Dörfer kleiner, Weiler und Ortsteile erst
 * aus der Nähe. Welche bei Platzmangel zuerst stehen, entscheidet der Rang. */
function glOrte(src = 'ofm') {
  const groesse = f => ['match', ['get', 'class'], 'city', 16 * f, 'town', 14 * f, 'village', 12.5 * f, 11 * f];
  const ebene = (id, minzoom, klassen) => ({
    id, type: 'symbol', source: src, 'source-layer': 'place', minzoom,
    filter: ['match', ['get', 'class'], klassen, true, false],
    layout: { 'text-field': GL_NAME, 'text-font': ['Noto Sans Bold'], 'text-max-width': 8,
      'text-size': ['interpolate', ['linear'], ['zoom'], 8, groesse(0.85), 14, groesse(1.15)],
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
    paint: GL_SCHRIFT_WEISS
  });
  return [
    // Weit draußen die Länder (und die Regionen der Nachbarn), bis die Orte kommen
    { id: 'land-namen', type: 'symbol', source: src, 'source-layer': 'place', minzoom: 4, maxzoom: 8,
      filter: ['==', ['get', 'class'], 'state'],
      layout: { 'text-field': GL_NAME, 'text-font': ['Noto Sans Regular'], 'text-max-width': 7,
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 7, 13], 'text-letter-spacing': 0.08,
        'text-transform': 'uppercase' },
      paint: { ...GL_SCHRIFT_WEISS, 'text-color': 'rgba(255, 255, 255, 0.85)' } },
    ebene('ort-namen', 8, ['city', 'town', 'village']),
    ebene('ort-namen-klein', 12, ['hamlet', 'suburb', 'quarter', 'neighbourhood'])
  ];
}

/* Grenzen, mit den Ortsnamen geschaltet: Staaten durchgezogen, Länder
 * gestrichelt, Regierungsbezirke gepunktet. Die Kacheln haben Staaten und
 * Länder in jeder Stufe, Bezirke (admin_level 5) erst ab Stufe 9 (gemessen
 * 02.11.2026). Seegrenzen nicht — die laufen sonst mitten durchs Meer. Unter
 * den Straßen, damit eine Autobahn an der Grenze nicht zerschnitten wirkt. */
function glGrenzen(src = 'ofm') {
  const quelle = { source: src, 'source-layer': 'boundary' };
  const ebene = (stufe, minzoom, breite, strich, deckung) => {
    const filter = ['all', ['==', ['get', 'admin_level'], stufe], ['!=', ['get', 'maritime'], 1]];
    return [
      { id: `grenze-${stufe}-umriss`, type: 'line', ...quelle, minzoom, filter,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': 'rgba(0, 0, 0, 0.5)', 'line-width': breite + 2 } },
      { id: `grenze-${stufe}`, type: 'line', ...quelle, minzoom, filter,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': `rgba(255, 255, 255, ${deckung})`, 'line-width': breite,
          ...(strich ? { 'line-dasharray': strich } : {}) } }
    ];
  };
  return [
    ...ebene(5, 9, 1.1, [1.5, 2], 0.9),
    ...ebene(4, 0, 1.1, [4, 2.5], 0.85),
    ...ebene(2, 0, 1.6, null, 0.95)
  ];
}

/* Die dunkle Karte bringt eigene Straßen und Namen mit, sehr zurückhaltend.
 * Sind unsere eingeschaltet, ersetzen sie diese — sonst stünden die Namen
 * doppelt. Die Bahnlinien der dunklen Karte (railway…) bleiben stehen. Dafür
 * braucht es den Stil als Daten und nicht nur seine Adresse; er wird einmal
 * geholt (Service Worker: „erst Netz", siehe sw.js). */
let glDunkelJson = null;
let glDunkelLaden = null;

function glDunkelHolen() {
  if (glDunkelLaden) return;
  glDunkelLaden = fetch(OFM_DUNKEL)
    .then(r => { if (!r.ok) throw new Error('Stil nicht geladen: ' + r.status); return r.json(); })
    .then(stil => { glDunkelJson = stil; glStilSetzen(); })
    .catch(err => { console.warn(err); glDunkelLaden = null; });   // beim nächsten Anlass neu
}

function glDunkelErsetzt(ebene) {
  const quelle = ebene['source-layer'];
  if (prefs.str && quelle === 'transportation_name') return true;
  if (prefs.str && quelle === 'transportation' && !ebene.id.startsWith('railway')) return true;
  return !!prefs.ort && (quelle === 'place' || quelle === 'boundary');
}

/** Der Stil für die aktuelle Wahl: die dunkle Karte (fertiger Stil, bei
 *  eingeschalteten Straßen/Namen mit unseren statt ihren), sonst Bild +
 *  Straßen/Namen, zusammengesetzt. Beim Bild wirkt die Deckkraft nur aufs Bild;
 *  verblasst liegt Weiß darunter wie bei den übrigen Grundkarten. */
function glStil() {
  const b = prefs.base || 'osm';
  if (b === 'dark' || !GL_BILDER[b]) {
    if (!prefs.str && !prefs.ort) return OFM_DUNKEL;
    if (!glDunkelJson) { glDunkelHolen(); return OFM_DUNKEL; }   // bis dahin ohne unsere
    return {
      ...glDunkelJson,
      layers: [
        ...glDunkelJson.layers.filter(l => !glDunkelErsetzt(l)),
        ...(prefs.ort ? glGrenzen('openmaptiles') : []),
        ...(prefs.str ? glStrassen('openmaptiles') : []),
        ...(prefs.ort ? glOrte('openmaptiles') : [])
      ]
    };
  }
  const bild = GL_BILDER[b];
  const grund = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#06070b';
  return {
    version: 8, glyphs: OFM_GLYPHEN,
    sources: {
      bild: { type: 'raster', tiles: [bild.url], tileSize: 256, maxzoom: bild.maxzoom },
      ...(hoehenGezeichnet() ? { dgm: glDgmQuelle() } : {}),
      ofm: { type: 'vector', url: OFM_KACHELN }
    },
    layers: [
      { id: 'hintergrund', type: 'background', paint: { 'background-color': glDeckung < 1 ? '#ffffff' : grund } },
      { id: 'bild', type: 'raster', source: 'bild', paint: { 'raster-opacity': glDeckung, 'raster-fade-duration': 0,
        'raster-saturation': b === 'dop' ? glSaettigung(dopFarbe()) : 0, 'raster-brightness-max': bildHell() } },
      ...(hoehenGezeichnet() ? glHoehenEbenen() : []),
      ...(prefs.ort ? glGrenzen() : []),
      ...(prefs.str ? glStrassen() : []),
      ...(prefs.ort ? glOrte() : [])
    ]
  };
}

/** Den Stil nur setzen, wenn er sich geändert hat. Zwischen zwei zusammen-
 *  gesetzten Stilen gleicht MapLibre nur den Unterschied ab (diff) — eine
 *  zugeschaltete Auflage lädt das Bild nicht neu. */
function glStilSetzen() {
  if (!gl) return;
  const stil = glStil();
  const text = typeof stil === 'string' ? stil : JSON.stringify(stil);
  if (text === glStilZuletzt) return;
  glStilZuletzt = text;
  gl.setStyle(stil, { diff: true });
}

/* Quellenangaben für das, was MapLibre gerade zeichnet. Die Leaflet-Ebene des
 * Bildes ist dann nicht auf der Karte und bringt ihre Angabe nicht selbst mit;
 * deshalb hier von Hand. Leaflet zählt gleiche Angaben mit — die BVV-Angabe der
 * Parzellen und die des DOP20 heben sich also nicht gegenseitig auf. */
function glQuellenErneuern() {
  const b = prefs.base || 'osm';
  const ofm = prefs.str || prefs.ort ? OFM_QUELLE : null;
  const neu = !glAn ? [] : b === 'dark' ? [OFM_QUELLE]
    : [GL_BILDER[b].quelle, hoehenGezeichnet() ? DGM_QUELLE : null, ofm].filter(Boolean);
  if (neu.join('|') === glQuellenZuletzt.join('|')) return;
  for (const q of glQuellenZuletzt) map.attributionControl.removeAttribution(q);
  for (const q of neu) map.attributionControl.addAttribution(q);
  glQuellenZuletzt = neu;
}

function glLage() {
  /* Die Mitte, wie sie gezeichnet ist, nicht getCenter(): Nach setView meldet
   * Leaflet die gewünschte Mitte, legt das Pixelraster aber auf ganze Pixel —
   * gemessen 0,47 px Versatz zwischen beiden Karten, nach dem ersten
   * Verschieben 0. Über die Bildmitte sind es in jeder Lage 0. */
  const c = map.containerPointToLatLng(map.getSize().divideBy(2));
  // leaflet-rotate dreht im Uhrzeigersinn, MapLibre gegen ihn
  return { center: [c.lng, c.lat], zoom: map.getZoom() - 1, bearing: -(map.getBearing ? map.getBearing() : 0) };
}

function glNachziehen() {
  if (gl && glAn) gl.jumpTo(glLage());
}

/* Beim animierten Zoom (Doppeltipp, Mausrad, Ende einer Zweifingergeste) gleitet
 * Leaflet 0,25 s per CSS zum Ziel und meldet sich erst am Ende. MapLibre gleitet
 * mit, in Leaflets Kurve cubic-bezier(0, 0, .25, 1) — sonst stünde der Grund
 * eine Viertelsekunde still und spränge dann. */
function glZoomGleiten(ev) {
  if (!gl || !glAn) return;
  gl.easeTo({
    center: [ev.center.lng, ev.center.lat], zoom: ev.zoom - 1,
    bearing: -(map.getBearing ? map.getBearing() : 0),
    duration: 250, easing: t => 1 - Math.pow(1 - t, 3)
  });
}

/* Verblassen. Die dunkle Karte ist ein fertiger Stil: dort wird die ganze
 * Fläche durchscheinend, mit Weiß darunter. Beim Bild wirkt die Deckkraft im
 * Stil nur aufs Bild (glStil) — Straßen und Namen bleiben kräftig. */
function glDeckungSetzen() {
  const flaeche = $('#glKarte');
  const dunkel = (prefs.base || 'osm') === 'dark';
  if (flaeche) flaeche.style.background = dunkel && glDeckung < 1 ? '#ffffff' : '';
  if (gl) gl.getCanvas().style.opacity = String(dunkel ? glDeckung : 1);
  glStilSetzen();
}

async function glLaden() {
  if (!glVersprechen) {
    glVersprechen = (async () => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'vendor/maplibre/maplibre-gl.css';
      document.head.appendChild(css);
      const maplibregl = await import('./vendor/maplibre/maplibre-gl.mjs');
      // DOP20 und Relief aus den Ländern: dieselbe Kachel wie in Leaflet (dopKachel)
      maplibregl.addProtocol('land', async (anfrage, abbruch) => {
        const [art, z, x, y] = anfrage.url.slice('land://'.length).split('/');
        return { data: await (await dopKachel(art, +z, +x, +y, abbruch.signal)).arrayBuffer() };
      });
      // Höhen aus dem DGM1 als Terrarium-Kachel (dgmKachel)
      maplibregl.addProtocol('dgm', async (anfrage, abbruch) => {
        const [z, x, y] = anfrage.url.slice('dgm://'.length).split('/');
        return { data: await dgmKachel(+z, +x, +y, abbruch.signal) };
      });
      const stil = glStil();
      glStilZuletzt = typeof stil === 'string' ? stil : JSON.stringify(stil);
      gl = new maplibregl.Map({
        container: 'glKarte', style: stil,
        interactive: false, attributionControl: false,
        fadeDuration: 0, maxZoom: 21,
        ...glLage()
      });
      gl.on('error', ev => { if (ev.sourceId) { glFehlerQuellen.add(ev.sourceId); kachelnNeuSpaeter(); } });
      glDeckungSetzen();
      return gl;
    })();
    // Scheitert es, beim nächsten Versuch neu laden statt am alten Fehler hängen
    glVersprechen.catch(() => { glVersprechen = null; gl = null; });
  }
  return glVersprechen;
}

/* moveend und zoomend zusätzlich: Am Ende eines animierten Zooms meldet
 * Leaflet kein move, nur die beiden. Ohne sie bliebe es beim Gleiten aus
 * glZoomGleiten — und wird das unterbrochen (Fenster kurz verdeckt, dann
 * läuft keine Animation), stünden die Karten versetzt. */
const GL_EREIGNISSE = 'move zoom rotate viewreset resize moveend zoomend';

/** MapLibre als Leaflet-Ebene — nur ein Schalter für #glKarte, damit
 *  grundAnwenden und die Deckkraft sie wie jede andere Grundkarte führen.
 *  Die Quellenangabe setzt glQuellenErneuern, sie wechselt mit dem Inhalt. */
const GlGrund = L.Layer.extend({
  onAdd(m) {
    glAn = true;
    $('#glKarte').hidden = false;
    $('#map').classList.add('gl-grund');
    m.on(GL_EREIGNISSE, glNachziehen);
    m.on('zoomanim', glZoomGleiten);
    glQuellenErneuern();
    glLaden().then(() => {
      glStilSetzen();
      glNachziehen();
      gl.resize();     // war das Feld beim Anlegen noch verborgen, stimmt die Größe sonst nicht
    }).catch(err => {
      /* Ohne MapLibre (kein WebGL, beim ersten Mal offline) zurück auf das,
       * was Leaflet allein kann: die Karte statt Dunkel, das Bild ohne
       * Straßen und Namen. */
      console.warn('MapLibre nicht verfügbar:', err);
      glKaputt = true;
      if ((prefs.base || 'osm') === 'dark') {
        toast('Dunkle Karte nicht verfügbar — zurück auf die normale Karte.');
        setBase('osm');
      } else {
        toast('Straßen und Ortsnamen gerade nicht verfügbar.');
        grundAnwenden();
      }
    });
    return this;
  },

  onRemove(m) {
    glAn = false;
    $('#glKarte').hidden = true;
    $('#map').classList.remove('gl-grund');
    m.off(GL_EREIGNISSE, glNachziehen);
    m.off('zoomanim', glZoomGleiten);
    glQuellenErneuern();
    return this;
  },

  setOpacity(o) {
    glDeckung = o;
    glDeckungSetzen();
    return this;
  }
});

function initMap() {
  drehSchwelleEinbauen();
  map = L.map('map', {
    zoomControl: false, attributionControl: true, tap: true,
    // Drehung über leaflet-rotate; eigener Nordknopf statt des mitgelieferten
    rotate: true, rotateControl: false, touchRotate: true,
    bearing: 0
  }).setView([51.1, 10.3], 6);

  /* Eigene Ebene nur für Punktsymbole und Namen, und die hängt unter
   * norotatePane — dort, wo Leaflet selbst seine Marker führt. Eine Pane direkt
   * unter mapPane sah erst richtig aus und verschob sich dann beim Zoomen einer
   * gedrehten Karte (gemessen 36/-78 px), weil leaflet-rotate die Panes aufteilt.
   *
   * Linien und Flächen aus KML gehen bewusst in Leaflets normale Vektorebene
   * (overlayPane) und nicht in eine eigene: Für eine eigene Pane legt Leaflet
   * einen zweiten SVG-Renderer an, und genau den kennzeichnet leaflet-rotate im
   * eigenen Quelltext mit einem FIXME zum Verrutschen beim Zoomen. Die
   * Standardebene trägt seit Monaten die Steinlinie der App ohne Versatz. */
  map.createPane('kmlIconPane', map._norotatePane || undefined);
  map.getPane('kmlIconPane').style.zIndex = 620;    // über allen Markern, unter Sprechblasen

  /* maxZoom gegen maxNativeZoom: maxZoom heißt bei einer Kachelebene „darüber
   * gar nicht mehr zeichnen" — die Ebene verschwindet dann ganz. maxNativeZoom
   * heißt „ab hier die letzte vorhandene Kachel hochskalieren", sie bleibt also
   * sichtbar, nur unscharf. Vorher stand bei OSM und Bahn-Layer maxZoom 19:
   * Wer über einen WMS-Hintergrund (maxZoom 22) tiefer hineinzoomte und dann
   * zurück auf Karte oder Luftbild schaltete, saß auf weißem Grund. Dasselbe
   * hatten wir schon beim eigenen WMS-Layer. */
  /* crossOrigin: Alle eingebauten Dienste senden CORS-Header (geprüft 29.09.2026).
   * Mit CORS kommt die Kachel samt Status an, und der Service Worker legt nur
   * echte Treffer ab. Ohne CORS wäre sie undurchsichtig ("opaque"): Fehlerseiten
   * landeten mit im Cache, und Chrome rechnet jede solche Antwort mit mehreren MB
   * auf den Speicher an, den sich alle Apps dieser Herkunft teilen. */
  baseOsm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22, maxNativeZoom: 19, crossOrigin: 'anonymous',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });
  /* Das weltweite Luftbild von Esri (World Imagery) ist seit November 2026 raus:
   * Esri verlangt dafür einen API-Schlüssel oder ein ArcGIS-Konto, der Abruf
   * ohne war nur geduldet. Ein Luftbild gibt es seitdem nur noch amtlich, aus
   * den Ländern (DOP20), also nur für Deutschland. */

  /* Dunkle Karte, Straßen und Ortsnamen zeichnet MapLibre (GlGrund). Straßen
   * und Namen kamen bis 30.09.2026 als Rasterkacheln von Esri, die dunkle
   * Karte bis dahin ebenfalls (Dark Gray) — siehe den Abschnitt über glStil. */
  glGrund = new GlGrund();

  /* Offene Dienste der Bayerischen Vermessungsverwaltung, alle CC BY 4.0 und mit
   * EPSG:3857, laufen also direkt in Leaflet. Als WMS haben sie keine natürliche
   * Zoomgrenze, deshalb maxZoom 22.
   *
   * JPEG statt PNG bei den Rasterbildern: gemessen 13 kB gegenüber 172 kB je
   * Kachel beim Orthophoto, ohne sichtbaren Unterschied. Außerhalb Bayerns
   * antworten die Dienste mit einem leeren Bild und Status 200 — kein Fehler,
   * den man abfangen könnte, sondern weißer Grund. */
  const BVV = BVV_QUELLE;

  // Alle Länder, je Kachel entschieden (DopWms); die Quelle setzt dopQuelleErneuern nach Ausschnitt
  baseDop = new DopWms({ maxZoom: 22, maxNativeZoom: BVV_NATIV.dop, className: 'dop-ebene' });
  map.on('moveend', dopQuelleErneuern);
  map.on('moveend', () => hoehenSkalaZeigen());

  /* Schräglicht und nicht die kombinierte Darstellung: Das Schräglicht zeigt
   * Dämme, Einschnitte und alte Trassen plastisch, die kombinierte Fassung wäscht
   * genau diese kleinen Formen weg. In BW die Schummerung des LGL (LAND_WMS). */
  baseRelief = new DopWms({ art: 'relief', className: 'relief-ebene', maxZoom: 22, maxNativeZoom: BVV_NATIV.relief, attribution: RELIEF_QUELLE });

  /* Parzellarkarte nur als Umring: Die Farbfassung bringt einen deckend weißen
   * Grund mit (gemessen 0 % durchsichtig) und würde alles darunter verdecken.
   * Der Dienst zeichnet erst unterhalb 1:5000, also etwa ab Zoomstufe 17.
   * Immer die schwarze Fassung — gefärbt wird in der App (ParzWms). */
  /* Baden-Württemberg seit 14.10.2026: der INSPIRE-WMS des LGL zeichnet ebenfalls
   * schwarze Umringe mit Flurstücksnummer auf durchsichtigem Grund (gemessen
   * 22–35 kB je Kachel ab Stufe 17) und läuft damit durch dasselbe Umfärben.
   * Ein Punktraster für Nutzungsarten hat er nicht, punkte bleibt dort an.
   * Jede der beiden fragt nur im Rahmen ihres Landes. */
  const rahmen = r => L.latLngBounds([r.s, r.w], [r.n, r.o]);
  parzLayer = new ParzGruppe([
    new ParzWms('https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte', {
      layers: 'by_alkis_parzellarkarte_umr_schwarz', format: 'image/png', transparent: true,
      version: '1.3.0', maxZoom: 22, crossOrigin: 'anonymous', attribution: BVV, bounds: rahmen(HOEHEN_RAHMEN.by),
      farbe: hexRgb(parzFarbe()), punkte: !!prefs.parzPunkte
    }),
    new ParzWms('https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_INSP_BW_Flst_ALKIS', {
      layers: 'alkis:CP.CadastralParcel', format: 'image/png', transparent: true,
      // Der LGL zeichnet in jedem Maßstab (Stufe 15: 66 kB je Kachel, ein Gewirr) — wie in Bayern erst ab 17
      version: '1.3.0', maxZoom: 22, minZoom: 17, crossOrigin: 'anonymous', bounds: rahmen(HOEHEN_RAHMEN.bw),
      attribution: `Flurstücke und Gebäude BW: <a href="https://www.lgl-bw.de/">LGL-BW</a> (${new Date().getFullYear()}, dl-de/by-2-0)`,
      farbe: hexRgb(parzFarbe()), punkte: true, nurBayern: false
    }),
    /* Gebäudeumringe: In Bayern stehen sie in der Parzellarkarte; der Flurstücks-
     * dienst des LGL hat nur Flurstücke und Fluren (INSPIRE trennt die Themen),
     * die Gebäude sind ein eigener Dienst. Der braucht je Abfrage rund 2,3 s, fast
     * gleich, ob 256 oder 1024 px (14.10.2026: 2,0–3,3 s gegen 2,4–2,7 s) — daher
     * Kacheln zu 1024 px, ein Handybildschirm braucht dann 2–4 statt 20. */
    new ParzWms('https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_INSP_BW_Gebaeude_ALKIS', {
      layers: 'BU.Building', format: 'image/png', transparent: true, tileSize: 1024, zoomOffset: -2,
      version: '1.3.0', maxZoom: 22, minZoom: 17, crossOrigin: 'anonymous', bounds: rahmen(HOEHEN_RAHMEN.bw),
      farbe: hexRgb(parzFarbe()), punkte: true, nurBayern: false, fuellungWeg: true
    })
  ]);

  // Die Leaflet-Grundkarten. „dark" hat keine: die zeichnet immer MapLibre.
  baseLayers = { osm: baseOsm, dop: baseDop, relief: baseRelief };
  ormLayer = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
    subdomains: 'abc', maxZoom: 22, maxNativeZoom: 19, opacity: 0.85, crossOrigin: 'anonymous',
    attribution: '<a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
  });

  msLayer = L.layerGroup().addTo(map);
  trackLayer = L.layerGroup().addTo(map);
  pointLayer = L.layerGroup().addTo(map);
  liveLayer = L.layerGroup().addTo(map);      // Lot vom Standort auf die Trasse
  meLayer = L.layerGroup().addTo(map);
  merkLayer = L.layerGroup().addTo(map);

  /* Keine Zoomknöpfe: Am Rechner zoomt das Mausrad, am Gerät zwei Finger oder
   * ein Doppeltipp. Der Platz rechts unten gehört damit den eigenen Knöpfen. */
  // Leaflet rechnet ihn weiter selbst nach; gezeigt wird er in der Quellenzeile
  const massstab = L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  $('#quellenMass').appendChild(massstab.getContainer());
  quellenEinrichten();

  overlayLayers = { orm: ormLayer, parz: parzLayer, ifg: ifgAuflageAnlegen(), fp: fpAuflageAnlegen() };
  for (const k of Object.keys(overlayLayers)) auflageSetzen(k);
  auflageSetzen('radar');
  setBase(prefs.base || 'osm', true);     // setzt auch Straßen und Ortsnamen (grundAnwenden)
  applyBaseOpacity();
  if (prefs.wms && prefs.wms.on) wmsApply(true);

  map.on('click', onMapClick);
  merkPunktBinden();
  svBinden();
  map.on('zoom rotate', gesteBild);
  map.on('zoomend rotateend moveend', gesteEnde);
  map.on('move zoom rotate', messLiveZeichnen);
  messMausBinden();
  map.on('rotate rotateend', abNachziehen);      // die Pfeile beim Abstecken zeigen auf den Bildschirm
  map.on('zoomend', drawMilestones);
  // Die InfraGO-Kilometer werden nur für den Ausschnitt gerechnet — nach dem Schieben neu
  map.on('moveend', () => { if (view.ref && ifgStreckeJetzt(view.ref)) drawMilestones(); });
  map.on('rotate rotateend', syncNorth);

  /* leaflet-rotate lädt die Kacheln für die gedrehten Ecken erst am Ende einer
   * Bewegung (moveend). Am PC dreht Umschalt + Mausrad aber nur, ohne jede
   * Bewegung — nachgestellt am 30.09.2026: bei 30° blieben die Ecken schwarz,
   * bis man die Karte verschob. Deshalb die Kachelebenen nachladen, sobald eine
   * Drehung 120 ms ruht. Mit zwei Fingern kam das nicht vor, weil die Geste
   * dort immer mit einem Zoom-Ende schließt. */
  let drehRuhe = null;
  map.on('rotate', () => {
    clearTimeout(drehRuhe);
    drehRuhe = setTimeout(() => map.eachLayer(l => {
      if (l instanceof L.GridLayer && l._map) l._update();
    }), 120);
  });
  syncNorth();
  syncButtons();
}

/* ---- Vektoren während einer Zweifingergeste ----
 *
 * leaflet-rotate zieht die SVG-Vektorebene während einer laufenden Geste nicht
 * mit: Gemessen wandern Linien und Kreise mitten im Drehen und Zoomen um bis zu
 * 171 Pixel und springen am Ende zurück. Betroffen sind alle Vektoren gleich —
 * in Leaflets eigener Ebene genauso wie in einer selbst angelegten; Marker und
 * Symbole bleiben ruhig, weil die einzeln gesetzt werden. Deshalb sah es aus,
 * als sprängen „nur die Linien".
 *
 * Ein erzwungenes Neusetzen des Renderers je Bild hält alles auf 0 Pixel. Es
 * kostet aber Rechenzeit: gemessen 0,6 ms bei den üblichen Dateien (auch bei 23
 * Linien), 2 ms bei 200 Kreisen, aber 14 ms bei einer einzigen Linie mit 5000
 * Stützpunkten — das wäre bei 60 Bildern je Sekunde zu viel. Deshalb bis zu
 * einem Budget nachziehen und darüber die Vektorebene für die Dauer der Geste
 * ausblenden: Verschwundene Linien irritieren weniger als umherfliegende. */

const VEKTOR_BUDGET = 2500;      // Stützpunkte, bis zu denen je Bild nachgezogen wird

let gesteLaeuft = false;
let gesteModus = null;

function alleRenderer() {
  const raus = [];
  if (map._renderer) raus.push(map._renderer);
  for (const r of Object.values(map._paneRenderers || {})) if (r) raus.push(r);
  return raus;
}

function vektorLast() {
  let n = 0;
  for (const r of alleRenderer()) {
    for (const id in (r._layers || {})) {
      const l = r._layers[id];
      /* Die eigenen Stützpunkte zählen, nicht l._parts: Dort stehen nur die
       * zugeschnittenen Punkte des aktuellen Ausschnitts, und für eine gerade
       * hinzugefügte Linie ist das Feld leer — die Last wäre unterschätzt. */
      if (typeof l.getLatLngs === 'function') {
        const ll = l.getLatLngs();
        n += Array.isArray(ll[0]) ? ll.flat(2).length : ll.length;
      } else {
        n += 1;
      }
    }
  }
  return n;
}

function vektorenNachziehen() {
  for (const r of alleRenderer()) {
    try { r._reset(); } catch { /* ein Renderer ohne Karte — nichts zu tun */ }
  }
}

function gesteBild() {
  if (!gesteLaeuft) {
    gesteLaeuft = true;
    gesteModus = vektorLast() <= VEKTOR_BUDGET ? 'nachziehen' : 'ausblenden';
    if (gesteModus === 'ausblenden') map.getPane('overlayPane').style.opacity = '0';
  }
  if (gesteModus === 'nachziehen') vektorenNachziehen();
}

function gesteEnde() {
  if (!gesteLaeuft) return;
  gesteLaeuft = false;
  map.getPane('overlayPane').style.opacity = '';
  vektorenNachziehen();
}

/** Nordknopf nur zeigen, wenn die Karte tatsächlich gedreht ist. */
function syncNorth() {
  const btn = $('#northBtn');
  if (!btn || !map.getBearing) return;
  const b = map.getBearing() || 0;
  btn.hidden = Math.abs(((b % 360) + 360) % 360) < 0.5;

  /* Ohne Vorzeichen: Bei einer Kartendrehung von b Grad liegt Norden auf dem
   * Bildschirm ebenfalls bei b Grad im Uhrzeigersinn — nachgerechnet über zwei
   * Punkte desselben Meridians. Vorher stand hier -b, der Kompass zeigte also
   * um den doppelten Winkel daneben. */
  const scheibe = btn.querySelector('svg');
  if (scheibe) scheibe.style.transform = `rotate(${b}deg)`;
}

/** Ungefährer Rahmen um Bayern — nur um zu warnen, nicht um zu sperren. */
const BAYERN = { s: 47.2, w: 8.9, n: 50.6, o: 13.9 };
const DEUTSCHLAND = { s: 47.2, w: 5.8, n: 55.1, o: 15.1 };

function ausserhalbBayerns() {
  const c = map.getCenter();
  return c.lat < BAYERN.s || c.lat > BAYERN.n || c.lng < BAYERN.w || c.lng > BAYERN.o;
}

/* ---- Parzellen in wählbarer Farbe ----
 *
 * Der Dienst liefert die Umringe nur in Schwarz und in Gelb. Die schwarze
 * Fassung ist reines Schwarz, geglättet über den Alphakanal, dazu einzelne
 * weiße Pixel; die gelbe ist Pixel für Pixel dieselbe Kachel mit Schwarz durch
 * Gelb ersetzt (nachgemessen am 09.10.2026, 131 Farbwerte, alle Paare gleich).
 * Damit lässt sich aus der schwarzen jede Farbe selbst machen: Grauwert 0 wird
 * die gewählte Farbe, 255 bleibt Weiß, der Alphakanal bleibt, wie er ist. Gelb
 * kommt so bitgleich zu dem heraus, was der Dienst liefert.
 *
 * Die Kachel ist deshalb ein Canvas statt eines Bildes. Das Quellbild bleibt an
 * ihr hängen, damit ein Farbwechsel ohne neue Abfrage umfärbt. Geht nur, weil
 * der Dienst CORS freigibt — ohne wäre das Canvas für getImageData gesperrt.
 *
 * `complete` steht von Hand an der Kachel: Leaflet räumt beim Zoomen alle
 * Kacheln der alten Stufe weg, die nicht `complete` sind (_abortLoading). Ein
 * Canvas hat das Feld nicht, ohne diese Zeile verschwänden auch die fertigen
 * Kacheln mitten in der Zoombewegung. */
/* Punktraster der tatsächlichen Nutzung (Grünland, Gärten …): Der Dienst kennt
 * keine Unterebenen, Grenzen, Gebäude, Schrift und Nutzungssignaturen kommen
 * in einem Bild. Die Punkte lassen sich aber trennen: Gemessen am 11.10.2026
 * bei 49,567 / 10,189 sind sie in jeder Zoomstufe genau 2 × 2 Pixel samt
 * geglättetem Rand (3742 Stück auf einer 512er-Kachel), das kleinste andere
 * Element hatte 13 Pixel. Zusammenhängende Teile bis PARZ_PUNKT_MAX sichtbaren
 * Pixeln fallen deshalb weg, wenn das Punktraster ausgeschaltet ist (Vorgabe:
 * an, ausdrücklich so gewünscht; aus über die Farbwahl). An der Kachelkante
 * geschnittene Linienenden dieser Größe sind unsichtbar klein. */
const PARZ_PUNKT_MAX = 4;

/* Die Gebäude des LGL (INSPIRE-WMS) kommen als graue Fläche (128, 128, 128)
 * mit dunklem Rand; eigene Stile (SLD) nimmt der Dienst nicht an. Grau wird
 * durchsichtig, je dunkler, desto deckender — übrig bleibt der Umring als
 * schwarze Linie wie in der bayerischen Parzellarkarte, samt Kantenglättung.
 * Gemessen auf einer Kachel bei Stuttgart: 21 903 Bildpunkte Fläche, 1055 Rand. */
function parzFuellungWeg(d) {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i + 3] = Math.round(d[i + 3] * Math.max(0, 1 - d[i] / 128));
    d[i] = d[i + 1] = d[i + 2] = 0;
  }
}

function parzPunkteWeg(d, w, h) {
  const n = w * h, gesehen = new Uint8Array(n), stapel = new Int32Array(n), teil = new Int32Array(PARZ_PUNKT_MAX + 1);
  for (let s = 0; s < n; s++) {
    if (gesehen[s] || !d[s * 4 + 3]) continue;
    let oben = 0, anzahl = 0;
    stapel[oben++] = s;
    gesehen[s] = 1;
    while (oben) {
      const q = stapel[--oben];
      if (anzahl <= PARZ_PUNKT_MAX) teil[anzahl] = q;
      anzahl++;
      const x = q % w, y = (q - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const r = yy * w + xx;
          if (!gesehen[r] && d[r * 4 + 3]) { gesehen[r] = 1; stapel[oben++] = r; }
        }
      }
    }
    if (anzahl <= PARZ_PUNKT_MAX) for (let i = 0; i < anzahl; i++) d[teil[i] * 4 + 3] = 0;
  }
}

/* ===================== DOP20 aus allen Ländern, Relief aus zweien =====================
 *
 * „DOP20" zeigt die Orthophotos aller 16 Länder, „Relief" nur Bayern (BVV) und
 * Baden-Württemberg (LGL; das Relief dort ist die Schummerung aus dem DGM025,
 * dunkler und flacher als das bayerische Schräglicht — einen Dienst aus dem
 * DGM1 gibt es nicht mehr, WMS_LGL-BW_ATKIS_DGM_1_Schummerung antwortet mit
 * 500). Bis November 2026 kam auch das DOP20 nur aus diesen beiden Ländern,
 * für den Rest Deutschlands gab es nur das Luftbild von Esri (seit November
 * 2026 ganz entfernt).
 *
 * Alle Dienste antworten außerhalb ihres Landes mit einer leeren (weißen)
 * Kachel; als PNG wäre sie durchsichtig, aber ein Luftbild als PNG ist
 * gemessen 11-mal (BVV) bzw. knapp 3-mal (LGL) so groß wie als JPEG. Deshalb
 * entscheidet die App je Kachel an den Landesgrenzen (laender-grenzen.json,
 * werkzeug/laender-grenzen-bauen.mjs):
 *
 *   ganz in einem Land     → dessen Dienst, durchgereicht
 *   im Saum einer Grenze   → alle beteiligten, je Bildpunkt das Land, in dem er liegt
 *   außerhalb aller Länder → nichts (durchsichtig)
 *
 * Alles als JPEG. Ist ein Bildpunkt beim zuständigen Land leer (weiß), kommt er
 * von einem anderen: Die Dienste reichen ein Stück über die Grenze, und das LGL
 * hat Löcher — bei Ulm-Wiblingen fehlt in der Schummerung ein Rechteck, das der
 * bayerische Reliefdienst abdeckt. Liegt eine Kachel ganz in einem Land und
 * ist mehr als DOP_LOCH_ANTEIL weiß, werden die Länder dazugeholt, deren Grenze
 * höchstens DOP_UMFELD_M entfernt ist. Bildpunkte außerhalb aller Länder (Meer,
 * Ausland) nimmt der erste Dienst, der dort etwas hat.
 * Die Grenzen sind auf 100 m vereinfacht; an ihnen können Stilwechsel (das
 * Relief des LGL ist dunkler) bis dahin neben der echten Grenze liegen.
 *
 * Leaflet zeichnet das in DopWms auf Canvas, MapLibre bekommt es über das
 * Protokoll land:// (land://dop/{z}/{x}/{y}) — beide aus dopKachel. Der Saum
 * (DOP_SAUM_M plus halbe Kacheldiagonale) deckt die 100 m Vereinfachung der
 * Grenzen weit ab. */
const DOP_LOCH_ANTEIL = 0.01;
const DOP_SAUM_M = 300;
const DOP_UMFELD_M = 5000;
const DOP_FAST_LEER = 225;
const LAND_WMS_TEIL = '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&STYLES=&CRS=EPSG:3857&LAYERS=';
/* Manche Dienste zeichnen nur bis zu einem Maßstab, darüber kommt eine weiße
 * Kachel — weit herausgezoomt fehlte Bayern deshalb ganz (ab Zoomstufe 6). Der
 * Maßstab hängt an der Bildgröße: Dieselbe Kachel mit 2-, 4- oder 8-mal so
 * vielen Bildpunkten abgefragt liegt wieder darunter, verkleinert wird sie in
 * dopPixel. Gemessen am 02.11.2026, jeweils mit etwas Abstand zur Grenze:
 * BVV laut Dienst 1:3,5 Mio.; Thüringen zeichnet bei 1:690 000 noch, bei
 * 1:1,4 Mio. nicht mehr (laut Dienst 1:2 Mio.); Mecklenburg-Vorpommern bei
 * 1:162 000 noch, bei 1:324 000 nicht mehr (laut Dienst 1:400 000).
 * Mecklenburg-Vorpommern braucht dafür auf Zoomstufe 7 schon 4096 × 4096
 * Bildpunkte (gemessen 2,2 MB, 7 s), und mehr als 4192 gibt der Dienst nicht her
 * (MaxWidth). Auf Stufe 6 setzt die App die Kachel deshalb aus vier Teilen der
 * nächsten Stufe zusammen (dopLandPixel); noch weiter draußen bleibt es weiß. */
const LAND_MASSSTAB_MAX = { by: 3.0e6, th: 9.0e5, mv: 1.7e5 };
const LAND_GROESSE_MAX = 16;
/* Je Land der Dienst, je Art. Hessen mit he_dop_rgb, nicht he_dop20_rgb: Der
 * zeichnet nur bis 1:9000, darüber gehören je Maßstab andere Ebenen dazu, die
 * he_dop_rgb zusammenfasst. Bremen ist Bremen und Bremerhaven, zwei Ebenen.
 * Hamburg hat nur Zeitreihen; ohne TIME kommt das neueste Jahr (unbelaubt
 * 2026, belaubt erst 2024). */
const LAND_WMS = {
  dop: {
    by: 'https://geoservices.bayern.de/od/wms/dop/v1/dop20' + LAND_WMS_TEIL + 'by_dop20c',
    bw: 'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C' + LAND_WMS_TEIL + 'IMAGES_DOP_20_RGB',
    nw: 'https://www.wms.nrw.de/geobasis/wms_nw_dop' + LAND_WMS_TEIL + 'nw_dop_rgb',
    ni: 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms' + LAND_WMS_TEIL + 'ni_dop20',
    he: 'https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows' + LAND_WMS_TEIL + 'he_dop_rgb',
    rp: 'https://geo4.service24.rlp.de/wms/rp_dop20.fcgi' + LAND_WMS_TEIL + 'rp_dop20',
    sl: 'https://geoportal.saarland.de/freewms/dop2023' + LAND_WMS_TEIL + 'sl_dop20_rgb',
    th: 'https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP' + LAND_WMS_TEIL + 'th_dop',
    sn: 'https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest' + LAND_WMS_TEIL + 'sn_dop_020',
    st: 'https://www.geodatenportal.sachsen-anhalt.de/wss/service/ST_LVermGeo_DOP_WMS_OpenData/guest' + LAND_WMS_TEIL + 'lsa_lvermgeo_dop20_2',
    bb: 'https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms' + LAND_WMS_TEIL + 'bebb_dop20c',
    be: 'https://gdi.berlin.de/services/wms/truedop_2024' + LAND_WMS_TEIL + 'truedop_2024',
    mv: 'https://www.geodaten-mv.de/dienste/adv_dop' + LAND_WMS_TEIL + 'mv_dop',
    sh: 'https://dienste.gdi-sh.de/WMS_SH_DOP20col_OpenGBD' + LAND_WMS_TEIL + 'sh_dop20_rgb',
    hb: 'https://geodienste.bremen.de/wms_dop20_2023' + LAND_WMS_TEIL + 'DOP20_2023_HB,DOP20_2023_BHV',
    hh: 'https://geodienste.hamburg.de/wms_dop_zeitreihe_unbelaubt' + LAND_WMS_TEIL + 'dop_zeitreihe_unbelaubt'
  },
  relief: {
    by: 'https://geoservices.bayern.de/od/wms/dgm/v1/relief' + LAND_WMS_TEIL + 'by_relief_schraeglicht',
    bw: 'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DGM_025_Schummerung' + LAND_WMS_TEIL + 'Schummerung_DGM_025_BW'
  }
};
let laenderGrenzen = null;   // Promise: Land → { ringe: [{ p: UTM e,n,…, g: lat,lon,…, bb }], bb (UTM), gb (lat, lon) }

function laenderGrenzenHolen() {
  if (!laenderGrenzen) {
    laenderGrenzen = fetch('laender-grenzen.json')
      .then(r => { if (!r.ok) throw new Error(`Landesgrenzen: HTTP ${r.status}`); return r.json(); })
      .then(j => {
        const aus = {};
        for (const [land, reihen] of Object.entries(j.laender)) {
          const bbLand = [Infinity, Infinity, -Infinity, -Infinity], gb = [Infinity, Infinity, -Infinity, -Infinity];
          const ringe = reihen.map(reihe => {
            // Erster Punkt ganz, jeder weitere als Abstand zum vorigen (laender-grenzen-bauen.mjs)
            const p = new Float64Array(reihe.length), g = new Float64Array(reihe.length), bb = [Infinity, Infinity, -Infinity, -Infinity];
            let lat = 0, lon = 0;
            for (let i = 0; i < reihe.length; i += 2) {
              lat += reihe[i]; lon += reihe[i + 1];
              const [e, n] = utm32Hin(lat * j.einheit, lon * j.einheit);
              p[i] = e; p[i + 1] = n;
              g[i] = lat * j.einheit; g[i + 1] = lon * j.einheit;
              gb[0] = Math.min(gb[0], g[i]); gb[1] = Math.min(gb[1], g[i + 1]); gb[2] = Math.max(gb[2], g[i]); gb[3] = Math.max(gb[3], g[i + 1]);
              bb[0] = Math.min(bb[0], e); bb[1] = Math.min(bb[1], n); bb[2] = Math.max(bb[2], e); bb[3] = Math.max(bb[3], n);
            }
            for (let k = 0; k < 4; k++) bbLand[k] = (k < 2 ? Math.min : Math.max)(bbLand[k], bb[k]);
            return { p, g, bb };
          });
          aus[land] = { ringe, bb: bbLand, gb };
        }
        return aus;
      });
    laenderGrenzen.catch(() => { laenderGrenzen = null; });
  }
  return laenderGrenzen;
}

/** Mitte einer Kachel, geografisch. */
function kachelMitte(z, x, y) {
  const n2 = 2 ** z;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n2))) * 180 / Math.PI, (x + 0.5) / n2 * 360 - 180];
}

/** Für die Länder, die art anbietet: in welchem liegt die Mitte der Kachel
 *  (drin), deren Grenze die Kachel berühren könnte (nah), deren Grenze höchstens
 *  DOP_UMFELD_M weiter weg ist (umfeld, zum Füllen von Löchern). */
async function dopWahl(art, z, x, y) {
  const grenzen = await laenderGrenzenHolen();
  const [lat, lon] = kachelMitte(z, x, y);
  const [e, n] = utm32Hin(lat, lon);
  const r = 40075016.686 * Math.cos(lat * Math.PI / 180) / 2 ** z * 0.7072 + DOP_SAUM_M;
  const weit = r + DOP_UMFELD_M;
  let drin = null;
  const nah = [], umfeld = [];
  for (const land of Object.keys(LAND_WMS[art])) {
    const { ringe, bb: b } = grenzen[land];
    if (e < b[0] - weit || e > b[2] + weit || n < b[1] - weit || n > b[3] + weit) continue;
    let innen = false, abstand = Infinity;
    for (const { p, bb } of ringe) {
      // Ein Ring, der ganz außerhalb des Umfelds liegt, kann die Mitte nicht umschließen
      if (e < bb[0] - weit || e > bb[2] + weit || n < bb[1] - weit || n > bb[3] + weit) continue;
      for (let i = 0, k = p.length - 2; i < p.length; k = i, i += 2) {
        const ax = p[k], ay = p[k + 1], bx = p[i], by = p[i + 1];
        if ((ay > n) !== (by > n) && e < (bx - ax) * (n - ay) / (by - ay) + ax) innen = !innen;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((e - ax) * dx + (n - ay) * dy) / l2)) : 0;
        abstand = Math.min(abstand, Math.hypot(e - ax - t * dx, n - ay - t * dy));
      }
    }
    if (innen) drin = land;
    if (abstand < r) nah.push(land);
    else if (abstand < weit) umfeld.push(land);
  }
  return { drin, nah, umfeld };
}

/** Um wie viel größer die Kachel abgefragt werden müsste, damit das Land sie zeichnet (1, 2, 4 …). */
function dopFaktor(land, z, y) {
  const max = LAND_MASSSTAB_MAX[land];
  if (!max) return 1;
  const n2 = 2 ** z, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n2)));
  const massstab = 40075016.686 * Math.cos(lat) / n2 / 256 / 0.00028;   // 0,28 mm je Bildpunkt wie im WMS
  let f = 1;
  while (massstab / f > max && f < 4 * LAND_GROESSE_MAX) f *= 2;
  return f;
}

/** Kantenlänge der Abfrage in Bildpunkten: 256, für Länder mit Maßstabsgrenze weit draußen mehr. */
function dopGroesse(land, z, y) {
  return 256 * Math.min(dopFaktor(land, z, y), LAND_GROESSE_MAX);
}

/** Reicht eine Abfrage nicht (dopFaktor über LAND_GROESSE_MAX), kommt die Kachel aus vier Teilen. */
const dopGeteilt = (land, z, y) => dopFaktor(land, z, y) > LAND_GROESSE_MAX;

/** Die Bildpunkte eines Landes für eine Kachel: eine Abfrage oder vier Teile der
 *  nächsten Zoomstufe, je zu zweit, damit nicht vier Bilder mit 4096 Bildpunkten
 *  zugleich im Speicher liegen. */
async function dopLandPixel(art, land, z, x, y, signal) {
  if (!dopGeteilt(land, z, y)) return dopPixel(await dopBild(dopUrl(art, land, z, x, y), signal));
  const c = new OffscreenCanvas(256, 256), g = c.getContext('2d', { willReadFrequently: true });
  for (const dy of [0, 1]) {
    await Promise.all([0, 1].map(async dx => {
      const blob = await dopBild(dopUrl(art, land, z + 1, 2 * x + dx, 2 * y + dy), signal);
      const bild = await dopBitmap(blob, 128);
      g.drawImage(bild, dx * 128, dy * 128, 128, 128);
      bild.close();
    }));
  }
  return g.getImageData(0, 0, 256, 256);
}

function dopUrl(art, land, z, x, y) {
  const R = 20037508.342789244, s = 2 * R / 2 ** z, px = dopGroesse(land, z, y);
  const bbox = [x * s - R, R - (y + 1) * s, (x + 1) * s - R, R - y * s].map(v => v.toFixed(3)).join(',');
  return `${LAND_WMS[art][land]}&WIDTH=${px}&HEIGHT=${px}&FORMAT=image/jpeg&BBOX=${bbox}`;
}

/* Ein WMS meldet Fehler mit Status 200 und XML statt Bild. Sachsen-Anhalt
 * antwortete am 02.11.2026 bei derselben Kachel abwechselnd mit Bild und mit
 * „Could not process client request“ — deshalb bis zu DOP_VERSUCHE Anläufe, die
 * späteren am HTTP-Cache vorbei, damit nicht die Fehlermeldung wiederkommt. */
const DOP_VERSUCHE = 4;

async function dopBild(url, signal) {
  for (let versuch = 1; ; versuch++) {
    let r;
    try {
      r = await fetch(url, versuch > 1 ? { signal, cache: 'reload' } : { signal });
    } catch (err) {
      /* Netzfehler (TypeError) noch zweimal: Beim Wiederöffnen der App ist das Netz
       * oft noch nicht wach — ohne Wiederholung blieb das Luftbild leer (04.11.2026). */
      if (signal?.aborted || !(err instanceof TypeError) || versuch >= 3) throw err;
      await new Promise(fertig => setTimeout(fertig, versuch === 1 ? 500 : 1500));
      continue;
    }
    if (!r.ok) throw new Error(`Luftbild/Relief: HTTP ${r.status}`);
    if (/^image\//.test(r.headers.get('content-type') || '')) return r.blob();
    if (versuch >= DOP_VERSUCHE) throw new Error('Luftbild/Relief: Dienst meldet einen Fehler');
    await new Promise(fertig => setTimeout(fertig, 250 * versuch));
  }
}

/** Ein Bild schon beim Entpacken verkleinert: Ein JPEG mit 4096 Bildpunkten
 *  läge sonst mit 64 MB im Speicher. Wo der Browser das nicht kann, ganz. */
async function dopBitmap(blob, kante) {
  try {
    return await createImageBitmap(blob, { resizeWidth: kante, resizeHeight: kante, resizeQuality: 'high' });
  } catch {
    return createImageBitmap(blob);
  }
}

/** Bildpunkte eines Blobs (256 × 256, RGBA). */
async function dopPixel(blob) {
  const bild = await dopBitmap(blob, 256);
  const c = new OffscreenCanvas(256, 256), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bild, 0, 0, 256, 256);
  bild.close();
  return g.getImageData(0, 0, 256, 256);
}

// Leer heißt: alle drei Kanäle fast ganz weiß — so füllen die Dienste, wo sie nichts haben
const dopLeer = (d, i) => d[i] >= 250 && d[i + 1] >= 250 && d[i + 2] >= 250;

function dopLeerAnteil(d) {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (dopLeer(d, i)) n++;
  return n / (d.length / 4);
}

/** Welche Bildpunkte der Kachel liegen im Land? Die Grenze als Fläche gezeichnet. */
async function dopMaske(land, z, x, y) {
  const { ringe } = (await laenderGrenzenHolen())[land], n2 = 2 ** z;
  const c = new OffscreenCanvas(256, 256), g = c.getContext('2d', { willReadFrequently: true });
  g.beginPath();
  for (const { g: ll } of ringe) {
    for (let i = 0; i < ll.length; i += 2) {
      const r = ll[i] * Math.PI / 180;
      const px = ((ll[i + 1] + 180) / 360 * n2 - x) * 256;
      const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n2 - y) * 256;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
  }
  g.fill('evenodd');
  return g.getImageData(0, 0, 256, 256).data;
}

/* Quellenangabe des DOP20: die Länder, deren Rahmen den Ausschnitt berührt.
 * Der Rahmen ist grob (Niedersachsen umschließt Bremen und Hamburg), es steht
 * also eher eins zu viel da als eins zu wenig. */
let dopQuelleZuletzt = '';

async function dopQuelleErneuern() {
  let neu = '';
  if (prefs.base === 'dop') {
    const grenzen = await laenderGrenzenHolen().catch(() => null);
    if (!grenzen) return;
    const b = map.getBounds(), s = b.getSouth(), w = b.getWest(), n = b.getNorth(), o = b.getEast();
    const laender = Object.keys(LAND_WMS.dop).filter(l => {
      const gb = grenzen[l].gb;
      return gb[0] <= n && gb[2] >= s && gb[1] <= o && gb[3] >= w;
    });
    if (laender.length) neu = landQuelle('DOP20', laender);
  }
  if (neu === dopQuelleZuletzt) return;
  if (dopQuelleZuletzt) map.attributionControl.removeAttribution(dopQuelleZuletzt);
  if (neu) map.attributionControl.addAttribution(neu);
  dopQuelleZuletzt = neu;
}

let dopNichts = null;   // die durchsichtige Kachel für außerhalb aller Länder, einmal gebaut

/* Kacheln nach einem Fehler neu holen — alle Ebenen, nicht nur das Luftbild.
 * Eine fehlgeschlagene Kachel fragen weder Leaflet noch MapLibre von selbst wieder
 * an: Nach dem Wiederöffnen der App mit noch schlafendem Netz blieb das Luftbild
 * leer, bis man die Grundkarte wechselte (nachgestellt 04.11.2026: 17 von 17
 * Kacheln „errored“, Sekunden nachdem das Netz zurück war). Dasselbe traf die
 * Karte, Parzellen, Bahn-Layer, WMS und die Vektorkacheln von MapLibre.
 * Leaflet: jede Kachelebene merkt sich einen Fehler (Init-Hook an L.GridLayer)
 * und zeichnet neu; MapLibre: die Quelle mit Fehler bekommt ihre Adressen neu.
 * Ausgelöst, sobald wieder Netz da ist oder die App in den Vordergrund kommt,
 * sonst mit wachsender Pause (3 s, 6 s … höchstens 30 s). */
const glFehlerQuellen = new Set();
let kachelnNeuUhr = 0, kachelnVersuche = 0;
function kachelnNeuSpaeter(ms) {
  clearTimeout(kachelnNeuUhr);
  kachelnNeuUhr = setTimeout(kachelnNeu, ms ?? Math.min(30000, 3000 * 2 ** kachelnVersuche));
}
function kachelnNeu() {
  if (!navigator.onLine) return;              // 'online' holt es nach
  let neu = false;
  for (const id of glFehlerQuellen) {
    const q = gl && gl.getSource(id);
    if (q && q.setTiles && q.tiles) q.setTiles(q.tiles);        // Raster: gleiche Adressen, alle Kacheln neu
    else if (q && q.setUrl && q.url) q.setUrl(q.url);           // Vektor (OpenFreeMap) über die Beschreibung
    neu = neu || !!q;
  }
  glFehlerQuellen.clear();
  if (map) map.eachLayer(l => { if (l._fehler && l.redraw) { l._fehler = false; l.redraw(); neu = true; } });
  if (neu) kachelnVersuche++;
}
L.GridLayer.addInitHook(function () {
  this.on('tileerror', () => { this._fehler = true; kachelnNeuSpaeter(); });
  // Erfolg setzt die Pause zurück, damit ein späterer Ausfall wieder schnell nachlädt
  this.on('load', () => { if (!this._fehler) kachelnVersuche = 0; });
});
window.addEventListener('online', () => { kachelnVersuche = 0; kachelnNeuSpaeter(300); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { kachelnVersuche = 0; kachelnNeuSpaeter(800); } });

/** Eine Kachel (art 'dop' oder 'relief') als Bild-Blob: aus einem Dienst
 *  durchgereicht, wo es geht; sonst je Bildpunkt aus dem zuständigen Land, Löcher
 *  aus den anderen (JPEG, damit der Speicher nicht anschwillt). */
async function dopKachel(art, z, x, y, signal) {
  const { drin, nah, umfeld } = await dopWahl(art, z, x, y);
  const laender = nah.length ? [...new Set([drin, ...nah].filter(Boolean))] : drin ? [drin] : [];
  if (!laender.length) {
    if (!dopNichts) {
      const c = new OffscreenCanvas(256, 256);
      c.getContext('2d');   // ohne Zeichenfläche weigert sich convertToBlob
      dopNichts = c.convertToBlob({ type: 'image/png' });
    }
    return dopNichts;
  }
  let eigen = null, helfer = [];
  // Ganz in einem Land; berührt die Kachel eine Grenze, entscheidet die Maske, auch bei nur einem Land
  if (!nah.length) {
    const land = laender[0];
    // Größer abgefragt (dopGroesse) geht sie durch dopPixel, damit die Kachel 256 px bleibt
    const gross = dopGroesse(land, z, y) > 256;
    const blob = dopGeteilt(land, z, y) ? null : await dopBild(dopUrl(art, land, z, x, y), signal);
    if (blob && !umfeld.length && !gross) return blob;
    eigen = blob ? await dopPixel(blob) : await dopLandPixel(art, land, z, x, y, signal);
    const loch = dopLeerAnteil(eigen.data) > DOP_LOCH_ANTEIL;
    if (!loch && !gross) return blob;
    if (!loch || !umfeld.length) return dopAlsJpeg(eigen);
    helfer = umfeld;
  }
  const alle = [...laender, ...helfer];
  const [bilder, masken] = await Promise.all([
    /* Fällt ein Dienst aus, bleibt sein Teil leer, statt dass die ganze Kachel
     * fehlt. Schleswig-Holstein und Sachsen-Anhalt geben CORS nur für https-
     * Herkünfte frei — unter http://localhost fehlen sie deshalb. */
    Promise.all(alle.map((land, i) => i === 0 && eigen ? eigen
      : dopLandPixel(art, land, z, x, y, signal)
        .catch(err => { if (signal?.aborted) throw err; return null; }))),
    // Ohne Grenze in der Kachel ist das eine Land für alles zuständig
    nah.length ? Promise.all(laender.map(land => dopMaske(land, z, x, y))) : null
  ]);
  const aus = bilder.find(Boolean);
  if (!aus) throw new Error('Luftbild: kein Dienst erreichbar');
  const daten = bilder.map(b => b && b.data), a = aus.data;
  // Strenger als dopLeer: Der Saum am weißen Rand der Dienste liegt knapp unter 250
  const fastLeer = (d, i) => !d || (d[i] >= DOP_FAST_LEER && d[i + 1] >= DOP_FAST_LEER && d[i + 2] >= DOP_FAST_LEER);
  let durchsichtig = false;
  const luecke = [];   // im Land, aber bei keinem Dienst etwas Brauchbares
  for (let i = 0; i < a.length; i += 4) {
    const zust = masken ? masken.findIndex(m => m[i + 3] >= 128) : 0;
    let quelle;
    if (zust >= 0) {
      /* Im Land bleibt der Bildpunkt stehen, auch ein heller. Nur ein (fast) weißer
       * kommt von woanders, wenn ein anderer Dienst dort etwas Dunkleres hat: Am
       * eigenen Rand mischt jeder Dienst beim Verkleinern sein Bild mit dem
       * Weiß dahinter, weit herausgezoomt stand sonst ein heller Strich auf
       * jeder Landesgrenze. */
      quelle = !fastLeer(daten[zust], i) ? zust : daten.findIndex(d => !fastLeer(d, i));
      /* Fiel der Dienst des Landes aus, bleibt seine Fläche durchsichtig: Die
       * Nachbarn sind dort weiß, und eine weiße Fläche sah aus wie ein Fehler
       * im Bild statt wie ein fehlendes (SH und ST unter localhost). */
      if (quelle < 0 && daten[zust]) { quelle = zust; luecke.push(i); }
    } else {
      quelle = daten.findIndex(d => !fastLeer(d, i));
    }
    const d = quelle >= 0 ? daten[quelle] : null;
    if (d && d !== a) { a[i] = d[i]; a[i + 1] = d[i + 1]; a[i + 2] = d[i + 2]; }
    // Hat außerhalb kein Dienst etwas, bleibt der Bildpunkt durchsichtig wie die Kacheln ganz außerhalb
    a[i + 3] = d ? 255 : (durchsichtig = true, 0);
  }
  dopLueckenFuellen(a, luecke, fastLeer);
  return durchsichtig ? dopAlsPng(aus) : dopAlsJpeg(aus);
}

/* Weit herausgezoomt hört an einer Landesgrenze oft jeder Dienst einen
 * Bildpunkt zu früh auf: Das eine Land hat dort nichts mehr, das andere nur
 * noch seinen mit Weiß gemischten Rand. Übrig blieb ein heller Strich auf der
 * Grenze. Solche Bildpunkte bekommen den Mittelwert ihrer brauchbaren
 * Nachbarn, in zwei Runden — breiter ist die Lücke nicht. */
function dopLueckenFuellen(a, luecke, fastLeer) {
  for (let runde = 0; runde < 2 && luecke.length; runde++) {
    const offen = new Set(luecke), rest = [], neu = [];
    for (const i of luecke) {
      const px = (i >> 2) & 255, py = i >> 10;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy;
        if ((!dx && !dy) || qx < 0 || qy < 0 || qx > 255 || qy > 255) continue;
        const j = (qy * 256 + qx) * 4;
        if (offen.has(j) || a[j + 3] === 0 || fastLeer(a, j)) continue;
        r += a[j]; g += a[j + 1]; b += a[j + 2]; n++;
      }
      if (n) neu.push([i, r / n, g / n, b / n]); else rest.push(i);
    }
    for (const [i, r, g, b] of neu) { a[i] = r; a[i + 1] = g; a[i + 2] = b; }
    luecke = rest;
  }
}

/* Nur Kacheln an der Staatsgrenze und an der Küste: Ein Luftbild als PNG ist
 * ein Vielfaches größer, aber ein weißer Rand ums Land sähe über der dunklen
 * Karte wie ein Fehler aus. */
function dopAlsPng(bild) {
  const c = new OffscreenCanvas(256, 256);
  c.getContext('2d').putImageData(bild, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

function dopAlsJpeg(bild) {
  const c = new OffscreenCanvas(256, 256);
  c.getContext('2d').putImageData(bild, 0, 0);
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

/* Die Leaflet-Ebene: zeichnet dopKachel auf Canvas. tile.complete von Hand
 * wie bei ParzWms, sonst räumt _abortLoading beim Zoomen fertige Kacheln weg. */
const DopWms = L.GridLayer.extend({
  options: { art: 'dop' },

  createTile(coords, done) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    tile.complete = false;
    dopKachel(this.options.art, coords.z, coords.x, coords.y)
      .then(blob => createImageBitmap(blob))
      .then(bild => {
        tile.getContext('2d').drawImage(bild, 0, 0, 256, 256);
        bild.close();
        tile.complete = true;
        done(null, tile);
      }, err => done(err, tile));
    return tile;
  }
});

/* Die Parzellen aus Bayern und BW als ein Schalter: Farbe und Reihenfolge für
 * beide, das Punktraster nur für die bayerische (nur die hat eins). */
const ParzGruppe = L.LayerGroup.extend({
  farbeSetzen(rgb) { this.eachLayer(l => l.farbeSetzen(rgb)); },
  punkteSetzen(an) { this.eachLayer(l => { if (l.options.nurBayern !== false) l.punkteSetzen(an); }); },
  bringToFront() { this.eachLayer(l => l.bringToFront()); return this; }
});

const ParzWms = L.TileLayer.WMS.extend({
  // Hier deklariert, sonst hängte Leaflet diese als WMS-Parameter an jede Abfrage
  options: { farbe: [0, 0, 0], punkte: true, nurBayern: true, fuellungWeg: false },

  createTile(coords, done) {
    const tile = document.createElement('canvas');
    tile.complete = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      tile.width = img.naturalWidth;
      tile.height = img.naturalHeight;
      tile._quelle = img;
      this._faerben(tile);
      tile.complete = true;
      done(null, tile);
    };
    img.onerror = err => done(err, tile);
    img.src = this.getTileUrl(coords);
    return tile;
  },

  _faerben(tile) {
    const g = tile.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, tile.width, tile.height);
    g.drawImage(tile._quelle, 0, 0);
    const bild = g.getImageData(0, 0, tile.width, tile.height);
    const d = bild.data;
    if (this.options.fuellungWeg) parzFuellungWeg(d);
    if (!this.options.punkte) parzPunkteWeg(d, tile.width, tile.height);
    const [r, gr, b] = this.options.farbe;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const t = d[i] / 255;          // 0 = Linie, 1 = Weiß
      d[i] = r + (255 - r) * t;
      d[i + 1] = gr + (255 - gr) * t;
      d[i + 2] = b + (255 - b) * t;
    }
    g.putImageData(bild, 0, 0);
  },

  punkteSetzen(an) {
    if (this.options.punkte === an) return;
    this.options.punkte = an;
    this._neuFaerben();
  },

  farbeSetzen(rgb) {
    const alt = this.options.farbe;
    if (alt && alt.every((v, i) => v === rgb[i])) return;
    this.options.farbe = rgb;
    this._neuFaerben();
  },

  _neuFaerben() {
    for (const k in this._tiles) {
      const tile = this._tiles[k].el;
      if (tile._quelle) this._faerben(tile);
    }
  }
});

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

/* Zur Wahl. Gelb ist der Ton des Dienstes. Kräftige, reine Farben, weil die
 * Umringe nur einen Pixel breit sind — ein gedeckter Ton verschwindet im Luftbild. */
const PARZ_FARBEN = [
  { wert: '#ffff00', name: 'Gelb' },
  { wert: '#ffffff', name: 'Weiß' },
  { wert: '#ff3030', name: 'Rot' },
  { wert: '#ff40ff', name: 'Magenta' },
  { wert: '#00e5ff', name: 'Cyan' },
  { wert: '#000000', name: 'Schwarz' }
];

/* „auto": schwarze Umringe verschwinden auf dem Luftbild, gelbe auf der hellen
 * Karte — deshalb richtet sich die Farbe dann nach dem gewählten Hintergrund. */
function parzFarbe() {
  const f = prefs.parzFarbe;
  if (/^#[0-9a-f]{6}$/i.test(f || '')) return f.toLowerCase();
  return (prefs.base || 'osm') === 'osm' ? '#000000' : '#ffff00';
}

function parzFarbeAnpassen() {
  if (parzLayer) parzLayer.farbeSetzen(hexRgb(parzFarbe()));
}

/* Die Wahl bleibt nach einem Tipp offen — man probiert meist mehrere Farben,
 * bis eine auf dem Grund steht. Zu geht sie mit dem Menü oder einem zweiten
 * langen Druck. */
function parzFarbeWaehlen(wert) {
  prefs.parzFarbe = wert;
  parzFarbeAnpassen();
  saveStore();
  syncButtons();
  /* Wer eine Farbe wählt, will sie sehen — bei ausgeschalteter Auflage sähe er
   * nichts und hielte die Wahl für wirkungslos. */
  if (!auflageGewaehlt('parz')) toggleOverlay('parz');
}

function parzWahlZeigen(an) {
  const box = $('#parzWahl'), btn = $('#parzBtn');
  if (box) box.hidden = !an;
  if (btn) btn.setAttribute('aria-expanded', an ? 'true' : 'false');
}

/* Tippen schaltet die Parzellen, lange drücken oder Rechtsklick öffnet die
 * Farbwahl — die Farbe braucht man selten, eine ständig offene Reihe von
 * Farbfeldern wäre im Menü nur im Weg. Nach dem langen Druck darf das folgende
 * click nicht auch noch umschalten, und Android meldet zum langen Druck
 * zusätzlich contextmenu: Beides zusammen ist ein einziger Griff. */
function parzKnopfBinden() {
  const btn = $('#parzBtn');
  if (!btn) return;
  let timer = 0, lang = false, zuletzt = 0;
  const wahl = () => {
    clearTimeout(timer);
    if (Date.now() - zuletzt < 700) return;
    zuletzt = Date.now();
    lang = true;
    parzWahlZeigen($('#parzWahl').hidden);
  };
  btn.addEventListener('pointerdown', ev => {
    lang = false;
    clearTimeout(timer);
    if (ev.button === 0) timer = setTimeout(wahl, MERK_DAUER);    // rechts: contextmenu
  });
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) {
    btn.addEventListener(t, () => clearTimeout(timer));
  }
  btn.addEventListener('contextmenu', ev => { ev.preventDefault(); wahl(); });
  btn.addEventListener('click', () => {
    if (lang) { lang = false; return; }
    toggleOverlay('parz');
  });
}

function buildParzRow() {
  const box = $('#parzRow');
  if (!box) return;
  const knoepfe = [
    `<button type="button" class="parz-btn parz-auto" data-parz="auto" title="Schwarz über der Karte, Gelb über Bildern"` +
      ` aria-label="Parzellenfarbe automatisch">Auto</button>`,
    ...PARZ_FARBEN.map(f =>
      `<button type="button" class="parz-btn" data-parz="${f.wert}" style="--parz:${f.wert}"` +
      ` title="${f.name}" aria-label="Parzellenfarbe ${f.name}"></button>`),
    // Eigene Farbe: das Farbfeld des Systems, als Feld derselben Größe
    `<label class="parz-btn parz-eigen" title="Eigene Farbe"><span aria-hidden="true">+</span>` +
      `<input id="parzEigen" type="color" value="#ff8c1a" aria-label="Eigene Parzellenfarbe"></label>`
  ];
  box.innerHTML = knoepfe.join('');
  box.querySelectorAll('[data-parz]').forEach(b =>
    b.addEventListener('click', () => parzFarbeWaehlen(b.dataset.parz)));
  const eigen = $('#parzEigen');
  // input: beim Ziehen im Farbfeld gleich mitfärben; gespeichert wird bei change
  eigen.addEventListener('input', () => {
    prefs.parzFarbe = eigen.value;
    parzFarbeAnpassen();
    syncButtons();
  });
  eigen.addEventListener('change', () => parzFarbeWaehlen(eigen.value));
  // Das Punktraster der Nutzung: an als Vorgabe, hier abzuschalten (parzPunkteWeg)
  const punkte = $('#parzPunkteBtn');
  if (punkte) punkte.addEventListener('click', () => {
    prefs.parzPunkte = !prefs.parzPunkte;
    if (parzLayer) parzLayer.punkteSetzen(prefs.parzPunkte);
    saveStore();
    syncButtons();
    if (!auflageGewaehlt('parz')) toggleOverlay('parz');
  });
}

/** Reihenfolge der Leaflet-Auflagen, von unten: eigener WMS, Regenradar,
 *  Parzellen, Bahn-Layer. Straßen und Ortsnamen liegen darunter im MapLibre-
 *  Grund. Das Radar unter den Linien: Es ist eine Fläche, und über ihr bleiben
 *  Grenzen und Gleise scharf, statt eingefärbt zu werden. */
function ordneAuflagen() {
  if (wmsLayer) wmsLayer.bringToFront();
  for (const layer of [radarSchicht, parzLayer, fpByLayer, ormLayer]) {
    if (layer && map.hasLayer(layer)) layer.bringToFront();
  }
}

const GRUNDKARTEN = ['osm', 'dark', 'dop', 'relief'];

/** Wer zeichnet den Grund? Braucht die Wahl MapLibre (dunkle Karte, oder ein
 *  Bild mit Straßen/Namen), zeichnet es MapLibre allein und die Leaflet-
 *  Grundkarte ist aus — sonst läge das Bild doppelt übereinander. Sonst
 *  zeichnet Leaflet die gewählte Karte wie immer. */
function grundAnwenden() {
  const mitGl = glGebraucht();
  for (const [kennung, layer] of Object.entries(baseLayers)) {
    const soll = !mitGl && kennung === prefs.base;
    if (soll && !map.hasLayer(layer)) layer.addTo(map);
    if (!soll && map.hasLayer(layer)) map.removeLayer(layer);
  }
  // Ohne MapLibre gibt es kein Dunkel — dann eben die Karte
  if (!mitGl && !baseLayers[prefs.base] && !map.hasLayer(baseOsm)) baseOsm.addTo(map);
  if (mitGl && !map.hasLayer(glGrund)) glGrund.addTo(map);
  if (!mitGl && map.hasLayer(glGrund)) map.removeLayer(glGrund);
  if (mitGl) { glDeckungSetzen(); glQuellenErneuern(); }
  dopQuelleErneuern();
}

/** still: beim Start. Dort steht die Karte noch auf der Deutschlandansicht,
 *  die über Bayern hinausreicht — die Warnung käme bei jedem Öffnen. */
function setBase(which, still = false) {
  if (which === 'sat') which = 'dop';   // gespeichert, als es das Esri-Luftbild noch gab
  if (!GRUNDKARTEN.includes(which)) which = 'osm';
  prefs.base = which;
  grundAnwenden();

  // Die Rahmen sind grob; wo sie nicht greifen, bleibt der Grund sicher leer
  const c = map.getCenter();
  if (!still && which === 'relief' && ausserhalbBayerns() && !inLandRahmen('bw', c.lat, c.lng)) {
    toast('Das Relief gibt es für Bayern und Baden-Württemberg — hier bleibt der Grund weiß.');
  }
  if (!still && which === 'dop' && !(c.lat >= DEUTSCHLAND.s && c.lat <= DEUTSCHLAND.n && c.lng >= DEUTSCHLAND.w && c.lng <= DEUTSCHLAND.o)) {
    toast('Das DOP20 kommt von den Vermessungsämtern der Länder und gibt es nur für Deutschland.');
  }

  parzFarbeAnpassen();
  applyBaseOpacity();
  applyBildRegler();
  hoehenSkalaZeigen();
  ordneAuflagen();
  radarZeichnen();      // die Konturen des Radars hängen am Grund (RADAR_LINIE_TON)
  ifgAuflageZeichnen(); // die Linien des DB-Netzes auch
  if (msLayer) drawMilestones();    // und der Ton der hervorgehobenen Strecke (ifgZeichnen)
  saveStore();
  syncButtons();
}

/** Hintergrund verblassen, damit Bahn- oder WMS-Layer allein lesbar werden. */
function applyBaseOpacity() {
  const o = (prefs.baseOpacity == null ? 100 : prefs.baseOpacity) / 100;
  for (const layer of Object.values(baseLayers)) layer.setOpacity(o);
  if (glGrund) glGrund.setOpacity(o);

  // Sobald der Hintergrund durchscheinend wird, muss darunter Weiß liegen:
  // Bahn- und IVL-Pläne sind schwarze Strichzeichnungen und wären im
  // Dunkelmodus auf dunklem Grund praktisch unsichtbar.
  const flaeche = $('#map');
  if (flaeche) flaeche.style.background = o < 1 ? '#ffffff' : '';

  const val = $('#baseOpacityVal');
  if (val) val.textContent = Math.round(o * 100) + ' %';
}

/* Farbe und Helligkeit der Bilder. Die Luftbilder der Länder kommen recht blass,
 * je nach Befliegung verschieden; den Farbregler gibt es nur beim DOP20 — das
 * Relief ist grau. Die Helligkeit gilt für beide und geht nur nach unten (bis 30 %), damit Parzellen, Bahn-Layer und
 * Pins auf hellem Acker besser stehen. Zeichnet Leaflet das Bild, wirken
 * saturate() und brightness() per CSS auf die Ebene (.dop-ebene, .relief-ebene);
 * zeichnet es MapLibre (mit Straßen/Namen), raster-saturation und
 * raster-brightness-max im Stil (glStil). Beides multipliziert jeden Farbwert
 * mit demselben Faktor, sieht also gleich aus. Die Straßen bleiben hell. */
function dopFarbe() {
  return (prefs.dopFarbe == null ? 100 : prefs.dopFarbe) / 100;
}

/** raster-saturation zur Verstärkung g wie bei saturate(g). MapLibre rechnet
 *  bei s > 0 farbe = mittel + (farbe − mittel) / (1,001 − s), also s = 1,001 − 1/g;
 *  bei s < 0 mischt es mit dem Faktor −s zum Grau, also s = g − 1. */
function glSaettigung(g) {
  return g >= 1 ? 1.001 - 1 / g : g - 1;
}

function bildHell() {
  return (prefs.bildHell == null ? 100 : prefs.bildHell) / 100;
}

function applyBildRegler() {
  const g = dopFarbe(), b = prefs.base || 'osm';
  $('#map').style.setProperty('--dop-farbe', String(g));
  $('#map').style.setProperty('--bild-hell', String(bildHell()));
  if (gl) glStilSetzen();
  const zeile = $('#dopFarbeZeile');
  if (zeile) zeile.hidden = b !== 'dop';
  const val = $('#dopFarbeVal');
  if (val) val.textContent = Math.round(g * 100) + ' %';
  document.querySelectorAll('[data-relief]').forEach(k => {
    const an = (k.dataset.relief === 'farbe') === !!prefs.reliefFarbe;
    k.classList.toggle('is-on', an);
    k.setAttribute('aria-pressed', String(an));
  });
  const hZeile = $('#bildHellZeile');
  if (hZeile) hZeile.hidden = b !== 'dop' && b !== 'relief';
  const hVal = $('#bildHellVal');
  if (hVal) hVal.textContent = Math.round(bildHell() * 100) + ' %';
}

/* ===================== Höhenfarben =====================
 *
 * Das Relief als Farbe: tief blau, hoch rot, darüber eine Schummerung — beides
 * zeichnet MapLibre aus einer Höhenquelle (raster-dem), die die App selbst aus
 * dem DGM1 baut (dgmKachel, Protokoll dgm://, gerechnet in dgm-werk.js).
 * Dieselben Kacheln wie im Profil, also Bayern und Baden-Württemberg.
 *
 * Nur auf Knopfdruck und nur für den Ausschnitt, in dem er fiel (hoehenBereich).
 * Zuerst lief es von selbst bei jedem Verschieben: Auf Stufe 15 brauchte ein
 * Desktop-Bildschirm bei Ermetzhofen rund 30 Kilometerkacheln, 83 MB, und
 * füllte fast den ganzen Vorrat (HOEHEN_VORRAT_MAX); jede Kartenkachel kostete
 * dazu rund 190 ms im Hauptfaden. Das war es nicht wert.
 *
 * Gerechnet wird immer auf Zoomstufe 16 (1,5 m je Bildpunkt); näher heran
 * vergrößert MapLibre. Weiter weg verschwinden die Farben, das graue Relief
 * bleibt. Die Skala gilt für den eingefärbten Bereich: das tiefste Prozent ist
 * Blau, das höchste Rot. Im Flachland trennen so schon Dezimeter die Farben. */
const DGM_ZOOM = 16;
const DGM_KEIN = -32768;                 // „keine Höhe" — in Terrarium alle Kanäle 0
const DGM_QUELLE = landQuelle('Höhen DGM1', ['by', 'bw']);
/* Von Tief nach Hoch, dieselben Töne wie .hoehen-balken. Bewusst ohne Weiß und
 * Schwarz am Ende: Parzellen, Bahn-Layer und Pins müssen auf beiden noch stehen. */
const HOEHEN_RAMPE = ['#2c3e94', '#2a7dc4', '#33b2b0', '#7ccc6c', '#e6dd55', '#f19a3c', '#c8382f'];
const dgmProben = new Map();             // "x/y" → 32 × 32 Höhen einer Kachel, alle 8 Bildpunkte (für die Skala)
let hoehenBereich = null;                // { w, s, o, n } in Grad — der eingefärbte Ausschnitt
let hoehenSkala = null;                  // { tief, hoch } in m
let dgmLaeuft = 0;                       // Kacheln, die gerade gerechnet werden
let dgmLeer = null;                      // die Kachel ohne Höhen, einmal gebaut
let dgmWerk = null, dgmNr = 0;
const dgmWartet = new Map();             // Auftrag → { gut, schlecht }

/** Ist „Höhenfarben" gewählt (das Relief zeigt sie, sobald eingefärbt ist)? */
function hoehenFarbenAn() {
  return !glKaputt && (prefs.base || 'osm') === 'relief' && !!prefs.reliefFarbe;
}

/** Zeichnet MapLibre gerade Höhenfarben? */
function hoehenGezeichnet() {
  return hoehenFarbenAn() && !!hoehenBereich;
}

function dgmRechnen(z, x, y) {
  if (!dgmWerk) {
    dgmWerk = new Worker('dgm-werk.js');
    dgmWerk.onmessage = ev => {
      const w = dgmWartet.get(ev.data.id);
      if (!w) return;
      dgmWartet.delete(ev.data.id);
      if (ev.data.fehler) w.schlecht(new Error(ev.data.fehler));
      else w.gut(ev.data);
    };
  }
  const id = ++dgmNr;
  return new Promise((gut, schlecht) => {
    dgmWartet.set(id, { gut, schlecht });
    dgmWerk.postMessage({ id, z, x, y });
  });
}

/** Eine Höhenkachel (Terrarium-PNG) für MapLibre. Außerhalb von Bayern und
 *  Baden-Württemberg gleich die leere, ohne den Worker zu fragen. */
async function dgmKachel(z, x, y, signal) {
  const n = 2 ** z;
  const lon = x / n * 360 - 180, lonO = (x + 1) / n * 360 - 180;
  const lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI;
  const latN = lat(y), latS = lat(y + 1);
  const drin = ['by', 'bw'].some(l => {
    const r = HOEHEN_RAHMEN[l];
    return latS <= r.n && latN >= r.s && lon <= r.o && lonO >= r.w;
  });
  if (!drin) {
    if (!dgmLeer) {
      const c = new OffscreenCanvas(256, 256), g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);   // Terrarium 0, 0, 0 = DGM_KEIN
      dgmLeer = await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer();
    }
    return dgmLeer.slice(0);
  }
  if (signal && signal.aborted) throw new DOMException('abgebrochen', 'AbortError');
  dgmLaeuft++;
  hoehenSkalaZeigen();
  try {
    const { png, probe } = await dgmRechnen(z, x, y);
    dgmProben.set(`${x}/${y}`, probe);
    return png;
  } finally {
    dgmLaeuft--;
    hoehenSkalaSpaeter();
  }
}

function glDgmQuelle() {
  const { w, s, o, n } = hoehenBereich;
  return { type: 'raster-dem', tiles: ['dgm://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium',
    minzoom: DGM_ZOOM, maxzoom: DGM_ZOOM, bounds: [w, s, o, n] };
}

/** Die Farbrampe im Stil: unter −9000 m (keine Höhe) durchsichtig, darüber
 *  von tief bis hoch über die Farben verteilt; was darunter oder darüber
 *  liegt, behält die Endfarbe. */
function hoehenRampe() {
  const { tief, hoch } = hoehenSkala || { tief: 0, hoch: 1000 };
  const stufen = ['interpolate', ['linear'], ['elevation'], DGM_KEIN, 'rgba(0, 0, 0, 0)', -9000, 'rgba(0, 0, 0, 0)',
    -8999, HOEHEN_RAMPE[0]];
  HOEHEN_RAMPE.forEach((f, i) => stufen.push(tief + (hoch - tief) * i / (HOEHEN_RAMPE.length - 1), f));
  return stufen;
}

/* Die Farben liegen zu 70 % über dem grauen Schräglicht der Länder (Ebene
 * bild), darüber die eigene Schummerung. Deckend wirkten sie flach — als
 * fehlten die Schatten (Nutzer, 03.11.2026); so kommt die Form vom
 * Schräglicht und die Höhe von der Farbe. */
function glHoehenEbenen() {
  return [
    { id: 'hoehen-farbe', type: 'color-relief', source: 'dgm',
      paint: { 'color-relief-color': hoehenRampe(), 'color-relief-opacity': 0.7 * glDeckung } },
    { id: 'hoehen-schatten', type: 'hillshade', source: 'dgm',
      paint: { 'hillshade-exaggeration': glDeckung, 'hillshade-shadow-color': '#000000',
        'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#000000' } }
  ];
}

/** Den Ausschnitt einfärben (Knopf in der Skala). Ein neuer Druck ersetzt
 *  den alten Bereich. */
function hoehenEinfaerben() {
  if (map.getZoom() < DGM_ZOOM) return;
  const b = map.getBounds();
  hoehenBereich = { w: b.getWest(), s: b.getSouth(), o: b.getEast(), n: b.getNorth() };
  hoehenSkala = null;
  dgmProben.clear();
  grundAnwenden();     // braucht jetzt MapLibre; setzt den Stil samt Quelle
  glStilSetzen();
  hoehenSkalaZeigen();
}

let hoehenSkalaUhr = 0;
function hoehenSkalaSpaeter() {
  clearTimeout(hoehenSkalaUhr);
  hoehenSkalaUhr = setTimeout(hoehenSkalaErneuern, 150);
}

/** Die Skala aus den Proben im eingefärbten Bereich — die Kacheln am Rand
 *  ragen hinaus, und eine Kuppe dort ließe sie bis zu Höhen reichen, die
 *  gar nicht eingefärbt sind. */
function hoehenSkalaErneuern() {
  if (hoehenGezeichnet()) {
    const n = 256 * 2 ** DGM_ZOOM, { w, s, o, n: nb } = hoehenBereich;
    const px = lon => (lon + 180) / 360 * n;
    const py = lat => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n;
    const x0 = px(w), x1 = px(o), y0 = py(nb), y1 = py(s);
    const werte = [];
    for (const [k, p] of dgmProben) {
      const [x, y] = k.split('/').map(Number);
      for (let j = 0; j < 32; j++) {
        const gy = y * 256 + 8 * j + 4;
        if (gy < y0 || gy > y1) continue;
        for (let i = 0; i < 32; i++) {
          const gx = x * 256 + 8 * i + 4, v = p[j * 32 + i];
          if (gx >= x0 && gx <= x1 && Number.isFinite(v)) werte.push(v);
        }
      }
    }
    if (werte.length) {
      werte.sort((a, c) => a - c);
      let tief = werte[Math.floor(werte.length * 0.01)], hoch = werte[Math.floor(werte.length * 0.99)];
      // Ganz flach: wenigstens einen Meter Spanne, sonst rauscht jeder Zentimeter in den Farben
      if (hoch - tief < 1) { const m = (hoch + tief) / 2; tief = m - 0.5; hoch = m + 0.5; }
      if (!hoehenSkala || Math.abs(hoehenSkala.tief - tief) > 0.05 || Math.abs(hoehenSkala.hoch - hoch) > 0.05) {
        hoehenSkala = { tief, hoch };
        glStilSetzen();
      }
    }
  }
  hoehenSkalaZeigen();
}

/** Die Leiste unten (wie beim Querprofil): Farbbalken mit Höhen, darunter
 *  der Knopf zum Einfärben — oder der Hinweis, näher heranzugehen. */
function hoehenSkalaZeigen() {
  const leiste = $('#hoehenLeiste');
  if (!leiste || !map) return;
  const vorher = leiste.hidden;
  leiste.hidden = !hoehenFarbenAn();
  if (leiste.hidden !== vorher) updateBH();
  if (leiste.hidden) return;
  const nah = map.getZoom() >= DGM_ZOOM;
  const skala = hoehenGezeichnet() && !!hoehenSkala;
  $('#hoehenSkala').classList.toggle('ohne-skala', !skala);
  const knopf = $('#hoehenKnopf');
  // Ausgegraut statt weg, damit die Leiste beim Laden nicht in der Höhe springt
  knopf.disabled = !nah || dgmLaeuft > 0;
  knopf.textContent = dgmLaeuft ? 'Höhen laden …' : hoehenBereich ? 'Hier neu einfärben' : 'Ausschnitt einfärben';
  knopf.classList.toggle('maps', !hoehenBereich);   // Signalfarbe nur für das erste Einfärben
  const text = $('#hoehenSkalaText');
  if (!nah) text.textContent = 'Zum Einfärben näher heran.';
  else if (!skala) text.textContent = 'Färbt den Ausschnitt nach der Geländehöhe: Blau ist das Tiefste darin, Rot das Höchste.';
  else text.textContent = '';
  text.hidden = !text.textContent;
  const hoehe = leiste.getBoundingClientRect().height;
  if (Math.abs(hoehe - (leiste._hoehe || 0)) > 1) { leiste._hoehe = hoehe; updateBH(); }
  if (!skala) return;
  const { tief, hoch } = hoehenSkala;
  const stellen = hoch - tief < 20 ? 1 : 0;
  const m = v => v.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  $('#hoehenHoch').textContent = m(hoch) + ' m';
  $('#hoehenMitte').textContent = m((hoch + tief) / 2);
  $('#hoehenTief').textContent = m(tief);
}

/* Straßen und Ortsnamen zeichnet MapLibre, über Dunkel und den Bildern. In der
 * OSM-Karte stecken sie schon drin: Dort bleiben sie eingeschaltet, werden aber
 * nicht gezeichnet, und beim Wechsel erscheinen sie. */
const NUR_UEBER_BILD = new Set(['str', 'ort']);
let fpBayernGesagt = false;     // Hinweis „in Bayern nur HFP und TP“ einmal je Sitzung
const AUFLAGEN = ['orm', 'parz', 'ifg', 'fp', 'str', 'ort', 'radar'];

/** Ist die Auflage gewählt? Der Bahn-Layer ist von Haus aus an, die übrigen aus. */
function auflageGewaehlt(kennung) {
  return kennung === 'orm' ? prefs.orm !== false : !!prefs[kennung];
}

/** Eine Leaflet-Auflage so auf die Karte bringen, wie die Wahl es verlangt. */
function auflageSetzen(kennung) {
  if (kennung === 'radar') { radarSetzen(); return; }      // zwei Ebenen und eine Zeitleiste
  const layer = overlayLayers[kennung];
  if (!layer) return;
  const sichtbar = auflageGewaehlt(kennung);
  if (sichtbar && kennung === 'parz') parzFarbeAnpassen();
  if (sichtbar && !map.hasLayer(layer)) layer.addTo(map);
  if (!sichtbar && map.hasLayer(layer)) map.removeLayer(layer);
}

function toggleOverlay(kennung) {
  if (!AUFLAGEN.includes(kennung)) return;
  const an = !auflageGewaehlt(kennung);
  prefs[kennung] = an;

  if (an && kennung === 'parz') {
    const c = map.getCenter();
    if (ausserhalbBayerns() && !inLandRahmen('bw', c.lat, c.lng)) toast('Flurstücke gibt es für Bayern und Baden-Württemberg.');
    else if (map.getZoom() < 17) toast('Parzellen zeichnet der Dienst erst ab Zoomstufe 17 (1:5000).');
  }
  if (an && kennung === 'ifg' && map.getZoom() < IFG_AB) {
    toast(`Das DB-Netz erscheint ab Zoomstufe ${IFG_AB} — näher heranzoomen.`);
  }
  if (an && kennung === 'fp') {
    const c = map.getCenter(), ab = Math.min(...FP_ARTEN.filter(([k]) => fpArtAn(k)).map(([, , , z]) => z), 99);
    const bayern = !ausserhalbBayerns() && !inLandRahmen('bw', c.lat, c.lng);
    // Einmal je Sitzung: Wer in Bayern Aufnahme- oder Grenzpunkte erwartet, sieht sonst einfach keine
    const byHinweis = bayern && !fpBayernGesagt ? ' In Bayern gibt es nur Höhenfestpunkte und TP.' : '';
    if (bayern) fpBayernGesagt = true;
    if (ausserhalbBayerns() && !inLandRahmen('bw', c.lat, c.lng)) toast('Festpunkte gibt es für Bayern und Baden-Württemberg.');
    else if (map.getZoom() < ab) toast(`Festpunkte erscheinen ab Zoomstufe ${ab} — näher heranzoomen.${byHinweis}`);
    else if (byHinweis) toast(byHinweis.trim());
  }
  if (an && NUR_UEBER_BILD.has(kennung) && (prefs.base || 'osm') === 'osm') {
    toast('In der Karte schon enthalten — erscheint über Dunkel, Luftbild, DOP20 und Relief.');
  }
  if (NUR_UEBER_BILD.has(kennung)) grundAnwenden(); else auflageSetzen(kennung);
  ordneAuflagen();
  saveStore();
  syncButtons();
}

/* -------- Eigener WMS-Layer -------- */

/* Geschützte Dienste liefern ihre Kacheln nur mit Anmeldung. Ein Eingabefeld in
 * der App hilft dabei nicht: Die Kacheln müssten dann per fetch mit
 * Authorization-Header geholt werden, und das verlangt CORS-Freigaben, die
 * solche Dienste praktisch nie senden — der Browser bricht schon beim Preflight
 * ab. Als Bild (<img>) geladen entfällt die CORS-Prüfung, und der Browser hängt
 * von sich aus die Zugangsdaten an, die er für die Domain gespeichert hat.
 * Deshalb: einmal über den Anmelden-Knopf im Browser anmelden, den Rest erledigt
 * dessen Passwortspeicher. Die App kennt die Zugangsdaten nie. */

let wmsLayer = null;
let wmsFehler = 0;

/* Nur https: Ein http-Dienst scheitert auf der https-Seite ohnehin (Mixed Content),
 * und ein "javascript:"-Wert darf nie in window.open oder fetch landen. Zugangsdaten
 * in der Adresse (https://name:kennwort@…) werden abgewiesen und gar nicht erst
 * gespeichert (wmsSave): Alle Apps dieser Herkunft teilen sich den lokalen
 * Speicher, und fürs Anmelden gibt es den Knopf — dort merkt sie sich der Browser. */
function wmsUrlOk(u) {
  return !wmsUrlFehler(u);
}

/** Was an der Adresse nicht stimmt, als Satz für die Meldung; leer, wenn alles passt. */
function wmsUrlFehler(u) {
  let url;
  try { url = new URL(u); } catch { return 'Die Adresse ist ungültig.'; }
  if (url.protocol !== 'https:') return 'Nur https-Adressen sind möglich.';
  if (url.username || url.password) {
    return 'Zugangsdaten gehören nicht in die Adresse — bitte über „Anmelden" eingeben, dann merkt sie sich der Browser.';
  }
  return '';
}

function wmsBuild() {
  const url = (prefs.wms.url || '').trim();
  const layers = (prefs.wms.layers || '').trim();
  if (!url || !layers || !wmsUrlOk(url)) return null;

  const layer = L.tileLayer.wms(url, {
    layers, format: 'image/png', transparent: true, version: '1.3.0',
    opacity: (prefs.wms.opacity || 75) / 100,
    crossOrigin: false,       // kein CORS anfordern, sonst scheitert der Abruf
    // Leaflet setzt bei Kachel-Layern standardmäßig maxZoom 18 — der Layer
    // verschwände dann beim Hineinzoomen. Ein WMS rendert jeden Maßstab auf
    // Anfrage, es gibt also keine natürliche Obergrenze.
    maxZoom: 22
  });

  wmsFehler = 0;
  layer.on('tileerror', () => {
    wmsFehler++;
    // Erst nach mehreren Fehlschlägen melden, einzelne Aussetzer sind normal
    if (wmsFehler === 4) {
      toast('WMS-Kacheln kommen nicht — Adresse, Layer-Name oder Anmeldung prüfen.');
    }
  });
  return layer;
}

function wmsApply(sichtbar) {
  if (wmsLayer) { map.removeLayer(wmsLayer); wmsLayer = null; }
  prefs.wms.on = !!sichtbar;
  if (sichtbar) {
    wmsLayer = wmsBuild();
    if (!wmsLayer) {
      prefs.wms.on = false;
      const url = (prefs.wms.url || '').trim();
      toast(url && wmsUrlFehler(url) ? wmsUrlFehler(url) : 'Bitte Adresse und Layer-Namen eintragen.');
    }
    else wmsLayer.addTo(map);
  }
  // Dieselbe Reihenfolge wie überall: WMS unten, Parzellen bis Ortsnamen darüber.
  // Vorher kam nur der Bahn-Layer nach oben, der WMS verdeckte die Parzellen.
  ordneAuflagen();
  saveStore();
  syncButtons();
}

/* GetCapabilities auswerten: Layer-Namen und Koordinatensysteme.
 * Namensräume ignorieren — WMS 1.3.0 setzt einen Default-Namespace, an dem
 * querySelector scheitert. */
function parseWmsCapabilities(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('kein gültiges XML');

  const layers = [];
  for (const el of doc.getElementsByTagNameNS('*', 'Layer')) {
    // Nur direkte Kinder ansehen, sonst erbt jede Gruppe den Namen ihrer Unterlayer
    let name = '', title = '', minScale = null, maxScale = null;
    for (const c of el.children) {
      if (c.localName === 'Name' && !name) name = c.textContent.trim();
      if (c.localName === 'Title' && !title) title = c.textContent.trim();
      // Maßstabsgrenzen erklären, warum ein Layer beim Zoomen verschwindet
      if (c.localName === 'MinScaleDenominator') minScale = parseFloat(c.textContent);
      if (c.localName === 'MaxScaleDenominator') maxScale = parseFloat(c.textContent);
      if (c.localName === 'ScaleHint') {              // WMS 1.1.1
        const mn = parseFloat(c.getAttribute('min')), mx = parseFloat(c.getAttribute('max'));
        if (isFinite(mn)) minScale = mn / 0.00028;
        if (isFinite(mx)) maxScale = mx / 0.00028;
      }
    }
    if (name) layers.push({ name, title, minScale, maxScale });
  }

  const crs = new Set();
  for (const tag of ['CRS', 'SRS']) {
    for (const el of doc.getElementsByTagNameNS('*', tag)) {
      const v = el.textContent.trim();
      if (v) crs.add(v);
    }
  }
  return { layers, crs: [...crs], webMercator: [...crs].some(c => /EPSG:(3857|900913)/i.test(c)) };
}

function wmsShowLayers(caps) {
  const box = $('#wmsList');
  if (!caps.layers.length) { box.innerHTML = '<p class="fine">Keine benannten Layer gefunden.</p>'; return; }

  const hinweis = caps.crs.length
    ? `<p class="fine">${caps.webMercator
        ? 'EPSG:3857 wird unterstützt — passt.'
        : 'Achtung: EPSG:3857 ist nicht dabei. Der Layer bleibt vermutlich leer.'}</p>`
    : '';

  box.innerHTML = hinweis + caps.layers.slice(0, 25).map((l, i) => {
    const grenzen = [];
    if (isFinite(l.minScale) && l.minScale) grenzen.push('nicht näher als 1:' + nfM.format(l.minScale));
    if (isFinite(l.maxScale) && l.maxScale) grenzen.push('nicht weiter als 1:' + nfM.format(l.maxScale));
    const unter = [l.title !== l.name ? l.title : '', grenzen.join(' · ')].filter(Boolean).join(' — ');
    return `<button class="fac-item" type="button" data-wl="${i}">${esc(l.name)}` +
      `${unter ? `<small>${esc(unter)}</small>` : ''}</button>`;
  }).join('');

  box.querySelectorAll('[data-wl]').forEach(btn => btn.addEventListener('click', () => {
    const l = caps.layers[Number(btn.dataset.wl)];
    $('#wmsLayers').value = l.name;
    prefs.wms.layers = l.name;
    saveStore();
    wmsApply(true);
    toast('Layer „' + l.name + '" eingestellt.');
  }));
}

async function wmsLoadLayers() {
  const url = ($('#wmsUrl').value || '').trim();
  if (!url) { toast('Bitte zuerst die Adresse des Dienstes eintragen.'); return; }
  if (!wmsUrlOk(url)) { toast(wmsUrlFehler(url)); return; }
  $('#wmsList').innerHTML = '<p class="fine">Frage den Dienst …</p>';
  const sep = url.includes('?') ? '&' : '?';
  try {
    const r = await fetch(url + sep + 'SERVICE=WMS&REQUEST=GetCapabilities');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    wmsShowLayers(parseWmsCapabilities(await r.text()));
    $('#wmsPaste').hidden = true;
  } catch (err) {
    // Typischer Fall bei geschützten Diensten: keine CORS-Freigabe
    $('#wmsList').innerHTML = `<p class="fine">Direktabfrage nicht möglich (${esc(err.message)}). ` +
      `Bitte über <em>Anmelden</em> öffnen, dort alles kopieren und unten einfügen.</p>`;
    $('#wmsPaste').hidden = false;
  }
}

function wmsLogin() {
  const url = (prefs.wms.url || '').trim();
  if (!url) { toast('Bitte zuerst die Adresse des Dienstes eintragen.'); return; }
  if (!wmsUrlOk(url)) { toast(wmsUrlFehler(url)); return; }
  // GetCapabilities aufrufen: Der Browser fragt die Zugangsdaten ab und merkt sie
  // sich für die Domain. Nebenbei sieht man dort die verfügbaren Layer.
  const sep = url.includes('?') ? '&' : '?';
  window.open(url + sep + 'SERVICE=WMS&REQUEST=GetCapabilities', '_blank', 'noopener');
  toast('Im neuen Tab anmelden und speichern lassen, dann hierher zurück.');
}

/* -------- Regenradar -------- */

/* Niederschlagsradar des DWD, das RV-Produkt: 1 km, alle 5 Minuten. Eine Stunde
 * Messung zurück, zwei Stunden Vorhersage voraus.
 *
 * Seit 13.10.2026 kommen Zahlen statt Bilder: über den WCS desselben GeoServers,
 * nicht mehr als eingefärbte WMS-Kacheln. Der Zeitregler soll gleiten wie in der
 * DWD-App WarnWetter, und die blendet nicht über, sie verschiebt: In einem Video
 * vom 11.10.2026 wandert das Regenband bei Stuttgart weiter, während die Uhr noch
 * auf derselben Fünfminutenmarke steht, scharfrandig und ohne Doppelkontur. Das
 * geht nur mit Werten — aus zwei Farbbildern lässt sich kein Zwischenstand mit
 * sauberen Stufen rechnen.
 *
 * Abruf: je Zeitpunkt ein GeoTIFF des Ausschnitts, Float32 in mm je 5 Minuten
 * (× 12 = mm/h; gegen GetFeatureInfo und die WMS-Farben geprüft), Deflate,
 * EPSG:3857 vom Dienst selbst. Gemessen 15–80 KB und 0,3–3 s je Zeitpunkt; die
 * WMS-Kacheln brauchten 1–7 s. Große Ausschnitte verkleinert der Dienst
 * (scalesize) auf höchstens RADAR_RASTER Zellen je Richtung: ganz Deutschland in
 * voller Auflösung wären 888 × 1006 Zellen, 3,6 MB je Zeitpunkt im Speicher.
 * Alle 37 Zeitpunkte werden vorgeladen, die um den Regler herum zuerst.
 *
 * radar-werk.js liest die TIFFs und schätzt je Paar benachbarter Zeitpunkte,
 * wohin der Regen zieht. Der Shader (RADAR_FS) schiebt beide Bilder zur
 * Zwischenzeit hin, mischt sie und färbt erst danach ein — bilinear zwischen den
 * Zellen wie zuvor INTERPOLATIONS=bilinear beim WMS. Nicht bicubic: Das schwingt
 * über und erfindet Inseln, die nicht gemessen sind.
 *
 * Zeit: TIME allein genügt — für einen vergangenen Zeitpunkt liefert der Dienst
 * die Messung, für einen künftigen die Vorhersage des neuesten Laufs. Die letzte
 * Messung steht als Vorgabe von REFERENCE_TIME in den Capabilities der
 * WMS-Ebene; die sind über den Ebenenpfad 38 KB klein statt 875 KB für den
 * ganzen Dienst. Gemessen lag sie 6 Minuten hinter der Uhr.
 *
 * Der Service Worker lässt maps.dwd.de durch (nicht in TILE_HOSTS): Ein Radarbild
 * ist nach fünf Minuten alt und gehört nicht in den Offlinevorrat. */
const RADAR_WCS = 'https://maps.dwd.de/geoserver/dwd/ows';
const RADAR_CAPS = 'https://maps.dwd.de/geoserver/dwd/Niederschlagsradar/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0';
const RADAR_CRS = 'http://www.opengis.net/def/crs/EPSG/0/3857';
const RADAR_ZURUECK = 60;      // Minuten Messung vor der letzten
const RADAR_VOR = 120;         // Minuten Vorhersage — so weit rechnet der DWD
const RADAR_SCHRITT = 5 * 60000;
const RADAR_TEMPO = 12;        // Minuten je Sekunde beim Abspielen: 3 Stunden in 15 s (mit 20 zu schnell)
const RADAR_HALT = 1500;       // ms am Ende stehen, dann von vorn
/* Flächen leise, jede Stufengrenze als Linie (gewählt 13.10.2026, statt 70 %
 * deckend ohne Linien): Die DWD-Farben bleiben wie in WarnWetter, die Linien
 * geben der Fläche die Kanten. Die Linie trägt die Farbe der höheren Stufe,
 * abgedunkelt — auf dunklem Grund unverändert: Auf Dunkel und auf den Luftbildern
 * gingen abgedunkelte Linien im Wald unter. */
const RADAR_FLAECHE = 0.45;
const RADAR_LINIE_TON = 0.62;
const RADAR_GRUND_DUNKEL = new Set(['dark', 'dop']);
const RADAR_FRISCH = 5 * 60000;
const RADAR_RASTER = 400;      // Zellen je Richtung höchstens
const RADAR_ZELLE = 1464;      // Mercator-Meter je Zelle in voller Auflösung (im Süden; im Norden mehr)
const RADAR_BEREICH_MIN = 250000;   // Mercator-Meter: kleiner wird kein Ausschnitt geholt
const RADAR_VERSUCHE = 6;     // je Bild: Der DWD antwortet zeitweise jedes dritte Mal mit einem XML-Fehler
const RADAR_GLEICHZEITIG = 6;  // Abrufe zugleich — HTTP/1.1, mehr lässt der Browser je Server nicht zu
                               // (gemessen 01.11.2026: 37 Bilder mit 3 zugleich 2,4 s, mit 6 1,4 s)
const RADAR_GEBIET = [[45.68, 1.47], [56.21, 18.73]];   // Abdeckung laut DescribeCoverage

/* Farbstufen des Dienstes, aus GetLegendGraphic (application/json), mm/h */
const RADAR_STUFEN = [
  ['#33ffff', 0.1], ['#1acc9a', 0.2], ['#019934', 0.4], ['#4db31b', 1], ['#99cc01', 2],
  ['#cce601', 3], ['#ffff01', 5], ['#ffc401', 7.5], ['#ff8901', 10], ['#ff4501', 15],
  ['#fe0000', 30], ['#e5004c', 45], ['#cc0098', 75], ['#6600cb', 100], ['#0000fe', 150]
];

/* Hinter den zwei Stunden des Radars: das Wettermodell ICON-EU des DWD,
 * Niederschlag je Stunde (mm in der Stunde bis zum Zeitpunkt = mm/h), rund
 * 7 km je Zelle, neu alle 6 h, bis 78 h nach dem Lauf. Dieselbe Schnittstelle
 * wie das Radar, mit CORS. Der Worker rechnet es bilinear auf das Raster des
 * Radarausschnitts um — so laufen Radar und Modell durch denselben Shader, nur
 * ohne Bewegungsschätzung (zwischen Stunden wird überblendet). Gezeigt bis
 * MODELL_VOR nach der letzten Messung; auf dem Regler bekommt der Abschnitt
 * MODELL_BREITE Einheiten, das Radar seine 180 Minuten. Gewünscht 01.11.2026. */
const MODELL_ID = 'dwd__Icon-eu_reg00625_fd_sl_TOTPREC01H';
const MODELL_CAPS = 'https://maps.dwd.de/geoserver/dwd/Icon-eu_reg00625_fd_sl_TOTPREC01H/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0';
const MODELL_REICHWEITE = 78 * 3600000;   // so weit rechnet ein Lauf
const MODELL_VOR = 48 * 60;               // Minuten nach der letzten Messung
const MODELL_BREITE = 120;                // Reglereinheiten für den Modellabschnitt
const MODELL_TEMPO = 180;                 // Minuten je Sekunde beim Abspielen: 46 h in gut 15 s
const MODELL_FRISCH = 30 * 60000;
const STUNDE = 3600000;

let radarModell = null;        // { lauf: ms, geholt: ms } — der Lauf von ICON-EU
let radarRef = null;           // letzte Messung, ms
let radarRefGeholt = 0;
let radarVersatz = 0;          // gezeigt: Minuten zur letzten Messung, stufenlos
let radarSchicht = null;       // die Leaflet-Ebene mit der Zeichenfläche
let radarGl = null;            // WebGL2: Programm, Uniform-Orte, leere Bewegung
let radarKaputt = '';          // warum es nicht geht, sonst leer
let radarWerk = null;
let radarSatz = null;          // gezeigter Ausschnitt samt Bildern und Bewegungen
let radarSatzNeu = null;       // ein neuer Ausschnitt, der noch lädt
let radarSatzZahl = 0;
let radarSpielt = false;
let radarSpielZeit = 0;
let radarHaltRest = 0;
let radarFrischTimer = 0;
let radarHolt = false;         // die Zeitachse wird gerade erfragt
let radarZeichnenOffen = false;
let radarTextAlt = '';

const radarUhr = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const radarIso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const radarMeter = ll => L.Projection.SphericalMercator.project(L.latLng(ll));
const radarLatLng = (x, y) => L.Projection.SphericalMercator.unproject(L.point(x, y));
const radarEnthaelt = (a, b) => b.x0 >= a.x0 && b.y0 >= a.y0 && b.x1 <= a.x1 && b.y1 <= a.y1;

/** Sichtbarer Ausschnitt in Mercator-Metern — bei gedrehter Karte das Rechteck
 *  um die gedrehte Sicht (leaflet-rotate rechnet getBounds so). */
function radarSicht() {
  const b = map.getBounds(), sw = radarMeter(b.getSouthWest()), ne = radarMeter(b.getNorthEast());
  return { x0: sw.x, y0: sw.y, x1: ne.x, y1: ne.y };
}

/* Shader: Bildpunkt → Rasterzelle (uGs, uGo), Bewegung an dieser Stelle holen,
 * A ein Stück vor, B ein Stück zurück, mischen, in mm/h einfärben. Abstand zur
 * nächsten Stufengrenze in Bildpunkten über fwidth: daraus die geglättete
 * Kante der Fläche und die Kontur, uBreite Bildpunkte breit (ein CSS-Pixel)
 * mittig auf der Grenze. Die Ausgabe ist vormultipliert — keine Stufe ist vec4(0). */
const RADAR_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const RADAR_FS = `#version 300 es
precision highp float;
#define N ${RADAR_STUFEN.length}
in vec2 vUv;
uniform sampler2D uA, uB, uFluss;
uniform vec2 uGs, uGo, uN, uFn;
uniform float uS, uT, uMitFluss, uFlaeche, uLinieTon, uBreite;
uniform float uStufe[N];
uniform vec3 uFarbe[N];
out vec4 farbe;

float wert(sampler2D t, vec2 g) {
  if (g.x < 0.0 || g.y < 0.0 || g.x > uN.x || g.y > uN.y) return 0.0;
  return texture(t, g / uN).r;
}
vec4 flaeche(int k) { return k <= 0 ? vec4(0.0) : vec4(uFarbe[k - 1], 1.0) * uFlaeche; }
vec4 linie(int k) { return vec4(uFarbe[k - 1] * uLinieTon, 1.0); }

void main() {
  vec2 g = vUv * uGs + uGo;
  vec2 v = uMitFluss > 0.5 ? texture(uFluss, g / (uFn * uS)).rg : vec2(0.0);
  float a = wert(uA, g - uT * v);
  float b = wert(uB, g + (1.0 - uT) * v);
  float w = mix(a, b, uT) * 12.0;
  float d = max(fwidth(w), 1e-5);
  int k = 0;
  for (int i = 0; i < N; i++) if (w >= uStufe[i]) k = i + 1;
  float unten = k > 0 ? (w - uStufe[k - 1]) / d : 1e9;
  float oben = k < N ? (uStufe[k] - w) / d : 1e9;
  vec4 c = flaeche(k);
  float abstand;
  int hoeher;
  if (unten < oben) { c = mix(flaeche(k - 1), c, clamp(0.5 + unten, 0.0, 1.0)); abstand = unten; hoeher = k; }
  else { c = mix(flaeche(k + 1), c, clamp(0.5 + oben, 0.0, 1.0)); abstand = oben; hoeher = k + 1; }
  if (hoeher >= 1 && hoeher <= N) c = mix(c, linie(hoeher), clamp(0.5 * uBreite + 0.5 - abstand, 0.0, 1.0));
  farbe = c;
}`;

function radarGlAnlegen(el) {
  const gl = el.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const shader = (typ, quelle) => {
    const s = gl.createShader(typ);
    gl.shaderSource(s, quelle);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, RADAR_VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, RADAR_FS));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  // Ein Dreieck über die ganze Fläche
  gl.bindVertexArray(gl.createVertexArray());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ort = {};
  for (const n of ['uA', 'uB', 'uFluss', 'uGs', 'uGo', 'uN', 'uFn', 'uS', 'uT', 'uMitFluss', 'uStufe', 'uFarbe',
    'uFlaeche', 'uLinieTon', 'uBreite']) {
    ort[n] = gl.getUniformLocation(prog, n);
  }
  gl.uniform1i(ort.uA, 0);
  gl.uniform1i(ort.uB, 1);
  gl.uniform1i(ort.uFluss, 2);
  gl.uniform1fv(ort.uStufe, RADAR_STUFEN.map(([, v]) => v));
  gl.uniform3fv(ort.uFarbe, RADAR_STUFEN.flatMap(([f]) => hexRgb(f).map(c => c / 255)));
  gl.uniform1f(ort.uFlaeche, RADAR_FLAECHE);
  const g = { gl, ort, max: Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS)) };
  radarGl = g;
  g.ohneFluss = radarTextur(1, 1, true, new Float32Array(2));
  return g;
}

/** Werte (R16F) oder Bewegung (RG16F, zwei = true). Halbe Genauigkeit reicht —
 *  0,01 mm je 5 min ist der kleinste Wert — und ist filterbar ohne Erweiterung. */
function radarTextur(w, h, zwei, daten) {
  if (!radarGl) return null;
  const gl = radarGl.gl, tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, zwei ? gl.RG16F : gl.R16F, w, h, 0, zwei ? gl.RG : gl.RED, gl.FLOAT, daten);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function radarTexWeg(tex) {
  if (radarGl && tex) radarGl.gl.deleteTexture(tex);
}

/* Die Zeichenfläche als Leaflet-Ebene. In der tilePane, damit sie mit den
 * Kachelebenen per z-index sortiert wird (ordneAuflagen) — unter Parzellen und
 * Bahn-Layer — und anders als die overlayPane während einer Geste nicht
 * ausgeblendet wird (gesteBild).
 *
 * Lage wie bei Leaflets Kachelebenen (GridLayer._setZoomTransform): Ursprung
 * beim Zeichnen merken, bei Zoom und Zoomanimation nur per transform
 * nachführen. Neu gezeichnet wird erst am Ende einer Bewegung, und nur, wenn
 * die Fläche die Sicht nicht mehr deckt oder die Zoomstufe eine andere ist. Die
 * Fläche reicht ein Viertel der Sicht über jeden Rand. */
const RadarSchicht = L.Layer.extend({
  options: {
    pane: 'tilePane',
    attribution: 'Regenradar: Quelle <a href="https://www.dwd.de/">Deutscher Wetterdienst</a>'
  },

  onAdd(m) {
    if (!this._el) {
      const el = this._el = L.DomUtil.create('canvas', 'leaflet-layer radar-flaeche');
      if (m._zoomAnimated) el.classList.add('leaflet-zoom-animated');
      el.style.zIndex = 1;
      el.addEventListener('webglcontextlost', e => { e.preventDefault(); radarGlVerloren(); });
      el.addEventListener('webglcontextrestored', radarGlWieder);
      try {
        if (!radarGlAnlegen(el)) radarKaputt = 'braucht WebGL2';
      } catch (err) {
        console.warn('Regenradar, WebGL:', err);
        radarKaputt = 'Grafikfehler';
      }
    }
    this.getPane().appendChild(this._el);
    this._rahmen = null;
    this._rahmenPruefen();
    return this;
  },

  onRemove() {
    L.DomUtil.remove(this._el);
    this._rahmen = null;
    return this;
  },

  getEvents() {
    const ev = {
      zoom: this._lage, viewreset: this._lage,
      moveend: this._rahmenPruefen, zoomend: this._rahmenPruefen,
      rotateend: this._rahmenPruefen, resize: this._rahmenPruefen
    };
    if (this._map._zoomAnimated) ev.zoomanim = this._lage;
    return ev;
  },

  // Wie GridLayer.bringToFront: über alle Ebenen der Pane, per z-index
  bringToFront() {
    if (this._map && this._el) {
      let hoechst = 0;
      for (const el of this.getPane().children) {
        if (el !== this._el && el.style.zIndex) hoechst = Math.max(hoechst, +el.style.zIndex);
      }
      this._el.style.zIndex = hoechst + 1;
    }
    return this;
  },

  _lage(e) {
    const r = this._rahmen, m = this._map;
    if (!r || !m) return;
    const anim = !!(e && e.type === 'zoomanim');
    const zoom = anim ? e.zoom : m.getZoom(), mitte = anim ? e.center : m.getCenter();
    const massstab = m.getZoomScale(zoom, r.z);
    const pos = r.nwPx.multiplyBy(massstab).subtract(m._getNewPixelOrigin(mitte, zoom)).round();
    L.DomUtil.setTransform(this._el, pos, massstab);
  },

  _rahmenPruefen() {
    const m = this._map;
    if (!m) return;
    const sicht = radarSicht();
    radarBereichPruefen(sicht);
    const r = this._rahmen, z = m.getZoom();
    if (r && r.z === z && radarEnthaelt(r.m, sicht)) { this._lage(); return; }

    const rx = (sicht.x1 - sicht.x0) / 4, ry = (sicht.y1 - sicht.y0) / 4;
    const mm = { x0: sicht.x0 - rx, y0: sicht.y0 - ry, x1: sicht.x1 + rx, y1: sicht.y1 + ry };
    const nwPx = m.project(radarLatLng(mm.x0, mm.y1), z), sePx = m.project(radarLatLng(mm.x1, mm.y0), z);
    const breite = Math.max(1, sePx.x - nwPx.x), hoehe = Math.max(1, sePx.y - nwPx.y);
    /* Bis zur doppelten Pixeldichte, höchstens 4 Millionen Bildpunkte. Gemessen
     * am Rechner 2,6 ms je Bild bei 2,3 Millionen; ein Handy-Grafikchip ist ein
     * Mehrfaches langsamer, und beim Abspielen läuft das jedes Bild. */
    const grenze = radarGl ? radarGl.max : 4096;
    const pr = Math.min(window.devicePixelRatio || 1, 2, grenze / breite, grenze / hoehe, Math.sqrt(4e6 / (breite * hoehe)));
    const el = this._el;
    el.width = Math.max(1, Math.round(breite * pr));
    el.height = Math.max(1, Math.round(hoehe * pr));
    el.style.width = breite + 'px';
    el.style.height = hoehe + 'px';
    this._rahmen = { z, m: mm, nwPx, pr: el.width / breite };
    this._lage();
    radarZeichnenJetzt();      // gleich, sonst steht die frisch geleerte Fläche ein Bild lang leer
  }
});

function radarGlVerloren() {
  radarGl = null;
  for (const s of [radarSatz, radarSatzNeu]) if (s) { s.bilder.clear(); s.fluesse.clear(); }
  radarSatz = radarSatzNeu = null;
}

function radarGlWieder() {
  if (!radarSchicht || !radarSchicht._el) return;
  try { radarGlAnlegen(radarSchicht._el); } catch (err) { console.warn('Regenradar, WebGL:', err); return; }
  if (radarSchicht._map) { radarSchicht._rahmen = null; radarSchicht._rahmenPruefen(); }
}

/* -- Ausschnitte und Abruf -- */

/** Den Ausschnitt, den die Sicht verlangt: doppelt so groß wie sie, mindestens
 *  RADAR_BEREICH_MIN, beschnitten auf die Abdeckung des Radars. Null, wenn die
 *  Sicht ganz außerhalb liegt. Dreimal so groß wäre seltener neu zu holen, aber
 *  auf dem hohen Handyausschnitt schon bei Zoomstufe 9 verkleinert (2,6 km je
 *  Zelle statt 1,5) — die Ränder wurden sichtbar kantig. */
function radarWunsch(sicht) {
  const g0 = radarMeter(RADAR_GEBIET[0]), g1 = radarMeter(RADAR_GEBIET[1]);
  const schnitt = { x0: Math.max(g0.x, sicht.x0), y0: Math.max(g0.y, sicht.y0), x1: Math.min(g1.x, sicht.x1), y1: Math.min(g1.y, sicht.y1) };
  if (schnitt.x1 - schnitt.x0 < 1000 || schnitt.y1 - schnitt.y0 < 1000) return null;
  const cx = (sicht.x0 + sicht.x1) / 2, cy = (sicht.y0 + sicht.y1) / 2;
  const hx = Math.max(RADAR_BEREICH_MIN, 2 * (sicht.x1 - sicht.x0)) / 2;
  const hy = Math.max(RADAR_BEREICH_MIN, 2 * (sicht.y1 - sicht.y0)) / 2;
  const b = {
    x0: Math.round(Math.max(g0.x, cx - hx)), y0: Math.round(Math.max(g0.y, cy - hy)),
    x1: Math.round(Math.min(g1.x, cx + hx)), y1: Math.round(Math.min(g1.y, cy + hy))
  };
  const nx = (b.x1 - b.x0) / RADAR_ZELLE, ny = (b.y1 - b.y0) / RADAR_ZELLE;
  const f = Math.max(1, nx / RADAR_RASTER, ny / RADAR_RASTER);
  return { sicht: schnitt, bereich: b, groesse: f > 1 ? [Math.round(nx / f), Math.round(ny / f)] : null, zelle: RADAR_ZELLE * f };
}

/** Deckt der Ausschnitt die Sicht, und ist er nicht viel gröber als nötig?
 *  Sonst einen neuen holen. Der alte bleibt stehen, bis der neue das Bild
 *  für den Regler hat. */
function radarBereichPruefen(sicht) {
  if (radarRef == null || !radarGl) return;
  const w = radarWunsch(sicht);
  if (!w) return;
  const ziel = radarSatzNeu || radarSatz;
  if (ziel && radarEnthaelt(ziel.bereich, w.sicht) && ziel.zelle <= w.zelle * 1.6) return;
  if (radarSatzNeu) radarSatzWeg(radarSatzNeu);
  const satz = {
    id: ++radarSatzZahl, bereich: w.bereich, groesse: w.groesse, zelle: w.zelle, geo: null,
    bilder: new Map(), fluesse: new Map(), offen: new Set(), fehler: new Map(), modell: new Set()
  };
  radarWerkHolen().postMessage({ art: 'satz', satz: satz.id, ref: radarRef });
  if (radarSatz) radarSatzNeu = satz; else radarSatz = satz;
  radarLaden();
}

function radarSatzWeg(satz) {
  for (const tex of satz.bilder.values()) radarTexWeg(tex);
  for (const f of satz.fluesse.values()) radarTexWeg(f.tex);
  satz.bilder.clear();
  satz.fluesse.clear();
  satz.modell.clear();
  if (satz === radarSatz) radarSatz = null;
  if (satz === radarSatzNeu) radarSatzNeu = null;
}

function radarZeiten() {
  const z = [];
  if (radarRef != null) for (let m = -RADAR_ZURUECK; m <= RADAR_VOR; m += 5) z.push(radarRef + m * 60000);
  return z;
}

/** Die vollen Stunden des Modells hinter dem Radar, bis MODELL_VOR. */
function modellZeiten() {
  const z = [];
  if (radarRef == null || !radarModell) return z;
  const ende = Math.min(radarModell.lauf + MODELL_REICHWEITE, radarRef + MODELL_VOR * 60000);
  for (let t = Math.floor((radarRef + RADAR_VOR * 60000) / STUNDE) * STUNDE + STUNDE; t <= ende; t += STUNDE) z.push(t);
  return z;
}

const alleZeiten = () => [...radarZeiten(), ...modellZeiten()];

/** Wie weit der Regler reicht, in Minuten nach der letzten Messung. */
function radarEnde() {
  const m = modellZeiten();
  return m.length ? Math.round((m[m.length - 1] - radarRef) / 60000) : RADAR_VOR;
}

/* Regler: −60 … 120 sind Minuten, dahinter MODELL_BREITE Einheiten für die
 * Stunden des Modells — sonst wäre das Radar auf zwei Tagen ein schmaler Rand. */
function radarPosZuVersatz(p) {
  const ende = radarEnde();
  if (p <= RADAR_VOR || ende <= RADAR_VOR) return Math.min(p, ende);
  return RADAR_VOR + (p - RADAR_VOR) / MODELL_BREITE * (ende - RADAR_VOR);
}
function radarVersatzZuPos(v) {
  const ende = radarEnde();
  if (v <= RADAR_VOR || ende <= RADAR_VOR) return v;
  return RADAR_VOR + (v - RADAR_VOR) / (ende - RADAR_VOR) * MODELL_BREITE;
}

/** Das Paar um einen Zeitpunkt: früheres und späteres Bild, Anteil des späteren.
 *  Im Radar fünf Minuten auseinander, im Modell eine Stunde. */
function radarPaar(versatz = radarVersatz) {
  const zeiten = alleZeiten(), t = radarRef + versatz * 60000;
  let i = 0;
  while (i < zeiten.length - 1 && zeiten[i + 1] <= t) i++;
  const t0 = zeiten[i], t1 = zeiten[Math.min(i + 1, zeiten.length - 1)];
  return { t0, t1, f: t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0 };
}

function radarSatzTraegt(satz, versatz = radarVersatz) {
  if (!satz || radarRef == null) return false;
  const { t0, t1, f } = radarPaar(versatz);
  return satz.bilder.has(t0) && (f < 1e-3 || satz.bilder.has(t1));
}

/** Alles geladen, was zu holen geht — erst dann läuft das Abspielen. */
function radarSatzFertig(satz) {
  return !!satz && alleZeiten().every(t => satz.bilder.has(t) || (satz.fehler.get(t) || 0) >= RADAR_VERSUCHE);
}

/** Fehlende Zeitpunkte holen, die um den Regler zuerst. */
function radarLaden() {
  const satz = radarSatzNeu || radarSatz;
  if (!satz || radarRef == null) return;
  const jetzt = radarRef + radarVersatz * 60000;
  const modell = new Set(modellZeiten());
  // Das Modell wird auf das Raster des Radars gerechnet: erst, wenn das erste Radarbild es kennt
  const fehlt = alleZeiten()
    .filter(t => !satz.bilder.has(t) && !satz.offen.has(t) && (satz.fehler.get(t) || 0) < RADAR_VERSUCHE &&
      (!modell.has(t) || satz.geo))
    .sort((a, b) => Math.abs(a - jetzt) - Math.abs(b - jetzt));
  while (satz.offen.size < RADAR_GLEICHZEITIG && fehlt.length) radarBildHolen(satz, fehlt.shift());
}

/* Vorhersagen immer mit ihrem Lauf (REFERENCE_TIME). Ohne ihn wählt der WCS
 * unter den Läufen, die den Zeitpunkt abdecken, je nach Ausschnitt einen
 * anderen: Am 13.10.2026 kam für 13:20 bei einem Ausschnitt der neueste Lauf,
 * beim nächsten einer von vor einer Stunde — das Regenband sprang nach dem
 * Verschieben 22 km nach Osten. Messungen sind eindeutig, dort ohne. */
function radarUrl(satz, t, ref) {
  const b = satz.bereich;
  return `${RADAR_WCS}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=dwd__Niederschlagsradar` +
    `&format=image/tiff&geotiff:compression=Deflate&subsettingCrs=${RADAR_CRS}&outputCrs=${RADAR_CRS}` +
    `&subset=X(${b.x0},${b.x1})&subset=Y(${b.y0},${b.y1})&subset=time("${radarIso(t)}")` +
    (t > ref ? `&subset=REFERENCE_TIME("${radarIso(ref)}")` : '') +
    (satz.groesse ? `&scalesize=i(${satz.groesse[0]}),j(${satz.groesse[1]})` : '');
}

/* Bis der Worker das Bild zurückgibt, bleibt es in offen. Vorhersagen ohne
 * Zwischenspeicher: Dieselbe Adresse liefert mit jedem Lauf ein anderes Bild. */
function modellUrl(satz, t, lauf) {
  const b = satz.bereich, sw = radarLatLng(b.x0, b.y0), ne = radarLatLng(b.x1, b.y1);
  const rand = 0.15;      // gut zwei Zellen, damit bilinear auch am Rand Nachbarn hat
  return `${RADAR_WCS}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${MODELL_ID}` +
    `&format=image/tiff&geotiff:compression=Deflate` +
    `&subset=Lat(${(sw.lat - rand).toFixed(3)},${(ne.lat + rand).toFixed(3)})` +
    `&subset=Long(${(sw.lng - rand).toFixed(3)},${(ne.lng + rand).toFixed(3)})` +
    `&subset=time("${radarIso(t)}")&subset=REFERENCE_TIME("${radarIso(lauf)}")`;
}

async function modellBildHolen(satz, t) {
  satz.offen.add(t);
  const lauf = radarModell.lauf, geo = satz.geo;
  try {
    const r = await fetch(modellUrl(satz, t, lauf), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (!/tiff/.test(r.headers.get('content-type') || '')) throw new Error('keine TIFF-Antwort');
    const puffer = await r.arrayBuffer();
    if (satz !== radarSatz && satz !== radarSatzNeu) return;
    radarWerkHolen().postMessage({ art: 'modell', satz: satz.id, t, ref: radarRef, lauf, geo, puffer }, [puffer]);
  } catch (err) {
    radarBildFehlt(satz, t, err);
  }
}

async function radarBildHolen(satz, t) {
  if (t > radarRef + RADAR_VOR * 60000) return modellBildHolen(satz, t);
  satz.offen.add(t);
  const ref = radarRef;
  try {
    const r = await fetch(radarUrl(satz, t, ref), { cache: t > ref ? 'no-store' : 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (!/tiff/.test(r.headers.get('content-type') || '')) throw new Error('keine TIFF-Antwort');
    const puffer = await r.arrayBuffer();
    if (satz !== radarSatz && satz !== radarSatzNeu) return;
    radarWerkHolen().postMessage({ art: 'bild', satz: satz.id, t, ref, puffer }, [puffer]);
  } catch (err) {
    radarBildFehlt(satz, t, err);
  }
}

function radarBildFehlt(satz, t, err) {
  satz.offen.delete(t);
  satz.fehler.set(t, (satz.fehler.get(t) || 0) + 1);
  console.warn('Regenradar', radarIso(t), err);
  // Meist klappt die nächste Anfrage gleich (anderer Server), erst danach länger warten
  setTimeout(radarLaden, satz.fehler.get(t) < 3 ? 400 : 2000);
  radarLeisteWerte();
}

function radarWerkHolen() {
  if (!radarWerk) {
    radarWerk = new Worker('radar-werk.js', { type: 'module' });
    radarWerk.onmessage = e => radarWerkAntwort(e.data);
    radarWerk.onerror = e => console.warn('Regenradar, Worker:', e.message || e);
  }
  return radarWerk;
}

function radarWerkAntwort(m) {
  const satz = [radarSatz, radarSatzNeu].find(s => s && s.id === m.satz);
  if (!satz) return;
  if (m.art === 'fehler') { radarBildFehlt(satz, m.t, m.text); return; }

  if (m.art === 'bild') {
    satz.offen.delete(m.t);
    // Eine Vorhersage aus einem Lauf, den es nicht mehr gibt
    if (m.modell ? !radarModell || m.lauf !== radarModell.lauf : m.t > m.ref && m.ref !== radarRef) return;
    if (!(m.modell ? modellZeiten() : radarZeiten()).includes(m.t)) return;
    const geo = { w: m.w, h: m.h, x0: m.x0, yOben: m.yOben, dx: m.dx, dy: m.dy };
    if (!satz.geo) satz.geo = geo;
    else if (geo.w !== satz.geo.w || geo.h !== satz.geo.h || Math.abs(geo.x0 - satz.geo.x0) > 1 || Math.abs(geo.yOben - satz.geo.yOben) > 1) {
      console.warn('Regenradar: Raster passt nicht zum Ausschnitt', radarIso(m.t), geo, satz.geo);
      return;
    }
    const tex = radarTextur(m.w, m.h, false, m.werte);
    if (!tex) return;
    radarTexWeg(satz.bilder.get(m.t));
    satz.bilder.set(m.t, tex);
    if (m.modell) satz.modell.add(m.t); else satz.modell.delete(m.t);
    /* Beim Abspielen erst wechseln, wenn der neue Ausschnitt ganz da ist: Bis
     * dahin steht das Abspielen (radarSpielSchritt), statt mit halben Bildern
     * weiterzulaufen. */
    if (satz === radarSatzNeu && radarSatzTraegt(satz) && (!radarSpielt || radarSatzFertig(satz))) {
      radarSatzWeg(radarSatz);
      radarSatz = satz;
      radarSatzNeu = null;
    }
    radarLaden();
  } else if (m.art === 'fluss') {
    const tex = radarTextur(m.fw, m.fh, true, m.fluss);
    if (!tex) return;
    const alt = satz.fluesse.get(m.t);
    if (alt) radarTexWeg(alt.tex);
    satz.fluesse.set(m.t, { tex, fw: m.fw, fh: m.fh, s: m.s });
  }
  if (satz === radarSatz) radarZeichnen();
  radarLeisteWerte();
}

/* -- Zeichnen -- */

function radarZeichnen() {
  if (radarZeichnenOffen) return;
  radarZeichnenOffen = true;
  requestAnimationFrame(() => { radarZeichnenOffen = false; radarZeichnenJetzt(); });
}

/* Zwischen zwei Bildern mit ihrer Bewegung. Fehlt die noch, wird überblendet;
 * fehlt eines der Bilder, steht das nächste geladene da. */
function radarZeichnenJetzt() {
  const g = radarGl, schicht = radarSchicht, r = schicht && schicht._rahmen;
  if (!g || !r) return;
  const gl = g.gl, el = schicht._el;
  gl.viewport(0, 0, el.width, el.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const satz = radarSatz;
  if (!satz || !satz.geo || radarRef == null) return;

  let { t0, t1, f } = radarPaar();
  // Bewegung gibt es nur zwischen zwei Radarbildern im Fünfminutenabstand
  let a = satz.bilder.get(t0), b = satz.bilder.get(t1), fl = t1 - t0 === RADAR_SCHRITT ? satz.fluesse.get(t0) : null;
  if (a && f < 1e-3) {
    b = a; f = 0; fl = null;
  } else if (!a || !b) {
    const jetzt = radarRef + radarVersatz * 60000;
    let naechst = null, abstand = Infinity;
    for (const [t, tex] of satz.bilder) {
      if (Math.abs(t - jetzt) < abstand) { abstand = Math.abs(t - jetzt); naechst = tex; }
    }
    if (!naechst) return;
    a = b = naechst; f = 0; fl = null;
  }

  const geo = satz.geo, o = g.ort;
  gl.uniform2f(o.uGs, (r.m.x1 - r.m.x0) / geo.dx, (r.m.y1 - r.m.y0) / geo.dy);
  gl.uniform2f(o.uGo, (r.m.x0 - geo.x0) / geo.dx, (geo.yOben - r.m.y1) / geo.dy);
  gl.uniform2f(o.uN, geo.w, geo.h);
  gl.uniform1f(o.uT, f);
  gl.uniform1f(o.uMitFluss, fl ? 1 : 0);
  gl.uniform1f(o.uBreite, r.pr);
  gl.uniform1f(o.uLinieTon, RADAR_GRUND_DUNKEL.has(prefs.base) ? 1 : RADAR_LINIE_TON);
  if (fl) { gl.uniform2f(o.uFn, fl.fw, fl.fh); gl.uniform1f(o.uS, fl.s); }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fl ? fl.tex : g.ohneFluss);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** Die letzte Messung beim Dienst erfragen. Liefert true, wenn sie neu ist. */
/* Hinter maps.dwd.de steht (gemessen 01.11.2026) ein Server, der am 28.10.
 * stehen geblieben ist und etwa jede zweite Anfrage beantwortet: Seine letzte
 * Messung ist Tage alt, Bilder dazu gibt es nirgends mehr. Übernahm die App
 * diesen Stand, scheiterten alle Bilder („nicht erreichbar"), oder der Stand
 * sprang bei jeder Nachfrage hin und her und alles lud neu. Deshalb gilt nur
 * eine Messung, die höchstens RADAR_REF_ALT alt ist und nicht hinter die
 * bisherige zurückfällt — sonst gleich noch einmal fragen. */
const RADAR_REF_ALT = 30 * 60000;
const RADAR_REF_VERSUCHE = 6;

async function radarRefHolen() {
  try {
    let t = 0;
    for (let i = 0; i < RADAR_REF_VERSUCHE && !t; i++) {
      const r = await fetch(RADAR_CAPS, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const m = /name="REFERENCE_TIME"[^>]*default="([^"]+)"/.exec(await r.text());
      const kandidat = m && Date.parse(m[1]);
      if (!kandidat) throw new Error('keine Zeitangabe');
      if (Date.now() - kandidat <= RADAR_REF_ALT && (radarRef == null || kandidat >= radarRef)) t = kandidat;
    }
    if (!t) throw new Error('nur veraltete Zeitachse vom Dienst');
    radarRefGeholt = Date.now();
    const neu = t !== radarRef;
    /* Rückt die letzte Messung weiter, bleibt ein gewählter Zeitpunkt stehen,
     * wo er war — nur „jetzt" geht mit. */
    if (neu && radarRef != null && radarVersatz !== 0) {
      radarVersatz = Math.max(-RADAR_ZURUECK, radarVersatz - Math.round((t - radarRef) / 60000));
    }
    radarRef = t;
    return neu;
  } catch (err) {
    console.warn('Regenradar:', err);
    return false;
  }
}

/** Den neuesten Lauf von ICON-EU erfragen — mit derselben Vorsicht wie beim
 *  Radar: Der stehengebliebene Server meldet den Lauf vom 28.10. Läufe gibt es
 *  alle 6 h, gut 4 h später sind sie da; älter als einen Tag heißt veraltet. */
async function modellLaufHolen() {
  try {
    let lauf = 0;
    for (let i = 0; i < RADAR_REF_VERSUCHE && !lauf; i++) {
      const r = await fetch(MODELL_CAPS, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const m = /name="REFERENCE_TIME"[^>]*default="([^"]+)"/.exec(await r.text());
      const k = m && Date.parse(m[1]);
      if (k && Date.now() - k <= 24 * STUNDE && (!radarModell || k >= radarModell.lauf)) lauf = k;
    }
    if (!lauf) throw new Error('nur veraltete Läufe vom Dienst');
    const neu = !radarModell || radarModell.lauf !== lauf;
    radarModell = { lauf, geholt: Date.now() };
    if (neu) {
      // Stunden eines alten Laufs verwerfen
      for (const satz of [radarSatz, radarSatzNeu]) {
        if (!satz) continue;
        for (const t of satz.modell) { radarTexWeg(satz.bilder.get(t)); satz.bilder.delete(t); satz.fehler.delete(t); }
        satz.modell.clear();
      }
      radarLaden();
      radarZeichnen();
    }
    radarLeisteWerte();
  } catch (err) {
    console.warn('Regenradar, Modell:', err);
    if (radarModell) radarModell.geholt = Date.now();     // nicht jede Minute neu versuchen
  }
}

/** Auflage an oder aus, wie prefs.radar es sagt. */
function radarSetzen() {
  const an = auflageGewaehlt('radar');
  const leiste = $('#radar');
  if (!an) {
    radarSpielen(false);
    clearInterval(radarFrischTimer);
    if (radarSchicht && map.hasLayer(radarSchicht)) map.removeLayer(radarSchicht);
    for (const s of [radarSatz, radarSatzNeu]) if (s) radarSatzWeg(s);
    if (radarWerk) radarWerk.postMessage({ art: 'satz', satz: -1 });
    if (leiste) leiste.hidden = true;
    return;
  }
  if (leiste) leiste.hidden = false;
  radarLeisteWerte();
  clearInterval(radarFrischTimer);
  radarFrischTimer = setInterval(radarFrisch, 60000);
  if ((radarSchicht && map.hasLayer(radarSchicht)) || radarHolt) return;

  /* Die Ebene erst anlegen, wenn die Zeitachse da ist: Ohne sie weiß die App
   * nicht, welche Zeitpunkte es gibt. Ist der Dienst nicht zu erreichen, versucht
   * es radarFrisch jede Minute wieder. */
  radarHolt = true;
  radarLeisteWerte();
  if (!radarModell || Date.now() - radarModell.geholt > MODELL_FRISCH) modellLaufHolen();
  radarRefHolen().then(() => {
    radarHolt = false;
    if (!auflageGewaehlt('radar') || (radarSchicht && map.hasLayer(radarSchicht))) return;
    if (radarRef != null) {
      if (!radarSchicht) radarSchicht = new RadarSchicht();
      radarSchicht.addTo(map);
      ordneAuflagen();
    }
    radarLeisteWerte();
  });
}

/* Jede Minute nachsehen, ob es eine neue Messung gibt — aber nur, wenn die
 * letzte Nachfrage fünf Minuten her ist und die App gerade zu sehen ist. */
async function radarFrisch() {
  if (document.hidden || radarSpielt) return;
  if (!radarSchicht || !map.hasLayer(radarSchicht)) {
    if (auflageGewaehlt('radar') && !radarHolt) radarSetzen();
    return;
  }
  if (!radarModell || Date.now() - radarModell.geholt > MODELL_FRISCH) modellLaufHolen();
  if (Date.now() - radarRefGeholt < RADAR_FRISCH) return;
  const alt = radarRef;
  if (await radarRefHolen()) radarAchseNeu(alt);
}

/* Eine neue Messung ist da. Messungen bis zur alten bleiben, alles danach war
 * Vorhersage des alten Laufs und wird neu geholt — auch die Bewegung an der
 * Nahtstelle. Was vorn aus der Stunde fällt, kommt weg. */
function radarAchseNeu(alt) {
  const zeiten = new Set(radarZeiten()), modell = new Set(modellZeiten());
  const ziel = radarSatzNeu || radarSatz;
  for (const satz of [radarSatz, radarSatzNeu]) {
    if (!satz) continue;
    const weg = [];
    for (const [t, tex] of satz.bilder) {
      /* Bleiben: Messungen bis zur alten und Modellstunden, die noch Modell sind —
       * die hängen am Lauf des Modells, nicht an der Messung. */
      const bleibt = satz.modell.has(t) ? modell.has(t) : zeiten.has(t) && t <= alt;
      if (!bleibt) { weg.push(t); radarTexWeg(tex); satz.bilder.delete(t); satz.modell.delete(t); }
    }
    for (const [t, f] of satz.fluesse) {
      if (t >= alt || !zeiten.has(t)) { radarTexWeg(f.tex); satz.fluesse.delete(t); }
    }
    for (const t of [...satz.offen]) if (t > alt && !modell.has(t)) satz.offen.delete(t);
    satz.fehler.clear();
    if (satz === ziel && radarWerk) radarWerk.postMessage({ art: 'weg', satz: satz.id, zeiten: weg, ref: radarRef });
  }
  radarLaden();
  radarZeichnen();
  radarLeisteWerte();
}

function radarSpielen(an) {
  radarSpielt = !!an;
  const btn = $('#radarSpiel');
  if (btn) {
    btn.classList.toggle('is-on', radarSpielt);
    btn.setAttribute('aria-pressed', String(radarSpielt));
    btn.setAttribute('aria-label', radarSpielt ? 'Anhalten' : 'Abspielen');
  }
  if (!radarSpielt) return;
  if (radarVersatz >= radarEnde()) radarVersatz = -RADAR_ZURUECK;
  radarHaltRest = 0;
  radarSpielZeit = performance.now();
  requestAnimationFrame(radarSpielSchritt);
}

/* Abspielen gleitet, im Radar RADAR_TEMPO, im Modell MODELL_TEMPO Minuten je
 * Sekunde, von der ersten Messung bis zum Ende der Vorhersage; dort kurz stehen
 * und von vorn. Es steht, solange noch geladen wird — beim ersten Start und
 * nach dem Zoomen (neuer Ausschnitt): Vorher lief die Uhr mit dem alten,
 * zu kleinen Ausschnitt weiter und wartete dann Bild für Bild. */
function radarSpielSchritt(jetzt) {
  if (!radarSpielt) return;
  const dt = Math.min(100, jetzt - radarSpielZeit);
  radarSpielZeit = jetzt;
  const ende = radarEnde();
  // Ist der neue Ausschnitt fertig, auch wenn das letzte Bild ein Fehlschlag war: jetzt wechseln
  if (radarSatzNeu && radarSatzFertig(radarSatzNeu) && radarSatzTraegt(radarSatzNeu)) {
    radarSatzWeg(radarSatz);
    radarSatz = radarSatzNeu;
    radarSatzNeu = null;
  }
  if (radarSatzNeu || !radarSatzFertig(radarSatz)) {
    // warten
  } else if (radarHaltRest > 0) {
    radarHaltRest -= dt;
    if (radarHaltRest <= 0) {
      if (radarSatzTraegt(radarSatz, -RADAR_ZURUECK)) radarVersatz = -RADAR_ZURUECK;
      else radarHaltRest = 1;
    }
  } else if (radarVersatz >= ende) {
    radarHaltRest = RADAR_HALT;
  } else {
    const tempo = radarVersatz >= RADAR_VOR ? MODELL_TEMPO : RADAR_TEMPO;
    const weiter = Math.min(ende, radarVersatz + dt * tempo / 1000);
    if (radarSatzTraegt(radarSatz, weiter)) radarVersatz = weiter;
  }
  radarLeisteWerte();
  radarZeichnenJetzt();
  requestAnimationFrame(radarSpielSchritt);
}

const radarTag = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
let radarMarkenAlt = '';

/** Beschriftung unter dem Regler: wo Messung, Radar und Modell beginnen. */
function radarMarken(breite) {
  const box = $('#radarMarken');
  if (!box) return;
  const ende = radarEnde();
  const marken = [[-RADAR_ZURUECK, '−1 h'], [0, 'jetzt'], [RADAR_VOR, '+2 h']];
  if (ende > RADAR_VOR) marken.push([ende, `+${Math.round(ende / 60)} h`]);
  const html = marken.map(([v, text], i) => {
    const a = (radarVersatzZuPos(v) + RADAR_ZURUECK) / breite;
    const art = i === 0 ? 'anfang' : i === marken.length - 1 && ende > RADAR_VOR ? 'ende' : '';
    return `<span class="${art}" style="--a:${a.toFixed(4)}">${text}</span>`;
  }).join('');
  if (html !== radarMarkenAlt) { box.innerHTML = html; radarMarkenAlt = html; }
}

function radarLeisteWerte() {
  const zeit = $('#radarZeit'), text = $('#radarText');
  if (zeit) {
    /* Reglerlänge und die Teile der Leiste (Messung, Radarvorhersage, Modell)
     * nach dem, was es gibt; das CSS liest die Anteile. */
    const max = radarVersatzZuPos(radarEnde());
    if (zeit.max !== String(max)) zeit.max = String(max);
    const breite = max + RADAR_ZURUECK;
    zeit.style.setProperty('--a-jetzt', (RADAR_ZURUECK / breite).toFixed(4));
    zeit.style.setProperty('--a-modell', ((RADAR_ZURUECK + RADAR_VOR) / breite).toFixed(4));
    if (document.activeElement !== zeit) zeit.value = String(radarVersatzZuPos(radarVersatz));
    radarMarken(breite);
  }
  if (!text) return;
  let html, vorhersage = false, laedt = false;
  if (radarKaputt) {
    html = `<b>—</b><small>${esc(radarKaputt)}</small>`;
  } else if (radarRef == null) {
    html = radarHolt ? '<b>—</b><small>lädt …</small>' : '<b>—</b><small>nicht erreichbar</small>';
  } else {
    /* Die Uhr auf fünf Minuten wie in WarnWetter: Das Bild gleitet, die Anzeige
     * springt von Messung zu Messung. */
    const imModell = radarVersatz > RADAR_VOR;
    // Im Modell auf die volle Stunde, mit Wochentag, sobald es nicht mehr heute ist
    const uhrzeit = imModell ? Math.round((radarRef + radarVersatz * 60000) / STUNDE) * STUNDE
      : radarRef + Math.round(radarVersatz / 5) * 5 * 60000;
    const stufe = Math.round((uhrzeit - radarRef) / 60000);
    let art = imModell ? 'Modell ICON-EU' : stufe > 0 ? 'Vorhersage' : stufe === 0 ? 'letzte Messung' : 'Messung';
    const satz = radarSatzNeu || radarSatz;
    if (!satz) art = 'lädt …';      // noch kein Ausschnitt angefragt
    else {
      const zeiten = alleZeiten(), da = zeiten.filter(t => satz.bilder.has(t)).length;
      const aufgegeben = zeiten.every(t => satz.bilder.has(t) || (satz.fehler.get(t) || 0) >= RADAR_VERSUCHE);
      if (da === 0 && aufgegeben) art = 'nicht erreichbar';
      else if (da < zeiten.length && !aufgegeben) art = `lädt ${Math.round(da / zeiten.length * 100)} %`;
    }
    const tag = new Date(uhrzeit).toDateString() !== new Date().toDateString() ? radarTag.format(uhrzeit).replace('.', '') + ' ' : '';
    html = `<b>${esc(tag + radarUhr.format(uhrzeit))}</b><small>${art}</small>`;
    vorhersage = stufe > 0;
    laedt = !radarSatzTraegt(radarSatz);
  }
  if (html !== radarTextAlt) { text.innerHTML = html; radarTextAlt = html; }
  text.classList.toggle('vorhersage', vorhersage);
  text.classList.toggle('laedt', laedt);
}

function radarLegende() {
  const box = $('#radarLegende');
  if (!box) return;
  const n = RADAR_STUFEN.length;
  // Beschriftet nur jede zweite bis dritte Stufe, linksbündig an ihrem Anfang: „ab 0,1"
  const zeigen = new Set([0.1, 1, 5, 15, 45, 150]);
  box.innerHTML = `<div class="radar-skala">` +
    `<div class="radar-stufen">${RADAR_STUFEN.map(([f]) => `<i style="--f:${f}"></i>`).join('')}</div>` +
    `<div class="radar-werte">${RADAR_STUFEN.map(([, v], i) => zeigen.has(v)
      ? `<span style="left:${(i / n * 100).toFixed(3)}%">${String(v).replace('.', ',')}</span>` : '').join('')}</div>` +
    `</div><span class="radar-einheit">mm/h</span>`;
}

function radarBinden() {
  radarLegende();
  const zeit = $('#radarZeit');
  if (zeit) {
    // Stufenlos: Das Bild folgt dem Finger, auch zwischen den Fünfminutenmarken
    zeit.addEventListener('input', () => {
      radarSpielen(false);
      radarVersatz = Math.max(-RADAR_ZURUECK, Math.min(radarEnde(), radarPosZuVersatz(Number(zeit.value))));
      radarLeisteWerte();
      radarZeichnen();
      radarLaden();      // zuerst holen, was um die neue Stelle liegt
    });
  }
  on('#radarSpiel', 'click', () => radarSpielen(!radarSpielt));
  on('#radarZu', 'click', () => { if (auflageGewaehlt('radar')) toggleOverlay('radar'); });
  // Zurück aus dem Hintergrund: gleich nachsehen statt bis zur nächsten vollen Minute
  document.addEventListener('visibilitychange', () => { if (!document.hidden) radarFrisch(); });
}

/* -------- Eigene KML-Dateien -------- */

/* Warum IndexedDB und nicht localStorage: Ein KML mit einigen tausend Objekten
 * sprengt die rund 5 MB, die localStorage zugesteht. Abgelegt wird die schon
 * ausgewertete Geometrie statt des XML — beim Start ist dann nichts mehr zu
 * parsen. Kopfdaten und Geometrie liegen getrennt, damit das Ein- und
 * Ausschalten nur ein paar Byte schreibt und nicht die ganze Datei.
 *
 * Die Dateien bleiben auf dem Gerät, es wird nichts hochgeladen. */

const KML_DB = 'topovo-kml';
/* Bis zu den Umbenennungen hieß die Datenbank anders (TrackPilot bis November
 * 2026, Railnav bis 15.09.2026). Sie hängt am Origin und enthält die vom Nutzer
 * importierten Dateien — deshalb wird sie beim ersten Start einmalig
 * herüberkopiert und danach gelöscht, statt sie verwaisen zu lassen. Ein Name
 * darf erst verschwinden, wenn kein Gerät mehr eine Fassung von davor hat. */
const KML_DBS_ALT = ['trackpilot-kml', 'railnav-kml'];
/* Reihum vergeben, damit sich mehrere Dateien ohne eigene Farbangabe
 * voneinander unterscheiden. */
const KML_FARBEN = ['#e6484b', '#f59e0b', '#22c55e', '#4b93e6', '#a855f7', '#14b8a6', '#ec4899', '#84cc16'];
const KML_VIEL = 4000;        // ab so vielen Objekten wird vor Trägheit gewarnt

/* Namen an die Punkte schreiben lohnt erst, wenn nicht alles übereinanderliegt,
 * und muss nach oben begrenzt sein — 1000 Beschriftungen sind auf einem Handy
 * nur noch ein grauer Teppich. */
const KML_LABEL_ZOOM = 16;
const KML_LABEL_MAX = 200;

/* Auswählbare Symbole. Zehn Formen, weil eine Datei durchaus zehn Merkmalswerte
 * mitbringt — die FP-Ausgabe eines Vermessungsprogramms hat neun Marker-Typen.
 * Der einheitliche Kreis läuft über L.circleMarker, weil das auch bei einigen
 * tausend Punkten flüssig bleibt; alle anderen Formen sind SVG in einem divIcon. */
const KML_FORMEN = {
  kreis:     { name: 'Kreis',            d: '<circle cx="8" cy="8" r="5"/>' },
  quadrat:   { name: 'Quadrat',          d: '<rect x="3" y="3" width="10" height="10"/>' },
  dreieck:   { name: 'Dreieck',          d: '<path d="M8 2.4 14 13.4H2z"/>' },
  dreieckAb: { name: 'Dreieck abwärts',  d: '<path d="M8 13.6 2 2.6h12z"/>' },
  raute:     { name: 'Raute',            d: '<path d="M8 2 14 8 8 14 2 8z"/>' },
  sechseck:  { name: 'Sechseck',         d: '<path d="M8 1.8 13.4 5v6L8 14.2 2.6 11V5z"/>' },
  stern:     { name: 'Stern',            d: '<path d="M8 1.6 9.9 6 14.6 6.4 11 9.5 12.1 14.1 8 11.6 3.9 14.1 5 9.5 1.4 6.4 6.1 6z"/>' },
  kreuz:     { name: 'Kreuz',            d: '<path d="M3.6 3.6 12.4 12.4M12.4 3.6 3.6 12.4"/>', strich: true },
  plus:      { name: 'Plus',             d: '<path d="M8 2.6V13.4M2.6 8H13.4"/>', strich: true },
  ring:      { name: 'Ring',             d: '<circle cx="8" cy="8" r="4.6"/>', strich: true }
};

function kmlSymbolSvg(form, farbe, gross) {
  const r = gross ? 16 : 14;
  /* Die Farbe kommt aus der IndexedDB, und die teilt Topovo mit allen Apps unter
   * github.io — geprüft wird sie beim Einlesen der KML, hier noch einmal vor dem HTML. */
  if (!/^#[0-9a-f]{3,8}$/i.test(farbe)) farbe = '#888';
  // Steht die Form nicht fest, zwei verschiedene andeuten statt eine vorzutäuschen
  if (form === 'auto') {
    return `<svg viewBox="0 0 16 16" width="${r}" height="${r}" aria-hidden="true">` +
      `<g fill="${farbe}" stroke="#fff" stroke-width="1.6" paint-order="stroke">` +
      `<circle cx="5" cy="5" r="3.4"/><rect x="7.8" y="7.8" width="6.6" height="6.6"/></g></svg>`;
  }
  const f = KML_FORMEN[form] || KML_FORMEN.kreis;
  /* Weiß außen herum, damit die Form auf Luftbild und Bahnplan gleich gut sitzt.
   * Strichformen brauchen dafür zwei Durchgänge — bei ihnen ist die Farbe der
   * Strich und nicht die Füllung. */
  const koerper = f.strich
    ? `<g fill="none" stroke-linecap="round"><g stroke="#fff" stroke-width="4.4">${f.d}</g>` +
      `<g stroke="${farbe}" stroke-width="2.4">${f.d}</g></g>`
    : `<g fill="${farbe}" stroke="#fff" stroke-width="2" paint-order="stroke">${f.d}</g>`;
  return `<svg viewBox="0 0 16 16" width="${r}" height="${r}" aria-hidden="true">${koerper}</svg>`;
}

/* -------- Merkmale der Objekte -------- */

/** Wert eines Merkmals, etwa "Marker type" → "3". */
function kmlWert(o, feld) {
  for (const [k, v] of (o.daten || [])) if (k === feld) return v;
  return null;
}

/** Welche Merkmale tragen die Objekte dieser Datei, und wie viele Werte je Merkmal? */
function kmlFelder(akte) {
  const gefunden = new Map();
  for (const o of akte.objekte) {
    for (const [k] of (o.daten || [])) {
      if (!gefunden.has(k)) gefunden.set(k, new Set());
    }
  }
  for (const o of akte.objekte) {
    for (const [k, v] of (o.daten || [])) {
      const menge = gefunden.get(k);
      if (menge.size < 60) menge.add(v);
    }
  }
  return [...gefunden].map(([key, m]) => ({ key, werte: m.size }));
}

/* Welches Merkmal taugt zum Unterscheiden? Es braucht mindestens zwei und
 * höchstens so viele Werte, wie es Formen gibt.
 *
 * "Code" geht vor: Das ist in den Ausgaben der Vermessungsprogramme die
 * fachliche Einordnung des Punktes (GVPV, PS0 bis PS3), während "Marker type"
 * nur die Zeichensymbolnummer des erzeugenden Programms ist. Nach der Sache zu
 * unterscheiden ist nützlicher als nach dem Zeichensatz. */
function kmlAutoFeld(akte) {
  const formen = Object.keys(KML_FORMEN).length;
  const kandidaten = kmlFelder(akte).filter(f => f.werte >= 2 && f.werte <= formen);
  if (!kandidaten.length) return null;
  const rang = f => /code/i.test(f.key) ? 0
    : /art|kategor|klasse|gruppe/i.test(f.key) ? 1
    : /marker|typ|type|symbol/i.test(f.key) ? 2 : 3;
  kandidaten.sort((a, b) => rang(a) - rang(b) || a.werte - b.werte || a.key.localeCompare(b.key));
  return kandidaten[0].key;
}

/** Merkmalswert → Form. Zahlen numerisch sortiert, damit 2 vor 14 kommt. */
function kmlFormKarte(akte) {
  const feld = akte.autoFeld;
  if (!feld) return null;
  const werte = new Set();
  for (const o of akte.objekte) {
    const v = kmlWert(o, feld);
    if (v != null && v !== '') werte.add(v);
  }
  const formen = Object.keys(KML_FORMEN);
  const sortiert = [...werte].sort((a, b) => {
    const za = parseFloat(a), zb = parseFloat(b);
    if (isFinite(za) && isFinite(zb) && za !== zb) return za - zb;
    return String(a).localeCompare(String(b), 'de');
  });
  const karte = new Map();
  sortiert.forEach((v, i) => karte.set(v, formen[i % formen.length]));
  return karte;
}

/** Werte eines Merkmals mit ihrer Häufigkeit, numerisch sinnvoll sortiert. */
function kmlWerteMit(akte, feld) {
  if (!feld) return [];
  const zaehler = new Map();
  for (const o of akte.objekte) {
    const v = kmlWert(o, feld);
    if (v == null || v === '') continue;
    zaehler.set(v, (zaehler.get(v) || 0) + 1);
  }
  return [...zaehler].map(([wert, anzahl]) => ({ wert, anzahl })).sort((a, b) => {
    const za = parseFloat(a.wert), zb = parseFloat(b.wert);
    if (isFinite(za) && isFinite(zb) && za !== zb) return za - zb;
    return String(a.wert).localeCompare(String(b.wert), 'de');
  });
}

/* Soll dieses Objekt gezeichnet werden? Ausgeblendet wird nach Werten eines
 * Merkmals — etwa nur die Neubau-Querungen zeigen und die vorhandenen weglassen.
 * Gilt überall gleich: Zeichnen, Beschriftung, Fangen beim Messen und die Suche
 * nach dem nächsten Objekt. */
function kmlSichtbarObj(akte, o) {
  const aus = akte.ausWerte;
  if (!aus || !aus.length || !akte.autoFeld) return true;
  const v = kmlWert(o, akte.autoFeld);
  return !aus.includes(v == null ? '' : v);
}

/** Was auf der Karte neben dem Symbol steht. */
function kmlLabelText(akte, o) {
  const teile = [];
  for (const f of (akte.labelFelder || ['name'])) {
    const v = f === 'name' ? o.name : kmlWert(o, f);
    if (v) teile.push(v);
  }
  return teile.join(' · ');
}

let kmlAkten = [];                    // Kopfdaten samt Geometrie, in Ladereihenfolge
const kmlEbenen = new Map();          // id → Leaflet-Gruppe der sichtbaren Datei

/* -------- Speicher -------- */

let kmlOffen = null;
function kmlDb() {
  if (kmlOffen) return kmlOffen;
  kmlOffen = (async () => {
    const db = await kmlDbOeffnen(KML_DB);
    await kmlUmziehen(db);
    return db;
  })();
  return kmlOffen;
}

function kmlDbOeffnen(name) {
  return new Promise((ok, fehler) => {
    const rq = indexedDB.open(name, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      db.createObjectStore('akten', { keyPath: 'id' });   // klein: Name, Farbe, sichtbar
      db.createObjectStore('geo');                        // groß: die Objekte, id als Schlüssel
    };
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => fehler(rq.error || new Error('kein lokaler Speicher verfügbar'));
  });
}

/* Einmaliger Umzug aus der Datenbank unter dem alten Namen.
 *
 * Bewusst ohne indexedDB.databases(): das kennt nicht jeder Browser, und wo es
 * fehlt, wäre der alte Bestand stillschweigend weg. Die alte Datenbank wird
 * deshalb einfach geöffnet — gab es sie nicht, entsteht eine leere, die
 * gleich wieder gelöscht wird.
 *
 * Das Schreiben ist idempotent (put über dieselbe id), deshalb darf der Umzug
 * nach einem Abbruch beim nächsten Start einfach noch einmal laufen. Erst wenn
 * er ganz durch ist, wird die alte Datenbank entfernt. */
async function kmlUmziehen(neu) {
  let zahl = 0;
  for (const name of KML_DBS_ALT) {
    let alt = null;
    try {
      alt = await kmlDbOeffnen(name);
      const akten = await kmlLaden(alt);
      for (const a of akten) await kmlAblegen(a, neu);
      alt.close();
      alt = null;
      indexedDB.deleteDatabase(name);
      zahl += akten.length;
    } catch {
      /* Geht der Umzug schief, bleibt der alte Bestand liegen und der nächste
       * Start versucht es erneut — verloren ist dabei nichts. */
      if (alt) { try { alt.close(); } catch { /* egal */ } }
    }
  }
  if (zahl) toast(`${zahl} gespeicherte KML-Datei${zahl === 1 ? '' : 'en'} übernommen.`);
}

function kmlKopf(akte) {
  const kopf = { ...akte };
  delete kopf.objekte;
  return kopf;
}

async function kmlLaden(db) {
  db = db || await kmlDb();
  return new Promise((ok, fehler) => {
    const tx = db.transaction(['akten', 'geo'], 'readonly');
    const rq = tx.objectStore('akten').getAll();
    const geo = new Map();
    tx.objectStore('geo').openCursor().onsuccess = ev => {
      const c = ev.target.result;
      if (!c) return;
      geo.set(c.key, c.value);
      c.continue();
    };
    tx.oncomplete = () => ok((rq.result || [])
      .map(a => ({ ...a, objekte: geo.get(a.id) || [] }))
      .sort((a, b) => (a.angelegt || 0) - (b.angelegt || 0)));
    tx.onerror = () => fehler(tx.error);
  });
}

async function kmlAblegen(akte, db) {
  db = db || await kmlDb();
  return new Promise((ok, fehler) => {
    const tx = db.transaction(['akten', 'geo'], 'readwrite');
    tx.objectStore('akten').put(kmlKopf(akte));
    tx.objectStore('geo').put(akte.objekte, akte.id);
    tx.oncomplete = ok;
    tx.onerror = () => fehler(tx.error);
  });
}

/** Nur die Kopfdaten schreiben — beim Umschalten soll nicht die Geometrie neu durch. */
async function kmlKopfMerken(akte) {
  try {
    const db = await kmlDb();
    await new Promise((ok, fehler) => {
      const tx = db.transaction('akten', 'readwrite');
      tx.objectStore('akten').put(kmlKopf(akte));
      tx.oncomplete = ok;
      tx.onerror = () => fehler(tx.error);
    });
  } catch { /* dann gilt der Schalter nur für diese Sitzung */ }
}

async function kmlLoeschen(id) {
  const db = await kmlDb();
  return new Promise((ok, fehler) => {
    const tx = db.transaction(['akten', 'geo'], 'readwrite');
    tx.objectStore('akten').delete(id);
    tx.objectStore('geo').delete(id);
    tx.oncomplete = ok;
    tx.onerror = () => fehler(tx.error);
  });
}

/* -------- KML auswerten -------- */

/* Namensräume durchweg ignorieren: KML setzt einen Default-Namespace, an dem
 * querySelector scheitert, und gx:-Erweiterungen bringen einen zweiten mit. */
const kmlErst = (el, name) => el.getElementsByTagNameNS('*', name)[0] || null;
const kmlText = (el, name) => { const c = kmlErst(el, name); return c ? c.textContent.trim() : ''; };
const kmlKind = (el, name) => { for (const c of el.children) if (c.localName === name) return c; return null; };

/** KML-Farbe ist aabbggrr — umgedreht und mit der Deckkraft vorne. */
function kmlFarbe(roh) {
  const t = String(roh || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{8}$/i.test(t)) return null;
  return {
    farbe: ('#' + t.slice(6, 8) + t.slice(4, 6) + t.slice(2, 4)).toLowerCase(),
    deckung: parseInt(t.slice(0, 2), 16) / 255
  };
}

function kmlStil(el) {
  const s = {};
  const linie = kmlErst(el, 'LineStyle');
  if (linie) {
    const f = kmlFarbe(kmlText(linie, 'color'));
    if (f) { s.color = f.farbe; s.opacity = f.deckung; }
    const w = parseFloat(kmlText(linie, 'width'));
    if (isFinite(w) && w > 0) s.weight = Math.min(w, 10);
  }
  const flaeche = kmlErst(el, 'PolyStyle');
  if (flaeche) {
    const f = kmlFarbe(kmlText(flaeche, 'color'));
    if (f) { s.fillColor = f.farbe; s.fillOpacity = Math.min(f.deckung, 0.5); }
    if (kmlText(flaeche, 'fill') === '0') s.fill = false;
  }
  const symbol = kmlErst(el, 'IconStyle');
  if (symbol) {
    const f = kmlFarbe(kmlText(symbol, 'color'));
    // Weiß ist in Google Earth der ungefärbte Standardstift, keine Absicht
    if (f && f.farbe !== '#ffffff') s.punkt = f.farbe;
  }
  return s;
}

/** "lon,lat,alt lon,lat,alt …" → [[lat, lon], …] */
function kmlKoord(roh) {
  const raus = [];
  for (const tupel of String(roh || '').trim().split(/\s+/)) {
    const t = tupel.split(',');
    const lon = parseFloat(t[0]), lat = parseFloat(t[1]);
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) raus.push([lat, lon]);
  }
  return raus;
}

function kmlGeo(el, raus) {
  switch (el.localName) {
    case 'Point': {
      const c = kmlKoord(kmlText(el, 'coordinates'));
      if (c.length) raus.push({ art: 'p', koord: c[0] });
      break;
    }
    case 'LineString': case 'LinearRing': {
      const c = kmlKoord(kmlText(el, 'coordinates'));
      if (c.length > 1) raus.push({ art: 'l', koord: c });
      break;
    }
    case 'Polygon': {
      // Der äußere Ring steht in KML zuerst, danach folgen die Löcher
      const ringe = [];
      for (const r of el.getElementsByTagNameNS('*', 'LinearRing')) {
        const c = kmlKoord(kmlText(r, 'coordinates'));
        if (c.length > 2) ringe.push(c);
      }
      if (ringe.length) raus.push({ art: 'a', koord: ringe });
      break;
    }
    case 'Track': {           // gx:Track — Aufzeichnung, Koordinaten mit Leerzeichen getrennt
      const c = [];
      for (const g of el.getElementsByTagNameNS('*', 'coord')) {
        const t = g.textContent.trim().split(/\s+/);
        const lon = parseFloat(t[0]), lat = parseFloat(t[1]);
        if (isFinite(lat) && isFinite(lon)) c.push([lat, lon]);
      }
      if (c.length > 1) raus.push({ art: 'l', koord: c });
      break;
    }
    case 'MultiGeometry': case 'MultiTrack':
      for (const ch of el.children) kmlGeo(ch, raus);
      break;
  }
}

/* Beschreibungen enthalten oft ganze HTML-Tabellen. Übernommen wird nur der
 * Text — über DOMParser, damit nichts davon ausgeführt oder nachgeladen wird. */
function kmlKlartext(roh) {
  let t = String(roh || '').trim();
  // Manche Ausgabeprogramme schreiben die CDATA-Klammer selbst noch escaped in
  // den Text hinein; als HTML gelesen verschluckt sie sonst die erste Zeile.
  t = t.replace(/^<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
  if (!t) return '';
  if (!/[<&]/.test(t)) return t;

  /* Zeilenwechsel des HTML erhalten. textContent kennt kein <br>, sonst liefen
   * ganze Beschreibungsblöcke zu einer einzigen Zeile zusammen — unlesbar, und
   * die Merkmale "Schlüssel: Wert" darin wären nicht mehr zu erkennen. */
  t = t.replace(/<br\s*\/?>/gi, '\n')
       .replace(/<\/(p|div|tr|li|h[1-6])\s*>/gi, '\n');

  const d = new DOMParser().parseFromString(t, 'text/html');
  return (d.body.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/* Viele Ausgabeprogramme schreiben ihre Merkmale als Text in die Beschreibung,
 * etwa "Code: PS2, Marker type: 0". Solche Zeilen werden zu Merkmalen, damit man
 * danach Symbole und Beschriftung wählen kann. Bewusst streng: Nur wenn eine
 * Zeile vollständig aus "Schlüssel: Wert"-Stücken besteht, wird sie zerlegt —
 * sonst bliebe von einem Fließtext ein Trümmerfeld übrig. */
function kmlPaareAusText(text) {
  const paare = [], rest = [];
  for (const zeile of String(text || '').split('\n')) {
    if (!zeile.trim()) continue;
    // Am Komma nur trennen, wenn danach wieder ein Schlüssel mit Doppelpunkt folgt
    const stuecke = zeile.split(/,\s+(?=[^,:]{1,30}:\s)/);
    const gefunden = [];
    let vollstaendig = true;
    for (const st of stuecke) {
      const m = /^\s*([^:]{1,30}?)\s*:\s*(\S.*)$/.exec(st);
      if (m) gefunden.push([m[1].trim(), m[2].trim()]);
      else { vollstaendig = false; break; }
    }
    if (vollstaendig && gefunden.length) paare.push(...gefunden);
    else rest.push(zeile);
  }
  return { paare, rest: rest.join('\n').trim() };
}

function kmlDaten(pm) {
  const raus = [];
  const ext = kmlErst(pm, 'ExtendedData');
  if (!ext) return raus;
  for (const d of ext.getElementsByTagNameNS('*', 'Data')) {
    const k = (d.getAttribute('name') || '').trim(), v = kmlText(d, 'value');
    if (k || v) raus.push([k, v]);
  }
  for (const d of ext.getElementsByTagNameNS('*', 'SimpleData')) {
    const k = (d.getAttribute('name') || '').trim(), v = d.textContent.trim();
    if (k || v) raus.push([k, v]);
  }
  return raus.slice(0, 14);
}

/** Ordnerpfad des Objekts — hilft beim Zuordnen, wenn ein KML viele Gruppen hat. */
function kmlOrdner(pm) {
  const teile = [];
  for (let p = pm.parentElement; p; p = p.parentElement) {
    if (p.localName !== 'Folder') continue;
    const n = kmlKind(p, 'name');
    if (n) teile.unshift(n.textContent.trim());
  }
  return teile.join(' › ');
}

/* Merkmale aus ExtendedData und aus der Beschreibung zusammenlegen. Manche
 * Dateien führen dieselben Felder in beidem — dann steht sonst alles doppelt in
 * der Sprechblase. Bei gleichem Schlüssel gewinnt der längere Wert: In der
 * Beschreibung steht oft die ausführlichere Fassung. */
function kmlDatenVereinen(...listen) {
  const raus = new Map();
  for (const liste of listen) {
    for (const [k, v] of liste) {
      const alt = raus.get(k);
      if (alt == null || String(v).length > String(alt).length) raus.set(k, v);
    }
  }
  return [...raus].slice(0, 20);
}

function kmlParse(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('kein lesbares KML');

  /* Stile sammeln. Eine StyleMap zeigt auf einen Style; aufgelöst wird erst
   * hinterher, weil die Reihenfolge im Dokument beliebig ist. */
  const stile = new Map();
  for (const el of doc.getElementsByTagNameNS('*', 'Style')) {
    const id = el.getAttribute('id');
    if (id) stile.set('#' + id, kmlStil(el));
  }
  for (const el of doc.getElementsByTagNameNS('*', 'StyleMap')) {
    const id = el.getAttribute('id');
    if (!id) continue;
    for (const paar of el.getElementsByTagNameNS('*', 'Pair')) {
      if (kmlText(paar, 'key') === 'highlight') continue;   // nur der Zustand unter dem Zeiger
      const ziel = kmlText(paar, 'styleUrl');
      if (ziel) stile.set('#' + id, ziel);
    }
  }
  const stilFuer = url => {
    let v = stile.get(String(url || '').trim());
    for (let i = 0; i < 4 && typeof v === 'string'; i++) v = stile.get(v);
    // Absichtlich dasselbe Objekt für alle Objekte eines Stils — spart Speicher
    return v && typeof v === 'object' ? v : null;
  };

  const objekte = [];
  let sLat = 90, wLon = 180, nLat = -90, oLon = -180;
  const merken = k => {
    if (k[0] < sLat) sLat = k[0];
    if (k[0] > nLat) nLat = k[0];
    if (k[1] < wLon) wLon = k[1];
    if (k[1] > oLon) oLon = k[1];
  };

  for (const pm of doc.getElementsByTagNameNS('*', 'Placemark')) {
    const geo = [];
    for (const ch of pm.children) kmlGeo(ch, geo);
    if (!geo.length) continue;

    const eigen = kmlKind(pm, 'Style');
    const nEl = kmlKind(pm, 'name'), dEl = kmlKind(pm, 'description');
    const beschreibung = dEl ? kmlKlartext(dEl.textContent) : '';
    const zerlegt = kmlPaareAusText(beschreibung);
    // "none" schreiben manche Programme als Platzhalter fuer "keine Beschreibung"
    if (/^(none|n\/a|-{1,3})$/i.test(zerlegt.rest)) zerlegt.rest = '';
    const gemeinsam = {
      name: nEl ? nEl.textContent.trim() : '',
      text: zerlegt.rest.slice(0, 700),
      daten: kmlDatenVereinen(kmlDaten(pm), zerlegt.paare),
      ordner: kmlOrdner(pm),
      stil: eigen ? kmlStil(eigen) : stilFuer(kmlText(pm, 'styleUrl'))
    };

    for (const g of geo) {
      if (g.art === 'p') merken(g.koord);
      else if (g.art === 'l') g.koord.forEach(merken);
      else g.koord.forEach(r => r.forEach(merken));
      objekte.push({ ...g, ...gemeinsam });
    }
  }

  const doku = kmlErst(doc, 'Document');
  const titelEl = doku && kmlKind(doku, 'name');

  return {
    objekte,
    titel: titelEl ? titelEl.textContent.trim() : '',
    grenzen: objekte.length && nLat >= sLat ? [[sLat, wLon], [nLat, oLon]] : null
  };
}

/* -------- KMZ auspacken -------- */

/* Obergrenzen gegen präparierte Dateien. Großzügig: Vermessungs-KML mit einigen
 * zehntausend Objekten liegen weit darunter. */
const KML_MAX_DATEI = 100e6;
const KML_MAX_ENTPACKT = 300e6;

/* Ein KMZ ist ein ZIP mit einer KML darin. Gelesen wird über das zentrale
 * Verzeichnis am Dateiende: Nur dort stehen die Größen verlässlich — bei
 * gestreamt geschriebenen ZIPs sind sie im lokalen Kopf null. Das Aufblasen
 * macht DecompressionStream, dafür braucht es keine Fremdbibliothek.
 *
 * Jeder Verweis wird geprüft, bevor er gelesen wird: Ein beschädigtes oder
 * abgeschnittenes Archiv gibt so eine verständliche Meldung statt eines
 * RangeError aus der Tiefe, und verschlüsselte Einträge werden ausdrücklich
 * abgewiesen statt als Datensalat entpackt. */
function kmzEintraege(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('kein lesbares KMZ');

  const anzahl = dv.getUint16(eocd + 10, true);
  const verzeichnis = dv.getUint32(eocd + 16, true);
  let p = verzeichnis;
  const raus = [];
  for (let n = 0; n < anzahl && p + 46 <= u8.length && dv.getUint32(p, true) === 0x02014b50; n++) {
    const flags = dv.getUint16(p + 8, true);
    const verfahren = dv.getUint16(p + 10, true);
    const gepackt = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const kommLen = dv.getUint16(p + 32, true);
    const lokal = dv.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen + kommLen > eocd || lokal + 30 > u8.length ||
        dv.getUint32(lokal, true) !== 0x04034b50) throw new Error('beschädigtes KMZ-Verzeichnis');
    if (flags & 1) throw new Error('verschlüsselte KMZ-Dateien werden nicht unterstützt');
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    // Der Datenbeginn steht erst im lokalen Kopf, dessen Zusatzfeld abweichen darf
    const lNameLen = dv.getUint16(lokal + 26, true), lExtraLen = dv.getUint16(lokal + 28, true);
    const start = lokal + 30 + lNameLen + lExtraLen;
    // Die Daten müssen vor dem zentralen Verzeichnis enden
    if (start + gepackt > verzeichnis) throw new Error('unvollständige KMZ-Datei');
    raus.push({ name, verfahren, daten: u8.subarray(start, start + gepackt) });
    p += 46 + nameLen + extraLen + kommLen;
  }
  if (raus.length !== anzahl) throw new Error('unvollständiges KMZ-Verzeichnis');
  return raus;
}

async function kmzText(buf) {
  const eintraege = kmzEintraege(buf);
  const kml = eintraege.find(e => /^doc\.kml$/i.test(e.name)) ||
              eintraege.find(e => /\.kml$/i.test(e.name));
  if (!kml) throw new Error('im KMZ steckt keine KML-Datei');
  if (kml.verfahren === 0) return kmlDekodieren(kml.daten.slice().buffer);
  if (kml.verfahren !== 8) throw new Error('unbekannte Packmethode im KMZ');
  if (typeof DecompressionStream !== 'function') throw new Error('dieser Browser kann KMZ nicht entpacken');
  const strom = new Blob([kml.daten]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  /* Beim Entpacken mitzählen: Eine präparierte KMZ (Zip-Bombe) bläht sich sonst
   * auf Gigabytes auf und reißt den Tab mit. */
  const teile = [];
  let summe = 0;
  const leser = strom.getReader();
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    summe += value.byteLength;
    if (summe > KML_MAX_ENTPACKT) {
      leser.cancel();
      throw new Error('entpackt größer als ' + Math.round(KML_MAX_ENTPACKT / 1e6) + ' MB');
    }
    teile.push(value);
  }
  return kmlDekodieren(await new Blob(teile).arrayBuffer());
}

/** Ältere KML kommen in ISO-8859-1 — sonst werden Umlaute zu Fragezeichen. */
function kmlDekodieren(buf) {
  const kopf = new TextDecoder('utf-8').decode(new Uint8Array(buf, 0, Math.min(200, buf.byteLength)));
  const m = /encoding=["']([\w-]+)["']/i.exec(kopf);
  const enc = (m ? m[1] : 'utf-8').toLowerCase();
  if (enc === 'utf-8' || enc === 'utf8') return new TextDecoder('utf-8').decode(buf);
  try { return new TextDecoder(enc).decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}

/* -------- Zeichnen -------- */

function kmlPopup(o, akte) {
  const zeilen = [];
  if (o.name) zeilen.push(`<b>${esc(o.name)}</b>`);
  if (o.text) zeilen.push(`<span>${esc(o.text)}</span>`);
  for (const [k, v] of (o.daten || [])) zeilen.push(`<span><i>${esc(k)}</i> ${esc(v)}</span>`);
  if (o.art === 'p') {
    zeilen.push(`<span>${fmtCoord(o.koord[0], o.koord[1])}</span>`);
    const hoehe = hoeheZeile(o.koord[0], o.koord[1]);
    if (hoehe) zeilen.push(hoehe);
  }
  const herkunft = [akte.name, o.ordner].filter(Boolean).join(' › ');
  if (herkunft) zeilen.push(`<small>${esc(herkunft)}</small>`);

  /* Leer bleibt leer: Ein Objekt ohne Namen, Text und Merkmale bekam bisher
   * keine Sprechblase, und daran ändert der Knopf nichts. */
  if (!zeilen.length) return '';
  if (o.art === 'p') zeilen.push(mapsKnopf(o.koord[0], o.koord[1]));
  zeilen.push(`<button type="button" class="kml-km" data-kmlkm>Kilometer bestimmen` +
    `<small>rechnet die Stelle auf die Strecke — braucht Netz</small></button>`);
  if (o.art === 'p') {
    zeilen.push(`<button type="button" class="kml-km" data-kmlab>Abstecken` +
      `<small>Entfernung und Richtung vom Standort hierher</small></button>`);
    zeilen.push(routeKnopf(o.koord[0], o.koord[1], o.name || ''));
  }
  return zeilen.join('');
}

function kmlEbene(akte) {
  const gruppe = L.featureGroup();
  const grund = akte.farbe || KML_FARBEN[0];
  const form = akte.symbol || 'kreis';
  const autoKarte = form === 'auto' ? kmlFormKarte(akte) : null;

  for (const o of akte.objekte) {
    if (!kmlSichtbarObj(akte, o)) continue;
    const s = o.stil || {};
    // Selbst gewählte Farbe schlägt die Angabe in der Datei — sonst hätte das
    // Auswählen bei Dateien mit eigenem Stil keine Wirkung
    const farbe = akte.farbeFest ? grund : (s.color || grund);
    const basis = {
      color: farbe,
      weight: s.weight || (o.art === 'a' ? 2 : 3),
      opacity: s.opacity == null ? 0.95 : s.opacity,
      // Ein Tipp auf ein KML-Objekt soll nicht zusätzlich die Kilometersuche auslösen
      bubblingMouseEvents: false
    };

    let l;
    if (o.art === 'p') {
      const punktFarbe = akte.farbeFest ? grund : (s.punkt || farbe);
      const punktForm = autoKarte ? (autoKarte.get(kmlWert(o, akte.autoFeld)) || 'kreis') : form;
      /* Auch der einfache Kreis läuft als Icon und nicht als circleMarker: So
       * liegen Punkt und Name in derselben Ebene ganz oben, und der Renderer,
       * der bei gedrehter Karte Ärger macht, ist für Punkte gar nicht im Spiel. */
      l = L.marker(o.koord, {
        pane: 'kmlIconPane', bubblingMouseEvents: false,
        icon: L.divIcon({ className: 'kml-sym', iconSize: [14, 14], iconAnchor: [7, 7],
          html: kmlSymbolSvg(punktForm, punktFarbe) })
      });
    } else if (o.art === 'l') {
      l = L.polyline(o.koord, basis);
    } else {
      l = L.polygon(o.koord, {
        ...basis,
        fill: s.fill !== false,
        fillColor: s.fillColor || farbe,
        fillOpacity: s.fillOpacity == null ? 0.18 : s.fillOpacity
      });
    }

    /* Sprechblase erst beim Tippen bauen: Das spart bei einer Datei mit tausend
     * Objekten tausend vorgefertigte Textbausteine, und vor allem lässt sich so
     * entscheiden, was ein Tipp bedeutet. Beim Messen und im Profil ist ein
     * KML-Objekt ein Fangpunkt und keine Auskunft. */
    l.on('click', ev => {
      L.DomEvent.stopPropagation(ev);
      const ziel = tippZiel();
      if (ziel) { ziel(ev.latlng); return; }               // Fangen erledigt das Ziel
      const html = kmlPopup(o, akte);
      if (!html) return;
      /* Bei einem Punkt gilt seine eigene Koordinate, sonst die angetippte
       * Stelle auf der Linie oder Fläche — und dieselbe Stelle hängt dann auch
       * am Knopf, damit Sprechblase und Kilometer vom selben Ort reden. */
      const wo = o.art === 'p' ? o.koord : [ev.latlng.lat, ev.latlng.lng];
      const blase = L.popup({
        className: 'kml-pop', maxWidth: 300,
        autoPanPaddingTopLeft: L.point(14, 86), autoPanPaddingBottomRight: L.point(14, 24)
      }).setLatLng(wo).setContent(html).openOn(map);

      const el = blase.getElement();
      hoeheFuellen(el);
      const knopf = el && el.querySelector('[data-kmlkm]');
      if (knopf) knopf.addEventListener('click', () => {
        map.closePopup();          // ohne Argument, sonst behält Leaflet _popup gesetzt
        kmAnStelle(wo[0], wo[1], PUNKT_TOL);
      });
      const ab = el && el.querySelector('[data-kmlab]');
      if (ab) ab.addEventListener('click', () => {
        map.closePopup();
        abZielSetzen({ a: akte, o });
      });
    });
    l.addTo(gruppe);
  }
  return gruppe;
}

/** Nächster Stützpunkt eines Objekts zu einem Tipp — beim Messen wird darauf gefangen. */
function kmlNaechsterKnoten(o, latlng) {
  if (o.art === 'p') return o.koord;
  const ringe = o.art === 'a' ? o.koord : [o.koord];
  let best = null, beste = Infinity;
  for (const ring of ringe) {
    for (const k of ring) {
      const d = haversine(latlng.lat, latlng.lng, k[0], k[1]);
      if (d < beste) { beste = d; best = k; }
    }
  }
  return best;
}

/** Wo die Beschriftung eines Objekts hängt. */
function kmlAnker(o) {
  if (o.art === 'p') return o.koord;
  if (o.art === 'l') return o.koord[Math.floor(o.koord.length / 2)];
  const ring = o.koord[0];
  return ring && ring[Math.floor(ring.length / 2)];
}

let kmlLabelLayer = null;

/* Namen erst ab KML_LABEL_ZOOM und nur, was im Bild liegt — sonst hängen bei
 * einer Datei mit tausend Punkten tausend Textknoten in der Karte. */
function kmlLabels() {
  if (!kmlLabelLayer) return;
  kmlLabelLayer.clearLayers();
  if (prefs.kmlNamen === false || map.getZoom() < KML_LABEL_ZOOM) return;

  const bild = map.getBounds().pad(0.08);
  let n = 0;
  for (const a of kmlAkten) {
    if (!a.sichtbar) continue;
    for (const o of a.objekte) {
      if (!kmlSichtbarObj(a, o)) continue;
      const txt = kmlLabelText(a, o);
      if (!txt) continue;
      const wo = kmlAnker(o);
      if (!wo || !bild.contains(wo)) continue;
      if (++n > KML_LABEL_MAX) return;      // Rest weglassen, statt alles zuzukleistern
      L.marker(wo, {
        pane: 'kmlIconPane', interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', iconSize: null, iconAnchor: [-8, 7],
          html: `<span class="kml-lbl">${esc(txt)}</span>` })
      }).addTo(kmlLabelLayer);
    }
  }
}

function kmlZeigen(akte, sichtbar) {
  const alt = kmlEbenen.get(akte.id);
  if (alt) { map.removeLayer(alt); kmlEbenen.delete(akte.id); }
  akte.sichtbar = !!sichtbar;
  if (!sichtbar) return;
  const ebene = kmlEbene(akte);
  ebene.addTo(map);
  kmlEbenen.set(akte.id, ebene);
  kmlLabels();
}

/** Nach jeder Änderung an den Dateien: Absteckknopf und offene Punktliste nachziehen. */
function kmlGeaendert() {
  abKnopf();
  if (abAn && (abListeOffen || !abZiel)) abListeFuellen();
}

/* -------- Liste im Menü -------- */

function kmlGroesse(b) {
  if (!b) return '';
  return b >= 950000
    ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB'
    : Math.max(1, Math.round(b / 1024)) + ' KB';
}

let kmlOffeneKlappe = null;      // Index der Datei, deren Aussehen gerade offen steht

/** Die Farben, die die Datei selbst mitbringt (Linie, Fläche, Symbol), in der
 *  Reihenfolge des ersten Auftretens — höchstens vier, für das Farbfeld. */
function kmlDateiFarben(a) {
  const farben = [];
  for (const o of a.objekte) {
    const s = o.stil || {};
    for (const f of [s.color, s.fillColor, s.punkt]) {
      if (f && !farben.includes(f)) farben.push(f);
      if (farben.length >= 4) return farben;
    }
  }
  return farben;
}

function kmlListe() {
  const box = $('#kmlList');
  if (!box) return;

  box.innerHTML = kmlAkten.map((a, i) => {
    const gezeigt = a.objekte.filter(o => kmlSichtbarObj(a, o)).length;
    const zahl = gezeigt === a.objekte.length
      ? nfM.format(a.objekte.length) + ' Objekte'
      : nfM.format(gezeigt) + ' von ' + nfM.format(a.objekte.length) + ' Objekten';
    const unter = [zahl, kmlGroesse(a.groesse), a.titel].filter(Boolean).join(' · ');
    const form = a.symbol || 'kreis';
    const felder = kmlFelder(a);
    const autoMoeglich = kmlAutoFeld(a) != null;
    const autoKarte = form === 'auto' ? kmlFormKarte(a) : null;
    const werte = kmlWerteMit(a, a.autoFeld);
    const labelFelder = a.labelFelder || ['name'];
    const zeigeSymbol = form === 'auto' ? (a.autoFeld ? 'auto' : 'kreis') : form;
    /* Bringt die Datei eigene Farben mit, kann man zu ihnen zurück — „wie in der
     * Datei" ist dann gewählt, solange keine eigene Farbe gesetzt ist. */
    const dateiFarben = kmlDateiFarben(a);
    const ausDatei = dateiFarben.length && !a.farbeFest;
    const zeigeFarbe = ausDatei ? dateiFarben[0] : a.farbe;
    const quelleFeld = dateiFarben.length === 1 ? dateiFarben[0]
      : `conic-gradient(${dateiFarben.map((c, k) => `${c} ${k / dateiFarben.length * 360}deg ${(k + 1) / dateiFarben.length * 360}deg`).join(', ')})`;
    return `<div class="kml-zeile">
      <div class="kml-item">
        <button class="kml-dot" type="button" data-kstil="${i}" aria-label="Farbe und Symbol von ${esc(a.name)}">
          ${kmlSymbolSvg(zeigeSymbol, esc(zeigeFarbe), true)}
        </button>
        <button class="kml-tog${a.sichtbar ? ' is-on' : ''}" type="button" data-ktog="${i}"
                aria-pressed="${a.sichtbar ? 'true' : 'false'}">
          <span class="kml-txt"><span class="kml-nm" title="${esc(a.name)}">${esc(a.name).replace(/([_.-])/g, '$1<wbr>')}</span><small>${esc(unter)}</small></span>
        </button>
        <button class="kml-ic" type="button" data-kzoom="${i}" aria-label="Auf ${esc(a.name)} zoomen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"/></svg>
        </button>
        <button class="kml-ic del" type="button" data-kdel="${i}" aria-label="${esc(a.name)} entfernen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="kml-edit" data-kedit="${i}" hidden>
        <div class="kml-edit-kopf">
          <p class="kml-lab">Aussehen — ${esc(a.name)}</p>
          <button class="kml-zu" type="button" data-kzu="${i}">Fertig</button>
        </div>
        <p class="kml-lab">Farbe</p>
        <div class="kml-wahl">${dateiFarben.length ? `
          <button class="kml-form kml-auto kml-quelle${ausDatei ? ' is-on' : ''}" type="button" data-kfarbe="${i}"
                  data-wert="quelle" title="Die Farben, die in der Datei stehen"><span style="background:${quelleFeld}"></span>wie Datei</button>` : ''}
          ${KML_FARBEN.map(c =>
          `<button class="kml-farbe${c === a.farbe && !ausDatei ? ' is-on' : ''}" type="button" data-kfarbe="${i}"
                   data-wert="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join('')}</div>

        <p class="kml-lab">Symbol</p>
        <div class="kml-wahl">
          ${autoMoeglich ? `<button class="kml-form kml-auto${form === 'auto' ? ' is-on' : ''}" type="button"
              data-kform="${i}" data-wert="auto">automatisch</button>` : ''}
          ${Object.entries(KML_FORMEN).map(([k, f]) =>
            `<button class="kml-form${k === form ? ' is-on' : ''}" type="button" data-kform="${i}"
                     data-wert="${k}" aria-label="${f.name}" title="${f.name}">${kmlSymbolSvg(k, esc(zeigeFarbe), true)}</button>`).join('')}
        </div>
        ${felder.length ? `
        <p class="kml-lab">Merkmal</p>
        <div class="kml-wahl">${felder.filter(f => f.werte >= 2 && f.werte <= 30).map(f =>
          `<button class="kml-feld${f.key === a.autoFeld ? ' is-on' : ''}" type="button" data-kauto="${i}"
                   data-wert="${esc(f.key)}">${esc(f.key)} <small>${f.werte}</small></button>`).join('')}</div>` : ''}
        ${form === 'auto' && autoKarte ? `
        <div class="kml-legende">${[...autoKarte].map(([wert, k]) =>
          `<span>${kmlSymbolSvg(k, esc(zeigeFarbe), false)}${esc(wert)}</span>`).join('')}</div>` : ''}
        ${werte.length > 1 ? `
        <p class="kml-lab">Sichtbar</p>
        <div class="kml-wahl">${werte.slice(0, 14).map(w =>
          `<button class="kml-feld${(a.ausWerte || []).includes(w.wert) ? '' : ' is-on'}" type="button"
                   data-kfilter="${i}" data-wert="${esc(w.wert)}">${esc(w.wert)} <small>${w.anzahl}</small></button>`).join('')}
          ${werte.length > 14 ? `<span class="kml-mehr">+${werte.length - 14} weitere</span>` : ''}</div>` : ''}

        <p class="kml-lab">Beschriftung</p>
        <div class="kml-wahl">
          <button class="kml-feld${labelFelder.includes('name') ? ' is-on' : ''}" type="button"
                  data-klabel="${i}" data-wert="name">Name</button>
          ${felder.map(f => `<button class="kml-feld${labelFelder.includes(f.key) ? ' is-on' : ''}" type="button"
                  data-klabel="${i}" data-wert="${esc(f.key)}">${esc(f.key)}</button>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-kstil]').forEach(btn => btn.addEventListener('click', () => {
    const i = btn.dataset.kstil;
    const feld = box.querySelector(`[data-kedit="${i}"]`);
    if (!feld) return;
    feld.hidden = !feld.hidden;
    kmlOffeneKlappe = feld.hidden ? null : Number(i);
  }));

  box.querySelectorAll('[data-kzu]').forEach(btn => btn.addEventListener('click', () => {
    const feld = box.querySelector(`[data-kedit="${btn.dataset.kzu}"]`);
    if (feld) feld.hidden = true;
    kmlOffeneKlappe = null;
  }));

  // Nach dem Neuzeichnen die zuvor offene Klappe wieder aufmachen
  if (kmlOffeneKlappe != null) {
    const feld = box.querySelector(`[data-kedit="${kmlOffeneKlappe}"]`);
    if (feld) feld.hidden = false;
  }

  const stilGesetzt = (i, aenderung) => {
    const a = kmlAkten[i];
    if (!a) return;
    Object.assign(a, aenderung);
    kmlKopfMerken(a);
    if (a.sichtbar) kmlZeigen(a, true);      // mit neuem Aussehen neu aufbauen
    kmlLabels();
    kmlListe();
    kmlOffeneKlappe = i;                     // Klappe offen lassen, man probiert meist mehrere
    const feld = $('#kmlList').querySelector(`[data-kedit="${i}"]`);
    if (feld) feld.hidden = false;
  };

  box.querySelectorAll('[data-kfarbe]').forEach(btn => btn.addEventListener('click', () =>
    stilGesetzt(Number(btn.dataset.kfarbe), btn.dataset.wert === 'quelle'
      ? { farbeFest: false } : { farbe: btn.dataset.wert, farbeFest: true })));
  box.querySelectorAll('[data-kform]').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.kform), a = kmlAkten[i];
    const wahl = btn.dataset.wert;
    // Beim Umschalten auf automatisch ein Merkmal vorschlagen, falls noch keins steht
    stilGesetzt(i, wahl === 'auto' && a && !a.autoFeld
      ? { symbol: 'auto', autoFeld: kmlAutoFeld(a) }
      : { symbol: wahl });
  }));

  box.querySelectorAll('[data-kauto]').forEach(btn => btn.addEventListener('click', () =>
    // autoFeldFest: eine bewusste Wahl soll ein späterer Standardwechsel nicht umwerfen
    stilGesetzt(Number(btn.dataset.kauto), { autoFeld: btn.dataset.wert, autoFeldFest: true, ausWerte: [] })));

  box.querySelectorAll('[data-kfilter]').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.kfilter), a = kmlAkten[i];
    if (!a) return;
    const wert = btn.dataset.wert;
    const aus = a.ausWerte || [];
    stilGesetzt(i, { ausWerte: aus.includes(wert) ? aus.filter(x => x !== wert) : [...aus, wert] });
  }));

  box.querySelectorAll('[data-klabel]').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.klabel), a = kmlAkten[i];
    if (!a) return;
    const wahl = btn.dataset.wert;
    const jetzt = a.labelFelder || ['name'];
    stilGesetzt(i, { labelFelder: jetzt.includes(wahl) ? jetzt.filter(x => x !== wahl) : [...jetzt, wahl] });
  }));

  box.querySelectorAll('[data-ktog]').forEach(btn => btn.addEventListener('click', () => {
    const a = kmlAkten[Number(btn.dataset.ktog)];
    if (!a) return;
    kmlZeigen(a, !a.sichtbar);
    kmlKopfMerken(a);
    kmlLabels();
    kmlListe();
  }));

  box.querySelectorAll('[data-kzoom]').forEach(btn => btn.addEventListener('click', () => {
    const a = kmlAkten[Number(btn.dataset.kzoom)];
    if (!a) return;
    if (!a.sichtbar) { kmlZeigen(a, true); kmlKopfMerken(a); kmlListe(); }
    if (!a.grenzen) { toast('Zu dieser Datei ist keine Lage bekannt.'); return; }
    closeSheet();
    kartePassen(a.grenzen, { padding: [30, 30], maxZoom: 17 });
  }));

  box.querySelectorAll('[data-kdel]').forEach(btn => btn.addEventListener('click', async () => {
    const a = kmlAkten[Number(btn.dataset.kdel)];
    if (!a) return;
    if (!confirm(a.name + ' aus der Liste entfernen? Die Datei auf dem Gerät bleibt erhalten.')) return;
    kmlZeigen(a, false);
    kmlAkten = kmlAkten.filter(x => x.id !== a.id);
    kmlLabels();
    kmlListe();
    try { await kmlLoeschen(a.id); } catch { /* sonst ist sie nach dem Neuladen wieder da */ }
  }));

  // Die Liste wird nach jeder Änderung an den Dateien neu gebaut — der Ort, an dem
  // auch das Abstecken davon erfährt
  kmlGeaendert();
}

/* -------- Dateien öffnen -------- */

async function kmlOeffnen(dateien) {
  let letzte = null, zahl = 0;

  for (const datei of dateien) {
    try {
      if (datei.size > KML_MAX_DATEI) throw new Error('größer als ' + Math.round(KML_MAX_DATEI / 1e6) + ' MB');
      const buf = await datei.arrayBuffer();
      const istZip = buf.byteLength > 4 && new DataView(buf).getUint32(0, false) === 0x504b0304;
      const roh = istZip ? await kmzText(buf) : kmlDekodieren(buf);
      const geparst = kmlParse(roh);
      if (!geparst.objekte.length) { toast(datei.name + ': keine Geometrie gefunden.'); continue; }

      const vorlaeufig = { objekte: geparst.objekte };
      const autoFeld = kmlAutoFeld(vorlaeufig);
      const akte = {
        id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: datei.name.replace(/\.(kml|kmz)$/i, '') || 'KML',
        /* Trägt die Datei ein Merkmal, das nach Typ aussieht, werden die Formen
         * gleich danach unterschieden — genau dafür steht es ja drin. */
        symbol: autoFeld ? 'auto' : 'kreis',
        autoFeld,
        labelFelder: ['name'],
        titel: geparst.titel && geparst.titel !== datei.name ? geparst.titel : '',
        farbe: KML_FARBEN[kmlAkten.length % KML_FARBEN.length],
        groesse: datei.size,
        anzahl: geparst.objekte.length,
        angelegt: Date.now(),
        sichtbar: true,
        grenzen: geparst.grenzen,
        objekte: geparst.objekte
      };

      try { await kmlAblegen(akte); }
      catch { toast('Speichern nicht möglich — die Datei ist nur bis zum Neuladen da.'); }

      kmlAkten.push(akte);
      kmlZeigen(akte, true);
      letzte = akte;
      zahl++;
    } catch (err) {
      toast(datei.name + ': ' + err.message);
    }
  }

  kmlListe();
  kmlLabels();
  if (!letzte) return;

  if (letzte.grenzen) kartePassen(letzte.grenzen, { padding: [30, 30], maxZoom: 17 });
  const viel = letzte.anzahl > KML_VIEL ? ' — bei so vielen kann die Karte träge werden' : '';
  toast(zahl > 1
    ? zahl + ' Dateien geladen.'
    : `${letzte.name}: ${nfM.format(letzte.anzahl)} Objekte${viel}.`);
}

async function kmlBoot() {
  kmlLabelLayer = L.layerGroup().addTo(map);
  map.on('moveend', kmlLabels);
  try { kmlAkten = await kmlLaden(); }
  catch { return; }        // privater Modus oder gesperrter Speicher

  /* Schon geladene Dateien auf den aktuellen Standard nachziehen — sonst würde
   * eine bereits abgelegte Datei ewig nach dem alten Merkmal unterscheiden. */
  for (const a of kmlAkten) {
    if (a.symbol !== 'auto' || a.autoFeldFest) continue;
    const feld = kmlAutoFeld(a);
    if (feld && feld !== a.autoFeld) { a.autoFeld = feld; kmlKopfMerken(a); }
  }

  for (const a of kmlAkten) if (a.sichtbar) kmlZeigen(a, true);
  kmlLabels();
  kmlListe();
}

/* -------- Kilometersteine zeichnen -------- */

/** Beschriftungsdichte nach Zoomstufe, damit die Karte nicht zuwächst. */
function labelStep(z) {
  if (z >= 16) return 0;      // alle
  if (z >= 15) return 0.2;
  if (z >= 14) return 0.5;
  if (z >= 13) return 1;
  if (z >= 11) return 5;
  return 10;
}

/* Kennt InfraGO die Strecke, steht ihre Linie auf der Karte und darauf die
 * Kilometer, gerechnet wie die Suche — nicht die OSM-Steine, die bis 44 m
 * daneben stehen können. Der Tipp auf einen Punkt setzt genau diesen Kilometer.
 * false: InfraGO kennt die Strecke nicht (oder sie ist noch nicht geladen). */
function ifgZeichnen() {
  const ref = String(view.ref || '').trim();
  const st = ref && ifgStreckeJetzt(ref);
  if (!st) {
    if (ref) ifgStrecke(ref).then(s => { if (s && String(view.ref).trim() === s.nr) drawMilestones(); }).catch(() => { });
    return false;
  }
  const z = map.getZoom();

  /* Nur die Strecke gesucht, ohne Kilometer: Dann ist sie das Ergebnis und steht
   * kräftig in der Signalfarbe da, auf jeder Zoomstufe, mit einem Rand gegen den
   * Grund. Sonst sah man weit draußen gar nicht, welche gemeint ist, und näher
   * dran nur die blasse Linie. Mit einem Kilometer trägt der Pin die Farbe, und
   * die Linie bleibt zurückhaltend wie bisher.
   * Der Ton richtet sich nach der Karte, nicht nach der Oberfläche: auf hellem
   * Grund (Karte, Relief) der dunkle Ton der Palette mit weißem Rand, auf dunkler
   * Karte und Luftbild der helle mit schwarzem. */
  const hervor = view.hervor && !view.point && !reihe.length;
  if (hervor) {
    const linien = st.abschnitte.map(g => g.pts.map(p => [p.lat, p.lon]));
    const dunkel = ['dark', 'dop'].includes(prefs.base);
    const pal = PALETTEN[prefs.palette] || PALETTEN.lapis;
    const farbe = (dunkel ? pal.dark : pal.light).accent;
    L.polyline(linien, { color: dunkel ? '#000' : '#fff', weight: 8, opacity: 0.85, interactive: false })
      .addTo(msLayer);
    L.polyline(linien, { color: farbe, weight: 4.5, opacity: 1, interactive: false, attribution: IFG_QUELLE })
      .addTo(msLayer);
  }
  if (z < 9) return true;

  const b = map.getBounds().pad(0.3);
  const [s, w, n, o] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];

  /* Beschriftet wie bisher die Steine (labelStep); dazwischen kleine Punkte je
   * Hektometer, solange es nicht zu dicht wird. */
  const schritt = labelStep(z) || 0.1;
  const fein = z >= 14 ? 0.1 : schritt;
  for (const p of ifgKmPunkte(st, fein, s, w, n, o)) {
    const label = Math.abs(p.km / schritt - Math.round(p.km / schritt)) < 1e-6;
    L.circleMarker([p.lat, p.lon], {
      radius: label ? 4.5 : 3,
      color: '#fff', weight: label ? 1.6 : 1,
      fillColor: '#4b93e6', fillOpacity: 1,
      bubblingMouseEvents: false, attribution: IFG_QUELLE      // Leaflet zählt mit, steht einmal da
    }).on('click', ev => {
      L.DomEvent.stopPropagation(ev);
      const ziel = tippZiel();
      if (ziel) { ziel(ev.latlng || L.latLng(p.lat, p.lon)); return; }
      ifgLage(st.nr, p.km).then(r => { if (r) applyPoint(st.nr, p.km, r); }).catch(() => { });
    }).addTo(msLayer);
    if (label) {
      L.marker([p.lat, p.lon], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', html: `<span class="ms">${fmtKm(p.km)}</span>`, iconSize: null, iconAnchor: [-7, 7] })
      }).addTo(msLayer);
    }
  }
  return true;
}

/* ============================ Auflage DB-Netz (InfraGO) ============================ */

/* Die Anlagen des InfraGO-Netzes im Ausschnitt. Was sie zeigt, wählt man
 * einzeln (prefs.ifgInhalt) — lange drücken oder Rechtsklick auf den Knopf
 * DB-Netz, wie die Farbe bei den Parzellen. Jede Art erst ab ihrer Zoomstufe:
 * Ganz Deutschland wären 1548 Dateien.
 * Strecken mit Nummer und Kilometer aller Strecken gab es bis November 2026
 * auch; der Nutzer hat sie nie gebraucht (die gesuchte Strecke zeichnet
 * ifgZeichnen, das übrige Netz der Bahn-Layer). */
const IFG_INHALT = [
  ['bue', 'Bahnübergänge', 14], ['bruecken', 'Brücken', 13], ['tunnel', 'Tunnel', 12],
  ['bs', 'Betriebsstellen', 12]
];
const IFG_AB = Math.min(...IFG_INHALT.map(([, , z]) => z));
const IFG_AB_ZOOM = Object.fromEntries(IFG_INHALT.map(([k, , z]) => [k, z]));
const ifgInhaltAn = k => !prefs.ifgInhalt || prefs.ifgInhalt[k] !== false;

let ifgLayer = null;
let ifgRenderer = null;
let ifgStand = 0;        // jede neue Zeichnung verwirft, was eine ältere noch nachliefert

/* Linien auf Canvas, in einer eigenen Ebene unter den Steinen und dem Pin:
 * Hunderte SVG-Pfade machen das Schieben auf dem Handy zäh. */
function ifgAuflageAnlegen() {
  /* In die rotatePane, zu den Kacheln: Direkt in der mapPane lag sie mit z 390
   * unter der rotatePane (z 400) und damit unter allen Kacheln — bis November
   * 2026 war von Strecken, Brücken und Tunneln deshalb nichts zu sehen, nur die
   * Marker (Bahnübergänge, Betriebsstellen) aus der markerPane. */
  map.createPane('ifgPane', map._rotatePane || undefined);
  map.getPane('ifgPane').style.zIndex = 390;          // über den Kacheln, unter overlayPane (400)
  ifgRenderer = L.canvas({ pane: 'ifgPane', padding: 0.3, tolerance: 6 });
  ifgLayer = L.layerGroup([], { attribution: IFG_QUELLE });
  ifgLayer.on('add', () => ifgAuflageZeichnen());
  map.on('moveend', () => { if (map.hasLayer(ifgLayer)) ifgAuflageZeichnen(); });
  return ifgLayer;
}

/** Ein Tipp auf eine Anlage oder einen Kilometer wird ein Ergebnis wie jedes andere —
 *  mit Profil, Google Maps und Teilen. Beim Messen ist er nur ein Fangpunkt. */
function ifgAnlageTipp(ev, tun) {
  L.DomEvent.stopPropagation(ev);
  const ziel = tippZiel();
  if (ziel) { ziel(ev.latlng); return; }
  tun().catch(() => toast('Für diese Stelle ließ sich kein Kilometer rechnen.'));
}

async function ifgAuflageZeichnen() {
  if (!ifgLayer || !map.hasLayer(ifgLayer)) return;
  const stand = ++ifgStand;
  const z = map.getZoom();
  const b = map.getBounds().pad(0.2);
  const [s, w, n, o] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  const im = (lat, lon) => lat >= s && lat <= n && lon >= w && lon <= o;
  const imBB = bb => !(bb[0] > n || bb[2] < s || bb[1] > o || bb[3] < w);
  const ab = k => ifgInhaltAn(k) && z >= IFG_AB_ZOOM[k];

  const mitAnlagen = ab('bue') || ab('bruecken') || ab('tunnel');
  const nummern = mitAnlagen ? await ifgNummernImRechteck(s, w, n, o) : new Set();
  const anlagen = nummern.size
    ? (await Promise.all([...nummern].map(nr => ifgAnlagen(nr).catch(() => null)))).filter(Boolean) : [];
  const stellen = ab('bs') ? (await ifgStellen()).filter(x => im(x.lat, x.lon)) : [];
  if (stand !== ifgStand) return;              // inzwischen weitergeschoben

  const neu = [];
  const r = ifgRenderer;
  const dunkel = prefs.base === 'dark';
  /* Strich und Saum: auf Karte und Luftbild dunkel auf weißem Saum, auf der
   * dunklen Karte umgekehrt — sonst ging die Signatur dort unter. */
  const tinte = dunkel ? '#e6ebf1' : '#1d2733', saum = dunkel ? '#06070b' : '#ffffff';
  const strich = (pts, opt) => {
    neu.push(L.polyline(pts, { renderer: r, color: saum, weight: (opt.weight || 2) + 2.5, opacity: 0.8,
      interactive: false, lineCap: 'butt', lineJoin: 'miter', dashArray: opt.dashArray }));
    neu.push(L.polyline(pts, { renderer: r, color: tinte, weight: opt.weight || 2, opacity: 1,
      interactive: false, lineCap: 'butt', lineJoin: 'miter', dashArray: opt.dashArray }));
  };
  // Unsichtbar, aber breit: darauf landet der Tipp (der Canvas fragt die Strichbreite ab, nicht die Deckung)
  const griff = (pts, tipp) => neu.push(L.polyline(pts, {
    renderer: r, color: '#000', weight: 16, opacity: 0, lineCap: 'butt', bubblingMouseEvents: false
  }).on('click', tipp));

  /* Tunnel wie in der topografischen Karte: zwei gestrichelte Linien neben dem
   * Gleis, an beiden Mundlöchern ein Portal — ein Querstrich, dessen Enden vom
   * Tunnel weg nach außen knicken. */
  if (ab('tunnel')) {
    for (const a of anlagen) for (const t of a.tunnel) {
      if (!imBB(t.bb)) continue;
      const sig = ifgSignatur(t.pts, 5, 10);
      if (!sig) continue;
      for (const kante of sig.kanten) strich(kante, { weight: 1.6, dashArray: '5 4' });
      for (const portal of sig.portale) strich(portal, { weight: 2 });
      griff(sig.mitte, ev => ifgAnlageTipp(ev, () => ifgAnlageWaehlen(a.nr, ev.latlng, {
        art: 'Tunnel', bez: t.bez, von: t.von, bis: t.bis, laenge: t.laenge
      })));
    }
  }

  /* Brücken als Brückensignatur: zwei Geländer neben dem Gleis, an den Enden
   * schräg nach außen gezogen, dazwischen hell die Fahrbahn. Kurze Brücken
   * mindestens 14 px lang, sonst wären sie bei Zoom 13 ein Punkt. */
  if (ab('bruecken')) {
    for (const a of anlagen) for (const br of a.bruecken) {
      if (!imBB(br.bb)) continue;
      const sig = ifgSignatur(br.pts, 5, 0, 14);
      if (!sig) continue;
      neu.push(L.polyline(sig.mitte, { renderer: r, color: saum, weight: 10, opacity: 0.45,
        interactive: false, lineCap: 'butt' }));
      for (const kante of sig.kanten) strich(kante, { weight: 2 });
      griff(sig.mitte, ev => ifgAnlageTipp(ev, () => ifgAnlageWaehlen(a.nr, ev.latlng, {
        art: 'Brücke', bez: br.bez, von: br.von, bis: br.bis, laenge: br.laenge, kreuzung: br.kreuzung
      })));
    }
  }

  /* Bahnübergänge als Andreaskreuz, antippbar */
  if (ab('bue')) {
    for (const a of anlagen) for (const u of a.bue) {
      if (!im(u.lat, u.lon)) continue;
      neu.push(L.marker([u.lat, u.lon], {
        keyboard: false, bubblingMouseEvents: false,
        icon: L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: IFG_BUE_ZEICHEN })
      }).on('click', ev => ifgAnlageTipp(ev, async () => {
        const res = await ifgLage(a.nr, u.km);
        if (!res) throw new Error('kein Abschnitt');
        applyPoint(a.nr, u.km, { ...res, anlage: {
          art: 'Bahnübergang', bez: u.bez, details: [u.sicherung, u.strasse].filter(Boolean) } });
      })));
    }
  }

  /* Betriebsstellen: ein Quadrat, ab Zoom 13 mit DS100, ab 15 mit Namen */
  for (const st of stellen) {
    const text = z >= 15 ? `${esc(st.name)} <b>${esc(st.ds100)}</b>` : z >= 13 ? `<b>${esc(st.ds100)}</b>` : '';
    neu.push(L.marker([st.lat, st.lon], {
      keyboard: false, bubblingMouseEvents: false,
      icon: L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6],
        html: `<span class="ifg-bs"></span>${text ? `<span class="ifg-bs-text">${text}</span>` : ''}` })
    }).on('click', ev => ifgAnlageTipp(ev, async () => ifgStelleZeigen(ifgStelleTreffer(st)))));
  }

  ifgLayer.clearLayers();
  for (const l of neu) l.addTo(ifgLayer);
}

/** Signatur einer Anlage in Bildpunkten gerechnet, zurück in Lagen: die Achse
 *  (mitte), zwei Kanten im Abstand ab links und rechts, und — mit portal > 0 —
 *  je Ende ein Querstrich über portal px, dessen Enden 4 px vom Bauwerk weg
 *  knicken. Ohne portal knicken stattdessen die Kanten selbst nach außen
 *  (Brückengeländer). mindestens: kürzere Anlagen um ihre Mitte verlängert.
 *  Gerechnet bei jedem Zeichnen, also passend zur Zoomstufe. */
function ifgSignatur(lagen, ab, portal = 0, mindestens = 0) {
  let p = lagen.map(q => map.latLngToLayerPoint([q.lat, q.lon]));
  p = L.LineUtil.simplify(p, 0.5);
  let laenge = 0;
  for (let i = 1; i < p.length; i++) laenge += p[i].distanceTo(p[i - 1]);
  if (p.length < 2 || laenge < 1e-6) {
    if (!mindestens || !p.length) return null;
    p = [p[0].subtract(L.point(mindestens / 2, 0)), p[0].add(L.point(mindestens / 2, 0))];
  } else if (laenge < mindestens) {
    const a = p[0], b = p[p.length - 1], m = a.add(b).divideBy(2);
    const d = b.subtract(a), l = Math.hypot(d.x, d.y) || 1;
    const e = L.point(d.x / l * mindestens / 2, d.y / l * mindestens / 2);
    p = [m.subtract(e), m.add(e)];
  }
  // Senkrechte je Punkt: Mittel der angrenzenden Abschnitte, an Ecken auf Gehrung gestreckt
  const senk = p.map((_, i) => {
    const vor = p[Math.max(0, i - 1)], nach = p[Math.min(p.length - 1, i + 1)];
    const d = nach.subtract(vor), l = Math.hypot(d.x, d.y) || 1;
    return L.point(-d.y / l, d.x / l);
  });
  const kante = sgn => p.map((q, i) => q.add(senk[i].multiplyBy(sgn * ab)));
  const richtung = (i, j) => { const d = p[j].subtract(p[i]), l = Math.hypot(d.x, d.y) || 1; return L.point(d.x / l, d.y / l); };
  const ende0 = richtung(1, 0), ende1 = richtung(p.length - 2, p.length - 1);    // je vom Bauwerk weg
  const zurueck = pts => pts.map(q => map.layerPointToLatLng(q));
  const kanten = [kante(1), kante(-1)];
  const portale = [];
  if (portal) {
    for (const [q, n, raus] of [[p[0], senk[0], ende0], [p[p.length - 1], senk[p.length - 1], ende1]]) {
      const h = n.multiplyBy(portal / 2 + 2);
      portale.push(zurueck([q.add(h).add(raus.multiplyBy(4)), q.add(h), q.subtract(h), q.subtract(h).add(raus.multiplyBy(4))]));
    }
  } else {
    // Geländer: an beiden Enden 4 px schräg nach außen
    for (const [k, sgn] of [[kanten[0], 1], [kanten[1], -1]]) {
      const a = k[0], b = k[k.length - 1];
      k.unshift(a.add(ende0.multiplyBy(3)).add(senk[0].multiplyBy(sgn * 3)));
      k.push(b.add(ende1.multiplyBy(3)).add(senk[p.length - 1].multiplyBy(sgn * 3)));
    }
  }
  return { mitte: zurueck(p), kanten: kanten.map(zurueck), portale };
}

/* Andreaskreuz, 16 px: zwei weiße Balken unter zwei roten — liest sich auf Karte
 * und Luftbild. Rechnerisch mittig: Die Balken kreuzen sich bei (8, 8). */
const IFG_BUE_ZEICHEN = '<svg class="ifg-bue" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
  '<path d="M2.5 2.5l11 11M13.5 2.5l-11 11" stroke="#fff" stroke-width="5" stroke-linecap="square"/>' +
  '<path d="M2.5 2.5l11 11M13.5 2.5l-11 11" stroke="#d50000" stroke-width="2.6" stroke-linecap="square"/></svg>';

/** Brücke oder Tunnel angetippt: der Kilometer an der getippten Stelle, auf der
 *  Strecke, zu der die Anlage gehört — sonst die Mitte der Anlage. */
async function ifgAnlageWaehlen(nr, latlng, anlage) {
  const r = await ifgKmAn(latlng.lat, latlng.lng, 40, [nr], Infinity);
  // Nur wenn der Kilometer auch zur Anlage passt — sonst lag der Tipp auf einem anderen Gleis
  const lo = Math.min(anlage.von, anlage.bis) - 0.05, hi = Math.max(anlage.von, anlage.bis) + 0.05;
  if (r && r.ref === nr && r.punkt.km >= lo && r.punkt.km <= hi) {
    applyPoint(nr, r.punkt.km, { ...r.punkt, anlage });
    return;
  }
  const km = (anlage.von + anlage.bis) / 2;
  const res = await ifgLage(nr, km);
  if (!res) throw new Error('kein Abschnitt');
  applyPoint(nr, km, { ...res, anlage });
}

/** Eine Betriebsstelle aus der Auflage — dieselbe Leiste wie aus der Suche. */
function ifgStelleZeigen(t) {
  reihe = []; reiheAktiv = 0; reiheFehler = [];
  neuerPunktInfoZu();
  view.km = null;
  view.point = { ...t, quality: 'betriebsstelle' };
  gleiswegZuletzt = null;
  if (trackLayer) trackLayer.clearLayers();
  drawPoint();
  renderBottom();
}

/* Die Auswahl, was die Auflage zeigt: eine Zeile Knöpfe je drei, wie
 * „Punktraster der Nutzung" bei den Parzellen. */
function ifgWahlBauen() {
  const box = $('#ifgInhalt');
  if (!box) return;
  const reihen = [IFG_INHALT.slice(0, 3), IFG_INHALT.slice(3)];   // Betriebsstellen in eigener Zeile
  box.innerHTML = reihen.map((reihe, i) =>
    `<div class="seg" role="group" aria-label="Inhalt DB-Netz"${i ? ' style="margin-top:7px"' : ''}>` +
    reihe.map(([k, name, zz]) =>
      `<button class="seg-btn" type="button" data-ifg="${k}" title="ab Zoomstufe ${zz}">${name}</button>`).join('') +
    `</div>`).join('');
  box.querySelectorAll('[data-ifg]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.ifg;
    prefs.ifgInhalt = { ...(prefs.ifgInhalt || {}), [k]: !ifgInhaltAn(k) };
    saveStore();
    syncButtons();
    // Wer etwas einschaltet, will es sehen
    if (!auflageGewaehlt('ifg')) toggleOverlay('ifg');
    else ifgAuflageZeichnen();
    if (ifgInhaltAn(k) && map.getZoom() < IFG_AB_ZOOM[k]) {
      toast(`${btn.textContent} erscheinen ab Zoomstufe ${IFG_AB_ZOOM[k]}.`);
    }
  }));
}

function ifgWahlZeigen(an) {
  const box = $('#ifgWahl'), btn = $('#ifgBtn');
  if (box) box.hidden = !an;
  if (btn) btn.setAttribute('aria-expanded', an ? 'true' : 'false');
}

/** Tippen schaltet die Auflage, lange drücken oder Rechtsklick öffnet ihre
 *  Auswahl — genau wie parzKnopfBinden. Für DB-Netz und Festpunkte. */
function auswahlKnopfBinden(kennung, wahlBox, zeigen, tippen = () => toggleOverlay(kennung)) {
  const btn = $(`#${kennung}Btn`);
  if (!btn) return;
  let timer = 0, lang = false, zuletzt = 0;
  const wahl = () => {
    clearTimeout(timer);
    if (Date.now() - zuletzt < 700) return;
    zuletzt = Date.now();
    lang = true;
    zeigen($(wahlBox).hidden);
  };
  btn.addEventListener('pointerdown', ev => {
    lang = false;
    clearTimeout(timer);
    if (ev.button === 0) timer = setTimeout(wahl, MERK_DAUER);
  });
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(t, () => clearTimeout(timer));
  btn.addEventListener('contextmenu', ev => { ev.preventDefault(); wahl(); });
  btn.addEventListener('click', () => {
    if (lang) { lang = false; return; }
    tippen();
  });
}

function ifgKnopfBinden() { auswahlKnopfBinden('ifg', '#ifgWahl', ifgWahlZeigen); }

/* Das Relief: Tippen wählt es als Grundkarte, lange drücken öffnet die Wahl
 * Grau oder Höhenfarben (reliefWahl). Sie steckt bewusst dort und nicht als
 * eigene Reihe unter den Grundkarten: So sah sie wie zwei weitere Grundkarten
 * aus (Nutzer, 03.11.2026). */
function reliefWahlZeigen(an) {
  const box = $('#reliefWahl'), btn = $('#reliefBtn');
  if (box) box.hidden = !an;
  if (btn) btn.setAttribute('aria-expanded', an ? 'true' : 'false');
}
function reliefKnopfBinden() { auswahlKnopfBinden('relief', '#reliefWahl', reliefWahlZeigen, () => setBase('relief')); }

/* ============================ Auflage Festpunkte (BW) ============================
 *
 * Lage- und Höhenfestpunkte aus der OGC API Features des LGL (Beta, Datenlizenz
 * Deutschland – Namensnennung 2.0). Die Koordinaten kommen gleich in UTM 32
 * (crs=EPSG:25832, so liegen sie dort auch gespeichert) — auf den Zentimeter
 * wie im Kataster, ohne Umweg über WGS84. Am 14.10.2026 gemessen, 1 km² in
 * Stuttgart-West: 16 TP, 189 Aufnahmepunkte, 62 Polygonpunkte,
 * 227 Sicherungspunkte, über 2000 Grenzpunkte; 0,2–1 s je Abfrage.
 *
 * Geholt wird je Zelle (Web-Mercator-Kachel der Stufe zell) und Art, nur was an
 * und ab seiner Zoomstufe sichtbar ist, nur im Rahmen um BW. Höhen hat nur der
 * Höhenfestpunkt (NHN), mit Ordnung und Lagebeschreibung. Bayern siehe FP_BY_WMS. */
const FP_API = 'https://ogcapi.lgl-bw.de/beta/pygeoapi/collections';
const FP_QUELLE = `Festpunkte: <a href="https://www.lgl-bw.de/">LGL-BW</a> (${new Date().getFullYear()}, dl-de/by-2-0)`;
// [Schlüssel, Name, Sammlung, ab Zoom, Zellen-Zoom, Vorgabe an]
const FP_ARTEN = [
  ['hfp', 'Höhenfestpunkte', 'hoehenfestpunkte', 13, 12, true],
  ['tp', 'TP', 'trigonometrische_punkte', 13, 12, true],
  ['ap', 'Aufnahmepunkte', 'aufnahmepunkte', 16, 14, true],
  ['pl', 'Polygonpunkte', 'punkte_pl', 16, 14, true],
  ['sp', 'Sicherungspunkte', 'versicherungspunkte', 17, 14, false],
  ['gp', 'Grenzpunkte', 'grenzpunkt', 18, 16, false]
];
const FP_NAME = { hfp: 'Höhenfestpunkt', tp: 'Trigonometrischer Punkt', tph: 'Historischer TP', ap: 'Aufnahmepunkt',
  pl: 'Polygonpunkt', sp: 'Sicherungspunkt', gp: 'Grenzpunkt' };

/* Bayern (seit 14.10.2026): WMS Festpunkte der BVV, CC BY 4.0, CORS frei —
 * Höhenfestpunkte, TP (Lagefestpunkte) und historische TP (heute
 * Katasterfestpunkte beim ADBV). Aufnahme-, Polygon- und Grenzpunkte gibt es
 * dort nicht offen. Gezeichnet wird das Bild der BVV, nicht eigene Zeichen:
 * Punkte per GetFeatureInfo für einen Ausschnitt zu sammeln war nicht
 * verlässlich (5 × 5 km um Bamberg: 1-km-Zellen 79 Höhenfestpunkte,
 * 500-m-Zellen 74, 2-km-Zellen 71, eine 5-km-Zelle keinen). Beim Antippen
 * fragt die App die Stelle ab: Punktkennung, Koordinate (UTM 32) und der
 * Festpunktnachweis als PDF. Die Höhe steht nur im PDF. */
const FP_BY_WMS = 'https://geoservices.bayern.de/od/wms/afis/v1/festpunkte';
const FP_BY_EBENEN = { hfp: ['by_hoehenfestpunkte'], tp: ['by_lagefestpunkte', 'by_lagefestpunkte_hist'] };
const FP_BY_ART = { by_hoehenfestpunkte: 'hfp', by_lagefestpunkte: 'tp', by_lagefestpunkte_hist: 'tph' };
const FP_BY_PDF = 'https://geodaten.bayern.de/odd_data/festpunkte/pdf/';
const FP_BY_AB = 13;
let fpByLayer = null;

/** Die gewählten bayerischen Ebenen, durch Komma getrennt; leer, wenn keine. */
const fpByEbenen = () => Object.entries(FP_BY_EBENEN).filter(([k]) => fpArtAn(k)).flatMap(([, e]) => e).join(',');

/** Den bayerischen Kartendienst der Wahl anpassen: an, aus, andere Ebenen. */
function fpBayernSetzen() {
  const ebenen = map.hasLayer(fpLayer) ? fpByEbenen() : '';
  if (!ebenen) { if (fpByLayer && map.hasLayer(fpByLayer)) map.removeLayer(fpByLayer); return; }
  if (!fpByLayer) {
    const r = HOEHEN_RAHMEN.by;
    fpByLayer = L.tileLayer.wms(FP_BY_WMS, {
      layers: ebenen, format: 'image/png', transparent: true, version: '1.3.0',
      maxZoom: 22, minZoom: FP_BY_AB, zIndex: 50, crossOrigin: 'anonymous',
      bounds: L.latLngBounds([r.s, r.w], [r.n, r.o]),
      attribution: 'Festpunkte Bayern: <a href="https://www.geodaten.bayern.de/">Bayerische Vermessungsverwaltung</a> (CC BY 4.0)'
    });
  } else if (fpByLayer.wmsParams.layers !== ebenen) fpByLayer.setParams({ layers: ebenen });
  if (!map.hasLayer(fpByLayer)) { fpByLayer.addTo(map); ordneAuflagen(); }
}

/** Festpunkt in Bayern an der angetippten Stelle (GetFeatureInfo); null, wenn keiner.
 *  Abgefragt wird ein Fenster von 41 × 41 Punkten zu je vier Bildschirmpunkten,
 *  genommen der nächste Punkt im Umkreis eines Fingers. */
async function fpBayernAntippen(latlng) {
  if (!fpByLayer || !map.hasLayer(fpByLayer) || map.getZoom() < FP_BY_AB) return null;
  if (!inLandRahmen('by', latlng.lat, latlng.lng)) return null;
  const ebenen = fpByEbenen();
  if (!ebenen) return null;
  const [e, n] = utm32Hin(latlng.lat, latlng.lng);
  const mpp = 40075016.686 * Math.cos(latlng.lat * Math.PI / 180) / 2 ** (map.getZoom() + 8);
  const h = 20 * 4 * mpp;
  const url = `${FP_BY_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&CRS=EPSG:25832&STYLES=` +
    `&WIDTH=41&HEIGHT=41&I=20&J=20&FEATURE_COUNT=20&LAYERS=${ebenen}&QUERY_LAYERS=${ebenen}` +
    `&BBOX=${[e - h, n - h, e + h, n + h].map(v => v.toFixed(2)).join(',')}&INFO_FORMAT=application/vnd.ogc.gml`;
  let xml;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
  } catch { return null; }
  let best = null, bestD = 16 * mpp;          // höchstens 16 Bildschirmpunkte daneben
  for (const f of xml.getElementsByTagName('*')) {
    const m = /^(by_\w+)_feature$/.exec(f.localName);
    if (!m) continue;
    const c = f.getElementsByTagNameNS('*', 'coordinates')[0];
    if (!c) continue;
    const [pe, pn] = c.textContent.trim().split(/[\s,]+/).map(Number);
    const d = Math.hypot(pe - e, pn - n);
    if (!(d < bestD)) continue;
    const text = tag => { const el = f.getElementsByTagName(tag)[0]; return el ? el.textContent.trim() : ''; };
    const [la, lo] = utm32Zurueck(pe, pn);
    bestD = d;
    best = { art: FP_BY_ART[m[1]] || 'tp', e: pe, n: pn, lat: la, lon: lo, land: 'by',
      p: { punktkennung: text('punktkennung'), pdf: text('filename') ? FP_BY_PDF + text('filename') : '' } };
  }
  return best;
}
const FP_AB = Object.fromEntries(FP_ARTEN.map(([k, , , z]) => [k, z]));
const fpArtAn = k => {
  const v = prefs.fpInhalt && prefs.fpInhalt[k];
  return v === undefined ? FP_ARTEN.find(a => a[0] === k)[5] : v;
};
const FP_ZELLEN_MAX = 300;
const fpZellen = new Map();     // "ap/14/8712/5640" → Promise<[{ e, n, lat, lon, p }]>
let fpLayer = null;
let fpStand = 0;

/** Alle Punkte einer Art in einer Zelle; die API gibt seitenweise, „next" folgt. */
function fpZelle(art, z, x, y) {
  const s = `${art}/${z}/${x}/${y}`;
  const da = fpZellen.get(s);
  if (da) { fpZellen.delete(s); fpZellen.set(s, da); return da; }
  const laden = (async () => {
    const n2 = 2 ** z, lon = v => v / n2 * 360 - 180;
    const lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n2))) * 180 / Math.PI;
    const samml = FP_ARTEN.find(a => a[0] === art)[2];
    let url = `${FP_API}/${samml}/items?f=json&limit=5000&crs=${encodeURIComponent('http://www.opengis.net/def/crs/EPSG/0/25832')}` +
      `&bbox=${[lon(x), lat(y + 1), lon(x + 1), lat(y)].map(v => v.toFixed(6)).join(',')}`;
    const raus = [];
    for (let seite = 0; url && seite < 10; seite++) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Festpunkte: HTTP ${r.status}`);
      const j = await r.json();
      for (const f of j.features || []) {
        // Als Zahlen: Sie landen formatiert im HTML der Sprechblase
        const [e, n] = (f.geometry && f.geometry.coordinates || []).map(Number);
        if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
        const [la, lo] = utm32Zurueck(e, n);
        raus.push({ e, n, lat: la, lon: lo, p: f.properties || {} });
      }
      const weiter = (j.links || []).find(l => l.rel === 'next');
      // Nur Folgeseiten derselben API — ein „next" woandershin wird nicht befolgt
      url = weiter && new URL(weiter.href, FP_API).origin === new URL(FP_API).origin ? weiter.href : null;
    }
    return raus;
  })();
  fpZellen.set(s, laden);
  laden.catch(() => fpZellen.delete(s));
  while (fpZellen.size > FP_ZELLEN_MAX) fpZellen.delete(fpZellen.keys().next().value);
  return laden;
}

/* Zeichen nach Art: Dreieck TP, Kreis mit Querstrich Höhenfestpunkt, Kreis mit
 * Punkt Aufnahmepunkt, Kreis Polygonpunkt, Quadrat Sicherungspunkt, Punkt
 * Grenzpunkt. Rot mit weißem Rand, damit sie auf Karte und Luftbild stehen. */
function fpSymbolSvg(art) {
  const f = '#dc2626';
  const formen = {
    tp: `<path d="M8 2.5 14 13.5H2z" fill="#fff" stroke="${f}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="9.6" r="1.4" fill="${f}"/>`,
    hfp: `<circle cx="8" cy="8" r="5" fill="#fff" stroke="${f}" stroke-width="1.8"/><path d="M3 8h10" stroke="${f}" stroke-width="1.8"/>`,
    ap: `<circle cx="8" cy="8" r="4.8" fill="#fff" stroke="${f}" stroke-width="1.8"/><circle cx="8" cy="8" r="1.5" fill="${f}"/>`,
    pl: `<circle cx="8" cy="8" r="4" fill="#fff" stroke="${f}" stroke-width="1.8"/>`,
    sp: `<rect x="4.2" y="4.2" width="7.6" height="7.6" fill="#fff" stroke="${f}" stroke-width="1.8"/>`,
    gp: `<circle cx="8" cy="8" r="2.6" fill="${f}" stroke="#fff" stroke-width="1.4"/>`
  };
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${formen[art]}</svg>`;
}

function fpAuflageAnlegen() {
  /* Wie die KML-Symbole in der nicht mitdrehenden Ebene von leaflet-rotate: In der
   * drehenden lagen die Zeichen über den Sprechblasen (eigener Stapel). */
  map.createPane('fpPane', map._norotatePane || undefined);
  map.getPane('fpPane').style.zIndex = 610;          // unter den KML-Symbolen (620) und Sprechblasen
  fpLayer = L.layerGroup([], { attribution: FP_QUELLE });
  fpLayer.on('add', () => fpAuflageZeichnen());
  fpLayer.on('remove', () => { fpLayer.clearLayers(); fpBayernSetzen(); });
  map.on('moveend', () => { if (map.hasLayer(fpLayer)) fpAuflageZeichnen(); });
  return fpLayer;
}

async function fpAuflageZeichnen() {
  if (!fpLayer || !map.hasLayer(fpLayer)) return;
  fpBayernSetzen();
  const stand = ++fpStand, z = map.getZoom();
  const b = map.getBounds().pad(0.15);
  const [s, w, n, o] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  const r = HOEHEN_RAHMEN.bw;
  const arten = FP_ARTEN.filter(([k, , , ab]) => fpArtAn(k) && z >= ab);
  if (!arten.length || s > r.n || n < r.s || w > r.o || o < r.w) { fpLayer.clearLayers(); return; }

  const kachel = (lat, lon, zz) => {
    const n2 = 2 ** zz, rr = lat * Math.PI / 180;
    return [Math.floor((lon + 180) / 360 * n2), Math.floor((1 - Math.log(Math.tan(rr) + 1 / Math.cos(rr)) / Math.PI) / 2 * n2)];
  };
  const auftraege = [];
  for (const [k, , , , zz] of arten) {
    const [x0, y0] = kachel(n, w, zz), [x1, y1] = kachel(s, o, zz);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      auftraege.push(fpZelle(k, zz, x, y).then(pk => pk.map(p => ({ art: k, ...p })), () => []));
    }
  }
  if (auftraege.length > 60) { fpLayer.clearLayers(); return; }    // zu weit draußen
  const punkte = (await Promise.all(auftraege)).flat();
  if (stand !== fpStand) return;                    // inzwischen weitergeschoben

  fpLayer.clearLayers();
  for (const pt of punkte) {
    if (pt.lat < s || pt.lat > n || pt.lon < w || pt.lon > o) continue;
    const m = L.marker([pt.lat, pt.lon], {
      pane: 'fpPane', bubblingMouseEvents: false, keyboard: false,
      icon: L.divIcon({ className: 'fp-sym', iconSize: [16, 16], iconAnchor: [8, 8], html: fpSymbolSvg(pt.art) })
    });
    m.on('click', ev => fpTipp(ev, pt));
    m.addTo(fpLayer);
  }
}

/** Ein Tipp: beim Messen und im Profil ein Fangpunkt auf die Katasterkoordinate,
 *  sonst die Sprechblase. */
function fpTipp(ev, pt) {
  L.DomEvent.stopPropagation(ev);
  const ziel = tippZiel();
  if (ziel) { ziel(L.latLng(pt.lat, pt.lon)); return; }
  const p = pt.p, zeilen = [];
  const kennung = p.punktkennung || '';
  zeilen.push(`<b>${esc(FP_NAME[pt.art])}${kennung ? ' ' + esc(kennung) : ''}</b>`);
  if (Number.isFinite(p.hoehe)) {
    const h = p.hoehe.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    // Ohne <b>: In der Sprechblase ist das die Überschriftzeile und bräche die Zeile um
    zeilen.push(`<span><i>Höhe</i> ${h} m ü. NHN${p.ordnung_name ? ' · ' + esc(p.ordnung_name) : ''}</span>`);
  }
  const marke = p.vermarkung_name || p.abmarkung_name;
  if (marke) zeilen.push(`<span><i>Vermarkung</i> ${esc(marke)}</span>`);
  if (p.qualitaet) zeilen.push(`<span><i>Qualität</i> ${esc(p.qualitaet)}</span>`);
  if (p.lagebeschreibung) zeilen.push(`<span>${esc(p.lagebeschreibung)}</span>`);
  // Wie aus Tachymeter und Koordinatenliste: ohne Tausenderpunkte, die Zone dahinter
  const fmt = v => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  zeilen.push(`<span>E ${fmt(pt.e)} · N ${fmt(pt.n)} (UTM 32)</span>`);
  // Bayern: Höhe, Skizze und Beschreibung stehen im amtlichen Nachweis
  if (p.pdf) zeilen.push(`<span><a href="${esc(p.pdf)}" target="_blank" rel="noopener">Festpunktnachweis (PDF)</a></span>`);
  zeilen.push(pt.land === 'by'
    ? `<small>Bayerische Vermessungsverwaltung, CC BY 4.0 — keine amtliche Auskunft</small>`
    : `<small>LGL-BW, OGC API (Beta) — keine amtliche Auskunft</small>`);
  zeilen.push(mapsKnopf(pt.lat, pt.lon));
  zeilen.push(`<button type="button" class="kml-km" data-fpkm>Kilometer bestimmen` +
    `<small>rechnet den Punkt auf die Strecke — braucht Netz</small></button>`);
  zeilen.push(routeKnopf(pt.lat, pt.lon, 'Festpunkt'));
  const blase = L.popup({
    className: 'kml-pop', maxWidth: 300,
    autoPanPaddingTopLeft: L.point(14, 86), autoPanPaddingBottomRight: L.point(14, 24)
  }).setLatLng([pt.lat, pt.lon]).setContent(zeilen.join('')).openOn(map);
  const knopf = blase.getElement() && blase.getElement().querySelector('[data-fpkm]');
  if (knopf) knopf.addEventListener('click', () => {
    map.closePopup();
    kmAnStelle(pt.lat, pt.lon, PUNKT_TOL);
  });
}

function fpWahlBauen() {
  const box = $('#fpInhalt');
  if (!box) return;
  // Drei Reihen zu zwei: mit drei je Reihe brach „Grenzpunkte" auf 375 px allein in eine dritte
  const reihen = [FP_ARTEN.slice(0, 2), FP_ARTEN.slice(2, 4), FP_ARTEN.slice(4)];
  box.innerHTML = reihen.map((reihe, i) =>
    `<div class="seg seg-paar" role="group" aria-label="Festpunkte"${i ? ' style="margin-top:7px"' : ''}>` +
    reihe.map(([k, name, , zz]) =>
      `<button class="seg-btn" type="button" data-fp="${k}" title="ab Zoomstufe ${zz}">${name}</button>`).join('') +
    `</div>`).join('');
  box.querySelectorAll('[data-fp]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.fp;
    prefs.fpInhalt = { ...(prefs.fpInhalt || {}), [k]: !fpArtAn(k) };
    saveStore();
    syncButtons();
    if (!auflageGewaehlt('fp')) toggleOverlay('fp');
    else fpAuflageZeichnen();
    if (fpArtAn(k) && map.getZoom() < FP_AB[k]) toast(`${btn.textContent} erscheinen ab Zoomstufe ${FP_AB[k]}.`);
  }));
}

function fpWahlZeigen(an) {
  const box = $('#fpWahl'), btn = $('#fpBtn');
  if (box) box.hidden = !an;
  if (btn) btn.setAttribute('aria-expanded', an ? 'true' : 'false');
}

function fpKnopfBinden() { auswahlKnopfBinden('fp', '#fpWahl', fpWahlZeigen); }

function drawMilestones() {
  msLayer.clearLayers();
  if (ifgZeichnen()) return;
  const e = view.ref && lineCache.get(view.ref);
  if (!e || !e.sorted.length) return;

  const z = map.getZoom();
  if (z < 9) return;

  const bounds = map.getBounds().pad(0.3);
  const step = labelStep(z);
  let lastLabelKm = -Infinity;

  // Die Punkte wie erfasst, auch beide eines Doppelsteins — die Linie oben läuft durch die vereinten
  for (const p of (e.alle && e.alle.length ? e.alle : e.sorted)) {
    const inView = bounds.contains([p.lat, p.lon]);
    const label = step === 0 || p.km - lastLabelKm >= step - 1e-9;
    if (label) lastLabelKm = p.km;
    if (!inView) continue;

    L.circleMarker([p.lat, p.lon], {
      radius: label ? 4.5 : 3,
      color: '#fff', weight: label ? 1.6 : 1,
      fillColor: '#4b93e6', fillOpacity: 1,
      bubblingMouseEvents: false
    }).on('click', ev => {
      L.DomEvent.stopPropagation(ev);
      // Beim Messen und im Profil ist ein Stein ein bequemer Fangpunkt, kein neues Suchergebnis
      const ziel = tippZiel();
      if (ziel) { ziel(ev.latlng || L.latLng(p.lat, p.lon)); return; }
      applyPoint(view.ref, p.km, {
        lat: p.lat, lon: p.lon, quality: 'exakt', operator: p.operator, lineRef: p.ref
      });
    }).addTo(msLayer);

    if (label) {
      L.marker([p.lat, p.lon], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', html: `<span class="ms">${fmtKm(p.km)}</span>`, iconSize: null, iconAnchor: [-7, 7] })
      }).addTo(msLayer);
    }
  }
}

function drawPoint() {
  pointLayer.clearLayers();
  pointMarker = null;

  if (reihe.length > 1) {
    reihe.forEach((r, i) => {
      const m = pinZeichnen(r.punkt, r.km, i === reiheAktiv, i);
      if (i === reiheAktiv) pointMarker = m;
    });
    return;
  }
  if (!view.point) return;
  pointMarker = pinZeichnen(view.point, view.km, true, -1);
}

/** Ein Pin samt Kilometerschild. `idx` ≥ 0 heißt: Teil einer Reihe und
 *  anklickbar, um die untere Leiste auf diesen Punkt umzustellen. */
function pinZeichnen(p, km, aktiv, idx) {
  const q = p.quality;
  /* Die Farbe des Pins sagt dasselbe wie die Marke in der Leiste. Ein
   * hinausgerechneter Punkt sah bisher aus wie ein abgelesener Stein — und
   * gerade der steht weiter draußen, wo man genau hinsehen sollte. */
  const cls = q === 'naechster' ? 'bad'
    : (q === 'karte' || q === 'extrapoliert' || q === 'karte-gleis') ? 'warn' : '';
  const m = L.marker([p.lat, p.lon], {
    icon: L.divIcon({
      // Spitze: Mitte (13, 13) plus die halbe Diagonale 13·√2 nach unten, abzüglich der Rundung
      className: '', iconSize: [26, 26], iconAnchor: [13, 31],
      html: `<div class="pin ${cls}${aktiv ? '' : ' neben'}"></div>`
    }),
    interactive: idx >= 0, keyboard: false,
    zIndexOffset: aktiv ? 1000 : 900
  }).addTo(pointLayer);

  if (idx >= 0) m.on('click', ev => { L.DomEvent.stopPropagation(ev); reiheWaehlen(idx); });

  /* Der Kilometer steht auch unten in der Leiste — die verdeckt aber gerade beim
   * Weiterschieben der Karte den Blick, und auf einem Bildschirmfoto fehlt sonst
   * die Angabe zum Pin. Bei mehreren Punkten ist sie ohnehin die einzige Art,
   * sie auseinanderzuhalten. */
  if (km != null) {
    L.marker([p.lat, p.lon], {
      interactive: false, keyboard: false, zIndexOffset: aktiv ? 1000 : 900,
      icon: L.divIcon({
        className: '', iconSize: null, iconAnchor: [-16, 15],
        html: `<span class="pin-km ${cls}${aktiv ? '' : ' neben'}">km ${fmtKm(km)}</span>`
      })
    }).addTo(pointLayer);
  }
  return m;
}

/** Einen Punkt der Reihe in die untere Leiste holen — ohne neu zu rechnen. */
function reiheWaehlen(i) {
  const r = reihe[i];
  if (!r) return;
  reiheAktiv = i;
  view.km = r.km;
  view.point = r.punkt;
  gleiswegZuletzt = r.pfad || null;
  zeichneGleiswegNeu();
  drawPoint();
  renderBottom();
  updateHash();
  if (!map.getBounds().pad(-0.12).contains([r.punkt.lat, r.punkt.lon])) {
    sichtSetzen([r.punkt.lat, r.punkt.lon]);
  }
}

/* ---- Punkt von Hand setzen ----
 *
 * Ein kurzer Tipp liest sofort den Kilometer ab. Das ist bequem, im Gelände
 * aber schnell versehentlich, und deshalb gibt es den Fadenkreuz-Knopf zum
 * Abschalten. Gewünscht war stattdessen ein bewusster Griff: lange drücken
 * (am Rechner die rechte Maustaste) setzt einen Punkt, und erst ein Knopf in
 * der Sprechblase rechnet ihn auf die Strecke — genau wie bei einem Punkt aus
 * einer KML-Datei. Von dort führt auch der Weg direkt zu Google Maps.
 */
const MERK_DAUER = 500;      // ms, ab wann ein Druck als „lang" gilt
const MERK_WACKEL = 12;      // px, so viel darf der Finger dabei wandern

function merkPunkt(lat, lon) {
  if (tippZiel()) return;
  merkLayer.clearLayers();
  const wo = [lat, lon];

  L.marker(wo, {
    pane: 'kmlIconPane', keyboard: false,
    icon: L.divIcon({ className: '', html: '<div class="merk-pin"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9] })
  }).addTo(merkLayer);

  const blase = L.popup({
    className: 'kml-pop', maxWidth: 300,
    autoPanPaddingTopLeft: L.point(14, 86), autoPanPaddingBottomRight: L.point(14, 24)
  }).setLatLng(wo).setContent(
    `<b>Gesetzter Punkt</b>` +
    // UTM statt Grad: so, wie es Tachymeter und Koordinatenlisten führen (wie bei den Festpunkten)
    `<span>${utmText(lat, lon)}</span>` +
    hoeheZeile(lat, lon) +
    mapsKnopf(lat, lon) +
    `<button type="button" class="kml-km" data-merkkm>Kilometer bestimmen` +
    `<small>rechnet die Stelle auf die Strecke</small></button>` +
    routeKnopf(lat, lon, 'Gesetzter Punkt')
  ).openOn(map);

  /* Sprechblase zu heißt Punkt weg — über das ×, mit Escape oder durch einen
   * Griff daneben. Ein eigener Knopf „Punkt entfernen" wäre daneben nur eine
   * zweite Art, dasselbe zu tun. */
  const aufraeumen = ev => {
    if (ev.popup !== blase) return;
    merkLayer.clearLayers();
    map.off('popupclose', aufraeumen);
  };
  map.on('popupclose', aufraeumen);

  const el = blase.getElement();
  hoeheFuellen(el);
  const knopf = el && el.querySelector('[data-merkkm]');
  if (knopf) knopf.addEventListener('click', () => {
    map.closePopup();
    kmAnStelle(lat, lon, PUNKT_TOL);
  });
}

/** „E 640123,45 · N 5554321,98 (UTM 32)" — ohne Tausenderpunkte, die Zone dahinter. */
function utmText(lat, lon) {
  const [e, n] = utm32Hin(lat, lon);
  const fmt = v => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  return `E ${fmt(e)} · N ${fmt(n)} (UTM 32)`;
}

function merkPunktBinden() {
  let zuletzt = 0;

  map.on('contextmenu', ev => {
    L.DomEvent.preventDefault(ev);
    // Auf dem Gerät schickt der Browser nach einem langen Druck oft noch ein
    // contextmenu hinterher — das wäre dann der zweite Auslöser für dieselbe Geste.
    if (Date.now() - zuletzt < 900) return;
    zuletzt = Date.now();
    merkPunkt(ev.latlng.lat, ev.latlng.lng);
  });

  const flaeche = map.getContainer();
  let uhr = null, start = null;

  const abbrechen = () => { clearTimeout(uhr); uhr = null; start = null; };

  flaeche.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 1) { abbrechen(); return; }
    const t = ev.touches[0];
    start = { x: t.clientX, y: t.clientY };
    clearTimeout(uhr);
    uhr = setTimeout(() => {
      uhr = null;
      const k = flaeche.getBoundingClientRect();
      const p = map.containerPointToLatLng(L.point(start.x - k.left, start.y - k.top));
      zuletzt = Date.now();
      merkPunkt(p.lat, p.lng);
    }, MERK_DAUER);
  }, { passive: true });

  flaeche.addEventListener('touchmove', ev => {
    if (!start || !ev.touches.length) return;
    const t = ev.touches[0];
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > MERK_WACKEL) abbrechen();
  }, { passive: true });

  flaeche.addEventListener('touchend', abbrechen, { passive: true });
  flaeche.addEventListener('touchcancel', abbrechen, { passive: true });
}

/* Street View an jedem Link mit data-sv — einmal am Dokument, weil die Leiste
 * ständig neu gezeichnet wird. Geöffnet wird erst beim Loslassen: Ein Fenster darf
 * der Browser nur aus einer Nutzerhandlung heraus aufmachen, und das ist beim
 * Finger erst pointerup, nicht der Ablauf des Zeitgebers. Bricht der Browser die
 * Geste ab (pointercancel) oder blockt er das Fenster, wird der Link selbst zum
 * Street-View-Link — dann reicht ein Tipp. */
function svBinden() {
  let timer = 0, link = null, lang = false, maus = false, zuletzt = 0;

  const url = a => {
    const [lat, lon] = a.dataset.sv.split(',').map(Number);
    return svUrl(lat, lon, a.dataset.blick ? Number(a.dataset.blick) : NaN);
  };
  const umstellen = a => {
    a.href = url(a);
    delete a.dataset.sv;
  };
  const oeffnen = a => {
    if (Date.now() - zuletzt < 700) return;
    zuletzt = Date.now();
    const w = window.open(url(a), '_blank');
    if (w) w.opener = null;
    else umstellen(a);
  };
  const ende = () => { clearTimeout(timer); timer = 0; };

  document.addEventListener('pointerdown', ev => {
    ende();
    link = ev.target.closest && ev.target.closest('a[data-sv]');
    lang = false;
    if (!link) return;
    maus = ev.pointerType === 'mouse';
    if (ev.button === 0) timer = setTimeout(() => { timer = 0; lang = true; }, MERK_DAUER);
  });
  document.addEventListener('pointerup', () => {
    ende();
    if (link && lang && !maus) oeffnen(link);
  });
  document.addEventListener('pointercancel', () => {
    ende();
    if (link && lang && link.dataset.sv) umstellen(link);
  });
  document.addEventListener('contextmenu', ev => {
    const a = ev.target.closest && ev.target.closest('a[data-sv]');
    if (!a) return;
    ev.preventDefault();
    link = a; lang = true;
    if (ev.pointerType === 'mouse' || maus) oeffnen(a);   // Rechtsklick; der Finger öffnet beim Loslassen
  });
  // Nach dem langen Druck nicht noch zusätzlich Google Maps öffnen
  document.addEventListener('click', ev => {
    const a = ev.target.closest && ev.target.closest('a[data-sv]');
    if (!a || !lang) return;
    ev.preventDefault();
    lang = false;
    if (maus) oeffnen(a);
  }, true);
}

/* ============================ Messen ============================ */

/* Zwei Abläufe im Messmenü, beide ohne Netzabfrage — im Gelände zählt zuerst,
 * wie weit es geradeaus ist, und das rechnet der Browser selbst:
 *
 * Polygon aus Punkten — Punkte antippen, Luftlinie je Abschnitt und als Summe.
 * Ab drei Punkten schließt ein Tipp auf den ersten den Zug; dann stehen Fläche
 * und Umfang da. Liegen Anfang und Ende eines offenen Zugs auf der geladenen
 * Strecke, steht die Differenz nach Kilometrierung dabei — für die Arbeit oft
 * die eigentliche Antwort.
 *
 * Live — ein Startpunkt, und die Entfernung zum Fadenkreuz läuft beim Schieben
 * der Karte mit, bei laufender Ortung oben auch die zum eigenen Standort.
 * „Genau 20 m von hier" wird so zur Schiebe- oder Laufaufgabe.
 *
 * Bis Oktober 2026 war beides ein Modus, der alles zugleich anbot: fünf Knöpfe,
 * eine Linie zur Mitte, die immer mitlief, und keine Fläche.
 *
 * Gerechnet wird auf dem Ellipsoid (ellipsoidAbstand aus hoehen.js), nicht auf
 * der Kugel wie bei den Kilometern: Die Kugel liegt in Ost-West-Richtung um
 * 0,31 % zu kurz — 31 cm auf 100 m, nachgerechnet bei Bamberg; Nord-Süd 0,03 %.
 *
 * Die Linien liegen in der normalen Vektorebene von Leaflet und nicht in einer
 * eigenen Pane: Eigene Panes rechnet leaflet-rotate falsch, siehe kmlPane. */
const MESS_FARBE = '#ff9f0a';        // Amber, damit es sich von Steinen (blau) und Gleisweg (grün) abhebt
const MESS_TOL = 60;                 // bis zu so viel Abstand gilt ein Punkt als auf der Strecke

const MESS_FANG_PX = 26;             // Umkreis, in dem Fangpunkte angeboten werden
/* Von selbst gefangen wird nur innerhalb dieser Strecke. Der Umkreis in
 * Bildpunkten allein genügt nicht: Auf Zoomstufe 15 sind 26 px rund 125 m, und
 * bei einer dichten Punktdatei würde dann jeder Tipp still auf irgendeinen Punkt
 * springen — die Messung wäre um diese Strecke falsch, ohne dass man es sieht.
 * Weiter entfernte Punkte stehen weiter zur Auswahl, nur eben nicht automatisch.
 *
 * 20 m, weil genaues Arbeiten ohnehin nah herangezoomt stattfindet: Ab Zoomstufe
 * 18 sind 26 px selbst nur noch 15 m, dort bestimmt also der Bildabstand. Beim
 * groben Messen weiter außen bleibt der Punkt dagegen dort, wo getippt wurde. */
const MESS_FANG_MAX_M = 20;
/* So nah am ersten Punkt schließt ein Tipp das Polygon — in Bildpunkten, denn
 * gemeint ist „den Punkt getroffen", gleich auf welcher Zoomstufe. */
const MESS_SCHLIESS_PX = 24;

let messModus = false;
let messArt = 'polygon';             // 'polygon' oder 'live'
let messPunkte = [];                 // beim Live genau einer: der Startpunkt
let messZu = false;                  // Polygon geschlossen?
let messLayer = null;
let messLiveLayer = null;            // nur die laufende Linie zum Fadenkreuz
let messKandidaten = [];             // Auswahl für den zuletzt gesetzten Punkt
let messWahl = 0;
let messLetzterTipp = 0;             // Zeitpunkt des letzten angenommenen Tipps

const messText = m => m < 1000 ? nfM.format(m) + ' m' : fmtKm(m / 1000) + ' km';
/** Beim Messen unter 100 m auf Dezimeter: Auf kurze Strecken zählt jeder halbe Meter. */
const messTextFein = m => m < 100 ? nfH.format(m) + ' m' : messText(m);

function flaecheText(m2) {
  if (m2 < 100) return nfH.format(m2) + ' m²';
  if (m2 < 10000) return nfM.format(m2) + ' m²';
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m2 / 10000) + ' ha';
}

function messLaenge() {
  let summe = 0;
  for (let i = 1; i < messPunkte.length; i++) summe += ellipsoidAbstand(messPunkte[i - 1], messPunkte[i]);
  if (messZu) summe += ellipsoidAbstand(messPunkte[messPunkte.length - 1], messPunkte[0]);
  return summe;
}

/** Fläche des geschlossenen Zugs in m², auf dem Ellipsoid: Gaußsche
 *  Trapezformel in UTM, geteilt durch das Quadrat des Maßstabs in der Mitte —
 *  UTM vergrößert in Bayern um bis zu 0,12 %, die Fläche also um bis zu 0,24 %.
 *  Gerechnet relativ zum ersten Punkt, sonst fräßen die großen Koordinaten die
 *  Stellen hinter dem Komma. */
function messFlaeche() {
  const utm = messPunkte.map(p => utm32Hin(p[0], p[1]));
  const [x0, y0] = utm[0];
  let doppelt = 0, ostSumme = 0;
  utm.forEach(([x, y], i) => {
    const [x2, y2] = utm[(i + 1) % utm.length];
    doppelt += (x - x0) * (y2 - y0) - (x2 - x0) * (y - y0);
    ostSumme += x;
  });
  const abMitte = ostSumme / utm.length - 500000;
  const k = 0.9996 * (1 + abMitte * abMitte / (2 * 6381000 ** 2));   // 6381 km: mittlerer Krümmungsradius
  return Math.abs(doppelt) / 2 / (k * k);
}

/** Kreuzt sich der Umring? Dann ergibt die Trapezformel keine sinnvolle Fläche. */
function messKreuzt() {
  const n = messPunkte.length;
  if (n < 4) return false;
  const u = messPunkte.map(p => utm32Hin(p[0], p[1]));
  const seite = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;           // über den Schluss benachbart
      const a = u[i], b = u[(i + 1) % n], c = u[j], d = u[(j + 1) % n];
      if (seite(a, b, c) * seite(a, b, d) < 0 && seite(c, d, a) * seite(c, d, b) < 0) return true;
    }
  }
  return false;
}

/** Kilometerdifferenz zwischen erstem und letztem Punkt, falls beide auf der Strecke liegen. */
function messKmDifferenz() {
  const e = view.ref && lineCache.get(view.ref);
  if (!e || e.sorted.length < 2 || messPunkte.length < 2) return null;
  const a = projectOnLine(e.sorted, messPunkte[0][0], messPunkte[0][1]);
  const b = projectOnLine(e.sorted, messPunkte[messPunkte.length - 1][0], messPunkte[messPunkte.length - 1][1]);
  if (!a || !b || a.dist > MESS_TOL || b.dist > MESS_TOL) return null;
  return { km: Math.abs(b.km - a.km), von: a.km, bis: b.km };
}

/* Was liegt nah genug am Tipp, um gefangen zu werden? Kilometersteine der
 * geladenen Strecke und Objekte aus sichtbaren KML-Dateien. Gefangen wird sofort
 * auf das Nächstliegende — die übrigen stehen zum Umschalten in der Leiste, denn
 * gerade bei Punktpaaren wenige Meter auseinander trifft der Finger nicht
 * unbedingt den gemeinten. */
function messKandidatenFinden(latlng) {
  const tol = Math.max(pixelInMeter(latlng, MESS_FANG_PX), 2);
  const raus = [];

  const e = view.ref && lineCache.get(view.ref);
  if (e) {
    for (const p of e.sorted) {
      const d = haversine(latlng.lat, latlng.lng, p.lat, p.lon);
      if (d <= tol) raus.push({ name: 'km ' + fmtKm(p.km), quelle: 'Stein ' + (p.ref || view.ref), koord: [p.lat, p.lon], dist: d });
    }
  }

  for (const a of kmlAkten) {
    if (!a.sichtbar) continue;
    for (const o of a.objekte) {
      if (!kmlSichtbarObj(a, o)) continue;
      const k = kmlNaechsterKnoten(o, latlng);
      if (!k) continue;
      const d = haversine(latlng.lat, latlng.lng, k[0], k[1]);
      if (d <= tol) raus.push({ name: o.name || '(ohne Namen)', quelle: a.name, koord: k, dist: d });
    }
  }

  raus.sort((x, y) => x.dist - y.dist);

  /* Dieselbe Stelle nicht mehrfach anbieten: Ist eine Datei zweimal geladen oder
   * liegen zwei Objekte auf derselben Koordinate, verdrängen die Doppelgänger
   * sonst die tatsächlich anderen Punkte aus der Auswahl. */
  const gesehen = new Set();
  const eindeutig = [];
  for (const k of raus) {
    const stelle = k.koord[0].toFixed(7) + ',' + k.koord[1].toFixed(7);
    if (gesehen.has(stelle)) continue;
    gesehen.add(stelle);
    eindeutig.push(k);
  }
  return eindeutig.slice(0, 4);
}

/* Live: Vom Startpunkt läuft eine Linie zur Kartenmitte mit — beim Schieben
 * der Karte, bei jedem Bild. Die Linie wird dabei nicht neu gebaut, sondern nur
 * umgesetzt, und die Zahl steht am Fadenkreuz selbst — also immer an derselben
 * Stelle des Bildschirms, ruhig zu lesen, während sich die Karte bewegt. Ein
 * Neuaufbau je Bild würde flackern und wäre auf dem Handy zäh. */

let messLiveLinie = null;

/* Mit der Maus (06.11.2026: „das müsste doch nach der Maus gehen und nichts mit Mitte“)
 * läuft die Linie zum Mauszeiger statt zur Kartenmitte; das Kreuz ist dann unsichtbar
 * und trägt nur die Zahl neben dem Zeiger. messMaus ist die Stelle im Kartenbild —
 * schiebt man die Karte, bleibt der Zeiger stehen und die Linie läuft trotzdem mit.
 * Beim Polygon ebenso (06.11.2026 gewünscht): vom letzten Punkt zum Zeiger, daneben die
 * Länge des Abschnitts, der mit dem nächsten Klick entsteht — nicht bei geschlossener Fläche. */
const MAUS = matchMedia('(pointer: fine)');
let messMaus = null;

function messMausBinden() {
  map.on('mousemove', ev => {
    if (!messModus || !MAUS.matches) return;
    messMaus = ev.containerPoint;
    messLiveZeichnen();
  });
}

function messLiveZeichnen() {
  const zahl = $('#mitteZahl');
  const gross = $('#liveZahl');
  const kreuz = $('#mitteKreuz');
  const maus = MAUS.matches && messModus;
  const poly = maus && messArt !== 'live';
  if (kreuz) kreuz.classList.toggle('maus', maus);

  if (!messModus || (messArt !== 'live' && !poly) || (poly && messZu) || !messPunkte.length || (maus && !messMaus)) {
    if (messLiveLinie) { messLiveLinie.remove(); messLiveLinie = null; }
    if (zahl) zahl.textContent = '';
    if (gross) gross.textContent = '—';
    if (maus && kreuz) kreuz.hidden = true;
    return;
  }

  const von = poly ? messPunkte[messPunkte.length - 1] : messPunkte[0];
  const mitte = maus ? map.containerPointToLatLng(messMaus) : map.getCenter();
  if (maus && kreuz) {
    const r = map.getContainer().getBoundingClientRect();
    kreuz.style.left = (r.left + messMaus.x) + 'px';
    kreuz.style.top = (r.top + messMaus.y) + 'px';
    kreuz.hidden = false;
  }
  const d = ellipsoidAbstand(von, [mitte.lat, mitte.lng]);

  if (!messLiveLinie) {
    messLiveLinie = L.polyline([von, [mitte.lat, mitte.lng]], {
      color: MESS_FARBE, weight: 2, opacity: 0.75, dashArray: '4 5', interactive: false
    }).addTo(messLiveLayer);
  } else {
    messLiveLinie.setLatLngs([von, [mitte.lat, mitte.lng]]);
  }

  if (zahl) zahl.textContent = messTextFein(d);
  if (gross) gross.textContent = messTextFein(d);
}

function messBeschriften(wo, text, klasse = '') {
  L.marker(wo, {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: '', iconSize: null, iconAnchor: klasse ? [0, 0] : [-7, 7],
      html: `<span class="mess-lbl ${klasse}">${esc(text)}</span>` })
  }).addTo(messLayer);
}

function messZeichnen() {
  if (!messLayer) return;
  messLayer.clearLayers();
  if (messLiveLayer) messLiveLayer.clearLayers();
  messLiveLinie = null;
  messLiveZeichnen();

  const n = messPunkte.length;
  if (messArt === 'polygon') {
    if (messZu) {
      L.polygon(messPunkte, {
        color: MESS_FARBE, weight: 3, opacity: 0.95, fillColor: MESS_FARBE, fillOpacity: 0.14, interactive: false
      }).addTo(messLayer);
    } else if (n > 1) {
      L.polyline(messPunkte, {
        color: MESS_FARBE, weight: 3, opacity: 0.95, dashArray: '7 5', interactive: false
      }).addTo(messLayer);
    }
    // Maßzahl an jedem Abschnitt, beim geschlossenen auch am letzten zurück zum ersten
    for (let i = 0; i < (messZu ? n : n - 1); i++) {
      const a = messPunkte[i], b = messPunkte[(i + 1) % n];
      messBeschriften([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], messTextFein(ellipsoidAbstand(a, b)));
    }
    if (messZu && !messKreuzt()) {
      const mitte = [messPunkte.reduce((s, p) => s + p[0], 0) / n, messPunkte.reduce((s, p) => s + p[1], 0) / n];
      messBeschriften(mitte, flaecheText(messFlaeche()), 'mess-flaeche');
    }
  }

  /* Der Hinweis, dass ein Tipp auf den ersten Punkt schließt: ein gestrichelter
   * Ring, solange es etwas zu schließen gibt. Ohne ihn fände das niemand. */
  if (messArt === 'polygon' && !messZu && n >= 3) {
    L.circleMarker(messPunkte[0], {
      radius: 11, color: MESS_FARBE, weight: 2, dashArray: '3 3', fill: false, interactive: false
    }).addTo(messLayer);
  }

  if (messArt !== 'polygon') {
    messPunkte.forEach(p => {
      L.circleMarker(p, {
        radius: 5, color: '#fff', weight: 2, fillColor: MESS_FARBE, fillOpacity: 1, interactive: false
      }).addTo(messLayer);
    });
    return;
  }

  /* Beim Polygon lässt sich jeder Punkt ziehen — Griff wie bei A und B im
   * Profil (26 px). Beim Ziehen laufen nur die Linie und die Fläche mit,
   * gefangen und neu beschriftet wird beim Loslassen. Ein Tipp auf einen Griff
   * erreicht die Karte nicht mehr; deshalb schließt der Griff des ersten Punkts
   * die Fläche selbst. */
  const umriss = messLayer.getLayers().find(l => l instanceof L.Polyline) || null;
  messPunkte.forEach((p, i) => {
    const m = L.marker(p, {
      draggable: true, keyboard: false, autoPan: false, zIndexOffset: 500,
      icon: L.divIcon({ className: 'prof-griff', iconSize: [26, 26], iconAnchor: [13, 13], html: '<i></i>' })
    }).addTo(messLayer);
    m.on('drag', () => { if (umriss) umriss.setLatLngs(messPunkte.map((q, j) => j === i ? m.getLatLng() : q)); });
    m.on('dragend', () => messPunktGezogen(i, m.getLatLng()));
    if (i === 0 && !messZu && n >= 3) m.on('click', () => messTipp(m.getLatLng()));
  });
}

/** Ein Polygonpunkt wurde gezogen: dort ablegen, gefangen wie beim Tippen. */
function messPunktGezogen(i, latlng) {
  const nah = messKandidatenFinden(latlng);
  const f = nah.length && nah[0].dist <= MESS_FANG_MAX_M ? nah[0] : null;
  messPunkte[i] = f ? f.koord : [latlng.lat, latlng.lng];
  if (f) toast(`Gefangen auf ${f.name}`);
  messKandidaten = [];         // die Auswahl gehörte zum zuletzt getippten Punkt
  messZeichnen();
  messLeiste();
  liveLeiste();
}

/* Das ? links neben dem × der Werkzeugleisten: geht die Leiste Knopf für Knopf
 * durch (HILFE in tour.js; der Zuhörer hängt dort am Dokument). Im Quelltext
 * direkt nach dem ×, damit „.bb-hilfe ~ .bb-head" dem Kopf Platz macht. */
const hilfeKnopf = (art, was) => `<button type="button" class="bb-hilfe" data-hilfe="${art}" ` +
  `aria-label="${was} erklären" title="${was} erklären">` +
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/>' +
  '<path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.7v.5"/><circle class="voll" cx="12" cy="16.8" r="1.1"/></svg></button>';

function messLeiste() {
  const b = $('#bottom');
  b.dataset.art = 'werkzeug';      // ab 1010 px unten mittig statt in der Leiste
  b.hidden = false;
  const n = messPunkte.length;
  const live = messArt === 'live';

  const gewaehlt = n ? messKandidaten[messWahl] : null;
  const gefangen = gewaehlt && messWahl > 0 ? `gefangen auf ${gewaehlt.name}` : '';

  /* Auswahl nur zeigen, wenn es überhaupt etwas zu wählen gibt: der Tippstelle
   * gegenüber mindestens ein Fangpunkt. */
  const wahl = messKandidaten.length > 1 && n && !messZu
    ? `<div class="pick">${messKandidaten.map((k, i) =>
        `<button type="button" data-mw="${i}"${i === messWahl ? ' class="is-on"' : ''}>${esc(k.name)}` +
        `<small>${i ? esc(nfM.format(k.dist) + ' m · ' + k.quelle) : 'Tippstelle'}</small></button>`).join('')}</div>`
    : '';

  let titel, schild, zahl, notizen = [];
  if (live) {
    titel = 'Abstand';
    schild = '<span class="tag warn">Luftlinie</span>';
    const maus = MAUS.matches;
    zahl = `<span id="liveZahl">—</span>${n ? ` <small>bis zum ${maus ? 'Mauszeiger' : 'Fadenkreuz'}</small>` : ''}`;
    if (!n) notizen.push(maus ? 'Startpunkt anklicken — dann die Maus bewegen: Die Entfernung zum Zeiger läuft mit.'
      : 'Startpunkt antippen — dann die Karte schieben: Die Entfernung zum Fadenkreuz läuft mit.');
    else {
      notizen.push((gefangen ? `Start ${gefangen}. ` : '') + (maus ? 'Ein neuer Klick' : 'Ein neuer Tipp') + ' setzt den Start neu.');
      if (!ortAn()) notizen.push('Mit Standortverfolgung steht oben auch die Entfernung vom Start zum eigenen Standort.');
    }
  } else if (messZu) {
    titel = 'Polygon';
    schild = '<span class="tag warn">Fläche</span>';
    const kreuzt = messKreuzt();
    zahl = kreuzt ? '—' : esc(flaecheText(messFlaeche()));
    notizen.push(`Umfang ${messTextFein(messLaenge())} · ${n} Punkte`);
    if (kreuzt) notizen.push({ warn: 'Der Umring kreuzt sich — eine Fläche ergibt das nicht. „Zurück" öffnet ihn wieder.' });
  } else {
    titel = 'Polygon';
    schild = '<span class="tag warn">Luftlinie</span>';
    zahl = n > 1 ? esc(messTextFein(messLaenge())) : '—';
    const letzte = n > 1 ? ellipsoidAbstand(messPunkte[n - 2], messPunkte[n - 1]) : 0;
    const klick = MAUS.matches;
    if (!n) notizen.push(klick ? 'Ein Klick in die Karte setzt den ersten Punkt.' : 'Auf die Karte tippen setzt den ersten Punkt.');
    else if (n === 1) notizen.push((klick ? 'Nächsten Punkt anklicken' : 'Nächsten Punkt antippen') + (gefangen ? ` — ${gefangen}` : '') + '.');
    else notizen.push(`${n} Punkte · letzter Abschnitt ${messTextFein(letzte)}${gefangen ? ' · ' + gefangen : ''}`);
    if (n >= 3) notizen.push((klick ? 'Ein Klick' : 'Tipp') + ' auf den ersten Punkt schließt die Fläche.');
    const kd = messKmDifferenz();
    if (kd) {
      notizen.push(`Nach Kilometrierung ${messText(kd.km * 1000)} — von km ${fmtKm(kd.von)} bis km ${fmtKm(kd.bis)} ` +
        `der Strecke ${view.ref}.`);
    }
  }

  b.innerHTML = `
    <button type="button" id="bbClose" class="bb-close" aria-label="Messen beenden">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    ${hilfeKnopf(live ? 'live' : 'polygon', titel)}
    <div class="bb-head">
      <p class="bb-title">${titel}</p>
      ${schild}
    </div>
    <p class="bb-coord mess-zahl">${zahl}</p>
    ${notizen.map(t => typeof t === 'string'
      ? `<p class="bb-note plain">${esc(t)}</p>` : `<p class="bb-note">${esc(t.warn)}</p>`).join('')}
    ${wahl}
    <div class="bb-actions knapp">
      ${live ? `${MAUS.matches ? '' : '<button type="button" id="messMitte">Mitte</button>'}
      <button type="button" id="messHier"${ortAn() ? '' : ' disabled'}>Standort</button>`
      // Beim Polygon kein Fadenkreuz und kein Standort: Punkte werden getippt und gezogen
      : `<button type="button" id="messZurueck"${n ? '' : ' disabled'}>Zurück</button>
      <button type="button" id="messLeer"${n ? '' : ' disabled'}>Leeren</button>`}
    </div>`;

  const an = (sel, f) => { const el = b.querySelector(sel); if (el) el.addEventListener('click', f); };
  an('#bbClose', messEnde);
  // Zurück öffnet eine geschlossene Fläche wieder, sonst nimmt es den letzten Punkt
  an('#messZurueck', () => {
    if (messZu) messZu = false;
    else messPunkte.pop();
    messKandidaten = [];      // gehören zum entfernten Punkt
    messZeichnen();
    messLeiste();
    liveLeiste();
  });
  an('#messLeer', () => {
    messPunkte = [];
    messZu = false;
    messKandidaten = [];
    messZeichnen();
    messLeiste();
    liveLeiste();
  });
  /* Die Kartenmitte als Punkt: Auf dem Handy trifft der Finger keine 20 cm, die
   * Karte lässt sich aber beliebig genau unter das feste Kreuz schieben. */
  an('#messMitte', () => messTipp(map.getCenter()));
  an('#messHier', () => {
    if (!ortLetzt) { toast('Erst den Standort verfolgen lassen.'); return; }
    messTipp(L.latLng(ortLetzt.lat, ortLetzt.lon));
  });

  // Umschalten zwischen Tippstelle und den Fangpunkten in der Nähe
  b.querySelectorAll('[data-mw]').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.mw);
    if (!messKandidaten[i] || !messPunkte.length) return;
    messWahl = i;
    messPunkte[messPunkte.length - 1] = messKandidaten[i].koord;
    messZeichnen();
    messLeiste();
    liveLeiste();
  }));

  messLiveZeichnen();      // die laufende Zahl gehört sofort in die neue Leiste
  updateBH();
}

function messStart(art = 'polygon') {
  if (laserAn) laserEnde(false);
  if (routeAn) routeEnde(false);
  if (profModus) profEnde();
  // Die Mappe teilt sich #bottom mit dem Messen; offen gelassen blieb ihr Knopf an
  if (mappeOffen) { mappeOffen = false; mappeStand = ''; mappeFertig = null; }
  messModus = true;
  messArt = art === 'live' ? 'live' : 'polygon';
  messPunkte = [];
  messZu = false;
  messKandidaten = [];
  messLetzterTipp = 0;
  map.closePopup();          // eine offene KML-Auskunft stört beim Messen
  if (!messLayer) messLayer = L.layerGroup().addTo(map);
  if (!messLiveLayer) messLiveLayer = L.layerGroup().addTo(map);

  /* Doppeltipp-Zoom aus, solange gemessen wird. Zwei Punkte schnell
   * hintereinander gesetzt wertet Leaflet sonst als Doppeltipp: Es zoomt und
   * verschluckt den zweiten Tipp — die Messung fehlt dann einen Punkt. */
  if (map.doubleClickZoom) map.doubleClickZoom.disable();
  messZeichnen();
  messLeiste();
  liveLeiste();
  closeSheet();
  syncButtons();
}

function messEnde() {
  messModus = false;
  messMaus = null;
  messPunkte = [];
  messZu = false;
  messKandidaten = [];
  if (messLayer) messLayer.clearLayers();
  if (messLiveLayer) messLiveLayer.clearLayers();
  messLiveLinie = null;
  messLiveZeichnen();
  if (map.doubleClickZoom) map.doubleClickZoom.enable();
  liveLeiste();
  syncButtons();
  renderBottom();      // zeigt wieder den vorherigen Punkt, falls es einen gibt
}

function messTipp(latlng) {
  latlng = L.latLng(latlng);

  /* Manche Geräte melden einen Tipp doppelt (nativ und über Leaflets
   * Tipperkennung). Zwei Meldungen dicht hintereinander an nahezu derselben
   * Stelle sind deshalb derselbe Tipp und nicht zwei Punkte. */
  const jetzt = Date.now();
  if (messPunkte.length && jetzt - messLetzterTipp < 350) {
    const vor = messPunkte[messPunkte.length - 1];
    const a = map.latLngToContainerPoint(latlng);
    const b = map.latLngToContainerPoint(L.latLng(vor[0], vor[1]));
    if (a.distanceTo(b) < 8) return;
  }
  messLetzterTipp = jetzt;

  if (messArt === 'polygon') {
    if (messZu) { toast('Die Fläche ist geschlossen — „Zurück" öffnet sie wieder.'); return; }
    /* Ein Tipp auf den ersten Punkt schließt — vor dem Fangen geprüft, sonst
     * spränge der Tipp womöglich auf einen Stein gleich daneben. */
    if (messPunkte.length >= 3) {
      const a = map.latLngToContainerPoint(latlng);
      const b = map.latLngToContainerPoint(L.latLng(messPunkte[0][0], messPunkte[0][1]));
      if (a.distanceTo(b) <= MESS_SCHLIESS_PX) {
        messZu = true;
        messKandidaten = [];
        messZeichnen();
        messLeiste();
        liveLeiste();
        return;
      }
    }
  }

  const nah = messKandidatenFinden(latlng);
  messKandidaten = [{ name: 'Getippt', quelle: '', koord: [latlng.lat, latlng.lng], dist: 0 }, ...nah];
  // Nur fangen, wenn der Punkt auch in Metern nah liegt — sonst bleibt die Tippstelle
  messWahl = nah.length && nah[0].dist <= MESS_FANG_MAX_M ? 1 : 0;
  if (messArt === 'live') messPunkte = [messKandidaten[messWahl].koord];   // Live kennt nur den Start
  else messPunkte.push(messKandidaten[messWahl].koord);
  messZeichnen();
  messLeiste();
  liveLeiste();
}

/* ---- Messmenü ----
 * Der Messknopf fragt zuerst, was gemessen werden soll. Ein Tipp daneben
 * schließt das Menü wieder, ebenso Escape. */
function messMenueAuf(auf) {
  const m = $('#messMenue'), k = $('#mapMessBtn');
  if (!m || !k) return;
  m.hidden = !auf;
  k.setAttribute('aria-expanded', String(auf));
  if (auf) {
    document.addEventListener('pointerdown', messMenueDraussen, true);
    document.addEventListener('keydown', messMenueTaste);
  } else {
    document.removeEventListener('pointerdown', messMenueDraussen, true);
    document.removeEventListener('keydown', messMenueTaste);
  }
}
function messMenueDraussen(ev) {
  if (!ev.target.closest('#messMenue, #mapMessBtn')) messMenueAuf(false);
}
function messMenueTaste(ev) {
  if (ev.key === 'Escape') messMenueAuf(false);
}

/* Am Desktop steht Messen unten rechts als runder Knopf und klappt Polygon und
 * Abstand nach oben aus — Profil und Mappe stehen in der Symbolspalte. */
function werkzeugMessAuf(auf) {
  const m = $('#werkzeugMessMenue'), k = $('#werkzeugMessBtn');
  if (!m || !k) return;
  m.hidden = !auf;
  k.setAttribute('aria-expanded', String(auf));
  if (auf) {
    document.addEventListener('pointerdown', werkzeugMessDraussen, true);
    document.addEventListener('keydown', werkzeugMessTaste);
  } else {
    document.removeEventListener('pointerdown', werkzeugMessDraussen, true);
    document.removeEventListener('keydown', werkzeugMessTaste);
  }
}
function werkzeugMessDraussen(ev) {
  if (!ev.target.closest('#werkzeugMessMenue, #werkzeugMessBtn')) werkzeugMessAuf(false);
}
function werkzeugMessTaste(ev) {
  if (ev.key === 'Escape') werkzeugMessAuf(false);
}

/* ============================ Laserpunkte ============================
 *
 * Messmenü → „Laserpunkte": Stelle antippen, Rahmen ziehen und Größe wählen,
 * laden; dann öffnet laser.js eine 3D-Ansicht. Die Punkte kommen aus den
 * LAZ-Kacheln der BVV (1 × 1 km, CC BY 4.0) und werden in laser-werk.js
 * ausgeschnitten. Nicht als COPC und in Fluglinien-Reihenfolge — jeder
 * Ausschnitt braucht die ganzen Kacheln, die er berührt (58–255 MB je Kachel
 * im Landkreis Neustadt/Aisch, laut BVV bis 1 GB), an einer Ecke vier.
 *
 * Deshalb: Solange „Laserpunkte" auf ist, zeigt die Karte das Kachelraster;
 * die Leiste nennt vorher, wie viel zu laden ist, und geladene Kacheln bleiben
 * gepackt im Worker (LASER_VORRAT), blau hinterlegt. Ein neuer Ausschnitt
 * daraus kostet nur das Entpacken. „Nur Boden" lässt Bewuchs und Gebäude weg —
 * dann trägt auch eine ganze Kachel, ohne zu dicht zu werden.
 *
 * Der Server der BVV gibt kein CORS frei: live über den Worker (/laser/…).
 * Auf localhost zuerst laser-probe/ (nicht im Repo), damit sich die Ansicht
 * zeigen lässt, bevor der Worker den Pfad kennt. */
const LASER_SEITE = { min: 50, max: 1000, schritt: 50 };   // Kantenlänge des Ausschnitts in m
const LASER_MAX_PUNKTE = 2000000;
// Gepackte Kacheln im Speicher: am Handy die Hälfte
const LASER_VORRAT = (matchMedia('(pointer: coarse)').matches ? 400 : 800) * 1e6;
const LASER_RASTER_AB = 12;               // Kachelraster ab dieser Zoomstufe
/* CC BY 4.0 verlangt Urheber, Lizenz und einen Hinweis auf Änderungen: in der
 * Ansicht unten (LASER_QUELLE), auf der Karte in der Quellenangabe (LASER_ATTR). */
const LASER_QUELLE = 'Bayerische Vermessungsverwaltung (CC BY 4.0), bearbeitet';
const LASER_ATTR = landQuelle('Laserpunkte', ['by']);
let laserAn = false;
let laserStelle = null;      // { e, n } — Mitte des Rahmens in UTM32
let laserZiel = null;        // { e, n, text } — gesuchte Stelle, im Viewer hervorgehoben
let laserSeite = 200;
let laserNurBoden = false;
const laserGroessen = new Map();   // Kachel → Bytes; 0 = gibt es nicht, −1 = unbekannt, null = wird geprüft
const laserAdressen = new Map();   // Kachel → Adresse
let laserImSpeicher = new Set();
let laserLaedt = null;       // { art, nr, von, wert, gesamt } während des Ladens
let laserWerk = null;
let laserLayer = null, laserRasterLayer = null, laserRahmen = null;
let laserFehler = '';
let laserGezogen = 0;        // Zeit des letzten Ziehens — der Tipp danach setzt nicht neu

function laserStart() {
  if (routeAn) routeEnde(false);
  if (profModus) profEnde(false);
  if (messModus) messEnde();
  if (mappeOffen) { mappeOffen = false; mappeStand = ''; mappeFertig = null; }
  laserAn = true;
  laserStelle = null;
  laserZiel = null;
  laserFehler = '';
  laserLaedt = null;
  map.closePopup();
  if (!laserRasterLayer) laserRasterLayer = L.layerGroup().addTo(map);
  if (!laserLayer) laserLayer = L.layerGroup().addTo(map);
  map.on('moveend', laserRasterZeichnen);
  map.attributionControl.addAttribution(LASER_ATTR);
  laserRasterZeichnen();
  laserLeiste();
  closeSheet();
  syncButtons();
}

function laserEnde(zeigen = true) {
  laserAn = false;
  laserStelle = null;
  laserZiel = null;
  laserLaedt = null;
  // Mit dem Worker geht auch der Speicher der Kacheln
  if (laserWerk) { laserWerk.terminate(); laserWerk = null; }
  laserImSpeicher = new Set();
  map.off('moveend', laserRasterZeichnen);
  map.attributionControl.removeAttribution(LASER_ATTR);
  if (laserLayer) laserLayer.clearLayers();
  if (laserRasterLayer) laserRasterLayer.clearLayers();
  laserRahmen = null;
  syncButtons();
  if (zeigen) renderBottom();
}

function laserBereich() {
  const { e, n } = laserStelle, h = laserSeite / 2;
  return { e0: e - h, n0: n - h, e1: e + h, n1: n + h };
}

/* Für die 3D-Ansicht (laser.js). Die Laserpunkte der BVV haben keine Farbe
 * (Punktformat 1); die Färbung „Luftbild“ holt sie aus dem DOP20 der BVV,
 * gleich in UTM32 — CORS gibt der Dienst frei, auch für localhost (05.11.2026). */
function laserLuftbildUrl(e0, n0, e1, n1, w, h) {
  return LAND_WMS.dop.by.replace('EPSG:3857', 'EPSG:25832') + `&BBOX=${e0},${n0},${e1},${n1}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/jpeg`;
}

/* KOSTRA-DWD-2020 für den Regen in der Laseransicht: Niederschlagshöhe je
 * Dauerstufe und Jährlichkeit an der Stelle. Daten aus werkzeug/kostra-bauen.py
 * in kostra/ (Blöcke zu 50 km, je rund 23 kB) — der DWD gibt KOSTRA nur zum
 * Herunterladen her, ohne CORS. Raster in ETRS89-LAEA (EPSG:3035). */
let kostraIndex = null;
const kostraBloecke = new Map();
/** Geografisch (Grad, ETRS89) → EPSG:3035. Formel nach EPSG Guidance Note 7-2;
 *  deren Beispiel 50° N, 5° O → 3962799,45 / 2999718,85 trifft sie auf den mm. */
function laea3035(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), e = Math.sqrt(e2), r = Math.PI / 180;
  const q = s => (1 - e2) * (s / (1 - e2 * s * s) - Math.log((1 - e * s) / (1 + e * s)) / (2 * e));
  const p0 = 52 * r, qP = q(1), b0 = Math.asin(q(Math.sin(p0)) / qP), b = Math.asin(q(Math.sin(lat * r)) / qP);
  const Rq = a * Math.sqrt(qP / 2);
  const D = a * Math.cos(p0) / Math.sqrt(1 - e2 * Math.sin(p0) ** 2) / (Rq * Math.cos(b0));
  const dl = (lon - 10) * r;
  const B = Rq * Math.sqrt(2 / (1 + Math.sin(b0) * Math.sin(b) + Math.cos(b0) * Math.cos(b) * Math.cos(dl)));
  return [4321000 + B * D * Math.cos(b) * Math.sin(dl), 3210000 + B / D * (Math.cos(b0) * Math.sin(b) - Math.sin(b0) * Math.cos(b) * Math.cos(dl))];
}
/** { dauern (min), jahre, hn[Dauer][Jahr] in mm, zelle (INDEX_RC des DWD), quelle } oder null. */
async function laserKostra(e, n) {
  if (!kostraIndex) kostraIndex = fetch('kostra/index.json').then(r => {
    if (!r.ok) throw new Error(`KOSTRA ${r.status}`);
    return r.json();
  }).catch(err => { kostraIndex = null; throw err; });
  const ix = await kostraIndex;
  const [x, y] = laea3035(...utm32Zurueck(e, n));
  const c = Math.floor((x - ix.x0) / ix.zelle), z = Math.floor((y - ix.y0) / ix.zelle);
  if (c < 0 || z < 0 || c >= ix.spalten || z >= ix.zeilen) return null;
  const name = `${Math.floor(c / ix.block)}_${Math.floor(z / ix.block)}`;
  if (!ix.bloecke.includes(name)) return null;
  if (!kostraBloecke.has(name)) kostraBloecke.set(name, fetch(`kostra/${name}.bin`).then(r => {
    if (!r.ok) throw new Error(`KOSTRA ${r.status}`);
    return r.arrayBuffer();
  }).then(b => new Uint16Array(b)).catch(err => { kostraBloecke.delete(name); throw err; }));
  const werte = await kostraBloecke.get(name);
  const nd = ix.dauern.length, nj = ix.jahre.length;
  const start = ((z % ix.block) * ix.block + c % ix.block) * nd * nj;
  const hn = [];
  for (let di = 0; di < nd; di++) {
    const zeile = [];
    for (let ji = 0; ji < nj; ji++) {
      const v = werte[start + di * nj + ji];
      if (v === ix.leer) return null;
      zeile.push(v / ix.faktor);
    }
    hn.push(zeile);
  }
  const zelle = String(ix.zeilen - 1 - z).padStart(3, '0') + String(c).padStart(3, '0');
  return { dauern: ix.dauern, jahre: ix.jahre, hn, zelle, quelle: ix.quelle };
}

/** Gebäude aus dem LoD2 (gebaeude.js), deren Umring den Bereich berührt. */
async function laserGebaeude(e0, n0, e1, n1) {
  // Für den Export auch über mehrere Kacheln: jede 2-km-Kachel dazwischen
  const kacheln = new Set();
  for (let e = Math.floor(e0 / LOD2_KACHEL); e <= Math.floor(e1 / LOD2_KACHEL); e++)
    for (let n = Math.floor(n0 / LOD2_KACHEL); n <= Math.floor(n1 / LOD2_KACHEL); n++) kacheln.add(`${e * 2}_${n * 2}`);
  const listen = await Promise.all([...kacheln].map(k => gebaeudeKachel(...k.split('_').map(Number))));
  const gesehen = new Set();
  return listen.flat().filter(b => b.bb[2] >= e0 && b.bb[0] <= e1 && b.bb[3] >= n0 && b.bb[1] <= n1
    && !gesehen.has(b.id) && gesehen.add(b.id));
}

/** Rechteck in UTM32 → [Süd, West, Nord, Ost] in Grad, über alle vier Ecken. */
function laserGrad(e0, n0, e1, n1) {
  const ecken = laserEcken(e0, n0, e1, n1);
  return [Math.min(...ecken.map(c => c[0])), Math.min(...ecken.map(c => c[1])),
    Math.max(...ecken.map(c => c[0])), Math.max(...ecken.map(c => c[1]))];
}

/* Streckenachsen der DB InfraGO im Ausschnitt, für die 3D-Ansicht. Alle
 * Strecken, deren Abschnitte den Rahmen berühren — parallele also mit, je
 * Abschnitt die Art (0 Achse, 1 Richtungsgleis, 2 Gegenrichtungsgleis). Die
 * Höhe gibt erst laser.js dazu, vom Laserboden. */
async function laserAchsen(e0, n0, e1, n1) {
  const [s, w, n, o] = laserGrad(e0, n0, e1, n1);
  const nummern = await ifgNummernImRechteck(s, w, n, o, 80);
  if (!nummern) return [];
  const strecken = await Promise.all([...nummern].map(nr => ifgStrecke(nr).catch(() => null)));
  const raus = [];
  for (const st of strecken) {
    if (!st) continue;
    for (const g of st.abschnitte) {
      if (g.bb[2] < s || g.bb[0] > n || g.bb[3] < w || g.bb[1] > o) continue;
      raus.push({ nr: st.nr, ri: g.ri, pts: g.pts.map(p => utm32Hin(p.lat, p.lon)) });
    }
  }
  return raus;
}

/* ---------- Straßennetz für die 3D-Ansicht ----------
 * Aus den Vektorkacheln von OpenFreeMap (OpenMapTiles-Schema), aus denen auch
 * die Karte ihre Straßen zeichnet — kein weiterer Dienst, der Service Worker
 * legt die Kacheln ab. Stufe 14 ist die feinste und trägt alle Wege. Gelesen
 * werden nur die Ebenen transportation (Linien mit class) und
 * transportation_name (Namen); Tunnel bleiben weg, sie lägen sonst auf dem
 * Gelände darüber. Die Höhe gibt laser.js vom Laserboden. */
const STR_KLASSEN = { motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 1, minor: 1, service: 1, busway: 1, track: 2, path: 2 };
let ofmVorlage = null;
function ofmKachelVorlage() {
  if (!ofmVorlage) ofmVorlage = fetch(OFM_KACHELN).then(r => {
    if (!r.ok) throw new Error(`OpenFreeMap: HTTP ${r.status}`);
    return r.json();
  }).then(j => j.tiles[0]).catch(err => { ofmVorlage = null; throw err; });
  return ofmVorlage;
}
const mvtZz = v => (v % 2 ? -(v + 1) / 2 : v / 2);
/** Eine Vektorkachel (Mapbox Vector Tile, Protobuf) lesen, nur die genannten
 *  Ebenen: { name: [{ typ, eig, linien: [[[u, v] 0…1]] }] }. */
function mvtLesen(daten, ebenen) {
  const b = new Uint8Array(daten), td = new TextDecoder(), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const vi = () => { let r = 0, f = 1, x; do { x = b[p++]; r += (x & 0x7f) * f; f *= 128; } while (x & 0x80); return r; };
  const ueber = typ => {
    if (typ === 0) vi(); else if (typ === 1) p += 8; else if (typ === 2) p += vi(); else if (typ === 5) p += 4;
    else throw new Error(`Vektorkachel: Feldtyp ${typ}`);
  };
  const gepackt = () => { const ende = vi() + p, r = []; while (p < ende) r.push(vi()); return r; };
  const text = () => { const l = vi(), t = td.decode(b.subarray(p, p + l)); p += l; return t; };
  const raus = {};
  while (p < b.length) {
    const t = vi();
    if (t >> 3 !== 3 || (t & 7) !== 2) { ueber(t & 7); continue; }
    const ende = vi() + p;
    let name = '', extent = 4096;
    const schluessel = [], werte = [], merkmale = [];
    while (p < ende) {
      const t2 = vi(), f = t2 >> 3;
      if (f === 1) name = text();
      else if (f === 2) {
        const fe = vi() + p, m = { tags: [], typ: 0, geo: [] };
        while (p < fe) {
          const t3 = vi(), f3 = t3 >> 3;
          if (f3 === 2) m.tags = gepackt(); else if (f3 === 3) m.typ = vi(); else if (f3 === 4) m.geo = gepackt(); else ueber(t3 & 7);
        }
        merkmale.push(m);
      } else if (f === 3) schluessel.push(text());
      else if (f === 4) {
        const we = vi() + p;
        let w = null;
        while (p < we) {
          const t3 = vi(), f3 = t3 >> 3;
          if (f3 === 1) w = text();
          else if (f3 === 2) { w = dv.getFloat32(p, true); p += 4; }
          else if (f3 === 3) { w = dv.getFloat64(p, true); p += 8; }
          else if (f3 === 4 || f3 === 5) w = vi();
          else if (f3 === 6) w = mvtZz(vi());
          else if (f3 === 7) w = !!vi();
          else ueber(t3 & 7);
        }
        werte.push(w);
      } else if (f === 5) extent = vi();
      else ueber(t2 & 7);
    }
    p = ende;
    if (!ebenen.includes(name)) continue;
    raus[name] = merkmale.map(m => {
      const eig = {};
      for (let i = 0; i + 1 < m.tags.length; i += 2) eig[schluessel[m.tags[i]]] = werte[m.tags[i + 1]];
      // Geometrie: Befehle MoveTo (1), LineTo (2), ClosePath (7), Versätze im Zickzack
      const linien = [];
      let x = 0, y = 0, akt = null;
      for (let i = 0; i < m.geo.length;) {
        const bef = m.geo[i] & 7, anz = Math.floor(m.geo[i] / 8);
        i++;
        if (bef === 7) { if (akt && akt.length) akt.push(akt[0]); continue; }
        for (let k = 0; k < anz; k++) {
          x += mvtZz(m.geo[i++]); y += mvtZz(m.geo[i++]);
          if (bef === 1) { akt = []; linien.push(akt); }
          akt.push([x / extent, y / extent]);
        }
      }
      return { typ: m.typ, eig, linien };
    });
  }
  return raus;
}
/** Straßen und Wege im Rechteck (UTM32): { strassen: [{ stufe 0 Haupt | 1 Neben | 2 Weg, pts }],
 *  namen: [{ name, pts }] }. */
async function laserStrassen(e0, n0, e1, n1) {
  const [s, w, n, o] = laserGrad(e0, n0, e1, n1);
  const Z = 14, N = 2 ** Z;
  const kx = lon => Math.floor((lon + 180) / 360 * N);
  const ky = lat => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * N);
  const x0 = kx(w), x1 = kx(o), y0 = ky(n), y1 = ky(s);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 100) throw new Error('Der Ausschnitt ist für das Straßennetz zu groß.');
  const vorlage = await ofmKachelVorlage();
  const kacheln = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) kacheln.push([x, y]);
  const strassen = [], namen = [];
  await Promise.all(kacheln.map(async ([x, y]) => {
    const r = await fetch(vorlage.replace('{z}', Z).replace('{x}', x).replace('{y}', y));
    if (!r.ok) throw new Error(`OpenFreeMap: HTTP ${r.status}`);
    const ebenen = mvtLesen(await r.arrayBuffer(), ['transportation', 'transportation_name']);
    const utm = ([u, v]) => utm32Hin(Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + v) / N))) * 180 / Math.PI, (x + u) / N * 360 - 180);
    for (const f of ebenen.transportation || []) {
      const stufe = STR_KLASSEN[f.eig.class];
      if (f.typ !== 2 || stufe == null || f.eig.brunnel === 'tunnel') continue;
      for (const l of f.linien) strassen.push({ stufe, pts: l.map(utm) });
    }
    for (const f of ebenen.transportation_name || []) {
      const name = f.eig['name:de'] || f.eig.name || f.eig.ref;
      if (f.typ !== 2 || !name || f.eig.brunnel === 'tunnel') continue;
      for (const l of f.linien) namen.push({ name, pts: l.map(utm) });
    }
  }));
  return { strassen, namen };
}

/* Sichtbare KML-Dateien im Ausschnitt: Punkte, Linien, Flächen als Umring.
 * Höhen aus der KML bleiben außen vor — die meisten Dateien tragen keine oder
 * eine in unbekanntem Bezug; laser.js legt alles auf den Laserboden. */
function laserKml(e0, n0, e1, n1) {
  const [s, w, n, o] = laserGrad(e0, n0, e1, n1);
  const drin = ([la, lo]) => la >= s && la <= n && lo >= w && lo <= o;
  const raus = [];
  for (const a of kmlAkten) {
    if (!a.sichtbar) continue;
    for (const ob of a.objekte) {
      if (!kmlSichtbarObj(a, ob)) continue;
      const linie = ob.art === 'l' ? ob.koord : ob.art === 'a' ? [...ob.koord[0], ob.koord[0][0]] : null;
      if (ob.art === 'p' ? !drin(ob.koord) : !linie.some(drin)) continue;
      raus.push({ art: ob.art === 'p' ? 'p' : 'l', name: kmlLabelText(a, ob), farbe: a.farbe,
        pts: (ob.art === 'p' ? [ob.koord] : linie).map(([la, lo]) => utm32Hin(la, lo)) });
    }
  }
  return raus;
}

/* Aus dem Ergebnis heraus (Knopf „3D“): Rahmen auf den gesuchten Ort, laden,
 * und dort in der Ansicht hervorgehoben. */
function laserAufErgebnis() {
  const p = view.point;
  if (!p) return;
  const text = $('#bottom .bb-title') ? $('#bottom .bb-title').textContent : '';
  laserStart();
  const [e, n] = utm32Hin(p.lat, p.lon);
  laserZiel = { e, n, text };
  laserStelle = { e, n };
  laserNeuGewaehlt();
  const { e0, n0, e1, n1 } = laserBereich();
  kartePassen(L.latLngBounds(laserEcken(e0, n0, e1, n1)), { padding: [30, 30], maxZoom: 17 });
  laserLaden();
}

/** Die Kacheln, die der Rahmen berührt — eine bis vier. */
function laserKacheln() {
  const { e0, n0, e1, n1 } = laserBereich(), aus = [];
  for (let ke = Math.floor(e0 / 1000); ke <= Math.floor((e1 - 0.001) / 1000); ke++) {
    for (let kn = Math.floor(n0 / 1000); kn <= Math.floor((n1 - 0.001) / 1000); kn++) aus.push(`${ke}_${kn}`);
  }
  return aus;
}

const laserEcken = (e0, n0, e1, n1) => [[e0, n0], [e1, n0], [e1, n1], [e0, n1]].map(([e, n]) => utm32Zurueck(e, n));
const laserFarbe = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1761a3';

/** Das Kachelraster im Ausschnitt: dünn gestrichelt, geladene Kacheln blau
 *  hinterlegt, die des Rahmens kräftig umrandet, ab Zoomstufe 14 mit Namen. */
function laserRasterZeichnen() {
  if (!laserAn || !laserRasterLayer) return;
  laserRasterLayer.clearLayers();
  if (map.getZoom() < LASER_RASTER_AB) return;
  const b = map.getBounds();
  const ecken = [[b.getSouth(), b.getWest()], [b.getSouth(), b.getEast()], [b.getNorth(), b.getWest()], [b.getNorth(), b.getEast()]]
    .map(([la, lo]) => utm32Hin(la, lo));
  const ke0 = Math.floor(Math.min(...ecken.map(c => c[0])) / 1000), ke1 = Math.floor(Math.max(...ecken.map(c => c[0])) / 1000);
  const kn0 = Math.floor(Math.min(...ecken.map(c => c[1])) / 1000), kn1 = Math.floor(Math.max(...ecken.map(c => c[1])) / 1000);
  if ((ke1 - ke0 + 1) * (kn1 - kn0 + 1) > 400) return;
  const farbe = laserFarbe(), gewaehlt = new Set(laserStelle ? laserKacheln() : []), namen = map.getZoom() >= 14;
  for (let ke = ke0; ke <= ke1; ke++) {
    for (let kn = kn0; kn <= kn1; kn++) {
      const k = `${ke}_${kn}`, da = laserImSpeicher.has(k), wahl = gewaehlt.has(k);
      L.polygon(laserEcken(ke * 1000, kn * 1000, ke * 1000 + 1000, kn * 1000 + 1000), {
        color: wahl ? farbe : '#ffffff', weight: wahl ? 1.5 : 1, opacity: wahl ? 0.9 : 0.55, dashArray: wahl ? null : '4 4',
        fillColor: farbe, fillOpacity: da ? 0.16 : 0, interactive: false
      }).addTo(laserRasterLayer);
      if (namen) {
        const mitte = utm32Zurueck(ke * 1000 + 500, kn * 1000 + 500);
        L.marker(mitte, { interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'laser-kachel-name', html: `${k}${da ? '<br>im Speicher' : ''}`, iconSize: null }) })
          .addTo(laserRasterLayer);
      }
    }
  }
}

function laserRahmenZeichnen() {
  if (!laserLayer) return;
  if (!laserStelle) { laserLayer.clearLayers(); laserRahmen = null; return; }
  const { e0, n0, e1, n1 } = laserBereich();
  const ecken = laserEcken(e0, n0, e1, n1);
  if (laserRahmen) { laserRahmen.setLatLngs(ecken); return; }
  laserRahmen = L.polygon(ecken, { color: laserFarbe(), weight: 2.5, fillOpacity: 0.14, className: 'laser-rahmen' }).addTo(laserLayer);
  laserZiehenBinden();
}

/* Den Rahmen ziehen: am Pfad selbst greifen, solange gezogen wird, steht die
 * Karte. Über die Pointer-Ereignisse des Pfads, damit es mit Maus und Finger
 * gleich geht; die Lage rechnet Leaflet samt Drehung (mouseEventToLatLng). */
function laserZiehenBinden() {
  const pfad = laserRahmen.getElement();
  if (!pfad) return;
  pfad.addEventListener('pointerdown', ev => {
    if (laserLaedt) return;
    ev.stopPropagation();
    ev.preventDefault();
    const start = utm32Hin(...(ll => [ll.lat, ll.lng])(map.mouseEventToLatLng(ev)));
    const vorher = { ...laserStelle };
    map.dragging.disable();
    pfad.setPointerCapture(ev.pointerId);
    const ziehen = e => {
      const p = utm32Hin(...(ll => [ll.lat, ll.lng])(map.mouseEventToLatLng(e)));
      laserStelle = { e: vorher.e + p[0] - start[0], n: vorher.n + p[1] - start[1] };
      laserRahmenZeichnen();
    };
    const los = () => {
      pfad.removeEventListener('pointermove', ziehen);
      pfad.removeEventListener('pointerup', los);
      pfad.removeEventListener('pointercancel', los);
      map.dragging.enable();
      laserGezogen = Date.now();
      laserNeuGewaehlt();
    };
    pfad.addEventListener('pointermove', ziehen);
    pfad.addEventListener('pointerup', los);
    pfad.addEventListener('pointercancel', los);
  });
}

async function laserAdresse(kachel) {
  if (laserAdressen.has(kachel)) return laserAdressen.get(kachel);
  let url = `${HOEHEN.proxy}/laser/${kachel}.laz`;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const lokal = `laser-probe/${kachel}.laz`;
    try { if ((await fetch(lokal, { method: 'HEAD' })).ok) url = lokal; } catch (e) { /* dann der Worker */ }
  }
  laserAdressen.set(kachel, url);
  return url;
}

/** Größe der Kacheln im Rahmen nachsehen (HEAD), soweit noch unbekannt. */
function laserGroessenHolen() {
  for (const k of laserKacheln()) {
    if (laserGroessen.has(k)) continue;
    laserGroessen.set(k, null);
    laserAdresse(k)
      .then(url => fetch(url, { method: 'HEAD' }))
      .then(r => laserGroessen.set(k, r.ok ? Number(r.headers.get('Content-Length')) || -1 : r.status === 404 ? 0 : -1))
      .catch(() => laserGroessen.set(k, -1))
      .then(() => { if (laserAn && !laserLaedt) laserLeiste(); });
  }
}

/** Nach Tippen, Ziehen oder neuer Größe: Rahmen, Raster, Größen, Leiste. */
function laserNeuGewaehlt() {
  laserFehler = '';
  laserRahmenZeichnen();
  laserRasterZeichnen();
  laserGroessenHolen();
  laserLeiste();
}

function laserTipp(latlng) {
  if (laserLaedt || Date.now() - laserGezogen < 400) return;
  const { lat, lng } = L.latLng(latlng);
  if (!inLandRahmen('by', lat, lng)) {
    laserFehler = 'Laserpunkte gibt es offen nur in Bayern.';
    laserLeiste();
    return;
  }
  const [e, n] = utm32Hin(lat, lng);
  laserStelle = { e, n };
  laserNeuGewaehlt();
}

async function laserLaden() {
  if (!laserStelle || laserLaedt) return;
  const namen = laserKacheln().filter(k => laserGroessen.get(k) !== 0);
  if (!namen.length) return;
  const kacheln = await Promise.all(namen.map(async kachel => ({ kachel, url: await laserAdresse(kachel) })));
  if (!laserAn || !laserStelle || laserLaedt) return;     // inzwischen beendet oder schon gestartet
  const seite = laserSeite, bereich = laserBereich(), nurBoden = laserNurBoden;
  laserLaedt = { art: 'laden', nr: 0, von: kacheln.length, wert: 0, gesamt: 0 };
  laserFehler = '';
  laserLeiste();
  if (!laserWerk) laserWerk = new Worker('laser-werk.js');
  laserWerk.onmessage = async ev => {
    const m = ev.data;
    if (m.art === 'vorrat') {
      laserImSpeicher = new Set(m.kacheln);
      laserRasterZeichnen();
      // Sonst stünde unten noch „… zu laden“, während die Karte schon „im Speicher“ zeigt
      const kosten = $('#laserKosten');
      if (kosten) kosten.textContent = laserKosten();
      return;
    }
    // Export aus der 3D-Ansicht (laser.js): dorthin weiterreichen
    if (m.export) { if (laserExportMelden) laserExportMelden(m); return; }
    const stufeVorher = laserLaedt && laserLaedt.art;
    if (m.art === 'laden') laserLaedt = { art: 'laden', nr: m.nr, von: m.von, wert: m.geladen, gesamt: m.gesamt };
    else if (m.art === 'lesen') laserLaedt = { art: 'lesen', nr: m.nr, von: m.von, wert: m.gelesen, gesamt: m.gesamt };
    else if (m.art === 'normalen') laserLaedt = { art: 'normalen', wert: m.fertig, gesamt: m.gesamt };
    else if (m.art === 'warten') laserLaedt = { art: 'warten', nr: m.nr, von: m.von, wert: 0, gesamt: 0, sekunden: m.sekunden, abgeschnitten: m.abgeschnitten, versuch: m.versuch };
    if (laserLaedt && m.art !== 'fertig' && m.art !== 'fehler' && m.art !== 'abgebrochen') {
      /* Nur Balken und Text nachführen, die Leiste nicht neu bauen: Bei dutzenden
       * Meldungen je Sekunde ginge ein Tipp auf „Abbrechen“ sonst zwischen Drücken
       * und Loslassen verloren (wie bei der Sprungreihe des Profils). */
      if (stufeVorher && laserFortschritt()) return;
      laserLeiste();
      return;
    }
    laserLaedt = null;
    if (m.art === 'fehler') laserFehler = m.text;
    else if (m.art === 'abgebrochen') laserFehler = '';
    else {
      try {
        const { laserAnsicht } = await import('./laser.js');
        if (!laserAn) return;                // beim ersten Mal lädt three.js — inzwischen beendet?
        const da = namen.filter(k => !m.fehlen.includes(k));
        laserAnsicht(m, { kachel: da.join(', '), quelle: LASER_QUELLE, seite, nurBoden,
          utm: utm32Hin, luftbild: laserLuftbildUrl, gebaeude: laserGebaeude, kostra: laserKostra,
          achsen: laserAchsen, strassen: laserStrassen, kml: laserKml, ziel: laserZiel,
          kacheln: kacheln.filter(k => da.includes(k.kachel)), bereich, exportieren: laserExportieren, exportAbbrechen: laserExportAbbrechen },
          { beimSchliessen: () => { if (laserExportMelden) laserExportAbbrechen(); } });
      } catch (err) {
        console.warn(err);
        laserFehler = err && err.message === 'WebGL2' ? 'Dieses Gerät kann die 3D-Ansicht nicht zeigen (kein WebGL2).'
          : '3D-Ansicht ließ sich nicht öffnen.';
      }
    }
    laserLeiste();
  };
  laserWerk.postMessage({ kacheln, bereich, max: LASER_MAX_PUNKTE, nurBoden, vorratMax: LASER_VORRAT });
}

/* Export aus der 3D-Ansicht: läuft im selben Worker, damit die Kacheln aus
 * dessen Vorrat kommen. auftrag wie in laser-werk.js (exportieren), melden
 * bekommt dessen Meldungen. Schließt die Ansicht, bricht er ab. */
let laserExportMelden = null;
function laserExportieren(auftrag, melden) {
  if (!laserWerk) { melden({ art: 'fehler', text: 'Die Laserpunkte sind nicht mehr geladen.' }); return; }
  laserExportMelden = m => {
    if (m.art === 'fertig' || m.art === 'fehler' || m.art === 'abgebrochen') laserExportMelden = null;
    melden(m);
  };
  laserWerk.postMessage({ art: 'export', ...auftrag, vorratMax: LASER_VORRAT });
}
function laserExportAbbrechen() {
  if (laserWerk && laserExportMelden) laserWerk.postMessage({ art: 'abbrechen' });
}

const laserMB = b => `${(b / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 0 })} MB`;

/** Stand des Ladens: Anteil (null = unbekannt, der Balken läuft dann durch) und Text. */
function laserStand(L_) {
  const anteil = L_.gesamt ? ((L_.nr || 0) + L_.wert / L_.gesamt) / (L_.von || 1) : null;
  const kachelNr = L_.von > 1 ? ` (Kachel ${L_.nr + 1} von ${L_.von})` : '';
  const text = L_.art === 'laden' ? `Laden${kachelNr} … ${laserMB(L_.wert)}${L_.gesamt ? ` von ${laserMB(L_.gesamt)}` : ''}`
    : L_.art === 'lesen' ? `Entpacken${kachelNr} …`
    : L_.art === 'warten' && L_.abgeschnitten ? `Die Kachel kam unvollständig an (Versuch ${L_.versuch} von 3) — neuer Versuch in ${L_.sekunden} s, sie lädt dann von vorn.`
    : L_.art === 'warten' ? `Verbindung unterbrochen — neuer Versuch in ${L_.sekunden} s oder sobald wieder Netz da ist. Die Kachel lädt dann von vorn.`
    : 'Normalen rechnen …';
  return { anteil, text };
}

/** Balken und Text in der stehenden Leiste nachführen; false, wenn es sie nicht gibt. */
function laserFortschritt() {
  const balken = $('#laserLadeBalken'), text = $('#laserLadeText');
  if (!balken || !text || !laserLaedt) return false;
  const { anteil, text: t } = laserStand(laserLaedt);
  balken.parentElement.classList.toggle('unbestimmt', anteil == null);
  balken.style.width = anteil == null ? '' : Math.round(anteil * 100) + '%';
  text.textContent = t;
  return true;
}

/** „2 Kacheln · 230 MB zu laden" — was der Rahmen kostet. */
function laserKosten() {
  const ks = laserKacheln();
  const fehlt = ks.filter(k => laserGroessen.get(k) === 0).length;
  const offen = ks.filter(k => laserGroessen.get(k) !== 0 && !laserImSpeicher.has(k));
  const teile = [`${ks.length - fehlt} ${ks.length - fehlt === 1 ? 'Kachel' : 'Kacheln'}`];
  if (ks.length === fehlt) return 'Für diese Stelle gibt es keine Laserkachel.';
  if (!offen.length) teile.push('alle im Speicher');
  else if (offen.some(k => laserGroessen.get(k) == null)) teile.push('Größe wird geprüft …');
  else {
    const summe = offen.reduce((s, k) => s + Math.max(0, laserGroessen.get(k)), 0);
    const unbekannt = offen.some(k => laserGroessen.get(k) < 0);
    teile.push(unbekannt && !summe ? 'Größe unbekannt, meist 40–250 MB je Kachel' : `${unbekannt ? 'über ' : ''}${laserMB(summe)} zu laden`);
    if (offen.length < ks.length - fehlt) teile.push(`${ks.length - fehlt - offen.length} im Speicher`);
  }
  return teile.join(' · ');
}

function laserLeiste() {
  if (!laserAn) return;
  const b = $('#bottom');
  b.dataset.art = 'werkzeug';      // ab 1010 px unten mittig statt in der Leiste
  b.hidden = false;
  let inhalt;
  if (!laserStelle) {
    inhalt = `<p class="bb-note${laserFehler ? '' : ' plain'}">${esc(laserFehler || 'Tippe auf die Stelle, die du dir ansehen willst. Das Raster zeigt die Kacheln zu 1 × 1 km.')}</p>`;
  } else {
    const L_ = laserLaedt;
    const { anteil, text: stufe } = L_ ? laserStand(L_) : { anteil: 0, text: '' };
    const keine = laserKacheln().every(k => laserGroessen.get(k) === 0);
    inhalt = `
      <p class="bb-sub" id="laserKosten">${esc(laserKosten())}</p>
      <label class="slider-row" for="laserSeite">Größe
        <input id="laserSeite" type="range" min="${LASER_SEITE.min}" max="${LASER_SEITE.max}" step="${LASER_SEITE.schritt}" value="${laserSeite}"${L_ ? ' disabled' : ''}>
        <span id="laserSeiteWert" class="slider-val">${laserSeite} m</span>
      </label>
      <div class="seg seg-paar" role="group" aria-label="Welche Punkte" style="margin-top:9px">
        <button type="button" class="seg-btn${laserNurBoden ? '' : ' is-on'}" data-laser-boden="0"${L_ ? ' disabled' : ''}>Alle Punkte</button>
        <button type="button" class="seg-btn${laserNurBoden ? ' is-on' : ''}" data-laser-boden="1"${L_ ? ' disabled' : ''}>Nur Boden</button>
      </div>
      ${L_ ? `<div class="laser-lade${anteil == null ? ' unbestimmt' : ''}"><div class="laser-lade-balken" id="laserLadeBalken"${anteil == null ? '' : ` style="width:${Math.round(anteil * 100)}%"`}></div></div>
        <p class="bb-note plain" id="laserLadeText">${esc(stufe)}</p>` : ''}
      ${laserFehler ? `<p class="bb-note">${esc(laserFehler)}</p>` : ''}
      ${!L_ && !laserFehler ? '<p class="bb-note plain">Rahmen ziehen zum Verschieben, Tipp daneben setzt ihn neu.</p>' : ''}
      <div class="bb-actions">${L_ ? '<button type="button" id="laserAbbrechenBtn">Abbrechen</button>'
        : `<button type="button" id="laserLadenBtn" class="maps"${keine ? ' disabled' : ''}>In 3D ansehen</button>`}</div>`;
  }
  b.innerHTML = `
    <button type="button" id="laserZu" class="bb-close" aria-label="Laserpunkte beenden">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    ${hilfeKnopf('laser', 'Laserpunkte')}
    <div class="bb-head"><p class="bb-title">Laserpunkte</p></div>
    ${inhalt}`;
  $('#laserZu').addEventListener('click', () => laserEnde());
  const regler = $('#laserSeite');
  if (regler) {
    // Beim Ziehen nur Rahmen und Zahlen nachführen; die Leiste neu erst beim Loslassen
    regler.addEventListener('input', () => {
      laserSeite = Number(regler.value);
      $('#laserSeiteWert').textContent = `${laserSeite} m`;
      laserRahmenZeichnen();
      $('#laserKosten').textContent = laserKosten();
    });
    regler.addEventListener('change', laserNeuGewaehlt);
  }
  b.querySelectorAll('[data-laser-boden]').forEach(k => k.addEventListener('click', () => {
    laserNurBoden = k.dataset.laserBoden === '1';
    laserLeiste();
  }));
  const laden = $('#laserLadenBtn');
  if (laden) laden.addEventListener('click', laserLaden);
  const abbrechen = $('#laserAbbrechenBtn');
  if (abbrechen) abbrechen.addEventListener('click', () => { if (laserWerk) laserWerk.postMessage({ art: 'abbrechen' }); });
  updateBH();
}

/* ============================ Höhe am Punkt ============================
 *
 * Geländehöhe aus dem DGM1 unter dem Ergebnis, in den Sprechblasen (langer
 * Druck, KML-Punkte) und beim Abstecken. hoehenPunkt holt dafür nur Kopf und
 * Streifen der Kachel, rund 25 kB (in BW die ganze Datei des Kilometers, rund
 * 3,4 MB). Die Zeile steht sofort als Platzhalter da und füllt sich, sobald der
 * Wert kommt — so springt die Leiste nicht. Klar außerhalb von Bayern und BW
 * gibt es sie gar nicht; liegt der Punkt zwar im Rahmen, aber außerhalb
 * (Thüringen, Hessen) oder fehlt das Netz, verschwindet sie wieder, statt eine
 * Fehlermeldung in jede Sprechblase zu schreiben. */
const HOEHE_MERK_MAX = 200;
const hoeheMerk = new Map();             // "lat,lon" → Versprechen der Höhe

function hoeheHolen(lat, lon) {
  const s = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  let p = hoeheMerk.get(s);
  if (!p) {
    // Ein Netzfehler wird nicht gemerkt: beim nächsten Mal neu versuchen
    p = hoehenPunkt(lat, lon).catch(() => { hoeheMerk.delete(s); return NaN; });
    hoeheMerk.set(s, p);
    while (hoeheMerk.size > HOEHE_MERK_MAX) hoeheMerk.delete(hoeheMerk.keys().next().value);
  }
  return p;
}

/** Platzhalter für die Höhe; leer, wo es keine geben kann. */
function hoeheZeile(lat, lon) {
  if (!inHoehenRahmen(lat, lon)) return '';
  return `<span class="hoehe" data-hoehe="${lat},${lon}" title="Geländehöhe in Metern über Normalhöhennull ` +
    `aus dem DGM1 — Bayern: Bayerische Vermessungsverwaltung, CC BY 4.0; Baden-Württemberg: LGL-BW, ` +
    `Datenlizenz Deutschland – Namensnennung 2.0">Höhe … m ü. NHN</span>`;
}

/** Füllt die Platzhalter in el, sobald die Werte da sind. */
function hoeheFuellen(el) {
  if (!el) return;
  el.querySelectorAll('[data-hoehe]').forEach(z => {
    const [lat, lon] = z.dataset.hoehe.split(',').map(Number);
    hoeheHolen(lat, lon).then(h => {
      if (!z.isConnected) return;
      const imBalken = z.closest('#bottom, #ziel');
      if (Number.isFinite(h)) z.innerHTML = `Höhe <b>${nfH.format(h)} m</b> ü. NHN · DGM1`;
      else z.remove();
      if (imBalken) updateBH();
    });
  });
}

/* ============================ Querprofil ============================
 *
 * Geländeschnitt entlang angetippter Punkte aus dem DGM1 der Bayerischen
 * Vermessungsverwaltung (hoehen.js), auf Wunsch mit der Oberfläche aus dem
 * DOM20 als zweiter Linie. Ein eigener Ablauf im Messmenü: Punkte antippen,
 * mit Fang auf Steine und KML-Punkte wie beim Messen; ab zwei Punkten lädt das
 * Profil von selbst. Ein ungefragter Netzabruf ist das nicht: Wer den
 * Profilmodus wählt, will genau das. Fadenkreuz, „Mitte" und „Standort" gibt es
 * hier bewusst nicht — für eine Geländeübersicht reicht der Finger, und die
 * Leiste bleibt frei fürs Diagramm.
 *
 * Das DOM kommt nur auf Knopfdruck, und der Knopf nennt die Datenmenge vorher:
 * Blöcke von 51 × 51 m zu rund 100 kB, auf 300 m gemessen 0,6 MB. Einmal
 * eingeschaltet, lädt es bei jedem neuen Punkt mit, bis man es abschaltet. Vom
 * DGM kommt je berührter Kilometerkachel die ganze Datei (1,5–3,9 MB); bei mehr
 * als PROF_KACHELN_FRAGEN Kacheln fragt die Leiste erst. Danach liegen sie im
 * Gerätespeicher.
 */

/* Überhöhung: unüberhöht als Vorgabe, ein Regler bis so steil, wie es passt.
 * Die Bildhöhe richtet sich nach dem Gelände — flaches Gelände unüberhöht gibt
 * ein flaches Bild und eine kleinere Leiste. Höher als PROF_PLOT_MAX wird es
 * nicht; der Regler endet dort („max"). Feste Stufen 1/2/5/10× gab es bis
 * Oktober 2026: Mit Bäumen oder Gebäuden gingen oft nur ein oder zwei davon,
 * der Rest war gestaucht oder aus. Eine Stufe, in der die Höhe einfach das
 * Bild füllt, gab es anfangs; sie zeichnete zwei Meter auf 300 m wie einen
 * Berg und ist wieder raus — deshalb beginnt der Regler bei 1×. */
const PROF_UEBER_MAX = 20;
const PROF_PLOT_MIN = 56;              // px Zeichenfläche, darunter wird es unleserlich
const PROF_PLOT_MAX = 160;
const PROF_KACHELN_FRAGEN = 4;
const PROF_KACHEL_MB = 3;              // DGM1, gemessen 1,5–3,9 MB je Kachel
const PROF_DOM_BLOCK_KB = 110;         // DOM20: 13–64 MB je Kachel aus 400 Blöcken
const PROF_DOM1_MB = 3.3;              // DOM1 BW: ganze Datei je Kilometer, danach auf dem Gerät
const PROF_LOD2_BW_MB = 4;             // LoD2 BW: je Kilometer gepackt 2–5,4 MB
/* Quellenvermerk nach CC BY 4.0 bzw. dl-de/by-2-0: Urheber mit Verweis auf die
 * Quelle, Lizenz, und dass bearbeitet wurde — „Profil aus …" sagt das. Eine
 * Zeile, damit die Leiste nicht wächst; der volle Wortlaut steht unter
 * Hinweise. Genannt wird, wessen Werte im Profil stecken (hoehenProfil →
 * quellen). Das LGL will das Jahr des Datenbezugs in Klammern. */
const PROF_QUELLEN = {
  by: () => 'der <a href="https://www.geodaten.bayern.de/" target="_blank" rel="noopener">' +
    'Bayerischen Vermessungsverwaltung</a>, CC BY 4.0',
  bw: () => `des <a href="https://www.lgl-bw.de/" target="_blank" rel="noopener">LGL-BW</a> ` +
    `(${new Date().getFullYear()}), dl-de/by-2-0`
};

function profQuelle(dgm) {
  const q = dgm && dgm.quellen && dgm.quellen.length ? dgm.quellen : ['by'];
  return q.map(l => PROF_QUELLEN[l]()).join(' und ');
}

/* Profil am Gleis (Knopf in der Ergebnisleiste): quer zum Gleis oder längs
 * daran entlang. Breite (je Seite) und Länge (je Richtung) sind Chips, die bei
 * jedem Tipp weiterschalten. Die Sprungreihe schiebt den Schnitt die
 * Kilometrierung entlang — im freien Profil verschieben dieselben Knöpfe ihn
 * parallel zur Seite. */
const GP_BREITEN = [10, 25, 50, 100, 200];
const GP_LAENGEN = [100, 250, 500, 1000];
const PROF_SPRUENGE = { quer: [1, 5, 10], laengs: [10, 50, 100], frei: [1, 5, 10] };

let profModus = false;
let profPunkte = [];
let profLayer = null;
let profRing = null;                   // die Stelle unter dem Finger, auf der Karte
let profDgm = null;                    // Ergebnis von hoehenProfil
let profDom = null;
let profDomDgm = null;                 // Gelände an den Stützpunkten des DOM
let profDomAn = false;
let profGebAn = false;                 // Gebäude (LoD2) eingeschaltet
let profLaedt = '';                    // '', 'dgm' oder 'dom'
let profFehler = '';
let profNochmal = false;               // lohnt ein zweiter Versuch? Nur bei Netzfehlern
let profFreigabe = false;              // viele Kacheln bestätigt
let profLauf = 0;                      // überholte Antworten verwerfen
let profWahl = -1;                     // Stützpunkt unter dem Finger
let profLetzterTipp = 0;
let profAbbild = null;                 // Maßstab des gezeichneten Diagramms
let profGleis = null;                  // Profil am Gleis: { ref, km, art, mitte, kms, mitteIndex }
let profVersatz = 0;                   // freies Profil, parallel verschoben in m; plus = links von A→B
let profGeb = null;                    // Gebäude (LoD2) im Schnitt, aus gebaeude.js
let profPdf = null;                    // PDF-Zeile: { wahl } · { laeuft: Text } · { fertig: File }

const profName = i => i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
const profMB = byte => nfH.format(Math.max(0.1, byte / 2 ** 20)) + ' MB';

/* Fortschritt beim Laden: Ein Profil über 18 Kacheln braucht auf dem Handy
 * gut eine halbe Minute, und „wird geladen …" allein sah aus wie hängen
 * geblieben. hoehen.js meldet Kacheln und jedes Stück über die Leitung; die
 * Anzeige wird nur einmal je Bild geschrieben, nicht die ganze Leiste neu. */
let profLade = null;                    // { art, kacheln, fertig, start }
let profLadeBild = 0;

function profLadeBeginnen(art) {
  const stand = { art, kacheln: 0, fertig: 0, start: HOEHEN.geladen };
  profLade = stand;
  HOEHEN.fortschritt = info => {
    if (profLade !== stand) return;
    if (info) { stand.kacheln = info.kacheln; stand.fertig = info.fertig; }
    if (!profLadeBild) profLadeBild = requestAnimationFrame(profLadeZeigen);
  };
  return stand;
}

function profLadeEnde(stand) {
  if (profLade !== stand) return;
  profLade = null;
  HOEHEN.fortschritt = null;
}

function profLadeZeigen() {
  profLadeBild = 0;
  const p = profLade;
  if (!p) return;
  const byte = HOEHEN.geladen - p.start;
  if (p.art === 'dom') {
    const klein = $('#profDom small');
    if (klein && byte > 0) klein.textContent = profMB(byte);
    return;
  }
  const text = $('#profLadeText'), balken = $('#profLadeBalken');
  if (!text || !balken) return;
  const teile = [];
  if (p.kacheln) teile.push(`${p.fertig} von ${p.kacheln} ${p.kacheln === 1 ? 'Kachel' : 'Kacheln'}`);
  if (byte > 0) teile.push(profMB(byte));
  text.textContent = teile.length ? ' · ' + teile.join(' · ') : '';
  /* Der Balken läuft auch während einer Kachel weiter: nach Bytes, geschätzt
   * mit der mittleren Kachelgröße — Kacheln aus dem Vorrat zählen über fertig. */
  const anteil = p.kacheln ? Math.max(p.fertig / p.kacheln,
    Math.min(0.97, byte / (p.kacheln * PROF_KACHEL_MB * 2 ** 20))) : 0;
  balken.style.transform = `scaleX(${anteil.toFixed(3)})`;
}
const gpBreite = () => GP_BREITEN.includes(prefs.gpBreite) ? prefs.gpBreite : 50;
const gpLaenge = () => GP_LAENGEN.includes(prefs.gpLaenge) ? prefs.gpLaenge : 250;
// Vorzeichen immer ausgeschrieben, unter 5 cm „±"
const profVz = d => (d > 0.05 ? '+' : d < -0.05 ? '−' : '±') + nfH.format(Math.abs(d));

function profStart() {
  if (laserAn) laserEnde(false);
  if (routeAn) routeEnde(false);
  if (messModus) messEnde();
  mappeOffen = false;
  profModus = true;
  profPunkte = [];
  profGleis = null;
  profVersatz = 0;
  profPdf = null;
  profDgm = profDom = profDomDgm = profGeb = null;
  profDomAn = profGebAn = profGebLaedt = false;
  profLaedt = profFehler = '';
  profFreigabe = false;
  profWahl = -1;
  profLauf++;
  leisteZu(false);                 // ab 1010 px steht die Bedienung in der Leiste
  map.closePopup();
  if (!profLayer) profLayer = L.layerGroup().addTo(map);
  // Wie beim Messen: Zwei schnelle Tipps wären sonst ein Doppeltipp-Zoom
  if (map.doubleClickZoom) map.doubleClickZoom.disable();
  profZeichnen();
  profLeiste();
  closeSheet();
  syncButtons();
}

/** zeigen: danach wieder das Ergebnis in die Leiste — renderBottom selbst ruft
 *  ohne, wenn ein neues Ergebnis ein offenes Profil ablöst. */
function profEnde(zeigen = true) {
  profModus = false;
  profPunkte = [];
  profGleis = null;
  profVersatz = 0;
  profPdf = null;
  profDgm = profDom = profDomDgm = null;
  profLauf++;
  if (profLayer) profLayer.clearLayers();
  profRing = null;
  if (map.doubleClickZoom) map.doubleClickZoom.enable();
  syncButtons();
  if (zeigen) renderBottom();      // zeigt wieder den vorherigen Punkt, falls es einen gibt
}

/* Das freie Profil hat genau zwei Punkte, A und B. Mehr brauchte es praktisch
 * nie, und ein versehentlicher Tipp in die Karte hängte einen Punkt C an und
 * verdarb den Schnitt. Stehen beide, setzt ein Tipp nichts mehr — A und B
 * werden gezogen (profZeichnen). */
const PROF_PUNKTE_MAX = 2;

/** Gefangen wird wie beim Messen: Kilometersteine und KML-Punkte bis MESS_FANG_MAX_M. */
function profFangen(latlng) {
  const nah = messKandidatenFinden(latlng);
  return nah.length && nah[0].dist <= MESS_FANG_MAX_M ? nah[0] : null;
}

function profTipp(latlng) {
  if (profGleis) return;           // am Gleis legt die Strecke den Schnitt fest
  if (profPunkte.length >= PROF_PUNKTE_MAX) {
    toast('A und B stehen — zum Verschieben den Punkt ziehen');
    return;
  }
  latlng = L.latLng(latlng);
  // Doppelt gemeldeter Tipp (siehe messTipp)
  const jetzt = Date.now();
  if (profPunkte.length && jetzt - profLetzterTipp < 350) {
    const vor = profPunkte[profPunkte.length - 1];
    if (map.latLngToContainerPoint(latlng).distanceTo(map.latLngToContainerPoint(L.latLng(vor[0], vor[1]))) < 8) return;
  }
  profLetzterTipp = jetzt;

  /* Gefangen wird wie beim Messen, nur ohne Auswahlzeile — den Platz in der
   * Leiste braucht das Diagramm. */
  const f = profFangen(latlng);
  if (f) {
    profPunkte.push(f.koord);
    toast(`${profName(profPunkte.length - 1)} gefangen auf ${f.name}`);
  } else {
    profPunkte.push([latlng.lat, latlng.lng]);
  }
  profGeaendert();
}

/** A oder B wurde gezogen: dort ablegen, gefangen wie beim Tippen, und neu rechnen. */
function profPunktGezogen(i, latlng) {
  const f = profFangen(latlng);
  profPunkte[i] = f ? f.koord : [latlng.lat, latlng.lng];
  if (f) toast(`${profName(i)} gefangen auf ${f.name}`);
  profGeaendert();
}

/** Neuer Punkt, Zurück oder Leeren: Ein Versatz gehörte zur alten Linie. */
function profGeaendert() {
  profVersatz = 0;
  profZeichnen();
  profWahl = -1;
  profRechnen();
}

/** Die Punkte, entlang derer gerechnet wird. Im freien Profil um den Versatz
 *  verschoben, senkrecht zur Linie vom ersten zum letzten Punkt — bei zwei
 *  Punkten also genau quer zu A→B. Plus heißt links davon: Wer den Schnitt
 *  ansieht wie im Diagramm, A links und B rechts, schiebt ihn damit nach vorn. */
function profLinie() {
  if (!profVersatz || profGleis || profPunkte.length < 2) return profPunkte;
  const utm = profPunkte.map(p => utm32Hin(p[0], p[1]));
  const a = utm[0], b = utm[utm.length - 1];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l < 0.01) return profPunkte;
  const ve = -(b[1] - a[1]) / l * profVersatz, vn = (b[0] - a[0]) / l * profVersatz;
  return utm.map(([e, n]) => utm32Zurueck(e + ve, n + vn));
}

function profZeichnen() {
  if (!profLayer) return;
  profLayer.clearLayers();
  profRing = null;
  const linie = (pts, extra) => L.polyline(pts, {
    color: MESS_FARBE, weight: 3, opacity: 0.95, dashArray: '7 5', interactive: false, ...extra
  }).addTo(profLayer);
  const punkt = p => L.circleMarker(p, {
    radius: 5, color: '#fff', weight: 2, fillColor: MESS_FARBE, fillOpacity: 1, interactive: false
  }).addTo(profLayer);
  const schild = (p, text) => L.marker(p, {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: '', iconSize: null, iconAnchor: [-7, 7],
      html: `<span class="mess-lbl">${esc(text)}</span>` })
  }).addTo(profLayer);

  const g = profGleis;
  if (g) {
    const n = profPunkte.length;
    if (n < 2) return;
    const a = profPunkte[0], b = profPunkte[n - 1];
    // Quer gestrichelt wie das freie Profil, längs durchgezogen auf dem Gleis
    linie(profPunkte, g.art === 'quer' ? {} : { dashArray: null, weight: 4, opacity: 0.85 });
    punkt(a); punkt(b);
    if (g.art === 'quer') { schild(a, 'links'); schild(b, 'rechts'); }
    else { schild(a, 'km ' + fmtKm(g.kms[0])); schild(b, 'km ' + fmtKm(g.kms[g.kms.length - 1])); }
    if (g.mitte) {
      L.circleMarker(g.mitte, {
        radius: 4, color: MESS_FARBE, weight: 2.5, fillColor: '#fff', fillOpacity: 1, interactive: false
      }).addTo(profLayer);
    }
    return;
  }

  const pts = profLinie();
  // Verschoben: die getippte Linie bleibt blass stehen, zur Orientierung
  const getippt = pts !== profPunkte ? linie(profPunkte, { weight: 2, opacity: 0.45, dashArray: '2 5' }) : null;
  const schnitt = pts.length > 1 ? linie(pts) : null;
  if (pts !== profPunkte) pts.forEach((p, i) => schild(p, profName(i)));

  /* A und B zum Ziehen: ein Marker mit großer Griffläche (26 px) um den
   * sichtbaren Punkt. Er sitzt auf dem getippten Punkt — beim Versatz also auf
   * der blassen Linie. Beim Ziehen läuft die Linie mit, gerechnet wird beim
   * Loslassen. Ohne autoPan: Leaflet schiebt die Karte, solange der Finger in
   * 50 px am Rand steht, mit 10 px je Bild — unter der Leiste oder der Suchzeile
   * merkt man das nicht, und der Punkt landete Kilometer weiter. */
  profPunkte.forEach((p, i) => {
    const m = L.marker(p, {
      draggable: true, keyboard: false, autoPan: false, zIndexOffset: 500,
      icon: L.divIcon({ className: 'prof-griff', iconSize: [26, 26], iconAnchor: [13, 13],
        html: `<i></i>${pts === profPunkte ? `<span class="mess-lbl">${esc(profName(i))}</span>` : ''}` })
    }).addTo(profLayer);
    const ziel = getippt || schnitt;
    m.on('drag', () => { if (ziel) ziel.setLatLngs(profPunkte.map((q, j) => j === i ? m.getLatLng() : q)); });
    m.on('dragend', () => profPunktGezogen(i, m.getLatLng()));
  });
}

/** Wie viele Rasterzellen der Linienzug berührt: DGM-Kacheln (1000 m) oder
 *  DOM-Blöcke (51,2 m, an der linken oberen Kachelecke ausgerichtet). */
function profZellen(punkte, zelle) {
  const satz = new Set();
  const utm = punkte.map(p => utm32Hin(p[0], p[1]));
  for (let i = 1; i < utm.length; i++) {
    const [e0, n0] = utm[i - 1], [e1, n1] = utm[i];
    const schritte = Math.max(1, Math.ceil(Math.hypot(e1 - e0, n1 - n0) / (zelle / 4)));
    for (let j = 0; j <= schritte; j++) {
      const e = e0 + (e1 - e0) * j / schritte, n = n0 + (n1 - n0) * j / schritte;
      const ke = Math.floor(e / 1000), kn = Math.floor(n / 1000);
      satz.add(`${ke}_${kn}_${Math.floor((e - ke * 1000) / zelle)}_${Math.floor((kn * 1000 + 1000 - n) / zelle)}`);
    }
  }
  return satz.size;
}

/** behalten: Das bisherige Diagramm bleibt stehen, bis das neue da ist — beim
 *  Springen und Verschieben, sonst flackerte jeder Schritt über „wird geladen". */
async function profRechnen({ behalten = false } = {}) {
  const lauf = ++profLauf;
  const linie = profLinie();
  if (!behalten) profDgm = profDom = profDomDgm = profGeb = null;
  profFehler = '';
  profLaedt = '';
  // Lange Linien: erst fragen, die Leiste bietet dann „Gelände laden" an
  if (linie.length < 2 || (profZellen(linie, 1000) > PROF_KACHELN_FRAGEN && !profFreigabe)) {
    profDgm = profDom = profDomDgm = null;
    profLeiste();
    return;
  }

  if (!profDgm) {
    profLaedt = 'dgm';
    profLeiste();
  }
  const lade = profLadeBeginnen('dgm');
  try {
    const dgm = await hoehenProfil(linie, 'dgm1');
    profLadeEnde(lade);
    if (lauf !== profLauf) return;
    profDgm = dgm;
    profDom = profDomDgm = profGeb = null; // gehörten zur vorigen Linie, kommen unten neu
    if (!dgm.hoehe.some(Number.isFinite)) {
      profFehler = 'Hier gibt es keine Höhendaten — das Gelände gibt es bisher für Bayern und Baden-Württemberg.';
      profNochmal = false;
    }
  } catch (err) {
    profLadeEnde(lade);
    if (lauf !== profLauf) return;
    profFehler = navigator.onLine === false
      ? 'Ohne Netz gibt es hier keine Höhen — die Geländekachel war noch nicht auf dem Gerät.'
      : `Höhendaten nicht erreichbar (${err.message}).`;
    profNochmal = true;
  }
  profLaedt = '';
  if (profFehler) profDgm = null;
  profLeiste();
  if (profGebAn && profDgm) profGebLaden();
  if (profDomAn && profDgm) profDomLaden();
}

async function profDomLaden() {
  if (!profDgm) return;
  const lauf = profLauf;
  profDomAn = true;
  profLaedt = 'dom';
  profLeiste();
  const lade = profLadeBeginnen('dom');
  try {
    // 0,2 m Abstand, damit kein Mast und kein Baum zwischen zwei Stützpunkte fällt
    const dom = await hoehenProfil(profLinie(), 'dom20', { maxPunkte: 6000 });
    const dgmDort = await hoehenWerte('dgm1', dom.ost, dom.nord);
    profLadeEnde(lade);
    if (lauf !== profLauf) return;
    if (!dom.hoehe.some(Number.isFinite)) {
      profDomAn = false;
      toast('Hier gibt es keine Oberfläche — das DOM gibt es für Bayern und Baden-Württemberg.');
    } else {
      profDom = dom;
      profDomDgm = dgmDort;
    }
  } catch (err) {
    profLadeEnde(lade);
    if (lauf !== profLauf) return;
    profDomAn = false;
    toast(`Oberfläche nicht geladen (${err.message}).`);
  }
  profLaedt = '';
  profLeiste();
}

/* Gebäude aus dem LoD2 (gebaeude.js): je berührter 2-km-Kachel einmal geladen
 * und auf dem Gerät gemerkt, danach kostet jeder Schnitt in der Gegend nichts —
 * auch das Springen nicht. Eigener Ladezustand, damit Oberfläche und Gebäude
 * gleichzeitig kommen können. */
let profGebLaedt = false;

async function profGebLaden() {
  if (!profDgm) return;
  const lauf = profLauf, dgm = profDgm;
  profGebAn = true;
  profGebLaedt = true;
  profLeiste();
  try {
    const geb = await gebaeudeImSchnitt(profLinie(), dgm);
    if (lauf !== profLauf || dgm !== profDgm) return;
    profGeb = geb;
  } catch (err) {
    if (lauf !== profLauf) return;
    profGebAn = false;
    toast(`Gebäude nicht geladen (${err.message}).`);
  }
  profGebLaedt = false;
  profLeiste();
}

function profGebKnopf() {
  /* Vorher unbekannt, wie groß die Kachel ist: Bayern gepackt meist 0,2–1 MB je
   * 2 km × 2 km, BW 2–5,4 MB je Kilometer. Nur die Länder, in denen das Gelände
   * liegt — der Rahmen um Bayern reicht weit nach Württemberg hinein. */
  const l = profLaender(), kacheln = gebKachelnFuer(profLinie()).filter(([, , land]) => l[land]);
  const nBy = kacheln.filter(k => k[2] === 'by').length, nBw = kacheln.length - nBy;
  const mb = Math.max(1, Math.round(nBy + nBw * PROF_LOD2_BW_MB));
  const art = [nBy && `${nBy} Kachel${nBy > 1 ? 'n' : ''} zu 2 km in Bayern, gepackt meist unter 1 MB`,
    nBw && `${nBw} Kilometer in Baden-Württemberg, gepackt 2–5 MB`].filter(Boolean).join(', ');
  const [zusatz, titel] = profGebLaedt ? ['lädt …', 'Gebäude werden geladen']
    : profGebAn ? ['', 'Gebäude ausblenden']
    : [`≈${mb} MB`, `Gebäude aus dem 3D-Gebäudemodell LoD2 dazuladen — ${art}; danach auf dem Gerät`];
  return `<button type="button" class="prof-dom prof-geb${profGebAn ? ' is-on' : ''}" id="profGeb" aria-pressed="${profGebAn}" ` +
    `title="${titel}" aria-label="${titel}">Gebäude<small>${zusatz}</small></button>`;
}

function profKennwerte(dgm = profDgm, dom = profDom, domDgm = profDomDgm) {
  let min = Infinity, max = -Infinity, erst = NaN, letzt = NaN;
  for (const z of dgm.hoehe) {
    if (!Number.isFinite(z)) continue;
    if (Number.isNaN(erst)) erst = z;
    letzt = z;
    if (z < min) min = z;
    if (z > max) max = z;
  }
  let obj = null;
  if (dom) {
    let best = -Infinity, wo = -1;
    dom.hoehe.forEach((z, i) => { const d = z - domDgm[i]; if (d > best) { best = d; wo = i; } });
    if (wo >= 0) obj = { hoehe: best, station: dom.station[wo] };
  }
  return { min, max, dh: letzt - erst, obj };
}

/** In welchen Ländern liegt das Geländeprofil? Ohne Angabe: Bayern. */
function profLaender(p = profDgm) {
  const q = p && p.quellen && p.quellen.length ? p.quellen : ['by'];
  return { by: q.includes('by'), bw: q.includes('bw') };
}

/** Name der Oberfläche samt Befliegung, wo bekannt: „DOM20", „DOM1 2016". */
function domName(dom, mitJahr = true) {
  const l = profLaender(dom);
  const name = l.by && l.bw ? 'DOM20/DOM1' : l.bw ? 'DOM1' : 'DOM20';
  const jahre = [...new Set((dom && dom.staende || []).map(s => s.slice(0, 4)))];
  return mitJahr && jahre.length ? `${name} ${jahre.length > 1 ? `${jahre[0]}–${jahre[jahre.length - 1]}` : jahre[0]}` : name;
}

function profDomKnopf() {
  /* „+0,8 MB": dazuladen, und was es kostet — kurz, damit die Legende einzeilig
   * bleibt. Bayern in Blöcken des DOM20, BW je berührtem Kilometer DOM1 */
  const l = profLaender(), linie = profLinie();
  const byte = (l.by ? profZellen(linie, 51.2) * PROF_DOM_BLOCK_KB * 1024 : 0) +
    (l.bw ? profZellen(linie, 1000) * PROF_DOM1_MB * 2 ** 20 : 0);
  const mb = profMB(byte), quelle = l.by && l.bw ? 'DOM20 und DOM1' : l.bw ? 'DOM1' : 'DOM20';
  const [zusatz, titel] = profLaedt === 'dom' ? ['lädt …', 'Oberfläche wird geladen']
    : profDomAn ? ['', 'Oberfläche ausblenden']
    : ['+' + mb, `Gebäude und Bewuchs aus dem ${quelle} dazuladen, rund ${mb}`];
  return `<button type="button" class="prof-dom${profDomAn ? ' is-on' : ''}" id="profDom" aria-pressed="${profDomAn}" ` +
    `title="${titel}" aria-label="${titel}">Oberfläche<small>${zusatz}</small></button>`;
}

/** Höhe im Profil an einer Station, zwischen den Stützpunkten linear. */
function profWertBei(p, s) {
  const st = p.station;
  let i = profIndex(st, s);
  if (st[i] > s && i > 0) i--;
  const j = Math.min(i + 1, st.length - 1);
  const a = p.hoehe[i], b = p.hoehe[j];
  if (!Number.isFinite(a) || !Number.isFinite(b) || st[j] <= st[i]) return Number.isFinite(a) ? a : b;
  return a + (s - st[i]) / (st[j] - st[i]) * (b - a);
}

/** Mittlere Neigung in ‰ als Ausgleichsgerade — zwei Endpunkte allein hingen
 *  an einem Graben oder einer Böschung genau dort. */
function profNeigung(p) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  const x0 = p.laenge / 2;                // um die Mitte, damit die Summen klein bleiben
  for (let i = 0; i < p.station.length; i++) {
    const z = p.hoehe[i];
    if (!Number.isFinite(z)) continue;
    const x = p.station[i] - x0;
    n++; sx += x; sy += z; sxx += x * x; sxy += x * z;
  }
  const d = n * sxx - sx * sx;
  return n > 1 && d > 0 ? (n * sxy - sx * sy) / d * 1000 : NaN;
}


/* Die Leiste besteht aus drei Teilen: oben Kopf und Diagramm, in der Mitte die
 * Sprungreihe, unten Knöpfe und Quelle. Ändert sich nur der Inhalt — nach einem
 * Sprung, wenn das Gelände kommt —, werden oben und unten neu geschrieben, die
 * Sprungreihe bleibt stehen. Sonst ginge ein schneller zweiter Tipp verloren:
 * Wird ein Knopf zwischen Drücken und Loslassen ersetzt, gibt es keinen Klick. */
function profLeiste() {
  const b = $('#bottom');
  b.dataset.art = 'profil';        // ab 1010 px in der Leiste links unter der Suche (wie die Route)
  b.hidden = false;
  const g = profGleis;
  const n = profPunkte.length;
  const springen = g || n > 1;
  const ansicht = g ? 'gleis-' + g.art : springen ? 'frei-sprung' : 'frei';

  const teile = [];
  if (profFehler) {
    teile.push(`<p class="bb-note">${esc(profFehler)}</p>`);
    if (profNochmal) teile.push('<button type="button" class="refine" id="profNochmal">Erneut versuchen</button>');
  } else if (g && n < 2) {
    teile.push('<p class="bb-note plain">Gleislage wird bestimmt …</p>');
  } else if (n < 2) {
    teile.push(`<p class="bb-note plain">${n ? 'Punkt B antippen — dann lädt das Profil.'
      : 'Auf die Karte tippen setzt Punkt A. Kilometersteine und KML-Punkte werden gefangen.'}</p>`);
  } else if (!profDgm && profLaedt !== 'dgm') {
    const k = profZellen(profLinie(), 1000);
    teile.push('<button type="button" class="refine" id="profFreigeben">Gelände laden' +
      `<small>${k} Kacheln, rund ${k * PROF_KACHEL_MB} MB — danach liegen sie auf dem Gerät</small></button>`);
  } else if (!profDgm) {
    teile.push('<div class="prof-lade"><p class="bb-note plain">Gelände wird geladen<span id="profLadeText"></span></p>' +
      '<div class="prof-balken" aria-hidden="true"><i id="profLadeBalken"></i></div></div>');
  } else {
    /* Unter dem Bild feste Zeilen mit Namen davor, statt einer Chip-Reihe, die
     * auf dem Handy irgendwo umbricht. Die Kennwerte stehen nicht mehr über dem
     * Bild — der Zeiger nennt sie an jeder Stelle, das PDF mit Erklärung. */
    teile.push('<div class="prof-bild" id="profBild"></div>',
      '<div class="prof-regler">' +
      // Ohne Namen davor: Die beiden Knöpfe sagen selbst, was sie sind, und brauchen die Breite
      `<span class="prof-ebenen">${profGebKnopf()}${profDomKnopf()}</span>` +
      (g ? gpWeiteRegler() : '') +
      '<label class="prof-rname" for="profUeber">Überhöht</label>' +
      '<span class="prof-weite"><span class="prof-striche" id="profUeberStriche" aria-hidden="true"></span>' +
      '<input type="range" id="profUeber" min="0" max="1000" step="1" value="0"></span>' +
      '<output class="prof-wert" id="profUeberWert" for="profUeber"></output>' +
      '</div>');
    if (profDgm.hoehe.some(z => !Number.isFinite(z))) {
      teile.push('<p class="bb-note">Teilweise außerhalb von Bayern und BW — dort fehlen die Höhen.</p>');
    }
  }

  let kopf;
  if (g) {
    const art = (wert, text) => `<button type="button" data-gpart="${wert}" aria-pressed="${g.art === wert}"` +
      `${g.art === wert ? ' class="is-on"' : ''}>${text}</button>`;
    // Nur „Profil": Quer oder längs sagt der Umschalter daneben, und auf dem Handy braucht das ? die Breite
    kopf = '<p class="bb-title">Profil</p>' +
      `<span class="tag warn" title="Strecke ${esc(g.ref)}">km ${fmtKm(g.km)}</span>` +
      `<span class="prof-art" role="group" aria-label="Schnitt">${art('quer', 'Quer')}${art('laengs', 'Längs')}</span>`;
  } else {
    const v = `${profVersatz > 0 ? '+' : '−'}${nfM.format(Math.abs(profVersatz))} m`;
    kopf = '<p class="bb-title">Profil</p>' +
      `<span class="tag warn">${profDom ? `DGM1 · ${domName(profDom)}` : 'Gelände DGM1'}</span>` +
      // Der Versatz ist zugleich sein Rücksetzer — antippen holt die getippte Linie zurück
      (profVersatz ? `<button type="button" class="tag prof-versatz" id="profVersatz" ` +
        `title="Parallel verschoben, plus nach links von A→B — antippen: zurück auf die getippte Linie">${v}</button>` : '');
  }

  // Teilen als PDF — dasselbe Zeichen wie in der Ergebnisleiste
  if (profDgm) {
    kopf += '<button type="button" class="prof-teilen" id="profPdfBtn" aria-label="Als PDF teilen" title="Als PDF teilen">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="17.5" cy="5.5" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/>' +
      '<circle cx="17.5" cy="18.5" r="2.6"/><path d="M8.74 10.68 15.26 6.82M8.74 13.32l6.52 3.86"/></svg></button>';
  }
  const oben = `
    <button type="button" id="bbClose" class="bb-close" aria-label="Profil beenden">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    ${hilfeKnopf('profil', 'Profil')}
    <div class="bb-head">${kopf}</div>
    ${profPdfZeile()}
    ${teile.join('')}`;
  const unten = (g ? '' : `
    <div class="bb-actions knapp">
      <button type="button" id="profZurueck"${n ? '' : ' disabled'}>Zurück</button>
      <button type="button" id="profLeer"${n ? '' : ' disabled'}>Leeren</button>
    </div>`) +
    (profDgm ? `<p class="prof-quelle">Profil aus Daten ${profQuelle(profDgm)}</p>` : '');

  const rahmen = $('#profRahmen');
  if (rahmen && rahmen.dataset.ansicht === ansicht) {
    $('#profOben').innerHTML = oben;
    $('#profUnten').innerHTML = unten;
  } else {
    b.innerHTML = `<div id="profRahmen" data-ansicht="${ansicht}"><div id="profOben">${oben}</div>` +
      (springen ? `<div class="prof-sprung" id="profSprung" role="group" aria-label="Schnitt verschieben">${profSprungReihe()}</div>` : '') +
      `<div id="profUnten">${unten}</div></div>`;
    b.querySelectorAll('[data-sprung]').forEach(k =>
      k.addEventListener('click', () => profSpringen(Number(k.dataset.sprung))));
  }

  const an = (sel, f) => { const el = b.querySelector(sel); if (el) el.addEventListener('click', f); };
  an('#bbClose', () => profEnde());
  an('#profZurueck', () => { profPunkte.pop(); profGeaendert(); });
  an('#profLeer', () => { profPunkte = []; profFreigabe = false; profGeaendert(); });
  an('#profNochmal', () => g ? gpRechnen() : profRechnen());
  an('#profFreigeben', () => { profFreigabe = true; profRechnen(); });
  an('#profVersatz', () => { profVersatz = 0; profWahl = -1; profZeichnen(); profRechnen({ behalten: true }); });
  an('#profDom', () => {
    if (profLaedt) return;
    if (profDomAn) { profDomAn = false; profDom = profDomDgm = null; profLeiste(); }
    else profDomLaden();
  });
  an('#profGeb', () => {
    if (profGebLaedt) return;
    if (profGebAn) { profGebAn = false; profGeb = null; profLeiste(); }
    else profGebLaden();
  });
  const weite = b.querySelector('#profWeite');
  if (weite) {
    // Beim Ziehen nur die Zahl, geladen wird erst beim Loslassen
    weite.addEventListener('input', () => { $('#profWeiteWert').textContent = gpWeiteText(gpWeiteStufen()[weite.value]); });
    weite.addEventListener('change', () => gpWeiteSetzen(gpWeiteStufen()[weite.value]));
  }
  const ueber = b.querySelector('#profUeber');
  if (ueber) {
    // Das Bild folgt beim Ziehen sofort, gespeichert wird beim Loslassen
    ueber.addEventListener('input', () => {
      prefs[profUeberSchluessel()] = Math.max(1, profUeberAusPos(Number(ueber.value), Number(ueber.dataset.oben)));
      const el = $('#profBild');
      if (el) profBildSetzen(el, true);
    });
    ueber.addEventListener('change', () => saveStore());
  }
  // Erst fragen: dieser Schnitt, die Serie (quer am Gleis) oder die Mappe
  an('#profPdfBtn', () => {
    if (profPdf && profPdf.laeuft) return;
    profPdf = profPdf && profPdf.wahl ? null : { wahl: true };
    profLeiste();
  });
  b.querySelectorAll('[data-pdf]').forEach(k => k.addEventListener('click', () => profPdfTipp(k.dataset.pdf)));
  b.querySelectorAll('[data-gpart]').forEach(k => k.addEventListener('click', () => gpArtWechseln(k.dataset.gpart)));

  const bild = $('#profBild');
  if (bild) profBildSetzen(bild);
  updateBH();
}

/** −10 −5 −1 +1 +5 +10 — am Gleis Meter entlang der Kilometrierung, frei quer zur Linie. */
function profSprungReihe() {
  const art = profGleis ? profGleis.art : 'frei';
  const titel = d => {
    const m = `${nfM.format(Math.abs(d))} m`;
    if (art === 'frei') return `Schnitt ${m} parallel nach ${d > 0 ? 'links' : 'rechts'} von A→B verschieben`;
    return `${m} ${d > 0 ? 'vor (Kilometer steigt)' : 'zurück (Kilometer fällt)'}`;
  };
  const knopf = d => `<button type="button" data-sprung="${d}" title="${titel(d)}" aria-label="${titel(d)}">` +
    `${d > 0 ? '+' : '−'}${nfM.format(Math.abs(d))}</button>`;
  const s = PROF_SPRUENGE[art];
  return [...s].reverse().map(d => knopf(-d)).join('') + s.map(d => knopf(d)).join('');
}

function profSpringen(d) {
  if (!profModus) return;
  if (profGleis) {
    // Auf Millimeter gerundet, sonst sammelt sich über viele Sprünge Rechenrauschen an
    profGleis.km = Math.round((profGleis.km + d / 1000) * 1e6) / 1e6;
    gpRechnen();
  } else if (profPunkte.length > 1) {
    profVersatz += d;
    profWahl = -1;
    profZeichnen();
    profRechnen({ behalten: true });
  }
}

/** Am Rechner: ← und → springen den kleinen Schritt, mit Umschalt den großen. */
function profTaste(ev) {
  if (!profModus || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  if (!profGleis && profPunkte.length < 2) return;
  const tour = $('#tour');
  if (tour && !tour.hidden) return;
  if (ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const s = PROF_SPRUENGE[profGleis ? profGleis.art : 'frei'];
  const d = ev.shiftKey ? s[s.length - 1] : s[0];
  // Vor Leaflet, das mit den Pfeiltasten sonst die Karte verschöbe
  ev.preventDefault();
  ev.stopPropagation();
  profSpringen(ev.key === 'ArrowRight' ? d : -d);
}

/* ---- Profil am Gleis ----
 *
 * Wo liegt Kilometer km auf dem Gleis? Für Sprünge von einem Meter muss die
 * Antwort glatt sein: jedes Mal dieselbe Rechnung. resolvePoint taugt dafür
 * nicht — es rastet bis 0,5 m an einen Stein ein und zeigt dann dessen Lage,
 * die einige Meter neben dem Gleis liegen kann. Hier deshalb immer das
 * Steinpaar A ≤ km < B und darauf der Gleisweg aus den mitgelieferten Kacheln,
 * genau wie gleisGenau es für das Ergebnis tut. Fehlt der Weg, die Sehne
 * zwischen den Steinen; über weite Lücken (mehr als MAX_GAP_KM) der Weg über
 * Overpass, den die Suche dort meist schon geholt hat. Hinter dem letzten
 * Stein läuft es wie bei der Suche am Gleis hinaus. null: kein Gleis zu finden. */
async function gleisLage(ref, km) {
  // Dieselbe Rechnung wie resolvePoint, sonst läge das Profil neben dem Ergebnis
  const ifg = await ifgLage(ref, km).catch(() => null);
  if (ifg) return { lat: ifg.lat, lon: ifg.lon };

  const e = await coverage(ref, km);
  let A = null, B = null;
  for (const p of e.sorted) {
    if (p.km <= km + 1e-9) A = p;
    else { B = p; break; }
  }
  if (A && B && segmentOk(A, B, MAX_GLEIS_GAP_KM)) {
    const t = (km - A.km) / (B.km - A.km);
    let weg = null;
    try {
      weg = await gleisWegZwischen(A, B, true);
      if (!weg && !segmentOk(A, B)) weg = await gleisWegZwischen(A, B);
    } catch { weg = null; }
    if (weg) return pointAlong(weg.path, t * weg.length);
    if (segmentOk(A, B)) return { lat: A.lat + t * (B.lat - A.lat), lon: A.lon + t * (B.lon - A.lon) };
    return null;
  }
  if (A && B) return null;                 // Paar passt nicht zusammen — nicht quer durchs Land
  const res = await resolvePoint(ref, km);
  return res && (res.quality === 'exakt' || res.quality === 'extrapoliert') ? { lat: res.lat, lon: res.lon } : null;
}

/** Einheitsvektor [Ost, Nord] in Richtung steigender Kilometer, aus der Lage
 *  5 m davor und danach. Nacheinander, nicht gleichzeitig: Beide fragen sonst
 *  denselben noch fehlenden Abschnitt der Strecke doppelt ab. */
async function gleisRichtung(ref, km) {
  const a = await gleisLage(ref, km - 0.005);
  const b = await gleisLage(ref, km + 0.005);
  if (!a || !b) return null;
  const [ea, na] = utm32Hin(a.lat, a.lon), [eb, nb] = utm32Hin(b.lat, b.lon);
  const l = Math.hypot(eb - ea, nb - na);
  return l > 2 ? [(eb - ea) / l, (nb - na) / l] : null;
}

/** Die beiden Enden eines Querschnitts bei km, W Meter zu jeder Seite; null ohne Gleis.
 *  Links in Richtung steigender Kilometer ist (−Nord, Ost) der Richtung. Von
 *  links nach rechts gezogen, damit links im Diagramm links liegt. */
async function gpQuerPunkte(ref, km, W) {
  const c = await gleisLage(ref, km);
  const r = c && await gleisRichtung(ref, km);
  if (!c || !r) return null;
  const [e, n] = utm32Hin(c.lat, c.lon);
  return {
    punkte: [utm32Zurueck(e - r[1] * W, n + r[0] * W), utm32Zurueck(e + r[1] * W, n - r[0] * W)],
    mitte: [c.lat, c.lon]
  };
}

/** Vom Ergebnis aus: der Knopf mit dem Profilzeichen in der Ergebnisleiste.
 *  art: für die Tour, ohne die gemerkte Wahl zu ändern. */
function gpStart(art = prefs.gpArt) {
  if (!view.ref || view.km == null) return;
  const ref = view.ref, km = view.km;
  profStart();
  profGleis = { ref, km, art: art === 'laengs' ? 'laengs' : 'quer',
    mitte: null, kms: null, mitteIndex: 0, neuZeigen: true };
  gpRechnen();
}

async function gpRechnen() {
  const g = profGleis;
  if (!g) return;
  const lauf = ++profLauf;
  profFehler = '';
  profLeiste();                            // der Kilometer oben stimmt sofort

  let punkte = [], kms = null, mitte = null, mitteIndex = 0;
  try {
    if (g.art === 'quer') {
      const q = await gpQuerPunkte(g.ref, g.km, gpBreite());
      if (lauf !== profLauf) return;
      if (q) ({ punkte, mitte } = q);
    } else {
      /* Längs: alle 2–10 m eine Lage, je nach Länge rund 200 Stück. Die Stationen
       * im Diagramm sind dann Meter Gleis; welcher Kilometer wo liegt, sagen die
       * Stützpunkte (kms zu den Ecken des Linienzugs). */
      const L = gpLaenge(), schritt = Math.max(2, L / 100), anzahl = Math.round(2 * L / schritt);
      kms = [];
      for (let i = 0; i <= anzahl; i++) {
        const k = Math.round((g.km + (i * schritt - L) / 1000) * 1e6) / 1e6;
        const p = await gleisLage(g.ref, k);
        if (lauf !== profLauf) return;
        if (!p) continue;
        if (2 * i === anzahl) { mitte = [p.lat, p.lon]; mitteIndex = punkte.length; }
        kms.push(k);
        punkte.push([p.lat, p.lon]);
      }
    }
  } catch (err) {
    if (lauf !== profLauf) return;
    profFehler = `Die Kilometersteine der Strecke sind gerade nicht zu bekommen (${err.message}).`;
    profNochmal = true;
  }
  if (!profFehler && (!mitte || punkte.length < 2)) {
    profFehler = `Bei km ${fmtKm(g.km)} liegt kein Gleisverlauf vor — dort fehlen Kilometersteine, ` +
      `oder die Steine passen nicht zusammen.`;
    profNochmal = false;
  }
  if (profFehler) {
    profPunkte = [];
    profDgm = profDom = profDomDgm = null;
    profLaedt = '';
    profZeichnen();
    profLeiste();
    return;
  }

  profPunkte = punkte;
  g.kms = kms;
  g.mitte = mitte;
  g.mitteIndex = mitteIndex;
  profWahl = -1;
  profZeichnen();
  if (g.neuZeigen) { g.neuZeigen = false; gpKarteZeigen(); }
  else gpNachfuehren();
  profRechnen({ behalten: true });
}

/* Breite je Seite (quer) oder Länge je Richtung (längs) als Regler über die
 * festen Stufen. Ein Chip, der bei jedem Tipp weiterschaltet, ging nur nach
 * oben und sprang am Ende auf die kleinste zurück. */
const gpWeiteStufen = () => profGleis.art === 'quer' ? GP_BREITEN : GP_LAENGEN;
const gpWeiteText = w => `je ${nfM.format(w)} m`;

function gpWeiteRegler() {
  const quer = profGleis.art === 'quer', stufen = gpWeiteStufen(), w = quer ? gpBreite() : gpLaenge();
  const titel = quer ? 'Breite zu jeder Seite des Gleises' : 'Länge in jede Richtung am Gleis entlang';
  const striche = stufen.map((_, i) => `<i style="--p:${(i / (stufen.length - 1)).toFixed(4)}"></i>`).join('');
  return `<label class="prof-rname" for="profWeite">${quer ? 'Breite' : 'Länge'}</label>` +
    `<span class="prof-weite"><span class="prof-striche" aria-hidden="true">${striche}</span>` +
    `<input type="range" id="profWeite" min="0" max="${stufen.length - 1}" step="1" value="${stufen.indexOf(w)}" ` +
    `title="${titel}" aria-valuetext="${gpWeiteText(w)}"></span>` +
    `<output class="prof-wert" id="profWeiteWert" for="profWeite">${gpWeiteText(w)}</output>`;
}

function gpWeiteSetzen(w) {
  if (!profGleis || !w) return;
  if (profGleis.art === 'quer') { if (w === gpBreite()) return; prefs.gpBreite = w; }
  else { if (w === gpLaenge()) return; prefs.gpLaenge = w; }
  saveStore();
  profGleis.neuZeigen = true;
  gpRechnen();
}

function gpArtWechseln(art) {
  const g = profGleis;
  if (!g || g.art === art) return;
  g.art = prefs.gpArt = art;
  saveStore();
  g.neuZeigen = true;
  // Das alte Diagramm zeigte den anderen Schnitt — es bleibt nicht stehen
  profPunkte = [];
  profDgm = profDom = profDomDgm = null;
  profZeichnen();
  gpRechnen();
}

/** Beim ersten Bild und nach Wechsel von Art oder Weite: den ganzen Schnitt zeigen, über der Leiste. */
function gpKarteZeigen() {
  if (profPunkte.length < 2) return;
  // Rechts steht die Knopfsäule, darunter die Leiste — so hoch, wie sie mit Diagramm wird
  const unten = Math.min(Math.round(window.innerHeight * 0.6), Math.max($('#bottom').offsetHeight, 290) + 24);
  kartePassen(L.latLngBounds(profPunkte), { paddingTopLeft: [40, 100], paddingBottomRight: [76, unten], maxZoom: 18 });
}

/** Nach einem Sprung: nur nachschieben, wenn die Stelle aus dem freien Teil der Karte läuft. */
function gpNachfuehren() {
  const m = profGleis && profGleis.mitte;
  if (!m) return;
  const p = map.latLngToContainerPoint(m), gr = map.getSize();
  const leiste = $('#bottom'), links = seitenBreite();
  const unten = gr.y - (leiste.hidden || links ? 0 : leiste.getBoundingClientRect().height + 14);
  if (p.x < links + 30 || p.x > gr.x - 30 || p.y < (links ? 30 : 90) || p.y > unten - 20) sichtSetzen(m);
}

/* ============================ Profil als PDF ============================
 *
 * Eine Seite A4 quer zum Teilen: Titel mit Strecke und Kilometer, das Profil
 * als Vektorgrafik im selben Maßstab wie in der Leiste, daneben das Luftbild
 * DOP20 mit der Schnittlinie (der WMS der BVV gibt CORS frei), die Kennwerte
 * und die Quellen, die CC BY 4.0 verlangt. Am Gleis quer auf Wunsch eine Serie:
 * ±50 m alle 10 m, alle Schnitte im selben Höhenfenster, damit man sie
 * nebeneinanderlegen kann. Erzeugt wird in pdf.js, ohne Fremdbibliothek. Auf dem
 * Handy geht danach das Teilen-Menü auf, am Rechner wird die Datei gespeichert. */
const PDF_SERIE = { halb: 50, schritt: 10 };
const PDF_FARBEN = {
  lapis: '#1761a3', text: '#2c2c2a', fein: '#5f5e5a', gitter: '#e3e1d9', rahmen: '#c9c7be',
  gelaende: '#faeeda', gelLinie: '#ba7517', schild: '#854f0b', dom: '#444441',
  geb: '#d3d1c7', gebLinie: '#5f5e5a', marke: '#888780', linie: '#f59e0b'
};
/* Luftbild je Land. Beide Dienste geben CORS frei (LGL am 13.10.2026 geprüft:
 * Access-Control-Allow-Origin *, 880 × 660 px in 1,3 s). */
const PDF_DOP = {
  by: 'https://geoservices.bayern.de/od/wms/dop/v1/dop20?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    '&LAYERS=by_dop20c&STYLES=&CRS=EPSG:25832&FORMAT=image/jpeg',
  bw: 'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
    '&LAYERS=IMAGES_DOP_20_RGB&STYLES=&CRS=EPSG:25832&FORMAT=image/jpeg'
};
const PDF_RAND = 36;

/** Ein Profil in den Rahmen box {x, y, w}; f ist das Höhenfenster. Liefert die Höhe. */
function pdfProfil(s, box, d, achse, f) {
  const F = PDF_FARBEN, li = 34, re = 4, ob = 13, un = 13;
  const pw = box.w - li - re, L = d.dgm.laenge || 1;
  const x0 = box.x + li, yo = box.y + ob, basis = yo + f.ph;
  const X = st => x0 + st / L * pw, Y = z => yo + (f.y1 - z) / (f.y1 - f.y0) * f.ph;
  const yStep = profSchritt((f.y1 - f.y0) / 5), stellen = yStep < 1 ? 1 : 0;
  const nfY = new Intl.NumberFormat('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

  for (let z = Math.ceil(f.y0 / yStep - 1e-9) * yStep; z <= f.y1 + 1e-9; z += yStep) {
    s.linie([[x0, Y(z)], [x0 + pw, Y(z)]], { farbe: F.gitter, breite: 0.4 });
    s.text(x0 - 4, Y(z) + 2.6, nfY.format(z), { groesse: 7, farbe: F.fein, anker: 'end' });
  }
  for (const st of achse.gitter) s.linie([[X(st), yo], [X(st), basis]], { farbe: F.gitter, breite: 0.4 });

  const dgm = profPfad(d.dgm.station, d.dgm.hoehe, X, Y);
  for (const t of dgm) s.linie([...t.punkte, [t.x1, basis], [t.x0, basis]], { farbe: null, fuellung: F.gelaende });
  if (d.geb) for (const b of d.geb) {
    s.linie(b.umriss.map(([st, z]) => [X(st), Y(z)]), { farbe: F.gebLinie, fuellung: F.geb, breite: 0.6, rund: false });
  }
  for (const t of dgm) s.linie(t.punkte, { farbe: F.gelLinie, breite: 1.1 });
  if (d.dom) for (const t of profPfad(d.dom.station, d.dom.hoehe, X, Y)) {
    s.linie(t.punkte, { farbe: F.dom, breite: 0.5, strichel: [2.5, 2] });
  }
  for (const st of achse.marken) s.linie([[X(st), yo], [X(st), basis]], { farbe: F.marke, breite: 0.6, strichel: [2, 2.5] });
  for (const t of achse.oben) s.text(X(t.s), yo - 3.5, t.text, { groesse: 7.5, fett: true, farbe: F.schild, anker: t.anker });
  for (const t of achse.unten) {
    const x = X(t.s), anker = t.anker || (x - x0 < 10 ? 'start' : x0 + pw - x < 10 ? 'end' : 'middle');
    s.text(x, basis + 9.5, t.text, { groesse: 7, farbe: F.fein, anker });
  }
  s.rechteck(x0, yo, pw, f.ph, { farbe: F.rahmen, breite: 0.5 });
  return ob + f.ph + un;
}

/** Luftbild mit den Schnittlinien. linien: [[lat, lon], …] je Linie; hervor: Nummer der aktuellen;
 *  land: wessen DOP20 ('by' oder 'bw'). Gibt das Land zurück, wenn ein Bild kam, sonst ''. */
async function pdfKarte(dok, s, box, linien, { hervor = -1, schilder = [], land = 'by' } = {}) {
  const F = PDF_FARBEN;
  const utm = linien.map(l => l.map(p => utm32Hin(p[0], p[1])));
  let e0 = Infinity, n0 = Infinity, e1 = -Infinity, n1 = -Infinity;
  for (const l of utm) for (const [e, n] of l) { e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n); }
  const rand = Math.max(30, Math.max(e1 - e0, n1 - n0) * 0.25);
  e0 -= rand; e1 += rand; n0 -= rand; n1 += rand;
  // Auf das Seitenverhältnis des Rahmens erweitern, nie beschneiden
  const soll = box.w / box.h, w = e1 - e0, h = n1 - n0;
  if (w / h < soll) { const neu = h * soll; e0 -= (neu - w) / 2; e1 = e0 + neu; }
  else { const neu = w / soll; n0 -= (neu - h) / 2; n1 = n0 + neu; }

  let mitBild = false;
  try {
    const ab = new AbortController(), uhr = setTimeout(() => ab.abort(), 15000);
    const r = await fetch(`${PDF_DOP[land]}&BBOX=${e0.toFixed(1)},${n0.toFixed(1)},${e1.toFixed(1)},${n1.toFixed(1)}` +
      `&WIDTH=${Math.round(box.w * 4)}&HEIGHT=${Math.round(box.h * 4)}`, { signal: ab.signal });
    clearTimeout(uhr);
    if (r.ok && /jpeg/.test(r.headers.get('content-type') || '')) {
      s.bild(dok.bild(new Uint8Array(await r.arrayBuffer())), box.x, box.y, box.w, box.h);
      mitBild = true;
    }
  } catch { /* ohne Netz: ein leerer Rahmen mit Hinweis */ }
  if (!mitBild) {
    s.rechteck(box.x, box.y, box.w, box.h, { farbe: null, fuellung: '#f1efe8' });
    s.text(box.x + box.w / 2, box.y + box.h / 2, 'Luftbild nicht erreichbar', { groesse: 8, farbe: F.fein, anker: 'middle' });
  }

  const X = e => box.x + (e - e0) / (e1 - e0) * box.w, Y = n => box.y + (n1 - n) / (n1 - n0) * box.h;
  s.beschnitten(box.x, box.y, box.w, box.h, () => {
    utm.forEach((l, i) => {
      const pts = l.map(([e, n]) => [X(e), Y(n)]), stark = hervor < 0 || i === hervor;
      // Weißer Rand darunter, damit die Linie auf dem Luftbild steht
      s.linie(pts, { farbe: '#ffffff', breite: stark ? 3.6 : 2.2 });
      s.linie(pts, { farbe: F.linie, breite: stark ? 2 : 1.1, strichel: stark ? [5, 3] : null });
    });
    for (const [text, p] of schilder) {
      const [e, n] = utm32Hin(p[0], p[1]), x = X(e) + 4, y = Y(n) - 4;
      const bw = pdfTextBreite(text, 7, true);
      s.rechteck(x - 2, y - 7, bw + 4, 9.5, { farbe: null, fuellung: '#ffffff' });
      s.text(x, y, text, { groesse: 7, fett: true, farbe: F.schild });
    }
  });

  // Maßstab unten links, Nordpfeil oben rechts (Gitternord, in Bayern höchstens 2,5° neben dem geografischen)
  const m = profSchritt((e1 - e0) / 5), lang = m / (e1 - e0) * box.w, beschr = messText(m);
  const bw = lang + pdfTextBreite(beschr, 7) + 14;
  s.rechteck(box.x + 5, box.y + box.h - 17, bw, 12, { farbe: null, fuellung: '#ffffff' });
  s.linie([[box.x + 9, box.y + box.h - 9], [box.x + 9 + lang, box.y + box.h - 9]], { farbe: F.text, breite: 1.4, rund: false });
  s.text(box.x + 13 + lang, box.y + box.h - 8, beschr, { groesse: 7, farbe: F.text });
  const nx = box.x + box.w - 13, ny = box.y + 8;
  s.rechteck(nx - 7, ny - 3, 14, 23, { farbe: null, fuellung: '#ffffff' });
  s.linie([[nx, ny], [nx + 4, ny + 9], [nx - 4, ny + 9]], { farbe: null, fuellung: F.text });
  s.text(nx, ny + 18, 'N', { groesse: 7.5, fett: true, farbe: F.text, anker: 'middle' });
  s.rechteck(box.x, box.y, box.w, box.h, { farbe: F.rahmen, breite: 0.5 });
  return mitBild ? land : '';
}

/** Quer am Gleis: Höhe am Gleis und Gelände außen gegen das Gleis. */
function pdfQuerWerte(dgm) {
  const L = dgm.laenge, h = profWertBei(dgm, L / 2);
  return { h, li: profWertBei(dgm, 0) - h, re: profWertBei(dgm, L) - h };
}

/* DB_REF, das Bezugssystem der DB (Bessel, Gauß-Krüger in 3°-Streifen).
 * ETRS89 → DB_REF mit der Umkehrung von EPSG:5826 „DB_REF to ETRS89 (1)",
 * Coordinate Frame: Verschiebung in m, Drehung in Bogensekunden, Maßstab in ppm.
 * Geprüft gegen proj4 2.6.2 mit EPSG:5683/5684 und demselben towgs84. */
const DBREF = { tx: 584.9636, ty: 107.7175, tz: 413.8067,
  rx: -1.1155214628, ry: -0.2824339890, rz: 3.1384490633, s: 7.992235 };
const ELL_GRS80 = { a: 6378137, f: 1 / 298.257222101 };
const ELL_BESSEL = { a: 6377397.155, f: 1 / 299.1528128 };

function ellXyz(lat, lon, h, { a, f }) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180, e2 = f * (2 - f);
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  return [(N + h) * Math.cos(p) * Math.cos(l), (N + h) * Math.cos(p) * Math.sin(l), (N * (1 - e2) + h) * Math.sin(p)];
}

function ellAusXyz([x, y, z], { a, f }) {
  const e2 = f * (2 - f), r = Math.hypot(x, y);
  let p = Math.atan2(z, r * (1 - e2)), h = 0;
  for (let i = 0; i < 8; i++) {
    const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
    h = r / Math.cos(p) - N;
    p = Math.atan2(z, r * (1 - e2 * N / (N + h)));
  }
  return [p * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI];
}

/** Transversale Mercator nach Krüger (vierte Ordnung) auf beliebigem Ellipsoid. */
function tmHin(lat, lon, { a, f }, l0, k0, e0) {
  const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
  const alpha = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440,
    61 * n3 / 240 - 103 * n4 / 140, 49561 * n4 / 161280];
  const p = lat * Math.PI / 180, l = (lon - l0) * Math.PI / 180, ex = 2 * Math.sqrt(n) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(p)) - ex * Math.atanh(ex * Math.sin(p)));
  const xi1 = Math.atan2(t, Math.cos(l)), eta1 = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let xi = xi1, eta = eta1;
  for (let j = 1; j <= 4; j++) {
    xi += alpha[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
    eta += alpha[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
  }
  return [e0 + k0 * A * eta, k0 * A * xi];
}

/** Rückweg der transversalen Mercator: [Rechts, Hoch] → [lat, lon] in Grad. */
function tmZurueck(e, nord, { a, f }, l0, k0, e0) {
  const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
  const beta = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360, n2 / 48 + n3 / 15 - 437 * n4 / 1440,
    17 * n3 / 480 - 37 * n4 / 840, 4397 * n4 / 161280];
  const delta = [2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45, 7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45,
    56 * n3 / 15 - 136 * n4 / 35, 4279 * n4 / 630];
  const xi = nord / (k0 * A), eta = (e - e0) / (k0 * A);
  let xi1 = xi, eta1 = eta;
  for (let j = 1; j <= 4; j++) {
    xi1 -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    eta1 -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let p = chi;
  for (let j = 1; j <= 4; j++) p += delta[j - 1] * Math.sin(2 * j * chi);
  return [p * 180 / Math.PI, l0 + Math.atan2(Math.sinh(eta1), Math.cos(xi1)) * 180 / Math.PI];
}

/** ETRS89 (Grad) → Gauß-Krüger im Bezugssystem par (Parameter wie DBREF): [Rechts, Hoch]. */
function gkHin(lat, lon, streifen, par) {
  const [x, y, z] = ellXyz(lat, lon, 0, ELL_GRS80);
  const sek = Math.PI / 180 / 3600, rx = par.rx * sek, ry = par.ry * sek, rz = par.rz * sek;
  const m = 1 + par.s * 1e-6;
  // Umkehrung von X_etrs = T + m·R·X_alt: X_alt = Rᵀ·(X_etrs − T) / m
  const u = (x - par.tx) / m, v = (y - par.ty) / m, w = (z - par.tz) / m;
  const xd = u - rz * v + ry * w, yd = rz * u + v - rx * w, zd = -ry * u + rx * v + w;
  const [pb, lb] = ellAusXyz([xd, yd, zd], ELL_BESSEL);
  return tmHin(pb, lb, ELL_BESSEL, 3 * streifen, 1, streifen * 1e6 + 500000);
}

/** Gauß-Krüger [Rechts, Hoch] im Bezugssystem par → ETRS89 [lat, lon]. Für die
 *  Koordinatensuche (projLesen). Der
 *  Streifen steht in der ersten Ziffer des Rechtswerts. */
function gkZurueck(r, h, par) {
  const streifen = Math.floor(r / 1e6);
  const [pb, lb] = tmZurueck(r, h, ELL_BESSEL, 3 * streifen, 1, streifen * 1e6 + 500000);
  const [x, y, z] = ellXyz(pb, lb, 0, ELL_BESSEL);
  const sek = Math.PI / 180 / 3600, rx = par.rx * sek, ry = par.ry * sek, rz = par.rz * sek;
  const m = 1 + par.s * 1e-6;
  // X_etrs = T + m·R·X_alt, R wie oben, nur nicht transponiert
  const xe = par.tx + m * (x + rz * y - ry * z);
  const ye = par.ty + m * (-rz * x + y + rx * z);
  const ze = par.tz + m * (ry * x - rx * y + z);
  return ellAusXyz([xe, ye, ze], ELL_GRS80);
}

/** ETRS89 (Grad) → DB_REF Gauß-Krüger im Streifen 3 oder 4: [Rechts, Hoch]. */
function dbrefGk(lat, lon, streifen) { return gkHin(lat, lon, streifen, DBREF); }

/* Die Streifengrenze liegt bei 10,5° O, mitten durch Bayern. Nahe daran
 * (±0,5°) stehen beide Streifen da — welcher im Plan gilt, ist dort nicht klar. */
function dbrefStreifen(lon) {
  if (Math.abs(lon - 10.5) < 0.5) return [3, 4];
  return [lon < 10.5 ? 3 : 4];
}

/* Auf ganze Meter: Die Lage selbst ist nur auf ±10–30 m bekannt (siehe
 * pdfGenauigkeit) — Dezimeter täuschten eine Vermessung vor. */
const pdfKoord = (lat, lon) => {
  const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const [e, n] = utm32Hin(lat, lon);
  return [`${lat.toFixed(5).replace('.', ',')}° N  ${lon.toFixed(5).replace('.', ',')}° O`, `UTM 32: ${nf.format(e)} / ${nf.format(n)}`,
    ...dbrefStreifen(lon).map(s => { const [r, h] = dbrefGk(lat, lon, s); return `DB_REF GK${s}: ${nf.format(r)} / ${nf.format(h)}`; })];
};

/** Die Angaben rechts unter dem Luftbild, als [Bezeichnung, Wert, Erklärung].
 *  Die Erklärung steht klein darunter — in der Leiste stehen diese Zahlen nicht
 *  mehr, hier sollen sie ohne Rätseln lesbar sein. */
function pdfAngaben(z) {
  const { g, dgm } = z, kw = profKennwerte(dgm, z.dom, z.domDgm), raus = [];
  const hm = v => Number.isFinite(v) ? `${nfH.format(v)} m` : '–';
  if (g && g.art === 'quer') {
    const q = pdfQuerWerte(dgm);
    raus.push(['Höhe am Gleis', `${hm(q.h)} ü. NHN`, 'Gelände in der Gleisachse (DGM1)'],
      ...(z.geb ? [['Gebäude ab Gleis', gebWand(z.geb, dgm.laenge, z.breite) || 'keine im Schnitt',
        'waagrecht von der Gleisachse bis zur nächsten Wand']] : []),
      ['Breite', `je ${nfM.format(z.breite)} m`, 'links und rechts mit Blick in Richtung steigender km']);
  } else if (g) {
    raus.push(['Höhe am Gleis', `${hm(profWertBei(dgm, dgm.ecken[g.mitteIndex]))} ü. NHN`, 'Gelände in der Gleisachse am gesuchten km']);
    const ng = profNeigung(dgm);
    if (Number.isFinite(ng)) raus.push(['Neigung', `${profVz(ng)} ‰`, 'Ausgleichsgerade über den Schnitt; plus: steigt mit km']);
    raus.push(['Höhenunterschied', `${profVz(kw.dh)} m`, 'Gelände am Ende minus am Anfang'], ['Gleislänge', messText(dgm.laenge)]);
  } else {
    raus.push(['Länge', messText(dgm.laenge)], ['Höhenunterschied', `${profVz(kw.dh)} m`, 'Gelände bei B minus bei A'],
      ['Tiefster / höchster', `${hm(kw.min)} / ${hm(kw.max)}`, 'Gelände im ganzen Schnitt, ü. NHN']);
    if (z.versatz) raus.push(['Versetzt', `${z.versatz > 0 ? '+' : '−'}${nfM.format(Math.abs(z.versatz))} m`, 'parallel, plus: links von A→B']);
  }
  if (kw.obj) raus.push([`Objekte (${domName(z.dom, false)})`, `bis ${nfH.format(kw.obj.hoehe)} m`, 'höchster Punkt der Oberfläche über dem Gelände']);
  const ort = g ? g.mitte : z.linie[0];
  if (ort) pdfKoord(ort[0], ort[1]).forEach((t, i) => raus.push([i ? '' : g ? 'Lage am Gleis' : 'Lage A', t]));
  return raus;
}

/* Genauigkeit: was die Quellen selbst angeben. Das PDF ist eine Übersicht, und
 * wer es in der Hand hat, soll das sehen, ohne die App zu kennen. Angaben der
 * Bayerischen Vermessungsverwaltung (Produktseiten und Metadaten, Oktober 2026);
 * Gleislage und km aus den Messungen in der README („Wie genau ist das?"). */
function pdfGenauigkeit(s, x, y, quellen) {
  const F = PDF_FARBEN;
  const zeilen = [
    ['Gleislage, km', 'OSM, typisch ±10–30 m, vereinzelt mehr'],
    ['Koordinaten', 'so genau wie die Lage, aus der sie stammen'],
    quellen.by !== false && [quellen.bw ? 'DGM1 Bayern' : 'Gelände DGM1', 'Höhe ±0,2 m, Lage ±0,5 m (freies Gelände)'],
    quellen.bw && ['DGM1 BW', 'Genauigkeit 0,15 m laut Kachelangaben des LGL'],
    quellen.dom && (quellen.domBy || !quellen.domBw) && ['Oberfläche DOM20', 'regional verschieden, ohne feste Angabe'],
    quellen.domBw && ['Oberfläche DOM1', `1 m Raster, 0,15 m laut Kachelangaben${quellen.domStand ? `, Befliegung ${quellen.domStand}` : ''}`],
    quellen.geb && (quellen.gebBy || !quellen.gebBw) && [quellen.gebBw ? 'LoD2 Bayern' : 'Gebäude LoD2', 'Dachhöhe typ. ±0,2–0,3 m, bis über 1 m'],
    quellen.gebBw && ['LoD2 BW', 'ohne Angabe des LGL'],
    quellen.dop && ['Luftbild DOP20', 'Lage ±0,4–0,6 m'],
    quellen.dopBw && ['Luftbild DOP20', 'ohne Angabe des LGL'],
  ].filter(Boolean);
  s.text(x, y, 'Genauigkeit', { groesse: 7.5, fett: true, farbe: F.text });
  y += 10;
  s.text(x, y, 'Zur Übersicht, keine Vermessung. Angaben der Datenquellen:', { groesse: 6.5, farbe: F.fein });
  for (const [k, v] of zeilen) {
    y += 9;
    s.text(x, y, k, { groesse: 6.5, farbe: F.fein });
    s.text(x + 62, y, v, { groesse: 6.5, farbe: F.text });
  }
}

/** Ein Satz unter dem Titel: was der Schnitt zeigt und wie er liegt. */
function pdfSchnittText(z) {
  const g = z.g;
  if (g && g.art === 'quer') return 'Querschnitt rechtwinklig zum Gleis, Blick in Richtung steigender km: links im Bild ist links vom Gleis.';
  if (g) return 'Längsschnitt in der Gleisachse; die km-Angaben stehen an der Achse.';
  return `Geländeschnitt entlang der getippten Punkte ${profName(0)}–${profName(z.linie.length - 1)}.`;
}

/* Ein Schnitt mit allem, was eine PDF-Seite braucht — vom offenen Profil
 * abgezogen. Kopien, wo das offene Profil später weiterverändert wird
 * (Springen ändert profGleis, ein Tipp hängt an profPunkte an); die
 * Höhenprofile selbst werden nur ersetzt, nie verändert. */
function profSchnitt() {
  return {
    g: profGleis && { ref: profGleis.ref, km: profGleis.km, art: profGleis.art, mitte: profGleis.mitte,
      kms: profGleis.kms && [...profGleis.kms], mitteIndex: profGleis.mitteIndex },
    dgm: profDgm, dom: profDom, domDgm: profDomDgm, geb: profGeb,
    linie: profLinie().map(p => [p[0], p[1]]), versatz: profVersatz,
    breite: gpBreite(), laenge: gpLaenge(),
    // Dieselbe Überhöhung wie im Bild der Leiste, nicht die womöglich steilere gemerkte Wahl
    wahl: profUeberRunden(profUeberWirksam())
  };
}

/** Titel auf der Seite und Dateiname. */
function pdfTitel(z, serie = false) {
  const g = z.g;
  if (g && g.art === 'quer') {
    const wort = serie ? 'Querprofile' : 'Querprofil';
    return { titel: `${wort} Strecke ${g.ref} · km ${fmtKm(g.km)}`, name: `${wort} ${g.ref} km ${fmtKm(g.km)}.pdf` };
  }
  if (g) {
    const a = fmtKm(g.kms[0]), b = fmtKm(g.kms[g.kms.length - 1]);
    return { titel: `Längsprofil Strecke ${g.ref} · km ${a} – ${b}`, name: `Längsprofil ${g.ref} km ${a}-${b}.pdf` };
  }
  return { titel: `Geländeprofil ${profName(0)}–${profName(z.linie.length - 1)}`,
    name: `Geländeprofil ${new Date().toISOString().slice(0, 10)}.pdf` };
}

/* Die Seite eines Schnitts: Diagramm links, Luftbild und Angaben rechts.
 * serie: die Querschnitte der Serie, nur fürs Luftbild. Gibt die Quellen
 * zurück, die auf der Seite vorkommen. */
async function pdfSchnittSeite(dok, z, { titel, nr = 1, gesamt = 1, serie = null }) {
  const F = PDF_FARBEN, g = z.g, s = dok.seite();
  const L = z.dgm.laenge, achse = profAchse(L, z);
  const box = { x: PDF_RAND, y: 92, w: 530 };
  const [zmin, zmax] = profZSpanne(z);
  const f = profHoehenfenster(zmin, zmax, L, box.w - 38, z.wahl, 170, 400);
  const weite = g ? `±${nfM.format(g.art === 'quer' ? z.breite : z.laenge)} m` : messText(L);
  pdfKopf(s, titel, `${new Date().toLocaleDateString('de-DE')} · ${weite} · ${pdfUeberText(z.wahl, f.k)}`);

  // Die Kennwerte stehen mit Erklärung rechts unter dem Luftbild; hier nur, was der Schnitt zeigt
  s.text(PDF_RAND, 74, pdfSchnittText(z), { groesse: 9, farbe: F.fein });
  pdfProfil(s, box, z, achse, f);
  const leg = [['Gelände DGM1', F.gelLinie, null]];
  if (z.dom) leg.push([`Oberfläche ${domName(z.dom)}`, F.dom, [2.5, 2]]);
  if (z.geb) leg.push(['Gebäude LoD2', F.gebLinie, 'block']);
  let lx = box.x + 34;
  const ly = box.y + f.ph + 40;
  for (const [text, farbe, art2] of leg) {
    if (art2 === 'block') s.rechteck(lx, ly - 6, 14, 7, { farbe, fuellung: F.geb, breite: 0.6 });
    else s.linie([[lx, ly - 2.5], [lx + 14, ly - 2.5]], { farbe, breite: art2 ? 0.6 : 1.2, strichel: art2 });
    lx += 18 + s.text(lx + 18, ly, text, { groesse: 7.5, farbe: F.fein }) + 14;
  }

  const kbox = { x: 586, y: 92, w: 220, h: 165 };
  const linien = serie ? serie.map(q => q.punkte) : [z.linie];
  const hervor = serie ? serie.findIndex(q => Math.abs(q.km - g.km) < 1e-6) : -1;
  const n = linien[0].length;
  const schilder = serie ? [] : g && g.art === 'quer' ? [['links', linien[0][0]], ['rechts', linien[0][1]]]
    : g ? [] : linien[0].map((p, i) => [profName(i), p]);
  if (g && g.art === 'laengs') schilder.push(['km ' + fmtKm(g.kms[0]), linien[0][0]], ['km ' + fmtKm(g.kms[g.kms.length - 1]), linien[0][n - 1]]);
  /* Luftbild des Landes, in dem das Gelände liegt; an der Grenze (beide) das
   * bayerische wie bisher — der Rahmen um Bayern reicht weit nach Württemberg,
   * nach Lage allein ließe sich das nicht entscheiden. */
  const gl = pdfLaender([z.dgm, ...(serie || []).map(q => q.dgm)]);
  const mitBild = await pdfKarte(dok, s, kbox, linien, { hervor, schilder, land: gl.bw && !gl.by ? 'bw' : 'by' });
  s.text(kbox.x, kbox.y + kbox.h + 10, mitBild ? `Luftbild DOP20${serie ? ` · ${serie.length} Schnitte, alle ${PDF_SERIE.schritt} m` : ''}` : '',
    { groesse: 7, farbe: F.fein });
  let ay = kbox.y + kbox.h + 30;
  for (const [k, v, erkl] of pdfAngaben(z)) {
    if (k) s.text(kbox.x, ay, k, { groesse: 7.5, farbe: F.fein });
    s.text(kbox.x + 82, ay, v, { groesse: 8, farbe: F.text });
    // Über die ganze Spaltenbreite, rechts neben der Bezeichnung wäre sie zu schmal
    if (erkl) { ay += 9; s.text(kbox.x, ay, erkl, { groesse: 6.5, farbe: F.fein }); }
    ay += 12.5;
  }
  const dom = z.dom ? profLaender(z.dom) : {}, geb = gebLaender([z.geb, ...(serie || []).map(q => q.geb)]);
  const quellen = { dom: !!z.dom, geb: !!z.geb, dop: mitBild === 'by', dopBw: mitBild === 'bw', osm: !!g, ...gl,
    domBy: !!dom.by, domBw: !!dom.bw, domStand: z.dom ? domName(z.dom).replace(/^\S+ ?/, '') : '', gebBy: geb.by, gebBw: geb.bw };
  pdfGenauigkeit(s, kbox.x, ay + 6, quellen);
  pdfFuss(s, nr, gesamt, quellen);
  return quellen;
}

/** Aus welchen Ländern die Gebäude im Schnitt stammen — die ALKIS-Kennung
 *  beginnt mit DEBY bzw. DEBW. */
function gebLaender(listen) {
  const ids = listen.flatMap(l => l || []).map(b => b.id || '');
  return { by: ids.some(i => !/^DEBW/i.test(i)), bw: ids.some(i => /^DEBW/i.test(i)) };
}

/** Aus welchen Ländern die Geländehöhen stammen: { by, bw }. Ohne Angabe
 *  (ältere Schnitte) Bayern. Die Serie kann an der Grenze beide berühren. */
function pdfLaender(dgms) {
  const l = new Set(dgms.flatMap(d => (d && d.quellen) || []));
  if (!l.size) l.add('by');
  return { by: l.has('by'), bw: l.has('bw') };
}

/** quellen: was im PDF vorkommt — { dom, geb, dop, osm, by, bw } */
function pdfFuss(s, nr, gesamt, quellen) {
  const F = PDF_FARBEN, y = s.hoehe - 26;
  // Ältere Aufrufe ohne Landesangabe für Oberfläche und Gebäude: Bayern
  const domBy = quellen.dom && (quellen.domBy || !quellen.domBw), gebBy = quellen.geb && (quellen.gebBy || !quellen.gebBw);
  const bvv = [quellen.by && 'Gelände DGM1', domBy && 'Oberfläche DOM20', gebBy && 'Gebäude LoD2', quellen.dop && 'Luftbild DOP20']
    .filter(Boolean).join(', ');
  const lgl = [quellen.bw && 'Gelände DGM1', quellen.domBw && 'Oberfläche DOM1', quellen.gebBw && 'Gebäude LoD2', quellen.dopBw && 'Luftbild DOP20']
    .filter(Boolean).join(', ');
  const teile = [
    bvv && `${bvv}: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de, CC BY 4.0, bearbeitet.`,
    lgl && `${lgl} in BW: LGL-BW (${new Date().getFullYear()}), dl-de/by-2-0, www.lgl-bw.de, bearbeitet.`,
    quellen.osm && 'Kilometrierung und Gleislage: © OpenStreetMap-Mitwirkende (ODbL).'
  ].filter(Boolean);
  s.linie([[PDF_RAND, y - 10], [s.breite - PDF_RAND, y - 10]], { farbe: F.rahmen, breite: 0.5 });
  s.text(PDF_RAND, y, teile.join(' '), { groesse: 6.5, farbe: F.fein });
  s.text(PDF_RAND, y + 9, 'Keine amtliche Quelle — zur Übersicht, nicht für Vermessung oder sicherheitsrelevante ' +
    'Entscheidungen. Erstellt mit Topovo.', { groesse: 6.5, farbe: F.fein });
  if (gesamt > 1) s.text(s.breite - PDF_RAND, y + 9, `Seite ${nr} von ${gesamt}`, { groesse: 7, farbe: F.fein, anker: 'end' });
}

function pdfKopf(s, titel, rechts) {
  const F = PDF_FARBEN;
  s.text(PDF_RAND, 46, titel, { groesse: 16, fett: true, farbe: F.lapis });
  s.text(s.breite - PDF_RAND, 46, rechts, { groesse: 8.5, farbe: F.fein, anker: 'end' });
  s.linie([[PDF_RAND, 54], [s.breite - PDF_RAND, 54]], { farbe: F.lapis, breite: 0.8 });
}

const pdfUeberText = (wahl, k) => {
  const t = v => (v >= 10 ? nfM.format(v) : nfH.format(v).replace(/,0$/, '')) + '×';
  return k < wahl * 0.97 ? `${t(k)} überhöht (gestaucht)` : wahl === 1 ? 'unüberhöht' : `${t(wahl)} überhöht`;
};

/** art: 'eins' oder 'serie' (nur quer am Gleis). */
async function profPdfErstellen(art) {
  if (!profDgm || (profPdf && profPdf.laeuft)) return;
  const stand = profPdfStand;
  stand('PDF wird erstellt …');
  try {
    const z = profSchnitt(), g = z.g, F = PDF_FARBEN, wahl = z.wahl;
    const { titel, name } = pdfTitel(z, art === 'serie');

    // Serie: jeder Schnitt mit denselben Ebenen wie gerade in der Leiste
    let serie = null;
    if (art === 'serie' && g && g.art === 'quer') {
      serie = [];
      const W = z.breite, anzahl = Math.round(2 * PDF_SERIE.halb / PDF_SERIE.schritt) + 1;
      for (let i = 0; i < anzahl; i++) {
        const km = Math.round((g.km + (i * PDF_SERIE.schritt - PDF_SERIE.halb) / 1000) * 1e6) / 1e6;
        stand(`Querschnitt ${i + 1} von ${anzahl} …`);
        const q = await gpQuerPunkte(g.ref, km, W);
        if (!q) continue;
        const dgm = await hoehenProfil(q.punkte, 'dgm1');
        const dom = z.dom ? await hoehenProfil(q.punkte, 'dom20', { maxPunkte: 6000 }) : null;
        const geb = z.geb ? await gebaeudeImSchnitt(q.punkte, dgm) : null;
        serie.push({ km, ...q, dgm, dom, geb });
      }
      if (!serie.length) throw new Error('kein Querschnitt bestimmbar');
    }

    stand('Luftbild wird geladen …');
    const dok = new PdfDokument({ titel });
    const L = z.dgm.laenge;
    // Serie: zwei Spalten, so viele Reihen, wie das gemeinsame Höhenfenster zulässt — flache Schnitte liegen dicht
    let sl = null;
    if (serie) {
      let smin = Infinity, smax = -Infinity;
      for (const q of serie) { const [a, b] = profZSpanne(q); smin = Math.min(smin, a); smax = Math.max(smax, b); }
      const zw = (PDF_A4_QUER[0] - 2 * PDF_RAND - 24) / 2, frei = PDF_A4_QUER[1] - 72 - 50;
      const fs = profHoehenfenster(smin, smax, L, zw - 38, wahl, 60, frei - 60);
      const zh = fs.ph + 46, reihen = Math.max(1, Math.floor((frei + 10) / (zh + 10)));
      sl = { zw, fs, zh, jeSeite: 2 * reihen };
    }
    const gesamt = serie ? 1 + Math.ceil(serie.length / sl.jeSeite) : 1;
    const quellen = await pdfSchnittSeite(dok, z, { titel, gesamt, serie });

    if (serie) {
      // Alle Schnitte im selben Fenster: gemeinsame Höhenspanne, derselbe Maßstab
      const { zw, fs, zh, jeSeite } = sl;
      const kopf = `Querprofile Strecke ${g.ref} · km ${fmtKm(serie[0].km)} – ${fmtKm(serie[serie.length - 1].km)}`;
      for (let p = 0; p * jeSeite < serie.length; p++) {
        const sp = dok.seite();
        pdfKopf(sp, kopf, `alle ${PDF_SERIE.schritt} m · ±${nfM.format(z.breite)} m · ${pdfUeberText(wahl, fs.k)} · gleiches Höhenfenster`);
        serie.slice(p * jeSeite, (p + 1) * jeSeite).forEach((q, j) => {
          const x = PDF_RAND + (j % 2) * (zw + 24), y = 70 + Math.floor(j / 2) * (zh + 10);
          const qw = pdfQuerWerte(q.dgm), aktuell = Math.abs(q.km - g.km) < 1e-6;
          sp.text(x, y + 10, `km ${fmtKm(q.km)}${aktuell ? '  (aktuell)' : ''}`, { groesse: 10, fett: true, farbe: aktuell ? F.lapis : F.text });
          // Ohne den Höhenversatz am Rand — der sagte im Plan nichts
          const gw = q.geb && gebWand(q.geb, q.dgm.laenge, z.breite);
          sp.text(x + zw, y + 10, `Gleis ${Number.isFinite(qw.h) ? nfH.format(qw.h) : '–'} m ü. NHN` +
            (gw ? ` · Gebäude ab Gleis ${gw}` : ''), { groesse: 7.5, farbe: F.fein, anker: 'end' });
          pdfProfil(sp, { x, y: y + 16, w: zw }, q, profAchse(q.dgm.laenge, { g, dgm: q.dgm, breite: z.breite }), fs);
        });
        pdfFuss(sp, p + 2, gesamt, quellen);
      }
    }

    stand('PDF wird geschrieben …');
    const datei = new File([await dok.bytes()], name, { type: 'application/pdf' });
    await pdfAusgeben(datei, titel);
  } catch (err) {
    profPdf = null;
    profLeiste();
    toast(`PDF nicht erstellt (${err.message}).`);
  }
}

function profPdfStand(t) {
  profPdf = { laeuft: t };
  const el = $('#profPdfStand');
  if (el) el.textContent = t; else profLeiste();
}

/** Auf dem Handy das Teilen-Menü, sonst speichern. Ist die Geste zu lange her
 *  (eine Serie dauert Sekunden), braucht das Teilen einen zweiten Tipp: Dann
 *  kommt { fertig, titel } zurück, sonst null. */
async function pdfRaus(datei, titel) {
  const mobil = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (mobil && navigator.canShare && navigator.canShare({ files: [datei] })) {
    try {
      await navigator.share({ files: [datei], title: titel });
      return null;
    } catch (err) {
      return err.name === 'AbortError' ? null : { fertig: datei, titel };
    }
  }
  pdfSpeichern(datei);
  toast(`PDF gespeichert: ${datei.name}`);
  return null;
}

async function pdfAusgeben(datei, titel) {
  profPdf = await pdfRaus(datei, titel);
  profLeiste();
}

function pdfSpeichern(datei) {
  const url = URL.createObjectURL(datei), a = document.createElement('a');
  a.href = url;
  a.download = datei.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Die Zeile unter dem Kopf: Auswahl, Fortschritt oder „fertig". */
function profPdfZeile() {
  if (!profPdf) return '';
  if (profPdf.laeuft) return `<div class="prof-pdf"><span id="profPdfStand">${esc(profPdf.laeuft)}</span></div>`;
  const zu = '<button type="button" class="prof-pdf-zu" data-pdf="zu" aria-label="Schließen">×</button>';
  if (profPdf.fertig) {
    return '<div class="prof-pdf"><span>PDF fertig</span><button type="button" data-pdf="teilen">Teilen</button>' +
      `<button type="button" data-pdf="speichern">Speichern</button>${zu}</div>`;
  }
  const anzahl = Math.round(2 * PDF_SERIE.halb / PDF_SERIE.schritt) + 1;
  const quer = profGleis && profGleis.art === 'quer';
  const serie = quer ? `<button type="button" data-pdf="serie">Serie ±${PDF_SERIE.halb} m · ${anzahl} Schnitte</button>` : '';
  // Quer am Gleis: Strecke und km in die Profilmappe (Messmenü) schreiben
  const n = mappeEintraege().length;
  const mappe = quer ? '<span class="prof-pdf-umbruch"></span>' +
    `<button type="button" data-pdf="mappe">+ In die Profilmappe${n ? ` (${n})` : ''}</button>` : '';
  return `<div class="prof-pdf"><span>PDF</span><button type="button" data-pdf="eins">Dieser Schnitt</button>${serie}${zu}${mappe}</div>`;
}

function profPdfTipp(was) {
  if (was === 'zu') { profPdf = null; profLeiste(); return; }
  if (was === 'eins' || was === 'serie') { profPdfErstellen(was); return; }
  if (was === 'mappe') { mappeDazu(profGleis.ref, profGleis.km); profLeiste(); return; }
  const f = profPdf && profPdf.fertig;
  if (!f) return;
  if (was === 'speichern') { pdfSpeichern(f); profPdf = null; profLeiste(); return; }
  navigator.share({ files: [f], title: profPdf.titel }).then(() => { profPdf = null; profLeiste(); }).catch(() => {});
}

/* ---- Profilmappe (Messmenü) ----
 *
 * Querschnitte an mehreren Stellen, auch auf verschiedenen Strecken, als ein
 * PDF mit einer Seite je Schnitt. Eingegeben wird eine Liste: je Zeile eine
 * Strecke und ein oder mehrere Kilometer, wie im Suchfeld („5321 106,0 &
 * 106,2"). Die Liste bleibt gespeichert; aus dem Querprofil legt „+ In die
 * Profilmappe" Strecke und km dazu. Breite, Ebenen und Überhöhung gelten für
 * alle Schnitte, damit die Seiten vergleichbar sind.
 *
 * Bis Oktober 2026 sammelte eine „Mappe" in der PDF-Zeile die gerade offenen
 * Schnitte als Schnappschuss — zu wenig greifbar: Man sah nicht, was drin war,
 * und nach einem Neustart war sie weg. */
const MAPPE_UEBER = [1, 2, 5, 10];
let mappeOffen = false;
let mappeStand = '';                   // Fortschritt beim Erstellen
let mappeFertig = null;                // { fertig: File, titel }: Teilen braucht einen zweiten Tipp
let mappeFehlt = [];                   // Schnitte, die beim letzten Erstellen nicht zustande kamen

const mappeBreite = () => GP_BREITEN.includes(prefs.mappeBreite) ? prefs.mappeBreite : 50;
const mappeUeber = () => MAPPE_UEBER.includes(prefs.mappeUeber) ? prefs.mappeUeber : 1;

/** Die Zeilen der Liste als [{ ref, km }]; unlesbare Zeilen unter fehler (Zeilennummern ab 1). */
function mappeLesen(text = prefs.mappeText || '') {
  const eintraege = [], fehler = [];
  text.split(/\r?\n/).forEach((zeile, i) => {
    const t = kmTokens(zeile);
    if (!t.length) return;
    const kms = t.slice(1).map(toKm);
    if (!/^\d{3,4}$/.test(t[0]) || !kms.length || !kms.every(Number.isFinite)) { fehler.push(i + 1); return; }
    for (const km of kms) eintraege.push({ ref: t[0], km });
  });
  return { eintraege, fehler };
}
const mappeEintraege = () => mappeLesen().eintraege;

/** Strecke und km hinten anhängen — an die letzte Zeile, wenn sie dieselbe Strecke hat. */
function mappeDazu(ref, km) {
  const zeilen = (prefs.mappeText || '').split(/\r?\n/).filter(z => z.trim());
  const letzte = zeilen.length ? kmTokens(zeilen[zeilen.length - 1]) : [];
  if (letzte[0] === ref) zeilen[zeilen.length - 1] += ` & ${fmtKm(km)}`;
  else zeilen.push(`${ref} ${fmtKm(km)}`);
  prefs.mappeText = zeilen.join('\n');
  saveStore();
  const n = mappeEintraege().length;
  toast(`In der Profilmappe: ${n} ${n === 1 ? 'Querschnitt' : 'Querschnitte'}`);
}

function mappeStart() {
  if (laserAn) laserEnde(false);
  if (routeAn) routeEnde(false);
  if (profModus) profEnde(false);
  if (messModus) messEnde();
  mappeOffen = true;
  mappeFertig = null;
  mappeFehlt = [];
  leisteZu(false);                 // ab 1010 px steht die Bedienung in der Leiste
  closeSheet();
  mappeLeiste();
  syncButtons();
}

function mappeEnde() {
  mappeOffen = false;
  mappeStand = '';
  mappeFertig = null;
  syncButtons();
  renderBottom();
}

/** Anzahl und unlesbare Zeilen — ohne die Leiste neu zu bauen, damit das Textfeld den Fokus behält. */
function mappeZaehlen() {
  const { eintraege, fehler } = mappeLesen();
  const n = eintraege.length;
  $('#mappeAnzahl').textContent = `${n} ${n === 1 ? 'Querschnitt' : 'Querschnitte'}`;
  $('#mappeFehler').textContent = fehler.length
    ? `Nicht lesbar: Zeile ${fehler.join(', ')} — erst die Strecke, dann die Kilometer` : '';
  $('#mappeLos').disabled = !n || !!mappeStand;
}

function mappeLeiste() {
  const b = $('#bottom');
  b.dataset.art = 'profil';        // ab 1010 px in der Leiste links unter der Suche (wie die Route)
  b.hidden = false;
  const W = mappeBreite(), u = mappeUeber();
  const ebene = (id, an, text, geb) => `<button type="button" class="prof-dom${geb ? ' prof-geb' : ''}${an ? ' is-on' : ''}" ` +
    `id="${id}" aria-pressed="${an}">${text}</button>`;
  const striche = GP_BREITEN.map((_, i) => `<i style="--p:${(i / (GP_BREITEN.length - 1)).toFixed(4)}"></i>`).join('');
  const stand = mappeStand ? `<p class="mappe-stand">${esc(mappeStand)}</p>`
    : mappeFertig ? '<div class="prof-pdf"><span>PDF fertig</span><button type="button" data-mappe="teilen">Teilen</button>' +
      '<button type="button" data-mappe="speichern">Speichern</button></div>' : '';
  const fehlt = mappeFehlt.length
    ? `<p class="bb-note">Ohne Seite: ${mappeFehlt.map(esc).join(' · ')}</p>` : '';
  b.innerHTML = `
    <button type="button" id="bbClose" class="bb-close" aria-label="Profilmappe schließen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    ${hilfeKnopf('mappe', 'Profilmappe')}
    <div class="bb-head"><p class="bb-title">Profilmappe</p><span class="tag" id="mappeAnzahl"></span></div>
    <textarea id="mappeText" class="mappe-text" rows="4" spellcheck="false" autocomplete="off"
      aria-label="Strecken und Kilometer, je Zeile eine Strecke"
      placeholder="5321 106,0 &amp; 106,2&#10;5100 12,5">${esc(prefs.mappeText || '')}</textarea>
    <p class="mappe-hilfe">Je Zeile eine Strecke, dahinter ein oder mehrere km. Jeder Querschnitt wird eine Seite.</p>
    <p class="mappe-fehler" id="mappeFehler"></p>
    <div class="prof-regler">
      <span class="prof-ebenen">${ebene('mappeGeb', !!prefs.mappeGeb, 'Gebäude', true)}${ebene('mappeDom', !!prefs.mappeDom, 'Oberfläche')}</span>
      <label class="prof-rname" for="mappeBreite">Breite</label>
      <span class="prof-weite"><span class="prof-striche" aria-hidden="true">${striche}</span>
        <input type="range" id="mappeBreite" min="0" max="${GP_BREITEN.length - 1}" step="1" value="${GP_BREITEN.indexOf(W)}"></span>
      <output class="prof-wert" id="mappeBreiteWert" for="mappeBreite">${gpWeiteText(W)}</output>
      <span class="prof-rname">Überhöht</span>
      <span class="mappe-ueber" role="group" aria-label="Überhöhung">${MAPPE_UEBER.map(v =>
        `<button type="button" data-ueber="${v}" aria-pressed="${v === u}">${v}×</button>`).join('')}</span>
    </div>
    <div class="bb-actions knapp">
      <button type="button" id="mappeAktuell"${view.ref && view.km != null ? '' : ' disabled'}
        title="Strecke und km des aktuellen Suchergebnisses anhängen">+ Aktuelles Ergebnis</button>
      <button type="button" id="mappeLos" class="primary">PDF erstellen</button>
    </div>
    ${stand}${fehlt}`;

  const an = (sel, f, ev = 'click') => { const el = b.querySelector(sel); if (el) el.addEventListener(ev, f); };
  an('#bbClose', mappeEnde);
  an('#mappeText', ev => { prefs.mappeText = ev.target.value; saveStore(); mappeZaehlen(); }, 'input');
  an('#mappeGeb', () => { prefs.mappeGeb = !prefs.mappeGeb; saveStore(); mappeLeiste(); });
  an('#mappeDom', () => { prefs.mappeDom = !prefs.mappeDom; saveStore(); mappeLeiste(); });
  an('#mappeBreite', ev => { $('#mappeBreiteWert').textContent = gpWeiteText(GP_BREITEN[ev.target.value]); }, 'input');
  an('#mappeBreite', ev => { prefs.mappeBreite = GP_BREITEN[ev.target.value]; saveStore(); }, 'change');
  b.querySelectorAll('[data-ueber]').forEach(k => k.addEventListener('click', () => {
    prefs.mappeUeber = Number(k.dataset.ueber); saveStore(); mappeLeiste();
  }));
  an('#mappeAktuell', () => { mappeDazu(view.ref, view.km); mappeLeiste(); });
  an('#mappeLos', mappePdf);
  b.querySelectorAll('[data-mappe]').forEach(k => k.addEventListener('click', () => {
    const f = mappeFertig;
    if (!f) return;
    if (k.dataset.mappe === 'speichern') { pdfSpeichern(f.fertig); mappeFertig = null; mappeLeiste(); return; }
    navigator.share({ files: [f.fertig], title: f.titel }).then(() => { mappeFertig = null; mappeLeiste(); }).catch(() => {});
  }));
  mappeZaehlen();
  updateBH();
}

function mappeStandSetzen(t) {
  mappeStand = t;
  const el = $('#bottom .mappe-stand');
  if (el && t) el.textContent = t; else mappeLeiste();
}

async function mappePdf() {
  const liste = mappeEintraege();
  if (!liste.length || mappeStand) return;
  const W = mappeBreite(), wahl = mappeUeber(), mitDom = !!prefs.mappeDom, mitGeb = !!prefs.mappeGeb;
  const schnitte = [], fehlt = [];
  mappeFertig = null;
  mappeFehlt = [];
  try {
    // Erst alle Schnitte rechnen, dann zeichnen: Die Seitenzahlen stehen erst fest, wenn klar ist, welche gelingen
    for (let i = 0; i < liste.length; i++) {
      const { ref, km } = liste[i], name = `${ref} km ${fmtKm(km)}`;
      mappeStandSetzen(`Querschnitt ${i + 1} von ${liste.length}: ${name} …`);
      try {
        const q = await gpQuerPunkte(ref, km, W);
        if (!q) { fehlt.push(`${name} (kein Gleisverlauf)`); continue; }
        const dgm = await hoehenProfil(q.punkte, 'dgm1');
        if (!dgm.hoehe.some(Number.isFinite)) { fehlt.push(`${name} (keine Höhen, außerhalb von Bayern und BW?)`); continue; }
        let dom = null, domDgm = null;
        if (mitDom) {
          dom = await hoehenProfil(q.punkte, 'dom20', { maxPunkte: 6000 });
          domDgm = await hoehenWerte('dgm1', dom.ost, dom.nord);
        }
        const geb = mitGeb ? await gebaeudeImSchnitt(q.punkte, dgm) : null;
        schnitte.push({ g: { ref, km, art: 'quer', mitte: q.mitte }, dgm, dom, domDgm, geb,
          linie: q.punkte, versatz: 0, breite: W, laenge: gpLaenge(), wahl });
      } catch (err) {
        fehlt.push(`${name} (${err.message})`);
      }
    }
    if (!schnitte.length) throw new Error('kein Querschnitt kam zustande');
    const titel = `Querprofile · ${schnitte.length} ${schnitte.length === 1 ? 'Schnitt' : 'Schnitte'}`;
    const dok = new PdfDokument({ titel });
    for (let i = 0; i < schnitte.length; i++) {
      mappeStandSetzen(`Seite ${i + 1} von ${schnitte.length} …`);
      await pdfSchnittSeite(dok, schnitte[i], { titel: pdfTitel(schnitte[i]).titel, nr: i + 1, gesamt: schnitte.length });
    }
    mappeStandSetzen('PDF wird geschrieben …');
    const datei = new File([await dok.bytes()], `Querprofile ${new Date().toISOString().slice(0, 10)}.pdf`, { type: 'application/pdf' });
    mappeFehlt = fehlt;
    mappeStand = '';
    mappeFertig = await pdfRaus(datei, titel);
  } catch (err) {
    mappeFehlt = fehlt;
    mappeStand = '';
    toast(`PDF nicht erstellt (${err.message}).`);
  }
  if (mappeOffen) mappeLeiste();
}

/** Abstand Gleis → nächste Gebäudewand links und rechts, als Text; null ohne Gebäude. */
function gebWand(geb, L, breite = gpBreite()) {
  const mitte = L / 2, proM = L / (2 * breite);
  let li = null, re = null, drauf = false;
  for (const b of geb) {
    if (b.s0 <= mitte && b.s1 >= mitte) drauf = true;
    else if (b.s1 < mitte) li = li === null ? (mitte - b.s1) / proM : Math.min(li, (mitte - b.s1) / proM);
    else re = re === null ? (b.s0 - mitte) / proM : Math.min(re, (b.s0 - mitte) / proM);
  }
  if (drauf) return 'über dem Gleis';
  if (li === null && re === null) return null;
  const seite = v => v === null ? 'keins' : `${nfH.format(v)} m`;
  return `links ${seite(li)} · rechts ${seite(re)}`;
}

/** Eine runde Schrittweite für Gitter und Beschriftung: 1, 2 oder 5 mal 10ⁿ. */
function profSchritt(roh) {
  const p = 10 ** Math.floor(Math.log10(roh || 1));
  for (const f of [1, 2, 5]) if (f * p >= roh) return f * p;
  return 10 * p;
}

/** Nächster Stützpunkt zu einer Station (die Stationen steigen an). */
function profIndex(stationen, s) {
  let lo = 0, hi = stationen.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (stationen[m] < s) lo = m; else hi = m;
  }
  return s - stationen[lo] <= stationen[hi] - s ? lo : hi;
}

/* Linienzug fürs Diagramm. Je halbe Bildspalte bleiben erster, kleinster,
 * größter und letzter Wert stehen: Bei langen Profilen fallen Hunderte
 * Stützpunkte auf ein Pixel, und eine schmale Spitze — ein Mast im DOM, ein
 * Graben im DGM — darf dabei nicht verschwinden. Wo Werte fehlen, reißt die
 * Linie ab, statt die Lücke zu überbrücken. */
function profPfad(station, werte, X, Y) {
  const teile = [];
  let teil = null, spalte = null, puffer = null;
  const raus = () => {
    if (!puffer) return;
    const pkt = [puffer.erst, puffer.min, puffer.max, puffer.letzt].sort((a, b) => a.i - b.i);
    let vor = -1;
    for (const p of pkt) {
      if (p.i === vor) continue;
      vor = p.i;
      const y = Y(p.z).toFixed(1);
      // d fürs SVG, punkte für das PDF — dieselbe Ausdünnung für beide
      if (!teil) { teil = { d: `M${spalte} ${y}`, x0: spalte, x1: spalte, punkte: [] }; teile.push(teil); }
      else teil.d += `L${spalte} ${y}`;
      teil.punkte.push([spalte, +y]);
      teil.x1 = spalte;
    }
    puffer = null;
  };
  for (let i = 0; i < werte.length; i++) {
    const z = werte[i];
    if (!Number.isFinite(z)) { raus(); teil = null; spalte = null; continue; }
    const c = Math.round(X(station[i]) * 2) / 2;
    if (c !== spalte) { raus(); spalte = c; }
    const p = { i, z };
    if (!puffer) puffer = { erst: p, min: p, max: p, letzt: p };
    else {
      if (z < puffer.min.z) puffer.min = p;
      if (z > puffer.max.z) puffer.max = p;
      puffer.letzt = p;
    }
  }
  raus();
  return teile;
}

/** Linear zwischen zwei aufsteigenden Reihen umrechnen, an den Enden festgehalten. */
function profUmrechnen(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m; else hi = m;
  }
  return xs[hi] > xs[lo] ? ys[lo] + (x - xs[lo]) / (xs[hi] - xs[lo]) * (ys[hi] - ys[lo]) : ys[lo];
}

/* Was unter und über dem Diagramm steht. Frei: die Station in Metern (ab 2 km
 * in km) und oben die Ecken A, B, … Quer: der Abstand vom Gleis, oben links,
 * Gleis und rechts — links in Richtung steigender Kilometer. Längs: der
 * Kilometer; die Station sind dort Meter Gleis, umgerechnet über die
 * Stützpunkte, und oben steht der Kilometer des Schnitts. */
function profAchse(L, { g = profGleis, dgm = profDgm, breite = gpBreite() } = {}) {
  const a = { gitter: [], unten: [], oben: [], marken: [], zeiger: null, name: 'Geländeprofil' };

  if (g && g.art === 'quer') {
    const W = breite, mitte = L / 2, proM = L / (2 * W);
    const schritt = profSchritt(W / 2);
    for (let v = -Math.floor(W / schritt + 1e-9) * schritt; v <= W + 1e-9; v += schritt) {
      a.gitter.push(mitte + v * proM);
      a.unten.push({ s: mitte + v * proM, text: nfM.format(Math.abs(v)) });
    }
    a.unten[a.unten.length - 1].text += ' m';
    a.oben.push({ s: 0, text: 'links', anker: 'start' }, { s: mitte, text: 'Gleis', anker: 'middle' },
      { s: L, text: 'rechts', anker: 'end' });
    a.marken.push(mitte);
    a.zeiger = s => {
      const v = (s - mitte) / proM;
      return Math.abs(v) < 0.5 ? 'am Gleis' : `${nfM.format(Math.abs(v))} m ${v < 0 ? 'links' : 'rechts'}`;
    };
    a.name = 'Querprofil am Gleis';
    return a;
  }

  if (g) {
    const kms = g.kms, ecken = dgm.ecken;
    const k0 = kms[0], k1 = kms[kms.length - 1];
    const schritt = profSchritt((k1 - k0) / 4);
    for (let k = Math.ceil(k0 / schritt - 1e-9) * schritt; k <= k1 + 1e-9; k += schritt) {
      const kk = Math.round(k * 1e6) / 1e6, s = profUmrechnen(kms, ecken, kk);
      a.gitter.push(s);
      a.unten.push({ s, text: fmtKm(kk) });
    }
    const sm = ecken[g.mitteIndex];
    a.oben.push({ s: sm, text: 'km ' + fmtKm(g.km), anker: 'middle' });
    a.marken.push(sm);
    a.zeiger = s => 'km ' + fmtKm(profUmrechnen(ecken, kms, s));
    a.name = 'Längsprofil am Gleis';
    return a;
  }

  const xStep = profSchritt(L / 4), inKm = L >= 2000;
  for (let s = 0; s <= L + 1e-6; s += xStep) a.gitter.push(s);
  for (let s = 0; s < L - xStep * 0.4; s += xStep) {
    a.unten.push({ s, text: inKm ? fmtKm(s / 1000) : nfM.format(s), anker: s ? 'middle' : 'start' });
  }
  a.unten.push({ s: L, text: messText(L), anker: 'end' });
  const letzte = dgm.ecken.length - 1;
  dgm.ecken.forEach((s, i) => {
    if (i > 0 && i < letzte) a.marken.push(s);
    a.oben.push({ s, text: profName(i), anker: i === 0 ? 'start' : i === letzte ? 'end' : 'middle' });
  });
  a.zeiger = s => `${nfM.format(s)} m`;
  return a;
}

/* Das Längsprofil am Gleis merkt sich seine Überhöhung getrennt, Vorgabe 10×:
 * Unüberhöht sind ein paar Promille Neigung auf 500 m ein flacher Strich, und
 * wer zwischen Quer und Längs wechselt, müsste sonst jedes Mal umschalten. */
const profUeberSchluessel = () => profGleis && profGleis.art === 'laengs' ? 'gpUeberLaengs' : 'profUeber';

/** Die gewählte Überhöhung; was außerhalb 1 … PROF_UEBER_MAX liegt, gilt als Vorgabe. */
function profUeberWahl() {
  const k = profUeberSchluessel(), v = prefs[k];
  return Number.isFinite(v) && v >= 1 && v <= PROF_UEBER_MAX ? v : k === 'gpUeberLaengs' ? 10 : 1;
}

/** Die Überhöhung, die im Bild gilt: die gewählte, höchstens so steil, wie die Leiste es hergibt. */
const profUeberWirksam = () => profAbbild ? Math.min(profUeberWahl(), profAbbild.kMax) : profUeberWahl();

/* Unter 10 mit einer Stelle, darüber ganze Zahlen — so zeigt es der Regler,
 * und so wird es gespeichert. */
const profUeberRunden = v => v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
const profUeberText = v => (v >= 10 ? nfM.format(v) : nfH.format(v).replace(/,0$/, '')) + '×';

/* Der Regler reicht von 1× bis so steil, wie das Bild in die Leiste passt
 * (höchstens PROF_UEBER_MAX). Die Skala ist logarithmisch: Von 1× auf 2× ist
 * derselbe Weg wie von 5× auf 10×. Die Striche stehen auf runden Werten. */
const profUeberOben = kMax => Math.min(PROF_UEBER_MAX, kMax);
// Ganz rechts ungerundet: 5,3 statt 5,33 läge knapp unter dem Ende, und „max" fehlte
const profUeberAusPos = (pos, oben) => pos >= 1000 ? oben : profUeberRunden(Math.exp(pos / 1000 * Math.log(oben)));

function profUeberReglerSetzen(wahl, kMax, ausRegler) {
  const r = $('#profUeber');
  if (!r) return;
  const oben = profUeberOben(kMax), fest = oben < 1.05;
  r.dataset.oben = oben;
  r.disabled = fest;
  // Beim Ziehen nicht zurücksetzen — der Wert kommt gerade vom Finger
  if (!ausRegler) r.value = fest ? 0 : Math.round(Math.log(Math.max(1, wahl)) / Math.log(oben) * 1000);
  const marken = fest ? [0] : [1, 2, 5, 10, PROF_UEBER_MAX].filter(v => v < oben * 0.9).map(v => Math.log(v) / Math.log(oben)).concat(1);
  $('#profUeberStriche').innerHTML = marken.map(p => `<i style="--p:${p.toFixed(4)}"></i>`).join('');
  // „max": steiler geht es in der Leiste nicht
  const amEnde = wahl >= kMax * 0.995 && kMax < PROF_UEBER_MAX;
  $('#profUeberWert').textContent = profUeberText(profUeberRunden(wahl)) + (amEnde ? ' max' : '');
  const titel = fest ? 'Schon unüberhöht füllt das Bild die Leiste — steiler geht es hier nicht'
    : 'Höhen gegenüber der Strecke überhöht, bis so steil, wie das Bild in die Leiste passt';
  r.title = titel;
  r.setAttribute('aria-valuetext', $('#profUeberWert').textContent);
}

/** Tiefster und höchster Wert über Gelände, Oberfläche und Gebäude. */
function profZSpanne(d) {
  let zmin = Infinity, zmax = -Infinity;
  const nimm = z => { if (Number.isFinite(z)) { if (z < zmin) zmin = z; if (z > zmax) zmax = z; } };
  for (const z of d.dgm.hoehe) nimm(z);
  if (d.dom) for (const z of d.dom.hoehe) nimm(z);
  if (d.geb) for (const b of d.geb) for (const p of b.umriss) nimm(p[1]);
  return [zmin, zmax];
}

/* Höhenfenster und Bildhöhe — für die Leiste wie fürs PDF dieselbe Rechnung.
 * 1 m Höhe ist im Bild so lang wie „wahl" Meter Station; wäre das Bild höher
 * als phMax, wird gestaucht, k ist dann der tatsächliche Faktor. */
function profHoehenfenster(zmin, zmax, L, pw, wahl, phMin, phMax) {
  const proMeter = pw / L;
  const spanne = Math.max(zmax - zmin, 0.5) * 1.15;
  const ph = Math.min(phMax, Math.max(phMin, Math.round(spanne * wahl * proMeter)));
  const fenster = Math.max(spanne, ph / (wahl * proMeter));
  const y0 = (zmax + zmin) / 2 - fenster / 2;
  return { ph, y0, y1: y0 + fenster, k: (ph / fenster) / proMeter };
}

/* Das Diagramm, in der tatsächlichen Breite der Leiste gezeichnet: Mit
 * width = viewBox liegen die 1-px-Gitterlinien auf der Pixelmitte und bleiben
 * scharf, statt beim Skalieren über zwei Pixel zu verschwimmen. */
function profBildSetzen(el, ausRegler = false) {
  const w = Math.max(160, Math.round(el.clientWidth));
  const li = 38, re = 4, ob = 14, un = 16;
  const pw = w - li - re;
  const L = profDgm.laenge || 1;

  const [zmin, zmax] = profZSpanne({ dgm: profDgm, dom: profDom, geb: profGeb });
  if (!(zmax >= zmin)) { el.innerHTML = ''; return; }

  // Der steilste Faktor, den die Leiste hergibt; die Wahl wird darauf begrenzt statt gestaucht
  const kMax = profHoehenfenster(zmin, zmax, L, pw, Infinity, PROF_PLOT_MIN, PROF_PLOT_MAX).k;
  const wahl = Math.min(profUeberWahl(), kMax);
  const { ph, y0, y1 } = profHoehenfenster(zmin, zmax, L, pw, wahl, PROF_PLOT_MIN, PROF_PLOT_MAX);
  const h = ob + ph + un;
  const yStep = profSchritt((y1 - y0) / 3);
  const X = s => li + s / L * pw, Y = z => ob + (y1 - z) / (y1 - y0) * ph;
  const halb = v => Math.round(v) + 0.5;
  const stellen = yStep < 1 ? 1 : 0;
  const nfY = new Intl.NumberFormat('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  const achse = profAchse(L);

  let gitter = '', beschr = '', ecken = '';
  for (let z = Math.ceil(y0 / yStep - 1e-9) * yStep; z <= y1 + 1e-9; z += yStep) {
    const y = halb(Y(z));
    gitter += `M${li} ${y}H${li + pw}`;
    beschr += `<text x="${li - 5}" y="${y + 4}" text-anchor="end">${nfY.format(z)}</text>`;
  }
  for (const s of achse.gitter) gitter += `M${halb(X(s))} ${ob}V${ob + ph}`;
  for (const t of achse.unten) {
    // Ohne feste Angabe: am Rand bündig, damit nichts über das Bild hinaussteht
    const x = X(t.s), anker = t.anker || (x - li < 12 ? 'start' : li + pw - x < 12 ? 'end' : 'middle');
    beschr += `<text x="${x}" y="${h - 3}" text-anchor="${anker}">${esc(t.text)}</text>`;
  }
  for (const s of achse.marken) ecken += `M${halb(X(s))} ${ob}V${ob + ph}`;
  for (const t of achse.oben) {
    beschr += `<text class="ecke" x="${X(t.s)}" y="${ob - 4}" text-anchor="${t.anker}">${esc(t.text)}</text>`;
  }

  const dgm = profPfad(profDgm.station, profDgm.hoehe, X, Y);
  const basis = ob + ph;
  const flaeche = dgm.map(t => `${t.d}L${t.x1} ${basis}L${t.x0} ${basis}Z`).join('');
  const dom = profDom ? profPfad(profDom.station, profDom.hoehe, X, Y).map(t => t.d).join('') : '';
  // Gebäude als Blöcke über dem Gelände, unter der Geländelinie
  const geb = profGeb ? profGeb.map(b => 'M' + b.umriss.map(([st, z]) => `${X(st).toFixed(1)} ${Y(z).toFixed(1)}`).join('L') + 'Z').join('') : '';

  el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${achse.name}">` +
    // Verlauf für die Fläche: über deren eigene Höhe, oben kräftig, unten durchsichtig
    '<defs><linearGradient id="profVerlauf" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" class="v-oben"/><stop offset="1" class="v-unten"/></linearGradient></defs>' +
    `<path class="gitter" d="${gitter}"/>` +
    (ecken ? `<path class="ecken" d="${ecken}"/>` : '') +
    `<path class="flaeche" d="${flaeche}"/>` +
    (geb ? `<path class="geb" d="${geb}"/>` : '') +
    `<path class="dgm" d="${dgm.map(t => t.d).join('')}"/>` +
    (dom ? `<path class="dom" d="${dom}"/>` : '') +
    `<g class="beschr">${beschr}</g>` +
    '<g class="zeiger" hidden><path class="senk" d=""/><path class="waag" d=""/><circle r="3.5"/><rect class="schild" rx="6"/><text></text></g></svg>';

  profAbbild = { X, Y, li, pw, ob, ph, L, kMax, zeiger: achse.zeiger };
  profUeberReglerSetzen(wahl, kMax, ausRegler);

  updateBH();            // die Bildhöhe hängt am Maßstab
  const svg = el.querySelector('svg');
  const zeigen = ev => {
    const r = svg.getBoundingClientRect();
    const s = Math.min(L, Math.max(0, (ev.clientX - r.left - li) / pw * L));
    profWahl = profIndex(profDgm.station, s);
    profZeigerSetzen();
  };
  svg.addEventListener('pointerdown', ev => {
    try { svg.setPointerCapture(ev.pointerId); } catch { /* ohne Fang geht es auch */ }
    zeigen(ev);
  });
  svg.addEventListener('pointermove', ev => { if (ev.buttons || ev.pointerType === 'mouse') zeigen(ev); });
  if (profWahl >= 0) profZeigerSetzen();
}

/** Zeiger im Diagramm und Ring auf der Karte an den gewählten Stützpunkt. */
function profZeigerSetzen() {
  const a = profAbbild, g = document.querySelector('#profBild .zeiger');
  if (!a || !g || !profDgm || profWahl < 0) return;
  const i = profWahl, s = profDgm.station[i], z = profDgm.hoehe[i];
  const x = Math.round(a.X(s)) + 0.5;
  // SVG-Elemente kennen die Eigenschaft hidden nicht — nur das Attribut wirkt
  g.removeAttribute('hidden');
  g.querySelector('.senk').setAttribute('d', `M${x} ${a.ob}V${a.ob + a.ph}`);
  // Fadenkreuz: die waagrechte Linie führt die Höhe bis an die Achse
  const y = Number.isFinite(z) ? Math.round(a.Y(z)) + 0.5 : null;
  g.querySelector('.waag').setAttribute('d', y === null ? '' : `M${a.li} ${y}H${a.li + a.pw}`);
  const kreis = g.querySelector('circle');
  kreis.style.display = y === null ? 'none' : '';
  if (y !== null) {
    kreis.setAttribute('cx', x);
    kreis.setAttribute('cy', y);
  }

  let t = `${a.zeiger(s)} · ${Number.isFinite(z) ? nfH.format(z) + ' m' : 'ohne Wert'}`;
  if (profDom) {
    const j = profIndex(profDom.station, s), d = profDom.hoehe[j] - profDomDgm[j];
    if (Number.isFinite(d)) t += ` · Objekt ${nfH.format(Math.max(0, d))} m`;
  }
  const text = g.querySelector('text');
  text.textContent = t;
  const rechts = x < a.li + a.pw / 2;
  text.setAttribute('x', rechts ? x + 10 : x - 10);
  text.setAttribute('y', a.ob + 12);
  text.setAttribute('text-anchor', rechts ? 'start' : 'end');
  // Steht der Finger auf einem Gebäude: was es ist, in einer zweiten Zeile
  const b = profGeb && profGeb.find(x2 => s >= x2.s0 && s <= x2.s1);
  if (b) {
    const zweite = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    zweite.setAttribute('x', rechts ? x + 10 : x - 10);
    zweite.setAttribute('dy', '13');
    zweite.textContent = [b.fn, b.dachform, b.hoehe ? `${nfH.format(b.hoehe)} m hoch` : '', b.adr].filter(Boolean).join(' · ');
    text.appendChild(zweite);
  }
  // Schild hinter der Zahl, 6 px Luft links und rechts
  const k = text.getBBox(), schild = g.querySelector('.schild');
  schild.setAttribute('x', Math.round(k.x - 6));
  schild.setAttribute('y', Math.round(k.y - 2));
  schild.setAttribute('width', Math.round(k.width + 12));
  schild.setAttribute('height', Math.round(k.height + 4));

  const ll = utm32Zurueck(profDgm.ost[i], profDgm.nord[i]);
  /* Der Zeiger auf der Karte: Punkt mit weißem Ring und hellem Hof, wie der
   * Standort — eine dünne Linie in derselben Farbe ging auf der Schnittlinie unter. */
  if (!profRing) {
    profRing = L.marker(ll, {
      icon: L.divIcon({ className: 'prof-ring', html: '<i></i>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      interactive: false, keyboard: false, zIndexOffset: 1000
    }).addTo(profLayer);
  } else {
    profRing.setLatLng(ll);
  }
}

/* ============================ Klick auf die Karte ============================ */

/** Wie viele Meter entsprechen an dieser Stelle einer Strecke von px Bildpunkten? */
function pixelInMeter(latlng, px) {
  const a = map.latLngToContainerPoint(latlng);
  const b = map.containerPointToLatLng(L.point(a.x + px, a.y));
  return map.distance(latlng, b);
}

/** Wie viele Meter sind CLICK_TOL_PX auf der aktuellen Zoomstufe? */
function toleranceMeters(latlng) {
  return Math.max(pixelInMeter(latlng, CLICK_TOL_PX), 25);
}

/* Ein kurzer Tipp liest bewusst nichts mehr ab.
 *
 * Früher las jeder Tipp sofort den Kilometer, und ein Fadenkreuz-Knopf schaltete
 * das ab, weil im Gelände ständig versehentlich getippt wird. Beides ist
 * überflüssig, seit ein langer Druck einen Punkt setzt: Der Griff ist dann
 * bewusst, und die Sprechblase fragt, was damit geschehen soll. Kilometersteine
 * und KML-Objekte bleiben antippbar — die trifft man nicht zufällig. */
async function onMapClick(ev) {
  /* Festpunkte in Bayern sind ein Kartenbild — ob ein Tipp einen trifft, sagt
   * erst der Dienst. Getroffen: Sprechblase bzw. beim Messen der Punkt selbst. */
  const fp = await fpBayernAntippen(ev.latlng);
  if (fp) { fpTipp(ev, fp); return; }
  const ziel = tippZiel();
  if (ziel) ziel(ev.latlng);
}

/** Wohin ein Tipp auf die Karte geht, solange gemessen oder ein Profil gesetzt wird. */
function tippZiel() {
  return messModus ? messTipp : profModus ? profTipp : routeAn ? routeTipp : laserAn ? laserTipp : null;
}

/** Aus einem Sehnentreffer den anzuzeigenden Punkt bauen — nach Möglichkeit auf dem Gleis.
 *
 * Der Kilometer bleibt der aus der Sehne gelesene; verschoben wird nur, wo der
 * Punkt gezeichnet und weitergereicht wird. Angezeigt heißt das: „deine Stelle,
 * auf die Schiene gesetzt" und nicht „der Ort von Kilometer X". */
async function kartePunkt(ref, hit, lat, lon, operator, steine = null) {
  /* Liegt der Verlauf mitgeliefert vor, entscheidet der Umweg, welcher
   * Kilometer gilt. Ein einzelner Bogen schadet der Sehne nicht — entlang
   * eines Kreisbogens hebt sich die Abweichung zur Mitte hin auf. Erst wenn
   * zwischen den Steinen mehrere Bögen und Geraden liegen, trägt dieses
   * Argument nicht mehr, und dann schneidet die Sehne spürbar ab.
   *
   * Gemessen an 553 übersprungenen Zwischensteinen ist der Steinabstand
   * allein der schlechtere Auslöser: unter 1,5 km ist die Sehne besser,
   * gleich ob es dort krümmt (Median 14 m gegen 22 m), über 1,5 km und krumm
   * dreht es sich um (34/115 m gegen 22/72 m). Was zählt, ist also nicht die
   * Länge und nicht die Krümmung, sondern wie viel Weg die Sehne abschneidet.
   * Ab 200 m Umweg zu wechseln räumt die Ausreißer weg: Fälle über 100 m
   * Fehler gehen von 7 auf 1, das 99. Perzentil von 144 auf 106 m, bei
   * unverändertem Median. */
  const weg = await kmEntlangGleis(ref, lat, lon, true, steine);
  if (weg && weg.wegLaenge - weg.chord > UMWEG_GRENZE) {
    const { pfad, ...punkt } = weg;
    punkt.umweg = weg.wegLaenge - weg.chord;
    return punkt;
  }

  const p = {
    km: hit.km,
    lat: hit.lat, lon: hit.lon, quality: 'karte',
    between: hit.between, offset: hit.dist, chord: hit.chord, spanRatio: hit.spanRatio,
    operator, lineRef: ref
  };
  const gleis = await aufGleisSetzen(ref, lat, lon, Math.max(250, hit.dist + 200));
  if (gleis) {
    p.aufGleis = haversine(hit.lat, hit.lon, gleis.lat, gleis.lon);
    p.lat = gleis.lat;
    p.lon = gleis.lon;
    p.offset = gleis.dist;      // echter Abstand quer zum Gleis statt zur Sehne
  }
  return p;
}

/* Welcher Kilometer gilt an dieser Stelle?
 *
 * Zuerst die schon geladene Strecke — das geht ohne Netz und ohne Wartezeit.
 * Erst wenn der Punkt dort nicht hinpasst, muss Overpass sagen, welche Strecke
 * hier überhaupt liegt.
 *
 * tol ist die Toleranz quer zur Strecke: beim Tippen die Fingerbreite auf der
 * aktuellen Zoomstufe, bei einem gesetzten Punkt aus einer KML-Datei ein fester
 * Wert — dessen Koordinate steht ja fest und soll nicht je nach Zoomstufe an
 * eine andere Linie springen. */
async function kmAnStelle(lat, lng, tol) {
  if (view.busy) return;

  /* Zuerst InfraGO. Die oben eingegebene Strecke gewinnt, solange sie
   * höchstens 10 m weiter weg liegt als die nächste — an einem Bahnhof soll ein
   * Tipp nicht auf die Nachbarnummer springen, ein Tipp auf das andere Gleis
   * aber schon. */
  const ifg = await ifgKmAn(lat, lng, tol, [view.ref], 10).catch(() => null);
  if (ifg) {
    applyPoint(ifg.ref, ifg.punkt.km, ifg.punkt);
    return;
  }

  const e = view.ref && lineCache.get(view.ref);

  if (e && e.sorted.length > 1) {
    let hit = projectOnLine(e.sorted, lat, lng);

    // Am Rand der geladenen Daten weiterladen — aber nur, wenn der Klick
    // überhaupt in Reichweite der Strecke liegt. Sonst ist es eine andere Gegend.
    const nearest = e.sorted.reduce((a, b) =>
      haversine(lat, lng, b.lat, b.lon) < haversine(lat, lng, a.lat, a.lon) ? b : a);
    const gap = haversine(lat, lng, nearest.lat, nearest.lon);

    if ((!hit || hit.dist > tol) && gap < 25000) {
      const first = e.sorted[0], last = e.sorted[e.sorted.length - 1];
      const towardsEnd = Math.abs(nearest.km - last.km) < Math.abs(nearest.km - first.km);
      const nextKm = towardsEnd ? last.km + 15 : first.km - 15;
      if (!e.probes.some(p => Math.abs(p - nextKm) < 0.75)) {
        setBusy(true);
        try { await coverage(view.ref, nextKm); } catch { /* dann eben nicht */ }
        setBusy(false);
        hit = projectOnLine(lineCache.get(view.ref).sorted, lat, lng);
        drawMilestones();
      }
    }

    if (hit && hit.dist <= tol) {
      const punkt = await kartePunkt(view.ref, hit, lat, lng, e.sorted[0].operator);
      applyPoint(view.ref, punkt.km, punkt);
      coverage(view.ref, punkt.km).then(drawMilestones).catch(() => { });
      return;
    }
  }

  await lookupByClick(lat, lng);
}

/** Kürzester Abstand eines Punktes zu einem Weg (Meter). */
function distToWay(lat, lon, geometry) {
  if (!geometry || geometry.length === 0) return Infinity;
  if (geometry.length === 1) return haversine(lat, lon, geometry[0].lat, geometry[0].lon);

  const ky = 110540, kx = Math.cos(lat * Math.PI / 180) * 111320;
  const px = lon * kx, py = lat * ky;
  let best = Infinity;

  for (let i = 1; i < geometry.length; i++) {
    const ax = geometry[i - 1].lon * kx, ay = geometry[i - 1].lat * ky;
    const dx = geometry[i].lon * kx - ax, dy = geometry[i].lat * ky - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

/** Welche Strecke liegt an dieser Stelle? Das kann nur Overpass beantworten.
 *  Die Kandidaten werden nach echtem Abstand zum Klick sortiert — an einem
 *  Bahnhof liegen sonst ein halbes Dutzend gleichrangiger Nummern nebeneinander. */
/** Wie steht es an dieser Stelle um das mitgelieferte Netz?
 *  'aus' kein Index · 'draussen' außerhalb des erzeugten Gebiets ·
 *  'fehlt' erzeugt, aber nicht auf dem Gerät · 'da' vorhanden. */
async function netzLage(lat, lon) {
  const ix = await netzBereit();
  if (!ix) return 'aus';
  const name = Math.floor(lat / ix.raster) + '_' + Math.floor(lon / ix.raster);
  if (!ix.da.has(name)) return 'draussen';
  if (!ix.mitInhalt.has(name)) return 'da';        // erzeugt und nachweislich leer
  return (await netzKachel(name)) ? 'da' : 'fehlt';
}

/** Dieselbe Auskunft wie linesNear, nur aus den mitgelieferten Kacheln. */
async function netzLinesNear(lat, lon) {
  const dLat = SEED_RADIUS / 110540;
  const dLon = SEED_RADIUS / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const bereich = await netzBereich(lat - dLat, lon - dLon, lat + dLat, lon + dLon);
  if (!bereich) return null;

  const gehoertZu = (w, ref) => w.ref && String(w.ref).split(';').some(t => t.trim() === ref);

  const byRef = new Map();
  for (const w of bereich.wege) {
    if (!w.ref) continue;
    const d = distToWay(lat, lon, w.geometry);
    if (d > 80) continue;                       // derselbe Umkreis wie in der Overpass-Abfrage
    for (const part of String(w.ref).split(';')) {
      const r = part.trim();
      if (!r) continue;
      if (!byRef.has(r) || byRef.get(r) > d) byRef.set(r, d);
    }
  }

  return {
    refs: [...byRef.entries()].sort((a, b) => a[1] - b[1]).slice(0, 4).map(([ref, dist]) => {
      /* Kilometerpunkte tragen in der Kachel keine Streckennummer. Zugeordnet
       * werden sie über die Lage: Was auf dem Gleis dieser Strecke steht,
       * gehört zu ihr. Ohne diese Prüfung würde ein weiter Suchradius die
       * Punkte der Nachbarstrecke einsammeln. */
      const gleise = bereich.wege.filter(w => gehoertZu(w, ref));
      const eigene = bereich.punkte.filter(p => gleise.some(w => distToWay(p.lat, p.lon, w.geometry) < 25));
      return { ref, dist, seeds: startwerte(eigene.map(p => ({ km: p.km, dist: haversine(lat, lon, p.lat, p.lon) }))) };
    })
  };
}

/* Mehrere Startwerte statt nur des nächsten.
 *
 * Die ORM-Abfrage liefert die Steine im Umkreis der angefragten Position. Liegt
 * der nächste Kilometerpunkt weit weg, deckt eine einzige Abfrage womöglich nur
 * eine Seite ab. Gemeldet an Strecke 5321 bei 49,520913 / 10,274394: Der nächste
 * Punkt war km 96,2 in 4038 m, der übernächste km 87,2 in 4268 m — auf der
 * anderen Seite. Mit dem Startwert 96,2 fehlte der Stein bei 87,2, und damit gab
 * es kein Paar, das den Punkt einschließt.
 *
 * Deshalb nach Abstand sortiert bis zu vier deutlich verschiedene Kilometerwerte
 * anbieten; useLineAt probiert sie der Reihe nach. */
function startwerte(kandidaten) {
  const raus = [];
  for (const k of kandidaten.filter(k => k.dist <= SEED_RADIUS).sort((a, b) => a.dist - b.dist)) {
    if (raus.some(v => Math.abs(v.km - k.km) < 5)) continue;   // dieselbe Gegend, bringt nichts
    raus.push(k);
    if (raus.length >= 4) break;
  }
  return raus;
}

async function linesNear(lat, lon) {
  /* Erst das Mitgelieferte — das ist sofort da und hängt an keinem fremden Dienst.
   *
   * Auch ein leeres Ergebnis zählt: Die Kacheln führen jede nummerierte Strecke,
   * die Overpass hier fände. Der erste Durchgang holt alle Gleise ohne
   * service-Tag, der zweite alles, was trotz service-Tag eine Nummer trägt —
   * zusammen also jeden Weg mit ref. Sagt die Kachel „hier liegt keine
   * nummerierte Strecke", dann stimmt das, und danach noch Overpass zu fragen
   * kostet nur die Wartezeit. Gemeldet als „wenn man zu weit vom Gleis weg
   * drückt, braucht die Meldung ewig". */
  const lokal = await netzLinesNear(lat, lon);
  if (lokal) return lokal;

  /* Kilometerangaben hängen nicht nur an Steinen: Bahnübergänge, Signale und
   * Weichen tragen sie genauso, und zwar mal als railway:position, mal als
   * railway:position:exact. Am Meldepunkt bei Bischofswiesen stand der nächste
   * Stein 1138 m entfernt, ein Bahnübergang mit railway:position:exact aber
   * 596 m — mit der alten Abfrage (nur railway=milestone, nur 900 m) fiel genau
   * dieser weg und die Kilometersuche brach ab. Beides mitnehmen und weiter
   * hinausschauen; als Startwert für die ORM-Abfrage reicht ein grober Wert. */
  const q = `[out:json][timeout:25];` +
    `way(around:80,${lat},${lon})[railway~"^(rail|light_rail|narrow_gauge)$"][ref]->.w;` +
    `node(around:${SEED_RADIUS},${lat},${lon})[railway]["railway:position"]->.n1;` +
    `node(around:${SEED_RADIUS},${lat},${lon})[railway]["railway:position:exact"]->.n2;` +
    `.w out tags geom 40;` +
    `(.n1;.n2;)->.n;` +
    `.n out body 120;`;     // body, nicht tags — sonst fehlen die Koordinaten der Knoten

  let data = null, lastErr = null;
  for (const ep of OVERPASS) {
    try { data = await tryFetch(ep + '?data=' + encodeURIComponent(q), 25000); break; }
    catch (err) { lastErr = err; }
  }
  if (!data) {
    throw new Error('kein Overpass-Server hat geantwortet (' + (lastErr && lastErr.message || 'unbekannt') + ')');
  }

  const els = data.elements || [];

  // je Streckennummer den geringsten Abstand behalten
  const byRef = new Map();
  for (const w of els) {
    if (w.type !== 'way' || !w.tags || !w.tags.ref) continue;
    const d = distToWay(lat, lon, w.geometry);
    for (const part of String(w.tags.ref).split(';')) {
      const r = part.trim();
      if (!r) continue;
      if (!byRef.has(r) || byRef.get(r) > d) byRef.set(r, d);
    }
  }
  const refs = [...byRef.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([ref, dist]) => ({ ref, dist }));

  // Kilometerangaben als Startwerte — die ORM-API braucht eine Position,
  // um überhaupt etwas ausliefern zu können.
  const stones = els
    .filter(n => n.type === 'node' && n.tags)
    .map(n => {
      const roh = n.tags['railway:position'] != null ? n.tags['railway:position'] : n.tags['railway:position:exact'];
      return { km: parseFloat(String(roh).replace(',', '.')), dist: haversine(lat, lon, n.lat, n.lon) };
    })
    .filter(s => isFinite(s.km));

  return { refs, seeds: startwerte(stones) };
}

async function lookupByClick(lat, lon) {
  setBusy(true);
  showStatus('Suche, welche Strecke hier liegt …');
  try {
    const { refs, seeds } = await linesNear(lat, lon);
    if (!refs.length) {
      showError('Hier ist keine nummerierte Strecke erfasst. Näher an ein Gleis tippen.');
      return;
    }
    /* Ohne Kilometerangabe in der Nähe geht es trotzdem weiter: den Startwert
     * holt sich useLineAt dann bei der Strecke selbst. */
    if (refs.length === 1) {
      await useLineAt(refs[0].ref, refs[0].seeds || seeds, lat, lon);
    } else {
      showPicker(refs, seeds, lat, lon);
    }
  } catch (err) {
    /* Die Meldung soll den wahren Grund nennen. Overpass ist nur noch der
     * Rückfall; wer im Gelände ohne Netz auf eine Stelle tippt, deren Kachel
     * noch nie geladen wurde, scheitert nicht an Overpass, sondern daran, dass
     * die Kachel fehlt — und genau das gehört dort hin. */
    const lage = await netzLage(lat, lon);
    showError(lage === 'fehlt'
      ? `Für diese Gegend ist das Gleisnetz noch nicht auf dem Gerät, und ohne Netz lässt es ` +
        `sich nicht holen (${err.message}). Kacheln kommen beim ersten Hinschauen mit Empfang ` +
        `aufs Gerät und bleiben dann da. Mit Streckennummer und Kilometer oben geht es auch so, ` +
        `sofern die Strecke schon einmal geladen war.`
      : lage === 'draussen'
      ? `Diese Stelle liegt außerhalb des mitgelieferten Gleisnetzes, und der Rückfall auf den ` +
        `fremden Dienst Overpass hat nicht geantwortet (${err.message}). Mit Streckennummer und ` +
        `Kilometer oben geht es ohne ihn.`
      : `Hier ließ sich nicht ermitteln, welche Strecke liegt: ${err.message}. Näher an ein Gleis ` +
        `tippen — oder mit Streckennummer und Kilometer oben suchen.`);
  } finally {
    setBusy(false);
  }
}

/* Kein Stein in Reichweite? Dann die Strecke selbst befragen.
 *
 * Die ORM-API braucht zwar eine Position, liefert dafür aber gleich alles, was
 * im Umkreis dieser Position erfasst ist — auf dünn belegten Strecken ist das
 * mit einer Abfrage der halbe Streckenverlauf. Ein paar Startwerte abklappern
 * genügt also, um überhaupt einen Anhaltspunkt zu bekommen. */
async function seedAusApi(ref, lat, lon) {
  const e = storeFor(ref);
  const naechster = () => e.sorted.length
    ? e.sorted.reduce((a, b) => haversine(lat, lon, b.lat, b.lon) < haversine(lat, lon, a.lat, a.lon) ? b : a)
    : null;

  for (const km of [0, 50, 100, 150]) {
    const nah = naechster();
    if (nah && haversine(lat, lon, nah.lat, nah.lon) < 6000) return nah.km;
    if (e.probes.some(p => Math.abs(p - km) < 0.75)) continue;
    try { await probe(ref, e, km); } catch { break; }
  }
  const nah = naechster();
  return nah ? nah.km : null;
}

/** Strecke laden und den Klickpunkt darauf projizieren. */
async function useLineAt(ref, seeds, lat, lon) {
  setBusy(true);
  showStatus(`Lade Strecke ${ref} …`);
  try {
    view.ref = ref;
    $('#ref').value = ref;
    felderAufQ();

    const liste = Array.isArray(seeds) ? seeds.slice() : (seeds == null ? [] : [{ km: seeds }]);
    if (!liste.length) {
      showStatus(`Strecke ${ref}: keine Kilometerangabe in der Nähe — frage die Strecke ab …`);
      const km = await seedAusApi(ref, lat, lon);
      if (km == null) {
        showError(`Für Strecke ${ref} ist in OpenStreetMap kein einziger Kilometerpunkt erfasst — der Kilometer lässt sich nicht bestimmen.`);
        return;
      }
      liste.push({ km });
    }

    /* Der Reihe nach laden, bis der Punkt zwischen zwei Steinen liegt. Ein
     * einzelner Startwert deckt womöglich nur eine Seite ab — siehe startwerte(). */
    let e = null;
    for (const s of liste) {
      await coverage(ref, s.km);
      e = lineCache.get(ref);
      const p = projectOnLine(e.sorted, lat, lon, MAX_GLEIS_GAP_KM);
      if (p && p.dist <= 400) break;
    }
    drawMilestones();

    const hit = projectOnLine(e.sorted, lat, lon);
    if (hit && hit.dist <= 400) {
      const punkt = await kartePunkt(ref, hit, lat, lon, e.sorted[0].operator);
      applyPoint(ref, punkt.km, punkt);
      return;
    }

    /* Jenseits des äußersten Steins gibt es kein Paar, das den Punkt einschließt.
     * Dann am Gleis hinauslaufen statt den Punkt auf das letzte Steinpaar zu
     * loten und ihn als „zu weit weg" abzulehnen. */
    const raus = await kmExtrapoliert(ref, lat, lon, e.sorted);
    if (raus) {
      applyPoint(ref, raus.km, raus);
      return;
    }

    /* Sehne unbrauchbar — entweder stehen die nächsten Steine weiter als
     * MAX_DRAW_GAP_KM auseinander und werden gar nicht erst verbunden, oder die
     * Sehne schneidet einen Bogen so weit ab, dass der Punkt scheinbar
     * hunderte Meter danebenliegt. Beides löst der echte Verlauf. */
    const weit = projectOnLine(e.sorted, lat, lon, MAX_GLEIS_GAP_KM);
    if (weit) {
      /* Nur von Overpass reden, wenn es auch Overpass wird. Aus der Kachel ist
       * der Verlauf in rund einer Zehntelsekunde da; die Warnung vor
       * Wartezeiten stand hier noch aus der Zeit davor. */
      const daheim = await netzHatVerlauf(weit.a, weit.b);
      showStatus(`Die nächsten Kilometerangaben stehen bei km ${fmtKm(weit.between[0])} und ` +
        `${fmtKm(weit.between[1])} — ` + (daheim
          ? `rechne am mitgelieferten Gleisverlauf entlang …`
          : `hole den Gleisverlauf von Overpass. Das dauert einige Sekunden, ` +
            `bei überlastetem Overpass auch länger …`));
      try {
        const genau = await kmEntlangGleis(ref, lat, lon);
        if (genau && genau.offset <= 400) {
          const { pfad, ...punkt } = genau;      // der Verlauf gehört auf die Karte, nicht in den Zustand
          applyPoint(ref, punkt.km, punkt);
          zeichneGleisweg(pfad);
          return;
        }
        if (genau) {
          showError(`Der Punkt liegt ${nfM.format(genau.offset)} m vom Gleis der Strecke ${ref} entfernt — das wäre zu ungenau.`);
          return;
        }
      } catch (err) {
        /* Der Grund gehört dazu, sonst steht da nur „geht nicht": ohne Steinpaar
         * ist der Verlauf der einzige Weg, mit Steinpaar nur der genauere. */
        showError(hit
          ? `Der Punkt liegt ${nfM.format(hit.dist)} m von der Verbindungslinie der Steine bei km ` +
            `${fmtKm(hit.between[0])} und ${fmtKm(hit.between[1])} entfernt, und der Gleisverlauf ließ sich ` +
            `nicht holen: ${err.message}.`
          : `Zwischen km ${fmtKm(weit.between[0])} und ${fmtKm(weit.between[1])} ist kein Kilometerpunkt ` +
            `erfasst, und der Gleisverlauf ließ sich nicht holen: ${err.message}. Ohne ihn lässt sich der ` +
            `Kilometer hier nicht bestimmen.`);
        return;
      }
    }

    if (!hit) {
      showError(`Für Strecke ${ref} sind hier zu wenige Kilometerangaben erfasst.`);
      return;
    }
    showError(`Der Punkt liegt ${nfM.format(hit.dist)} m von den erfassten Steinen der Strecke ${ref} entfernt — das wäre zu ungenau.`);
  } catch (err) {
    showError('Konnte Strecke ' + ref + ' nicht laden: ' + err.message);
  } finally {
    setBusy(false);
  }
}

function showPicker(refs, seeds, lat, lon) {
  const b = $('#bottom');
  delete b.dataset.art;
  leisteZu(false);
  b.hidden = false;
  b.innerHTML = `<p class="bb-title">Mehrere Strecken an dieser Stelle</p>
    <p class="bb-sub">Sortiert nach Abstand zum Tippen — die erste liegt am nächsten.</p>
    <div class="pick">${refs.map(r =>
      `<button type="button" data-pick="${esc(r.ref)}">${esc(r.ref)}<small>${nfM.format(r.dist)} m</small></button>`).join('')}</div>`;
  b.querySelectorAll('[data-pick]').forEach(btn =>
    btn.addEventListener('click', () => {
      const r = refs.find(x => x.ref === btn.dataset.pick);
      useLineAt(btn.dataset.pick, (r && r.seeds) || seeds, lat, lon);
    }));
  updateBH();
}

/* ============================ Punkt setzen & anzeigen ============================ */

function applyPoint(ref, km, result) {
  view.hervor = false;   // ab jetzt trägt der Pin die Farbe, auch nach dem Schließen
  reihe = [];          // ein einzelner Punkt löst die Reihe ab
  reiheAktiv = 0;
  reiheFehler = [];
  neuerPunktInfoZu();
  view.ref = ref;
  view.km = km;
  view.point = result;
  gleiswegZuletzt = null;                    // Gleis-Overlay gehört zum alten Punkt
  if (trackLayer) trackLayer.clearLayers();

  $('#ref').value = ref;
  $('#km').value = fmtKm(km);
  felderAufQ();

  drawPoint();
  drawMilestones();
  renderBottom();
  pushRecent(ref, km);
  updateHash();
}

/* Aus dem Standort festgehalten kommt die Ortungsungenauigkeit dazu. Sie
 * verschiebt den Punkt auch längs der Strecke, wirkt also unmittelbar auf den
 * Kilometer; beide Anteile addiert ist die obere Schranke — ohne die Richtung
 * des Fehlers zu kennen, geht es nicht enger. Galt bisher nur beim Lesen von
 * der Sehne ('karte'), nicht bei der Rechnung am Gleis entlang. */
const ortAnteil = p => (p.standort ? Math.round(p.standort.genau) : 0);

/* Das Schild trägt nur die Zahl. Wie gerechnet wurde, steht hinter
 * dem i-Knopf der unteren Leiste — vorn gelesen wird nur, wie weit der Punkt
 * danebenliegen kann. Die Wörter davor („entlang des Gleises", „interpoliert")
 * waren für die Anzeige Ballast. */
const plusMinus = m => `±${nfM.format(m)} m`;

function qualityTag(p) {
  if (p.quality === 'infrago') return { cls: 'ok', text: plusMinus(Math.round(IFG_ERR.worst) + ortAnteil(p)) };
  if (p.quality === 'exakt') return { cls: 'ok', text: 'Kilometerstein' };
  if (p.quality === 'gleis') return { cls: 'ok', text: 'auf dem Gleis' };
  /* Orange trotz der besseren Rechnung: Über so weite Steinabstände bleiben
   * gemessen bis zu 88 bzw. 52 m Unsicherheit, und die kommt aus den Steinen selbst. */
  if (p.quality === 'karte-gleis') return { cls: 'warn', text: plusMinus(gleisErr(p).worst + ortAnteil(p)) };
  if (p.quality === 'gleis-weit') return { cls: 'warn', text: plusMinus(WEIT_ERR.worst) };
  if (p.quality === 'extrapoliert') return { cls: 'warn', text: plusMinus(EXTRA_ERR.worst) };
  if (p.quality === 'interpoliert') {
    // Schwelle bei 50 m: die beiden dichten Steinabstände bleiben grün,
    // orange wird es erst, wenn die Steine wirklich weit auseinanderstehen.
    return { cls: p.err.worst > 50 ? 'warn' : 'ok', text: plusMinus(p.err.worst) };
  }
  // Beim Tippen kommt die Unsicherheit des eigenen Fingers hinzu — bleibt orange
  if (p.quality === 'karte') {
    return { cls: 'warn', text: plusMinus(tapError(p.chord || 0).worst + ortAnteil(p)) };
  }
  if (p.quality === 'betriebsstelle') return { cls: 'ok', text: 'Betriebsstelle' };
  if (p.quality === 'ort') return { cls: 'ok', text: 'Ort' };
  const d = Math.abs(p.delta || 0);
  return { cls: d > 1 ? 'bad' : 'warn', text: `${fmtKm(d)} km daneben` };
}

function renderBottom() {
  /* Ein neues Ergebnis löst ein offenes Profil ab — sonst stünde der Schnitt
   * weiter auf der Karte, während die Leiste von etwas anderem redet. */
  if (profModus) profEnde(false);
  if (routeAn) routeEnde(false);
  if (mappeOffen) { mappeOffen = false; mappeStand = ''; mappeFertig = null; syncButtons(); }
  const b = $('#bottom');
  delete b.dataset.art;            // Ergebnis: steht ab 1010 px in der Leiste links
  const p = view.point;
  if (!p) { b.hidden = true; updateBH(); return; }
  leisteZu(false);                 // das Ergebnis steht in der Leiste

  const tag = qualityTag(p);
  let title, sub;

  /* Feinrechnung nur anbieten, wo sie etwas bringt: in der Richtung km → Position.
   * Beim Kartentipp bringt sie nichts — siehe TAP_ERR. */
  const refine = (p.quality === 'interpoliert' && p.chord > REFINE_MIN_CHORD)
    ? `<button type="button" id="refineBtn" class="refine">Punkt auf das Gleis rechnen` +
      `<small>folgt dem echten Verlauf statt der Luftlinie · braucht Netz, dauert einige Sekunden</small></button>`
    : '';

  if (p.quality === 'betriebsstelle') {
    // InfraGO bringt die Art schon ausgeschrieben mit („Bahnhof", „Abzweigstelle" …)
    const kindDe = STELLE_ART[p.kind] || p.kind || 'Betriebsstelle';
    title = p.name;
    sub = [kindDe, p.ds100 && 'DS100 ' + p.ds100, p.uic && 'UIC ' + p.uic, p.operator,
      p.zustand && p.zustand !== 'in Betrieb' && p.zustand].filter(Boolean).join(' · ');
  } else if (p.quality === 'ort') {
    title = p.name;
    sub = p.sub || 'Ort aus OpenStreetMap';
  } else {
    title = `Strecke ${p.lineRef || view.ref} · km ${fmtKm(view.km)}`;
    sub = p.operator || 'Kilometrierung nach OpenStreetMap';
  }

  // Kritisches steht sichtbar, Erklärendes klappt auf — sonst frisst die
  // Leiste den halben Bildschirm
  let warn = '', detail = '';

  if (p.quality === 'betriebsstelle' && p.strecken && p.strecken.length) {
    detail = 'Liegt an ' + p.strecken.map(s =>
      `Strecke ${s.nr}${s.km != null ? ' km ' + fmtKm(s.km) : ''}`).join(', ') +
      ` — nach den Infrastrukturdaten der DB InfraGO, Stand ${IFG_STAND}.`;
  } else if (p.quality === 'infrago') {
    const [a, b] = p.abschnitt;
    detail = (p.tipp
        ? (p.standort
          ? `Aus dem verfolgten Standort abgeleitet, gemeldet auf ±${nfM.format(p.standort.genau)} m genau — ` +
            `das ist in der Zahl oben dazugerechnet. `
          : `Aus der angetippten Stelle abgeleitet. `) +
          `Gelesen wird der Kilometer an der Stelle, an der das Lot auf das Gleis trifft` +
          (p.offset > 1 ? `, ${nfM.format(p.offset)} m querab` : '') + `. `
        : '') +
      `In den Infrastrukturdaten ist die Strecke in Abschnitte mit Kilometer von/bis geteilt, hier ` +
      `km ${fmtKm(Math.min(a, b))} bis ${fmtKm(Math.max(a, b))} ` +
      ({ Streckenachse: 'an der Streckenachse', Richtungsgleis: 'am Richtungsgleis',
        Gegenrichtungsgleis: 'am Gegenrichtungsgleis' }[p.gleis] || 'am Gleis') +
      `. Die Linie ist auf die Kilometrierung abgestimmt, der Kilometer wird ` +
      `anteilig darauf abgetragen. An ${nfM.format(IFG_ERR.faelle)} Bahnübergängen nachgemessen, deren Lage ` +
      `in OpenStreetMap unabhängig von jeder Kilometrierung ist, lag das typisch ` +
      `${String(IFG_ERR.typical).replace('.', ',')} m neben dem wahren Ort, im ungünstigen Zehntel ` +
      `${String(IFG_ERR.worst).replace('.', ',')} m — zwischen zwei OSM-Kilometersteinen waren es an ` +
      `denselben Stellen ${String(IFG_ERR.osmTypical).replace('.', ',')} m und ${nfM.format(IFG_ERR.osmWorst)} m.`;
    if (p.weitere && p.weitere.length) {
      warn = `<p class="bb-note">km ${fmtKm(view.km)} kommt auf Strecke ${esc(p.lineRef)} ` +
        `${p.weitere.length === 1 ? 'zweimal' : p.weitere.length + 1 + '-mal'} vor (Kilometersprung). ` +
        `Angezeigt ist die erste Stelle; die ${p.weitere.length === 1 ? 'zweite liegt' : 'nächste liegt'} ` +
        `${fmtKm(p.weitere[0].abstand / 1000)} km entfernt.</p>`;
    }
    if (p.anlage) {
      const a = p.anlage;
      /* „Länge" ist die des Bauwerks, nicht die Spanne entlang des Gleises — ein
       * Überwerfungsbauwerk an 5100 kreuzt auf 104 m Gleis und ist 430 m lang.
       * Ohne das Wort davor läse sich das als Widerspruch. */
      const bereich = a.von != null
        ? `km ${fmtKm(Math.min(a.von, a.bis))}–${fmtKm(Math.max(a.von, a.bis))}` +
          (a.laenge ? ` · Bauwerk ${nfM.format(a.laenge)} m lang` : '')
        : '';
      // Manche Bahnübergänge heißen nur nach ihrem Kilometer („42.184", „km 173,113") — der steht schon im Titel
      const bez = /^(km\s*)?[\d.,+\s]+$/i.test(a.bez || '') ? '' : a.bez;
      warn = `<p class="bb-note"><strong>${esc(a.art)}</strong>` +
        [bez, bereich, a.kreuzung, ...(a.details || [])].filter(Boolean).map(t => ' · ' + esc(t)).join('') +
        `</p>` + warn;
    }
    if (p.tipp && p.daneben && p.daneben.length && p.daneben[0].dist - p.offset < 15) {
      warn += `<p class="bb-note">Gleich daneben liegt Strecke ${esc(p.daneben[0].ref)} ` +
        `(${nfM.format(p.daneben[0].dist)} m). Ist die gemeint, oben deren Nummer eingeben und noch einmal tippen.</p>`;
    }
  } else if (p.quality === 'exakt') {
    detail = `Direkt die Lage des erfassten Steins. Wie genau der in OpenStreetMap sitzt, ` +
      `lässt sich nicht nachprüfen — aus dem Vergleich benachbarter Steine auf geraden Abschnitten ` +
      `ergibt sich eine Streuung in der Größenordnung von 10 m.`;
  } else if (p.quality === 'gleis') {
    detail = `Entlang des tatsächlichen Gleisverlaufs gerechnet statt geradlinig: ` +
      `${nfM.format(p.wegLaenge)} m Gleisweg zwischen den Steinen bei km ${fmtKm(p.between[0])} und ` +
      `${fmtKm(p.between[1])}, laut Kilometrierung ${nfM.format(p.nominal)} m. Der Punkt liegt damit ` +
      `${nfM.format(p.korrektur)} m von der geradlinigen Schätzung entfernt. Bleibt als Unsicherheit die ` +
      `Erfassungsgenauigkeit der Steine, Größenordnung 10 m.`;
  } else if (p.quality === 'karte-gleis') {
    detail = `Zwischen den Kilometerangaben bei km ${fmtKm(p.between[0])} und ${fmtKm(p.between[1])} ist ` +
      `nichts weiter erfasst — ${nfM.format(p.chord)} m Luftlinie. Über so weite Lücken taugt die gerade ` +
      `Verbindung nicht mehr, deshalb wurde der tatsächliche Gleisverlauf geholt und daran entlang gemessen: ` +
      `${nfM.format(p.wegLaenge)} m Gleisweg, laut Kilometrierung ${nfM.format(p.nominal)} m. ` +
      `Geradlinig käme km ${fmtKm(p.sehneKm)} heraus, ${nfM.format(Math.abs(view.km - p.sehneKm) * 1000)} m ` +
      `daneben. ` +
      (gleisErr(p) === WEIT_ERR
        ? `An ${WEIT_ERR.faelle} übersprungenen Zwischensteinen bei 8 bis 25 km Steinabstand nachgemessen lag ` +
          `dieser Weg typisch ${nfM.format(WEIT_ERR.typical)} m neben dem wahren Kilometer, im ungünstigen ` +
          `Zehntel ${nfM.format(WEIT_ERR.worst)} m. `
        : `An ${GLEIS_ERR.faelle} übersprungenen Zwischensteinen mit ähnlichem Abstand nachgemessen lag ` +
          `dieser Weg typisch ${nfM.format(GLEIS_ERR.typical)} m neben dem wahren Kilometer und höchstens ` +
          `${nfM.format(GLEIS_ERR.worst)} m; die geradlinige Ablesung traf im Mittel ebenso gut, lag aber in ` +
          `${GLEIS_ERR.ueber100} der ${GLEIS_ERR.faelle} Fälle über 100 m daneben, bis zu ${nfM.format(GLEIS_ERR.sehne)} m. `) +
      `Übrig bleibt die Erfassungsgenauigkeit der Steine, gegen die kein Gleisverlauf hilft.` +
      (p.standort
        ? ` Aus dem verfolgten Standort festgehalten, den das Gerät auf ±${nfM.format(p.standort.genau)} m genau ` +
          `meldete — das ist in der Zahl oben dazugerechnet.`
        : '');
    if (p.offset > 150) {
      warn = `<p class="bb-note">Der Punkt liegt ${nfM.format(p.offset)} m querab des Gleises. ` +
        `Abgelesen wird die Stelle, an der das Lot auf das Gleis trifft.</p>`;
    }
  } else if (p.quality === 'gleis-weit') {
    detail = `Zwischen den Steinen bei km ${fmtKm(p.between[0])} und ${fmtKm(p.between[1])} ist nichts weiter ` +
      `erfasst — ${fmtKm(p.between[1] - p.between[0])} km Lücke. Geradlinig lässt sich darüber nicht mehr ` +
      `sinnvoll interpolieren, deshalb wurde der Kilometer am tatsächlichen Gleisverlauf abgetragen: ` +
      `${nfM.format(p.wegLaenge)} m Gleisweg, laut Kilometrierung ${nfM.format(p.nominal)} m. An ` +
      `${WEIT_ERR.faelle} übersprungenen Zwischensteinen bei 8 bis 25 km Steinabstand nachgemessen lag diese ` +
      `Rechnung typisch ${nfM.format(WEIT_ERR.typical)} m neben dem wahren Ort, im ungünstigen Zehntel ` +
      `${nfM.format(WEIT_ERR.worst)} m.`;
  } else if (p.quality === 'extrapoliert') {
    detail = `Bei km ${fmtKm(view.km)} ist kein Stein erfasst, und es gibt auch keinen davor — ` +
      `die Kilometrierung fängt hier erst an oder hört auf. Statt den nächstgelegenen Stein zu ` +
      `zeigen, wurde vom Stein bei km ${fmtKm(p.abStein)} aus ${nfM.format(p.hinaus)} m am Gleis ` +
      `entlang hinausgelaufen, an jeder Weiche geradeaus. Dass die Trasse dabei über den Nullpunkt ` +
      `hinausgeht, ist normal — die Kilometrierungslinie beginnt oft später als die Achse. ` +
      `Zur Probe wurde mit demselben Verfahren die bekannte Strecke zum Nachbarstein gelaufen und ` +
      `dieser auf ${nfM.format(p.probe)} m getroffen. An ${EXTRA_ERR.faelle} übersprungenen ` +
      `Außensteinen nachgemessen — beantwortet wurden davon ${EXTRA_ERR.beantwortet} — lag das ` +
      `Ergebnis typisch ${nfM.format(EXTRA_ERR.typical)} m neben dem wahren Ort, im ungünstigen ` +
      `Zehntel ${nfM.format(EXTRA_ERR.worst)} m, im schlechtesten Fall 2008 m. Der nächstgelegene ` +
      `Stein lag dagegen im Median ${nfM.format(EXTRA_ERR.stein)} m daneben.`;
    if (p.hinaus > 1500) {
      warn = `<p class="bb-note">${nfM.format(p.hinaus)} m über den letzten Stein hinausgerechnet. ` +
        `Je weiter hinaus, desto unsicherer.</p>`;
    }
  } else if (p.quality === 'naechster') {
    warn = `<p class="bb-note">Bei km ${fmtKm(view.km)} ist kein Stein erfasst. Angezeigt wird der nächstgelegene bei km ${fmtKm(p.nearKm)} — ${fmtKm(Math.abs(p.delta))} km Unterschied.</p>`;
    if (p.verworfen && p.verworfen.grund === 'luecke') {
      /* Hierher kommt es nur noch, wenn auch der Gleisweg nicht geholfen hat —
       * der Grund soll dastehen, nicht ein allgemeines „unbekannt". */
      const v = p.verworfen;
      const warum = v.zuWeit
        ? `Über mehr als ${MAX_GLEIS_GAP_KM} km wird auch am Gleis entlang nicht mehr gerechnet.`
        : 'Der Gleisverlauf dazwischen war nicht zu bekommen oder passt nicht zur Kilometrierung.';
      warn += `<p class="bb-note">Die nächsten Steine stehen bei km ${fmtKm(v.von)} und ${fmtKm(v.bis)} — ` +
        `${fmtKm(v.entlang / 1000)} km Lücke. ${warum}</p>`;
    } else if (p.verworfen && p.verworfen.grund === 'geometrie') {
      const v = p.verworfen;
      warn += `<p class="bb-note">Die Steine bei km ${fmtKm(v.von)} und ${fmtKm(v.bis)} wären Nachbarn, liegen aber ` +
        `${nfM.format(v.luftlinie)} m Luftlinie auseinander — bei nur ${nfM.format(v.entlang)} m entlang der Strecke ` +
        `ist das geometrisch unmöglich. Die beiden gehören nicht zusammen.</p>`;
      detail = `Solche Widersprüche entstehen, wenn dieselbe Streckennummer in OpenStreetMap an mehreren Stellen vergeben ist oder Steine falsch erfasst wurden.`;
    }
  } else if (p.quality === 'karte') {
    const err = tapError(p.chord || 0);
    detail = (p.standort
        ? `Aus dem verfolgten Standort abgeleitet, gemeldet auf ±${nfM.format(p.standort.genau)} m genau`
        : `Aus dem Kartentipp abgeleitet`) +
      `, zwischen den Steinen bei km ${fmtKm(p.between[0])} und ` +
      `${fmtKm(p.between[1])}, ${nfM.format(p.chord || 0)} m auseinander` +
      (p.offset > 15 ? `, ${nfM.format(p.offset)} m querab des Gleises` : '') + `. ` +
      (p.aufGleis > 5
        ? `Angezeigt wird die Stelle auf dem tatsächlich erfassten Gleis — die gerade Verbindung ` +
          `zwischen den beiden Steinen läuft hier ${nfM.format(p.aufGleis)} m daneben. Der Kilometer ` +
          `stammt weiter von dieser Verbindung: an 234 übersprungenen Zwischensteinen nachgemessen ` +
          `liest sie sich genauer als eine Rechnung entlang des Gleises (15 gegenüber 25 m im Median), ` +
          `weil beim Tippen die Position ja feststeht. `
        : '') +
      `An echten Zwischensteinen nachgemessen lag der so gelesene Kilometer typisch ` +
      `${nfM.format(err.typical)} m neben dem wahren, im ungünstigen Zehntel ${nfM.format(err.worst)} m. ` +
      `Das steckt fast ganz in der Erfassung der Steine, nicht in der Sehnennäherung.`;
    /* Die Ausnahme, in der die Spanne oben nicht mehr gilt: Passen Luftlinie und
     * Kilometerdifferenz der beiden Steine nicht zusammen, steckt dahinter ein
     * Kilometersprung oder ein falsch erfasster Stein. Über dieselben 2050
     * Testfälle lag das ungünstige Zehntel solcher Paare bei 183 m statt 49 m —
     * und diese Fälle liegen auf gerader Strecke, ein Gleisverlauf hilft nicht. */
    if (p.spanRatio != null && p.spanRatio < 0.75) {
      warn = `<p class="bb-note">Luftlinie und Kilometerdifferenz der beiden Steine passen nicht zusammen ` +
        `(${Math.round(p.spanRatio * 100)} %) — starker Bogen oder Kilometersprung. Im zweiten Fall liegt der ` +
        `Kilometer weit außerhalb der oben genannten Spanne; nachgemessen lag das ungünstige Zehntel solcher ` +
        `Stellen bei 183 m statt 49 m.</p>`;
    }
  } else if (p.quality === 'interpoliert') {
    // Der Steinabstand ist der eigentliche Genauigkeitsfaktor, nicht die Rechnung selbst
    detail = `Geradlinig gerechnet zwischen den Steinen bei km ${fmtKm(p.between[0])} und ${fmtKm(p.between[1])}, ` +
      `${nfM.format(p.chord)} m auseinander. Im Vergleich mit tatsächlich erfassten Zwischensteinen lag das ` +
      `typisch ${nfM.format(p.err.typical)} m daneben, im ungünstigen Zehntel ${nfM.format(p.err.worst)} m — ` +
      `darin steckt auch die Streuung der Steinerfassung selbst.`;
    if (p.err.worst > 60) {
      warn = `<p class="bb-note">Die Steine stehen ${nfM.format(p.chord)} m auseinander. In dieser Größenordnung schlägt die Streckenkrümmung durch — bis zu ${nfM.format(p.err.worst)} m Abweichung.</p>`;
    }
    if (p.spanRatio < 0.75) {
      warn += `<p class="bb-note">Luftlinie und Kilometerdifferenz passen nicht zusammen (${Math.round(p.spanRatio * 100)} %) — starker Bogen oder Kilometersprung.</p>`;
    }
  }

  /* Bei mehreren Achspunkten steht oben eine Zeile mit allen Kilometern. Sie
   * schaltet die Beschreibung darunter um — gerechnet ist längst alles. */
  const umschalt = reihe.length > 1
    ? `<div class="bb-reihe">` + reihe.map((r, i) =>
        `<button type="button" class="bb-chip${i === reiheAktiv ? ' is-on' : ''}" data-reihe="${i}">` +
        `km ${esc(fmtKm(r.km))}</button>`).join('') + `</div>`
    : '';
  const reiheAus = reiheFehler.length
    ? `<p class="bb-note">Nicht bestimmbar: ${esc(reiheFehler.join(' · '))}</p>`
    : '';

  /* Profil am Gleis nur, wo ein Kilometer auf dem Gleis gemeint ist — nicht bei
   * Ort und Betriebsstelle, und nicht, wenn statt des Kilometers nur der
   * nächste Stein dasteht. Orange wie Messen und Profil auf der Karte. */
  const mitProfil = view.ref && view.km != null && !['betriebsstelle', 'ort', 'naechster'].includes(p.quality);
  const profilKnopf = mitProfil
    ? `<button type="button" id="gpBtn" class="bb-ikon gp" aria-label="Querprofil am Gleis" title="Querprofil am Gleis">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 20h19"/><path d="M2.5 16.5 7 10l3.5 3.8 3.6-6.3 3.9 5.4 3.5-3.2"/></svg>
      </button>`
    : '';

  /* Route mit dem Auto: ein Symbol wie Profil, der Hauptknopf bleibt Google Maps.
   * Die Route selbst steht in der App (routeOeffnen), von dort geht es weiter
   * in die Navigation. */
  const routeKnopfBB = `<button type="button" id="routeBtn" class="bb-ikon" aria-label="Route mit dem Auto" title="Route mit dem Auto">
        <!-- Weg vom Start zum Ziel statt Auto von vorn: das Auto las sich altbacken -->
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.6" cy="18" r="2.2"/><path d="M7.8 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h9.2"/><path d="M15.6 3.4 18.2 6l-2.6 2.6"/></svg>
      </button>`;

  /* Laserpunkte am Ergebnis (nur Bayern): öffnet den Viewer gleich dort,
   * die Stelle darin hervorgehoben (laserAufErgebnis). */
  const laserKnopfBB = inLandRahmen('by', p.lat, p.lon)
    ? `<button type="button" id="laser3dBtn" class="bb-ikon lz-3d" aria-label="Laserpunkte in 3D" title="Laserpunkte in 3D">3D</button>`
    : '';

  b.hidden = false;
  b.innerHTML = `
    ${umschalt}
    ${reiheAus}
    <div class="bb-head">
      <p class="bb-title">${esc(title)}</p>
      <span class="tag ${tag.cls}">${esc(tag.text)}</span>
    </div>
    ${hoeheZeile(p.lat, p.lon)}
    ${warn}
    ${refine}
    <!-- Koordinaten und Herkunft klappt der i-Knopf oben auf. Das Feld steht
         unter dem Kopf; die Knöpfe unten rutschen beim Aufklappen nach unten,
         das i oben bleibt stehen. Gebraucht wird es selten; Google Maps und Teilen tragen
         die Koordinaten ohnehin mit. -->
    <div id="bbInfo" class="bb-info"${infoOffen ? '' : ' hidden'}>
      <p class="bb-coord">${fmtCoord(p.lat, p.lon)}</p>
      <p class="bb-note plain">${esc(sub)}${detail ? ' · ' + esc(detail) : ''}</p>
    </div>
    <!-- Info und Teilen klein oben neben dem × — unten bleibt Platz für Google Maps -->
    <button type="button" id="infoBtn" class="bb-eck info${infoOffen ? ' is-on' : ''}" aria-label="Koordinaten und Herkunft"
              title="Koordinaten und Herkunft" aria-controls="bbInfo" aria-expanded="${infoOffen}">
        <!-- Dieselbe Zeichnung wie vor „Hinweise" im Menü -->
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 10.8v5.7"/><circle class="voll" cx="12" cy="7.7" r="1.1"/></svg>
      </button>
      <button type="button" id="shareBtn" class="bb-eck teilen" aria-label="Teilen" title="Teilen">
        <!-- Drei Punkte, verbunden — das Teilen-Zeichen von Android. Der Pfeil aus
             der Kiste davor las sich wie Hochladen. Die Striche enden rechnerisch
             am Kreisrand (r 2,6), statt in die Kreise hineinzulaufen. -->
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="17.5" cy="5.5" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18.5" r="2.6"/><path d="M8.74 10.68 15.26 6.82M8.74 13.32l6.52 3.86"/></svg>
      </button>
    <button type="button" id="bbClose" class="bb-close" aria-label="Anzeige schließen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <!-- Navigation läuft über Google Maps; Route und Profil als Symbole daneben. -->
    <div class="bb-actions">
      <a id="mapsBtn" class="maps" href="${gmapsUrl(p.lat, p.lon)}"${svAttr(p.lat, p.lon)} target="_blank" rel="noopener">Google Maps</a>
      ${routeKnopfBB}
      ${profilKnopf}
      ${laserKnopfBB}
    </div>`;

  bindBottom();
  hoeheFuellen(b);
  updateBH();
  if (mitProfil) svBlickSetzen(view.ref, view.km);
}

/* Street View am Gleis längs schauen lassen. Im Hintergrund nachgetragen: Die
 * Richtung braucht zwei weitere Lagen, das Ergebnis soll darauf nicht warten. */
async function svBlickSetzen(ref, km) {
  let r = null;
  try { r = await gleisRichtung(ref, km); } catch { r = null; }
  const a = $('#mapsBtn');
  if (!r || !a || view.ref !== ref || view.km !== km) return;
  a.dataset.blick = String(Math.atan2(r[0], r[1]) * 180 / Math.PI);
}

/* Steht das Info-Feld offen? Gemerkt über das Neuzeichnen hinweg — beim
 * Durchschalten einer Reihe oder nach „auf das Gleis rechnen" bleibt es
 * offen. Ein neuer Punkt fängt wieder zu an (neuerPunktInfoZu). */
let infoOffen = false;
const neuerPunktInfoZu = () => { infoOffen = false; };

/** Ereignisse der unteren Leiste — separat, weil die Leiste neu gezeichnet wird. */
/* ---- Route mit dem Auto (November 2026) ----
 * Vom Standort (oder einem getippten Start) zum Punkt an der Strecke. Gerechnet
 * wird bei Valhalla des FOSSGIS e.V. — ohne Schlüssel und ohne Kosten, CORS ist
 * offen (gemessen 01.11.2026: 0,17–0,26 s, rund 20 kB). Dessen
 * Nutzungsbedingungen: höchstens eine Anfrage je Sekunde, OSM-Quellenangabe mit
 * „Fehler melden", keine stark besuchte Seite. Gerechnet wird deshalb nur auf
 * einen Griff hin (Öffnen, Tipp, Loslassen nach dem Ziehen), nie beim Ziehen
 * selbst und nicht mit dem laufenden Standort.
 *
 * Valhalla rastet das Ziel auf die nächste befahrbare Straße — die liegt auch
 * mal jenseits der Gleise. Das Stück von dort zum Punkt steht gestrichelt da, und
 * der Endpunkt lässt sich auf eine andere Zufahrt ziehen. Navigiert wird in
 * Google Maps, und zwar bis zu diesem Endpunkt: Mit dem Gleispunkt als Ziel
 * suchte sich Google selbst eine Straße. Im Service Worker bleibt der Dienst
 * draußen (sw.js), eine Route gehört nicht in den Vorrat. */
const ROUTE_DIENST = 'https://valhalla1.openstreetmap.de/route';
const ROUTE_ABSTAND_MS = 1100;       // eine Anfrage je Sekunde, mit etwas Luft
const ROUTE_GEDULD_MS = 15000;
const ROUTE_QUELLE = 'Route: <a href="https://www.fossgis.de/">FOSSGIS</a> (Valhalla), Daten © ' +
  '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende (ODbL), ' +
  '<a href="https://openstreetmap.org/fixthemap">Fehler melden</a>';

let routeAn = false;
let routeZiel = null;          // [lat, lon] — der Punkt an der Strecke
let routeZielName = '';
let routeStart = null;         // [lat, lon], null solange keiner steht
let routeVomOrt = false;       // Start = Standort: Google Maps nimmt dann den eigenen
let routeStartName = '';       // aus der Adresssuche; leer bei Tipp, Ziehen, Standort
let routeSuchText = '';        // was im Startfeld steht, über das Neuzeichnen hinweg
let routeTreffer = [];
let routeSuchLauf = 0;
let routeSuchTimer = 0;
const ROUTE_MEIN_ORT = 'Mein Standort';
let routeWartetAufOrt = false;
let routeZufahrt = null;       // [lat, lon] gezogen; null = Valhalla nimmt die nächste Straße
let routeErg = null;           // { linie, dauer, laenge, autobahn, maut, faehre, anfang, ende }
let routeFehler = '';
let routeLaedt = false;
let routeLauf = 0;
let routeLetzte = 0;           // Zeit der letzten Anfrage
let routeLetzterTipp = 0;
let routeLayer = null;

/* Ein Knopf in den Sprechblasen — gebunden einmal am Dokument (routeBinden) */
const routeKnopf = (lat, lon, name = '') =>
  `<button type="button" class="kml-km" data-route="${lat.toFixed(6)},${lon.toFixed(6)}" data-route-name="${esc(name)}">` +
  `Route mit dem Auto<small>vom Standort hierher, Dauer und Länge — braucht Netz</small></button>`;

function routeBinden() {
  document.addEventListener('click', ev => {
    const k = ev.target.closest('[data-route]');
    if (!k) return;
    const [lat, lon] = k.dataset.route.split(',').map(Number);
    routeOeffnen(lat, lon, k.dataset.routeName || '');
  });
}

function routeOeffnen(lat, lon, name = '') {
  if (laserAn) laserEnde(false);
  if (profModus) profEnde(false);
  if (messModus) messEnde();
  if (mappeOffen) { mappeOffen = false; mappeStand = ''; mappeFertig = null; }
  map.closePopup();
  routeAn = true;
  routeZiel = [lat, lon];
  routeZielName = name;
  routeZufahrt = null;
  routeErg = null;
  routeFehler = '';
  routeLaedt = false;
  routeStartName = '';
  routeSuchText = '';
  routeTreffer = [];
  routeLauf++;
  if (!routeLayer) routeLayer = L.layerGroup([], { attribution: ROUTE_QUELLE });
  routeLayer.addTo(map);
  // Wie beim Messen: zwei schnelle Tipps wären sonst ein Doppeltipp-Zoom
  if (map.doubleClickZoom) map.doubleClickZoom.disable();
  if (ortLetzt) {
    routeStart = [ortLetzt.lat, ortLetzt.lon];
    routeVomOrt = true;
    routeWartetAufOrt = false;
    routeSuchText = ROUTE_MEIN_ORT;
  } else {
    routeStart = null;
    routeVomOrt = false;
    routeWartetAufOrt = ortAn();     // läuft die Verfolgung schon, kommt der Standort gleich
  }
  closeSheet();
  leisteZu(false);
  routeZeichnen();
  routeLeiste();
  syncButtons();
  if (routeStart) routeRechnen(true);
}

/** zeigen: danach wieder das Ergebnis in die Leiste (wie profEnde). */
function routeEnde(zeigen = true) {
  routeAn = false;
  routeLauf++;
  routeErg = null;
  routeWartetAufOrt = false;
  if (routeLayer) { routeLayer.clearLayers(); map.removeLayer(routeLayer); }
  const k = $('#routeKopf');
  k.hidden = true;
  k.innerHTML = '';
  if (map.doubleClickZoom) map.doubleClickZoom.enable();
  syncButtons();
  if (zeigen) renderBottom();
}

/** Ein Tipp auf die Karte setzt den Start neu — wie bei Live. */
function routeTipp(latlng) {
  latlng = L.latLng(latlng);
  const jetzt = Date.now();
  if (jetzt - routeLetzterTipp < 350) return;      // doppelt gemeldeter Tipp (siehe messTipp)
  routeLetzterTipp = jetzt;
  routeStart = [latlng.lat, latlng.lng];
  routeVomOrt = false;
  routeWartetAufOrt = false;
  routeStartLeeren();
  routeZeichnen();
  routeRechnen(!routeErg);
}

/** Aus ortNeu: Die Route wartete auf den ersten Standort. */
function routeOrtDa() {
  routeWartetAufOrt = false;
  routeStart = [ortLetzt.lat, ortLetzt.lon];
  routeVomOrt = true;
  routeStartLeeren();
  routeSuchText = ROUTE_MEIN_ORT;
  routeZeichnen();
  routeLeiste();
  routeRechnen(!routeErg);
}

function routeVomStandort() {
  if (ortLetzt) { routeOrtDa(); return; }
  routeStartLeeren();
  routeWartetAufOrt = true;
  if (!ortAn()) locate();
  routeLeiste();
}

/* Start als Adresse: dieselbe Ortssuche wie die Suchzeile (Photon, sonst
 * Nominatim), die Treffer klappen im Startfeld der Leiste auf. */
function routeStartLeeren() {
  routeStartName = '';
  routeSuchText = '';
  routeTreffer = [];
  routeSuchLauf++;
  clearTimeout(routeSuchTimer);
}

function routeSuchen(text) {
  routeSuchText = text;
  clearTimeout(routeSuchTimer);
  const lauf = ++routeSuchLauf;
  routeVomOrt = routeVomOrt && text === ROUTE_MEIN_ORT;
  if (text.trim().length < 3) { routeTreffer = []; routeTrefferZeigen(); return; }
  routeSuchTimer = setTimeout(async () => {
    let liste = [];
    try { liste = await searchOrt(text.trim()); } catch { liste = null; }
    if (lauf !== routeSuchLauf || !routeAn) return;
    routeTreffer = liste || [];
    routeTrefferZeigen(!liste ? 'Ortssuche nicht erreichbar.' : liste.length ? '' : 'Nichts gefunden.');
  }, 300);
}

/* Mein Standort steht oben in der Liste, solange nichts getippt ist —
 * wie in Google Maps; dazu das Fadenkreuz rechts im Feld. */
const routeMitOrt = () => !routeVomOrt && !routeSuchText.trim();

function routeTrefferZeigen(meldung = '') {
  const box = $('#routeVorschlag');
  if (!box) return;
  const feld = $('#routeStartFeld');
  if (routeMitOrt() && feld && document.activeElement === feld) {
    box.innerHTML = suggestZeile('ort', IKON_STANDORT, ROUTE_MEIN_ORT,
      routeWartetAufOrt ? 'wird bestimmt …' : 'Start am eigenen Standort');
    box.hidden = false;
    box.querySelector('[data-i]').addEventListener('mousedown', ev => {
      ev.preventDefault();
      feld.blur();
      routeVomStandort();
    });
  } else if (!routeTreffer.length) {
    box.innerHTML = meldung ? `<p class="suggest-info">${esc(meldung)}</p>` : '';
    box.hidden = !meldung;
  } else {
    box.innerHTML = routeTreffer.map((t, i) => suggestZeile(i, IKON_ORT, t.name, t.sub)).join('');
    box.hidden = false;
    box.querySelectorAll('[data-i]').forEach(btn => btn.addEventListener('mousedown', ev => {
      ev.preventDefault();   // Fokus im Feld lassen, sonst schließt die Liste zuerst
      routeTrefferNehmen(routeTreffer[Number(btn.dataset.i)]);
    }));
  }
  updateBH();
}

function routeTrefferNehmen(t) {
  if (!t) return;
  routeSuchLauf++;
  clearTimeout(routeSuchTimer);
  routeStart = [t.lat, t.lon];
  routeVomOrt = false;
  routeWartetAufOrt = false;
  // Name und Ort reichen ins Feld: „Luitpoldstraße 19, Bamberg" — der Ort steht hinter der PLZ
  const teile = t.sub.split(' · ');
  const plz = teile.findIndex(x => /^\d{5}$/.test(x));
  const ort = plz >= 0 ? teile[plz + 1] : '';
  routeStartName = ort && !t.name.includes(ort) ? `${t.name}, ${ort}` : t.name;
  routeSuchText = routeStartName;
  routeTreffer = [];
  const feld = $('#routeStartFeld');
  if (feld) feld.blur();
  routeZeichnen();
  routeRechnen(true);
}

/** Polyline-Kodierung mit 6 Nachkommastellen (Valhalla), nicht 5 wie bei Google. */
function polylineLesen(text, stellen = 6) {
  const f = 10 ** stellen, punkte = [];
  let i = 0, lat = 0, lon = 0;
  const zahl = () => {
    let wert = 0, schub = 0, b;
    do { b = text.charCodeAt(i++) - 63; wert |= (b & 0x1f) << schub; schub += 5; } while (b >= 0x20);
    return wert & 1 ? ~(wert >> 1) : wert >> 1;
  };
  while (i < text.length) {
    lat += zahl();
    lon += zahl();
    punkte.push([lat / f, lon / f]);
  }
  return punkte;
}

function routeFehlerText(d, status) {
  const code = d && d.error_code;
  if (code === 171 || code === 170) return 'Keine befahrbare Straße in der Nähe von Start oder Endpunkt.';
  if (code === 442) return 'Zwischen Start und Ziel gibt es keinen Weg mit dem Auto.';
  if (code === 154 || code === 150) return 'Start und Ziel liegen zu weit auseinander.';
  if (status === 429) return 'Zu viele Anfragen beim Routendienst — gleich noch einmal versuchen.';
  return `Der Routendienst meldet einen Fehler (${status}${d && d.error ? ': ' + d.error : ''}).`;
}

async function routeRechnen(passen = false) {
  if (!routeAn || !routeStart) return;
  const lauf = ++routeLauf;
  routeLaedt = true;
  routeFehler = '';
  routeLeiste();
  const warten = routeLetzte + ROUTE_ABSTAND_MS - Date.now();
  if (warten > 0) await new Promise(r => setTimeout(r, warten));
  if (lauf !== routeLauf) return;               // inzwischen neu gezogen oder geschlossen
  routeLetzte = Date.now();

  const ziel = routeZufahrt || routeZiel;
  const anfrage = {
    locations: [{ lat: routeStart[0], lon: routeStart[1] }, { lat: ziel[0], lon: ziel[1] }],
    costing: 'auto', directions_type: 'none', units: 'kilometers'
  };
  try {
    const res = await fetch(ROUTE_DIENST + '?json=' + encodeURIComponent(JSON.stringify(anfrage)),
      { signal: AbortSignal.timeout(ROUTE_GEDULD_MS) });
    const d = await res.json().catch(() => null);
    if (lauf !== routeLauf) return;
    if (!res.ok || !d || !d.trip) throw new Error(routeFehlerText(d, res.status));
    const s = d.trip.summary;
    const linie = d.trip.legs.flatMap(l => polylineLesen(l.shape, 6));
    if (linie.length < 2) throw new Error('Der Routendienst lieferte keine Linie.');
    routeErg = {
      linie, dauer: s.time, laenge: s.length,
      autobahn: s.has_highway, maut: s.has_toll, faehre: s.has_ferry,
      anfang: linie[0], ende: linie[linie.length - 1]
    };
  } catch (e) {
    if (lauf !== routeLauf) return;
    routeErg = null;
    routeFehler = e.name === 'TimeoutError' ? 'Der Routendienst antwortet nicht.'
      : navigator.onLine === false || e instanceof TypeError ? 'Keine Verbindung — die Route braucht Netz.'
      : e.message || 'Route nicht bestimmbar.';
  }
  routeLaedt = false;
  routeZeichnen();
  routeLeiste();
  if (passen && routeErg) {
    kartePassen(L.latLngBounds([...routeErg.linie, routeZiel, routeStart]), { padding: [40, 40] });
  }
}

/** „38 min", „1 h 06 min" */
function routeDauer(s) {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** „4,3 km" unter 100 km, darüber ganze Kilometer */
const routeKm = km => km.toLocaleString('de-DE', { maximumFractionDigits: km < 100 ? 1 : 0 }) + ' km';

function routeZeichnen() {
  if (!routeLayer) return;
  routeLayer.clearLayers();
  if (!routeAn) return;
  const farbe = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1761A3';
  const e = routeErg;
  let fussZiel = null;
  if (e) {
    // Dunkle Kontur darunter, damit die Linie auch auf dem Luftbild trägt
    L.polyline(e.linie, { color: '#0b1220', weight: 9, opacity: 0.4, interactive: false }).addTo(routeLayer);
    L.polyline(e.linie, { color: farbe, weight: 5, opacity: 1, interactive: false }).addTo(routeLayer);
    // Was nicht mit dem Auto geht, gepunktet: Straße → Punkt an der Strecke, Start → Straße
    const fuss = (a, b) => L.polyline([a, b], {
      color: farbe, weight: 3, opacity: 1, dashArray: '1 7', lineCap: 'round', interactive: false
    }).addTo(routeLayer);
    fussZiel = fuss(e.ende, routeZiel);
    if (routeStart) fuss(routeStart, e.anfang);
  }
  L.circleMarker(routeZiel, {
    radius: 5, color: '#fff', weight: 2, fillColor: farbe, fillOpacity: 1, interactive: false
  }).addTo(routeLayer);

  /* Start und Zufahrt zum Ziehen, wie A und B im Profil: 26 px Griff, ohne
   * autoPan, gerechnet wird beim Loslassen. */
  const griff = (wo, art, text, fertig, ziehen) => {
    const m = L.marker(wo, {
      draggable: true, keyboard: false, autoPan: false, zIndexOffset: 500,
      icon: L.divIcon({ className: `prof-griff route-griff ${art}`, iconSize: [26, 26], iconAnchor: [13, 13],
        html: `<i></i>${text ? `<span class="route-lbl">${esc(text)}</span>` : ''}` })
    }).addTo(routeLayer);
    if (ziehen) m.on('drag', () => ziehen(m.getLatLng()));
    m.on('dragend', () => { const ll = m.getLatLng(); fertig([ll.lat, ll.lng]); });
  };
  if (e) {
    griff(e.ende, 'zufahrt', '', wo => { routeZufahrt = wo; routeRechnen(); },
      ll => fussZiel && fussZiel.setLatLngs([ll, routeZiel]));
  }
  if (routeStart) {
    griff(routeStart, 'start', 'Start', wo => {
      routeStart = wo; routeVomOrt = false; routeStartLeeren(); routeRechnen();
    });
  }
}

/* Aufgebaut wie die Route in Google Maps: oben Start und Ziel (#routeKopf,
 * am Handy statt der Suchzeile), unten „Mit dem Auto" mit Dauer und Länge. */
function routeLeiste() {
  if (!routeAn) return;
  routeKopfZeichnen();
  const b = $('#bottom');
  // Ab 1010 px in der Leiste links unter der Suche wie das Ergebnis, nicht unten mittig
  b.dataset.art = 'route';
  b.hidden = false;
  const e = routeErg;
  const notizen = [];
  let zahl = '';
  if (e) {
    zahl = `${esc(routeDauer(e.dauer))} <small>(${esc(routeKm(e.laenge))})</small>`;
    const rest = ellipsoidAbstand(e.ende, routeZiel);
    notizen.push([routeLaedt && 'wird neu gerechnet …',
      e.autobahn && 'Autobahn', e.maut && 'Maut', e.faehre && 'Fähre',
      rest >= 10 && `zu Fuß noch ${messText(rest)}`].filter(Boolean).join(' · '));
  }
  if (routeFehler) notizen.push({ warn: routeFehler });
  else if (!routeStart) notizen.push(routeWartetAufOrt ? 'Standort wird bestimmt …' : 'Start oben eingeben oder auf die Karte tippen.');
  else if (!e) notizen.push('Route wird gerechnet …');

  b.innerHTML = `
    <button type="button" id="bbClose" class="bb-close" aria-label="Route schließen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    ${hilfeKnopf('route', 'Route')}
    <div class="bb-head">
      <p class="bb-title">Mit dem Auto</p>
    </div>
    ${zahl ? `<p class="route-zeit mess-zahl">${zahl}</p>` : ''}
    ${notizen.map(t => typeof t === 'string'
      ? `<p class="bb-note plain">${esc(t)}</p>` : `<p class="bb-note">${esc(t.warn)}</p>`).join('')}
    <p class="prof-quelle">${ROUTE_QUELLE}</p>`;
  b.querySelector('#bbClose').addEventListener('click', () => routeEnde());
  updateBH();
}

/* Start und Ziel. Während im Startfeld getippt wird, nicht neu aufbauen —
 * sonst springt die Tastatur weg —, nur das Fadenkreuz nachführen. */
function routeKopfZeichnen() {
  const k = $('#routeKopf');
  k.hidden = false;
  const altFeld = $('#routeStartFeld');
  const ortKnopf = $('#routeOrt');
  const platzhalter = routeWartetAufOrt ? 'Standort wird bestimmt …' : 'Start: Adresse oder Ort';
  if (altFeld && document.activeElement === altFeld) {
    ortKnopf.classList.toggle('is-on', routeVomOrt);
    ortKnopf.classList.toggle('wartet', routeWartetAufOrt);
    altFeld.placeholder = platzhalter;
    return;
  }
  k.innerHTML = `
    <div class="rk-zeile">
      <span class="rk-start" aria-hidden="true"></span>
      <div class="route-feld">
        <input id="routeStartFeld" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false"
               aria-label="Start als Adresse oder Ort" value="${esc(routeSuchText)}" placeholder="${platzhalter}">
        <button type="button" id="routeOrt" class="route-ort${routeVomOrt ? ' is-on' : ''}${routeWartetAufOrt ? ' wartet' : ''}"
                aria-label="Start am eigenen Standort" title="Start am eigenen Standort">${IKON_STANDORT}</button>
      </div>
    </div>
    <span class="rk-weg" aria-hidden="true"></span>
    <div class="rk-zeile">
      <svg class="rk-ziel" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5C7.8 16.6 5.5 13.3 5.5 10a6.5 6.5 0 1 1 13 0c0 3.3-2.3 6.6-6.5 11.5z"/><circle cx="12" cy="10" r="2.3"/></svg>
      <p class="rk-text">${esc(routeZielName || 'Punkt an der Strecke')}</p>
    </div>
    <div id="routeVorschlag" class="suggest route-vorschlag" role="listbox" hidden></div>`;

  k.querySelector('#routeOrt').addEventListener('click', routeVomStandort);
  const feld = k.querySelector('#routeStartFeld');
  feld.addEventListener('input', () => routeSuchen(feld.value));
  // Steht schon ein Start drin, ersetzt das Tippen ihn ganz
  feld.addEventListener('focus', () => { if (feld.value) feld.select(); routeTrefferZeigen(); });
  feld.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); routeTrefferNehmen(routeTreffer[0]); }
    else if (ev.key === 'Escape') { routeTreffer = []; routeTrefferZeigen(); feld.blur(); }
  });
  feld.addEventListener('blur', () => {
    if (!routeAn) return;
    routeTreffer = [];
    routeTrefferZeigen();
    routeKopfZeichnen();     // was beim Tippen liegen blieb (Wert, Platzhalter)
  });
}

function bindBottom() {
  const zu = $('#bbClose');
  if (zu) zu.addEventListener('click', closeBottom);

  document.querySelectorAll('#bottom [data-reihe]').forEach(btn =>
    btn.addEventListener('click', () => reiheWaehlen(Number(btn.dataset.reihe))));

  const teilen = $('#shareBtn');
  if (teilen) teilen.addEventListener('click', share);

  const gp = $('#gpBtn');
  if (gp) gp.addEventListener('click', () => gpStart());

  const laser3d = $('#laser3dBtn');
  if (laser3d) laser3d.addEventListener('click', laserAufErgebnis);

  const route = $('#routeBtn');
  if (route && view.point) route.addEventListener('click', () =>
    routeOeffnen(view.point.lat, view.point.lon, $('#bottom .bb-title').textContent));

  const refine = $('#refineBtn');
  if (refine) refine.addEventListener('click', refineOnTrack);

  const info = $('#infoBtn');
  if (info) info.addEventListener('click', () => {
    infoOffen = !infoOffen;
    $('#bbInfo').hidden = !infoOffen;
    info.classList.toggle('is-on', infoOffen);
    info.setAttribute('aria-expanded', String(infoOffen));
    updateBH();
  });
}

function showStatus(msg) {
  const b = $('#bottom');
  delete b.dataset.art;
  leisteZu(false);
  b.hidden = false;
  b.innerHTML = `<p class="bb-sub">${esc(msg)}</p>`;
  updateBH();
}

function showError(msg) {
  const b = $('#bottom');
  delete b.dataset.art;
  leisteZu(false);
  b.hidden = false;
  b.innerHTML = `<button type="button" id="bbClose" class="bb-close" aria-label="Anzeige schließen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <p class="bb-err">${esc(msg)}</p>`;
  bindBottom();
  updateBH();
}

/** Anzeige wegdrücken — vor allem für den versehentlichen Tipp auf die Karte. */
function closeBottom() {
  view.point = null;
  view.hervor = false;
  pointMarker = null;
  reihe = [];
  reiheAktiv = 0;
  reiheFehler = [];
  if (pointLayer) pointLayer.clearLayers();
  gleiswegZuletzt = null;
  if (trackLayer) trackLayer.clearLayers();
  $('#bottom').hidden = true;
  $('#bottom').innerHTML = '';
  updateBH();
  drawMilestones();        // die Strecke wieder blass, nicht mehr als Ergebnis hervorgehoben
}

/** Leaflet-Bedienelemente über der unteren Leiste halten */
/* Wo die Kartenknöpfe über dem unteren Rand stehen.
 *
 * Die Grundlinie ist die Unterkante des Kastens mit © und Maßstab: ohne
 * Leiste 6 px über dem Rand, mit Leiste 8 px über ihr (die Leiste selbst
 * 6 px über dem Rand). Die Knopfsäule rechts — Standort, Messen, Nord —
 * steht auf dieser Grundlinie (--bh). Die Zeile wächst beim Aufklappen der
 * Quellen nicht, die Zahl bleibt dabei stehen. Steht die Absteckleiste über
 * der unteren, kommt sie samt ihren 8 px Luft dazu. Gerundet wird erst die
 * Summe: Die Leisten sind krumm hoch (gemessen 108,72 und 160,53 px), einzeln
 * gerundet lag der Standortknopf einen Pixel unter dem ©-Kasten. */
const UNTEN_RAND = 6;
/* ---- Seitenleiste (Desktop, Tablet quer) ----
 * Ab 1010 px steht die Bedienung links in einer Spalte über der Karte
 * (style.css, „Desktop und Tablet quer“). Was die Karte zeigen soll, gehört dann
 * rechts daneben: kartePassen schiebt den linken Rand hinter die Spalte und den
 * unteren über die Anwendungen unten mittig, sichtSetzen stellt einen Punkt in
 * die Mitte der freien Fläche. */
const SEITENLEISTE = matchMedia('(min-width: 1010px)');

function seitenBreite() {
  return SEITENLEISTE.matches ? Math.round($('.ui').getBoundingClientRect().right) : 0;
}

function kartePassen(grenzen, o = {}) {
  const links = seitenBreite();
  if (links) {
    const tl = o.paddingTopLeft || o.padding || [30, 30], br = o.paddingBottomRight || o.padding || [30, 30];
    const radar = $('#radar');
    const oben = radar.hidden ? 30 : Math.round(radar.getBoundingClientRect().bottom) + 20;
    o = { ...o, paddingTopLeft: [links + tl[0], oben], paddingBottomRight: [Math.max(br[0], 100), untenBelegt()] };
    delete o.padding;
  } else if (!$('#routeKopf').hidden) {
    // Am Handy stehen Start und Ziel oben über der Karte, „Mit dem Auto" unten
    const p = o.padding || [30, 30];
    o = { ...o, paddingTopLeft: [p[0], Math.round($('#routeKopf').getBoundingClientRect().bottom) + p[1]],
      paddingBottomRight: [p[0], parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bh')) + p[1]] };
    delete o.padding;
  }
  map.fitBounds(grenzen, o);
}

/** Wie viel unten von Anwendungen und Werkzeugleiste belegt ist (ab 1010 px). */
function untenBelegt() {
  let oben = window.innerHeight - 16;
  for (const el of [$('#bottom'), $('#ziel'), $('#live')]) {      // das Radar steht oben
    if (el.hidden || getComputedStyle(el).position !== 'fixed') continue;
    oben = Math.min(oben, el.getBoundingClientRect().top);
  }
  return Math.round(window.innerHeight - oben) + 20;
}

function sichtSetzen(ll, z = map.getZoom()) {
  const links = seitenBreite();
  if (!links) { map.setView(ll, z); return; }
  // Erst mittig setzen, dann um die halbe Spalte versetzen — über Bildschirmpunkte,
  // damit es auch bei gedrehter Karte stimmt
  map.setView(ll, z, { animate: false });
  const g = map.getSize();
  map.setView(map.containerPointToLatLng([g.x / 2 - links / 2, g.y / 2]), z, { animate: false });
}

function updateBH() {
  // Ab 1010 px: Anwendungen unten mittig übereinander, die zuletzt geöffnete
  // (Profil, Polygon …) zuunterst, darüber Abstecken und Live; das Radar steht oben mittig
  if (SEITENLEISTE.matches) {
    const b = $('#bottom');
    const stapel = [b.dataset.art === 'werkzeug' ? b : null, $('#ziel'), $('#hoehenLeiste'), $('#live')]
      .filter(el => el && !el.hidden);
    // Unten am Rand; die Werkzeugleiste steht hochkant rechts daneben
    let y = 16;
    for (const el of stapel) {
      el.style.setProperty('--unten', y + 'px');
      y += Math.round(el.getBoundingClientRect().height) + 8;
    }
  }
  let grundlinie = UNTEN_RAND;
  // Bei offenem Menü sind die Leisten ausgeblendet (openSheet) und zählen nicht
  if (!document.body.classList.contains('menue-offen')) {
    for (const el of [$('#bottom'), $('#ziel'), $('#hoehenLeiste')]) {
      if (el && !el.hidden) grundlinie += el.getBoundingClientRect().height + 8;
    }
  }
  document.documentElement.style.setProperty('--bh', Math.round(grundlinie) + 'px');
}

/* ---- Quellenangaben ----
 * Leaflet pflegt die Attribution weiter selbst (sie wechselt mit Grundkarte und
 * Auflagen); hier wird nur ihr Kasten aus der Kartenecke nach ganz unten
 * umgehängt. Ohne das „Leaflet"-Präfix samt Fahne: Das ist keine Lizenzpflicht,
 * nur eine Voreinstellung der Bibliothek (BSD-2 verlangt es nicht im Bild).
 *
 * Zuklappen nach 5 s oder beim ersten Griff auf die Karte — genau die beiden
 * Fälle, die die Attributionsrichtlinie der OSM Foundation nennt. Ein
 * programmgesteuertes Verschieben (Link, Suche) zählt nicht als Griff, deshalb
 * die Zeiger- und Radereignisse statt movestart. */
const QUELLEN_OFFEN_MS = 5000;
let quellenTimer = null;

function quellenSetzen(offen) {
  $('#quellen').classList.toggle('zu', !offen);
  $('#quellenBtn').setAttribute('aria-expanded', String(offen));
  clearTimeout(quellenTimer);
  if (offen) quellenTimer = setTimeout(() => quellenSetzen(false), QUELLEN_OFFEN_MS);
}

function quellenEinrichten() {
  // Statt der Leaflet-Fahne: Impressum und Datenschutz, mit einem Griff am ©
  map.attributionControl.setPrefix('<a href="impressum.html">Impressum &amp; Datenschutz</a>');
  $('#quellenText').appendChild(map.attributionControl.getContainer());
  $('#quellenBtn').addEventListener('click', () => quellenSetzen($('#quellen').classList.contains('zu')));
  const zuBeimGriff = () => { if (!$('#quellen').classList.contains('zu')) quellenSetzen(false); };
  map.getContainer().addEventListener('pointerdown', zuBeimGriff, { passive: true });
  map.getContainer().addEventListener('wheel', zuBeimGriff, { passive: true });
  quellenSetzen(true);
  updateBH();
}

function setBusy(on) {
  view.busy = on;
  $('#progress').hidden = !on;
  const lupe = $('#qGo');
  if (lupe) lupe.classList.toggle('busy', on);
}

/* ============================ Suche über die Felder ============================ */

async function search() {
  if (view.busy) return;

  /* Steht Freitext in der Zeile, ist der erste Treffer gemeint. Liegt noch
   * keiner vor — etwa weil der Knopf schneller war als der Dienst —, wird er
   * hier geholt. */
  const frei = $('#q') ? $('#q').value.trim() : '';

  const k = koordLesen(frei);
  if (k) { koordWaehlen(k); return; }
  const proj = projLesen(frei);
  if (proj.length) { projWaehlen(proj[0]); return; }

  if (ortModus(frei)) {
    if (suggestEintraege.length) { suggestEintraege[0].tun(); return; }
    setBusy(true);
    try {
      clearTimeout(ortTimer);
      await ortSuchen(frei);
      if (suggestEintraege.length) suggestEintraege[0].tun();
      else toast(`Nichts zu „${frei}“ gefunden.`);
    } finally {
      setBusy(false);
    }
    return;
  }

  suchZu();

  const ref = $('#ref').value.trim();
  const kmRaw = $('#km').value.trim();

  if (!ref) { toast('Bitte eine Streckennummer eingeben.'); $('#ref').focus(); return; }

  setBusy(true);
  try {
    if (!kmRaw) { await streckeZeigen(ref); return; }

    const tokens = kmTokens(kmRaw);
    if (tokens.length > 1) { await searchReihe(ref, tokens); return; }

    const km = toKm(kmRaw);
    if (!isFinite(km)) { toast('Kilometer nicht lesbar — z. B. 12,5 oder 14+250.'); return; }

    reihe = []; reiheAktiv = 0; reiheFehler = [];
    view.ref = ref;
    const res = await gleisGenau(ref, km, await resolvePoint(ref, km));
    applyPoint(ref, km, res);
    if (res.pfad) { const { pfad, ...rest } = res; view.point = rest; zeichneGleisweg(pfad); }
    sichtSetzen([res.lat, res.lon], Math.max(map.getZoom(), 15));
  } catch (err) {
    showError(err.message || 'Abfrage fehlgeschlagen.');
  } finally {
    setBusy(false);
  }
}

/* Nur Strecke: die ganze Strecke zeigen und hervorheben (ifgZeichnen), damit man
 * sich orientieren kann. Auch beim ersten Enter ohne Kilometer, während der
 * Cursor schon im Kilometerfeld steht — bis Oktober 2026 sprang Enter dort nur
 * weiter, und die Strecke kam erst mit dem zweiten. */
async function streckeZeigen(ref) {
  reihe = []; reiheAktiv = 0; reiheFehler = [];
  view.ref = ref;
  view.km = null;            // sonst trüge der Link noch den Kilometer der letzten Suche
  const st = await ifgStrecke(ref).catch(() => null);
  if (String(view.ref) !== ref) return;      // inzwischen etwas anderes gesucht
  if (st) {
    view.point = null;
    view.hervor = true;
    drawPoint();
    let s = 90, w = 180, n = -90, o = -180;
    for (const g of st.abschnitte) {
      s = Math.min(s, g.bb[0]); w = Math.min(w, g.bb[1]); n = Math.max(n, g.bb[2]); o = Math.max(o, g.bb[3]);
    }
    kartePassen([[s, w], [n, o]], { paddingTopLeft: [30, 90], paddingBottomRight: [30, 130] });
    drawMilestones();
    const [von, bis] = ifgBereich(st);
    showStatus(`Strecke ${ref}: km ${fmtKm(von)} bis ${fmtKm(bis)} nach DB InfraGO. ` +
      `Auf die Linie tippen setzt einen Punkt.`);
    return;
  }
  await coverage(ref, 0);
  const e = lineCache.get(ref);
  if (!e.sorted.length) { showError(`Für Strecke ${ref} sind keine Kilometersteine erfasst — Nummer prüfen.`); return; }
  view.point = null;
  view.hervor = true;
  drawPoint();
  drawMilestones();
  fitLine(e);
  showStatus(`Strecke ${ref}: ${e.alle.length} Kilometersteine geladen. Auf die Linie tippen setzt einen Punkt.`);
}

/** Erstes Enter ohne Kilometer: weiter ins Kilometerfeld und die Strecke schon zeigen. */
function streckeVorab() {
  suchAuf();
  $('#km').focus();
  const ref = $('#ref').value.trim();
  if (ref) streckeZeigen(ref).catch(err => showError(err.message || 'Abfrage fehlgeschlagen.'));
}

/* Mehrere Achspunkte auf einen Schlag — im Feld durch & oder Leerzeichen
 * getrennt. Das ist der Fall aus der Praxis: Aus einer Liste von Achspunkten
 * sollen alle auf einmal auf die Karte, nicht einer nach dem anderen von Hand.
 *
 * Gerechnet wird nacheinander mit genau derselben Funktion wie bei einem
 * einzelnen Punkt — die Steine der Strecke stehen nach dem ersten Griff im
 * Speicher, die weiteren kosten dann kaum noch etwas. Ein Punkt, der nicht
 * geht, wirft nicht die ganze Reihe weg; er wird darunter benannt. */
async function searchReihe(ref, tokens) {
  if (tokens.length > REIHE_MAX) {
    toast(`Höchstens ${REIHE_MAX} Kilometer auf einmal — es waren ${tokens.length}.`);
    return;
  }

  neuerPunktInfoZu();
  const kms = tokens.map(toKm);
  const unlesbar = tokens.filter((t, i) => !isFinite(kms[i]));
  if (unlesbar.length) {
    toast(`Nicht lesbar: ${unlesbar.join(' ')} — z. B. 12,5 oder 14+250.`);
    return;
  }

  reihe = [];
  reiheAktiv = 0;
  reiheFehler = [];
  view.ref = ref;
  view.point = null;
  pointLayer.clearLayers();

  const fehler = [];
  for (let i = 0; i < kms.length; i++) {
    showStatus(`Rechnet ${i + 1} von ${kms.length} — km ${fmtKm(kms[i])} …`);
    try {
      const res = await gleisGenau(ref, kms[i], await resolvePoint(ref, kms[i]));
      const { pfad, ...punkt } = res;
      reihe.push({ km: kms[i], punkt, pfad: pfad || null });
    } catch (err) {
      fehler.push(`km ${fmtKm(kms[i])}: ${err.message || 'nicht bestimmbar'}`);
    }
  }

  if (!reihe.length) {
    showError(`Kein einziger der ${kms.length} Kilometer war zu bestimmen. ${fehler[0] || ''}`);
    return;
  }

  reiheFehler = fehler;
  reiheAktiv = 0;
  view.km = reihe[0].km;
  view.point = reihe[0].punkt;
  gleiswegZuletzt = reihe[0].pfad || null;
  zeichneGleiswegNeu();
  drawPoint();
  drawMilestones();
  renderBottom();
  pushRecent(ref, reihe[0].km);
  updateHash();

  /* Die untere Leiste wächst mit der Zahl der Punkte — ihre Höhe hier abfragen,
   * sonst verschwindet der erste Pin hinter ihr. */
  const pts = reihe.map(r => [r.punkt.lat, r.punkt.lon]);
  if (reihe.length > 1) {
    const unten = Math.min(300, ($('#bottom').offsetHeight || 140) + 30);
    kartePassen(L.latLngBounds(pts), { paddingTopLeft: [40, 100], paddingBottomRight: [40, unten], maxZoom: 16 });
  } else {
    sichtSetzen(pts[0], Math.max(map.getZoom(), 15));
  }
  if (fehler.length) toast(`${fehler.length} von ${kms.length} nicht bestimmbar — siehe unten.`);
}

/* ====================== Eine Zeile oben, zwei Felder darunter ======================
 *
 * Getippt wird in eine einzige Zeile — so, wie ein Achspunkt auf dem Zettel
 * steht: erst die Strecke, dann der Kilometer. Was dort steht, wird sofort in
 * die beiden Felder zerlegt, die darunter aufklappen, sobald die Zeile
 * angetippt wird. Beides bleibt aneinander gebunden: eine Änderung im Feld
 * schreibt sich in die Zeile zurück.
 *
 * Der Umweg über die Felder ist auf dem Handy kein Luxus, sondern der
 * eigentliche Weg: der Zahlenblock hat keine Leertaste, mit der sich Strecke
 * und Kilometer in einer Zeile trennen ließen. Getippt wird also die Strecke,
 * dann tippt man ins Kilometerfeld — die Zeile fasst beides trotzdem zusammen
 * und lässt sich am Rechner oder aus der Zwischenablage auch am Stück füllen. */

function qZerlegen(text) {
  const t = String(text || '').trim();
  if (!t) return { ref: '', km: '' };
  // Streckennummer vorn, danach durch Leerzeichen (oder das Wort km) getrennt alles Weitere
  let m = t.match(/^(\d{1,6})(?:\s*km\b\.?)?(?:\s+([\s\S]*))?$/i);
  if (!m) m = t.match(/^(\d{1,6})\s*[,;:\/]\s*([\s\S]+)$/);
  if (!m) return { ref: t, km: '' };
  return { ref: m[1], km: (m[2] || '').trim() };
}

/** Zeile → Felder */
function qAufFelder() {
  const text = $('#q').value;
  // Ein Ortsname oder eine Koordinate ist keine Streckennummer -- so etwas darf
  // nicht im Feld stehenbleiben und spaeter mitgesucht werden.
  const z = streckeModus(text) ? qZerlegen(text) : { ref: '', km: '' };
  $('#ref').value = z.ref;
  $('#km').value = z.km;
  suchTextMerken();
}

/** Felder → Zeile. Überall aufrufen, wo ein Treffer die Felder nachzieht. */
function felderAufQ() {
  const ref = $('#ref').value.trim();
  const km = $('#km').value.trim();
  const el = $('#q');
  if (el) el.value = [ref, km].filter(Boolean).join(' ');
  suchTextMerken();
}

/* Pfeil und Kreuz stehen nur da, wenn etwas in der Zeile steht — und die
 * Felder für Strecke und Kilometer nur, solange es auch um eine Strecke geht. */
function suchTextMerken() {
  const s = $('#search'), q = $('#q');
  if (!s || !q) return;
  s.classList.toggle('hat-text', !!q.value.trim());
  s.classList.toggle('frei', !streckeModus(q.value));
}

/* Was man eingeben kann, als Platzhalter im Wechsel: je eins für jede Art, die
 * die Zeile versteht. Ruhig getauscht, ohne Bewegung — nur ein Hinweis. */
const SUCH_BEISPIELE = ['5100 30,5', 'Lichtenfels', '5100 30,5 & 31,2', '646568 5556410', '5100'];
const SUCH_BEISPIEL_MS = 4500;

function suchBeispieleStarten() {
  const q = $('#q');
  if (!q) return;
  let i = 0;
  q.placeholder = 'z. B. ' + SUCH_BEISPIELE[0];
  setInterval(() => {
    // Nur tauschen, solange man ihn sieht — und nicht, während jemand gerade hineintippt
    if (q.value || document.activeElement === q) return;
    i = (i + 1) % SUCH_BEISPIELE.length;
    q.placeholder = 'z. B. ' + SUCH_BEISPIELE[i];
  }, SUCH_BEISPIEL_MS);
}

function suchAuf() { $('#search').classList.add('offen'); }

function suchZu() {
  $('#search').classList.remove('offen');
  closeSuggest();
}

function fitLine(e) {
  const pts = e.sorted.map(p => [p.lat, p.lon]);
  if (!pts.length) return;
  if (pts.length === 1) sichtSetzen(pts[0], 15);
  else kartePassen(L.latLngBounds(pts), { paddingTopLeft: [30, 90], paddingBottomRight: [30, 130], maxZoom: 15 });
}

/* ============================ Betriebsstellen ============================ */

/* ============================ Standort ============================ */

/* Der Standort wird dauerhaft verfolgt, nicht einmal abgefragt: Im Gelände geht
 * es darum, zu einem Punkt hinzulaufen, und dafür muss die Anzeige mitlaufen,
 * ohne dass man ständig den Knopf drückt. watchPosition liefert dabei jede neue
 * Messung des Geräts.
 *
 * Die Karte springt nur beim ersten Fix zum Standort. Danach wird nur
 * nachgeschoben, wenn der Punkt aus dem Bild läuft — sonst kämpft das Nachfahren
 * gegen jedes Verschieben von Hand. */

let ortWatch = null;
let ortLetzt = null;              // { lat, lon, genau }
let meMarker = null, meKreis = null;   // der blaue Punkt und sein Genauigkeitskreis

const ortAn = () => ortWatch != null;

function locate() {
  if (ortAn()) {
    /* Die Karte fährt nur, wenn man es verlangt. Steht der Punkt schon in der
     * Mitte, war der Tipp als Abschalten gemeint — sonst holt er die Karte
     * zurück, ohne die Verfolgung zu beenden. */
    if (ortLetzt) {
      const wo = map.latLngToContainerPoint([ortLetzt.lat, ortLetzt.lon]);
      if (wo.distanceTo(map.getSize().divideBy(2)) > 40) {
        sichtSetzen([ortLetzt.lat, ortLetzt.lon], Math.max(map.getZoom(), 17));
        toast('Karte auf den Standort gesetzt.');
        return;
      }
    }
    ortStop('Standort wird nicht mehr verfolgt.');
    return;
  }
  if (!navigator.geolocation) { toast('Standortbestimmung wird nicht unterstützt.'); return; }
  if (!window.isSecureContext) { toast('Standort geht nur über HTTPS.'); return; }

  closeSheet();
  const btn = $('#mapLocBtn');
  if (btn) btn.classList.add('busy');
  liveKmAn = false;      // jede neue Verfolgung fängt ohne Rechnung an
  toast('Standort wird verfolgt. Für den Kilometer den blauen Punkt antippen.');

  ortWatch = navigator.geolocation.watchPosition(ortNeu, ortFehler, {
    enableHighAccuracy: true, maximumAge: 2000, timeout: 25000
  });
  syncButtons();
}

function ortStop(nachricht) {
  if (ortWatch != null) navigator.geolocation.clearWatch(ortWatch);
  ortWatch = null;
  ortLetzt = null;
  liveVergessen();
  if (meLayer) meLayer.clearLayers();
  meMarker = meKreis = null;
  const btn = $('#mapLocBtn');
  if (btn) btn.classList.remove('busy', 'is-on');
  if (nachricht) toast(nachricht);
  liveLeiste();
  abNachziehen();
  if (routeWartetAufOrt) { routeWartetAufOrt = false; routeLeiste(); }
  syncButtons();
}

function ortFehler(err) {
  const btn = $('#mapLocBtn');
  if (btn) btn.classList.remove('busy');
  // Einzelne Aussetzer sind unterwegs normal — erst aufgeben, wenn es nie geklappt hat
  if (!ortLetzt) ortStop('Standort nicht verfügbar: ' + (err.message || 'unbekannt'));
}

function ortNeu(pos) {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  const erste = !ortLetzt;
  ortLetzt = { lat, lon, genau: accuracy || 0 };

  const btn = $('#mapLocBtn');
  if (btn) { btn.classList.remove('busy'); btn.classList.add('is-on'); }

  /* Der Punkt ist der Auslöser für den Kilometer. Er ist 16 px groß, die
   * Trefferfläche drumherum 44 px — sonst trifft man ihn im Gelände nicht.
   *
   * Angelegt wird er einmal und danach nur verschoben. Neu gebaut bei jeder
   * Meldung (etwa im Sekundentakt) verschwände das Element unter dem Finger,
   * und ein Tipp zwischen Aufsetzen und Loslassen ginge ins Leere. Mit
   * Tastatur lässt er sich anspringen und mit Enter auslösen. */
  const radius = Math.max(accuracy || 0, 5);
  if (!meMarker) {
    meMarker = L.marker([lat, lon], {
      icon: L.divIcon({ className: 'me-hit', html: '<div class="me-dot"></div>', iconSize: [44, 44], iconAnchor: [22, 22] }),
      title: 'Kilometer an meinem Standort'
    }).on('click', meTipp).addTo(meLayer);
    meKreis = L.circle([lat, lon], {
      radius, color: '#2f81f7', weight: 1, fillOpacity: 0.12, interactive: false
    }).addTo(meLayer);
  } else {
    meMarker.setLatLng([lat, lon]);
    meKreis.setLatLng([lat, lon]).setRadius(radius);
  }

  /* Nur der erste Fix bewegt die Karte, und auch der nicht beim Messen. Jede
   * weitere Meldung setzt bloß den Punkt um. Vorher zog die Karte nach, sobald
   * der Standort aus dem Bild lief — beim Messen sprang damit die Bildmitte
   * gegen die eigene Zielbewegung, und auch sonst rutschte die Karte immer
   * wieder weg. Zurückholen tut der Standortknopf. */
  if (routeWartetAufOrt) routeOrtDa();
  if (erste) {
    if (!tippZiel()) sichtSetzen([lat, lon], Math.max(map.getZoom(), 17));
    toast(`Standort auf ±${nfM.format(accuracy || 0)} m genau.`);
  }

  /* Die Zeile steht sofort mit dem, was zuletzt bekannt war; der Kilometer
   * rechnet nebenher und zeichnet sie ein zweites Mal. Auf ihn zu warten hieße,
   * den Standortpunkt später zu setzen. */
  liveLeiste();
  abNachziehen();
  if (liveKmAn) liveKmRechnen();
}

/* ---- Kilometer live aus dem Standort ----
 *
 * Wer an der Strecke läuft, will den Kilometer sehen, ohne dafür zu tippen:
 * hinschauen und wissen, wo man ist.
 *
 * Gerechnet wird dasselbe wie bei einem gesetzten Punkt — der Standort wird auf
 * den Zug der Kilometersteine gelotet und der Kilometer aus der Sehne gelesen,
 * bei weiten Steinabständen am mitgelieferten Gleisverlauf entlang. Es ist
 * buchstäblich dieselbe Funktion (kartePunkt), also gilt auch dieselbe
 * nachgemessene Genauigkeit; hinzu kommt allein die Ortungsungenauigkeit des
 * Geräts, und die steht in derselben Zeile.
 *
 * Zwei Dinge sind hier anders als beim Tippen:
 *
 * Erstens läuft es bei jeder Meldung des Geräts, also im Sekundentakt. Deshalb
 * geht davon nichts ins Netz: Die Steine kommen aus der geladenen Strecke oder
 * aus den Kacheln (netzSteine), der Gleisweg zwischen zwei Steinen bleibt
 * gepuffert. Wo beides nichts hergibt, steht in der Zeile der Grund, und ein
 * Tipp darauf nimmt den bekannten Weg über kmAnStelle — der darf dann fragen.
 *
 * Zweitens steht die Strecke nicht fest. An einem Bahnhof liegen ein halbes
 * Dutzend Nummern in Reichweite, und eine Anzeige, die im Gehen zwischen ihnen
 * springt, ist im Gelände unbrauchbar. Deshalb bleibt die einmal gefundene
 * Strecke kleben, solange der Standort in Reichweite ihrer Steine liegt. */

/* Wonach nicht bei jeder Meldung neu gesucht wird: Welche Strecke hier liegt,
 * kostet ein Vielfaches einer Projektion — netzLinesNear geht über alle Gleise
 * im Umkreis. Solange keine Strecke gefunden ist, wird die Frage erst nach
 * 30 m Bewegung erneut gestellt: zu Fuß ein halbes Dutzend Schritte, im Auto
 * eine Sekunde. */
const LIVE_SUCH_WEG = 30;

let liveKm = null;        // { ref, km, punkt } oder null
let liveGrund = '';       // kurz, warum gerade kein Kilometer steht
let liveRef = '';         // die klebende Strecke
let liveSteine = null;    // { ref, lat, lon, umkreis, sorted } aus den Kacheln
let liveVon = null;       // Standort und Strecke der letzten Rechnung
let liveSuchVon = null;   // wo zuletzt nach einer Strecke gesucht wurde
let liveRechnet = false;
/* Der Standortknopf zeigt nur, wo man steht. Gerechnet wird erst, wenn man
 * den blauen Punkt auf der Karte antippt — die Rechnung fragt bei jedem
 * Schritt Kacheln und notfalls Overpass, und das soll niemand ungefragt
 * auslösen. Beim Beenden der Verfolgung fällt der Schalter wieder zurück. */
let liveKmAn = false;

function liveVergessen() {
  liveKmAn = false;
  liveKm = null;
  liveGrund = '';
  liveRef = '';
  liveSteine = null;
  liveVon = null;
  liveSuchVon = null;
  if (liveLayer) liveLayer.clearLayers();
}

/** Reicht diese Steinliste bis an den Standort heran? */
function liveReicht(sorted, lat, lon, tol) {
  const hit = sorted && sorted.length > 1 && projectOnLine(sorted, lat, lon, MAX_GLEIS_GAP_KM);
  return !!hit && hit.dist <= tol;
}

/** Steine für die laufende Rechnung — erst die geladene Strecke, dann die Kachel. */
async function liveSteineFuer(ref, lat, lon, tol) {
  /* Die ORM-Daten haben Vorrang, solange sie hier reichen: Sie stecken schon im
   * Speicher, sind für die gesuchte Strecke gefiltert und führen den Betreiber
   * mit. Reichen sie nicht bis hierher, wird nicht nachgeladen — das wäre eine
   * Netzabfrage im Sekundentakt. */
  const e = lineCache.get(ref);
  if (e && liveReicht(e.sorted, lat, lon, tol)) return e.sorted;

  /* Aus der Kachel gesammelte Steine bleiben liegen, bis man aus ihrem halben
   * Umkreis hinausgelaufen ist: Die Zuordnung Punkt → Strecke geht über die
   * Lage auf dem Gleis und ist die teuerste Rechnung in dieser Kette.
   *
   * Reicht die gepufferte Liste nicht bis hierher, wird trotzdem noch einmal
   * weiter gegriffen — es sei denn, sie ist schon die weite: Dann bringt ein
   * neuer Versuch dasselbe Ergebnis und kostet nur Rechenzeit je Meldung. */
  if (liveSteine && liveSteine.ref === ref &&
      haversine(lat, lon, liveSteine.lat, liveSteine.lon) < liveSteine.umkreis / 2 &&
      (liveSteine.umkreis >= SEED_RADIUS || liveReicht(liveSteine.sorted, lat, lon, tol))) {
    return liveSteine.sorted;
  }

  /* Erst eng, dann weit. 4 km reichen fast immer und halten die Zuordnung
   * billig; der weite Griff lohnt nur, wo kein Steinpaar den Standort
   * einschließt — an Strecke 5321 etwa liegt zwischen km 87,2 und 96,2 keiner.
   *
   * Gefragt ist dabei nicht „irgendein Paar", sondern eines, das den Standort
   * auch erreicht: Bei 49,520913 / 10,274394 liegen im engen Umkreis nur die
   * Steine bei km 96,2 und 96,4 am anderen Ende, 4 km entfernt. Die bilden ein
   * gültiges Paar — und mit ihm wäre die Suche vorzeitig zufrieden gewesen,
   * während der Standort in der Lücke davor liegt. */
  let sorted = null;
  for (const umkreis of [4000, SEED_RADIUS]) {
    const s = await netzSteine(ref, lat, lon, umkreis);
    if (!s || s.length < 2) continue;
    sorted = s;
    liveSteine = { ref, lat, lon, umkreis, sorted: s };
    if (liveReicht(s, lat, lon, tol)) break;
  }
  return sorted;
}

/** Kilometer an dieser Stelle auf dieser Strecke — ohne Netz, oder null. */
async function liveTreffer(ref, lat, lon, tol) {
  const sorted = await liveSteineFuer(ref, lat, lon, tol);
  if (!sorted) return null;

  const hit = projectOnLine(sorted, lat, lon);
  if (hit && hit.dist <= tol) {
    return kartePunkt(ref, hit, lat, lon, sorted[0].operator, sorted);
  }

  /* Kein Paar innerhalb der Zeichengrenze, vielleicht aber eines über eine
   * weite Lücke — dann entscheidet der echte Verlauf, genau wie in useLineAt. */
  const weit = await kmEntlangGleis(ref, lat, lon, true, sorted);
  if (weit && weit.offset <= tol) {
    const { pfad, ...punkt } = weit;      // der Verlauf gehört nicht in den Zustand
    return punkt;
  }
  return null;
}

async function liveKmRechnen() {
  if (!ortLetzt || liveRechnet || !liveKmAn) return;
  const { lat, lon, genau } = ortLetzt;

  /* Im Stand nicht neu rechnen: Der Fix wandert um einige Meter, und eine Zahl,
   * die dabei zappelt, liest sich schlechter als eine, die steht. Ein Wechsel
   * der Strecke oben zählt aber als Grund. */
  if (liveVon && (liveKm || liveGrund) && liveVon.ref === view.ref &&
      haversine(lat, lon, liveVon.lat, liveVon.lon) < LIVE_MIN_WEG) return;

  liveRechnet = true;
  const tol = Math.min(LIVE_TOL_MAX, PUNKT_TOL + genau);
  try {
    const versucht = new Set();
    let punkt = null, ref = '';

    /* Zuerst InfraGO, ohne Netz, sobald die Strecken in Reichweite einmal
     * geladen waren. Die klebende Strecke bleibt, solange sie in Reichweite ist. */
    const ifg = await ifgKmAn(lat, lon, tol, [liveRef, view.ref], Infinity).catch(() => null);
    if (ifg) { punkt = ifg.punkt; ref = ifg.ref; }

    // Sonst die Steine: erst die klebende Strecke, dann die oben eingegebene
    for (const kandidat of punkt ? [] : [liveRef, view.ref]) {
      if (!kandidat || versucht.has(kandidat)) continue;
      versucht.add(kandidat);
      punkt = await liveTreffer(kandidat, lat, lon, tol);
      if (punkt) { ref = kandidat; break; }
    }

    if (!punkt) {
      if (liveSuchVon && haversine(lat, lon, liveSuchVon.lat, liveSuchVon.lon) < LIVE_SUCH_WEG) return;
      liveSuchVon = { lat, lon };

      const nah = await netzLinesNear(lat, lon);      // aus der Kachel, ohne Netz
      if (!nah) {
        const lage = await netzLage(lat, lon);
        liveKm = null;
        liveRef = '';
        liveGrund = lage === 'draussen' ? 'außerhalb des mitgelieferten Gleisnetzes'
          : lage === 'fehlt' ? 'Gleisnetz dieser Gegend nicht auf dem Gerät'
          : lage === 'aus' ? 'kein mitgeliefertes Gleisnetz'
          : 'Gleisnetz hier unvollständig';
        return;
      }
      for (const k of nah.refs) {
        if (versucht.has(k.ref)) continue;
        versucht.add(k.ref);
        punkt = await liveTreffer(k.ref, lat, lon, tol);
        if (punkt) { ref = k.ref; break; }
      }
      if (!punkt) {
        liveKm = null;
        liveRef = '';
        liveGrund = nah.refs.length ? 'kein Kilometerpunkt in Reichweite' : 'keine Strecke in Reichweite';
        return;
      }
    }

    liveRef = ref;
    liveSuchVon = null;          // geht sie wieder verloren, gleich neu suchen
    liveGrund = '';
    punkt.standort = { genau };
    liveKm = { ref, km: punkt.km, punkt };
  } catch (err) {
    /* Eine laufende Anzeige darf nicht mit einer Fehlermeldung im Weg stehen,
     * und die Ursache ist hier immer dieselbe Klasse: fehlende Daten. */
    liveKm = null;
    liveGrund = 'Kilometer hier nicht bestimmbar';
  } finally {
    liveRechnet = false;
    liveVon = { lat, lon, ref: view.ref };
    liveKmZeichnen();
    liveLeiste();
  }
}

/* Der Standpunkt und die Stelle, an der er auf der Trasse landet, sind zwei
 * verschiedene Punkte. Das Lot dazwischen macht die Anzeige nachprüfbar: Man
 * sieht, auf welches Gleis gerechnet wurde und wie weit querab man steht. */
function liveKmZeichnen() {
  if (!liveLayer) return;
  liveLayer.clearLayers();
  if (!liveKm || !ortLetzt) return;

  const p = liveKm.punkt;
  L.polyline([[ortLetzt.lat, ortLetzt.lon], [p.lat, p.lon]], {
    color: '#2f81f7', weight: 2, opacity: 0.8, dashArray: '3 5', interactive: false
  }).addTo(liveLayer);
  L.circleMarker([p.lat, p.lon], {
    radius: 5, color: '#fff', weight: 2, fillColor: '#2f81f7', fillOpacity: 1, interactive: false
  }).addTo(liveLayer);
}

/** Tipp auf den eigenen Punkt: Der erste wirft die laufende Rechnung an, jeder
 *  weitere hält den Kilometer fest wie ein Tipp auf die Zahl in der Zeile.
 *  Beim Messen und im Profil bleibt der Tipp ein Punkt — der Marker schluckt ihn sonst. */
function meTipp(ev) {
  const ziel = tippZiel();
  if (ziel) { ziel(ev.latlng); return; }
  if (!liveKmAn) { liveKmStart(); return; }
  /* Ein Doppeltipp soll nicht gleich festhalten, bevor überhaupt ein Kilometer
   * da ist — liveKmFest ginge dann den Weg über kmAnStelle, der ins Netz darf. */
  if (!liveKm && liveRechnet) { toast('Kilometer wird noch gerechnet …'); return; }
  liveKmFest();
}

/** Die laufende Rechnung anwerfen — der bewusste Griff, den der Standortknopf
 *  nicht mitmacht. Von hier an rechnet jede Standortmeldung mit. */
function liveKmStart() {
  if (!ortLetzt) return;
  liveKmAn = true;
  liveGrund = 'wird gerechnet …';
  liveLeiste();
  liveKmRechnen();
}

/** Den laufenden Kilometer festhalten — von da an dieselbe Anzeige wie bei einem Tipp. */
function liveKmFest() {
  if (!ortLetzt) return;
  if (!liveKm) {
    // Ohne laufende Antwort der bekannte Weg, der auch fragen darf
    kmAnStelle(ortLetzt.lat, ortLetzt.lon, PUNKT_TOL);
    return;
  }
  applyPoint(liveKm.ref, liveKm.km, { ...liveKm.punkt });
  /* Und die Steine dazu holen, wie nach einem Tipp: Gerechnet wurde womöglich
   * auf Kachelpunkten, und die zeichnet drawMilestones nicht. Ein bewusster
   * Griff darf das kosten — die laufende Anzeige dürfte es nicht. Bei InfraGO
   * zeichnet drawMilestones die Strecke selbst. */
  if (liveKm.punkt.quality !== 'infrago') coverage(liveKm.ref, liveKm.km).then(drawMilestones).catch(() => { });
  toast(`km ${fmtKm(liveKm.km)} festgehalten — die Anzeige unten bleibt stehen.`);
}

/* Schmale Zeile unter der Suchleiste, solange verfolgt wird — aber nur, wenn
 * sie etwas zu sagen hat: den Kilometer an der eigenen Stelle oder den Abstand
 * zum letzten Messpunkt.
 *
 * Bis Oktober 2026 stand hier auch das nächste KML-Objekt mit Richtungspfeil,
 * und zwar von selbst, sobald der Standort lief. Das war ungefragt und immer
 * nur das nächste; das Ansteuern eines Punkts läuft jetzt über das Abstecken
 * (Fähnchenknopf), in dem man ihn auch auswählt.
 *
 * Die Ortungsgenauigkeit allein ist kein Grund für die Zeile: Die Karte zeigt
 * sie schon als Kreis um den blauen Punkt, und beim ersten Fix steht sie im
 * Hinweis. Als Zahl erscheint sie nur beim Kilometer, der von ihr abhängt.
 * Vorher stand beim bloßen Verfolgen eine volle Zeile mit nichts als „±8 m". */
function liveLeiste() {
  const el = $('#live');
  if (!el) return;
  const leer = () => { el.hidden = true; el.innerHTML = ''; updateBH(); };
  if (!ortLetzt) { leer(); return; }

  /* Der Kilometer steht vorn: Er ist der Grund, warum die Zeile da ist. Ein
   * Tipp darauf hält ihn fest, damit Koordinate, Herkunft, Google Maps und
   * Teilen zur Verfügung stehen wie bei jedem anderen Punkt. */
  const gps = `GPS ±${nfM.format(ortLetzt.genau)} m`;
  const stuecke = [];
  if (liveKm) {
    const quer = liveKm.punkt.offset > 20 ? ` · ${nfM.format(liveKm.punkt.offset)} m querab` : '';
    stuecke.push(`<button type="button" class="live-teil live-km" data-livekm ` +
      `title="Kilometer festhalten"><b>km ${esc(fmtKm(liveKm.km))}</b>` +
      `<small>Strecke ${esc(liveKm.ref)}${esc(quer)} · ${esc(gps)}</small></button>`);
  } else if (liveKmAn) {
    stuecke.push(`<button type="button" class="live-teil live-km live-km-aus" data-livekm ` +
      `title="Kilometer hier bestimmen"><b>km —</b>` +
      `<small>${esc(liveGrund || 'wird gerechnet …')}</small></button>`);
  }
  // Ohne Rechnung steht kein Kilometer da: Den wirft der Tipp auf den Punkt an.

  /* Beim Messen der Abstand vom eigenen Standort: im Live zum Start, im Polygon
   * zum letzten Punkt — „genau 20 m" wird so eine Laufaufgabe. */
  if (messModus && messPunkte.length && !messZu) {
    const live = messArt === 'live';
    const p = live ? messPunkte[0] : messPunkte[messPunkte.length - 1];
    stuecke.push(`<span class="live-teil"><b>${esc(messTextFein(ellipsoidAbstand([ortLetzt.lat, ortLetzt.lon], p)))}</b>` +
      `<small>${live ? 'vom Startpunkt' : 'vom letzten Punkt'}</small></span>`);
  }

  if (!stuecke.length) { leer(); return; }
  el.innerHTML = stuecke.join('');
  el.hidden = false;
  const knopf = el.querySelector('[data-livekm]');
  if (knopf) knopf.addEventListener('click', liveKmFest);
  updateBH();
}

/* ============================ Abstecken ============================
 *
 * Einen Punkt aus den geladenen KML-Dateien ansteuern: Entfernung, Richtung und
 * Versatz nach Nord und Ost, bei jeder Ortung neu. Der Fähnchenknopf öffnet eine
 * Liste der Punkte — nach Entfernung, Name oder Reihenfolge in der Datei, dazu
 * ein Filter —, nach der Wahl steht die Anzeige dorthin. „Nächster" geht weiter:
 * nach Entfernung zum nächstgelegenen Punkt, der noch nicht Ziel war, sonst zum
 * nächsten der Liste. So lässt sich eine Punktdatei der Reihe nach ablaufen.
 *
 * Nur Punkte: Abgesteckt wird ein Punkt. Linien und Flächen haben keinen
 * eindeutigen Zielort — kmlAnker ist bloß der Platz für die Beschriftung.
 *
 * Die Anzeige hat eine eigene Leiste über der unteren. Teilten sich beide die
 * untere, verdrängte jeder unterwegs festgehaltene Kilometer das Ziel. */

const AB_LISTE_MAX = 150;      // Zeilen auf einmal — für den Rest gibt es den Filter
const AB_SORT = ['nah', 'name', 'datei'];
const AB_NF = [0, 1, 2].map(n => new Intl.NumberFormat('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n }));
const abNamen = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

let abAn = false;              // Leiste offen
let abZiel = null;             // { a, o }: Datei und Punkt
let abListeOffen = false;
let abFilter = '';
let abListe = [];              // die gerade gezeigte Auswahl, sortiert
let abOhneOrt = false;         // nach Entfernung gewünscht, aber noch kein Standort
let abVorher = [];             // frühere Ziele, für „Zurück"
const abWarZiel = new Set();   // in dieser Sitzung schon Ziel gewesen
let abLayer = null, abLinie = null, abMarke = null;

/** Haben die sichtbaren Dateien überhaupt Punkte? Davon hängt der Knopf ab. */
function abMoeglich() {
  return kmlAkten.some(a => a.sichtbar && a.objekte.some(o => o.art === 'p' && kmlSichtbarObj(a, o)));
}

function abKnopf() {
  const btn = $('#mapZielBtn');
  if (!btn) return;
  btn.hidden = !abAn && !abMoeglich();
  btn.classList.toggle('is-on', abAn);
  btn.setAttribute('aria-pressed', abAn ? 'true' : 'false');
}

/* Nachkommastellen nach der Ortungsgenauigkeit. Ein Handy meldet ±3 bis 5 m, da
 * wären Dezimeter bloß Rauschen. Hängt ein RTK-Empfänger am Gerät (unter Android
 * über die Scheinposition), kommen ±2 cm — dann zählt jeder Zentimeter. */
function abStellen() {
  const g = ortLetzt ? ortLetzt.genau : Infinity;
  return g < 0.2 ? 2 : g < 2 ? 1 : 0;
}

function abMeter(m, stellen = abStellen()) {
  if (m >= 1000) return fmtKm(m / 1000) + ' km';
  return AB_NF[m >= 100 ? 0 : stellen].format(m) + ' m';
}

const abAbstand = k => haversine(ortLetzt.lat, ortLetzt.lon, k[0], k[1]);

/** Versatz zum Ziel in Metern, nach Norden und Osten positiv. */
function abVersatz(k) {
  const R = 6371000, rad = Math.PI / 180;
  return {
    n: (k[0] - ortLetzt.lat) * rad * R,
    o: (k[1] - ortLetzt.lon) * rad * R * Math.cos((k[0] + ortLetzt.lat) / 2 * rad)
  };
}

/* ---- Pfeil nach dem Handy ----
 *
 * Ohne Kompass zeigt der Pfeil dorthin, wo das Ziel auf der Karte liegt — bei
 * genordeter Karte also von Norden aus. Mit Kompass dreht er mit dem Gerät: Die
 * Oberkante des Bildschirms ist vorn, und der Pfeil zeigt, wohin man gehen muss.
 *
 * Die Richtung kommt vom Magnetfeldsensor. Der streut typisch 5 bis 15 Grad, an
 * der Strecke mehr: Schienen, Fahrleitung und Fahrzeuge lenken ihn ab. Für den
 * letzten Meter zählt deshalb der Versatz nach Nord und Ost, nicht der Pfeil.
 * Die Missweisung (in Deutschland 3 bis 5 Grad Ost) bleibt außen vor — sie
 * liegt unter dem, was der Sensor ohnehin streut. */
let abKurs = null;            // Kompassrichtung der Bildschirmoberkante, Grad ab Nord
let abKursHorcht = null;      // das abonnierte Ereignis
let abPfeilBild = 0;

function abKursEreignis(e) {
  let kurs = null;
  if (typeof e.webkitCompassHeading === 'number' && isFinite(e.webkitCompassHeading)) {
    kurs = e.webkitCompassHeading;           // iOS: schon im Uhrzeigersinn ab Nord
  } else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) {
    kurs = 360 - e.alpha;                    // alpha zählt gegen den Uhrzeigersinn
  }
  if (kurs == null || !isFinite(kurs)) return;
  // Quer gehalten liegt die Oberkante des Bildschirms an einer anderen Seite des Geräts
  const lage = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  kurs = ((kurs + lage) % 360 + 360) % 360;
  /* Glätten, aber über den Kreis: Ein schlichter Mittelwert aus 359° und 1° wäre
   * 180°. Ein Viertel je Meldung beruhigt das Zittern, ohne nachzuhängen. */
  const erste = abKurs == null;
  if (erste) abKurs = kurs;
  else abKurs = (abKurs + (((kurs - abKurs) % 360 + 540) % 360 - 180) * 0.25 + 360) % 360;
  if (erste) abBezugZeigen();
  if (!abPfeilBild) abPfeilBild = requestAnimationFrame(() => { abPfeilBild = 0; abPfeile(); });
}

/* Unter dem Pfeil steht, wonach er gerade wirklich zeigt; der Rahmen sagt, dass
 * Kompass gewünscht ist. Beides fällt auseinander, solange der Sensor nichts
 * meldet — dann zeigt der Pfeil weiter nach der Karte, und das soll dastehen. */
const abBezug = () => prefs.abKompass && abKurs != null ? 'Kompass' : 'Karte';

function abBezugZeigen() {
  const btn = $('[data-abkompass]');
  if (!btn) return;
  btn.classList.toggle('is-on', !!prefs.abKompass);
  btn.setAttribute('aria-pressed', prefs.abKompass ? 'true' : 'false');
  btn.querySelector('span').textContent = abBezug();
}

/** Meldet der Sensor nach einer Weile nichts, hat das Gerät keinen Kompass. */
function abKursPruefen() {
  setTimeout(() => {
    if (prefs.abKompass && abAn && abKurs == null) toast('Kein Kompass gefunden — der Pfeil richtet sich weiter nach der Karte.');
  }, 2500);
}

function abKursAn() {
  if (abKursHorcht) return;
  // Android meldet die Richtung zum Norden nur im eigenen Ereignis, iOS im gewöhnlichen
  abKursHorcht = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(abKursHorcht, abKursEreignis);
}

function abKursAus() {
  if (abKursHorcht) window.removeEventListener(abKursHorcht, abKursEreignis);
  abKursHorcht = null;
  abKurs = null;
}

/* iOS gibt den Sensor nur nach einer Freigabe heraus, und die darf nur aus einem
 * Tipp heraus erfragt werden — deshalb steht der Aufruf vor jedem await. Eine
 * einmal erteilte Freigabe kommt sofort zurück. */
function abKursFreigabe() {
  const D = window.DeviceOrientationEvent;
  if (!D) return Promise.resolve(false);
  if (typeof D.requestPermission !== 'function') return Promise.resolve(true);
  return D.requestPermission().then(r => r === 'granted', () => false);
}

async function abKompassSchalten() {
  if (prefs.abKompass) {
    prefs.abKompass = false;
    abKursAus();
  } else {
    const frei = abKursFreigabe();
    if (!(await frei)) { toast('Ohne Zugriff auf den Kompass bleibt der Pfeil nach der Karte.'); return; }
    prefs.abKompass = true;
    abKursAn();
    toast('Der Pfeil dreht jetzt mit dem Handy — flach halten. Schienen und Fahrleitung lenken den Kompass ab.');
    abKursPruefen();
  }
  saveStore();
  abBezugZeigen();
  abPfeile();
}

/* Richtung zum Ziel auf dem Bildschirm, in Grad im Uhrzeigersinn ab oben.
 *
 * Mit Kompass: die Peilung zum Ziel abzüglich der Richtung, in die das Handy
 * zeigt. Ohne — oder solange der Kompass noch nichts gemeldet hat — nach der
 * Karte, über die ungerundete Projektion gerechnet: latLngToContainerPoint
 * rundet auf ganze Pixel, und auf wenige Meter Abstand sprang der Pfeil damit in
 * groben Stufen. Die Kartendrehung kommt dazu — Norden liegt bei b Grad (syncNorth). */
function abWinkel(k) {
  if (prefs.abKompass && abKurs != null) {
    return peilung(ortLetzt, { lat: k[0], lon: k[1] }) - abKurs;
  }
  const z = 22;
  const a = map.project([ortLetzt.lat, ortLetzt.lon], z), b = map.project(k, z);
  const nordoben = Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI;
  return nordoben + (map.getBearing ? map.getBearing() || 0 : 0);
}

function abPasst(o, f) {
  if ((o.name || '').toLowerCase().includes(f)) return true;
  for (const [, v] of (o.daten || [])) if (String(v).toLowerCase().includes(f)) return true;
  return false;
}

/** Alle Punkte der sichtbaren Dateien, die zum Filter passen, in Dateireihenfolge. */
function abKandidaten() {
  const f = abFilter.trim().toLowerCase();
  const raus = [];
  for (const a of kmlAkten) {
    if (!a.sichtbar) continue;
    for (const o of a.objekte) {
      if (o.art !== 'p' || !kmlSichtbarObj(a, o)) continue;
      if (f && !abPasst(o, f)) continue;
      raus.push({ a, o });
    }
  }
  return raus;
}

function abSortieren(liste) {
  const art = AB_SORT.includes(prefs.abSort) ? prefs.abSort : 'nah';
  abOhneOrt = art === 'nah' && !ortLetzt;
  if (art === 'name') {
    liste.sort((x, y) => abNamen.compare(x.o.name || '', y.o.name || ''));
  } else if (art === 'nah' && ortLetzt) {
    for (const e of liste) e.d = abAbstand(e.o.koord);
    liste.sort((x, y) => x.d - y.d);
  }
  return liste;          // „datei" bleibt, wie es kam — sort ist stabil
}

/** Symbol wie auf der Karte: dieselbe Farbe und Form wie in kmlEbene. */
function abSymbol(a, o, formKarten) {
  const s = o.stil || {};
  const farbe = a.farbeFest ? a.farbe : (s.punkt || s.color || a.farbe);
  let form = a.symbol || 'kreis';
  if (form === 'auto') {
    if (!formKarten.has(a)) formKarten.set(a, kmlFormKarte(a));
    const karte = formKarten.get(a);
    form = (karte && karte.get(kmlWert(o, a.autoFeld))) || 'kreis';
  }
  return kmlSymbolSvg(form, esc(farbe));
}

function abUnterzeile(a, o) {
  const merkmal = a.autoFeld ? kmlWert(o, a.autoFeld) : null;
  return [merkmal, a.name].filter(Boolean).join(' · ');
}

const AB_ZU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/** Kompass wieder anwerfen, wenn er eingeschaltet war — nur während des Absteckens,
 *  der Sensor kostet Strom. Läuft aus einem Tipp heraus, wegen der Freigabe in iOS. */
function abKursWieder() {
  if (!prefs.abKompass || abKursHorcht) return;
  abKursFreigabe().then(ok => {
    if (!ok || !abAn) return;
    abKursAn();
    abKursPruefen();
  });
}

function abStart() {
  if (!abMoeglich()) { toast('Erst eine KML-Datei mit Punkten laden und einschalten.'); return; }
  abAn = true;
  abListeOffen = !abZiel;
  closeSheet();
  if (!ortAn()) locate();
  abKursWieder();
  abZeichnen();
  abLeiste();
  abKnopf();
}

function abEnde() {
  abAn = false;
  abZiel = null;
  abListeOffen = false;
  abVorher = [];
  abFilter = '';
  abKursAus();
  abZeichnen();
  abLeiste();
  abKnopf();
}

/** Ziel setzen — aus der Liste, über „Nächster" oder aus der Sprechblase. */
function abZielSetzen(e, merken = true) {
  if (merken && abZiel && abZiel.o !== e.o) abVorher.push(abZiel);
  abZiel = { a: e.a, o: e.o };
  abWarZiel.add(e.o);
  abListeOffen = false;
  if (!abAn) { abAn = true; closeSheet(); }
  if (!ortAn()) locate();
  abKursWieder();
  abZeichnen();
  abLeiste();
  abKnopf();
  abInsBild();
}

/* Liegt das Ziel außerhalb des Bildes, die Karte so stellen, dass Standort und
 * Ziel beide zu sehen sind — die Wahl ist ein bewusster Griff, da darf sie sich
 * bewegen. Liegt es schon im Bild, bleibt sie stehen. */
function abInsBild() {
  const k = abZiel.o.koord;
  if (map.getBounds().pad(-0.12).contains(k)) return;
  if (ortLetzt && abAbstand(k) < 3000) {
    kartePassen(L.latLngBounds([k, [ortLetzt.lat, ortLetzt.lon]]), {
      paddingTopLeft: [50, 120], paddingBottomRight: [70, 220], maxZoom: 19
    });
  } else {
    sichtSetzen(k, Math.max(map.getZoom(), 17));
  }
}

function abWeiter() {
  const liste = abKandidaten();
  let neu = null;
  if ((prefs.abSort || 'nah') === 'nah' && (ortLetzt || abZiel)) {
    // Vom Standort aus — ohne Ortung vom bisherigen Ziel aus
    const von = ortLetzt ? [ortLetzt.lat, ortLetzt.lon] : abZiel.o.koord;
    let best = Infinity;
    for (const e of liste) {
      if (abWarZiel.has(e.o)) continue;
      const d = haversine(von[0], von[1], e.o.koord[0], e.o.koord[1]);
      if (d < best) { best = d; neu = e; }
    }
    if (!neu) { toast('Alle Punkte dieser Auswahl waren schon Ziel.'); return; }
  } else {
    abSortieren(liste);
    const i = abZiel ? liste.findIndex(e => e.o === abZiel.o) : -1;
    neu = liste[i + 1];
    if (!neu) { toast('Das war der letzte Punkt der Liste.'); return; }
  }
  abZielSetzen(neu);
}

function abZurueck() {
  const e = abVorher.pop();
  if (e) abZielSetzen(e, false);
}

/* -------- Karte -------- */

const AB_MARKE = '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><g fill="none">' +
  '<circle class="halo" cx="16" cy="16" r="10"/><path class="halo" d="M16 1.5v6M16 24.5v6M1.5 16h6M24.5 16h6"/>' +
  '<circle class="ring" cx="16" cy="16" r="10"/><path class="ring" d="M16 1.5v6M16 24.5v6M1.5 16h6M24.5 16h6"/></g></svg>';

/** Ring um das Ziel und die Linie vom Standort dorthin. Angelegt einmal, danach nur verschoben. */
function abZeichnen() {
  if (!abLayer) abLayer = L.layerGroup().addTo(map);
  if (!abAn || !abZiel) {
    abLayer.clearLayers();
    abLinie = abMarke = null;
    return;
  }
  const k = abZiel.o.koord;
  if (!abMarke) {
    // Über den KML-Symbolen, sonst verdeckt das Symbol die Mitte des Rings
    abMarke = L.marker(k, {
      pane: 'kmlIconPane', interactive: false, keyboard: false, zIndexOffset: 1000,
      icon: L.divIcon({ className: 'ab-marke', iconSize: [32, 32], iconAnchor: [16, 16], html: AB_MARKE })
    }).addTo(abLayer);
  } else {
    abMarke.setLatLng(k);
  }
  if (ortLetzt) {
    const linie = [[ortLetzt.lat, ortLetzt.lon], k];
    if (!abLinie) {
      /* Gestrichelt, nicht gepunktet: Gepunktet sind in der OSM-Karte die Fußwege,
       * und genau zwischen denen läuft man beim Abstecken. */
      abLinie = L.polyline(linie, {
        className: 'ab-linie', weight: 3, opacity: 0.95, dashArray: '10 6', lineCap: 'butt', interactive: false
      }).addTo(abLayer);
    } else {
      abLinie.setLatLngs(linie);
    }
  } else if (abLinie) {
    abLayer.removeLayer(abLinie);
    abLinie = null;
  }
}

/* -------- Leiste -------- */

function abLeiste() {
  const el = $('#ziel');
  if (!el) return;
  if (!abAn) { el.hidden = true; el.innerHTML = ''; updateBH(); return; }
  el.hidden = false;
  if (abListeOffen || !abZiel) abListeZeigen(el); else abZielZeigen(el);
  updateBH();
}

function abListeZeigen(el) {
  const sort = AB_SORT.includes(prefs.abSort) ? prefs.abSort : 'nah';
  const knopf = (art, text) =>
    `<button type="button" class="seg-btn${sort === art ? ' is-on' : ''}" data-absort="${art}">${text}</button>`;
  el.innerHTML = `
    <button type="button" class="bb-close" data-abzu aria-label="Abstecken beenden">${AB_ZU}</button>
    ${hilfeKnopf('abstecken', 'Abstecken')}
    <div class="bb-head">
      <p class="bb-title">Abstecken</p>
      <span class="tag">Punkt wählen</span>
      ${abZiel ? '<button type="button" class="ab-zur" data-abanzeige>Zur Anzeige</button>' : ''}
    </div>
    <input id="abFilter" class="ab-filter" type="search" placeholder="Name oder Merkmal" autocomplete="off"
           spellcheck="false" enterkeyhint="search" aria-label="Punkte filtern" value="${esc(abFilter)}">
    <div class="seg ab-sort" role="group" aria-label="Sortierung">
      ${knopf('nah', 'Nächste zuerst')}${knopf('name', 'Name')}${knopf('datei', 'Datei')}
    </div>
    <div id="abListe" class="ab-liste"></div>`;

  el.querySelector('[data-abzu]').addEventListener('click', abEnde);
  const zur = el.querySelector('[data-abanzeige]');
  if (zur) zur.addEventListener('click', () => { abListeOffen = false; abLeiste(); });

  const filter = el.querySelector('#abFilter');
  filter.addEventListener('input', () => { abFilter = filter.value; abListeFuellen(); });
  filter.addEventListener('keydown', ev => { if (ev.key === 'Enter') filter.blur(); });

  el.querySelectorAll('[data-absort]').forEach(btn => btn.addEventListener('click', () => {
    prefs.abSort = btn.dataset.absort;
    saveStore();
    el.querySelectorAll('[data-absort]').forEach(b => b.classList.toggle('is-on', b === btn));
    abListeFuellen();
  }));

  // Ein Zuhörer für die ganze Liste: Die Zeilen werden beim Filtern neu gebaut
  el.querySelector('#abListe').addEventListener('click', ev => {
    const zeile = ev.target.closest('[data-ab]');
    const e = zeile && abListe[Number(zeile.dataset.ab)];
    if (e) abZielSetzen(e);
  });

  abListeFuellen();
}

function abListeFuellen() {
  const box = $('#abListe');
  if (!box) return;
  abListe = abSortieren(abKandidaten());

  if (!abListe.length) {
    box.innerHTML = `<p class="ab-mehr">${abFilter.trim()
      ? 'Kein Punkt passt zum Filter.' : 'Keine Punkte in den eingeschalteten Dateien.'}</p>`;
    updateBH();
    return;
  }

  const formKarten = new Map();
  const zeilen = abListe.slice(0, AB_LISTE_MAX).map((e, i) => {
    const ist = abZiel && abZiel.o === e.o;
    const war = !ist && abWarZiel.has(e.o);
    const unter = abUnterzeile(e.a, e.o) + (war ? ' · war schon Ziel' : '');
    return `<button type="button" class="ab-zeile${ist ? ' is-on' : ''}${war ? ' war' : ''}" data-ab="${i}">` +
      `<span class="ab-sym">${abSymbol(e.a, e.o, formKarten)}</span>` +
      `<span class="ab-txt"><b>${esc(e.o.name || '(ohne Namen)')}</b><small>${esc(unter)}</small></span>` +
      `<span class="ab-weit" data-abweit="${i}"></span>` +
      `<svg class="ab-pfeil" data-abpfeil="${i}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l6 16-6-4-6 4z"/></svg>` +
      `</button>`;
  });
  const vorn = abOhneOrt
    ? '<p class="ab-mehr">Nach Entfernung sortiert wird, sobald der Standort da ist.</p>' : '';
  const rest = abListe.length > AB_LISTE_MAX
    ? `<p class="ab-mehr">… und ${nfM.format(abListe.length - AB_LISTE_MAX)} weitere — der Filter grenzt ein.</p>` : '';
  box.innerHTML = vorn + zeilen.join('') + rest;
  box.scrollTop = 0;
  abListeWerte();
  updateBH();
}

/* Entfernung und Pfeil je Zeile, bei jeder Ortung. Umsortiert wird dabei nicht:
 * Eine Liste, die unter dem Finger die Reihenfolge wechselt, trifft man nicht. */
function abListeWerte() {
  const box = $('#abListe');
  if (!box) return;
  box.querySelectorAll('[data-abweit]').forEach(s => {
    const e = abListe[Number(s.dataset.abweit)];
    s.textContent = ortLetzt && e ? abMeter(abAbstand(e.o.koord), 0) : '';
  });
  box.querySelectorAll('[data-abpfeil]').forEach(p => {
    const e = abListe[Number(p.dataset.abpfeil)];
    p.style.visibility = ortLetzt && e ? '' : 'hidden';
    if (ortLetzt && e) p.style.transform = `rotate(${abWinkel(e.o.koord).toFixed(1)}deg)`;
  });
}

function abZielZeigen(el) {
  const { a, o } = abZiel;
  const k = o.koord;
  el.innerHTML = `
    <button type="button" class="bb-close" data-abzu aria-label="Abstecken beenden">${AB_ZU}</button>
    ${hilfeKnopf('abstecken', 'Abstecken')}
    <div class="ab-kopf">
      <!-- Der Pfeil ist zugleich der Schalter: Antippen wechselt zwischen Karte und Kompass -->
      <button type="button" class="ab-richtung${prefs.abKompass ? ' is-on' : ''}" data-abkompass
              aria-pressed="${prefs.abKompass ? 'true' : 'false'}"
              title="Antippen: Pfeil nach dem Handy (Kompass) oder nach der Karte">
        <svg id="abPfeil" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l7 18-7-4.6-7 4.6z"/></svg>
        <span>${abBezug()}</span>
      </button>
      <div class="ab-kopf-txt">
        <p id="abWeite" class="ab-weite">—</p>
        <p class="ab-name">${esc(o.name || '(ohne Namen)')}<small>${esc(abUnterzeile(a, o))}</small></p>
        ${hoeheZeile(k[0], k[1])}
      </div>
      <span id="abTag" class="tag ok" hidden>am Ziel</span>
    </div>
    <p id="abVersatz" class="bb-note plain"></p>
    <div class="bb-actions">
      <button type="button" data-abliste>Liste</button>
      <button type="button" data-abzurueck${abVorher.length ? '' : ' disabled'}>Zurück</button>
      <button type="button" class="maps" data-abweiter>Nächster</button>
      <a class="bb-ikon" href="${gmapsUrl(k[0], k[1])}" target="_blank" rel="noopener"
         aria-label="In Google Maps öffnen" title="In Google Maps öffnen">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.3s-6.6-6.1-6.6-11.2a6.6 6.6 0 0 1 13.2 0c0 5.1-6.6 11.2-6.6 11.2z"/><circle cx="12" cy="10.1" r="2.4"/></svg>
      </a>
    </div>`;

  el.querySelector('[data-abzu]').addEventListener('click', abEnde);
  el.querySelector('[data-abliste]').addEventListener('click', () => { abListeOffen = true; abLeiste(); });
  el.querySelector('[data-abzurueck]').addEventListener('click', abZurueck);
  el.querySelector('[data-abweiter]').addEventListener('click', abWeiter);
  el.querySelector('[data-abkompass]').addEventListener('click', abKompassSchalten);
  hoeheFuellen(el);
  abZielWerte();
}

/** Nur die Pfeile drehen — beim Kompass bis zu 60-mal je Sekunde, da bleibt der Rest stehen. */
function abPfeile() {
  if (!abAn || !ortLetzt) return;
  const p = $('#abPfeil');
  if (p && abZiel) p.style.transform = `rotate(${abWinkel(abZiel.o.koord).toFixed(1)}deg)`;
  document.querySelectorAll('#abListe [data-abpfeil]').forEach(s => {
    const e = abListe[Number(s.dataset.abpfeil)];
    if (e) s.style.transform = `rotate(${abWinkel(e.o.koord).toFixed(1)}deg)`;
  });
}

function abZielWerte() {
  const weite = $('#abWeite'), pfeil = $('#abPfeil'), versatz = $('#abVersatz'), tag = $('#abTag');
  if (!abZiel || !weite) return;
  if (!ortLetzt) {
    weite.textContent = '—';
    pfeil.style.visibility = 'hidden';
    tag.hidden = true;
    versatz.textContent = ortAn() ? 'Standort wird bestimmt …' : 'Standort ist aus — der Standortknopf schaltet ihn ein.';
    return;
  }
  const k = abZiel.o.koord;
  const d = abAbstand(k);
  const { n, o } = abVersatz(k);
  const st = abStellen();
  weite.textContent = abMeter(d, st);
  pfeil.style.visibility = '';
  pfeil.style.transform = `rotate(${abWinkel(k).toFixed(1)}deg)`;
  versatz.textContent = `${abMeter(Math.abs(n), st)} ${n >= 0 ? 'N' : 'S'} · ` +
    `${abMeter(Math.abs(o), st)} ${o >= 0 ? 'O' : 'W'} · GPS ±${abMeter(ortLetzt.genau, st)}`;
  // Näher als die Ortung genau ist, lässt sich nicht herankommen
  tag.hidden = d > ortLetzt.genau;
}

/** Nach jeder Ortung, Drehung oder Änderung an den Dateien. */
function abNachziehen() {
  if (!abAn) return;
  abZeichnen();
  if (abListeOffen || !abZiel) {
    if (abOhneOrt && ortLetzt) abListeFuellen();   // einmal nachsortieren, sobald der Standort da ist
    else abListeWerte();
  } else {
    abZielWerte();
  }
}

/* ============================ Verlauf ============================ */

function loadStore() {
  try {
    const roh = [STORE_KEY, ...STORE_KEYS_ALT].map(k => localStorage.getItem(k)).find(Boolean);
    const raw = JSON.parse(roh || '{}');
    const wms = { ...prefs.wms, ...((raw.prefs && raw.prefs.wms) || {}) };
    prefs = { ...prefs, ...(raw.prefs || {}), wms };
    recent = Array.isArray(raw.recent) ? raw.recent : [];
  } catch { /* defekter Speicher — Standardwerte behalten */ }
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ prefs, recent }));
    for (const k of STORE_KEYS_ALT) localStorage.removeItem(k);   // ab jetzt nur noch der neue Schlüssel
  } catch { /* voll oder gesperrt */ }
}

/* ---------- Verlauf ---------- */

/* Der Verlauf kennt zweierlei: eine Strecke mit Kilometer und einen Ort. Wer
 * im Gelände arbeitet, springt zwischen beidem hin und her — die Ortschaft
 * suchen, dann zurück auf den Achspunkt. Einträge aus älteren Fassungen haben
 * kein `art`; das sind immer Strecken. */
function recentArt(r) { return r && r.art ? r.art : 'strecke'; }

function pushRecent(ref, km) {
  const e = { art: 'strecke', ref, km };
  recent = [e, ...recent.filter(r => !(recentArt(r) === 'strecke'
    && r.ref === ref && Math.abs(r.km - km) < 1e-6))].slice(0, 12);
  saveStore();
}

function pushRecentOrt(t) {
  const e = {
    art: 'ort', name: t.name, sub: t.sub || '',
    lat: t.lat, lon: t.lon, bbox: t.bbox || null, typ: t.typ || '',
    stelle: t.art === 'stelle' ? t.roh : null
  };
  recent = [e, ...recent.filter(r => !(recentArt(r) === 'ort'
    && r.name === e.name && Math.abs(r.lat - e.lat) < 1e-6))].slice(0, 12);
  saveStore();
}

/* ============================ Was unter der Zeile steht ============================
 *
 * Die eine Zeile nimmt dreierlei entgegen, und daran hängt alles Weitere:
 *
 *   ein Buchstabe kommt vor   → Name: Betriebsstellen und Orte
 *   zwei Dezimalzahlen        → Koordinate: Punkt setzen
 *   nur Zahlen                → Strecke und Kilometer
 *
 * Der Buchstabe als Weiche ist hart, aber eindeutig: Streckennummern und
 * Kilometer sind immer Zahlen, Ortsnamen enthalten immer Buchstaben. Dadurch
 * weiß man beim Tippen jederzeit, was gerade passiert, ohne dass die Leiste
 * hin und her springt. */

function ortModus(text) { return /[^\s\d.,+&;:\/-]/.test(text || '') && !projLesen(text).length; }

/* Geht es überhaupt um eine Strecke? Nur dann werden die beiden Felder
 * darunter gezeigt und gefüllt. Eine Streckennummer ist eine ganze Zahl —
 * steht gleich hinter den ersten Ziffern ein Komma oder Punkt, ist das der
 * Anfang einer Koordinate und gehört nicht ins Streckenfeld. */
function streckeModus(text) {
  const t = String(text || '').trim();
  if (!t) return true;                       // leer: die Felder dürfen dastehen
  if (ortModus(t) || koordLesen(t) || projLesen(t).length) return false;
  return /^\d{1,6}(?![\d.,])/.test(t);
}

/* Rechts- und Hochwert: UTM 32 (sechs Stellen, oder acht mit der 32 davor) oder
 * Gauß-Krüger (sieben Stellen, der Streifen vorn). GK wird als DB_REF gerechnet:
 * Dieselben Zahlen als DHDN gelesen lägen in Bayern und BW höchstens 0,48 m
 * daneben (im Mittel 0,24 m, gerechnet im 0,1°-Raster) — weniger, als die sieben
 * Parameter für DHDN selbst hergeben (1–3 m). Bis Oktober 2026 standen beide als
 * eigene Zeilen zur Wahl; die Wahl änderte auf der Karte nichts Sichtbares.
 * Beschriftungen wie „E … · N … (UTM 32)" aus der eigenen Sprechblase oder
 * „R=… H=…" werden überlesen, damit Kopiertes direkt passt. */
const PROJ_RE = /^(\d{6,8}(?:[.,]\d{1,4})?)(?:\s*,\s+|\s+)(\d{6,8}(?:[.,]\d{1,4})?)$/;

function projLesen(text) {
  const t = String(text || '')
    .replace(/\b(?:utm\s*32|utm|gk\s*[2-5]?|db[_ ]?ref|dhdn|etrs\s*89)\b/gi, ' ')
    .replace(/\b(?:ost|nord|rechts(?:wert)?|hoch(?:wert)?|rw|hw|[enrh])\b\s*[:=]?/gi, ' ')
    .replace(/[·()\/;]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = PROJ_RE.exec(t);
  if (!m) return [];
  let [e, n] = [m[1], m[2]].map(s => Number(s.replace(',', '.')));
  if (e >= 5e6 && e < 6.2e6 && n < 1e6) [e, n] = [n, e];      // Hochwert zuerst geschrieben
  if (!(n >= 5e6 && n < 6.2e6)) return [];
  const inDe = ([lat, lon]) => lat > 47 && lat < 55.2 && lon > 5.5 && lon < 15.2;
  const zahl = v => v.toLocaleString('de-DE', { maximumFractionDigits: 2, useGrouping: false });
  const werte = `${zahl(e)} / ${zahl(n)}`;
  const raus = [];
  const utm = e >= 32e6 && e < 33e6 ? e - 32e6 : e;
  if (utm >= 1e5 && utm < 9e5) {
    const ll = utm32Zurueck(utm, n);
    if (inDe(ll)) raus.push({ sys: 'utm', name: `UTM 32: ${werte}`, sub: 'ETRS89 · setzt dort einen Punkt', lat: ll[0], lon: ll[1] });
  } else if (e >= 2e6 && e < 6e6) {
    const ll = gkZurueck(e, n, DBREF);
    if (inDe(ll)) raus.push({ sys: 'gk', name: `GK${Math.floor(e / 1e6)}: ${werte}`,
      sub: 'DB_REF oder DHDN · auf etwa 1–3 m', lat: ll[0], lon: ll[1] });
  }
  return raus;
}

/* Eine eingefügte Koordinate. Die App gibt selbst welche heraus — der Knopf
 * „Kopieren“ legt sie in der Form 50.004918, 10.917318 ab —, und aus einer
 * Nachricht kommt oft genau so eine zurück. Drei Nachkommastellen werden
 * verlangt, damit „5100 12,5“ niemals als Koordinate durchgeht. */
const KOORD_RE = /^\s*(-?\d{1,3}[.,]\d{3,})(?:\s*[,;]\s*|\s+)(-?\d{1,3}[.,]\d{3,})\s*$/;

function koordLesen(text) {
  const m = KOORD_RE.exec(String(text || ''));
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lon = Number(m[2].replace(',', '.'));
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/* ---------- Die Liste selbst ---------- */

/* Jede Zeile bringt ihr Aussehen und ihre Tat mit. Dadurch tut ein Tipp und
 * die Eingabetaste dasselbe, ohne dass es zweimal dasteht. */
let suggestEintraege = [];
let suggestAktiv = -1;

let ortTimer = 0;
let ortZaehler = 0;
let ortCtrl = null;

const IKON_BAHN = '<svg class="s-ikon bahn" viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="6" y="3" width="12" height="13" rx="2.5"/><path d="M6 10h12M8.5 20l2-3.5M15.5 20l-2-3.5"/></svg>';
const IKON_ORT = '<svg class="s-ikon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 21.5C7.8 16.6 5.5 13.3 5.5 10a6.5 6.5 0 1 1 13 0c0 3.3-2.3 6.6-6.5 11.5z"/>' +
  '<circle cx="12" cy="10" r="2.3"/></svg>';
const IKON_KOORD = '<svg class="s-ikon bahn" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="6.2"/><path d="M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4"/></svg>';
const IKON_STANDORT = '<svg class="s-ikon bahn" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="3.4"/><circle cx="12" cy="12" r="7.4"/><path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3"/></svg>';
const IKON_UHR = '<svg class="s-ikon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/></svg>';

function suggestZeile(i, ikon, name, sub) {
  return `<button class="suggest-item s-treffer" type="button" role="option" data-i="${i}">
      ${ikon}<span class="s-text"><b>${esc(name)}</b><span>${esc(sub || '')}</span></span>
    </button>`;
}

function suggestSetzen(eintraege) {
  suggestEintraege = eintraege;
  suggestAktiv = -1;
  const box = $('#suggest');
  if (!eintraege.length) { box.innerHTML = ''; box.hidden = true; return; }
  box.innerHTML = eintraege.map((e, i) => e.html(i)).join('');
  box.hidden = false;
  box.querySelectorAll('[data-i]').forEach(btn => btn.addEventListener('mousedown', ev => {
    ev.preventDefault();   // Fokus im Feld lassen, sonst schließt die Liste zuerst
    const e = suggestEintraege[Number(btn.dataset.i)];
    if (e) e.tun();
  }));
}

function suggestMeldung(html) {
  suggestEintraege = [];
  suggestAktiv = -1;
  const box = $('#suggest');
  box.innerHTML = `<p class="suggest-info">${html}</p>`;
  box.hidden = false;
}

/* Mit den Pfeiltasten durch die Liste — am Rechner der schnellste Weg, und
 * ohne Markierung wüsste man nach dem ersten Tastendruck nicht, wo man steht. */
function suggestBewegen(schritt) {
  const n = suggestEintraege.length;
  if (!n || $('#suggest').hidden) return false;
  suggestAktiv += schritt;
  if (suggestAktiv < 0) suggestAktiv = n - 1;
  if (suggestAktiv >= n) suggestAktiv = 0;
  const zeilen = $('#suggest').querySelectorAll('[data-i]');
  zeilen.forEach((z, i) => z.classList.toggle('aktiv', i === suggestAktiv));
  const z = zeilen[suggestAktiv];
  if (z && z.scrollIntoView) z.scrollIntoView({ block: 'nearest' });
  return true;
}

function suggestNehmen() {
  const e = suggestEintraege[suggestAktiv];
  if (!e) return false;
  e.tun();
  return true;
}

function openSuggest() {
  const text = $('#q') ? $('#q').value : '';
  const k = koordLesen(text);
  if (k) { ortAbbrechen(); koordZeigen(k); return; }
  const proj = projLesen(text);
  if (proj.length) { ortAbbrechen(); projZeigen(proj); return; }
  if (ortModus(text)) { ortSpaeter(text.trim()); return; }
  ortAbbrechen();
  verlaufZeigen();
}

function closeSuggest() {
  ortAbbrechen();
  suggestEintraege = [];
  suggestAktiv = -1;
  $('#suggest').hidden = true;
}

function ortAbbrechen() {
  clearTimeout(ortTimer);
  ortZaehler++;                     // späte Antworten laufen damit ins Leere
  if (ortCtrl) { ortCtrl.abort(); ortCtrl = null; }
}

/* ---------- Koordinate ---------- */

function koordZeigen(k) {
  suggestSetzen([{
    html: i => suggestZeile(i, IKON_KOORD, fmtCoord(k.lat, k.lon),
      'Koordinate · setzt einen Punkt, von dem aus sich der Kilometer rechnen lässt'),
    tun: () => koordWaehlen(k)
  }]);
}

/* Je Bezugssystem eine Zeile — die Wahl ist der Tipp darauf. */
function projZeigen(liste) {
  suggestSetzen(liste.map(p => ({
    html: i => suggestZeile(i, IKON_KOORD, p.name, p.sub),
    tun: () => projWaehlen(p)
  })));
}

function projWaehlen(p) { koordWaehlen({ lat: p.lat, lon: p.lon }); }

function koordWaehlen(k) {
  closeSuggest();
  suchZu();
  $('#q').blur();
  sichtSetzen([k.lat, k.lon], Math.max(map.getZoom(), 17));
  merkPunkt(k.lat, k.lon);
}

/* ---------- Verlauf ---------- */

function verlaufZeigen() {
  const typed = $('#ref').value.trim().toLowerCase();
  /* Steht schon ein Kilometer da, zählen nur Einträge, die mit ihm beginnen.
   * Sonst bliebe bei „5100 341" die alte Suche „5100 km 10,0" stehen und sähe
   * aus wie ein Vorschlag zur Eingabe. Verglichen wird in der Schreibweise der
   * Anzeige, damit „10,0" und „10.0" dasselbe treffen. */
  const kmTyped = $('#km').value.trim().replace('.', ',');
  const list = recent.filter(r => {
    if (!typed) return true;
    // Getippt werden Ziffern, also ist die Streckennummer gemeint
    if (recentArt(r) !== 'strecke' || !String(r.ref).toLowerCase().startsWith(typed)) return false;
    return !kmTyped || fmtKm(r.km).startsWith(kmTyped);
  }).slice(0, 6);

  suggestSetzen(list.map(r => recentArt(r) === 'ort'
    ? {
        html: i => suggestZeile(i, r.stelle ? IKON_BAHN : IKON_ORT, r.name, r.sub),
        tun: () => trefferWaehlen({
          art: r.stelle ? 'stelle' : 'ort', roh: r.stelle,
          name: r.name, sub: r.sub, lat: r.lat, lon: r.lon, bbox: r.bbox, typ: r.typ
        })
      }
    : {
        // Die Uhr sagt, dass das eine frühere Suche ist und kein Treffer
        html: i => suggestZeile(i, IKON_UHR, `Strecke ${r.ref}`, `km ${fmtKm(r.km)} · zuletzt gesucht`),
        tun: () => {
          $('#ref').value = r.ref;
          $('#km').value = fmtKm(r.km);
          felderAufQ();
          closeSuggest();
          search();
        }
      }));
}

/* ---------- Orte und Bahnhöfe ---------- */

/* Nicht bei jedem Anschlag losrennen: Getippt wird schneller, als ein Dienst
 * antworten kann, und beide Dienste bitten um maßvolle Nutzung. */
function ortSpaeter(text) {
  clearTimeout(ortTimer);
  if (text.length < 2) { ortAbbrechen(); suggestSetzen([]); return; }
  suggestMeldung('Suche …');
  ortTimer = setTimeout(() => ortSuchen(text), 300);
}

const STELLE_ART = {
  station: 'Bahnhof', halt: 'Haltepunkt', yard: 'Bahnhofsteil', junction: 'Abzweigstelle',
  service_station: 'Betriebsbahnhof', crossover: 'Überleitstelle'
};

async function ortSuchen(text) {
  if (ortCtrl) ortCtrl.abort();
  ortCtrl = new AbortController();
  const sig = ortCtrl.signal;
  const mein = ++ortZaehler;

  /* Beides zugleich: Die Betriebsstelle ist in dieser App meist das Gemeinte,
   * der Ort die Antwort darauf, wenn es keine gibt. */
  const [ifgStellen, ormStellen, orte] = await Promise.all([
    ifgStellenSuchen(text).catch(() => []),
    searchFacility(text).catch(() => []),
    searchOrt(text, sig).catch(() => [])
  ]);
  if (mein !== ortZaehler) return;   // inzwischen weitergetippt

  /* Die Betriebsstellen der DB InfraGO zuerst: Sie liegen auf dem Gerät, tragen
   * die Strecken mit Kilometer und kennen auch Abzweige und Blockstellen. Von
   * der OpenRailwayMap kommt nur, was InfraGO nicht hat — gleiche DS100 oder
   * derselbe Name in der Nähe ist dasselbe — und die UIC-Nummer dazu. */
  const stellen = ifgStellen.map(s => {
    const orm = ormStellen.find(f => (f.ds100 && f.ds100 === s.ds100) ||
      (f.name === s.name && haversine(f.lat, f.lon, s.lat, s.lon) < 1000));
    return orm && orm.uic ? { ...s, uic: orm.uic } : s;
  });
  for (const f of ormStellen) {
    if (!stellen.some(s => (f.ds100 && f.ds100 === s.ds100) ||
      (f.name === s.name && haversine(f.lat, f.lon, s.lat, s.lon) < 1000))) stellen.push(f);
  }

  const treffer = [
    ...stellen.slice(0, 4).map(f => ({
      art: 'stelle', name: f.name, lat: f.lat, lon: f.lon, roh: f,
      sub: [STELLE_ART[f.kind] || f.kind || 'Betriebsstelle',
            f.ds100 && 'DS100 ' + f.ds100,
            f.uic && 'UIC ' + f.uic,
            f.strecken && f.strecken.length && 'Strecke ' + f.strecken.map(s => s.nr).join(', ')
           ].filter(Boolean).join(' · ')
    })),
    ...orte
  ];

  if (!treffer.length) {
    suggestMeldung(`Nichts zu „${esc(text)}“ gefunden.`);
    return;
  }

  suggestSetzen(treffer.map(t => ({
    html: i => suggestZeile(i, t.art === 'stelle' ? IKON_BAHN : IKON_ORT, t.name, t.sub),
    tun: () => trefferWaehlen(t)
  })));
}

/* Ein Treffer wird zum Punkt auf der Karte — mit derselben unteren Leiste wie
 * alles andere, also samt Koordinate, Google-Maps-Knopf und Teilen. */
function trefferWaehlen(t) {
  if (!t) return;
  pushRecentOrt(t);
  // Die Zeile zeigt danach, was gewählt wurde -- nicht mehr das Bruchstück,
  // das zum Suchen gereicht hat.
  setVal('#q', t.name);
  suchTextMerken();
  closeSuggest();
  suchZu();
  $('#q').blur();

  reihe = []; reiheAktiv = 0; reiheFehler = [];
  neuerPunktInfoZu();
  view.km = null;
  view.point = t.art === 'stelle'
    ? { ...t.roh, quality: 'betriebsstelle' }
    : { lat: t.lat, lon: t.lon, quality: 'ort', name: t.name, sub: t.sub };
  gleiswegZuletzt = null;
  if (trackLayer) trackLayer.clearLayers();

  drawPoint();
  renderBottom();

  if (t.bbox) {
    kartePassen(L.latLngBounds(t.bbox), { paddingTopLeft: [30, 90], paddingBottomRight: [30, 130], maxZoom: 16 });
  } else {
    /* Ohne Ausdehnung entscheidet die Art: eine Stadt von oben, eine Adresse
     * so nah, dass man das Haus sieht. */
    const z = { city: 12, town: 13, village: 14, hamlet: 15, suburb: 14, quarter: 15 }[t.typ] || 16;
    sichtSetzen([t.lat, t.lon], z);
  }
}

/* ============================ Menü, Einstellungen, Link ============================ */

/* Solange das Menü offen ist, treten die Leisten unten (Ergebnis, Profil,
 * Abstecken) zurück — auf dem Handy lagen beide übereinander. Sie bleiben, wie
 * sie sind, und stehen nach dem Schließen wieder da (body.menue-offen in
 * style.css, updateBH rechnet sie solange nicht mit). */
function openSheet() {
  leisteZu(false);
  suchZu();
  $('#sheet').hidden = false;
  delete $('#sheet').dataset.nur;       // ganzes Menü; die Symbolspalte setzt danach einen Abschnitt
  document.body.classList.add('menue-offen');
  updateBH();
  quellenSetzen(false);   // der aufgeklappte Quellentext lag sonst über dem Menü
  $('#menuBtn').classList.add('is-on');
  $('#menuBtn').setAttribute('aria-expanded', 'true');
  closeSuggest();
  schieneSync();
}

/* Beim Schließen klappen alle Abschnitte wieder zu: Das Menü öffnet jedes Mal
 * als kurze Übersicht der Überschriften. */
function closeSheet() {
  // Lag der Tastaturfokus im Menü, geht er an den Menüknopf zurück statt ins Leere
  const fokusZurueck = $('#sheet').contains(document.activeElement);
  $('#sheet').hidden = true;
  document.body.classList.remove('menue-offen');
  updateBH();
  if (fokusZurueck) $('#menuBtn').focus();
  document.querySelectorAll('#sheet [data-sec]').forEach(b => { b.open = false; });
  parzWahlZeigen(false);
  $('#menuBtn').classList.remove('is-on');
  $('#menuBtn').setAttribute('aria-expanded', 'false');
  delete $('#sheet').dataset.nur;
  schieneSync();
}

/* Symbolspalte (ab 1010 px): ein Knopf je Abschnitt des Menüs, der ihn allein
 * in der Leiste öffnet; „Suche“ schließt ihn. Ein Tipp auf das gewählte Symbol
 * klappt die ganze Leiste zu, ein Tipp auf irgendeines wieder auf. */
function schieneWaehlen(sec) {
  // Wartet Laser noch auf den Tipp in die Karte, gilt das Weiterklicken als Abbruch —
  // sonst bliebe Laser markiert, obwohl man längst woanders ist
  if (laserAn && !laserStelle && !laserLaedt) laserEnde();
  const sh = $('#sheet'), zu = document.body.classList.contains('leiste-zu');
  const gewaehlt = sh.hidden ? sec === 'suche' && !werkzeugInLeiste() : sh.dataset.nur === sec;
  if (!zu && gewaehlt) { leisteZu(true); return; }
  if (zu) leisteZu(false);
  if (sec === 'suche') {
    closeSheet();
    $('#q').focus();
    return;
  }
  openSheet();
  sh.dataset.nur = sec;
  document.querySelectorAll('#sheet [data-sec]').forEach(d => { d.open = d.dataset.sec === sec; });
  sh.scrollTop = 0;
  schieneSync();
}

function schieneSync() {
  const sh = $('#sheet'), nur = !sh.hidden && sh.dataset.nur;
  const zu = document.body.classList.contains('leiste-zu');
  const wz = !zu && sh.hidden && werkzeugInLeiste();
  document.querySelectorAll('#schiene [data-schiene]').forEach(b => {
    const an = !zu && !wz && (nur ? b.dataset.schiene === nur : b.dataset.schiene === 'suche');
    b.classList.toggle('is-on', an);
    b.setAttribute('aria-pressed', String(an));
  });
  // Steht Profil oder Mappe gerade in der Leiste, ist ihr Feld das gewählte (gefüllt)
  const p = $('#profilSchieneBtn'), m = $('#mappeSchieneBtn');
  if (p) p.classList.toggle('gewaehlt', wz === 'profil');
  if (m) m.classList.toggle('gewaehlt', wz === 'mappe');
}

/** Welches Werkzeug ('profil', 'mappe') seine Bedienung in #bottom hat, sonst ''. */
function werkzeugInLeiste() {
  const b = $('#bottom');
  if (b.hidden || b.dataset.art !== 'profil') return '';
  return profModus ? 'profil' : mappeOffen ? 'mappe' : '';
}

/* Profil und Mappe in der Symbolspalte (ab 1010 px, 06.11.2026 so gewünscht): Ihre
 * Bedienung steht in der Leiste unter der Suche. Läuft das Werkzeug, liegt aber ein
 * Menüabschnitt darüber oder ist die Leiste zu, holt der Tipp es nach vorn; steht es
 * schon da, beendet er es — wie bisher ein zweiter Klick auf ein Werkzeug. */
function schieneWerkzeug(art) {
  const an = art === 'profil' ? profModus : mappeOffen;
  const zu = document.body.classList.contains('leiste-zu');
  if (an && (zu || !$('#sheet').hidden)) {
    leisteZu(false);
    closeSheet();
    return;
  }
  if (art === 'profil') { if (an) profEnde(); else profStart(); }
  else if (an) mappeEnde(); else mappeStart();
}

/** Leiste links zu- oder aufklappen (ab 1010 px; schmaler wirkt die Klasse nicht). */
function leisteZu(zu) {
  if (document.body.classList.contains('leiste-zu') === zu) return;
  document.body.classList.toggle('leiste-zu', zu);
  const g = $('#leisteGriff'), text = zu ? 'Leiste aufklappen' : 'Leiste zuklappen';
  g.setAttribute('aria-label', text); g.title = text; g.setAttribute('aria-expanded', String(!zu));
  if (zu) closeSuggest();
  updateBH();
  schieneSync();
}

function applyTheme() {
  const el = document.documentElement;
  if (prefs.theme === 'auto') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', prefs.theme);
  applyPalette();
  syncButtons();
  // Der Grund unter dem Bild nimmt die Hintergrundfarbe des Themas an (glStil)
  if (gl && glAn) glStilSetzen();
}

/** Hell oder dunkel — bei 'auto' entscheidet das Betriebssystem. */
function istHell() {
  if (prefs.theme === 'light') return true;
  if (prefs.theme === 'dark') return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

/* Die Signalfarbe steht als Inline-Wert auf <html> und schlägt damit beide
 * Themenblöcke im Stylesheet. Deshalb muss sie bei jedem Wechsel neu
 * gesetzt werden — auch, wenn das Betriebssystem umschaltet. */
function applyPalette() {
  const p = PALETTEN[prefs.palette] || PALETTEN.lapis;
  const ton = istHell() ? p.light : p.dark;
  const el = document.documentElement;
  el.style.setProperty('--accent', ton.accent);
  el.style.setProperty('--accent-ink', ton.ink);
  if (routeAn) routeZeichnen();     // die Linie trägt die Signalfarbe als festen Wert
}

function buildPalRow() {
  const box = $('#palRow');
  if (!box) return;
  box.textContent = '';
  Object.entries(PALETTEN).forEach(([key, p]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pal-btn';
    b.dataset.palette = key;
    b.title = p.name;
    b.setAttribute('aria-label', 'Signalfarbe ' + p.name);
    // Das Feld zeigt beide Töne: links der helle, rechts der dunkle Grund
    b.style.setProperty('--pal-dark', p.dark.accent);
    b.style.setProperty('--pal-light', p.light.accent);
    b.addEventListener('click', () => {
      prefs.palette = key;
      applyPalette();
      syncButtons();
      saveStore();
    });
    box.appendChild(b);
  });
  syncButtons();   // applyTheme läuft vor bind(), da gibt es die Felder noch nicht
}

function syncButtons() {
  document.querySelectorAll('[data-base]').forEach(b =>
    b.classList.toggle('is-on', b.dataset.base === (prefs.base || 'osm')));
  document.querySelectorAll('[data-theme]').forEach(b =>
    b.classList.toggle('is-on', b.dataset.theme === (prefs.theme || 'auto')));
  document.querySelectorAll('[data-palette]').forEach(b =>
    b.classList.toggle('is-on', b.dataset.palette === (prefs.palette || 'lapis')));

  /* Parzellenfarbe: eine der festen, Auto — oder eine eigene, dann ist das
   * Pluszeichen markiert und trägt die Farbe */
  const parz = /^#[0-9a-f]{6}$/i.test(prefs.parzFarbe || '') ? prefs.parzFarbe.toLowerCase() : 'auto';
  let parzFest = false;
  const pp = $('#parzPunkteBtn');
  if (pp) { pp.classList.toggle('is-on', !!prefs.parzPunkte); pp.setAttribute('aria-pressed', String(!!prefs.parzPunkte)); }
  document.querySelectorAll('[data-parz]').forEach(b => {
    const an = b.dataset.parz === parz;
    if (an) parzFest = true;
    b.classList.toggle('is-on', an);
  });
  const eigen = $('.parz-eigen');
  if (eigen) {
    const istEigen = !parzFest;
    eigen.classList.toggle('is-on', istEigen);
    eigen.style.setProperty('--parz', istEigen ? parz : '');
    if (istEigen) $('#parzEigen').value = parz;
  }
  document.querySelectorAll('[data-ifg]').forEach(b => {
    const an = ifgInhaltAn(b.dataset.ifg);
    b.classList.toggle('is-on', an);
    b.setAttribute('aria-pressed', String(an));
  });
  document.querySelectorAll('[data-fp]').forEach(b => {
    const an = fpArtAn(b.dataset.fp);
    b.classList.toggle('is-on', an);
    b.setAttribute('aria-pressed', String(an));
  });
  // Das Feld im Knopf: die Farbe, in der gerade gezeichnet wird — bei Auto je nach Grund
  const jetzt = $('.parz-jetzt');
  if (jetzt) jetzt.style.setProperty('--parz', parzFarbe());
  if (map) {
    // Nach der Wahl, nicht nach der Karte: Straßen und Ortsnamen sind über der
    // OSM-Karte gewählt, aber nicht gezeichnet
    for (const kennung of AUFLAGEN) {
      const btn = $('#' + kennung + 'Btn');
      if (btn) btn.classList.toggle('is-on', auflageGewaehlt(kennung));
    }
  }

  // Das Fadenkreuz gehört nur zu Live (Mitte, laufende Zahl) — nicht zu Polygon und Profil
  const kreuz = $('#mitteKreuz');
  if (kreuz && !MAUS.matches) kreuz.hidden = !(messModus && messArt === 'live');
  else if (kreuz && !messModus) kreuz.hidden = true;   // mit der Maus: messLiveZeichnen, auch beim Polygon

  const mb = $('#mapMessBtn');
  if (mb) {
    // Auch bei offener Profilmappe: Der Knopf schließt sie dann wie ein laufendes Messen
    const aktiv = messModus || profModus || mappeOffen;     // die Route und die Laserpunkte gehören nicht zum Messen
    mb.classList.toggle('is-on', aktiv);
    mb.setAttribute('aria-pressed', String(aktiv));
  }
  /* Werkzeugleiste „Messen“ (ab 1010 px): das laufende Werkzeug markiert. Radar und
   * KML standen bis November 2026 auch hier — keine Messwerkzeuge (raus auf Wunsch,
   * erreichbar über Wetter und KML in der Symbolspalte). */
  document.querySelectorAll('#werkzeugMessMenue [data-messart]').forEach(b => {
    const w = b.dataset.messart;
    const an = w === 'profil' ? profModus : w === 'mappe' ? mappeOffen : messModus && messArt === w;
    b.classList.toggle('is-on', !!an);
    b.setAttribute('aria-pressed', String(!!an));
  });
  const wm = $('#werkzeugMessBtn');
  if (wm) { wm.classList.toggle('is-on', messModus); wm.setAttribute('aria-pressed', String(messModus)); }
  for (const [id, an] of [['#profilSchieneBtn', profModus], ['#mappeSchieneBtn', mappeOffen]]) {
    const k = $(id);
    if (k) { k.classList.toggle('is-on', an); k.setAttribute('aria-pressed', String(an)); }
  }
  schieneSync();
  abKnopf();
  // Laserpunkte: runder Knopf am Handy, Feld in der Symbolspalte am Desktop
  for (const id of ['#mapLaserBtn', '#laserSchieneBtn']) {
    const k = $(id);
    if (k) { k.classList.toggle('is-on', laserAn); k.setAttribute('aria-pressed', String(laserAn)); }
  }

  const kn = $('#kmlNamenBtn');
  if (kn) kn.classList.toggle('is-on', prefs.kmlNamen !== false);

  const wt = $('#wmsToggle');
  if (wt) {
    // Ein Schalter wie die übrigen: an heißt hervorgehoben, die Beschriftung bleibt
    wt.classList.toggle('is-on', !!(prefs.wms && prefs.wms.on));
  }

  // Eingeschaltet oder nicht — für Screenreader steht das sonst nur in der Farbe
  document.querySelectorAll('#sheet .seg-btn, #sheet .pal-btn').forEach(b =>
    b.setAttribute('aria-pressed', String(b.classList.contains('is-on'))));
}

function updateHash() {
  const p = new URLSearchParams();
  if (view.ref) p.set('r', view.ref);
  if (reihe.length > 1) p.set('k', reihe.map(r => fmtKm(r.km)).join(' '));
  // Auf den Meter gerundet: Aus dem Standort kam sonst „k=90.00496258884965" in den Link
  else if (view.km != null) p.set('k', String(Math.round(view.km * 1000) / 1000));
  const hash = '#' + p.toString();
  try { window.history.replaceState(null, '', hash); } catch { location.hash = hash; }
}

function readHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return false;
  const p = new URLSearchParams(h);
  const r = p.get('r');
  if (!r) return false;
  $('#ref').value = r;
  const k = p.get('k');
  if (k != null && k !== '') {
    const werte = kmTokens(k).map(toKm);
    $('#km').value = werte.length && werte.every(isFinite) ? werte.map(fmtKm).join(' & ') : k;
  }
  felderAufQ();
  return true;
}

async function share() {
  const url = location.origin + location.pathname + location.hash;
  const title = reihe.length > 1
    ? `Strecke ${view.ref} · ${reihe.length} Kilometer`
    : view.point && view.km != null
      ? `Strecke ${view.ref} km ${fmtKm(view.km)}`
      : 'Topovo';
  if (navigator.share) {
    try { await navigator.share({ title, text: title, url }); return; }
    // Wer den Teilen-Dialog abbricht, will auch keinen kopierten Link
    catch (err) { if (err.name === 'AbortError') return; }
  }
  toast(await copyText(url) ? 'Link kopiert' : 'Kopieren nicht möglich');
}

/* ============================ Start ============================ */

/* ============================ Wetter ============================
 *
 * Luftdruck und Temperatur für die atmosphärische Korrektur am Tachymeter.
 * Von Open-Meteo (frei, ohne Schlüssel, CORS offen; in Deutschland das ICON-
 * Modell des DWD). Mit elevation= rechnet der Dienst den Druck auf die
 * angegebene Höhe um — in Bayern die Geländehöhe aus dem DGM1, gemessen am
 * 11.10.2026: 278 m → 982,5 hPa, 500 m → 956,4 hPa. Ohne Höhe nimmt er sein
 * eigenes 90-m-Höhenmodell. Die Lage geht auf drei Nachkommastellen gerundet
 * hinaus (rund 100 m); für Druck und Temperatur macht das nichts aus. Der
 * Service Worker lässt die Abfrage durch, abgelegt wird nichts. */
const WETTER_URL = 'https://api.open-meteo.com/v1/forecast';
let wetterZuletzt = 0;
let wetterLaeuft = false;

async function wetterHolen() {
  if (wetterLaeuft) return;
  wetterLaeuft = true;
  const ort = $('#wetterOrt');
  // Der eigene Standort, wenn er läuft; sonst die Kartenmitte
  const standort = ortAn() && !!ortLetzt;
  const lat = standort ? ortLetzt.lat : map.getCenter().lat, lon = standort ? ortLetzt.lon : map.getCenter().lng;
  ort.textContent = 'wird geholt …';
  try {
    let hoehe = NaN;
    try { hoehe = await hoehenPunkt(lat, lon); } catch { /* ohne DGM nimmt der Dienst seine eigene Höhe */ }
    const q = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lon.toFixed(3), timezone: 'Europe/Berlin',
      current: 'temperature_2m,relative_humidity_2m,surface_pressure' });
    if (Number.isFinite(hoehe)) q.set('elevation', hoehe.toFixed(1));
    const r = await fetch(`${WETTER_URL}?${q}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json(), c = j.current;
    const eins = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    $('#wetterDruck').textContent = `${eins.format(c.surface_pressure)} hPa`;
    $('#wetterTemp').textContent = `${eins.format(c.temperature_2m)} °C`;
    $('#wetterFeuchte').textContent = `${nfM.format(c.relative_humidity_2m)} %`;
    const zeit = (c.time || '').slice(11, 16);
    ort.textContent = `${standort ? 'Eigener Standort' : 'Kartenmitte'} · ${nfM.format(Number.isFinite(hoehe) ? hoehe : j.elevation)} m ` +
      `${Number.isFinite(hoehe) ? 'ü. NHN (DGM1)' : '(Höhenmodell des Dienstes)'} · Stand ${zeit} Uhr · Open-Meteo`;
    wetterZuletzt = Date.now();
  } catch (err) {
    ort.textContent = navigator.onLine === false ? 'Ohne Netz gibt es keine Wetterwerte.' : `Nicht erreichbar (${err.message}).`;
  }
  wetterLaeuft = false;
}

function bind() {
  // Wetter: beim Aufklappen holen, wenn die letzten Werte älter als 5 Minuten sind
  const wetter = document.querySelector('details[data-sec="wetter"]');
  if (wetter) wetter.addEventListener('toggle', () => { if (wetter.open && Date.now() - wetterZuletzt > 300000) wetterHolen(); });
  on('#wetterHolen', 'click', wetterHolen);
  // Erklärungen in den Einstellungen: zu, bis man danach fragt
  document.querySelectorAll('.erkl-knopf').forEach(k => k.addEventListener('click', () => {
    const box = document.getElementById(k.getAttribute('aria-controls'));
    const auf = box.hidden;
    box.hidden = !auf;
    k.setAttribute('aria-expanded', String(auf));
  }));

  /* Die Lupe darf dem Feld nicht den Fokus nehmen -- sonst klappt die Leiste
   * schon zu, waehrend der Finger noch auf ihr liegt, und der Klick geht ins
   * Leere. Deshalb erst mousedown abfangen, dann suchen. */
  on('#qGo', 'mousedown', ev => ev.preventDefault());
  on('#qGo', 'click', search);

  // Am Rechner springt „/" in die Suchzeile, wie bei vielen Kartendiensten
  document.addEventListener('keydown', ev => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    ev.preventDefault();
    closeSheet();
    $('#q').focus();
  });
  on('#menuBtn', 'click', () => $('#sheet').hidden ? openSheet() : closeSheet());

  /* Die eine Zeile oben. Antippen klappt die Felder auf, Tippen zerlegt den
   * Text sofort in Strecke und Kilometer. */
  on('#q', 'focus', ev => {
    /* Kommt die Leiste gerade erst auf, steht dort meist noch die letzte
     * Suche. Sie ganz zu markieren spart das Zeichenweise-Loeschen: Tippen
     * ersetzt sie dann einfach. Ist die Leiste schon offen, bleibt die
     * Schreibmarke, wo sie hingesetzt wurde. */
    const warZu = !$('#search').classList.contains('offen');
    suchAuf();
    if (warZu && ev.target.value) { try { ev.target.select(); } catch { /* egal */ } }
    openSuggest();
  });
  on('#q', 'input', () => { qAufFelder(); openSuggest(); });
  on('#q', 'keydown', ev => {
    if (ev.key === 'Escape') { ev.target.blur(); suchZu(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (suggestBewegen(ev.key === 'ArrowDown' ? 1 : -1)) ev.preventDefault();
      return;
    }
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    // Ist in der Liste eine Zeile markiert, gilt die — sonst das, was dasteht.
    if (suggestNehmen()) return;
    // Bei Freitext und Koordinate nimmt Enter den ersten Treffer.
    if (ortModus(ev.target.value) || koordLesen(ev.target.value) || projLesen(ev.target.value).length) { search(); return; }
    closeSuggest();
    // Steht noch kein Kilometer da, geht es dorthin weiter — und die Strecke steht
    // schon hervorgehoben auf der Karte (streckeVorab).
    if (!$('#km').value.trim()) { streckeVorab(); return; }
    ev.target.blur();
    search();
  });

  /* Das × leert die Zeile und klappt die Leiste zu, Tastatur inklusive. Bis
   * Oktober 2026 blieb sie offen mit einer leeren Zeile zum Weitertippen — der
   * Nutzer wollte sie aber los sein. Wer neu suchen will, tippt in die Zeile. */
  on('#qClear', 'mousedown', ev => ev.preventDefault());
  on('#qClear', 'click', () => {
    setVal('#q', '');
    setVal('#ref', '');
    setVal('#km', '');
    suchTextMerken();
    if (document.activeElement && $('#search').contains(document.activeElement)) document.activeElement.blur();
    suchZu();
    /* Leeren heißt auch: weg mit dem Gesuchten — Pin, Ergebnis und die
     * hervorgehobene Strecke. Ein offenes Werkzeug (Profil, Messen, Route) bleibt. */
    if (!['werkzeug', 'route', 'profil'].includes($('#bottom').dataset.art)) {
      closeBottom();
      view.ref = '';
      view.km = null;
      drawMilestones();
      updateHash();
    }
  });

  /* Aufgeklappter Teil: bleibt offen, solange darin gearbeitet wird, und
   * schließt erst bei einem Tipp daneben — nicht schon beim Verlieren des
   * Fokus, sonst rutscht der &-Knopf unter dem Finger weg, der ihn drückt. */
  /* Der Einstellungsknopf sitzt mit in der Suchleiste, gehört aber nicht zur
   * Suche: Bekommt er den Fokus (etwa beim Schließen des Menüs, nachdem darin
   * ein Abschnitt angetippt war), darf die Leiste nicht aufklappen. */
  on('#search', 'focusin', ev => { if (!ev.target.closest('#menuBtn')) suchAuf(); });
  document.addEventListener('pointerdown', ev => {
    const bar = document.querySelector('.bar-top');
    if (bar && !bar.contains(ev.target)) suchZu();
  }, true);

  on('#ref', 'keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); closeSuggest(); if ($('#km').value.trim()) $('#km').focus(); else streckeVorab(); }
    if (ev.key === 'Escape') closeSuggest();
  });
  on('#ref', 'focus', openSuggest);
  on('#ref', 'input', () => { felderAufQ(); openSuggest(); });
  on('#ref', 'blur', () => setTimeout(closeSuggest, 120));

  on('#km', 'keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); search(); ev.target.blur(); }
  });
  on('#km', 'focus', closeSuggest);
  on('#km', 'input', felderAufQ);

  document.querySelectorAll('[data-base]').forEach(b => {
    if (b.id !== 'reliefBtn') b.addEventListener('click', () => setBase(b.dataset.base));   // Relief: reliefKnopfBinden
  });
  on('#ormBtn', 'click', () => toggleOverlay('orm'));
  parzKnopfBinden();
  buildParzRow();
  ifgKnopfBinden();
  reliefKnopfBinden();
  ifgWahlBauen();
  fpKnopfBinden();
  fpWahlBauen();
  on('#strBtn', 'click', () => toggleOverlay('str'));
  on('#ortBtn', 'click', () => toggleOverlay('ort'));
  on('#radarBtn', 'click', () => toggleOverlay('radar'));
  radarBinden();
  document.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => {
    prefs.theme = b.dataset.theme;
    applyTheme();
    saveStore();
  }));
  buildPalRow();
  // Bei 'Automatisch' muss die Signalfarbe mitgehen, wenn das Gerät umschaltet
  window.matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => { if (prefs.theme === 'auto') applyPalette(); });

  setVal('#baseOpacity', prefs.baseOpacity == null ? 100 : prefs.baseOpacity);
  on('#baseOpacity', 'input', ev => {
    prefs.baseOpacity = Number(ev.target.value);
    applyBaseOpacity();
  });
  on('#baseOpacity', 'change', saveStore);

  setVal('#dopFarbe', prefs.dopFarbe == null ? 100 : prefs.dopFarbe);
  on('#dopFarbe', 'input', ev => {
    prefs.dopFarbe = Number(ev.target.value);
    applyBildRegler();
  });
  on('#dopFarbe', 'change', saveStore);
  setVal('#bildHell', prefs.bildHell == null ? 100 : prefs.bildHell);
  on('#bildHell', 'input', ev => {
    prefs.bildHell = Number(ev.target.value);
    applyBildRegler();
  });
  on('#bildHell', 'change', saveStore);
  on('#hoehenKnopf', 'click', hoehenEinfaerben);
  on('#hoehenZu', 'click', () => document.querySelector('[data-relief="grau"]').click());
  document.querySelectorAll('[data-relief]').forEach(k => k.addEventListener('click', () => {
    prefs.reliefFarbe = k.dataset.relief === 'farbe';
    hoehenBereich = null;          // eingefärbt wird erst wieder auf Knopfdruck
    hoehenSkala = null;
    if ((prefs.base || 'osm') !== 'relief') setBase('relief');   // wer Höhenfarben wählt, will das Relief
    grundAnwenden();
    applyBildRegler();
    hoehenSkalaZeigen();
    saveStore();
  }));
  applyBildRegler();

  on('#northBtn', 'click', () => {
    if (map.setBearing) map.setBearing(0);
    syncNorth();
  });

  on('#mapLocBtn', 'click', locate);
  // Wer bei offenem Menü zu Standort, Messen oder Abstecken greift, will zur Karte
  for (const s of ['#mapLocBtn', '#mapMessBtn', '#mapZielBtn']) {
    on(s, 'click', () => { if (!$('#sheet').hidden) closeSheet(); });
  }

  /* Der Messknopf fragt zuerst, was gemessen werden soll; läuft schon etwas,
   * beendet er es. */
  on('#mapMessBtn', 'click', () => {
    if (messModus) { messEnde(); return; }
    if (profModus) { profEnde(); return; }
    if (mappeOffen) { mappeEnde(); return; }
    messMenueAuf($('#messMenue').hidden);
  });
  /* Messknopf unten rechts: In der Einfangphase — misst es gerade, beendet ein Tipp
   * darauf das Messen, statt das Menü aufzuklappen. */
  $('#werkzeuge').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (!$('#sheet').hidden) closeSheet();
    if (!b.classList.contains('is-on')) return;
    ev.stopPropagation();
    messEnde();
  }, true);
  document.querySelectorAll('#schiene [data-schiene]').forEach(b =>
    b.addEventListener('click', () => schieneWaehlen(b.dataset.schiene)));
  on('#leisteGriff', 'click', () => leisteZu(!document.body.classList.contains('leiste-zu')));
  on('#profilSchieneBtn', 'click', () => schieneWerkzeug('profil'));
  on('#mappeSchieneBtn', 'click', () => schieneWerkzeug('mappe'));
  // Messen: läuft Polygon oder Abstand, beendet der Knopf es (Einfangphase oben), sonst klappt er aus
  on('#werkzeugMessBtn', 'click', () => werkzeugMessAuf($('#werkzeugMessMenue').hidden));
  for (const id of ['#mapLaserBtn', '#laserSchieneBtn']) on(id, 'click', () => { if (laserAn) laserEnde(); else laserStart(); });
  // Anwendungen unten mittig stapeln sich nach ihrer Höhe (updateBH)
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => updateBH());
    for (const id of ['#bottom', '#ziel', '#radar', '#live']) ro.observe($(id));
  }
  SEITENLEISTE.addEventListener('change', () => { updateBH(); schieneSync(); });
  schieneSync();
  document.querySelectorAll('[data-messart]').forEach(b => b.addEventListener('click', () => {
    messMenueAuf(false);
    werkzeugMessAuf(false);
    if (b.dataset.messart === 'profil') profStart();
    else if (b.dataset.messart === 'mappe') mappeStart();
    else messStart(b.dataset.messart);
  }));
  // In der Einfangphase, damit Leaflet die Pfeiltasten nicht zum Verschieben bekommt
  document.addEventListener('keydown', profTaste, true);
  // Das Diagramm richtet sich nach der Breite der Leiste
  let profNeu = 0;
  window.addEventListener('resize', () => {
    if (!profModus || !profDgm) return;
    cancelAnimationFrame(profNeu);
    profNeu = requestAnimationFrame(() => { const el = $('#profBild'); if (el) profBildSetzen(el); });
  });
  on('#mapZielBtn', 'click', () => { if (abAn) abEnde(); else abStart(); });

  on('#kmlNamenBtn', 'click', () => {
    prefs.kmlNamen = prefs.kmlNamen === false;
    saveStore();
    syncButtons();
    kmlLabels();
    if (prefs.kmlNamen !== false && map.getZoom() < KML_LABEL_ZOOM) {
      toast('Namen erscheinen ab Zoomstufe ' + KML_LABEL_ZOOM + ' — noch etwas näher heran.');
    }
  });

  // KML: Auswahl über den Knopf, am Rechner geht auch Hineinziehen
  on('#kmlAdd', 'click', () => { const f = $('#kmlFile'); if (f) f.click(); });
  on('#kmlFile', 'change', ev => {
    const dateien = [...ev.target.files];
    ev.target.value = '';        // dieselbe Datei soll erneut gewählt werden können
    if (dateien.length) kmlOeffnen(dateien);
  });
  // Nur bei Dateien eingreifen — markierter Text soll weiter in die Felder fallen können
  const zieht = ev => ev.dataTransfer && [...ev.dataTransfer.types].includes('Files');
  window.addEventListener('dragover', ev => { if (zieht(ev)) ev.preventDefault(); });
  window.addEventListener('drop', ev => {
    if (!zieht(ev)) return;
    ev.preventDefault();      // sonst öffnet der Browser die Datei und die App ist weg
    const dateien = [...ev.dataTransfer.files].filter(f => /\.(kml|kmz)$/i.test(f.name));
    if (dateien.length) kmlOeffnen(dateien);
    else toast('Nur KML- und KMZ-Dateien.');
  });

  // WMS: Adresse und Layer merken, Zugangsdaten bleiben beim Browser
  setVal('#wmsUrl', prefs.wms.url || '');
  setVal('#wmsLayers', prefs.wms.layers || '');
  setVal('#wmsOpacity', prefs.wms.opacity || 75);
  const wmsDeckWert = () => { const v = $('#wmsOpacityVal'); if (v) v.textContent = `${prefs.wms.opacity || 75} %`; };
  wmsDeckWert();

  const wmsSave = () => {
    const u = $('#wmsUrl'), l = $('#wmsLayers');
    if (u) {
      // Mit Zugangsdaten wird nichts gespeichert; das Feld zeigt wieder die alte Adresse
      const neu = u.value.trim();
      let zugang = false;
      try { const x = new URL(neu); zugang = !!(x.username || x.password); } catch { /* ungültig: wie bisher */ }
      if (zugang) { toast(wmsUrlFehler(neu)); u.value = prefs.wms.url || ''; return; }
      prefs.wms.url = neu;
    }
    if (l) prefs.wms.layers = l.value.trim();
    saveStore();
    if (prefs.wms.on) wmsApply(true);      // mit neuen Angaben neu aufbauen
  };
  on('#wmsUrl', 'change', wmsSave);
  on('#wmsLayers', 'change', wmsSave);

  on('#wmsOpacity', 'input', ev => {
    prefs.wms.opacity = Number(ev.target.value);
    wmsDeckWert();
    if (wmsLayer) wmsLayer.setOpacity(prefs.wms.opacity / 100);
  });
  on('#wmsOpacity', 'change', saveStore);

  on('#wmsLogin', 'click', () => { wmsSave(); wmsLogin(); });
  on('#wmsToggle', 'click', () => { wmsSave(); wmsApply(!prefs.wms.on); });
  on('#wmsLoad', 'click', () => { wmsSave(); wmsLoadLayers(); });
  on('#wmsParse', 'click', () => {
    const el = $('#wmsXml');
    const xml = el ? el.value.trim() : '';
    if (!xml) { toast('Bitte das XML einfügen.'); return; }
    try { wmsShowLayers(parseWmsCapabilities(xml)); }
    catch (err) { toast('XML nicht lesbar: ' + err.message); }
  });

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { closeSheet(); closeSuggest(); }
  });

  bindSheetSections();
  window.addEventListener('resize', updateBH);
}

/* Die Abschnitte des Menüs starten zugeklappt und klappen beim Schließen
 * wieder zu (closeSheet). Bis September 2026 blieb gemerkt, welche offen
 * standen — der Eintrag prefs.offen fällt aus dem Speicher. */
function bindSheetSections() {
  for (const b of document.querySelectorAll('#sheet [data-sec]')) b.open = false;
  if ('offen' in prefs) { delete prefs.offen; saveStore(); }
}

function boot() {
  loadStore();
  applyTheme();
  initMap();
  bind();
  routeBinden();
  kmlBoot();      // nebenher: die Karte soll nicht auf den Speicher warten

  /* Ohne Link startet die Zeile leer, mit Beispielen in Grau. Bis Oktober 2026
   * stand hier die zuletzt gesuchte Strecke — das las sich wie eine Eingabe, die
   * man erst löschen muss. Der Verlauf liegt weiter unter der Zeile. */
  if (readHash()) search();
  felderAufQ();
  suchBeispieleStarten();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* Offlinebetrieb ist optional */ });
  }
}

document.addEventListener('DOMContentLoaded', boot);
