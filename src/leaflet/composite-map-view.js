/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * View-template “composite_map” – plots every geometry row on one Leaflet map.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable max-lines-per-function */

const Table        = require('@saltcorn/data/models/table');
const Workflow     = require('@saltcorn/data/models/workflow');
const Form         = require('@saltcorn/data/models/form');
const dbg          = require('../utils/debug');
const { wktToGeoJSON }            = require('../utils/geometry');
const { LEAFLET, DEFAULT_CENTER } = require('../constants');

/**
 * Safe inline-JS literal helper.
 * @param {unknown} v
 * @returns {string}
 */
const js = (v) => JSON.stringify(v ?? null).replace(/</g, '\\u003c');

/* ───────────────────────── Configuration helpers ───────────────────────── */

function buildConfigFields(fields) {
  const opts = fields.map((f) => f.name);
  dbg.info('Option list', opts);
  return [
    { name: 'geometry_field', label: 'Geometry column', type: 'String',
      required: true, attributes: { options: opts } },
    { name: 'height', label: 'Map height (px)', type: 'Integer',
      default: 300, attributes: { min: 100 } },
  ];
}

/**
 * Saltcorn passes either:
 *   • (table_id)                     when creating a new view
 *   • (req, table_id)                when editing an existing view
 */
function configurationWorkflow(...sig) {
  /* Detect call pattern */
  const table_id =
    sig[0] && typeof sig[0] === 'object' && 'method' in sig[0]
      ? sig[1]        // 2-arg form  => second arg is numeric id
      : sig[0];       // 1-arg form  => first arg is numeric id

  dbg.info('configurationWorkflow()', { received: sig, table_id });

  return new Workflow({
    steps: [
      {
        name: 'settings',
        form: async () => {
          const table  = await Table.findOne({ id: table_id });
          const fields = table ? await table.getFields() : [];
          dbg.info('getFields()', { count: fields.length });
          return new Form({ fields: buildConfigFields(fields) });
        },
      },
    ],
  });
}

/* … rest of the file unchanged … */