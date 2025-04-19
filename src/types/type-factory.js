/**
 * type-factory.js
 * ---------------------------------------------------------------------------
 * Generates Saltcorn `Type` objects for every PostGIS subtype.
 *
 * Updated 2025‑04‑19 – fully wires: edit (alias), map, raw, show.
 * Updated 2025‑04‑19c – Robust `read()` that accepts Buffer/WKB directly.
 *
 * Author: Troy Kelly <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

const dbg = require('../utils/debug');
const { DEFAULT_SRID, DIM_MODS, BASE_GEOM_TYPES } = require('../constants');
const { sqlNameFactory } = require('../utils/sql-name');
const { validateAttrs, toWkt } = require('../utils/geometry');

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

  /* ------------------------------------------------------------------ */
  /* Field‑views                                                        */
  /* ------------------------------------------------------------------ */
  const baseMapFV = mapEditView();
  const mapFV  = { ...baseMapFV, name: 'map',  isEdit: false };
  const editFV = { ...baseMapFV, name: 'edit', isEdit: true };

  const typeObj = Object.freeze({
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

    /* ----------------------------------------------------------------
     * READ: normalise *anything* the driver gives us – Buffer (WKB),
     *       hex, EWKT, WKT – into canonical EWKT for the UI layer.
     * -------------------------------------------------------------- */
    read: (v) => {
      if (v === null || v === undefined) return undefined;
      try {
        return toWkt(
          typeof v === 'object' && Buffer.isBuffer(v) ? v : String(v),
        );
      } catch (e) {
        dbg.warn('type.read() failed', e);
        return undefined;
      }
    },

    /* Raw DB expression: always force EWKT so we never get untyped WKB */
    readFromDB: (v) => `ST_AsEWKT(${v})`,
  });

  dbg.info(`Type registered: ${name}`);
  return typeObj;
}

module.exports = { makeType };