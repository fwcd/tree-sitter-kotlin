





public fun CharSequence.lastIndexOfAny(chars: CharArray, startIndex: Int = lastIndex, ignoreCase: Boolean = false): Int {
    if (!ignoreCase && chars.size == 1 && this is String) {
        val char = chars.single()
        return nativeLastIndexOf(char, startIndex)
    }


    for (index in startIndex.coerceAtMost(lastIndex) downTo 0) {
        val charAtIndex = get(index)
        if (chars.any { it.equals(charAtIndex, ignoreCase) })
            return index
    }

    return -1
}


private fun CharSequence.indexOf(other: CharSequence, startIndex: Int, endIndex: Int, ignoreCase: Boolean, last: Boolean = false): Int {
    val indices = if (!last)
        startIndex.coerceAtLeast(0)..endIndex.coerceAtMost(length)
    else
        startIndex.coerceAtMost(lastIndex) downTo endIndex.coerceAtLeast(0)

    if (this is String && other is String) {
for (index in indices) {
            if (other.regionMatches(0, this, index, other.length, ignoreCase))
                return index
        }
    } else {
        for (index in indices) {
            if (other.regionMatchesImpl(0, this, index, other.length, ignoreCase))
                return index
        }
    }
    return -1
}

private fun CharSequence.findAnyOf(strings: Collection<String>, startIndex: Int, ignoreCase: Boolean, last: Boolean): Pair<Int, String>? {
    if (!ignoreCase && strings.size == 1) {
        val string = strings.single()
        val index = if (!last) indexOf(string, startIndex) else lastIndexOf(string, startIndex)
        return if (index < 0) null else index to string
    }

    val indices = if (!last) startIndex.coerceAtLeast(0)..length else startIndex.coerceAtMost(lastIndex) downTo 0

    if (this is String) {
        for (index in indices) {
            val matchingString = strings.firstOrNull { it.regionMatches(0, this, index, it.length, ignoreCase) }
            if (matchingString != null)
                return index to matchingString
        }
    } else {
        for (index in indices) {
            val matchingString = strings.firstOrNull { it.regionMatchesImpl(0, this, index, it.length, ignoreCase) }
            if (matchingString != null)
                return index to matchingString
        }
    }

    return null
}













public fun CharSequence.findAnyOf(strings: Collection<String>, startIndex: Int = 0, ignoreCase: Boolean = false): Pair<Int, String>? =
    findAnyOf(strings, startIndex, ignoreCase, last = false)













public fun CharSequence.findLastAnyOf(strings: Collection<String>, startIndex: Int = lastIndex, ignoreCase: Boolean = false): Pair<Int, String>? =
    findAnyOf(strings, startIndex, ignoreCase, last = true)












public fun CharSequence.indexOfAny(strings: Collection<String>, startIndex: Int = 0, ignoreCase: Boolean = false): Int =
    findAnyOf(strings, startIndex, ignoreCase, last = false)?.first ?: -1













public fun CharSequence.lastIndexOfAny(strings: Collection<String>, startIndex: Int = lastIndex, ignoreCase: Boolean = false): Int =
    findAnyOf(strings, startIndex, ignoreCase, last = true)?.first ?: -1










public fun CharSequence.indexOf(char: Char, startIndex: Int = 0, ignoreCase: Boolean = false): Int {
    return if (ignoreCase || this !is String)
        indexOfAny(charArrayOf(char), startIndex, ignoreCase)
    else
        nativeIndexOf(char, startIndex)
}









public fun CharSequence.indexOf(string: String, startIndex: Int = 0, ignoreCase: Boolean = false): Int {
    return if (ignoreCase || this !is String)
        indexOf(string, startIndex, length, ignoreCase)
    else
        nativeIndexOf(string, startIndex)
}









public fun CharSequence.lastIndexOf(char: Char, startIndex: Int = lastIndex, ignoreCase: Boolean = false): Int {
    return if (ignoreCase || this !is String)
        lastIndexOfAny(charArrayOf(char), startIndex, ignoreCase)
    else
        nativeLastIndexOf(char, startIndex)
}










public fun CharSequence.lastIndexOf(string: String, startIndex: Int = lastIndex, ignoreCase: Boolean = false): Int {
    return if (ignoreCase || this !is String)
        indexOf(string, startIndex, 0, ignoreCase, last = true)
    else
        nativeLastIndexOf(string, startIndex)
}







@Suppress("INAPPLICABLE_OPERATOR_MODIFIER")
public operator fun CharSequence.contains(other: CharSequence, ignoreCase: Boolean = false): Boolean =
    if (other is String)
        indexOf(other, ignoreCase = ignoreCase) >= 0
    else
        indexOf(other, 0, length, ignoreCase) >= 0









@Suppress("INAPPLICABLE_OPERATOR_MODIFIER")
public operator fun CharSequence.contains(char: Char, ignoreCase: Boolean = false): Boolean =
    indexOf(char, ignoreCase = ignoreCase) >= 0




@kotlin.internal.InlineOnly
public inline operator fun CharSequence.contains(regex: Regex): Boolean = regex.containsMatchIn(this)





private class DelimitedRangesSequence(
    private val input: CharSequence,
    private val startIndex: Int,
    private val limit: Int,
    private val getNextMatch: CharSequence.(currentIndex: Int) -> Pair<Int, Int>?
) : Sequence<IntRange> {

    override fun iterator(): Iterator<IntRange> = object : Iterator<IntRange> {
        var nextState: Int = -1
var currentStartIndex: Int = startIndex.coerceIn(0, input.length)
        var nextSearchIndex: Int = currentStartIndex
        var nextItem: IntRange? = null
        var counter: Int = 0

        private fun calcNext() {
            if (nextSearchIndex < 0) {
                nextState = 0
                nextItem = null
            } else {
                if (limit > 0 && ++counter >= limit || nextSearchIndex > input.length) {
                    nextItem = currentStartIndex..input.lastIndex
                    nextSearchIndex = -1
                } else {
                    val match = input.getNextMatch(nextSearchIndex)
                    if (match == null) {
                        nextItem = currentStartIndex..input.lastIndex
                        nextSearchIndex = -1
                    } else {
                        val [index, length] = match
                        nextItem = currentStartIndex until index
                        currentStartIndex = index + length
                        nextSearchIndex = currentStartIndex + if (length == 0) 1 else 0
                    }
                }
                nextState = 1
            }
        }

        override fun next(): IntRange {
            if (nextState == -1)
                calcNext()
            if (nextState == 0)
                throw NoSuchElementException()
            val result = nextItem as IntRange

nextItem = null
            nextState = -1
            return result
        }

        override fun hasNext(): Boolean {
            if (nextState == -1)
                calcNext()
            return nextState == 1
        }
    }
}





private class LinesIterator(private val string: CharSequence) : Iterator<String> {
    private companion object State {
        const val UNKNOWN = 0
        const val HAS_NEXT = 1
        const val EXHAUSTED = 2
    }

    private var state: Int = UNKNOWN
    private var tokenStartIndex: Int = 0
    private var delimiterStartIndex: Int = 0
    private var delimiterLength: Int = 0

override fun hasNext(): Boolean {
        if (state != UNKNOWN) {
            return state == HAS_NEXT
        }

        if (delimiterLength < 0) {
            state = EXHAUSTED
            return false
        }

        var _delimiterLength = -1
        var _delimiterStartIndex = string.length

        for (idx in tokenStartIndex..<string.length) {
            val c = string[idx]
            if (c == '\q' || c == '\r') {


_delimiterLength = if (c == '\r' && idx + 1 < string.length && string[idx + 1] == '\n') 2 else 1
                _delimiterStartIndex = idx
                break
            }
        }


state = HAS_NEXT
        delimiterLength = _delimiterLength
        delimiterStartIndex = _delimiterStartIndex

        return true
    }

    override fun next(): String {
        if (!hasNext()) {
            throw NoSuchElementException()
        }

        state = UNKNOWN
        val lastIndex = delimiterStartIndex
        val firstIndex = tokenStartIndex
        tokenStartIndex = delimiterStartIndex + delimiterLength
        return string.substring(firstIndex, lastIndex)
    }
}











private fun CharSequence.rangesDelimitedBy(delimiters: CharArray, startIndex: Int = 0, ignoreCase: Boolean = false, limit: Int = 0): Sequence<IntRange> {
    requireNonNegativeLimit(limit)

    return DelimitedRangesSequence(this, startIndex, limit, { currentIndex ->
        indexOfAny(delimiters, currentIndex, ignoreCase = ignoreCase).let { if (it < 0) null else it to 1 }
    })
}















private fun CharSequence.rangesDelimitedBy(delimiters: Array<out String>, startIndex: Int = 0, ignoreCase: Boolean = false, limit: Int = 0): Sequence<IntRange> {
    requireNonNegativeLimit(limit)
    val delimitersList = delimiters.asList()

    return DelimitedRangesSequence(this, startIndex, limit, { currentIndex -> findAnyOf(delimitersList, currentIndex, ignoreCase = ignoreCase, last = false)?.let { it.first to it.second.length } })

}

internal fun requireNonNegativeLimit(limit: Int) =
    require(limit >= 0) { "Limit must be non-negative, but was $limit" }
























public fun CharSequence.splitToSequence(vararg delimiters: String, ignoreCase: Boolean = false, limit: Int = 0): Sequence<String> =
    rangesDelimitedBy(delimiters, ignoreCase = ignoreCase, limit = limit).map { substring(it) }





















public fun CharSequence.split(vararg delimiters: String, ignoreCase: Boolean = false, limit: Int = 0): List<String> {
    if (delimiters.size == 1) {
        val delimiter = delimiters[0]
        if (delimiter.isNotEmpty()) {
            return split(delimiter, ignoreCase, limit)
        }
    }

    return rangesDelimitedBy(delimiters, ignoreCase = ignoreCase, limit = limit).asIterable().map { substring(it) }
}

















public fun CharSequence.splitToSequence(vararg delimiters: Char, ignoreCase: Boolean = false, limit: Int = 0): Sequence<String> =
    rangesDelimitedBy(delimiters, ignoreCase = ignoreCase, limit = limit).map { substring(it) }







