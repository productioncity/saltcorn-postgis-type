/**
 * show-view.js
 * ----------------------------------------------------------------------------
 * Read‑only Leaflet viewer.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON }            = require('../utils/geometry');

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
 * Safely serialise an arbitrary JS value for in‑page JS (single‑escaped).
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

/**
 * @returns {import('@saltcorn/types').FieldView}
 */
function showView() {
  return {
    name:   'show',
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
       * 2.  Server‑side WKT ➜ GeoJSON conversion (robust).             *
       * -------------------------------------------------------------- */
      const gj = wktToGeoJSON(value);

      /* 3.  Build the Leaflet viewer.                                  */
      const mapId = `show_${Math.random().toString(36).slice(2)}`;
      const { lat, lng, zoom } = DEFAULT_CENTER;

      return `
<div id="${mapId}" style="height:250px;" class="border"></div>
<script>
(function(){
  const LEAF_CSS = ${js(LEAFLET.css)};
  const LEAF_JS  = ${js(LEAFLET.js)};
  const MAP_ID   = ${js(mapId)};
  const GJ       = ${js(gj)};

  function haveCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){ return !!(document._loadedScripts && document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(haveCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(haveJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  (async function(){
    await loadCss(LEAF_CSS);
    await loadJs(LEAF_JS);
    const map=L.map(MAP_ID).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);

    if(GJ){
      const lyr=L.geoJSON(GJ).addTo(map);
      map.fitBounds(lyr.getBounds(),{maxZoom:14});
    }
  })();
})();
</script>`;
    },
  };
}

module.exports = { showView };