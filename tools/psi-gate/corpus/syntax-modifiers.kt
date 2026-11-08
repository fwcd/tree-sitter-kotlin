public abstract class C{protected abstract fun f();internal lateinit var x:String}
private const val c=1
expect class Expected
actual class Actual
sealed interface I
annotation class A
data class Data(val x:Int)
value class Value(val x:Int)
class Outer{inner class Inner}
final class Final
external fun ext()
tailrec fun recur()=recur()
suspend fun susp(){}
operator fun Int.plus(other:Int)=other
infix fun Int.named(other:Int)=other
inline fun f(noinline g:()->Unit,crossinline h:()->Unit){}
