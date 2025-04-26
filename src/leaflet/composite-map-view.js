/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * Saltcorn view-template “composite_map” – plots every geometry row returned by
 * the query on a single Leaflet map and now supports pop-ups and click-through
 * navigation.
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

/* Saltcorn 0.x / 1.x dual-export helpers */
const TableCls =
  Table && typeof Table.findOne === 'function' ? Table
    : Table && Table.Table ? Table.Table : Table;

const ViewMod = require('@saltcorn/data/models/view');
const ViewCls =
  ViewMod && typeof ViewMod.findOne === 'function' ? ViewMod
    : ViewMod && ViewMod.View ? ViewMod.View : ViewMod;

/**
 * String-safe JSON embedder – prevents </script> break-outs.
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v ?? null).replace(/</g, '\\u003c');
}

/* ───────────────────────────── Config helpers ─────────────────────────── */

/**
 * Build the configuration-form fields.
 *
 * @param {import('@saltcorn/types').Field[]} fields
 * @returns {import('@saltcorn/types').Field[]}
 */
function buildConfigFields(fields) {
  const fieldOpts = fields.map((f) => f.name);

  return [
    {
      name: 'geometry_field',
      label: 'Geometry column',
      type: 'String',
      required: true,
      attributes: { options: fieldOpts },
    },
    {
      name: 'popup_field',
      label: 'Popup text field (optional)',
      type: 'String',
      required: false,
      attributes: { options: fieldOpts },
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
 * Try every known call-signature to identify the target Table.
 *
 * @param {unknown[]} sig
 * @returns {Promise<import('@saltcorn/types').Table|undefined>}
 */
async function resolveTable(sig) {
  const [first, second] = sig;

  /* Direct numeric id? */
  const num = Number(
    typeof first === 'number' || typeof first === 'string' ? first : second,
  );
  if (Number.isFinite(num) && num > 0) {
    const t = await TableCls.findOne({ id: num });
    if (t) return t;
  }

  const req =
    first && typeof first === 'object' && 'method' in first ? first : undefined;
  if (!req) return undefined;

  if (req.view?.table_id) return TableCls.findOne({ id: req.view.table_id });
  if (req.query?.table)   return TableCls.findOne({ name: req.query.table });

  const vn =
    (req.params && (req.params.name || req.params.viewname || req.params[0])) ||
    undefined;
  if (vn) {
    const vw = await ViewCls.findOne({ name: vn });
    if (vw) return TableCls.findOne({ id: vw.table_id });
  }

  return undefined;
}

/**
 * Universal configuration workflow.
 *
 * @param {...unknown} sig
 * @returns {import('@saltcorn/data/models/workflow').Workflow}
 */
function configurationWorkflow(...sig) {
  return new Workflow({
    steps: [
      {
        name: 'settings',
        form: async () => {
          const tbl   = await resolveTable(sig);
          const flds  = tbl ? await tbl.getFields() : [];
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
   * @param {number|string} tableRef  Table id or name.
   * @param {string} _viewname        (unused)
   * @param {{geometry_field:string,height?:number,popup_field?:string,click_view?:string}} cfg
   * @param {object} state
   * @returns {Promise<string>}
   */
  async run(tableRef, _viewname, cfg, state) {
    const geomCol    = cfg.geometry_field || 'geom';
    const popupField = cfg.popup_field  || '';
    const clickView  = cfg.click_view   || '';
    const height     = Number(cfg.height) || 300;

    const where =
      typeof tableRef === 'number' ? { id: tableRef } : { name: tableRef };
    const table = await TableCls.findOne(where);
    if (!table) return '<div class="alert alert-danger">Table not found.</div>';

    const rows = await table.getRows(state);

    /* Build FeatureCollection */
    const features = [];
    for (const row of rows) {
      const gj = wktToGeoJSON(row[geomCol]);
      if (!gj) continue;

      features.push({
        type: 'Feature',
        properties: { __id: row.id, ...row },
        geometry:   gj.type === 'Feature' ? gj.geometry : gj,
      });
    }

    const collection = { type: 'FeatureCollection', features };
    const mapId      = `cmp_${Math.random().toString(36).slice(2)}`;
    const { lat, lng, zoom } = DEFAULT_CENTER;

    /* ─────── HTML + JS payload ─────── */
    return `
<div id="${mapId}" class="border rounded" style="height:${height}px;"></div>
<script>
(function(){
  const css=${js(LEAFLET.css)}, jsSrc=${js(LEAFLET.js)},
        geo=${js(collection)}, id=${js(mapId)},
        lbl=${js(popupField)}, navView=${js(clickView)};

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

    const layer=L.geoJSON(geo,{
      onEachFeature:function(f,l){
        if(lbl&&f.properties&&f.properties[lbl]!==undefined)
          l.bindPopup(String(f.properties[lbl]));
        if(navView&&f.properties&&f.properties.__id){
          l.on('click',()=>{window.location.href='/view/'+navView+'?id='+f.properties.__id;});
        }
      }
    }).addTo(m);

    if(layer.getLayers().length) m.fitBounds(layer.getBounds(),{maxZoom:14});
  })();
})();
</script>`;
  },
};

module.exports = { compositeMapTemplate };
/* eslint-enable max-lines-per-function */