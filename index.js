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
 * This revision: 18 Apr 2025 - Fixing the issue: https://github.com/productioncity/saltcorn-postgis-type/issues/18
 * Licence:       CC0‑1.0 (see LICENCE)
 */

'use strict';

/* eslint-disable camelcase, max-lines */

const { text } = require('@saltcorn/markup');

/* -------------------------------------------------------------------------- */
/* 0.  Fail early on unsupported Node runtimes                                */
/* -------------------------------------------------------------------------- */

const [major] = process.versions.node.split('.').map(Number);
if (major < 14) {
  // PostGIS binary bindings need ≥ 14 in most Saltcorn builds
  // and Saltcorn 0.10+ is tested only on 14-20.
  throw new Error(
    `saltcorn-postgis-type requires Node >= 14 - detected ${process.version}`,
  );
}

/* -------------------------------------------------------------------------- */
/* 1.  Domain constants                                                       */
/* -------------------------------------------------------------------------- */

const DEFAULT_SRID = 4326;

const BASE_GEOMETRY_TYPES = Object.freeze([
  'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
  'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION',
  'CIRCULARSTRING', 'COMPOUNDCURVE', 'CURVEPOLYGON', 'MULTICURVE',
  'MULTISURFACE', 'POLYHEDRALSURFACE', 'TIN', 'TRIANGLE',
]);

const DIM_MODIFIERS = Object.freeze(['', 'Z', 'M', 'ZM']);

/* -------------------------------------------------------------------------- */
/* 2.  Utilities                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Create a **string‑like** function suitable for `Type.sql_name`.
 *
 * The function can be *called* (`fn(attrs)`) or *coerced* to string via
 * `.toLowerCase()`, `.toString()`, `` `${fn}` `` and all remain safe.
 *
 * @param {'GEOMETRY'|'GEOGRAPHY'} baseType
 * @param {string} subtype
 * @returns {(attrs?: import('./types').PostGISTypeAttributes) => string}
 */
function createSqlName(baseType, subtype) {
  /** @param {import('./types').PostGISTypeAttributes=} attrs */
  function sqlName(attrs) {
    return buildSqlType(attrs, baseType, subtype);
  }

  const canonical = baseType.toLowerCase();

  // Non‑enumerable: stay hidden in util.inspect() and object spreads.
  Object.defineProperties(sqlName, {
    toLowerCase: { value: () => canonical },
    toUpperCase: { value: () => canonical.toUpperCase() },
    toString: { value: () => canonical },
    valueOf: { value: () => canonical },
    [Symbol.toPrimitive]: { value: () => canonical },
  });

  return sqlName;
}

/**
 * Assemble a fully‑qualified PostGIS type literal.
 *
 * @param {import('./types').PostGISTypeAttributes=} attrs
 * @param {'GEOMETRY'|'GEOGRAPHY'} baseType
 * @param {string} defaultSubtype
 * @returns {string}
 */
function buildSqlType(attrs, baseType, defaultSubtype) {
  const srid = attrs?.srid ?? DEFAULT_SRID;
  const dim = attrs?.dim ? String(attrs.dim).toUpperCase() : '';
  const subtype = (
    (attrs?.subtype ? String(attrs.subtype) : defaultSubtype) + dim
  ).toUpperCase();

  const sqlBase = baseType.toLowerCase();
  if (subtype) return `${sqlBase}(${subtype},${srid})`;
  if (srid !== undefined && srid !== null) return `${sqlBase}(Geometry,${srid})`;
  return sqlBase;
}

/**
 * Quick attribute sanity‑check.
 *
 * @param {import('./types').PostGISTypeAttributes=} attrs
 * @returns {true|string}
 */
function validateTypeAttrs(attrs) {
  if (!attrs) return true;

  if ('srid' in attrs && (!Number.isInteger(attrs.srid) || attrs.srid < 1)) {
    return 'SRID must be a positive integer';
  }

  if ('dim' in attrs &&
    !DIM_MODIFIERS.includes(String(attrs.dim).toUpperCase())) {
    return 'Invalid dimensionality modifier';
  }

  if ('subtype' in attrs &&
    !BASE_GEOMETRY_TYPES.includes(String(attrs.subtype).toUpperCase())) {
    return 'Invalid geometry subtype';
  }

  return true;
}

/**
 * Lightweight WKT validator (covers EMPTY and quoted identifiers).
 *
 * @param {string} wkt
 * @param {string=} constraint
 * @param {''|'Z'|'M'|'ZM'=} dim
 * @returns {boolean}
 */
function validateWkt(wkt, constraint, dim) {
  if (typeof wkt !== 'string') return false;

  let str = wkt.trim().toUpperCase();
  if (!str) return false;

  // Accept e.g. "SRID=4326;" prefix and optional quotes around type tokens
  if (!/^(SRID=\d+;)?("?)[A-Z_]+"?\s*/.test(str)) return false;

  if (str.startsWith('SRID=')) str = str.substring(str.indexOf(';') + 1);

  const expectedToken = constraint
    ? (constraint.endsWith('Z') || constraint.endsWith('M'))
      ? constraint
      : constraint + (dim || '')
    : '';

  if (expectedToken && !str.startsWith(expectedToken)) return false;
  return /(EMPTY|\(.*\))$/.test(str);
}

/**
 * Convert nested numeric arrays into a WKT coordinate list.
 *
 * @param {unknown} coords
 * @returns {string}
 */
function coordsToString(coords) {
  if (!Array.isArray(coords)) return '';
  if (coords.length && typeof coords[0] === 'number') return coords.join(' ');
  return coords
    .map((c) =>
      Array.isArray(c[0]) ? `(${coordsToString(c)})` : coordsToString(c),
    )
    .join(', ');
}

/**
 * Convert simple RFC‑7946 GeoJSON Geometry → WKT.
 *
 * @param {Record<string, unknown>} geojson
 * @returns {string|undefined}
 */
/* eslint-disable complexity */
function geojsonToWKT(geojson) {
  if (!geojson || typeof geojson.type !== 'string') return undefined;

  const type = geojson.type.toUpperCase();

  switch (type) {
    case 'POINT':
      return Array.isArray(geojson.coordinates)
        ? `POINT(${coordsToString(geojson.coordinates)})` : undefined;

    case 'MULTIPOINT':
      return Array.isArray(geojson.coordinates)
        ? `MULTIPOINT(${geojson.coordinates.map(coordsToString).join(', ')})`
        : undefined;

    case 'LINESTRING':
      return Array.isArray(geojson.coordinates)
        ? `LINESTRING(${geojson.coordinates.map(coordsToString).join(', ')})`
        : undefined;

    case 'MULTILINESTRING':
      return Array.isArray(geojson.coordinates)
        ? `MULTILINESTRING(${geojson.coordinates
          .map((ls) => `(${ls.map(coordsToString).join(', ')})`)
          .join(', ')})`
        : undefined;

    case 'POLYGON':
      return Array.isArray(geojson.coordinates)
        ? `POLYGON(${geojson.coordinates
          .map((ring) => `(${ring.map(coordsToString).join(', ')})`)
          .join(', ')})`
        : undefined;

    case 'MULTIPOLYGON':
      return Array.isArray(geojson.coordinates)
        ? `MULTIPOLYGON(${geojson.coordinates
          .map(
            (poly) =>
              `(${poly
                .map((ring) => `(${ring.map(coordsToString).join(', ')})`)
                .join(', ')})`,
          )
          .join(', ')})`
        : undefined;

    case 'GEOMETRYCOLLECTION':
      return Array.isArray(geojson.geometries)
        ? `GEOMETRYCOLLECTION(${geojson.geometries
          .map(geojsonToWKT)
          .filter(Boolean)
          .join(', ')})`
        : undefined;

    default:
      return undefined;
  }
}
/* eslint-enable complexity */

/**
 * Very naive WKT → GeoJSON converter (covers POINT/LINESRING/POLYGON only).
 * Handy in fieldviews that need to show a map preview.
 *
 * @param {string} wkt
 * @returns {Record<string, unknown>|undefined}
 */
function wktToGeoJSON(wkt) {
  if (typeof wkt !== 'string') return undefined;

  const match = wkt.trim()
    .match(/^(SRID=\d+;)?\s*([A-Z]+)\s*\((.*)\)$/i);
  if (!match) return undefined;

  const [, , typeRaw, body] = match;
  const type = typeRaw.toUpperCase();

  // Helpers
  /* eslint-disable max-statements-per-line */
  const coordsParser = (s) => s.trim().split(/\s+/).map(Number);
  const stripParens = (s) => s.replace(/^\(+|\)+$/g, '');
  /* eslint-enable max-statements-per-line */

  try {
    switch (type) {
      case 'POINT':
        return { type: 'Point', coordinates: coordsParser(body) };

      case 'LINESTRING':
        return {
          type: 'LineString',
          coordinates: body.split(',').map(coordsParser),
        };

      case 'POLYGON':
        return {
          type: 'Polygon',
          coordinates: body
            .split('),')
            .map(stripParens)
            .map((ring) => ring.split(',').map(coordsParser)),
        };

      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* 3.  Type‑definition table                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} SpatialTypeDef
 * @property {string} name
 * @property {'GEOMETRY'|'GEOGRAPHY'} base
 * @property {string} subtype
 * @property {boolean} allowSubtype
 * @property {boolean} allowDim
 * @property {boolean} allowSrid
 */

/** @type {Array<SpatialTypeDef>} */
const TYPE_DEFS = [
  // Generic
  { name: 'geometry', base: 'GEOMETRY', subtype: '', allowSubtype: true, allowDim: true, allowSrid: true },
  { name: 'geography', base: 'GEOGRAPHY', subtype: '', allowSubtype: true, allowDim: true, allowSrid: true },

  // Common concrete
  { name: 'point', base: 'GEOMETRY', subtype: 'POINT', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'linestring', base: 'GEOMETRY', subtype: 'LINESTRING', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'polygon', base: 'GEOMETRY', subtype: 'POLYGON', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'multipoint', base: 'GEOMETRY', subtype: 'MULTIPOINT', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'multilinestring', base: 'GEOMETRY', subtype: 'MULTILINESTRING', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'multipolygon', base: 'GEOMETRY', subtype: 'MULTIPOLYGON', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'geometrycollection', base: 'GEOMETRY', subtype: 'GEOMETRYCOLLECTION', allowSubtype: false, allowDim: true, allowSrid: true },

  // Specialist
  { name: 'circularstring', base: 'GEOMETRY', subtype: 'CIRCULARSTRING', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'compoundcurve', base: 'GEOMETRY', subtype: 'COMPOUNDCURVE', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'curvepolygon', base: 'GEOMETRY', subtype: 'CURVEPOLYGON', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'multicurve', base: 'GEOMETRY', subtype: 'MULTICURVE', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'multisurface', base: 'GEOMETRY', subtype: 'MULTISURFACE', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'polyhedralsurface', base: 'GEOMETRY', subtype: 'POLYHEDRALSURFACE', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'tin', base: 'GEOMETRY', subtype: 'TIN', allowSubtype: false, allowDim: true, allowSrid: true },
  { name: 'triangle', base: 'GEOMETRY', subtype: 'TRIANGLE', allowSubtype: false, allowDim: true, allowSrid: true },
];

/* -------------------------------------------------------------------------- */
/* 4.  Field views (show / edit)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Simple read‑only code block field‑view.
 *
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function makeShowView() {
  return {
    isEdit: false,
    run: (value) =>
      value === undefined || value === null || value === ''
        ? ''
        : `<code>${text(value)}</code>`,
  };
}

/**
 * Basic text input field‑view.
 *
 * @param {string} nameSuffix
 * @param {string} placeholder
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function makeEditView(nameSuffix, placeholder) {
  return {
    isEdit: true,
    run: (nm, v, _attrs, cls) =>
      `<input type="text" class="form-control ${cls || ''}" ` +
      `name="${nm}" id="input${nameSuffix}${nm}" ` +
      `${v ? `value="${text(v)}"` : ''} placeholder="${text(placeholder)}">`,
  };
}

/* -------------------------------------------------------------------------- */
/* 5.  Attribute spec builder                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build a Saltcorn attribute spec array for a given type definition.
 *
 * @param {SpatialTypeDef} def
 * @returns {import('@saltcorn/types/base_plugin').TypeAttribute[]}
 */
function buildAttrSpec(def) {
  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attrs = [];

  if (def.allowSrid) {
    attrs.push({
      name: 'srid',
      label: 'SRID',
      type: 'Integer',
      required: false,
      default: DEFAULT_SRID,
      description:
        'Spatial Reference System Identifier - commonly 4326 (WGS‑84).',
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
      description: 'Dimensionality flag: Z, M, or ZM.',
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
      description: 'Restrict to a concrete geometry subtype.',
    });
  }

  return attrs;
}

/* -------------------------------------------------------------------------- */
/* 6.  Spatial Type factory                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Create a Saltcorn `Type` from an internal descriptor.
 *
 * @param {SpatialTypeDef} def
 * @returns {import('@saltcorn/types/base_plugin').Type}
 */
function makeSpatialType(def) {
  const { name, base, subtype } = def;

  // Callable + string‑like property required by older Saltcorn builds
  const sqlName = createSqlName(base, subtype);

  const prettyLabel =
    (subtype || base)[0].toUpperCase() +
    (subtype || base).slice(1).toLowerCase();

  return {
    name,
    sql_name: sqlName,
    description: `PostGIS ${prettyLabel} - accepts WKT, EWKT, simple GeoJSON.`,
    attributes: buildAttrSpec(def),
    validate_attributes: validateTypeAttrs,
    presets: {},

    fieldviews: {
      show: makeShowView(),
      edit: makeEditView(name, `e.g. ${(subtype || 'POINT')}(30 10)`),
    },

    /**
     * Normalise input to WKT (string) or return `undefined`.
     *
     * @param {unknown} v
     * @param {import('./types').PostGISTypeAttributes=} fieldAttrs
     * @returns {string|undefined}
     */
    read(v, fieldAttrs = {}) {
      if (v === undefined || v === null || v === '') return undefined;

      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return undefined;

        const targetSub =
          def.allowSubtype && fieldAttrs.subtype
            ? String(fieldAttrs.subtype).toUpperCase()
            : (subtype || '').toUpperCase();

        const dim = fieldAttrs.dim || '';

        return validateWkt(s, targetSub, dim) ? s : undefined;
      }

      if (typeof v === 'object') {
        if (typeof v.wkt === 'string') return v.wkt;
        if (typeof v.toWKT === 'function') return v.toWKT();
        return geojsonToWKT(/** @type {any} */(v));
      }

      return undefined;
    },

    /**
     * Per‑value runtime validator.
     *
     * @param {import('./types').PostGISTypeAttributes=} attrs
     * @returns {(value: unknown) => true|string}
     */
    validate(attrs) {
      return (value) => {
        if (value === undefined || value === null || value === '') {
          return true;
        }
        if (typeof value !== 'string') return 'Value must be a WKT string';

        const s = value.trim();
        if (!s) return true;

        const constraint =
          def.allowSubtype && attrs?.subtype
            ? String(attrs.subtype).toUpperCase()
            : (subtype || '').toUpperCase();

        const dim = attrs?.dim || '';

        return validateWkt(s, constraint, dim)
          ? true
          : `Must be WKT of ${constraint}${dim}`;
      };
    },

    /* Pass‑through when reading from DB. */
    readFromDB: (v) => (typeof v === 'string' ? v : undefined),

    /* Bonus helper made available to consuming code (not required by core): */
    extra: { geojsonToWKT, wktToGeoJSON },
  };
}

/* -------------------------------------------------------------------------- */
/* 7.  Plug‑in registration                                                   */
/* -------------------------------------------------------------------------- */

const types = TYPE_DEFS.map(makeSpatialType);

/** @type {import('@saltcorn/types/base_plugin').PluginMeta} */
module.exports = {
  sc_plugin_api_version: 1,
  types,
};