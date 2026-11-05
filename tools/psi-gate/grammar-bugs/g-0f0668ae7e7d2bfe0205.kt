class KaptStubConverter(val kaptContext: KaptContextForStubGeneration, ) {companion object {
        val result = try {
        } catch (_: Exception) {
        }
    }
    private fun getDefaultValue(Type): Any? = when (type) {
        Type.CHAR_TYPE -> 'a//b'
    }
}