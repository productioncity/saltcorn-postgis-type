/**
 * show-view.js
 * ---------------------------------------------------------------------------
 * Saltcorn “show” field‑view for PostGIS geometries/geographies.
 *
 * • Renders the value as EWKT/WKT inside a <code> block (always HTML‑safe).
 * • If Saltcorn has handed us raw HEXEWKB (the default pg output), we fall
 *   back to a terse “HEXEWKB(…)” placeholder so the user can at least see
 *   something intelligible instead of a huge hex blob.
 * • Because WKT/EWKT already includes Z/M/ZM ordinates, those values will be
 *   displayed automatically – Leaflet itself does nothing with them, but the
 *   human reading the record can.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/**
 * @param {unknown} maybeHex
 * @returns {boolean}
 */
function looksLikeHexEwkb(maybeHex) {
  return (
    typeof maybeHex === 'string' &&
    /^[0-9A-Fa-f]*$/.test(maybeHex.trim()) &&
    maybeHex.length % 2 === 0
  );
}

/**
 * Produces the field‑view object consumed by Saltcorn.
 *
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletShow() {
  return {
    name: 'leaflet-show',
    isEdit: false,
    /**
     * @param {string|undefined|null} value
     * @returns {string} – HTML (already escaped where needed)
     */
    run(value) {
      if (value === null || value === undefined) return '';
      const val = String(value).trim();

      let display;
      if (looksLikeHexEwkb(val)) {
        // Trim the blob so list‑views remain readable.
        display = `HEXEWKB(${val.slice(0, 16)}…${val.slice(-16)})`;
      } else {
        display = val.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      return `<code class="sc-postgis-show text-wrap">${display}</code>`;
    },
  };
}

module.exports = { leafletShow };