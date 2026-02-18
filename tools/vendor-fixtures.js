#!/usr/bin/env node

/**
 * Vendor JetBrains Kotlin PSI fixtures from the official repository.
 * Cross-platform Node.js replacement for vendor-fixtures.sh.
 *
 * Usage:
 *   node tools/vendor-fixtures.js [commit]
 *
 * If no commit is specified, reads from tools/cross-validation/.fixtures-version.
 *
 * @module vendor-fixtures
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');
const CROSS_VALIDATION_DIR = path.join(__dirname, 'cross-validation');
const FIXTURES_DIR = path.join(CROSS_VALIDATION_DIR, 'fixtures');
const VERSION_FILE = path.join(CROSS_VALIDATION_DIR, '.fixtures-version');
const KOTLIN_REPO = 'https://github.com/JetBrains/kotlin.git';
const PSI_PATH = 'compiler/testData/psi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a git command synchronously.
 * @param {string[]} args - Git arguments.
 * @param {string} cwd - Working directory.
 */
function git(args, cwd) {
  try {
    execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    });
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`git ${args.join(' ')} failed: ${msg}`);
  }
}

/**
 * Copy files matching extensions from src to dst (top-level only, no recursion).
 * @param {string} srcDir - Source directory.
 * @param {string} dstDir - Destination directory.
 * @param {Set<string>} extensions - File extensions to copy (e.g. '.kt', '.txt').
 * @returns {number} Number of files copied.
 */
function copyFiles(srcDir, dstDir, extensions) {
  let count = 0;

  if (!fs.existsSync(srcDir)) return count;

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    if (extensions.has(ext)) {
      const srcPath = path.join(srcDir, entry.name);
      const dstPath = path.join(dstDir, entry.name);
      fs.copyFileSync(srcPath, dstPath);
      count++;
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // Determine commit
  let commit = process.argv[2];
  if (!commit) {
    if (fs.existsSync(VERSION_FILE)) {
      commit = fs.readFileSync(VERSION_FILE, 'utf-8').trim();
    }
    if (!commit) {
      process.stderr.write('Error: No commit specified and no .fixtures-version file found.\n');
      process.stderr.write('Usage: node tools/vendor-fixtures.js [commit]\n');
      process.exit(1);
    }
  }

  process.stderr.write(`Vendoring JetBrains PSI fixtures at commit: ${commit}\n`);

  // Create temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kotlin-psi-'));
  process.stderr.write(`Temp directory: ${tmpDir}\n`);

  try {
    // Initialize sparse checkout
    process.stderr.write('Initializing sparse checkout...\n');
    git(['init'], tmpDir);
    git(['remote', 'add', 'origin', KOTLIN_REPO], tmpDir);
    git(['sparse-checkout', 'init', '--cone'], tmpDir);
    git(['sparse-checkout', 'set', PSI_PATH], tmpDir);

    // Fetch the specific commit
    process.stderr.write(`Fetching commit ${commit.slice(0, 12)}...\n`);
    git(['fetch', '--depth=1', 'origin', commit], tmpDir);
    git(['checkout', 'FETCH_HEAD'], tmpDir);

    // Ensure fixtures directory exists
    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }

    // Clear existing fixtures
    const existing = fs.readdirSync(FIXTURES_DIR);
    for (const f of existing) {
      fs.unlinkSync(path.join(FIXTURES_DIR, f));
    }

    // Copy .kt and .txt files
    const srcPsiDir = path.join(tmpDir, PSI_PATH);
    const extensions = new Set(['.kt', '.txt']);
    const copied = copyFiles(srcPsiDir, FIXTURES_DIR, extensions);

    // Update .fixtures-version
    fs.writeFileSync(VERSION_FILE, commit + '\n', 'utf-8');

    // Summary
    const ktFiles = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.kt')).length;
    const txtFiles = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.txt')).length;

    process.stderr.write(`\nDone!\n`);
    process.stderr.write(`  Files copied: ${copied}\n`);
    process.stderr.write(`  .kt files:    ${ktFiles}\n`);
    process.stderr.write(`  .txt files:   ${txtFiles}\n`);
    process.stderr.write(`  Fixtures dir: ${FIXTURES_DIR}\n`);
    process.stderr.write(`  Commit:       ${commit}\n`);
  } finally {
    // Clean up temp directory
    process.stderr.write('Cleaning up temp directory...\n');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      process.stderr.write(`Warning: failed to clean up ${tmpDir}: ${err.message}\n`);
    }
  }
}

main();
