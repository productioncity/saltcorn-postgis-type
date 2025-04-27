/**
 * show-view.js
 * -----------------------------------------------------------------------------
 * Read-only Leaflet viewer with per-instance configuration options matching
 * those in the composite map and edit field-views – allowing developers to set
 * a custom tile provider, gesture-handling and geolocation controls directly
 * from the view-builder UI.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * v6.0 – 27-Apr-2025
 *   • Added `configFields` and runtime merging of field attributes with
 *     per-view configuration (view settings win).
 *
 * Licence: CC0-1.0
 */

'use strict';

const {
  DEFAULT_CENTER,
  LEAFLET,
  LEAFLET_PROVIDERS,
  LEAFLET_GESTURE,
  LEAFLET_LOCATE,
} = require('../constants');

const { wktToGeoJSON } = require('../utils/geometry');
const dbg = require('../utils/debug');

/* ───────────────────────── Provider list (short) ─────────────────── */
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

/* ────────────────────────── helpers ────────────────────────── */

/**
 * Identify a string that *looks* like geometry.
 *
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeGeom(s) {
  return (
    /^(SRID=\d+;)?[A-Z]/.test(s) || // WKT / EWKT
    /^[0-9A-Fa-f]{16,}$/.test(s)   // hex-WKB
  );
}

/**
 * Extract the geometry string from ANY Saltcorn runtime signature.
 *
 * @param {unknown[]} args
 * @returns {string}
 */
function resolveValue(args) {
  for (const a of args) {
    if (typeof a === 'string' && looksLikeGeom(a)) return a;
    if (a && typeof a === 'object' && typeof a.value === 'string' &&
        looksLikeGeom(a.value)) return a.value;
  }
  for (const a of args) {
    if (a && typeof a === 'object') {
      for (const v of Object.values(a)) {
        if (typeof v === 'string' && looksLikeGeom(v)) return v;
      }
    }
  }
  return '';
}

/**
 * Retrieve the *field-level* attribute object if any.
 *
 * @param {unknown[]} args
 * @returns {Record<string, unknown>}
 */
function resolveAttrs(args) {
  for (const a of args) {
    if (a && typeof a === 'object' && 'attributes' in a &&
        typeof a.attributes === 'object') {
      // @ts-ignore runtime
      return a.attributes;
    }
  }
  return {};
}

/**
 * Extract per-instance view configuration (view-builder settings).
 *
 * @param {unknown[]} args
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
 * JSON → safe inline JS literal (single-escape <).
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  const safe = v === undefined ? null : v;
  return JSON.stringify(safe).replace(/</g, '\\u003c');
}

/* ─────────────────────────── Config UI ──────────────────────────── */

/**
 * Shared Leaflet config fields (mirrors composite_map).
 *
 * @type {import('@saltcorn/types').TypeAttribute[]}
 */
const CONFIG_FIELDS = [
  {
    name: 'map_height',
    label: 'Map height (px)',
    type: 'Integer',
    default: 250,
    attributes: { min: 100 },
  },
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
  {
    name: 'gesture_handling_enabled',
    label: 'Enable touch gesture handling',
    type: 'Bool',
    default: false,
  },
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

/* ────────────────────────── Field-view ───────────────────────── */

function showView() {
  return {
    name:   'show',
    isEdit: false,
    description:
      'Read-only Leaflet map with per-instance provider, gesture and locate ' +
      'configuration.',
    configFields: CONFIG_FIELDS,

    run(...args) {
      dbg.debug('showView.run() invoked');

      /* -------- 1. Geometry & attribute extraction ---------------- */
      const wkt        = resolveValue(args);
      const fieldAttrs = resolveAttrs(args);
      const cfg        = { ...fieldAttrs, ...resolveConfig(args) };

      const gj = wkt ? wktToGeoJSON(wkt) : undefined;

      /* Leaflet add-on flags (defaults OFF) ----------------------- */
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

      /* -------- 2. HTML / JS ------------------------------------- */
      const mapId = `show_${Math.random().toString(36).slice(2)}`;
      const { lat, lng, zoom } = DEFAULT_CENTER;
      const mapHeight = Number(cfg.map_height) || 250;

      return `
<div id="${mapId}" style="height:${mapHeight}px;" class="border"></div>
<script>
(function(){
  const CFG={
    mapId:${js(mapId)}, geo:${js(gj)},
    providerEnabled:${js(providerEnabled)}, providerName:${js(providerName)},
    providerOpts:${js(providerOpts)},
    gestureEnabled:${js(gestureEnabled)},
    locateEnabled:${js(locateEnabled)}, locateOpts:${js(locateOpts)},
    center:{lat:${lat},lng:${lng},zoom:${zoom}},
    assets:{
      leaflet:{css:${js(LEAFLET.css)}, js:${js(LEAFLET.js)}},
      provider:${js(LEAFLET_PROVIDERS.js)},
      gesture:${js(LEAFLET_GESTURE.js)},
      locate:{css:${js(LEAFLET_LOCATE.css)}, js:${js(LEAFLET_LOCATE.js)}},
    }
  };

  function hasCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function hasJs(s){ return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(hasCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(hasJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  (async function(){
    await loadCss(CFG.assets.leaflet.css);
    await loadJs(CFG.assets.leaflet.js);

    if(CFG.providerEnabled) await loadJs(CFG.assets.provider);
    if(CFG.gestureEnabled)  await loadJs(CFG.assets.gesture);
    if(CFG.locateEnabled){ await loadCss(CFG.assets.locate.css); await loadJs(CFG.assets.locate.js); }

    initMap();
  })();

  function initMap(){
    if(!window.L) return;
    const mapOpts=CFG.gestureEnabled?{gestureHandling:true}:{};
    const map=L.map(CFG.mapId,mapOpts)
               .setView([CFG.center.lat,CFG.center.lng],CFG.center.zoom);

    let base;
    if(CFG.providerEnabled && L.tileLayer.provider && CFG.providerName){
      try{ base=L.tileLayer.provider(CFG.providerName,CFG.providerOpts).addTo(map); }
      catch(e){ console.warn('Provider error',e); }
    }
    if(!base){
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'&copy; OpenStreetMap contributors'
      }).addTo(map);
    }

    if(CFG.geo){
      const lyr=L.geoJSON(CFG.geo).addTo(map);
      map.fitBounds(lyr.getBounds(),{maxZoom:14});
    }

    if(CFG.locateEnabled && L.control && L.control.locate){
      try{ L.control.locate(CFG.locateOpts).addTo(map); }
      catch(e){ console.error('Locate error',e); }
    }
  }
})();
</script>`;
    },
  };
}

module.exports = { showView };