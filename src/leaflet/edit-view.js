/**
 * edit-view.js
 * ---------------------------------------------------------------------------
 * Saltcorn “edit” field‑view for PostGIS geometries/geographies.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER } = require('../constants');

/**
 * Builds the Leaflet‑based edit field‑view.
 *
 * @param {string} typeName – Lower‑case Saltcorn type name (e.g. “point”).
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletEditView(typeName) {
  /**
   * Serialises optional centre overrides into data‑attributes.
   * @param {{center_lat?:number,center_lng?:number,center_zoom?:number}} cfg
   * @returns {string}
   */
  const centerDataAttrs = ({ center_lat, center_lng, center_zoom }) =>
    [
      Number.isFinite(center_lat)  ? `data-center-lat="${center_lat}"`   : '',
      Number.isFinite(center_lng)  ? `data-center-lng="${center_lng}"`   : '',
      Number.isFinite(center_zoom) ? `data-center-zoom="${center_zoom}"` : '',
    ]
      .filter(Boolean)
      .join(' ');

  return {
    name: 'leaflet-edit',
    isEdit: true,

    /* Options visible in the Saltcorn field‑view designer */
    configFields: [
      { name: 'center_lat',  label: 'Centre latitude',  type: 'Float'  },
      { name: 'center_lng',  label: 'Centre longitude', type: 'Float'  },
      {
        name: 'center_zoom',
        label: 'Initial zoom',
        type: 'Integer',
        attributes: { min: 0, max: 22 },
      },
    ],

    /**
     * Renders the control.
     *
     * @param {string}                field_name
     * @param {string|null|undefined} value
     * @param {object}                attrs        – Field attributes (srid, dim…)
     * @param {string}                cls
     * @param {object}                req
     * @param {boolean}               disabled
     * @param {object}                viewCfg      – Per‑view config
     * @returns {string} HTML
     */
    run(field_name, value, attrs, cls, req, disabled, viewCfg = {}) {
      const id  = `sc-postgis-${field_name.replace(/\W/g, '')}`;
      const val = value ?? '';

      const hasZ = !!attrs?.dim && /Z|ZM/i.test(String(attrs.dim));

      const centre = {
        lat:  viewCfg.center_lat  ?? DEFAULT_CENTER.lat,
        lng:  viewCfg.center_lng  ?? DEFAULT_CENTER.lng,
        zoom: viewCfg.center_zoom ?? DEFAULT_CENTER.zoom,
      };

      const dataAttrs = centerDataAttrs(centre);

      return `
<div class="sc-postgis-edit ${cls || ''}" id="${id}" ${dataAttrs}>
  <input type="hidden" name="${field_name}" value="${val}" data-role="wkt">
  <div class="sc-postgis-map" style="height:240px"></div>
  ${hasZ ? '<input type="number" step="any" class="form-control mt-1" ' +
             'placeholder="Altitude / measure" data-role="alt">' : ''}
</div>

<script>
(function(){
  if(!window.L) return;            /* Leaflet not yet loaded – safety net */
  const wrap   = document.getElementById('${id}');
  if(!wrap) return;

  const mapEl  = wrap.querySelector('.sc-postgis-map');
  const hidden = wrap.querySelector('[data-role="wkt"]');
  const altEl  = wrap.querySelector('[data-role="alt"]');

  const hasZ   = ${hasZ ? 'true' : 'false'};

  const lat  = Number(wrap.dataset.centerLat)  || ${DEFAULT_CENTER.lat};
  const lng  = Number(wrap.dataset.centerLng)  || ${DEFAULT_CENTER.lng};
  const zoom = Number(wrap.dataset.centerZoom) || ${DEFAULT_CENTER.zoom};

  const map = L.map(mapEl).setView([lat, lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom: 19
  }).addTo(map);

  let marker;

  /** Updates the hidden input with WKT (POINT or POINT Z). */
  function updateHidden(latlng) {
    if (!latlng) return;
    if (hasZ) {
      const alt = altEl ? Number(altEl.value) || 0 : 0;
      hidden.value = \`POINT Z(\${latlng.lng} \${latlng.lat} \${alt})\`;
    } else {
      hidden.value = \`POINT(\${latlng.lng} \${latlng.lat})\`;
    }
  }

  map.on('click', function(e) {
    if (marker) map.removeLayer(marker);
    marker = L.marker(e.latlng, { draggable: true }).addTo(map);
    updateHidden(e.latlng);
    marker.on('dragend', () => updateHidden(marker.getLatLng()));
  });

  if (altEl) {
    altEl.addEventListener('input', () => {
      if (marker) updateHidden(marker.getLatLng());
    });
  }
})();
</script>`;
    },
  };
}

module.exports = { leafletEditView };