/**
 * show-view.js
 * ----------------------------------------------------------------------------
 * Read-only Leaflet viewer with support for the optional add-ons
 * (Leaflet-providers, gesture-handling, locate-control) configured per column.
 *
 * Author:  Troy Kelly <troy@team.production.city>
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

/* ────────────────────────── helpers ────────────────────────── */

/**
 * Identify a string that *looks* like geometry.
 *
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeGeom(s) {
  return (
    /^(SRID=\d+;)?[A-Z]/.test(s) ||        // WKT / EWKT
    /^[0-9A-Fa-f]{16,}$/.test(s)           // hex-WKB
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
 * JSON → safe inline JS literal (single-escape <).
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  const safe = v === undefined ? null : v;
  return JSON.stringify(safe).replace(/</g, '\\u003c');
}

/* ────────────────────────── Field-view ───────────────────────── */

function showView() {
  return {
    name:   'show',
    isEdit: false,
    run(...args) {
      /* -------- 1. Geometry & attribute extraction ---------------- */
      const wkt   = resolveValue(args);
      const attrs = resolveAttrs(args);

      const gj = wkt ? wktToGeoJSON(wkt) : undefined;

      /* Leaflet add-on flags (defaults OFF) ----------------------- */
      const providerEnabled = !!attrs.tile_provider_enabled;
      const providerName    = attrs.tile_provider_name || '';
      let   providerOpts    = {};
      if (providerEnabled && attrs.tile_provider_options) {
        try { providerOpts = JSON.parse(attrs.tile_provider_options); }
        // eslint-disable-next-line no-empty
        catch {}
      }
      const gestureEnabled = !!attrs.gesture_handling_enabled;

      const locateEnabled     = !!attrs.locate_enabled;
      const locateFollow      = attrs.locate_follow !== undefined
                                  ? !!attrs.locate_follow : true;
      const locateKeepZoom    = !!attrs.locate_keep_zoom;
      const locateFlyTo       = !!attrs.locate_fly_to;
      const locateShowCompass = attrs.locate_show_compass !== undefined
                                  ? !!attrs.locate_show_compass : true;
      const locatePosition    = attrs.locate_position || 'topleft';

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

      return `
<div id="${mapId}" style="height:250px;" class="border"></div>
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