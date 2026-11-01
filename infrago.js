/* Topovo — Kilometrierung nach DB InfraGO
 *
 * Quelle: „Infrastrukturdaten der DB InfraGO" aus der Mobilithek, Datenstand
 * Mai 2026, CC BY 4.0, Quellenvermerk „DB InfraGO".
 * Aufbereitet von werkzeug/infrago-bauen.py nach infrago/.
 *
 * Die Strecken liegen dort in Abschnitten mit Kilometer von/bis, im Median
 * 0,86 km lang. Die Linie ist auf die Kilometrierung abgestimmt — ihre Länge
 * weicht im Median 0,1 m von der Kilometerdifferenz ab, Kilometersprünge sind
 * Abschnittsgrenzen. Ein Kilometer wird deshalb anteilig auf der Linie
 * abgetragen, und umgekehrt der Anteil des Lotfußpunkts als Kilometer gelesen.
 * Beide Richtungen rechnen mit denselben Längen (ifgLaengen), damit ein
 * Rundlauf km → Lage → km auf den Millimeter zurückkommt.
 *
 * Nachgemessen am 13.10.2026: An 6271 Bahnübergängen, deren Lage in
 * OpenStreetMap (Straße kreuzt Gleis) von keiner Kilometrierung abhängt, lag
 * der InfraGO-Kilometer des Übergangs, auf dieser Linie abgetragen, im Median
 * 2,5 m daneben, im ungünstigen Zehntel 6,3 m. Zwei OSM-Kilometersteine
 * lagen an denselben Stellen bei 9,9 m und 44 m. Deshalb rechnet die App
 * zuerst hiermit und nimmt die Steine nur noch, wo InfraGO nichts weiß:
 * Strecken anderer Betreiber, Werks- und Straßenbahnen, Ausland.
 *
 * Richtungen: Eingleisige Abschnitte sind als Streckenachse (0) erfasst,
 * zweigleisige als Richtungsgleis (1) und Gegenrichtungsgleis (2), beide mit
 * derselben Kilometrierung. Für km → Lage gilt die Achse, sonst das
 * Richtungsgleis; Lage → km nimmt das nächste Gleis gleich welcher Art. */

const IFG_PFAD = 'infrago/';

/* Die Messung aus dem Kopf. worst ist das ungünstige Zehntel. */
const IFG_ERR = { typical: 2.5, worst: 6.3, faelle: 6271, osmTypical: 9.9, osmWorst: 44 };
const IFG_STAND = 'Mai 2026';
/* Quellenvermerk nach CC BY 4.0, wie ihn die Mobilithek vorgibt, für die Karte */
const IFG_QUELLE = 'Kilometrierung: <a href="https://mobilithek.info/">DB InfraGO</a> ' +
  '(<a href="https://creativecommons.org/licenses/by/4.0/deed.de">CC BY 4.0</a>), bearbeitet';

/* Zwei Stellen derselben Strecke mit demselben Kilometer (Überlänge an einem
 * Kilometersprung) gelten erst ab diesem Abstand als zwei Orte. */
const IFG_DOPPEL_M = 50;

let ifgIndexHolen = null;

/* Ohne Netz und ohne Vorrat scheitert ein Abruf. Die laufende Anzeige fragt im
 * Sekundentakt — dieselbe Datei soll dann nicht jede Sekunde neu angefragt
 * werden, sondern erst nach IFG_PAUSE_MS wieder. */
const IFG_PAUSE_MS = 60000;
const ifgGescheitert = new Map();          // Datei → Zeitpunkt des Fehlschlags
const ifgPause = datei => Date.now() - (ifgGescheitert.get(datei) || -Infinity) < IFG_PAUSE_MS;

/** Index einmal laden; false heißt „keine InfraGO-Daten" — dann wie bisher über die Steine. */
function ifgBereit() {
  if (ifgPause('index')) return Promise.resolve(false);
  if (!ifgIndexHolen) {
    ifgIndexHolen = (async () => {
      try {
        const r = await fetch(IFG_PFAD + 'index.json');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const kacheln = new Map(Object.entries(d.kacheln || {}));
        const alle = new Set();
        for (const l of kacheln.values()) for (const nr of l) alle.add(String(nr));
        return { raster: d.raster || 0.5, stand: d.stand || '', kacheln, strecken: alle,
          anlagen: Array.isArray(d.anlagen) ? new Set(d.anlagen.map(String)) : null };
      } catch {
        ifgGescheitert.set('index', Date.now());
        ifgIndexHolen = null;          // nach der Pause noch einmal versuchen
        return false;
      }
    })();
  }
  return ifgIndexHolen;
}

/** Abstand in Metern, für kurze Kanten — dieselbe Formel in beiden Richtungen. */
function ifgAbstand(aLat, aLon, bLat, bLon) {
  const k = Math.cos((aLat + bLat) / 2 * Math.PI / 180);
  return Math.hypot((bLat - aLat) * 110540, (bLon - aLon) * 111320 * k);
}

function ifgDekodieren(s) {
  const pts = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    for (let achse = 0; achse < 2; achse++) {
      let wert = 0, verschub = 0, b;
      do {
        b = s.charCodeAt(i++) - 63;
        wert += (b & 0x1f) * 2 ** verschub;   // nicht <<: ab 2^31 kippt das Vorzeichen
        verschub += 5;
      } while (b >= 0x20);
      const d = wert % 2 ? -(wert + 1) / 2 : wert / 2;
      if (achse === 0) lat += d; else lon += d;
    }
    pts.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return pts;
}

/** Laufende Länge je Stützpunkt. */
function ifgLaengen(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + ifgAbstand(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  }
  return cum;
}

/* Geladene Strecken. Ein Versprechen je Nummer und daneben das fertige
 * Ergebnis, damit das Zeichnen ohne await auskommt. Nicht unbegrenzt: Wer
 * quer durchs Land tippt, sammelt sonst Hunderte ein. Aber reichlich — in einer
 * Indexzelle liegen bis zu 33 Strecken, ein Tipp mit weitem Umkreis berührt
 * vier Zellen, und was dabei gleich wieder weichen müsste, würde bei jeder
 * Standortmeldung neu gelesen. Eine Strecke sind im Mittel gut 300 Stützpunkte. */
const IFG_STRECKEN_MAX = 400;     // die Kartenauflage zeigt bis zu 400 Strecken auf einmal
const ifgLaeuft = new Map();
const ifgGeladen = new Map();

/** Strecke laden; null heißt „InfraGO kennt diese Nummer nicht". */
async function ifgStrecke(ref) {
  const nr = String(ref || '').trim();
  if (!/^\d{3,5}$/.test(nr)) return null;
  if (ifgGeladen.has(nr)) {
    const s = ifgGeladen.get(nr);
    ifgGeladen.delete(nr);
    ifgGeladen.set(nr, s);
    return s;
  }
  if (ifgPause(nr)) return null;
  if (!ifgLaeuft.has(nr)) {
    ifgLaeuft.set(nr, (async () => {
      try {
        const ix = await ifgBereit();
        if (!ix || !ix.strecken.has(nr)) return null;
        let r;
        try { r = await fetch(`${IFG_PFAD}s/${nr}.json`); } catch { r = null; }
        if (!r || !r.ok) { ifgGescheitert.set(nr, Date.now()); return null; }
        const d = await r.json();
        const abschnitte = (d.g || []).map(([ri, a, b, linie]) => {
          const pts = ifgDekodieren(linie);
          const cum = ifgLaengen(pts);
          let s = 90, w = 180, n = -90, o = -180;
          for (const p of pts) {
            if (p.lat < s) s = p.lat;
            if (p.lat > n) n = p.lat;
            if (p.lon < w) w = p.lon;
            if (p.lon > o) o = p.lon;
          }
          return { ri, a, b, lo: Math.min(a, b), hi: Math.max(a, b), pts, cum, L: cum[cum.length - 1], bb: [s, w, n, o] };
        }).filter(g => g.pts.length > 1 && g.L > 0);
        const strecke = { nr, abschnitte };
        ifgGeladen.set(nr, strecke);
        while (ifgGeladen.size > IFG_STRECKEN_MAX) ifgGeladen.delete(ifgGeladen.keys().next().value);
        return strecke;
      } catch {
        return null;
      } finally {
        ifgLaeuft.delete(nr);
      }
    })());
  }
  return ifgLaeuft.get(nr);
}

/** Schon geladen? Für das Zeichnen, das nicht warten kann. */
const ifgStreckeJetzt = ref => ifgGeladen.get(String(ref || '').trim()) || null;

/** Punkt s Meter vom Anfang des Abschnitts, dazu die Richtung der Kante. */
function ifgPunktBei(g, s) {
  const { pts, cum } = g;
  s = Math.max(0, Math.min(g.L, s));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const l = cum[i] - cum[i - 1];
  const t = l > 0 ? (s - cum[i - 1]) / l : 0;
  const a = pts[i - 1], b = pts[i];
  return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
}

/** Wo liegt km auf dem Abschnitt? Der Kilometer läuft von a am Anfang nach b am Ende. */
function ifgAufAbschnitt(g, km) {
  const t = g.b === g.a ? 0 : (km - g.a) / (g.b - g.a);
  return ifgPunktBei(g, t * g.L);
}

/** Alle Abschnitte, die km enthalten — in der Reihenfolge, in der sie gelten sollen. */
function ifgKandidaten(strecke, km) {
  const treffer = strecke.abschnitte.filter(g => km >= g.lo - 1e-9 && km <= g.hi + 1e-9);
  const rang = ri => (ri === 0 ? 0 : ri === 1 ? 1 : 2);
  return treffer.sort((x, y) => rang(x.ri) - rang(y.ri));
}

/** km → Lage, ohne zu warten; null, wenn die Strecke dort keinen Abschnitt hat. */
function ifgLageJetzt(strecke, km) {
  const kand = ifgKandidaten(strecke, km);
  if (!kand.length) return null;
  const art = kand[0].ri;
  /* Gleiche Art, verschiedene Orte: Überlänge an einem Kilometersprung, oder
   * die Nummer kommt an zwei Stellen vor. Die erste Stelle gilt, die übrigen
   * werden genannt. An einer Abschnittsgrenze liegen beide Treffer aufeinander
   * und zählen nicht. */
  const orte = [];
  for (const g of kand) {
    if (g.ri !== art) continue;
    const p = ifgAufAbschnitt(g, km);
    if (!orte.some(o => ifgAbstand(o.lat, o.lon, p.lat, p.lon) < IFG_DOPPEL_M)) orte.push({ ...p, g });
  }
  const [erst, ...weitere] = orte;
  return { lat: erst.lat, lon: erst.lon, g: erst.g, weitere };
}

/** Kilometerpunkte im Abstand schritt (km) im Rechteck [s, w, n, o] — für die Karte.
 *  Jeder Punkt liegt dort, wo auch die Suche ihn hinlegt (ifgLageJetzt); kommt
 *  ein Kilometer zweimal vor, stehen beide da. */
function ifgKmPunkte(strecke, schritt, s, w, n, o) {
  const kms = new Set();
  for (const g of strecke.abschnitte) {
    const [gs, gw, gn, go] = g.bb;
    if (gs > n || gn < s || gw > o || go < w) continue;
    for (let i = Math.ceil(g.lo / schritt - 1e-9); i * schritt <= g.hi + 1e-9; i++) {
      kms.add(Math.round(i * schritt * 1000) / 1000);
    }
  }
  const raus = [];
  for (const km of [...kms].sort((a, b) => a - b)) {
    const l = ifgLageJetzt(strecke, km);
    if (!l) continue;
    for (const p of [l, ...l.weitere]) {
      if (p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= o) raus.push({ km, lat: p.lat, lon: p.lon });
    }
  }
  return raus;
}

/** Bereich der Kilometrierung einer Strecke, für Fehlermeldungen. */
function ifgBereich(strecke) {
  let lo = Infinity, hi = -Infinity;
  for (const g of strecke.abschnitte) { lo = Math.min(lo, g.lo); hi = Math.max(hi, g.hi); }
  return [lo, hi];
}

const IFG_GLEIS = ['Streckenachse', 'Richtungsgleis', 'Gegenrichtungsgleis'];

/** Was beide Richtungen ins Ergebnis schreiben. */
function ifgErgebnis(ref, g, lat, lon, extra) {
  return {
    lat, lon, quality: 'infrago',
    abschnitt: [g.a, g.b], gleis: IFG_GLEIS[g.ri] || '',
    operator: `Kilometrierung nach DB InfraGO, Stand ${IFG_STAND}`,
    lineRef: String(ref),
    ...extra
  };
}

/** km → Lage. null, wenn InfraGO die Strecke oder den Kilometer nicht kennt. */
async function ifgLage(ref, km) {
  if (!isFinite(km)) return null;
  const strecke = await ifgStrecke(ref);
  if (!strecke) return null;
  const l = ifgLageJetzt(strecke, km);
  if (!l) return null;
  return ifgErgebnis(ref, l.g, l.lat, l.lon, {
    weitere: l.weitere.map(w => ({ lat: w.lat, lon: w.lon, abstand: ifgAbstand(l.lat, l.lon, w.lat, w.lon) }))
  });
}

/** Lot von (lat, lon) auf einen Abschnitt: Abstand quer, Weg vom Anfang, Fußpunkt. */
function ifgLot(g, lat, lon) {
  const ky = 110540, kx = Math.cos(lat * Math.PI / 180) * 111320;
  const px = lon * kx, py = lat * ky;
  let best = null;
  for (let i = 1; i < g.pts.length; i++) {
    const a = g.pts[i - 1], b = g.pts[i];
    const ax = a.lon * kx, ay = a.lat * ky, dx = b.lon * kx - ax, dy = b.lat * ky - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (!best || d < best.dist) {
      // Der Weg zählt mit der Kantenlänge aus ifgLaengen, nicht mit der ebenen
      best = { dist: d, s: g.cum[i - 1] + t * (g.cum[i] - g.cum[i - 1]),
        lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
    }
  }
  return best;
}

/** Streckennummern in einem Rechteck um den Punkt, aus dem Index. */
async function ifgNummernUm(lat, lon, umkreis) {
  const ix = await ifgBereit();
  if (!ix) return null;
  const dLat = umkreis / 110540;
  const dLon = umkreis / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const nummern = new Set();
  for (let y = Math.floor((lat - dLat) / ix.raster); y <= Math.floor((lat + dLat) / ix.raster); y++) {
    for (let x = Math.floor((lon - dLon) / ix.raster); x <= Math.floor((lon + dLon) / ix.raster); x++) {
      for (const nr of ix.kacheln.get(y + '_' + x) || []) nummern.add(String(nr));
    }
  }
  return nummern;
}

/* Das Gegenrichtungsgleis ist nicht überall gleich kilometriert wie das
 * Richtungsgleis daneben. An 15 von 64053 Stellen im Rundlauf liegen beide auf
 * derselben Linie und lesen sich doch verschieden, auf Strecke 1902 bei km 5,8
 * um 1153 m. An 417 Bahnübergängen gegen OSM gemessen liegt das Richtungsgleis
 * besser (ungünstiges Hundertstel 28 m gegen 38 m). Gelesen wird deshalb am
 * Richtungsgleis bzw. an der Achse, solange die höchstens IFG_GLEIS_M weiter weg
 * liegen als das Gegengleis — so viel trennt zwei Gleise einer Strecke. Das
 * Gegengleis zählt nur, wo es allein verläuft (Überwerfung, getrennte Trasse).
 * Damit rechnen km → Lage und Lage → km am selben Gleis. */
const IFG_GLEIS_M = 8;

/** Lage → km auf allen InfraGO-Strecken in Reichweite. Je Strecke der nächste Treffer,
 *  nach Abstand sortiert. */
async function ifgTreffer(lat, lon, tol) {
  const nummern = await ifgNummernUm(lat, lon, tol);
  if (!nummern || !nummern.size) return [];
  const dLat = tol / 110540;
  const dLon = tol / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const strecken = await Promise.all([...nummern].map(ifgStrecke));
  const raus = [];
  for (const st of strecken) {
    if (!st) continue;
    let haupt = null, gegen = null;
    for (const g of st.abschnitte) {
      const [s, w, n, o] = g.bb;
      if (s > lat + dLat || n < lat - dLat || w > lon + dLon || o < lon - dLon) continue;
      const lot = ifgLot(g, lat, lon);
      if (!lot || lot.dist > tol) continue;
      if (g.ri === 2) { if (!gegen || lot.dist < gegen.lot.dist) gegen = { g, lot }; }
      else if (!haupt || lot.dist < haupt.lot.dist) haupt = { g, lot };
    }
    const best = haupt && (!gegen || haupt.lot.dist <= gegen.lot.dist + IFG_GLEIS_M) ? haupt : gegen;
    if (best) raus.push({ ref: st.nr, ...best });
  }
  return raus.sort((a, b) => a.lot.dist - b.lot.dist);
}

/** Lage → km. bevorzugt: Streckennummern, die gewinnen, solange sie höchstens
 *  kleben Meter weiter weg liegen als die nächste — beim Tippen ein paar Meter,
 *  in der laufenden Anzeige unbegrenzt, damit sie an einem Bahnhof nicht
 *  zwischen den Nummern springt. null: keine InfraGO-Strecke in Reichweite. */
async function ifgKmAn(lat, lon, tol, bevorzugt = [], kleben = 10) {
  const treffer = await ifgTreffer(lat, lon, tol);
  if (!treffer.length) return null;
  let wahl = treffer[0];
  for (const ref of bevorzugt) {
    const t = ref && treffer.find(x => x.ref === String(ref));
    if (t && t.lot.dist <= treffer[0].lot.dist + kleben) { wahl = t; break; }
  }
  const { g, lot } = wahl;
  const km = g.a + (g.b - g.a) * (lot.s / g.L);
  const daneben = treffer.filter(t => t !== wahl).slice(0, 3)
    .map(t => ({ ref: t.ref, dist: t.lot.dist }));
  return {
    ref: wahl.ref,
    punkt: ifgErgebnis(wahl.ref, g, lot.lat, lot.lon, {
      km: Math.round(km * 1e6) / 1e6, offset: lot.dist, tipp: true, daneben
    })
  };
}

/* ---------- Kartenauflage: Strecken im Ausschnitt, Anlagen ---------- */

/** Streckennummern, die das Rechteck berühren. null: zu viele (mehr als max) oder kein Index. */
async function ifgNummernImRechteck(s, w, n, o, max = 400) {
  const ix = await ifgBereit();
  if (!ix) return null;
  const nummern = new Set();
  for (let y = Math.floor(s / ix.raster); y <= Math.floor(n / ix.raster); y++) {
    for (let x = Math.floor(w / ix.raster); x <= Math.floor(o / ix.raster); x++) {
      for (const nr of ix.kacheln.get(y + '_' + x) || []) nummern.add(String(nr));
      if (nummern.size > max) return null;
    }
  }
  return nummern;
}

/* Bahnübergänge, Brücken und Tunnel je Strecke (infrago/o/), nur für die Auflage. */
const IFG_ANLAGEN_MAX = 400;
const ifgAnlagenLaeuft = new Map();
const ifgAnlagenGeladen = new Map();

/** Anlagen einer Strecke; null ohne Datei. Linien schon entschlüsselt, mit Rechteck. */
async function ifgAnlagen(nr) {
  nr = String(nr);
  if (ifgAnlagenGeladen.has(nr)) return ifgAnlagenGeladen.get(nr);
  if (ifgPause('o' + nr)) return null;
  if (!ifgAnlagenLaeuft.has(nr)) {
    ifgAnlagenLaeuft.set(nr, (async () => {
      try {
        const ix = await ifgBereit();
        if (ix && ix.anlagen && !ix.anlagen.has(nr)) { ifgAnlagenGeladen.set(nr, null); return null; }
        let r;
        try { r = await fetch(`${IFG_PFAD}o/${nr}.json`); } catch { r = null; }
        // 404 heißt: diese Strecke hat keine Anlagen — das ist eine Antwort, kein Fehlschlag
        if (r && r.status === 404) { ifgAnlagenGeladen.set(nr, null); return null; }
        if (!r || !r.ok) { ifgGescheitert.set('o' + nr, Date.now()); return null; }
        const d = await r.json();
        const linie = p => {
          const pts = ifgDekodieren(p);
          let s = 90, w = 180, n = -90, o = -180;
          for (const q of pts) { s = Math.min(s, q.lat); n = Math.max(n, q.lat); w = Math.min(w, q.lon); o = Math.max(o, q.lon); }
          return { pts, bb: [s, w, n, o] };
        };
        const a = {
          nr,
          bue: (d.u || []).map(([km, lat, lon, bez, sicherung, strasse]) => ({ km, lat, lon, bez, sicherung, strasse })),
          bruecken: (d.b || []).map(([von, bis, laenge, bez, kreuzung, p]) => ({ von, bis, laenge, bez, kreuzung, ...linie(p) })),
          tunnel: (d.t || []).map(([von, bis, laenge, bez, p]) => ({ von, bis, laenge, bez, ...linie(p) }))
        };
        ifgAnlagenGeladen.set(nr, a);
        while (ifgAnlagenGeladen.size > IFG_ANLAGEN_MAX) ifgAnlagenGeladen.delete(ifgAnlagenGeladen.keys().next().value);
        return a;
      } catch {
        return null;
      } finally {
        ifgAnlagenLaeuft.delete(nr);
      }
    })());
  }
  return ifgAnlagenLaeuft.get(nr);
}

/* ---------- Betriebsstellen ---------- */

let ifgStellenHolen = null;

/** Alle Betriebsstellen, je DS100 zusammengefasst mit den Strecken, an denen sie liegen. */
function ifgStellen() {
  if (!ifgStellenHolen) {
    ifgStellenHolen = (async () => {
      try {
        const r = await fetch(IFG_PFAD + 'bs.json');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const zeilen = await r.json();
        const nach = new Map();
        for (const [name, ds100, art, nr, km, lat, lon, zustand] of zeilen) {
          const k = ds100 || `${name}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
          let s = nach.get(k);
          if (!s) {
            s = { name, ds100, art, lat, lon, zustand, strecken: [], suche: ifgSuchform(name) };
            nach.set(k, s);
          }
          if (nr && !s.strecken.some(x => x.nr === nr)) s.strecken.push({ nr, km });
        }
        return [...nach.values()];
      } catch {
        ifgStellenHolen = null;
        return [];
      }
    })();
  }
  return ifgStellenHolen;
}

/** Vergleichsform: klein, ohne Akzente, ß als ss, Satzzeichen als Leerzeichen. */
const ifgSuchform = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Betriebsstellen zu einem Suchtext — DS100 genau, Name nach Wortanfängen. */
async function ifgStellenSuchen(text, max = 5) {
  const q = ifgSuchform(text);
  if (q.length < 2) return [];
  const ds = String(text).trim().toUpperCase();
  const woerter = q.split(' ');
  const liste = await ifgStellen();
  const bewertet = [];
  for (const s of liste) {
    let rang = 0;
    if (s.ds100 && s.ds100.toUpperCase() === ds) rang = 100;
    else if (s.suche === q) rang = 90;
    else if (s.suche.startsWith(q)) rang = 80;
    else if (woerter.every(w => (' ' + s.suche).includes(' ' + w))) rang = 60;
    else continue;
    // Was noch in Betrieb ist und Personen bedient, steht weiter oben
    if (s.zustand && s.zustand !== 'in Betrieb') rang -= 20;
    if (/^(Bahnhof|Haltepunkt)/.test(s.art)) rang += 5;
    bewertet.push([rang, s]);
  }
  bewertet.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length);
  return bewertet.slice(0, max).map(([, s]) => ifgStelleTreffer(s));
}

/** Eine Betriebsstelle in der Form, die die Suche und die untere Leiste kennen. */
const ifgStelleTreffer = s => ({
  lat: s.lat, lon: s.lon, name: s.name, kind: s.art, ds100: s.ds100, uic: '',
  operator: 'DB InfraGO', strecken: s.strecken, zustand: s.zustand, infrago: true
});

/* Für die Prüfung in Node (werkzeug/infrago-pruefen.mjs) */
if (typeof module !== 'undefined') {
  module.exports = { ifgBereit, ifgStrecke, ifgLage, ifgLageJetzt, ifgKmAn, ifgTreffer, ifgStellenSuchen,
    ifgBereich, ifgAbstand, ifgDekodieren, ifgAnlagen, ifgNummernImRechteck, ifgStellen, ifgKmPunkte, IFG_ERR };
}
