/**
 * text-edit-view.js
 * ----------------------------------------------------------------------------
 * Fallback raw WKT editor for situations where Leaflet cannot run.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/**
 * Escapes HTML attribute/body values.
 *
 * @param {unknown} val
 * @returns {string}
 */
function esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * @returns {import('@saltcorn/types').FieldView}
 */
function textEditView() {
  return {
    name: 'raw',
    displayName: 'Raw WKT',
    isEdit: true,
    /**
     * @param {string} field_name
     * @param {string|undefined|null} v
     * @param {object} attrs
     * @param {string} cls
     * @returns {string}
     */
    run(field_name, v, attrs, cls) {
      return `<textarea name="${field_name}" class="${cls}" rows="3">${esc(v)}</textarea>`;
    },
  };
}

module.exports = { textEditView };