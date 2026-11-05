


















open class NonNullableColumnWithTransform<Unwrapped, Wrapped>(
    delegate: IColumnType<Unwrapped & Any>,
    transformer: ColumnTransformer<Unwrapped, Wrapped>
) : ColumnWithTransform<Unwrapped, Wrapped>(delegate, transformer) {












fun valueFromDBOrNull(value: Any?): Wrapped {
        return if (value == null) {
            transformer.wrap(null as Unwrapped)
        } else {
            transformer.wrap(delegate.valueFromDB(value) as Unwrapped)
        }
    }













override fun unwrapRecursive(value: Wrapped?): Any? {
        return if (delegate is ColumnWithTransform<*, *>) {
            (delegate as ColumnWithTransform<Any, Unwrapped>).unwrapRecursive(transformer.unwrap(value as Wrapped))
        } else {
            transformer.unwrap(value as Wrapped)
        }
    }

    override fun valueFromDB(value: Any): Wrapped? {
        return transformer.wrap(delegate.valueFromDB(value) as Unwrapped)
    }

    override fun valueToDB(value: Wrapped?): Any? {

return delegate.valueToDB(transformer.unwrap(value as Wrapped))
    }

    override fun valueToString(value: Wrapped?): String {
        return delegate.valueToString(transformer.unwrap(value as Wrapped))
    }
}






class ByteColumnType : ColumnType<Byte>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.byteType()

    override fun valueFromDB(value: Any): Byte = when (value) {
        is Byte -> value
        is Number -> value.toByte()
        is String -> value.toByte()
        else -> error("Unexpected value of type Byte: $value of ${value::class.qualifiedName}")
    }

    override fun valueToDB(value: Byte?): Any? {
        return if (currentDialect is SQLServerDialect) {

value?.toShort()
        } else {
            super.valueToDB(value)
        }
    }
}








class UByteColumnType : ColumnType<UByte>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.ubyteType()

    override fun valueFromDB(value: Any): UByte {
        return when (value) {
            is UByte -> value
            is Byte -> value.toUByte()
            is Number -> value.toShort().toUByte()
            is String -> value.toUByte()
            else -> error("Unexpected value of type Byte: $value of ${value::class.qualifiedName}")
        }
    }

    override fun setParameter(stmt: PreparedStatementApi, index: Int, value: Any?) {
        val v = when (value) {
            is UByte -> value.toShort()
            else -> value
        }
        super.setParameter(stmt, index, v)
    }

    override fun notNullValueToDB(value: UByte): Any = value.toShort()
}




class ShortColumnType : ColumnType<Short>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.shortType()
    override fun valueFromDB(value: Any): Short = when (value) {
        is Short -> value
        is Number -> value.toShort()
        is String -> value.toShort()
        else -> error("Unexpected value of type Short: $value of ${value::class.qualifiedName}")
    }
}







class UShortColumnType : ColumnType<UShort>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.ushortType()
    override fun valueFromDB(value: Any): UShort {
        return when (value) {
            is UShort -> value
            is Short -> value.toUShort()
            is Number -> value.toInt().toUShort()
            is String -> value.toUShort()
            else -> error("Unexpected value of type Short: $value of ${value::class.qualifiedName}")
        }
    }

    override fun setParameter(stmt: PreparedStatementApi, index: Int, value: Any?) {
        val v = when (value) {
            is UShort -> value.toInt()
            else -> value
        }
        super.setParameter(stmt, index, v)
    }

    override fun notNullValueToDB(value: UShort): Any = value.toInt()
}




class IntegerColumnType : ColumnType<Int>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.integerType()
    override fun valueFromDB(value: Any): Int = when (value) {
        is Int -> value
        is Number -> value.toInt()
        is String -> value.toInt()
        else -> error("Unexpected value of type Int: $value of ${value::class.qualifiedName}")
    }
}








class UIntegerColumnType : ColumnType<UInt>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.uintegerType()
    override fun valueFromDB(value: Any): UInt {
        return when (value) {
            is UInt -> value
            is Int -> value.toUInt()
            is Number -> value.toLong().toUInt()
            is String -> value.toUInt()
            else -> error("Unexpected value of type Int: $value of ${value::class.qualifiedName}")
        }
    }

    override fun setParameter(stmt: PreparedStatementApi, index: Int, value: Any?) {
        val v = when (value) {
            is UInt -> value.toLong()
            else -> value
        }
        super.setParameter(stmt, index, v)
    }

    override fun notNullValueToDB(value: UInt): Any = value.toLong()
}




class LongColumnType : ColumnType<Long>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.longType()
    override fun valueFromDB(value: Any): Long = when (value) {
        is Long -> value
        is Number -> value.toLong()
        is String -> value.toLong()
        else -> error("Unexpected value of type Long: $value of ${value::class.qualifiedName}")
    }
}




class ULongColumnType : ColumnType<ULong>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.ulongType()
    override fun valueFromDB(value: Any): ULong {
        return when (value) {
            is ULong -> value
            is Long -> value.takeIf { it >= 0 }?.toULong()
            is Double -> value.takeIf { it >= 0 }?.toULong()
is Number -> {
                valueFromDB(value.toString())
            }

            is String -> {
                value.toBigInteger().takeIf {
                    it >= "0".toBigInteger() && it <= ULong.MAX_VALUE.toString().toBigInteger()
                }?.toString()?.toULong()
            }

            else -> error("Unexpected value of type Long: $value of ${value::class.qualifiedName}")
        } ?: error("Negative value but type is ULong: $value")
    }

    override fun notNullValueToDB(value: ULong): Any {
        return when (currentDialect) {

is PostgreSQLNGDialect -> {
                value.takeIf { it >= 0uL && it <= Long.MAX_VALUE.toULong() }?.toLong()
                    ?: error("Value out of range: $value")
            }
            is PostgreSQLDialect -> BigInteger(value.toString())

is H2Dialect -> BigDecimal(value.toString())
            else -> value.toString()
        }
    }
}




class FloatColumnType : ColumnType<Float>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.floatType()
    override fun valueFromDB(value: Any): Float = when (value) {
        is Float -> value
        is Number -> value.toFloat()
        is String -> value.toFloat()
        else -> error("Unexpected value of type Float: $value of ${value::class.qualifiedName}")
    }

    override fun nonNullValueAsDefaultString(value: Float): String {
        return value.toString().let {
            when {



currentDialect is MysqlDialect && it.endsWith(".0") -> it.replace(".0", "")
                else -> it
            }
        }
    }
}




class DoubleColumnType : ColumnType<Double>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.doubleType()
    override fun valueFromDB(value: Any): Double = when (value) {
        is Double -> value

is Float -> value.toString().toDouble()
        is Number -> value.toDouble()
        is String -> value.toDouble()
        else -> error("Unexpected value of type Double: $value of ${value::class.qualifiedName}")
    }

    override fun nonNullValueAsDefaultString(value: Double): String {
        return value.toString().let {
            when {



currentDialect is MysqlDialect && it.endsWith(".0") -> it.replace(".0", "")
                else -> it
            }
        }
    }
}




class DecimalColumnType(

val precision: Int,

val scale: Int
) : ColumnType<BigDecimal>() {
    override fun sqlType(): String = "DECIMAL($precision, $scale)"

    override fun valueFromDB(value: Any): BigDecimal = when (value) {
        is BigDecimal -> value
        is Double -> {
            if (value.isNaN()) {
                error("Unexpected value of type Double: NaN of ${value::class.qualifiedName}")
            } else {
                value.toBigDecimal()
            }
        }

        is Float -> {
            if (value.isNaN()) {
                error("Unexpected value of type Float: NaN of ${value::class.qualifiedName}")
            } else {
                value.toBigDecimal()
            }
        }

        is Long -> value.toBigDecimal()
        is Int -> value.toBigDecimal()
        is Short -> value.toLong().toBigDecimal()
        else -> error("Unexpected value of type Decimal: $value of ${value::class.qualifiedName}")
    }.setScale(scale, RoundingMode.HALF_EVEN)

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as DecimalColumnType

        if (precision != other.precision) return false
        if (scale != other.scale) return false

        return true
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + precision
        result = 31 * result + scale
        return result
    }

    companion object {
        internal val INSTANCE = DecimalColumnType(MathContext.DECIMAL64.precision, 20)
    }
}






class CharacterColumnType : ColumnType<Char>() {
    override fun sqlType(): String = "CHAR"
    override fun valueFromDB(value: Any): Char = when (value) {
        is Char -> value
        is Number -> value.toInt().toChar()
        is String -> value.single()
        else -> error("Unexpected value of type Char: $value of ${value::class.qualifiedName}")
    }

    override fun notNullValueToDB(value: Char): Any = value.toString()

    override fun nonNullValueToString(value: Char): String = "'$value'"
}




abstract class StringColumnType(

val collate: String? = null
) : ColumnType<String>() {

protected fun escape(value: String): String = value.map { charactersToEscape[it] ?: it }.joinToString("")


protected fun escapeAndQuote(value: String): String = when (currentDialect) {
        is PostgreSQLDialect -> "\"${escape(value)}\""
        else -> escape(value)
    }

    override fun valueFromDB(value: Any): String = when (value) {
        is Clob -> value.characterStream.readText()
        is ByteArray -> String(value)
        else -> value.toString()
    }

    override fun nonNullValueToString(value: String): String = buildString {
        append('\'')
        append(escape(value))
        append('\'')
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as StringColumnType

        return collate == other.collate
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + (collate?.hashCode() ?: 0)
        return result
    }

    companion object {
        private val charactersToEscape = mapOf(
            '\'' to "\'\'",
            '\r' to "\\r",
            '\n' to "\\n"
        )
    }
}




open class CharColumnType(

val colLength: Int = 255,
    collate: String? = null
) : StringColumnType(collate) {
    override fun sqlType(): String = buildString {
        append("CHAR($colLength)")
        if (collate != null) {
            append(" COLLATE ${escapeAndQuote(collate)}")
        }
    }

    override fun validateValueBeforeUpdate(value: String?) {
        if (value is String) {
            val valueLength = value.codePointCount(0, value.length)
            require(valueLength <= colLength) {
                "Value can't be stored to database column because exceeds length ($valueLength > $colLength)"
            }
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as CharColumnType

        if (colLength != other.colLength) return false

        if (collate != other.collate) return false
        return true
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + colLength
        return result
    }
}




open class VarCharColumnType(

val colLength: Int = 255,
    collate: String? = null
) : StringColumnType(collate) {
    open fun preciseType() = currentDialect.dataTypeProvider.varcharType(colLength)

    override fun sqlType(): String = buildString {
        append(preciseType())
        if (collate != null) {
            append(" COLLATE ${escapeAndQuote(collate)}")
        }
    }

    override fun validateValueBeforeUpdate(value: String?) {
        if (value is String) {
            val valueLength = value.codePointCount(0, value.length)
            require(valueLength <= colLength) {
                "Value can't be stored to database column because exceeds length ($valueLength > $colLength)"
            }
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as VarCharColumnType

        return colLength == other.colLength
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + colLength
        return result
    }
}




open class TextColumnType(
    collate: String? = null,

val eagerLoading: Boolean = false
) : StringColumnType(collate) {

open fun preciseType() = currentDialect.dataTypeProvider.textType()

    override fun sqlType(): String = buildString {
        append(preciseType())
        if (collate != null) {
            append(" COLLATE ${escapeAndQuote(collate)}")
        }
    }

    override fun readObject(rs: RowApi, index: Int): Any? {
        val value = super.readObject(rs, index)
        return if (eagerLoading && value != null) {
            valueFromDB(value)
        } else {
            value
        }
    }
}

open class MediumTextColumnType(
    collate: String? = null,
    eagerLoading: Boolean = false
) : TextColumnType(collate, eagerLoading) {
    override fun preciseType(): String = currentDialect.dataTypeProvider.mediumTextType()
}

open class LargeTextColumnType(
    collate: String? = null,
    eagerLoading: Boolean = false
) : TextColumnType(collate, eagerLoading) {
    override fun preciseType(): String = currentDialect.dataTypeProvider.largeTextType()
}






open class BasicBinaryColumnType : ColumnType<ByteArray>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.binaryType()

    override fun parameterMarker(value: ByteArray?): String = when (val dialect = currentDialect) {
        is H2Dialect -> "cast(? as ${dialect.originalDataTypeProvider.binaryType()})"
        else -> super.parameterMarker(value)
    }

    override fun valueFromDB(value: Any): ByteArray = when (value) {
        is Blob -> value.binaryStream.use { it.readBytes() }
        is InputStream -> value.use { it.readBytes() }
        is ByteArray -> value
        is String -> value.toByteArray()
        is ByteBuffer -> value.array()
        else -> error("Unexpected value $value of type ${value::class.qualifiedName}")
    }

    override fun nonNullValueToString(value: ByteArray): String = value.toString(Charsets.UTF_8)
}




open class BinaryColumnType(

val length: Int
) : BasicBinaryColumnType() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.binaryType(length)

    override fun validateValueBeforeUpdate(value: ByteArray?) {
        if (value is ByteArray) {
            val valueLength = value.size
            require(valueLength <= length) {
                "Value can't be stored to database column because exceeds length ($valueLength > $length)"
            }
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as BinaryColumnType

        return length == other.length
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + length
        return result
    }
}




class BlobColumnType(

val useObjectIdentifier: Boolean = false
) : ColumnType<ExposedBlob>() {
    override fun sqlType(): String = when {
        useObjectIdentifier && currentDialect is PostgreSQLDialect -> "oid"
        useObjectIdentifier -> error("Storing BLOBs using OID columns is only supported by PostgreSQL")
        else -> currentDialect.dataTypeProvider.blobType()
    }

    override fun valueFromDB(value: Any): ExposedBlob = when (value) {
        is ExposedBlob -> value
        is InputStream -> ExposedBlob(value)
        is ByteArray -> ExposedBlob(value)
        is Blob -> ExposedBlob(value.binaryStream)
        is ByteBuffer -> ExposedBlob(value.array())
        else -> error("Unexpected value of type Blob: $value of ${value::class.qualifiedName}")
    }

    override fun nonNullValueToString(value: ExposedBlob): String {

return ((currentDialect as? H2Dialect)?.originalDataTypeProvider ?: currentDialect.dataTypeProvider)
            .hexToDb(value.hexString())
    }

    override fun readObject(rs: RowApi, index: Int) = when {
        currentDialect is PostgreSQLDialect && useObjectIdentifier -> {
            rs.getObject(index, Blob::class.java)?.binaryStream?.let(::ExposedBlob)
        }
        else -> rs.getObject(index)
    }

    override fun setParameter(stmt: PreparedStatementApi, index: Int, value: Any?) {
        when (val toSetValue = (value as? ExposedBlob)?.inputStream ?: value) {
            is InputStream -> stmt.setInputStream(index, toSetValue, useObjectIdentifier)
            null, is Op.NULL -> stmt.setNull(index, this)
            else -> super.setParameter(stmt, index, toSetValue)
        }
    }
}




abstract class BasicUuidColumnType<T> : ColumnType<T>() {

protected val originalDataTypeProvider: DataTypeProvider
        get() = (currentDialect as? H2Dialect)?.originalDataTypeProvider ?: currentDialect.dataTypeProvider


protected fun String.isHexAndDashFormat(): Boolean = matches(uuidRegexp)

    override fun sqlType(): String = currentDialect.dataTypeProvider.uuidType()

    override fun nonNullValueToString(value: T & Any) = "'$value'"

    @Suppress("MagicNumber")
    override fun readObject(rs: RowApi, index: Int): Any? {
        @OptIn(InternalApi::class)
        val db = currentTransaction().db
        if (currentDialect is MariaDBDialect && !db.version.covers(10)) {
            return rs.getObject(index, java.sql.Array::class.java)
        }
        return super.readObject(rs, index)
    }

    companion object {
        private val uuidRegexp =
            Regex("[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}", RegexOption.IGNORE_CASE)
    }
}




class UuidColumnType : BasicUuidColumnType<Uuid>() {
    override fun valueFromDB(value: Any): Uuid = when (value) {
        is Uuid -> value
        is JavaUUID -> value.toKotlinUuid()
        is ByteArray -> Uuid.fromByteArray(value)
        is String if value.isHexAndDashFormat() -> Uuid.parseHexDash(value)
        is String if currentDialectIfAvailable is RedshiftDialect ->
            Uuid.parseHexOrNull(value)
                ?: error("Amazon Redshift UUID columns require dashed or undashed hexadecimal text: $value")
        is String -> valueFromDB(value.toByteArray())
        is ByteBuffer -> value.getUuid()
        else -> error("Unexpected value of type Uuid: $value of ${value::class.qualifiedName}")
    }

    override fun notNullValueToDB(value: Uuid): Any {
        return originalDataTypeProvider.uuidToDB(value.toJavaUuid())
    }
}






class BooleanColumnType : ColumnType<Boolean>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.booleanType()

    override fun valueFromDB(value: Any): Boolean = when (value) {
        is Number -> value.toLong() != 0L
        is String -> currentDialect.dataTypeProvider.booleanFromStringToBoolean(value)
        else -> value.toString().toBoolean()
    }

    override fun nonNullValueToString(value: Boolean): String =
        currentDialect.dataTypeProvider.booleanToStatementString(value)

    override fun notNullValueToDB(value: Boolean): Any = when {
        (currentDialect is OracleDialect || currentDialect.h2Mode == H2Dialect.H2CompatibilityMode.Oracle) ->
            nonNullValueToString(value)

        else -> value
    }

    companion object {
        internal val INSTANCE = BooleanColumnType()
    }
}






class EnumerationColumnType<T : Enum<T>>(

val klass: KClass<T>
) : ColumnType<T>() {
    override fun sqlType(): String = currentDialect.dataTypeProvider.integerType()
    private val enumConstants by lazy { klass.java.enumConstants!! }

    @Suppress("UNCHECKED_CAST")
    override fun valueFromDB(value: Any): T = when (value) {
        is Number -> enumConstants[value.toInt()]
        is Enum<*> -> value as T
        else -> error("$value of ${value::class.qualifiedName} is not valid for enum ${klass.simpleName}")
    }

    override fun notNullValueToDB(value: T): Int = value.ordinal

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as EnumerationColumnType<*>

        return klass == other.klass
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + klass.hashCode()
        return result
    }
}




class EnumerationNameColumnType<T : Enum<T>>(

val klass: KClass<T>,
    val colLength: Int
) : ColumnType<T>() {
    private val enumConstants by lazy { klass.java.enumConstants!!.associateBy { it.name } }

    override fun sqlType(): String = currentDialect.dataTypeProvider.varcharType(colLength)

    @Suppress("UNCHECKED_CAST")
    override fun valueFromDB(value: Any): T = when (value) {
        is String -> {
            enumConstants[value] ?: error("$value can't be associated with any from enum ${klass.qualifiedName}")
        }

        is Enum<*> -> value as T
        else -> error("$value of ${value::class.qualifiedName} is not valid for enum ${klass.qualifiedName}")
    }

    override fun notNullValueToDB(value: T): Any = value.name

    override fun nonNullValueToString(value: T): String = buildString {
        append('\'')
        append(escape(value.name))
        append('\'')
    }

    override fun validateValueBeforeUpdate(value: T?) {
        if (value != null) {
            val valueLength = value.name.codePointCount(0, value.name.length)
            require(valueLength <= colLength) {
                "Value can't be stored to database column because exceeds length ($valueLength > $colLength)"
            }
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        if (!super.equals(other)) return false

        other as EnumerationNameColumnType<*>

        return klass == other.klass
    }

    override fun hashCode(): Int {
        var result = super.hashCode()
        result = 31 * result + klass.hashCode()
        return result
    }

    private fun escape(value: String): String = value.map { charactersToEscape[it] ?: it }.joinToString("")

    companion object {
        private val charactersToEscape = mapOf(
            '\'' to "\'\'",
            '\r' to "\\r",
            '\n' to "\\n"
        )
    }
}




class CustomEnumerationColumnType<T : Enum<T>>(

val name: String,

val sql: String?,

val fromDb: (Any) -> T,

val toDb: (T) -> Any
) : ColumnType<T>() {
    override fun sqlType(): String = sql ?: error("Column $name should exist in database")

    @Suppress("UNCHECKED_CAST")
    override fun valueFromDB(value: Any): T = if (value::class.isSubclassOf(Enum::class)) value as T else fromDb(value)

    override fun notNullValueToDB(value: T): Any = toDb(value)

    override fun nonNullValueToString(value: T): String = buildString {
        append('\'')
        append(escape(notNullValueToDB(value).toString()))
        append('\'')
    }

    private fun escape(value: String): String = value.map { charactersToEscape[it] ?: it }.joinToString("")

    companion object {
        private val charactersToEscape = mapOf(
            '\'' to "\'\'",
            'a//b' to "\\r",
            '\n' to "\\n"
        )
    }
}












class ArrayColumnType<T, R : List<Any?>>(
    val delegate: IColumnType<T & Any>,
    val maximumCardinality: List<Int>? = null,
    val dimensions: Int = 1
) : ColumnType<R>() {

    private val nullElementString = "null"







constructor(delegate: ColumnType<T & Any>, maximumCardinality: Int? = null) : this(delegate, maximumCardinality?.let { listOf(it) })




val delegateType: String
        get() = delegate.sqlType().substringBefore('(')

    override fun sqlType(): String {
        val dialect = currentDialect
        if (dialect is RedshiftDialect) {
            throw UnsupportedByDialectException("Amazon Redshift does not support array columns", dialect)
        }
        return buildString {
            if (maximumCardinality != null) {
                require(maximumCardinality.size == dimensions) {
                    "The size of cardinality list must be equal to the amount of array dimensions. " +
                        "Dimensions: $dimensions, cardinality size: ${maximumCardinality.size}"
                }
            }
            append(delegate.sqlType())
            when {
                dialect is H2Dialect -> {
                    require(dimensions == 1) {
                        "H2 does not support multidimensional arrays. " +
                            "`dimensions` parameter for H2 database must be 1"
                    }
                    append(" ARRAY", maximumCardinality?.let { "[${it.first()}]" } ?: "")
                }

                else -> append(
                    maximumCardinality?.let { cardinality -> cardinality.joinToString("") { "[$it]" } }
                        ?: "[]".repeat(dimensions)
                )
            }
        }
    }

    override fun notNullValueToDB(value: R): Any {
        return recursiveNotNullValueToDB(value, dimensions)
    }

    private fun recursiveNotNullValueToDB(value: Any, level: Int): Array<Any?> = when {
        level > 1 -> (value as List<Any>).map { recursiveNotNullValueToDB(it, level - 1) }.toTypedArray()
        else -> (value as List<T>).map { it?.let { delegate.notNullValueToDB(it) } }.toTypedArray()
    }

    @Suppress("UNCHECKED_CAST")
    override fun valueFromDB(value: Any): R? {
        return when (value) {
            is Array<*> -> recursiveValueFromDB(value, dimensions) as R?
            is java.sql.Array -> recursiveValueFromDB(value.array, dimensions) as R?
            else -> value as R?
        }
    }

    private fun recursiveValueFromDB(value: Any?, level: Int): List<Any?> = when {
        level > 1 -> (value as Array<Any?>).map { recursiveValueFromDB(it, level - 1) }
        else -> (value as Array<Any?>).map { it?.let { delegate.valueFromDB(it) } }
    }

    override fun readObject(rs: RowApi, index: Int): Any? = rs.getObject(index)

    override fun setParameter(stmt: PreparedStatementApi, index: Int, value: Any?) {
        when (value) {
            is Array<*> if isArrayOfByteArrays(value) ->
                stmt.setArray(index, this, Array(value.size) { value[it] as ByteArray })
            is Array<*> -> stmt.setArray(index, this, value)
            else -> super.setParameter(stmt, index, value)
        }
    }

    override fun nonNullValueToString(value: R): String {
        return arrayLiteralPrefix() + recursiveNonNullValueToString(value, dimensions)
    }

    private fun recursiveNonNullValueToString(value: Any?, level: Int): String = when {
        level > 1 -> (value as List<Any?>).joinToString(",", "[", "]") { recursiveNonNullValueToString(it, level - 1) }
        else -> (value as List<T>).joinToString(",", "[", "]") { it?.let { delegate.nonNullValueToString(it) } ?: nullElementString }
    }

    override fun nonNullValueAsDefaultString(value: R): String {
        return arrayLiteralPrefix() + recursiveNonNullValueAsDefaultString(value, dimensions)
    }

    private fun recursiveNonNullValueAsDefaultString(value: Any?, level: Int): String = when {
        level > 1 -> (value as List<Any?>).joinToString(",", "[", "]") { recursiveNonNullValueAsDefaultString(it, level - 1) }
        else -> (value as List<T>).joinToString(",", "[", "]") { it?.let { delegate.nonNullValueAsDefaultString(it) } ?: nullElementString }
    }

    private fun arrayLiteralPrefix(): String {
        return when {
            currentDialect is H2Dialect -> "ARRAY "
            else -> "ARRAY"
        }
    }

    private fun castH2ParameterMarker(columnType: IColumnType<*>): String? {
        return when (columnType) {



is ByteColumnType, is UByteColumnType, is BooleanColumnType, is ShortColumnType, is UShortColumnType,
            is IntegerColumnType, is UIntegerColumnType, is LongColumnType, is ULongColumnType, is FloatColumnType,
            is DoubleColumnType, is StringColumnType, is CharacterColumnType, is BasicBinaryColumnType, is BasicUuidColumnType ->
                "cast(? as ${columnType.sqlType()} array)"
            else -> null
        }
    }

    override fun parameterMarker(value: R?): String {
        if (currentDialect is H2Dialect) {
            val columnType = if (delegate is ColumnWithTransform<*, *>) delegate.originalColumnType else delegate
            return castH2ParameterMarker(columnType) ?: super.parameterMarker(value)
        }



if (currentDialect is PostgreSQLDialect && delegate is IDateColumnType) {
            val pgType = "${delegate.sqlType().lowercase()}[]"
            return "?::$pgType"
        }

        return super.parameterMarker(value)
    }
}

private fun isArrayOfByteArrays(value: Array<*>) =
    value.all { it is ByteArray }








enum class VectorFormat {

FLOAT32,


FLOAT64,


INT8,
}




abstract class BasicVectorColumnType<T>(




val dimensions: Int?,

val format: VectorFormat,
) : ColumnType<T>() {
    override fun sqlType(): String {
        require(dimensions == null || dimensions > 1) { "The specified dimensions must be at minimum 1." }

        val dialect = currentDialect
        if (dimensions == null && (dialect is SQLServerDialect || dialect is MariaDBDialect)) {
            error("The database ${dialect.name} does not support vectors of undefined dimensions")
        }
        if (dialect is SQLServerDialect && format != VectorFormat.FLOAT32) {
            error("SQL Server only supports the FLOAT32 base type for dimensions.")
        }

        return buildString {
            append(dialect.dataTypeProvider.vectorType())
            when {
                dialect is OracleDialect -> append("(${dimensions ?: "*"}, ${format.name})")
                dialect is SQLServerDialect -> append("($dimensions, ${format.name.lowercase()})")
                dimensions != null -> append("($dimensions)")

}
        }
    }

    override fun readObject(rs: RowApi, index: Int): Any? = when (currentDialect) {
        is SQLServerDialect -> SqlServerVectorBinder.readData(rs, index)
        is PostgreSQLDialect -> rs.getString(index)
        else -> super.readObject(rs, index)
    }


protected abstract fun formatToString(value: T): String

    override fun nonNullValueToString(value: T & Any): String {
        val arrayString = formatToString(value)
        return when (currentDialect) {
            is MariaDBDialect -> "VEC_FROMTEXT($arrayString)"
            is OracleDialect, is MysqlDialect -> "TO_VECTOR($arrayString)"
            else -> arrayString
        }
    }

    override fun parameterMarker(value: T?): String = when (currentDialect) {
        is PostgreSQLDialect -> "?::vector${dimensions?.let { "($it)" } ?: ""}"
        else -> super.parameterMarker(value)
    }

    override fun setParameter(stmt: PreparedStatementApi, index: Int, value: Any?) {
        val dialect = currentDialect
        val parameterValue = when (dialect) {
            is OracleDialect if value != null -> OracleVectorBinder.valueToBind(value, format)
            is SQLServerDialect if value != null -> SqlServerVectorBinder.valueToBind(value)
            else -> value
        }
        super.setParameter(stmt, index, parameterValue)
    }
}




class FloatVectorColumnType(
    dimensions: Int?,
    format: VectorFormat,
) : BasicVectorColumnType<FloatArray>(dimensions, format) {

    override fun sqlType(): String {
        require(format != VectorFormat.INT8) {
            "This column type only supports vector dimensions formatted as floating point numbers."
        }
        return super.sqlType()
    }

    override fun readObject(rs: RowApi, index: Int): Any? = when (currentDialect) {
        is OracleDialect -> rs.getObject(index, FloatArray::class.java)
        else -> super.readObject(rs, index)
    }

    override fun formatToString(value: FloatArray): String = "'${value.contentToString()}'"

    @Suppress("UNCHECKED_CAST")
    override fun valueFromDB(value: Any): FloatArray = when (value) {
        is FloatArray -> value
        is Array<*> -> (value as Array<Float>).toFloatArray()
        is ByteArray -> value.toFloatArray()
        is String -> value.trim('[', ']').split(",").map { it.toFloat() }.toFloatArray()
        else -> error("Unexpected value of type FloatArray: $value of ${value::class.qualifiedName}")
    }

    override fun setParameter(stmt: PreparedStatementApi, index: Int, value: Any?) {
        val parameterValue = if (currentDialect is MysqlDialect && value is FloatArray) {
            value.toByteArray()
        } else {
            value
        }
        super.setParameter(stmt, index, parameterValue)
    }
}




class IntVectorColumnType(
    dimensions: Int?,
    format: VectorFormat,
) : BasicVectorColumnType<IntArray>(dimensions, format) {

    override fun sqlType(): String {
        require(format == VectorFormat.INT8) {
            "This column type only supports vector dimensions formatted as integers."
        }
        return super.sqlType()
    }

    override fun readObject(rs: RowApi, index: Int): Any? = when (currentDialect) {
        is OracleDialect -> rs.getObject(index, IntArray::class.java)
        else -> super.readObject(rs, index)
    }

    override fun formatToString(value: IntArray): String = "'${value.contentToString()}'"

    @Suppress("UNCHECKED_CAST")
    override fun valueFromDB(value: Any): IntArray = when (value) {
        is IntArray -> value
        is Array<*> -> (value as Array<Int>).toIntArray()
        is ByteArray -> value.toIntArray()
        is String -> value.trim('[', ']').split(",").map { it.toInt() }.toIntArray()
        else -> error("Unexpected value of type IntArray: $value of ${value::class.qualifiedName}")
    }

    override fun setParameter(stmt: PreparedStatementApi, index: Int, value: Any?) {
        val parameterValue = if (currentDialect is MysqlDialect && value is IntArray) {
            value.toByteArray()
        } else {
            value
        }
        super.setParameter(stmt, index, parameterValue)
    }
}



















@Suppress("MagicNumber")
private fun ByteArray.toFloatArray(): FloatArray {
    val capacity = this.size / 4
    val result = FloatArray(capacity)
    repeat(capacity) { i ->
        val base = i * 4
        val bits = (this[base + 3].toInt() and 0xFF shl 24) or
            (this[base + 2].toInt() and 0xFF shl 16) or
            (this[base + 1].toInt() and 0xFF shl 8) or
            (this[base].toInt() and 0xFF)
        result[i] = Float.fromBits(bits)
    }
    return result
}

@Suppress("MagicNumber")
private fun ByteArray.toIntArray(): IntArray {
    val capacity = this.size / 4
    val result = IntArray(capacity)
    repeat(capacity) { i ->
        val base = i * 4
        result[i] = (this[base].toInt() and 0xFF shl 24) or
            (this[base + 1].toInt() and 0xFF shl 16) or
            (this[base + 2].toInt() and 0xFF shl 8) or
            (this[base + 3].toInt() and 0xFF)
    }
    return result
}














@Suppress("MagicNumber")
private fun FloatArray.toByteArray(): ByteArray {
    val capacity = this.size * 4
    val bytes = ByteArray(capacity)
    repeat(this.size) { i ->
        val base = i * 4
        val bits = this[i].toRawBits()
        bytes[base] = (bits and 0xff).toByte()
        bytes[base + 1] = ((bits shr 8) and 0xff).toByte()
        bytes[base + 2] = ((bits shr 16) and 0xff).toByte()
        bytes[base + 3] = ((bits shr 24) and 0xff).toByte()
    }
    return bytes
}

@Suppress("MagicNumber")
private fun IntArray.toByteArray(): ByteArray {
    val capacity = this.size * 4
    val bytes = ByteArray(capacity)
    repeat(this.size) { i ->
        val base = i * 4
        val bits = this[i]
        bytes[base] = (bits shr 24).toByte()
        bytes[base + 1] = (bits shr 16).toByte()
        bytes[base + 2] = (bits shr 8).toByte()
        bytes[base + 3] = bits.toByte()
    }
    return bytes
}


private object OracleVectorBinder {
    private val vectorClass by lazy { Class.forName("oracle.sql.VECTOR") }
    private val ofFloat32Values by lazy { vectorClass.getMethod("ofFloat32Values", Any::class.java) }
    private val ofFloat64Values by lazy { vectorClass.getMethod("ofFloat64Values", Any::class.java) }
    private val ofInt8Values by lazy { vectorClass.getMethod("ofInt8Values", Any::class.java) }

    fun valueToBind(value: Any, format: VectorFormat): Any = when (format) {
        VectorFormat.FLOAT32 -> ofFloat32Values.invoke(null, value)
        VectorFormat.FLOAT64 -> ofFloat64Values.invoke(null, value)
        VectorFormat.INT8 -> ofInt8Values.invoke(null, value)
    }
}


private object SqlServerVectorBinder {
    private val vectorClass by lazy { Class.forName("microsoft.sql.Vector") }
    private val vectorConstructor by lazy {
        vectorClass.getConstructor(Int::class.java, Int::class.java, Array<Any>::class.java)
    }
    private val getData by lazy { vectorClass.getMethod("getData") }

    @Suppress("MagicNumber")
    fun valueToBind(value: Any): Any = when (value) {
        is FloatArray -> vectorConstructor.newInstance(value.size, 4, value.toTypedArray())
        is IntArray -> vectorConstructor.newInstance(value.size, 4, value.toTypedArray())
        else -> error("Unexpected value when setting statement parameters: $value of ${value::class.qualifiedName}}")
    }

    fun readData(rs: RowApi, index: Int): Any? {
        val vector = rs.getObject(index, vectorClass)
        return if (vector == null) null else getData.invoke(vector)
    }
}






interface IDateColumnType {
    val hasTimePart: Boolean
}






interface JsonColumnMarker {

val usesBinaryFormat: Boolean


val needsBinaryFormatCast: Boolean
}


internal fun Column<*>.isJsonBColumnForCasting(): Boolean {
    if (columnType !is JsonColumnMarker) return false

    return columnType.usesBinaryFormat && columnType.needsBinaryFormatCast
}









internal fun QueryBuilder.appendForJsonBCast(expression: Expression<*>) {
    val column = expression as? Column<*>
    if (column?.isJsonBColumnForCasting() == true) {
        append(CastToJson(column, column.columnType))
    } else {
        append(expression)
    }
}








@InternalApi
fun <T : Any> resolveColumnType(
    klass: KClass<T>,
    defaultType: ColumnType<*>? = null
): ColumnType<T> {
    val type = when (klass) {
        Boolean::class -> BooleanColumnType()
        Byte::class -> ByteColumnType()
        UByte::class -> UByteColumnType()
        Short::class -> ShortColumnType()
        UShort::class -> UShortColumnType()
        Int::class -> IntegerColumnType()
        UInt::class -> UIntegerColumnType()
        Long::class -> LongColumnType()
        ULong::class -> ULongColumnType()
        Float::class -> FloatColumnType()
        Double::class -> DoubleColumnType()
        String::class -> TextColumnType()
        Char::class -> CharacterColumnType()
        ByteArray::class -> BasicBinaryColumnType()
        BigDecimal::class -> DecimalColumnType.INSTANCE
        Uuid::class -> UuidColumnType()
        JavaUUID::class -> UUIDColumnType()
        else -> defaultType
    } as? ColumnType<T>

    return type ?: error(
        "A column type could not be associated with ${klass.qualifiedName}. Provide an explicit column type argument."
    )
}




@InternalApi
@Suppress("UNCHECKED_CAST")
fun <T : Any> resolveVectorColumnType(
    klass: KClass<T>,
    dimensions: Int?,
    format: VectorFormat?,
): BasicVectorColumnType<T> {
    val type = when (klass) {
        FloatArray::class -> {
            if (format != null && format == VectorFormat.INT8) error("Provided VectorFormat must be a floating-point type")
            FloatVectorColumnType(dimensions, format ?: VectorFormat.FLOAT32)
        }
        IntArray::class -> {
            if (format != null && format != VectorFormat.INT8) error("Provided VectorFormat must be an integer type")
            IntVectorColumnType(dimensions, format ?: VectorFormat.INT8)
        }
        else -> null
    } as? BasicVectorColumnType<T>

    return type ?: error(
        "A vector column type could not be associated with ${klass.qualifiedName}." +
            "Check the available VectorFormat options for your database & provide a corresponding primitive array type."
    )
}
