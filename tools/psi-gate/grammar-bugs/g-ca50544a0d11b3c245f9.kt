public actual class Regex public actual constructor(pattern: String, options: Set<RegexOption>) {


public actual constructor(pattern: String, option: RegexOption) : this(pattern, setOf(option))


public actual val pattern: String = pattern
public actual fun containsMatchIn(input: CharSequence): Boolean {
        nativePattern.reset()

        internal fun nativeEscapeReplacement(literal: String): String = literal.nativeReplace(nativeReplacementEscape, "$$$$")
        private val nativeReplacementEscape = RegExp("""\$""", "g")
    }
}