/**
 * map-edit-view.js
 * ----------------------------------------------------------------------------
 * Field‑view "edit" – interactive Leaflet editor.
 *
 * • Draw / edit / delete Points, LineStrings, Polygons (Leaflet‑Draw).
 * • Multi‑feature editing → serialises to GEOMETRYCOLLECTION WKT.
 * • Optional helper input for common Z‑value.
 *
 * Author:   Troy Kelly  <troy@team.production.city>
 * Updated:  2025‑04‑20 – Accept both Saltcorn call signatures
 *                        (field‑name string *or* Field object).
 * Licence:  CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER, LEAFLET } = require('../constants');

const DRAW_JS =
    'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.min.js';
const DRAW_CSS =
    'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css';
const WELLKNOWN_JS =
    'https://cdn.jsdelivr.net/npm/wellknown@0.5.0/wellknown.min.js';

/**
 * Helper that normalises Saltcorn’s two possible call signatures:
 *   • (fieldName:string, value, attrs?, classes?)
 *   • (fieldObj:Field,   value, attrs?, classes?)
 *
 * @param {IArguments} args
 * @returns {{name:string,value:string,attrs?:object,cls?:string}}
 */
function unpackArgs(args) {
    /** @type {string} */
    let name = '';
    /** @type {string} */
    let value = '';
    /** @type {object|undefined} */
    let attrs;
    /** @type {string|undefined} */
    let cls;

    if (args[0] && typeof args[0] === 'object' && 'name' in args[0]) {
        // Field object form
        // @ts-ignore – runtime shape test
        name = args[0].name;
        value = args[1] ?? '';
        attrs = args[2];
        cls = args[3];
    } else {
        // Primitive form (string field name)
        name = args[0] ?? '';
        value = args[1] ?? '';
        attrs = args[2];
        cls = args[3];
    }
    return { name, value: String(value ?? ''), attrs, cls };
}

/**
 * Build the interactive Leaflet editor (used for every geometry type).
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function mapEditView() {
    return {
        name: 'edit',
        isEdit: true,
        description: 'Interactive Leaflet editor for PostGIS geometries.',
        /* eslint-disable max-lines-per-function */
        run(/* …dynamic… */) {
            const { name: fieldName, value: current, attrs = {}, cls = '' } =
                unpackArgs(arguments);

            const mapId = `map_${Math.random().toString(36).slice(2)}`;
            const inputId = `in_${mapId}`;

            // Z‑value helper only if the field (or current value) is 3‑D.
            const dimAttr = String(attrs?.dim ?? '').toUpperCase();
            const hasZ =
                dimAttr.includes('Z') || /Z[^A-Za-z]*\(/i.test(current || '');
            const zId = hasZ ? `z_${mapId}` : null;

            const { lat, lng, zoom } = DEFAULT_CENTER;

            return `
<div class="${cls}">
  <div id="${mapId}" style="height:300px;" class="border rounded"></div>
  <input type="hidden" id="${inputId}" name="${fieldName}" value="${current}">
  ${hasZ
                    ? `<div class="mt-1">
           <label for="${zId}" class="form-label mb-0">Z&nbsp;value</label>
           <input type="number" id="${zId}" class="form-control form-control-sm" step="any">
         </div>`
                    : ''
                }
</div>

<script>
${String(function scParsePointWKT(wkt) {
                    if (typeof wkt !== 'string') return null;
                    const m = wkt.replace(/^SRID=\\d+;/i, '')
                        .match(/^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*/i);
                    return m ? [Number(m[2]), Number(m[1])] : null;
                })}

(function(){
  /* ===== 1. Utility: dynamic dependency loader ===================== */
  function hasCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function hasJs(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function getCss(h){return new Promise(r=>{if(hasCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;document.head.appendChild(l);});}
  function getJs(s){return new Promise(r=>{if(hasJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  (async function(){
    await getCss(${JSON.stringify(LEAFLET.css)});
    await getCss(${JSON.stringify(DRAW_CSS)});
    await getJs(${JSON.stringify(LEAFLET.js)});
    await getJs(${JSON.stringify(DRAW_JS)});
    await getJs(${JSON.stringify(WELLKNOWN_JS)});
    init();
  })();

  /* ===== 2.  Build map once deps are ready ========================= */
  function init(){
    const mapEl=document.getElementById(${JSON.stringify(mapId)});
    const hidden=document.getElementById(${JSON.stringify(inputId)});
    if(!mapEl||!hidden||!window.L||!window.L.Draw)return;

    const map=L.map(mapEl).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                {attribution:'&copy; OpenStreetMap'}).addTo(map);
    const fg=new L.FeatureGroup().addTo(map);

    /* ---- load initial geometry (if any) --------------------------- */
    try{
      const init=hidden.value.trim();
      if(init){
        const gj=window.wellknown.parse(init.replace(/^SRID=\\d+;/i,''));
        const lyr=L.geoJSON(gj).addTo(fg);
        map.fitBounds(lyr.getBounds(),{maxZoom:14});
      }
    }catch{/* ignore bad input */}

    /* ---- Leaflet‑Draw toolbar ------------------------------------ */
    map.addControl(new L.Control.Draw({
      edit:{featureGroup:fg},
      draw:{polygon:true,polyline:true,rectangle:false,circle:false,marker:true,circlemarker:false}
    }));

    /* ---- WKT serialiser ------------------------------------------ */
    function toWkt(){
      const gj=fg.toGeoJSON();
      if(!gj.features.length) return '';
      if(gj.features.length===1)
        return window.wellknown.stringify(gj.features[0].geometry);
      return 'GEOMETRYCOLLECTION('+
             gj.features.map(f=>window.wellknown.stringify(f.geometry)).join(',')+
             ')';
    }
    function sync(){hidden.value=toWkt();}

    map.on(L.Draw.Event.CREATED,e=>{fg.addLayer(e.layer);sync();});
    map.on(L.Draw.Event.EDITED,sync);
    map.on(L.Draw.Event.DELETED,sync);
  }
})();
</script>`;
        },
        /* eslint-enable max-lines-per-function */
    };
}

module.exports = { mapEditView };