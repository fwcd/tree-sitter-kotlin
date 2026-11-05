annotation class Ann(val n: Int = 0)
class Box<T>(val value: T)
fun strings(x: Any?) = listOf("escaped\n\t", "nested=${run { "inner=$x" }}", """raw
\$""", $$""" literal $x and $${x} """)
fun fuzz85(x: Any?): Any? { return ("value=${(listOf('\n', '\n')[0] in run { val (a, b) = Pair(1, "text"); a })}" || if (if (object : Runnable { override fun run() { val local = '\n' } } != null) ("text" === null) else (0b101L in x) != null) (({ a: Any? -> '\n' })(0x7f))?.toString() ?: (run label@ { val local = 0b101L; return@label local }) else if (try { true } catch (e: Exception) { 1 } finally { Unit } != null) object : Runnable { override fun run() { val local = '\n' } } else (true as? List<String>)) }
