/**
 * index.js
 * Saltcorn PostGIS Type Plugin
 *
 * Purpose:
 *   Provides a comprehensive suite of Saltcorn data‑types that map one‑to‑one
 *   with all practical PostGIS geometry and geography types, including robust
 *   attribute handling (SRID, dimensionality, subtype restrictions) and basic
 *   GeoJSON → WKT conversion.
 *
 * Author:        Troy Kelly <troy@team.production.city>
 * Maintainer:    Production City <engineering@production.city>
 * First‑created: 17 Apr 2024
 * This revision: 18 Apr 2025 - Fixing the issue: https://github.com/productioncity/saltcorn-postgis-type/issues/18
 * Licence:       CC0‑1.0 (see LICENCE)
 */

'use strict';

/* eslint-disable camelcase, max-lines, max-len */

/* ─────────────────────── External dependencies ─────────────────────────── */

/**
 * Saltcorn ≤ 0.x exports the `Table` class directly, whereas Saltcorn ≥ 1.x
 * wraps it in an object (`{ Table }`).  The defensive import below works for
 * both shapes, ensuring the plug‑in stays compatible across versions.
 */
const TableMod = require('@saltcorn/data/models/table');
// The actual Table class (has .findOne, .prototype, etc.)
const Table =
  TableMod && typeof TableMod.findOne === 'function'
    ? TableMod
    : TableMod && TableMod.Table
      ? TableMod.Table
      : TableMod;

const Field = require('@saltcorn/data/models/field');
const { div, script, domReady, text: esc } = require('@saltcorn/markup/tags');
const wellknown = require('wellknown'); // tiny WKT ⇆ GeoJSON converter

/* ────────────────────────────── Constants ──────────────────────────────── */

/** Default SRID (EPSG:4326 – WGS‑84 lat/lng). */
const DEFAULT_SRID = 4326;

/** Allowed PostGIS dimensionality flags. */
const DIM_MODS = Object.freeze(['', 'Z', 'M', 'ZM']);

/** Canonical geometry tokens – used only for attribute validation. */
const BASE_GEOM_TYPES = Object.freeze([
  'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
  'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION',
  'CIRCULARSTRING', 'COMPOUNDCURVE', 'CURVEPOLYGON', 'MULTICURVE',
  'MULTISURFACE', 'POLYHEDRALSURFACE', 'TIN', 'TRIANGLE',
]);

/**
 * Leaflet CDN assets – pulled in dynamically by field‑views so pages that
 * never display a map incur zero overhead.
 */
const LEAFLET = Object.freeze({
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  get header() {
    return (
      `<link rel="stylesheet" href="${this.css}"/>\n` +
      `<script defer src="${this.js}"></script>`
    );
  },
});

/* ───────────────────────────── Typedefs (JSDoc) ────────────────────────── */

/**
 * Attribute object common to all PostGIS types.
 *
 * @typedef {object} PostGISTypeAttrs
 * @property {number=}           srid   EPSG code
 * @property {''|'Z'|'M'|'ZM'=} [dim]   Dimensionality flag
 * @property {string=}          subtype Geometry subtype (generic types)
 */

/**
 * Callable + string‑duck‑typed object returned by `sqlNameFactory`.
 *
 * @typedef {(attrs?: PostGISTypeAttrs) => string} SqlNameFn
 */

/* ────────────────────────── Helper utilities ───────────────────────────── */

/**
 * Build a `sql_name` generator that also quacks like a string.
 * Older Saltcorn discovery does `.toLowerCase()`; attaching standard
 * string methods prevents TypeErrors while preserving callable behaviour.
 *
 * @param {'GEOMETRY'|'GEOGRAPHY'} base
 * @param {string} subtype
 * @returns {SqlNameFn}
 */
function sqlNameFactory(base, subtype) {
  /** @type {SqlNameFn} */
  function sqlName(attrs = {}) {
    const srid = attrs.srid ?? DEFAULT_SRID;
    const dim = attrs.dim ? String(attrs.dim).toUpperCase() : '';
    const sub = ((attrs.subtype ?? subtype) + dim).toUpperCase();

    const baseLower = base.toLowerCase();
    if (sub) return `${baseLower}(${sub},${srid})`;
    if (srid !== undefined && srid !== null) {
      return `${baseLower}(Geometry,${srid})`;
    }
    return baseLower;
  }

  const canonical = base.toLowerCase();
  Object.defineProperties(sqlName, {
    toLowerCase: { value: () => canonical },
    toUpperCase: { value: () => canonical.toUpperCase() },
    toString: { value: () => canonical },
    valueOf: { value: () => canonical },
    [Symbol.toPrimitive]: { value: () => canonical },
  });
  return sqlName;
}

/**
 * Extract `[lng, lat]` from a POINT WKT (ignores Z/M).
 *
 * @param {unknown} wkt
 * @returns {[number, number]|undefined}
 */
function wktToLonLat(wkt) {
  if (typeof wkt !== 'string') return undefined;
  const m = wkt
    .replace(/^SRID=\d+;/i, '')
    .match(/^POINT[^()]*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*/i);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

/**
 * Convert any WKT to GeoJSON (best‑effort) via `wellknown`.
 *
 * @param {string} wkt
 * @returns {Record<string, unknown>|undefined}
 */
function wktToGeoJSON(wkt) {
  if (typeof wkt !== 'string') return undefined;
  try {
    return wellknown.parse(wkt);
  } catch {
    return undefined;
  }
}

/**
 * Attribute validator – called by Saltcorn when the admin saves the field
 * definition.  Keeps backward compatibility with the original plug‑in.
 *
 * @param {PostGISTypeAttrs=} attrs
 * @returns {true|string}
 */
function validateAttrs(attrs) {
  if (!attrs) return true;
  if ('srid' in attrs && (!Number.isInteger(attrs.srid) || attrs.srid < 1)) {
    return 'SRID must be a positive integer';
  }
  if ('dim' in attrs && !DIM_MODS.includes(String(attrs.dim).toUpperCase())) {
    return 'Invalid dim (use "", "Z", "M" or "ZM")';
  }
  if (
    'subtype' in attrs &&
    !BASE_GEOM_TYPES.includes(String(attrs.subtype).toUpperCase())
  ) {
    return 'Invalid geometry subtype';
  }
  return true;
}

/**
 * Patch `Table.getRows()` so each Point column yields virtual
 * `<col>_lat` & `<col>_lng` floats – perfect for the *leaflet‑map* plug‑in.
 *
 * The patch is idempotent; running twice is a no‑op.
 *
 * @param {typeof import('@saltcorn/types/model-abstracts/abstract_table').Table} TableClass
 */
function patchGetRows(TableClass) {
  if (TableClass.prototype.getRows.__postgisPatched) return;

  const original = TableClass.prototype.getRows;
  TableClass.prototype.getRows = async function patched(...args) {
    /** @type {Array<Record<string, unknown>>} */
    const rows = await original.apply(this, args);
    const pointCols = (await this.getFields()).filter(
      (f) => f.type?.name === 'point',
    );
    if (pointCols.length === 0) return rows;

    for (const row of rows) {
      for (const pc of pointCols) {
        const ll = wktToLonLat(row[pc.name]);
        if (ll) {
          row[`${pc.name}_lat`] = ll[1];  // latitude
          row[`${pc.name}_lng`] = ll[0];  // longitude
        }
      }
    }
    return rows;
  };
  TableClass.prototype.getRows.__postgisPatched = true;
}

/* ─────────────────────────── Leaflet field‑views ───────────────────────── */

/**
 * Read‑only map preview – works for **every** geometry that `wellknown`
 * can parse.  Injects Leaflet on‑demand.
 *
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletShow() {
  return {
    isEdit: false,
    run(value) {
      if (!value) return '';
      const id = `ls${Math.random().toString(36).slice(2)}`;
      const geojson = wktToGeoJSON(value);
      const pointLL = wktToLonLat(value);

      if (!geojson && !pointLL) return `<code>${esc(String(value))}</code>`;

      /* Client‑side init script */
      const js = `
${LEAFLET.header}
(function(){
  const map=L.map("${id}",{zoomControl:false,attributionControl:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(map);
  ${geojson
          ? `const layer=L.geoJSON(${JSON.stringify(geojson)}).addTo(map);
         map.fitBounds(layer.getBounds());`
          : `const pt=[${pointLL[1]},${pointLL[0]}];
         L.marker(pt).addTo(map);map.setView(pt,12);`
        }
})();`;
      return div({ id, style: 'height:180px' }, '…') + script(domReady(js));
    },
  };
}

/**
 * Draggable marker editor for **Point** fields.
 *
 * @param {string} fieldName  Used to avoid duplicate IDs.
 * @returns {import('@saltcorn/types/base_plugin').FieldView}
 */
function leafletEdit(fieldName) {
  return {
    isEdit: true,
    run(nm, value) {
      const id = `${fieldName}_${Math.random().toString(36).slice(2)}`;
      const ll = wktToLonLat(value) || [0, 0];
      return (
        div({ id, style: 'height:250px' }, '…') +
        `<input type="hidden" id="inp${id}" name="${esc(nm)}" value="${esc(value || '')}">` +
        script(
          domReady(`
${LEAFLET.header}
(function(){
  const map=L.map("${id}");
  map.setView([${ll[1]},${ll[0]}], ${value ? 12 : 2});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(map);
  const mk=L.marker([${ll[1]},${ll[0]}],{draggable:true}).addTo(map);
  function upd(pt){document.getElementById("inp${id}").value="POINT("+pt.lng+" "+pt.lat+")";}
  mk.on('dragend',e=>upd(e.target.getLatLng()));
  map.on('click',e=>{mk.setLatLng(e.latlng);upd(e.latlng);});
})();`)
        )
      );
    },
  };
}

/* ──────────────────────────  Type factory  ─────────────────────────────── */

/**
 * Construct a Saltcorn `Type` object.
 *
 * @param {object} def
 * @param {string} def.name
 * @param {'GEOMETRY'|'GEOGRAPHY'} def.base
 * @param {string} def.subtype
 * @param {boolean} def.allowDim
 * @param {boolean} def.allowSubtype
 * @returns {import('@saltcorn/types/base_plugin').Type}
 */
function makeType(def) {
  const { name, base, subtype, allowDim, allowSubtype } = def;
  const label = (subtype || base)
    .replace(/^\w/, (c) => c.toUpperCase());

  /** @type {import('@saltcorn/types/base_plugin').TypeAttribute[]} */
  const attributes = [
    { name: 'srid', label: 'SRID', type: 'Integer', default: DEFAULT_SRID },
  ];
  if (allowDim) {
    attributes.push({
      name: 'dim',
      label: 'Dim',
      type: 'String',
      attributes: { options: DIM_MODS },
    });
  }
  if (allowSubtype) {
    attributes.push({
      name: 'subtype',
      label: 'Subtype',
      type: 'String',
      attributes: { options: BASE_GEOM_TYPES },
    });
  }

  const fieldviews = { show: leafletShow() };
  if (name === 'point') fieldviews.edit = leafletEdit(name);

  return {
    name,
    sql_name: sqlNameFactory(base, subtype),
    description: `PostGIS ${label} value`,
    attributes,
    validate_attributes: validateAttrs,
    fieldviews,
    read: (v) => (typeof v === 'string' ? v : undefined),
    readFromDB: (v) => (typeof v === 'string' ? v : undefined),
  };
}

/* ──────────────────────────  Type catalogue  ───────────────────────────── */

const INTERNAL_TYPES = [
  // Generic “container” types
  { name: 'geometry', base: 'GEOMETRY', subtype: '', allowSubtype: true, allowDim: true },
  { name: 'geography', base: 'GEOGRAPHY', subtype: '', allowSubtype: true, allowDim: true },

  // Frequent concrete types
  { name: 'point', base: 'GEOMETRY', subtype: 'POINT', allowSubtype: false, allowDim: true },
  { name: 'linestring', base: 'GEOMETRY', subtype: 'LINESTRING', allowSubtype: false, allowDim: true },
  { name: 'polygon', base: 'GEOMETRY', subtype: 'POLYGON', allowSubtype: false, allowDim: true },
  { name: 'multipoint', base: 'GEOMETRY', subtype: 'MULTIPOINT', allowSubtype: false, allowDim: true },
  { name: 'multilinestring', base: 'GEOMETRY', subtype: 'MULTILINESTRING', allowSubtype: false, allowDim: true },
  { name: 'multipolygon', base: 'GEOMETRY', subtype: 'MULTIPOLYGON', allowSubtype: false, allowDim: true },
  { name: 'geometrycollection', base: 'GEOMETRY', subtype: 'GEOMETRYCOLLECTION', allowSubtype: false, allowDim: true },

  // Specialist
  { name: 'circularstring', base: 'GEOMETRY', subtype: 'CIRCULARSTRING', allowSubtype: false, allowDim: true },
  { name: 'compoundcurve', base: 'GEOMETRY', subtype: 'COMPOUNDCURVE', allowSubtype: false, allowDim: true },
  { name: 'curvepolygon', base: 'GEOMETRY', subtype: 'CURVEPOLYGON', allowSubtype: false, allowDim: true },
  { name: 'multicurve', base: 'GEOMETRY', subtype: 'MULTICURVE', allowSubtype: false, allowDim: true },
  { name: 'multisurface', base: 'GEOMETRY', subtype: 'MULTISURFACE', allowSubtype: false, allowDim: true },
  { name: 'polyhedralsurface', base: 'GEOMETRY', subtype: 'POLYHEDRALSURFACE', allowSubtype: false, allowDim: true },
  { name: 'tin', base: 'GEOMETRY', subtype: 'TIN', allowSubtype: false, allowDim: true },
  { name: 'triangle', base: 'GEOMETRY', subtype: 'TRIANGLE', allowSubtype: false, allowDim: true },
];

/** Array of fully‑formed Saltcorn `Type` objects. */
const types = INTERNAL_TYPES.map(makeType);

/* ───────────────────── Table action: create real lat/lng ───────────────── */

/**
 * Convenience action visible under *Table ▸ Actions* that adds calculated
 * Float columns (`ST_Y`, `ST_X`) for the first Point field in the table.
 *
 * @type {import('@saltcorn/types/base_plugin').TableAction}
 */
const createLatLngAction = {
  name: 'Create lat/lng fields from Point',
  description:
    'Creates two calculated Float columns `<point>_lat` & `<point>_lng` using ST_Y/ST_X.',
  isAsync: true,
  requireRow: false,

  /**
   * @param {number} table_id
   * @returns {Promise<{success?:string,error?:string}>}
   */
  async action(table_id) {
    const tbl = await Table.findOne({ id: table_id });
    if (!tbl) return { error: 'Table not found.' };

    const pointField = (await tbl.getFields()).find((f) => f.type?.name === 'point');
    if (!pointField) return { error: 'No Point field detected.' };

    const base = pointField.name;
    const lat = await Field.create({
      table_id,
      name: `${base}_lat`,
      label: `${base} latitude`,
      type: 'Float',
      calculated: true,
      expression: `ST_Y("${base}")`,
    });
    const lng = await Field.create({
      table_id,
      name: `${base}_lng`,
      label: `${base} longitude`,
      type: 'Float',
      calculated: true,
      expression: `ST_X("${base}")`,
    });
    await tbl.update({ min_role_read: tbl.min_role_read });
    return { success: `Created fields #${lat.id} and #${lng.id}.` };
  },
};

/* ───────────────────────────── Plug‑in export ──────────────────────────── */

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: 'saltcorn-postgis-type',

  /**
   * Called exactly once on server start (or when the plug‑in is enabled).
   * We patch Table.getRows() here so every Point column exposes virtual
   * <col>_lat and <col>_lng floats before the first request is served.
   *
   * @param {object=} _config   Unused – plug‑in is stateless.
   */
  onLoad(_config) {
    // Robustly obtain the actual Table class across Saltcorn versions.
    let TableClass = require('@saltcorn/data/models/table');
    if (TableClass && TableClass.Table) {
      TableClass = TableClass.Table;
    }
    if (!TableClass || !TableClass.prototype) {
      // eslint-disable-next-line no-console
      console.error(
        'saltcorn-postgis-type: Unable to patch Table.getRows() – Table class not found.',
      );
      return;
    }
    patchGetRows(TableClass); // idempotent – safe to call twice
  },

  headers: [],

  types,

  actions: {
    create_point_latlng_columns: {
      requireRow: false,
      group: 'Database',
      description:
        'Creates calculated Float columns <point>_lat and <point>_lng ' +
        'using PostGIS ST_Y/ST_X.',
      async run({ table_id }) {
        const tbl = await Table.findOne({ id: table_id });
        if (!tbl) return { error: 'Table not found.' };

        const pointField = (await tbl.getFields()).find(
          (f) => f.type?.name === 'point',
        );
        if (!pointField) return { error: 'No Point field detected.' };

        const base = pointField.name;
        const lat = await Field.create({
          table_id,
          name: `${base}_lat`,
          label: `${base} latitude`,
          type: 'Float',
          calculated: true,
          expression: `ST_Y("${base}")`,
        });
        const lng = await Field.create({
          table_id,
          name: `${base}_lng`,
          label: `${base} longitude`,
          type: 'Float',
          calculated: true,
          expression: `ST_X("${base}")`,
        });

        await tbl.update({ min_role_read: tbl.min_role_read });
        return {
          success: `Created columns #${lat.id} and #${lng.id}.`,
        };
      },
    },
  },

  functions: {
    toLatLng(wkt) {
      const ll = wktToLonLat(wkt);
      return ll ? { lat: ll[1], lng: ll[0], latlng: ll } : undefined;
    },
  },

  dependencies: ['wellknown'],
};