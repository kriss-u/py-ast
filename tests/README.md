# Test Suite

Tests for the `py-ast` parser, lexer, unparser, visitor, and public API. Organized by
**feature or layer** (what code path is under test), not by how "edge-case-y" a scenario
feels — that boundary is subjective and tends to cause the same behavior to be tested twice
under different labels.

## Test Files

- **`lexer.test.ts`** — Tokenizer: token kinds, numeric/string literal scanning, indentation
  tracking, f-string tokenization.
- **`expressions.test.ts`** — Basic expressions: literals, collections (list/tuple/set/dict),
  names, attribute access, subscripting, slices.
- **`operators.test.ts`** — Operator expressions: binary/unary/boolean operators, comparison
  chains, conditional (ternary) expressions, lambdas, the walrus operator.
- **`statements.test.ts`** — Basic statements: assignment (simple/multiple/unpacking),
  annotated and augmented assignment, `del`, `pass`/`break`/`continue`/`return`,
  `global`/`nonlocal`, `raise`/`assert`, expression statements.
- **`control-flow.test.ts`** — Control-flow constructs: `if`/`elif`/`else`, `while`/`for`
  (with `else` clauses, including `async for`), `with`/`async with`,
  `try`/`except`/`else`/`finally`, function and class definitions.
- **`function-calls.test.ts`** — Calls and call-adjacent expressions: positional/keyword/
  starred arguments, method chaining, comprehensions, f-strings, `await`/`yield`.
- **`imports-and-advanced.test.ts`** — Import statements (plain, aliased, `from`, relative)
  and other module-level modern syntax.
- **`match-statements.test.ts`** — `match` statements (Python 3.10+): patterns, guards,
  or-patterns, capture/wildcard patterns.
- **`type-parameters.test.ts`** — PEP 695 type parameters and `type` alias statements
  (Python 3.12+).
- **`error-handling.test.ts`** — Parser error paths: malformed syntax that must raise, and
  the shape of the resulting error.
- **`comments-and-quotes.test.ts`** — Comment attachment and string/quote edge cases (escape
  sequences, quote styles, docstrings).
- **`end-locations.test.ts`** — `end_lineno`/`end_col_offset` correctness across statement
  and expression node types.
- **`unparser.test.ts`** — `unparse()`: AST-to-source generation across statement and
  expression node types.
- **`unparser-internals.test.ts`** — Unparser internals not reachable via a simple
  parse-then-unparse round trip (e.g. hand-built nodes exercising specific formatting
  branches).
- **`utils.test.ts`** — `ast`-module-style utilities: `getDocstring`, `getSourceSegment`,
  `isASTNode`, `iterFields`/`iterChildNodes`.
- **`visitor.test.ts`** — Tree traversal: `walk`, `NodeVisitor`, `NodeTransformer`.
- **`index-api.test.ts`** — The full public API surface: `parsePython`/`parseModule`/
  `toSource`/`dump` (the convenience wrappers) and the underlying `parse`/`unparse`.
- **`integration.test.ts`** — Cross-feature integration: a comprehensive multi-construct
  syntax fixture, real-world code patterns, roundtrip compatibility across a broad sample of
  snippets, and version-specific feature checks.
- **`performance.test.ts`** — Parsing at scale: large files, deeply nested structures, and
  repeated-parse consistency. Assertions are structural/no-throw rather than wall-clock
  timing, since timing thresholds are inherently flaky under CI load.

### Test Utilities

- **`test-helpers.ts`** — Shared helpers: `parseCode()`, `parseStatement()`,
  `parseExpression()`, `testRoundtrip()`, `testUnparse()`, `testRoundtripValue()`,
  `firstStmtValue()`, `assertNodeType()`, `countNodeTypes()`, `collectComments()`.
- **`fixtures/`** — Reusable fixture data (e.g. `fixtures/comprehensive-source.ts`,
  `fixtures/imports.ts`), re-exported from `fixtures/index.ts`.

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Specific Test File

```bash
npm test expressions.test.ts
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

Coverage is enforced at 100% (statements/branches/functions/lines) via `vitest.config.ts`;
`npm run test:coverage` fails the build if any of them drop below that.

## Adding New Tests

1. Pick the file that matches the **feature or layer** you're testing, not how tricky the
   case feels — a hard edge case of an existing feature belongs in that feature's file, not
   in a separate "edge cases" file.
2. Prefer `test.each` over one-off `test()`/`it()` blocks whenever several cases share the
   same assertion shape (e.g. "N inputs all produce property X") — build a table instead of
   hand-writing a block per case. Reserve individual `test()` blocks for scenarios that
   genuinely need their own setup/assertions/narrative, such as a specific bug repro with a
   CPython-verified citation.
3. Use the helpers in `test-helpers.ts` (`parseCode`, `testRoundtrip`, `countNodeTypes`,
   etc.) instead of inline parse-and-assert boilerplate.
4. Put reusable fixture data in `tests/fixtures/` and export it from `fixtures/index.ts`,
   rather than duplicating large source strings across files.
5. Verify parser/unparser behavior against actual CPython output
   (`python3 -c "import ast; print(ast.dump(ast.parse(...)))"`) when implementing or fixing
   grammar, rather than guessing.
6. Keep coverage at 100% — every new branch needs a test that exercises it.
