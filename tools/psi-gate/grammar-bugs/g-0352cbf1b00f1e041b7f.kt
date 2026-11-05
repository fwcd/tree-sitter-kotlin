inline fun <reified T> assertIs(value: Any?, lazyMessage: () -> String): T {
    contract { returns() implies (value is T) }
    return if (value !is T) {
        assertIs(value, lazyMessage())
    } else {
        value
    }
}

@PublishedApi
internal fun assertIsOfType(value: Any?, type: KType, result: Boolean, message: String?) {
    asserter.assertTrue({ messagePrefix(message) + "Expected value to be of type <$type>, actual <${value?.let { it::class }}>." }, result)
}







@SinceKotlin("1.5")
@InlineOnly
public inline fun <reified T> assertIsNot(value: Any?, message: String? = null) {
    assertIsNotOfType(value, typeOf<T>(), value !is T, message)
}







@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@InlineOnly
public inline fun <reified T> assertIsNot(value: Any?, lazyMessage: () -> String) {
    if (value is T) assertIsNot<T>(value, lazyMessage())
}

@PublishedApi
internal fun assertIsNotOfType(@Suppress("UNUSED_PARAMETER") value: Any?, type: KType, result: Boolean, message: String?) {
    asserter.assertTrue({ messagePrefix(message) + "Expected value to not be of type <$type>." }, result)
}


@IgnorableReturnValue
public fun <T : Any> assertNotNull(actual: String? = null) {
    assertContainsImpl(iterable, element) { message }
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertContains(iterable: Iterable<T>, element: T, lazyMessage: () -> String) {
    assertContainsImpl(iterable, element, lazyMessage)
}

private fun <@OnlyInputTypes T> assertContainsImpl(iterable: Iterable<T>, element: T, lazyMessage: () -> String?) {
    asserter.assertTrue(
        { messagePrefix(lazyMessage()) + "Expected the collection to contain the element.\nCollection <$iterable>, element <$element>." },
        iterable.contains(element)
    )
}


@SinceKotlin("1.5")
public fun <@OnlyInputTypes T> assertContains(sequence: Sequence<T>, element: T, message: String? = null) {
    assertContainsImpl(sequence, element) { message }
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertContains(sequence: Sequence<T>, element: T, lazyMessage: () -> String) {
    assertContainsImpl(sequence, element, lazyMessage)
}

private fun <@OnlyInputTypes T> assertContainsImpl(sequence: Sequence<T>, element: T, lazyMessage: () -> String?) {
    asserter.assertTrue(
        { messagePrefix(lazyMessage()) + "Expected the sequence to contain the element.\nSequence <$sequence>, element <$element>." },
        sequence.contains(element)
    )
}


@SinceKotlin("1.5")
public fun <@OnlyInputTypes T> assertContains(array: Array<T>, element: T, message: String? = null) {
    assertArrayContains(array, element, { message }, Array<T>::contains, Array<T>::contentToString, element, lazyMessage, LongArray::contains, LongArray::contentToString)
}



@SinceKotlin("1.5")
public fun assertContains(array: BooleanArray, element: Boolean, message: String? = null) {
    assertArrayContains(array, element, { message }, BooleanArray::contains, BooleanArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(array: BooleanArray, element: Boolean, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, BooleanArray::contains, BooleanArray::contentToString)
}



@SinceKotlin("1.5")
public fun assertContains(array: CharArray, element: Char, message: String? = null) {
    assertArrayContains(array, element, { message }, CharArray::contains, CharArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(array: CharArray, element: Char, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, CharArray::contains, CharArray::contentToString)
}



@SinceKotlin("1.5")
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContains(array: UByteArray, element: UByte, message: String? = null) {
    assertArrayContains(array, element, { message }, UByteArray::contains, UByteArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContains(array: UByteArray, element: UByte, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, UByteArray::contains, UByteArray::contentToString)
}


@SinceKotlinassertContentEquals(expected, actual?.asIterable(), message)


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
    assertArrayContentEquals(message, expected, actual, { it.size }, FloatArray::get, FloatArray?::contentToString, FloatArrayDoubleArray::get,
        DoubleArray?::contentToString,
        DoubleArray?::contentEquals
    )
}








@SinceKotlin("1.5")
public fun assertContentEquals(expected: BooleanArray?, actual: BooleanArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, BooleanArray::get, BooleanArray?::contentToString, BooleanArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContentEquals(expected: BooleanArray?, actual: BooleanArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        BooleanArray::get,
        BooleanArray?::contentToString,
        BooleanArray?::contentEquals
    )
}








@SinceKotlin("1.5")
public fun assertContentEquals(expected: CharArray?, actual: CharArray?, message: String? = null)