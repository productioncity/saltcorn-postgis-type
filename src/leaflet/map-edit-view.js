/**
 * map-edit-view.js
 * -----------------------------------------------------------------------------
 * Field‑view “edit” – interactive Leaflet editor for every PostGIS column type.
 *
 * The serialiser now guarantees the generated WKT **always matches the column’s
 * declared SQL type**:
 *   • geometrycollection   → GEOMETRYCOLLECTION( … )
 *   • multipolygon         → MULTIPOLYGON( … )
 *   • multilinestring      → MULTILINESTRING( … )
 *   • multipoint           → MULTIPOINT( … )
 *   • all other types      → single geometry or GEOMETRYCOLLECTION as needed
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  2025‑04‑20 – type‑aware WKT serialiser
 * Licence:  CC0‑1.0
 */

'use strict';

/* ────────────────────────────────────────────────────────────────────────── */

const { DEFAULT_CENTER, LEAFLET } = require('../constants');

const DRAW_JS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const WELLKNOWN_JS =
  'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/* ───────────────────────── Helper: unpack Saltcorn args ─────────────────── */

/**
 * Normalises Saltcorn’s two field‑view call signatures:
 *   • (fieldName:string, value, attrs?, classes?)
 *   • (fieldObj:Field,   value, attrs?, classes?)
 *
 * @param {IArguments} args
 * @returns {{name:string,value:string,attrs?:object,cls?:string}}
 */
function unpackArgs(args) {
  /** @type {string}   */ let name  = '';
  /** @type {string}   */ let value = '';
  /** @type {object}   */ let attrs;
  /** @type {string}   */ let cls;

  if (args[0] && typeof args[0] === 'object' && 'name' in args[0]) {
    // Field object form
    // @ts-ignore – runtime shape check
    name  = args[0].name;
    value = args[1] ?? '';
    attrs = args[2];
    cls   = args[3];
  } else {
    // Primitive (string) form
    name  = args[0] ?? '';
    value = args[1] ?? '';
    attrs = args[2];
    cls   = args[3];
  }
  return { name, value: String(value ?? ''), attrs, cls };
}

/* ───────────────────────────── Main factory ─────────────────────────────── */

/**
 * Returns the Leaflet edit field‑view for a particular PostGIS *Saltcorn*
 * type name (e.g. “polygon”, “geometrycollection”, “multipolygon”…).
 *
 * @param {string} expectedType  Lower‑case Saltcorn type name.
 * @returns {import('@saltcorn/types').FieldView}
 */
function mapEditView(expectedType = '') {
  return {
    name: 'edit',
    isEdit: true,
    description:
      'Interactive Leaflet editor producing WKT that matches the column type.',
    /* eslint-disable max-lines-per-function */
    run(/* …dynamic… */) {
      /* ───── 1. Extract call parameters ─────────────────────────── */
      const { name: fieldName, value: current, attrs = {}, cls = '' } =
        unpackArgs(arguments);

      const mapId   = `map_${Math.random().toString(36).slice(2)}`;
      const inputId = `inp_${mapId}`;

      /* ───── 2. 3‑D helper (single global Z value) ───────────────── */
      const dimAttr  = String(attrs?.dim ?? '').toUpperCase();
      const hasZAttr = dimAttr.includes('Z');
      const hasZVal  = /Z[^A-Za-z]*\(/i.test(current);
      const wantZ    = hasZAttr || hasZVal;
      const zId      = wantZ ? `z_${mapId}` : null;

      const { lat, lng, zoom } = DEFAULT_CENTER;

      /* ───── 3. HTML ‑ wrapper & hidden input ────────────────────── */
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
  var m = wkt.replace(/^SRID=\\d+;/i, '')
             .match(/^POINT[^()]*\\(\\s*([+-]?\\d+(?:\\.\\d+)?)\\s+([+-]?\\d+(?:\\.\\d+)?)\\s*/i);
  return m ? [Number(m[2]), Number(m[1])] : null; // [lat, lng]
})}

/* ───────── dynamic dependency loader ───────── */
(function(){
  function hasCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function hasJs(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function getCss(h){return new Promise(r=>{if(hasCss(h))return r();
    var l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;document.head.appendChild(l);});}
  function getJs(s){return new Promise(r=>{if(hasJs(s))return r();
    var sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};document.head.appendChild(sc);});}

  (async function(){
    await getCss(${JSON.stringify(LEAFLET.css)});
    await getCss(${JSON.stringify(DRAW_CSS)});
    await getJs(${JSON.stringify(LEAFLET.js)});
    await getJs(${JSON.stringify(DRAW_JS)});
    await getJs(${JSON.stringify(WELLKNOWN_JS)});
    init();
  })();

/* ─────────────── initialiser ───────────────── */
  function init(){
    var mapEl  = document.getElementById(${JSON.stringify(mapId)});
    var hidden = document.getElementById(${JSON.stringify(inputId)});
    if(!mapEl||!hidden||!window.L||!window.L.Draw) return;

    var map = L.map(mapEl).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                {attribution:'&copy; OpenStreetMap'}).addTo(map);

    var fg = new L.FeatureGroup().addTo(map);

    /* 3‑A. Load existing WKT/EWKT */
    try{
      var init = hidden.value.trim();
      if(init){
        var gj  = window.wellknown.parse(init.replace(/^SRID=\\d+;/i,''));
        var lyr = L.geoJSON(gj).addTo(fg);
        map.fitBounds(lyr.getBounds(),{maxZoom:14});
      }
    }catch(e){/* swollow parse errors */ }

    /* 3‑B. Draw toolbar */
    map.addControl(new L.Control.Draw({
      edit: { featureGroup: fg },
      draw: { polygon:true, polyline:true, rectangle:false, circle:false,
              marker:true, circlemarker:false }
    }));

    /* 3‑C. Serialiser that respects the column type */
    var EXPECT = ${JSON.stringify(expectedType.toLowerCase())};

    function buildMulti(type){
      var coords = fg.toGeoJSON().features.map(function(f){ return f.geometry.coordinates; });
      var gType  = { multipolygon:'MultiPolygon',
                     multilinestring:'MultiLineString',
                     multipoint:'MultiPoint' }[type];
      return window.wellknown.stringify({ type:gType, coordinates:coords });
    }

    function toWkt(){
      var gj = fg.toGeoJSON();
      if(!gj.features.length) return '';

      if(EXPECT==='geometrycollection'){
        return 'GEOMETRYCOLLECTION('+
          gj.features.map(function(f){return window.wellknown.stringify(f.geometry);}).join(',')+
          ')';
      }
      if(EXPECT==='multipolygon' || EXPECT==='multilinestring' || EXPECT==='multipoint')
        return buildMulti(EXPECT);

      if(gj.features.length===1)
        return window.wellknown.stringify(gj.features[0].geometry);

      // Mixed types → geometrycollection
      return 'GEOMETRYCOLLECTION('+
        gj.features.map(function(f){return window.wellknown.stringify(f.geometry);}).join(',')+
        ')';
    }

    function sync(){ hidden.value = toWkt(); }

    map.on(L.Draw.Event.CREATED, function(e){ fg.addLayer(e.layer); sync(); });
    map.on(L.Draw.Event.EDITED,  sync);
    map.on(L.Draw.Event.DELETED, sync);
  }
})();
</script>`;
    },
    /* eslint-enable max-lines-per-function */
  };
}

module.exports = { mapEditView };