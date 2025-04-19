/**
 * type-factory.js
 * ---------------------------------------------------------------------------
 * Produces full Saltcorn `Type` objects for every supported PostGIS subtype.
 *
 * CHANGE‑LOG (2025‑04‑19):
 *   • Added canonical `edit` alias (points to the `"map"` editor) so all
 *     Saltcorn builders find a default edit view.
 *   • Ensured all new field‑views are wired consistently.
 *
 * Author:   Troy Kelly  <troy@team.production.city>
 * Licence:  CC0‑1.0
 */

'use strict';

const { DEFAULT_SRID, DIM_MODS, BASE_GEOM_TYPES } = require('../constants');
const { sqlNameFactory } = require('../utils/sql-name');
const { validateAttrs }  = require('../utils/geometry');

const { mapEditView } = require('../leaflet/map-edit-view');
const { showView }    = require('../leaflet/show-view');
const { rawView }     = require('../leaflet/raw-view');

/**
 * Build a Saltcorn Type object.
 *
 * @param {object} cfg
 * @param {string}  cfg.name
 * @param {'GEOMETRY'|'GEOGRAPHY'} cfg.base
 * @param {string}  cfg.subtype
 * @param {boolean} cfg.allowDim
 * @param {boolean} cfg.allowSubtype
 * @returns {import('@saltcorn/types').Type}
 */
function makeType(cfg) {
  const { name, base, subtype, allowDim, allowSubtype } = cfg;

  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attributes = [
    { name: 'srid',   label: 'SRID',   type: 'Integer', default: DEFAULT_SRID },
  ];

  if (allowDim) {
    attributes.push({
      name: 'dim', label: 'Dim', type: 'String', attributes: { options: DIM_MODS },
    });
  }
  if (allowSubtype) {
    attributes.push({
      name: 'subtype',
      label: 'Subtype',
      type: 'String',
      attributes: { options: BASE_GEOM_TYPES },
    });
  }

  /* Single instance reused for both "edit" alias and explicit "map". */
  const mapView = mapEditView(name);

  return Object.freeze({
    name,
    sql_name: sqlNameFactory(base, subtype),
    description: `PostGIS ${subtype || base} value`,
    attributes,
    validate_attributes: validateAttrs,
    fieldviews: {
      edit: mapView,      // Saltcorn’s default edit view key (alias)
      map:  mapView,      // Explicit interactive Leaflet editor
      raw:  rawView(),    // Dual‑mode raw (edit + show)
      show: showView(),   // Read‑only Leaflet display
    },
    read: (v) => (typeof v === 'string' ? v : undefined),
    readFromDB: (v) => (typeof v === 'string' ? `${v}::text` : undefined),
  });
}

module.exports = { makeType };