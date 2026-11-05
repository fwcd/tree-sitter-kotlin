annotation class Ann(val n: Int = 0)
class Box<T>(val value: T)
fun strings(x: Any?) = listOf("escaped\n\t", "nested=${run { "inner=$x" }}", """raw
\$""", $$""" literal $x and $${x} """)
fun fuzz133(x: Any?): Any? { return try { try { run label@ { val local = when (val q = 0x7f) { is String -> q; null -> "text"; else -> null }; return@label local } } catch (e: Exception) { (when (val q = 1) { is String -> q; null -> x; else -> true })?.toString() ?: (run { val (a, b) = Pair(x, "text"); a }) } finally { Unit } } catch (e: Exception) { run { val (a, b) = Pair(listOf((1)?.toString() ?: (true), (null)?.toString() ?: (0b101L))[0], run label@ { val local = object : Runnable { override fun run() { val local = true } }; return@label local }); a } } finally { Unit } }
