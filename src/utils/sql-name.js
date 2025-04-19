/**
 * sql-name.js
 * ---------------------------------------------------------------------------
 * Builds the `sql_name` value for a Saltcorn Type.
 *
 * The returned object is a *callable* **function Proxy** that behaves in
 * every possible way like its canonical lower‑case string form ‑ including:
 *   • Character indexing (`sql_name[0]`)  
 *   • `.length` (real string length, not function arity)  
 *   • Every String prototype method (`includes`, `replace`, `substr`, …)  
 *   • Implicit coercion (e.g. template literals, `String(sql_name)`)  
 *
 * This guarantees compatibility with Saltcorn v1 core code paths that
 * sometimes treat `sql_name` as a string and other times call it as a
 * function.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const dbg = require('./debug');

/**
 * Build the multifunction `sql_name`.
 *
 * @param {'GEOMETRY'|'GEOGRAPHY'} base          Base PostGIS type.
 * @param {string}                 defaultSubtype Default geometry subtype.
 * @returns {(attrs?: import('../types').PostGISTypeAttrs) => string}
 *   Callable object that **also** quacks like a normal string.
 */
function sqlNameFactory(base, defaultSubtype) {
  dbg.debug('sqlNameFactory()', { base, defaultSubtype });
  /* ------------------------------------------------------------------ */
  /* 1. Internal helper that produces the concrete SQL type string.     */
  /* ------------------------------------------------------------------ */
  /**
   * @param {import('../types').PostGISTypeAttrs=} attrs
   * @returns {string}
   */
  function buildSql(attrs = {}) {
    const { DEFAULT_SRID } = require('../constants');

    const srid = attrs.srid ?? DEFAULT_SRID;
    const dim  = attrs.dim ? String(attrs.dim).toUpperCase() : '';
    const sub  = ((attrs.subtype ?? defaultSubtype) + dim).toUpperCase();

    const baseLower = base.toLowerCase();
    const result =
      sub ? `${baseLower}(${sub},${srid})` :
      srid !== undefined && srid !== null
        ? `${baseLower}(Geometry,${srid})`
        : baseLower;

    dbg.trace('buildSql()', { attrs, result });
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Canonical string (lower‑case base) used for all stringy ops.     */
  /* ------------------------------------------------------------------ */
  const canonical = base.toLowerCase();

  /* ------------------------------------------------------------------ */
  /* 3. Create a FUNCTION Proxy so the object is simultaneously:         *
   *      • Callable –   sql_name(attrs?)                                *
   *      • String‑like – sql_name[0], sql_name.includes('x'), …         *
   * ------------------------------------------------------------------ */
  const fnTarget = function proxyTarget(attrs) {
    return buildSql(attrs);
  };

  /* eslint-disable sonarjs/cognitive-complexity */
  const proxy = new Proxy(fnTarget, {
    apply(_target, _thisArg, argArray) {
      return buildSql(...argArray);
    },

    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => canonical;
      if (prop === 'length') return canonical.length;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        return canonical[Number(prop)];
      }
      if (prop in String.prototype) {
        // @ts-ignore
        return String.prototype[prop].bind(canonical);
      }
      switch (prop) {
        case 'toString':
        case 'valueOf':
          return () => canonical;
        default:
          // @ts-ignore
          return canonical[prop];
      }
    },

    has(_target, prop) {
      if (prop === 'length') return true;
      if (prop in String.prototype) return true;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        return Number(prop) < canonical.length;
      }
      return false;
    },

    set() {
      return false;
    },
  });
  /* eslint-enable sonarjs/cognitive-complexity */

  return proxy;
}

module.exports = { sqlNameFactory };