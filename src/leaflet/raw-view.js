/**
 * raw-view.js
 * ----------------------------------------------------------------------------
 * Field‑view "raw" – SINGLE key usable in BOTH edit & show contexts.
 *
 * isEdit = false so it shows up in Saltcorn’s *show* list.  The editor can
 * still invoke it in an edit context (we detect the call signature).
 *
 * Author: Troy Kelly <troy@team.production.city>
 * Updated: 2025‑04‑19 – add explicit isEdit flag, robust guards.
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

const WELLKNOWN_JS =
  'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/**
 * Build the preview‑map toggle block.
 *
 * @param {string} id   DOM id base.
 * @param {string} wkt  Raw value (may be '').
 * @returns {string}
 */
function previewBlock(id, wkt) {
  const gj = wkt ? wktToGeoJSON(wkt) : null;
  const { lat, lng, zoom } = DEFAULT_CENTER;

  return `
<div id="${id}" style="height:200px;display:none;margin-top:.5rem"
     class="border"></div>
<script>
(function(){
  const DIV_ID=${JSON.stringify(id)};
  const BTN_ID=DIV_ID+'_btn';
  const gj=${JSON.stringify(gj)};
  function css(h){return !!document.querySelector('link[href="'+h+'"]');}
  function js(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function addCss(h){return new Promise(r=>{if(css(h))return r();const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;document.head.appendChild(l);});}
  function addJs(s){return new Promise(r=>{if(js(s))return r();const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};document.head.appendChild(sc);});}
  async function deps(cb){
    await addCss(${JSON.stringify(LEAFLET.css)});
    await addJs(${JSON.stringify(LEAFLET.js)});
    await addJs(${JSON.stringify(WELLKNOWN_JS)});
    cb();
  }
  document.addEventListener('DOMContentLoaded',function(){
    const btn=document.getElementById(BTN_ID);
    const div=document.getElementById(DIV_ID);
    if(!btn) return;
    btn.addEventListener('click',function(){
      if(div.style.display==='none'){
        div.style.display='block';
        deps(function(){
          const map=L.map(div).setView([${lat},${lng}],${zoom});
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
            attribution:'&copy; OpenStreetMap'
          }).addTo(map);
          if(gj){
            const lyr=L.geoJSON(gj).addTo(map);
            map.fitBounds(lyr.getBounds(),{maxZoom:14});
          }
        });
      }else div.style.display='none';
    });
  });
})();
</script>`;
}

/**
 * Export context‑sensitive raw view.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function rawView() {
  return {
    name: 'raw',
    isEdit: false, // listed under *show*; works in edit context via detection
    run(...args) {
      const editCtx =
        args.length >= 2 &&
        args[0] &&
        typeof args[0] === 'object' &&
        'type' in args[0];

      if (editCtx) {
        /* ——— EDIT ——— */
        const [field, current = '', , classes = 'form-control'] = args;
        const taId = `ta_${field.name}_${Math.random().toString(36).slice(2)}`;
        const mapId = `map_${taId}`;
        const safe = current.replace(/&/g,'&amp;').replace(/</g,'&lt;');
        return `
<textarea id="${taId}" name="${field.name}"
          class="${classes}" style="min-height:6rem;">${safe}</textarea>
<button type="button" id="${mapId}_btn"
        class="btn btn-outline-secondary btn-sm mt-1">Preview map</button>
${previewBlock(mapId, current)}`;
      }

      /* ——— SHOW ——— */
      const [{ value = '' }] = args;
      const preId = `pre_${Math.random().toString(36).slice(2)}`;
      const mapId = `map_${preId}`;
      const safeVal = value.replace(/&/g,'&amp;').replace(/</g,'&lt;');
      return `
<pre id="${preId}" style="white-space:pre-wrap;">${safeVal}</pre>
<button type="button" id="${mapId}_btn"
        class="btn btn-outline-secondary btn-sm mt-1">Show on map</button>
${previewBlock(mapId, value)}`;
    },
  };
}

module.exports = { rawView };