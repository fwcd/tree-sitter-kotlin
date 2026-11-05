







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
        { it.false },
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
