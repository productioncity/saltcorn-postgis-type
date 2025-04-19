/**
 * map-edit-view.js
 * ----------------------------------------------------------------------------
 * Field‑view "map" – interactive Leaflet editor.
 *
 * Supports:
 *   • Draw / edit / delete Points, LineStrings, Polygons (Leaflet‑Draw).
 *   • Multi‑feature editing → serialises to GEOMETRYCOLLECTION WKT.
 *   • Optional helper input for common Z‑value.
 *
 * External libraries are injected lazily so pages that do not use the view
 * remain lightweight.
 *
 * Author:   Troy Kelly  <troy@team.production.city>
 * Updated:  2025‑04‑19 – hardened dependency loader & removed early WK refs.
 * Licence:  CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');

const DRAW_JS  =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const WELLKNOWN_JS =
  'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/**
 * Build the interactive Leaflet editor.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function mapEditView() {
  return {
    name: 'map',
    isEdit: true,
    /* eslint-disable max-lines */
    /**
     * @param {import('@saltcorn/types').Field} field
     * @param {string=} current
     * @returns {string}
     */
    run(field, current = '') {
      const mapId   = `map_${field.name}_${Math.random().toString(36).slice(2)}`;
      const inputId = `in_${mapId}`;
      const hasZ    = /Z[^A-Za-z]*\(/i.test(current);
      const zId     = hasZ
        ? `z_${mapId}`
        : null;

      const { lat, lng, zoom } = DEFAULT_CENTER;

      return `
<div id="${mapId}" style="height:300px;" class="border"></div>
<input type="hidden" id="${inputId}" name="${field.name}" value="${current}">
${hasZ
  ? `<div class="mt-1">
       <label class="form-label mb-0" for="${zId}">Z&nbsp;value</label>
       <input type="number" step="any"
              id="${zId}" class="form-control form-control-sm">
     </div>`
  : ''}
<script>
(function(){
  /* ------------------------------------------------------------------ *
   * 1.  Dynamic dependency loader (CSS → JS order).                    *
   * ------------------------------------------------------------------ */
  function needCss(href){
    return !!document.querySelector('link[href="'+href+'"]');
  }
  function needJs(src){
    return !!(document._loadedScripts&&document._loadedScripts[src]);
  }
  function loadCss(href){
    return new Promise((res)=>{
      if(needCss(href)) return res();
      const l=document.createElement('link');
      l.rel='stylesheet'; l.href=href; l.onload=res; document.head.appendChild(l);
    });
  }
  function loadJs(src){
    return new Promise((res)=>{
      if(needJs(src)) return res();
      const s=document.createElement('script');
      s.src=src; s.async=true;
      s.onload=function(){ document._loadedScripts=document._loadedScripts||{};
                           document._loadedScripts[src]=true; res(); };
      document.head.appendChild(s);
    });
  }
  (async function(){
    await loadCss(${JSON.stringify(LEAFLET.css)});
    await loadCss(${JSON.stringify(DRAW_CSS)});
    await loadJs(${JSON.stringify(LEAFLET.js)});
    await loadJs(${JSON.stringify(DRAW_JS)});
    await loadJs(${JSON.stringify(WELLKNOWN_JS)});
    initMap();
  })();

  /* ------------------------------------------------------------------ *
   * 2.  Initialise editor only after libs are present.                 *
   * ------------------------------------------------------------------ */
  function initMap(){
    const mapDiv=document.getElementById(${JSON.stringify(mapId)});
    const hidden=document.getElementById(${JSON.stringify(inputId)});
    const map=L.map(mapDiv).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap'
    }).addTo(map);

    /* Feature group that Leaflet‑Draw will edit. */
    const drawn=new L.FeatureGroup().addTo(map);

    /* Hydrate pre‑existing value (if any). */
    if(hidden.value){
      try{
        const gj=window.wellknown.parse(hidden.value);
        if(gj){
          const lyr=L.geoJSON(gj).addTo(drawn);
          map.fitBounds(lyr.getBounds(),{maxZoom:14});
        }
      }catch{/* malformed input – ignore */}
    }

    /* Leaflet‑Draw toolbar. */
    map.addControl(
      new L.Control.Draw({
        edit:{ featureGroup: drawn },
        draw:{
          polygon:true, polyline:true, rectangle:false,
          circle:false, marker:true, circlemarker:false
        }
      })
    );

    /* Serialise FG → WKT helper. */
    function toWkt(){
      const gj=drawn.toGeoJSON();
      if(!gj.features.length) return '';
      if(gj.features.length===1)
        return window.wellknown.stringify(gj.features[0].geometry);
      return 'GEOMETRYCOLLECTION(' +
             gj.features.map(f=>window.wellknown.stringify(f.geometry)).join(',') +
             ')';
    }
    function sync(){ hidden.value=toWkt(); }

    map.on(L.Draw.Event.CREATED,(e)=>{ drawn.addLayer(e.layer); sync(); });
    map.on(L.Draw.Event.EDITED, sync);
    map.on(L.Draw.Event.DELETED, sync);
  }
})();
</script>`;
    },
    /* eslint-enable max-lines */
  };
}

module.exports = { mapEditView };