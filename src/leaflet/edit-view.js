/**
 * Leaflet “edit / create” field‑view (supports ALL geometry types)
 * ---------------------------------------------------------------------------
 * Uses Leaflet.Draw (1.0.4) for an intuitive drawing interface.
 *
 * Converts the drawn GeoJSON feature to WKT (via `wellknown`) before storing
 * it in the hidden input expected by Saltcorn.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

/**
 * Build an editable field‑view for a given PostGIS type.
 *
 * @param {string} typeName – Lower‑case Saltcorn type name (e.g. “point”).
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletEditView(typeName) {
  /**
   * Map which Leaflet.Draw drawing tools are allowed per type.
   * Keys are Saltcorn type names.
   * @type {Record<string, Array<'marker'|'polyline'|'polygon'|'rectangle'>>}
   */
  const TOOL_MAP = {
    point:              ['marker'],
    multipoint:         ['marker'],
    linestring:         ['polyline'],
    multilinestring:    ['polyline'],
    polygon:            ['polygon', 'rectangle'],
    multipolygon:       ['polygon', 'rectangle'],
    geometry:           ['marker', 'polyline', 'polygon', 'rectangle'],
    geography:          ['marker', 'polyline', 'polygon', 'rectangle'],
    geometrycollection: ['marker', 'polyline', 'polygon', 'rectangle'],
    /* default fallback: full tool‑set */
  };

  /**
   * @param {string} fieldName
   * @param {unknown} value
   * @param {import('@saltcorn/types').PostGISTypeAttrs=} _attrs
   * @param {string=} cls
   * @returns {string}
   */
  function run(fieldName, value, _attrs, cls = '') {
    const idInput = `pg-input-${fieldName}-${Math.round(Math.random() * 1e8)}`;
    const idMap   = `pg-map-${fieldName}-${Math.round(Math.random() * 1e8)}`;

    const gjson = typeof value === 'string' ? wktToGeoJSON(value) : undefined;
    const drawTools = TOOL_MAP[typeName] || TOOL_MAP.geometry;

    /* Build Leaflet.Draw config */
    const drawCfg = {
      position: 'topright',
      draw: {
        marker:     drawTools.includes('marker'),
        polygon:    drawTools.includes('polygon'),
        polyline:   drawTools.includes('polyline'),
        rectangle:  drawTools.includes('rectangle'),
        circle:     false,
        circlemarker: false,
      },
      edit: {
        featureGroup: 'DRAWN' /* replaced at runtime with FG */
      },
    };

    /* eslint-disable max-len */
    return `
${LEAFLET.header()}
<link  rel="stylesheet"
       href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css">
<script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js" defer></script>
<input type="hidden" ${cls} name="${fieldName}" id="${idInput}"
       value="${value ? String(value).replace(/"/g, '&quot;') : ''}">
<div id="${idMap}" style="height:300px;border:1px solid #ccc;"></div>

<script>
(function wait(cb){
  if (window.L && window.scLeafletLoaded &&
      window.L.Draw && document.getElementById('${idMap}')) { cb(); }
  else { setTimeout(()=>wait(cb),50); }
})(function init(){
  const map = L.map('${idMap}');
  const drawn = new L.FeatureGroup();
  map.addLayer(drawn);

  /* Load existing geometry if present */
  ${gjson ? `L.geoJSON(${JSON.stringify(gjson)}).eachLayer(l=>drawn.addLayer(l));` : ''}

  if (drawn.getLayers().length) {
     map.fitBounds(drawn.getBounds());
  } else {
     map.setView([0,0], 1);
  }
  map.addControl(new L.Control.Zoom());

  /* Inject dynamic FG reference into draw config */
  const cfg = ${JSON.stringify(drawCfg)};
  cfg.edit.featureGroup = drawn;
  map.addControl(new L.Control.Draw(cfg));

  /* Persist drawn feature back to hidden input */
  function sync(){
    const f = drawn.toGeoJSON();
    if (!f || !f.features.length){
      document.getElementById('${idInput}').value = '';
      return;
    }
    const geom = f.features[0].geometry;
    if (window.wellknown){
      document.getElementById('${idInput}').value =
          window.wellknown.stringify(geom);
    } else {
      document.getElementById('${idInput}').value = JSON.stringify(geom);
    }
  }
  map.on(L.Draw.Event.CREATED, e=>{ drawn.clearLayers(); drawn.addLayer(e.layer); sync(); });
  map.on(L.Draw.Event.EDITED,  sync);
  map.on(L.Draw.Event.DELETED, sync);

  /* Lazy‑load wellknown for WKT serialisation (≈5 KB) */
  if (!window.wellknown){
     const s=document.createElement('script');
     s.src='https://unpkg.com/wellknown@0.5.0/wellknown.min.js';
     document.body.appendChild(s);
  }
});
</script>`;
    /* eslint-enable max-len */
  }

  return Object.freeze({
    name: 'edit',
    isEdit: true,
    run,
  });
}

module.exports = { leafletEditView };