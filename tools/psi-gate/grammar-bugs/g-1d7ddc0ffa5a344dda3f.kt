







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
