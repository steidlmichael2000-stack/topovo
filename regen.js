/* Topovo — Regen auf dem Laserboden (Laseransicht, nur am Rechner)
 *
 * Aus den Bodenpunkten ein Höhenraster (0,5 m, bei großen Ausschnitten
 * gröber, höchstens 500 Zellen je Seite), Gebäude als Hindernis obendrauf.
 * Darauf regnet es, und das Wasser läuft nach dem Röhrenmodell (Mei, Decaudin,
 * Hu 2007: „Fast Hydraulic Erosion Simulation and Visualization on GPU“) ab:
 * Zwischen je zwei Nachbarzellen liegt eine gedachte Röhre, deren Durchfluss
 * der Unterschied der Wasserspiegel antreibt. Gerechnet auf der Grafikkarte in
 * zwei Durchgängen je Schritt (Durchfluss, dann Wassertiefe), Bild um Bild hin
 * und her zwischen zwei Zielen.
 *
 * Was das Modell nicht kennt: Durchlässe und Rohre unter Dämmen und Wegen
 * (fehlen auch in der Laserwolke), Kanalisation, Bewuchs. Versickerung ist
 * eine feste Rate je Stunde, kein Bodenmodell.
 *
 * Koordinaten wie in laser.js: x Osten, y Norden relativ zur Mitte, z über
 * dem tiefsten Punkt.
 */
import * as THREE from './vendor/three/three.module.js';

const G = 9.81;
const BODEN = new Set([2, 9, 23, 24]);
const GEBAEUDE = 6;
const TROCKEN = 0.003;          // m — darunter gilt eine Zelle als trocken (Rauschen der Punkte)
const PFUETZE = 0.02;           // m — ab hier zählt Wasser als „steht“


const VOLL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* Durchfluss: je Zelle vier Röhren (links, rechts, unten, oben) als RGBA.
 * Jenseits des Rasters liegt Gelände auf Höhe der Randzelle ohne Wasser —
 * dort fließt Wasser ab und ist aus dem Ausschnitt verschwunden.
 * Reibung nach Manning, halb implizit: Ohne sie schießt eine dünne
 * Wasserhaut reibungsfrei den Hang hinab, und in 10 min war der halbe Regen
 * aus dem Ausschnitt. n (s/m^⅓) um 0,05 für Acker und Wiese. */
const FLUSS_FS = `
  precision highp float;
  uniform highp sampler2D H, W, F;
  uniform float dt, l, manning;
  uniform int m;
  const float G = ${G.toFixed(2)};
  vec2 nachbar(ivec2 p, float rand) {
    if (p.x < 0 || p.y < 0 || p.x >= m || p.y >= m) return vec2(rand, 0.0);
    float w = texelFetch(W, p, 0).r;
    return vec2(texelFetch(H, p, 0).r + w, w);
  }
  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float h = texelFetch(H, p, 0).r, w = texelFetch(W, p, 0).r, s = h + w;
    vec4 f = texelFetch(F, p, 0);
    vec2 nl = nachbar(p + ivec2(-1, 0), h), nr = nachbar(p + ivec2(1, 0), h),
         nu = nachbar(p + ivec2(0, -1), h), no = nachbar(p + ivec2(0, 1), h);
    vec4 spiegel = vec4(nl.x, nr.x, nu.x, no.x);
    // Wassertiefe in der Röhre: Mittel beider Zellen, nie ganz null
    vec4 tiefe = max(vec4(0.5 * w) + 0.5 * vec4(nl.y, nr.y, nu.y, no.y), vec4(0.001));
    vec4 v = f / (l * tiefe);
    vec4 reibung = vec4(1.0) + dt * G * manning * manning * abs(v) / pow(tiefe, vec4(4.0 / 3.0));
    f = max(vec4(0.0), (f + dt * G * l * (vec4(s) - spiegel)) / reibung);
    float raus = (f.x + f.y + f.z + f.w) * dt;
    // Nicht mehr hinaus, als in der Zelle steht
    if (raus > 0.0) f *= min(1.0, w * l * l / raus);
    gl_FragColor = f;
  }`;

/* Wassertiefe: r Tiefe (m), g Durchfluss je Meter Breite (m²/s, fürs Bild),
 * b versickert seit Beginn (m), a gefallen seit Beginn (m). */
const WASSER_FS = `
  precision highp float;
  uniform highp sampler2D W, F, maske;
  uniform float dt, l, regen, versickern;
  uniform int m;
  vec4 fl(ivec2 p) {
    if (p.x < 0 || p.y < 0 || p.x >= m || p.y >= m) return vec4(0.0);
    return texelFetch(F, p, 0);
  }
  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 alt = texelFetch(W, p, 0), f = texelFetch(F, p, 0);
    float rein = fl(p + ivec2(-1, 0)).y + fl(p + ivec2(1, 0)).x + fl(p + ivec2(0, -1)).w + fl(p + ivec2(0, 1)).z;
    float raus = f.x + f.y + f.z + f.w;
    float auf = regen * texelFetch(maske, p, 0).r;
    float w = max(0.0, alt.r + dt * (rein - raus) / (l * l) + auf);
    float weg = min(w, versickern);
    gl_FragColor = vec4(w - weg, 0.5 * (rein + raus) / l, alt.b + weg, alt.a + auf);
  }`;

/* Wasserfläche: ein Gitter mit einem Eckpunkt je Zelle, Höhe aus Gelände und
 * Tiefe. Trockene Ecken sinken unter den Boden, ihre Dreiecke fallen weg.
 * Verdeckt von Hand gegen die Tiefe der Punkte wie die Gebäude (GEB_FS). */
const FLAECHE_VS = `
  uniform highp sampler2D H, W;
  uniform int m;
  varying float vTiefe, vFluss;
  void main() {
    ivec2 t = ivec2(clamp(floor(uv * float(m - 1) + 0.5), vec2(0.0), vec2(float(m - 1))));
    float h = texelFetch(H, t, 0).r;
    vec4 w = texelFetch(W, t, 0);
    vTiefe = w.r; vFluss = w.g;
    /* Trockene Ecke: auf den niedrigsten nassen Wasserspiegel daneben, sonst
     * knapp unter den Boden. Lag sie auf ihrem eigenen Gelände, zog sich das
     * Wasser an jeder Hauswand bis zum Dach hoch. */
    float z = h + w.r;
    if (w.r < ${TROCKEN}) {
      z = h - 0.05;
      for (int k = 0; k < 4; k++) {
        ivec2 q = clamp(t + ivec2(k == 0 ? -1 : k == 1 ? 1 : 0, k == 2 ? -1 : k == 3 ? 1 : 0), ivec2(0), ivec2(m - 1));
        float wq = texelFetch(W, q, 0).r;
        if (wq >= ${TROCKEN}) z = min(z, texelFetch(H, q, 0).r + wq);
      }
    }
    vec3 p = vec3(position.xy, z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FLAECHE_FS = `
  precision highp float;
  uniform highp sampler2D tiefe;
  uniform float nah, fern, ortho;
  varying float vTiefe, vFluss;
  float linear(float d) { return ortho > 0.5 ? nah + d * (fern - nah) : nah * fern / (fern - d * (fern - nah)); }
  void main() {
    if (vTiefe < ${TROCKEN}) discard;
    float t = texelFetch(tiefe, ivec2(gl_FragCoord.xy), 0).r;
    if (t < 1.0 && linear(gl_FragCoord.z) > linear(t) + 0.3) discard;
    // Flach hellblau, tief kräftig blau; wo es fließt, heller
    vec3 c = mix(vec3(0.30, 0.72, 1.0), vec3(0.02, 0.22, 0.80), smoothstep(0.02, 0.4, vTiefe));
    c = mix(c, vec3(0.80, 0.95, 1.0), clamp(vFluss * 10.0, 0.0, 0.35));
    gl_FragColor = vec4(c, 0.6 + 0.35 * smoothstep(${TROCKEN}, 0.06, vTiefe));
  }`;

/* Geländemodell: genau das Raster, auf dem das Wasser läuft, als Fläche.
 * Grau geschummert (wie „Normalen“ in der Punktansicht), Gebäude als
 * Hindernis rötlich, aus den Nachbarn aufgefüllte Zellen (unter Bäumen,
 * Häusern, Brücken — dort gab es keinen Bodenpunkt) dunkler — nicht bläulich, das ist dem Wasser vorbehalten.
 * Die Schummerung aus den Ableitungen der Weltlage: so rechnet die
 * Überhöhung von selbst mit. Gezeichnet in die Szene der Punkte, damit
 * Kantenschattierung und Verdeckung des Wassers wie bei den Punkten gehen. */
const GELAENDE_VS = `
  uniform highp sampler2D H;
  uniform int m;
  uniform float seite;
  varying vec3 vWelt;
  varying float vArt;
  varying vec2 vBild;
  void main() {
    // Luftbild: deckt den Ausschnitt genau, unten links = Südwestecke
    vBild = position.xy / seite + 0.5;
    ivec2 t = ivec2(clamp(floor(uv * float(m - 1) + 0.5), vec2(0.0), vec2(float(m - 1))));
    vec2 h = texelFetch(H, t, 0).rg;
    vArt = h.g;
    vec4 welt = modelMatrix * vec4(position.xy, h.r, 1.0);
    vWelt = welt.xyz;
    gl_Position = projectionMatrix * viewMatrix * welt;
  }`;
const GELAENDE_FS = `
  precision highp float;
  uniform vec3 lichtRichtung;
  uniform sampler2D bild;
  uniform float mitBild;
  varying vec3 vWelt;
  varying float vArt;
  varying vec2 vBild;
  void main() {
    vec3 n = normalize(cross(dFdx(vWelt), dFdy(vWelt)));
    if (n.z < 0.0) n = -n;
    float licht = max(0.0, dot(n, normalize(lichtRichtung)));
    if (mitBild > 0.5) {
      // Luftbild unverändert (sRGB wie die Punktfarben), nur leicht geschummert
      gl_FragColor = vec4(texture2D(bild, vBild).rgb * (0.55 + 0.5 * licht), 1.0);
      return;
    }
    float hell = 0.25 + 0.75 * licht;
    vec3 grund = vArt > 0.75 ? vec3(0.80, 0.42, 0.36) : vArt > 0.25 ? vec3(0.62, 0.59, 0.54) : vec3(0.86, 0.85, 0.82);
    gl_FragColor = vec4(grund * hell, 1.0);
  }`;

/** Höhenraster aus den Punkten: Boden gemittelt, Lücken aus den Nachbarn
 *  gefüllt, einmal geglättet, Gebäude obendrauf.
 *  gebaeude: null (weglassen), 'punkte' (Dachpunkte, Klasse 6) oder eine Liste
 *  { ringe: [[x, y, …]], top } aus dem LoD2 in Ansichtskoordinaten. Das LoD2
 *  ist der bessere Weg: Die Dachpunkte liegen lückenhaft (nicht jede Zelle
 *  trifft einer), und durch jede Lücke lief das Wasser ins Haus. */
function rasterBauen(d, seite, gebaeude) {
  const halb = seite / 2;
  /* Höchstens 500 Zellen je Seite: Auf einer Intel-Grafik (UHD, Tiger Lake) schaffte
   * 0,5 m auf 400 m nur rund 23-fache Zeitraffung; 0,8 m ist etwa viermal so schnell. */
  const res = Math.max(0.5, seite / 500), m = Math.ceil(seite / res);
  const summe = new Float64Array(m * m), zahl = new Uint32Array(m * m), dach = new Float32Array(m * m).fill(-Infinity);
  const n = d.anzahl;
  for (let i = 0; i < n; i++) {
    const k = d.klasse[i];
    if (!BODEN.has(k) && !(gebaeude === 'punkte' && k === GEBAEUDE)) continue;
    const cx = Math.floor((d.xyz[3 * i] + halb) / res), cy = Math.floor((d.xyz[3 * i + 1] + halb) / res);
    if (cx < 0 || cy < 0 || cx >= m || cy >= m) continue;
    const c = cy * m + cx, z = d.xyz[3 * i + 2];
    if (k === GEBAEUDE) { if (z > dach[c]) dach[c] = z; } else { summe[c] += z; zahl[c]++; }
  }
  let z = new Float32Array(m * m).fill(NaN);
  let offen = [];
  for (let c = 0; c < m * m; c++) { if (zahl[c]) z[c] = summe[c] / zahl[c]; else offen.push(c); }
  if (offen.length === m * m) return null;
  /* Herkunft je Zelle: 0 gemessener Boden, 0,5 aufgefüllt, 1 Gebäude.
   * Als aufgefüllt zählt erst, was ab der zweiten Runde gefüllt wird — einzelne
   * leere Zellen zwischen Bodenpunkten (im Wald fast jede zweite) sind nur die
   * Punktdichte, keine Lücke; das Modell war sonst über und über gesprenkelt. */
  const art = new Float32Array(m * m);
  /* Lücken (unter Häusern, dichtem Wald, Brücken) Runde um Runde aus den
   * belegten Nachbarn — bis alles voll ist. Brücken liegen so nicht im Weg. */
  for (let runde = 0; offen.length && runde < 2000; runde++) {
    const rest = [], neu = [];
    for (const c of offen) {
      const x = c % m, y = (c / m) | 0;
      let s = 0, a = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= m || yy >= m) continue;
        const v = z[yy * m + xx];
        if (!Number.isNaN(v)) { s += v; a++; }
      }
      if (a >= (runde > 50 ? 1 : 3)) neu.push(c, s / a); else rest.push(c);
    }
    for (let j = 0; j < neu.length; j += 2) { z[neu[j]] = neu[j + 1]; if (runde > 0) art[neu[j]] = 0.5; }
    offen = rest;
  }
  /* Einmal 3 × 3 glätten: Das Rauschen der Bodenpunkte (2–3 cm) gäbe sonst
   * überall winzige Mulden, die sich wie Pfützen füllen. */
  const glatt = z.slice();
  for (let y = 1; y < m - 1; y++) for (let x = 1; x < m - 1; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += z[(y + dy) * m + x + dx];
    glatt[y * m + x] = s / 9;
  }
  z = glatt;
  let anzahl = 0;
  if (Array.isArray(gebaeude)) {
    /* LoD2: jede Zelle, deren Mitte in einer Dachfläche (Grundriss) liegt,
     * wird bis zum First aufgefüllt — die Höhe ist nur ein Klotz, das Wasser
     * kommt da nicht hinauf. */
    for (const b of gebaeude) {
      let drin = false;
      for (const ring of b.ringe) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const ecken = [];
        for (let i = 0; i < ring.length; i += 2) {
          ecken.push({ x: ring[i], y: ring[i + 1] });
          x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]); y0 = Math.min(y0, ring[i + 1]); y1 = Math.max(y1, ring[i + 1]);
        }
        const cx0 = Math.max(0, Math.floor((x0 + halb) / res)), cx1 = Math.min(m - 1, Math.floor((x1 + halb) / res));
        const cy0 = Math.max(0, Math.floor((y0 + halb) / res)), cy1 = Math.min(m - 1, Math.floor((y1 + halb) / res));
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          if (!innen(-halb + (cx + 0.5) * res, -halb + (cy + 0.5) * res, ecken)) continue;
          const c = cy * m + cx;
          z[c] = Math.max(z[c], b.top);
          art[c] = 1;
          drin = true;
        }
      }
      if (drin) anzahl++;
    }
  } else {
    /* Rückfall Dachpunkte: höchster Punkt, aber nur, wo er mindestens 0,5 m über
     * dem Boden liegt — einzelne Gebäudepunkte an Mauerfüßen stauen so kein Wasser. */
    for (let c = 0; c < m * m; c++) if (dach[c] > z[c] + 0.5) { z[c] = dach[c]; art[c] = 1; anzahl++; }
  }
  return { z, art, m, res, halb, gebaeude: anzahl };
}

/** Zelle innerhalb des Vielecks (x, y in m)? Gerade/ungerade-Regel. */
function innen(px, py, ecken) {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/**
 * Legt die Simulation an. renderer: der der Laseransicht; tiefeUniforms:
 * { tiefe, nah, fern, ortho } aus EDL (dieselben Objekte, damit sie mitlaufen).
 * Gibt null zurück, wenn die Grafikkarte nicht in Gleitkommazahlen zeichnen
 * kann oder kein Boden da ist.
 */
export function regenAnlegen({ renderer, d, seite, tiefeUniforms, lichtRichtung, gebaeude = null }) {
  if (!renderer.extensions.get('EXT_color_buffer_float')) return { fehler: 'Die Grafikkarte kann hier nicht in Gleitkommazahlen rechnen.' };
  const r = rasterBauen(d, seite, gebaeude);
  if (!r) return { fehler: 'In diesem Ausschnitt gibt es keine Bodenpunkte.' };
  const { m, res, halb } = r;

  // r Höhe, g Herkunft (fürs Geländemodell); die Rechnung liest nur r
  const hDaten = new Float32Array(m * m * 2);
  for (let c = 0; c < m * m; c++) { hDaten[2 * c] = r.z[c]; hDaten[2 * c + 1] = r.art[c]; }
  const hTex = new THREE.DataTexture(hDaten, m, m, THREE.RGFormat, THREE.FloatType);
  hTex.needsUpdate = true;
  const maskeDaten = new Float32Array(m * m).fill(1);
  const maskeTex = new THREE.DataTexture(maskeDaten, m, m, THREE.RedFormat, THREE.FloatType);
  maskeTex.needsUpdate = true;
  const ziel = () => new THREE.WebGLRenderTarget(m, m, {
    type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false, stencilBuffer: false
  });
  let fA = ziel(), fB = ziel(), wA = ziel(), wB = ziel();

  const dt = 0.2 * res;               // s — sicher unter der Grenze für 1 m tiefes Wasser
  const flussMat = new THREE.ShaderMaterial({
    vertexShader: VOLL_VS, fragmentShader: FLUSS_FS, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: { H: { value: hTex }, W: { value: null }, F: { value: null }, dt: { value: dt }, l: { value: res },
      manning: { value: 0.05 }, m: { value: m } }
  });
  const wasserMat = new THREE.ShaderMaterial({
    vertexShader: VOLL_VS, fragmentShader: WASSER_FS, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: { W: { value: null }, F: { value: null }, maske: { value: maskeTex }, dt: { value: dt }, l: { value: res },
      regen: { value: 0 }, versickern: { value: 0 }, m: { value: m } }
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flussMat);
  const quadSzene = new THREE.Scene();
  quadSzene.add(quad);
  const quadKamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Wasserfläche: Eckpunkte in den Zellmitten
  const breite = (m - 1) * res;
  const flaecheGeo = new THREE.PlaneGeometry(breite, breite, m - 1, m - 1);
  flaecheGeo.translate(-halb + res / 2 + breite / 2, -halb + res / 2 + breite / 2, 0);
  const flaecheMat = new THREE.ShaderMaterial({
    vertexShader: FLAECHE_VS, fragmentShader: FLAECHE_FS, transparent: true, depthWrite: true, side: THREE.DoubleSide,
    uniforms: { H: { value: hTex }, W: { value: wA.texture }, m: { value: m }, ...tiefeUniforms }
  });
  const flaeche = new THREE.Mesh(flaecheGeo, flaecheMat);
  flaeche.frustumCulled = false;
  const szene = new THREE.Scene();
  szene.add(flaeche);

  // Geländemodell (laser.js hängt es in die Szene der Punkte, anfangs aus)
  const gelaendeMat = new THREE.ShaderMaterial({
    vertexShader: GELAENDE_VS, fragmentShader: GELAENDE_FS,
    uniforms: { H: { value: hTex }, m: { value: m }, lichtRichtung, seite: { value: seite },
      bild: { value: null }, mitBild: { value: 0 } }
  });
  let bildTex = null;
  /** Luftbild auf das Geländemodell (Canvas über den ganzen Ausschnitt, Norden oben) oder null. */
  function luftbildSetzen(flaeche) {
    if (flaeche && !bildTex) {
      bildTex = new THREE.CanvasTexture(flaeche);
      bildTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      gelaendeMat.uniforms.bild.value = bildTex;
    }
    gelaendeMat.uniforms.mitBild.value = flaeche ? 1 : 0;
  }
  const gelaende = new THREE.Mesh(flaecheGeo, gelaendeMat);
  gelaende.frustumCulled = false;
  gelaende.visible = false;

  function leeren() {
    const alt = renderer.getRenderTarget(), farbe = renderer.getClearColor(new THREE.Color()), a = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const t of [fA, fB, wA, wB]) { renderer.setRenderTarget(t); renderer.clear(true, false, false); }
    renderer.setRenderTarget(alt);
    renderer.setClearColor(farbe, a);
  }
  leeren();

  const zustand = { zeit: 0, regenMmH: 30, dauerH: 1, versickernMmH: 5, flaecheZellen: m * m };

  /** Regnet nur im Vieleck (oder überall bei null). */
  function bereichSetzen(ecken) {
    let k = 0;
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      const v = !ecken || innen(-halb + (x + 0.5) * res, -halb + (y + 0.5) * res, ecken) ? 1 : 0;
      maskeDaten[y * m + x] = v; k += v;
    }
    maskeTex.needsUpdate = true;
    zustand.flaecheZellen = k;
  }

  /** schritte Rechenschritte; regnet, solange die Zeit unter der Dauer liegt. */
  function rechnen(schritte) {
    const alt = renderer.getRenderTarget(), autoClear = renderer.autoClear;
    renderer.autoClear = false;
    const proS = zustand.regenMmH / 1000 / 3600, wegS = zustand.versickernMmH / 1000 / 3600;
    for (let i = 0; i < schritte; i++) {
      const regnet = zustand.zeit < zustand.dauerH * 3600;
      flussMat.uniforms.W.value = wA.texture; flussMat.uniforms.F.value = fA.texture;
      quad.material = flussMat;
      renderer.setRenderTarget(fB); renderer.render(quadSzene, quadKamera);
      [fA, fB] = [fB, fA];
      wasserMat.uniforms.W.value = wA.texture; wasserMat.uniforms.F.value = fA.texture;
      wasserMat.uniforms.regen.value = regnet ? proS * dt : 0;
      wasserMat.uniforms.versickern.value = wegS * dt;
      quad.material = wasserMat;
      renderer.setRenderTarget(wB); renderer.render(quadSzene, quadKamera);
      [wA, wB] = [wB, wA];
      zustand.zeit += dt;
    }
    flaecheMat.uniforms.W.value = wA.texture;
    renderer.setRenderTarget(alt);
    renderer.autoClear = autoClear;
  }

  const lesen = new Float32Array(m * m * 4);
  /** Kennzahlen aus der Grafikkarte zurückgelesen (rund 16 MB, nur ab und zu). */
  function bilanz() {
    renderer.readRenderTargetPixels(wA, 0, 0, m, m, lesen);
    const a = res * res;
    let steht = 0, versickert = 0, gefallen = 0, nass = 0, tiefst = 0, tiefK = -1, imBereich = 0;
    for (let c = 0; c < m * m; c++) {
      const w = lesen[4 * c];
      steht += w; versickert += lesen[4 * c + 2]; gefallen += lesen[4 * c + 3];
      if (maskeDaten[c]) imBereich += w;
      if (w >= PFUETZE) nass++;
      if (w > tiefst) { tiefst = w; tiefK = c; }
    }
    const x = tiefK % m, y = (tiefK / m) | 0;
    return {
      gefallen: gefallen * a, steht: steht * a, imBereich: imBereich * a, versickert: versickert * a,
      abgeflossen: Math.max(0, (gefallen - steht - versickert) * a), nassFlaeche: nass * a, tiefst,
      tiefOrt: tiefK < 0 ? null : new THREE.Vector3(-halb + (x + 0.5) * res, -halb + (y + 0.5) * res, r.z[tiefK] + tiefst)
    };
  }

  function zuruecksetzen() { zustand.zeit = 0; leeren(); flaecheMat.uniforms.W.value = wA.texture; }

  function entsorgen() {
    for (const t of [fA, fB, wA, wB]) t.dispose();
    hTex.dispose(); maskeTex.dispose(); flussMat.dispose(); wasserMat.dispose(); quad.geometry.dispose();
    flaecheGeo.dispose(); flaecheMat.dispose(); gelaendeMat.dispose();
    if (bildTex) bildTex.dispose();
    if (gelaende.parent) gelaende.parent.remove(gelaende);
  }

  return { szene, flaeche, gelaende, luftbildSetzen, zustand, res, m, dt, gebaeude: r.gebaeude, rechnen, bilanz, bereichSetzen, zuruecksetzen, entsorgen };
}
