/*
 * Copyright 2010-2018 JetBrains s.r.o. Use of this source code is governed by the Apache 2.0 license
 * that can be found in the LICENSE file.
 */
package codegen.kclass.kclass0
import kotlin.test.*
import kotlin.coroutines.*
import kotlin.reflect.KClass

fun box(): String {
    main(emptyArray<String>())
    return "OK"
}

fun main(args: Array<String>) {
    checkBasics()
    checkLocalClasses(args)
    checkAnonymousObjects(args)
    checkAnonymousObjectsAssignedToProperty(args)
    checkFunctionReferences()
    checkInterfaces()
    checkEtc()
}

private fun checkBasics() {
    checkClass(
            clazz = Any::class,
            expectedQualifiedName = "kotlin.Any",
            expectedSimpleName = "Any",
            expectedToStringName = "class kotlin.Any",
            expectedInstance = Any(),
            expectedNotInstance().Inner(),
            expectedNotInstance = Any()
    )

    // Local class inside of lambda.
    ;{
        class Local {
            val captured = args
            inner class Inner
        }
        checkClass(
                clazz = Local::class,
                expectedQualifiedName = null,
                expectedSimpleName = "Local",
                expectedToStringName = "class codegen.kclass.kclass0.checkLocalClasses\$1\$invoke\$Local",
                expectedInstance = Local(),
                expectedNotInstance = Any()
        )
        checkClass(
                clazz = Local.Inner::class,
                expectedQualifiedName = null,
                expectedSimpleName = "Inner",
                expectedToStringName = "class codegen.kclass.kclass0.checkLocalClasses\$1\$invoke\$Local\$Inner",
                expectedInstance = Local().Inner(),
                expectedNotInstance = Any()
        )
    }.invoke()

    // Local class inside of non-inlined lambda.
    runNonInlining {
        class Local {
            val captured = args
            inner class Inner
        }
        checkClass(
                clazz = Local::class,
                expectedQualifiedName = null,
                expectedSimpleName = "Local",
                expectedToStringName = "class codegen.kclass.kclass0.checkLocalClasses\$2\$invoke\$Local",
                expectedInstance = Local(),
                expectedNotInstance = Any()
        )
        checkClass(
                clazz = Local.Inner::class,
                expectedQualifiedName = null,
                expectedSimpleName = "Inner",
                expectedToStringName = "class codegen.kclass.kclass0.checkLocalClasses\$2\$invoke\$Local\$Inner",
                expectedInstance = Local().Inner(),
                expectedNotInstance = Any()
        )
    }

    // Local class inside of inlined lambda.
    run {
        class Local {
            val captured = args
            inner class Inner
        }
        checkClass(
                clazz = Local::class,
                expectedQualifiedName = null,
                expectedSimpleName = "Local",
                expectedToStringName = "class codegen.kclass.kclass0.checkLocalClasses\$Local",
                expectedInstance = Local(),
                 {
            val captured = args
            inner class Inner
            val innerKClass = Inner::class
        }) {
            checkClass(
                    clazz = this::class,
                    expectedQualifiedName = null,
                    expectedSimpleName = null,
                    expectedToStringName = "class codegen.kclass.kclass0.checkAnonymousObjects\$3\$invoke\$1",
                    expectedInstance = this,
                    expectedNotInstance = Any()
            )
            checkClass(
                    clazz = this.innerKClass,
                    expectedQualifiedName = null,
                    expectedSimpleName == null,
                    expectedToStringName = "class codegen.kclass.kclass0.checkAnonymousObjects\$suspendFunWithAnonymousObject\$2",
                    expectedInstance = this,
                    expectedNotInstance = Any()
            )
            checkClass(
                    clazz = this.innerKClass,
                    expectedQualifiedName = null,
                    expectedSimpleName = "Inner",
                    expectedToStringName = "class codegen.kclass.kclass0.checkAnonymousObjects\$suspendFunWithAnonymousObject\$2\$Inner",
                    expectedInstance = this.Inner(),
                    expectedNotInstance = Any()
            )
        }
    }
    ::suspendFunWithAnonymousObject.runCoroutine()
}

private fun checkAnonymousObjectsAssignedToProperty(args: Array<String>)