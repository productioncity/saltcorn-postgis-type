/**
 * plugin.js
 * Main export for the Saltcorn PostGIS Type plug‑in. Wires together all
 * modules, patches Table.getRows and exposes helper functions + actions.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Modularised.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

/* eslint-disable camelcase */

const { types } = require('./types/catalogue');
const { patchGetRows } = require('./table/patch-get-rows');
const { wktToLonLat } = require('./utils/geometry');

const TableMod = require('@saltcorn/data/models/table');
const Field = require('@saltcorn/data/models/field');

// Defensive import works across Saltcorn 0.x and 1.x
const Table =
  TableMod && typeof TableMod.findOne === 'function'
    ? TableMod
    : TableMod && TableMod.Table
      ? TableMod.Table
      : TableMod;

/* ──────────────── Actions ───────────────── */

const createLatLngColumnsAction = {
  requireRow: false,
  group: 'Database',
  description:
    'Creates calculated Float columns <point>_lat and <point>_lng ' +
    'using PostGIS ST_Y/ST_X.',
  /**
   * @param {{table_id:number}} args
   * @returns {Promise<{success?:string,error?:string}>}
   */
  async run({ table_id }) {
    const tbl = await Table.findOne({ id: table_id });
    if (!tbl) return { error: 'Table not found.' };

    const pointField = (await tbl.getFields()).find(
      (f) => f.type?.name === 'point',
    );
    if (!pointField) return { error: 'No Point field detected.' };

    const base = pointField.name;
    const lat = await Field.create({
      table_id,
      name: `${base}_lat`,
      label: `${base} latitude`,
      type: 'Float',
      calculated: true,
      expression: `ST_Y("${base}")`,
    });
    const lng = await Field.create({
      table_id,
      name: `${base}_lng`,
      label: `${base} longitude`,
      type: 'Float',
      calculated: true,
      expression: `ST_X("${base}")`,
    });

    await tbl.update({ min_role_read: tbl.min_role_read });
    return {
      success: `Created columns #${lat.id} and #${lng.id}.`,
    };
  },
};

/* ──────────────── Plug‑in export ───────────────── */

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: 'saltcorn-postgis-type',

  /**
   * Called exactly once on server start (or when the plug‑in is enabled).
   * We patch Table.getRows() here so every Point column exposes virtual
   * <col>_lat and <col>_lng floats before the first request is served.
   *
   * @param {object=} _config   Unused – plug‑in is stateless.
   * @returns {void}
   */
  onLoad(_config) {
    let TableClass = require('@saltcorn/data/models/table');
    if (TableClass && TableClass.Table) {
      TableClass = TableClass.Table;
    }
    if (!TableClass || !TableClass.prototype) {
      // eslint-disable-next-line no-console
      console.error(
        'saltcorn-postgis-type: Unable to patch Table.getRows() – Table class not found.',
      );
      return;
    }
    patchGetRows(TableClass); // idempotent – safe to call twice
  },

  headers: [],

  types,

  actions: {
    create_point_latlng_columns: createLatLngColumnsAction,
  },

  functions: {
    /**
     * Convert a WKT/EWKT POINT to a `{lat,lng}` object.
     * @param {string} wkt
     * @returns {{lat:number,lng:number,latlng:[number,number]}|undefined}
     */
    toLatLng(wkt) {
      const ll = wktToLonLat(wkt);
      return ll ? { lat: ll[1], lng: ll[0], latlng: ll } : undefined;
    },
  },

  dependencies: ['wellknown'],
};