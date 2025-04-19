/**
 * raw-view.js
 * ----------------------------------------------------------------------------
 * SINGLE key `"raw"` – usable **both** for *edit* and *show* contexts.
 *
 * Shows a simple `<textarea>` (edit) or `<pre>` (show) plus a toggle that
 * reveals a read‑only Leaflet preview map.  Robustly detects invocation
 * style, so it never crashes Builder previews or normal page rendering.
 *
 * Author:   Troy Kelly  <troy@team.production.city>
 * Updated:  2025‑04‑19 – defensive arg inspection, stricter null guards.
 * Licence:  CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

const WELLKNOWN_JS =
  'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/**
 * Helper – builds the Leaflet preview block + JS.
 *
 * @param {string} id    DOM id of container.
 * @param {string=} wkt  Raw value.
 * @returns {string}
 */
function buildPreviewMap(id, wkt) {
  const geoJSON = wkt ? wktToGeoJSON(wkt) : null;
  const { lat, lng, zoom } = DEFAULT_CENTER;

  return `
<div id="${id}" style="height:200px; display:none; margin-top:0.5rem;"
     class="border"></div>
<script>
(function(){
  const mapId=${JSON.stringify(id)};
  const gj=${JSON.stringify(geoJSON)};
  const btnId=mapId+'_btn';

  function injectCss(h){
    return new Promise((res)=>{
      if(document.querySelector('link[href="'+h+'"]')) return res();
      const l=document.createElement('link'); l.rel='stylesheet'; l.href=h;
      l.onload=res; document.head.appendChild(l);
    });
  }
  function injectJs(s){
    return new Promise((res)=>{
      if(document.querySelector('script[src="'+s+'"]')||window._ljs&&window._ljs[s])
        return res();
      const js=document.createElement('script'); js.src=s; js.async=true;
      js.onload=function(){ window._ljs=window._ljs||{}; window._ljs[s]=true; res(); };
      document.head.appendChild(js);
    });
  }
  async function loadDeps(cb){
    await injectCss(${JSON.stringify(LEAFLET.css)});
    await injectJs(${JSON.stringify(LEAFLET.js)});
    await injectJs(${JSON.stringify(WELLKNOWN_JS)});
    cb();
  }

  document.addEventListener('DOMContentLoaded', function(){
    const btn=document.getElementById(btnId);
    const mapDiv=document.getElementById(mapId);
    if(!btn||!mapDiv) return;
    btn.addEventListener('click', function(){
      if(mapDiv.style.display==='none'){
        mapDiv.style.display='block';
        loadDeps(function(){
          const map=L.map(mapDiv).setView([${lat},${lng}],${zoom});
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
            attribution:'&copy; OpenStreetMap'
          }).addTo(map);
          if(gj && Object.keys(gj).length){
            const lyr=L.geoJSON(gj).addTo(map);
            map.fitBounds(lyr.getBounds(),{maxZoom:14});
          }
        });
      }else{ mapDiv.style.display='none'; }
    });
  });
})();
</script>`;
}

/**
 * Context‑sensitive **raw** field‑view.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function rawView() {
  return {
    name: 'raw',
    // isEdit deliberately *undefined* so Saltcorn treats it as a show view
    // when compiling lists (isEdit falsy) but we can still render edit mode
    // when invoked with the edit signature.
    run(...args) {
      const editCtx =
        args.length >= 2 &&
        args[0] &&
        typeof args[0] === 'object' &&
        'name' in args[0] &&
        'type' in args[0];

      if (editCtx) {
        /* ------------------------  EDIT CONTEXT  ------------------------ */
        const [field, current, , classes = 'form-control'] = args;
        const taId = `ta_${field.name}_${Math.random().toString(36).slice(2)}`;
        const mapId = `map_${taId}`;
        const safe =
          typeof current === 'string'
            ? current.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            : '';
        return `
<textarea id="${taId}" name="${field.name}" class="${classes}"
          style="min-height:6rem;">${safe}</textarea>
<button type="button" id="${mapId}_btn"
        class="btn btn-outline-secondary btn-sm mt-1">
  Preview map
</button>
${buildPreviewMap(mapId, current)}`;
      }

      /* ------------------------  SHOW CONTEXT  ------------------------- */
      const [{ value }] = args;
      const preId = `pre_${Math.random().toString(36).slice(2)}`;
      const mapId = `map_${preId}`;
      const safeVal =
        typeof value === 'string'
          ? value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          : '';
      return `
<pre id="${preId}" style="white-space:pre-wrap;">${safeVal}</pre>
<button type="button" id="${mapId}_btn"
        class="btn btn-outline-secondary btn-sm mt-1">
  Show on map
</button>
${buildPreviewMap(mapId, value)}`;
    },
  };
}

module.exports = { rawView };