package tree_sitter_kotlin_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-kotlin"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_kotlin.Language())
	if language == nil {
		t.Errorf("Error loading Kotlin grammar")
	}
}
