/**
 * sql-name.js
 * Utility for manufacturing the `sql_name` property that Saltcorn expects on
 * a custom Type. The result is both *callable* and *string‑duck‑typed*, so
 * `toLowerCase()` et al. work transparently.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Moved into utils module.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

/* eslint-disable jsdoc/require-jsdoc */

/**
 * Build a `sql_name` generator that also quacks like a string.
 *
 * @param {'GEOMETRY'|'GEOGRAPHY'} base  The base PostGIS type.
 * @param {string}                 subtype Default subtype when none supplied
 * @returns {(attrs?: import('../types').PostGISTypeAttrs) => string} Callable
 *          returning the SQL type string.
 */
function sqlNameFactory(base, subtype) {
  /**
   * @param {import('../types').PostGISTypeAttrs=} attrs
   * @returns {string}
   */
  function sqlName(attrs = {}) {
    const { DEFAULT_SRID } = require('../constants'); // lazy to avoid cycle
    const srid = attrs.srid ?? DEFAULT_SRID;
    const dim = attrs.dim ? String(attrs.dim).toUpperCase() : '';
    const sub = ((attrs.subtype ?? subtype) + dim).toUpperCase();

    const baseLower = base.toLowerCase();
    if (sub) return `${baseLower}(${sub},${srid})`;
    if (srid !== undefined && srid !== null) {
      return `${baseLower}(Geometry,${srid})`;
    }
    return baseLower;
  }

  const canonical = base.toLowerCase();
  Object.defineProperties(sqlName, {
    toLowerCase:      { value: () => canonical },
    toUpperCase:      { value: () => canonical.toUpperCase() },
    toString:         { value: () => canonical },
    valueOf:          { value: () => canonical },
    [Symbol.toPrimitive]: { value: () => canonical },
  });

  return sqlName;
}

module.exports = { sqlNameFactory };