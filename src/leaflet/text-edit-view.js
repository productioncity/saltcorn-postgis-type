/**
 * text-edit-view.js
 * ---------------------------------------------------------------------------
 * “Raw WKT” edit field‑view – a plain <textarea> that lets users specify any
 * geometry (including Z/M/ZM dimensions) without the assistance of Leaflet.
 *
 * This is provided as a back‑up editor when the visual map interface is
 * insufficient or power‑users want full control.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/**
 * Factory returning the Saltcorn field‑view definition.
 *
 * @returns {import('@saltcorn/types').FieldView}
 */
function textEditView() {
  return {
    isEdit: true,
    /**
     * Renders a <textarea>.
     *
     * @param {string} name       – Field name (form input name).
     * @param {string|undefined} v – Current value.
     * @returns {string}
     */
    run(name, v) {
      const safe = typeof v === 'string' ? v : '';
      return `
<textarea class="form-control" rows="3"
          name="${name}" id="fld-${name}">${safe}</textarea>`;
    },
  };
}

module.exports = { textEditView };