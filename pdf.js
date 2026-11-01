/* Topovo — ein kleiner PDF-Schreiber für den Profil-Export
 *
 * Genug für eine Seite mit Vektorgrafik, Text und einem Luftbild: Linienzüge,
 * Flächen, Strichelung, Text in Helvetica (eine der 14 Grundschriften, die
 * jedes PDF-Programm mitbringt — nichts wird eingebettet) und JPEG-Bilder, die
 * unverändert hineinkommen. Bewusst ohne jsPDF: rund 350 kB für ein paar
 * Linien, und die CSP bleibt bei script-src 'self'.
 *
 * Koordinaten in Punkt (1/72 Zoll), Ursprung oben links — umgerechnet wird
 * erst beim Schreiben. Text läuft über WinAnsiEncoding: Umlaute, ß, °, ±, ‰,
 * ·, ×, Gedankenstrich gehen; das Minuszeichen U+2212 wird zum Halbgeviertstrich.
 *
 *   const dok = new PdfDokument({ titel: 'Querprofil' });
 *   const s = dok.seite();
 *   s.linie([[50, 50], [200, 80]], { farbe: '#1761a3', breite: 1.5 });
 *   s.text(50, 120, 'Höhe 244,6 m ü. NHN', { groesse: 11, fett: true });
 *   const blob = new Blob([await dok.bytes()], { type: 'application/pdf' });
 */

const PDF_A4_QUER = [841.89, 595.28];

/* Laufweiten aus den AFM-Dateien von Helvetica und Helvetica-Bold, in
 * Tausendstel der Schriftgröße, für die Zeichen 32–126. */
const PDF_BREITEN = {
  normal: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  fett: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]
};
// Die übrigen Zeichen, die hier vorkommen können: [normal, fett] je WinAnsi-Code
const PDF_BREITEN_MEHR = {
  0x80: [556, 556], 0x84: [333, 500], 0x85: [1000, 1000], 0x89: [1000, 1000], 0x91: [222, 278],
  0x92: [222, 278], 0x93: [333, 500], 0x94: [333, 500], 0x95: [350, 350], 0x96: [556, 556],
  0x97: [1000, 1000], 0xA0: [278, 278], 0xA7: [556, 556], 0xAB: [556, 556], 0xB0: [400, 400],
  0xB1: [584, 584], 0xB2: [333, 333], 0xB3: [333, 333], 0xB5: [556, 611], 0xB7: [278, 278],
  0xBB: [556, 556], 0xD7: [584, 584], 0xDF: [611, 611]
};
// Windows-1252 zwischen 0x80 und 0x9F, und was sonst sinnvoll ersetzt wird
const PDF_WINANSI = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‰': 0x89, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '−': 0x96, ' ': 0xA0, ' ': 0x20
};

/** Text → WinAnsi-Codes. Was es dort nicht gibt, wird zum Fragezeichen. */
function pdfCodes(text) {
  const raus = [];
  for (const z of String(text)) {
    const c = z.codePointAt(0);
    if (PDF_WINANSI[z] !== undefined) raus.push(PDF_WINANSI[z]);
    else if (c >= 32 && c < 127) raus.push(c);
    else if (c >= 0xA0 && c <= 0xFF) raus.push(c);
    else if (z === '→') raus.push(45, 62);
    else if (c >= 32) raus.push(63);
  }
  return raus;
}

function pdfZeichenBreite(code, fett) {
  if (code >= 32 && code < 127) return PDF_BREITEN[fett ? 'fett' : 'normal'][code - 32];
  const mehr = PDF_BREITEN_MEHR[code];
  if (mehr) return mehr[fett ? 1 : 0];
  if (code >= 0xC0) {
    // Buchstaben mit Akzent laufen so breit wie der Grundbuchstabe
    const grund = String.fromCharCode(code).normalize('NFD').charCodeAt(0);
    if (grund < 127) return PDF_BREITEN[fett ? 'fett' : 'normal'][grund - 32];
  }
  return 556;
}

/** Breite eines Textes in Punkt. */
function pdfTextBreite(text, groesse, fett = false) {
  return pdfCodes(text).reduce((s, c) => s + pdfZeichenBreite(c, fett), 0) * groesse / 1000;
}

/** '#rrggbb' → 'r g b' für die Farboperatoren. */
function pdfFarbe(hex) {
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
}

const pdfZahl = v => (Math.round(v * 100) / 100).toString();

/** Größe und Farbkanäle aus dem Kopf einer JPEG-Datei. */
function pdfJpegKopf(b) {
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { hoehe: (b[i + 5] << 8) | b[i + 6], breite: (b[i + 7] << 8) | b[i + 8], kanaele: b[i + 9] };
    }
    i += 2 + len;
  }
  throw new Error('JPEG ohne lesbaren Kopf');
}

class PdfSeite {
  constructor(dok, breite, hoehe) {
    this.dok = dok;
    this.breite = breite;
    this.hoehe = hoehe;
    this.ops = [];
    this.bilder = new Set();
  }

  /* Ursprung oben links; PDF zählt von unten */
  y(v) { return pdfZahl(this.hoehe - v); }

  /** Linienzug oder Fläche. punkte: [[x, y], …] */
  linie(punkte, { farbe = '#000000', breite = 1, strichel = null, schliessen = false, fuellung = null, rund = true } = {}) {
    if (!punkte || punkte.length < 2) return;
    const o = ['q'];
    if (rund) o.push('1 j 1 J');
    if (farbe) o.push(`${pdfFarbe(farbe)} RG`, `${pdfZahl(breite)} w`);
    if (fuellung) o.push(`${pdfFarbe(fuellung)} rg`);
    o.push(strichel ? `[${strichel.map(pdfZahl).join(' ')}] 0 d` : '[] 0 d');
    o.push(`${pdfZahl(punkte[0][0])} ${this.y(punkte[0][1])} m`);
    for (let i = 1; i < punkte.length; i++) o.push(`${pdfZahl(punkte[i][0])} ${this.y(punkte[i][1])} l`);
    if (schliessen || fuellung) o.push('h');
    o.push(fuellung && farbe ? 'B' : fuellung ? 'f' : 'S', 'Q');
    this.ops.push(o.join('\n'));
  }

  rechteck(x, y, w, h, wie = {}) {
    this.linie([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { schliessen: true, rund: false, ...wie });
  }

  /** anker: 'start', 'middle' oder 'end' — wie in SVG. */
  text(x, y, text, { groesse = 10, fett = false, farbe = '#000000', anker = 'start' } = {}) {
    const codes = pdfCodes(text);
    if (!codes.length) return;
    const w = codes.reduce((s, c) => s + pdfZeichenBreite(c, fett), 0) * groesse / 1000;
    const x0 = anker === 'middle' ? x - w / 2 : anker === 'end' ? x - w : x;
    // Klammern und Rückstrich maskieren, alles über 126 oktal — der Inhalt bleibt ASCII
    const s = codes.map(c => c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c)
      : c < 127 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0')).join('');
    this.ops.push(`BT /${fett ? 'F2' : 'F1'} ${pdfZahl(groesse)} Tf ${pdfFarbe(farbe)} rg ` +
      `${pdfZahl(x0)} ${this.y(y)} Td (${s}) Tj ET`);
    return w;
  }

  /** Ein mit dok.bild() angemeldetes JPEG in den Rahmen x, y, w, h. */
  bild(id, x, y, w, h) {
    this.bilder.add(id);
    this.ops.push(`q ${pdfZahl(w)} 0 0 ${pdfZahl(h)} ${pdfZahl(x)} ${this.y(y + h)} cm /Im${id} Do Q`);
  }

  /** Was in zeichnen() entsteht, wird auf das Rechteck beschnitten. */
  beschnitten(x, y, w, h, zeichnen) {
    this.ops.push(`q ${pdfZahl(x)} ${this.y(y + h)} ${pdfZahl(w)} ${pdfZahl(h)} re W n`);
    zeichnen();
    this.ops.push('Q');
  }
}

class PdfDokument {
  constructor({ titel = '', autor = 'Topovo' } = {}) {
    this.titel = titel;
    this.autor = autor;
    this.seiten = [];
    this.bilder = [];
  }

  seite(breite = PDF_A4_QUER[0], hoehe = PDF_A4_QUER[1]) {
    const s = new PdfSeite(this, breite, hoehe);
    this.seiten.push(s);
    return s;
  }

  /** JPEG anmelden (Uint8Array); liefert die Nummer für seite.bild(). */
  bild(jpeg) {
    const kopf = pdfJpegKopf(jpeg);
    this.bilder.push({ jpeg, ...kopf });
    return this.bilder.length - 1;
  }

  /** Das fertige PDF als Uint8Array. Die Seiteninhalte gehen gepackt hinein,
   *  wo der Browser CompressionStream kennt. */
  async bytes() {
    const enc = new TextEncoder();
    const teile = [];
    let laenge = 0;
    const offsets = [];
    const schreib = x => { const b = typeof x === 'string' ? enc.encode(x) : x; teile.push(b); laenge += b.length; };
    const objekt = (nr, inhalt, strom = null) => {
      offsets[nr] = laenge;
      schreib(`${nr} 0 obj\n${inhalt}\n`);
      if (strom) { schreib('stream\n'); schreib(strom); schreib('\nendstream\n'); }
      schreib('endobj\n');
    };
    const packen = async text => {
      const roh = enc.encode(text);
      if (typeof CompressionStream === 'undefined') return { daten: roh, filter: '' };
      const s = new Blob([roh]).stream().pipeThrough(new CompressionStream('deflate'));
      return { daten: new Uint8Array(await new Response(s).arrayBuffer()), filter: ' /Filter /FlateDecode' };
    };
    const pdfText = t => '(' + pdfCodes(t).map(c => c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c)
      : c < 127 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0')).join('') + ')';

    schreib('%PDF-1.4\n');
    schreib(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   // Binärmarke: „die Datei ist nicht reiner Text"

    // 1 Katalog, 2 Seitenbaum, 3/4 Schriften, 5 Info, danach Bilder, dann je Seite Seite + Inhalt
    const ersteBild = 6, ersteSeite = ersteBild + this.bilder.length;
    const seitenNr = this.seiten.map((_, i) => ersteSeite + 2 * i);
    objekt(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objekt(2, `<< /Type /Pages /Count ${this.seiten.length} /Kids [${seitenNr.map(n => `${n} 0 R`).join(' ')}] >>`);
    objekt(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objekt(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const jetzt = new Date(), zz = n => String(n).padStart(2, '0');
    const datum = `D:${jetzt.getFullYear()}${zz(jetzt.getMonth() + 1)}${zz(jetzt.getDate())}${zz(jetzt.getHours())}${zz(jetzt.getMinutes())}${zz(jetzt.getSeconds())}`;
    objekt(5, `<< /Title ${pdfText(this.titel)} /Author ${pdfText(this.autor)} /Producer (Topovo) /CreationDate (${datum}) >>`);
    this.bilder.forEach((b, i) => {
      const farbraum = b.kanaele === 1 ? '/DeviceGray' : b.kanaele === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      objekt(ersteBild + i, `<< /Type /XObject /Subtype /Image /Width ${b.breite} /Height ${b.hoehe} ` +
        `/ColorSpace ${farbraum} /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.jpeg.length} >>`, b.jpeg);
    });
    for (let i = 0; i < this.seiten.length; i++) {
      const s = this.seiten[i], nr = seitenNr[i];
      const bilder = [...s.bilder].map(id => `/Im${id} ${ersteBild + id} 0 R`).join(' ');
      objekt(nr, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfZahl(s.breite)} ${pdfZahl(s.hoehe)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${bilder ? ` /XObject << ${bilder} >>` : ''} >> ` +
        `/Contents ${nr + 1} 0 R >>`);
      const { daten, filter } = await packen(s.ops.join('\n'));
      objekt(nr + 1, `<< /Length ${daten.length}${filter} >>`, daten);
    }

    const anzahl = ersteSeite + 2 * this.seiten.length;
    const xref = laenge;
    schreib(`xref\n0 ${anzahl}\n0000000000 65535 f \n`);
    for (let nr = 1; nr < anzahl; nr++) schreib(`${String(offsets[nr]).padStart(10, '0')} 00000 n \n`);
    schreib(`trailer\n<< /Size ${anzahl} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const raus = new Uint8Array(laenge);
    let o = 0;
    for (const t of teile) { raus.set(t, o); o += t.length; }
    return raus;
  }
}

// Für die Prüfung unter Node; im Browser ohne Wirkung
if (typeof module === 'object' && module.exports) {
  module.exports = { PdfDokument, PdfSeite, pdfTextBreite, pdfCodes, pdfJpegKopf, PDF_A4_QUER };
}
