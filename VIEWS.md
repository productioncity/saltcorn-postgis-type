# PostGIS Field‑views – Developer Guide

The plug‑in provides **two edit field‑views** that now include **automatic SRID
re‑projection** between the Leaflet canvas (EPSG 4326) and your database
column.

| View name | Purpose | Highlights |
|-----------|---------|------------|
| `edit` (default) | Interactive map with **draw / edit / delete** tools, supports unlimited shapes. | • Saves Multi* or GeometryCollection automatically.<br>• Detects column SRID and re‑projects via proj4js.<br>• Generated EWKT is always `SRID=<srid>;…` so PostGIS accepts it. |
| `raw` | Plain `<textarea>` for manual WKT/EWKT entry. | • Perfect for Z/M/ZM ordinates or exotic sub‑types.<br>• Real‑time sync with the map editor. |

---

## SRID handling workflow

1. **Record load**  
   * If the column SRID ≠ 4326 the plug‑in fetches the proj4 definition from
     `epsg.io` (where available) and converts the geometry to WGS‑84 for
     display.

2. **User edits / draws**  
   * All editing occurs in 4326 coordinates.

3. **Save**  
   * On submit the geometry is re‑projected back to the column SRID.  
   * The resulting WKT is prefixed with `SRID=<srid>;`.  
   * If a proj4 definition cannot be found the plug‑in falls back to the
     un‑projected 4326 coordinates so there is no data loss (PostGIS will raise
     an error if the SRID truly mismatches).

---

## FAQ (updated)

**Q – Do I need triggers for re‑projection now?**  
No. The field‑view handles it transparently as long as the SRID exists in the
proj4 registry (common codes like 3857, 7856, etc.). If the definition is
missing you can still keep using a database trigger as a fallback.

**Q – What about 3‑D / measured coordinates?**  
Leaflet is strictly 2‑D. After drawing, open the **raw** editor and append the
extra ordinates before saving:

LINESTRING ZM (151.21 -33.86 25.4 123)

---

© 2025 Troy Kelly – Production City (CC0‑1.0)