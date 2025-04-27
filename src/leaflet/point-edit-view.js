/**
 * point-edit-view.js
 * -----------------------------------------------------------------------------
 * Draggable marker editor for **Point** fields with full map configurability –
 * developers can now pick a Leaflet-providers basemap, enable gesture-handling
 * and add a geolocation button directly from the view-builder UI.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * v5.0 – 27-Apr-2025
 *   • Added `configFields` plus runtime override logic (view config wins over
 *     column attributes).
 *
 * Licence: CC0-1.0
 */

'use strict';

const { wktToLonLat } = require('../utils/geometry');
const {
  DEFAULT_CENTER,
  LEAFLET,
  LEAFLET_PROVIDERS,
  LEAFLET_GESTURE,
  LEAFLET_LOCATE,
  PROVIDERS
} = require('../constants');

const dbg = require('../utils/debug');

/* ───────────────────────── Config UI ───────────────────────── */

/**
 * Shared config fields (mirrors composite_map).
 *
 * @type {import('@saltcorn/types').TypeAttribute[]}
 */
const CONFIG_FIELDS = [
  {
    name: 'map_height',
    label: 'Map height (px)',
    type: 'Integer',
    default: 220,
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

/* ───────────────────────── Helper ────────────────────────── */

/**
 * Retrieve per-instance view configuration object.
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

/* ───────────────────────── Field-view ───────────────────────── */

function leafletPointEditView(fieldName) {
  return {
    isEdit: true,
    description:
      'Leaflet draggable marker editor with configurable provider, gesture ' +
      'and locate controls.',
    configFields: CONFIG_FIELDS,

    run(nm, value, attrs = {}, cls) {
      dbg.debug('leafletPointEditView.run() invoked');

      const viewCfg = resolveConfig(arguments);
      const cfg = { ...attrs, ...viewCfg };

      /* ------------------------------------------------------------------ */
      /* 1. DOM IDs & initial position                                      */
      /* ------------------------------------------------------------------ */
      const id = `${fieldName}_${Math.random().toString(36).slice(2)}`;
      const input = `inp_${id}`;

      const ll = wktToLonLat(value) || [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat];

      /* ------------------------------------------------------------------ */
      /* 2. Leaflet add-ons (from combined cfg)                             */
      /* ------------------------------------------------------------------ */
      const providerEnabled = !!cfg.tile_provider_enabled;
      const providerName = cfg.tile_provider_name || '';
      let providerOpts = {};
      if (providerEnabled && cfg.tile_provider_options) {
        try { providerOpts = JSON.parse(cfg.tile_provider_options); }
        // eslint-disable-next-line no-empty
        catch { }
      }
      const gestureEnabled = !!cfg.gesture_handling_enabled;

      const locateEnabled = !!cfg.locate_enabled;
      const locateFollow = cfg.locate_follow !== undefined
        ? !!cfg.locate_follow : true;
      const locateKeepZoom = !!cfg.locate_keep_zoom;
      const locateFlyTo = !!cfg.locate_fly_to;
      const locateShowCompass = cfg.locate_show_compass !== undefined
        ? !!cfg.locate_show_compass : true;
      const locatePosition = cfg.locate_position || 'topleft';

      const locateOpts = {
        position: locatePosition,
        setView: locateFollow ? 'untilPanOrZoom' : 'once',
        keepCurrentZoomLevel: locateKeepZoom,
        showCompass: locateShowCompass,
        flyTo: locateFlyTo,
      };

      const mapHeight = Number(cfg.map_height) || 220;

      /* ------------------------------------------------------------------ */
      /* 3. HTML + JS payload                                               */
      /* ------------------------------------------------------------------ */
      return `
<div class="${cls || ''}">
  <div id="${id}" class="border rounded" style="height:${mapHeight}px;"></div>
  <input type="hidden" id="${input}" name="${nm}" value="${value || ''}">
</div>

<script>
(function(){
  const CFG={
    mapId:${JSON.stringify(id)}, inpId:${JSON.stringify(input)},
    start:[${ll[1]},${ll[0]}],
    providerEnabled:${JSON.stringify(providerEnabled)},
    providerName:${JSON.stringify(providerName)},
    providerOpts:${JSON.stringify(providerOpts)},
    gestureEnabled:${JSON.stringify(gestureEnabled)},
    locateEnabled:${JSON.stringify(locateEnabled)},
    locateOpts:${JSON.stringify(locateOpts)},
    assets:{
      leaflet:{css:${JSON.stringify(LEAFLET.css)}, js:${JSON.stringify(LEAFLET.js)}},
      provider:${JSON.stringify(LEAFLET_PROVIDERS.js)},
      gesture:${JSON.stringify(LEAFLET_GESTURE.js)},
      locate:{css:${JSON.stringify(LEAFLET_LOCATE.css)}, js:${JSON.stringify(LEAFLET_LOCATE.js)}},
    }
  };

  /* ---------- Loader helpers ---------- */
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

    init();
  })();

  /* ---------- Init map ---------- */
  function init(){
    const mapEl=document.getElementById(CFG.mapId);
    const hidden=document.getElementById(CFG.inpId);
    if(!mapEl||!hidden||!window.L) return;

    const mapOpts = CFG.gestureEnabled ? { gestureHandling:true } : {};
    const map=L.map(mapEl,mapOpts).setView(CFG.start,13);

    /* base layer */
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

    const mk=L.marker(CFG.start,{draggable:true}).addTo(map);
    function sync(pt){ hidden.value='POINT('+pt.lng+' '+pt.lat+')'; }
    mk.on('dragend',e=>sync(e.target.getLatLng()));
    map.on('click',e=>{ mk.setLatLng(e.latlng); sync(e.latlng); });

    /* locate */
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

module.exports = { leafletPointEditView };