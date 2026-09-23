/**
 * Reproducible extension packaging. No dependencies: writes ZIP archives
 * directly (deflate + CRC-32) with fixed timestamps and sorted entries,
 * so two builds of the same tree are byte-identical.
 *
 * Output:
 *   dist/chrome/browser-word-filter-chrome.zip
 *   dist/firefox/browser-word-filter-firefox.zip
 *
 * The manifest version is stamped from package.json (single source of
 * truth) and the manifest is validated before any archive is written.
 * Each archive is verified after writing.
 *
 * Usage: npm run build
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readJson, validateManifest, validateExtensionFiles, validateZip, crc32 } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_DIR = path.join(ROOT, 'extension');
const DIST_DIR = path.join(ROOT, 'dist');

// Fixed DOS timestamp (1980-01-01 00:00) keeps output byte-identical.
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;
const UTF8_FLAG = 0x0800;

const FIREFOX_SETTINGS = {
  browser_specific_settings: {
    gecko: {
      id: 'browser-word-filter@kibotu.github.io',
      strict_min_version: '109.0',
    },
  },
};

async function collectFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(full, rel)));
    else if (entry.isFile()) files.push({ name: rel, data: await readFile(full) });
  }
  return files;
}

function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const raw = file.data;
    const deflated = deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuf, eocd]);
}

async function writeArchive(relPath, files) {
  const zip = createZipBuffer(files);
  const target = path.join(DIST_DIR, relPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, zip);
  return { target, zip };
}

async function main() {
  const pkg = await readJson(path.join(ROOT, 'package.json'));
  const manifest = await readJson(path.join(EXTENSION_DIR, 'manifest.json'));

  // Single source of truth: stamp the package version into the manifest.
  manifest.version = pkg.version;

  const errors = [...validateManifest(manifest, pkg), ...(await validateExtensionFiles(manifest))];
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL  ${error}`);
    console.error('build: manifest validation failed, no archives written');
    process.exit(1);
  }

  const sourceFiles = await collectFiles(EXTENSION_DIR);
  const withManifest = (m) =>
    sourceFiles.map((file) =>
      file.name === 'manifest.json'
        ? { name: file.name, data: Buffer.from(`${JSON.stringify(m, null, 2)}\n`, 'utf8') }
        : file
    );
  const asArchiveEntries = (files) => files.map((f) => ({ name: `extension/${f.name}`, data: f.data }));

  const chrome = await writeArchive(
    path.join('chrome', 'browser-word-filter-chrome.zip'),
    asArchiveEntries(withManifest(manifest))
  );
  const firefoxManifest = { ...manifest, ...FIREFOX_SETTINGS };
  const firefox = await writeArchive(
    path.join('firefox', 'browser-word-filter-firefox.zip'),
    asArchiveEntries(withManifest(firefoxManifest))
  );

  const expected = { version: manifest.version, name: manifest.name };
  let failed = false;
  for (const { target, zip } of [chrome, firefox]) {
    const zipErrors = validateZip(zip, expected);
    for (const error of zipErrors) console.error(`FAIL  ${path.relative(ROOT, target)}: ${error}`);
    if (zipErrors.length > 0) failed = true;
    else console.log(`built ${path.relative(ROOT, target)} (${zip.length} bytes)`);
  }
  if (failed) {
    console.error('build: archive verification failed');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
