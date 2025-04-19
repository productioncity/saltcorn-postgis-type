/**
 * sql-name.js
 * Utility for manufacturing the SQL‑type generator **and** providing the
 * plain‑string `sql_name` Saltcorn needs at runtime.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/**
 * Build both:
 *   • a callable generator (`sql_name_fn`) returning the full
 *     `geometry(Point,4326)` string for a given attribute set, and
 *   • the canonical lower‑case base string (`sql_name`) Saltcorn
 *     requires for catalogue look‑ups (must be a real string, **not**
 *     a function).
 *
 * @param {'GEOMETRY'|'GEOGRAPHY'} base
 * @param {string}                 defaultSubtype
 * @returns {{ sql_name: string,
 *             sql_name_fn:
 *               (attrs?: import('../types').PostGISTypeAttrs) => string }}
 */
function buildSqlName(base, defaultSubtype) {
  const canonical = base.toLowerCase();

  /**
   * Callable helper – returns the full qualified SQL type string.
   *
   * @param {import('../types').PostGISTypeAttrs=} attrs
   * @returns {string}
   */
  function sqlNameFn(attrs = {}) {
    // Lazy import to avoid a circular‑dependency on constants.
    const { DEFAULT_SRID } = require('../constants');

    const srid = attrs.srid ?? DEFAULT_SRID;
    const dim  = attrs.dim ? String(attrs.dim).toUpperCase() : '';
    const sub  = ((attrs.subtype ?? defaultSubtype) + dim).toUpperCase();

    if (sub) return `${canonical}(${sub},${srid})`;
    if (srid !== undefined && srid !== null) {
      return `${canonical}(Geometry,${srid})`;
    }
    return canonical;
  }

  return { sql_name: canonical, sql_name_fn: sqlNameFn };
}

module.exports = { buildSqlName };