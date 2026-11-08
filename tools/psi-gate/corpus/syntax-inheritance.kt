open class Base
interface I
class C:Base(),I{override fun f(){super<Base>.f()}}
val obj=object:Base(),I{}
