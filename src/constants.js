/**
 * constants.js
 * ---------------------------------------------------------------------------
 * Immutable constants shared across the Saltcorn PostGIS plug-in.
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0-1.0
 */

'use strict';

/* eslint-disable max-len */

/**
 * Should we output debug information.
 * Toggle once in production environments to silence all plug-in chatter.
 * @type {boolean}
 */
const PLUGIN_DEBUG = true;

/**
 * NPM package / plug-in slug – used for building public URLs.
 * @type {string}
 */
const PLUGIN_SLUG = 'saltcorn-postgis-type';

/**
 * Default SRID (EPSG:4326 – WGS-84 lat-lon).
 * @type {number}
 */
const DEFAULT_SRID = 4326;

/**
 * Allowed PostGIS dimensionality modifiers.
 * @type {ReadonlyArray<string>}
 */
const DIM_MODS = Object.freeze(['', 'Z', 'M', 'ZM']);

/**
 * Canonical geometry sub-types (upper-case) for validation.
 * @type {ReadonlyArray<string>}
 */
const BASE_GEOM_TYPES = Object.freeze([
  'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
  'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION',
  'CIRCULARSTRING', 'COMPOUNDCURVE', 'CURVEPOLYGON', 'MULTICURVE',
  'MULTISURFACE', 'POLYHEDRALSURFACE', 'TIN', 'TRIANGLE',
]);

/**
 * Fallback map centre = Sydney, Australia.
 * @type {{lat:number,lng:number,zoom:number}}
 */
const DEFAULT_CENTER = Object.freeze({
  lat: -33.8688,
  lng: 151.2093,
  zoom: 12,
});

/**
 * Local Leaflet 1.9.4 assets bundled inside the plug-in’s “public” folder.
 *
 * @typedef {Object} LeafletStatic
 * @property {string} css   – Absolute URL of leaflet.css
 * @property {string} js    – Absolute URL of leaflet.js
 * @property {() => string} header – Lazy helper returning a combined
 *                                    `<link>` + `<script>` tag block.
 */

/** @type {LeafletStatic} */
const LEAFLET = Object.freeze({
  css: `/plugins/public/${PLUGIN_SLUG}/leaflet/leaflet.css`,
  js: `/plugins/public/${PLUGIN_SLUG}/leaflet/leaflet.js`,
  /**
   * Returns HTML that loads Leaflet only if `window.L` is not already defined.
   *
   * @returns {string}
   */
  header() {
    return `
<link id="sc-leaflet-css" rel="stylesheet" href="${this.css}"
      onload="if(window.L){this.remove();}">
<script id="sc-leaflet-js" src="${this.js}" defer
        onload="window.scLeafletLoaded=true;"></script>`;
  },
});

/**
 * Leaflet-providers add-on – exposes 200 + community tile servers.
 *
 * @typedef {Object} LeafletProvidersStatic
 * @property {string} js
 * @property {() => string} header
 */

/** @type {LeafletProvidersStatic} */
const LEAFLET_PROVIDERS = Object.freeze({
  js: `/plugins/public/${PLUGIN_SLUG}/leaflet-providers/leaflet-providers.js`,
  header() {
    return `<script id="sc-leaflet-providers" src="${this.js}" defer></script>`;
  },
});

/**
 * Leaflet-gesture-handling add-on – improves UX on touch devices.
 *
 * @typedef {Object} LeafletGestureStatic
 * @property {string} js
 * @property {() => string} header
 */

/** @type {LeafletGestureStatic} */
const LEAFLET_GESTURE = Object.freeze({
  js: `/plugins/public/${PLUGIN_SLUG}/leaflet-gesturehandling/leaflet-gesture-handling.min.js`,
  header() {
    return `<script id="sc-leaflet-gesture" src="${this.js}" defer></script>`;
  },
});


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
 * Leaflet-Locate-Control add-on – elegant geolocation control.
 *
 * @typedef {Object} LeafletLocateStatic
 * @property {string} css
 * @property {string} js
 * @property {() => string} header
 */

/** @type {LeafletLocateStatic} */
const LEAFLET_LOCATE = Object.freeze({
  css: `/plugins/public/${PLUGIN_SLUG}/leaflet-locatecontrol/L.Control.Locate.min.css`,
  js: `/plugins/public/${PLUGIN_SLUG}/leaflet-locatecontrol/L.Control.Locate.min.js`,
  header() {
    return `
<link id="sc-leaflet-locate-css" rel="stylesheet" href="${this.css}">
<script id="sc-leaflet-locate-js" src="${this.js}" defer></script>`;
  },
});

module.exports = {
  PLUGIN_DEBUG,
  PLUGIN_SLUG,
  DEFAULT_SRID,
  DIM_MODS,
  BASE_GEOM_TYPES,
  LEAFLET,
  DEFAULT_CENTER,
  LEAFLET_PROVIDERS,
  LEAFLET_GESTURE,
  LEAFLET_LOCATE,
  PROVIDERS
};