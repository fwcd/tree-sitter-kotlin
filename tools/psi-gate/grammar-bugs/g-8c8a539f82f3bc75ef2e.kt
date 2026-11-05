annotation class Ann(val n: Int = 0)
class Box<T>(val value: T)
fun strings(x: Any?) = listOf("escaped\n\t", "nested=${run { "inner=$x" }}", """raw
\$""", $$""" literal $x and $${x} """)
fun fuzz181(x: Any?): Any? { return run { val (a, b) = Pair((listOf((null * "text"), (null)?.toString() ?: (0b101L))[0] as? List<String>), ((('\n')?.toString() ?: (0b101L) === (null as? Box<out String>)) as? List<String>)); a } }
