/**
 * show-view.js
 * -----------------------------------------------------------------------------
 * Read‑only field‑view for every PostGIS geometry/geography value.
 *
 * • If the value parses to GeoJSON, an interactive Leaflet map preview is
 *   rendered client‑side (auto‑fitting the layer). All assets are provided via
 *   the plug‑in’s static bundle; no external network is required.
 * • Fallback: when parsing fails (e.g. invalid WKT) the raw WKT/EWKT string is
 *   displayed inside a fixed‑width <code> </code> block.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { code }          = require('@saltcorn/markup/tags');
const { wktToGeoJSON }  = require('../utils/geometry');

/**
 * Builds the Saltcorn field‑view object.
 *
 * @returns {import('@saltcorn/types').FieldViewObj}
 */
function leafletShow() {
  /**
   * @param {string|undefined|null} value           Current field value.
   * @returns {string}                              HTML markup.
   */
  const run = (value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return '';
    }

    const gj = wktToGeoJSON(value);
    if (!gj) {
      /* ────────────────────────── Plain WKT fallback ───────────────────── */
      return code({ class: 'sc-postgis-wkt' }, value);
    }

    /* ───────────────────────── Leaflet map preview ─────────────────────── */
    const mapId = `sc-postgis-map-${Math.random().toString(36).slice(2)}`;

    return `
<div id="${mapId}" style="width:100%;height:180px;border:1px solid #ced4da;border-radius:4px;"></div>
<script>
//<![CDATA[
(function () {
  const init = () => {
    const el = document.getElementById('${mapId}');
    if (!el || !window.L) return;

    const map = L.map(el, {
      attributionControl: false,
      zoomControl:        false,
      boxZoom:            false,
      doubleClickZoom:    false,
      dragging:           false,
      scrollWheelZoom:    false,
      keyboard:           false,
    });

    const layer = L.geoJSON(${JSON.stringify(gj)}).addTo(map);
    try {
      map.fitBounds(layer.getBounds());
    } catch {
      map.setView([0, 0], 1);
    }
  };

  if (window.L && window.scLeafletLoaded) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
//]]>
</script>`;
  };

  return {
    isEdit:       false,
    description:  'Renders geometry as WKT or interactive Leaflet preview.',
    configFields: [],
    run,
  };
}

module.exports = { leafletShow };