/**
 * show‑view.js
 * ---------------------------------------------------------------------------
 * Leaflet “show” field‑view for *all* PostGIS geometries.
 *
 * • Renders the supplied WKT/EWKT on a 200 px‑high map.  
 * • Works with POINT, MULTI*, POLYGON, GEOMETRYCOLLECTION … anything that
 *   `wellknown` can translate to GeoJSON.  
 * • Falls back to a safe <code> block if the value cannot be parsed.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/* eslint-disable max-len */

const { LEAFLET } = require('../constants');
const wellknown = require('wellknown');

/**
 * Escapes critical HTML characters.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value.replace(
    /[&<>"'`]/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
      })[c] || c,
  );
}

/**
 * Returns the Saltcorn field‑view definition.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletShow() {
  return {
    run: (value) => {
      if (typeof value !== 'string' || value.trim() === '') return '';

      /* A quick server‑side parse to validate the WKT. If it fails we bail out
       * early and render raw text – less client‑side surprises. */
      let geom;
      try {
        geom = wellknown.parse(value);
      } catch {
        /* ignore */
      }
      if (!geom) return `<code>${escapeHtml(value)}</code>`;

      const id = `sc-map-${Math.random().toString(36).slice(2, 10)}`;

      return `
${LEAFLET.header()}
<!-- Load wellknown.js in the browser if not already present -->
<script>
if(!window.wellknown){
  const s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';
  document.head.appendChild(s);
}
</script>

<div id="${id}" style="height:200px"></div>

<script>
(function(){
  const WKT=${JSON.stringify(value)};
  const init=()=>{
    if(!window.L || !window.wellknown){ setTimeout(init,50); return; }

    const map=L.map(${JSON.stringify(id)},{scrollWheelZoom:false}).setView([0,0],2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);

    try{
      const geo=window.wellknown.parse(WKT);
      if(geo){
        const layer=L.geoJSON(geo).addTo(map);
        if(layer.getLayers().length){
          map.fitBounds(layer.getBounds(),{maxZoom:16});
        }
      }
    }catch(e){
      /* swallow – on error we simply leave the map blank */
    }
  };
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded',init);
})();
</script>`;
    },
  };
}

module.exports = { leafletShow };