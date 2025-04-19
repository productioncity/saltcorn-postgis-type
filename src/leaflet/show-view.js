/**
 * show-view.js
 * Read‑only Leaflet map preview field‑view – works for every geometry that
 * `wellknown` can parse. Injects Leaflet on‑demand.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Extracted from monolithic index.js.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

const { div, script, domReady, text: esc } = require('@saltcorn/markup/tags');
const { LEAFLET } = require('../constants');
const { wktToGeoJSON, wktToLonLat } = require('../utils/geometry');

/**
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletShow() {
  return {
    isEdit: false,
    run(value) {
      if (!value) return '';
      const id = `ls${Math.random().toString(36).slice(2)}`;
      const geojson = wktToGeoJSON(value);
      const pointLL = wktToLonLat(value);

      if (!geojson && !pointLL) return `<code>${esc(String(value))}</code>`;

      /* Client‑side init script */
      const js = `
${LEAFLET.header}
(function(){
  const map=L.map("${id}",{zoomControl:false,attributionControl:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(map);
  ${geojson
          ? `const layer=L.geoJSON(${JSON.stringify(geojson)}).addTo(map);
         map.fitBounds(layer.getBounds());`
          : `const pt=[${pointLL[1]},${pointLL[0]}];
         L.marker(pt).addTo(map);map.setView(pt,12);`
        }
})();`;
      return div({ id, style: 'height:180px' }, '…') + script(domReady(js));
    },
  };
}

module.exports = { leafletShow };