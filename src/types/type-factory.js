/**
 * type-factory.js
 * -----------------------------------------------------------------------------
 * Generates Saltcorn `Type` definitions for every PostGIS subtype **and**
 * wires-in the shared Leaflet add-on configuration flags so they are available
 * across *all* field-views (edit, show, raw, map, etc.).
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Updated:  2025-04-27 – Universal Leaflet add-on attributes
 * Licence:  CC0-1.0
 */

'use strict';

/* ──────────────────────────── Imports ──────────────────────────── */

const dbg = require('../utils/debug');
const {
  DEFAULT_SRID,
  DIM_MODS,
  BASE_GEOM_TYPES,
} = require('../constants');

const { sqlNameFactory }  = require('../utils/sql-name');
const { validateAttrs, toWkt } = require('../utils/geometry');

const { mapEditView } = require('../leaflet/map-edit-view');
const { showView }    = require('../leaflet/show-view');
const { rawView }     = require('../leaflet/raw-view');

/* ─────────────────────────── Constants ─────────────────────────── */

/**
 * Common attribute definitions shared by *all* PostGIS types for enabling /
 * disabling Leaflet add-ons.  Surfaced at the *field* level so developers can
 * toggle behaviour per-column with zero code.
 *
 * @type {import('@saltcorn/types').TypeAttribute[]}
 */
const SHARED_LEAFLET_ATTRS = Object.freeze([
  /* ---------------- Leaflet-providers ---------------- */
  {
    name:      'tile_provider_enabled',
    label:     'Enable Leaflet-providers basemap',
    type:      'Bool',
    default:   false,
  },
  {
    name:       'tile_provider_name',
    label:      'Provider key',
    type:       'String',
    showIf:     { tile_provider_enabled: true },
  },
  {
    name:       'tile_provider_options',
    label:      'Provider options (JSON)',
    sublabel:   'Raw JSON passed to the provider – e.g. {"apikey":"…"}',
    type:       'String',
    fieldview:  'textarea',
    attributes: { rows: 3 },
    showIf:     { tile_provider_enabled: true },
  },

  /* ---------------- Gesture-handling ---------------- */
  {
    name:    'gesture_handling_enabled',
    label:   'Enable touch gesture handling',
    type:    'Bool',
    default: false,
  },

  /* ---------------- Locate-control ------------------ */
  {
    name:    'locate_enabled',
    label:   'Enable “Locate me” control',
    type:    'Bool',
    default: false,
  },
  {
    name:       'locate_position',
    label:      'Locate control position',
    type:       'String',
    default:    'topleft',
    attributes: {
      options: ['topleft', 'topright', 'bottomleft', 'bottomright'],
    },
    showIf: { locate_enabled: true },
  },
  {
    name:    'locate_follow',
    label:   'Auto-follow user position',
    type:    'Bool',
    default: true,
    showIf:  { locate_enabled: true },
  },
  {
    name:    'locate_keep_zoom',
    label:   'Keep current zoom level',
    type:    'Bool',
    default: false,
    showIf:  { locate_enabled: true },
  },
  {
    name:    'locate_fly_to',
    label:   'Smooth fly-to animation',
    type:    'Bool',
    default: false,
    showIf:  { locate_enabled: true },
  },
  {
    name:    'locate_show_compass',
    label:   'Show compass bearing',
    type:    'Bool',
    default: true,
    showIf:  { locate_enabled: true },
  },
]);

/* ─────────────────────────── Factory ───────────────────────────── */

/**
 * Build the Saltcorn `Type` object for a concrete / generic PostGIS subtype.
 *
 * @param {object} cfg
 * @param {string} cfg.name
 * @param {'GEOMETRY'|'GEOGRAPHY'} cfg.base
 * @param {string} cfg.subtype
 * @param {boolean} cfg.allowDim
 * @param {boolean} cfg.allowSubtype
 * @returns {import('@saltcorn/types').Type}
 */
function makeType(cfg) {
  dbg.debug('makeType()', cfg);

  const {
    name,
    base,
    subtype,
    allowDim,
    allowSubtype,
  } = cfg;

  /** @type {import('@saltcorn/types').TypeAttribute[]} */
  const attributes = [
    { name: 'srid', label: 'SRID', type: 'Integer', default: DEFAULT_SRID },
  ];

  /* Dimension Z / M selector */
  if (allowDim) {
    attributes.push({
      name:       'dim',
      label:      'Dim',
      type:       'String',
      attributes: { options: DIM_MODS },
    });
  }

  /* Freeform subtype selector on generic containers */
  if (allowSubtype) {
    attributes.push({
      name:       'subtype',
      label:      'Subtype',
      type:       'String',
      attributes: { options: BASE_GEOM_TYPES },
    });
  }

  /* Append the shared Leaflet-add-on toggles */
  attributes.push(...SHARED_LEAFLET_ATTRS);

  /* Field-views ---------------------------------------------------- */
  const editFV     = mapEditView(name.toLowerCase());
  const mapPreview = { ...showView(), name: 'map', isEdit: true };

  /* Final Saltcorn Type object ------------------------------------ */
  return Object.freeze({
    name,
    sql_name: sqlNameFactory(base, subtype),
    description: `PostGIS ${subtype || base} value`,
    attributes,
    validate_attributes: validateAttrs,

    fieldviews: {
      edit: editFV,
      raw : rawView(),
      map : mapPreview,
      show: showView(),
    },

    /* ---------- Runtime converters ---------- */
    read(v) {
      if (v === null || v === undefined) return undefined;
      try {
        return toWkt(Buffer.isBuffer(v) ? v : String(v));
      } catch (e) {
        dbg.warn('type.read() failed', e);
        return undefined;
      }
    },

    readFromDB(v) {
      return `ST_AsEWKT(${v})`;
    },
  });
}

module.exports = { makeType };