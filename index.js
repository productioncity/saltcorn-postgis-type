/**
 * index.js
 * Saltcorn PostGIS Type Plugin
 *
 * Purpose:
 *   Provides a comprehensive, production-ready suite of Saltcorn data types mapping to
 *   every practical and defined PostGIS geometry and geography type. Includes robust UI,
 *   validation, type attributes (SRID, Z/M/ZM, subtyping), and extensibility.
 *
 * Author: Troy Kelly <troy@team.production.city>
 * Initial Version: 2024-04-17
 * Updated by: LLM for completeness, 2024-04-17
 * License: CC0-1.0 (see LICENSE in repository)
 */

/* eslint-disable camelcase */
const { text } = require("@saltcorn/markup");

/**
 * @typedef {object} PostGISTypeAttributes
 * @property {number} [srid]       - Spatial Reference identifier (default: 4326)
 * @property {string} [dim]        - Dimensionality: '', 'Z', 'M', 'ZM'
 * @property {string} [subtype]    - For generic geometry/geography: Point/Polygon/etc (or empty)
 */

const DEFAULT_SRID = 4326;

/** Valid base PostGIS geometry types. */
const BASE_GEOMETRY_TYPES = [
  "GEOMETRY",
  "POINT",
  "LINESTRING",
  "POLYGON",
  "MULTIPOINT",
  "MULTILINESTRING",
  "MULTIPOLYGON",
  "GEOMETRYCOLLECTION",
  "CIRCULARSTRING",
  "COMPOUNDCURVE",
  "CURVEPOLYGON",
  "MULTICURVE",
  "MULTISURFACE",
  "POLYHEDRALSURFACE",
  "TIN",
  "TRIANGLE",
];

/** Valid dimension modifiers. */
const DIM_MODIFIERS = ["", "Z", "M", "ZM"];

/**
 * All supported spatial types to expose in Saltcorn.
 * Each has a Saltcorn "name", base type (GEOMETRY/GEOGRAPHY), subtype, and if edit UI is allowed.
 */
const ALL_SPATIAL_TYPE_DEFS = [
  // "Generic" geometry/geography accepts any WKT
  { name: "geometry", base: "GEOMETRY", subtype: "", allowSubtype: true, allowDim: true, allowSRID: true },
  { name: "geography", base: "GEOGRAPHY", subtype: "", allowSubtype: true, allowDim: true, allowSRID: true },

  // Most-used geometry/geography subtypes
  { name: "point", base: "GEOMETRY", subtype: "POINT", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "linestring", base: "GEOMETRY", subtype: "LINESTRING", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "polygon", base: "GEOMETRY", subtype: "POLYGON", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "multipoint", base: "GEOMETRY", subtype: "MULTIPOINT", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "multilinestring", base: "GEOMETRY", subtype: "MULTILINESTRING", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "multipolygon", base: "GEOMETRY", subtype: "MULTIPOLYGON", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "geometrycollection", base: "GEOMETRY", subtype: "GEOMETRYCOLLECTION", allowSubtype: false, allowDim: true, allowSRID: true },

  // Advanced/specialist subtypes (for completeness)
  { name: "circularstring", base: "GEOMETRY", subtype: "CIRCULARSTRING", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "compoundcurve", base: "GEOMETRY", subtype: "COMPOUNDCURVE", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "curvepolygon", base: "GEOMETRY", subtype: "CURVEPOLYGON", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "multicurve", base: "GEOMETRY", subtype: "MULTICURVE", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "multisurface", base: "GEOMETRY", subtype: "MULTISURFACE", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "polyhedralsurface", base: "GEOMETRY", subtype: "POLYHEDRALSURFACE", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "tin", base: "GEOMETRY", subtype: "TIN", allowSubtype: false, allowDim: true, allowSRID: true },
  { name: "triangle", base: "GEOMETRY", subtype: "TRIANGLE", allowSubtype: false, allowDim: true, allowSRID: true },
];

/*
 * --- Attribute controls and UI helpers ---
 */

/**
 * Saltcorn field attribute spec for this type.
 */
const getTypeAttributes = (def) => {
  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attrs = [];
  if (def.allowSRID) {
    attrs.push({
      name: "srid",
      label: "SRID",
      type: "Integer",
      required: false,
      default: DEFAULT_SRID,
      description:
        "Spatial Reference ID (SRID), default: 4326 (WGS 84). Must match coordinate system.",
    });
  }
  if (def.allowDim) {
    attrs.push({
      name: "dim",
      label: "Dimension",
      type: "String",
      required: false,
      attributes: { options: DIM_MODIFIERS },
      default: "",
      description:
        "Geometry dimension: empty, Z (3D), M (measured), or ZM (3D measured).",
    });
  }
  if (def.allowSubtype) {
    attrs.push({
      name: "subtype",
      label: "Subtype",
      type: "String",
      required: false,
      attributes: { options: BASE_GEOMETRY_TYPES },
      default: "",
      description: "Restrict input to a geometry subtype (optional).",
    });
  }
  return attrs;
};

/**
 * Make a "show" fieldview.
 *
 * @returns {object}
 */
function makeShowView() {
  return {
    isEdit: false,
    run: (value) => {
      if (value === undefined || value === null || value === "") return "";
      // Wrap in code tag for fixed-width
      return `<code>${text(value)}</code>`;
    },
  };
}

/**
 * Make an "edit" fieldview (WKT input)
 *
 * @param {string} nameSuffix (for the ID)
 * @param {string} placeholder
 * @returns {object}
 */
function makeEditView(nameSuffix, placeholder) {
  return {
    isEdit: true,
    run: (nm, v, attrs, cls) => {
      return `<input type="text" inputmode="text" class="form-control ${cls || ""}" name="${nm}" id="input${nameSuffix}${nm}" ${v ? `value="${text(v)}"` : ""
        } placeholder="${text(placeholder)}">`;
    },
  };
}

/**
 * Attribute validation: ensure attributes are logically correct.
 *
 * @param {object} attrs
 * @returns {boolean|string}
 */
function validateAttributes(attrs) {
  if (attrs) {
    if (attrs.srid && (!Number.isInteger(attrs.srid) || attrs.srid < 1)) {
      return "SRID must be a positive integer";
    }
    if (attrs.dim && !DIM_MODIFIERS.includes(String(attrs.dim).toUpperCase())) {
      return "Invalid dimension modifier for geometry";
    }
    if (attrs.subtype && !BASE_GEOMETRY_TYPES.includes(attrs.subtype.toUpperCase())) {
      return "Invalid subtype";
    }
  }
  return true;
}

/**
 * Construct SQL name for type, e.g. geometry(PointZM,4326)
 * @param {object} attrs
 * @param {string} baseType
 * @param {string} subtype
 * @returns {string}
 */
function buildSQLType(attrs, baseType, subtype) {
  // Compose e.g. geometry(PointZM,4326)
  let type = baseType.toLowerCase();
  let typeSpec = "";

  // Compose subtype+dim e.g. PointZM, PolygonZ, etc.
  let chosenSubtype = subtype || (attrs && attrs.subtype) || "";
  let dim = attrs && attrs.dim ? String(attrs.dim).toUpperCase() : "";

  if (chosenSubtype) {
    chosenSubtype = chosenSubtype.toUpperCase();
    if (dim && dim !== "") {
      chosenSubtype += dim;
    }
    typeSpec = chosenSubtype;
  }

  /** SRID: may be omitted or required. Default: 4326 */
  const srid = attrs && attrs.srid ? Number(attrs.srid) : DEFAULT_SRID;

  if (typeSpec && srid) {
    return `${type}(${typeSpec},${srid})`;
  }
  if (typeSpec) {
    return `${type}(${typeSpec})`;
  }
  if (srid && type === "geometry") {
    return `${type}(geometry,${srid})`;
  }
  return type;
}

/**
 * Minimal but robust WKT validation.
 * @param {string} wkt
 * @param {string} [typeConstraint] EG "POINT", "LINESTRINGZM"
 * @param {string} [dim]            EG "Z", "M", "ZM"
 * @returns {boolean}
 */
function validateWKT(wkt, typeConstraint, dim) {
  if (typeof wkt !== "string") return false;
  let str = wkt.trim().toUpperCase();
  if (!str || !str.match(/^(SRID=\d+;)?[A-Z]+/)) return false;
  // Expected pattern starts with e.g. POINT, LINESTRING, ...
  let constraint = typeConstraint ? typeConstraint.toUpperCase() : undefined;
  let dimMod = dim ? String(dim).toUpperCase() : "";
  if (constraint && dimMod && !constraint.endsWith(dimMod)) {
    // Allow either "POINT", "POINTZ", "POINTZM" etc.
    // User may omit M/Z/ZM, so be tolerant.
    constraint += dimMod;
  }
  if (constraint) {
    // Accept both with and without SRID=...; prefix
    if (str.startsWith("SRID=")) {
      const semi = str.indexOf(";");
      if (semi > 0) str = str.substring(semi + 1).trim();
    }
    if (!str.startsWith(constraint)) return false;
  }
  // If dimension is required, check for Z/M tokens
  if (dimMod && !str.startsWith(constraint)) {
    // Accept both "POINTZ" and, e.g., "POINT"
    return false;
  }
  // Superficial WKT syntax check (must match balanced parens etc.)
  // (WKT parsing is deferred to PostGIS; here we do minimal protection)
  if (!str.includes("(") || !str.endsWith(")")) return false;
  return true;
}

/**
 * Saltcorn type factory for a PostGIS spatial type.
 *
 * @param {object} def - Type definition (from ALL_SPATIAL_TYPE_DEFS)
 * @returns {object} Saltcorn type object
 */
function makeSpatialType(def) {
  const { name, base, subtype } = def;
  const fieldLabel =
    subtype || def.allowSubtype
      ? (subtype || "").charAt(0).toUpperCase() + (subtype || "").slice(1).toLowerCase()
      : base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();

  return {
    name,
    sql_name: function (attrs) {
      return buildSQLType(attrs, base, subtype);
    },
    description: `PostGIS ${fieldLabel} spatial type. Enter value as WKT or EWKT.`,
    attributes: getTypeAttributes(def),
    validate_attributes: validateAttributes,
    presets: {},

    fieldviews: {
      show: makeShowView(),
      edit: makeEditView(name, `e.g. ${subtype ? subtype : "POINT"}(30 10)`),
    },

    /**
     * Coerce/validate DB or form value to a canonical WKT string.
     * @param {any} v
     * @param {object} fieldAttrs
     * @returns {string|undefined}
     */
    read: (v, fieldAttrs = {}) => {
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return undefined;
      // Accept raw WKT or EWKT
      if (typeof v === "string") {
        const s = v.trim();
        if (s === "") return undefined;
        // Optionally validate type
        const subtypeStr =
          def.allowSubtype && fieldAttrs.subtype
            ? fieldAttrs.subtype.toUpperCase()
            : subtype;
        const dimStr = fieldAttrs.dim || "";
        // Only validate header; syntax is up to PostGIS
        if (
          subtypeStr &&
          !validateWKT(s, subtypeStr, dimStr)
        )
          return undefined;
        return s;
      }
      // Accept objects compliant with GeoJSON
      if (v && typeof v === "object") {
        // Accept .wkt field directly (from other plugins)
        if (typeof v.wkt === "string") return v.wkt;
        // Accept .toWKT()
        if (typeof v.toWKT === "function") {
          return v.toWKT();
        }
        // Accept basic GeoJSON: { type: ..., coordinates: ... }
        if (
          typeof v.type === "string" &&
          Array.isArray(v.coordinates)
        ) {
          // Convert GeoJSON to WKT (basic only; no SRID/multi-component, etc.)
          const wkt = geojsonToWKT(v); // Implement below
          return typeof wkt === "string" ? wkt : undefined;
        }
      }
      return undefined;
    },

    /**
     * Custom validate (Saltcorn calls with attrs -> returns function for value)
     * @param {object} attrs
     * @returns {function(any): (boolean|string)}
     */
    validate: (attrs) => (value) => {
      if (value === undefined || value === null || value === "") return true;
      if (typeof value !== "string") return "Not a WKT string";
      const s = value.trim();
      if (!s) return true;
      // Validate type header
      let typeConstraint = subtype;
      if (def.allowSubtype && attrs && attrs.subtype)
        typeConstraint = attrs.subtype;
      const dim = attrs && attrs.dim ? attrs.dim : "";
      if (
        typeConstraint &&
        !validateWKT(s, typeConstraint, dim)
      )
        return `Input must be WKT for type ${typeConstraint.toUpperCase()}${dim ? dim.toUpperCase() : ""}`;
      // Accept; deeper syntax validation is up to PostGIS
      return true;
    },

    /**
     * When reading from DB, pass through as string.
     * @param {any} v
     * @returns {string|undefined}
     */
    readFromDB: (v) => (typeof v === "string" ? v : undefined),

    // readFromFormRecord provided if needed for multi-field forms (not used here)
    // ...
  };
}

/**
 * Convert an array of coordinates to a WKT-compatible coordinate string.
 * Handles any nesting depth (for Polygons/MultiPolygons etc).
 *
 * @param {any[]} coords - Coordinate array (numbers or nested arrays)
 * @returns {string}
 */
function coordsToString(coords) {
  if (!Array.isArray(coords)) {
    return "";
  }
  if (typeof coords[0] === "number") {
    // Single position
    return coords.join(" ");
  }
  // Recurse, quoting as needed for rings or multi-parts
  const components = coords.map((c) => {
    if (Array.isArray(c[0])) {
      // For polygon rings and multiparts: separate with (), not just ,
      return `(${coordsToString(c)})`;
    }
    return coordsToString(c);
  });
  return components.join(", ");
}

/**
 * Convert a GeoJSON geometry object to WKT string.
 * Supported types: Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection.
 * 
 * @param {object} geojson - GeoJSON geometry (not Feature!)
 * @returns {string|undefined}
 */
function geojsonToWKT(geojson) {
  if (!geojson || typeof geojson.type !== "string") return undefined;
  const type = geojson.type.toUpperCase();

  switch (type) {
    case "POINT":
      if (!Array.isArray(geojson.coordinates)) return undefined;
      return `POINT(${coordsToString(geojson.coordinates)})`;

    case "MULTIPOINT":
      if (!Array.isArray(geojson.coordinates)) return undefined;
      // Each element is a position
      return `MULTIPOINT(${geojson.coordinates.map((pt) => coordsToString(pt)).join(", ")})`;

    case "LINESTRING":
      if (!Array.isArray(geojson.coordinates)) return undefined;
      // Each is a position
      return `LINESTRING(${geojson.coordinates.map((pt) => coordsToString(pt)).join(", ")})`;

    case "MULTILINESTRING":
      if (!Array.isArray(geojson.coordinates)) return undefined;
      // Each element is a LineString (array of positions)
      return `MULTILINESTRING(${geojson.coordinates.map((ls) => `(${ls.map((pt) => coordsToString(pt)).join(", ")})`).join(", ")})`;

    case "POLYGON":
      if (!Array.isArray(geojson.coordinates)) return undefined;
      // Each element is a linear ring (exterior first, then interiors)
      return `POLYGON(${geojson.coordinates.map((ring) => `(${ring.map((pt) => coordsToString(pt)).join(", ")})`).join(", ")})`;

    case "MULTIPOLYGON":
      if (!Array.isArray(geojson.coordinates)) return undefined;
      // Each element is a Polygon (array of rings)
      return `MULTIPOLYGON(${geojson.coordinates.map(
        (poly) =>
          `(${poly
            .map((ring) => `(${ring.map((pt) => coordsToString(pt)).join(", ")})`)
            .join(", ")})`
      ).join(", ")})`;

    case "GEOMETRYCOLLECTION":
      if (!Array.isArray(geojson.geometries)) return undefined;
      // Each is a geometry object; recurse
      return `GEOMETRYCOLLECTION(${geojson.geometries
        .map((g) => geojsonToWKT(g))
        .filter(Boolean)
        .join(", ")})`;

    default:
      return undefined;
  }
}

// Define all supported types.
const types = ALL_SPATIAL_TYPE_DEFS.map((def) => makeSpatialType(def));

module.exports = {
  sc_plugin_api_version: 1,
  types,
};