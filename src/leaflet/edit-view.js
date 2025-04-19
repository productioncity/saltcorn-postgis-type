/**
 * leaflet/edit‑view.js
 * ---------------------------------------------------------------------------
 * Point‑editor based on Leaflet.  Fixes:
 *   • Grey map (tile‑layer was missing).
 *   • Allows per‑view default centre/zoom – falls back to Sydney, Australia.
 *
 * Clicking on the map places (or moves) a marker and writes a valid WKT
 * string into the backing <input>.  Works for new and existing records.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_CENTER } = require('../constants');

/**
 * Builds an “edit” field‑view for a given Type.
 *
 * @param {string} typeName  The Saltcorn type name (e.g. “point”).
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletEditView(typeName) {
  return {
    isEdit: true,

    /**
     * Additional options exposed in the View‑builder UI.
     * Saltcorn passes the selected values to `run()` via `options`.
     */
    configFields: [
      {
        name: 'height',
        label: 'Map height (px)',
        type: 'Integer',
        required: false,
        default: 320,
      },
      {
        name: 'default_lat',
        label: 'Default latitude',
        type: 'Float',
        required: false,
      },
      {
        name: 'default_lng',
        label: 'Default longitude',
        type: 'Float',
        required: false,
      },
      {
        name: 'default_zoom',
        label: 'Default zoom',
        type: 'Integer',
        required: false,
      },
    ],

    /**
     * Render callback (Saltcorn v0.x + v1.x compatible signature).
     *
     * @param {string}                   name      Form input name.
     * @param {string|undefined|null}    value     Current DB value (WKT).
     * @param {object}                   attrs     Field attributes.
     * @param {boolean}                  disabled  If true the field is read‑only.
     * @param {Record<string, unknown>}  options   View‑level config.
     * @returns {string}                            Raw HTML.
     */
    run(name, value, attrs, disabled, options = {}) {
      const mapId = `map_${name}_${Math.random().toString(36).slice(2, 8)}`;
      const inputId = `${mapId}_input`;

      // Resolve centre / zoom
      const centre = {
        lat:  Number(options.default_lat  ?? DEFAULT_CENTER.lat),
        lng:  Number(options.default_lng  ?? DEFAULT_CENTER.lng),
        zoom: Number(options.default_zoom ?? DEFAULT_CENTER.zoom),
      };

      const height = Number(options.height) > 50 ? Number(options.height) : 320;

      /* Build the HTML scaffold – hidden <input> + map <div>. */
      /* eslint-disable max-len */
      return `
<input type="hidden" ${disabled ? 'disabled' : ''} id="${inputId}" name="${name}"
       value="${value ?? ''}" />

<div id="${mapId}" style="height:${height}px; width:100%; border:1px solid #ced4da; border-radius:0.25rem;"></div>

<script>
(function() {
  /* Wait for Leaflet to be available (headers injected by the plug‑in). */
  function init() {
    if (!window.L) { setTimeout(init, 50); return; }

    const input = document.getElementById('${inputId}');
    const map   = L.map('${mapId}');
    let   marker;

    /* Add OpenStreetMap tile‑layer – fixes the grey map issue. */
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    /* Utility – place/move the marker and write WKT back to <input>. */
    function setMarker(latlng) {
      if (marker) {
        marker.setLatLng(latlng);
      } else {
        marker = L.marker(latlng, { draggable: true })
                  .addTo(map)
                  .on('dragend', (e) => setMarker(e.target.getLatLng()));
      }
      /* WKT uses lng first, then lat. */
      input.value = 'POINT(' + latlng.lng + ' ' + latlng.lat + ')';
    }

    /* Attempt to centre on existing value. */
    let startLatLng = null;
    if (input.value) {
      const m = input.value.match(/POINT[^()]*\\(([-+\\d.]+)\\s+([-+\\d.]+)/i);
      if (m) startLatLng = { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
    }

    if (startLatLng) {
      map.setView(startLatLng, ${centre.zoom});
      setMarker(startLatLng);
    } else {
      map.setView([${centre.lat}, ${centre.lng}], ${centre.zoom});
    }

    /* Clicking on the map selects the point. */
    map.on('click', (e) => setMarker(e.latlng));
  }
  init();
})();
</script>`;
      /* eslint-enable max-len */
    },
  };
}

module.exports = { leafletEditView };