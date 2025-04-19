/**
 * type-factory.js
 * -----------------------------------------------------------------------------
 * Generates Saltcorn `Type` definitions for every PostGIS subtype.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 2025‑04‑20 – pass type name to mapEditView()
 * Licence:  CC0‑1.0
 */

'use strict';

const dbg = require('../utils/debug');
const { DEFAULT_SRID, DIM_MODS, BASE_GEOM_TYPES } = require('../constants');
const { sqlNameFactory } = require('../utils/sql-name');
const { validateAttrs, toWkt } = require('../utils/geometry');

const { mapEditView } = require('../leaflet/map-edit-view');
const { showView }    = require('../leaflet/show-view');
const { rawView }     = require('../leaflet/raw-view');

/* ─────────────────────────── factory ────────────────────────────── */

/**
 * @param {object} cfg
 * @param {string} cfg.name               Saltcorn type name
 * @param {'GEOMETRY'|'GEOGRAPHY'} cfg.base
 * @param {string} cfg.subtype
 * @param {boolean} cfg.allowDim
 * @param {boolean} cfg.allowSubtype
 * @returns {import('@saltcorn/types').Type}
 */
function makeType(cfg) {
  dbg.debug('makeType()', cfg);

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

  /* ---- Field‑views ---- */
  const editFV     = mapEditView(name.toLowerCase());
  const mapPreview = { ...showView(), name: 'map', isEdit: true };

  /* ---- Final Saltcorn type ---- */
  return Object.freeze({
    name,
    sql_name: sqlNameFactory(base, subtype),
    description: `PostGIS ${subtype || base} value`,
    attributes,
    validate_attributes: validateAttrs,
    fieldviews: {
      edit: editFV,
      raw : rawView(),
      map : mapPreview,
      show: showView(),
    },

    read: (v) => {
      if (v === null || v === undefined) return undefined;
      try {
        return toWkt(Buffer.isBuffer(v) ? v : String(v));
      } catch (e) {
        dbg.warn('type.read() failed', e);
        return undefined;
      }
    },

    readFromDB: (v) => `ST_AsEWKT(${v})`,
  });
}

module.exports = { makeType };