# Saltcorn PostGIS Type Plugin `@productioncity/saltcorn-postgis-type`

[![NPM version](https://img.shields.io/npm/v/saltcorn-postgis-type.svg?logo=npm&label=npm)](https://www.npmjs.com/package/saltcorn-postgis-type)
[![Licence: CC0‑1.0](https://img.shields.io/badge/licence-CC0--1.0-lightgrey.svg)](LICENCE)
[![GitHub repo](https://img.shields.io/badge/repo-productioncity/saltcorn--postgis--type-blue?logo=github)](https://github.com/productioncity/saltcorn-postgis-type)

A full‑featured Saltcorn plug‑in that surfaces every practical **PostGIS** _geometry_ and _geography_ data‑type, complete with:

* Attribute control for **SRID**, **dimensionality** (Z/M/ZM) and optional **sub‑type** constraints.  
* Robust form‐level validation for Well‑Known Text (WKT/EWKT) plus built‑in **GeoJSON → WKT** conversion.  
* Drop‑in _show_ and _edit_ field‑views that work everywhere Saltcorn expects a normal text input.  
* Zero external dependencies and no runtime configuration beyond enabling the PostGIS extension.

> Built for production systems, tested on Saltcorn 0.10 + PostgreSQL 15 + PostGIS 3.4.

---

## Contents
1. [Quick‑start](#quick-start)  
2. [What you get](#what-you-get)  
3. [Installing the plug‑in](#installing-the-plug-in)  
4. [Activating inside Saltcorn](#activating-inside-saltcorn)  
5. [Using the new spatial types](#using-the-new-spatial-types)  
6. [Examples](#examples)  
7. [Development & contributions](#development--contributions)  
8. [Frequently asked questions](#frequently-asked-questions)  
9. [Licence](#licence)

---

## Quick‑start

# Server already running Postgres with PostGIS.
saltcorn install-plugin saltcorn-postgis-type

Create (or migrate) a table, add a column with type **“PostGIS Geometry / Point”** (or any other spatial type), then start storing data in WKT, EWKT or raw GeoJSON — everything works out of the box.

---

## What you get

| Saltcorn type name | Backing SQL type                                    | Attribute controls                    |
|--------------------|-----------------------------------------------------|---------------------------------------|
| geometry           | `geometry(Geometry,SRID)`                           | SRID ✔ Dim ✔ Sub‑type ✔               |
| geography          | `geography(Geometry,SRID)`                          | SRID ✔ Dim ✔ Sub‑type ✔               |
| point              | `geometry(Point⇢,SRID)`                             | SRID ✔ Dim ✔                          |
| linestring         | `geometry(LineString⇢,SRID)`                        | SRID ✔ Dim ✔                          |
| polygon            | `geometry(Polygon⇢,SRID)`                           | SRID ✔ Dim ✔                          |
| multipoint         | `geometry(MultiPoint⇢,SRID)`                        | SRID ✔ Dim ✔                          |
| multilinestring    | `geometry(MultiLineString⇢,SRID)`                   | SRID ✔ Dim ✔                          |
| multipolygon       | `geometry(MultiPolygon⇢,SRID)`                      | SRID ✔ Dim ✔                          |
| geometrycollection | `geometry(GeometryCollection⇢,SRID)`                | SRID ✔ Dim ✔                          |
| circularstring     | …and every other PostGIS specialist sub‑type…       | SRID ✔ Dim ✔                          |

`⇢` The plug‑in automatically appends `Z`, `M`, `ZM` when you tick the **Dimension** attribute.

### Field‑views

* **show** – renders WKT/EWKT inside a fixed‑width `<code>` block; safe to include in HTML.  
* **edit** – standard Bootstrap text box with placeholder examples and HTML5 `inputmode="text"` (works on mobile).  

Use them anywhere you would normally choose “Show” or “Edit” for a Saltcorn field.

### Validation & coercion

1. Accepts **WKT**, **EWKT** or objects exposing `.wkt`/`.toWKT()`/GeoJSON.  
2. Validates the leading token (`POINT`, `POLYGONZM`, …) and ensures balanced brackets.  
3. Converts geojson `{type:'Point',coordinates:[…]}` automatically to WKT before save.  
4. Fails fast with a clear message in the form UI when input is obviously wrong.

---

## Installing the plug‑in

You can install from the Saltcorn Store, NPM, or a local checkout.

### 1. From the Saltcorn Store (UI)

Settings → Plugins → Browse Store → search for “**PostGIS Type**” → Install.

### 2. Via the Saltcorn CLI

# From NPM (production install)
saltcorn install-plugin saltcorn-postgis-type

# OR from a local folder for development
saltcorn install-plugin -d /absolute/path/to/saltcorn-postgis-type

### 3. Add to `package.json` (monorepo / docker image)

npm install --save saltcorn-postgis-type
# or
yarn add saltcorn-postgis-type

---

## Activating inside Saltcorn

Once installed, activation is automatic **provided** your database has the PostGIS extension enabled.

-- one‑off per database/tenant
CREATE EXTENSION IF NOT EXISTS postgis;

Then restart Saltcorn or reload tenants (Settings → Tenants → Reload).

---

## Using the new spatial types

1. **Create or alter a table**  
   Choose any of the new types from the Field Type dropdown.  
2. **Set attributes (optional)**  
   * **SRID** – defaults to `4326` (WGS‑84).  
   * **Dimension** – choose `Z`, `M` or `ZM` for 3‑D/measured geometries.  
   * **Subtype** – only visible for the generic *geometry/geography* types.  
3. **Build forms & views** – Add your field; Saltcorn selects the correct field‑view automatically, or you can pick `show`/`edit` explicitly.

### Accepted input formats

| Format      | Example                                                    |
|-------------|------------------------------------------------------------|
| **WKT**     | `POINT(30 10)`                                             |
| **EWKT**    | `SRID=3857;POLYGON((0 0,0 1,1 1,1 0,0 0))`                 |
| **GeoJSON** | `{"type":"Point","coordinates":[30,10]}`                   |

GeoJSON is silently converted to WKT before storage — handy when consuming APIs.

---

## Examples

### 1. Storing a 3‑D point

-- Table creation wizard:
--  field name: "footpath_vertex"
--  field type: "point"
--  Dimension: "Z"
--  SRID: 7856 (GDA2020)

Form input:

POINTZ(153.021  -27.470 2.5)

### 2. Bulk import with SQL

INSERT INTO places(name, geom)
VALUES
  ('Store',    ST_GeomFromText('POINT(144.9631 -37.8136)', 4326)),
  ('Park',     ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[…]}')),
  ('Airport',  'SRID=4326;POINT(151.177 -33.946)');

The plug‑in imposes no extra ceremony — you may call every PostGIS function directly.

### 3. Spatial query in a view

SELECT name
FROM   places
WHERE  ST_DWithin(
        geom,
        ST_SetSRID(ST_MakePoint(:lon,:lat), 4326),
        :radius_m
);

---

## Development & contributions

1. Fork `https://github.com/productioncity/saltcorn-postgis-type`  
2. `git clone` then `npm install` (or `yarn`)  
3. `saltcorn dev:localize-plugin /path/to/clone` to hot‑reload in your dev database.  
4. Edit `index.js`, run ESLint/Prettier, commit, push, open a PR.

We follow the [Google JS Style Guide](https://google.github.io/styleguide/jsguide.html). For anything unclear, open an issue first.

### Running unit tests

> _(None yet)_ – feel free to contribute 😉

---

## Frequently asked questions

**Q 1: Does the plug‑in create the PostGIS extension for me?**  
A: No — that requires super‑user privileges. Run `CREATE EXTENSION postgis;` once.

**Q 2: I use a geometry SRID other than 4326. Do I have to reproject?**  
A: Not if you set the SRID attribute when creating the field. The plug‑in bakes it into the SQL type, e.g. `geometry(Point,7856)`.

**Q 3: Can I display a Leaflet/MapLibre map in the form?**  
A: This plug‑in focuses purely on the data type. Combine it with the “Map” field‑view or a custom view to render maps.

**Q 4: How do I search across geometries of different SRIDs?**  
A: Standard PostGIS: `ST_Transform` both operands to a common SRID first.

---

## Licence

Production City – _CC0‑1.0_  
Do what you like, but attribution is appreciated.