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

/**
 * Build the multifunction `sql_name`.
 *
 * @param {'GEOMETRY'|'GEOGRAPHY'} base          Base PostGIS type.
 * @param {string}                 defaultSubtype Default geometry subtype.
 * @returns {(attrs?: import('../types').PostGISTypeAttrs) => string}
 *   Callable object that **also** quacks like a normal string.
 */
function sqlNameFactory(base, defaultSubtype) {
  /* ------------------------------------------------------------------ */
  /* 1. Internal helper that produces the concrete SQL type string.     */
  /* ------------------------------------------------------------------ */
  /**
   * @param {import('../types').PostGISTypeAttrs=} attrs
   * @returns {string}
   */
  function buildSql(attrs = {}) {
    // Lazy‑load to avoid a require‑cycle.
    const { DEFAULT_SRID } = require('../constants');

    const srid = attrs.srid ?? DEFAULT_SRID;
    const dim  = attrs.dim ? String(attrs.dim).toUpperCase() : '';
    const sub  = ((attrs.subtype ?? defaultSubtype) + dim).toUpperCase();

    const baseLower = base.toLowerCase();
    if (sub) return `${baseLower}(${sub},${srid})`;
    if (srid !== undefined && srid !== null) {
      return `${baseLower}(Geometry,${srid})`;
    }
    return baseLower;
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
    // NOTE: `this` context is irrelevant; simply delegate.
    return buildSql(attrs);
  };

  /* eslint-disable sonarjs/cognitive-complexity */
  const proxy = new Proxy(fnTarget, {
    // Allow direct invocation:  sql_name(attrs)
    apply(_target, _thisArg, argArray) {
      return buildSql(...argArray);
    },

    // Everything else – behave like a real string.
    get(_target, prop) {
      // 3.1 Primitive coercion (e.g. `${sql_name}`)
      if (prop === Symbol.toPrimitive) {
        return () => canonical;
      }

      // 3.2 length – must be correct string length, not arity (1).
      if (prop === 'length') return canonical.length;

      // 3.3 Character index access        sql_name[0] ➜ 'g'
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        const idx = Number(prop);
        return canonical[idx];
      }

      // 3.4 All standard String prototype methods (includes, indexOf, …)
      if (prop in String.prototype) {
        // Bind the method to the canonical string value.
        // @ts-ignore  – run‑time safe, we have just checked prop exists.
        return String.prototype[prop].bind(canonical);
      }

      // 3.5 Fallbacks: toString, valueOf, etc.
      switch (prop) {
        case 'toString':
        case 'valueOf':
          return () => canonical;

        default:
          // Any uncommon property – defer to canonical string value.
          // This provides correct behaviour for e.g. `sql_name.constructor`.
          // @ts-ignore
          return canonical[prop];
      }
    },

    // Ensure `prop in sql_name` works correctly for indexes, 'length', etc.
    has(_target, prop) {
      if (prop === 'length') return true;
      if (prop in String.prototype) return true;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        return Number(prop) < canonical.length;
      }
      return false;
    },

    // Prevent accidental mutation – keep behaviour read‑only.
    set() {
      return false;
    },
  });
  /* eslint-enable sonarjs/cognitive-complexity */

  return proxy;
}

module.exports = { sqlNameFactory };