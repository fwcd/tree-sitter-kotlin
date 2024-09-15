import XCTest
import SwiftTreeSitter
import TreeSitterKotlin

final class TreeSitterKotlinTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_kotlin())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Kotlin grammar")
    }
}
