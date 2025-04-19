/**
 * show-view.js
 * ----------------------------------------------------------------------------
 * Read‑only Leaflet viewer.
 *
 * This viewer is now robust against **all** call‑signatures that Saltcorn
 * may emit in either *show* or *edit* contexts:
 *
 *   • show‑mode (standard):              run({ value })           ← v ≥ 0.9  
 *   • legacy show‑mode:                  run(value)               ← v ≤ 0.8  
 *   • edit‑mode preview (isEdit = true): run(fieldName, value, …)  
 *   • edit‑mode preview (field object):  run(fieldObj,  value, …)
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

/**
 * Extract the geometry value regardless of the Saltcorn call signature.
 *
 * @param {IArguments | unknown[]} args
 * @returns {string}
 */
function resolveValue(args) {
  if (!args.length) return '';

  const first = args[0];

  /* ───── (1) Object wrapper `{ value }` ──────────────────────────── */
  if (first && typeof first === 'object' && 'value' in first) {
    // @ts-ignore – shape check performed at runtime
    return first.value ?? '';
  }

  /* ───── (2) Edit‑context: (fieldObj, value, …) ─────────────────── */
  if (
    first &&
    typeof first === 'object' &&
    'name' in first &&
    args.length > 1
  ) {
    return /** @type {string} */ (args[1] ?? '');
  }

  /* ───── (3) Edit‑context legacy: (fieldName, value, …) ─────────── */
  if (typeof first === 'string' && args.length > 1) {
    return /** @type {string} */ (args[1] ?? '');
  }

  /* ───── (4) Primitive WKT/EWKT string ──────────────────────────── */
  if (typeof first === 'string') return first;

  /* Fallback – nothing we can meaningfully parse */
  return '';
}

/**
 * @returns {import('@saltcorn/types').FieldView}
 */
function showView() {
  return {
    name: 'show',
    isEdit: false,
    /**
     * Renders a fixed‑height Leaflet map showing the supplied WKT/EWKT value.
     *
     * @param {...unknown} args  Variable Saltcorn runtime signature.
     * @returns {string}         HTML/JS payload.
     */
    run(...args) {
      /* -------------------------------------------------------------- *
       * 1.  Determine the geometry string from any signature.          *
       * -------------------------------------------------------------- */
      const value = resolveValue(args);

      /* -------------------------------------------------------------- *
       * 2.  Build the Leaflet viewer.                                  *
       * -------------------------------------------------------------- */
      const mapId = `show_${Math.random().toString(36).slice(2)}`;
      const gj    = wktToGeoJSON(value);
      const { lat, lng, zoom } = DEFAULT_CENTER;
      return `
<div id="${mapId}" style="height:250px;" class="border"></div>
<script>
(function(){
  function css(h){return !!document.querySelector('link[href="'+h+'"]');}
  function js(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function addCss(h){return new Promise(r=>{if(css(h))return r();const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;document.head.appendChild(l);});}
  function addJs(s){return new Promise(r=>{if(js(s))return r();const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};document.head.appendChild(sc);});}
  (async function(){
    await addCss(${JSON.stringify(LEAFLET.css)});
    await addJs(${JSON.stringify(LEAFLET.js)});
    const map=L.map(${JSON.stringify(mapId)}).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap'
    }).addTo(map);
    const gj=${JSON.stringify(gj)};
    if(gj){
      const lyr=L.geoJSON(gj).addTo(map);
      map.fitBounds(lyr.getBounds(),{maxZoom:14});
    }
  })();
})();
</script>`;
    },
  };
}

module.exports = { showView };