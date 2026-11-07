plugins {
  kotlin("jvm") version "2.0.0"
  id("sample.plugin") apply false
}
repositories { mavenCentral() }
dependencies {
  implementation("sample:library:1.0")
  testImplementation(kotlin("test"))
}
tasks.register("hello") { doLast { println("hello") } }
