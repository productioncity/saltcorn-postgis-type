/**
 * raw-view.js
 * ----------------------------------------------------------------------------
 * SINGLE key `"raw"`  – works for BOTH *show* and *edit* contexts.
 *
 * ‑ In **edit** mode it shows a `<textarea>` (raw WKT/EWKT/GeoJSON) and a
 *   “Preview map” toggle which renders a Leaflet map *read‑only* so that the
 *   user can visually confirm the data.
 *
 * ‑ In **show** mode it simply renders a read‑only `<pre>` block containing
 *   the raw value together with the (toggleable) preview map.
 *
 * The ⬇︎ detection between the two modes is runtime–heuristic; Saltcorn calls
 * an *edit* view with the signature:
 *
 *     run(field, currentValue, attrs, cls)
 *
 * …whereas a *show* view receives:
 *
 *     run({field, row, value, ...})
 *
 * We therefore check the argument shape to decide which branch to execute.
 *
 * Author:      Troy Kelly  <troy@team.production.city>
 * First‑created: 2025‑04‑19
 * Licence:     CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

/**
 * Builds the HTML (+ client‑side JS) for the preview map.
 *
 * @param {string} id       DOM id of the container.
 * @param {string=} wkt     Raw WKT / EWKT / GeoJSON (stringified).
 * @returns {string}        HTML string.
 */
function buildPreviewMap(id, wkt) {
  const geoJson =
    typeof wkt === 'string' && wkt.trim()
      ? JSON.stringify(wktToGeoJSON(wkt) || {})
      : 'null';
  const { lat, lng, zoom } = DEFAULT_CENTER;

  // The wellknown UMD build is ~5 kB – pulled in lazily only for preview mode.
  return `
<div id="${id}" style="height:200px; display:none; margin-top:0.5rem;"></div>
<script>
(function(){
  const tgtId   = ${JSON.stringify(id)};
  const geomStr = ${wkt ? JSON.stringify(wkt) : 'null'};
  const geoJSON = ${geoJson};
  // Lazy‑load support libs if necessary
  function ensureWellknown(cb){
    if(window.wellknown) return cb();
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';
    s.async=true; s.onload=cb; document.head.appendChild(s);
  }
  function ensureLeaflet(cb){
    if(window.L) return cb();
    const css=document.createElement('link');
    css.rel='stylesheet'; css.href=${JSON.stringify(LEAFLET.css)};
    document.head.appendChild(css);
    const js=document.createElement('script');
    js.src=${JSON.stringify(LEAFLET.js)}; js.async=true; js.onload=cb;
    document.head.appendChild(js);
  }
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById(tgtId + '_btn');
    const mapDiv = document.getElementById(tgtId);
    if(!btn) return;
    btn.addEventListener('click', function(){
      if(mapDiv.style.display === 'none'){
        mapDiv.style.display='block';
        ensureLeaflet(function(){
          ensureWellknown(function(){
            const map=L.map(mapDiv).setView([${lat},${lng}],${zoom});
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
              attribution:'&copy; OpenStreetMap'
            }).addTo(map);
            if(geoJSON && Object.keys(geoJSON).length){
              const layer=L.geoJSON(geoJSON).addTo(map);
              map.fitBounds(layer.getBounds(),{maxZoom:12});
            }
          });
        });
      }else{
        mapDiv.style.display='none';
      }
    });
  });
})();
</script>`;
}

/**
 * Returns the single `"raw"` field‑view object.
 *
 * Because Saltcorn insists on separate *edit*/*show* dichotomy but we are
 * forced to expose only **one** key, we make `isEdit` **undefined** which
 * means it passes the `!view.isEdit` filter used for *show* views **and** we
 * dynamically decide at runtime what to render when the editor calls us.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function rawView() {
  return {
    name: 'raw',
    // Deliberately undefined – lets Saltcorn treat it as both show+edit.
    run(...args) {
      // ------------------------------------------------------------------ //
      // Detect *edit* vs *show* by signature‑shape.                         //
      // – If first arg is a Field object  -> edit mode.                     //
      // – Else it is {field,row,value,…} -> show mode.                      //
      // ------------------------------------------------------------------ //
      const editMode =
        args.length >= 2 &&
        typeof args[0] === 'object' &&
        typeof args[0].name === 'string' &&
        'type' in args[0];

      if (editMode) {
        // ----------------------------- EDIT ------------------------------ //
        const [field, current, , classes = 'form-control'] = args;
        const taId  = `ta_${field.name}_${Math.random().toString(36).slice(2)}`;
        const mapId = `map_${taId}`;
        const safe  =
          current && typeof current === 'string'
            ? current.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            : '';
        return `
<textarea id="${taId}" name="${field.name}"
  class="${classes}" style="min-height:6rem;">${safe}</textarea>
<button type="button" id="${mapId}_btn"
  class="btn btn-outline-secondary btn-sm mt-1">
  Preview map
</button>
${buildPreviewMap(mapId, current ?? '')}`;
      }

      // ------------------------------ SHOW ------------------------------- //
      const [{ value }] = args;
      const preId = `pre_${Math.random().toString(36).slice(2)}`;
      const mapId = `map_${preId}`;
      const safe =
        typeof value === 'string'
          ? value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          : '';
      return `
<pre id="${preId}" style="white-space:pre-wrap;">${safe}</pre>
<button type="button" id="${mapId}_btn"
  class="btn btn-outline-secondary btn-sm mt-1">
  Show on map
</button>
${buildPreviewMap(mapId, value ?? '')}`;
    },
  };
}

module.exports = { rawView };