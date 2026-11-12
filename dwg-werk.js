/* DWG → DXF im Gerät (12.11.2026 gewünscht): LibreDWG als WebAssembly (vendor/libredwg, gebaut mit
 * werkzeug/libredwg-bauen.sh). Je Datei ein frischer Worker — dwg2dxf hält globalen Zustand, ein
 * zweiter Lauf im selben Modul wäre nicht sicher. Auftrag: { dwg: ArrayBuffer } → { dxf: ArrayBuffer }
 * oder { fehler: Text }. Die DXF geht danach durch denselben Leser wie jede andere (dxfParse). */
'use strict';
// Versionsmarke: Der Service Worker legt vendor/ „erst Cache“ ab — bei jedem Neubau des Moduls hochzählen
const DWG_MODUL = '0.14-2';
importScripts('vendor/libredwg/dwg2dxf.js?v=' + DWG_MODUL);

onmessage = async ev => {
  const meldungen = [];
  try {
    const M = await Dwg2Dxf({
      locateFile: f => 'vendor/libredwg/' + f + '?v=' + DWG_MODUL,
      print: t => meldungen.push(t),
      printErr: t => meldungen.push(t)
    });
    M.FS.writeFile('/ein.dwg', new Uint8Array(ev.data.dwg));
    let code = 0;
    try { code = M.callMain(['-y', '-o', '/aus.dxf', '/ein.dwg']); }
    catch (e) { if (!(e && e.name === 'ExitStatus')) throw e; code = e.status; }
    let dxf = null;
    try { dxf = M.FS.readFile('/aus.dxf'); } catch { /* keine Ausgabe */ }
    if (!dxf || dxf.length < 100) {
      const grund = meldungen.filter(t => /error|fehler/i.test(t)).slice(-2).join(' ') || `Rückgabe ${code}`;
      postMessage({ fehler: 'DWG ließ sich nicht umwandeln (' + grund + ')' });
      return;
    }
    postMessage({ dxf: dxf.buffer }, [dxf.buffer]);
  } catch (e) {
    postMessage({ fehler: 'DWG ließ sich nicht umwandeln (' + (e && e.message || e) + ')' });
  }
};
