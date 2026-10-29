'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTEXT_EXCLUSIONS_DIR = '.context-exclusions';
const POLICY = 'multifile-file-annotation-v1';
const ROOT = 'compiler/psi/psi-impl/testData/psi';
const RULES = {
  [`${ROOT}/mustUseReturnValueFullEnabled.kt`]: {
    id: 'mustUseReturnValueFullEnabled',
    source: '7d0f46b020bc7d856da3fa76b4841a0a75e19dd4488a090c5ca9cf374eb02198',
    golden: '0d1039b390e719b393fc8eb63d6f73648ef6af1f76d24bbc2800cd21758d4f2b',
  },
  [`${ROOT}/mustUseReturnValueHalfEnabled.kt`]: {
    id: 'mustUseReturnValueHalfEnabled',
    source: '1b7112cf5ed93dd22c99e8d1954eef660706ac981c7e38c85c4cf6a9552bf749',
    golden: 'be8c9219fe67c0e4a1e719c469a1225d9d8ab304cc5131dddd656aca5305e93e',
  },
  ["compiler/psi/psi-impl/testData/psi/companionBlocks/smoke.kt"]: {"id": "companionBlocks/smoke", "source": "ea67196022a6bfecd20f8b51a5375903083ef3daba536b78bc4415fc0a3e4922", "golden": "8c516bbb5f878e9ad33c36f019011970d96a832e79fdda876d0dfcd6249e5ab4", "feature": "CompanionBlocksAndExtensions"},
  ["compiler/psi/psi-impl/testData/psi/companionBlocks/mixOfRegularAndStaticMethods.kt"]: {"id": "companionBlocks/mixOfRegularAndStaticMethods", "source": "4b100e9264224d7eb122caa7e431bd2ec8d8efb79041a1582326f43c1c01948a", "golden": "4cb1f83c76a37cd4466747adfef5c49b9222c568c03e9c1fe6e2e73757724242", "feature": "CompanionBlocksAndExtensions"},
  ["compiler/psi/psi-impl/testData/psi/contracts/FunctionWithMultilineContract.kt"]: {"id": "contracts/FunctionWithMultilineContract", "source": "3c8d0b68d770a764b6be61e0dd3b64fc2170796d1e915c6a56144efecc6c9b88", "golden": "df19819c3a79b0c26ff6e5ac4ec51300afdfdd19620667e7569b7c0a7034d74b", "feature": "ContractSyntaxV2"},
  ["compiler/psi/psi-impl/testData/psi/contracts/FunctionsWithTypeConstraintsAndContract.kt"]: {"id": "contracts/FunctionsWithTypeConstraintsAndContract", "source": "cf029d85a5f453012af2b9f35bf4d0f92d74caadfd15e0becc47aa5fa1941f96", "golden": "5bc901a50ed11cd5bfd028fa2c59a18c2cfcbe0924b3f2d2510ea4533c2a90b1", "feature": "ContractSyntaxV2"},
  ["compiler/psi/psi-impl/testData/psi/contracts/PropertyAccessorsContracts.kt"]: {"id": "contracts/PropertyAccessorsContracts", "source": "c215b10153e634273e3aa6b66ab8897cf6292fe6a91fc61cfeb8886ff36cb606", "golden": "c19ed5445af9efcc878ba857d43f81c4e897751c834c86c532a2f9ca517eb568", "feature": "ContractSyntaxV2"},
  ["compiler/psi/psi-impl/testData/psi/contracts/SimpleFunctionWithContract.kt"]: {"id": "contracts/SimpleFunctionWithContract", "source": "82967cacbc6654e2e4391f6b38cf69d0435486cc95fe13edb2300d8b745de428", "golden": "f016a09603ad9bc15ccfdcad71df2f289bb25b0c33f1f2bdb6cb4347fdcf5d79", "feature": "ContractSyntaxV2"},
  ["compiler/psi/psi-impl/testData/psi/contracts/good/variousContracts/newSyntax/functionsWithContract.kt"]: {"id": "contracts/good/variousContracts/newSyntax/functionsWithContract", "source": "784c932c30a70fa0cbb94c6dbca9bb4dc123ebcaf05731293819ec4bfcf87f85", "golden": "e924bf87f228bf34b6d85bd3b99e4a789d4f7c9d01e64993a272aa95fc845516", "feature": "ContractSyntaxV2"},
};
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// The FILE boundaries belong to the audited inputs pinned below.
function chunkProvenance(raw) {
  const source = raw.toString('utf8');
  const markers = [...source.matchAll(/^\/\/ FILE: ([^\r\n]+)\r?$/gm)];
  if (markers.length < 2) throw new Error('Expected concatenated FILE sections');
  const range = (start, end) => ({
    startByte: Buffer.byteLength(source.slice(0, start)),
    endByte: Buffer.byteLength(source.slice(0, end)),
    startLine: source.slice(0, start).split('\n').length,
    endLine: source.slice(0, end).split('\n').length,
    sha256: sha256(Buffer.from(source.slice(start, end))),
  });
  return {
    preamble: range(0, markers[0].index),
    chunks: markers.map((marker, index) => ({
      filename: marker[1],
      ...range(marker.index, markers[index + 1]?.index ?? source.length),
    })),
  };
}

function contextExclusion(id, descriptor, raw, golden) {
  const rule = RULES[descriptor.sourcePath];
  if (!rule) return null;
  if (id !== rule.id || descriptor.suite !== 'psi' || descriptor.profile !== 'identity'
      || descriptor.extension !== '.kt' || descriptor.parseKind !== 'file'
      || descriptor.goldenPath !== descriptor.sourcePath.replace(/\.kt$/, '.txt')
      || sha256(raw) !== rule.source || sha256(golden) !== rule.golden) {
    throw new Error(`Context policy needs review for changed fixture: ${descriptor.sourcePath}`);
  }
  return {
    id, ...descriptor,
    sourceSha256: rule.source, goldenSha256: rule.golden, vendoredSha256: rule.source,
    policy: rule.feature ? "experimental-syntax-v1" : POLICY,
    reason: rule.feature ? `${rule.feature} is experimental syntax outside this grammar's supported feature set.` : 'Concatenated FILE sections: the pinned whole-file golden attaches the mid-file @file annotation to FUN/MODIFIER_LIST; a separate chunk needs FILE_ANNOTATION_LIST. Partitioning the golden does not preserve its node parents.',
    comparison: 'excluded',
    golden: 'retain-pinned-original',
    artifacts: {
      source: `${CONTEXT_EXCLUSIONS_DIR}/${id}.kt`,
      golden: `${CONTEXT_EXCLUSIONS_DIR}/${id}.txt`,
    },
    ...(rule.feature ? { feature: rule.feature } : chunkProvenance(raw)),
  };
}

function exclusionPaths(record, dir) {
  // Only the audited policy determines paths; manifest data cannot redirect IO.
  const rule = Object.values(RULES).find(rule => rule.id === record.id);
  if (!rule || record.policy !== (rule.feature ? 'experimental-syntax-v1' : POLICY)) {
    throw new Error(`Unknown fixture context exclusion: ${record.id}`);
  }
  return {
    ktFile: path.join(dir, CONTEXT_EXCLUSIONS_DIR, `${record.id}.kt`),
    psiFile: path.join(dir, CONTEXT_EXCLUSIONS_DIR, `${record.id}.txt`),
  };
}

function verifyContextExclusion(record, dir) {
  const { ktFile, psiFile } = exclusionPaths(record, dir);
  const raw = fs.readFileSync(ktFile), golden = fs.readFileSync(psiFile);
  const descriptor = Object.fromEntries(['suite', 'sourcePath', 'goldenPath', 'extension',
    'parseKind', 'profile', 'sourceSha256', 'goldenSha256', 'vendoredSha256'].map(key => [key, record[key]]));
  const expected = contextExclusion(record.id, descriptor, raw, golden);
  if (!expected || JSON.stringify(record) !== JSON.stringify(expected)) {
    throw new Error(`Fixture context provenance differs from its audited policy: ${record.id}`);
  }
  return { ktFile, psiFile };
}

function requiredContextIds(sourceRoots = []) {
  return sourceRoots.some(root => root.path === ROOT) ? Object.values(RULES).map(rule => rule.id).sort() : [];
}

module.exports = { CONTEXT_EXCLUSIONS_DIR, contextExclusion, exclusionPaths, verifyContextExclusion, requiredContextIds };
