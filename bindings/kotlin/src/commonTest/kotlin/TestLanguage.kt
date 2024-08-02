import io.github.treesitter.ktreesitter.Language
import io.github.fwcd.ktreesitter.kotlin.TreeSitterKotlin
import kotlin.test.Test
import kotlin.test.fail

class TestLanguage {
    @Test
    fun canLoadGrammar() {
        try {
            Language(TreeSitterKotlin.language())
        } catch (ex: Exception) {
            fail("Error loading Kotlin grammar", ex)
        }
    }
}
