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
  uniform float groesse, skala, masken[32], licht, ortho, orthoSkala, maxPx;
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
    // Perspektive: kleiner mit der Entfernung; orthografisch: fest je Meter
    // Ganz nah heran nicht zu Scheiben aufblähen: höchstens 24 Bildpunkte (am Handy mal Pixeldichte)
    gl_PointSize = clamp(ortho > 0.5 ? groesse * orthoSkala : groesse * skala / -mv.z, 1.5, maxPx);
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
 * es dunkler. So treten Kanten hervor, ohne dass die Punkte Normalen brauchen.
 *
 * Gelesen wird mit texelFetch an ganzen Bildpunkten (three.js übersetzt für
 * WebGL2 als GLSL 3.00), nicht über Bildkoordinaten 0…1: Am Handy (Xiaomi
 * 15T Pro, 04.11.2026) lagen bei hoher Stärke Linien fest im Bild, die sich
 * beim Drehen nicht mitbewegten — die Koordinaten waren dort zu ungenau, um
 * bei 2400 Bildpunkten Höhe jeden Nachbarn zu treffen. */
const EDL_FS = `
  precision highp float;
  precision highp int;
  uniform highp sampler2D farbe, tiefe;
  uniform ivec2 groesse;
  uniform float nah, fern, staerke, schwelle, ortho;
  uniform int radius;
  // Lineare Tiefe in m; 0 = kein Punkt
  float tiefeM(ivec2 p) {
    p = clamp(p, ivec2(0), groesse - 1);
    float d = texelFetch(tiefe, p, 0).r;
    if (d >= 1.0) return 0.0;
    // Orthografisch ist die Tiefe schon linear, perspektivisch nicht
    return ortho > 0.5 ? nah + d * (fern - nah) : nah * fern / (fern - d * (fern - nah));
  }
  ivec2 nachbar(int i) {
    return i == 0 ? ivec2(1, 0) : i == 1 ? ivec2(-1, 0) : i == 2 ? ivec2(0, 1) : i == 3 ? ivec2(0, -1)
      : i == 4 ? ivec2(1, 1) : i == 5 ? ivec2(-1, 1) : i == 6 ? ivec2(1, -1) : ivec2(-1, -1);
  }
  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float z = tiefeM(p);
    if (z == 0.0) {
      /* Kleine Löcher zwischen den Punkten füllen: Ist ein leerer Bildpunkt fast
       * ringsum belegt, bekommt er die mittlere Farbe der Nachbarn, leicht
       * abgedunkelt. Sonst schien auf hellem Grund jede Lücke weiß durch. */
      vec3 summe = vec3(0.0);
      int belegt = 0;
      for (int i = 0; i < 8; i++) {
        ivec2 q = clamp(p + nachbar(i), ivec2(0), groesse - 1);
        if (texelFetch(tiefe, q, 0).r < 1.0) { summe += texelFetch(farbe, q, 0).rgb; belegt++; }
      }
      if (belegt < 6) discard;
      gl_FragColor = vec4(summe / float(belegt) * 0.8, 1.0);
      return;
    }
    float l = log2(z), summe = 0.0;
    for (int i = 0; i < 8; i++) {
      float n = tiefeM(p + nachbar(i) * radius);
      // Erst ab schwelle Meter näher dunkelt ein Nachbar ab — Rauschen im Zentimeterbereich bleibt hell
      if (n != 0.0) summe += max(0.0, l - log2(n + schwelle));
    }
    float schatten = exp(-summe / 8.0 * 300.0 * staerke);
    gl_FragColor = vec4(texelFetch(farbe, p, 0).rgb * schatten, 1.0);
  }`;
const EDL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Öffnet die Ansicht über der Karte. d: Ergebnis aus laser-werk.js,
 *  info: { kachel, quelle, seite }. Gibt eine Funktion zum Schließen zurück. */
export function laserAnsicht(d, info, { beimSchliessen } = {}) {
  const wurzel = document.createElement('div');
  wurzel.className = 'laser-ansicht';
  wurzel.innerHTML = `
    <canvas class="lz-flaeche"></canvas>
    <!-- Ab 1010 px wie Topovo: Symbolspalte und Glasleiste links (laser.js, anordnen) -->
    <nav class="lz-schiene" aria-label="Bereiche">
      <button type="button" data-lz="karte" aria-label="Zurück zur Karte"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg><span>Zurück</span></button>
      <button type="button" data-lz="darstellung"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg><span>Darstellung</span></button>
      <button type="button" data-lz="messen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 16.5 16.5 3.5l4 4-13 13z"/><path d="M7 13l1.8 1.8M10 10l1.8 1.8M13 7l1.8 1.8"/></svg><span>Messen</span></button>
      <button type="button" data-lz="heim" class="lz-schiene-heim"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4.5l8 7"/><path d="M6.5 9.5V19h11V9.5"/></svg><span>Ansicht</span></button>
    </nav>
    <aside class="lz-seite">
      <div class="lz-seite-kopf"><p class="bb-title">Laserpunkte</p><p class="bb-sub lz-seite-unter"></p></div>
      <section data-bereich="darstellung"><h2 class="lz-seite-titel">Darstellung</h2></section>
      <section data-bereich="messen"><h2 class="lz-seite-titel">Messen</h2></section>
    </aside>
    <button type="button" class="lz-knopf lz-einst" aria-label="Darstellung" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>
    </button>
    <button type="button" class="lz-knopf lz-zu" aria-label="Laseransicht schließen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <button type="button" class="lz-knopf lz-messen" aria-label="Messen" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 16.5 16.5 3.5l4 4-13 13z"/><path d="M7 13l1.8 1.8M10 10l1.8 1.8M13 7l1.8 1.8"/></svg>
    </button>
    <button type="button" class="lz-knopf lz-heim" aria-label="Ansicht zurücksetzen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4.5l8 7"/><path d="M6.5 9.5V19h11V9.5"/></svg>
    </button>
    <div class="lz-tafel" hidden>
      <p class="pal-label">Färbung</p>
      <div class="seg seg-paar lz-faerbung" role="group" aria-label="Färbung">
        <button type="button" class="seg-btn is-on" data-faerbung="klasse">Klasse</button>
        <button type="button" class="seg-btn" data-faerbung="hoehe">Höhe</button>
        <button type="button" class="seg-btn" data-faerbung="intensitaet">Intensität</button>
        <button type="button" class="seg-btn" data-faerbung="normalen">Normalen</button>
      </div>
      <p class="pal-label">Klassen</p>
      <div class="lz-klassen"></div>
      <label class="slider-row">Schatten
        <input type="range" class="lz-licht" min="0" max="100" step="5" value="50">
        <span class="slider-val lz-licht-wert"></span>
      </label>
      <label class="slider-row">Kanten
        <input type="range" class="lz-edl" min="0" max="100" step="5" value="40">
        <span class="slider-val lz-edl-wert"></span>
      </label>
      <label class="slider-row">Punkte
        <input type="range" class="lz-groesse" min="5" max="150" step="5" value="25">
        <span class="slider-val lz-groesse-wert"></span>
      </label>
      <p class="pal-label">Kamera</p>
      <div class="seg seg-paar" role="group" aria-label="Kamera">
        <button type="button" class="seg-btn is-on" data-kamera="perspektive">Perspektive</button>
        <button type="button" class="seg-btn" data-kamera="ortho">Orthografisch</button>
      </div>
      <p class="pal-label">Hintergrund</p>
      <div class="seg seg-paar" role="group" aria-label="Hintergrund">
        <button type="button" class="seg-btn is-on" data-grund="verlauf">Verlauf</button>
        <button type="button" class="seg-btn" data-grund="schwarz">Schwarz</button>
        <button type="button" class="seg-btn" data-grund="weiss">Weiß</button>
      </div>
      <p class="pal-label">Ausschnitt</p>
      <div class="lz-info"></div>
    </div>
    <div class="lz-skala" hidden><div class="hoehen-balken"></div><div class="hoehen-werte"><span></span><span></span><span></span></div></div>
    <div class="lz-mess-menue mess-menue" role="menu" aria-label="Messen" hidden>
      <button type="button" role="menuitem" data-mess="distanz">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18 10 8l5 7 5-9"/><circle class="voll" cx="4" cy="18" r="1.8"/><circle class="voll" cx="10" cy="8" r="1.8"/><circle class="voll" cx="15" cy="15" r="1.8"/><circle class="voll" cx="20" cy="6" r="1.8"/></svg>
        <span><b>Distanz</b><small>Linienzug, Länge je Abschnitt</small></span>
      </button>
      <button type="button" role="menuitem" data-mess="flaeche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 3 9.5 11.5 4 20.5 9 18 18.5z"/><circle class="voll" cx="5" cy="19" r="1.7"/><circle class="voll" cx="3" cy="9.5" r="1.7"/><circle class="voll" cx="11.5" cy="4" r="1.7"/><circle class="voll" cx="20.5" cy="9" r="1.7"/><circle class="voll" cx="18" cy="18.5" r="1.7"/></svg>
        <span><b>Fläche</b><small>Waagerecht, mit Seitenlängen</small></span>
      </button>
      <button type="button" role="menuitem" data-mess="hoehe">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 4v16M14.5 6.5 17 4l2.5 2.5M14.5 17.5 17 20l2.5-2.5"/><path d="M4 20h9" stroke-dasharray="2 2"/><circle class="voll" cx="17" cy="4" r="1.7"/><circle class="voll" cx="5" cy="20" r="1.7"/></svg>
        <span><b>Höhe</b><small>Höhenunterschied zweier Punkte</small></span>
      </button>
      <button type="button" role="menuitem" class="lz-loeschen" disabled>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>
        <span><b>Messungen löschen</b><small>Alle Linien und Werte weg</small></span>
      </button>
    </div>
    <div class="lz-leiste" hidden>
      <button type="button" class="bb-close lz-mess-ende" aria-label="Messen beenden">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="bb-head"><p class="bb-title lz-mess-titel"></p></div>
      <p class="bb-coord mess-zahl lz-mess-wert"></p>
      <p class="bb-note plain lz-mess-hinweis"></p>
      <div class="bb-actions knapp">
        <button type="button" class="lz-zurueck">Zurück</button>
        <button type="button" class="lz-fertig maps">Fertig</button>
      </div>
    </div>
    <div class="lz-marken"></div>
    <p class="lz-tipp"></p>
    <p class="lz-fuss"></p>`;
  wurzel.dataset.grund = 'verlauf';
  document.body.appendChild(wurzel);
  const $ = s => wurzel.querySelector(s);

  /* ---------- Szene ---------- */
  const flaeche = $('.lz-flaeche');
  const renderer = new THREE.WebGLRenderer({ canvas: flaeche, antialias: false, alpha: true });
  /* Die Kantenschattierung braucht WebGL2 (texelFetch, Float-Tiefe). three.js fiele
   * sonst still auf WebGL1 zurück, und die Ansicht bliebe schwarz. */
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    renderer.forceContextLoss();
    wurzel.remove();
    throw new Error('WebGL2');
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const szene = new THREE.Scene();
  /* Zwei Kameras wie im PW-Viewer: perspektivisch (Standard) und orthografisch —
   * ohne Fluchtpunkt, maßstäblich wie ein Plan, etwa für eine Böschung von der
   * Seite. `kamera` ist immer die gerade benutzte. */
  const perspektive = new THREE.PerspectiveCamera(55, 1, 0.5, 5000);
  perspektive.up.set(0, 0, 1);
  const orthoKamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
  orthoKamera.up.set(0, 0, 1);
  let kamera = perspektive;

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
      ortho: { value: 0 }, orthoSkala: { value: 1 }, maxPx: { value: 24 },
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
    uniforms: { farbe: { value: ziel.texture }, tiefe: { value: ziel.depthTexture }, groesse: { value: [1, 1] },
      nah: { value: kamera.near }, fern: { value: kamera.far }, staerke: { value: 0.4 }, radius: { value: 1 }, schwelle: { value: 0.05 }, ortho: { value: 0 } }
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
    if (kamera === orthoKamera) { orthoKamera.zoom = 1; orthoRahmen(); }
    steuerung.update();
  }

  /* Der orthografische Ausschnitt so groß, wie die Perspektive ihn am Zielpunkt
   * zeigte — beim Umschalten springt die Wolke nicht. */
  function orthoRahmen() {
    const w = wurzel.clientWidth, h = wurzel.clientHeight;
    const abstand = orthoKamera.position.distanceTo(steuerung.target);
    const hh = abstand * Math.tan(perspektive.fov * Math.PI / 360);
    orthoKamera.top = hh; orthoKamera.bottom = -hh;
    orthoKamera.left = -hh * w / h; orthoKamera.right = hh * w / h;
    orthoKamera.updateProjectionMatrix();
  }
  function ansichtSetzen(art) {
    const neuK = art === 'ortho' ? orthoKamera : perspektive;
    if (neuK === kamera) return;
    if (neuK === orthoKamera) {
      orthoKamera.position.copy(perspektive.position);
      orthoKamera.quaternion.copy(perspektive.quaternion);
      orthoKamera.zoom = 1;
    } else {
      // Zurück: so weit weg, wie der orthografische Zoom zuletzt zeigte
      const richtung = orthoKamera.position.clone().sub(steuerung.target);
      perspektive.position.copy(steuerung.target).add(richtung.divideScalar(orthoKamera.zoom));
      perspektive.quaternion.copy(orthoKamera.quaternion);
    }
    kamera = neuK;
    steuerung.object = kamera;
    material.uniforms.ortho.value = edl.uniforms.ortho.value = kamera === orthoKamera ? 1 : 0;
    groesseSetzen();
    steuerung.update();
  }
  heim();

  /* ---------- Färbung ---------- */
  let faerbung = 'klasse';
  const tmp = new THREE.Color();
  // Intensität: zwischen dem 2. und 98. Prozent strecken, sonst ist fast alles dunkel
  /* Intensität per Histogrammausgleich: Jeder Wert wird zu seinem Rang unter allen
   * Punkten (0…1). Die Werte ballen sich unten, wenige helle Dächer und Markierungen
   * zogen die lineare Streckung (2.–98. Prozent) nach oben — fast alles war dunkel
   * (so bemängelt, 04.11.2026). Tabelle über alle Werte bis iMax (höchstens 65 536). */
  const iRang = new Float32Array((d.iMax || 0) + 1);
  {
    const zaehl = new Uint32Array(iRang.length);
    for (let i = 0; i < n; i++) zaehl[d.staerke[i]]++;
    let summe = 0;
    for (let w = 0; w < zaehl.length; w++) { iRang[w] = (summe + zaehl[w] / 2) / (n || 1); summe += zaehl[w]; }
  }
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
        // Etwas Grundhelligkeit, damit die dunkelsten Punkte nicht im Hintergrund verschwinden
        const g = 0.08 + 0.92 * iRang[d.staerke[i]];
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
  // Als Knöpfe wie die Auflagen in Topovo: gefüllt = an, das Farbfeld davor wie bei den Parzellen
  $('.lz-klassen').innerHTML = d.klassen.map(([k, anzahl]) => `
    <button type="button" class="seg-btn is-on lz-klasse" data-klasse="${k}" aria-pressed="true">
      <span class="lz-feld" style="background:${klasseFarbe(k)}"></span><span class="lz-name">${klasseName(k)}</span>
      <small>${anzahl.toLocaleString('de-DE')}</small></button>`).join('');
  wurzel.querySelectorAll('[data-klasse]').forEach(b => b.addEventListener('click', () => {
    const an = !b.classList.contains('is-on');
    b.classList.toggle('is-on', an);
    b.setAttribute('aria-pressed', String(an));
    masken[Number(b.dataset.klasse) & 31] = an ? 1 : 0;
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
    // Die Intensität ist selbst ein Grauwert — Schatten darüber macht sie nur dunkler
    if (faerbung === 'intensitaet' && lichtRegler.value > 0) { lichtRegler.value = 0; reglerZeigen(); }
    wurzel.querySelectorAll('[data-faerbung]').forEach(x => x.classList.toggle('is-on', x === b));
    faerben();
  }));
  wurzel.querySelectorAll('[data-kamera]').forEach(b => b.addEventListener('click', () => {
    ansichtSetzen(b.dataset.kamera);
    wurzel.querySelectorAll('[data-kamera]').forEach(x => x.classList.toggle('is-on', x === b));
  }));
  wurzel.querySelectorAll('[data-grund]').forEach(b => b.addEventListener('click', () => {
    if (b.closest('.lz-tafel')) {
      wurzel.dataset.grund = b.dataset.grund;
      wurzel.querySelectorAll('.lz-tafel [data-grund]').forEach(x => x.classList.toggle('is-on', x === b));
    }
  }));
  const groesse = $('.lz-groesse'), edlRegler = $('.lz-edl'), lichtRegler = $('.lz-licht');
  /* Punktgröße am Anfang nach dem Abstand der Punkte: so groß, dass sich die
   * Scanreihen berühren — Lücken dazwischen zeichnete die Kantenschattierung
   * sonst ebenfalls als feine Linien. */
  const abstandPunkte = 1 / Math.sqrt(Math.max(0.01, n / (info.seite * info.seite)));
  groesse.value = String(Math.min(150, Math.max(15, Math.round(abstandPunkte * 1.25 * 20) * 5)));
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
   * Wie die Messwerkzeuge von Potree im PW-Viewer: Distanz ist ein Linienzug
   * mit der Länge je Abschnitt und der Summe, Fläche ein geschlossener Zug mit
   * Seitenlängen und waagerechter Fläche, Höhe der Unterschied zweier Punkte —
   * waagerechte Linie oben vom höheren, senkrechte hinunter zum tieferen, Δh daneben. Eine
   * Messung läuft in der Leiste unten (Zurück, Fertig); die Art bleibt an, bis
   * man sie mit × beendet. Linien in der Messfarbe von Topovo (--warn).
   * Gerechnet in UTM32 und NHN: die Punkte stehen relativ zu d.mitte und d.zMin. */
  const MESS = {
    distanz: { titel: 'Distanz', min: 2, hinweis: 'Punkte antippen — Fertig schließt den Linienzug ab.' },
    flaeche: { titel: 'Fläche', min: 3, hinweis: 'Eckpunkte antippen — Fertig oder Tipp auf den ersten Punkt schließt sie.' },
    hoehe: { titel: 'Höhe', min: 2, hinweis: 'Zwei Punkte antippen, etwa Fuß und Krone einer Böschung.' }
  };
  // Immer das helle Messorange der App (--warn im Dunkelmodus): Der Grund ist stets dunkel,
  // das dunklere Orange des hellen Modus ging auf braunem Boden unter
  const messFarbe = () => new THREE.Color('#ff9f0a');
  const kugelGeo = new THREE.SphereGeometry(1, 14, 10);
  const kugelMat = new THREE.MeshBasicMaterial({ color: messFarbe(), depthTest: false });
  const linieMat = new THREE.LineBasicMaterial({ color: messFarbe(), depthTest: false });
  const strichMat = new THREE.LineDashedMaterial({ color: messFarbe(), depthTest: false, dashSize: 0.6, gapSize: 0.4 });
  const kugeln = [];
  const messungen = [];          // { teile: [Object3D], schilder: [{ p, el }] }
  let messArt = null, offen = null, zuletzt = null;   // zuletzt: die eben abgeschlossene, ihr Wert bleibt in der Leiste
  const marken = $('.lz-marken'), leiste = $('.lz-leiste'), menue = $('.lz-mess-menue');
  const loeschen = $('.lz-loeschen');

  const ost = x => (x + d.mitte[0]).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  const nord = y => (y + d.mitte[1]).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  const nhn = z => zahl(z + d.zMin);

  function kugel(p) {
    const k = new THREE.Mesh(kugelGeo, kugelMat);
    k.position.copy(p);
    messSzene.add(k);
    kugeln.push(k);
    return k;
  }
  function linie(punkte, { zu = false, gestrichelt = false } = {}) {
    const g = new THREE.BufferGeometry().setFromPoints(punkte);
    const l = zu ? new THREE.LineLoop(g, linieMat) : new THREE.Line(g, gestrichelt ? strichMat : linieMat);
    if (gestrichelt) l.computeLineDistances();
    messSzene.add(l);
    return l;
  }
  // lage: wohin das Schild vom Punkt aus rückt — darüber, darunter oder rechts daneben
  const LAGE = { oben: 'translate(-50%, -125%)', unten: 'translate(-50%, 35%)', rechts: 'translate(12px, -50%)' };
  function schild(p, html, art = '', lage = 'oben') {
    const el = document.createElement('div');
    el.className = 'lz-marke' + (art ? ' ' + art : '');
    el.innerHTML = html;
    marken.appendChild(el);
    return { p: p.clone(), el, lage: LAGE[lage] };
  }
  function wegNehmen(m) {
    for (const t of m.teile) {
      messSzene.remove(t);
      const i = kugeln.indexOf(t);
      if (i >= 0) kugeln.splice(i, 1);
      if (t.geometry && t.geometry !== kugelGeo) t.geometry.dispose();
    }
    for (const s of m.schilder) s.el.remove();
    m.teile = []; m.schilder = [];
  }

  /** Zeichnet die laufende oder fertige Messung aus ihren Punkten neu. */
  function zeichnen(m) {
    wegNehmen(m);
    const p = m.punkte;
    for (const q of p) m.teile.push(kugel(q));
    let wert = '';
    if (m.art === 'hoehe' && p.length === 2) {
      const [tief, hoch] = p[0].z <= p[1].z ? p : [p[1], p[0]];
      /* Waagerecht oben vom höheren Punkt bis über den tieferen, dort senkrecht
       * hinunter — so steht Δh am tieferen Punkt (so gewünscht, 04.11.2026). */
      const ecke = new THREE.Vector3(tief.x, tief.y, hoch.z);
      const dh = hoch.z - tief.z, waag = Math.hypot(hoch.x - tief.x, hoch.y - tief.y);
      m.teile.push(linie([hoch, ecke], { gestrichelt: true }), linie([ecke, tief]));
      m.schilder.push(schild(ecke.clone().add(tief).multiplyScalar(0.5), `<b>Δh ${zahl(dh)} m</b>`, 'gross', 'rechts'));
      m.schilder.push(schild(hoch, `H ${nhn(hoch.z)}`), schild(tief, `H ${nhn(tief.z)}`, '', 'unten'));
      wert = `Δh ${zahl(dh)} m · waagerecht ${zahl(waag)} m · Neigung ${waag ? zahl(dh / waag * 100, 1) : '–'} %`;
    } else if (p.length === 1) {
      m.schilder.push(schild(p[0], `H ${nhn(p[0].z)}`));
      wert = `H ${nhn(p[0].z)} m · E ${ost(p[0].x)} · N ${nord(p[0].y)}`;
    } else if (p.length > 1) {
      const zu = m.art === 'flaeche' && m.fertig;
      m.teile.push(linie(p, { zu }));
      const seiten = zu ? p.length : p.length - 1;
      let summe = 0;
      for (let i = 0; i < seiten; i++) {
        const a = p[i], b = p[(i + 1) % p.length], l = a.distanceTo(b);
        summe += l;
        m.schilder.push(schild(a.clone().add(b).multiplyScalar(0.5), `${zahl(l)} m`));
      }
      if (m.art === 'flaeche' && p.length >= 3) {
        let f = 0;
        const mitte = new THREE.Vector3();
        p.forEach((a, i) => { const b = p[(i + 1) % p.length]; f += a.x * b.y - b.x * a.y; mitte.add(a); });
        mitte.divideScalar(p.length);
        f = Math.abs(f) / 2;
        if (zu) m.schilder.push(schild(mitte, `<b>${zahl(f)} m²</b>`, 'gross'));
        wert = `${zahl(f)} m² · Umfang ${zahl(summe + (zu ? 0 : p[p.length - 1].distanceTo(p[0])))} m`;
      } else {
        if (seiten > 1) m.schilder.push(schild(p[p.length - 1], `<b>Σ ${zahl(summe)} m</b>`, 'gross'));
        const dh = p[p.length - 1].z - p[0].z;
        wert = `${zahl(summe)} m · Δh Anfang–Ende ${dh >= 0 ? '+' : '−'}${zahl(Math.abs(dh))} m`;
      }
    }
    m.wert = wert;
    neu = true;
  }

  function leisteZeigen() {
    leiste.hidden = !messArt;
    $('.lz-messen').classList.toggle('is-on', !!messArt);
    if (!messArt) return;
    const def = MESS[messArt], n = offen ? offen.punkte.length : 0;
    $('.lz-mess-titel').textContent = def.titel;
    const wert = offen ? offen.wert : zuletzt && zuletzt.art === messArt ? zuletzt.wert : '';
    $('.lz-mess-wert').textContent = wert;
    $('.lz-mess-wert').hidden = !wert;
    $('.lz-mess-hinweis').textContent = def.hinweis;
    $('.lz-zurueck').disabled = !n;
    $('.lz-fertig').disabled = n < def.min || messArt === 'hoehe';
    $('.lz-fertig').hidden = messArt === 'hoehe';
  }

  function abschliessen() {
    if (!offen || offen.punkte.length < MESS[offen.art].min) return;
    offen.fertig = true;
    zeichnen(offen);
    messungen.push(offen);
    zuletzt = offen;
    offen = null;
    loeschen.disabled = false;
    leisteZeigen();
  }
  function messArtSetzen(art) {
    if (offen) { wegNehmen(offen); offen = null; }
    messArt = art;
    menue.querySelectorAll('[data-mess]').forEach(b => b.classList.toggle('is-on', b.dataset.mess === art));
    leisteZeigen();
    neu = true;
  }
  function menueZeigen(an) {
    if (desktop.matches) an = true;          // in der Leiste steht die Wahl immer da
    menue.hidden = !an;
    $('.lz-messen').setAttribute('aria-expanded', String(an));
  }
  $('.lz-messen').addEventListener('click', () => menueZeigen(menue.hidden));
  menue.querySelectorAll('[data-mess]').forEach(b => b.addEventListener('click', () => { messArtSetzen(b.dataset.mess); menueZeigen(false); }));
  $('.lz-mess-ende').addEventListener('click', () => messArtSetzen(null));
  $('.lz-fertig').addEventListener('click', abschliessen);
  $('.lz-zurueck').addEventListener('click', () => {
    if (!offen) return;
    offen.punkte.pop();
    if (offen.punkte.length) zeichnen(offen); else { wegNehmen(offen); offen = null; }
    leisteZeigen();
  });
  loeschen.addEventListener('click', () => {
    if (offen) { wegNehmen(offen); offen = null; }
    for (const m of messungen) wegNehmen(m);
    messungen.length = 0;
    zuletzt = null;
    loeschen.disabled = true;
    menueZeigen(false);
    leisteZeigen();
    neu = true;
  });

  function messTipp(p, cx, cy) {
    // Fläche: ein Tipp auf den ersten Punkt schließt sie
    if (offen && offen.art === 'flaeche' && offen.punkte.length >= 3) {
      const v0 = offen.punkte[0].clone().project(kamera), r = flaeche.getBoundingClientRect();
      if (Math.hypot((v0.x + 1) / 2 * r.width + r.left - cx, (1 - v0.y) / 2 * r.height + r.top - cy) < 16) { abschliessen(); return; }
    }
    if (!offen) offen = { art: messArt, punkte: [], teile: [], schilder: [], fertig: false, wert: '' };
    offen.punkte.push(p);
    zeichnen(offen);
    if (messArt === 'hoehe' && offen.punkte.length === 2) abschliessen();
    leisteZeigen();
  }

  /* Messpunkte verschieben, wie in Potree: einen Punkt greifen (bis 18 Bildpunkte
   * daneben), ziehen — er rastet auf dem Laserpunkt unter dem Finger ein, und die
   * Messung rechnet sich mit. Greift vor OrbitControls (Einfangphase an der
   * Wurzel), damit die Ansicht dabei stillsteht. Gesucht wird höchstens einmal
   * je Bild; das Suchen kostet bei einer Million Punkte rund 20 ms. */
  function messpunktAn(cx, cy) {
    const r = flaeche.getBoundingClientRect();
    let best = null, bestAbstand = 18;
    for (const m of offen ? [...messungen, offen] : messungen) {
      m.punkte.forEach((q, i) => {
        v.copy(q).project(kamera);
        if (v.z >= 1) return;
        const a = Math.hypot((v.x + 1) / 2 * r.width + r.left - cx, (1 - v.y) / 2 * r.height + r.top - cy);
        if (a < bestAbstand) { bestAbstand = a; best = { m, i }; }
      });
    }
    return best;
  }
  let gezogen = null, zugZiel = null, zugBild = 0;
  wurzel.addEventListener('pointerdown', ev => {
    if (ev.target !== flaeche || ev.button > 0) return;
    const treffer = messpunktAn(ev.clientX, ev.clientY);
    if (!treffer) return;
    ev.stopPropagation();
    ev.preventDefault();
    gezogen = { ...treffer, id: ev.pointerId };
    steuerung.enabled = false;
    flaeche.setPointerCapture(ev.pointerId);
    flaeche.classList.add('zieht');
  }, true);
  flaeche.addEventListener('pointermove', ev => {
    if (!gezogen || ev.pointerId !== gezogen.id) return;
    zugZiel = [ev.clientX, ev.clientY];
    if (zugBild) return;
    zugBild = requestAnimationFrame(() => {
      zugBild = 0;
      const p = zugZiel && punktAn(zugZiel[0], zugZiel[1]);
      if (!p || !gezogen) return;
      gezogen.m.punkte[gezogen.i] = p;
      zeichnen(gezogen.m);
      if (gezogen.m !== offen) zuletzt = gezogen.m;      // ihr Wert erscheint in der Leiste
      leisteZeigen();
    });
  });
  const zugEnde = ev => {
    if (!gezogen || ev.pointerId !== gezogen.id) return;
    // Der letzte Zug, falls sein Bild noch aussteht
    if (zugBild) { cancelAnimationFrame(zugBild); zugBild = 0; }
    const p = punktAn(ev.clientX, ev.clientY);
    if (p) {
      gezogen.m.punkte[gezogen.i] = p;
      zeichnen(gezogen.m);
      if (gezogen.m !== offen) zuletzt = gezogen.m;
      leisteZeigen();
    }
    gezogen = null;
    steuerung.enabled = true;
    flaeche.classList.remove('zieht');
    runter = null;           // kein Tipp hinterher
  };
  flaeche.addEventListener('pointerup', zugEnde, true);
  flaeche.addEventListener('pointercancel', zugEnde, true);

  /* Tippen, nicht Ziehen: unter 6 Bildpunkten Weg, nur linke Taste bzw. ein Finger.
   * Kam ein zweiter Finger dazu (Zoomen), zählt das Loslassen nicht als Tipp —
   * sonst setzte ein ruhender Finger beim Zoomen einen Messpunkt. */
  let runter = null, letzterTipp = 0;
  const zeiger = new Set();
  flaeche.addEventListener('pointerdown', ev => {
    zeiger.add(ev.pointerId);
    runter = zeiger.size === 1 && ev.button === 0 ? { x: ev.clientX, y: ev.clientY, id: ev.pointerId } : null;
  });
  const fingerWeg = ev => zeiger.delete(ev.pointerId);
  flaeche.addEventListener('pointercancel', fingerWeg);
  flaeche.addEventListener('pointerup', ev => {
    fingerWeg(ev);
    const tipp = runter && runter.id === ev.pointerId && Math.hypot(ev.clientX - runter.x, ev.clientY - runter.y) <= 6;
    runter = null;
    if (!tipp) return;
    const jetzt = Date.now(), doppelt = jetzt - letzterTipp < 320;
    letzterTipp = jetzt;
    const p = punktAn(ev.clientX, ev.clientY);
    if (!p) return;
    if (messArt) messTipp(p, ev.clientX, ev.clientY);
    // Doppeltipp: um diesen Punkt drehen
    else if (doppelt) { steuerung.target.copy(p); steuerung.update(); neu = true; }
  });

  /* ---------- Desktop: Spalte und Leiste wie in Topovo ----------
   * Ab 1010 px (dieselbe Grenze wie SEITENLEISTE in app.js) wandern Tafel,
   * Messwahl und Messleiste in die Glasleiste links; die runden Knöpfe in den
   * Ecken treten zurück. Ein Tipp aufs gewählte Symbol klappt die Leiste zu.
   * Die Wolke rückt per setViewOffset in die Mitte der freien Fläche. */
  const desktop = window.matchMedia('(min-width: 1010px)');
  const seite = $('.lz-seite'), fussVor = $('.lz-marken');
  let bereich = 'darstellung', seiteZu = false;
  const freiLinks = () => !desktop.matches ? 0 : seiteZu ? 64 : 384;
  function anordnen() {
    if (desktop.matches) {
      seite.querySelector('[data-bereich="darstellung"]').appendChild(tafel);
      const m = seite.querySelector('[data-bereich="messen"]');
      m.appendChild(menue);
      m.appendChild(leiste);
      tafel.hidden = false;
      menue.hidden = false;
    } else {
      for (const el of [tafel, menue, leiste]) wurzel.insertBefore(el, fussVor);
      tafel.hidden = true;
      menue.hidden = true;
      einst.classList.remove('is-on');
    }
    bereichZeigen();
  }
  function bereichZeigen() {
    wurzel.classList.toggle('seite-zu', seiteZu);
    seite.querySelectorAll('[data-bereich]').forEach(sec => { sec.hidden = sec.dataset.bereich !== bereich; });
    wurzel.querySelectorAll('.lz-schiene [data-lz]').forEach(b =>
      b.classList.toggle('is-on', !seiteZu && b.dataset.lz === bereich));
    groesseSetzen();
  }
  wurzel.querySelectorAll('.lz-schiene [data-lz]').forEach(b => b.addEventListener('click', () => {
    const was = b.dataset.lz;
    if (was === 'karte') return schliessen();
    if (was === 'heim') return heim();
    if (was === bereich && !seiteZu) seiteZu = true;
    else { bereich = was; seiteZu = false; }
    bereichZeigen();
  }));
  desktop.addEventListener('change', anordnen);
  $('.lz-seite-unter').textContent = `Kachel ${info.kachel} · ${info.seite} × ${info.seite} m`;

  /* ---------- Zeichnen ---------- */
  let neu = true, laeuft = true;
  steuerung.addEventListener('change', () => { neu = true; });
  function groesseSetzen() {
    const w = wurzel.clientWidth, h = wurzel.clientHeight;
    renderer.setSize(w, h, false);
    perspektive.aspect = w / h;
    if (kamera === orthoKamera) orthoRahmen();
    // Die Mitte des Bildes in die Mitte der freien Fläche rechts der Leiste
    const links = freiLinks();
    if (links) kamera.setViewOffset(w, h, -links / 2, 0, w, h);
    else kamera.clearViewOffset();
    kamera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    // Das Ziel genau so groß wie die Zeichenfläche — Bildpunkt für Bildpunkt
    const flaecheGr = renderer.getDrawingBufferSize(new THREE.Vector2());
    ziel.setSize(flaecheGr.x, flaecheGr.y);
    edl.uniforms.groesse.value = [flaecheGr.x, flaecheGr.y];   // ivec2: als Liste, nicht als Vector2
    // Bei hoher Pixeldichte (Handy) die Nachbarn zwei Bildpunkte weit: sonst wirken die Kanten haarfein
    edl.uniforms.radius.value = pr >= 2 ? 2 : 1;
    material.uniforms.skala.value = h * pr / (2 * Math.tan(perspektive.fov * Math.PI / 360));
    material.uniforms.maxPx.value = 24 * pr;
    neu = true;
  }
  const beobachter = new ResizeObserver(groesseSetzen);
  beobachter.observe(wurzel);
  anordnen();

  const v = new THREE.Vector3();
  /* Nah- und Fernebene eng um die Wolke: Die Genauigkeit der Tiefe verteilt
   * sich auf diesen Bereich, und 0,5 m bis 5 km verschenkte fast alles. */
  const kugelWolke = geo.boundingSphere;
  function tiefeAnpassen() {
    const abstand = kamera.position.distanceTo(kugelWolke.center), r = kugelWolke.radius;
    kamera.near = Math.max(0.1, (abstand - r) * 0.9, abstand * 0.002);
    kamera.far = abstand + r * 1.1;
    kamera.updateProjectionMatrix();
    if (kamera === orthoKamera) {
      // Bildpunkte je Meter für die Punktgröße
      const hoehePx = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
      material.uniforms.orthoSkala.value = hoehePx * orthoKamera.zoom / (orthoKamera.top - orthoKamera.bottom);
    }
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
    for (const k of kugeln) k.scale.setScalar(kamera === orthoKamera
      ? (orthoKamera.top - orthoKamera.bottom) / orthoKamera.zoom * 0.0045
      : kamera.position.distanceTo(k.position) * 0.006);
    renderer.setRenderTarget(ziel);
    renderer.clear();
    renderer.render(szene, kamera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(schirmSzene, schirmKamera);
    renderer.autoClear = false;
    renderer.render(messSzene, kamera);
    renderer.autoClear = true;
    // Beschriftungen der Messungen an ihre Stelle im Bild
    const r = flaeche.getBoundingClientRect();
    for (const m of offen ? [...messungen, offen] : messungen) {
      for (const sch of m.schilder) {
        v.copy(sch.p).project(kamera);
        const sicht = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
        sch.el.hidden = !sicht;
        if (sicht) sch.el.style.transform = `translate(${(v.x + 1) / 2 * r.width}px, ${(1 - v.y) / 2 * r.height}px) ${sch.lage}`;
      }
    }
  }

  /* Unten steht nur die Pflichtangabe (CC BY 4.0). Bedienung, Kachel, Punkte
   * und Zeiten stehen in der Tafel unter „Ausschnitt"; die Bedienung zeigt sich
   * beim Öffnen einige Sekunden über der Fußzeile — alles zusammen waren unten
   * fünf Zeilen (so nicht gewollt, 04.11.2026). */
  const finger = window.matchMedia('(pointer: coarse)').matches;
  const bedienung = finger ? 'Ein Finger drehen · zwei Finger schieben und zoomen · Doppeltipp: Drehpunkt'
    : 'Ziehen: drehen · rechte Taste oder Shift: schieben · Rad: zoomen · Doppelklick: Drehpunkt';
  $('.lz-fuss').textContent = `Laserdaten: ${info.quelle}`;
  $('.lz-info').innerHTML = [
    `Kachel ${info.kachel}`,
    `${d.anzahl.toLocaleString('de-DE')} Punkte${d.schritt > 1 ? `, jeder ${d.schritt}.` : ''} · ${info.seite} × ${info.seite} m`,
    d.zeiten ? [d.zeiten.megabyte ? `Laden ${zahl(d.zeiten.laden, 0)} s (${zahl(d.zeiten.megabyte, 0)} MB)` : 'Kacheln aus dem Speicher',
      `Entpacken ${zahl(d.zeiten.lesen, 0)} s`, `Normalen ${zahl(d.zeiten.normalen, 0)} s`].join(' · ') : '',
    bedienung
  ].filter(Boolean).map(z => `<p class="fine">${z}</p>`).join('');
  const tipp = $('.lz-tipp');
  tipp.textContent = bedienung;
  setTimeout(() => tipp.classList.add('weg'), 6000);
  reglerZeigen();
  faerben();
  bild();

  function schliessen() {
    laeuft = false;
    beobachter.disconnect();
    desktop.removeEventListener('change', anordnen);
    steuerung.stopListenToKeyEvents();
    steuerung.dispose();
    for (const m of offen ? [...messungen, offen] : messungen) wegNehmen(m);
    geo.dispose(); material.dispose(); edl.dispose(); ziel.dispose(); schirm.geometry.dispose();
    kugelGeo.dispose(); kugelMat.dispose(); linieMat.dispose(); strichMat.dispose();
    /* dispose() gibt den WebGL-Kontext nicht frei: Browser halten nur rund 16, danach
     * verliert der älteste — womöglich der von MapLibre oder dem Radar. */
    renderer.dispose();
    renderer.forceContextLoss();
    document.removeEventListener('keydown', taste);
    wurzel.remove();
    if (beimSchliessen) beimSchliessen();
  }
  const taste = ev => { if (ev.key === 'Escape') schliessen(); };
  document.addEventListener('keydown', taste);
  $('.lz-zu').addEventListener('click', schliessen);
  return schliessen;
}
