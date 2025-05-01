/**
 * geometry.js
 * ---------------------------------------------------------------------------
 * Stateless helpers for converting between WKT, EWKT, **hex-encoded WKB** and
 * GeoJSON, as well as validating PostGIS-related attribute objects.
 *
 * Now also understands the PostGIS helper form `ST_AsEWKT(<hex-wkb>)`.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable no-magic-numbers */

const dbg       = require('./debug');

/*
 *  NOTE ────────────────────────────────────────────────────────────────
 *  The third-party `wellknown` package is no longer required (it fails
 *  to install on modern npm).  All Node-side WKT ⇢ GeoJSON parsing is now
 *  handled by the robust `wkx` library that is already a dependency.
 *  The Leaflet field-views continue to load wellknown.js **in the
 *  browser** via CDN – that path is unaffected and incurs no npm cost.
 *  ─────────────────────────────────────────────────────────────────────
 */

let wkx;
try {
  // Pure-JS parser (MIT) – present unless the host deliberately prunes deps.
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
 * Coerce **anything** we might receive from Postgres into a string.
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
 * Naïve hex detector.
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
 * Strip a trailing `::text` (or any `::type`) cast.
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
 * Hex-WKB ➜ EWKT or GeoJSON.
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
      // @ts-ignore generic handling
      const g = geom.toGeoJSON();
      dbg.debug('decodeHexWkb() ➜ GeoJSON');
      return g;
    }

    const srid = geom.srid && geom.srid !== 0 ? `SRID=${geom.srid};` : '';
    // @ts-ignore generic handling
    const wkt  = `${srid}${geom.toWkt()}`;
    dbg.debug('decodeHexWkb() ➜ WKT', wkt.slice(0, 64));
    // @ts-ignore generic handling
    return wkt;
  } catch (e) {
    dbg.warn('decodeHexWkb() failed', e);
    return /** @type {never} */ (undefined);
  }
}

/**
 * Recursively drop Z/M from coords.
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
 * Deep clone ➜ strip Z.
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
      // @ts-ignore run-time manipulation
      g.coordinates = stripZCoords(g.coordinates);
    }
  }

  recurse(clone);
  return clone;
}

/**
 * Always return Feature / FeatureCollection.
 *
 * @param {Record<string, unknown>|undefined} geom
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
  dbg.trace('toWkt()', { value });
  const coerced = coerceToString(value);
  if (!coerced) return undefined;

  const txt = stripPgCast(coerced.trim());

  /* PostGIS helper wrapper */
  const helper = txt.match(/^ST_AsEWKT\(([^)]+)\)$/i);
  if (helper) {
    const out = decodeHexWkb(helper[1], 'wkt');
    dbg.trace('toWkt() ­– via ST_AsEWKT helper', out?.slice?.(0, 64));
    return out;
  }

  /* Already WKT/EWKT */
  if (/^(SRID=\d+;)?[A-Z]+/u.test(txt)) return txt;

  /* Hex-WKB */
  const wkt = decodeHexWkb(txt, 'wkt');
  dbg.trace('toWkt() result', wkt?.slice?.(0, 64));
  return wkt;
}

/**
 * Extract `[lng, lat]` from a POINT.
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
 * Convert ANY representation ➜ 2-D GeoJSON.
 *
 * @param {unknown} value
 * @returns {Record<string, unknown>|undefined}
 */
function wktToGeoJSON(value) {
  dbg.trace('wktToGeoJSON()', { value });
  const coerced = coerceToString(value);
  if (!coerced || coerced.trim() === '') return undefined;

  const raw = stripPgCast(coerced.trim());

  /* ST_AsEWKT wrapper */
  const helper = raw.match(/^ST_AsEWKT\(([^)]+)\)$/i);
  if (helper) {
    const gj = decodeHexWkb(helper[1], 'geojson');
    return normaliseGeoJSON(stripZFromGeoJSON(gj));
  }

  /* Hex-WKB */
  const hexDecoded = decodeHexWkb(raw, 'geojson');
  if (hexDecoded) return normaliseGeoJSON(stripZFromGeoJSON(hexDecoded));

  /* Plain WKT / EWKT (via wkx) */
  const txt = raw.replace(/^SRID=\d+;/iu, '');

  if (wkx) {
    try {
      const gj = /** @type {Record<string, unknown>} */ (
        wkx.Geometry.parse(txt).toGeoJSON()
      );
      dbg.debug('wktToGeoJSON() via wkx');
      return normaliseGeoJSON(stripZFromGeoJSON(gj));
    } catch (e) {
      dbg.warn('wkx parse failed – attempting dim-token scrub', e);
    }

    /* One more try: strip Z/M tokens and re-parse */
    const resc = txt.replace(/\b([A-Z]+)(?:ZM|Z|M)\b/iu, '$1');
    try {
      const gj2 = /** @type {Record<string, unknown>} */ (
        wkx.Geometry.parse(resc).toGeoJSON()
      );
      return normaliseGeoJSON(stripZFromGeoJSON(gj2));
    } catch (err) {
      dbg.warn('wktToGeoJSON() final attempt failed', err);
      return undefined;
    }
  }

  /* No parser available */
  return undefined;
}

/**
 * Extract first Z ordinate (falls back to 0).
 *
 * @param {string} src
 * @returns {number}
 */
function extractFirstZ(src) {
  dbg.trace('extractFirstZ()', { src: src?.slice?.(0, 64) });
  const wkt = toWkt(src) || (typeof src === 'string' ? src : '');
  const txt = wkt.replace(/^SRID=\d+;/iu, '');

  const m = txt.match(
    /[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\s+[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
  );

  const z = m ? Number(m[1]) : 0;
  dbg.trace('extractFirstZ() result', z);
  return z;
}

/**
 * Validate attribute objects at design-time.
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