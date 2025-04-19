/**
 * Show‑only Leaflet field‑view.
 * ---------------------------------------------------------------------------
 * Displays any PostGIS geometry value on a mini interactive Leaflet map.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

/**
 * Generates the “show” field‑view shared by every PostGIS type.
 *
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletShow() {
  return {
    name: 'show',
    isEdit: false,

    /**
     * @param {string} _fieldName – Unused (same render for all fields).
     * @param {unknown} value     – WKT string from Postgres.
     * @returns {string}          – HTML fragment.
     */
    run(_fieldName, value) {
      if (typeof value !== 'string' || value.trim() === '') {
        return '';
      }

      const geo = wktToGeoJSON(value);
      if (!geo) {
        /* Fallback: render WKT verbatim if parsing failed */
        return `<code>${value}</code>`;
      }

      const mapId = `pg-map-${Math.round(Math.random() * 10 ** 9)}`;

      /* Inline script waits until Leaflet is loaded then draws the feature */
      /* eslint-disable max-len */
      return `
${LEAFLET.header()}
<div id="${mapId}" style="height:200px;"></div>
<script>
(function waitForLeaflet(cb){
  if (window.L && window.scLeafletLoaded) cb();
  else setTimeout(()=>waitForLeaflet(cb),50);
})(function init(){
  const map  = L.map('${mapId}', { zoomControl:false, attributionControl:false });
  const gj   = L.geoJSON(${JSON.stringify(geo)}).addTo(map);
  map.fitBounds(gj.getBounds());
});
</script>`;
      /* eslint-enable max-len */
    },
  };
}

module.exports = { leafletShow };