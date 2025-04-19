/**
 * show-view.js
 * ----------------------------------------------------------------------------
 * Read‑only Leaflet viewer (robust against every Saltcorn call signature).
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON }            = require('../utils/geometry');

/* ────────────────────────── helpers ────────────────────────── */

/**
 * Identify a string that *looks* like geometry (WKT/EWKT/hex‑WKB).
 *
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeGeom(s) {
  return (
    /^(SRID=\d+;)?[A-Z]/.test(s) ||            // WKT / EWKT
    /^[0-9A-Fa-f]{16,}$/.test(s)               // hex‑encoded WKB
  );
}

/**
 * Extract the geometry string from **any** Saltcorn runtime signature.
 *
 * Saltcorn’s field‑view `run()` is not documented and changes between
 * versions.  Rather than rely on brittle positional logic we scan every
 * argument for the first plausible geometry string.
 *
 * @param {unknown[]} args
 * @returns {string} Empty string if nothing usable found.
 */
function resolveValue(args) {
  /* 1. Direct strings or wrapped `{ value }` objects. */
  for (const a of args) {
    if (typeof a === 'string' && looksLikeGeom(a)) return a;
    if (a && typeof a === 'object' && typeof a.value === 'string' &&
        looksLikeGeom(a.value)) {
      return a.value;
    }
  }

  /* 2. Search inside objects (row objects, Express req, etc.). */
  for (const a of args) {
    if (a && typeof a === 'object') {
      for (const v of Object.values(a)) {
        if (typeof v === 'string' && looksLikeGeom(v)) return v;
      }
    }
  }

  /* Nothing usable. */
  return '';
}

/**
 * Safely serialise *anything* into a JS literal suitable for direct in‑page
 * embedding.  Guarantees a string is always returned.
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  const safe = v === undefined ? null : v;
  return JSON.stringify(safe).replace(/</g, '\\u003c');
}

/* ────────────────────────── Field‑view ───────────────────────── */

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
      /* 1 – Extract geometry string (robust). */
      const wkt = resolveValue(args);

      /* 2 – Server‑side WKT → GeoJSON conversion (returns *undefined* on failure). */
      const gj = wkt ? wktToGeoJSON(wkt) : undefined;

      /* 3 – Build the Leaflet viewer. */
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

  /* Utility loaders */
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