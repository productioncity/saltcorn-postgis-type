/**
 * catalogue.js
 * Generates the full PostGIS type catalogue, then decorates it with
 * Leaflet‑Draw field‑views where applicable.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Modularised.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

const { makeType } = require('./type-factory');
const { registerLeafletDrawFieldViews } = require('../leaflet/draw-views');

/**
 * Internal catalogue describing every exposed PostGIS type.
 * @type {Array<Parameters<typeof makeType>[0]>}
 */
const INTERNAL_TYPES = [
  // Generic “container” types
  { name: 'geometry', base: 'GEOMETRY', subtype: '', allowSubtype: true, allowDim: true },
  { name: 'geography', base: 'GEOGRAPHY', subtype: '', allowSubtype: true, allowDim: true },

  // Frequent concrete types
  { name: 'point', base: 'GEOMETRY', subtype: 'POINT', allowSubtype: false, allowDim: true },
  { name: 'linestring', base: 'GEOMETRY', subtype: 'LINESTRING', allowSubtype: false, allowDim: true },
  { name: 'polygon', base: 'GEOMETRY', subtype: 'POLYGON', allowSubtype: false, allowDim: true },
  { name: 'multipoint', base: 'GEOMETRY', subtype: 'MULTIPOINT', allowSubtype: false, allowDim: true },
  { name: 'multilinestring', base: 'GEOMETRY', subtype: 'MULTILINESTRING', allowSubtype: false, allowDim: true },
  { name: 'multipolygon', base: 'GEOMETRY', subtype: 'MULTIPOLYGON', allowSubtype: false, allowDim: true },
  { name: 'geometrycollection', base: 'GEOMETRY', subtype: 'GEOMETRYCOLLECTION', allowSubtype: false, allowDim: true },

  // Specialist
  { name: 'circularstring', base: 'GEOMETRY', subtype: 'CIRCULARSTRING', allowSubtype: false, allowDim: true },
  { name: 'compoundcurve', base: 'GEOMETRY', subtype: 'COMPOUNDCURVE', allowSubtype: false, allowDim: true },
  { name: 'curvepolygon', base: 'GEOMETRY', subtype: 'CURVEPOLYGON', allowSubtype: false, allowDim: true },
  { name: 'multicurve', base: 'GEOMETRY', subtype: 'MULTICURVE', allowSubtype: false, allowDim: true },
  { name: 'multisurface', base: 'GEOMETRY', subtype: 'MULTISURFACE', allowSubtype: false, allowDim: true },
  { name: 'polyhedralsurface', base: 'GEOMETRY', subtype: 'POLYHEDRALSURFACE', allowSubtype: false, allowDim: true },
  { name: 'tin', base: 'GEOMETRY', subtype: 'TIN', allowSubtype: false, allowDim: true },
  { name: 'triangle', base: 'GEOMETRY', subtype: 'TRIANGLE', allowSubtype: false, allowDim: true },
];

/** Array of fully‑formed Saltcorn `Type` objects. */
const types = INTERNAL_TYPES.map(makeType);
registerLeafletDrawFieldViews(types);

module.exports = { types };