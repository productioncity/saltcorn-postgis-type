/**
 * catalogue.js
 * ---------------------------------------------------------------------------
 * Assembles the complete PostGIS type list consumed by Saltcorn.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { makeType } = require('./type-factory');

/**
 * “Schema” describing every PostGIS type we expose.
 * @type {ReadonlyArray<Parameters<typeof makeType>[0]>}
 */
const TYPE_SCHEMA = [
  /* Generic container types (allow custom subtype + dimension) */
  { name: 'geometry',  base: 'GEOMETRY',   subtype: '', allowSubtype: true, allowDim: true },
  { name: 'geography', base: 'GEOGRAPHY',  subtype: '', allowSubtype: true, allowDim: true },

  /* Frequently used concrete types */
  { name: 'point',              base: 'GEOMETRY', subtype: 'POINT',              allowSubtype: false, allowDim: true },
  { name: 'linestring',         base: 'GEOMETRY', subtype: 'LINESTRING',         allowSubtype: false, allowDim: true },
  { name: 'polygon',            base: 'GEOMETRY', subtype: 'POLYGON',            allowSubtype: false, allowDim: true },
  { name: 'multipoint',         base: 'GEOMETRY', subtype: 'MULTIPOINT',         allowSubtype: false, allowDim: true },
  { name: 'multilinestring',    base: 'GEOMETRY', subtype: 'MULTILINESTRING',    allowSubtype: false, allowDim: true },
  { name: 'multipolygon',       base: 'GEOMETRY', subtype: 'MULTIPOLYGON',       allowSubtype: false, allowDim: true },
  { name: 'geometrycollection', base: 'GEOMETRY', subtype: 'GEOMETRYCOLLECTION', allowSubtype: false, allowDim: true },

  /* Specialist sub‑types */
  { name: 'circularstring',     base: 'GEOMETRY', subtype: 'CIRCULARSTRING',     allowSubtype: false, allowDim: true },
  { name: 'compoundcurve',      base: 'GEOMETRY', subtype: 'COMPOUNDCURVE',      allowSubtype: false, allowDim: true },
  { name: 'curvepolygon',       base: 'GEOMETRY', subtype: 'CURVEPOLYGON',       allowSubtype: false, allowDim: true },
  { name: 'multicurve',         base: 'GEOMETRY', subtype: 'MULTICURVE',         allowSubtype: false, allowDim: true },
  { name: 'multisurface',       base: 'GEOMETRY', subtype: 'MULTISURFACE',       allowSubtype: false, allowDim: true },
  { name: 'polyhedralsurface',  base: 'GEOMETRY', subtype: 'POLYHEDRALSURFACE',  allowSubtype: false, allowDim: true },
  { name: 'tin',                base: 'GEOMETRY', subtype: 'TIN',                allowSubtype: false, allowDim: true },
  { name: 'triangle',           base: 'GEOMETRY', subtype: 'TRIANGLE',           allowSubtype: false, allowDim: true },
];

/**
 * Fully constructed Saltcorn `Type` objects.
 * @type {ReadonlyArray<import('@saltcorn/types').Type>}
 */
const types = Object.freeze(TYPE_SCHEMA.map(makeType));

module.exports = { types };