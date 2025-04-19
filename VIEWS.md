# PostGIS “Edit” Views – Developer Guide

The plug‑in ships **two complementary _edit_ field‑views** that you can mix‑and‑match per‑field when building Saltcorn forms:

| View name | Purpose | Best for |
|-----------|---------|----------|
| `edit` (default) | Interactive Leaflet map with full _draw / edit / delete_ controls powered by **leaflet.draw**. Automatically converts the geometry to WKT for storage. | Everyday data entry – create, move, delete points, lines or polygons with the mouse / touch. |
| `raw` | Plain `<textarea>` that accepts **any** WKT / EWKT text. Use this to enter extra dimensions (*Z*, *M*, *ZM*) or exotic sub‑types that Leaflet cannot draw. | Power‑users & bulk copy/paste operations. |

Both views are available for **every PostGIS type** exposed by the plug‑in – simply choose the desired view in the _Field‑view_ dropdown when creating or editing a Saltcorn view.

---

## 1 – Interactive map editor (`edit`)

* **Create** geometries  
  Click the draw tool (marker, line, polygon or rectangle) then click on the map.

* **Edit / move**  
  Use the edit tool (pencil) to drag vertices or the entire shape.

* **Delete**  
  Select the dust‑bin icon and click the geometry you want to remove.

* **Multiple geometries**  
  The control deliberately allows **only one** geometry per field. Drawing a new
  shape replaces the previous one – mirroring the one‑column‑per‑field model in
  Saltcorn.

* **SRID & dimensions**  
  The map always operates in **WGS‑84 (EPSG 4326)** and stores standard WKT.
  If your field is defined with a different SRID or dimensionality you can
  fine‑tune the result afterwards in the “raw” editor or a SQL transform.

---

## 2 – Raw WKT editor (`raw`)

A simple text box – whatever you type is what gets persisted. Handy for:

* Adding **Z / M / ZM** ordinates:  
  `POINT ZM (153.021 -27.470 25.4 1234)`
* Specifying **complex sub‑types**:  
  `CIRCULARSTRING(…​)`
* Bulk copy/paste from external tools.

You can reveal the raw editor while using the map view by clicking **“Toggle
raw WKT editor”**. Both widgets stay synchronised – edits in one instantly
update the other.

---

## 3 – Frequently asked questions

**Q 1 – How do I switch between the editors?**  
When configuring a Saltcorn _view_, open the _Field‑view_ settings for your
geometry field and select either `edit` or `raw` from the list.

**Q 2 – Can I store multiple geometries in one field?**  
No. PostGIS columns hold a single geometry value. To model a collection,
create a separate table with a foreign‑key.

**Q 3 – Will the plug‑in re‑project coordinates automatically?**  
The map editor always emits `SRID=4326;…` or plain‐SRID‐less WKT. If your
column SRID differs use a database trigger (`ST_Transform`) or handle it in
application logic.

---

Production City (CC0‑1.0)