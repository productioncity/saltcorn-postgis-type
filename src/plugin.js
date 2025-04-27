/**
 * plugin.js
 * ---------------------------------------------------------------------------
 * Root export – wires PostGIS types into Saltcorn and patches Table.getRows.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable camelcase */

const dbg                       = require('./utils/debug');
const { types }                 = require('./types/catalogue');
const { patchGetRows }          = require('./table/patch-get-rows');
const { wktToLonLat }           = require('./utils/geometry');
const { LEAFLET }               = require('./constants');
const { compositeMapTemplate }  = require('./leaflet/composite-map-view');

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
    dbg.info('Action:create_point_latlng_columns invoked', { table_id });
    const tbl = await Table.findOne({ id: table_id });
    if (!tbl) {
      dbg.warn('Table not found – aborting.');
      return { error: 'Table not found.' };
    }

    const pointField = (await tbl.getFields()).find(
      (f) => f.type?.name === 'point',
    );
    if (!pointField) {
      dbg.warn('No point field detected – aborting.');
      return { error: 'No point field detected.' };
    }

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

    /* Force Saltcorn to refresh calculated column cache */
    await tbl.update({ min_role_read: tbl.min_role_read });
    const msg = `Created columns #${lat.id} and #${lng.id}.`;
    dbg.info(msg);
    return { success: msg };
  },
};

/* ─────────────────────── Plug-in Export ───────────────────── */

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: 'saltcorn-postgis-type',

  /* Make Leaflet assets available */
  headers: [
    { css: LEAFLET.css },
    { script: LEAFLET.js },
  ],

  /**
   * Runs once at start-up (or when the plug-in is enabled).
   *
   * @returns {void}
   */
  onLoad() {
    dbg.debug('Plug-in onLoad()', { timestamp: new Date().toISOString() });
    let T = require('@saltcorn/data/models/table');
    if (T && T.Table) T = T.Table;
    if (T && T.prototype) {
      patchGetRows(T);
      dbg.info('Table.getRows successfully patched.');
    } else {
      // eslint-disable-next-line no-console
      console.error(
        'saltcorn-postgis-type: Unable to patch Table.getRows – Table class not found',
      );
    }
  },

  /* PostGIS scalar types */
  types,

  /* New composite map view-template */
  viewtemplates: [compositeMapTemplate],

  /* Extra actions */
  actions: {
    create_point_latlng_columns: createLatLngColumnsAction,
  },

  /* Helper functions surfaced to Saltcorn */
  functions: {
    /**
     * Convert POINT WKT → plain lat/lng numbers.
     * @param {string} wkt
     * @returns {{lat:number,lng:number,latlng:[number,number]}|undefined}
     */
    toLatLng(wkt) {
      dbg.trace('functions.toLatLng()', wkt);
      const ll = wktToLonLat(wkt);
      return ll ? { lat: ll[1], lng: ll[0], latlng: ll } : undefined;
    },
  },

  /* Run-time dependency info for Saltcorn “Store” UI */
  dependencies: ['wellknown', 'wkx'],
};