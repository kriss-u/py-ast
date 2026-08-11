# CLAUDE.md

Instructions for AI agents (Claude Code and others) working in this repository.

## What this project is

`py-ast` is a TypeScript library for lexing, parsing, walking, and unparsing Python Abstract
Syntax Trees. The public surface mirrors CPython's `ast` module (see `ASDL` at the repo root
for the grammar it's derived from). Source lives in `src/`; build output goes to `dist/`
(ESM + CJS + `.d.ts`) via Rollup.

## Ground rules

1. **Document every symbol.** Every exported function, class, interface, type alias, and enum
   must have a JSDoc block: a one-line summary, `@param` for each parameter, `@returns` when
   the function returns a value, and `@throws` if it can throw. Non-exported/internal symbols
   should still get a docstring if their purpose isn't obvious from the name and signature.
   Prefer documenting *why*/*behavior* (edge cases, invariants) over restating the type.

2. **Lint and type-check must pass before you're done.** Run `npm run lint` (Biome) and
   `npm run type-check` (tsc `--noEmit`, `strict: true`). Run `npm run format` if Biome
   formatting complains. Do not disable rules to make errors disappear — fix the underlying
   issue. If a lint suppression is truly required, it needs an inline reason (Biome's
   `// biome-ignore lint/<rule>: <reason>` form) and should be rare.

3. **No `any`.** This codebase runs under `strict` TypeScript. Don't introduce `any` — use
   generics, discriminated unions, `unknown` with narrowing, or proper types instead. If you
   find yourself reaching for `any`, it usually means the type needs a generic parameter or a
   union needs another member. Existing `any` usages tied to `biome-ignore` comments (e.g. AST
   `Constant.value`) are legacy exceptions, not a pattern to extend.

4. **Keep it modular.** Respect the existing file boundaries: `types.ts` (AST node interfaces),
   `lexer.ts` (tokenizer), `parser.ts` (recursive-descent parser), `visitor.ts` (tree walking),
   `unparser.ts` (AST → source), `utils.ts` (shared helpers), `index.ts` (public exports). New
   functionality should live in the module it logically belongs to, or a new module if none
   fits — don't bolt unrelated concerns onto an existing file. Avoid one-off duplication of
   logic that already exists elsewhere in the codebase.

5. **No breaking changes unless explicitly instructed.** Don't change public exports, function
   signatures, or emitted AST shapes without being asked to. If a change is unavoidably
   breaking, call it out explicitly before making it.

6. **Commit messages follow Conventional Commits** (enforced by commitlint +
   `@commitlint/config-conventional`, checked by Husky). Use `type(scope): subject`, e.g.
   `fix(parser): handle trailing comma in match patterns` or
   `feat(unparser): support PEP 695 type params`. Common types: `feat`, `fix`, `chore`, `docs`,
   `refactor`, `test`, `perf`, `build`, `ci`. This project uses semantic-release, so commit
   type directly affects versioning — don't use `feat`/`fix` for changes that aren't.

7. **Must work everywhere Node does.** No platform-specific APIs, no reliance on a particular
   OS's path separators, filesystem case-sensitivity, or shell. The library must work
   identically under ESM and CJS consumption (see the dual build in `rollup.config.js` and
   `exports` in `package.json`). Avoid Node-only built-ins unless the library is meant to run
   only in Node — check existing usage before adding new runtime dependencies.

8. **Tests must be full-coverage and non-flaky.** New or changed behavior needs tests that
   cover the happy path plus edge cases (empty input, malformed syntax, boundary values) —
   don't leave branches untested. Tests must be deterministic: no reliance on timing, execution
   order, external network access, or unseeded randomness. A test that fails intermittently is
   a bug — fix the root cause, don't retry or skip it, don't mark it as skipped/todo to make CI
   green.

9. **Verify parser/unparser behavior against CPython, not intuition.** When implementing or
   fixing grammar (new syntax, precedence, edge cases), check actual CPython behavior — e.g.
   `python3 -c "import ast; print(ast.dump(ast.parse(...)))"` — rather than guessing. This
   includes precedence subtleties that aren't obvious from a quick reading of the grammar
   (e.g. `**expr` in a dict display binds at `bitor` precedence, so `{**a if b else c}` is a
   syntax error in CPython even though `{**(a if b else c)}` is fine — the same `**` in a call's
   keyword arguments binds at full `expression`/`test` precedence instead, so the two aren't
   interchangeable). Match CPython's emitted AST shape exactly (field names, `null` vs
   omitted, node types) since the public surface mirrors `ast`.

## Before considering a task done

- `npm run lint` passes
- `npm run type-check` passes
- `npm test` passes (Vitest), with full coverage of the change and zero flaky tests
- New/changed public API surface has JSDoc
- `npm run build` succeeds if the change touches anything Rollup bundles
