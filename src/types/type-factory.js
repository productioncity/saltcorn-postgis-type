/**
 * type-factory.js
 * ---------------------------------------------------------------------------
 * Produces full Saltcorn `Type` objects for every supported PostGIS subtype.
 *
 * CHANGE‑LOG  (2025‑04‑19):
 *   • Added three new field‑views:
 *       – map  (interactive Leaflet editor)
 *       – raw  (context‑sensitive raw/WKT view)
 *       – show (read‑only Leaflet viewer)
 *   • Previous `leafletEditView`, `leafletShow`, `textEditView` remain
 *     untouched internally but are superseded by the new views.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_SRID, DIM_MODS, BASE_GEOM_TYPES } = require('../constants');
const { sqlNameFactory }  = require('../utils/sql-name');
const { validateAttrs }   = require('../utils/geometry');

const { mapEditView } = require('../leaflet/map-edit-view');
const { showView }    = require('../leaflet/show-view');
const { rawView }     = require('../leaflet/raw-view');

/**
 * Build a Saltcorn Type.
 *
 * @param {object} cfg
 * @param {string}  cfg.name              – Internal type name (lower‑case).
 * @param {'GEOMETRY'|'GEOGRAPHY'} cfg.base – Base PostGIS type.
 * @param {string}  cfg.subtype           – Default geometry subtype.
 * @param {boolean} cfg.allowDim          – Expose `dim` attribute?
 * @param {boolean} cfg.allowSubtype      – Expose `subtype` attribute?
 * @returns {import('@saltcorn/types').Type}
 */
function makeType(cfg) {
  const { name, base, subtype, allowDim, allowSubtype } = cfg;

  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attributes = [
    {
      name:    'srid',
      label:   'SRID',
      type:    'Integer',
      default: DEFAULT_SRID,
    },
  ];

  if (allowDim) {
    attributes.push({
      name: 'dim',
      label: 'Dim',
      type: 'String',
      attributes: { options: DIM_MODS },
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

  return Object.freeze({
    name,
    sql_name: sqlNameFactory(base, subtype), // callable + string‑duck‑typed
    description: `PostGIS ${subtype || base} value`,
    attributes,
    validate_attributes: validateAttrs,
    fieldviews: {
      map:  mapEditView(name), // interactive edit
      raw:  rawView(),         // unified raw (show+edit)
      show: showView(),        // read‑only Leaflet
    },
    read: (v) => (typeof v === 'string' ? v : undefined),
    readFromDB: (v) => (typeof v === 'string' ? `${v}::text` : undefined),
  });
}

module.exports = { makeType };