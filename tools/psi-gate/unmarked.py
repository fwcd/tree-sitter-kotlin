# The tracked .kt/.kts files of a checkout that carry no IDE test markup (<caret>, <selection>,
# highlighting tags): Kotlin's parser reads such markup as code, so a verdict on it says nothing.
import re, subprocess, sys
root = sys.argv[1]
markup = re.compile(rb'<(?:/?caret\w*|/?before|/?after|/?change|rename\b[^>]*|/?selection|/?error|/?warning|/?weak_warning|/?info|/?lineMarker|/?EOLError|/?EOLWarning|/?spot|/?symbolName|/?fold|/?inlineHint|/?hint|/?ref|/?cursor|/?block|/?html|/?inject|/?rainbow|/?TYPO|/?text_attr|/?caretMarker)\b')
files = subprocess.run(['git', '-C', root, 'ls-files', '-z', '--', '*.kt', '*.kts'], capture_output=True, check=True).stdout.split(b'\0')
for f in files:
    if not f: continue
    try:
        data = open(root.encode() + b'/' + f, 'rb').read()
    except OSError:
        continue
    if not markup.search(data): print(f.decode())
