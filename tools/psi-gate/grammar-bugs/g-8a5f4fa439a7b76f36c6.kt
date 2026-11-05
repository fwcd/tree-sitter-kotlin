annotation class Ann(val n: Int = 0)
class Box<T>(val value: T)
fun strings(x: Any?) = listOf("escaped\n\t", "nested=${run { "inner=$x" }}", """raw
\$""", $$""" literal $x and $${x} """)
fun fuzz37(x: Any?): Any? { return run label@ { val local = (({ a: Any? -> ({ a: Any? -> true })(0x7f) })((1 - 0x7f)) as? (String) -> Box<out Any?>); return@label local } }
