#!/usr/bin/env node
/**
 * populate-public.js
 * -----------------------------------------------------------------------------
 * Downloads and unpacks the assets listed in `public-files.json` so Saltcorn
 * can serve them from the `public/` folder.
 *
 * Highlights
 *   • Follows up to 10 redirects (GitHub, SourceForge, …)                │
 *   • Transparently extracts .zip / .tar.* / .tgz archives               │
 *   • If an archive contains a top-level **dist/** folder, _only_ the    │
 *     contents of that folder are kept (common in many Leaflet plugins). │
 *   • No runtime npm deps – uses only Node ≥ 18 built-ins + system tar    │
 *     and unzip.                                                         │
 *
 * Author:  Troy Kelly <troy@team.production.city>   (CC0-1.0)
 * First:   27 Apr 2025
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
const ROOT_DIR      = path.resolve(__dirname, '..');
const PUBLIC_DIR    = path.join(ROOT_DIR, 'public');
const MANIFEST_SRC  = path.join(ROOT_DIR, 'public-files.json');
const TMP_DIR       = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-pgis-'));
const MAX_REDIRECTS = 10;

/**
 * Basic colourised console output.
 */
const ui = {
  info:  (m) => console.log(`\x1b[34mℹ︎\x1b[0m ${m}`),
  ok:    (m) => console.log(`\x1b[32m✔\x1b[0m ${m}`),
  warn:  (m) => console.warn(`\x1b[33m⚠\x1b[0m ${m}`),
  error: (m) => console.error(`\x1b[31m✖\x1b[0m ${m}`),
};

/* ──────────────────── Low-level utility functions ────────────────── */

/**
 * Download `url` to `dest`, transparently following redirects.
 *
 * @param {string} url
 * @param {string} dest
 * @param {number} depth
 * @returns {Promise<void>}
 */
async function download(url, dest, depth = 0) {
  if (depth > MAX_REDIRECTS) {
    throw new Error(`Too many redirects while fetching ${url}`);
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  ui.info((depth ? '↪ ' : '') + `Downloading ${url}`);

  await new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    lib
      .get(url, (res) => {
        /* ─── Redirect ─── */
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode)
        ) {
          if (!res.headers.location) {
            reject(
              new Error(
                `Redirect (${res.statusCode}) but no Location header for ${url}`,
              ),
            );
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          download(next, dest, depth + 1).then(resolve).catch(reject);
          return;
        }
        /* ─── Error status ─── */
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} while fetching ${url}`));
          return;
        }
        /* ─── Success ─── */
        pump(res, fs.createWriteStream(dest)).then(resolve).catch(reject);
      })
      .on('error', reject);
  });

  ui.ok(`Saved → ${path.relative(ROOT_DIR, dest)}`);
}

/**
 * Synchronously run a shell command; throws on non-zero exit.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [opts]
 */
function run(cmd, args, opts = {}) {
  const out = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (out.error) throw out.error;
  if (out.status !== 0) throw new Error(`${cmd} exited with ${out.status}`);
}

/**
 * Recursively copy a directory (Node ≥ 18 `fs.cpSync`).
 *
 * @param {string} from
 * @param {string} to
 */
function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, force: true, errorOnExist: false });
}

/**
 * Search `root` recursively for the FIRST directory literally named `dist`.
 *
 * @param {string} root
 * @returns {string|undefined} absolute path of the dist dir
 */
function findDistDir(root) {
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur)) {
      const full = path.join(cur, ent);
      if (fs.statSync(full).isDirectory()) {
        if (ent.toLowerCase() === 'dist') return full;
        stack.push(full);
      }
    }
  }
  return undefined;
}

/**
 * Extract an archive and, if a `dist/` directory exists inside it, promote
 * **only that folder’s contents** to `destDir`.
 *
 * @param {string} archivePath
 * @param {string} destDir
 */
function extractArchive(archivePath, destDir) {
  ui.info(
    `Extracting ${path.basename(archivePath)} → ${path.relative(
      ROOT_DIR,
      destDir,
    )}`,
  );

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const lower = archivePath.toLowerCase();
  if (lower.endsWith('.zip')) {
    try {
      run('unzip', ['-q', '-o', archivePath, '-d', destDir]);
    } catch {
      ui.warn('`unzip` unavailable – falling back to `tar`');
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

  /* ── Flatten single top-level directory ─────────────────────────── */
  const first = fs.readdirSync(destDir);
  if (first.length === 1) {
    const maybe = path.join(destDir, first[0]);
    if (fs.statSync(maybe).isDirectory()) {
      for (const entry of fs.readdirSync(maybe)) {
        fs.renameSync(path.join(maybe, entry), path.join(destDir, entry));
      }
      fs.rmSync(maybe, { recursive: true, force: true });
    }
  }

  /* ── dist/ handling ─────────────────────────────────────────────── */
  const distPath = findDistDir(destDir);
  if (distPath && distPath !== destDir) {
    ui.info('Found dist/ folder – using its contents only');
    const tmp = path.join(TMP_DIR, `dist-tmp-${Date.now()}`);
    copyDir(distPath, tmp);

    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    copyDir(tmp, destDir);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  ui.ok(`Extracted ${path.basename(archivePath)}`);
}

/* ───────────────────── Higher-level work functions ───────────────── */

/**
 * Process one manifest record (Leaflet or plugin).
 *
 * @param {string}  name
 * @param {object}  record
 * @param {boolean} isLeaflet
 */
async function processEntry(name, record, isLeaflet = false) {
  const destDir = path.join(PUBLIC_DIR, name);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  if (record.releasefile) {
    const tmpPath = path.join(
      TMP_DIR,
      `${name}-${path.basename(record.releasefile)}`,
    );
    await download(record.releasefile, tmpPath);
    extractArchive(tmpPath, destDir);
  } else if (Array.isArray(record.files)) {
    for (const url of record.files) {
      const fileName = path.basename(new URL(url).pathname);
      await download(url, path.join(destDir, fileName));
    }
  } else {
    ui.warn(`Manifest entry for ${name} has neither files nor releasefile`);
  }

  /* Leaflet housekeeping – ensure canonical filenames at root */
  if (isLeaflet) {
    const js = locateFile(destDir, /leaflet(?:\.min)?\.js$/i);
    const css = locateFile(destDir, /leaflet(?:\.min)?\.css$/i);
    if (js) fs.copyFileSync(js, path.join(destDir, 'leaflet.js'));
    if (css) fs.copyFileSync(css, path.join(destDir, 'leaflet.css'));
  }
}

/**
 * Recursively find the first file whose basename matches `re`.
 *
 * @param {string} dir
 * @param {RegExp} re
 * @returns {string|undefined}
 */
function locateFile(dir, re) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur)) {
      const full = path.join(cur, ent);
      if (fs.statSync(full).isDirectory()) stack.push(full);
      else if (re.test(ent)) return full;
    }
  }
  return undefined;
}

/* ───────────────────────────── Main driver ───────────────────────── */

(async () => {
  try {
    ui.info('──────────────────────────────────────────────────────────────');
    ui.info('Populating public/ assets from manifest …');

    const manifest = JSON.parse(await fsp.readFile(MANIFEST_SRC, 'utf8'));
    await fsp.mkdir(PUBLIC_DIR, { recursive: true });

    if (manifest.leaflet) {
      await processEntry('leaflet', manifest.leaflet, true);
    }
    if (Array.isArray(manifest.plugins)) {
      for (const p of manifest.plugins) {
        await processEntry(p.name, p, false);
      }
    }

    ui.ok('All assets ready in public/ 🎉');
    ui.info('──────────────────────────────────────────────────────────────');
  } catch (err) {
    ui.error(err.stack || err.message || String(err));
    process.exit(1);
  }
})();