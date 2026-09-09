#!/usr/bin/env python3
"""Robustly extract every `python3 -c "..."` block from e2e-flow-test.sh and compile-check it."""
import io, re

path = "/home/z/my-project/scripts/e2e-flow-test.sh"
lines = io.open(path, encoding="utf-8").read().splitlines()

blocks = []
i = 0
while i < len(lines):
    m = re.search(r'python3 -c "$', lines[i])
    if m:
        buf = []
        j = i + 1
        while j < len(lines):
            line = lines[j]
            # closing quote: line ends with '"' optionally followed by ')' or ' 2>/dev/null)' etc.
            mm = re.search(r'"\s*(?:2>/dev/null)?\s*\)?\s*$', line)
            if mm and not line.endswith('\\'):
                code_line = line[:mm.start()]
                buf.append(code_line)
                blocks.append("\n".join(buf))
                break
            buf.append(line)
            j += 1
        i = j
    i += 1

bad = 0
for k, b in enumerate(blocks):
    try:
        compile(b, f"<block{k}>", "exec")
    except SyntaxError as e:
        bad += 1
        first = b.splitlines()[e.lineno - 1] if e.lineno and e.lineno <= len(b.splitlines()) else "?"
        print(f"SYNTAX ERROR block {k} line {e.lineno}: {e.msg} | {first[:80]!r}")
print(f"checked {len(blocks)} python blocks — broken: {bad}")
raise SystemExit(1 if bad else 0)
