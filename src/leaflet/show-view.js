/**
 * show-view.js
 * ----------------------------------------------------------------------------
 * Leaflet “show” field‑view for all PostGIS‑backed Saltcorn types.
 * Renders a read‑only map centred/bounded to the supplied WKT/EWKT value.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { wktToGeoJSON } = require('../utils/geometry');

/**
 * Escapes HTML to avoid XSS injections in attribute values.
 *
 * @param {unknown} val
 * @returns {string}
 */
function esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * Produces a Saltcorn field‑view for read‑only Leaflet display.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletShow() {
  return {
    name: 'leaflet',
    displayName: 'Leaflet map',
    /**
     * @param {string} value           Stored WKT/EWKT value.
     * @returns {string}               HTML/JS to render the map.
     */
    run(value) {
      /* Generate a unique DOM id so multiple maps coexist safely. */
      const mapId = `sc_leaflet_show_${Math.random().toString(36).substring(2)}`;

      /* Pre‑parse geometry server‑side (avoids needing wellknown on client for read). */
      const geoJSON = wktToGeoJSON(value);
      const geoJ    = geoJSON ? esc(JSON.stringify(geoJSON)) : 'null';

      return `
<div id="${mapId}" class="sc-leaflet-show" style="width:100%;height:240px;"></div>
<script defer>
(function(){
  function init(){
    if(!window.L){setTimeout(init,50);return;}
    const map=L.map("${mapId}");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      attribution:"&copy; OpenStreetMap contributors"
    }).addTo(map);

    const g=${geoJ};
    if(g){
      const layer=L.geoJSON(g).addTo(map);
      try{map.fitBounds(layer.getBounds());}
      catch(e){map.setView([0,0],2);}
    }else{
      map.setView([0,0],2);
    }
  }
  init();
})();
</script>`;
    },
  };
}

module.exports = { leafletShow };