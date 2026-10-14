# Differences from CPython's `ast`

py-ast's tree has the same shape as CPython's `ast` module: the same node
types, the same field names, and the same `lineno`/`col_offset`/`end_lineno`/
`end_col_offset` positions. Where something can't be represented directly in
JavaScript, py-ast uses a workaround, and those workarounds follow the same
conventions as the rest of the tree. This document lists every known
difference.

The corpus tests (`scripts/corpus/`, see its `README.md`) parse about 60,000
real-world files with both CPython and py-ast and compare the trees field by
field. Apart from what's listed here, the two must agree.

## Which syntax is accepted

py-ast accepts the **union** of the syntax of every Python version it
supports. Syntax added in a newer version (PEP 758's `except A, B:`, PEP 798's
`[*x for x in y]`, `case +1:`, `lazy import`) is accepted in all
code, and syntax a later version removes keeps parsing. There is no
per-version mode: `ParseOptions.feature_version` is reserved and currently
unused.

Valid code must always parse. Rejecting invalid code is best effort, see
[Leniency](#leniency).

## Representation differences

| Python | py-ast | Why |
| --- | --- | --- |
| `alias`, `arg`, `arguments`, `comprehension`, `keyword`, `match_case`, `withitem` | `Alias`, `Arg`, `Arguments`, `Comprehension`, `Keyword`, `MatchCase`, `WithItem` | Every `nodeType` is PascalCased for consistency. |
| `None` for an absent optional field | the field is `undefined` or left out | The usual JavaScript way to say "absent". |
| `Constant(value=Ellipsis)` | `value: "..."` with no `quote_style` | JavaScript has no Ellipsis singleton. A string `"..."` always has a `quote_style`, which is how the two are told apart. |
| `bytes` constant | a string (one char per byte) with a `b`-prefixed `quote_style` | JavaScript has no bytes type that survives JSON. |
| `int` vs `float` | both are `number` | JavaScript can't tell `1` and `1.0` apart. An int too large for a safe `number` becomes a `bigint`. |
| `complex` constant | a `PyComplex` instance | JavaScript has no complex type. |
| `\N{NAME}` escapes | left as the literal text `\N{NAME}` | Resolving them needs the Unicode name database, which isn't bundled. |
| `type_ignores` on `Module` | not present | `# type: ignore` comments aren't tracked. |
| `is_lazy=0` on an eager import (3.15+) | not present; only a `lazy` import has `is_lazy: 1` | |

`DictComp.value` is optional for the same reason as other absent fields: in a
PEP 798 unpacking comprehension (`{**d for d in ds}`) CPython records the
unpacked mapping as `key` and sets `value` to `None`.

## Extra fields

These are py-ast extensions with no CPython counterpart. Tools that compare
against CPython should ignore them.

- `quote_style` on string constants, `JoinedStr`, and `TemplateStr` records
  the original prefix and quotes (`rb'''`, `f"`) so `unparse` can reproduce them.
- `Comment` statement nodes and `inlineComment` exist when parsing with
  `{ comments: true }`.

## Source text

`parse` takes an already-decoded `string`. Decoding the source is the
caller's job: honouring a PEP 263 `# -*- coding: ... -*-` declaration and
stripping a leading BOM. CPython does both when given bytes. Line endings are
normalized (`\r\n` and `\r` become `\n`), as in CPython.

## `unparse`

`unparse` always produces source that parses back to the same tree, so in a
few places its output deliberately differs from CPython's `ast.unparse`:

- A literal `{` or `}` in a format spec is written `\x7b`/`\x7d`.
  `ast.unparse` writes `{{`, which is invalid there.
- A lone tuple with-item is written `with ((a, b)):`, so it isn't reparsed as
  two items.
- A `u`-prefixed literal concatenated with an f-string (`u"a" f"{b}"`) keeps
  its prefix, so the literal's `kind="u"` survives.
- `**` in a dict comprehension parenthesizes an operand that needs it
  (`{**(a if b else c) for ...}`).

Like `ast.unparse`, it parenthesizes every walrus and every `yield` that isn't
a whole expression statement, and writes a t-string `Interpolation.str`
verbatim. A name that NFKC-normalizes to a keyword (`ｉｆ` becomes `if`) can't
be written back, and `ast.unparse` has the same limitation.

## Leniency

Some code that CPython rejects, py-ast accepts. Most of these errors come
from CPython's compiler rather than its grammar, so they're out of scope for
a parser. The others are grammar-level cases that could be tightened later.

Out of scope:

- an unknown `from __future__ import` feature, and `lazy from __future__ import`;
- encoding problems: a bad or unknown coding declaration, invalid UTF-8,
  or a null byte;
- unknown `\N{...}` character names (see above);
- a non-ASCII character in a bytes literal.

Grammar-level gaps:

- a `try` with no `except` or `finally`;
- a walrus used directly as an operand (`a + b := c`, `a < b := c`);
- an unparenthesized generator that isn't the only call argument
  (`f(x for x in y, z)`);
- a starred expression where none is allowed (`(*a)`, some call forms);
- concatenating bytes with non-bytes literals;
- a handful of `invalid syntax` cases such as `yield, x`.
