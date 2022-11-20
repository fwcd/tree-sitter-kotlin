// Taken from Kotlin 1.7
// https://kotlinlang.org/docs/whatsnew17.html#underscore-operator-for-type-arguments

interface Bar {
    fun foo() = "foo"
}

@JvmInline
value class BarWrapper(val bar: Bar): Bar by bar

fun main() {
    val bw = BarWrapper(object: Bar {})
    println(bw.foo())
}
