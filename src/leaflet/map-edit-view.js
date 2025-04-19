/**
 * map-edit-view.js
 * ----------------------------------------------------------------------------
 * Field‑view `"map"` – interactive Leaflet editor.
 *
 * Fully supports:
 *   • Drawing / editing / deleting Points, LineStrings, Polygons
 *     (via Leaflet.Draw).
 *   • Multi‑feature editing: serialises to GEOMETRYCOLLECTION in WKT.
 *   • Optional Z‑value helper input.
 *
 * All external libraries (Leaflet, Leaflet‑Draw, Wellknown) are injected
 * lazily so there is **zero** global impact on pages that never use this
 * field‑view.
 *
 * Author:   Troy Kelly  <troy@team.production.city>
 * Updated:  2025‑04‑19 – add Wellknown loader + safe dependency chain.
 * Licence:  CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

const DRAW_JS  =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const WELLKNOWN_JS =
  'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/**
 * Creates the interactive Leaflet editor field‑view.
 *
 * @param {string} typeName  Lower‑case Saltcorn type name (point, polygon, …).
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
    /* eslint-disable max-lines */
    run(field, current, _attrs, classes = '') {
      const mapId   = `map_${field.name}_${Math.random().toString(36).slice(2)}`;
      const inputId = `in_${mapId}`;
      const zId     = `z_${mapId}`;

      const value = current || '';
      const hasZ  = /Z[^A-Za-z]*\(/i.test(value);
      const { lat, lng, zoom } = DEFAULT_CENTER;

      return `
<div id="${mapId}" style="height:300px;" class="border"></div>
<input type="hidden" id="${inputId}" name="${field.name}" value="${value}">
${
  hasZ
    ? `<div class="mt-1">
         <label class="form-label mb-0" for="${zId}">Z&nbsp;value</label>
         <input type="number" step="any" class="form-control form-control-sm"
                id="${zId}">
       </div>`
    : ''
}
<script>
(function(){
  const mapDiv = document.getElementById(${JSON.stringify(mapId)});
  /* ---------------------------------------------------------------------- */
  /* Dynamic dependency loader – guarantees the following order:            */
  /*   1. leaflet.css   2. draw.css   3. leaflet.js   4. draw.js   5. WK.js */
  /* ---------------------------------------------------------------------- */
  function injectCss(href){
    return new Promise((resolve)=>{
      if(document.querySelector('link[href="'+href+'"]')) return resolve();
      const l=document.createElement('link');
      l.rel='stylesheet'; l.href=href; l.onload=resolve;
      document.head.appendChild(l);
    });
  }
  function injectJs(src){
    return new Promise((resolve)=>{
      if(document.querySelector('script[src="'+src+'"]') || window._ljs[src])
        return resolve();
      const s=document.createElement('script');
      s.src=src; s.async=true; s.onload=function(){ window._ljs=window._ljs||{};
        window._ljs[src]=true; resolve(); };
      document.head.appendChild(s);
    });
  }
  (async function loadDeps(){
    await injectCss(${JSON.stringify(LEAFLET.css)});
    await injectCss(${JSON.stringify(DRAW_CSS)});
    await injectJs(${JSON.stringify(LEAFLET.js)});
    await injectJs(${JSON.stringify(DRAW_JS)});
    await injectJs(${JSON.stringify(WELLKNOWN_JS)});
    initEditor();
  })();

  /* ---------------------------------------------------------------------- */
  /* Main editor initialisation (runs only after all libs are present)      */
  /* ---------------------------------------------------------------------- */
  function initEditor(){
    const map=L.map(mapDiv).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);

    const drawn = new L.FeatureGroup().addTo(map);
    const hiddenInput = document.getElementById(${JSON.stringify(inputId)});

    /* ——— Hydrate existing geometry ——— */
    if(hiddenInput.value){
      try{
        const gj=window.wellknown.parse(hiddenInput.value);
        if(gj){
          const layer=L.geoJSON(gj).addTo(drawn);
          map.fitBounds(layer.getBounds(),{ maxZoom: 14 });
        }
      }catch{/* ignore bad WKT */}
    }

    /* ——— Draw controls ——— */
    map.addControl(new L.Control.Draw({
      edit: { featureGroup: drawn },
      draw: {
        polygon: true, polyline: true, rectangle: false,
        circle: false, marker: true, circlemarker: false
      },
    }));

    /* ——— Helpers ——— */
    function toWkt(){
      const geo=drawn.toGeoJSON();
      if(!geo.features.length) return '';
      if(geo.features.length===1)
        return window.wellknown.stringify(geo.features[0].geometry);
      const wkts=geo.features.map(f=>window.wellknown.stringify(f.geometry));
      return 'GEOMETRYCOLLECTION(' + wkts.join(',') + ')';
    }
    function syncHidden(){ hiddenInput.value = toWkt(); }

    /* ——— Event wiring ——— */
    map.on(L.Draw.Event.CREATED, (e)=>{ drawn.addLayer(e.layer); syncHidden(); });
    map.on(L.Draw.Event.EDITED,  syncHidden);
    map.on(L.Draw.Event.DELETED, syncHidden);
  }
})();
</script>`;
    },
    /* eslint-enable max-lines */
  };
}

module.exports = { mapEditView };