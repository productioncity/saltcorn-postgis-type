# Security Policy – @productioncity/saltcorn‑postgis‑type

_Last updated: 19 April 2025 (AEST)_

## Supported Versions

The plug‑in follows **semver‐major** support:

| Version | Status | Security Updates | Node LTS Range | Saltcorn Version |
|---------|--------|------------------|----------------|------------------|
| `0.2.x` | **Current** | ✓ | ≥ 18 LTS | ≥ 1.0.0 |

Older releases have reached end‑of‑life and **no longer receive security fixes**.  
Please upgrade to the latest minor/patch release on the `0.1` line.

## Reporting a Vulnerability

1. **Private disclosure (preferred)**  
   Email `security@production.city` **or** `troy@team.production.city` with:
   * A descriptive subject: “SECURITY – saltcorn‑postgis‑type”.
   * A detailed description of the issue and reproduction steps.
   * Proof‑of‑concept exploit or minimal test case where possible.

2. **Public GitHub advisory**  
   If email is not viable, open a private “Security Advisory” in the GitHub
   repository (<https://github.com/productioncity/saltcorn-postgis-type> ▶
   “Security” tab ▶ “Advisories” ▶ “New Draft Advisory”).

We aim to acknowledge reports **within two (2) business days** and to provide
an initial assessment or request for clarification within **five (5) business
days**.

## Coordinated Disclosure Process

| Phase | Target timeline | Action |
|-------|-----------------|--------|
| Triage & validation | ≤ 5 working days | Reproduce, assess severity (CVSS) and confirm affected versions. |
| Fix development | ≤ 15 working days | Develop and test a patch and regression tests. |
| Pre‑release notification | ≤ 2 working days before release | Inform reporter and major downstream maintainers under embargo. |
| Public release | – | Publish a patched version on npm/GitHub Packages and create a GitHub Security Advisory with CVE (where applicable). |
| Post‑mortem | ≤ 14 days after release | Publish root‑cause analysis and any hardening measures taken. |

*Timelines may extend for low‑severity issues or during holiday periods.*

## Scope

This policy covers **only** the `@productioncity/saltcorn‑postgis‑type`
project.  Vulnerabilities found in Saltcorn core, PostGIS, Node.js or other
dependencies must be directed to their respective maintainers.

## Exclusions

The following are **not** considered security issues:

* “Denial‑of‑service” via intentionally malformed geometry larger than 10 MB.
* The ability for an **authorised Saltcorn admin** to submit malicious WKT /
  GeoJSON — admins are implicitly trusted.
* Lack of CSP/COOP/COEP headers in Saltcorn itself.

## Third‑Party Dependencies

The plug‑in relies solely on the following runtime packages:

| Package | Licence | Notes |
|---------|---------|-------|
| `wkx`        | MIT | Geometry/WKB parsing |
| `wellknown`  | MIT | WKT ↔ GeoJSON conversion |

Each dependency is kept at the latest compatible patch level; Dependabot
monitors CVE feeds weekly.

## Hall of Fame

We gratefully acknowledge individuals who responsibly disclosed
vulnerabilities:

| Date | Reporter | CVE / Advisory | Severity (CVSS v3) |
|------|----------|----------------|--------------------|
| –    | –        | –              | – |

*(empty — be the first!)*

## Questions?

Open a discussion in the GitHub “Security” area or email
`troy@team.production.city`.

Released under CC0‑1.0  
_No warranty expressed or implied._
