import java.io.OutputStream.nullOutputStream
import org.gradle.internal.os.OperatingSystem
import org.gradle.kotlin.dsl.support.useToRun
import org.jetbrains.kotlin.gradle.ExperimentalKotlinGradlePluginApi
import org.jetbrains.kotlin.gradle.tasks.CInteropProcess
import org.jetbrains.kotlin.konan.target.PlatformManager

inline val File.unixPath: String
    get() = if (!os.isWindows) path else path.replace("\\", "/")

val os: OperatingSystem = OperatingSystem.current()
val libsDir = layout.buildDirectory.get().dir("libs")
val grammarDir = projectDir.parentFile.parentFile

group = "io.github.fwcd"
version = property("project.version") as String

plugins {
    `maven-publish`
    signing
    kotlin("multiplatform") version "1.9.24"
    id("com.android.library") version "8.2.0"
    id("io.github.tree-sitter.ktreesitter-plugin") version "0.22.4"
}

grammar {
    baseDir = grammarDir
    grammarName = "kotlin"
    className = "TreeSitterKotlin"
    packageName = "io.github.fwcd.ktreesitter.kotlin"
    files = arrayOf(
        grammarDir.resolve("src/scanner.c"),
        grammarDir.resolve("src/parser.c")
    )
}

val generateTask = tasks.generateGrammarFiles.get()

kotlin {
    jvm {}

    androidTarget {
        withSourcesJar(true)
        publishLibraryVariants("release")
    }

    when {
        os.isLinux -> listOf(linuxX64(), linuxArm64())
        os.isWindows -> listOf(mingwX64())
        os.isMacOsX -> listOf(
            macosArm64(),
            macosX64(),
            iosArm64(),
            iosSimulatorArm64()
        )
        else -> {
            val arch = System.getProperty("os.arch")
            throw GradleException("Unsupported platform: $os ($arch)")
        }
    }.forEach { target ->
        target.compilations.configureEach {
            cinterops.create(grammar.interopName.get()) {
                defFileProperty.set(generateTask.interopFile.asFile)
                includeDirs.allHeaders(grammarDir.resolve("bindings/c"))
                extraOpts("-libraryPath", libsDir.dir(konanTarget.name))
                tasks.getByName(interopProcessingTaskName).mustRunAfter(generateTask)
            }
        }
    }

    jvmToolchain(17)

    sourceSets {
        val generatedSrc = generateTask.generatedSrc.get()
        configureEach {
            kotlin.srcDir(generatedSrc.dir(name).dir("kotlin"))

            languageSettings {
                @OptIn(ExperimentalKotlinGradlePluginApi::class)
                compilerOptions {
                    freeCompilerArgs.add("-Xexpect-actual-classes")
                }
            }
        }

        jvmMain {
            resources.srcDir(generatedSrc.dir(name).dir("resources"))
        }

        commonMain {
            dependencies {
                implementation(kotlin("stdlib"))
            }
        }

        commonTest {
            dependencies {
                implementation(kotlin("test"))
                implementation("io.github.tree-sitter:ktreesitter:0.22.4")
            }
        }
    }
}

android {
    namespace = "$group.ktreesitter.${grammar.grammarName.get()}"
    compileSdk = 34
    ndkVersion = findProperty("ndk.version") as String? ?: "26.3.11579264"
    defaultConfig {
        minSdk = 23
        ndk {
            moduleName = grammar.libraryName.get()
            //noinspection ChromeOsAbiSupport
            abiFilters += setOf("x86_64", "arm64-v8a", "armeabi-v7a")
        }
        resValue("string", "version", version as String)
    }
    externalNativeBuild {
        cmake {
            path = generateTask.cmakeListsFile.get().asFile
            buildStagingDirectory = file(".cmake")
            version = findProject("cmake.version") as String? ?: "3.29.4"
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.withType<CInteropProcess>().configureEach {
    if (name.startsWith("cinteropTest")) return@configureEach

    val grammarFiles = grammar.files.get()
    val grammarName = grammar.grammarName.get()
    val runKonan = File(konanHome.get()).resolve("bin")
            .resolve(if (os.isWindows) "run_konan.bat" else "run_konan").path
    val libFile = libsDir.dir(konanTarget.name).file("libtree-sitter-$grammarName.a").asFile
    val objectFiles = grammarFiles.map {
        grammarDir.resolve(it.nameWithoutExtension + ".o").path
    }.toTypedArray()
    val loader = PlatformManager(konanHome.get(), false, konanDataDir.orNull).loader(konanTarget)

    doFirst {
        if (!File(loader.absoluteTargetToolchain).isDirectory) loader.downloadDependencies()

        val argsFile = File.createTempFile("args", null)
        argsFile.deleteOnExit()
        argsFile.writer().useToRun {
            write("-I" + grammarDir.resolve("src").unixPath + "\n")
            write("-DTREE_SITTER_HIDE_SYMBOLS\n")
            write("-fvisibility=hidden\n")
            write("-std=c11\n")
            write("-O2\n")
            write("-g\n")
            write("-c\n")
            grammarFiles.forEach { write(it.unixPath + "\n") }
        }

        exec {
            executable = runKonan
            workingDir = grammarDir
            standardOutput = nullOutputStream()
            args("clang", "clang", konanTarget.name, "@" + argsFile.path)
        }

        exec {
            executable = runKonan
            workingDir = grammarDir
            standardOutput = nullOutputStream()
            args("llvm", "llvm-ar", "rcs", libFile.path, *objectFiles)
        }
    }

    inputs.files(*grammarFiles)
    outputs.file(libFile)
}
