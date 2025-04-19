/**
 * constants.js
 * Centralised, immutable constants used across the Saltcorn PostGIS type
 * plug‑in. Extracting them prevents magic‑numbers/strings and avoids circular
 * dependencies.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Extracted from monolithic index.js.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

/* eslint-disable max-len */

/**
 * Default SRID (EPSG:4326 – WGS‑84 lat/lng).
 * @type {number}
 */
const DEFAULT_SRID = 4326;

/**
 * Allowed PostGIS dimensionality flags.
 * @type {ReadonlyArray<string>}
 */
const DIM_MODS = Object.freeze(['', 'Z', 'M', 'ZM']);

/**
 * Canonical geometry tokens used exclusively for attribute validation.
 * @type {ReadonlyArray<string>}
 */
const BASE_GEOM_TYPES = Object.freeze([
  'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
  'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION',
  'CIRCULARSTRING', 'COMPOUNDCURVE', 'CURVEPOLYGON', 'MULTICURVE',
  'MULTISURFACE', 'POLYHEDRALSURFACE', 'TIN', 'TRIANGLE',
]);

/**
 * Leaflet CDN assets – pulled in dynamically by field‑views so pages that
 * never display a map incur zero overhead.
 *
 * @typedef {Object} LeafletCdn
 * @property {string} css  Href to the stylesheet
 * @property {string} js   Src  to the JavaScript bundle
 * @property {string} header Lazy getter producing combined <link>/<script>
 */

/** @type {LeafletCdn} */
const LEAFLET = Object.freeze({
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  js:  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  get header() {
    return (
      `<link rel="stylesheet" href="${this.css}"/>\n` +
      `<script defer src="${this.js}"></script>`
    );
  },
});

module.exports = {
  DEFAULT_SRID,
  DIM_MODS,
  BASE_GEOM_TYPES,
  LEAFLET,
};