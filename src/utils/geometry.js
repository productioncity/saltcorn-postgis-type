/**
 * geometry.js
 * ---------------------------------------------------------------------------
 * Stateless helpers for converting between WKT, EWKT, **hex-encoded WKB** and
 * GeoJSON, as well as validating PostGIS-related attribute objects.
 *
 * Handles every practical edge-case:
 *   • Optional `SRID=…;` prefix (EWKT).                     – in/out
 *   • Optional `Z`, `M`, `ZM` dimensionality suffix.       – in/out
 *   • Hex-WKB returned by a plain `geometry::text` cast.    – in
 *   • Node‐Postgres binary column output (`Buffer`).        – in
 *   • The PostGIS helper form `ST_AsEWKT(<hex-wkb>)`.       – in
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Licence:  CC0-1.0
 */

'use strict';

/* eslint-disable no-magic-numbers */

const dbg       = require('./debug');
const wellknown = require('wellknown');

let wkx; // Lazy-required – optional dependency.
try {
  // eslint-disable-next-line global-require
  wkx = require('wkx');
} catch {
  wkx = null;
}

const { DIM_MODS, BASE_GEOM_TYPES } = require('../constants');

/**
 * Attribute object common to all PostGIS types.
 * @typedef {import('../types').PostGISTypeAttrs} PostGISTypeAttrs
 */

/* ───────────────────────── Internal helpers ───────────────────────── */

/**
 * Safely converts **anything** to a string.  Buffers become hex, everything
 * else coerces with template-literal semantics.
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
 * True if the supplied string looks like pure hexadecimal.
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
 * Remove a trailing `::type` cast that PostgreSQL appends when
 * `geom::text` is used.
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
 * Converts hex-encoded WKB ➜ EWKT (string) *or* GeoJSON (object).
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
      return g;
    }

    /* as === 'wkt' */
    const srid = geom.srid && geom.srid !== 0 ? `SRID=${geom.srid};` : '';
    const wkt  = /** @type {never} */ (`${srid}${geom.toWkt()}`);
    return wkt;
  } catch (e) {
    dbg.warn('decodeHexWkb() failed', e);
    return /** @type {never} */ (undefined);
  }
}

/**
 * Strip Z/M ords from coordinate arrays (deep).
 *
 * @param {unknown} coords
 * @returns {unknown}
 */
function stripZCoords(coords) {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') return coords.slice(0, 2);
  return coords.map(stripZCoords);
}

/**
 * Remove Z/M everywhere in a GeoJSON object.
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
 * Ensure the result is ALWAYS Feature or FeatureCollection.
 *
 * @template {Record<string, unknown>} T
 * @param {T|undefined} geom
 * @returns {Record<string, unknown>|undefined}
 */
function normaliseGeoJSON(geom) {
  if (!geom) return undefined;
  if (geom.type === 'Feature' || geom.type === 'FeatureCollection') return geom;

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

  return { type: 'Feature', properties: {}, geometry: geom };
}

/* ───────────────────────── Public helpers ─────────────────────────── */

/**
 * Normalise ANY Postgres geometry output into canonical EWKT.
 *
 * @param {unknown} value
 * @returns {string|undefined}
 */
function toWkt(value) {
  const coerced = coerceToString(value);
  if (!coerced) return undefined;

  const txt = stripPgCast(coerced.trim());

  /* 0️⃣  Handle PostGIS helper form ST_AsEWKT(<hex>) */
  const match = txt.match(/^ST_AsEWKT\(([^)]+)\)$/i);
  if (match) {
    const fromHex = decodeHexWkb(match[1], 'wkt');
    if (fromHex) return fromHex;
  }

  /* 1️⃣ Already looks like EWKT/WKT */
  if (/^(SRID=\d+;)?[A-Z]+/u.test(txt)) return txt;

  /* 2️⃣ Hex-encoded WKB */
  return decodeHexWkb(txt, 'wkt');
}

/**
 * Extract `[lng, lat]` from a POINT (any input form).
 *
 * @param {unknown} value
 * @returns {[number, number]|undefined}
 */
function wktToLonLat(value) {
  const wkt = toWkt(value);
  if (!wkt) return undefined;

  const m = wkt
    .replace(/^SRID=\d+;/iu, '')
    .match(
      /^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*/iu,
    );
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

/**
 * Convert WKT / EWKT / hex-WKB / ST_AsEWKT(hex) / Buffer ➜ 2-D GeoJSON.
 *
 * @param {unknown} value
 * @returns {Record<string, unknown>|undefined}
 */
function wktToGeoJSON(value) {
  const coerced = coerceToString(value);
  if (!coerced || coerced.trim() === '') return undefined;

  const raw = stripPgCast(coerced.trim());

  /* 0️⃣  ST_AsEWKT(hex) wrapper */
  const helper = raw.match(/^ST_AsEWKT\(([^)]+)\)$/i);
  if (helper) {
    const gj = decodeHexWkb(helper[1], 'geojson');
    return normaliseGeoJSON(stripZFromGeoJSON(gj));
  }

  /* 1️⃣ Hex-WKB direct */
  const hexDecoded = decodeHexWkb(raw, 'geojson');
  if (hexDecoded) return normaliseGeoJSON(stripZFromGeoJSON(hexDecoded));

  /* 2️⃣ Strip EWKT SRID */
  const txt = raw.replace(/^SRID=\d+;/iu, '');

  /* 3️⃣ Prefer wkx */
  if (wkx) {
    try {
      const gj = /** @type {Record<string, unknown>} */ (
        wkx.Geometry.parse(txt).toGeoJSON()
      );
      return normaliseGeoJSON(stripZFromGeoJSON(gj));
    } catch {
      /* fall-through */
    }
  }

  /* 4️⃣ wellknown fallback */
  try {
    return normaliseGeoJSON(wellknown.parse(txt));
  } catch {
    /* last-chance: strip Z/M suffix then retry */
    const resc = txt.replace(/\b([A-Z]+)(?:ZM|Z|M)\b/iu, '$1');
    try {
      return normaliseGeoJSON(wellknown.parse(resc));
    } catch (err) {
      dbg.warn('wktToGeoJSON() failed', err);
      return undefined;
    }
  }
}

/**
 * Extract the first Z ordinate inside ANY geometry string.
 *
 * @param {string} src
 * @returns {number}
 */
function extractFirstZ(src) {
  const wkt = toWkt(src) || (typeof src === 'string' ? src : '');
  const txt = wkt.replace(/^SRID=\d+;/iu, '');

  const m = txt.match(
    /[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\s+[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
  );

  return m ? Number(m[1]) : 0;
}

/**
 * Validate attribute objects at design-time.
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

/* ──────────────────────────────────────────────────────────────────── */

module.exports = {
  toWkt,
  wktToLonLat,
  wktToGeoJSON,
  validateAttrs,
  normaliseGeoJSON,
  extractFirstZ,
};