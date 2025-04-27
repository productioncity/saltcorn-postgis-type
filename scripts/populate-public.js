#!/usr/bin/env node
/**
 * populate-public.js
 * -----------------------------------------------------------------------------
 * A **stand-alone** Node.js helper that downloads and unpacks every asset
 * defined in `public-files.json`, creating the ready-to-serve `public/`
 * directory used by Saltcorn at run-time.
 *
 * Key features
 *   • Transparent HTTP → HTTPS redirect handling (GitHub, SourceForge, S3 …)  
 *   • No runtime npm dependencies – only built-in Node ≥ 18 APIs  
 *   • Works on Linux/macOS/Windows runners (requires `tar` + `unzip` CLIs)  
 *
 * Directory layout
 *   public/leaflet/…              ← Leaflet core assets
 *   public/<plugin-name>/…        ← Each Leaflet plug-in
 *
 * Usage (local developer):
 *   $ node scripts/populate-public.js
 *
 * Usage (GitHub Actions):
 *   - name: Fetch public assets
 *     run: node scripts/populate-public.js
 *
 * Author:      Troy Kelly <troy@team.production.city>
 * First Issue: 27 Apr 2025
 * Licence:     CC0-1.0
 */

/* eslint-disable node/no-process-exit */

'use strict';

/* ───────────────────────────── Imports ───────────────────────────── */
const fs            = require('node:fs');
const fsp           = fs.promises;
const path          = require('node:path');
const os            = require('node:os');
const { spawnSync } = require('node:child_process');
const http          = require('node:http');
const https         = require('node:https');
const { pipeline }  = require('node:stream');
const { promisify } = require('node:util');

const pump = promisify(pipeline);

/* ──────────────── CLI helpers & global constants ─────────────────── */
const ROOT_DIR       = path.resolve(__dirname, '..');
const PUBLIC_DIR     = path.join(ROOT_DIR, 'public');
const MANIFEST_SRC   = path.join(ROOT_DIR, 'public-files.json');
const TMP_DIR        = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-pgis-'));
const MAX_REDIRECTS  = 10; // safety valve to prevent infinite loops

/**
 * Basic colourised console output.
 */
const ui = {
  info:  (msg) => console.log(`\x1b[34mℹ︎\x1b[0m ${msg}`),
  warn:  (msg) => console.warn(`\x1b[33m⚠\x1b[0m ${msg}`),
  error: (msg) => console.error(`\x1b[31m✖\x1b[0m ${msg}`),
  ok:    (msg) => console.log(`\x1b[32m✔\x1b[0m ${msg}`),
};

/* ──────────────────── Low-level utility functions ────────────────── */

/**
 * Download a remote file (HTTP/HTTPS) to the supplied destination path
 * following **up to MAX_REDIRECTS** redirects.
 *
 * The destination directory is created automatically.
 *
 * @param {string} url          Absolute or scheme-relative URL
 * @param {string} dest         Absolute file path on disk
 * @param {number} [depth=0]    Recursion depth for redirect tracking
 * @returns {Promise<void>}
 */
async function download(url, dest, depth = 0) {
  if (depth > MAX_REDIRECTS) {
    throw new Error(`Too many redirects while fetching ${url}`);
  }

  await fsp.mkdir(path.dirname(dest), { recursive: true });

  /** @type {typeof http | typeof https} */
  const proto = url.startsWith('https:') ? https : http;

  ui.info((depth ? '↪ ' : '') + `Downloading ${url}`);

  await new Promise((resolve, reject) => {
    proto
      .get(url, (res) => {
        /* Redirect handling ------------------------------------------------ */
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode)
        ) {
          const loc = res.headers.location;
          if (!loc) {
            reject(new Error(`Redirect (${res.statusCode}) with no location`));
            return;
          }
          // Drain response before follow-up to free sockets
          res.resume();
          const next = new URL(loc, url).toString();
          download(next, dest, depth + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        /* Error response --------------------------------------------------- */
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} while fetching ${url}`));
          return;
        }

        /* Success ---------------------------------------------------------- */
        pump(res, fs.createWriteStream(dest))
          .then(resolve)
          .catch((err) => reject(err));
      })
      .on('error', reject);
  });

  ui.ok(`Saved → ${path.relative(ROOT_DIR, dest)}`);
}

/**
 * Run a shell command synchronously, capturing stderr/stdout.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} opts
 * @returns {void}
 */
function run(cmd, args, opts = {}) {
  const out = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (out.error) throw out.error;
  if (out.status !== 0) {
    throw new Error(`${cmd} exited with code ${out.status}`);
  }
}

/**
 * Extract an archive (zip/tar/tgz/tar.gz/tar.xz/…).
 *
 * The first *single* top-level directory (common in GitHub releases) is
 * stripped, so the final assets sit directly in the target folder.
 *
 * @param {string} archivePath
 * @param {string} destDir
 * @returns {void}
 */
function extractArchive(archivePath, destDir) {
  ui.info(
    `Extracting ${path.basename(archivePath)} → ${path.relative(
      ROOT_DIR,
      destDir,
    )}`,
  );

  const lower = archivePath.toLowerCase();

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  if (lower.endsWith('.zip')) {
    // Prefer system unzip; fall back to bsdtar if available.
    try {
      run('unzip', ['-q', '-o', archivePath, '-d', destDir]);
    } catch {
      ui.warn('`unzip` failed or not present – trying `tar`');
      run('tar', ['-xf', archivePath, '-C', destDir]);
    }
  } else if (
    lower.endsWith('.tar.gz') ||
    lower.endsWith('.tgz') ||
    lower.endsWith('.tar.xz') ||
    lower.endsWith('.txz') ||
    lower.endsWith('.tar.bz2') ||
    lower.endsWith('.tbz2') ||
    lower.endsWith('.tar')
  ) {
    // Determine decompression flag by extension for portability.
    const flag =
      lower.endsWith('.tar.gz') || lower.endsWith('.tgz')
        ? 'z'
        : lower.endsWith('.tar.xz') || lower.endsWith('.txz')
          ? 'J'
          : lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')
            ? 'j'
            : '';
    run('tar', [`-x${flag}f`, archivePath, '-C', destDir]);
  } else {
    throw new Error(`Unsupported archive format: ${archivePath}`);
  }

  /* ── Flatten single top-level directory (common in GitHub archives) ── */
  const top = fs.readdirSync(destDir);
  if (top.length === 1) {
    const nested = path.join(destDir, top[0]);
    if (fs.statSync(nested).isDirectory()) {
      for (const entry of fs.readdirSync(nested)) {
        fs.renameSync(path.join(nested, entry), path.join(destDir, entry));
      }
      fs.rmdirSync(nested);
    }
  }

  ui.ok(`Extracted ${path.basename(archivePath)}`);
}

/* ───────────────────── Higher-level work functions ────────────────── */

/**
 * Process a single manifest entry (Leaflet or plug-in).
 *
 * @param {string}  name        Target directory name under public/
 * @param {object}  record      Manifest record
 * @param {boolean} isLeaflet   Special housekeeping for Leaflet core
 * @returns {Promise<void>}
 */
async function processEntry(name, record, isLeaflet = false) {
  const destDir = path.join(PUBLIC_DIR, name);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  if (record.releasefile) {
    /* ---------------- Archive path ---------------- */
    const tmpPath = path.join(
      TMP_DIR,
      `${name}-${path.basename(record.releasefile)}`,
    );
    await download(record.releasefile, tmpPath);
    extractArchive(tmpPath, destDir);
  } else if (Array.isArray(record.files)) {
    /* ---------------- Individual files ------------ */
    for (const fileURL of record.files) {
      const fileName = path.basename(new URL(fileURL).pathname);
      const destPath = path.join(destDir, fileName);
      await download(fileURL, destPath);
    }
  } else {
    ui.warn(`No 'releasefile' or 'files' defined for ${name} – skipped.`);
  }

  /* -------- Leaflet: ensure canonical file names at root -------- */
  if (isLeaflet) {
    const leafJs = locateFile(destDir, /leaflet(?:\.min)?\.js$/i);
    const leafCss = locateFile(destDir, /leaflet(?:\.min)?\.css$/i);

    if (leafJs) fs.copyFileSync(leafJs, path.join(destDir, 'leaflet.js'));
    if (leafCss) fs.copyFileSync(leafCss, path.join(destDir, 'leaflet.css'));
  }
}

/**
 * Locate the first file under a directory (recursive) that matches the given
 * `RegExp`. Returns the absolute path or *undefined*.
 *
 * @param {string} dir
 * @param {RegExp} re
 * @returns {string | undefined}
 */
function locateFile(dir, re) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur)) {
      const full = path.join(cur, entry);
      const st = fs.statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (re.test(entry)) return full;
    }
  }
  return undefined;
}

/* ───────────────────────────── Main driver ───────────────────────── */

(async () => {
  try {
    ui.info('──────────────────────────────────────────────────────────────');
    ui.info('Populating public/ assets from public-files.json …');

    /* 1 ─ Load manifest --------------------------------------------------- */
    const manifest = JSON.parse(await fsp.readFile(MANIFEST_SRC, 'utf8'));

    /* 2 ─ Ensure public/ exists ------------------------------------------ */
    await fsp.mkdir(PUBLIC_DIR, { recursive: true });

    /* 3 ─ Leaflet core ---------------------------------------------------- */
    if (manifest.leaflet) {
      await processEntry('leaflet', manifest.leaflet, true);
    }

    /* 4 ─ Plug-ins -------------------------------------------------------- */
    if (Array.isArray(manifest.plugins)) {
      for (const plugin of manifest.plugins) {
        await processEntry(plugin.name, plugin, false);
      }
    }

    ui.ok('All assets downloaded and ready in /public ✨');
    ui.info('──────────────────────────────────────────────────────────────');
  } catch (err) {
    ui.error(err.stack || err.message || String(err));
    process.exit(1);
  }
})();