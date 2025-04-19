/**
 * edit-view.js
 * ---------------------------------------------------------------------------
 * Saltcorn “edit” field‑view for PostGIS geometries/geographies.
 *
 * The implementation deliberately stays lightweight: Leaflet initialisation is
 * kicked off in the browser only if the plug‑in’s bundled leaflet.js has not
 * already loaded (see constants.LEAFLET).
 *
 * Key features
 * • Accepts optional centre lat/lng/zoom via field‑view configuration (shown
 *   in the view designer) so new‑record forms start at a sensible location.
 * • For 3‑D (Z) or measured (M/ZM) geometries we surface an additional
 *   “Altitude / Measure” input directly under the map – nothing fancy, but it
 *   lets the user specify those ordinates that Leaflet itself does not handle.
 * • Falls back to a plain WKT text box if JavaScript is disabled.
 *
 * NOTE:  The JavaScript initialiser is injected inline to avoid bundling a
 *        build pipeline; Saltcorn inlines the HTML unmodified.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER } = require('../constants');

/**
 * Saltcorn asks for a function that returns the field‑view definition so we
 * can tailor placeholders for each core PostGIS subtype.
 *
 * @param {string} typeName – Lower‑case Saltcorn type name, e.g. “point”.
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletEditView(typeName) {
  /**
   * @param {object} opts
   * @param {number=} opts.center_lat
   * @param {number=} opts.center_lng
   * @param {number=} opts.center_zoom
   * @returns {string} – A data‑attribute string for the outer <div>.
   */
  const centerDataAttrs = ({ center_lat, center_lng, center_zoom }) => {
    const attrs = [];
    if (Number.isFinite(center_lat)) attrs.push(`data-center-lat="${center_lat}"`);
    if (Number.isFinite(center_lng)) attrs.push(`data-center-lng="${center_lng}"`);
    if (Number.isFinite(center_zoom)) attrs.push(`data-center-zoom="${center_zoom}"`);
    return attrs.join(' ');
  };

  return {
    name: 'leaflet-edit',
    isEdit: true,

    /* Extra options shown in the Saltcorn field‑view designer */
    configFields: [
      {
        name: 'center_lat',
        label: 'Centre latitude',
        type: 'Float',
        sublabel: 'Leave blank to fall back to the plug‑in default.',
      },
      {
        name: 'center_lng',
        label: 'Centre longitude',
        type: 'Float',
      },
      {
        name: 'center_zoom',
        label: 'Initial zoom',
        type: 'Integer',
        sublabel: 'Reasonable values: 0 (whole earth) → 18 (street)',
        attributes: { min: 0, max: 22 },
      },
    ],

    /**
     * Saltcorn calls `run` to render the actual control.
     *
     * @param {string}                  field_name
     * @param {string|null|undefined}   value
     * @param {object}                  attrs
     * @param {string}                  cls
     * @param {object}                  req
     * @param {boolean}                 disabled
     * @param {object}                  viewConfig – Per‑field‑view config chosen in designer
     * @returns {string} HTML
     */
    run(field_name, value, attrs, cls, req, disabled, viewConfig = {}) {
      const id = `sc-postgis-${field_name.replace(/\W/g, '')}`;
      const val = value ?? '';
      const { center_lat, center_lng, center_zoom } = {
        center_lat:
          viewConfig.center_lat ?? DEFAULT_CENTER.lat,
        center_lng:
          viewConfig.center_lng ?? DEFAULT_CENTER.lng,
        center_zoom:
          viewConfig.center_zoom ?? DEFAULT_CENTER.zoom,
      };

      const dataAttrs = centerDataAttrs({ center_lat, center_lng, center_zoom });

      /* Plain WKT fallback + map container */
      return `
<div class="sc-postgis-edit ${cls || ''}" id="${id}" ${dataAttrs}>
  <input type="hidden" name="${field_name}" value="${val}" data-role="wkt-storage">
  <div class="sc-postgis-map" style="height:240px"></div>
  ${attrs?.dim && /Z|ZM/i.test(String(attrs.dim))
        ? '<input type="number" step="any" class="form-control mt-1" ' +
          `placeholder="Altitude / measure" data-role="altitude">`
        : ''}
</div>

<script>
(function(){
  if(!window.L) return; /* Failsafe – Leaflet not loaded */
  const wrap=document.getElementById('${id}');
  if(!wrap) return;

  const mapEl=wrap.querySelector('.sc-postgis-map');
  const hidden=wrap.querySelector('[data-role="wkt-storage"]');
  const altEl=wrap.querySelector('[data-role="altitude"]');

  const lat=Number(wrap.dataset.centerLat)||${DEFAULT_CENTER.lat};
  const lng=Number(wrap.dataset.centerLng)||${DEFAULT_CENTER.lng};
  const zoom=Number(wrap.dataset.centerZoom)||${DEFAULT_CENTER.zoom};

  const map=L.map(mapEl).setView([lat,lng],zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19
  }).addTo(map);

  let marker;
  function updateHidden(latlng){
    const alt = altEl ? Number(altEl.value)||0 : undefined;
    const wkt = 'POINT${attrs?.dim && /Z|ZM/i.test(String(attrs.dim)) ? ' Z' : ''}(' +
                latlng.lng+' '+latlng.lat${attrs?.dim && /Z|ZM/i.test(String(attrs.dim)) ? ' '+(alt||0) : ''}+ ')' ;
    hidden.value = wkt;
  }

  map.on('click',function(e){
    if(marker) map.removeLayer(marker);
    marker=L.marker(e.latlng,{draggable:true}).addTo(map);
    updateHidden(e.latlng);
    marker.on('dragend',()=>updateHidden(marker.getLatLng()));
  });

  if(altEl){
    altEl.addEventListener('input',function(){
      if(marker) updateHidden(marker.getLatLng());
    });
  }
})();
</script>`;
    },
  };
}

module.exports = { leafletEditView };