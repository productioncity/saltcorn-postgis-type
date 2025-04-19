/**
 * edit-view.js
 * ---------------------------------------------------------------------------
 * Leaflet‑based interactive “edit” field‑view for all PostGIS geometry types.
 *
 * Features
 * ────────────────────────────────────────────────────────────────────────────
 * • Supports creating new records (draw on map).
 * • Editing/deleting existing geometries via leaflet.draw UI.
 * • Hidden <input> persists the WKT back to Saltcorn on form submit.
 * • Falls back to raw text editing for dimensions Leaflet cannot capture
 *   (Z/M/ZM) – users can refine the WKT manually post‑draw.
 *
 * External, browser‑side dependencies are loaded lazily:
 *   – Leaflet assets (served by the plug‑in via constants.LEAFLET).
 *   – leaflet.draw 1.0.4 (CDN).
 *   – wellknown 0.5.0 (CDN) for WKT⇆GeoJSON conversion.
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
 * Produces a Saltcorn field‑view for interactive geometry editing.
 *
 * @param {string} typeName – The logical Saltcorn type (point, polygon …)
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletEditView(typeName) {
  return {
    isEdit: true,
    /**
     * @param {string} name                – Field name.
     * @param {string|undefined|null} value – Current WKT/EWKT value.
     * @returns {string} HTML fragment
     */
    run(name, value) {
      const safeVal = escapeHtml(value ?? '');
      const mapId = `sc-edit-map-${name}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      return `
${LEAFLET.header()}
<!-- Load wellknown.js when not already present -->
<script>
if(!window.wellknown){
  const s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';
  document.head.appendChild(s);
}
</script>

<!-- Hidden input that Saltcorn actually reads/writes -->
<input type="hidden" id="${mapId}-wkt" name="${name}" value="${safeVal}">

<!-- Raw WKT textarea (toggleable) for power‑users -->
<div class="mb-2">
  <button type="button" class="btn btn-sm btn-outline-secondary"
          data-bs-toggle="collapse" data-bs-target="#${mapId}-raw">
    Toggle raw WKT editor
  </button>
</div>
<div id="${mapId}-raw" class="collapse mb-2">
  <textarea class="form-control" rows="3"
            id="${mapId}-rawtxt">${safeVal}</textarea>
</div>

<!-- Map container -->
<div id="${mapId}" style="height:400px"></div>

<script>
(function(){
  const init=()=>{
    if(!window.L){ setTimeout(init,50); return; }

    /* Lazy‑load leaflet.draw only once */
    const loadDraw=(cb)=>{
      if(window.L && window.L.Draw){ cb(); return; }
      const css=document.createElement('link');
      css.rel='stylesheet';
      css.href='https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
      document.head.appendChild(css);

      const js=document.createElement('script');
      js.src='https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
      js.onload=cb;
      document.head.appendChild(js);
    };

    loadDraw(()=>{
      const map=L.map(${JSON.stringify(mapId)}).setView([0,0],2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'&copy; OpenStreetMap contributors',
      }).addTo(map);

      const featureGroup=new L.FeatureGroup().addTo(map);

      /* Populate from existing WKT */
      const initWkt=document.getElementById('${mapId}-wkt').value;
      if(initWkt && window.wellknown){
        try{
          const g=window.wellknown.parse(initWkt);
          if(g){
            const lyr=L.geoJSON(g);
            lyr.eachLayer((l)=>featureGroup.addLayer(l));
            map.fitBounds(featureGroup.getBounds());
          }
        }catch(e){}
      }

      /* Draw control */
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
      const rawTxt=document.getElementById('${mapId}-rawtxt');

      const syncToInput=()=>{
        const geo=featureGroup.toGeoJSON();
        if(geo.features && geo.features.length){
          const wkt=window.wellknown.stringify(geo.features[0].geometry);
          wktInput.value=wkt;
          rawTxt.value=wkt;
        }else{
          wktInput.value='';
          rawTxt.value='';
        }
      };

      map.on(L.Draw.Event.CREATED,(e)=>{
        featureGroup.clearLayers();
        featureGroup.addLayer(e.layer);
        syncToInput();
      });
      map.on(L.Draw.Event.EDITED, syncToInput);
      map.on(L.Draw.Event.DELETED, syncToInput);

      /* Keep hidden and textarea in sync */
      rawTxt.addEventListener('input',()=>{
        wktInput.value=rawTxt.value;
      });
    });
  };

  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
</script>`;
    },
  };
}

module.exports = { leafletEditView };