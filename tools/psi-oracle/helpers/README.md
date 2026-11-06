# Precompiled oracle helper

`psi-oracle-1.jar` is the Java 17 build of `../PsiOracle.java`. Its complete
payload SHA-256 is pinned in the root `psigate.toml`; the gate verifies it before
loading it. The source used for version 1 has SHA-256
`17b55cd1100a8cc2350a3589cc78eeb5baf02fa56592560734caf674666fbfa9`.

To release a changed helper, use a JDK 17 producer with the configured Kotlin jars:

```sh
javac --release 17 -cp 'tools/psi-oracle/lib/*' -d /tmp/psi-helper-classes tools/psi-oracle/PsiOracle.java
jar --create --file /tmp/psi-oracle-next.jar -C /tmp/psi-helper-classes .
```

Use a new helper version, commit its jar, and update its TOML hash. Regenerate the
PSI corpus expectations and review the resulting identity/dump changes. Rebuilding
is a release operation; consumers run the committed class with a JRE 17 and do not
invoke `javac`, `jar`, or Java source-file mode. The jar contains only the helper
classes; dependency coordinates and SHA-256 pins remain in TOML.
