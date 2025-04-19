/**
 * edit-view.js
 * ----------------------------------------------------------------------------
 * Interactive Leaflet + Leaflet‑Draw editor for every PostGIS geometry type.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const wellknown          = require('wellknown');
const { wktToGeoJSON }   = require('../utils/geometry');
const { DEFAULT_CENTER } = require('../constants');

/**
 * Escapes HTML text.
 *
 * @param {unknown} val
 * @returns {string}
 */
function esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * Factory – builds a Leaflet edit view bound to a specific PostGIS type name.
 *
 * @param {string} typeName
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletEditView(typeName) {
  const singleGeometry = !typeName.toLowerCase().startsWith('multi')
    && typeName.toLowerCase() !== 'geometrycollection';

  return {
    name: 'leaflet',
    displayName: 'Leaflet map',
    isEdit: true,
    /**
     * @param {string} field_name   DB column name.
     * @param {string} v            Stored WKT (may be undefined).
     * @param {object} attrs        Field attributes object.
     * @param {string} cls          CSS classes.
     * @returns {string}            HTML+JS for the editor.
     */
    run(field_name, v, attrs, cls) {
      const mapId   = `sc_leaflet_edit_${Math.random().toString(36).slice(2)}`;
      const inputId = `${mapId}_input`;
      const geo     = wktToGeoJSON(v) || null;
      const geoStr  = esc(JSON.stringify(geo));

      /* Pre‑select allowed draw shapes – everything for generic/multi types, else narrow. */
      const drawOpts = singleGeometry
        ? `{ marker:true, polyline:${/line/i.test(typeName)}, polygon:${/polygon/i.test(typeName)}, rectangle:${/polygon/i.test(typeName)}, circle:false, circlemarker:false }`
        : 'false'; // Leaflet‑Draw default (all options)

      return `
<input type="hidden" name="${field_name}" id="${inputId}" class="${cls}" value="${esc(v)}">
<div id="${mapId}" class="sc-leaflet-edit" style="width:100%;height:320px;margin-top:4px;"></div>

<!-- Leaflet‑Draw + WellKnown client assets (loaded once per page) -->
<link id="sc-leaflet-draw-css" rel="stylesheet"
      href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css"
      onload="if(window.L&&window.L.Draw){this.remove();}">
<script id="sc-leaflet-draw-js" src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js" defer
        onload="window.scLeafletDrawLoaded=true;"></script>
<script id="sc-wellknown-js" src="https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js" defer
        onload="window.scWellknownLoaded=true;"></script>

<script defer>
(function(){
  function ready(){
    if(!window.L || !window.L.Draw || !window.wellknown){setTimeout(ready,50);return;}

    const map=L.map("${mapId}");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      attribution:"&copy; OpenStreetMap contributors"
    }).addTo(map);

    const drawnItems=new L.FeatureGroup();
    map.addLayer(drawnItems);

    /* Populate existing geometry if any */
    const g=${geoStr};
    if(g){
      L.geoJSON(g).eachLayer(l=>drawnItems.addLayer(l));
      try{map.fitBounds(drawnItems.getBounds());}catch(e){}
    }
    if(!g){map.setView([${DEFAULT_CENTER.lat},${DEFAULT_CENTER.lng}],${DEFAULT_CENTER.zoom});}

    /* Draw control */
    const drawCtl=new L.Control.Draw({
      edit:{ featureGroup:drawnItems, remove:true },
      draw:${drawOpts}
    });
    map.addControl(drawCtl);

    const input=document.getElementById("${inputId}");

    /* Converts current layers to WKT and stores to hidden input */
    function syncToInput(){
      if(drawnItems.getLayers().length===0){input.value="";return;}

      if(${singleGeometry}){
        const geom=drawnItems.getLayers()[0].toGeoJSON().geometry;
        input.value=window.wellknown.stringify(geom);
        /* Ensure only one feature stays for single‑geometry types */
        drawnItems.getLayers().slice(1).forEach(l=>drawnItems.removeLayer(l));
      }else{
        /* Multi / collection */
        const fc=drawnItems.toGeoJSON();
        const geom={
          type:"GeometryCollection",
          geometries:fc.features.map(f=>f.geometry),
        };
        input.value=window.wellknown.stringify(geom);
      }
    }

    map.on(L.Draw.Event.CREATED,function(e){
      if(${singleGeometry}) drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      syncToInput();
    });
    map.on(L.Draw.Event.EDITED, syncToInput);
    map.on(L.Draw.Event.DELETED, syncToInput);
  }
  ready();
})();
</script>`;
    },
  };
}

module.exports = { leafletEditView };