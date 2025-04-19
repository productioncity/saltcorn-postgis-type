/**
 * geometry.js
 * ---------------------------------------------------------------------------
 * Stateless helpers for converting between WKT, EWKT, **hex‑encoded WKB** and
 * GeoJSON, as well as validating PostGIS‑related attribute objects.
 *
 * Handles every practical edge‑case:
 *   • Optional `SRID=…;` prefix (EWKT).                     – in/out
 *   • Optional `Z`, `M`, `ZM` dimensionality suffix.       – in/out
 *   • Hex‑WKB returned by a plain `geometry::text` cast.    – in
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑19 – Added WKB handling + full normalisation.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

/* eslint-disable no-magic-numbers */

const dbg = require('./debug');
const wellknown = require('wellknown');
let   wkx;                   // Lazy‑required – optional dependency.

try {
  // `wkx` is a tiny (25 kB) pure‑JS library, MIT‑licensed.
  // It converts WKB <→> WKT/GeoJSON very efficiently.
  // eslint-disable-next-line global-require
  wkx = require('wkx');
} catch {
  /* istanbul ignore next */
  wkx = null;
}

const { DIM_MODS, BASE_GEOM_TYPES } = require('../constants');

/**
 * Attribute object common to all PostGIS types.
 * @typedef {import('../types').PostGISTypeAttrs} PostGISTypeAttrs
 */

/* ───────────────────────── Internal helpers ───────────────────────── */

/**
 * Returns true if the input LOOKS LIKE pure hexadecimal digits.
 *
 * @param {string} txt
 * @returns {boolean}
 */
function isLikelyHex(txt) {
  const yes = /^[0-9A-Fa-f]+$/.test(txt) && txt.length % 2 === 0;
  dbg.trace('isLikelyHex()', { sample: txt.slice(0, 16), yes });
  return yes;
}

/**
 * Strip a trailing `::text` (or any other `::type`) cast that PostgreSQL
 * appends when a plain `geom::text` expression is used.
 *
 * @param {string} src
 * @returns {string}
 */
function stripPgCast(src) {
  const out = src.replace(/::\w+$/u, '');
  dbg.trace('stripPgCast()', { in: src, out });
  return out;
}

/**
 * Converts hex‑encoded WKB ➜ EWKT (string) *or* GeoJSON (object) depending on
 * `as`.
 *
 * @template {'wkt'|'geojson'} T
 * @param {string} hex
 * @param {T}      as
 * @returns {T extends 'wkt' ? string|undefined
 *          : T extends 'geojson' ? Record<string, unknown>|undefined
 *          : never}
 */
function decodeHexWkb(hex, as) {
  dbg.trace('decodeHexWkb()', { as, sample: hex.slice(0, 18) });
  if (!wkx || !isLikelyHex(hex)) return /** @type {never} */ (undefined);
  try {
    const geom = wkx.Geometry.parse(Buffer.from(hex, 'hex'));

    if (as === 'geojson') {
      const g = /** @type {never} */ (geom.toGeoJSON());
      dbg.debug('decodeHexWkb() ➜ GeoJSON');
      return g;
    }

    // as === 'wkt'
    const srid = geom.srid && geom.srid !== 0 ? `SRID=${geom.srid};` : '';
    const wkt = /** @type {never} */ (`${srid}${geom.toWkt()}`);
    dbg.debug('decodeHexWkb() ➜ WKT', wkt.slice(0, 32));
    return wkt;
  } catch (e) {
    dbg.warn('decodeHexWkb() failed', e);
    return /** @type {never} */ (undefined);
  }
}

/* ───────────────────────── Public helpers ─────────────────────────── */

/**
 * Normalises ANY PostgreSQL geometry output into canonical EWKT.
 *
 * @param {unknown} value
 * @returns {string|undefined}
 */
function toWkt(value) {
  dbg.trace('toWkt()', { value });
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const txt = stripPgCast(value.trim());

  // 1. Already looks like EWKT/WKT – fast exit.
  if (/^(SRID=\d+;)?[A-Z]+/u.test(txt)) return txt;

  // 2. Hex‑encoded WKB?
  const wkt = decodeHexWkb(txt, 'wkt');
  dbg.trace('toWkt() result', wkt?.slice?.(0, 32));
  return wkt;
}

/**
 * Extract `[lng, lat]` from a POINT (any input format). Ignores Z/M.
 *
 * @param {unknown} value
 * @returns {[number, number]|undefined}
 */
function wktToLonLat(value) {
  dbg.trace('wktToLonLat()', { value });
  const wkt = toWkt(value);
  if (!wkt) return undefined;

  const m = wkt
    .replace(/^SRID=\d+;/iu, '')
    .match(
      /^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*/iu,
    );
  const out = m ? [Number(m[1]), Number(m[2])] : undefined;
  dbg.trace('wktToLonLat() result', out);
  return out;
}

/**
 * Convert WKT / EWKT / hex‑WKB to GeoJSON (best‑effort for 2‑D geometries).
 *
 * @param {unknown} value
 * @returns {Record<string, unknown>|undefined}
 */
function wktToGeoJSON(value) {
  dbg.trace('wktToGeoJSON()', { value });
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const txt = stripPgCast(value.trim());

  // 1. Hex‑WKB?
  const hexDecoded = decodeHexWkb(txt, 'geojson');
  if (hexDecoded) return hexDecoded;

  // 2. Try as‑is (covers SRID=…;WKT, with or without Z/M/ZM).
  let normalised = txt.replace(/^SRID=\d+;/iu, '');

  try {
    return wellknown.parse(normalised);
  } catch {
    // 3. Retry after stripping any Z/M/ZM.
    normalised = normalised.replace(/\b([A-Z]+)(?:ZM|Z|M)\b/iu, '$1');
    try {
      return wellknown.parse(normalised);
    } catch {
      dbg.warn('wktToGeoJSON() failed for', normalised.slice(0, 40));
      return undefined;
    }
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
  dbg.trace('validateAttrs()', attrs);
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

/* ──────────────────────────────────────────────────────────────────── */

module.exports = {
  toWkt,
  wktToLonLat,
  wktToGeoJSON,
  validateAttrs,
};