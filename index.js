/**
 * index.js
 * Saltcorn PostGIS Type Plugin
 *
 * Purpose:
 *   Provides a comprehensive suite of Saltcorn data‑types that map one‑to‑one
 *   with all practical PostGIS geometry and geography types, including robust
 *   attribute handling (SRID, dimensionality, subtype restrictions) and basic
 *   GeoJSON → WKT conversion.
 *
 * Author:        Troy Kelly <troy@team.production.city>
 * Maintainer:    Production City <engineering@production.city>
 * First‑created: 17 Apr 2024
 * This revision: 17 Apr 2025 – QA hardening & completeness review
 * Licence:       CC0‑1.0 (see LICENCE)
 */

/* eslint-disable camelcase */

'use strict';

const { text } = require('@saltcorn/markup');

/**
 * @typedef {object} PostGISTypeAttributes
 * @property {number} [srid]  Spatial reference identifier (default = 4326)
 * @property {''|'Z'|'M'|'ZM'} [dim] Dimensionality modifier
 * @property {string} [subtype] Geometry subtype for generic geometry/geography
 */

const DEFAULT_SRID = 4326;

/** All base geometry names understood by PostGIS (upper‑case) */
const BASE_GEOMETRY_TYPES = [
  'GEOMETRY',
  'POINT',
  'LINESTRING',
  'POLYGON',
  'MULTIPOINT',
  'MULTILINESTRING',
  'MULTIPOLYGON',
  'GEOMETRYCOLLECTION',
  'CIRCULARSTRING',
  'COMPOUNDCURVE',
  'CURVEPOLYGON',
  'MULTICURVE',
  'MULTISURFACE',
  'POLYHEDRALSURFACE',
  'TIN',
  'TRIANGLE',
];

/** Allowed dimensionality modifiers */
const DIM_MODIFIERS = ['', 'Z', 'M', 'ZM'];

/**
 * One descriptor for every spatial type we expose.
 * Each entry becomes a full Saltcorn type via `makeSpatialType()`.
 *
 * For generic geometry/geography the user can further constrain subtype,
 * dimensions and SRID via field attributes.
 *
 * @type {Array<{
 *   name: string,
 *   base: 'GEOMETRY'|'GEOGRAPHY',
 *   subtype: string,
 *   allowSubtype: boolean,
 *   allowDim: boolean,
 *   allowSRID: boolean
 * }>}
 */
const ALL_SPATIAL_TYPE_DEFS = [
  // Generic
  { name: 'geometry', base: 'GEOMETRY', subtype: '', allowSubtype: true, allowDim: true, allowSRID: true },
  { name: 'geography', base: 'GEOGRAPHY', subtype: '', allowSubtype: true, allowDim: true, allowSRID: true },

  // Frequently‑used
  { name: 'point', base: 'GEOMETRY', subtype: 'POINT', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'linestring', base: 'GEOMETRY', subtype: 'LINESTRING', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'polygon', base: 'GEOMETRY', subtype: 'POLYGON', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'multipoint', base: 'GEOMETRY', subtype: 'MULTIPOINT', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'multilinestring', base: 'GEOMETRY', subtype: 'MULTILINESTRING', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'multipolygon', base: 'GEOMETRY', subtype: 'MULTIPOLYGON', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'geometrycollection', base: 'GEOMETRY', subtype: 'GEOMETRYCOLLECTION', allowSubtype: false, allowDim: true, allowSRID: true },

  // Specialist
  { name: 'circularstring', base: 'GEOMETRY', subtype: 'CIRCULARSTRING', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'compoundcurve', base: 'GEOMETRY', subtype: 'COMPOUNDCURVE', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'curvepolygon', base: 'GEOMETRY', subtype: 'CURVEPOLYGON', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'multicurve', base: 'GEOMETRY', subtype: 'MULTICURVE', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'multisurface', base: 'GEOMETRY', subtype: 'MULTISURFACE', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'polyhedralsurface', base: 'GEOMETRY', subtype: 'POLYHEDRALSURFACE', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'tin', base: 'GEOMETRY', subtype: 'TIN', allowSubtype: false, allowDim: true, allowSRID: true },
  { name: 'triangle', base: 'GEOMETRY', subtype: 'TRIANGLE', allowSubtype: false, allowDim: true, allowSRID: true },
];

/* -------------------------------------------------------------------------- */
/*                             Attribute definitions                          */
/* -------------------------------------------------------------------------- */

/**
 * Build the Saltcorn attribute spec array for a given definition.
 *
 * @param {ReturnType<typeof ALL_SPATIAL_TYPE_DEFS[number]>} def
 * @returns {import('@saltcorn/types/base_plugin').TypeAttribute[]}
 */
const getTypeAttributes = (def) => {
  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attrs = [];

  if (def.allowSRID) {
    attrs.push({
      name: 'srid',
      label: 'SRID',
      type: 'Integer',
      required: false,
      default: DEFAULT_SRID,
      description:
        // Added richer context so designers understand what SRID means.
        'Spatial Reference System Identifier (numeric EPSG code).\n' +
        '4326 = WGS‑84 latitude/longitude (GPS)\n' +
        '3857 = Web‑Mercator (web maps)\n' +
        'Must be a positive integer. Defaults to 4326 when left blank.',
    });
  }

  if (def.allowDim) {
    attrs.push({
      name: 'dim',
      label: 'Dimension',
      type: 'String',
      required: false,
      attributes: { options: DIM_MODIFIERS },
      default: '',
      description:
        // Clarified each option so the meaning of Z/M/ZM is obvious.
        'Dimensionality flags:\n' +
        '• (blank) → 2‑D   (X Y)\n' +
        '• Z       → 3‑D   (X Y Z)\n' +
        '• M       → Measured (X Y M)\n' +
        '• ZM      → 3‑D + Measured (X Y Z M)\n' +
        '“Z” carries height/elevation, “M” carries an arbitrary measure (e.g. time or distance).',
    });
  }

  if (def.allowSubtype) {
    attrs.push({
      name: 'subtype',
      label: 'Subtype',
      type: 'String',
      required: false,
      attributes: { options: BASE_GEOMETRY_TYPES },
      default: '',
      description:
        'Restrict input to a concrete geometry subtype (optional).',
    });
  }
  return attrs;
};

/* -------------------------------------------------------------------------- */
/*                                Field views                                */
/* -------------------------------------------------------------------------- */

/** A read‑only code block */
function makeShowView() {
  return {
    isEdit: false,
    /**
     * @param {string|undefined|null} value
     * @returns {string}
     */
    run: (value) => {
      if (value === undefined || value === null || value === '') return '';
      return `<code>${text(value)}</code>`;
    },
  };
}

/**
 * Build a simple text input fieldview.
 *
 * @param {string} nameSuffix
 * @param {string} placeholder
 * @returns {{isEdit: true, run: Function}}
 */
function makeEditView(nameSuffix, placeholder) {
  return {
    isEdit: true,
    /**
     * @param {string} nm
     * @param {string|undefined|null} v
     * @param {Record<string, unknown>} _attrs
     * @param {string} cls
     * @returns {string}
     */
    run: (nm, v, _attrs, cls) =>
      `<input type="text" inputmode="text" class="form-control ${cls || ''}" name="${nm}" id="input${nameSuffix}${nm}"
        ${v ? `value="${text(v)}"` : ''} placeholder="${text(placeholder)}">`,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Helper functions                             */
/* -------------------------------------------------------------------------- */

/**
 * Validate that an attribute object is self‑consistent.
 *
 * @param {Partial<PostGISTypeAttributes>=} attrs
 * @returns {true|string} true or error message
 */
function validateAttributes(attrs) {
  if (!attrs) return true;

  if (
    Object.prototype.hasOwnProperty.call(attrs, 'srid') &&
    (attrs.srid === null ||
      attrs.srid === undefined ||
      !Number.isInteger(attrs.srid) ||
      Number(attrs.srid) < 1)
  ) {
    return 'SRID must be a positive integer';
  }

  if (
    attrs.dim &&
    !DIM_MODIFIERS.includes(String(attrs.dim).toUpperCase())
  ) {
    return 'Invalid dimensionality modifier';
  }

  if (
    attrs.subtype &&
    !BASE_GEOMETRY_TYPES.includes(String(attrs.subtype).toUpperCase())
  ) {
    return 'Invalid geometry subtype';
  }

  return true;
}

/**
 * Construct a fully‑specified PostGIS type name.
 *
 * Examples:
 *   geometry(PointZM,4326)
 *   geography(LineString,4326)
 *   geometry(Geometry,3857)
 *
 * @param {Partial<PostGISTypeAttributes>=} attrs
 * @param {'GEOMETRY'|'GEOGRAPHY'} baseType
 * @param {string} defaultSubtype
 * @returns {string}
 */
function buildSQLType(attrs, baseType, defaultSubtype) {
  const srid = attrs?.srid ?? DEFAULT_SRID;
  const dim = attrs?.dim ? String(attrs.dim).toUpperCase() : '';
  const subtype =
    (attrs?.subtype
      ? String(attrs.subtype).toUpperCase()
      : defaultSubtype || '') + dim;

  const sqlBase = baseType.toLowerCase();

  // If a concrete subtype is known
  if (subtype) {
    return `${sqlBase}(${subtype},${srid})`;
  }

  // Generic geometry/geography with SRID constraint
  if (srid !== undefined && srid !== null) {
    // PostGIS expects the literal “Geometry” token for generic constraints
    return `${sqlBase}(Geometry,${srid})`;
  }

  // Totally generic
  return sqlBase;
}

/**
 * Lightweight, heuristic WKT checker.
 *
 * @param {string} wkt
 * @param {string=} constraint Base subtype, e.g. "POINT" or "POINTZM"
 * @param {''|'Z'|'M'|'ZM'=} dim
 * @returns {boolean}
 */
function validateWKT(wkt, constraint, dim) {
  if (typeof wkt !== 'string') return false;

  let str = wkt.trim().toUpperCase();
  if (!str) return false;

  if (!/^(SRID=\d+;)?[A-Z]+/.test(str)) return false;

  // Strip optional SRID prefix
  if (str.startsWith('SRID=')) str = str.substring(str.indexOf(';') + 1);

  const expected =
    constraint &&
    (constraint.endsWith('ZM') || constraint.endsWith('Z') || constraint.endsWith('M')
      ? constraint
      : constraint + (dim || '')).toUpperCase();

  if (expected && !str.startsWith(expected)) return false;

  // Very lax structural check – relies on PostGIS for the heavy lifting
  if (!(str.includes('(') && str.endsWith(')')) && !str.endsWith('EMPTY'))
    return false;

  return true;
}

/* -------------------------- GeoJSON → WKT helpers ------------------------- */

/**
 * Convert a number array or nested arrays to a WKT coordinate string.
 *
 * Recurses through arbitrary nesting depth.
 *
 * @param {unknown} coords
 * @returns {string}
 */
function coordsToString(coords) {
  if (!Array.isArray(coords)) return '';

  // Plain position (Point)
  if (coords.length && typeof coords[0] === 'number') {
    return coords.join(' ');
  }

  // One nesting level down
  return coords
    .map((c) =>
      Array.isArray(c[0]) ? `(${coordsToString(c)})` : coordsToString(c),
    )
    .join(', ');
}

/**
 * Convert a GeoJSON geometry object (not Feature) to WKT.
 *
 * Only simple, RFC‑7946 compliant objects are supported.
 *
 * @param {Record<string, any>} geojson
 * @returns {string|undefined}
 */
function geojsonToWKT(geojson) {
  if (!geojson || typeof geojson.type !== 'string') return undefined;

  const type = geojson.type.toUpperCase();

  switch (type) {
    case 'POINT':
      return Array.isArray(geojson.coordinates)
        ? `POINT(${coordsToString(geojson.coordinates)})`
        : undefined;

    case 'MULTIPOINT':
      return Array.isArray(geojson.coordinates)
        ? `MULTIPOINT(${geojson.coordinates
          .map((pt) => coordsToString(pt))
          .join(', ')})`
        : undefined;

    case 'LINESTRING':
      return Array.isArray(geojson.coordinates)
        ? `LINESTRING(${geojson.coordinates
          .map((pt) => coordsToString(pt))
          .join(', ')})`
        : undefined;

    case 'MULTILINESTRING':
      return Array.isArray(geojson.coordinates)
        ? `MULTILINESTRING(${geojson.coordinates
          .map(
            (ls) => `(${ls.map((pt) => coordsToString(pt)).join(', ')})`,
          )
          .join(', ')})`
        : undefined;

    case 'POLYGON':
      return Array.isArray(geojson.coordinates)
        ? `POLYGON(${geojson.coordinates
          .map(
            (ring) => `(${ring.map((pt) => coordsToString(pt)).join(', ')})`,
          )
          .join(', ')})`
        : undefined;

    case 'MULTIPOLYGON':
      return Array.isArray(geojson.coordinates)
        ? `MULTIPOLYGON(${geojson.coordinates
          .map(
            (poly) =>
              `(${poly
                .map(
                  (ring) =>
                    `(${ring
                      .map((pt) => coordsToString(pt))
                      .join(', ')})`,
                )
                .join(', ')})`,
          )
          .join(', ')})`
        : undefined;

    case 'GEOMETRYCOLLECTION':
      return Array.isArray(geojson.geometries)
        ? `GEOMETRYCOLLECTION(${geojson.geometries
          .map((g) => geojsonToWKT(g))
          .filter(Boolean)
          .join(', ')})`
        : undefined;

    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/*                            Saltcorn type factory                           */
/* -------------------------------------------------------------------------- */

/**
 * Produce a Saltcorn type object from an internal descriptor.
 *
 * @param {typeof ALL_SPATIAL_TYPE_DEFS[number]} def
 * @returns {import('@saltcorn/types/base_plugin').Type}
 */
function makeSpatialType(def) {
  const { name, base, subtype } = def;
  const label =
    (subtype || base).charAt(0).toUpperCase() +
    (subtype || base).slice(1).toLowerCase();

  return {
    name,

    /** @param {Partial<PostGISTypeAttributes>=} attrs */
    sql_name: (attrs) => buildSQLType(attrs, base, subtype),

    description: `PostGIS ${label} type – accepts WKT, EWKT or simple GeoJSON.`,

    attributes: getTypeAttributes(def),
    validate_attributes: validateAttributes,
    presets: {},

    fieldviews: {
      show: makeShowView(),
      edit: makeEditView(name, `e.g. ${(subtype || 'POINT')}(30 10)`),
    },

    /**
     * Coerce a JS value (string, GeoJSON, etc.) to a canonical WKT string.
     *
     * @param {unknown} v
     * @param {Partial<PostGISTypeAttributes>=} fieldAttrs
     * @returns {string|undefined}
     */
    read: (v, fieldAttrs = {}) => {
      if (
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '')
      ) {
        return undefined;
      }

      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return undefined;

        const targetSubtype =
          (def.allowSubtype && fieldAttrs.subtype
            ? String(fieldAttrs.subtype)
            : subtype) || undefined;

        const dimStr = fieldAttrs.dim || '';

        if (
          targetSubtype &&
          !validateWKT(s, targetSubtype.toUpperCase(), dimStr)
        ) {
          return undefined;
        }
        return s;
      }

      // GeoJSON or other structured input
      if (typeof v === 'object') {
        if (typeof v.wkt === 'string') return v.wkt;
        if (typeof v.toWKT === 'function') return v.toWKT();
        const wkt = geojsonToWKT(/** @type {any} */(v));
        return wkt ?? undefined;
      }

      return undefined;
    },

    /**
     * Per‑value validator (called by Saltcorn).
     *
     * @param {Partial<PostGISTypeAttributes>=} attrs
     * @returns {(value: unknown) => true|string}
     */
    validate: (attrs) => (value) => {
      if (value === undefined || value === null || value === '') return true;
      if (typeof value !== 'string') return 'Value must be a WKT string';

      const s = value.trim();
      if (!s) return true;

      const typeConstraint = def.allowSubtype && attrs?.subtype
        ? String(attrs.subtype).toUpperCase()
        : subtype || '';

      const dimConstraint = attrs?.dim || '';

      if (
        typeConstraint &&
        !validateWKT(s, typeConstraint, dimConstraint)
      ) {
        return `Must be WKT of ${typeConstraint}${dimConstraint}`;
      }
      return true;
    },

    /**
     * Pass‑through when reading from DB.
     *
     * @param {unknown} v
     * @returns {string|undefined}
     */
    readFromDB: (v) => (typeof v === 'string' ? v : undefined),
  };
}

/* -------------------------------------------------------------------------- */
/*                                Registration                                */
/* -------------------------------------------------------------------------- */

const types = ALL_SPATIAL_TYPE_DEFS.map(makeSpatialType);

module.exports = {
  sc_plugin_api_version: 1,
  types,
};