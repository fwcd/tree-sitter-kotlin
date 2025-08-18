# Kotlin Grammar for Tree-sitter

This crate provides a Kotlin grammar for the [tree-sitter](https://tree-sitter.github.io/tree-sitter/) parsing library. To use this crate, add it to the `[dependencies]` section of your `Cargo.toml` file:

```toml
tree-sitter = "0.25.3"
tree-sitter-kotlin = "0.4.0"
```

Typically, you will use the `language` function to add this grammar to a tree-sitter [`Parser`](https://docs.rs/tree-sitter/*/tree_sitter/struct.Parser.html), and then use the parser to parse some code:

```rust
let code = r#"
  data class Point(
    val x: Int,
    val y: Int
  )
"#;
let mut parser = Parser::new();
let language = tree_sitter_kotlin::LANGUAGE;
parser
  .set_language(&language.into())
  .expect("Error loading Kotlin parser");
let tree = parser.parse(code, None).unwrap();
```
