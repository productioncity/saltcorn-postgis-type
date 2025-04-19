/**
 * edit‑view.js
 * ---------------------------------------------------------------------------
 * Leaflet‑based interactive “edit” field‑view for all PostGIS geometries.
 *
 * New in this revision
 * ────────────────────────────────────────────────────────────────────────────
 * • Supports *multiple* drawn layers. Those layers are serialised to:
 *     – MultiPoint / MultiLineString / MultiPolygon when homogeneous.
 *     – GeometryCollection when mixed.
 * • Round‑trips existing MULTI* and GEOMETRYCOLLECTION WKTs.
 * • Existing single‑geometry behaviour is unchanged – users can still save
 *   just one shape if they wish.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { LEAFLET } = require('../constants');

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
 * Build a Saltcorn field‑view for interactive geometry editing.
 *
 * @param {string} _typeName – The logical Saltcorn type (unused but kept for
 *                             future refinements).
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletEditView(_typeName) {
  return {
    isEdit: true,
    /**
     * @param {string} name       – Field name.
     * @param {string|null=} val  – Current WKT/EWKT value.
     * @returns {string}          – HTML fragment.
     */
    run(name, val) {
      const safeVal = escapeHtml(val ?? '');
      const mapId = `sc-edit-map-${name}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      return `
${LEAFLET.header()}
<!-- Load browser‑side deps (wellknown + leaflet.draw) if absent -->
<script>
if(!window.wellknown){
  const s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';
  document.head.appendChild(s);
}
const ensureDraw = new Promise((res)=>{
  if(window.L && window.L.Draw){ res(); return; }
  const css=document.createElement('link');
  css.rel='stylesheet';
  css.href='https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
  document.head.appendChild(css);
  const js=document.createElement('script');
  js.src='https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
  js.onload=()=>res();
  document.head.appendChild(js);
});
</script>

<!-- Hidden input Saltcorn reads -->
<input type="hidden" id="${mapId}-wkt" name="${name}" value="${safeVal}">

<!-- Optional raw WKT editor -->
<div class="mb-2">
  <button class="btn btn-sm btn-outline-secondary"
          type="button" data-bs-toggle="collapse"
          data-bs-target="#${mapId}-raw">
    Toggle raw WKT editor
  </button>
</div>
<div id="${mapId}-raw" class="collapse mb-2">
  <textarea id="${mapId}-rawtxt" class="form-control" rows="3">${safeVal}</textarea>
</div>

<!-- Map -->
<div id="${mapId}" style="height:400px"></div>

<script>
(function(){
  const init=()=>{
    if(!window.L || !window.wellknown){ setTimeout(init,50); return; }
    ensureDraw.then(setupEditor);
  };

  function setupEditor(){
    const map=L.map(${JSON.stringify(mapId)}).setView([0,0],2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);

    const featureGroup=new L.FeatureGroup().addTo(map);

    /* Populate from existing WKT (may be single, MULTI* or GEOMETRYCOLLECTION) */
    const initial=document.getElementById('${mapId}-wkt').value;
    if(initial){
      try{
        const g=wellknown.parse(initial);
        if(g){
          const lyr=L.geoJSON(g);
          lyr.eachLayer(l=>featureGroup.addLayer(l));
          if(featureGroup.getLayers().length){
            map.fitBounds(featureGroup.getBounds(),{maxZoom:16});
          }
        }
      }catch(e){}
    }

    /* Draw toolbar */
    const drawCtl=new L.Control.Draw({
      edit:{ featureGroup, remove:true },
      draw:{
        polygon: true,
        polyline:true,
        marker:  true,
        rectangle:true,
        circle:  false,
        circlemarker:false,
      }
    });
    map.addControl(drawCtl);

    const wktInput=document.getElementById('${mapId}-wkt');
    const rawTxt  =document.getElementById('${mapId}-rawtxt');

    /**
     * Serialise *all* layers to WKT.
     *   ‣ homogeneous → Multi*      (MultiPoint, MultiLineString, MultiPolygon)  
     *   ‣ mixed       → GeometryCollection
     */
    const syncToInput=()=>{
      const fc=featureGroup.toGeoJSON();
      if(!fc.features.length){
        wktInput.value=''; rawTxt.value=''; return;
      }

      const types=new Set(fc.features.map(f=>f.geometry.type));
      let geom;

      if(types.size===1){
        const t=types.values().next().value;
        switch(t){
          case 'Point':
            geom=fc.features.length===1
              ? fc.features[0].geometry
              : {type:'MultiPoint',
                 coordinates:fc.features.map(f=>f.geometry.coordinates)};
            break;
          case 'LineString':
            geom=fc.features.length===1
              ? fc.features[0].geometry
              : {type:'MultiLineString',
                 coordinates:fc.features.map(f=>f.geometry.coordinates)};
            break;
          case 'Polygon':
            geom=fc.features.length===1
              ? fc.features[0].geometry
              : {type:'MultiPolygon',
                 coordinates:fc.features.map(f=>f.geometry.coordinates)};
            break;
          default:
            geom={type:'GeometryCollection',
                  geometries:fc.features.map(f=>f.geometry)};
            break;
        }
      }else{
        geom={type:'GeometryCollection',
              geometries:fc.features.map(f=>f.geometry)};
      }

      try{
        const wkt=wellknown.stringify(geom);
        wktInput.value=wkt;
        rawTxt.value=wkt;
      }catch(e){
        /* stringify failed – keep old value to avoid data loss */
      }
    };

    map.on(L.Draw.Event.CREATED,(e)=>{
      featureGroup.addLayer(e.layer);
      syncToInput();
    });
    map.on(L.Draw.Event.EDITED, syncToInput);
    map.on(L.Draw.Event.DELETED, syncToInput);

    /* Keep textarea → hidden‑input in sync (manual edits) */
    rawTxt.addEventListener('input',()=>{ wktInput.value=rawTxt.value; });
  }

  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded',init);
})();
</script>`;
    },
  };
}

module.exports = { leafletEditView };