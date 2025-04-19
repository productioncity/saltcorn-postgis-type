/**
 * show-view.js
 * ----------------------------------------------------------------------------
 * Read‑only Leaflet viewer.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');
const { wktToGeoJSON } = require('../utils/geometry');

/**
 * @returns {import('@saltcorn/types').FieldView}
 */
function showView() {
  return {
    name: 'show',
    isEdit: false,
    /**
     * Saltcorn sometimes calls field‑views with a primitive value
     * (the actual string) and other times with an object `{ value }`.
     * Accept both forms.
     *
     * @param {...unknown} args
     * @returns {string}
     */
    run(...args) {
      /* -------------------------------------------------------------- *
       * 1.  Resolve the correct `value` regardless of call signature.  *
       * -------------------------------------------------------------- */
      let value = '';
      if (args.length) {
        const first = args[0];
        /* Object form: { value: '…' } */
        if (first && typeof first === 'object' && 'value' in first) {
          // @ts-ignore – runtime shape check
          value = first.value ?? '';
        } else if (typeof first === 'string') {
          /* Primitive form: '…' */
          value = first;
        }
      }

      /* -------------------------------------------------------------- *
       * 2.  Build the Leaflet viewer.                                  *
       * -------------------------------------------------------------- */
      const mapId = `show_${Math.random().toString(36).slice(2)}`;
      const gj    = wktToGeoJSON(value);
      const { lat, lng, zoom } = DEFAULT_CENTER;
      return `
<div id="${mapId}" style="height:250px;" class="border"></div>
<script>
(function(){
  function css(h){return !!document.querySelector('link[href="'+h+'"]');}
  function js(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function addCss(h){return new Promise(r=>{if(css(h))return r();const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;document.head.appendChild(l);});}
  function addJs(s){return new Promise(r=>{if(js(s))return r();const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};document.head.appendChild(sc);});}
  (async function(){
    await addCss(${JSON.stringify(LEAFLET.css)});
    await addJs(${JSON.stringify(LEAFLET.js)});
    const map=L.map(${JSON.stringify(mapId)}).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap'
    }).addTo(map);
    const gj=${JSON.stringify(gj)};
    if(gj){
      const lyr=L.geoJSON(gj).addTo(map);
      map.fitBounds(lyr.getBounds(),{maxZoom:14});
    }
  })();
})();
</script>`;
    },
  };
}

module.exports = { showView };