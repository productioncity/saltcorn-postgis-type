/* …unchanged header… */

const { buildSqlName }  = require('../utils/sql-name');
/* …unchanged requires… */

function makeType(cfg) {
  /* …unchanged attribute code… */

  // -----------------------------------------------------------------------
  // Provide *both* the canonical string and the callable generator.
  // -----------------------------------------------------------------------
  const { sql_name, sql_name_fn } = buildSqlName(base, subtype);

  return Object.freeze({
    name,
    sql_name,           // <‑‑ plain string (Saltcorn core relies on this)
    sql_name_fn,        // <‑‑ helper kept for other plug‑in internals
    description: `PostGIS ${subtype || base} value`,
    attributes,
    validate_attributes: validateAttrs,
    fieldviews: {
      show: leafletShow(),
      edit: leafletEditView(name),
      raw:  textEditView(),
    },
    read: (v) => (typeof v === 'string' ? v : undefined),
    readFromDB: (v) => (typeof v === 'string' ? `${v}::text` : undefined),
  });
}

module.exports = { makeType };