# Contributing to py-ast

Thanks for your interest in improving `py-ast`. This document covers how to
set up the project, the standards your change needs to meet, and how to get
it merged.

By participating in this project, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Project overview

`py-ast` is a TypeScript library for lexing, parsing, walking, and
unparsing Python Abstract Syntax Trees. The public surface mirrors CPython's
`ast` module (see the `ASDL` file at the repo root for the grammar it's
derived from).

Source lives in `src/`:

- `types.ts` — AST node interfaces
- `lexer.ts` — tokenizer
- `parser.ts` — recursive-descent parser
- `visitor.ts` — tree walking
- `unparser.ts` — AST → source
- `utils.ts` — shared helpers
- `index.ts` — public exports

Build output goes to `dist/` (ESM + CJS + `.d.ts`) via Rollup. Respect these
file boundaries — new functionality should live in the module it logically
belongs to, or a new module if none fits.

## Getting started

```bash
git clone https://github.com/kriss-u/py-ast.git
cd py-ast
npm install
```

Useful scripts:

```bash
npm run dev         # rollup in watch mode
npm test            # run the Vitest suite
npm run test:watch  # watch mode
npm run lint         # Biome check
npm run lint:fix     # Biome check with autofix
npm run format        # Biome format
npm run type-check    # tsc --noEmit (strict)
npm run build          # type-check + rollup build
```

## Making a change

1. Fork the repo and create a branch off `main` for your change.
2. Write the change, keeping it scoped to the module it belongs to.
3. Document every exported function, class, interface, type alias, and enum
   with a JSDoc block: a one-line summary, `@param` for each parameter,
   `@returns` when the function returns a value, and `@throws` if it can
   throw. Prefer documenting *why*/*behavior* (edge cases, invariants) over
   restating the type. Give internal symbols a docstring too if their
   purpose isn't obvious from the name and signature.
4. Add or update tests covering the happy path and edge cases (empty input,
   malformed syntax, boundary values). Tests must be deterministic — no
   reliance on timing, execution order, external network access, or
   unseeded randomness.
5. Do not introduce `any`. This codebase runs under `strict` TypeScript —
   use generics, discriminated unions, or `unknown` with narrowing instead.
6. Do not change public exports, function signatures, or emitted AST shapes
   unless the issue/PR explicitly calls for a breaking change. If a change
   is unavoidably breaking, say so clearly in the PR description.
7. The library must work identically under ESM and CJS consumption, and
   across platforms Node supports — avoid OS-specific paths, filesystem
   assumptions, or Node-only built-ins beyond what's already in use.

## Before opening a pull request

Make sure all of the following pass locally:

```bash
npm run lint
npm run type-check
npm test
npm run build   # if your change touches anything Rollup bundles
```

Do not disable lint rules to silence errors — fix the underlying issue. If a
suppression is truly required, use Biome's
`// biome-ignore lint/<rule>: <reason>` form with an inline reason, and keep
it rare.

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/)
and uses semantic-release, so your commit type directly affects versioning.
Commits are linted by commitlint via Husky.

Format: `type(scope): subject`

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`,
`build`, `ci`.

Examples:

```
fix(parser): handle trailing comma in match patterns
feat(unparser): support PEP 695 type params
docs: clarify visitor usage in README
```

Only use `feat`/`fix` for changes that actually add a feature or fix a bug —
other changes should use the appropriate type so releases stay accurate.

## Opening a pull request

- Keep PRs focused on a single change; unrelated cleanup should be a
  separate PR.
- Describe what changed and why, and call out any breaking changes
  explicitly.
- Link any related issue.
- Ensure CI is green before requesting review.

## Reporting bugs and requesting features

Please use [GitHub Issues](https://github.com/kriss-u/py-ast/issues). For
bug reports, include a minimal reproduction (the Python source you were
parsing/unparsing and the output you got vs. expected).

## Questions

If anything here is unclear, open an issue or start a discussion on the
repository — that helps make this guide better for the next contributor too.
