/**
 * debug.js
 * ---------------------------------------------------------------------------
 * Lightweight, zero‑dependency debug logger for the Saltcorn‑PostGIS plug‑in.
 *
 * • Controlled entirely by the PLUGIN_DEBUG constant (see constants.js).  
 * • Every log line is prefixed with the plug‑in slug and an upper‑case level
 *   so it is unmistakable in Saltcorn’s mixed stdout/stderr stream.  
 * • Falls back gracefully if a console method is absent in the execution
 *   environment (e.g. `console.debug` under Node ≤ 8).  
 *
 * Author:  Troy Kelly  <troy@team.production.city>
 * Licence: CC0‑1.0
 */

'use strict';

/* eslint-disable no-console */

const { PLUGIN_DEBUG, PLUGIN_SLUG } = require('../constants');

/**
 * Generic internal writer – gated by PLUGIN_DEBUG.
 *
 * @param {'trace'|'debug'|'info'|'warn'|'error'} level
 * @param {...unknown} args
 * @returns {void}
 */
function write(level, ...args) {
  if (!PLUGIN_DEBUG) return;

  /* Prefer the specific console method if present, else fallback. */
  // @ts-ignore – runtime check
  const fn = typeof console[level] === 'function' ? console[level] : console.log;
  fn(`[${PLUGIN_SLUG}] [${level.toUpperCase()}]`, ...args);
}

/* Export convenience helpers */
module.exports = Object.freeze({
  trace: (...a) => write('trace', ...a),
  debug: (...a) => write('debug', ...a),
  info:  (...a) => write('info',  ...a),
  warn:  (...a) => write('warn',  ...a),
  error: (...a) => write('error', ...a),
});