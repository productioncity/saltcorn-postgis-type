/**
 * text-edit-view.js
 * -----------------------------------------------------------------------------
 * Minimalist raw text editor for any PostGIS value.
 *
 * This view is surfaced as “raw” in the type catalogue and is handy when users
 * explicitly prefer hand‑editing WKT/EWKT/GeoJSON without the Leaflet helper.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { textarea } = require('@saltcorn/markup/tags');

/**
 * @returns {import('@saltcorn/types').FieldViewObj}
 */
function textEditView() {
  /**
   * @param {string} fieldName
   * @param {string|null} value
   * @param {unknown} _attrs   Unused – kept for Saltcorn’s expected signature.
   * @param {string} cls
   * @returns {string}
   */
  const run = (fieldName, value, _attrs, cls) =>
    textarea(
      {
        class: `form-control ${cls || ''}`.trim(),
        style: 'min-height:6rem;font-family:monospace;',
        name:  fieldName,
        id:    `input-${fieldName}`,
        placeholder: 'Enter WKT, EWKT or GeoJSON',
      },
      typeof value === 'string' ? value : '',
    );

  return {
    isEdit:       true,
    description:  'Raw text WKT/EWKT/GeoJSON editor.',
    configFields: [],
    run,
  };
}

module.exports = { textEditView };