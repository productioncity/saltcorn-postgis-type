# PostGIS Field-views – Developer Guide

The plug-in provides **two edit field-views** that now include **automatic SRID
re-projection** between the Leaflet canvas (EPSG 4326) and your database
column.

| View name | Purpose | Highlights |
|-----------|---------|------------|
| `edit` (default) | Interactive map with **draw / edit / delete** tools (unlimited shapes). | • Saves Multi* or GeometryCollection automatically.<br>• Detects column SRID and re-projects via proj4js.<br>• EWKT always prefixed `SRID=<srid>;` so PostGIS accepts it. |
| `raw` | Plain `<textarea>` for manual WKT/EWKT/GeoJSON entry. | • Perfect for Z/M/ZM ordinates or exotic sub-types.<br>• Real-time sync with the map editor. |
| `composite_map` (view-template) | **Single map for all rows** – ideal for dashboards. | • Plots every geometry row (Point, Line, Polygon, …).<br>• Configurable geometry column & height.<br>• Auto-zooms to bounds of all features. |

---

## Composite Map view-template

Want an overview of **all locations at once** instead of a tiny map per row?

1. Go to **Views → Create view** and choose template **“Composite Map”**.  
2. Select the geometry column (defaults to `geom`) and set a height.  
3. Embed the view on any page or make it your List view.

The template converts each geometry to GeoJSON, adds everything to a single
Leaflet `FeatureGroup` and zooms to the combined bounds. If the table is empty
the map centres on Sydney (WGS-84).

---

## SRID handling workflow

1. **Record load**  
   * If the column SRID ≠ 4326 the plug-in fetches the proj4 definition from
     `epsg.io` (where available) and converts the geometry to WGS-84 for
     display.

2. **User edits / draws**  
   * All editing occurs in 4326 coordinates.

3. **Save**  
   * On submit the geometry is re-projected back to the column SRID.  
   * The resulting WKT is prefixed with `SRID=<srid>;`.  
   * If a proj4 definition cannot be found the plug-in falls back to 4326 so
     there is no data loss (PostGIS will raise an error if the SRID truly
     mismatches).

---

## FAQ

**Q – Do I still need triggers for re-projection?**  
No. The field-view handles it transparently as long as the SRID exists in the
proj4 registry (common codes like 3857 / 7856). If the definition is missing
you can keep using a database trigger as a fallback.

**Q – How do I store 3-D / measured coordinates?**  
Leaflet is 2-D. After drawing, switch to the **raw** editor and append the
extra ordinates:

LINESTRING ZM (151.21 -33.86 25.4 123)

---

Production City (CC0-1.0)