/**
 * type-factory.js
 * ---------------------------------------------------------------------------
 * Produces full Saltcorn `Type` objects for every supported PostGIS subtype.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_SRID, DIM_MODS, BASE_GEOM_TYPES } = require('../constants');
const { sqlNameFactory } = require('../utils/sql-name');
const { validateAttrs } = require('../utils/geometry');
const { leafletShow } = require('../leaflet/show-view');
const { leafletEditView } = require('../leaflet/edit-view');

/**
 * Build a Saltcorn Type.
 *
 * @param {object} cfg
 * @param {string} cfg.name              – Internal type name (lower‑case).
 * @param {'GEOMETRY'|'GEOGRAPHY'} cfg.base – Base PostGIS type.
 * @param {string} cfg.subtype           – Default geometry subtype.
 * @param {boolean} cfg.allowDim         – Expose `dim` attribute?
 * @param {boolean} cfg.allowSubtype     – Expose `subtype` attribute?
 * @returns {import('@saltcorn/types').Type}
 */
function makeType(cfg) {
  const { name, base, subtype, allowDim, allowSubtype } = cfg;

  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attributes = [
    {
      name: 'srid',
      label: 'SRID',
      type: 'Integer',
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
    sql_name: sqlNameFactory(base, subtype),
    description: `PostGIS ${subtype || base} value`,
    attributes,
    validate_attributes: validateAttrs,
    fieldviews: {
      show: leafletShow(),
      edit: leafletEditView(name),
    },
    read: (v) => (typeof v === 'string' ? v : undefined),
    /* Saltcorn 1.x expects text‑cast for display in lists */
    readFromDB: (v) => (typeof v === 'string' ? `${v}::text` : undefined),
  });
}

module.exports = { makeType };