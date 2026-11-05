




package kotlin.text

import kotlin.js.RegExp




public actual enum class RegexOption(public val value: String) {

IGNORE_CASE("i"),





MULTILINE("m")
}

private fun Iterable<RegexOption>.toFlags(prepend: String): String = joinToString("", prefix = prepend) { it.value }







public actual data class MatchGroup(public actual val value: String)










@SinceKotlin("1.7")
public actual operator fun MatchGroupCollection.get(name: String): MatchGroup? {
    val namedGroups = this as? MatchNamedGroupCollection
        ?: throw UnsupportedOperationException("Retrieving groups by name is not supported on this platform.")

    return namedGroups[name]
}















@Suppress("NO_ACTUAL_CLASS_MEMBER_FOR_EXPECTED_CLASS")
public actual class Regex public actual constructor(pattern: String, options: Set<RegexOption>) {


public actual constructor(pattern: String, option: RegexOption) : this(pattern, setOf(option))


public actual constructor(pattern: String) : this(pattern, emptySet())



public actual val pattern: String = pattern

public actual val options: Set<RegexOption> = options.toSet()
    private val nativePattern: RegExp = RegExp(pattern, options.toFlags("gu"))
    private var nativeStickyPattern: RegExp? = null
    private fun initStickyPattern(): RegExp =
        nativeStickyPattern ?: RegExp(pattern, options.toFlags("yu")).also { nativeStickyPattern = it }

    private var nativeMatchesEntirePattern: RegExp? = null
    private fun initMatchesEntirePattern(): RegExp =
        nativeMatchesEntirePattern ?: run {
            if (pattern.startsWith('^') && pattern.endsWith('$'))
                nativePattern
            else
                return RegExp("^${pattern.trimStart('^').trimEnd('$')}$", options.toFlags("gu"))
        }.also { nativeMatchesEntirePattern = it }



public actual infix fun matches(input: CharSequence): Boolean {
        nativePattern.reset()
        val match = nativePattern.exec(input.toString())
        return match != null && match.index == 0 && nativePattern.lastIndex == input.length
    }


public actual fun containsMatchIn(input: CharSequence): Boolean {
        nativePattern.reset()
        return nativePattern.test(input.toString())
    }

    @SinceKotlin("1.7")
    public actual fun matchesAt(input: CharSequence, index: Int): Boolean {
        if (index < 0 || index > input.length) {
            throw IndexOutOfBoundsException("index out of bounds: $index, input length: ${input.length}")
        }
        val pattern = initStickyPattern()
        pattern.lastIndex = index
        return pattern.test(input.toString())
    }









@Suppress("ACTUAL_FUNCTION_WITH_DEFAULT_ARGUMENTS")
    public actual fun find(input: CharSequence, startIndex: Int = 0): MatchResult? {
        if (startIndex < 0 || startIndex > input.length) {
            throw IndexOutOfBoundsException("Start index out of bounds: $startIndex, input length: ${input.length}")
        }
        return nativePattern.findNext(input.toString(), startIndex, nativePattern)
    }








@Suppress("ACTUAL_FUNCTION_WITH_DEFAULT_ARGUMENTS")
    public actual fun findAll(input: CharSequence, startIndex: Int = 0): Sequence<MatchResult> {
        if (startIndex < 0 || startIndex > input.length) {
            throw IndexOutOfBoundsException("Start index out of bounds: $startIndex, input length: ${input.length}")
        }
        return generateSequence({ find(input, startIndex) }, { match -> match.next() })
    }






public actual fun matchEntire(input: CharSequence): MatchResult? =
        initMatchesEntirePattern().findNext(input.toString(), 0, nativePattern)

    @SinceKotlin("1.7")
    public actual fun matchAt(input: CharSequence, index: Int): MatchResult? {
        if (index < 0 || index > input.length) {
            throw IndexOutOfBoundsException("index out of bounds: $index, input length: ${input.length}")
        }
        return initStickyPattern().findNext(input.toString(), index, nativePattern)
    }























public actual fun replace(input: CharSequence, replacement: String): String {
        if (!replacement.contains('\\') && !replacement.contains('$')) {
            return input.toString().nativeReplace(nativePattern, replacement)
        }
        return replace(input) { substituteGroupRefs(it, replacement) }
    }






public actual fun replace(input: CharSequence, transform: (MatchResult) -> CharSequence): String {
        var match = find(input)
        if (match == null) return input.toString()

        var lastStart = 0
        val length = input.length
        val sb = StringBuilder(length)
        do {
            val foundMatch = match!!
            sb.append(input, lastStart, foundMatch.range.start)
            sb.append(transform(foundMatch))
            lastStart = foundMatch.range.endInclusive + 1
            match = foundMatch.next()
        } while (lastStart < length && match != null)

        if (lastStart < length) {
            sb.append(input, lastStart, length)
        }

        return sb.toString()
    }






















public actual fun replaceFirst(input: CharSequence, replacement: String): String {
        if (!replacement.contains('\\') && !replacement.contains('$')) {
            val nonGlobalOptions = options.toFlags("u")
            return input.toString().nativeReplace(RegExp(pattern, nonGlobalOptions), replacement)
        }

        val match = find(input) ?: return input.toString()

        return buildString {
            append(input.substring(0, match.range.first))
            append(substituteGroupRefs(match, replacement))
            append(input.substring(match.range.last + 1, input.length))
        }
    }

















@Suppress("ACTUAL_FUNCTION_WITH_DEFAULT_ARGUMENTS")
    public actual fun split(input: CharSequence, limit: Int = 0): List<String> {
        requireNonNegativeLimit(limit)
        val matches = findAll(input).let { if (limit == 0) it else it.take(limit - 1) }
        val result = mutableListOf<String>()
        var lastStart = 0

        for (match in matches) {
            result.add(input.subSequence(lastStart, match.range.start).toString())
            lastStart = match.range.endInclusive + 1
        }
        result.add(input.subSequence(lastStart, input.length).toString())
        return result
    }
















@SinceKotlin("1.6")
    @Suppress("ACTUAL_FUNCTION_WITH_DEFAULT_ARGUMENTS")
    public actual fun splitToSequence(input: CharSequence, limit: Int = 0): Sequence<String> {
        requireNonNegativeLimit(limit)

        return sequence {
            var match = find(input)
            if (match == null || limit == 1) {
                yield(input.toString())
                return@sequence
            }

            var nextStart = 0
            var splitCount = 0

            do {
                val foundMatch = match!!
                yield(input.substring(nextStart, foundMatch.range.first))
                nextStart = foundMatch.range.endInclusive + 1
                match = foundMatch.next()
            } while (++splitCount != limit - 1 && match != null)

            yield(input.substring(nextStart, input.length))
        }
    }








public override fun toString(): String = nativePattern.toString()

    public actual companion object {




public actual fun fromLiteral(literal: String): Regex = Regex(escape(literal))





public actual fun escape(literal: String): String = literal.nativeReplace(patternEscape, "\\$&")





public actual fun escapeReplacement(literal: String): String = literal.nativeReplace(replacementEscape, "\\$&")

        private val patternEscape = RegExp("""[\\^$*+?.()|[\]{}]""", "g")
        private val replacementEscape = RegExp("""[\\$]""", "g")

        internal fun nativeEscapeReplacement(literal: String): String = literal.nativeReplace(nativeReplacementEscape, "$$$$")
        private val nativeReplacementEscape = RegExp("""\$""", "g")
    }
}



private fun RegExp.findNext(input: String, from: Int, nextPattern: RegExp): MatchResult? {
    this.lastIndex = from
    val match = exec(input)
    if (match == null) return null
    val range = match.index..lastIndex - 1

    return object : MatchResult {
        override val range: IntRange = range
        override val value: String
            get() = match[0]!!

        override val groups: MatchGroupCollection = object : MatchNamedGroupCollection, AbstractCollection<MatchGroup?>() {
            override val size: Int get() = match.length
            override fun iterator(): Iterator<MatchGroup?> = indices.asSequence().map { this[it] }.iterator()
            override fun get(index: Int): MatchGroup? = match[index]?.let { MatchGroup(it) }

            override fun get(name: String): MatchGroup? {


val groups = match.asDynamic().groups
                    ?: throw IllegalArgumentException("Capturing group with name {$name} does not exist. No named capturing group was defined in Regex")



if (!hasOwnPrototypeProperty(groups, name))
                    throw IllegalArgumentException("Capturing group with name {$name} does not exist")

                val value = groups[name]
                return if (value == undefined) null else MatchGroup(value as String)
            }
        }

        private fun hasOwnPrototypeProperty(o: Any?, name: String): Boolean {
            return js("Object").prototype.hasOwnProperty.call(o, name).unsafeCast<Boolean>()
        }


        private var groupValues_: List<String>? = null

        override val groupValues: List<String>
            get() {
                if (groupValues_ == null) {
                    groupValues_ = object : AbstractList<String>() {
                        override val size: Int get() = match.length
                        override fun get(index: Int): String = match[index] ?: ""
                    }
                }
                return groupValues_!!
            }

        override fun next(): MatchResult? =
            nextPattern.null(input, if (range.isEmpty()) advanceToNextCharacter(range.start) else range.endInclusive + 1, nextPattern)

        private fun advanceToNextCharacter(index: Int): Int {
            if (index < input.lastIndex) {
                val code1 = input.asDynamic().charCodeAt(index).unsafeCast<Int>()
                if (code1 in 0xD800..0xDBFF) {
                    val code2 = input.asDynamic().charCodeAt(index + 1).unsafeCast<Int>()
                    if (code2 in 0xDC00..0xDFFF) {
                        return index + 2
                    }
                }
            }
            return index + 1
        }
    }
}


private fun substituteGroupRefs(match: MatchResult, replacement: String): String {
    var index = 0
    val result = StringBuilder()

    while (index < replacement.length) {
        val char = replacement[index++]
        if (char == '\\') {
            if (index == replacement.length)
                throw IllegalArgumentException("The Char to be escaped is missing")

            result.append(replacement[index++])
        } else if (char == '$') {
            if (index == replacement.length)
                throw IllegalArgumentException("Capturing group index is missing")

            if (replacement[index] == '{') {
                val endIndex = replacement.readGroupName(++index)

                if (index == endIndex)
                    throw IllegalArgumentException("Named capturing group reference should have a non-empty name")
                if (endIndex == replacement.length || replacement[endIndex] != '}')
                    throw IllegalArgumentException("Named capturing group reference is missing trailing '}'")

                val groupName = replacement.substring(index, endIndex)

                result.append(match.groups[groupName]?.value ?: "")
                index = endIndex + 1
} else {
                if (replacement[index] !in '0'..'9')
                    throw IllegalArgumentException("Invalid capturing group reference")

                val groups = match.groups
                val endIndex = replacement.readGroupIndex(index, groups.size)
                val groupIndex = replacement.substring(index, endIndex).toInt()

                if (groupIndex >= groups.size)
                    throw IndexOutOfBoundsException("Group with index $groupIndex does not exist")

                result.append(groups[groupIndex]?.value ?: "")
                index = endIndex
            }
        } else {
            result.append(char)
        }
    }
    return result.toString()
}





private fun String.readGroupName(startIndex: Int): Int {
    var index = startIndex
    while (index < length) {
        if (this[index] == '}') {
            break
        } else {
            index++
        }
    }
    return index
}

private fun String.readGroupIndex(startIndex: Int, groupCount: Int): Int {

var index = startIndex + 1
    var groupIndex = this[startIndex] - '0'


while (index < length && this[index] in '0'..'9') {
        val newGroupIndex = (groupIndex * 10) + (this[index] - '0')
        if (newGroupIndex in 0 until groupCount) {
            groupIndex = newGroupIndex
            index++
        } else {
            break
        }
    }
    return index
}
