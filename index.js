/**
 * index.js
 * Saltcorn PostGIS Type Plugin
 *
 * Purpose:
 *   Provides support for a suite of spatial PostGIS datatypes for the Saltcorn platform.
 *
 * Description:
 *   This plugin defines a set of Saltcorn data types mapping to the main geometry and geography
 *   types used in PostGIS. It includes field views for display and editing using WKT (Well-Known Text)
 *   in HTML input, as well as parsing and validation logic for each supported type.
 *
 * Supported types include:
 *   - geometry
 *   - geography
 *   - point
 *   - linestring
 *   - polygon
 *   - multipoint
 *   - multilinestring
 *   - multipolygon
 *   - geometrycollection
 *
 * Author: Troy Kelly <troy@team.production.city>
 * Initial Author: Troy Kelly
 * Code History: Initial version for Saltcorn PostGIS types, 2024-04-17
 * License: CC0-1.0 (see LICENSE in repository)
 */

const { text } = require("@saltcorn/markup");

/**
 * @typedef {Object} FieldView
 * @property {boolean} isEdit - Whether this view is for editing.
 * @property {Function} run - Render function for the fieldview. Arguments depend on isEdit.
 */

/**
 * Generate a default "show" fieldview for displaying spatial types.
 * @param {function(string): string} [formatter] - Optional WKT formatter override.
 * @returns {FieldView}
 */
function makeShowView(formatter) {
  return {
    isEdit: false,
    /**
     * Display WKT string, or empty for null/undefined.
     * @param {string|undefined|null} v
     * @returns {string}
     */
    run: (v) => (v ? (formatter ? formatter(v) : text(v)) : ""),
  };
}

/**
 * Generate a default "edit" fieldview for WKT spatial types.
 * @param {string} nameSuffix - For HTML element IDs to distinguish per-type.
 * @returns {FieldView}
 */
function makeEditView(nameSuffix) {
  return {
    isEdit: true,
    /**
     * Render input for WKT spatial type.
     * @param {string} nm - Field name.
     * @param {string|undefined|null} v - Current value.
     * @param {Array} attrs - Attributes.
     * @param {string} cls - Extra CSS classes.
     */
    run: (nm, v, attrs, cls) =>
      `<input type="text" inputmode="text" class="form-control ${cls || ""}" name="${nm}" id="input${nameSuffix}${nm}" ${
        v ? `value="${text(v)}"` : ""
      } placeholder="WKT (e.g. POINT(30 10))">`,
  };
}

/**
 * Minimal but robust WKT detection.
 * Note: PostGIS can ingest WKT, so basic client-side validation is enough.
 * @param {string} v
 * @param {string} expectedType - e.g. "POINT", "LINESTRING" (upper-case)
 * @returns {boolean}
 */
function wktTypeMatches(v, expectedType) {
  if (typeof v !== "string") return false;
  // Accept optional SRID prefix
  const wkt = v.toUpperCase().trim();
  if (wkt.startsWith("SRID=")) {
    const idx = wkt.indexOf(";");
    if (idx >= 0) return wkt.slice(idx + 1).startsWith(expectedType);
    return false;
  }
  return wkt.startsWith(expectedType);
}

/**
 * Geometry types and their PostGIS SQL equivalents.
 *
 * Each item defines:
 *   - typeName: Saltcorn type "name"
 *   - sqlType: PostGIS type ("geometry", "geography", specific geometry subtype for stricter schema)
 *   - wktType: WKT string type, for validation (e.g. "POINT", "MULTIPOINT") or null for generic.
 */
const postgisTypes = [
  // Most general
  {
    typeName: "geometry",
    sqlType: "geometry",
    wktType: null,
    description: "Arbitrary geometry (WKT, e.g. POINT(...), LINESTRING(...), ...)",
  },
  {
    typeName: "geography",
    sqlType: "geography",
    wktType: null,
    description: "Arbitrary geography (WKT, e.g. POINT(...), LINESTRING(...), ...)",
  },
  // Specific geometry subtypes for stricter schema
  {
    typeName: "point",
    sqlType: "geometry(POINT,4326)",
    wktType: "POINT",
    description: "Geometry Point (e.g. POINT(30 10))",
  },
  {
    typeName: "linestring",
    sqlType: "geometry(LINESTRING,4326)",
    wktType: "LINESTRING",
    description: "Geometry LineString (e.g. LINESTRING(30 10, 10 30, 40 40))",
  },
  {
    typeName: "polygon",
    sqlType: "geometry(POLYGON,4326)",
    wktType: "POLYGON",
    description: "Geometry Polygon (e.g. POLYGON((30 10, 40 40, 20 40, 10 20, 30 10)))",
  },
  {
    typeName: "multipoint",
    sqlType: "geometry(MULTIPOINT,4326)",
    wktType: "MULTIPOINT",
    description: "Geometry MultiPoint",
  },
  {
    typeName: "multilinestring",
    sqlType: "geometry(MULTILINESTRING,4326)",
    wktType: "MULTILINESTRING",
    description: "Geometry MultiLineString",
  },
  {
    typeName: "multipolygon",
    sqlType: "geometry(MULTIPOLYGON,4326)",
    wktType: "MULTIPOLYGON",
    description: "Geometry MultiPolygon",
  },
  {
    typeName: "geometrycollection",
    sqlType: "geometry(GEOMETRYCOLLECTION,4326)",
    wktType: "GEOMETRYCOLLECTION",
    description: "GeometryCollection",
  },
];

/**
 * Factory to produce Saltcorn type object for a specific PostGIS type.
 * @param {string} typeName - Saltcorn-visible type name
 * @param {string} sqlType - SQL type
 * @param {string|null} wktType - e.g. "POINT", "LINESTRING", ...
 * @param {string} description - Type description
 * @returns {object} Saltcorn type definition
 */
function makePostGISType(typeName, sqlType, wktType, description) {
  return {
    name: typeName,
    sql_name: sqlType,
    description,
    fieldviews: {
      show: makeShowView(),
      edit: makeEditView(typeName),
    },
    /**
     * Parse and validate WKT from various JS input.
     * @param {unknown} v
     * @returns {string|undefined}
     */
    read: (v) => {
      // Allow null/undefined as null
      if (v === undefined || v === null) return undefined;
      if (typeof v === "string") {
        const trimmed = v.trim();
        // Accept empty string as null (for unfilled forms)
        if (trimmed === "") return undefined;
        // Optionally check type
        if (wktType && !wktTypeMatches(trimmed, wktType)) return undefined;
        // No parsing beyond WKT syntax due to PostGIS's own parsing capabilities
        return trimmed;
      }
      // Accept objects with .wkt or .toWKT for cases from mapping plugins
      if (typeof v === "object" && v !== null) {
        if (typeof v.wkt === "string") return wktType && !wktTypeMatches(v.wkt, wktType) ? undefined : v.wkt;
        if (typeof v.toWKT === "function") {
          const wktStr = v.toWKT();
          return wktType && !wktTypeMatches(wktStr, wktType) ? undefined : wktStr;
        }
      }
      return undefined;
    },
    /**
     * Validate function (as per Saltcorn). Checks WKT type header.
     * @param {object} attrs
     * @returns {Function}
     */
    validate: (attrs) =>
      (v) =>
        typeof v === "string"
          ? !wktType || wktTypeMatches(v, wktType)
          : v === undefined || v === null,
    // Could add validate_attributes for advanced attribute validation in future.
    // Could add readFromFormRecord, readFromDB if needed.
    presets: {},
  };
}

const types = postgisTypes.map((t) =>
  makePostGISType(t.typeName, t.sqlType, t.wktType, t.description)
);

module.exports = {
  sc_plugin_api_version: 1,
  types,
};