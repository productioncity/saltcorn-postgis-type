/**
 * geometry.js
 * Stateless helpers for converting between WKT, EWKT and GeoJSON as well as
 * validating PostGIS‑related attribute objects.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Extracted from monolithic index.js.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

/* eslint-disable no-magic-numbers */

const wellknown = require('wellknown');
const { DIM_MODS, BASE_GEOM_TYPES } = require('../constants');

/**
 * Attribute object common to all PostGIS types.
 * @typedef {import('../types').PostGISTypeAttrs} PostGISTypeAttrs
 */

/**
 * Extract `[lng, lat]` from a POINT WKT (ignores Z/M).
 *
 * @param {unknown} wkt
 * @returns {[number, number]|undefined}
 */
function wktToLonLat(wkt) {
  if (typeof wkt !== 'string') return undefined;
  const m = wkt
    .replace(/^SRID=\d+;/i, '')
    .match(/^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*/i);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

/**
 * Convert any WKT or EWKT to GeoJSON (best‑effort) via `wellknown`.
 *
 * @param {string} wkt
 * @returns {Record<string, unknown>|undefined}
 */
function wktToGeoJSON(wkt) {
  if (typeof wkt !== 'string') return undefined;
  try {
    return wellknown.parse(wkt);
  } catch {
    return undefined;
  }
}

/**
 * Attribute validator – called by Saltcorn when the admin saves the field
 * definition. Keeps backward compatibility with the original plug‑in.
 *
 * @param {PostGISTypeAttrs=} attrs
 * @returns {true|string}
 */
function validateAttrs(attrs) {
  if (!attrs) return true;
  if ('srid' in attrs && (!Number.isInteger(attrs.srid) || attrs.srid < 1)) {
    return 'SRID must be a positive integer';
  }
  if ('dim' in attrs && !DIM_MODS.includes(String(attrs.dim).toUpperCase())) {
    return 'Invalid dim (use "", "Z", "M" or "ZM")';
  }
  if (
    'subtype' in attrs &&
    !BASE_GEOM_TYPES.includes(String(attrs.subtype).toUpperCase())
  ) {
    return 'Invalid geometry subtype';
  }
  return true;
}

module.exports = {
  wktToLonLat,
  wktToGeoJSON,
  validateAttrs,
};