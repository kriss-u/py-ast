# Corpus differential testing

Parses real-world Python files with both CPython's `ast` module and py-ast,
then diffs the two trees to find where py-ast's parser diverges from
CPython. This is exploratory/diagnostic tooling, not part of `npm test` — it
depends on the local Python environment and a large, machine-specific
corpus, so it isn't reproducible in CI.

## Usage

```sh
npm run build   # py-ast is imported from dist/, not src/
npm run corpus  # or: node scripts/corpus/run.mjs [options] [dir ...]
```

Options:

- `--limit N` — only process the first N files found.
- `--max-diffs N` — cap diffs recorded per file (default 5).
- `--report PATH` — where to write the full JSON report (default
  `scripts/corpus/report.json`).
- `--stdlib-only` — skip third-party packages, use only the CPython stdlib.
- `--quiet` — print only the summary, not per-file diffs.

With no directories given, the corpus is the local CPython stdlib
(`sysconfig.get_path('stdlib')`) plus whichever of a curated list of popular
packages (requests, jinja2, pydantic, flask, numpy, click, urllib3, ...) are
importable in the active `python3`. This needs no network access and scales
with whatever's already installed in the environment running the script —
`pip install` more packages beforehand to widen the corpus. You can also
pass explicit directories: `node scripts/corpus/run.mjs path/to/some/repo`.

## How it works

- `dump_ast.py` is a single long-lived Python process (not spawned per
  file): it reads file paths from stdin and writes one JSON-encoded AST dump
  per line to stdout, in order. This keeps interpreter startup cost off the
  critical path for a corpus of thousands of files.
- `run.mjs` collects `.py` files from the corpus directories, streams them
  through `dump_ast.py`, and parses each one in-process with py-ast (from
  `dist/index.esm.js`).
- `compare.mjs` normalizes both trees and does a structural diff. See the
  comments there for the (small, deliberate) set of representational
  differences that are normalized away rather than reported — e.g. py-ast
  PascalCases node types CPython calls lowercase (`alias` → `Alias`), and
  `Comment`/`inlineComment`/`quote_style` are py-ast extensions with no
  CPython equivalent.

## Known, expected gaps (not bugs)

A few divergences are inherent to py-ast's current design and will show up
repeatedly in reports until addressed:

- **Bytes literals** (`b"..."`) are stored as a JS string on `Constant.value`
  rather than a byte sequence — there's no way to fully round-trip arbitrary
  binary content through a JS string. The differ decodes this back via
  `quote_style` for comparison purposes only.
- **`\xNN`, `\uNNNN`, `\N{...}`, and octal escape sequences** in string
  literals aren't decoded by `parseString` (only `\n`, `\t`, `\r`, `\\`, and
  the quote char are) — every string containing one of these will report a
  value mismatch.
- **`int` vs `float`** can't be told apart from a bare JS `number`, so these
  are compared with loose numeric equality rather than requiring the
  CPython type tag to match.
- **`type_ignores`** has no py-ast field at all (there's no `# type:
  ignore` comment tracking), stripped from the CPython side before
  diffing.

Everything else the report surfaces — nodeType mismatches, wrong
lineno/col_offset, structurally different subtrees — is a real candidate
parser bug worth investigating against the corresponding CPython behavior,
per the verification rule in the repo's `CLAUDE.md`.
