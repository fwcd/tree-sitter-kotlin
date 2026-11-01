#!/bin/zsh
# PSI differential gate: the grammar of this checkout against the Kotlin 2.4.21 PSI oracle, over
# the Kotlin repository at 2.4.21, an IntelliJ checkout and the generic mutations, all without
# IDE test markup. Usage, from the checkout root: zsh tools/psi-gate/run.sh CORPUS...
#   kotlin     the Kotlin repository, fetched shallow into $PSI_GATE_HOME/kotlin
#   idea       $IDEA_ROOT (an IntelliJ checkout), required for this corpus
#   mutations  tools/psi-gate/mutate.js over Kotlin's PSI test data
# Reports land in $PSI_GATE_HOME/runs/CORPUS-SHA (report.md, buckets.json).
set -e
SLOT=$PWD; G=${PSI_GATE_HOME:-~/.cache/psi-gate}; mkdir -p $G/runs
SHA=$(git rev-parse --short HEAD)
if [ ! -d $G/kotlin/.git ]; then
  git init -q $G/kotlin
  git -C $G/kotlin fetch -q --depth 1 https://github.com/JetBrains/kotlin.git 9180ce6a7a7d3627f88b424717583f28ddca052d
  git -C $G/kotlin checkout -q FETCH_HEAD
fi
[ -x node_modules/.bin/tree-sitter ] || npm ci --no-audit --no-fund > $G/npm.log 2>&1
node -e "process.exit(require('tree-sitter/package.json').version.startsWith('0.25') ? 0 : 1)" \
  || npm install --no-save --no-audit --no-fund tree-sitter@0.25.1 >> $G/npm.log 2>&1
npx --yes node-gyp rebuild > $G/gyp.log 2>&1
npm run -s psi-oracle:fetch
for c in "$@"; do
  case $c in
    kotlin) root=$G/kotlin; python3 $SLOT/tools/psi-gate/unmarked.py $root > $G/kotlin.list; extra=(--list $G/kotlin.list) ;;
    idea) root=${IDEA_ROOT:?set IDEA_ROOT to an IntelliJ checkout}; python3 $SLOT/tools/psi-gate/unmarked.py $root > $G/idea.list; extra=(--list $G/idea.list) ;;
    mutations) root=$G/mutations; rm -rf $root; node $SLOT/tools/psi-gate/mutate.js $G/kotlin/compiler/psi/psi-impl/testData/psi $root; extra=() ;;
  esac
  out=$G/runs/$c-$SHA
  node tools/cross-validation/diff-run.js --corpus $c --root $root $extra --grammar head=$SLOT --jobs 12 --out $out
done
