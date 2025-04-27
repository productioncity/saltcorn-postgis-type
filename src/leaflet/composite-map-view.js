/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * View-template “composite_map” – plots every geometry row returned by the
 * query on one interactive Leaflet map.  Version 4 adds **Leaflet-providers**
 * integration with an administrator friendly drop-down list populated
 * automatically from the bundled providers script.
 *
 * v4 – 2025-04-27
 *   • Providers parsed server-side via `vm` – zero maintenance.
 *   • 2-page wizard: ① Data & Pop-ups, ② Tile Provider (with drop-down).
 *   • Only loads the heavy providers JS in the browser when actually used.
 *   • Full debug instrumentation – gated by `PLUGIN_DEBUG`.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable max-lines-per-function */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const dbg = require('../utils/debug');

const Table    = require('@saltcorn/data/models/table');
const Workflow = require('@saltcorn/data/models/workflow');
const Form     = require('@saltcorn/data/models/form');

const { wktToGeoJSON } = require('../utils/geometry');
const {
  LEAFLET,
  LEAFLET_PROVIDERS,
  DEFAULT_CENTER,
  PLUGIN_DEBUG,
} = require('../constants');

/* Optional: runtime Handlebars (lazy-loaded via CDN in browser) */
const HANDLEBARS_CDN =
  'https://cdn.jsdelivr.net/npm/handlebars@4.7.7/dist/handlebars.min.js';

/* ─────────────────── Saltcorn 0.x / 1.x compatibility ────────────────── */

const TableCls = Table?.findOne ? Table : Table?.Table ? Table.Table : Table;

const ViewMod = require('@saltcorn/data/models/view');
const ViewCls = ViewMod?.findOne ? ViewMod : ViewMod?.View ? ViewMod.View : ViewMod;

/* ───────────────────────────── helpers ──────────────────────────────── */

/**
 * JS-safe JSON literal helper.
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v ?? null).replace(/</g, '\\u003c');
}

/**
 * Lazy loader that parses `leaflet-providers.js` once and returns an alphabetic
 * array of provider keys accepted by `L.tileLayer.provider()`.
 *
 * The parsing happens in a sandboxed `vm` context with a stub Leaflet object
 * so the upstream add-on registers its provider catalogue without polluting
 * the real environment.  The result is cached for the lifetime of the process.
 *
 * @returns {string[]}
 */
function getProviderOptions() {
  if (getProviderOptions._cache) return getProviderOptions._cache;

  try {
    const filePath = path.resolve(
      __dirname,
      '../../public/leaflet-providers/leaflet-providers.js',
    );
    const code = fs.readFileSync(filePath, 'utf8');

    /* Minimal Leaflet stub – just enough for the add-on to attach providers. */
    const stubL = {
      Util: { extend: (...objs) => Object.assign({}, ...objs) },
      TileLayer: {
        extend: () => function () {}, // noop constructor
        Provider: {},
      },
    };

    /* The upstream IIFE uses `this` as the root argument. */
    const sandbox = {
      L: stubL,
      console,                 // allow debugging inside the sandbox
      define: undefined,       // pretend AMD absent
      modules: undefined,
      module: {},              // CommonJS test will fail (uses `modules`)
      exports: {},
      require: () => ({}),     // “leaflet” shim
    };
    vm.createContext(sandbox);

    /* Execute the add-on – this will populate `L.TileLayer.Provider.providers`. */
    vm.runInContext(code, sandbox, { filename: 'leaflet-providers.js' });

    const providersObj = sandbox.L.TileLayer.Provider.providers || {};
    /** @type {string[]} */
    const out = [];

    for (const [pName, pObj] of Object.entries(providersObj)) {
      out.push(pName);
      if (pObj && pObj.variants) {
        for (const v of Object.keys(pObj.variants)) out.push(`${pName}.${v}`);
      }
    }
    out.sort((a, b) => a.localeCompare(b));

    dbg.info('Leaflet provider list parsed', { count: out.length });
    getProviderOptions._cache = out;
    return out;
  } catch (err) {
    dbg.error('Failed to parse leaflet-providers list – falling back.', err);
    getProviderOptions._cache = [];
    return [];
  }
}

/**
 * Derive <select> options from table fields.
 *
 * @param {import('@saltcorn/types').Field[]} fields
 * @returns {import('@saltcorn/types').TypeAttribute[]}
 */
function buildDataFields(fields) {
  const opts = fields.map((f) => f.name);
  dbg.debug('buildDataFields()', { opts });

  return [
    /* ───── BASIC ───── */
    {
      name: 'geometry_field',
      label: 'Geometry column',
      type: 'String',
      required: true,
      attributes: { options: opts },
    },
    {
      name: 'popup_field',
      label: 'Popup text field',
      sublabel:
        'Simple text from this column. Ignored when “Popup template” is set.',
      type: 'String',
      attributes: { options: opts },
    },
    {
      name: 'popup_template',
      label: 'Popup Handlebars template',
      sublabel:
        'Optional. Uses Handlebars ‑ row fields are available directly. ' +
        'Examples: {{name}}, {{#if status}}{{status}}{{/if}}.',
      type: 'String',
      attributes: { input_type: 'textarea', rows: 3 },
    },
    {
      name: 'icon_template',
      label: 'Point icon template',
      sublabel:
        'Optional. Handlebars supported. ' +
        'Return HTML (e.g. <i class="fas fa-car"></i>) or an image URL. ' +
        'Examples: {{icon_html}} or {{icon_url}}.',
      type: 'String',
      attributes: { input_type: 'textarea', rows: 2 },
    },
    {
      name: 'click_view',
      label: 'Navigate to view on click (optional)',
      sublabel: 'Leave blank for no navigation. Row id is passed as ?id=…',
      type: 'String',
    },

    /* ───── CREATE NEW ROW ───── */
    {
      name: 'show_create',
      label: 'Show “Create new row” button',
      type: 'Bool',
      default: false,
    },
    {
      name: 'create_view',
      label: 'Target create view',
      sublabel: 'Ignored if the above toggle is off.',
      type: 'String',
    },

    /* ───── OPTIONS ───── */
    {
      name: 'order_field',
      label: 'Default order by',
      type: 'String',
      attributes: { options: opts },
    },
    {
      name: 'order_desc',
      label: 'Descending order',
      type: 'Bool',
      default: false,
    },
    {
      name: 'group_field',
      label: 'Group by column (optional)',
      sublabel:
        'Colour markers by discrete values in this column. ' +
        'Ignored when an Icon template is provided.',
      type: 'String',
      attributes: { options: opts },
    },
    {
      name: 'row_limit',
      label: 'Maximum rows (0 = unlimited)',
      type: 'Integer',
      default: 0,
      attributes: { min: 0 },
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
 * Second wizard page – tile provider settings (drop-down).
 *
 * @returns {import('@saltcorn/types').TypeAttribute[]}
 */
function buildProviderFields() {
  const providerOptions = getProviderOptions();
  dbg.debug('buildProviderFields()', { providerOptionsSample: providerOptions.slice(0, 5) });

  return [
    {
      name: 'tile_provider_enabled',
      label: 'Enable Leaflet-providers basemap',
      sublabel: 'When OFF, the default OpenStreetMap tiles are used.',
      type: 'Bool',
      default: false,
    },
    {
      name: 'tile_provider_name',
      label: 'Provider key',
      sublabel:
        'Choose a provider key from the list.  “Provider.Variant” entries ' +
        'use the named variant.',
      type: 'String',
      required: true,
      attributes: { options: providerOptions },
      showIf: { tile_provider_enabled: true }, // Saltcorn ≥1.0
    },
    {
      name: 'tile_provider_options',
      label: 'Provider options (JSON)',
      sublabel:
        'Optional raw JSON for custom API keys, attribution overrides, etc.  ' +
        'Example: {"apikey":"YOUR_KEY_HERE"}.',
      type: 'String',
      attributes: { input_type: 'textarea', rows: 4 },
      showIf: { tile_provider_enabled: true },
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

  /* 1 – Direct numeric id? */
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

  /* 2 – Request object variants */
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
    (req.params &&
      (req.params.name || req.params.viewname || req.params[0])) ||
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
 * configuration_workflow – two-step wizard.
 */
function configurationWorkflow(...sig) {
  dbg.info('configurationWorkflow()', { rawSignature: sig });

  return new Workflow({
    steps: [
      {
        name: 'Data & Pop-ups',
        form: async () => {
          const tbl = await resolveTable(sig);
          const flds = tbl ? await tbl.getFields() : [];
          dbg.info('Config form fields (page 1)', { count: flds.length });
          return new Form({ fields: buildDataFields(flds) });
        },
      },
      {
        name: 'Tile Provider',
        form: async () => {
          dbg.info('Config form (page 2) – tile provider');
          return new Form({ fields: buildProviderFields() });
        },
      },
    ],
  });
}

/* ───────────────────────────── View template ─────────────────────────── */

const compositeMapTemplate = {
  name: 'composite_map',
  description:
    'Plots every geometry row from the query on a Leaflet map. Hover to ' +
    'see pop-ups – click/tap navigates (if configured).',
  display_state_form: false,
  get_state_fields: () => [],
  configuration_workflow: configurationWorkflow,

  /**
   * Runtime renderer.
   *
   * @param {number|string} tableRef
   * @param {string} viewname
   * @param {object} cfg
   * @param {object} state
   * @returns {Promise<string>}
   */
  async run(tableRef, viewname, cfg, state) {
    dbg.info('composite_map.run()', { tableRef, cfg, state });

    /* ───── Config unwrap (page 1) ───── */
    const geomCol       = cfg.geometry_field || 'geom';
    const popupField    = cfg.popup_field || '';
    const popupTemplate = cfg.popup_template || '';
    const iconTemplate  = cfg.icon_template || '';

    const clickView = cfg.click_view || '';
    const height    = Number(cfg.height) || 300;

    const showCreate = cfg.show_create && cfg.create_view;
    const createView = cfg.create_view || '';

    const orderField = cfg.order_field || '';
    const orderDesc  = !!cfg.order_desc;
    const groupField = cfg.group_field || '';
    const rowLimit   = Number(cfg.row_limit) || 0;

    /* ───── Config unwrap (page 2) ───── */
    const providerEnabled = !!cfg.tile_provider_enabled;
    const providerName    = cfg.tile_provider_name || '';
    let   providerOpts    = {};
    if (providerEnabled && cfg.tile_provider_options) {
      try {
        providerOpts = JSON.parse(cfg.tile_provider_options);
      } catch (e) {
        dbg.warn('Invalid JSON in tile_provider_options – ignored.', e);
      }
    }
    dbg.debug('Provider settings', { providerEnabled, providerName, providerOpts });

    /* ───── Fetch table + rows ───── */
    const where =
      typeof tableRef === 'number' ? { id: tableRef } : { name: tableRef };
    const table = await TableCls.findOne(where);
    if (!table) {
      dbg.error('Table not found at run-time', { where });
      return '<div class="alert alert-danger">Table not found.</div>';
    }

    let rows = await table.getRows(state);
    dbg.info('Rows fetched', { count: rows.length });

    /* ───── Optional ordering ───── */
    if (orderField) {
      dbg.debug('Applying default order', { orderField, orderDesc });
      rows = rows.sort((a, b) => {
        if (a[orderField] === b[orderField]) return 0;
        return a[orderField] > b[orderField] ? 1 : -1;
      });
      if (orderDesc) rows.reverse();
    }

    /* ───── Row-limit ───── */
    if (rowLimit > 0 && rows.length > rowLimit) {
      dbg.debug('Row limit applied', { rowLimit });
      rows = rows.slice(0, rowLimit);
    }

    /* ───── Build FeatureCollection ───── */
    const features = [];
    for (const row of rows) {
      const gj = wktToGeoJSON(row[geomCol]);
      if (!gj) continue;

      features.push({
        type: 'Feature',
        properties: { __id: row.id, ...row },
        geometry: gj.type === 'Feature' ? gj.geometry : gj,
      });
    }
    dbg.info('Features built', { count: features.length });

    const collection = { type: 'FeatureCollection', features };
    const mapId = `cmp_${Math.random().toString(36).slice(2)}`;
    const { lat, lng, zoom } = DEFAULT_CENTER;

    /* ───── Pre-map HTML (create-row button) ───── */
    const createBtnHTML = showCreate
      ? `<div class="mb-2 text-end">
           <a class="btn btn-sm btn-primary"
              href="/view/${createView}?redirect=/view/${viewname}">
             <i class="fas fa-plus"></i>&nbsp;Create&nbsp;new&nbsp;row
           </a>
         </div>`
      : '';

    /* ───── HTML + JS payload ───── */
    return `
${createBtnHTML}
<div id="${mapId}" class="border rounded" style="height:${height}px;"></div>
<script>
(function(){
  /* ─── Config & constants (embedded server-side) ─── */
  const DBG=${js(PLUGIN_DEBUG)};
  const css=${js(LEAFLET.css)}, jsSrc=${js(LEAFLET.js)},
        hbJs=${js(HANDLEBARS_CDN)},
        providerJs=${js(LEAFLET_PROVIDERS.js)},
        geo=${js(collection)}, id=${js(mapId)},
        lbl=${js(popupField)}, navView=${js(clickView)},
        grp=${js(groupField)},
        tplSrc=${js(popupTemplate)}, iconTplSrc=${js(iconTemplate)},
        provEnabled=${js(providerEnabled)}, provName=${js(providerName)},
        provOpts=${js(providerOpts)};

  /* Loader helpers – ensure idempotent asset loading */
  function haveCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function haveJs(s){return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(haveCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(haveJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  /* Colour palette for group-by */
  const PALETTE=['red','blue','green','orange','purple','darkred','cadetblue',
                 'darkgreen','darkblue','darkpurple'];
  const grpColour={};

  /* ─────────────────────────── Main async bootstrap ───────────────────────── */
  (async()=>{await loadCss(css);await loadJs(jsSrc);
    if(tplSrc||iconTplSrc) await loadJs(hbJs);
    if(provEnabled) await loadJs(providerJs);

    const popupFn = (window.Handlebars&&tplSrc)?Handlebars.compile(tplSrc):null;
    const iconFn  = (window.Handlebars&&iconTplSrc)?Handlebars.compile(iconTplSrc):null;

    /* Map initialisation */
    const map=L.map(id).setView([${lat},${lng}],${zoom});

    /* Base layer */
    let baseLayer;
    if(provEnabled && window.L && L.tileLayer && L.tileLayer.provider && provName){
      try{
        baseLayer=L.tileLayer.provider(provName, provOpts).addTo(map);
      }catch(e){
        if(DBG)console.error('Provider load failed, falling back to OSM',e);
      }
    }
    if(!baseLayer){
      baseLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution:'&copy; OpenStreetMap contributors' }).addTo(map);
    }

    /* ─── Marker factory ─── */
    function buildMarker(f,latlng){
      /* 1 – Icon template overrides everything */
      if(iconFn){
        let html='';
        try{html=iconFn(f.properties);}catch(e){if(DBG)console.warn(e);}
        if(!html) return L.marker(latlng);

        /* Image URL vs inline HTML */
        if(/^(https?:)?\\/\\/.+\\.(png|jpe?g|gif|svg)$/i.test(html)){
          const icon=L.icon({iconUrl:html,iconSize:[28,28],iconAnchor:[14,28]});
          return L.marker(latlng,{icon});
        }
        const divI=L.divIcon({className:'',html,iconSize:[28,28],iconAnchor:[14,28]});
        return L.marker(latlng,{icon:divI});
      }

      /* 2 – Group colouring */
      if(grp&&f.properties){
        const g=f.properties[grp];
        if(!(g in grpColour)){
          grpColour[g]=PALETTE[Object.keys(grpColour).length%PALETTE.length];
        }
        const col=grpColour[g];
        const icon=L.divIcon({className:'',html:
          '<i class="fas fa-map-marker-alt" style="color:'+col+';font-size:1.5rem;"></i>',
          iconSize:[24,24],iconAnchor:[12,24]});
        return L.marker(latlng,{icon});
      }

      /* 3 – Default Leaflet blue */
      return L.marker(latlng);
    }

    /* ─── GeoJSON layer ─── */
    const layer=L.geoJSON(geo,{
      pointToLayer:function(f,latlng){return buildMarker(f,latlng);},
      style:function(f){
        if(iconFn) return {};
        if(!grp||!f.properties) return {};
        const g=f.properties[grp];
        if(!(g in grpColour)){
          grpColour[g]=PALETTE[Object.keys(grpColour).length%PALETTE.length];
        }
        return {color:grpColour[g]};
      },
      onEachFeature:function(f,l){
        /* ── Popup content ── */
        let popContent='';
        if(popupFn){
          try{popContent=popupFn(f.properties);}catch(e){if(DBG)console.warn(e);}
        }else if(lbl&&f.properties&&f.properties[lbl]!==undefined){
          popContent=String(f.properties[lbl]);
        }

        /* Hover/touch pop-ups */
        if(popContent){
          const show=function(e){
            try{
              const ll=e?.latlng|| (l.getBounds?l.getBounds().getCenter(): l.getLatLng?.());
              if(!ll) return;
              l.__pcHoverPopup=L.popup({closeButton:false,autoClose:true})
                                 .setLatLng(ll).setContent(popContent).openOn(map);
            }catch(err){if(DBG)console.error(err);}
          };
          const hide=function(){
            try{
              if(l.__pcHoverPopup){map.closePopup(l.__pcHoverPopup);l.__pcHoverPopup=null;}
            }catch(err){if(DBG)console.error(err);}
          };
          l.on('mouseover',show);
          l.on('mouseout',hide);
          l.on('touchstart',show);
          l.on('touchend touchcancel',hide);
        }

        /* Navigation click */
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