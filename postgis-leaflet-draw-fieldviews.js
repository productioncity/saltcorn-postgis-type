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

const { div, script, domReady, text: esc } = require('@saltcorn/markup/tags');

/**
 * Leaflet & Leaflet‑Draw CDN bundles
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
const WELLKNOWN_JS =
  '<script defer src="https://unpkg.com/wellknown@0.5.0/wellknown.js"></script>';

function leafletDrawHeader() {
  return LEAFLET.header + LEAFLET_DRAW.header + WELLKNOWN_JS;
}

/**
 * @param {'point'|'polygon'|'geometry'} kind
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function makeDrawFieldView(kind) {
  return {
    isEdit: true,
    blockDisplay: true,
    description: `Leaflet‑draw editor for ${kind}`,

    /* Saltcorn runs this to build the HTML */
    run(nm, value, attrs = {}, cls) {
      const id = `ld${Math.random().toString(36).slice(2)}`;

      /* 3‑D altitude helper if dim contains Z */
      const needZ = String(attrs.dim || '').toUpperCase().includes('Z');
      const zId = `z${id}`;
      const zInput =
        needZ
          ? `<div class="mb-1"><label for="${zId}" class="form-label">Z&nbsp;(altitude)</label>` +
            `<input id="${zId}" type="number" step="any" class="form-control" value="0"/>` +
            '</div>'
          : '';

      /* ---------- HTML to send back ---------- */

      const header = leafletDrawHeader();

      const js = `
(function(){
  /* Helper: convert drawn layer → WKT */
  function layerToWkt(layer, wantZ, zVal) {
    const gj = layer.toGeoJSON();
    if (wantZ) {
      (function addZ(c) {
        if (typeof c[0] === 'number') { if (c.length === 2) c.push(zVal); }
        else c.forEach(addZ);
      })(gj.geometry?.coordinates ?? gj.coordinates ?? gj);
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
            ? { marker: true, polygon: false, polyline: false, rectangle: false, circle: false, circlemarker: false }
            : kind === 'polygon'
              ? { marker: false, polygon: true, polyline: false, rectangle: false, circle: false, circlemarker: false }
              : { polygon: true, polyline: true, rectangle: true, circle: false, circlemarker: false, marker: true },
        edit: { featureGroup: 'PLACEHOLDER' },
      }).replace('"PLACEHOLDER"', 'drawn')}).addTo(map);

  const hidden = document.getElementById("inp${id}");
  function refreshHidden(){
    const out = [];
    drawn.eachLayer(l => out.push(
      layerToWkt(l, ${needZ}, parseFloat(document.getElementById("${zId}")?.value || 0))
    ));
    hidden.value = out.join(';');
  }

  map.on(L.Draw.Event.CREATED, e => { drawn.addLayer(e.layer); refreshHidden(); });
  map.on(L.Draw.Event.EDITED, refreshHidden);
  map.on(L.Draw.Event.DELETED, refreshHidden);

  /* Load existing value */
  (function loadInitial(){
    const init = ${JSON.stringify(value || '')};
    if (!init) return;
    init.split(';').forEach(w => {
      try {
        const gj = window.wellknown.parse(w);
        const lyr = L.geoJSON(gj).getLayers()[0];
        drawn.addLayer(lyr);
      } catch{}
    });
    if (drawn.getLayers().length)
      map.fitBounds(drawn.getBounds());
  })();

  /* Default centre = Sydney if still empty */
  if (!drawn.getLayers().length) map.setView([-33.8688, 151.2093], 11);

  /* Grey‑box fix: invalidate size when control becomes visible */
  const obs = new ResizeObserver(() => map.invalidateSize());
  obs.observe(document.getElementById("${id}"));
})();`;

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
 * Attach leaflet_draw to each supported PostGIS type.
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
      case 'multipoint':
      case 'multilinestring':
      case 'multipolygon':
        t.fieldviews.leaflet_draw = makeDrawFieldView('geometry');
        break;
      /* others (circularstring etc.) deliberately skipped */
    }
  }
}

module.exports = { registerLeafletDrawFieldViews };