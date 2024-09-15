package tree_sitter_kotlin_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_kotlin "github.com/tree-sitter/tree-sitter-kotlin/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_kotlin.Language())
	if language == nil {
		t.Errorf("Error loading Kotlin grammar")
	}
}
