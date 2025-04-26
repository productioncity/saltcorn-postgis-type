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
 * Should we output debug information.
 * @type {boolean}
 */
const PLUGIN_DEBUG = true;


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
 * Fallback map centre = Sydney, Australia.
 * @type {{lat:number,lng:number,zoom:number}}
 */
const DEFAULT_CENTER = Object.freeze({
  lat: -33.8688,
  lng: 151.2093,
  zoom: 12,
});

/**
 * Local Leaflet 1.9.4 assets bundled inside the plug‑in’s “public” folder.
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
  js: `/plugins/public/${PLUGIN_SLUG}/leaflet.js`,
  /**
   * Returns HTML that loads Leaflet only if `window.L` is not already defined.
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
  PLUGIN_DEBUG,
  PLUGIN_SLUG,
  DEFAULT_SRID,
  DIM_MODS,
  BASE_GEOM_TYPES,
  LEAFLET,
  DEFAULT_CENTER,
};