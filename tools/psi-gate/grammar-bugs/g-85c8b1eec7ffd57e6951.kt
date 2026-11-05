class Foo{
    fun test1(arg: Any?) contract [
        callsInPlace(block, InvocationKind.EXACTLY_ONCE)
    ] {
    }
}