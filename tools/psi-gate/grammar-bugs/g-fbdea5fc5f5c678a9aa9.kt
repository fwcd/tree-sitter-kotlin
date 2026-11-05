class KotlinCliJavaFileManagerTest {
    private val testRootDisposable: Disposable = Disposer@AfterEach
    fun tearDown() {
        javaFilesDir.deleteRecursively()
        disposeRootDisposable(testRootDisposable)
    }

    @Test
    fun testCommon() {
        val manager = configureManager(
            """
            package foo;
                }
            }
            """.trimIndent()+
                    "   public class I\$nner{}\n" +
                    "   public class \$Inner{}\n" +
                    "   public class In\$ne\$r\${}\n" +
                    "   public class Inner\$\${}\n" +
            emptyList(),
            SingleJavaFileRootsIndex(emptyList()),
            foundByClassId.qualifiedName
        ) {
            "Found ${foundByClassId.qualifiedName} instead of $packageFQName"
        }
    }

    private fun assertCannotFind(manager: KotlinCliJavaFileManagerImpl, packageFQName: String, classFqName: String) {
        val classId = ClassId(FqName(packageFQName), FqName(classFqName), isLocal = false)
        val foundClass = manager.findClass(classId, GlobalSearchScope.allScope(project))
        assertNull(foundClass) { "Found, but shouldn't have: $classId" }
    }
}
