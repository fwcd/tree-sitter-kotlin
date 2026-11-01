// Batch Kotlin PSI oracle: parses each listed file with the Kotlin 2.4.21 parser
// and writes the PSI dump the Kotlin parsing tests compare against, plus one
// JSONL index line per file.
//
// Run as a single-file source program on the jars of tools/psi-oracle/lib:
//
//   java -Xss512m -cp 'tools/psi-oracle/lib/*' tools/psi-oracle/PsiOracle.java \
//     --list files.txt --root DIR --out DUMP_DIR [--trim]
//
// The dump is DebugUtil.psiToString(file, showWhitespaces=true, showRanges=false),
// trimmed, exactly as AbstractPsiParsingTest prints it. --trim also trims the
// source text before parsing, as the test does; without it offsets refer to the
// file's own bytes. A .kts name is parsed as a script, as in the IDE.
//
// Index fields: path (relative to --root), dump (relative to --out), psiErrors,
// firstError {offset, line, column, message} or null, crlf, failure (on a crash).
//
// --serve keeps one JVM for many batches: each stdin line "LIST<TAB>ROOT<TAB>OUT"
// is parsed like a --list run, then "done" is printed on stdout.

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

import org.jetbrains.kotlin.cli.CompilerConfigurationCreationKt;
import org.jetbrains.kotlin.cli.common.messages.MessageCollector;
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles;
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment;
import org.jetbrains.kotlin.com.intellij.openapi.Disposable;
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiErrorElement;
import org.jetbrains.kotlin.com.intellij.psi.impl.DebugUtil;
import org.jetbrains.kotlin.config.CompilerConfiguration;
import org.jetbrains.kotlin.psi.KtFile;
import org.jetbrains.kotlin.psi.KtPsiFactory;

public class PsiOracle {
  public static void main(String[] args) throws Exception {
    Path list = null;
    Path root = Path.of(".");
    Path out = null;
    boolean trim = false;
    boolean serve = false;
    for (int i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--serve" -> serve = true;
        case "--list" -> list = Path.of(args[++i]);
        case "--root" -> root = Path.of(args[++i]);
        case "--out" -> out = Path.of(args[++i]);
        case "--trim" -> trim = true;
        default -> throw new IllegalArgumentException("unknown argument " + args[i]);
      }
    }
    if (!serve && (list == null || out == null)) {
      System.err.println("usage: PsiOracle (--list FILE --out DIR [--root DIR] | --serve) [--trim]");
      System.exit(2);
    }
    Path listFile = list;
    Path rootDir = root;
    Path outDir = out;
    boolean trimText = trim;
    boolean serveMode = serve;
    Throwable[] failure = new Throwable[1];
    // PSI printing and the parser recurse on nesting depth; give them a deep stack.
    Thread worker = new Thread(null, () -> {
      try {
        Disposable disposable = Disposer.newDisposable();
        try {
          KtPsiFactory factory = createFactory(disposable);
          if (!serveMode) {
            run(factory, readList(listFile), rootDir, outDir, trimText);
            return;
          }
          BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
          for (String request; (request = input.readLine()) != null; ) {
            if (request.isBlank()) continue;
            String[] parts = request.split("\t");
            run(factory, readList(Path.of(parts[0])), Path.of(parts[1]), Path.of(parts[2]), trimText);
            System.out.println("done");
            System.out.flush();
          }
        } finally {
          Disposer.dispose(disposable);
        }
      } catch (Throwable t) {
        failure[0] = t;
      }
    }, "psi-oracle", 1L << 30);
    worker.start();
    worker.join();
    if (failure[0] != null) {
      failure[0].printStackTrace();
      System.exit(1);
    }
    System.exit(0);
  }

  private static List<String> readList(Path list) throws IOException {
    List<String> paths = new ArrayList<>();
    for (String line : Files.readAllLines(list, StandardCharsets.UTF_8)) {
      if (!line.isBlank()) paths.add(line);
    }
    return paths;
  }

  private static KtPsiFactory createFactory(Disposable disposable) {
    CompilerConfiguration configuration = CompilerConfigurationCreationKt.create(
      CompilerConfiguration.Companion, null, MessageCollector.Companion.getNONE());
    KotlinCoreEnvironment environment = KotlinCoreEnvironment.createForProduction(
      disposable, configuration, EnvironmentConfigFiles.JVM_CONFIG_FILES);
    return new KtPsiFactory(environment.getProject(), false);
  }

  private static void run(KtPsiFactory factory, List<String> paths, Path root, Path out, boolean trim) throws IOException {
    Files.createDirectories(out);
    try (BufferedWriter index = Files.newBufferedWriter(out.resolve("index.jsonl"), StandardCharsets.UTF_8)) {
      for (String entry : paths) {
        Path source = root.resolve(entry);
        String relative = root.toAbsolutePath().normalize().relativize(source.toAbsolutePath().normalize()).toString();
        String dumpName = relative + ".psi.txt";
        StringBuilder line = new StringBuilder("{\"path\":").append(json(relative))
          .append(",\"dump\":").append(json(dumpName));
        try {
          String text = Files.readString(source, StandardCharsets.UTF_8);
          // kotlinc converts line separators when it loads a file, so its lexer, which reads a raw
          // '\r' as BAD_CHARACTER, never sees one: `'a<CR>b'` is "incorrect character literal 'a".
          boolean crlf = text.indexOf('\r') >= 0;
          if (crlf) text = text.replace("\r\n", "\n").replace('\r', '\n');
          if (trim) text = text.strip();
          KtFile file = factory.createFile(source.getFileName().toString(), text);
          String dump = DebugUtil.psiToString(file, true, false).trim();
          Path dumpPath = out.resolve(dumpName);
          Files.createDirectories(dumpPath.getParent());
          Files.writeString(dumpPath, dump, StandardCharsets.UTF_8);

          int errors = 0;
          PsiErrorElement first = null;
          ArrayDeque<PsiElement> stack = new ArrayDeque<>();
          stack.push(file);
          while (!stack.isEmpty()) {
            PsiElement element = stack.pop();
            if (element instanceof PsiErrorElement error) {
              errors++;
              if (first == null || error.getTextOffset() < first.getTextOffset()) first = error;
            }
            for (PsiElement child = element.getLastChild(); child != null; child = child.getPrevSibling()) {
              stack.push(child);
            }
          }
          line.append(",\"psiErrors\":").append(errors).append(",\"crlf\":").append(crlf).append(",\"firstError\":");
          if (first == null) {
            line.append("null");
          } else {
            int offset = first.getTextOffset();
            int lineNo = 1;
            int column = 1;
            for (int i = 0; i < offset && i < text.length(); i++) {
              if (text.charAt(i) == '\n') { lineNo++; column = 1; } else { column++; }
            }
            line.append("{\"offset\":").append(offset).append(",\"line\":").append(lineNo)
              .append(",\"column\":").append(column)
              .append(",\"message\":").append(json(first.getErrorDescription())).append('}');
          }
        } catch (Throwable t) {
          line.append(",\"failure\":").append(json(t.toString()));
        }
        index.write(line.append('}').toString());
        index.newLine();
      }
    }
  }

  private static String json(String value) {
    StringBuilder builder = new StringBuilder("\"");
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      switch (c) {
        case '"' -> builder.append("\\\"");
        case '\\' -> builder.append("\\\\");
        case '\n' -> builder.append("\\n");
        case '\r' -> builder.append("\\r");
        case '\t' -> builder.append("\\t");
        default -> {
          if (c < 0x20) builder.append(String.format("\\u%04x", (int) c));
          else builder.append(c);
        }
      }
    }
    return builder.append('"').toString();
  }
}
