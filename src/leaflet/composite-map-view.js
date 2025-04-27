/**
 * composite-map-view.js
 * -----------------------------------------------------------------------------
 * View-template “composite_map”.
 *
 * Plots every geometry row returned by the query on a Leaflet map.  
 * Administrators can optionally select **any** of the 200 + community basemaps
 * provided by the bundled Leaflet-providers add-on.  The heavy provider JS is
 * loaded in the browser only when a view is configured to use it.
 *
 * v6.0 – 2025-04-27
 *   • Added full *opt-in* support for the “leaflet-locatecontrol” add-on.  
 *     A fourth wizard page “Locate” lets administrators enable / disable the
 *     feature and customise key behaviour (follow, fly-to, etc.).  When OFF
 *     (default) the add-on is not loaded so there is **zero** overhead.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable max-lines-per-function */

const dbg = require('../utils/debug');

const Table     = require('@saltcorn/data/models/table');
const Workflow  = require('@saltcorn/data/models/workflow');
const Form      = require('@saltcorn/data/models/form');

const { wktToGeoJSON } = require('../utils/geometry');
const {
  LEAFLET,
  LEAFLET_PROVIDERS,
  LEAFLET_GESTURE,
  LEAFLET_LOCATE,
  DEFAULT_CENTER,
  PLUGIN_DEBUG,
} = require('../constants');

/* Optional: runtime Handlebars (lazy-loaded via CDN in the browser) */
const HANDLEBARS_CDN =
  'https://cdn.jsdelivr.net/npm/handlebars@4.7.7/dist/handlebars.min.js';

/* ─────────────────── Saltcorn 0.x / 1.x compatibility ─────────────────── */

const TableCls = Table?.findOne ? Table : Table?.Table ? Table.Table : Table;

const ViewMod = require('@saltcorn/data/models/view');
const ViewCls = ViewMod?.findOne ? ViewMod : ViewMod?.View ? ViewMod.View : ViewMod;

/* ────────────────────────── helpers ────────────────────────── */

/**
 * JS-safe JSON stringifier for direct `<script>` embedding.
 *
 * @param {unknown} v
 * @returns {string}
 */
function js(v) {
  return JSON.stringify(v ?? null).replace(/</g, '\\u003c');
}

/* ------------------------------------------------------------------------- */
/* Static provider list – drop-in from leaflet-providers catalogue           */
/* ------------------------------------------------------------------------- */
/* The list is hard-coded to avoid heavy parsing at start-up.                */
const PROVIDERS = Object.freeze([
  /* --- AzureMaps --- */
  'AzureMaps.MicrosoftImagery',
  'AzureMaps.MicrosoftBaseDarkGrey',
  'AzureMaps.MicrosoftBaseRoad',
  'AzureMaps.MicrosoftBaseHybridRoad',
  'AzureMaps.MicrosoftTerraMain',
  'AzureMaps.MicrosoftWeatherInfraredMain',
  'AzureMaps.MicrosoftWeatherRadarMain',

  /* --- BaseMapDE --- */
  'BaseMapDE.Color',
  'BaseMapDE.Grey',

  /* --- BasemapAT --- */
  'BasemapAT.basemap',
  'BasemapAT.grau',
  'BasemapAT.overlay',
  'BasemapAT.terrain',
  'BasemapAT.surface',
  'BasemapAT.highdpi',
  'BasemapAT.orthofoto',

  /* --- CartoDB --- */
  'CartoDB.Positron',
  'CartoDB.PositronNoLabels',
  'CartoDB.PositronOnlyLabels',
  'CartoDB.DarkMatter',
  'CartoDB.DarkMatterNoLabels',
  'CartoDB.DarkMatterOnlyLabels',
  'CartoDB.Voyager',
  'CartoDB.VoyagerNoLabels',
  'CartoDB.VoyagerOnlyLabels',
  'CartoDB.VoyagerLabelsUnder',

  /* --- CyclOSM & misc singletons --- */
  'CyclOSM',
  'FreeMapSK',
  'MtbMap',
  'OpenAIP',
  'OpenFireMap',
  'OpenRailwayMap',
  'OpenSeaMap',
  'OpenSnowMap.pistes',
  'OPNVKarte',
  'SafeCast',

  /* --- Esri --- */
  'Esri.WorldStreetMap',
  'Esri.WorldTopoMap',
  'Esri.WorldImagery',
  'Esri.WorldTerrain',
  'Esri.WorldShadedRelief',
  'Esri.WorldPhysical',
  'Esri.OceanBasemap',
  'Esri.NatGeoWorldMap',
  'Esri.WorldGrayCanvas',

  /* --- GeoportailFrance --- */
  'GeoportailFrance.plan',
  'GeoportailFrance.parcels',
  'GeoportailFrance.orthos',

  /* --- HikeBike --- */
  'HikeBike.HikeBike',
  'HikeBike.HillShading',

  /* --- HERE (legacy) --- */
  'HERE.normalDay',
  'HERE.normalDayGrey',
  'HERE.normalNight',
  'HERE.reducedDay',
  'HERE.hybridDay',
  'HERE.pedestrianDay',

  /* --- HERE v3 --- */
  'HEREv3.normalDay',
  'HEREv3.normalNight',
  'HEREv3.hybridDay',
  'HEREv3.terrainDay',
  'HEREv3.pedestrianNight',

  /* --- Jawg --- */
  'Jawg.Streets',
  'Jawg.Terrain',
  'Jawg.Lagoon',
  'Jawg.Sunny',
  'Jawg.Dark',
  'Jawg.Light',
  'Jawg.Matrix',

  /* --- JusticeMap --- */
  'JusticeMap.income',
  'JusticeMap.americanIndian',
  'JusticeMap.asian',
  'JusticeMap.black',
  'JusticeMap.hispanic',
  'JusticeMap.multi',
  'JusticeMap.nonWhite',
  'JusticeMap.white',
  'JusticeMap.plurality',

  /* --- MapTilesAPI --- */
  'MapTilesAPI.OSMEnglish',
  'MapTilesAPI.OSMFrancais',
  'MapTilesAPI.OSMEspagnol',

  /* --- MapTiler Cloud --- */
  'MapTiler.Streets',
  'MapTiler.Basic',
  'MapTiler.Bright',
  'MapTiler.Pastel',
  'MapTiler.Positron',
  'MapTiler.Hybrid',
  'MapTiler.Toner',
  'MapTiler.Topo',
  'MapTiler.Voyager',
  'MapTiler.Ocean',
  'MapTiler.Backdrop',
  'MapTiler.Dataviz',
  'MapTiler.DatavizLight',
  'MapTiler.DatavizDark',
  'MapTiler.Aquarelle',
  'MapTiler.Landscape',
  'MapTiler.Openstreetmap',
  'MapTiler.Outdoor',
  'MapTiler.Satellite',
  'MapTiler.Winter',

  /* --- NASAGIBS --- */
  'NASAGIBS.ModisTerraTrueColorCR',
  'NASAGIBS.ModisTerraBands367CR',
  'NASAGIBS.ViirsEarthAtNight2012',
  'NASAGIBS.ModisTerraLSTDay',
  'NASAGIBS.ModisTerraSnowCover',
  'NASAGIBS.ModisTerraAOD',
  'NASAGIBS.ModisTerraChlorophyll',

  /* --- nlmaps --- */
  'nlmaps.standaard',
  'nlmaps.pastel',
  'nlmaps.grijs',
  'nlmaps.water',
  'nlmaps.luchtfoto',

  /* --- NLS (UK Historic) --- */
  'NLS.osgb63k1885',
  'NLS.osgb1888',
  'NLS.osgb10k1888',
  'NLS.osgb1919',
  'NLS.osgb25k1937',
  'NLS.osgb63k1955',
  'NLS.oslondon1k1893',

  /* --- OneMap Singapore --- */
  'OneMapSG.Default',
  'OneMapSG.Night',
  'OneMapSG.Original',
  'OneMapSG.Grey',
  'OneMapSG.LandLot',

  /* --- OpenStreetMap & variants --- */
  'OpenStreetMap',
  'OpenStreetMap.Mapnik',
  'OpenStreetMap.DE',
  'OpenStreetMap.CH',
  'OpenStreetMap.France',
  'OpenStreetMap.HOT',
  'OpenStreetMap.BZH',
  'OpenStreetMap.CAT',

  /* --- OpenWeatherMap (overlay tiles) --- */
  'OpenWeatherMap.Clouds',
  'OpenWeatherMap.CloudsClassic',
  'OpenWeatherMap.Precipitation',
  'OpenWeatherMap.PrecipitationClassic',
  'OpenWeatherMap.Rain',
  'OpenWeatherMap.RainClassic',
  'OpenWeatherMap.Pressure',
  'OpenWeatherMap.PressureContour',
  'OpenWeatherMap.Wind',
  'OpenWeatherMap.Temperature',
  'OpenWeatherMap.Snow',

  /* --- Stadia --- */
  'Stadia.AlidadeSmooth',
  'Stadia.AlidadeSmoothDark',
  'Stadia.AlidadeSatellite',
  'Stadia.OSMBright',
  'Stadia.Outdoors',
  'Stadia.StamenToner',
  'Stadia.StamenTonerBackground',
  'Stadia.StamenTonerLines',
  'Stadia.StamenTonerLabels',
  'Stadia.StamenTonerLite',
  'Stadia.StamenWatercolor',
  'Stadia.StamenTerrain',
  'Stadia.StamenTerrainBackground',
  'Stadia.StamenTerrainLabels',
  'Stadia.StamenTerrainLines',

  /* --- Swiss Federal Geoportal --- */
  'SwissFederalGeoportal.NationalMapColor',
  'SwissFederalGeoportal.NationalMapGrey',
  'SwissFederalGeoportal.SWISSIMAGE',

  /* --- Thunderforest --- */
  'Thunderforest.OpenCycleMap',
  'Thunderforest.Transport',
  'Thunderforest.TransportDark',
  'Thunderforest.SpinalMap',
  'Thunderforest.Landscape',
  'Thunderforest.Outdoors',
  'Thunderforest.Pioneer',
  'Thunderforest.MobileAtlas',
  'Thunderforest.Neighbourhood',

  /* --- TomTom --- */
  'TomTom.Basic',
  'TomTom.Hybrid',
  'TomTom.Labels',

  /* --- TopPlusOpen (DE) --- */
  'TopPlusOpen.Color',
  'TopPlusOpen.Grey',

  /* --- USGS --- */
  'USGS.USTopo',
  'USGS.USImagery',
  'USGS.USImageryTopo',

  /* --- WaymarkedTrails --- */
  'WaymarkedTrails.hiking',
  'WaymarkedTrails.cycling',
  'WaymarkedTrails.mtb',
  'WaymarkedTrails.slopes',
  'WaymarkedTrails.riding',
  'WaymarkedTrails.skating',
]);

/**
 * Provider list accessor.  Wrapper future-proofs for later dynamic parsing.
 * @returns {string[]}
 */
function getProviderOptions() {
  return PROVIDERS;
}

/* ─────────────────────── wizard field builders ─────────────────────── */

/**
 * Wizard page 1 – data & pop-up options.
 *
 * @param {import('@saltcorn/types').Field[]} fields
 * @returns {import('@saltcorn/types').TypeAttribute[]}
 */
function buildDataFields(fields) {
  const colOpts = fields.map((f) => f.name);

  return [
    /* ───── BASIC ───── */
    {
      name: 'geometry_field',
      label: 'Geometry column',
      type: 'String',
      required: true,
      attributes: { options: colOpts },
    },
    {
      name: 'popup_field',
      label: 'Popup text field',
      sublabel:
        'Simple text from this column (ignored when “Popup template” is set).',
      type: 'String',
      attributes: { options: colOpts },
    },
    {
      name: 'popup_template',
      label: 'Popup Handlebars template',
      sublabel:
        'Optional. Uses Handlebars – row fields are available directly, e.g. ' +
        '{{name}} or {{#if status}}{{status}}{{/if}}.',
      type: 'String',
      attributes: { input_type: 'textarea', rows: 3 },
    },
    {
      name: 'icon_template',
      label: 'Point icon template',
      sublabel:
        'Optional Handlebars.  Return HTML (e.g. <i class="…">) *or* an image ' +
        'URL.  Examples: {{icon_html}} or {{icon_url}}.',
      type: 'String',
      attributes: { input_type: 'textarea', rows: 2 },
    },
    {
      name: 'click_view',
      label: 'Navigate to view on click (optional)',
      sublabel: 'Leave blank for no navigation.  Row id is passed as ?id=…',
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
      sublabel: 'Ignored if the toggle above is OFF.',
      type: 'String',
    },

    /* ───── MISC OPTIONS ───── */
    {
      name: 'order_field',
      label: 'Default order by',
      type: 'String',
      attributes: { options: colOpts },
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
        'Colour markers by discrete values in this column (ignored when an ' +
        'Icon template is provided).',
      type: 'String',
      attributes: { options: colOpts },
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
 * Wizard page 2 – tile provider settings.
 * @returns {import('@saltcorn/types').TypeAttribute[]}
 */
function buildProviderFields() {
  const providerOptions = getProviderOptions();
  const safeOptions =
    providerOptions.length > 0
      ? providerOptions
      : ['(leaflet-providers catalogue unavailable)'];

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
      type: 'String',
      required: providerOptions.length > 0,
      attributes: { options: safeOptions },
      showIf: { tile_provider_enabled: true },
    },
    {
      name: 'tile_provider_options',
      label: 'Provider options (JSON)',
      sublabel:
        'Optional raw JSON for API keys or attribution overrides.  Example: ' +
        '{"apikey":"YOUR_KEY"}',
      type: 'String',
      attributes: { input_type: 'textarea', rows: 4 },
      showIf: { tile_provider_enabled: true },
    },
  ];
}

/**
 * Wizard page 3 – interaction settings.
 * @returns {import('@saltcorn/types').TypeAttribute[]}
 */
function buildInteractionFields() {
  return [
    {
      name: 'gesture_handling_enabled',
      label: 'Enable touch “gesture handling”',
      sublabel:
        'Adds the tiny leaflet-gesture-handling plug-in which forces two-finger ' +
        'panning and ⌘ / Ctrl + scroll zoom.  Greatly reduces accidental ' +
        'nuisance on mobile.  Adds ~3 KB when enabled.',
      type: 'Bool',
      default: false,
    },
  ];
}

/**
 * Wizard page 4 – geolocation locate-control settings.
 * @returns {import('@saltcorn/types').TypeAttribute[]}
 */
function buildLocateFields() {
  return [
    {
      name: 'locate_enabled',
      label: 'Enable “Locate me” control',
      type: 'Bool',
      default: false,
    },
    {
      name: 'locate_position',
      label: 'Control position',
      type: 'String',
      attributes: {
        options: ['topleft', 'topright', 'bottomleft', 'bottomright'],
      },
      default: 'topleft',
      showIf: { locate_enabled: true },
    },
    {
      name: 'locate_follow',
      label: 'Auto-follow user position',
      type: 'Bool',
      default: true,
      showIf: { locate_enabled: true },
    },
    {
      name: 'locate_keep_zoom',
      label: 'Keep current zoom level',
      type: 'Bool',
      default: false,
      showIf: { locate_enabled: true },
    },
    {
      name: 'locate_fly_to',
      label: 'Use smooth fly-to animation',
      type: 'Bool',
      default: false,
      showIf: { locate_enabled: true },
    },
    {
      name: 'locate_show_compass',
      label: 'Show compass bearing',
      type: 'Bool',
      default: true,
      showIf: { locate_enabled: true },
    },
  ];
}

/**
 * Resolve the Table irrespective of Saltcorn’s differing call signatures.
 *
 * @param {unknown[]} sig
 * @returns {Promise<import('@saltcorn/types').Table|undefined>}
 */
async function resolveTable(sig) {
  const [first, second] = sig;

  /* 1 – numeric ID directly supplied? */
  const maybeId = Number(
    typeof first === 'number' || typeof first === 'string' ? first : second,
  );
  if (Number.isFinite(maybeId) && maybeId > 0) {
    const t = await TableCls.findOne({ id: maybeId });
    if (t) return t;
  }

  /* 2 – Express req variants (0.x / 1.x) */
  const req =
    first && typeof first === 'object' && 'method' in first ? first : undefined;
  if (!req) return undefined;

  if (req.view?.table_id) return TableCls.findOne({ id: req.view.table_id });
  if (req.query?.table)   return TableCls.findOne({ name: req.query.table });

  /* 3 – Path param sniffing (view name → table) */
  const vn =
    (req.params &&
      (req.params.name || req.params.viewname || req.params[0])) ||
    undefined;
  if (vn) {
    const vw = await ViewCls.findOne({ name: vn });
    if (vw) return TableCls.findOne({ id: vw.table_id });
  }
  return undefined;
}

/**
 * Four-step configuration wizard.
 */
function configurationWorkflow(...sig) {
  return new Workflow({
    steps: [
      {
        name: 'Data & Pop-ups',
        form: async () => {
          const tbl  = await resolveTable(sig);
          const flds = tbl ? await tbl.getFields() : [];
          return new Form({ fields: buildDataFields(flds) });
        },
      },
      {
        name: 'Tile Provider',
        form: async () => new Form({ fields: buildProviderFields() }),
      },
      {
        name: 'Interaction',
        form: async () => new Form({ fields: buildInteractionFields() }),
      },
      {
        name: 'Locate',
        form: async () => new Form({ fields: buildLocateFields() }),
      },
    ],
  });
}

/* ─────────────────────────── View template ─────────────────────────── */

const compositeMapTemplate = {
  name: 'composite_map',
  description:
    'Plots the query result on a Leaflet map.  Hover shows pop-ups; ' +
    'click/tap can navigate to another view.',
  display_state_form: false,
  get_state_fields: () => [],
  configuration_workflow: configurationWorkflow,

  /**
   * Renderer.
   *
   * @param {number|string} tableRef
   * @param {string}        viewname
   * @param {object}        cfg
   * @param {object}        state
   * @returns {Promise<string>}
   */
  async run(tableRef, viewname, cfg, state) {
    dbg.info('composite_map.run()', { cfg });

    /* ───── page 1 config ───── */
    const geomCol       = cfg.geometry_field   || 'geom';
    const popupField    = cfg.popup_field      || '';
    const popupTemplate = cfg.popup_template   || '';
    const iconTemplate  = cfg.icon_template    || '';

    const clickView  = cfg.click_view || '';
    const height     = Number(cfg.height) || 300;

    const showCreate = cfg.show_create && cfg.create_view;
    const createView = cfg.create_view || '';

    const orderField = cfg.order_field || '';
    const orderDesc  = !!cfg.order_desc;
    const groupField = cfg.group_field || '';
    const rowLimit   = Number(cfg.row_limit) || 0;

    /* ───── page 2 config ───── */
    const providerEnabled = !!cfg.tile_provider_enabled;
    const providerName    = cfg.tile_provider_name || '';
    let   providerOpts    = {};
    if (providerEnabled && cfg.tile_provider_options) {
      try { providerOpts = JSON.parse(cfg.tile_provider_options); }
      // eslint-disable-next-line no-empty
      catch {} // ignore malformed JSON
    }

    /* ───── page 3 config ───── */
    const gestureEnabled = !!cfg.gesture_handling_enabled;

    /* ───── page 4 config ───── */
    const locateEnabled      = !!cfg.locate_enabled;
    const locateFollow       = !!cfg.locate_follow;
    const locateKeepZoom     = !!cfg.locate_keep_zoom;
    const locateFlyTo        = !!cfg.locate_fly_to;
    const locateShowCompass  = cfg.locate_show_compass !== undefined
                                ? !!cfg.locate_show_compass
                                : true;
    const locatePosition     = cfg.locate_position || 'topleft';

    const locateOpts = {
      position: locatePosition,
      setView: locateFollow ? 'untilPanOrZoom' : 'once',
      keepCurrentZoomLevel: locateKeepZoom,
      showCompass: locateShowCompass,
      flyTo: locateFlyTo,
    };

    /* ───── fetch rows ───── */
    const table = await TableCls.findOne(
      typeof tableRef === 'number' ? { id: tableRef } : { name: tableRef },
    );
    if (!table) return '<div class="alert alert-danger">Table not found.</div>';

    let rows = await table.getRows(state);

    /* order / limit on server side for speed */
    if (orderField) {
      rows.sort((a, b) =>
        a[orderField] === b[orderField]
          ? 0
          : a[orderField] > b[orderField] ? 1 : -1,
      );
      if (orderDesc) rows.reverse();
    }
    if (rowLimit > 0) rows = rows.slice(0, rowLimit);

    /* GeoJSON FeatureCollection */
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
    const collection = { type: 'FeatureCollection', features };

    /* ───── HTML scaffold ───── */
    const mapId = `cmp_${Math.random().toString(36).slice(2)}`;
    const { lat, lng, zoom } = DEFAULT_CENTER;

    const createBtn = showCreate
      ? `<div class="mb-2 text-end">
           <a class="btn btn-sm btn-primary"
              href="/view/${createView}?redirect=/view/${viewname}">
             <i class="fas fa-plus"></i>&nbsp;Create&nbsp;new&nbsp;row
           </a>
         </div>`
      : '';

    return `
${createBtn}
<div id="${mapId}" class="border rounded" style="height:${height}px;"></div>

<script>
(function(){
  const DBG=${js(PLUGIN_DEBUG)};
  const css=${js(LEAFLET.css)}, jsSrc=${js(LEAFLET.js)},
        hbSrc=${js(HANDLEBARS_CDN)}, providersSrc=${js(LEAFLET_PROVIDERS.js)},
        gestureSrc=${js(LEAFLET_GESTURE.js)},
        locateCss=${js(LEAFLET_LOCATE.css)}, locateJs=${js(LEAFLET_LOCATE.js)},
        geo=${js(collection)}, mapId=${js(mapId)},
        lbl=${js(popupField)}, grp=${js(groupField)},
        tplSrc=${js(popupTemplate)}, iconTplSrc=${js(iconTemplate)},
        navView=${js(clickView)},
        provEnabled=${js(providerEnabled)}, provName=${js(providerName)},
        provOpts=${js(providerOpts)}, gestureEnabled=${js(gestureEnabled)},
        locateEnabled=${js(locateEnabled)}, locateOpts=${js(locateOpts)};

  /* dynamic loaders */
  function hasCss(h){return !!document.querySelector('link[href="'+h+'"]');}
  function hasJs(s){ return !!(document._loadedScripts&&document._loadedScripts[s]);}
  function loadCss(h){return new Promise(r=>{if(hasCss(h))return r();
    const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.onload=r;
    document.head.appendChild(l);});}
  function loadJs(s){return new Promise(r=>{if(hasJs(s))return r();
    const sc=document.createElement('script');sc.src=s;sc.async=true;sc.onload=function(){
      document._loadedScripts=document._loadedScripts||{};document._loadedScripts[s]=true;r();};
    document.head.appendChild(sc);});}

  const PALETTE=['red','blue','green','orange','purple','darkred','cadetblue',
                 'darkgreen','darkblue','darkpurple'];
  const grpColour={};

  (async()=>{
    await loadCss(css); await loadJs(jsSrc);
    if(tplSrc||iconTplSrc) await loadJs(hbSrc);
    if(provEnabled) await loadJs(providersSrc);
    if(gestureEnabled) await loadJs(gestureSrc);
    if(locateEnabled){ await loadCss(locateCss); await loadJs(locateJs); }

    const popupFn = window.Handlebars&&tplSrc ? Handlebars.compile(tplSrc) : null;
    const iconFn  = window.Handlebars&&iconTplSrc ? Handlebars.compile(iconTplSrc) : null;

    const mapOpts = gestureEnabled ? { gestureHandling:true } : {};
    const map = L.map(mapId, mapOpts).setView([${lat},${lng}],${zoom});

    /* base layer */
    let base;
    if(provEnabled && L.tileLayer.provider && provName){
      try{ base=L.tileLayer.provider(provName, provOpts).addTo(map); }
      catch(e){ if(DBG)console.error('Provider failed', e); }
    }
    if(!base){
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'&copy; OpenStreetMap contributors'
      }).addTo(map);
    }

    /* marker factory */
    function makeMarker(f, latlng){
      if(iconFn){
        let html='';
        try{ html=iconFn(f.properties); }catch(e){ if(DBG)console.warn(e); }
        if(!html) return L.marker(latlng);
        if(/^(https?:)?\\/\\/.+\\.(png|jpe?g|gif|svg)$/i.test(html)){
          return L.marker(latlng,{
            icon:L.icon({iconUrl:html,iconSize:[28,28],iconAnchor:[14,28]})
          });
        }
        return L.marker(latlng,{
          icon:L.divIcon({className:'',html,iconSize:[28,28],iconAnchor:[14,28]})
        });
      }

      if(grp){
        const g=f.properties?.[grp];
        if(!(g in grpColour)){
          grpColour[g]=PALETTE[Object.keys(grpColour).length%PALETTE.length];
        }
        const col=grpColour[g];
        return L.marker(latlng,{
          icon:L.divIcon({className:'',html:
            '<i class="fas fa-map-marker-alt" style="color:'+col+';font-size:1.5rem;"></i>',
            iconSize:[24,24],iconAnchor:[12,24]})
        });
      }
      return L.marker(latlng);
    }

    /* main layer */
    const layer=L.geoJSON(geo,{
      pointToLayer:(f,latlng)=>makeMarker(f,latlng),
      style:(f)=>{
        if(iconFn||!grp) return {};
        const g=f.properties?.[grp];
        if(!(g in grpColour)){
          grpColour[g]=PALETTE[Object.keys(grpColour).length%PALETTE.length];
        }
        return { color:grpColour[g] };
      },
      onEachFeature:(f,l)=>{
        let pop='';
        if(popupFn){
          try{ pop=popupFn(f.properties); }catch(e){ if(DBG)console.warn(e); }
        }else if(lbl && f.properties?.[lbl]!==undefined){
          pop=String(f.properties[lbl]);
        }
        if(pop){
          const show=e=>{
            const ll=e?.latlng||(l.getBounds?.().getCenter?.());
            if(!ll) return;
            l.__p=L.popup({closeButton:false,autoClose:true})
                   .setLatLng(ll).setContent(pop).openOn(map);
          };
          const hide=()=>{ if(l.__p){ map.closePopup(l.__p); l.__p=null; } };
          l.on('mouseover',show).on('mouseout',hide)
           .on('touchstart',show).on('touchend touchcancel',hide);
        }

        if(navView && f.properties?.__id){
          l.on('click',()=>{ location.href='/view/'+navView+'?id='+f.properties.__id; });
        }
      }
    }).addTo(map);

    if(layer.getLayers().length) map.fitBounds(layer.getBounds(),{maxZoom:14});

    /* ───── locate control ───── */
    if(locateEnabled && L.control && L.control.locate){
      try{ L.control.locate(locateOpts).addTo(map); }
      catch(e){ if(DBG)console.error('Locate control failed',e); }
    }
  })();
})();
</script>`;
  },
};

module.exports = { compositeMapTemplate };
/* eslint-enable max-lines-per-function */