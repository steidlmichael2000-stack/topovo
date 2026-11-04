/* Topovo — Ansicht der Laserpunkte (3D)
 *
 * Als Modul nachgeladen (app.js, laserZeigen), erst wenn jemand Laserpunkte
 * ansieht: three.js ist rund 1,2 MB. Bedienung angelehnt an den PW-Viewer
 * (Potree): runde Knöpfe in den Ecken — Einstellungen links oben, Schließen
 * rechts oben, Messen links unten, Vollbild rechts unten — und dieselbe
 * Kantenschattierung (Eye-Dome-Lighting), die die Punkte plastisch macht.
 *
 * Koordinaten: x nach Osten, y nach Norden (m, relativ zur Mitte des
 * Ausschnitts), z die Höhe über dem tiefsten Punkt. Die Höhe über NHN ist
 * z + zMin.
 */
import * as THREE from './vendor/three/three.module.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';

/* Punktklassen der BVV (Beschreibung der Punktklassen, Stand September 2023).
 * Farben nach dem Brauch der Laser-Viewer: Boden braun, Bewuchs grün, Gebäude rot. */
const KLASSEN = {
  1: ['Unklassifiziert', '#9aa3ad'],
  2: ['Boden', '#b9824d'],
  6: ['Gebäude', '#e2543e'],
  9: ['Gewässer', '#3d86e0'],
  20: ['Objekte, Bewuchs', '#4fb35a'],
  22: ['Brücke / Kellerabgang', '#a274e3'],
  23: ['Boden, abgeleitet', '#d8ad7c'],
  24: ['Boden aus bDOM', '#cbb08f']
};
const klasseName = k => (KLASSEN[k] || [`Klasse ${k}`])[0];
const klasseFarbe = k => (KLASSEN[k] || [0, '#c8c8c8'])[1];
// Dieselben Töne wie die Höhenfarben auf der Karte (HOEHEN_RAMPE in app.js)
const RAMPE = ['#2c3e94', '#2a7dc4', '#33b2b0', '#7ccc6c', '#e6dd55', '#f19a3c', '#c8382f'];

const zahl = (v, s = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: s, maximumFractionDigits: s });

const PUNKT_VS = `
  attribute vec3 farbe, normale;
  attribute float klasse;
  uniform float groesse, skala, masken[32], licht;
  uniform vec3 lichtRichtung;
  varying vec3 vFarbe;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Schummerung wie beim Relief: Licht von Nordwesten, 45° hoch
    float hell = 0.25 + 0.95 * max(dot(normalize(normale), lichtRichtung), 0.0);
    vFarbe = min(farbe * mix(1.0, hell, licht), vec3(1.0));
    // Ausgeblendete Klasse: hinter die ferne Ebene, wird nicht gezeichnet
    if (masken[int(klasse) & 31] < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = max(1.5, groesse * skala / -mv.z);
  }`;
const PUNKT_FS = `
  varying vec3 vFarbe;
  void main() {
    // Runde Punkte
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    if (dot(p, p) > 1.0) discard;
    gl_FragColor = vec4(vFarbe, 1.0);
  }`;
/* Eye-Dome-Lighting nach Boucheny (2009), wie in Potree: je Bildpunkt die
 * logarithmische Tiefe gegen acht Nachbarn — liegt ein Nachbar näher, wird
 * es dunkler. So treten Kanten hervor, ohne dass die Punkte Normalen brauchen. */
const EDL_FS = `
  uniform sampler2D farbe, tiefe;
  uniform vec2 pixel;
  uniform float nah, fern, staerke, radius;
  varying vec2 vUv;
  float logTiefe(vec2 uv) {
    float d = texture2D(tiefe, uv).r;
    if (d >= 1.0) return 0.0;
    float z = nah * fern / (fern - d * (fern - nah));
    return log2(z);
  }
  void main() {
    float d = texture2D(tiefe, vUv).r;
    if (d >= 1.0) discard;
    float l = logTiefe(vUv), summe = 0.0;
    for (int i = 0; i < 8; i++) {
      float w = float(i) * 0.785398;
      vec2 uv = vUv + vec2(cos(w), sin(w)) * radius * pixel;
      float n = logTiefe(uv);
      if (n != 0.0) summe += max(0.0, l - n);
    }
    float schatten = exp(-summe / 8.0 * 300.0 * staerke);
    gl_FragColor = vec4(texture2D(farbe, vUv).rgb * schatten, 1.0);
  }`;
const EDL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Öffnet die Ansicht über der Karte. d: Ergebnis aus laser-werk.js,
 *  info: { kachel, quelle, seite }. Gibt eine Funktion zum Schließen zurück. */
export function laserAnsicht(d, info, { beimSchliessen } = {}) {
  const wurzel = document.createElement('div');
  wurzel.className = 'laser-ansicht';
  wurzel.dataset.grund = 'verlauf';
  wurzel.innerHTML = `
    <canvas class="lz-flaeche"></canvas>
    <button type="button" class="lz-knopf lz-einst" aria-label="Einstellungen" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>
    </button>
    <button type="button" class="lz-knopf lz-zu" aria-label="Laseransicht schließen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <button type="button" class="lz-knopf lz-messen" aria-label="Messen" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 16.5 16.5 3.5l4 4-13 13z"/><path d="M7 13l1.8 1.8M10 10l1.8 1.8M13 7l1.8 1.8"/></svg>
    </button>
    <button type="button" class="lz-knopf lz-voll" aria-label="Vollbild">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
    </button>
    <button type="button" class="lz-knopf lz-heim" aria-label="Ansicht zurücksetzen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4.5l8 7"/><path d="M6.5 9.5V19h11V9.5"/></svg>
    </button>
    <div class="lz-tafel" hidden>
      <p class="lz-titel">Färbung</p>
      <div class="seg seg-paar lz-faerbung" role="group" aria-label="Färbung">
        <button type="button" class="seg-btn is-on" data-faerbung="klasse">Klasse</button>
        <button type="button" class="seg-btn" data-faerbung="hoehe">Höhe</button>
        <button type="button" class="seg-btn" data-faerbung="intensitaet">Intensität</button>
        <button type="button" class="seg-btn" data-faerbung="normalen">Normalen</button>
      </div>
      <label class="slider-row">Licht
        <input type="range" class="lz-licht" min="0" max="100" step="5" value="50">
        <span class="slider-val lz-licht-wert"></span>
      </label>
      <p class="lz-titel">Klassen</p>
      <div class="lz-klassen"></div>
      <label class="slider-row">Punkte
        <input type="range" class="lz-groesse" min="5" max="100" step="5" value="25">
        <span class="slider-val lz-groesse-wert"></span>
      </label>
      <label class="slider-row">Kanten
        <input type="range" class="lz-edl" min="0" max="100" step="5" value="40">
        <span class="slider-val lz-edl-wert"></span>
      </label>
      <p class="lz-titel">Hintergrund</p>
      <div class="seg seg-paar" role="group" aria-label="Hintergrund">
        <button type="button" class="seg-btn is-on" data-grund="verlauf">Verlauf</button>
        <button type="button" class="seg-btn" data-grund="schwarz">Schwarz</button>
        <button type="button" class="seg-btn" data-grund="weiss">Weiß</button>
      </div>
    </div>
    <div class="lz-skala" hidden><div class="hoehen-balken"></div><div class="hoehen-werte"><span></span><span></span><span></span></div></div>
    <div class="lz-mess-menue" hidden>
      <button type="button" class="lz-mess-wahl" data-mess="distanz">Distanz</button>
      <button type="button" class="lz-mess-wahl" data-mess="flaeche">Fläche</button>
      <button type="button" class="lz-mess-wahl" data-mess="hoehe">Höhe</button>
      <button type="button" class="lz-mess-wahl lz-loeschen" disabled>Messungen löschen</button>
    </div>
    <div class="lz-mess-hinweis" hidden><span></span><button type="button" class="lz-fertig" hidden>Fertig</button></div>
    <div class="lz-marken"></div>
    <p class="lz-fuss"></p>`;
  document.body.appendChild(wurzel);
  const $ = s => wurzel.querySelector(s);

  /* ---------- Szene ---------- */
  const flaeche = $('.lz-flaeche');
  const renderer = new THREE.WebGLRenderer({ canvas: flaeche, antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const szene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(55, 1, 0.5, 5000);
  kamera.up.set(0, 0, 1);

  const n = d.anzahl;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.xyz, 3));
  const farben = new Float32Array(n * 3);
  geo.setAttribute('farbe', new THREE.BufferAttribute(farben, 3));
  geo.setAttribute('klasse', new THREE.BufferAttribute(Float32Array.from(d.klasse), 1));
  // Normalen aus laser-werk.js, als Int8 ×127 — normalized liefert −1…1 im Shader
  geo.setAttribute('normale', new THREE.BufferAttribute(d.normalen, 3, true));
  geo.computeBoundingSphere();
  const masken = new Array(32).fill(1);
  const material = new THREE.ShaderMaterial({
    vertexShader: PUNKT_VS, fragmentShader: PUNKT_FS,
    uniforms: { groesse: { value: 0.25 }, skala: { value: 1 }, masken: { value: masken }, licht: { value: 0.5 },
      lichtRichtung: { value: new THREE.Vector3(-0.5, 0.5, Math.SQRT1_2) } }
  });
  const wolke = new THREE.Points(geo, material);
  szene.add(wolke);

  // Messlinien und -punkte: in einer eigenen Szene, über allem
  const messSzene = new THREE.Scene();

  // EDL: erst in ein Ziel mit Tiefe, dann über eine Fläche auf den Schirm
  const ziel = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
  /* Tiefe als Gleitkommazahl: Am Handy (Xiaomi 15T Pro, 04.11.2026) war die
   * ganzzahlige Tiefe so grob, dass die Kantenschattierung bei hoher Stärke
   * ihre Stufen als Linien über den Boden zog. Dazu der enge Bereich in
   * tiefeAnpassen. */
  ziel.depthTexture.type = THREE.FloatType;
  const edl = new THREE.ShaderMaterial({
    vertexShader: EDL_VS, fragmentShader: EDL_FS, depthTest: false, depthWrite: false, transparent: true,
    uniforms: { farbe: { value: ziel.texture }, tiefe: { value: ziel.depthTexture }, pixel: { value: new THREE.Vector2() },
      nah: { value: kamera.near }, fern: { value: kamera.far }, staerke: { value: 0.4 }, radius: { value: 1.4 } }
  });
  const schirm = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), edl);
  const schirmSzene = new THREE.Scene();
  schirmSzene.add(schirm);
  const schirmKamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const steuerung = new OrbitControls(kamera, flaeche);
  steuerung.enableDamping = true;
  steuerung.dampingFactor = 0.12;
  steuerung.screenSpacePanning = true;
  steuerung.maxPolarAngle = Math.PI * 0.98;
  /* Schieben: rechte Maustaste, Shift/Strg + linke (kann OrbitControls von
   * Haus aus), zwei Finger, Pfeiltasten. Der Hinweis unten sagt es. */
  steuerung.listenToKeyEvents(window);
  steuerung.keyPanSpeed = 20;

  const halb = info.seite / 2, hoch = d.zMax - d.zMin;
  function heim() {
    steuerung.target.set(0, 0, hoch / 3);
    // Von Süden, schräg von oben, der ganze Ausschnitt im Bild
    kamera.position.set(-halb * 0.5, -halb * 2.3, hoch / 3 + halb * 1.7);
    steuerung.update();
  }
  heim();

  /* ---------- Färbung ---------- */
  let faerbung = 'klasse';
  const tmp = new THREE.Color();
  // Intensität: zwischen dem 2. und 98. Prozent strecken, sonst ist fast alles dunkel
  const iSort = Float32Array.from(d.staerke).sort();
  const iLo = iSort[Math.floor(n * 0.02)] || 0, iHi = iSort[Math.floor(n * 0.98)] || d.iMax || 1;
  const zSort = Float32Array.from({ length: Math.min(n, 200000) }, (_, i) => d.xyz[3 * Math.floor(i * n / Math.min(n, 200000)) + 2]).sort();
  const zLo = zSort[Math.floor(zSort.length * 0.01)] || 0, zHi = zSort[Math.floor(zSort.length * 0.99)] || hoch;
  const rampe = RAMPE.map(f => new THREE.Color(f));
  const klassenFarben = new Map(d.klassen.map(([k]) => [k, new THREE.Color(klasseFarbe(k))]));

  function faerben() {
    for (let i = 0; i < n; i++) {
      let c;
      if (faerbung === 'klasse') c = klassenFarben.get(d.klasse[i]);
      else if (faerbung === 'hoehe') {
        const t = Math.min(1, Math.max(0, (d.xyz[3 * i + 2] - zLo) / (zHi - zLo || 1))) * (rampe.length - 1);
        const j = Math.min(rampe.length - 2, Math.floor(t));
        c = tmp.copy(rampe[j]).lerp(rampe[j + 1], t - j);
      } else if (faerbung === 'normalen') {
        /* Grau, das Licht macht die Form — wie das Schräglicht der BVV. Die
         * Richtung als Farbe (CloudCompare) war fast überall lila: Fast alles
         * zeigt nach oben, und Böschungen gingen darin unter. */
        c = tmp.setRGB(0.82, 0.82, 0.82);
      } else {
        const g = Math.min(1, Math.max(0, (d.staerke[i] - iLo) / (iHi - iLo || 1)));
        c = tmp.setRGB(g, g, g);
      }
      farben[3 * i] = c.r; farben[3 * i + 1] = c.g; farben[3 * i + 2] = c.b;
    }
    geo.attributes.farbe.needsUpdate = true;
    const skala = $('.lz-skala');
    skala.hidden = faerbung !== 'hoehe';
    if (!skala.hidden) {
      const w = skala.querySelectorAll('span');
      w[0].textContent = zahl(zLo + d.zMin, 1);
      w[1].textContent = zahl((zLo + zHi) / 2 + d.zMin, 1);
      w[2].textContent = zahl(zHi + d.zMin, 1) + ' m';
    }
    neu = true;
  }

  /* ---------- Klassen ein/aus ---------- */
  $('.lz-klassen').innerHTML = d.klassen.map(([k, anzahl]) => `
    <label class="lz-klasse"><input type="checkbox" checked data-klasse="${k}">
      <span class="lz-feld" style="background:${klasseFarbe(k)}"></span>
      <span class="lz-name">${klasseName(k)}</span>
      <span class="lz-zahl">${anzahl.toLocaleString('de-DE')}</span></label>`).join('');
  wurzel.querySelectorAll('[data-klasse]').forEach(c => c.addEventListener('change', () => {
    masken[Number(c.dataset.klasse) & 31] = c.checked ? 1 : 0;
    neu = true;
  }));

  /* ---------- Bedienung ---------- */
  const tafel = $('.lz-tafel'), einst = $('.lz-einst');
  einst.addEventListener('click', () => {
    tafel.hidden = !tafel.hidden;
    einst.setAttribute('aria-expanded', String(!tafel.hidden));
    einst.classList.toggle('is-on', !tafel.hidden);
  });
  wurzel.querySelectorAll('[data-faerbung]').forEach(b => b.addEventListener('click', () => {
    faerbung = b.dataset.faerbung;
    // Ohne Licht wäre die Normalenansicht eine graue Fläche
    if (faerbung === 'normalen' && lichtRegler.value < 100) { lichtRegler.value = 100; reglerZeigen(); }
    wurzel.querySelectorAll('[data-faerbung]').forEach(x => x.classList.toggle('is-on', x === b));
    faerben();
  }));
  wurzel.querySelectorAll('[data-grund]').forEach(b => b.addEventListener('click', () => {
    if (b.closest('.lz-tafel')) {
      wurzel.dataset.grund = b.dataset.grund;
      wurzel.querySelectorAll('.lz-tafel [data-grund]').forEach(x => x.classList.toggle('is-on', x === b));
    }
  }));
  const groesse = $('.lz-groesse'), edlRegler = $('.lz-edl'), lichtRegler = $('.lz-licht');
  const reglerZeigen = () => {
    material.uniforms.licht.value = lichtRegler.value / 100;
    $('.lz-licht-wert').textContent = `${lichtRegler.value} %`;
    material.uniforms.groesse.value = groesse.value / 100;
    $('.lz-groesse-wert').textContent = `${zahl(groesse.value / 100, 2)} m`;
    edl.uniforms.staerke.value = edlRegler.value / 100;
    $('.lz-edl-wert').textContent = `${edlRegler.value} %`;
    neu = true;
  };
  groesse.addEventListener('input', reglerZeigen);
  edlRegler.addEventListener('input', reglerZeigen);
  lichtRegler.addEventListener('input', reglerZeigen);
  $('.lz-voll').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (wurzel.requestFullscreen) wurzel.requestFullscreen();
  });
  $('.lz-heim').addEventListener('click', heim);

  /* ---------- Antippen: Punkt im Bild suchen ----------
   * Ohne Raycaster über alle Punkte der Szene: die sichtbaren Punkte auf den
   * Schirm rechnen und den nächsten im Umkreis von 10 Bildpunkten nehmen —
   * bei gleicher Nähe den vorderen. Rund 20 ms für eine Million Punkte. */
  const mvp = new THREE.Matrix4();
  function punktAn(cx, cy) {
    const r = flaeche.getBoundingClientRect();
    const x = (cx - r.left) / r.width * 2 - 1, y = -((cy - r.top) / r.height * 2 - 1);
    mvp.multiplyMatrices(kamera.projectionMatrix, kamera.matrixWorldInverse);
    const m = mvp.elements, px = 2 / r.width, py = 2 / r.height, tol = 10;
    let best = -1, bestWert = Infinity;
    for (let i = 0; i < n; i++) {
      if (!masken[d.klasse[i] & 31]) continue;
      const a = d.xyz[3 * i], b = d.xyz[3 * i + 1], c = d.xyz[3 * i + 2];
      const w = m[3] * a + m[7] * b + m[11] * c + m[15];
      if (w <= 0) continue;
      const sx = (m[0] * a + m[4] * b + m[8] * c + m[12]) / w;
      const sy = (m[1] * a + m[5] * b + m[9] * c + m[13]) / w;
      const dx = (sx - x) / px, dy = (sy - y) / py, q = dx * dx + dy * dy;
      if (q > tol * tol) continue;
      const wert = q + w * 0.05;     // bei gleicher Nähe der vordere
      if (wert < bestWert) { bestWert = wert; best = i; }
    }
    return best < 0 ? null : new THREE.Vector3(d.xyz[3 * best], d.xyz[3 * best + 1], d.xyz[3 * best + 2]);
  }

  /* ---------- Messen: Distanz, Fläche, Höhe ----------
   * Wie im PW-Viewer: der Knopf links unten öffnet die Wahl, eine Art bleibt
   * an, bis man sie wieder antippt. Fläche: Eckpunkte antippen, „Fertig" oder
   * ein Tipp auf den ersten Punkt schließt sie. Gerechnet in UTM32 und NHN —
   * die Punkte stehen relativ zu d.mitte und d.zMin. */
  let messArt = null, offen = [];        // offen: Punkte und Teile der laufenden Messung
  const messungen = [];                  // { teile, marke, mitte }
  const kugelGeo = new THREE.SphereGeometry(1, 12, 8);
  const kugelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  const linieMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
  const kugeln = [];
  function kugel(p) {
    const k = new THREE.Mesh(kugelGeo, kugelMat);
    k.position.copy(p);
    messSzene.add(k);
    kugeln.push(k);
    return k;
  }
  function linie(punkte, zu = false) {
    const g = new THREE.BufferGeometry().setFromPoints(punkte);
    const l = zu ? new THREE.LineLoop(g, linieMat) : new THREE.Line(g, linieMat);
    messSzene.add(l);
    return l;
  }
  function wegNehmen(teile) {
    for (const t of teile) {
      messSzene.remove(t);
      const i = kugeln.indexOf(t);
      if (i >= 0) kugeln.splice(i, 1);
      if (t.geometry && t.geometry !== kugelGeo) t.geometry.dispose();
    }
  }
  const marken = $('.lz-marken'), hinweis = $('.lz-mess-hinweis'), menue = $('.lz-mess-menue');
  const fertig = $('.lz-fertig'), loeschen = $('.lz-loeschen');
  const HINWEIS = { distanz: 'Zwei Punkte antippen', flaeche: 'Eckpunkte antippen', hoehe: 'Punkt antippen' };
  function hinweisSetzen() {
    hinweis.hidden = !messArt;
    if (!messArt) return;
    const n = offen.filter(t => kugeln.includes(t)).length;
    hinweis.querySelector('span').textContent = messArt === 'distanz' && n ? 'Zweiten Punkt antippen'
      : messArt === 'flaeche' && n ? `${n} ${n === 1 ? 'Punkt' : 'Punkte'} — weitere antippen` : HINWEIS[messArt];
    fertig.hidden = !(messArt === 'flaeche' && n >= 3);
  }
  function offenVerwerfen() {
    wegNehmen(offen);
    offen = [];
    offenPunkte = [];
  }
  let offenPunkte = [];
  function messArtSetzen(art) {
    offenVerwerfen();
    messArt = messArt === art ? null : art;
    menue.querySelectorAll('[data-mess]').forEach(b => b.classList.toggle('is-on', b.dataset.mess === messArt));
    $('.lz-messen').classList.toggle('is-on', !!messArt);
    hinweisSetzen();
    neu = true;
  }
  $('.lz-messen').addEventListener('click', () => {
    menue.hidden = !menue.hidden;
    $('.lz-messen').setAttribute('aria-expanded', String(!menue.hidden));
  });
  menue.querySelectorAll('[data-mess]').forEach(b => b.addEventListener('click', () => {
    messArtSetzen(b.dataset.mess);
    menue.hidden = true;
    $('.lz-messen').setAttribute('aria-expanded', 'false');
  }));

  const ost = x => (x + d.mitte[0]).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  const nord = y => (y + d.mitte[1]).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  function ablegen(teile, mitte, html) {
    const marke = document.createElement('div');
    marke.className = 'lz-marke';
    marke.innerHTML = html;
    marken.appendChild(marke);
    messungen.push({ teile, marke, mitte: mitte.clone() });
    loeschen.disabled = false;
  }
  function flaecheSchliessen() {
    const p = offenPunkte;
    if (p.length < 3) return;
    wegNehmen(offen.filter(t => !kugeln.includes(t)));       // die vorläufige Linie
    const teile = [...offen.filter(t => kugeln.includes(t)), linie(p, true)];
    // Waagerechte Fläche (Gauß) und Umfang im Raum
    let f = 0, u = 0;
    const mitte = new THREE.Vector3();
    p.forEach((a, i) => {
      const b = p[(i + 1) % p.length];
      f += a.x * b.y - b.x * a.y;
      u += a.distanceTo(b);
      mitte.add(a);
    });
    mitte.divideScalar(p.length);
    ablegen(teile, mitte, `<b>${zahl(Math.abs(f) / 2)} m²</b><span>waagerecht · Umfang ${zahl(u)} m</span>`);
    offen = []; offenPunkte = [];
    hinweisSetzen();
    neu = true;
  }
  fertig.addEventListener('click', flaecheSchliessen);

  function messTipp(p, cx, cy) {
    if (messArt === 'hoehe') {
      ablegen([kugel(p)], p, `<b>H ${zahl(p.z + d.zMin)} m</b><span>E ${ost(p.x)} · N ${nord(p.y)}</span>`);
    } else if (messArt === 'distanz') {
      offenPunkte.push(p);
      offen.push(kugel(p));
      if (offenPunkte.length === 2) {
        const [a, b] = offenPunkte;
        const waag = Math.hypot(b.x - a.x, b.y - a.y), dh = b.z - a.z;
        ablegen([...offen, linie([a, b])], a.clone().add(b).multiplyScalar(0.5),
          `<b>${zahl(a.distanceTo(b))} m</b><span>waagerecht ${zahl(waag)} m · Δh ${dh >= 0 ? '+' : '−'}${zahl(Math.abs(dh))} m</span>`);
        offen = []; offenPunkte = [];
      }
    } else if (messArt === 'flaeche') {
      // Tipp auf den ersten Punkt schließt die Fläche
      if (offenPunkte.length >= 3) {
        const v0 = offenPunkte[0].clone().project(kamera), r = flaeche.getBoundingClientRect();
        if (Math.hypot((v0.x + 1) / 2 * r.width + r.left - cx, (1 - v0.y) / 2 * r.height + r.top - cy) < 14) { flaecheSchliessen(); return; }
      }
      offenPunkte.push(p);
      wegNehmen(offen.filter(t => !kugeln.includes(t)));
      offen = offen.filter(t => kugeln.includes(t));
      offen.push(kugel(p));
      if (offenPunkte.length > 1) offen.push(linie(offenPunkte));
    }
    hinweisSetzen();
    neu = true;
  }
  loeschen.addEventListener('click', () => {
    offenVerwerfen();
    for (const m of messungen) { wegNehmen(m.teile); m.marke.remove(); }
    messungen.length = 0;
    loeschen.disabled = true;
    menue.hidden = true;
    hinweisSetzen();
    neu = true;
  });

  // Tippen, nicht Ziehen: unter 6 Bildpunkten Weg
  let runter = null, letzterTipp = 0;
  flaeche.addEventListener('pointerdown', ev => { runter = [ev.clientX, ev.clientY]; });
  flaeche.addEventListener('pointerup', ev => {
    if (!runter || Math.hypot(ev.clientX - runter[0], ev.clientY - runter[1]) > 6) return;
    const jetzt = Date.now(), doppelt = jetzt - letzterTipp < 320;
    letzterTipp = jetzt;
    const p = punktAn(ev.clientX, ev.clientY);
    if (!p) return;
    if (messArt) messTipp(p, ev.clientX, ev.clientY);
    // Doppeltipp: um diesen Punkt drehen
    else if (doppelt) { steuerung.target.copy(p); steuerung.update(); neu = true; }
  });

  /* ---------- Zeichnen ---------- */
  let neu = true, laeuft = true;
  steuerung.addEventListener('change', () => { neu = true; });
  function groesseSetzen() {
    const w = wurzel.clientWidth, h = wurzel.clientHeight;
    renderer.setSize(w, h, false);
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    ziel.setSize(Math.round(w * pr), Math.round(h * pr));
    edl.uniforms.pixel.value.set(1 / (w * pr), 1 / (h * pr));
    material.uniforms.skala.value = h * pr / (2 * Math.tan(kamera.fov * Math.PI / 360));
    neu = true;
  }
  const beobachter = new ResizeObserver(groesseSetzen);
  beobachter.observe(wurzel);
  groesseSetzen();

  const v = new THREE.Vector3();
  /* Nah- und Fernebene eng um die Wolke: Die Genauigkeit der Tiefe verteilt
   * sich auf diesen Bereich, und 0,5 m bis 5 km verschenkte fast alles. */
  const kugelWolke = geo.boundingSphere;
  function tiefeAnpassen() {
    const abstand = kamera.position.distanceTo(kugelWolke.center), r = kugelWolke.radius;
    kamera.near = Math.max(0.1, (abstand - r) * 0.9, abstand * 0.002);
    kamera.far = abstand + r * 1.1;
    kamera.updateProjectionMatrix();
    edl.uniforms.nah.value = kamera.near;
    edl.uniforms.fern.value = kamera.far;
  }

  function bild() {
    if (!laeuft) return;
    requestAnimationFrame(bild);
    steuerung.update();
    if (!neu) return;
    neu = false;
    tiefeAnpassen();
    // Messkugeln bleiben auf dem Schirm gleich groß
    for (const k of kugeln) k.scale.setScalar(kamera.position.distanceTo(k.position) * 0.006);
    renderer.setRenderTarget(ziel);
    renderer.clear();
    renderer.render(szene, kamera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(schirmSzene, schirmKamera);
    renderer.autoClear = false;
    renderer.render(messSzene, kamera);
    renderer.autoClear = true;
    // Beschriftung der Messungen an die Mitte der Linie
    const r = flaeche.getBoundingClientRect();
    for (const m of messungen) {
      v.copy(m.mitte).project(kamera);
      const sicht = v.z < 1;
      m.marke.hidden = !sicht;
      if (sicht) m.marke.style.transform = `translate(${(v.x + 1) / 2 * r.width}px, ${(1 - v.y) / 2 * r.height}px) translate(-50%, -130%)`;
    }
  }

  const finger = window.matchMedia('(pointer: coarse)').matches;
  $('.lz-fuss').innerHTML = (finger ? 'Ein Finger drehen · zwei Finger schieben und zoomen · Doppeltipp: Drehpunkt'
    : 'Ziehen: drehen · rechte Taste oder Shift: schieben · Rad: zoomen · Doppelklick: Drehpunkt') + '<br>' + `Kachel ${info.kachel} · ${d.anzahl.toLocaleString('de-DE')} Punkte` +
    (d.schritt > 1 ? ` (jeder ${d.schritt}.)` : '') + ` · ${info.seite} × ${info.seite} m · Laserdaten: ${info.quelle}`;
  reglerZeigen();
  faerben();
  bild();

  function schliessen() {
    laeuft = false;
    beobachter.disconnect();
    steuerung.stopListenToKeyEvents();
    steuerung.dispose();
    geo.dispose(); material.dispose(); edl.dispose(); ziel.dispose();
    renderer.dispose();
    if (document.fullscreenElement === wurzel) document.exitFullscreen();
    document.removeEventListener('keydown', taste);
    wurzel.remove();
    if (beimSchliessen) beimSchliessen();
  }
  const taste = ev => { if (ev.key === 'Escape' && !document.fullscreenElement) schliessen(); };
  document.addEventListener('keydown', taste);
  $('.lz-zu').addEventListener('click', schliessen);
  return schliessen;
}
