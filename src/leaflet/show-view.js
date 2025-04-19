/**
 * show-view.js
 * ----------------------------------------------------------------------------
 * Read‑only Leaflet display view (`"show"`).
 *
 * It renders a fully interactive (pan/zoom) Leaflet map but **without**
 * drawing controls, so the data cannot be changed.
 *
 * Author:      Troy Kelly  <troy@team.production.city>
 * First‑created: 2025‑04‑19
 * Licence:     CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

/**
 * Create read‑only map view.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function showView() {
  return {
    name: 'show',
    isEdit: false,
    /**
     * @param {object} opts  — Saltcorn passes an object wrapper
     * @param {string=} opts.value
     * @returns {string}
     */
    run({ value }) {
      const mapId = `show_${Math.random().toString(36).slice(2)}`;
      const geo   = wktToGeoJSON(value);
      const { lat, lng, zoom } = DEFAULT_CENTER;
      return `
<div id="${mapId}" style="height:250px;" class="border"></div>
<script>
(function(){
  function ensure(cb){
    if(window.L) return cb();
    const css=document.createElement('link'); css.rel='stylesheet';
    css.href=${JSON.stringify(LEAFLET.css)}; document.head.appendChild(css);
    const js=document.createElement('script'); js.src=${JSON.stringify(LEAFLET.js)};
    js.async=true; js.onload=cb; document.head.appendChild(js);
  }
  ensure(function(){
    const map=L.map(${JSON.stringify(mapId)}).setView(
      [${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap'
    }).addTo(map);
    const gj=${JSON.stringify(geo ?? null)};
    if(gj){
      const layer=L.geoJSON(gj).addTo(map);
      map.fitBounds(layer.getBounds(),{maxZoom:14});
    }
  });
})();
</script>`;
    },
  };
}

module.exports = { showView };