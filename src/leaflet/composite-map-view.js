/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * View-template “composite_map” – plots every geometry row on a single
 * Leaflet map, complete with optional pop-ups and click-through navigation.
 *
 * All previous debug logging is fully restored – toggle globally via
 * PLUGIN_DEBUG in src/constants.js.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable max-lines-per-function */

const Table    = require('@saltcorn/data/models/table');
const Workflow = require('@saltcorn/data/models/workflow');
const Form     = require('@saltcorn/data/models/form');
const dbg      = require('../utils/debug');
const { wktToGeoJSON }         = require('../utils/geometry');
const { LEAFLET, DEFAULT_CENTER } = require('../constants');

/* Saltcorn 0.x / 1.x dual-export helpers */
const TableCls =
  Table && typeof Table.findOne === 'function' ? Table
    : Table && Table.Table ? Table.Table : Table;

const ViewMod = require('@saltcorn/data/models/view');
const ViewCls =
  ViewMod && typeof ViewMod.findOne === 'function' ? ViewMod
    : ViewMod && ViewMod.View ? ViewMod.View : ViewMod;

/**
 * JS-safe JSON literal.
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v ?? null).replace(/</g, '\\u003c');
}

/* ───────────────────────────── Config helpers ─────────────────────────── */

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
      name: 'popup_field',
      label: 'Popup text field (optional)',
      type: 'String',
      attributes: { options: opts },
    },
    {
      name: 'click_view',
      label: 'Navigate to view on click (optional)',
      sublabel: 'Leave blank for no navigation. Row id is passed as ?id=…',
      type: 'String',
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
 * Resolve the Table regardless of Saltcorn’s call signature.
 *
 * @param {unknown[]} sig
 * @returns {Promise<import('@saltcorn/types').Table|undefined>}
 */
async function resolveTable(sig) {
  dbg.trace('resolveTable()', { sig });

  const [first, second] = sig;

  /* Direct numeric id? */
  const num = Number(
    typeof first === 'number' || typeof first === 'string' ? first : second,
  );
  if (Number.isFinite(num) && num > 0) {
    const t = await TableCls.findOne({ id: num });
    if (t) {
      dbg.info('resolveTable() hit direct id', { id: num });
      return t;
    }
  }

  const req =
    first && typeof first === 'object' && 'method' in first ? first : undefined;
  if (!req) return undefined;

  /* Editing existing view */
  if (req.view?.table_id) {
    dbg.info('resolveTable() via req.view.table_id', { id: req.view.table_id });
    return TableCls.findOne({ id: req.view.table_id });
  }

  /* Wizard ?table=foo */
  if (req.query?.table) {
    dbg.info('resolveTable() via req.query.table', { name: req.query.table });
    return TableCls.findOne({ name: req.query.table });
  }

  /* Last-ditch param sniff */
  const vn =
    (req.params && (req.params.name || req.params.viewname || req.params[0])) ||
    undefined;
  if (vn) {
    dbg.info('resolveTable() via param', { vn });
    const vw = await ViewCls.findOne({ name: vn });
    if (vw) return TableCls.findOne({ id: vw.table_id });
  }

  dbg.warn('resolveTable() failed – no table found');
  return undefined;
}

/**
 * configuration_workflow – universal across Saltcorn versions.
 */
function configurationWorkflow(...sig) {
  dbg.info('configurationWorkflow()', { rawSignature: sig });

  return new Workflow({
    steps: [
      {
        name: 'settings',
        form: async () => {
          const tbl   = await resolveTable(sig);
          dbg.info('Table.findOne()', { found: !!tbl });
          const flds  = tbl ? await tbl.getFields() : [];
          dbg.info('getFields()', { count: flds.length });
          return new Form({ fields: buildConfigFields(flds) });
        },
      },
    ],
  });
}

/* ───────────────────────────── View template ─────────────────────────── */

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
   * @param {number|string} tableRef
   * @param {string} _viewname   (unused)
   * @param {{geometry_field:string,popup_field?:string,click_view?:string,height?:number}} cfg
   * @param {object} state
   * @returns {Promise<string>}
   */
  async run(tableRef, _viewname, cfg, state) {
    dbg.info('composite_map.run()', { tableRef, cfg, state });

    const geomCol    = cfg.geometry_field || 'geom';
    const popupField = cfg.popup_field  || '';
    const clickView  = cfg.click_view   || '';
    const height     = Number(cfg.height) || 300;

    /* ── Fetch table + rows ── */
    const where =
      typeof tableRef === 'number' ? { id: tableRef } : { name: tableRef };
    const table = await TableCls.findOne(where);
    if (!table) {
      dbg.error('Table not found at run-time', { where });
      return '<div class="alert alert-danger">Table not found.</div>';
    }

    const rows = await table.getRows(state);
    dbg.info('Rows fetched', { count: rows.length });

    /* ── Build FeatureCollection ── */
    const features = [];
    for (const row of rows) {
      const gj = wktToGeoJSON(row[geomCol]);
      if (!gj) continue;

      features.push({
        type:       'Feature',
        properties: { __id: row.id, ...row },
        geometry:   gj.type === 'Feature' ? gj.geometry : gj,
      });
    }
    dbg.info('Features built', { count: features.length });

    const collection = { type: 'FeatureCollection', features };
    const mapId      = `cmp_${Math.random().toString(36).slice(2)}`;
    const { lat, lng, zoom } = DEFAULT_CENTER;

    /* ── HTML + JS payload ── */
    return `
<div id="${mapId}" class="border rounded" style="height:${height}px;"></div>
<script>
(function(){
  const css=${js(LEAFLET.css)}, jsSrc=${js(LEAFLET.js)},
        geo=${js(collection)}, id=${js(mapId)},
        lbl=${js(popupField)}, navView=${js(clickView)};

  /* Loader helpers */
  function haveCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(haveCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(haveJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  /* Main */
  (async()=>{await loadCss(css);await loadJs(jsSrc);
    const map=L.map(id).setView([${lat},${lng}],${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution:'&copy; OpenStreetMap' }).addTo(map);

    const layer=L.geoJSON(geo,{
      onEachFeature:function(f,l){
        if(lbl&&f.properties&&f.properties[lbl]!==undefined)
          l.bindPopup(String(f.properties[lbl]));
        if(navView&&f.properties&&f.properties.__id){
          l.on('click',()=>{window.location.href='/view/'+navView+'?id='+f.properties.__id;});
        }
      }
    }).addTo(map);

    if(layer.getLayers().length) map.fitBounds(layer.getBounds(),{maxZoom:14});
  })();
})();
</script>`;
  },
};

module.exports = { compositeMapTemplate };
/* eslint-enable max-lines-per-function */