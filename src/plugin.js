/**
 * plugin.js
 * ---------------------------------------------------------------------------
 * Root export – wires PostGIS types into Saltcorn and patches Table.getRows.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/* eslint-disable camelcase */

const { types } = require('./types/catalogue');
const { patchGetRows } = require('./table/patch-get-rows');
const { wktToLonLat } = require('./utils/geometry');
const { LEAFLET } = require('./constants');

const TableMod = require('@saltcorn/data/models/table');
const Field    = require('@saltcorn/data/models/field');

/* Resolve Table class across Saltcorn 0.x / 1.x variants */
const Table =
  TableMod && typeof TableMod.findOne === 'function'
    ? TableMod
    : TableMod && TableMod.Table
      ? TableMod.Table
      : TableMod;

/* ───────────────────────── Actions ────────────────────────── */

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

    const pointField = (await tbl.getFields())
      .find((f) => f.type?.name === 'point');
    if (!pointField) return { error: 'No point field detected.' };

    const base = pointField.name;
    const lat = await Field.create({
      table_id,
      name:  `${base}_lat`,
      label: `${base} latitude`,
      type:  'Float',
      calculated: true,
      expression: `ST_Y("${base}")`,
    });
    const lng = await Field.create({
      table_id,
      name:  `${base}_lng`,
      label: `${base} longitude`,
      type:  'Float',
      calculated: true,
      expression: `ST_X("${base}")`,
    });

    /* Force Saltcorn to refresh calculated column cache */
    await tbl.update({ min_role_read: tbl.min_role_read });
    return { success: `Created columns #${lat.id} and #${lng.id}.` };
  },
};

/* ─────────────────────── Plug‑in Export ───────────────────── */

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: 'saltcorn-postgis-type',

  /* Inject local Leaflet assets so they are always web‑served */
  headers: [
    { css:    LEAFLET.css },
    { script: LEAFLET.js },
  ],

  /**
   * Runs once at start‑up (or when the plug‑in is enabled).
   * Patches Table.getRows so Point columns produce virtual
   * <col>_lat and <col>_lng properties.
   *
   * @returns {void}
   */
  onLoad() {
    let T = require('@saltcorn/data/models/table');
    if (T && T.Table) T = T.Table;
    if (T && T.prototype) patchGetRows(T);
    else /* eslint-disable-next-line no-console */
      console.error(
        'saltcorn-postgis-type: Unable to patch Table.getRows – Table class not found',
      );
  },

  types,

  actions: {
    create_point_latlng_columns: createLatLngColumnsAction,
  },

  functions: {
    /**
     * Convert POINT WKT→ {lat,lng,latlng}.
     * @param {string} wkt
     * @returns {{lat:number,lng:number,latlng:[number,number]}|undefined}
     */
    toLatLng(wkt) {
      const ll = wktToLonLat(wkt);
      return ll ? { lat: ll[1], lng: ll[0], latlng: ll } : undefined;
    },
  },

  /* Run‑time dependencies (for Saltcorn store UI) */
  dependencies: ['wellknown'],
};