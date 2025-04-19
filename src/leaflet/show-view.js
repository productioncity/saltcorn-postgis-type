/**
 * show-view.js
 * ---------------------------------------------------------------------------
 * Lightweight Leaflet “show” field‑view for PostGIS POINT values.
 * Renders a 200 px high, non‑interactive map centred on the point or falls
 * back to a safe <code> block if the value cannot be parsed.
 *
 * This view is intentionally generic – it does not (yet) visualise complex
 * geometries. For everything except POINT the plain text fallback is used.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { LEAFLET } = require('../constants');
const { wktToLonLat } = require('../utils/geometry');

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
 * Factory returning the Saltcorn field‑view definition.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletShow() {
  return {
    run: (value) => {
      if (typeof value !== 'string' || value.trim() === '') {
        return '';
      }

      const lonLat = wktToLonLat(value);
      if (!lonLat) {
        return `<code>${escapeHtml(value)}</code>`;
      }

      const id = `sc-map-${Math.random().toString(36).slice(2, 10)}`;
      const [lng, lat] = lonLat;
      const html = `
${LEAFLET.header()}
<div id="${id}" style="height:200px"></div>
<script>
(function(){
  function init(){
    if(!window.L){ setTimeout(init, 50); return; }
    const map = L.map(${JSON.stringify(id)}, { scrollWheelZoom:false })
                 .setView([${lat}, ${lng}], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.marker([${lat}, ${lng}]).addTo(map);
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
</script>`;
      return html;
    },
  };
}

module.exports = { leafletShow };