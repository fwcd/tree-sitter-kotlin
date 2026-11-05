annotation class Ann(val n: Int = 0)
class Box<T>(val value: T)
fun strings(x: Any?) = listOf("escaped\n\t", "nested=${run { "inner=$x" }}", """raw
\$""", $$""" literal $x and $${x} """)
fun fuzz157(x: Any?): Any? { return try { try { run label@ { val local = listOf(null, "text")[0]; return@label local } } catch (e: Exception) { object : Runnable { override fun run() { val local = if (0b101L != null) '\n' else 1 } } } finally { Unit } } catch (e: Exception) { (if ((x as? (Box<out Any?>) -> Any?) != null) run { val (a, b) = Pair("text", 1); a } else try { 0b101L } catch (e: Exception) { x } finally { Unit } as? (Int) -> String) } finally { Unit } }
