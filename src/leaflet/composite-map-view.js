/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * Saltcorn view-template “composite_map” – plots every geometry row returned by
 * the query on a single Leaflet map.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Licence:  CC0-1.0
 */

'use strict';

/* eslint-disable max-lines-per-function */

const Table            = require('@saltcorn/data/models/table');
const Workflow         = require('@saltcorn/data/models/workflow');
const Form             = require('@saltcorn/data/models/form');
const dbg              = require('../utils/debug');
const { wktToGeoJSON } = require('../utils/geometry');
const { LEAFLET, DEFAULT_CENTER } = require('../constants');

/* ── Saltcorn 0.x / 1.x dual-export helpers ────────────────────────── */
const TableCls =
  Table && typeof Table.findOne === 'function'
    ? Table
    : Table && Table.Table
      ? Table.Table
      : Table;

const ViewMod = require('@saltcorn/data/models/view');
const ViewCls =
  ViewMod && typeof ViewMod.findOne === 'function'
    ? ViewMod
    : ViewMod && ViewMod.View
      ? ViewMod.View
      : ViewMod;

/**
 * Safely embed *anything* as a JS literal (prevents </script> bust-outs).
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v ?? null).replace(/</g, '\\u003c');
}

/* ───────────────────────── Configuration helpers ───────────────────────── */

/**
 * Build the configuration-form fields.
 *
 * @param {import('@saltcorn/types').Field[]} fields
 * @returns {import('@saltcorn/types').Field[]}
 */
function buildConfigFields(fields) {
  const opts = fields.map((f) => f.name);
  dbg.info('buildConfigFields()', { opts });

  return [
    {
      name: 'geometry_field',
      label: 'Geometry column',
      type: 'String',
      required: true,
      attributes: { options: opts },
    },
    {
      name: 'height',
      label: 'Map height (px)',
      type: 'Integer',
      default: 300,
      attributes: { min: 100 },
    },
  ];
}

/**
 * Attempt to locate the Table instance regardless of how Saltcorn invoked us.
 *
 * @param {unknown[]} sig  Raw configurationWorkflow arguments.
 * @returns {Promise<import('@saltcorn/types').Table|undefined>}
 */
async function resolveTable(sig) {
  const [first, second] = sig;

  /* 1️⃣ Direct numeric table_id supplied */
  const tryNumeric = Number(
    typeof first === 'number' || typeof first === 'string' ? first : second,
  );
  if (Number.isFinite(tryNumeric) && tryNumeric > 0) {
    const t = await TableCls.findOne({ id: tryNumeric });
    if (t) return t;
  }

  /* 2️⃣ Express req available? */
  const req =
    first && typeof first === 'object' && 'method' in first ? first : undefined;
  if (!req) return undefined;

  /* — 2a: editing an existing view — */
  if (req.view && req.view.table_id) {
    return TableCls.findOne({ id: req.view.table_id });
  }

  /* — 2b: new-view wizard (?table=) — */
  if (req.query && req.query.table) {
    return TableCls.findOne({ name: req.query.table });
  }

  /* — 2c: last-ditch: view name in params — */
  const viewName =
    (req.params &&
      (req.params.name || req.params.viewname || req.params[0])) ||
    undefined;

  if (viewName) {
    const vw = await ViewCls.findOne({ name: viewName });
    if (vw) return TableCls.findOne({ id: vw.table_id });
  }

  return undefined;
}

/**
 * Saltcorn calls configurationWorkflow with wildly different signatures.
 *
 * @param {...unknown} sig
 * @returns {import('@saltcorn/data/models/workflow').Workflow}
 */
function configurationWorkflow(...sig) {
  dbg.info('configurationWorkflow()', { rawSignature: sig });

  return new Workflow({
    steps: [
      {
        name: 'settings',
        form: async () => {
          const table = await resolveTable(sig);
          dbg.info('Table.findOne()', { found: !!table });
          const fields = table ? await table.getFields() : [];
          dbg.info('getFields()', { count: fields.length });
          return new Form({ fields: buildConfigFields(fields) });
        },
      },
    ],
  });
}

/* ───────────────────────── View-template object ───────────────────────── */

const compositeMapTemplate = {
  name: 'composite_map',
  description:
    'Plots every geometry row returned by the query on one interactive Leaflet map.',
  display_state_form: false,
  get_state_fields: () => [],
  configuration_workflow: configurationWorkflow,

  /**
   * Runtime renderer.
   *
   * @param {number|string} tableRef  Numeric id or name string.
   * @param {string} _viewname        (unused – required by Saltcorn signature)
   * @param {{geometry_field:string,height?:number}} cfg
   * @param {object} state
   * @returns {Promise<string>} HTML payload.
   */
  async run(tableRef, _viewname, cfg, state) {
    dbg.info('composite_map.run()', { tableRef, cfg, state });

    const geomCol = cfg.geometry_field || 'geom';
    const height  = Number(cfg.height) || 300;

    const where =
      typeof tableRef === 'number' ? { id: tableRef } : { name: tableRef };
    const table = await TableCls.findOne(where);
    if (!table) {
      dbg.error('Table not found at run-time', { where });
      return '<div class="alert alert-danger">Table not found.</div>';
    }

    const rows = await table.getRows(state);
    dbg.info('Rows fetched', { count: rows.length });

    /* Convert geometries to GeoJSON Features */
    const features = [];
    for (const row of rows) {
      const gj = wktToGeoJSON(row[geomCol]);
      if (!gj) continue;

      if (gj.type === 'Feature') {
        features.push(gj);
      } else if (gj.type === 'FeatureCollection' && Array.isArray(gj.features)) {
        features.push(...gj.features);
      } else {
        features.push({ type: 'Feature', properties: {}, geometry: gj });
      }
    }
    dbg.info('Features built', { count: features.length });

    const collection = { type: 'FeatureCollection', features };
    const mapId      = `cmp_${Math.random().toString(36).slice(2)}`;
    const { lat, lng, zoom } = DEFAULT_CENTER;

    /* HTML + JS payload */
    return `
<div id="${mapId}" class="border rounded" style="height:${height}px;"></div>
<script>
(function(){
  const css=${js(LEAFLET.css)}, jsSrc=${js(LEAFLET.js)},
        geo=${js(collection)}, id=${js(mapId)};

  function haveCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(haveCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(haveJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  (async()=>{await loadCss(css);await loadJs(jsSrc);
    const m=L.map(id).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution:'&copy; OpenStreetMap' }).addTo(m);
    if(geo.features.length){
      const l=L.geoJSON(geo).addTo(m);
      m.fitBounds(l.getBounds(),{maxZoom:14});
    }
  })();
})();
</script>`;
  },
};

module.exports = { compositeMapTemplate };
/* eslint-enable max-lines-per-function */