/**
 * constants.js
 * ---------------------------------------------------------------------------
 * Immutable constants shared across the Saltcorn PostGIS plug‑in.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/* eslint-disable max-len */

/**
 * NPM package / plug‑in slug – used for building public URLs.
 * @type {string}
 */
const PLUGIN_SLUG = 'saltcorn-postgis-type';

/**
 * Default SRID (EPSG:4326 – WGS‑84 lat‑lon).
 * @type {number}
 */
const DEFAULT_SRID = 4326;

/**
 * Allowed PostGIS dimensionality modifiers.
 * @type {ReadonlyArray<string>}
 */
const DIM_MODS = Object.freeze(['', 'Z', 'M', 'ZM']);

/**
 * Canonical geometry sub‑types (upper‑case) for validation.
 * @type {ReadonlyArray<string>}
 */
const BASE_GEOM_TYPES = Object.freeze([
  'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
  'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION',
  'CIRCULARSTRING', 'COMPOUNDCURVE', 'CURVEPOLYGON', 'MULTICURVE',
  'MULTISURFACE', 'POLYHEDRALSURFACE', 'TIN', 'TRIANGLE',
]);

/**
 * Local Leaflet 1.9.4 assets bundled inside the plug‑in’s “public” folder.
 *
 * They are intentionally namespaced under our plug‑in to avoid clashing with
 * the (optional) `@saltcorn/leaflet-map` plug‑in.
 *
 * @typedef {Object} LeafletStatic
 * @property {string} css   – Absolute URL of leaflet.css
 * @property {string} js    – Absolute URL of leaflet.js
 * @property {() => string} header – Lazy helper returning a combined
 *                                    `<link>` + `<script>` tag block.
 */

/** @type {LeafletStatic} */
const LEAFLET = Object.freeze({
  css: `/plugins/public/${PLUGIN_SLUG}/leaflet.css`,
  js:  `/plugins/public/${PLUGIN_SLUG}/leaflet.js`,
  /**
   * Returns HTML that loads Leaflet only if `window.L` is not already defined.
   *
   * It places `id` attributes on the elements so duplicate injection is easy
   * to detect (Saltcorn re‑uses field‑views many times in a single page).
   *
   * @returns {string}
   */
  header() {
    return `
<link id="sc-leaflet-css" rel="stylesheet" href="${this.css}"
      onload="if(window.L){this.remove();}">
<script id="sc-leaflet-js" src="${this.js}" defer
        onload="window.scLeafletLoaded=true;"></script>`;
  },
});

module.exports = {
  PLUGIN_SLUG,
  DEFAULT_SRID,
  DIM_MODS,
  BASE_GEOM_TYPES,
  LEAFLET,
};