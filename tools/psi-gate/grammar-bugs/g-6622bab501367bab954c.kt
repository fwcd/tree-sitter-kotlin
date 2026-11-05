annotation class Ann(val n: Int = 0)
class Box<T>(val value: T)
fun strings(x: Any?) = listOf("escaped\n\t", "nested=${run { "inner=$x" }}", """raw
\$""", $$""" literal $x and $${x} """)
fun fuzz109(x: Any?): Any? { return listOf((("value=${"text"}")?.toString() ?: ("value=${0x7f}") in ((0b101L)?.toString() ?: (true))?.toString() ?: (run label@ { val local = 1; return@label local })), run label@ { val local = listOf(run label@ { val local = true; return@label local }, listOf(true, '\n')[0])[0]; return@label local })[0] }
