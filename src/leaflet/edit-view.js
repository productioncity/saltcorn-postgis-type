/**
 * edit‑view.js
 * ---------------------------------------------------------------------------
 * Leaflet‑based interactive “edit” field‑view for all PostGIS geometries with
 * automatic SRID re‑projection between the database column and Leaflet.
 *
 * Behaviour
 * ────────────────────────────────────────────────────────────────────────────
 * • Field SRID === 4326 →  no transformation (previous behaviour).           
 * • Field SRID ≠ 4326    →  geometry is transformed:                         
 *     – DB→UI:  EPSG:<srid> ➞ EPSG:4326 (for display)                        
 *     – UI→DB:  EPSG:4326 ➞ EPSG:<srid> (on save)                            
 *   The stored WKT is always prefixed `SRID=<srid>;…`, ready for PostGIS.    
 *
 * • Multiple drawn layers are serialised to Multi* / GeometryCollection.    
 * • Raw WKT editor stays synchronised and respects the SRID prefix.         
 *
 * Dependencies are lazy‑loaded only once per page:                          
 *   – proj4 2.9  (for coordinate transforms)                                
 *   – wellknown 0.5 (GeoJSON ⇆ WKT)                                         
 *   – leaflet.draw 1.0.4 (drawing tools)                                    
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { LEAFLET } = require('../constants');

/**
 * Escape HTML – minimal needed set.
 *
 * @param {unknown} v
 * @returns {string}
 */
function esc(v) {
  return typeof v === 'string'
    ? v.replace(/[&<>"'`]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c] || c
      ))
    : '';
}

/**
 * Build a Saltcorn field‑view for interactive geometry editing.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletEditView() {
  return {
    isEdit: true,

    /**
     * @param {string} name                 – Field name.
     * @param {string|null=} wktValue       – Existing WKT/EWKT.
     * @param {{srid?:number}=} attrs       – Field attributes (Saltcorn injects).
     * @returns {string}
     */
    run(name, wktValue, attrs = {}) {
      const fieldSRID = Number.isInteger(attrs.srid) ? Number(attrs.srid) : 4326;
      const safeVal = esc(wktValue ?? '');
      const idBase = `sc-edit-${name}-${Math.random().toString(36).slice(2, 8)}`;

      return `
${LEAFLET.header()}

<!-- One‑off loader for browser deps -->
<script>
(function(){
  /* Load wellknown.js */
  if(!window.wellknown){
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';
    document.head.appendChild(s);
  }
  /* Load proj4.js */
  if(!window.proj4){
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/proj4@2.9.1/dist/proj4.js';
    document.head.appendChild(s);
  }
  /* Load leaflet.draw (CSS + JS) once */
  if(!(window.L && window.L.Draw)){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
    document.head.appendChild(css);
    const js=document.createElement('script');
    js.src='https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
    document.head.appendChild(js);
  }
})();
</script>

<!-- Hidden EWKT input -->
<input type="hidden" id="${idBase}-wkt"  name="${name}" value="${safeVal}">

<!-- Raw WKT helper -->
<div class="mb-2">
  <button type="button" class="btn btn-sm btn-outline-secondary"
          data-bs-toggle="collapse" data-bs-target="#${idBase}-raw">
    Toggle raw WKT editor
  </button>
</div>
<div id="${idBase}-raw" class="collapse mb-2">
  <textarea id="${idBase}-rawtxt" class="form-control" rows="3">${safeVal}</textarea>
</div>

<!-- Map goes here -->
<div id="${idBase}-map" style="height:400px"></div>

<script>
(function(){
  const TARGET_SRID = ${fieldSRID};
  const MAP_ID      = ${JSON.stringify(idBase + '-map')};
  const INPUT_ID    = ${JSON.stringify(idBase + '-wkt')};
  const RAWTXT_ID   = ${JSON.stringify(idBase + '-rawtxt')};

  /* Wait until all libs + Leaflet are ready */
  const ready = () => !!(window.L && window.wellknown && window.proj4 && window.L.Draw);
  const wait  = (cb) => ready() ? cb() : setTimeout(()=>wait(cb), 50);
  wait(init);

  /* Attempt to fetch a proj4 definition from epsg.io when unknown */
  function ensureProjDef(epsg, cb){
    if(!window.proj4) return cb(false);
    if(window.proj4.defs('EPSG:'+epsg)) return cb(true);

    /* Hard‑code Web Mercator because it’s common & tiny */
    if(epsg === 3857){
      proj4.defs('EPSG:3857',
        '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +'
        +'datum=WGS84 +units=m +no_defs');
      return cb(true);
    }

    fetch('https://epsg.io/'+epsg+'.proj4')
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(txt => { proj4.defs('EPSG:'+epsg, txt.trim()); cb(true); })
      .catch(()=>cb(false));
  }

  /* Recursively transform coordinate arrays */
  function xformCoords(cs, fwd){ // fwd is proj4 function
    if(typeof cs[0] === 'number'){
      const [x,y] = fwd.forward([cs[0], cs[1]]);
      cs[0]=x; cs[1]=y;
      if(cs.length>2) cs.splice(2); /* drop Z/M when projecting */
    } else {
      cs.forEach(c=>xformCoords(c, fwd));
    }
  }

  function init(){
    const map=L.map(MAP_ID).setView([0,0],2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    const fg=new L.FeatureGroup().addTo(map);

    const wktInput=document.getElementById(INPUT_ID);
    const rawTxt  =document.getElementById(RAWTXT_ID);

    /* DB→UI transform if SRID mismatch */
    const initial=wktInput.value;
    if(initial){
      try{
        let geo=wellknown.parse(initial.replace(/^SRID=\\d+;/i, ''));
        const hasMismatch = TARGET_SRID !== 4326;
        const load = hasMismatch ? ensureProjDef : (s,cb)=>cb(true);
        load(TARGET_SRID, (ok)=>{
          if(hasMismatch && ok){
            const trans=proj4('EPSG:'+TARGET_SRID, 'EPSG:4326');
            xformCoords(geo.coordinates || geo.geometries, trans);
          }
          const lyr=L.geoJSON(geo);
          lyr.eachLayer(l=>fg.addLayer(l));
          if(fg.getLayers().length) map.fitBounds(fg.getBounds(),{maxZoom:16});
        });
      }catch(e){/* ignore */}
    }

    /* Draw tools */
    map.addControl(new L.Control.Draw({
      edit:{featureGroup:fg, remove:true},
      draw:{polygon:true, polyline:true, marker:true,
            rectangle:true, circle:false, circlemarker:false},
    }));

    /* Serialize & transform UI→DB on change */
    function sync(){
      const fc=fg.toGeoJSON();
      if(!fc.features.length){ wktInput.value=''; rawTxt.value=''; return; }

      /* Build Multi* / Collection as before */
      const types=[...new Set(fc.features.map(f=>f.geometry.type))];
      let geom;
      if(types.length===1){
        switch(types[0]){
          case 'Point':
            geom = fc.features.length===1 ? fc.features[0].geometry
                  : {type:'MultiPoint',
                     coordinates:fc.features.map(f=>f.geometry.coordinates)};
            break;
          case 'LineString':
            geom = fc.features.length===1 ? fc.features[0].geometry
                  : {type:'MultiLineString',
                     coordinates:fc.features.map(f=>f.geometry.coordinates)};
            break;
          case 'Polygon':
            geom = fc.features.length===1 ? fc.features[0].geometry
                  : {type:'MultiPolygon',
                     coordinates:fc.features.map(f=>f.geometry.coordinates)};
            break;
          default:
            geom={type:'GeometryCollection',
                  geometries:fc.features.map(f=>f.geometry)};
        }
      }else{
        geom={type:'GeometryCollection',
              geometries:fc.features.map(f=>f.geometry)};
      }

      const save = () => {
        let gSave = JSON.parse(JSON.stringify(geom)); // deep copy
        if(TARGET_SRID!==4326){
          const ok = ensureProjDef(TARGET_SRID, (s)=>{
            if(s){
              const trans=proj4('EPSG:4326', 'EPSG:'+TARGET_SRID);
              xformCoords(gSave.coordinates||gSave.geometries, trans);
            }
            const wkt=wellknown.stringify(gSave);
            const ewkt = TARGET_SRID!==4326 ? 'SRID='+TARGET_SRID+';'+wkt : wkt;
            wktInput.value=ewkt;
            rawTxt.value  =ewkt;
          });
        }else{
          const wkt=wellknown.stringify(gSave);
          wktInput.value=wkt;
          rawTxt.value  =wkt;
        }
      };
      /* Run immediately (ensureProjDef async takes care of proj4) */
      save();
    }

    map.on(L.Draw.Event.CREATED, e => { fg.addLayer(e.layer); sync(); });
    map.on(L.Draw.Event.EDITED,  sync);
    map.on(L.Draw.Event.DELETED, sync);

    /* Raw WKT ➞ hidden input (no transform – user supplies EWKT) */
    rawTxt.addEventListener('input', () => { wktInput.value=rawTxt.value; });
  }
})();
</script>`;
    },
  };
}

module.exports = { leafletEditView };