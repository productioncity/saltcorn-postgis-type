/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * Saltcorn view-template “composite_map” – plots every geometry row returned by
 * the query on a single Leaflet map.
 *
 * This fully-instrumented build records every step through the plug-in so we
 * can diagnose configuration problems quickly.  Set `PLUGIN_DEBUG = true` in
 * src/constants.js and watch Saltcorn’s console.
 *
 * Author:   Troy Kelly  <troy@team.production.city>
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
 * Saltcorn calls configurationWorkflow either as:
 *   • configurationWorkflow(table_id)
 *   • configurationWorkflow(req, table_id)
 * We detect the pattern and extract the numeric id accordingly.
 *
 * @param {...unknown} sig
 * @returns {import('@saltcorn/data/models/workflow').Workflow}
 */
function configurationWorkflow(...sig) {
  const table_id =
    sig.length >= 2 && sig[0] && typeof sig[0] === 'object' && 'method' in sig[0]
      ? Number(sig[1])
      : Number(sig[0]);

  dbg.info('configurationWorkflow()', { rawSignature: sig, table_id });

  return new Workflow({
    steps: [
      {
        name: 'settings',
        form: async () => {
          const table  = await Table.findOne({ id: table_id });
          dbg.info('Table.findOne()', { found: !!table });
          const fields = table ? await table.getFields() : [];
          dbg.info('getFields()', { count: fields.length, fields });
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
    const table = await Table.findOne(where);
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