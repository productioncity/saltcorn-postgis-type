/**
 * map-edit-view.js
 * -----------------------------------------------------------------------------
 * Interactive Leaflet editor that outputs canonical EWKT **and** now exposes
 * the same rich configuration surface available in the “composite_map” view –
 * including tile-provider selection, gesture-handling and “locate me”
 * controls.  All options are set per-field-view instance inside Saltcorn’s
 * view-builder UI.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * v7.0 – 27-Apr-2025
 *   • Added `configFields` so developers can tweak rendering behaviour without
 *     touching the underlying column attributes.
 *   • Runtime now merges:  field attributes  ←  view-config  (← wins)
 *   • Custom map height supported.
 *
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

const dbg = require('../utils/debug');

const DRAW_JS  = 'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS = 'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const WELLKNOWN_JS = 'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/* ───────────────────────────── Provider list ────────────────────────
 * A trimmed list from leaflet-providers for UI convenience.            */
const PROVIDERS = Object.freeze([
  'OpenStreetMap.Mapnik',
  'CartoDB.Positron',
  'CartoDB.DarkMatter',
  'Stamen.Toner',
  'Esri.WorldStreetMap',
  'Esri.WorldImagery',
  'HikeBike.HikeBike',
  'OpenTopoMap',
]);

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
 * Extract field-view configuration object (per-instance settings).
 *
 * @param {IArguments} args
 * @returns {Record<string, unknown>}
 */
function resolveConfig(args) {
  for (const a of args) {
    if (
      a &&
      typeof a === 'object' &&
      ('tile_provider_enabled' in a ||
        'gesture_handling_enabled' in a ||
        'locate_enabled' in a ||
        'map_height' in a)
    ) {
      return a;
    }
  }
  return {};
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

/* ───────────────────────────── Config UI ──────────────────────────── */

/**
 * Shared Leaflet config fields (mirrors composite_map).
 *
 * @type {import('@saltcorn/types').TypeAttribute[]}
 */
const CONFIG_FIELDS = [
  /* --- Rendering --- */
  {
    name: 'map_height',
    label: 'Map height (px)',
    type: 'Integer',
    default: 300,
    attributes: { min: 100 },
  },

  /* --- Providers --- */
  {
    name: 'tile_provider_enabled',
    label: 'Enable Leaflet-providers basemap',
    type: 'Bool',
    default: false,
  },
  {
    name: 'tile_provider_name',
    label: 'Provider key',
    type: 'String',
    showIf: { tile_provider_enabled: true },
    attributes: { options: PROVIDERS },
  },
  {
    name: 'tile_provider_options',
    label: 'Provider options (JSON)',
    sublabel: 'Raw JSON passed to the provider – e.g. {"apikey":"…"}',
    type: 'String',
    fieldview: 'textarea',
    attributes: { rows: 3 },
    showIf: { tile_provider_enabled: true },
  },

  /* --- Gesture handling --- */
  {
    name: 'gesture_handling_enabled',
    label: 'Enable touch gesture handling',
    type: 'Bool',
    default: false,
  },

  /* --- Locate control --- */
  {
    name: 'locate_enabled',
    label: 'Enable “Locate me” control',
    type: 'Bool',
    default: false,
  },
  {
    name: 'locate_position',
    label: 'Locate control position',
    type: 'String',
    default: 'topleft',
    showIf: { locate_enabled: true },
    attributes: {
      options: ['topleft', 'topright', 'bottomleft', 'bottomright'],
    },
  },
  {
    name: 'locate_follow',
    label: 'Auto-follow user position',
    type: 'Bool',
    default: true,
    showIf: { locate_enabled: true },
  },
  {
    name: 'locate_keep_zoom',
    label: 'Keep current zoom level',
    type: 'Bool',
    default: false,
    showIf: { locate_enabled: true },
  },
  {
    name: 'locate_fly_to',
    label: 'Smooth fly-to animation',
    type: 'Bool',
    default: false,
    showIf: { locate_enabled: true },
  },
  {
    name: 'locate_show_compass',
    label: 'Show compass bearing',
    type: 'Bool',
    default: true,
    showIf: { locate_enabled: true },
  },
];

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
      'Interactive Leaflet editor with per-instance provider, gesture and ' +
      'locate configuration.',
    configFields: CONFIG_FIELDS,

    /* eslint-disable max-lines-per-function */
    run(/* dynamic – preserves Saltcorn’s variable signature */) {
      dbg.debug('mapEditView.run() invoked');

      /* -------- 1. Parameters & derived IDs ---------------------- */
      const { name: fieldName, value: current, attrs: fieldAttrs = {}, cls = '' } =
        unpackArgs(arguments);

      const viewCfg = resolveConfig(arguments);
      const cfg = { ...fieldAttrs, ...viewCfg }; // view config wins

      const canonical   = toWkt(current) || String(current ?? '');
      const expectType  = String((cfg.subtype ?? fallbackType)).toLowerCase();
      const sridVal     = Number.isFinite(Number(cfg.srid))
                            ? Number(cfg.srid)
                            : 4326;

      const mapId   = `map_${Math.random().toString(36).slice(2)}`;
      const inputId = `inp_${mapId}`;

      /* Z-dimension helpers -------------------------------------- */
      const dimAttr = String(cfg.dim ?? '').toUpperCase();
      const wantZ   = dimAttr.includes('Z') || /Z[^A-Za-z]*\(/i.test(canonical);
      const initialZ = wantZ ? extractFirstZ(canonical) : 0;
      const zId      = wantZ ? `z_${mapId}` : null;

      /* --- Leaflet add-ons -------------------------------------- */
      const providerEnabled = !!cfg.tile_provider_enabled;
      const providerName    = cfg.tile_provider_name || '';
      let   providerOpts    = {};
      if (providerEnabled && cfg.tile_provider_options) {
        try { providerOpts = JSON.parse(cfg.tile_provider_options); }
        // eslint-disable-next-line no-empty
        catch {}
      }

      const gestureEnabled = !!cfg.gesture_handling_enabled;

      const locateEnabled     = !!cfg.locate_enabled;
      const locateFollow      = cfg.locate_follow !== undefined
                                  ? !!cfg.locate_follow : true;
      const locateKeepZoom    = !!cfg.locate_keep_zoom;
      const locateFlyTo       = !!cfg.locate_fly_to;
      const locateShowCompass = cfg.locate_show_compass !== undefined
                                  ? !!cfg.locate_show_compass : true;
      const locatePosition    = cfg.locate_position || 'topleft';

      const locateOpts = {
        position: locatePosition,
        setView: locateFollow ? 'untilPanOrZoom' : 'once',
        keepCurrentZoomLevel: locateKeepZoom,
        showCompass: locateShowCompass,
        flyTo: locateFlyTo,
      };

      /* -------- 2. Server-side GeoJSON (for initial display) ----- */
      const initGeoJSON = wktToGeoJSON(canonical);
      const { lat, lng, zoom } = DEFAULT_CENTER;

      const mapHeight = Number(cfg.map_height) || 300;

      /* -------- 3. HTML / JS payload ---------------------------- */
      return `
<div class="${cls}">
  <div id="${mapId}" class="border rounded" style="height:${mapHeight}px;"></div>
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
    center:{lat:${lat}, lng:${lng}, zoom:${zoom}},
    assets:{
      leaflet:{css:${js(LEAFLET.css)}, js:${js(LEAFLET.js)}},
      draw:{css:${js(DRAW_CSS)}, js:${js(DRAW_JS)}},
      wk:${js(WELLKNOWN_JS)},
      provider:${js(LEAFLET_PROVIDERS.js)},
      gesture:${js(LEAFLET_GESTURE.js)},
      locate:{css:${js(LEAFLET_LOCATE.css)}, js:${js(LEAFLET_LOCATE.js)}},
    }
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
    await loadCss(CFG.assets.leaflet.css); await loadCss(CFG.assets.draw.css);
    await loadJs(CFG.assets.leaflet.js);   await loadJs(CFG.assets.draw.js);
    await loadJs(CFG.assets.wk);

    if(CFG.providerEnabled) await loadJs(CFG.assets.provider);
    if(CFG.gestureEnabled)  await loadJs(CFG.assets.gesture);
    if(CFG.locateEnabled){ await loadCss(CFG.assets.locate.css); await loadJs(CFG.assets.locate.js); }

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