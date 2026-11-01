/* Regressionstests für Service Worker, WMS-Adressen und KMZ-Import.
 *
 *   node --test tests/robustheit.test.mjs
 *
 * Die Tests lesen sw.js und app.js unverändert und führen sie mit nachgebauten
 * Browser-Schnittstellen in einer Sandbox aus — Cache voll oder gesperrt,
 * offline, Serverfehler, Teilantworten, Nachbar-Apps derselben Herkunft,
 * unvollständige Installation, Zugangsdaten in der WMS-Adresse, beschädigte
 * und verschlüsselte KMZ. Ursprünglich von Codex geschrieben (Oktober 2026),
 * übernommen zusammen mit den Änderungen, die sie absichern. */

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
function worker({ fetcher = async () => new Response('neu'), cache = {}, openFails = false } = {}) {
  const events = {};
  const storage = { match: async () => undefined, put: async () => {}, keys: async () => [], ...cache };
  const context = vm.createContext({ URL, Request, Response, AbortController, setTimeout, clearTimeout,
    fetch: fetcher, caches: { open: async () => { if (openFails) throw new Error('gesperrt'); return storage; } },
    self: { location: { origin:'https://example.org' }, registration:{ scope:'https://example.org/topovo/' },
      addEventListener:(name, fn) => events[name] = fn, skipWaiting: () => { context.skipped = true; } }
  });
  vm.runInContext(sw, context);
  return { context, events };
}
const request = new Request('https://example.org/topovo/app.js');
// Das Ablegen läuft nebenher über event.waitUntil — hier gesammelt, damit Fehler darin auffallen würden
const nebenher = [];
const ev = { waitUntil: p => nebenher.push(p) };
test('Netzantwort bleibt bei vollem Cache erhalten', async () => {
  const {context:c} = worker({cache:{put:async()=>{throw new Error('QuotaExceededError');}}});
  assert.equal(await (await c.networkFirst(ev,request,'shell',true)).text(),'neu');
});
test('Gesperrter Cache blockiert weder Shell noch Karten', async () => {
  const {context:c} = worker({openFails:true});
  assert.equal(await (await c.networkFirst(ev,request,'shell',true)).text(),'neu');
  assert.equal(await (await c.cacheFirst(ev,request,'tiles',10)).text(),'neu');
});
test('Offline wird die gespeicherte Antwort geliefert', async () => {
  const {context:c}=worker({fetcher:async()=>{throw new Error('offline');},cache:{match:async()=>new Response('offlinebestand')}});
  assert.equal(await (await c.networkFirst(ev,request,'shell',true)).text(),'offlinebestand');
});
test('HTTP 503 fällt auf Cache zurück, HTTP 404 bleibt sichtbar', async () => {
  for(const status of [503,404]) {
    const {context:c}=worker({fetcher:async()=>new Response('fehler',{status}),cache:{match:async()=>new Response('bestand')}});
    const response=await c.networkFirst(ev,request,'shell',true);
    assert.equal(await response.text(),status===503?'bestand':'fehler');
  }
});
test('Kacheln verursachen bei Speicherfehlern keine zweite Netzabfrage', async () => {
  let calls=0;
  const {context:c}=worker({fetcher:async()=>{calls++;return new Response('kachel');},cache:{put:async()=>{throw new Error('voll');}}});
  assert.equal(await (await c.cacheFirst(ev,request,'tiles',10)).text(),'kachel');assert.equal(calls,1);
});
test('Teilantworten werden nicht in Cache Storage geschrieben', async () => {
  let writes=0;const {context:c}=worker({cache:{put:async()=>writes++}});
  await c.cacheSchreiben('tiles',request,new Response('teil',{status:206}),10);assert.equal(writes,0);
});
test('InfraGO-Strecken kommen aus dem eigenen Vorrat zuerst, ohne zweite Netzabfrage', async () => {
  let calls=0;const geoeffnet=[];
  const {events,context:c}=worker({fetcher:async()=>{calls++;return new Response('{"g":[]}');},
    cache:{match:async()=>calls?new Response('{"g":[]}'):undefined}});
  const open=c.caches.open;c.caches.open=async n=>{geoeffnet.push(n);return open(n);};
  let antwort;
  events.fetch({request:new Request('https://example.org/topovo/infrago/s/5100.json'),respondWith:p=>antwort=p,waitUntil:p=>nebenher.push(p)});
  assert.equal(await (await antwort).text(),'{"g":[]}');
  events.fetch({request:new Request('https://example.org/topovo/infrago/s/5100.json'),respondWith:p=>antwort=p,waitUntil:p=>nebenher.push(p)});
  await antwort;
  assert.equal(calls,1);
  assert.ok(geoeffnet.every(n=>n.startsWith('topovo-infrago-')),geoeffnet.join());
});
test('Geschwister-App, Range und Authorization werden nicht abgefangen', () => {
  const {events}=worker();let handled=0;
  for(const req of [new Request('https://example.org/andere-app/index.html'),new Request(request,{headers:{Range:'bytes=0-99'}}),new Request(request,{headers:{Authorization:'Bearer test'}})]) {
    events.fetch({request:req,respondWith:()=>handled++});
  }
  assert.equal(handled,0);
});
test('Unvollständige Shell wird nicht aktiviert', async () => {
  const {context:c,events}=worker({cache:{addAll:async()=>{throw new Error('fehlende Datei');}}});
  // Browser-Request erlaubt relative URLs; Node benötigt eine Basis.
  c.Request=class extends Request {constructor(url,options){super(new URL(url,'https://example.org/topovo/'),options);}};
  let installation;events.install({waitUntil:p=>installation=p});
  await assert.rejects(installation);assert.equal(c.skipped,undefined);
});
function appFunctions(start,end) { return vm.runInNewContext(app.slice(app.indexOf(start),app.indexOf(end)) + '\n({wmsUrlOk:typeof wmsUrlOk==="function"?wmsUrlOk:undefined,kmzEintraege:typeof kmzEintraege==="function"?kmzEintraege:undefined})', { URL, DataView, Uint8Array, TextDecoder }); }
test('WMS akzeptiert HTTPS, aber keine eingebetteten Zugangsdaten', () => {
  const {wmsUrlOk}=appFunctions('function wmsUrlOk(', 'function wmsBuild(');
  assert.equal(wmsUrlOk('https://maps.example.org/wms?service=WMS'),true);
  for(const url of ['javascript:alert(1)','http://maps.example.org','https://user:pass@maps.example.org','https://user@maps.example.org']) assert.equal(wmsUrlOk(url),false);
});
function archive() {
  const name=new TextEncoder().encode('doc.kml'),body=new TextEncoder().encode('<kml/>');
  const central=30+name.length+body.length, end=central+46+name.length;
  const bytes=new Uint8Array(end+22),d=new DataView(bytes.buffer);
  d.setUint32(0,0x04034b50,true);d.setUint16(26,name.length,true);bytes.set(name,30);bytes.set(body,30+name.length);
  d.setUint32(central,0x02014b50,true);d.setUint32(central+20,body.length,true);d.setUint16(central+28,name.length,true);bytes.set(name,central+46);
  d.setUint32(end,0x06054b50,true);d.setUint16(end+10,1,true);d.setUint32(end+16,central,true);
  return {bytes,d,central};
}
test('Gültige unkomprimierte KMZ bleibt lesbar', () => {
  const {kmzEintraege}=appFunctions('function kmzEintraege(', 'async function kmzText(');
  const entries=kmzEintraege(archive().bytes.buffer);assert.equal(entries[0].name,'doc.kml');assert.equal(new TextDecoder().decode(entries[0].daten),'<kml/>');
});
test('Beschädigte Offsets und verschlüsselte KMZ werden abgewiesen', () => {
  const {kmzEintraege}=appFunctions('function kmzEintraege(', 'async function kmzText(');
  for(const mutate of [a=>a.d.setUint32(a.central+42,0xffffff,true),a=>a.d.setUint32(a.central+20,0xffffff,true),a=>a.d.setUint16(a.central+8,1,true)]) {
    const a=archive();mutate(a);assert.throws(()=>kmzEintraege(a.bytes.buffer),/KMZ/);
  }
});
