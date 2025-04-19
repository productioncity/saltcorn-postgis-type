/**
 * type-factory.js
 * ---------------------------------------------------------------------------
 * Generates Saltcorn `Type` objects for every PostGIS subtype.
 *
 * Updated 2025‑04‑19 – fully wires: edit (alias), map, raw, show.
 *
 * Author: Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const { DEFAULT_SRID, DIM_MODS, BASE_GEOM_TYPES } = require('../constants');
const { sqlNameFactory } = require('../utils/sql-name');
const { validateAttrs } = require('../utils/geometry');

const { mapEditView } = require('../leaflet/map-edit-view');
const { showView } = require('../leaflet/show-view');
const { rawView } = require('../leaflet/raw-view');

/**
 * @param {object} cfg
 * @param {string} cfg.name
 * @param {'GEOMETRY'|'GEOGRAPHY'} cfg.base
 * @param {string} cfg.subtype
 * @param {boolean} cfg.allowDim
 * @param {boolean} cfg.allowSubtype
 * @returns {import('@saltcorn/types').Type}
 */
function makeType(cfg) {
  const { name, base, subtype, allowDim, allowSubtype } = cfg;

  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attributes = [
    { name: 'srid', label: 'SRID', type: 'Integer', default: DEFAULT_SRID },
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

  /* ------------------------------------------------------------------ */
  /* Field‑views                                                        */
  /* ------------------------------------------------------------------ */
  /* We derive two variants from the same Leaflet component:            *
   *   • “map”  – read‑only, offered in Show/List builders.             *
   *   • “edit” – editable, offered in Edit/New builders.               */
  const baseMapFV = mapEditView();

  /** Read‑only map view (isEdit=false) */
  const mapFV = { ...baseMapFV, name: 'map', isEdit: false };

  /** Editing variant (isEdit=true) */
  const editFV = { ...baseMapFV, name: 'edit', isEdit: true };

  return Object.freeze({
    name,
    sql_name: sqlNameFactory(base, subtype),
    description: `PostGIS ${subtype || base} value`,
    attributes,
    validate_attributes: validateAttrs,
    fieldviews: {
      map: mapFV,
      edit: editFV,
      raw: rawView(),
      show: showView(),
    },
    read: (v) => (typeof v === 'string' ? v : undefined),

    /* Ensure Postgres returns text *in EWKT format*, not hex WKB. */
    readFromDB: (v) => `ST_AsEWKT(${v})`,
  });
}

module.exports = { makeType };