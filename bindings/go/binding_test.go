package tree_sitter_kotlin_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_kotlin "github.com/fwcd/tree-sitter-kotlin/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_kotlin.Language())
	if language == nil {
		t.Errorf("Error loading Kotlin grammar")
	}
	// A parser takes the language only when the runtime supports its ABI version.
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(language); err != nil {
		t.Errorf("Error setting the Kotlin grammar: %v", err)
	}
}
