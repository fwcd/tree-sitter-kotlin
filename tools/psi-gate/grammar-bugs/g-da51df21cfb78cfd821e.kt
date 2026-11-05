
@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(range: UIntRange, value: UInt, lazyMessage: () -> String) {
    assertRangeContains(range, value, lazyMessage, UIntRange::contains)
}


@SinceKotlin("1.5")
public fun assertContains(range: ULongRange, value: ULong, message: String? = null) {
    assertRangeContains(range, value, { message }, ULongRange::contains)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(range: ULongRange, value: ULong, lazyMessage: () -> String) {
    assertRangeContains(range, value, lazyMessage, ULongRange::contains)
}

@kotlin.internal.InlineOnly
private inline fun <R, V> assertRangeContains(range: R, value: V, crossinline lazyMessage: () -> String?, contains: R.(V) -> Boolean) {
    asserter.assertTrue(
        { messagePrefix(lazyMessage()) + "Expected the range <$range> to contain the value <${value.toString()}>." },
range.contains(value)
    )
}


@SinceKotlin("1.5")
public fun <@OnlyInputTypes K, V> assertContains(map: Map<K, V>, key: K, message: String? = null) {
    assertContainsImpl(map, key) { message }
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes K, V> assertContains(map: Map<K, V>, key: K, lazyMessage: () -> String) {
    assertContainsImpl(map, key, lazyMessage)
}

private fun <@OnlyInputTypes K, V> assertContainsImpl(map: Map<K, V>, key: K, lazyMessage: () -> String?) {
    asserter.assertTrue({ messagePrefix(lazyMessage()) + "Expected the map to contain the key.\nMap <$map>, key <$key>." }, map.containsKey(key))
}






@SinceKotlin("1.5")
public fun assertContains(charSequence: CharSequence, char: Char, ignoreCase: Boolean = false, message: String? = null) {
    assertContainsImpl(charSequence, char, ignoreCase) { message }
}







@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(charSequence: CharSequence, char: Char, ignoreCase: Boolean = false, lazyMessage: () -> String) {
    assertContainsImpl(charSequence, char, ignoreCase, lazyMessage)
}

private fun assertContainsImpl(charSequence: CharSequence, char: Char, ignoreCase: Boolean = false, lazyMessage: () -> String?) {
    asserter.assertTrue(
        { messagePrefix(lazyMessage()) + "Expected the char sequence to contain the char.\nCharSequence <$charSequence>, char <$char>, ignoreCase <$ignoreCase>." },
        charSequence.contains(char, ignoreCase)
    )
}






@SinceKotlin("1.5")
public fun assertContains(charSequence: CharSequence, other: CharSequence, ignoreCase: Boolean = false, message: String? = null) {
    assertContainsImpl(charSequence, other, ignoreCase) { message }
}







@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(charSequence: CharSequence, other: CharSequence, ignoreCase: Boolean = false, lazyMessage: () -> String) {
    assertContainsImpl(charSequence, other, ignoreCase, lazyMessage)
}

private fun assertContainsImpl(charSequence: CharSequence, other: CharSequence, ignoreCase: Boolean = false, lazyMessage: () -> String?) {
    asserter.assertTrue(
        { messagePrefix(lazyMessage()) + "Expected the char sequence to contain the substring.\nCharSequence <$charSequence>, substring <$other>, ignoreCase <$ignoreCase>." },
        charSequence.contains(other, ignoreCase)
    )
}


@SinceKotlin("1.5")
public fun assertContains(charSequence: CharSequence, regex: Regex, message: String? = null) {
   assertContainsImpl(charSequence, regex) { message }
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(charSequence: CharSequence, regex: Regex, lazyMessage: () -> String) {
    assertContainsImpl(charSequence, regex, lazyMessage)
}

private fun assertContainsImpl(charSequence: CharSequence, regex: Regex, lazyMessage: () -> String?) {
    asserter.assertTrue(
        { messagePrefix(lazyMessage()) + "Expected the char sequence to contain the regular expression.\nCharSequence <$charSequence>, regex <$regex>." },
        charSequence.contains(regex)
    )
}











@SinceKotlin("1.5")
public fun <@OnlyInputTypes T> assertContentEquals(expected: Iterable<T>?, actual: Iterable<T>?, message: String? = null) {
    assertIterableContentEquals("Iterable", message, expected, actual, Iterable<*>::iterator)
}












@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertContentEquals(expected: Iterable<T>?, actual: Iterable<T>?, lazyMessage: () -> String) {
    assertIterableContentEquals("Iterable", lazyMessage, expected, actual, Iterable<*>::iterator)
}


@SinceKotlin("1.5")
@Deprecated("'assertContentEquals' for Set arguments is ambiguous. Use 'assertEquals' to compare content with the unordered set equality, or cast one of arguments to Iterable to compare the set elements in order of iteration.",
            level = DeprecationLevel.ERROR,
            replaceWith = ReplaceWith("assertContentEquals(expected, actual?.asIterable(), message)"))
public fun <@OnlyInputTypes T> assertContentEquals(expected: Set<T>?, actual: Set<T>?, message: String? = null): Unit =
    assertContentEquals(expected, actual?.asIterable(), message)


@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@Deprecated("'assertContentEquals' for Set arguments is ambiguous. Use 'assertEquals' to compare content with the unordered set equality, or cast one of arguments to Iterable to compare the set elements in order of iteration.",
            level = DeprecationLevel.ERROR,
            replaceWith = ReplaceWith("assertContentEquals(expected, actual?.asIterable(), lazyMessage)"))
public fun <@OnlyInputTypes T> assertContentEquals(expected: Set<T>?, actual: Set<T>?, lazyMessage: () -> String): Unit =
    assertContentEquals(expected, actual?.asIterable(), lazyMessage)











@SinceKotlin("1.5")
public fun <@OnlyInputTypes T> assertContentEquals(expected: Sequence<T>?, actual: Sequence<T>?, message: String? = null) {
    assertIterableContentEquals("Sequence", message, expected, actual, Sequence<*>::iterator)
}












@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertContentEquals(expected: Sequence<T>?, actual: Sequence<T>?, lazyMessage: () -> String) {
    assertIterableContentEquals("Sequence", lazyMessage, expected, actual, Sequence<*>::iterator)
}










@SinceKotlin("1.5")
public fun <@OnlyInputTypes T> assertContentEquals(expected: Array<T>?, actual: Array<T>?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, Array<*>::get, Array<*>?::contentToString, Array<*>?::contentEquals)
}











@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertContentEquals(expected: Array<T>?, actual: Array<T>?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        Array<*>::get,
        Array<*>?::contentToString,
        Array<*>?::contentEquals
    )
}








@SinceKotlin("1.5")
public fun assertContentEquals(expected: ByteArray?, actual: ByteArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, ByteArray::get, ByteArray?::contentToString, ByteArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContentEquals(expected: ByteArray?, actual: ByteArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        ByteArray::get,
        ByteArray?::contentToString,
        ByteArray?::contentEquals
    )
}








@SinceKotlin("1.5")
public fun assertContentEquals(expected: ShortArray?, actual: ShortArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, ShortArray::get, ShortArray?::contentToString, ShortArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContentEquals(expected: ShortArray?, actual: ShortArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        ShortArray::get,
        ShortArray?::contentToString,
        ShortArray?::contentEquals
    )
}








@SinceKotlin("1.5")
public fun assertContentEquals(expected: IntArray?, actual: IntArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, IntArray::get, IntArray?::contentToString, IntArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContentEquals(expected: IntArray?, actual: IntArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        IntArray::get,
        IntArray?::contentToString,
        IntArray?::contentEquals
    )
}








@SinceKotlin("1.5")
public fun assertContentEquals(expected: LongArray?, actual: LongArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, LongArray::get, LongArray?::contentToString, LongArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContentEquals(expected: LongArray?, actual: LongArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        LongArray::get,
        LongArray?::contentToString,
        LongArray?::contentEquals
    )
}










@SinceKotlin("1.5")
public fun assertContentEquals(expected: FloatArray?, actual: FloatArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, FloatArray::get, FloatArray?::contentToString, FloatArray?::contentEquals)
}











@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContentEquals(expected: FloatArray?, actual: FloatArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        FloatArray::get,
        FloatArray?::contentToString,
        FloatArray?::contentEquals
    )
}










@SinceKotlin("1.5")
public fun assertContentEquals(expected: DoubleArray?, actual: DoubleArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, DoubleArray::get, DoubleArray?::contentToString, DoubleArray?::contentEquals)
}











@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContentEquals(expected: DoubleArray?, actual: DoubleArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        DoubleArray::get,
        DoubleArray?::contentToString,
        DoubleArray?::contentEquals
    )
}








@SinceKotlin("1.5")
public fun assertContentEquals(expected: BooleanArray?, actual: BooleanArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, BooleanArray::get, BooleanArray?::contentToString, BooleanArray?::contentEquals)
}







