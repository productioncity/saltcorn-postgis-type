# PostGIS Field‑views – Developer Guide (interactive + raw)

The plug‑in ships **two complementary _edit_ field‑views** that work with **all
geometry types**, including `GEOMETRYCOLLECTION` and every `MULTI*` variant.

| View name | Purpose | Key features |
|-----------|---------|--------------|
| `edit` (default) | Interactive Leaflet map with full **draw / edit / delete** controls. Captures **multiple shapes** and automatically returns the correct WKT:<br>• MultiPoint / MultiLineString / MultiPolygon for homogeneous layers.<br>• GeometryCollection when layers are mixed.<br>• Falls back to raw text for exotic sub‑types (CurvePolygon, etc.). | • Add, move, delete any number of shapes.<br>• Existing WKT (single, MULTI*, GEOMETRYCOLLECTION) is decomposed and shown for editing.<br>• SRID always 4326 – re‑project later if required. |
| `raw` | Plain `<textarea>` accepting any WKT/EWKT verbatim. Ideal for power‑users who need to add **Z / M / ZM** coordinates or unsupported sub‑types. Can be toggled on/off while using the map editor. | • Zero client‑side validation – PostGIS decides validity.<br>• Synced in real‑time with the interactive map. |

---

## Using the interactive editor (`edit`)

1. **Draw shapes** using the toolbar (marker, polyline, polygon, rectangle).  
2. **Edit or move** them with the pencil icon.  
3. **Delete** with the dust‑bin icon.  
4. All layers drawn belong to the *same field*. On save they are serialised to:
   * Multi* geometry when all layers share the same type; **or**  
   * GeometryCollection when types differ.
5. **Toggle “Raw WKT editor”** for fine‑tuning or bulk pasting.

---

## Frequently asked questions

**Q 1 – Can I store multiple polygons / points / lines in the one field?**  
Absolutely. Draw as many shapes as you like; the plug‑in converts them to
`MultiPolygon`, `MultiPoint`, `MultiLineString` or `GeometryCollection`
depending on what you drew.

**Q 2 – Leaflet doesn’t handle 3‑D (Z/M) – what about my elevation data?**  
Draw the base geometry, open the **raw** editor and append your extra ordinates
before saving, e.g.:

POLYGON Z ((151.2 -33.86 12, …))

**Q 3 – The field SRID isn’t 4326 – do I need to re‑project?**  
The editor works in WGS‑84 (EPSG 4326). Use a trigger (`ST_Transform`) or
application logic to convert on insert/update if your column SRID differs.

---

Production City (CC0‑1.0)