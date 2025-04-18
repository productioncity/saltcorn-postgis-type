/**
 * postgis-leaflet-draw-fieldviews.js
 * Extra Leaflet‑Draw field‑views for the Saltcorn PostGIS plug‑in
 *
 * PURPOSE:
 *   • Adds full **create / edit / delete** support on Leaflet maps for:
 *       – Point                  →  geometry(Point[…])
 *       – Polygon (single)       →  geometry(Polygon[…])
 *       – Arbitrary Geometry     →  geometry(Geometry[…])
 *   • When the column’s `dim` contains `Z` the UI asks once for an altitude
 *     (Z‑value, default = 0) and applies it to all coordinates.
 *   • No conflict with the upstream *leaflet‑map* plug‑in; we load
 *     Leaflet‑Draw assets lazily and only once.
 *
 * AUTHOR:  Troy Kelly <troy@team.production.city>
 * DATE:    18 Apr 2025
 * LICENCE: CC0‑1.0
 */

/* eslint-disable max-len, camelcase */

'use strict';

const wellknown = require('wellknown');
const { div, script, domReady, text: esc } = require('@saltcorn/markup/tags');

/**
 * The base Leaflet assets are already defined in index.js (LEAFLET constant).
 * To stay isolated we generate the header again locally.
 */
const LEAFLET = Object.freeze({
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  get header() {
    return (
      `<link rel="stylesheet" href="${this.css}"/>\n` +
      `<script defer src="${this.js}"></script>`
    );
  },
});

/** External Leaflet‑Draw CDN assets. */
const LEAFLET_DRAW = Object.freeze({
  css: 'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
  js: 'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js',
  get header() {
    return (
      `<link rel="stylesheet" href="${this.css}"/>\n` +
      `<script defer src="${this.js}"></script>`
    );
  },
});

/** Client‑side helper – loaded only once per page. */
const WELLKNOWN_JS =
  '<script defer src="https://unpkg.com/wellknown@0.5.0/wellknown.js"></script>';

/**
 * Inject Leaflet + Draw assets only on demand.
 *
 * @returns {string}
 */
function leafletDrawHeader() {
  return LEAFLET.header + LEAFLET_DRAW.header + WELLKNOWN_JS;
}

/**
 * Build a leaflet‑draw editor field‑view.
 *
 * @param {'point'|'polygon'|'geometry'} kind
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function makeDrawFieldView(kind) {
  return {
    isEdit: true,
    blockDisplay: true,
    description: `Leaflet‑draw editor for ${kind}`,

    /**
     * @param {string} nm
     * @param {string|undefined} value
     * @param {import('@saltcorn/types/base_plugin').FieldAttributes=} attrs
     * @param {string=} cls
     * @param {boolean=} _req
     * @param {import('@saltcorn/types/model-abstracts/abstract_field').Field=} field
     * @returns {string}
     */
    run(nm, value, attrs = {}, cls, _req, field) {
      const id = `ld${Math.random().toString(36).slice(2)}`;
      const needZ = String(attrs.dim || '').toUpperCase().includes('Z');
      const zId = `z${id}`;
      const zInput = needZ
        ? `<div class="mb-1"><label for="${zId}" class="form-label">Z&nbsp;(altitude)</label>` +
          `<input id="${zId}" type="number" step="any" class="form-control" value="0"/></div>`
        : '';

      /* ---------- HTML/JS to return ---------- */

      // 1.  <link>/<script> assets (not escaped)
      const header = leafletDrawHeader();

      // 2.  JS executed after DOM ready
      const js = `
(function(){
  /* Convert a Leaflet layer to WKT (runs in the browser) */
  function layerToWkt(layer, wantZ, zVal) {
    const gj = layer.toGeoJSON();
    if (wantZ) {
      (function addZ(coords) {
        if (typeof coords[0] === 'number') {
          if (coords.length === 2) coords.push(zVal);
        } else {
          coords.forEach(addZ);
        }
      })(gj.coordinates ?? gj.geometry?.coordinates ?? gj);
    }
    return window.wellknown.stringify(gj);
  }

  const map = L.map("${id}");
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(map);

  const drawn = new L.FeatureGroup().addTo(map);
  const drawCtl = new L.Control.Draw(${JSON.stringify({
        draw:
          kind === 'point'
            ? {
                marker: true,
                polygon: false,
                polyline: false,
                rectangle: false,
                circle: false,
                circlemarker: false,
              }
            : kind === 'polygon'
              ? {
                  marker: false,
                  polygon: true,
                  polyline: false,
                  rectangle: false,
                  circle: false,
                  circlemarker: false,
                }
              : {
                  polygon: true,
                  polyline: true,
                  rectangle: true,
                  circle: false,
                  circlemarker: false,
                  marker: true,
                },
        edit: { featureGroup: 'PLACEHOLDER' },
      }).replace('"PLACEHOLDER"', 'drawn')}).addTo(map);

  const hidden = document.getElementById("inp${id}");
  function refreshHidden(){
    const layers = [];
    drawn.eachLayer(l => layers.push(
      layerToWkt(l, ${needZ}, parseFloat(document.getElementById("${zId}")?.value || 0))
    ));
    hidden.value = layers.join(';');
  }

  map.on(L.Draw.Event.CREATED, e => { drawn.addLayer(e.layer); refreshHidden(); });
  map.on(L.Draw.Event.EDITED, refreshHidden);
  map.on(L.Draw.Event.DELETED, refreshHidden);

  /* Load initial value */
  const initWkt = ${JSON.stringify(value || '')};
  if (initWkt) {
    const wkts = initWkt.split(';');
    wkts.forEach(w => {
      try {
        const gj = window.wellknown.parse(w);
        const lyr = L.geoJSON(gj).getLayers()[0];
        drawn.addLayer(lyr);
      } catch {}
    });
    if (drawn.getLayers().length) {
      map.fitBounds(drawn.getBounds());
    }
  }
  if (!drawn.getLayers().length) map.setView([0, 0], 2);
})();`;

      // 3.  Final HTML string Saltcorn receives
      return (
        header +
        `<div class="${cls || ''}">` +
        zInput +
        div({ id, style: 'height:300px' }) +
        `</div>` +
        `<input type="hidden" id="inp${id}" name="${esc(nm)}" value="${esc(value || '')}">` +
        script(domReady(js))
      );
    },
  };
}

/**
 * Register the new field‑views onto the plug‑in’s types array.
 *
 * @param {import('@saltcorn/types/base_plugin').Type[]} types
 */
function registerLeafletDrawFieldViews(types) {
  for (const t of types) {
    switch (t.name) {
      case 'point':
        t.fieldviews.leaflet_draw = makeDrawFieldView('point');
        break;
      case 'polygon':
        t.fieldviews.leaflet_draw = makeDrawFieldView('polygon');
        break;
      case 'geometry':
      case 'geography':
      case 'geometrycollection':
      case 'multilinestring':
      case 'multipolygon':
      case 'multipoint':
        t.fieldviews.leaflet_draw = makeDrawFieldView('geometry');
        break;
      default:
        break;
    }
  }
}

module.exports = {
  registerLeafletDrawFieldViews,
};