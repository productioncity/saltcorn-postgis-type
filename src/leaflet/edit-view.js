/**
 * edit-view.js
 * -----------------------------------------------------------------------------
 * Edit field‑view for all PostGIS types.
 *
 * • For the common ‘point’ type an interactive Leaflet picker is provided.
 *   Users click (or drag a marker) on the map to set the point; the hidden
 *   form value is stored in canonical WKT (`POINT(lon lat)`).
 * • For every other spatial type the view gracefully falls back to a plain
 *   <textarea> for raw WKT/EWKT or GeoJSON input.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2025‑04‑19
 * Licence:      CC0‑1.0
 */

'use strict';

const { textarea, div, script, input } = require('@saltcorn/markup/tags');
const { DEFAULT_CENTER } = require('../constants');

/**
 * Serialises a small helper function (ES5) that parses `POINT(lon lat)` WKT.
 *
 * @returns {string} Function source code (no wrapping, ready to embed).
 */
function inlinePointParserSource() {
  /* eslint-disable func-names */
  return String(function scParsePointWKT(wkt) {
    if (typeof wkt !== 'string') return null;
    var m = wkt
      .replace(/^SRID=\d+;/i, '')
      .match(
        /^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)/i,
      );
    return m ? [Number(m[2]), Number(m[1])] : null; // [lat, lng]
  });
  /* eslint-enable func-names */
}

/**
 * Builds the field‑view object for a concrete PostGIS type.
 *
 * @param {string} typeName Internal type name (e.g. 'point', 'polygon').
 * @returns {import('@saltcorn/types').FieldViewObj}
 */
function leafletEditView(typeName) {
  const isPoint = typeName === 'point';

  /**
   * Editor renderer.
   *
   * @param {string} fieldName
   * @param {string|null} value
   * @param {unknown} _attrs  Unused (kept for Saltcorn signature).
   * @param {string} cls      Extra CSS classes.
   * @returns {string}        HTML markup.
   */
  const run = (fieldName, value, _attrs, cls) => {
    /* ===================================================================== */
    /* 1. Interactive POINT map‑picker                                      */
    /* ===================================================================== */
    if (isPoint) {
      const mapId = `sc-postgis-edit-map-${Math.random().toString(36).slice(2)}`;
      const inputId = `input-${fieldName.replace(/[^A-Za-z0-9_-]/g, '')}`;

      // Default coordinates (Sydney CBD) or pre‑existing value.
      let initialLat = DEFAULT_CENTER.lat;
      let initialLng = DEFAULT_CENTER.lng;
      if (typeof value === 'string') {
        const match = value
          .replace(/^SRID=\d+;/i, '')
          .match(/^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)/i);
        if (match) {
          initialLng = Number(match[1]);
          initialLat = Number(match[2]);
        }
      }

      /* ------------------------------------------------------------------ */
      /* Build HTML                                                          */
      /* ------------------------------------------------------------------ */
      let html = '';
      html += div(
        { class: 'sc-postgis-point-edit' },
        div({
          id: mapId,
          style:
            'width:100%;height:220px;border:1px solid #ced4da;border-radius:4px;margin-bottom:4px;',
        }),
      );

      // Hidden input carrying the actual WKT string
      html += input({
        type: 'hidden',
        id: inputId,
        name: fieldName,
        value: value || '',
      });

      // Client‑side script
      const scriptContent = `
${inlinePointParserSource()}

(function () {
  var map, marker;

  function init() {
    var el  = document.getElementById('${mapId}');
    var inp = document.getElementById('${inputId}');
    if (!el || !inp || !window.L) return;

    var startLatLng = scParsePointWKT(inp.value) || [${initialLat}, ${initialLng}];

    map = L.map(el).setView(startLatLng, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    marker = L.marker(startLatLng, { draggable: true }).addTo(map);

    function sync(latlng) {
      inp.value = 'POINT(' + latlng.lng + ' ' + latlng.lat + ')';
    }

    marker.on('dragend', function (e) {
      sync(e.target.getLatLng());
    });

    map.on('click', function (e) {
      marker.setLatLng(e.latlng);
      sync(e.latlng);
    });
  }

  if (window.L && window.scLeafletLoaded) init();
  else document.addEventListener('DOMContentLoaded', init);
})();`;

      html += script(scriptContent);
      return html;
    }

    /* ===================================================================== */
    /* 2. Generic textarea for non‑point geometries                          */
    /* ===================================================================== */
    return textarea(
      {
        class: `form-control ${cls || ''}`.trim(),
        style: 'min-height:6rem;font-family:monospace;',
        name: fieldName,
        id: `input-${fieldName}`,
        placeholder: 'Enter WKT, EWKT or GeoJSON',
      },
      typeof value === 'string' ? value : '',
    );
  };

  return {
    isEdit: true,
    description: isPoint
      ? 'Interactive Leaflet point picker (stores WKT).'
      : 'Textarea for WKT/EWKT/GeoJSON input.',
    configFields: [],
    run,
  };
}

module.exports = { leafletEditView };