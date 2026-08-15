# Corpus differential testing

Two tools that run real-world Python files through py-ast and check the
result against a source of truth. Both are exploratory/diagnostic tooling,
not part of `npm test` — they depend on the local Python environment and a
large, machine-specific corpus, so they aren't reproducible in CI.

- **`run.mjs`** — parses each file with both CPython's `ast` module and
  py-ast, and diffs the two trees. Finds parser bugs directly.
- **`roundtrip.mjs`** — parses each file with py-ast, unparses the result,
  re-parses that output, and diffs the two py-ast trees against each other
  (ignoring position/cosmetic fields). Finds unparser bugs: a mismatch means
  `unparse(parse(src))` produced source that doesn't mean the same thing as
  the original. Exercises `visitor.ts` incidentally too (both `parse` and
  `unparse` walk the whole tree), though a visitor-only bug wouldn't
  generally show up here unless it broke traversal outright.

## Usage

```sh
npm run build             # py-ast is imported from dist/, not src/
npm run corpus            # or: node scripts/corpus/run.mjs [options] [dir ...]
npm run corpus:roundtrip  # or: node scripts/corpus/roundtrip.mjs [options] [dir ...]
```

Options (both tools):

- `--limit N` — only process the first N files found.
- `--max-diffs N` — cap diffs recorded per file (default 5).
- `--report PATH` — where to write the full JSON report (default
  `scripts/corpus/report.json` / `roundtrip-report.json`).
- `--stdlib-only` — skip third-party packages, use only the CPython stdlib.
- `--quiet` — print only the summary, not per-file diffs.

With no directories given, the corpus is the local CPython stdlib
(`sysconfig.get_path('stdlib')`) plus whichever of a curated list of popular
packages (requests, jinja2, pydantic, flask, numpy, click, urllib3, ...) are
importable in the active `python3`. This needs no network access and scales
with whatever's already installed in the environment running the script —
`pip install` more packages beforehand to widen the corpus (conda
environments in particular tend to pull in far more than the curated list
via shared package caches, which is a free bonus, not a bug in the tool).
You can also pass explicit directories: `node scripts/corpus/run.mjs
path/to/some/repo`.

## How it works

- `dump_ast.py` is a single long-lived Python process (not spawned per
  file): it reads file paths from stdin and writes one JSON-encoded AST dump
  per line to stdout, in order. This keeps interpreter startup cost off the
  critical path for a corpus of thousands of files.
- `discover.mjs` has the corpus/file-discovery logic shared by both tools.
- `run.mjs` collects `.py` files from the corpus directories, streams them
  through `dump_ast.py`, and parses each one in-process with py-ast (from
  `dist/index.esm.js`).
- `roundtrip.mjs` collects the same files, and for each one calls
  `parse` → `unparse` → `parse` in-process, comparing the first and third
  results.
- `compare.mjs` has the normalization and structural-diff logic for both
  tools (`diffTrees` for run.mjs's CPython-vs-py-ast comparison,
  `diffRoundtrip` for roundtrip.mjs's py-ast-vs-py-ast comparison). See the
  comments there for the (small, deliberate) set of representational
  differences normalized away rather than reported — e.g. py-ast PascalCases
  node types CPython calls lowercase (`alias` → `Alias`), and
  `Comment`/`inlineComment`/`quote_style` are py-ast extensions with no
  CPython equivalent.

## Known, expected gaps (not bugs)

A few divergences are inherent to the current design and will show up
repeatedly in reports until addressed:

- **Bytes literals** (`b"..."`) are stored as a JS string on `Constant.value`
  rather than a byte sequence — there's no way to fully round-trip arbitrary
  binary content through a JS string. `run.mjs`'s differ decodes this back
  via `quote_style` for comparison purposes only.
- **`int` vs `float`** can't be told apart from a bare JS `number`, so
  `run.mjs` compares them with loose numeric equality rather than requiring
  the CPython type tag to match.
- **`\N{...}` named Unicode escapes** aren't resolved to the character they
  name (e.g. `\N{DEGREE SIGN}` stays as that literal text rather than
  becoming `°`) — this library doesn't carry a Unicode name database.
  Round-trips fine (the literal text is stable), but won't match CPython's
  resolved value in `run.mjs`.
- **`type_ignores`** has no py-ast field at all (there's no `# type:
  ignore` comment tracking), stripped from the CPython side before
  `run.mjs` diffs.
- **Associative-operator regrouping** (`roundtrip.mjs` only): an explicitly
  parenthesized, redundant grouping of an associative chain — e.g.
  `a and (b and c)`, semantically identical to `a and b and c` — unparses
  without the (unnecessary) parens, which is correct but changes the AST's
  *shape* (a flat 3-value `BoolOp` instead of nested 2-value ones) even
  though the two are behaviorally identical in every case, including
  short-circuit evaluation order. `diffRoundtrip` reports this as a
  mismatch; it isn't one. Numeric associative `BinOp` chains (e.g. `a + (b +
  c)`) can show the same pattern.

Everything else either tool surfaces — nodeType mismatches, wrong
lineno/col_offset, structurally different subtrees, a `roundtrip.mjs`
mismatch that isn't just associative regrouping — is a real candidate bug
worth investigating against the corresponding CPython behavior, per the
verification rule in the repo's `CLAUDE.md`.
