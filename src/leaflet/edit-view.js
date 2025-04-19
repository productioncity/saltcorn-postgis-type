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
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2025‑04‑19
 * Licence:      CC0‑1.0
 */

'use strict';

const {
  textarea,
  div,
  script,
  input,
} = require('@saltcorn/markup/tags');

const { DEFAULT_CENTER } = require('../constants');

/**
 * Small client‑side helper – injected as string inside <script>.
 * Parses WKT/EWKT `POINT(… …)` and returns `[lat, lng] | null`.
 * Keep in ES5 syntax for maximum browser compatibility.
 *
 * @returns {string}  Self‑contained JS function source.
 */
function inlinePointParserSource() {
  /* eslint-disable func-names */
  return String(function scParsePointWKT(wkt) {
    if (typeof wkt !== 'string') return null;
    const m = wkt
      .replace(/^SRID=\d+;/i, '')
      .match(/^POINT[^()]*\\(\\s*([+-]?\\d+(?:\\.\\d+)?)\\s+([+-]?\\d+(?:\\.\\d+)?)\\s*\\)/i);
    return m ? [Number(m[2]), Number(m[1])] : null; // [lat, lng]
  });
  /* eslint-enable func-names */
}

/**
 * Builds the field‑view object for a concrete PostGIS type.
 *
 * @param {string} typeName  Internal type name (e.g. 'point', 'polygon').
 * @returns {import('@saltcorn/types').FieldViewObj}
 */
function leafletEditView(typeName) {
  const isPoint = typeName === 'point';

  /**
   * @param {string}      fieldName  Name of the field in the form.
   * @param {string|null} value      Current value (may be null on “new” forms).
   * @param {unknown}     attrs      _Unused_ – kept for Saltcorn signature.
   * @param {string}      cls        Additional CSS classes.
   * @returns {string}               HTML markup for the edit control.
   */
  const run = (fieldName, value, attrs, cls) => {
    /* ===================================================================== */
    /* 1. Interactive POINT map‑picker                                      */
    /* ===================================================================== */
    if (isPoint) {
      const mapId   = `sc-postgis-edit-map-${Math.random().toString(36).slice(2)}`;
      const inputId = `input-${fieldName.replace(/[^A-Za-z0-9_-]/g, '')}`;

      /* Current coordinate or fallback to default centre (Sydney CBD). */
      let initialLat = DEFAULT_CENTER.lat;
      let initialLng = DEFAULT_CENTER.lng;
      if (typeof value === 'string') {
        const m = value
          .replace(/^SRID=\d+;/i, '')
          .match(/^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)/i);
        if (m) {
          initialLng = Number(m[1]);
          initialLat = Number(m[2]);
        }
      }

      return (
        div(
          { class: 'sc-postgis-point-edit' },
          div({
            id:    mapId,
            style: 'width:100%;height:220px;border:1px solid #ced4da;border-radius:4px;margin-bottom:4px;',
          }),
        ) +
        /* Hidden <input> carrying the actual field value */
        input({
          type:  'hidden',
          id:    inputId,
          name:  fieldName,
          value: value || '',
        }) +
        script(
          //<![CDATA[
          `
(${inlinePointParserSource()});

(function () {
  var map, marker;
  function init() {
    var el   = document.getElementById('${mapId}');
    var inp  = document.getElementById('${inputId}');
    if (!el || !inp || !window.L) return;

    var startLatLng = scParsePointWKT(inp.value) || [${initialLat}, ${initialLng}];

    map = L.map(el).setView(startLatLng, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
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
})();`,
          //]]>
        ),
      );
    }

    /* ===================================================================== */
    /* 2. Generic fallback – plain <textarea> for any non‑point geometry     */
    /* ===================================================================== */
    return textarea(
      {
        class: `form-control ${cls || ''}`.trim(),
        style: 'min-height:6rem;font-family:monospace;',
        name:  fieldName,
        id:    `input-${fieldName}`,
        placeholder: 'Enter WKT, EWKT or GeoJSON',
      },
      typeof value === 'string' ? value : '',
    );
  };

  return {
    isEdit:       true,
    description:  isPoint
      ? 'Interactive Leaflet point picker (with WKT hidden input).'
      : 'Plain textarea for WKT/EWKT/GeoJSON input.',
    configFields: [],
    run,
  };
}

module.exports = { leafletEditView };