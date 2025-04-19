/**
 * map-edit-view.js
 * -----------------------------------------------------------------------------
 * Leaflet **edit** field‑view that outputs EWKT guaranteed to match the
 * column’s SQL definition (type + SRID + dimensionality).
 *
 * 2025‑04‑22 – critical‑fix #55  
 *   • All generated WKT strings now carry the `SRID=<srid>;` prefix so that
 *     inserts/updates succeed when the column is constrained to a specific
 *     SRID.  Without this Postgres silently rejected the row (SRID 0 ≠ 4326…).
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/* ───────────────────────────── Imports ────────────────────────────── */

const { DEFAULT_CENTER, LEAFLET } = require('../constants');

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

      const mapId = `map_${Math.random().toString(36).slice(2)}`;
      const inputId = `inp_${mapId}`;

      /* Z‑dimension helper */
      const dimAttr = String(attrs?.dim ?? '').toUpperCase();
      const wantZ = dimAttr.includes('Z') || /Z[^A-Za-z]*\(/i.test(current);
      const zId = wantZ ? `z_${mapId}` : null;

      /* Extract an existing Z value if one is present, else 0 */
      let initialZ = 0;
      if (wantZ) {
        const m = current.match(
          /\(\s*[+-]?\d+(?:\.\d+)?\s+[+-]?\d+(?:\.\d+)?\s+([+-]?\d+(?:\.\d+)?)/,
        );
        if (m) initialZ = Number(m[1]);
      }

      const { lat, lng, zoom } = DEFAULT_CENTER;

      /* ──────────────── 2. Mark‑up payload ─────────────────────── */
      return `
<div class="${cls}">
  <div id="${mapId}" class="border rounded" style="height:300px;"></div>
  <input type="hidden" id="${inputId}" name="${fieldName}" value="${current}">
  ${wantZ
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
${String(function scParsePoint(wkt) {
          /**
           * Extract [lat, lng] from a POINT WKT/EWKT string. Returns null on failure.
           * Accepts both `POINT(lon lat)` and `SRID=4326;POINT(lon lat)` variants.
           */
          if (typeof wkt !== 'string') return null;
          wkt = wkt.replace(/^SRID=.*?;/i, '');
          const m = wkt.match(/^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)/i);
          return m ? [Number(m[2]), Number(m[1])] : null; // [lat, lng]
        })}

/* ───────────── 3. Lazy‑load dependencies ───────────── */
(function(){
  function haveCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){ return !!(document._loadedScripts && document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(haveCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(haveJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  (async function loadAll(){
    await loadCss(${JSON.stringify(LEAFLET.css)});
    await loadCss(${JSON.stringify(DRAW_CSS)});
    await loadJs(${JSON.stringify(LEAFLET.js)});
    await loadJs(${JSON.stringify(DRAW_JS)});
    await loadJs(${JSON.stringify(WELLKNOWN_JS)});
    init();
  })();

/* ─────────────── 4. Main initialiser ──────────────── */
  function init(){
    const mapEl  = document.getElementById(${JSON.stringify(mapId)});
    const hidden = document.getElementById(${JSON.stringify(inputId)});
    if(!mapEl || !hidden || !window.L || !window.L.Draw) return;

    const WANT_Z = ${wantZ};
    const Z_ID   = ${JSON.stringify(zId)};
    const SRID   = ${sridVal};                //  ←───── NEW (mandatory SRID)

    /* ---------- 4.0. Z helpers ---------------------- */
    function currentZ(){
      if(!WANT_Z) return undefined;
      const zEl=document.getElementById(Z_ID);
      return zEl ? parseFloat(zEl.value||'0') : 0;
    }

    function addZCoords(coords, z){
      if(typeof coords[0]==='number'){
        if(coords.length===2) coords.push(z);
        else coords[2]=z;
        return coords;
      }
      return coords.map(c=>addZCoords(c,z));
    }

    function withZ(geom){
      if(!WANT_Z) return geom;
      const z=currentZ();
      const g=JSON.parse(JSON.stringify(geom)); // deep clone
      if(g.type==='GeometryCollection' && Array.isArray(g.geometries)){
        g.geometries=g.geometries.map(withZ);
        return g;
      }
      if('coordinates' in g) g.coordinates=addZCoords(g.coordinates, z);
      return g;
    }

    /* ---------- 4.1. Base map ----------------------- */
    const map = L.map(mapEl).setView([${lat}, ${lng}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);

    const fg = new L.FeatureGroup().addTo(map);

    /* ---------- 4.2. Load existing geometry ---------- */
    try{
      const init = hidden.value.trim().replace(/^SRID=\d+;/i,'');
      if(init){
        const gj  = window.wellknown.parse(init);
        const lyr = L.geoJSON(gj).addTo(fg);
        map.fitBounds(lyr.getBounds(),{maxZoom:14});
      }
    }catch(e){ /* ignore parse errors */ }

    /* ---------- 4.3. Draw toolbar -------------------- */
    map.addControl(new L.Control.Draw({
      edit:{ featureGroup: fg },
      draw:{
        polygon:true, polyline:true,
        rectangle:false, circle:false,
        marker:true, circlemarker:false
      }
    }));

    /* ---------- 4.4. Serialiser – type aware --------- */
    const EXPECT = ${JSON.stringify(expectType)};

    function buildMulti(t){
      const coords = fg.toGeoJSON().features.map(f=>withZ(f.geometry).coordinates);
      const type   = { multipoint:'MultiPoint',
                       multilinestring:'MultiLineString',
                       multipolygon:'MultiPolygon' }[t];
      return window.wellknown.stringify({ type, coordinates: coords });
    }

    function toWkt(){
      const gj = fg.toGeoJSON();
      if(!gj.features.length) return '';

      let wkt;

      if(EXPECT==='geometrycollection'){
        wkt = (WANT_Z?'GEOMETRYCOLLECTION Z(':'GEOMETRYCOLLECTION(')+
               gj.features.map(f=>window.wellknown.stringify(withZ(f.geometry))).join(',')+
               ')';
      } else if(EXPECT==='multipolygon' || EXPECT==='multilinestring' || EXPECT==='multipoint'){
        wkt = buildMulti(EXPECT);
      } else if(gj.features.length===1){
        wkt = window.wellknown.stringify(withZ(gj.features[0].geometry));
      } else {
        /* Default – multiple features but non‑collection column */
        wkt = (WANT_Z?'GEOMETRYCOLLECTION Z(':'GEOMETRYCOLLECTION(')+
               gj.features.map(f=>window.wellknown.stringify(withZ(f.geometry))).join(',')+
               ')';
      }

      return wkt ? ('SRID='+SRID+';'+wkt) : '';   // ←── prepend SRID
    }

    function sync(){ hidden.value = toWkt(); }

    map.on(L.Draw.Event.CREATED,  e=>{fg.addLayer(e.layer); sync();});
    map.on(L.Draw.Event.EDITED,  sync);
    map.on(L.Draw.Event.DELETED, sync);

    if(WANT_Z){
      const zEl=document.getElementById(Z_ID);
      if(zEl) zEl.addEventListener('change',sync);
    }
  }
})();
</script>`;
    },
    /* eslint-enable max-lines-per-function */
  };
}

module.exports = { mapEditView };