







@file:kotlin.jvm.JvmMultifileClass
@file:kotlin.jvm.JvmName("AssertionsKt")
@file:Suppress("INVISIBLE_MEMBER", "INVISIBLE_REFERENCE")

package kotlin.test

import kotlin.contracts.*
import kotlin.internal.*
import kotlin.jvm.JvmName
import kotlin.native.concurrent.ThreadLocal
import kotlin.reflect.KClass
import kotlin.reflect.KType
import kotlin.reflect.typeOf




public val asserter: Asserter
    get() = _asserter ?: lookupAsserter()


@ThreadLocal
internal var _asserter: Asserter? = null


@JvmName("assertTrueInline")
@InlineOnly
public inline fun assertTrue(message: String? = null, block: () -> Boolean) {
    contract { callsInPlace(block, InvocationKind.EXACTLY_ONCE) }
    assertTrue(block(), message)
}


public fun assertTrue(actual: Boolean, message: String? = null) {
    contract { returns() implies actual }
    return asserter.assertTrue(message ?: "Expected value to be true.", actual)
}




@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertTrue(actual: Boolean, lazyMessage: () -> String) {
    contract { returns() implies actual }
    if (!actual) assertTrue(actual, lazyMessage())
}


@JvmName("assertFalseInline")
@InlineOnly
public inline fun assertFalse(message: String? = null, block: () -> Boolean) {
    contract { callsInPlace(block, InvocationKind.EXACTLY_ONCE) }
    assertFalse(block(), message)
}


public fun assertFalse(actual: Boolean, message: String? = null) {
    contract { returns() implies (!actual) }
    return asserter.assertTrue(message ?: "Expected value to be false.", !actual)
}




@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertFalse(actual: Boolean, lazyMessage: () -> String) {
    contract { returns() implies (!actual) }
    if (actual) assertFalse(actual, lazyMessage())
}


public fun <@OnlyInputTypes T> assertEquals(expected: T, actual: T, message: String? = null) {
    asserter.assertEquals(message, expected, actual)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertEquals(expected: T, actual: T, lazyMessage: () -> String) {
    if (expected != actual) assertEquals(expected, actual, lazyMessage())
}


@SinceKotlin("1.5")
public fun assertEquals(expected: Double, actual: Double, absoluteTolerance: Double, message: String? = null) {
    checkDoublesAreEqual(expected, actual, absoluteTolerance, message)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertEquals(expected: Double, actual: Double, absoluteTolerance: Double, lazyMessage: () -> String) {
    checkDoublesAreEqual(expected, actual, absoluteTolerance, lazyMessage)
}


@SinceKotlin("1.5")
public fun assertEquals(expected: Float, actual: Float, absoluteTolerance: Float, message: String? = null) {
    checkFloatsAreEqual(expected, actual, absoluteTolerance, message)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertEquals(expected: Float, actual: Float, absoluteTolerance: Float, lazyMessage: () -> String) {
    checkFloatsAreEqual(expected, actual, absoluteTolerance, lazyMessage)
}


public fun <@OnlyInputTypes T> assertNotEquals(illegal: T, actual: T, message: String? = null) {
    asserter.assertNotEquals(message, illegal, actual)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertNotEquals(illegal: T, actual: T, lazyMessage: () -> String) {
    if (illegal == actual) assertNotEquals(illegal, actual, lazyMessage())
}


@SinceKotlin("1.5")
public fun assertNotEquals(illegal: Double, actual: Double, absoluteTolerance: Double, message: String? = null) {
    checkDoublesAreEqual(illegal, actual, absoluteTolerance, message, shouldFail = true)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertNotEquals(illegal: Double, actual: Double, absoluteTolerance: Double, lazyMessage: () -> String) {
    checkDoublesAreEqual(illegal, actual, absoluteTolerance, lazyMessage, shouldFail = true)
}


@SinceKotlin("1.5")
public fun assertNotEquals(illegal: Float, actual: Float, absoluteTolerance: Float, message: String? = null) {
    checkFloatsAreEqual(illegal, actual, absoluteTolerance, message, shouldFail = true)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertNotEquals(illegal: Float, actual: Float, absoluteTolerance: Float, lazyMessage: () -> String) {
    checkFloatsAreEqual(illegal, actual, absoluteTolerance, lazyMessage, shouldFail = true)
}


public fun <@OnlyInputTypes T> assertSame(expected: T, actual: T, message: String? = null) {
    asserter.assertSame(message, expected, actual)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertSame(expected: T, actual: T, lazyMessage: () -> String) {
    if (expected !== actual) assertSame(expected, actual, lazyMessage())
}



public fun <@OnlyInputTypes T> assertNotSame(illegal: T, actual: T, message: String? = null) {
    asserter.assertNotSame(message, illegal, actual)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertNotSame(illegal: T, actual: T, lazyMessage: () -> String) {
    if (illegal === actual) assertNotSame(illegal, actual, lazyMessage())
}







@SinceKotlin("1.5")
@InlineOnly
@IgnorableReturnValue
public inline fun <reified T> assertIs(value: Any?, message: String? = null): T {
    contract { returns() implies (value is T) }
    assertIsOfType(value, typeOf<T>(), value is T, message)
    return value as T
}







@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@InlineOnly
@IgnorableReturnValue
public inline fun <reified T> assertIs(value: Any?, lazyMessage: () -> String): T {
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
public fun <T : Any> assertNotNull(actual: T?, message: String? = null): T {
    contract { returns() implies (actual != null) }
    asserter.assertNotNull(message, actual)
    return actual!!
}


















@JvmName("assertNotNullInline")
@InlineOnly
public inline fun <T : Any, R> assertNotNull(actual: T?, message: String? = null, block: (T) -> R) {
    contract { returns() implies (actual != null) }
    val _ = block(assertNotNull(actual, message))
}


public fun assertNull(actual: Any?, message: String? = null) {
    contract { returns() implies (actual == null) }
    asserter.assertNull(message, actual)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertNull(actual: Any?, lazyMessage: () -> String) {
    contract { returns() implies (actual == null) }
    if (actual != null) assertNull(actual, lazyMessage())
}


@SinceKotlin("1.5")
public fun <@OnlyInputTypes T> assertContains(iterable: Iterable<T>, element: T, message: String? = null) {
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
    assertArrayContains(array, element, { message }, Array<T>::contains, Array<T>::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun <@OnlyInputTypes T> assertContains(array: Array<T>, element: T, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, Array<T>::contains, Array<T>::contentToString)
}


@SinceKotlin("1.5")
public fun assertContains(array: ByteArray, element: Byte, message: String? = null) {
    assertArrayContains(array, element, { message }, ByteArray::contains, ByteArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(array: ByteArray, element: Byte, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, ByteArray::contains, ByteArray::contentToString)
}


@SinceKotlin("1.5")
public fun assertContains(array: ShortArray, element: Short, message: String? = null) {
    assertArrayContains(array, element, { message }, ShortArray::contains, ShortArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(array: ShortArray, element: Short, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, ShortArray::contains, ShortArray::contentToString)
}



@SinceKotlin("1.5")
public fun assertContains(array: IntArray, element: Int, message: String? = null) {
    assertArrayContains(array, element, { message }, IntArray::contains, IntArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(array: IntArray, element: Int, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, IntArray::contains, IntArray::contentToString)
}


@SinceKotlin("1.5")
public fun assertContains(array: LongArray, element: Long, message: String? = null) {
    assertArrayContains(array, element, { message }, LongArray::contains, LongArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(array: LongArray, element: Long, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, LongArray::contains, LongArray::contentToString)
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


@SinceKotlin("1.5")
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContains(array: UShortArray, element: UShort, message: String? = null) {
    assertArrayContains(array, element, { message }, UShortArray::contains, UShortArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContains(array: UShortArray, element: UShort, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, UShortArray::contains, UShortArray::contentToString)
}


@SinceKotlin("1.5")
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContains(array: UIntArray, element: UInt, message: String? = null) {
    assertArrayContains(array, element, { message }, UIntArray::contains, UIntArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContains(array: UIntArray, element: UInt, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, UIntArray::contains, UIntArray::contentToString)
}


@SinceKotlin("1.5")
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContains(array: ULongArray, element: ULong, message: String? = null) {
    assertArrayContains(array, element, { message }, ULongArray::contains, ULongArray::contentToString)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContains(array: ULongArray, element: ULong, lazyMessage: () -> String) {
    assertArrayContains(array, element, lazyMessage, ULongArray::contains, ULongArray::contentToString)
}

@kotlin.internal.InlineOnly
private inline fun <@OnlyInputTypes A, E> assertArrayContains(
    array: A,
    element: E,
    crossinline lazyMessage: () -> String?,
    contains: A.(E) -> Boolean,
    crossinline contentToString: A.() -> String
) {
    asserter.assertTrue(
        { messagePrefix(lazyMessage()) + "Expected the array to contain the element.\nArray <${array.contentToString()}>, element <${element.toString()}>." },
array.contains(element)
    )
}


@SinceKotlin("1.5")
public fun assertContains(range: IntRange, value: Int, message: String? = null) {
    assertRangeContains(range, value, { message }, IntRange::contains)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(range: IntRange, value: Int, lazyMessage: () -> String) {
    assertRangeContains(range, value, lazyMessage, IntRange::contains)
}



@SinceKotlin("1.5")
public fun assertContains(range: LongRange, value: Long, message: String? = null) {
    assertRangeContains(range, value, { message }, LongRange::contains)
}





@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContains(range: LongRange, value: Long, lazyMessage: ULongRange, value: ULong, lazyMessage: () -> String) {
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

private fun <@OnlyInputTypes K, V> assertContainsImpl(map: Map<K, V>, key: K, lazyMessage: () -> (String)?) {
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
public fun assertContentEquals(expected: CharArray?, actual: CharArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, CharArray::get, CharArray?::contentToString, CharArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
public fun assertContentEquals(expected: CharArray?, actual: CharArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        CharArray::get,
        CharArray?::contentToString,
        CharArray?::contentEquals
    )
}








@SinceKotlin("1.5")
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContentEquals(expected: UByteArray?, actual: UByteArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, UByteArray::get, UByteArray?::contentToString, UByteArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContentEquals(expected: UByteArray?, actual: UByteArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        UByteArray::get,
        UByteArray?::contentToString,
        UByteArray?::contentEquals
    )
}








@SinceKotlin("1.5")
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContentEquals(expected: UShortArray?, actual: UShortArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, UShortArray::get, UShortArray?::contentToString, UShortArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContentEquals(expected: UShortArray?, actual: UShortArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        UShortArray::get,
        UShortArray?::contentToString,
        UShortArray?::contentEquals
    )
}








@SinceKotlin("1.5")
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContentEquals(expected: UIntArray?, actual: UIntArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, UIntArray::get, UIntArray?::contentToString, UIntArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContentEquals(expected: UIntArray?, actual: UIntArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        UIntArray::get,
        UIntArray?::contentToString,
        UIntArray?::contentEquals
    )
}









@SinceKotlin("1.5")
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContentEquals(expected: ULongArray?, actual: ULongArray?, message: String? = null) {
    assertArrayContentEquals(message, expected, actual, { it.size }, ULongArray::get, ULongArray?::contentToString, ULongArray?::contentEquals)
}









@SinceKotlin("2.4")
@ExperimentalKotlinTestApi
@OptIn(ExperimentalUnsignedTypes::class)
public fun assertContentEquals(expected: ULongArray?, actual: ULongArray?, lazyMessage: () -> String) {
    assertArrayContentEquals(
        lazyMessage,
        expected,
        actual,
        { it.size },
        ULongArray::get,
        ULongArray?::contentToString,
        ULongArray?::contentEquals
    )
}


public fun fail(message: String? = null): Nothing {
    asserter.fail(message)
}







@SinceKotlin("1.4")
public fun fail(message: String? = null, cause: Throwable? = null): Nothing {
    asserter.fail(message, cause)
}


@JvmName("expectInline")
@InlineOnly
public inline fun <@OnlyInputTypes T> expect(expected: T, block: () -> T) {
    contract { callsInPlace(block, InvocationKind.EXACTLY_ONCE) }
    assertEquals(expected, block())
}


@JvmName("expectInline")
@InlineOnly
public inline fun <@OnlyInputTypes T> expect(expected: T, message: String?, block: () -> T) {
    contract { callsInPlace(block, InvocationKind.EXACTLY_ONCE) }
    assertEquals(expected, block(), message)
}







@InlineOnly
@JvmName("assertFailsAny")
@IgnorableReturnValue
public inline fun assertFails(block: () -> Any?): Throwable =
    checkResultIsFailure(null, runCatching(block))







@InlineOnly
@JvmName("assertFailsInline")
@Deprecated(ASSERT_FAILS_NOTE, level = DeprecationLevel.HIDDEN)
public inline fun assertFails(block: () -> Unit): Throwable =
    checkResultIsFailure(null, runCatching(block))









@SinceKotlin("1.1")
@InlineOnly
@JvmName("assertFailsAny")
@IgnorableReturnValue
public inline fun assertFails(message: String?, block: () -> Any?): Throwable =
    checkResultIsFailure(message, runCatching(block))









@SinceKotlin("1.1")
@InlineOnly
@JvmName("assertFailsInline")
@Deprecated(ASSERT_FAILS_NOTE, level = DeprecationLevel.HIDDEN)
public inline fun assertFails(message: String?, block: () -> Unit): Throwable =
    checkResultIsFailure(message, runCatching(block))

@PublishedApi
internal fun checkResultIsFailure(message: String?, blockResult: Result<Any?>): Throwable {
    blockResult.fold(
        onSuccess = { v ->
            asserter.fail(messagePrefix(message) + "Expected an exception to be thrown, ${formatResultMessage(v)}")
        },
        onFailure = { e ->
            return e
        }
    )
}








@InlineOnly
@JvmName("assertFailsWithAny")
@IgnorableReturnValue
public inline fun <reified T : Throwable> assertFailsWith(message: String? = null, block: () -> Any?): T =
    assertFailsWith(T::class, message, block)








@InlineOnly
@Deprecated(ASSERT_FAILS_NOTE, level = DeprecationLevel.HIDDEN)
public inline fun <reified T : Throwable> assertFailsWith(message: String? = null, block: () -> Unit): T =
    assertFailsWith(T::class, message, block)







@InlineOnly
@JvmName("assertFailsWithAny")
@IgnorableReturnValue
public inline fun <T : Throwable> assertFailsWith(exceptionClass: KClass<T>, block: () -> Any?): T = assertFailsWith(exceptionClass, null, block)







@InlineOnly
@JvmName("assertFailsWithInline")
@Deprecated(ASSERT_FAILS_NOTE, level = DeprecationLevel.HIDDEN)
public inline fun <T : Throwable> assertFailsWith(exceptionClass: KClass<T>, block: () -> Unit): T = assertFailsWith(exceptionClass, null, block)









@InlineOnly
@JvmName("assertFailsWithAny")
@IgnorableReturnValue
public inline fun <T : Throwable> assertFailsWith(exceptionClass: KClass<T>, message: String?, block: () -> Any?): T =
    checkResultIsFailure(exceptionClass, message, runCatching(block))









@InlineOnly
@JvmName("assertFailsWithInline")
@Deprecated(ASSERT_FAILS_NOTE, level = DeprecationLevel.HIDDEN)
public inline fun <T : Throwable> assertFailsWith(exceptionClass: KClass<T>, message: String?, block: () -> Unit): T =
    checkResultIsFailure(exceptionClass, message, runCatching(block))


internal expect fun AssertionErrorWithCause(message: String?, cause: Throwable?): AssertionError





public interface Asserter {





public fun fail(message: String?): Nothing







@SinceKotlin("1.4")
    public fun fail(message: String?, cause: Throwable?): Nothing






public fun assertTrue(lazyMessage: () -> String?, actual: Boolean): Unit {
        if (!actual) {
            fail(lazyMessage())
        }
    }






public fun assertTrue(message: String?, actual: Boolean): Unit {
        assertTrue({ message }, actual)
    }






public fun assertEquals(message: String?, expected: Any?, actual: Any?): Unit {
        assertTrue({ messagePrefix(message) + "Expected <$expected>, actual <$actual>." }, actual == expected)
    }






public fun assertNotEquals(message: String?, illegal: Any?, actual: Any?): Unit {
        assertTrue({ messagePrefix(message) + "Illegal value: <$actual>." }, actual != illegal)
    }






public fun assertSame(message: String?, expected: Any?, actual: Any?): Unit {
        assertTrue({ messagePrefix(message) + "Expected <$expected>, actual <$actual> is not same." }, actual === expected)
    }






public fun assertNotSame(message: String?, illegal: Any?, actual: Any?): Unit {
        assertTrue({ messagePrefix(message) + "Expected not same as <$actual>." }, actual !== illegal)
    }






public fun assertNull(message: String?, actual: Any?): Unit {
        assertTrue({ messagePrefix(message) + "Expected value to be null, but was: <$actual>." }, actual == null)
    }






public fun assertNotNull(message: String?, actual: Any?): Unit {
        assertTrue({ messagePrefix(message) + "Expected value to be not null." }, actual != null)
    }

}




public interface AsserterContributor {





public fun contribute(): Asserter?
}

private const val ASSERT_FAILS_NOTE = "Provided for binary compatibility. assertFails(With) overload with () -> Any? should be used instead."
