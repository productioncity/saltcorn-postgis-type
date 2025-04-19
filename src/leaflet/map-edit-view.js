/**
 * map-edit-view.js
 * -----------------------------------------------------------------------------
 * Leaflet **edit** field‑view that outputs EWKT guaranteed to match the
 * column’s SQL definition (type + SRID + dimensionality).
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/* ───────────────────────────── Imports ────────────────────────────── */

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON, extractFirstZ } = require('../utils/geometry');

const DRAW_JS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS =
  'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const WELLKNOWN_JS =
  'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/* ────────────────────────── Helper functions ─────────────────────── */

/**
 * Normalise Saltcorn’s dual call signature into a single object:
 *   • (fieldName, value, attrs?, classes?)  
 *   • (fieldObj,  value, attrs?, classes?)
 *
 * @param {IArguments} args
 * @returns {{name:string,value:string,attrs?:object,cls?:string}}
 */
function unpackArgs(args) {
  /** @type {string} */ let name = '';
  /** @type {string} */ let value = '';
  /** @type {object} */ let attrs;
  /** @type {string} */ let cls;

  if (args[0] && typeof args[0] === 'object' && 'name' in args[0]) {
    // Field‑object form
    // @ts-ignore – runtime shape check
    name = args[0].name;
    value = args[1] ?? '';
    attrs = args[2];
    cls = args[3];
  } else {
    // Primitive form
    name = args[0] ?? '';
    value = args[1] ?? '';
    attrs = args[2];
    cls = args[3];
  }
  return { name, value: String(value ?? ''), attrs, cls };
}

/**
 * Single‑escape JS literal helper.
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

/* ───────────────────────────── Factory ────────────────────────────── */

/**
 * Generate the edit field‑view for a specific Saltcorn type.
 *
 * @param {string} fallbackType  Lower‑case type name used if attrs.subtype unset.
 * @returns {import('@saltcorn/types').FieldView}
 */
function mapEditView(fallbackType = '') {
  return {
    name: 'edit',
    isEdit: true,
    description: 'Interactive Leaflet editor whose EWKT matches the column type.',

    /* eslint-disable max-lines-per-function */
    run(/* dynamic – preserves Saltcorn’s variable signature */) {
      /* ──────────────── 1. Parameters & IDs ────────────────────── */
      const { name: fieldName, value: current, attrs = {}, cls = '' } =
        unpackArgs(arguments);

      /* Concrete geometry type required by the column */
      const expectType = String(
        (attrs.subtype && `${attrs.subtype}`.toLowerCase()) || fallbackType,
      ).toLowerCase();

      /* SRID (falls back to WGS‑84) */
      const sridVal =
        attrs && Number.isFinite(Number(attrs.srid))
          ? Number(attrs.srid)
          : 4326;

      const mapId   = `map_${Math.random().toString(36).slice(2)}`;
      const inputId = `inp_${mapId}`;

      /* Z‑dimension helper */
      const dimAttr = String(attrs?.dim ?? '').toUpperCase();
      const wantZ   = dimAttr.includes('Z') || /Z[^A-Za-z]*\(/i.test(current);
      const initialZ = wantZ ? extractFirstZ(current) : 0;
      const zId     = wantZ ? `z_${mapId}` : null;

      /* Server‑side GeoJSON conversion – handles *everything*. */
      const initGeoJSON = wktToGeoJSON(current);

      const { lat, lng, zoom } = DEFAULT_CENTER;

      /* ──────────────── 2. Mark‑up payload ─────────────────────── */
      return `
<div class="${cls}">
  <div id="${mapId}" class="border rounded" style="height:300px;"></div>
  <input type="hidden" id="${inputId}" name="${fieldName}" value="${current}">
  ${
    wantZ
      ? `<div class="mt-1">
           <label for="${zId}" class="form-label mb-0">Z&nbsp;value</label>
           <input type="number" id="${zId}"
                  class="form-control form-control-sm" step="any"
                  value="${initialZ}">
         </div>`
      : ''
  }
</div>

<script>
(function(){
  const MAP_ID=${js(mapId)};
  const INP_ID=${js(inputId)};
  const GEOJSON=${js(initGeoJSON)};
  const LEAF_CSS=${js(LEAFLET.css)};
  const LEAF_JS=${js(LEAFLET.js)};
  const DRAW_CSS=${js(DRAW_CSS)};
  const DRAW_JS=${js(DRAW_JS)};
  const WK_JS=${js(WELLKNOWN_JS)};
  const WANT_Z=${wantZ};
  const Z_ID=${js(zId)};
  const SRID=${sridVal};
  const EXPECT=${js(expectType)};

  /* ---------- 0. Utility loaders ---------- */
  function haveCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){return !!(document._loadedScripts && document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(haveCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(haveJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  (async function(){
    await loadCss(LEAF_CSS); await loadCss(DRAW_CSS);
    await loadJs(LEAF_JS);  await loadJs(DRAW_JS); await loadJs(WK_JS);
    init();
  })();

  /* ---------- 1. Init map once deps ready ---------- */
  function init(){
    const mapEl=document.getElementById(MAP_ID);
    const hidden=document.getElementById(INP_ID);
    if(!mapEl||!hidden||!window.L||!window.L.Draw)return;

    const map=L.map(mapEl).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);

    const fg=new L.FeatureGroup().addTo(map);

    /* ---------- 1.1 Load existing geometry ---------- */
    if(GEOJSON){
      const lyr=L.geoJSON(GEOJSON).addTo(fg);
      map.fitBounds(lyr.getBounds(),{maxZoom:14});
    }

    /* ---------- 1.2 Draw toolbar ------------------- */
    map.addControl(new L.Control.Draw({
      edit:{ featureGroup: fg },
      draw:{
        polygon:true, polyline:true,
        rectangle:false, circle:false,
        marker:true, circlemarker:false
      }
    }));

    /* ---------- 1.3 Helpers ------------------------ */
    function currentZ(){
      if(!WANT_Z) return undefined;
      const zEl=document.getElementById(Z_ID);
      return zEl ? parseFloat(zEl.value||'0') : 0;
    }

    function addZ(coords,z){
      if(typeof coords[0]==='number'){
        if(coords.length===2)coords.push(z);else coords[2]=z;
        return coords;
      }
      return coords.map(c=>addZ(c,z));
    }

    function withZ(geom){
      if(!WANT_Z)return geom;
      const z=currentZ();
      const g=JSON.parse(JSON.stringify(geom));
      if(g.type==='GeometryCollection'){
        g.geometries=g.geometries.map(withZ);
        return g;
      }
      if('coordinates'in g)g.coordinates=addZ(g.coordinates,z);
      return g;
    }

    /* ---------- 1.4 Serialise to EWKT -------------- */
    function buildMulti(t){
      const coords=fg.toGeoJSON().features.map(f=>withZ(f.geometry).coordinates);
      const type={multipoint:'MultiPoint',multilinestring:'MultiLineString',multipolygon:'MultiPolygon'}[t];
      return window.wellknown.stringify({type,coordinates:coords});
    }

    function toWkt(){
      const gj=fg.toGeoJSON();
      if(!gj.features.length)return '';

      let wkt;
      if(EXPECT==='geometrycollection'){
        wkt=(WANT_Z?'GEOMETRYCOLLECTION Z(':'GEOMETRYCOLLECTION(')+
             gj.features.map(f=>window.wellknown.stringify(withZ(f.geometry))).join(',')+
             ')';
      }else if(EXPECT==='multipolygon'||EXPECT==='multilinestring'||EXPECT==='multipoint'){
        wkt=buildMulti(EXPECT);
      }else if(gj.features.length===1){
        wkt=window.wellknown.stringify(withZ(gj.features[0].geometry));
      }else{
        wkt=(WANT_Z?'GEOMETRYCOLLECTION Z(':'GEOMETRYCOLLECTION(')+
             gj.features.map(f=>window.wellknown.stringify(withZ(f.geometry))).join(',')+
             ')';
      }
      return wkt?('SRID='+SRID+';'+wkt):'';
    }

    function sync(){hidden.value=toWkt();}

    map.on(L.Draw.Event.CREATED,e=>{fg.addLayer(e.layer);sync();});
    map.on(L.Draw.Event.EDITED, sync);
    map.on(L.Draw.Event.DELETED, sync);
    if(WANT_Z){
      const zEl=document.getElementById(Z_ID);
      if(zEl)zEl.addEventListener('change',sync);
    }
  }
})();
</script>`;
    },
    /* eslint-enable max-lines-per-function */
  };
}

module.exports = { mapEditView };