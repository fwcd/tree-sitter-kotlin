#!/bin/zsh
# PSI differential gate: the grammar of this checkout against the Kotlin 2.4.21 PSI oracle.
# Usage, from the checkout root: zsh tools/psi-gate/run.sh [--base REV] CORPUS...
#   kotlin     the Kotlin repository, fetched shallow into $PSI_GATE_HOME/kotlin
#   idea       $IDEA_ROOT (an IntelliJ checkout), required for this corpus
#   mutations  tools/psi-gate/mutate.js over Kotlin's PSI test data, one change per mutant
#   snippets   tools/cross-validation/mutations.js: name holes, expression positions × forms and
#              the snippets of the reviews, every C gated too (--strict)
#   corpus     the inputs of test/corpus, each case's claim checked against PSI
# The kotlin and idea corpora leave out files with IDE test markup. --base REV adds the grammar
# of REV (exported with git archive, its binding built against this checkout's node_modules)
# as `base`; each report then lists the buckets that grew. Every corpus is gated by the registry
# tools/psi-gate/expected.json: a bucket of A, A-prefix, B, B-prefix, C-mutant, C comment or C declaration
# verdicts that no entry names fails the run. Reports land in $PSI_GATE_HOME/runs/CORPUS-SHA.
set -e
SLOT=$PWD; G=${PSI_GATE_HOME:-~/.cache/psi-gate}; mkdir -p $G/runs
SHA=$(git rev-parse --short HEAD)
BASE=
if [ "$1" = --base ]; then BASE=$(git rev-parse --short "$2"); shift 2; fi
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
grammars=(--grammar head=$SLOT)
if [ -n "$BASE" ]; then
  base=$G/base-$BASE
  if [ ! -f $base/build/Release/tree_sitter_kotlin_binding.node ]; then
    rm -rf $base; mkdir -p $base
    # -m: the archive's mtimes would make a rebuild reuse stale objects.
    git archive $BASE | tar -x -m -C $base
    ln -s $SLOT/node_modules $base/node_modules
    (cd $base && npx --yes node-gyp rebuild > $G/gyp-base.log 2>&1)
  fi
  grammars+=(--grammar base=$base)
fi
failed=0
for c in "$@"; do
  extra=()
  case $c in
    kotlin) root=$G/kotlin; python3 $SLOT/tools/psi-gate/unmarked.py $root > $G/kotlin.list; extra=(--list $G/kotlin.list) ;;
    idea) root=${IDEA_ROOT:?set IDEA_ROOT to an IntelliJ checkout}; python3 $SLOT/tools/psi-gate/unmarked.py $root > $G/idea.list; extra=(--list $G/idea.list) ;;
    mutations) root=$G/mutations; rm -rf $root
      node $SLOT/tools/psi-gate/mutate.js $G/kotlin/compiler/psi/psi-impl/testData/psi $root
      extra=(--origins $root/origins.json) ;;
    snippets) root=$G/snippets; rm -rf $root; node $SLOT/tools/cross-validation/mutations.js --out $root; extra=(--strict) ;;
    corpus) root=$G/corpus; node $SLOT/tools/psi-gate/corpus.js $SLOT/test/corpus $root ;;
    *) echo "unknown corpus $c" >&2; exit 2 ;;
  esac
  out=$G/runs/$c-$SHA${BASE:+-vs-$BASE}
  rm -rf $out
  node tools/cross-validation/diff-run.js --corpus $c --root $root $extra $grammars --jobs 12 --out $out \
    --expect $SLOT/tools/psi-gate/expected.json || failed=1
done
exit $failed
