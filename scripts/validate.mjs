/**
 * Static validation. Checks:
 *   - JSON syntax (package.json, extension/manifest.json)
 *   - manifest schema + source-of-truth version sync
 *   - referenced files exist (scripts, styles, options page, icons)
 *   - icons are valid PNGs at the declared sizes
 *   - minimum permissions, no host/background privileges beyond content scripts
 *   - no network calls, remote code, eval, or localStorage in shipped sources
 *   - zero runtime dependencies
 *   - generated ZIPs (if present): structure, CRC, embedded manifest
 *
 * Usage: node scripts/validate.mjs [--require-dist]
 * Exits non-zero on any failure.
 */
import { readFile, readdir } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_DIR = path.join(ROOT, 'extension');

const ALLOWED_PERMISSIONS = new Set(['storage']);
const ICON_SIZES = [16, 48, 128];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SOURCE_EXTENSIONS = new Set(['.js', '.css', '.html']);

// The extension must never talk to the network, execute remote/eval'd code,
// or touch page storage. Host patterns in manifest.json are not URLs and are
// checked separately.
const FORBIDDEN_SOURCE_TOKENS = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'importScripts',
  'eval(',
  'new Function',
  'http://',
  'https://',
  'localStorage',
  'document.cookie',
];

const MANIFEST_ENTRY_POINTS = [
  ['content script js', (m) => (m.content_scripts || []).flatMap((cs) => cs.js || [])],
  ['content script css', (m) => (m.content_scripts || []).flatMap((cs) => cs.css || [])],
  ['options page', (m) => (m.options_ui && m.options_ui.page ? [m.options_ui.page] : [])],
  ['icons', (m) => Object.values(m.icons || {})],
];

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

/** Schema checks only; sync and dependency-free so the build can reuse it. */
export function validateManifest(manifest, pkg) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest: not a JSON object'];
  }
  if (manifest.manifest_version !== 3) errors.push('manifest: manifest_version must be 3');
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) errors.push('manifest: name is required');
  if (typeof manifest.description !== 'string' || manifest.description.length > 132) {
    errors.push('manifest: description required, max 132 characters');
  }

  const version = typeof manifest.version === 'string' ? manifest.version : '';
  if (!/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) {
    errors.push('manifest: version must be one to four dot-separated integers without leading zeros');
  } else if (version.split('.').some((part) => Number(part) > 65535)) {
    errors.push('manifest: version parts must be <= 65535');
  }
  if (pkg && manifest.version !== pkg.version) {
    errors.push(`manifest: version ${manifest.version} out of sync with package.json ${pkg.version}`);
  }

  if (!Array.isArray(manifest.permissions)) {
    errors.push('manifest: permissions array is required');
  } else {
    for (const permission of manifest.permissions) {
      if (!ALLOWED_PERMISSIONS.has(permission)) errors.push(`manifest: permission not allowed: ${permission}`);
    }
    if (!manifest.permissions.includes('storage')) errors.push('manifest: "storage" permission is required');
  }

  for (const forbidden of ['host_permissions', 'web_accessible_resources', 'externally_connectable']) {
    if (forbidden in manifest) errors.push(`manifest: ${forbidden} must not be requested`);
  }

  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
    errors.push('manifest: at least one content_scripts entry is required');
  } else {
    manifest.content_scripts.forEach((entry, index) => {
      if (!Array.isArray(entry.js) || entry.js.length === 0) {
        errors.push(`manifest: content_scripts[${index}].js is required`);
      }
      if (!Array.isArray(entry.matches) || entry.matches.length === 0) {
        errors.push(`manifest: content_scripts[${index}].matches is required`);
      } else {
        for (const pattern of entry.matches) {
          if (!/^(https?|file):\/\/\*\/\*$/.test(pattern) && pattern !== '<all_urls>') {
            errors.push(`manifest: content_scripts[${index}] unexpected match pattern: ${pattern}`);
          }
        }
      }
      if (entry.all_frames !== false) errors.push(`manifest: content_scripts[${index}] must set all_frames: false`);
      if (!['document_start', 'document_end', 'document_idle'].includes(entry.run_at)) {
        errors.push(`manifest: content_scripts[${index}] invalid run_at`);
      }
      if (Array.isArray(entry.exclude_matches) === false && entry.exclude_matches !== undefined) {
        errors.push(`manifest: content_scripts[${index}] invalid exclude_matches`);
      }
    });
  }

  if (!manifest.options_ui || !manifest.options_ui.page) {
    errors.push('manifest: options_ui.page is required');
  }
  for (const size of ICON_SIZES) {
    if (!manifest.icons || !manifest.icons[String(size)]) errors.push(`manifest: missing ${size}px icon entry`);
  }

  return errors;
}

async function fileExists(file) {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

/** Every file the manifest references must exist and be well-formed. */
export async function validateExtensionFiles(manifest) {
  const errors = [];
  const referenced = new Set();
  for (const [, collect] of MANIFEST_ENTRY_POINTS) {
    for (const rel of collect(manifest)) referenced.add(rel);
  }
  for (const rel of referenced) {
    if (rel.includes('..') || path.isAbsolute(rel)) {
      errors.push(`manifest: suspicious path: ${rel}`);
      continue;
    }
    if (!(await fileExists(path.join(EXTENSION_DIR, rel)))) {
      errors.push(`manifest: referenced file missing: extension/${rel}`);
    }
  }
  for (const size of ICON_SIZES) {
    const rel = (manifest.icons || {})[String(size)];
    if (!rel) continue;
    try {
      const buf = await readFile(path.join(EXTENSION_DIR, rel));
      if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
        errors.push(`icons: ${rel} is not a PNG`);
        continue;
      }
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width !== size || height !== size) {
        errors.push(`icons: ${rel} is ${width}x${height}, expected ${size}x${size}`);
      }
    } catch {
      // read failure already reported as missing above
    }
  }
  return errors;
}

/** Shipped sources must contain no network, remote-code, or page-storage use. */
export async function validateSourceHygiene() {
  const errors = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        const content = await readFile(full, 'utf8');
        for (const token of FORBIDDEN_SOURCE_TOKENS) {
          if (content.includes(token)) {
            errors.push(`source: forbidden token "${token}" in extension/${path.relative(EXTENSION_DIR, full)}`);
          }
        }
      }
    }
  }
  await walk(EXTENSION_DIR);
  return errors;
}

export function validatePackageJson(pkg) {
  const errors = [];
  if (pkg.license !== 'Apache-2.0') errors.push('package.json: license must be Apache-2.0');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version || '')) {
    errors.push('package.json: version must be SemVer');
  }
  const deps = pkg.dependencies || {};
  if (Object.keys(deps).length > 0) {
    errors.push(`package.json: runtime dependencies are not allowed: ${Object.keys(deps).join(', ')}`);
  }
  if (pkg.type !== 'module') errors.push('package.json: type must be "module"');
  return errors;
}

function findEndOfCentralDirectory(buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/** Parse and fully verify a ZIP: structure, paths, CRCs, embedded manifest. */
export function validateZip(buf, expected) {
  const errors = [];
  if (buf.length < 22) return ['zip: file too small'];
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) return ['zip: end-of-central-directory record not found'];
  const count = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0) errors.push('zip: archive is empty');
  if (centralOffset + centralSize > eocd) errors.push('zip: central directory overlaps end record');

  let offset = centralOffset;
  let manifestEntry = null;
  for (let i = 0; i < count && offset + 46 <= buf.length; i += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      errors.push(`zip: bad central directory entry ${i}`);
      break;
    }
    const method = buf.readUInt16LE(offset + 10);
    const crc = buf.readUInt32LE(offset + 16);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (!name.startsWith('extension/') || name.includes('..')) {
      errors.push(`zip: unexpected entry path: ${name}`);
    }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      errors.push(`zip: bad local header for ${name}`);
      offset += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buf.subarray(dataStart, dataStart + compressedSize);

    let raw;
    try {
      if (method === 0) raw = data;
      else if (method === 8) raw = inflateRawSync(data);
      else throw new Error(`unsupported compression method ${method}`);
    } catch (error) {
      errors.push(`zip: cannot extract ${name}: ${error.message}`);
      offset += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    if (raw.length !== uncompressedSize) errors.push(`zip: size mismatch for ${name}`);
    if (crc32(raw) !== crc) errors.push(`zip: CRC mismatch for ${name}`);
    if (name === 'extension/manifest.json') manifestEntry = raw;

    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (!manifestEntry) {
    errors.push('zip: extension/manifest.json missing');
  } else {
    try {
      const embedded = JSON.parse(manifestEntry.toString('utf8'));
      if (expected && embedded.version !== expected.version) {
        errors.push(`zip: embedded manifest version ${embedded.version} != ${expected.version}`);
      }
      if (expected && embedded.name !== expected.name) {
        errors.push(`zip: embedded manifest name "${embedded.name}" != "${expected.name}"`);
      }
    } catch {
      errors.push('zip: embedded manifest.json is not valid JSON');
    }
  }
  return errors;
}

async function validateDist(pkg, manifest, requireDist) {
  const errors = [];
  const targets = [
    'dist/chrome/browser-word-filter-chrome.zip',
    'dist/firefox/browser-word-filter-firefox.zip',
  ];
  const expected = { version: manifest.version, name: manifest.name };
  for (const rel of targets) {
    let buf;
    try {
      buf = await readFile(path.join(ROOT, rel));
    } catch {
      if (requireDist) errors.push(`dist: missing required artifact ${rel}`);
      continue;
    }
    for (const error of validateZip(buf, expected)) errors.push(`${rel}: ${error}`);
  }
  void pkg;
  return errors;
}

async function main() {
  const requireDist = process.argv.includes('--require-dist');
  const errors = [];
  const sections = [];

  let pkg = null;
  let manifest = null;
  try {
    pkg = await readJson(path.join(ROOT, 'package.json'));
    manifest = await readJson(path.join(EXTENSION_DIR, 'manifest.json'));
    sections.push('JSON syntax');
  } catch (error) {
    errors.push(`JSON syntax: ${error.message}`);
  }

  if (pkg) errors.push(...validatePackageJson(pkg));
  if (pkg && manifest) errors.push(...validateManifest(manifest, pkg));
  if (manifest) {
    errors.push(...(await validateExtensionFiles(manifest)));
    sections.push('manifest schema');
    sections.push('manifest file references');
  }
  errors.push(...(await validateSourceHygiene()));
  sections.push('source hygiene (no network / remote code)');
  if (pkg && manifest) {
    errors.push(...(await validateDist(pkg, manifest, requireDist)));
    sections.push('generated artifacts');
  }

  for (const error of errors) console.error(`FAIL  ${error}`);
  if (errors.length > 0) {
    console.error(`\nvalidate: ${errors.length} problem(s) found`);
    process.exit(1);
  }
  console.log(`validate: OK — ${sections.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
