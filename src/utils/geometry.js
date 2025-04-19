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
 *   • Node‐Postgres binary column output (`Buffer`).        – in
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑20 –  Hex‑WKB aware extractFirstZ() so the edit view
 *                              correctly pre‑loads altitude values.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

/* eslint-disable no-magic-numbers */

const dbg = require('./debug');
const wellknown = require('wellknown');
let   wkx;                   // Lazy‑required – optional dependency.

try {
  // `wkx` is a tiny (25 kB) pure‑JS library, MIT‑licensed.
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
 * Safely converts **anything** we might receive from Postgres into a string
 * for further processing. Buffers become their hex representation, everything
 * else is coerced with `${}` semantics.
 *
 * @param {unknown} v
 * @returns {string|undefined}
 */
function coerceToString(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && Buffer.isBuffer(v)) return v.toString('hex');
  return String(v);
}

/**
 * Returns true if the supplied string is very likely hexadecimal.
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
    dbg.debug('decodeHexWkb() ➜ WKT', wkt.slice(0, 64));
    return wkt;
  } catch (e) {
    dbg.warn('decodeHexWkb() failed', e);
    return /** @type {never} */ (undefined);
  }
}

/**
 * Recursively strips Z/M / extra‑ordinate values from a GeoJSON coordinates
 * array, returning a *new* structure so the original is never mutated.
 *
 * @param {unknown} coords
 * @returns {unknown}
 */
function stripZCoords(coords) {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') {
    // Leaf node – keep just the first 2 numbers (x/y or lng/lat).
    return coords.slice(0, 2);
  }
  return coords.map(stripZCoords);
}

/**
 * Deep‑copies and purges Z/M dimensions across *all* geometries.
 *
 * @template {Record<string, unknown>} T
 * @param {T} geojson
 * @returns {T}
 */
function stripZFromGeoJSON(geojson) {
  /** @type {T} */
  const clone = JSON.parse(JSON.stringify(geojson));

  /** @param {Record<string, unknown>} g */
  function recurse(g) {
    if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
      g.geometries.forEach(recurse);
    } else if ('coordinates' in g) {
      // @ts-ignore
      g.coordinates = stripZCoords(g.coordinates);
    }
  }

  recurse(clone);
  return clone;
}

/**
 * Normalise any geometry‑only GeoJSON into something Leaflet understands
 * 100 % of the time:  we always return either a Feature or FeatureCollection,
 * never a bare geometry or GeometryCollection.
 *
 * @template {Record<string, unknown>} T
 * @param {T|undefined} geom
 * @returns {Record<string, unknown>|undefined}
 */
function normaliseGeoJSON(geom) {
  if (!geom) return undefined;

  /* Feature / FeatureCollection – already fine. */
  if (geom.type === 'Feature' || geom.type === 'FeatureCollection') return geom;

  /* GeometryCollection ➜ FeatureCollection */
  if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    return {
      type: 'FeatureCollection',
      features: geom.geometries.map((g) => ({
        type: 'Feature',
        properties: {},
        geometry: g,
      })),
    };
  }

  /* Simple geometry ➜ Feature */
  return { type: 'Feature', properties: {}, geometry: geom };
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
  const coerced = coerceToString(value);
  if (!coerced) return undefined;

  const txt = stripPgCast(coerced.trim());

  // 1. Already looks like EWKT/WKT – fast exit.
  if (/^(SRID=\d+;)?[A-Z]+/u.test(txt)) return txt;

  // 2. Hex‑encoded WKB?
  const wkt = decodeHexWkb(txt, 'wkt');
  dbg.trace('toWkt() result', wkt?.slice?.(0, 64));
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
 * Convert WKT / EWKT / hex‑WKB / Buffer to *2‑D* GeoJSON.
 *
 * @param {unknown} value
 * @returns {Record<string, unknown>|undefined}
 */
function wktToGeoJSON(value) {
  dbg.trace('wktToGeoJSON()', { value });
  const coerced = coerceToString(value);
  if (!coerced || coerced.trim() === '') return undefined;

  const raw = stripPgCast(coerced.trim());

  /* 1. Hex‑WKB? (fast‑path) */
  const hexDecoded = decodeHexWkb(raw, 'geojson');
  if (hexDecoded) return normaliseGeoJSON(stripZFromGeoJSON(hexDecoded));

  /* 2. Drop `SRID=…;` so libraries don’t choke on it. */
  const txt = raw.replace(/^SRID=\d+;/iu, '');

  /* 3. Prefer `wkx` if available – it happily parses 3‑D + collections. */
  if (wkx) {
    try {
      const geom = wkx.Geometry.parse(txt);
      const gj   = /** @type {Record<string, unknown>} */ (geom.toGeoJSON());
      dbg.debug('wktToGeoJSON() via wkx');
      return normaliseGeoJSON(stripZFromGeoJSON(gj));
    } catch (e) {
      dbg.warn('wkx parse failed – falling back to wellknown', e);
      // Fall‑through.
    }
  }

  /* 4. Legacy fallback – `wellknown` (2‑D only). */
  try {
    return normaliseGeoJSON(wellknown.parse(txt));
  } catch {
    // Retry after stripping any explicit Z/M suffix.
    const normalised = txt.replace(/\b([A-Z]+)(?:ZM|Z|M)\b/iu, '$1');
    try {
      return normaliseGeoJSON(wellknown.parse(normalised));
    } catch (err) {
      dbg.warn('wktToGeoJSON() final attempt failed', err);
      return undefined;
    }
  }
}

/**
 * Extract the first Z ordinate encountered inside **any** geometry string
 * or hex‑encoded WKB. Falls back to 0 if none present.
 *
 * @param {string} src
 * @returns {number}
 */
function extractFirstZ(src) {
  /* 1.  Ensure we are working with readable WKT/EWKT. */
  const wkt = toWkt(src) || (typeof src === 'string' ? src : '');

  /* 2.  Strip EWKT SRID so it never interferes with the regex. */
  const txt = wkt.replace(/^SRID=\d+;/iu, '');

  /* 3.  Regex hunts for “x y z” – captures the z. */
  const m = txt.match(
    /[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\s+[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
  );

  const z = m ? Number(m[1]) : 0;
  dbg.trace('extractFirstZ()', { src: src?.slice?.(0, 64), z });
  return z;
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
  normaliseGeoJSON,
  extractFirstZ,
};