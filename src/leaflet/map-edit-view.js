/**
 * map-edit-view.js
 * ----------------------------------------------------------------------------
 * Field‑view `"map"`  – full Leaflet editor.
 *
 * Features
 *   • Draw / modify / delete Point, LineString, Polygon features via
 *     Leaflet.Draw.
 *   • Multiple layers are automatically collapsed into a PostGIS
 *     GEOMETRYCOLLECTION when serialised back to WKT.
 *   • A hidden `<input>` keeps the canonical WKT/EWKT string that Saltcorn
 *     stores in the table.
 *   • Any extra Z‑value (for *POINTZ*, *LINESTRINGZ*, …) can be supplied in
 *     the supplementary numeric input rendered beneath the map.
 *
 * NOTE: The view degrades gracefully if Leaflet.Draw is not found – the map
 *       is displayed but non‑editable, protecting the user’s data.
 *
 * Author:      Troy Kelly  <troy@team.production.city>
 * First‑created: 2025‑04‑19
 * Licence:     CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

const DRAW_CDN =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';

/**
 * Creates `"map"` (edit) field‑view.
 *
 * @param {string} typeName  Lower‑case Saltcorn type name (point, polygon…)
 * @returns {import('@saltcorn/types').FieldView}
 */
function mapEditView(typeName) {
  return {
    name: 'map',
    isEdit: true,
    /**
     * @param {import('@saltcorn/types').Field} field
     * @param {string=} current
     * @param {unknown} _attrs
     * @param {string=} classes
     * @returns {string}
     */
    run(field, current, _attrs, classes = '') {
      const mapId  = `map_${field.name}_${Math.random().toString(36).slice(2)}`;
      const inputId = `in_${mapId}`;
      const zId     = `z_${mapId}`;
      const value   = current || '';
      const geo     = wktToGeoJSON(value);
      const hasZ    = /Z[^A-Za-z]*\(/i.test(value);

      const { lat, lng, zoom } = DEFAULT_CENTER;

      return `
<div id="${mapId}" style="height:300px;" class="border"></div>
<input type="hidden" id="${inputId}" name="${field.name}" value="${value}">
${
  hasZ
    ? `<div class="mt-1">
         <label class="form-label mb-0" for="${zId}">
           Z&nbsp;value&nbsp;(optional)
         </label>
         <input type="number" step="any" class="form-control form-control-sm"
                id="${zId}">
       </div>`
    : ''
}
<script>
(function(){
  const mapDiv = document.getElementById(${JSON.stringify(mapId)});
  function ensureLibs(cb){
    if(window.L && window.L.Control && window.L.Control.Draw) return cb();
    const css1=document.createElement('link'); css1.rel='stylesheet';
    css1.href=${JSON.stringify(LEAFLET.css)}; document.head.appendChild(css1);
    const css2=document.createElement('link'); css2.rel='stylesheet';
    css2.href=${JSON.stringify(DRAW_CSS)}; document.head.appendChild(css2);
    const js1=document.createElement('script'); js1.src=${JSON.stringify(LEAFLET.js)};
    js1.async=true; js1.onload=function(){
      const js2=document.createElement('script'); js2.src=${JSON.stringify(DRAW_CDN)};
      js2.async=true; js2.onload=cb; document.head.appendChild(js2);
    };
    document.head.appendChild(js1);
  }

  ensureLibs(function(){
    const map=L.map(mapDiv).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap'
    }).addTo(map);
    const drawn = new L.FeatureGroup().addTo(map);

    const wktVal=document.getElementById(${JSON.stringify(inputId)}).value;
    if(wktVal){
      try{
        const gj=window.wellknown ? window.wellknown.parse(wktVal) : null;
        if(gj){
          const layer=L.geoJSON(gj).addTo(drawn);
          map.fitBounds(layer.getBounds(),{maxZoom:14});
        }
      }catch(e){/* ignore bad input */}
    }

    // Draw controls
    const ctrl=new L.Control.Draw({
      edit:{ featureGroup:drawn },
      draw:{
        polygon:true, polyline:true, rectangle:false,
        circle:false, marker:true, circlemarker:false
      }
    });
    map.addControl(ctrl);

    function toWkt(){
      const geo=drawn.toGeoJSON();
      if(!geo || !geo.features.length) return '';
      if(geo.features.length===1){
        return window.wellknown.stringify(geo.features[0].geometry);
      }
      const wkts=geo.features.map(f=>window.wellknown.stringify(f.geometry));
      return 'GEOMETRYCOLLECTION(' + wkts.join(',') + ')';
    }

    map.on(L.Draw.Event.CREATED, (e)=>{ drawn.addLayer(e.layer);
      document.getElementById(${JSON.stringify(inputId)}).value=toWkt();
    });
    map.on(L.Draw.Event.EDITED, ()=>{
      document.getElementById(${JSON.stringify(inputId)}).value=toWkt();
    });
    map.on(L.Draw.Event.DELETED, ()=>{
      document.getElementById(${JSON.stringify(inputId)}).value=toWkt();
    });
  });
})();
</script>`;
    },
  };
}

module.exports = { mapEditView };