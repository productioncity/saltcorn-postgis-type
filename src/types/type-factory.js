/**
 * type-factory.js
 * Factory that returns fully‑formed Saltcorn `Type` objects for PostGIS.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Extracted from monolithic index.js.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

const { DEFAULT_SRID } = require('../constants');
const { sqlNameFactory } = require('../utils/sql-name');
const { validateAttrs } = require('../utils/geometry');
const { leafletShow } = require('../leaflet/show-view');
const { leafletPointEditView } = require('../leaflet/point-edit-view');

/**
 * Construct a Saltcorn `Type` object.
 *
 * @param {object} def
 * @param {string} def.name         Internal type name.
 * @param {'GEOMETRY'|'GEOGRAPHY'} def.base Base PostGIS type.
 * @param {string} def.subtype      Default subtype token.
 * @param {boolean} def.allowDim    Whether `dim` attribute is exposed.
 * @param {boolean} def.allowSubtype Whether `subtype` attribute is exposed.
 * @returns {import('@saltcorn/types/base_plugin').Type}
 */
function makeType(def) {
  const { name, base, subtype, allowDim, allowSubtype } = def;
  const label = (subtype || base).replace(/^\w/, (c) => c.toUpperCase());

  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attributes = [
    { name: 'srid', label: 'SRID', type: 'Integer', default: DEFAULT_SRID },
  ];
  if (allowDim) {
    const { DIM_MODS } = require('../constants');
    attributes.push({
      name: 'dim',
      label: 'Dim',
      type: 'String',
      attributes: { options: DIM_MODS },
    });
  }
  if (allowSubtype) {
    const { BASE_GEOM_TYPES } = require('../constants');
    attributes.push({
      name: 'subtype',
      label: 'Subtype',
      type: 'String',
      attributes: { options: BASE_GEOM_TYPES },
    });
  }

  const fieldviews = { show: leafletShow() };
  if (name === 'point') fieldviews.edit = leafletPointEditView(name);

  return {
    name,
    sql_name: sqlNameFactory(base, subtype),
    description: `PostGIS ${label} value`,
    attributes,
    validate_attributes: validateAttrs,
    fieldviews,
    read: (v) => (typeof v === 'string' ? v : undefined),
    readFromDB: (v) => (typeof v === 'string' ? `${v}::text` : undefined),
  };
}

module.exports = { makeType };