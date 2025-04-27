/**
 * point-edit-view.js
 * -----------------------------------------------------------------------------
 * Draggable marker editor for **Point** fields.  Now uses the shared dynamic
 * loader so it can optionally pull-in Leaflet-providers, gesture-handling and
 * locate-control *per column* according to the field attributes.
 *
 * Author:  Troy Kelly <troy@team.production.city>
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
} = require('../constants');

/**
 * Build the field-view object.
 *
 * @param {string} fieldName
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletPointEditView(fieldName) {
  return {
    isEdit: true,
    description:
      'Leaflet draggable marker editor with optional provider, gesture and locate add-ons.',
    run(nm, value, attrs = {}, cls) {
      /* ------------------------------------------------------------------ */
      /* 1. DOM IDs & initial position                                      */
      /* ------------------------------------------------------------------ */
      const id    = `${fieldName}_${Math.random().toString(36).slice(2)}`;
      const input = `inp_${id}`;

      const ll    = wktToLonLat(value) || [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat];

      /* ------------------------------------------------------------------ */
      /* 2. Leaflet add-on flags (from field attributes)                    */
      /* ------------------------------------------------------------------ */
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

      /* ------------------------------------------------------------------ */
      /* 3. HTML + JS payload                                               */
      /* ------------------------------------------------------------------ */
      return `
<div class="${cls || ''}">
  <div id="${id}" class="border rounded" style="height:220px;"></div>
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