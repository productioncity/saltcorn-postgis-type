/**
 * point-edit-view.js
 * Draggable marker editor for **Point** fields on Leaflet.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Extracted from monolithic index.js.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

const { div, script, domReady, text: esc } = require('@saltcorn/markup/tags');
const { LEAFLET } = require('../constants');
const { wktToLonLat } = require('../utils/geometry');

/**
 * @param {string} fieldName  Used to avoid duplicate DOM IDs.
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletPointEditView(fieldName) {
  return {
    isEdit: true,
    run(nm, value) {
      const id = `${fieldName}_${Math.random().toString(36).slice(2)}`;
      const ll = wktToLonLat(value) || [0, 0];
      return (
        div({ id, style: 'height:250px' }, '…') +
        `<input type="hidden" id="inp${id}" name="${esc(nm)}" value="${esc(value || '')}">` +
        script(
          domReady(`
${LEAFLET.header}
(function(){
  const map=L.map("${id}");
  map.setView([${ll[1]},${ll[0]}], ${value ? 12 : 2});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(map);
  const mk=L.marker([${ll[1]},${ll[0]}],{draggable:true}).addTo(map);
  function upd(pt){document.getElementById("inp${id}").value="POINT("+pt.lng+" "+pt.lat+")";}
  mk.on('dragend',e=>upd(e.target.getLatLng()));
  map.on('click',e=>{mk.setLatLng(e.latlng);upd(e.latlng);});
})();`)
        )
      );
    },
  };
}

module.exports = { leafletPointEditView };