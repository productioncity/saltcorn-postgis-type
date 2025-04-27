/**
 * map-edit-view.js
 * -----------------------------------------------------------------------------
 * Interactive Leaflet editor that outputs canonical EWKT **and** now supports
 * the optional Leaflet-providers, leaflet-gesture-handling and
 * leaflet-locate-control add-ons.  Loading is completely dynamic – assets are
 * fetched **only** when enabled via the field’s attributes.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* ───────────────────────────── Imports ────────────────────────────── */

const {
  DEFAULT_CENTER,
  LEAFLET,
  LEAFLET_PROVIDERS,
  LEAFLET_GESTURE,
  LEAFLET_LOCATE,
} = require('../constants');

const {
  wktToGeoJSON,
  extractFirstZ,
  toWkt,
} = require('../utils/geometry');

const DRAW_JS  = 'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS = 'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const WELLKNOWN_JS = 'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/* ────────────────────────── Helper functions ─────────────────────── */

/**
 * Normalise Saltcorn’s dual call signature into a single object.
 *
 * @param {IArguments} args
 */
function unpackArgs(args) {
  /** @type {string} */ let name = '';
  /** @type {string} */ let value = '';
  /** @type {Record<string, unknown>|undefined} */ let attrs;
  /** @type {string|undefined} */ let cls;

  if (args[0] && typeof args[0] === 'object' && 'name' in args[0]) {
    // Field-object form
    // @ts-ignore
    name  = args[0].name;
    value = args[1] ?? '';
    attrs = args[0].attributes ?? {};
    cls   = args[3];
  } else {
    // Primitive form
    name  = args[0] ?? '';
    value = args[1] ?? '';
    attrs = args[2] ?? {};
    cls   = args[3];
  }
  return { name, value: String(value ?? ''), attrs, cls };
}

/**
 * Safe JSON → JS string helper (single escape < to avoid HTML parse issues).
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  const safe = v === undefined ? null : v;
  return JSON.stringify(safe).replace(/</g, '\\u003c');
}

/* ───────────────────────────── Factory ────────────────────────────── */

/**
 * Generate the edit field-view for a specific Saltcorn type.
 *
 * @param {string} fallbackType Lower-case type name used when attrs.subtype unset.
 * @returns {import('@saltcorn/types').FieldView}
 */
function mapEditView(fallbackType = '') {
  return {
    name: 'edit',
    isEdit: true,
    description:
      'Interactive Leaflet editor that respects SRID & dimensionality and ' +
      'optionally adds providers, gesture handling and locate control.',

    /* eslint-disable max-lines-per-function */
    run(/* dynamic – preserves Saltcorn’s variable signature */) {
      /* -------- 1. Parameters & derived IDs ------------------------ */
      const { name: fieldName, value: current, attrs = {}, cls = '' } =
        unpackArgs(arguments);

      const canonical   = toWkt(current) || String(current ?? '');
      const expectType  = String((attrs.subtype ?? fallbackType)).toLowerCase();
      const sridVal     = Number.isFinite(Number(attrs.srid))
                            ? Number(attrs.srid)
                            : 4326;

      const mapId   = `map_${Math.random().toString(36).slice(2)}`;
      const inputId = `inp_${mapId}`;

      /* Z-dimension helpers ---------------------------------------- */
      const dimAttr = String(attrs.dim ?? '').toUpperCase();
      const wantZ   = dimAttr.includes('Z') || /Z[^A-Za-z]*\(/i.test(canonical);
      const initialZ = wantZ ? extractFirstZ(canonical) : 0;
      const zId      = wantZ ? `z_${mapId}` : null;

      /* Leaflet add-on flags (all default OFF) --------------------- */
      const providerEnabled   = !!attrs.tile_provider_enabled;
      const providerName      = attrs.tile_provider_name || '';
      let   providerOpts      = {};
      if (providerEnabled && attrs.tile_provider_options) {
        try { providerOpts = JSON.parse(attrs.tile_provider_options); }
        // eslint-disable-next-line no-empty
        catch {}
      }

      const gestureEnabled = !!attrs.gesture_handling_enabled;

      const locateEnabled      = !!attrs.locate_enabled;
      const locateFollow       = attrs.locate_follow !== undefined
                                   ? !!attrs.locate_follow : true;
      const locateKeepZoom     = !!attrs.locate_keep_zoom;
      const locateFlyTo        = !!attrs.locate_fly_to;
      const locateShowCompass  = attrs.locate_show_compass !== undefined
                                   ? !!attrs.locate_show_compass : true;
      const locatePosition     = attrs.locate_position || 'topleft';

      const locateOpts = {
        position: locatePosition,
        setView: locateFollow ? 'untilPanOrZoom' : 'once',
        keepCurrentZoomLevel: locateKeepZoom,
        showCompass: locateShowCompass,
        flyTo: locateFlyTo,
      };

      /* -------- 2. Server-side GeoJSON (for initial display) ------- */
      const initGeoJSON = wktToGeoJSON(canonical);
      const { lat, lng, zoom } = DEFAULT_CENTER;

      /* -------- 3. HTML / JS payload ------------------------------ */
      return `
<div class="${cls}">
  <div id="${mapId}" class="border rounded" style="height:300px;"></div>
  <input type="hidden" id="${inputId}" name="${fieldName}" value="${canonical}">
  ${
    wantZ
      ? `<div class="mt-1">
           <label for="${zId}" class="form-label mb-0">Z&nbsp;value</label>
           <input type="number" id="${zId}" class="form-control form-control-sm"
                  step="any" value="${initialZ}">
         </div>`
      : ''
  }
</div>

<script>
(function(){
  /* ---------- 0. Config → constants ---------- */
  const CFG = {
    mapId:${js(mapId)}, inputId:${js(inputId)}, zId:${js(zId)},
    wantZ:${wantZ}, expect:${js(expectType)}, srid:${sridVal},
    initGeo:${js(initGeoJSON)},
    providerEnabled:${js(providerEnabled)}, providerName:${js(providerName)},
    providerOpts:${js(providerOpts)},
    gestureEnabled:${js(gestureEnabled)},
    locateEnabled:${js(locateEnabled)}, locateOpts:${js(locateOpts)},
    assets:{
      leaflet:{css:${js(LEAFLET.css)}, js:${js(LEAFLET.js)}},
      draw:{css:${js(DRAW_CSS)}, js:${js(DRAW_JS)}},
      wk:${js(WELLKNOWN_JS)},
      provider:${js(LEAFLET_PROVIDERS.js)},
      gesture:${js(LEAFLET_GESTURE.js)},
      locate:{css:${js(LEAFLET_LOCATE.css)}, js:${js(LEAFLET_LOCATE.js)}},
    },
    center:{lat:${lat}, lng:${lng}, zoom:${zoom}}
  };

  /* ---------- 1. Dynamic loader helpers ---------- */
  function hasCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function hasJs(s){ return !!(document._loadedScripts && document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(hasCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(hasJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  /* ---------- 2. Bootstrap dependencies ---------- */
  (async function(){
    const a=CFG.assets;
    await loadCss(a.leaflet.css); await loadCss(a.draw.css);
    await loadJs(a.leaflet.js);   await loadJs(a.draw.js);
    await loadJs(a.wk);

    if(CFG.providerEnabled) await loadJs(a.provider);
    if(CFG.gestureEnabled)  await loadJs(a.gesture);
    if(CFG.locateEnabled){ await loadCss(a.locate.css); await loadJs(a.locate.js); }

    initMap();
  })();

  /* ---------- 3. Map initialisation ------------------------------ */
  function initMap(){
    const mapEl=document.getElementById(CFG.mapId);
    const hidden=document.getElementById(CFG.inputId);
    if(!mapEl||!hidden||!window.L||!window.L.Draw) return;

    const mapOpts = CFG.gestureEnabled ? { gestureHandling:true } : {};
    const map=L.map(mapEl, mapOpts)
               .setView([CFG.center.lat, CFG.center.lng], CFG.center.zoom);

    /* Base layer --------------------------------------------------- */
    let baseLayer;
    if(CFG.providerEnabled && L.tileLayer.provider && CFG.providerName){
      try{
        baseLayer=L.tileLayer.provider(CFG.providerName, CFG.providerOpts).addTo(map);
      }catch(e){ console.warn('Provider error', e); }
    }
    if(!baseLayer){
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'&copy; OpenStreetMap contributors'
      }).addTo(map);
    }

    /* FeatureGroup + existing geometry ----------------------------- */
    const fg=new L.FeatureGroup().addTo(map);
    if(CFG.initGeo){
      const lyr=L.geoJSON(CFG.initGeo).addTo(fg);
      map.fitBounds(lyr.getBounds(),{maxZoom:14});
    }

    /* Draw toolbar ------------------------------------------------- */
    map.addControl(new L.Control.Draw({
      edit:{ featureGroup: fg },
      draw:{
        polygon:true, polyline:true, rectangle:false, circle:false,
        marker:true,  circlemarker:false
      }
    }));

    /* Z helpers ---------------------------------------------------- */
    function currentZ(){
      if(!CFG.wantZ) return undefined;
      const zEl=document.getElementById(CFG.zId);
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
      if(!CFG.wantZ) return geom;
      const z=currentZ();
      const g=JSON.parse(JSON.stringify(geom));
      if(g.type==='GeometryCollection'){
        g.geometries=g.geometries.map(withZ); return g;
      }
      if('coordinates'in g) g.coordinates=addZ(g.coordinates,z);
      return g;
    }

    /* Multiparts helper ------------------------------------------- */
    function buildMulti(t){
      const coords=fg.toGeoJSON().features.map(f=>withZ(f.geometry).coordinates);
      const type={multipoint:'MultiPoint',multilinestring:'MultiLineString',multipolygon:'MultiPolygon'}[t];
      return window.wellknown.stringify({type,coordinates:coords});
    }

    /* Serialiser --------------------------------------------------- */
    function toWkt(){
      const gj=fg.toGeoJSON();
      if(!gj.features.length) return '';

      let wkt;
      if(CFG.expect==='geometrycollection'){
        wkt=(CFG.wantZ?'GEOMETRYCOLLECTION Z(':'GEOMETRYCOLLECTION(')+
          gj.features.map(f=>window.wellknown.stringify(withZ(f.geometry))).join(',')+
          ')';
      }else if(CFG.expect==='multipolygon'||CFG.expect==='multilinestring'||CFG.expect==='multipoint'){
        wkt=buildMulti(CFG.expect);
      }else if(gj.features.length===1){
        wkt=window.wellknown.stringify(withZ(gj.features[0].geometry));
      }else{
        wkt=(CFG.wantZ?'GEOMETRYCOLLECTION Z(':'GEOMETRYCOLLECTION(')+
          gj.features.map(f=>window.wellknown.stringify(withZ(f.geometry))).join(',')+
          ')';
      }
      return wkt ? ('SRID='+CFG.srid+';'+wkt) : '';
    }
    function sync(){ hidden.value=toWkt(); }

    map.on(L.Draw.Event.CREATED, e=>{ fg.addLayer(e.layer); sync(); });
    map.on(L.Draw.Event.EDITED,  sync);
    map.on(L.Draw.Event.DELETED, sync);
    if(CFG.wantZ){
      const zEl=document.getElementById(CFG.zId);
      if(zEl) zEl.addEventListener('change', sync);
    }

    /* Locate control ---------------------------------------------- */
    if(CFG.locateEnabled && L.control && L.control.locate){
      try{ L.control.locate(CFG.locateOpts).addTo(map); }
      catch(e){ console.error('Locate control error', e); }
    }
  }
})();
</script>`;
    },
    /* eslint-enable max-lines-per-function */
  };
}

module.exports = { mapEditView };