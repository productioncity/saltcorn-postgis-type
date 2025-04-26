/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * Saltcorn view-template “composite_map” – shows every geometry row on one map.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable max-lines-per-function */

const Table    = require('@saltcorn/data/models/table');
const Workflow = require('@saltcorn/data/models/workflow');
const Form     = require('@saltcorn/data/models/form');

const { wktToGeoJSON }            = require('../utils/geometry');
const { LEAFLET, DEFAULT_CENTER } = require('../constants');

/**
 * Serialise *anything* to a safe inline-JS literal.
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v === undefined ? null : v).replace(/</g, '\\u003c');
}

/**
 * Build the configuration-form fields.
 *
 * @param {{fields: import('@saltcorn/types').Field[]}} ctx
 * @returns {import('@saltcorn/types').Field[]}
 */
function configFields({ fields }) {
  const opts =
    (fields || [])
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
 * Saltcorn workflow that presents the config form.
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
          const table  = await Table.findOne({ id: table_id });
          const fields = table ? await table.getFields() : [];
          /* Pass a fake object exposing `.fields` so configFields works */
          return new Form({ fields: configFields({ fields }) });
        },
      },
    ],
  });
}

/* ───────────────────────── View-template object ───────────────────────── */

const compositeMapTemplate = {
  name: 'composite_map',
  description:
    'Plots every geometry row in the result-set on a single Leaflet map.',
  display_state_form: false,
  get_state_fields: () => [],
  configuration_workflow: configurationWorkflow,

  /**
   * Render the composite map.
   *
   * @param {number} table_id
   * @param {string} _viewname
   * @param {{geometry_field:string,height?:number}} cfg
   * @param {object} state
   * @returns {Promise<string>}
   */
  async run(table_id, _viewname, cfg, state) {
    const geomCol = cfg.geometry_field || 'geom';
    const height  = Number(cfg.height) || 300;

    /* --- 1. Fetch data -------------------------------------------------- */
    const table = await Table.findOne({ id: table_id });
    const rows  = table ? await table.getRows(state) : [];

    /* --- 2. Build GeoJSON collection ----------------------------------- */
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
    const collection = { type: 'FeatureCollection', features };

    /* --- 3. HTML/JS payload -------------------------------------------- */
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

  function haveCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
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