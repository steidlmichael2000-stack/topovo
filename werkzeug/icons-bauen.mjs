/* Erzeugt die PWA-Icons in icons/ aus icon.svg — Linux-Nachfolger von
 * make-icons.ps1 (das braucht Windows und Chrome/Edge).
 *
 *   node werkzeug/icons-bauen.mjs
 *
 * Gerastert wird im kopflosen Firefox (eigenes leeres Profil, der Firefox des
 * Nutzers bleibt unberührt): SVG groß auf eine Zeichenfläche, dann in Halbschritten
 * herunter — das gibt saubere Kanten auch für den weichen Schatten. Gesteuert über
 * WebDriver BiDi; der WebSocket-Client steht unten selbst, weil Node 18 keinen hat.
 *
 * any (192, 512): mit runden Ecken, außen durchsichtig.
 * maskable (512) und iOS (180): rx 0, die Bänder bis an den Rand — Android und
 * iOS schneiden selbst zu. Die Ortsmarke liegt innerhalb der sicheren Zone
 * (Kreis mit 40 % Radius), weiter außen sind nur Bänder. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import crypto from 'node:crypto';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(wurzel, 'icon.svg'), 'utf8');
const randlos = svg.replace('<rect width="512" height="512" rx="112"/>', '<rect width="512" height="512"/>');
if (randlos === svg) throw new Error('clipPath mit rx 112 nicht gefunden — icon.svg geändert?');

const AUFTRAEGE = [
  { datei: 'icon-192.png', groesse: 192, quelle: svg },
  { datei: 'icon-512.png', groesse: 512, quelle: svg },
  { datei: 'icon-512-maskable.png', groesse: 512, quelle: randlos },
  { datei: 'icon-180.png', groesse: 180, quelle: randlos }
];
const PORT = 9334;

function verbinden(url) {
  return new Promise((ok, fehl) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') } });
    req.on('upgrade', (res, sock) => {
      let puffer = Buffer.alloc(0), teile = [];
      const ws = { onmessage: null, send(text) {
        const daten = Buffer.from(text), maske = crypto.randomBytes(4);
        let kopf;
        if (daten.length < 126) kopf = Buffer.from([0x81, 0x80 | daten.length]);
        else if (daten.length < 65536) { kopf = Buffer.alloc(4); kopf[0] = 0x81; kopf[1] = 0x80 | 126; kopf.writeUInt16BE(daten.length, 2); }
        else { kopf = Buffer.alloc(10); kopf[0] = 0x81; kopf[1] = 0x80 | 127; kopf.writeBigUInt64BE(BigInt(daten.length), 2); }
        sock.write(Buffer.concat([kopf, maske, Buffer.from(daten.map((b, i) => b ^ maske[i % 4]))]));
      }, close() { sock.destroy(); } };
      sock.on('data', stueck => {
        puffer = Buffer.concat([puffer, stueck]);
        for (;;) {
          if (puffer.length < 2) return;
          let laenge = puffer[1] & 0x7f, ab = 2;
          if (laenge === 126) { if (puffer.length < 4) return; laenge = puffer.readUInt16BE(2); ab = 4; }
          else if (laenge === 127) { if (puffer.length < 10) return; laenge = Number(puffer.readBigUInt64BE(2)); ab = 10; }
          if (puffer.length < ab + laenge) return;
          const fin = puffer[0] & 0x80;
          teile.push(puffer.subarray(ab, ab + laenge));
          puffer = puffer.subarray(ab + laenge);
          if (fin) { const text = Buffer.concat(teile).toString(); teile = []; if (ws.onmessage) ws.onmessage(text); }
        }
      });
      ok(ws);
    });
    req.on('error', fehl);
    req.end();
  });
}

const profil = mkdtempSync(join(tmpdir(), 'icons-ff-'));
const ff = spawn('firefox', ['--headless', '--no-remote', '--profile', profil, '--remote-debugging-port', String(PORT)], { stdio: 'ignore' });
try {
  let ws;
  for (let i = 0; i < 40 && !ws; i++) {
    await new Promise(r => setTimeout(r, 500));
    try { ws = await verbinden(`ws://127.0.0.1:${PORT}/session`); } catch { /* startet noch */ }
  }
  if (!ws) throw new Error('Firefox antwortet nicht');
  let id = 0; const offen = new Map();
  ws.onmessage = text => { const m = JSON.parse(text); const o = offen.get(m.id); if (!o) return; offen.delete(m.id); m.type === 'error' ? o.f(new Error(m.message || m.error)) : o.ok(m.result); };
  const senden = (method, params) => new Promise((ok, f) => { const i = ++id; offen.set(i, { ok, f }); ws.send(JSON.stringify({ id: i, method, params })); });
  await senden('session.new', { capabilities: {} });
  // In einem eigenen neuen Tab rechnen: Der Starttab gilt als Systemseite
  const ctx = (await senden('browsingContext.create', { type: 'tab' })).context;

  for (const a of AUFTRAEGE) {
    const ausdruck = `(async () => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(a.quelle)});
      await img.decode();
      let seite = 2048, c = document.createElement('canvas');
      c.width = c.height = seite;
      c.getContext('2d').drawImage(img, 0, 0, seite, seite);
      while (seite / 2 >= ${a.groesse}) {
        const n = document.createElement('canvas'); n.width = n.height = seite / 2;
        const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, seite / 2, seite / 2);
        c = n; seite /= 2;
      }
      const z = document.createElement('canvas'); z.width = z.height = ${a.groesse};
      const g = z.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, ${a.groesse}, ${a.groesse});
      return z.toDataURL('image/png').split(',')[1];
    })()`;
    const erg = await senden('script.evaluate', { expression: ausdruck, target: { context: ctx }, awaitPromise: true });
    writeFileSync(join(wurzel, 'icons', a.datei), Buffer.from(erg.result.value, 'base64'));
    console.log('ok', a.datei, a.groesse);
  }
  await senden('session.end', {}).catch(() => {});
  ws.close();
} finally {
  ff.kill();
  await new Promise(r => setTimeout(r, 800));
  rmSync(profil, { recursive: true, force: true });
}
