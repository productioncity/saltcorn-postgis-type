# Mapping Spatial Data in Saltcorn  
Practical guide for tables, fields, views, and maps

> Written for Saltcorn ≥ 0.10, PostgreSQL ≥ 15, PostGIS ≥ 3.4, and the
> `@productioncity/saltcorn-postgis-type` plug‑in.  
> All steps use the **Saltcorn UI** unless noted otherwise.  
> Commands prefixed with `$` run in your terminal.

---

## 1. Prerequisites

| Component                   | Notes                                                                                  |
|-----------------------------|----------------------------------------------------------------------------------------|
| PostgreSQL with PostGIS     | `CREATE EXTENSION IF NOT EXISTS postgis;` (once per tenant / database).               |
| `saltcorn-postgis-type`     | `saltcorn install-plugin saltcorn-postgis-type` then **Settings → Plugins → Enable**. |
| Map field‑view plug‑in¹     | Optional, but recommended for a nicer UI.                                             |

¹ Recommended options:  
* **Official “Map” field‑view** (Saltcorn Store) – Leaflet map with draw tools.  
* **Custom React/L.MapLibre** – if you need advanced styling.

---

## 2. Create a table

### 2.1 Example A: “Places” (points)

1.  **Tables → Create Table**  
    *Name*: `places`

2.  **Add fields**  
    | Field name | Type (drop‑down)        | Attributes            |
    |------------|-------------------------|-----------------------|
    | `id`       | Integer → Primary key   | _auto‑added_          |
    | `name`     | String                  | –                     |
    | `geom`     | PostGIS **Point**       | SRID `4326` (default) |

### 2.2 Example B: “Parks” (polygons)

1.  **Tables → Create Table**  
    *Name*: `parks`

2.  **Add fields**  
    | Field name | Type (drop‑down)      | Attributes                               |
    |------------|-----------------------|------------------------------------------|
    | `id`       | Integer → Primary key | _auto‑added_                             |
    | `name`     | String                | –                                        |
    | `area`     | PostGIS **Polygon**   | SRID `4326`, Dimension `Z` (optional)    |

> Why Z‑dimension?  
> Elevation makes sense for contours or airspace — set to blank for flat areas.

---

## 3. Build “Edit” forms with a map

### 3.1 Install the Map field‑view (once)

$ saltcorn install-plugin map

Inside the UI: **Settings → Plugins → Map → Enable**.

### 3.2 Attach the map to a field

1.  **Views → Create View**  
    *Name*: `places_edit`, *Table*: `places`, *View template*: **Edit**.

2.  Click the **“geom”** field row.  
    Change **Field view** from `edit` (text box) to **`map_edit`**  
    (name may differ per plug‑in: “map”, “map_edit”, or similar).

3.  Save the view.

Repeat for `parks_edit` → set **area** field to the map‑enabled view.

---

## 4. Build “Show / Map” views for display

### 4.1 Single record (Show)

1.  **Views → Create View**  
    *Name*: `place_show`, *Table*: `places`, *Template*: **Show**.

2.  Ensure **geom** uses a map‑display view (e.g. `map_show`).

### 4.2 Full‑screen map of all records

1.  **Views → Create View**  
    *Name*: `places_map`, *Table*: `places`, *Template*: **Map**  
    (some plug‑ins call it “Map view” or “Map list”).

2.  Configure:  
    * **Geometry field**: `geom`  
    * **Popup label**: `name`  
    * Optional: **Clustering**, **Auto‑fit bounds**.

---

## 5. Data entry examples

### 5.1 Point (WKT)

POINT(153.0278 -27.4710)

Paste into the plain text box **or** drop a marker on the map.

### 5.2 Point (GeoJSON)

{"type":"Point","coordinates":[153.0278,-27.4710]}

Accepted because `saltcorn-postgis-type` auto‑converts GeoJSON → WKT.

### 5.3 Polygon (WKT, clockwise ring)

POLYGON((
  153.0235 -27.4689,
  153.0292 -27.4689,
  153.0292 -27.4729,
  153.0235 -27.4729,
  153.0235 -27.4689
))

Paste as one line or use the map’s **Draw → Polygon** tool.

---

## 6. Querying spatial data

### 6.1 SQL in a “Join” view

SELECT id, name
FROM   places
WHERE  ST_DWithin(
         geom,
         ST_SetSRID(ST_MakePoint(:lon,:lat), 4326),
         :radius_m
       );

Parameters `:lon`, `:lat`, `:radius_m` are exposed as View → **Configuration → State fields**.

### 6.2 Aggregating polygons (parks)

SELECT name, ST_Area(area)::numeric / 10^6 AS square_km
FROM   parks
ORDER  BY square_km DESC;

---

## 7. Advanced tips

| Need                                   | Approach                                                                                           |
|----------------------------------------|----------------------------------------------------------------------------------------------------|
| Force map to specific SRID             | Set SRID in field attributes; Saltcorn handles reprojection in SQL.                                |
| Store 3‑D points (lon, lat, alt)       | Set **Dimension = Z** on the field, use `POINTZ(lon lat alt)`.                                     |
| Measured LineString (Route with M)     | Dimension `M` → `LINESTRINGM(lon lat m, …)` where *m* = distance or time.                          |
| Multiple geometry columns              | Add extra PostGIS fields (`point_geom`, `boundary_geom`, …) and choose separate field‑views.       |
| Custom styling                         | For Leaflet plug‑in: **Views → places_map → Script → “Marker style JS”**.                          |
| Static image export                    | Use PostGIS → `ST_AsPNG`, or map plug‑in feature “Export → PNG/SVG”.                               |

---

## 8. Troubleshooting

| Symptom                                             | Fix / Explanation                                                                        |
|-----------------------------------------------------|------------------------------------------------------------------------------------------|
| “Value must be a WKT string”                        | Check leading keyword (must match field subtype) and bracket balance.                    |
| SRID mismatch error on save                         | Set the SRID attribute to match incoming data, or wrap input in `SRID=xxxx;…`.           |
| Map shows blank tiles                               | Verify map plug‑in’s tile URL and that Internet access is available.                     |
| Geometry appears in wrong place (lon/lat swapped)   | Remember: PostGIS expects `X Y` = `lon lat` (not lat/lon).                               |
| Polygon drawn anticlockwise becomes a hole          | GIS convention: outer rings clockwise, inner rings anticlockwise.                        |

---

## 9. Appendix: Raw SQL version (optional)

If you prefer SQL migrations over the UI:

-- A. Points
CREATE TABLE public.places (
  id   serial PRIMARY KEY,
  name text,
  geom geometry(Point,4326)
);

-- B. Polygons with Z‑dimension
CREATE TABLE public.parks (
  id   serial PRIMARY KEY,
  name text,
  area geometry(PolygonZ,4326)
);

Enable Saltcorn to recognise these columns:

1.  **Settings → Refresh table list**.  
2.  Edit each field → set **Field Type** to the matching PostGIS type (Saltcorn UI).

---

### More resources

* PostGIS manual – <https://postgis.net/docs>
* Australian EPSG codes –  
  *GDA94*: 4283, *GDA2020*: 7844, *Web Mercator*: 3857

Happy mapping! 🇦🇺