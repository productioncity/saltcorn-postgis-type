/**
 * patch-get-rows.js
 * Monkey‑patches `Table.prototype.getRows` so each Point column yields two
 * virtual properties `<col>_lat` and `<col>_lng` – indispensable for the
 * Leaflet‑Map plug‑in.
 *
 * The patch is idempotent and safe across multiple Saltcorn versions.
 *
 * Author:       Troy Kelly <troy@team.production.city>
 * First‑created: 2024‑04‑17
 * This revision: 2025‑04‑18 – Moved into dedicated module.
 * Licence:      CC0‑1.0  (see LICENCE)
 */

'use strict';

const { wktToLonLat } = require('../utils/geometry');

/**
 * @param {typeof import('@saltcorn/types/model-abstracts/abstract_table').Table} TableClass
 *   The runtime Table class (shape differs between Saltcorn 0.x and 1.x).
 * @returns {void}
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
          row[`${pc.name}_lat`] = ll[1]; // latitude
          row[`${pc.name}_lng`] = ll[0]; // longitude
        }
      }
    }
    return rows;
  };

  TableClass.prototype.getRows.__postgisPatched = true;
}

module.exports = { patchGetRows };