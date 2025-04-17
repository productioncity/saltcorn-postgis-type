# Saltcorn PostGIS Type Plug‑in `@productioncity/saltcorn-postgis-type`

[![Licence: CC0‑1.0](https://img.shields.io/badge/licence-CC0--1.0-lightgrey.svg)](LICENCE)
[![GitHub Packages](https://img.shields.io/badge/gh--packages-%40productioncity%2Fsaltcorn--postgis--type-blue?logo=github)](https://github.com/productioncity/saltcorn-postgis-type/pkgs/npm/saltcorn-postgis-type)
[![GitHub repo](https://img.shields.io/badge/repo-productioncity/saltcorn--postgis--type-blue?logo=github)](https://github.com/productioncity/saltcorn-postgis-type)

A full‑featured **Saltcorn** plug‑in that surfaces every practical **PostGIS** _geometry_ and _geography_ data‑type, complete with:

* Attribute control for **SRID**, **dimensionality** (Z/M/ZM) and optional **sub‑type** constraints.  
* Robust form‑level validation for Well‑Known Text (WKT/EWKT) plus built‑in **GeoJSON → WKT** conversion.  
* Drop‑in *show* and *edit* field‑views that work everywhere Saltcorn expects a normal text input.  
* Zero external dependencies and no runtime configuration beyond enabling the PostGIS extension.

---

## Contents

1. [Quick‑start](#quick-start)  
2. [What you get](#what-you-get)  
3. [Installing the plug‑in](#installing-the-plug-in)  
4. [Activating inside Saltcorn](#activating-inside-saltcorn)  
5. [Using the new spatial types](#using-the-new-spatial-types)  
6. [Examples](#examples)  
7. [Development & contributions](#development--contributions)  
8. [Frequently asked questions](#frequently-asked-questions)  
9. [Licence](#licence)

---

## Quick‑start

##############################################################################
# 1. Authenticate NPM/Yarn to GitHub Packages (once per development machine)
##############################################################################
#   • Create a GitHub personal access token (PAT) with “read:packages” scope.
#   • Add it to your global ~/.npmrc (or project‑level .npmrc):
echo "//npm.pkg.github.com/:_authToken=<YOUR_GITHUB_PAT>" >> ~/.npmrc

##############################################################################
# 2. Install the plug‑in via the Saltcorn CLI
##############################################################################
saltcorn install-plugin @productioncity/saltcorn-postgis-type \
  --registry=https://npm.pkg.github.com

Create (or migrate) a table, add a column with type **“PostGIS Geometry / Point”** (or any other spatial type), then start storing data in WKT, EWKT or raw GeoJSON — everything works out of the box.

---

## What you get

| Saltcorn type name | Backing SQL type                                    | Attribute controls                    |
|--------------------|-----------------------------------------------------|---------------------------------------|
| geometry           | `geometry(Geometry,SRID)`                           | SRID ✔ Dim ✔ Sub‑type ✔               |
| geography          | `geography(Geometry,SRID)`                          | SRID ✔ Dim ✔ Sub‑type ✔               |
| point              | `geometry(Point⇢,SRID)`                             | SRID ✔ Dim ✔                          |
| linestring         | `geometry(LineString⇢,SRID)`                        | SRID ✔ Dim ✔                          |
| polygon            | `geometry(Polygon⇢,SRID)`                           | SRID ✔ Dim ✔                          |
| multipoint         | `geometry(MultiPoint⇢,SRID)`                        | SRID ✔ Dim ✔                          |
| multilinestring    | `geometry(MultiLineString⇢,SRID)`                   | SRID ✔ Dim ✔                          |
| multipolygon       | `geometry(MultiPolygon⇢,SRID)`                      | SRID ✔ Dim ✔                          |
| geometrycollection | `geometry(GeometryCollection⇢,SRID)`                | SRID ✔ Dim ✔                          |
| circularstring     | …and every other PostGIS specialist subtype…        | SRID ✔ Dim ✔                          |

`⇢` The plug‑in automatically appends `Z`, `M` or `ZM` when you tick the **Dimension** attribute.

### Field‑views

* **show** – renders WKT/EWKT inside a fixed‑width `<code>` block; safe in HTML.  
* **edit** – Bootstrap text box with placeholder examples and HTML `inputmode="text"` (mobile‑friendly).  

---

## Installing the plug‑in

This package **is not published on NPMJS**.  
It is distributed exclusively via **GitHub Packages** under the `@productioncity` scope, or via a local checkout.

### Option 1 – GitHub Packages (recommended)

1. Create a **GitHub personal access token (PAT)** with `read:packages` scope.  
2. Add your token to `~/.npmrc` (global) or `.npmrc` (project):

   //npm.pkg.github.com/:_authToken=<YOUR_GITHUB_PAT>

3. Install with the Saltcorn CLI:

   saltcorn install-plugin @productioncity/saltcorn-postgis-type \
     --registry=https://npm.pkg.github.com

   The Saltcorn CLI calls `npm install` internally; with the `.npmrc` line above it will resolve the package from GitHub Packages.

### Option 2 – Local folder (development / air‑gapped)

git clone https://github.com/productioncity/saltcorn-postgis-type.git
saltcorn install-plugin -d /absolute/path/to/saltcorn-postgis-type

### Option 3 – Pin in `package.json` (Docker builds / monorepos)

# npm
npm install --save @productioncity/saltcorn-postgis-type \
  --registry=https://npm.pkg.github.com

# Yarn 3/4 (via Corepack)
yarn npm install @productioncity/saltcorn-postgis-type \
  --access=public --publishRegistry=https://npm.pkg.github.com

> ⚠️ **Heads‑up**  
> • The Saltcorn GUI “Browse Store” lists only packages on NPMJS, so this plug‑in does **not** appear there.  
> • You must add the `.npmrc` line (step 2) otherwise installation will fail with *“Not found @productioncity/saltcorn-postgis-type”*.

---

## Activating inside Saltcorn

Activation is automatic once the package is installed **and** your database has the PostGIS extension:

-- Run once per database / tenant
CREATE EXTENSION IF NOT EXISTS postgis;

After creating the extension, restart Saltcorn or reload tenants (Settings → Tenants → Reload).

---

## Using the new spatial types

1. **Create or alter a table**  
   Pick any of the new types from the Field Type dropdown.  
2. **Set attributes (optional)**  
   * **SRID** – defaults to `4326` (WGS‑84).  
   * **Dimension** – `Z`, `M` or `ZM` for 3‑D/measured geometries.  
   * **Subtype** – only visible for the generic *geometry/geography* types.  
3. **Build forms & views** – Saltcorn chooses the correct field‑view automatically, or select *show* / *edit* manually.

### Accepted input formats

| Format      | Example                                                    |
|-------------|------------------------------------------------------------|
| **WKT**     | `POINT(30 10)`                                             |
| **EWKT**    | `SRID=3857;POLYGON((0 0,0 1,1 1,1 0,0 0))`                 |
| **GeoJSON** | `{"type":"Point","coordinates":[30,10]}`                   |

GeoJSON is silently converted to WKT before storage — handy when consuming APIs.

---

## Examples

### 1 – Storing a 3‑D point

Field definition: *point*, Dimension `Z`, SRID `7856` (GDA2020)

POINTZ(153.021 -27.470 2.5)

### 2 – Bulk import with SQL

INSERT INTO places(name, geom)
VALUES
  ('Store',   ST_GeomFromText('POINT(144.9631 -37.8136)', 4326)),
  ('Park',    ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[…]}')),
  ('Airport', 'SRID=4326;POINT(151.177 -33.946)');

### 3 – Spatial query in a view

SELECT name
FROM   places
WHERE  ST_DWithin(
         geom,
         ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
         :radius_m
       );

---

## Development & contributions

1. Fork `https://github.com/productioncity/saltcorn-postgis-type`.  
2. `git clone` then `npm install` (or `yarn`).  
3. `saltcorn dev:localize-plugin /path/to/clone` to hot‑reload in your dev instance.  
4. Edit `index.js`, run ESLint/Prettier, commit, push, open a PR.

The project follows the [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html). If anything is unclear, open an issue before starting large work.

### Running unit tests

> _(None yet)_ – feel free to contribute 🙂

---

## Frequently asked questions

**Q 1 – Why isn’t the plug‑in in the Saltcorn Store?**  
The Store lists only packages published to NPMJS. Production City distributes exclusively via GitHub Packages.

**Q 2 – Do I need a paid GitHub plan for the PAT?**  
No. A free personal token with `read:packages` is sufficient.

**Q 3 – I use an SRID other than 4326 — must I re‑project?**  
No. Set the SRID attribute when creating the field (e.g. `geometry(Point,7856)`).

**Q 4 – Can I render maps in Saltcorn forms?**  
This plug‑in only provides the data types. Combine it with the “Map” field‑view or a custom view (Leaflet/MapLibre) for map rendering.

---

## Licence

Production City – _CC0‑1.0_  
Do whatever you like, attribution appreciated.