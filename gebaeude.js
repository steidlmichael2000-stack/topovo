/* Topovo — Gebäude im Profil (3D-Gebäudemodell LoD2)
 *
 * LoD2 der Bayerischen Vermessungsverwaltung, OpenData unter CC BY 4.0:
 * CityGML 1.0 in Kacheln von 2 × 2 km auf download1.bayernwolke.de, im selben
 * System wie das DGM1 (ETRS89/UTM 32, Höhen DHHN2016). Je Gebäude Grundriss
 * nach ALKIS, Dachflächen als ebene 3D-Polygone, Höhe, Dachform, Funktion,
 * teils die Adresse. Firste und Traufen auf 20–30 cm genau, komplexe Dächer
 * vereinzelt über 1 m daneben.
 *
 * Am 10.10.2026 nachgemessen: Kacheln im Landkreis Bamberg im Median 3,7 MB,
 * bei 90 % höchstens 17,6 MB, die größte 50,5 MB — das XML packt sich aber auf
 * ein Sechzehntel (16,7 MB → 1,05 MB). Der Worker liefert es deshalb gepackt
 * aus. Gelesen wird Stück für Stück, wie es ankommt; behalten wird je Gebäude
 * nur, was das Profil braucht (Dachflächen, Bodenhöhe, Angaben), und das liegt
 * danach in IndexedDB — rund ein Zehntel der Datei.
 *
 * Kein CORS auf dem Server der BVV, deshalb wie DGM und DOM über den Worker.
 *
 * Seit 13.10.2026 auch Baden-Württemberg: LoD2 des LGL, Datenlizenz
 * Deutschland – Namensnennung 2.0. Dasselbe CityGML-1.0-Profil der AdV, nur
 * in Dateien zu 1 km, je vier in einem ZIP zu 2 × 2 km (siehe LGL_PRODUKTE in
 * hoehen.js), und die Adresse unter xal: statt xAL:. HoeheGrund fehlt dort;
 * gebraucht wird sie nur beim Prüfen — im Profil steht der Boden auf dem DGM.
 * Am 13.10.2026 bei Stuttgart: 494 Gebäude, 17,6 MB Text, 2,1 MB gepackt,
 * 0,5 MB im Vorrat.
 */

const LOD2_KACHEL = 2000;                 // m
const LOD2_MERK_MAX = 6;                  // Kacheln im Speicher
const gebKacheln = new Map();             // 'E_N' → Versprechen der Gebäudeliste

/* Gebäudefunktion nach ALKIS (31001_xxxx), nur die häufigen und eindeutigen;
 * sonst die Gruppe nach der ersten Ziffer. */
const LOD2_FUNKTION = {
  1000: 'Wohngebäude', 1010: 'Wohnhaus', 1020: 'Wohnheim', 1100: 'Wohn- und Geschäftshaus',
  1120: 'Wohn- und Geschäftshaus', 1130: 'Wohn- und Betriebsgebäude', 1210: 'Bauernhaus',
  1220: 'Wohn- und Wirtschaftsgebäude', 1312: 'Wochenendhaus', 1313: 'Gartenhaus',
  2000: 'Gewerbegebäude', 2010: 'Geschäftsgebäude', 2020: 'Bürogebäude', 2050: 'Geschäftsgebäude',
  2071: 'Hotel', 2081: 'Gaststätte', 2100: 'Gewerbe- und Industriegebäude', 2110: 'Produktionsgebäude',
  2111: 'Fabrik', 2112: 'Betriebsgebäude', 2120: 'Werkstatt', 2143: 'Lagerhalle',
  2420: 'Bahnbetriebsgebäude', 2421: 'Bahnwärterhaus', 2422: 'Lokschuppen', 2423: 'Stellwerk',
  2461: 'Parkhaus', 2463: 'Garage', 2464: 'Fahrzeughalle', 2513: 'Wasserbehälter',
  2520: 'Energieversorgung', 2523: 'Umspannwerk', 2721: 'Scheune', 2723: 'Schuppen', 2724: 'Stall',
  2726: 'Scheune und Stall', 2740: 'Gewächshaus', 3010: 'Verwaltungsgebäude', 3021: 'Schule',
  3041: 'Kirche', 3051: 'Krankenhaus', 3072: 'Feuerwehr', 3091: 'Bahnhofsgebäude', 3211: 'Sporthalle'
};
const LOD2_GRUPPE = { 1: 'Wohngebäude', 2: 'Wirtschaftsgebäude', 3: 'Öffentliches Gebäude' };
/* Dachformen der AdV */
const LOD2_DACH = {
  1000: 'Flachdach', 2100: 'Pultdach', 2200: 'versetztes Pultdach', 3100: 'Satteldach',
  3200: 'Walmdach', 3300: 'Krüppelwalmdach', 3400: 'Mansarddach', 3500: 'Zeltdach',
  3600: 'Kegeldach', 3700: 'Kuppeldach', 3800: 'Sheddach', 3900: 'Bogendach', 4000: 'Turmdach',
  5000: 'Mischform'
};

function gebFunktion(code) {
  const m = /^(\d+)_(\d+)$/.exec(code || '');
  if (!m) return 'Gebäude';
  if (m[1] !== '31001') return 'Bauwerk';
  return LOD2_FUNKTION[+m[2]] || LOD2_GRUPPE[m[2][0]] || 'Gebäude';
}
const gebDach = code => LOD2_DACH[+code] || '';

function gebAdresseUrl(e, n) {
  return HOEHEN.direkt ? `${BVV_DOWNLOAD}/lod2/citygml/${e}_${n}.gml` : `${HOEHEN.proxy}/lod2/${e}_${n}.gml`;
}

/** Ein Gebäude aus seinem cityObjectMember. Nur Dachflächen werden behalten:
 *  Die Wände stehen senkrecht unter den Dachkanten, der Boden ist die Höhe
 *  HoeheGrund. Koordinaten auf cm gerundet. */
function gebLesen(xml) {
  const roh = (re) => { const m = re.exec(xml); return m ? m[1].trim() : ''; };
  const attr = name => roh(new RegExp(`name="${name}">\\s*<gen:value>([^<]*)<`));
  const daecher = [];
  const reDach = /<bldg:RoofSurface[\s\S]*?<\/bldg:RoofSurface>/g;
  let m;
  while ((m = reDach.exec(xml))) {
    // Nur die Außenringe; Löcher im Dach kommen im LoD2 praktisch nicht vor
    const reAussen = /<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/g;
    let r;
    while ((r = reAussen.exec(m[0]))) {
      const z = r[1].trim().split(/\s+/).map(Number);
      const p = [], h = [];
      for (let i = 0; i + 2 < z.length; i += 3) { p.push(Math.round(z[i] * 100) / 100, Math.round(z[i + 1] * 100) / 100); h.push(Math.round(z[i + 2] * 100) / 100); }
      if (h.length >= 3) daecher.push({ p, h });
    }
  }
  if (!daecher.length) return null;
  let e0 = Infinity, n0 = Infinity, e1 = -Infinity, n1 = -Infinity;
  for (const d of daecher) for (let i = 0; i < d.p.length; i += 2) {
    e0 = Math.min(e0, d.p[i]); e1 = Math.max(e1, d.p[i]); n0 = Math.min(n0, d.p[i + 1]); n1 = Math.max(n1, d.p[i + 1]);
  }
  // Bayern schreibt xAL:, Baden-Württemberg xal:
  const strasse = roh(/<xal:ThoroughfareName>([^<]*)</i);
  // BW schreibt mehrere Nummern mit Komma und füllt fehlende mit „null" („6, null")
  const nummer = roh(/<xal:ThoroughfareNumber>([^<]*)</i).split(',').map(s => s.trim())
    .filter(s => s && s.toLowerCase() !== 'null').join(', ');
  return {
    id: roh(/<bldg:Building[^>]*gml:id="([^"]+)"/),
    fn: roh(/<bldg:function>([^<]+)</), dach: roh(/<bldg:roofType>([^<]+)</),
    h: parseFloat(roh(/<bldg:measuredHeight[^>]*>([^<]+)</)) || null,
    gr: parseFloat(attr('HoeheGrund')) || null,
    adr: strasse ? `${strasse}${nummer ? ' ' + nummer : ''}` : '',
    bb: [e0, n0, e1, n1], d: daecher
  };
}

/** Den Text einer Kachel Stück für Stück zerlegen, Gebäude für Gebäude. */
async function gebStromLesen(antwort) {
  const leser = antwort.body.pipeThrough(new TextDecoderStream()).getReader();
  const ende = /<\/(?:core:)?cityObjectMember>/g;
  const raus = [];
  let puffer = '';
  for (;;) {
    const { value, done } = await leser.read();
    if (value) puffer += value;
    let start = 0, m;
    ende.lastIndex = 0;
    while ((m = ende.exec(puffer))) {
      const b = gebLesen(puffer.slice(start, m.index));
      if (b) raus.push(b);
      start = m.index + m[0].length;
    }
    puffer = puffer.slice(start);
    if (done) break;
  }
  return raus;
}

/** Alle Gebäude einer Kachel. Bayern: 2 km, Südwestecke e, n in km, gerade
 *  Zahlen. BW (land 'bw'): 1 km aus dem ZIP des LGL. */
function gebaeudeKachel(e, n, land = 'by') {
  const s = land === 'bw' ? `bw/${e}_${n}` : `${e}_${n}`;
  if (hoehenFehlen.has(`lod2/${s}`)) return Promise.resolve([]);
  const da = gebKacheln.get(s);
  if (da) { gebKacheln.delete(s); gebKacheln.set(s, da); return da; }
  const laden = (async () => {
    const vorrat = await vorratLesen(`lod2/${s}`);
    if (vorrat) return JSON.parse(new TextDecoder().decode(vorrat));
    let liste;
    if (land === 'bw') {
      const datei = await lglDatei('lod2', e, n);
      if (!datei) { hoehenFehlen.add(`lod2/${s}`); return []; }
      liste = await gebStromLesen(new Response(datei.daten));
    } else {
      const r = await fetch(gebAdresseUrl(e, n));
      if (r.status === 404) { hoehenFehlen.add(`lod2/${s}`); return []; }   // keine Kachel: außerhalb Bayerns
      if (!r.ok) throw new Error(`Gebäude: HTTP ${r.status}`);
      liste = await gebStromLesen(r);
      HOEHEN.geladen += Number(r.headers.get('content-length')) || 0;
    }
    vorratSchreiben(`lod2/${s}`, new TextEncoder().encode(JSON.stringify(liste)));
    return liste;
  })();
  gebKacheln.set(s, laden);
  laden.catch(() => gebKacheln.delete(s));
  while (gebKacheln.size > LOD2_MERK_MAX) gebKacheln.delete(gebKacheln.keys().next().value);
  return laden;
}

/** Welche Kacheln berührt der Linienzug ([[lat, lon], …])? [[e, n, land], …] —
 *  in Bayern zu 2 km, in BW zu 1 km, je nachdem, in wessen Rahmen die Stelle
 *  liegt (an der Grenze beide). */
function gebKachelnFuer(punkte) {
  const satz = new Map();
  const utm = punkte.map(p => utm32Hin(p[0], p[1]));
  for (let i = 1; i < utm.length; i++) {
    const [a, b] = [utm[i - 1], utm[i]];
    const schritte = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 200));
    for (let j = 0; j <= schritte; j++) {
      const e = a[0] + (b[0] - a[0]) * j / schritte, n = a[1] + (b[1] - a[1]) * j / schritte;
      const [lat, lon] = utm32Zurueck(e, n);
      // 5 m Rand: ein Gebäude an der Kachelgrenze steht ganz in einer der beiden Dateien
      for (const de of [-5, 5]) for (const dn of [-5, 5]) {
        if (inLandRahmen('by', lat, lon)) {
          const ke = Math.floor((e + de) / LOD2_KACHEL) * 2, kn = Math.floor((n + dn) / LOD2_KACHEL) * 2;
          satz.set(`${ke}_${kn}`, [ke, kn, 'by']);
        }
        if (inLandRahmen('bw', lat, lon)) {
          const ke = Math.floor((e + de) / 1000), kn = Math.floor((n + dn) / 1000);
          satz.set(`bw/${ke}_${kn}`, [ke, kn, 'bw']);
        }
      }
    }
  }
  return [...satz.values()];
}

/** Ebene durch ein Dachpolygon: z = a·x + b·y + c (x, y relativ zum ersten Punkt). */
function gebEbene(d) {
  const x0 = d.p[0], y0 = d.p[1], n = d.h.length;
  let nx = 0, ny = 0, nz = 0, zm = 0, xm = 0, ym = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = d.p[2 * i] - x0, yi = d.p[2 * i + 1] - y0, zi = d.h[i];
    const xj = d.p[2 * j] - x0, yj = d.p[2 * j + 1] - y0, zj = d.h[j];
    nx += (yi - yj) * (zi + zj); ny += (zi - zj) * (xi + xj); nz += (xi - xj) * (yi + yj);   // Newell
    xm += xi; ym += yi; zm += zi;
  }
  xm /= n; ym /= n; zm /= n;
  if (Math.abs(nz) < 1e-9) return null;                // senkrecht: keine Dachfläche im Schnitt
  const a = -nx / nz, b = -ny / nz;
  return { x0, y0, a, b, c: zm - a * xm - b * ym };
}

/** Wo läuft die Strecke P→Q (t von 0 bis 1) durch das Polygon? Liefert [t0, t1]-Paare. */
function gebDurchlauf(px, py, qx, qy, p) {
  const ts = [0, 1], n = p.length / 2;
  const dx = qx - px, dy = qy - py;
  for (let i = 0; i < n; i++) {
    const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * ((i + 1) % n)], by = p[2 * ((i + 1) % n) + 1];
    const ex = bx - ax, ey = by - ay, nenner = dx * ey - dy * ex;
    if (Math.abs(nenner) < 1e-12) continue;
    const t = ((ax - px) * ey - (ay - py) * ex) / nenner, u = ((ax - px) * dy - (ay - py) * dx) / nenner;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const innen = (x, y) => {
    let drin = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) drin = !drin;
    }
    return drin;
  };
  const raus = [];
  for (let i = 1; i < ts.length; i++) {
    const t0 = ts[i - 1], t1 = ts[i];
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (innen(px + dx * tm, py + dy * tm)) {
      if (raus.length && Math.abs(raus[raus.length - 1][1] - t0) < 1e-9) raus[raus.length - 1][1] = t1;
      else raus.push([t0, t1]);
    }
  }
  return raus;
}

/** Linear im Profil (station aufsteigend) abgreifen. */
function gebBoden(dgm, s) {
  const st = dgm.station;
  let lo = 0, hi = st.length - 1;
  if (s <= st[0]) return dgm.hoehe[0];
  if (s >= st[hi]) return dgm.hoehe[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (st[m] <= s) lo = m; else hi = m; }
  const a = dgm.hoehe[lo], b = dgm.hoehe[hi];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(a) ? a : b;
  return a + (s - st[lo]) / (st[hi] - st[lo]) * (b - a);
}

/* Die Gebäude, die der Linienzug schneidet, als Umrisse in Station und Höhe.
 * Je Dachfläche das Stück der Linie darin, die Höhe an beiden Enden aus der
 * Ebene der Fläche; aus allen Stücken eines Gebäudes die obere Hülle, unten
 * entlang des Geländes geschlossen. Die Station kommt aus dgm.ecken, damit sie
 * zur Station des Geländeprofils passt (dort ellipsoidisch gemessen). */
async function gebaeudeImSchnitt(punkte, dgm) {
  const kacheln = await Promise.all(gebKachelnFuer(punkte).map(([e, n, land]) => gebaeudeKachel(e, n, land)));
  const utm = punkte.map(p => utm32Hin(p[0], p[1]));
  const stuecke = new Map();               // Gebäude → [{ s0, z0, s1, z1 }]
  const gesehen = new Set();
  for (const liste of kacheln) for (const b of liste) {
    if (gesehen.has(b.id)) continue;       // steht an der Kachelgrenze womöglich in beiden Dateien
    for (let i = 1; i < utm.length; i++) {
      const [px, py] = utm[i - 1], [qx, qy] = utm[i];
      if (Math.max(px, qx) < b.bb[0] - 1 || Math.min(px, qx) > b.bb[2] + 1 ||
          Math.max(py, qy) < b.bb[1] - 1 || Math.min(py, qy) > b.bb[3] + 1) continue;
      const sA = dgm.ecken[i - 1], sL = dgm.ecken[i] - sA;
      for (const d of b.d) {
        const ebene = gebEbene(d);
        if (!ebene) continue;
        const z = (x, y) => ebene.a * (x - ebene.x0) + ebene.b * (y - ebene.y0) + ebene.c;
        for (const [t0, t1] of gebDurchlauf(px, py, qx, qy, d.p)) {
          if (!stuecke.has(b)) stuecke.set(b, []);
          stuecke.get(b).push({
            s0: sA + t0 * sL, z0: z(px + (qx - px) * t0, py + (qy - py) * t0),
            s1: sA + t1 * sL, z1: z(px + (qx - px) * t1, py + (qy - py) * t1)
          });
        }
      }
    }
    if (stuecke.has(b)) gesehen.add(b.id);
  }

  const raus = [];
  for (const [b, st] of stuecke) {
    // Obere Hülle über alle Knickstellen; Lücken über 0,3 m teilen das Gebäude
    const knick = [...new Set(st.flatMap(x => [x.s0, x.s1]))].sort((a, c) => a - c);
    const zBei = (x, s) => x.z0 + (x.z1 - x.z0) * (x.s1 > x.s0 ? (s - x.s0) / (x.s1 - x.s0) : 0);
    let block = null;
    const fertig = () => {
      if (!block) return;
      const { s0, s1, dach } = block;
      const boden = [];
      for (let s = s1; s > s0; s -= Math.max(0.5, (s1 - s0) / 40)) boden.push([s, gebBoden(dgm, s)]);
      raus.push({ s0, s1, dach, umriss: [[s0, gebBoden(dgm, s0)], ...dach, [s1, gebBoden(dgm, s1)], ...boden],
        id: b.id, fn: gebFunktion(b.fn), dachform: gebDach(b.dach), hoehe: b.h, adr: b.adr,
        first: Math.max(...dach.map(p => p[1])) });
      block = null;
    };
    for (let k = 1; k < knick.length; k++) {
      const a = knick[k - 1], c = knick[k], mitte = (a + c) / 2;
      const ueber = st.filter(x => x.s0 <= mitte && x.s1 >= mitte);
      if (!ueber.length) { if (c - a > 0.3) fertig(); continue; }
      const oben = ueber.reduce((m, x) => zBei(x, mitte) > zBei(m, mitte) ? x : m);
      if (!block) block = { s0: a, s1: c, dach: [] };
      block.dach.push([a, zBei(oben, a)], [c, zBei(oben, c)]);
      block.s1 = c;
    }
    fertig();
  }
  return raus.sort((a, c) => a.s0 - c.s0);
}

// Für die Prüfung unter Node; im Browser ohne Wirkung
if (typeof module === 'object' && module.exports) {
  module.exports = { gebLesen, gebStromLesen, gebaeudeKachel, gebKachelnFuer, gebaeudeImSchnitt, gebFunktion, gebDach, gebEbene, gebDurchlauf };
}
