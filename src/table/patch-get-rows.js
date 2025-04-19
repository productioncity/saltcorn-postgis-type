/**
 * patch-get-rows.js
 * ---------------------------------------------------------------------------
 * Monkey‑patches `Table.prototype.getRows` so each PostGIS field is handed
 * back as **clean EWKT**, and Point columns additionally expose virtual
 * `<col>_lat` / `<col>_lng` properties – indispensable for the Leaflet‑Map
 * plug‑in and many other use‑cases.
 *
 * The patch is idempotent and safe across multiple Saltcorn versions.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑19 – Full WKB → EWKT normalisation for *all*
 *                             geometry/geography fields.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

const { toWkt, wktToLonLat } = require('../utils/geometry');

/** List of PostGIS type‑names handled by this plug‑in. */
const PGIS_TYPES = new Set([
  'geometry',
  'geography',
  'point',
  'linestring',
  'polygon',
  'multipoint',
  'multilinestring',
  'multipolygon',
  'geometrycollection',
  'circularstring',
  'compoundcurve',
  'curvepolygon',
  'multicurve',
  'multisurface',
  'polyhedralsurface',
  'tin',
  'triangle',
]);

/**
 * @param {typeof import('@saltcorn/types/model-abstracts/abstract_table').Table} TableClass
 *   The runtime Table class (shape differs between Saltcorn 0.x and 1.x).
 * @returns {void}
 */
function patchGetRows(TableClass) {
  if (TableClass.prototype.getRows.__postgisPatched) return;

  const original = TableClass.prototype.getRows;

  // eslint-disable-next-line func-names
  TableClass.prototype.getRows = async function patched(...args) {
    /** @type {Array<Record<string, unknown>>} */
    const rows = await original.apply(this, args);

    /** @type {import('@saltcorn/types').Field[]} */
    const fields = await this.getFields();
    if (fields.length === 0) return rows;

    const pointCols = fields.filter((f) => f.type?.name === 'point');
    const pgisCols  = fields.filter((f) => PGIS_TYPES.has(f.type?.name));

    if (pgisCols.length === 0) return rows;

    for (const row of rows) {
      /* 1. Normalise EVERY PostGIS field to EWKT. */
      for (const pc of pgisCols) {
        const ewkt = toWkt(row[pc.name]);
        if (ewkt) row[pc.name] = ewkt;
      }

      /* 2. Add <name>_lat / <name>_lng for Point fields. */
      for (const p of pointCols) {
        const ll = wktToLonLat(row[p.name]);
        if (ll) {
          row[`${p.name}_lat`] = ll[1]; // latitude
          row[`${p.name}_lng`] = ll[0]; // longitude
        }
      }
    }
    return rows;
  };

  TableClass.prototype.getRows.__postgisPatched = true;
}

module.exports = { patchGetRows };