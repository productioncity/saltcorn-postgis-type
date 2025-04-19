/**
 * leaflet/show‑view.js
 * ---------------------------------------------------------------------------
 * “Show” field‑view – renders the stored WKT/EWKT/GeoJSON as safe inline text.
 *
 * The admin had reported an empty element being rendered.  The previous
 * implementation swallowed falsy values and returned an empty string for all
 * inputs.  We now:
 *   • Render a <code>…</code> block whenever a value is present.
 *   • Return an empty string only when the database value is genuinely null or
 *     an empty string.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/**
 * Returns a Saltcorn “show” field‑view definition.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletShow() {
  return {
    isEdit: false,

    /**
     * Render callback used by Saltcorn.
     *
     * @param {string|undefined|null} v   The cell value.
     * @returns {string}                  Raw HTML.
     */
    run(v) {
      if (v === null || v === undefined || String(v).trim() === '') return '';

      // Minimal HTML‑escaping (sufficient because Saltcorn encodes containers).
      const escaped = String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `<code class="sc‑pgis‑wkt">${escaped}</code>`;
    },
  };
}

module.exports = { leafletShow };