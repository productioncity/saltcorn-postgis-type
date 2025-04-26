/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * Saltcorn view-template **“composite_map”** – renders every geometry row
 * returned by the query in a single interactive Leaflet map.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable max-lines-per-function */

const Table                           = require('@saltcorn/data/models/table');
const Workflow                        = require('@saltcorn/data/models/workflow');
const { wktToGeoJSON }                = require('../utils/geometry');
const { LEAFLET, DEFAULT_CENTER }     = require('../constants');

/**
 * Safe JS literal helper.
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v === undefined ? null : v).replace(/</g, '\\u003c');
}

/**
 * Configuration-field builder (synchronous).
 *
 * @param {import('@saltcorn/data/models/table').Table} table
 * @returns {import('@saltcorn/types').Field[]}
 */
function configFields(table) {
  const opts =
    (table?.fields || [])
      .filter(
        (f) =>
          f.type &&
          typeof f.type.name === 'string' &&
          /(geom|point|line|string|polygon|geography)/i.test(f.type.name),
      )
      .map((f) => f.name) || [];

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
 * Saltcorn needs a **Workflow** when a user creates / edits a view.
 * Without it the GUI cannot render the config form, which resulted in
 * “View not found: undefined”.  This workflow exposes the fields built
 * above and stores the resulting values in the view config.
 *
 * @param {number} table_id
 * @returns {import('@saltcorn/data/models/workflow').Workflow}
 */
function configurationWorkflow(table_id) {
  return new Workflow({
    steps: [
      {
        name: 'settings',
        form: async () => {
          const table = await Table.findOne({ id: table_id });
          return {
            fields: configFields(table),
          };
        },
      },
    ],
  });
}

/* ───────────────────────── View-template object ───────────────────────── */

const compositeMapTemplate = {
  name: 'composite_map',
  description:
    'Plots every geometry row on a single Leaflet map (dashboard style).',
  display_state_form: false,
  get_state_fields: () => [],
  configFields,
  configuration_workflow: configurationWorkflow,

  /**
   * Renders the map.
   *
   * @param {number} table_id
   * @param {string} viewname
   * @param {{geometry_field:string,height?:number}} cfg
   * @param {object} state
   * @returns {Promise<string>}
   */
  async run(table_id, viewname, cfg, state) {
    const geomCol = cfg.geometry_field || 'geom';
    const height  = Number(cfg.height) || 300;

    /* 1 – Fetch data rows */
    const table = await Table.findOne({ id: table_id });
    const rows  = table ? await table.getRows(state) : [];

    /* 2 – Convert each geometry to GeoJSON Feature(s) */
    const features = [];
    for (const row of rows) {
      const gj = wktToGeoJSON(row[geomCol]);
      if (!gj) continue;

      if (gj.type === 'Feature') {
        features.push(gj);
      } else if (
        gj.type === 'FeatureCollection' &&
        Array.isArray(gj.features)
      ) {
        features.push(...gj.features);
      } else {
        features.push({ type: 'Feature', properties: {}, geometry: gj });
      }
    }

    const collection = { type: 'FeatureCollection', features };

    /* 3 – HTML payload */
    const mapId = `cmp_${Math.random().toString(36).slice(2)}`;
    const { lat, lng, zoom } = DEFAULT_CENTER;

    return `
<div id="${mapId}" class="border rounded" style="height:${height}px;"></div>
<script>
(function(){
  const LEAF_CSS=${js(LEAFLET.css)};
  const LEAF_JS=${js(LEAFLET.js)};
  const MAP_ID=${js(mapId)};
  const GEOJSON=${js(collection)};

  function haveCss(h){return!!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){return!!(document._loadedScripts&&document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(haveCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(haveJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  (async function init(){
    await loadCss(LEAF_CSS);
    await loadJs(LEAF_JS);
    const map=L.map(MAP_ID).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
    if(GEOJSON.features.length){
      const layer=L.geoJSON(GEOJSON).addTo(map);
      map.fitBounds(layer.getBounds(),{maxZoom:14});
    }
  })();
})();
</script>`;
  },
};

module.exports = { compositeMapTemplate };
/* eslint-enable max-lines-per-function */