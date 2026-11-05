fun strings(x: Any?) = listOf("escaped\n\t", "nested=${run { "inner=$x" }}", """raw
\$""", $$""" literal $x and $${x} """)
fun fuzz13(x: Any?): Any? { return listOf(({ a: Any? -> "value=${(0x7f as? List<Box<out Any?>>)}" })((({ a: Any? -> true })(0b101L) as? Box<out String>)), (if (({ a: Any? -> null })(0b101L) != null) ("text")?.toString() ?: ('\n') else ({ a: Any? -> '\n' })(x))?.toString() ?: (try { ( '\n')[0] } finally { Unit }))[0] }
