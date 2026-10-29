'use strict';

const SOURCE_ROOTS = [
  { suite: 'psi', path: 'compiler/psi/psi-impl/testData/psi', namespace: '', extensions: ['.kt', '.kts'], profile: 'identity' },
  { suite: 'spec', path: 'compiler/tests-spec/testData/psi', namespace: 'spec', extensions: ['.kt'], profile: 'spec-info-v1' },
];
const METADATA_FILE = '.import.json';

function goldenHasPsiError(text) {
  return /^\s*PsiErrorElement(?::|\(|$)/m.test(text);
}

function verifyGoldenFormat(text, filename) {
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== `KtFile: ${filename}`) throw new Error(`Not a file PSI golden for ${filename}: ${lines[0]}`);
  for (const line of lines.slice(1)) {
    const node = line.trim();
    if (!node || node === 'KDoc' || /^[A-Z][A-Z_0-9]*$/.test(node)
        || /^(?:PsiElement\(|PsiWhiteSpace\(|PsiComment\(|PsiErrorElement(?::|\(|$)|<empty list>)/.test(node)) continue;
    throw new Error(`Unsupported PSI golden line for ${filename}: ${node}`);
  }
}

function preprocessSource(text, profile) {
  if (profile === 'identity') return text;
  if (profile !== 'spec-info-v1') throw new Error(`Unknown PSI source profile: ${profile}`);
  // Upstream trims ASCII whitespace before CommonParser.testInfoFilter.
  // This pin has one spec header per file and no testcase-number directives.
  text = text.replace(/\r\n?/g, '\n').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  if (/TESTCASE NUMBER:/.test(text)) throw new Error('Spec testcase directives require an updated preprocessing profile');
  let headers = 0;
  text = text.replace(/\/\*\s+? \* KOTLIN PSI SPEC TEST \((?:POSITIVE|NEGATIVE)\)\n[\s\S]*?\n\s+\*\/(?:\n)*/g,
    () => { headers++; return ''; });
  if (headers !== 1) throw new Error(`Expected one spec metadata header, found ${headers}`);
  return text;
}

module.exports = { SOURCE_ROOTS, METADATA_FILE, goldenHasPsiError, verifyGoldenFormat, preprocessSource };
