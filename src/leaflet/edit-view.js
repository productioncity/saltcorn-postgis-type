/**
 * edit-view.js
 * ---------------------------------------------------------------------------
 * Interactive “edit” field‑view for PostGIS geometries.
 *
 * • POINT            – Renders a Leaflet map with a draggable marker.
 * • POINT Z / M / ZM – Adds numeric inputs for the extra ordinate(s) so that
 *                      users never have to drop down to the raw‑WKT editor.
 * • Other geometries – Gracefully fall back to the plain‑text editor to
 *                      preserve all existing behaviour.
 *
 * The view hands Saltcorn a hidden `<input>` containing a correctly
 * formatted WKT/EWKT string each time the marker or any dimension input
 * changes.
 *
 * Author:        Troy Kelly <troy@team.production.city>
 * First created: 2025‑04‑19
 * Licence:       CC0‑1.0
 */

'use strict';

const markup = require('@saltcorn/markup');
const { DEFAULT_CENTER } = require('../constants');
const { textEditView } = require('./text-edit-view');

/**
 * HTML‑escapes a string so it is safe inside attribute quotes.
 *
 * @param {string|number} s
 * @returns {string}
 */
function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Parse an EWKT/WKT POINT (optionally Z/M/ZM) into discrete parts.
 *
 * @param {string|undefined|null} wkt
 * @returns {{
 *   srid?:number,
 *   dim:string,
 *   lng?:number,
 *   lat?:number,
 *   z?:number,
 *   m?:number
 * }}
 */
function parsePointWkt(wkt) {
  if (typeof wkt !== 'string') return { dim: '' };

  /* eslint-disable max-len */
  const rx =
    /^\s*(?:SRID=(\d+);)?\s*POINT(ZM|Z|M)?\s*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*(?:([+-]?\d+(?:\.\d+)?))?\s*(?:([+-]?\d+(?:\.\d+)?))?\s*\)\s*$/i;
  /* eslint-enable max-len */

  const m = wkt.match(rx);
  if (!m) return { dim: '' };

  const [, sridStr, dimRaw, lngStr, latStr, c3str, c4str] = m;

  const srid = sridStr ? Number(sridStr) : undefined;
  const dim = dimRaw ? dimRaw.toUpperCase() : '';

  /** @type {{z?:number,m?:number}} */
  const extra = {};
  if (dim === 'Z') extra.z = c3str === undefined ? undefined : Number(c3str);
  else if (dim === 'M')
    extra.m = c3str === undefined ? undefined : Number(c3str);
  else if (dim === 'ZM') {
    extra.z = c3str === undefined ? undefined : Number(c3str);
    extra.m = c4str === undefined ? undefined : Number(c4str);
  }

  return {
    srid,
    dim,
    lng: Number(lngStr),
    lat: Number(latStr),
    ...extra,
  };
}

/**
 * Compose an EWKT/WKT POINT string from discrete parts.
 *
 * @param {object} o
 * @param {number|undefined} o.srid
 * @param {string}            o.dim   '' | 'Z' | 'M' | 'ZM'
 * @param {number}            o.lng
 * @param {number}            o.lat
 * @param {number|undefined}  o.z
 * @param {number|undefined}  o.m
 * @returns {string}
 */
function buildPointWkt({ srid, dim, lng, lat, z, m }) {
  /** @type {Array<string|number>} */
  const coords = [lng, lat];
  if (dim.includes('Z')) coords.push(z ?? 0);
  if (dim.includes('M')) coords.push(m ?? 0);

  const core = `POINT${dim}(${coords.join(' ')})`;
  return srid ? `SRID=${srid};${core}` : core;
}

/* ───────────────────── Field‑view factory ───────────────────── */

/**
 * Returns the Leaflet‑based “edit” field‑view for points, or the plain‑text
 * editor for every other geometry type.
 *
 * @param {string} typeName  The PostGIS sub‑type (“point”, “polygon” …).
 * @returns {import('@saltcorn/types').FieldView}
 */
function leafletEditView(typeName) {
  /* All non‑point geometries keep the original raw editor */
  if (typeName !== 'point') {
    return textEditView();
  }

  /**
   * Saltcorn calls `run` during form rendering.
   *
   * @param {string} fieldName
   * @param {string|undefined|null} fieldValue
   * @param {import('../types').PostGISTypeAttrs} attrs
   * @param {string} cls   – Extra CSS classes from Saltcorn
   * @returns {import('@saltcorn/markup').TrustedString}
   */
  function run(fieldName, fieldValue, attrs = {}, cls = '') {
    /* Determine field‑level defaults */
    const cfgSrid = attrs.srid;
    const dimCfg = attrs.dim ? String(attrs.dim).toUpperCase() : '';

    /* Parse existing value (if any) */
    const parsed = parsePointWkt(fieldValue);
    const dim = parsed.dim || dimCfg || '';
    const srid = parsed.srid ?? cfgSrid;

    /* Initial coordinates */
    const lat = parsed.lat ?? DEFAULT_CENTER.lat;
    const lng = parsed.lng ?? DEFAULT_CENTER.lng;
    const z = parsed.z;
    const m = parsed.m;

    /* DOM‑safe IDs */
    const safeId = `sc_pg_${fieldName.replace(/[^A-Za-z0-9_]/g, '_')}`;
    const mapId = `${safeId}_map`;
    const zId = `${safeId}_z`;
    const mId = `${safeId}_m`;
    const hidId = safeId; // hidden <input>

    /* Initial hidden value so form re‑submit works untouched */
    const initialWkt = escAttr(
      buildPointWkt({ srid, dim, lng, lat, z, m }),
    );

    /* Extra ordinate inputs if required */
    const zInputHtml = dim.includes('Z')
      ? `<input type="number" step="any" inputmode="decimal"
                class="form-control ${cls}"
                id="${zId}" placeholder="Elevation (Z)"
                value="${z !== undefined ? escAttr(z) : ''}">`
      : '';

    const mInputHtml = dim.includes('M')
      ? `<input type="number" step="any" inputmode="decimal"
                class="form-control ${cls}"
                id="${mId}" placeholder="Measure (M)"
                value="${m !== undefined ? escAttr(m) : ''}">`
      : '';

    const extraInputsHtml =
      zInputHtml || mInputHtml
        ? `<div class="d-flex gap-2 mt-2">${zInputHtml}${mInputHtml}</div>`
        : '';

    /* Client‑side initialisation */
    const initScript = `
<script>
(function initLeafletPointEditor(){
  const waitForLeaflet = (cb) => {
    if (window.L) return cb();
    setTimeout(() => waitForLeaflet(cb), 50);
  };

  waitForLeaflet(() => {
    const mapEl  = document.getElementById(${JSON.stringify(mapId)});
    const hidden = document.getElementById(${JSON.stringify(hidId)});
    ${dim.includes('Z') ? `const zIn = document.getElementById(${JSON.stringify(zId)});` : ''}
    ${dim.includes('M') ? `const mIn = document.getElementById(${JSON.stringify(mId)});` : ''}

    /* Leaflet map */
    const map = L.map(mapEl).setView([${lat}, ${lng}], ${DEFAULT_CENTER.zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    /* Draggable marker */
    const marker = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);

    /* Compose WKT/EWKT */
    const updateHidden = () => {
      const ll = marker.getLatLng();
      const parts = [ll.lng, ll.lat];
      ${dim.includes('Z') ? 'parts.push(parseFloat(zIn.value) || 0);' : ''}
      ${dim.includes('M') ? 'parts.push(parseFloat(mIn.value) || 0);' : ''}
      const coordStr = parts.join(' ');
      let wkt = 'POINT${dim}(' + coordStr + ')';
      ${srid !== undefined && srid !== null ? `wkt = 'SRID=${srid};' + wkt;` : ''}
      hidden.value = wkt;
    };

    /* Event wiring */
    marker.on('drag', updateHidden);
    ${dim.includes('Z') ? 'zIn.addEventListener("input", updateHidden);' : ''}
    ${dim.includes('M') ? 'mIn.addEventListener("input", updateHidden);' : ''}

    /* First populate */
    updateHidden();
  });
})();
</script>`;

    /* Full HTML fragment */
    const html = `
<input type="hidden" id="${hidId}" name="${escAttr(fieldName)}"
       value="${initialWkt}">
<div id="${mapId}" class="mb-2"
     style="height:300px;min-height:300px;border:1px solid #ced4da;"></div>
${extraInputsHtml}
${initScript}`;

    /* Mark as trusted so Saltcorn keeps the <script> tag */
    return markup.trust(html);
  }

  return {
    isEdit: true,
    run,
  };
}

module.exports = { leafletEditView };