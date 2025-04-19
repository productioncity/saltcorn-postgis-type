/**
 * map-edit-view.js
 * -----------------------------------------------------------------------------
 * Field‑view “edit” – interactive Leaflet editor that **guarantees** the WKT
 * sent back to Saltcorn matches the column’s SQL type:
 *   • geometrycollection → GEOMETRYCOLLECTION( … )
 *   • multipolygon       → MULTIPOLYGON( … )
 *   • multilinestring    → MULTILINESTRING( … )
 *   • multipoint         → MULTIPOINT( … )
 *   • everything else    → single geometry or GEOMETRYCOLLECTION
 *
 * Author:   Troy Kelly  <troy@team.production.city>
 * Updated:  2025‑04‑20
 * Licence:  CC0‑1.0
 */

'use strict';

/* ─────────────────────────  Imports / constants  ─────────────────────────── */

const { DEFAULT_CENTER, LEAFLET } = require('../constants');

const DRAW_JS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const WELLKNOWN_JS =
  'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/* ───────────────────────────  Utility helpers  ───────────────────────────── */

/**
 * Normalises Saltcorn’s two call signatures:
 *   • (fieldName:string, value, attrs?, classes?)
 *   • (fieldObj:Field,   value, attrs?, classes?)
 *
 * @param {IArguments} args
 * @returns {{name:string,value:string,attrs?:object,cls?:string}}
 */
function unpackArgs(args) {
  /** @type {string} */ let name  = '';
  /** @type {string} */ let value = '';
  /** @type {object} */ let attrs;
  /** @type {string} */ let cls;

  if (args[0] && typeof args[0] === 'object' && 'name' in args[0]) {
    // Field‑object form
    // @ts-ignore runtime shape test
    name  = args[0].name;
    value = args[1] ?? '';
    attrs = args[2];
    cls   = args[3];
  } else {
    // Primitive form
    name  = args[0] ?? '';
    value = args[1] ?? '';
    attrs = args[2];
    cls   = args[3];
  }
  return { name, value: String(value ?? ''), attrs, cls };
}

/* ──────────────────────────────  Factory  ───────────────────────────────── */

/**
 * Builds the Leaflet edit view for any PostGIS type.
 *
 * @param {string} expectedType  Saltcorn type name in lower case.
 * @returns {import('@saltcorn/types').FieldView}
 */
function mapEditView(expectedType = '') {
  return {
    name: 'edit',
    isEdit: true,
    description:
      'Interactive Leaflet editor whose WKT output matches the column type.',
    /* eslint-disable max-lines-per-function */
    run(/* dynamic */) {
      /* ───── 1. Args & IDs ──────────────────────────────────────── */
      const { name: fieldName, value: current, attrs = {}, cls = '' } =
        unpackArgs(arguments);

      const mapId   = `map_${Math.random().toString(36).slice(2)}`;
      const inputId = `inp_${mapId}`;

      /* ───── 2. Z‑dimension helper input ───────────────────────── */
      const dimAttr  = String(attrs?.dim ?? '').toUpperCase();
      const wantZ    = dimAttr.includes('Z') || /Z[^A-Za-z]*\(/i.test(current);
      const zId      = wantZ ? `z_${mapId}` : null;

      const { lat, lng, zoom } = DEFAULT_CENTER;

      /* ───── 3. HTML payload (map + hidden input) ───────────────── */
      return `
<div class="${cls}">
  <div id="${mapId}" class="border rounded" style="height:300px;"></div>
  <input type="hidden" id="${inputId}" name="${fieldName}" value="${current}">
  ${
    wantZ
      ? `<div class="mt-1">
           <label for="${zId}" class="form-label mb-0">Z&nbsp;value</label>
           <input type="number" id="${zId}" class="form-control form-control-sm" step="any">
         </div>`
      : ''
  }
</div>

<script>
${String(function scParsePoint(wkt) {
  if (typeof wkt !== 'string') return null;
  wkt = wkt.replace(/^SRID=.*?;/i, '');
  const m = wkt.match(/^POINT\\s*\\(\\s*([+-]?\\d+(?:\\.\\d+)?)\\s+([+-]?\\d+(?:\\.\\d+)?)\\s*/i);
  return m ? [Number(m[2]), Number(m[1])] : null;
})}

/* ─────────────── dependency loader ─────────────── */
(function(){
  function haveCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){ return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(haveCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;document.head.appendChild(l);});}
  function loadJs(s){ return new Promise(r=>{if(haveJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  (async function(){
    await loadCss(${JSON.stringify(LEAFLET.css)});
    await loadCss(${JSON.stringify(DRAW_CSS)});
    await loadJs(${JSON.stringify(LEAFLET.js)});
    await loadJs(${JSON.stringify(DRAW_JS)});
    await loadJs(${JSON.stringify(WELLKNOWN_JS)});
    init();
  })();

/* ────────────────  main init  ──────────────────── */
  function init(){
    const mapEl  = document.getElementById(${JSON.stringify(mapId)});
    const hidden = document.getElementById(${JSON.stringify(inputId)});
    if(!mapEl||!hidden||!window.L||!window.L.Draw) return;

    const map = L.map(mapEl).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                {attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    const fg  = new L.FeatureGroup().addTo(map);

    /* ---- Load existing WKT -------------------------------------- */
    try{
      const init = hidden.value.trim();
      if(init){
        const gj = window.wellknown.parse(init.replace(/^SRID=\\d+;/i,''));
        const lyr = L.geoJSON(gj).addTo(fg);
        map.fitBounds(lyr.getBounds(),{maxZoom:14});
      }
    }catch{}

    /* ---- Draw toolbar ------------------------------------------- */
    map.addControl(new L.Control.Draw({
      edit:{featureGroup:fg},
      draw:{polygon:true,polyline:true,rectangle:false,circle:false,marker:true,circlemarker:false}
    }));

    /* ---- Serialiser – type aware -------------------------------- */
    const EXPECT = ${JSON.stringify(expectedType)};

    function buildMulti(t){
      const coords = fg.toGeoJSON().features.map(f=>f.geometry.coordinates);
      const type   = { multipoint:'MultiPoint',
                       multilinestring:'MultiLineString',
                       multipolygon:'MultiPolygon' }[t];
      return window.wellknown.stringify({ type, coordinates: coords });
    }

    function toWkt(){
      const gj = fg.toGeoJSON();
      if(!gj.features.length) return '';

      if(EXPECT==='geometrycollection'){
        return 'GEOMETRYCOLLECTION('+
          gj.features.map(f=>window.wellknown.stringify(f.geometry)).join(',')+
          ')';
      }

      if(EXPECT==='multipolygon'||EXPECT==='multilinestring'||EXPECT==='multipoint')
        return buildMulti(EXPECT);

      if(gj.features.length===1)
        return window.wellknown.stringify(gj.features[0].geometry);

      return 'GEOMETRYCOLLECTION('+
        gj.features.map(f=>window.wellknown.stringify(f.geometry)).join(',')+
        ')';
    }

    function sync(){ hidden.value = toWkt(); }

    map.on(L.Draw.Event.CREATED,e=>{fg.addLayer(e.layer);sync();});
    map.on(L.Draw.Event.EDITED, sync);
    map.on(L.Draw.Event.DELETED,sync);
  }
})();
</script>`;
    },
    /* eslint-enable max-lines-per-function */
  };
}

module.exports = { mapEditView };