import { describe, expect, test } from "vitest";
import { parse, unparse } from "../src/index.js";
import type { ASTNodeUnion, ExprNode, JoinedStr } from "../src/types.js";
import {
	parseExpression,
	testRoundtrip,
	testRoundtripValue,
	testUnparse,
} from "./test-helpers.js";

describe("Unparser", () => {
	describe("Indentation detection", () => {
		test("detects tab indentation from a single-space-indented block", () => {
			const ast = parse("if x:\n a = 1\n");
			expect(unparse(ast)).toBe("if x:\n\ta = 1");
		});

		test("detects tab indentation from an actual tab-indented block", () => {
			const ast = parse("if x:\n\ta = 1\n");
			expect(unparse(ast)).toBe("if x:\n\ta = 1");
		});

		test("detects multi-space indentation", () => {
			const ast = parse("if x:\n      a = 1\n");
			expect(unparse(ast)).toBe("if x:\n      a = 1");
		});
	});

	describe("Basic Statements", () => {
		test("assignment statements", () => {
			testUnparse("x = 42", "x = 42");
			testUnparse("x = y = 42", "x = y = 42");
			testUnparse("x, y = 1, 2", "(x, y) = (1, 2)"); // Tuples get parentheses
			testRoundtrip("x = 42");
			testRoundtrip("x, y = a, b");
		});

		test.each([
			["+=", "x += 5", "x += 5"],
			["-=", "x -= 5", "x -= 5"],
			["*=", "x *= 5", "x *= 5"],
			["/=", "x /= 5", "x /= 5"],
			["//=", "x //= 5", "x //= 5"],
			["%=", "x %= 5", "x %= 5"],
			["**=", "x **= 5", "x **= 5"],
			["&=", "x &= 5", "x &= 5"],
			["|=", "x |= 5", "x |= 5"],
			["^=", "x ^= 5", "x ^= 5"],
			["<<=", "x <<= 5", "x <<= 5"],
			[">>=", "x >>= 5", "x >>= 5"],
			["@=", "x @= y", "x @= y"],
		])("augmented assignment: %s", (_op, code, expected) => {
			testUnparse(code, expected);
		});
		test("augmented assignment round-trips", () => {
			testRoundtrip("x += 42");
		});

		test("annotated assignment", () => {
			testUnparse("x: int = 42", "x: int = 42");
			testUnparse("x: str", "x: str");
			testRoundtrip("x: int = 42");
		});

		test("delete statement", () => {
			testUnparse("del x", "del x");
			testUnparse("del x, y", "del x, y");
			testRoundtrip("del x");
		});

		test("pass, break, continue", () => {
			testUnparse("pass", "pass");
			testUnparse("break", "break");
			testUnparse("continue", "continue");
			testRoundtrip("pass");
		});

		test("return statement", () => {
			testUnparse("return", "return");
			testUnparse("return 42", "return 42");
			testUnparse("return x, y", "return (x, y)"); // Tuples get parentheses
			testRoundtrip("return 42");
		});

		test("expression statement", () => {
			testUnparse("x", "x");
			testUnparse("42", "42");
			testUnparse("func()", "func()");
			testRoundtrip("func()");
		});
	});

	describe("Import Statements", () => {
		test("simple imports", () => {
			testUnparse("import os", "import os");
			testUnparse("import sys, os", "import sys, os");
			testRoundtrip("import os");
		});

		test("import with alias", () => {
			testUnparse("import numpy as np", "import numpy as np");
			testUnparse(
				"import os as operating_system",
				"import os as operating_system",
			);
			testRoundtrip("import numpy as np");
		});

		test("from imports", () => {
			testUnparse("from os import path", "from os import path");
			testUnparse("from os import path, getcwd", "from os import path, getcwd");
			testUnparse("from os import path as p", "from os import path as p");
			testRoundtrip("from os import path");
		});

		test("relative imports", () => {
			testUnparse("from . import module", "from . import module");
			testUnparse("from .. import module", "from .. import module");
			testUnparse(
				"from ...package import module",
				"from ...package import module",
			);
			testRoundtrip("from . import module");
		});

		test("lazy imports (PEP 810, Python 3.15+)", () => {
			testUnparse("lazy import os", "lazy import os");
			testUnparse("lazy from os import path", "lazy from os import path");
			testRoundtrip("lazy import os");
			testRoundtrip("lazy from os import path, getcwd");
		});
	});

	describe("Control Flow", () => {
		test("if statements", () => {
			testUnparse("if x:\n    pass", "if x:\n    pass");
			testUnparse(
				"if x:\n    y = 1\nelse:\n    y = 2",
				"if x:\n    y = 1\nelse:\n    y = 2",
			);
			testRoundtrip("if x > 0:\n    print('positive')");
		});

		test("elif statements", () => {
			const code =
				"if x > 0:\n    print('positive')\nelif x < 0:\n    print('negative')\nelse:\n    print('zero')";
			testRoundtrip(code);
		});

		test("a second elif collapses into a nested else/if rather than staying a sibling elif", () => {
			// The unparser doesn't reconstruct Python's `elif` keyword beyond the
			// first level — `If.orelse` is just another statement list, so a
			// second `elif` unparses as an `else:` containing a nested `if`,
			// semantically identical but syntactically different source.
			const code =
				"if a:\n    x = 1\nelif b:\n    y = 2\nelif c:\n    z = 3\nelse:\n    w = 4";
			const expected =
				"if a:\n    x = 1\nelif b:\n    y = 2\nelse:\n    if c:\n        z = 3\n    else:\n        w = 4";
			testUnparse(code, expected);
		});

		test("a lone elif with no trailing else round-trips unchanged", () => {
			const code = "if a:\n    x = 1\nelif b:\n    y = 2";
			testUnparse(code, code);
		});

		test("while loops", () => {
			testUnparse("while True:\n    pass", "while True:\n    pass");
			testUnparse(
				"while x > 0:\n    x -= 1\nelse:\n    print('done')",
				"while x > 0:\n    x -= 1\nelse:\n    print('done')",
			);
			testRoundtrip("while x > 0:\n    x -= 1");
		});

		test("for loops", () => {
			testUnparse(
				"for i in range(10):\n    print(i)",
				"for i in range(10):\n    print(i)",
			);
			testUnparse(
				"for i in items:\n    process(i)\nelse:\n    print('done')",
				"for i in items:\n    process(i)\nelse:\n    print('done')",
			);
			testRoundtrip("for item in items:\n    print(item)");
		});

		test("async for loops", () => {
			testUnparse(
				"async for item in items:\n    await process(item)",
				"async for item in items:\n    await process(item)",
			);
			testRoundtrip("async for item in items:\n    await process(item)");
		});

		test("async for loop with an else clause", () => {
			const code =
				"async def f():\n    async for i in gen():\n        pass\n    else:\n        pass";
			testUnparse(code, code);
			testRoundtrip(code);
		});
	});

	describe("Function and Class Definitions", () => {
		test("simple function", () => {
			testUnparse("def func():\n    pass", "def func():\n    pass");
			testUnparse(
				"def greet(name):\n    return f'Hello, {name}'",
				"def greet(name):\n    return f'Hello, {name}'",
			);
			testRoundtrip("def func():\n    return 42");
		});

		test("function with arguments", () => {
			testUnparse(
				"def func(a, b=1, *args, **kwargs):\n    pass",
				"def func(a, b=1, *args, **kwargs):\n    pass",
			);
			testRoundtrip("def func(x, y=42):\n    return x + y");
		});

		test("function with annotations", () => {
			testUnparse(
				"def func(x: int) -> str:\n    return str(x)",
				"def func(x: int) -> str:\n    return str(x)",
			);
			testRoundtrip("def func(x: int) -> str:\n    return str(x)");
		});

		test("async function", () => {
			testUnparse(
				"async def func():\n    await something()",
				"async def func():\n    await something()",
			);
			testRoundtrip("async def func():\n    return await value");
		});

		test("class definition", () => {
			testUnparse("class MyClass:\n    pass", "class MyClass:\n    pass");
			testUnparse(
				"class Child(Parent):\n    pass",
				"class Child(Parent):\n    pass",
			);
			testRoundtrip("class MyClass:\n    def __init__(self):\n        pass");
		});

		test("class with multiple inheritance", () => {
			testUnparse(
				"class Child(Parent1, Parent2):\n    pass",
				"class Child(Parent1, Parent2):\n    pass",
			);
			testRoundtrip("class Child(Parent1, Parent2):\n    pass");
		});

		test.each([
			["function with multiple decorators", "@a\n@b.c\ndef f():\n    pass"],
			["class with multiple decorators", "@deco1\n@deco2\nclass C:\n    pass"],
			[
				"class with bases and keywords together",
				"class C(A, B, metaclass=Meta):\n    pass",
			],
			[
				"class with only keywords, no bases",
				"class C(metaclass=Meta):\n    pass",
			],
			[
				"function with a bound TypeVar type param (PEP 695)",
				"def f[T: int](x: T) -> T:\n    return x",
			],
			[
				"function with a TypeVar default (PEP 696)",
				"def f[T = int](x: T):\n    pass",
			],
			["function with a ParamSpec default", "def f[**P = int](x):\n    pass"],
			[
				"function with a TypeVarTuple default",
				"def f[*Ts = int](x):\n    pass",
			],
			[
				"class with TypeVar, TypeVarTuple and ParamSpec type params",
				"class Foo[T: int, *Ts, **P]:\n    pass",
			],
			["type alias with type params", "type Alias[T] = list[T]"],
			["type alias with no type params", "type Alias = int"],
			[
				"bare keyword-only separator with no positional args",
				"def f(*, a):\n    pass",
			],
			[
				"bare keyword-only separator with multiple params and defaults",
				"def f(*, a, b=1):\n    pass",
			],
			[
				"positional-only params with defaults",
				"def f(a=1, b=2, /, c=3):\n    pass",
			],
			[
				"keyword-only param without a default among defaulted ones",
				"def f(*, a=1, b):\n    pass",
			],
			[
				"keyword-only separator combined with a preceding positional param",
				"def f(x, *, a):\n    pass",
			],
			[
				"vararg and kwarg with no keyword-only params",
				"def f(*args, **kwargs):\n    pass",
			],
			[
				"keyword-only params combined with kwarg, no positional or vararg",
				"def f(*, a, **kwargs):\n    pass",
			],
			[
				"vararg combined with keyword-only params",
				"def f(*args, a):\n    pass",
			],
			[
				"kwarg with no positional, vararg or keyword-only params",
				"def f(**kwargs):\n    pass",
			],
			[
				"async function with return annotation",
				"async def f() -> int:\n    return 1",
			],
		])("%s renders unchanged", (_name, code) => {
			testUnparse(code, code);
			testRoundtrip(code);
		});
	});

	describe("Exception Handling", () => {
		test("try-except", () => {
			testUnparse(
				"try:\n    risky()\nexcept:\n    pass",
				"try:\n    risky()\nexcept:\n    pass",
			);
			testRoundtrip(
				"try:\n    risky()\nexcept ValueError:\n    handle_error()",
			);
		});

		test("try-except with specific exception", () => {
			testUnparse(
				"try:\n    risky()\nexcept ValueError as e:\n    print(e)",
				"try:\n    risky()\nexcept ValueError as e:\n    print(e)",
			);
			testRoundtrip(
				"try:\n    risky()\nexcept (ValueError, TypeError):\n    pass",
			);
		});

		test("try-except-else-finally", () => {
			const code =
				"try:\n    risky()\nexcept ValueError:\n    handle_error()\nelse:\n    success()\nfinally:\n    cleanup()";
			testRoundtrip(code);
		});

		test("raise statement", () => {
			testUnparse("raise ValueError()", "raise ValueError()");
			testUnparse("raise ValueError('message')", "raise ValueError('message')");
			testUnparse("raise", "raise");
			testRoundtrip("raise ValueError('error')");
		});

		test("raise from", () => {
			testUnparse("raise ValueError() from e", "raise ValueError() from e");
			testRoundtrip("raise ValueError() from original_error");
		});

		test("assert statement", () => {
			testUnparse("assert x > 0", "assert x > 0");
			testUnparse(
				"assert x > 0, 'x must be positive'",
				"assert x > 0, 'x must be positive'",
			);
			testRoundtrip("assert condition, 'message'");
		});

		test("full except* statement with type, name, orelse and finally", () => {
			const code =
				"try:\n    risky()\nexcept* ValueError as e:\n    handle(e)\nelse:\n    ok()\nfinally:\n    done()";
			testUnparse(code, code);
			testRoundtrip(code);
		});

		test.each([
			[
				"except* with a type but no bound name",
				"try:\n    risky()\nexcept* ValueError:\n    handle()",
			],
			[
				"except* with no exception type",
				"try:\n    risky()\nexcept*:\n    handle()",
			],
		])("%s renders unchanged", (_name, code) => {
			testUnparse(code, code);
		});
	});

	describe("Context Managers", () => {
		test("with statement", () => {
			testUnparse(
				"with open('file') as f:\n    content = f.read()",
				"with open('file') as f:\n    content = f.read()",
			);
			testRoundtrip("with open('file.txt') as f:\n    data = f.read()");
		});

		test("multiple context managers", () => {
			testUnparse(
				"with open('in.txt') as f1, open('out.txt', 'w') as f2:\n    f2.write(f1.read())",
				"with open('in.txt') as f1, open('out.txt', 'w') as f2:\n    f2.write(f1.read())",
			);
			testRoundtrip("with a() as x, b() as y:\n    pass");
		});

		test("a with item with no 'as' clause renders bare", () => {
			testUnparse("with lock:\n    pass", "with lock:\n    pass");
		});

		test("async with", () => {
			testUnparse(
				"async with resource() as r:\n    await r.process()",
				"async with resource() as r:\n    await r.process()",
			);
			testRoundtrip("async with async_resource() as r:\n    await r.close()");
		});
	});

	describe("Global and Nonlocal", () => {
		test("global statement", () => {
			testUnparse("global x", "global x");
			testUnparse("global x, y, z", "global x, y, z");
			testRoundtrip("global counter");
		});

		test("nonlocal statement", () => {
			testUnparse("nonlocal x", "nonlocal x");
			testUnparse("nonlocal x, y", "nonlocal x, y");
			testRoundtrip("nonlocal variable");
		});
	});

	describe("Match statements", () => {
		test("basic match/case", () => {
			testUnparse(
				"match x:\n    case 1:\n        pass\n    case _:\n        pass",
				"match x:\n    case 1:\n        pass\n    case _:\n        pass",
			);
			testRoundtrip("match x:\n    case 1:\n        pass");
		});

		test("a guard clause round-trips with the pattern", () => {
			const code =
				"match command.split():\n    case [go, direction] if direction in dirs:\n        move(direction)";
			testUnparse(code, code);
			testRoundtrip(code);
		});

		test("singleton patterns (None/True/False) round-trip through MatchSingleton", () => {
			testUnparse(
				"match x:\n    case None:\n        pass",
				"match x:\n    case None:\n        pass",
			);
			testUnparse(
				"match x:\n    case True:\n        pass",
				"match x:\n    case True:\n        pass",
			);
			testUnparse(
				"match x:\n    case False:\n        pass",
				"match x:\n    case False:\n        pass",
			);
			testRoundtrip("match x:\n    case None:\n        pass");
		});

		test("or-pattern alternatives", () => {
			testUnparse(
				"match x:\n    case 1 | 2 | 3:\n        pass",
				"match x:\n    case 1 | 2 | 3:\n        pass",
			);
			testRoundtrip("match x:\n    case 1 | 2 | 3:\n        pass");
		});

		test("an as-pattern alternative inside an or-pattern keeps its parens", () => {
			// Verified against the pylint/extensions/code_style.py pattern
			// that surfaced this: CPython's grammar restricts each `|`
			// alternative to a `closed_pattern`, which excludes a bare
			// as-pattern — `X() as y | Z()` is a syntax error unparenthesized.
			testUnparse(
				"match x:\n    case (X() as y) | Z():\n        pass",
				"match x:\n    case (X() as y) | Z():\n        pass",
			);
			testRoundtrip("match x:\n    case (X() as y) | Z():\n        pass");
		});

		test("a plain capture pattern inside an or-pattern needs no parens", () => {
			testUnparse(
				"match x:\n    case 1 | y:\n        pass",
				"match x:\n    case 1 | y:\n        pass",
			);
		});

		test("as-pattern on the whole or-pattern (not an alternative)", () => {
			testUnparse(
				"match x:\n    case 1 | 2 as y:\n        pass",
				"match x:\n    case 1 | 2 as y:\n        pass",
			);
			testRoundtrip("match x:\n    case 1 | 2 as y:\n        pass");
		});

		test.each([
			[
				"sequence pattern with a star and trailing elements",
				"match p:\n    case [1, 2, *rest]:\n        pass",
			],
			["empty sequence pattern", "match p:\n    case []:\n        pass"],
			[
				"sequence pattern with a wildcard star",
				"match p:\n    case [1, *_]:\n        pass",
			],
			[
				"mapping pattern with a key and a rest capture",
				'match p:\n    case {"key": value, **rest}:\n        pass',
			],
			[
				"mapping pattern with only a rest capture",
				"match p:\n    case {**rest}:\n        pass",
			],
			["empty mapping pattern", "match p:\n    case {}:\n        pass"],
			[
				"mapping pattern with multiple key/value pairs",
				'match p:\n    case {"a": 1, "b": 2}:\n        pass',
			],
			[
				"class pattern with keyword sub-patterns",
				"match p:\n    case Point(x=0, y=0):\n        pass",
			],
			[
				"class pattern with positional and keyword sub-patterns",
				"match p:\n    case Point(1, 2, x=0):\n        pass",
			],
			[
				"class pattern with no sub-patterns",
				"match p:\n    case Point():\n        pass",
			],
			["capture pattern", "match p:\n    case x:\n        pass"],
			["wildcard pattern", "match p:\n    case _:\n        pass"],
		])("%s renders unchanged", (_name, code) => {
			testUnparse(code, code);
		});

		test("match star pattern without a bound name unparses as the '*_' wildcard", () => {
			// `case [*]:` (no name at all) isn't valid CPython syntax — this
			// parser is more permissive and accepts it as `MatchStar(name=
			// undefined)`, the same shape CPython gives `*_`. Since that's
			// exactly what `MatchStar(name=None)` means, unparsing it must
			// produce the one CPython form with that meaning: `*_`.
			testUnparse(
				"match p:\n    case [*]:\n        pass",
				"match p:\n    case [*_]:\n        pass",
			);
		});
	});

	describe("Expressions", () => {
		test.each([
			["+", "x + y", "x + y"],
			["-", "x - y", "x - y"],
			["*", "x * y", "x * y"],
			["/", "x / y", "x / y"],
			["//", "x // y", "x // y"],
			["%", "x % y", "x % y"],
			["**", "x ** y", "x ** y"],
			["@", "x @ y", "x @ y"],
			["&", "x & y", "x & y"],
			["|", "x | y", "x | y"],
			["^", "x ^ y", "x ^ y"],
			["<<", "x << y", "x << y"],
			[">>", "x >> y", "x >> y"],
		])("binary/bitwise operator: %s", (_op, code, expected) => {
			testUnparse(code, expected);
		});
		test("binary and bitwise operations round-trip", () => {
			testRoundtrip("a + b * c");
			testRoundtrip("a & b | c");
		});

		test("boolean operations", () => {
			testUnparse("x and y", "x and y");
			testUnparse("x or y", "x or y");
			testUnparse("not x", "not x"); // matches CPython's ast.unparse: no redundant parens
			testRoundtrip("a and b or c");
		});

		test("a nested BoolOp with the same operator keeps its parens", () => {
			// Matches CPython's own `ast.unparse`: `values` is a flat n-ary
			// list, so an explicitly-nested same-op `BoolOp` (from real
			// source parens) and a naturally-flat chain would otherwise
			// unparse identically — dropping the parens (as pure precedence
			// rules would allow, since same-precedence needs none in
			// general) loses that distinction on re-parse. A *different*
			// operator needs no such help: normal precedence disambiguates
			// `and` binding tighter than `or` either way.
			testUnparse("a and b and (c and d)", "a and b and (c and d)");
			testUnparse("(a and b) and c", "(a and b) and c");
			testUnparse("a or (b or c)", "a or (b or c)");
			testUnparse("(a and b) or c", "a and b or c");
			testUnparse("a and (b or c)", "a and (b or c)");
			testRoundtrip("a and b and (c and d)");
		});

		test.each([
			["==", "x == y", "x == y"],
			["!=", "x != y", "x != y"],
			["<", "x < y", "x < y"],
			["<=", "x <= y", "x <= y"],
			[">", "x > y", "x > y"],
			[">=", "x >= y", "x >= y"],
			["is", "x is y", "x is y"],
			["is not", "x is not y", "x is not y"],
			["in", "x in y", "x in y"],
			["not in", "x not in y", "x not in y"],
		])("comparison operator: %s", (_op, code, expected) => {
			testUnparse(code, expected);
		});
		test("comparison operations round-trip", () => {
			testRoundtrip("a < b < c");
		});

		test("unary operations", () => {
			testUnparse("+x", "+x");
			testUnparse("-x", "-x");
			testUnparse("~x", "~x");
			testUnparse("not x", "not x"); // matches CPython's ast.unparse: no redundant parens
			testRoundtrip("not condition");
		});

		test("symbolic unary operator as a binary operand", () => {
			// Matches CPython's ast.unparse for both: `-a` needs no parens as
			// a `+`'s left operand, but `**`'s right operand does (CPython's
			// unparser is conservative there even though `-3` alone would
			// parse the same without them).
			testUnparse("-a + b", "-a + b");
			testUnparse("2 ** -3", "2 ** (-3)");
		});

		test("conditional expression", () => {
			testUnparse("x if condition else y", "x if condition else y");
			testRoundtrip("'positive' if x > 0 else 'not positive'");
		});

		test("a nested ternary in the body or test slot keeps its parens", () => {
			// Verified against the IPython/core/completer.py pattern that
			// surfaced this: CPython's grammar restricts both slots to
			// `or_test` (one level tighter than the ternary itself), unlike
			// `orelse`, which is the recursive `test` and chains without
			// parens (`a if b else c if d else e`).
			testUnparse("(a if b else c) if d else e", "(a if b else c) if d else e");
			testUnparse("a if (b if c else d) else e", "a if (b if c else d) else e");
			testUnparse("a if b else c if d else e", "a if b else c if d else e");
			testRoundtrip("(a if b else c) if d else e");
		});

		test("a walrus in the test slot keeps its parens", () => {
			testUnparse("a if (y := 1) else z", "a if (y := 1) else z");
		});

		test("a walrus RHS containing 'or' round-trips as a single NamedExpr, not a split BoolOp", () => {
			testRoundtrip("if not c and (s := w or r):\n    pass");
		});

		test("a lambda in the body slot keeps its parens; in orelse it doesn't", () => {
			testUnparse("(lambda: a) if b else c", "(lambda: a) if b else c");
			testUnparse("a if b else lambda: c", "a if b else lambda: c");
		});

		test("lambda expression", () => {
			testUnparse("lambda x: x * 2", "lambda x: x * 2");
			testUnparse("lambda x, y=1: x + y", "lambda x, y=1: x + y");
			testUnparse("lambda: 42", "lambda: 42");
			testRoundtrip("lambda x, y: x + y");
		});

		test("a lambda with only keyword-only parameters keeps its bare '*' separator", () => {
			// A prior bug: `visit_Lambda` only checked `args`/`vararg`/`kwarg`
			// before deciding whether to render a parameter list at all, so a
			// lambda with *just* keyword-only params (no positional ones, no
			// `*args`/`**kwargs`) had its entire `*, file=None` dropped.
			testUnparse("lambda *, file=None: False", "lambda *, file=None: False");
			testRoundtrip("lambda *, file=None: False");
		});

		test("a yield body keeps its parens", () => {
			// Verified against the torch opinfo/core.py pattern that surfaced
			// this: CPython's grammar excludes a bare `yield` from a lambda's
			// body (`lambda: yield x` doesn't parse; it must be
			// `lambda: (yield x)`).
			testUnparse("lambda: (yield x)", "lambda: (yield x)");
			testUnparse(
				"lambda *a, **kw: (yield (), {})",
				"lambda *a, **kw: (yield ((), {}))",
			);
			testRoundtrip("lambda: (yield x)");
		});

		test("function calls", () => {
			testUnparse("func()", "func()");
			testUnparse("func(1, 2)", "func(1, 2)");
			testUnparse("func(a=1, b=2)", "func(a=1, b=2)");
			testUnparse(
				"func(1, b=2, *args, **kwargs)",
				"func(1, *args, b=2, **kwargs)",
			); // Arguments reordered by unparser
			testRoundtrip("func(x, y=42, *args)");
		});

		test("attribute access", () => {
			testUnparse("obj.attr", "obj.attr");
			testUnparse("obj.method()", "obj.method()");
			testRoundtrip("instance.method().result");
		});

		test("a bare integer literal base gets a space before the dot", () => {
			// Verified against the importlib/_bootstrap_external.py pattern
			// that surfaced this: CPython's tokenizer reads `3571.` as the
			// start of a float literal, so `3571.to_bytes(...)` is a syntax
			// error — a space (matching CPython's own `ast.unparse`) avoids
			// it without needing parens.
			testUnparse(
				'(3571).to_bytes(2, "little")',
				'3571 .to_bytes(2, "little")',
			);
			testRoundtrip('(3571).to_bytes(2, "little")');
		});

		test("a hex literal base is rendered in decimal, so it still needs the space", () => {
			// The unparser always renders integers in decimal (numeric base
			// isn't preserved), so a hex literal base is just as ambiguous
			// as a plain decimal one once rendered.
			testUnparse('0x10.to_bytes(2, "little")', '16 .to_bytes(2, "little")');
		});

		test("a float literal base needs no space before the dot", () => {
			// Already renders with its own `.`, so there's no ambiguity.
			testUnparse("(10.5).hex()", "10.5.hex()");
		});

		test.each([
			["bare index", "arr[0]", "arr[0]"],
			["full slice", "arr[:]", "arr[:]"],
			["lower bound only", "arr[1:]", "arr[1:]"],
			["upper bound only", "arr[:5]", "arr[:5]"],
			["lower and upper bound", "arr[1:5]", "arr[1:5]"],
			["step only", "arr[::2]", "arr[::2]"],
			["lower, upper and step", "arr[1:5:2]", "arr[1:5:2]"],
			[
				"tuple slice unpacked without extra parens",
				"arr[i, j:k]",
				"arr[i, j:k]",
			],
		])("subscripting: %s", (_name, code, expected) => {
			testUnparse(code, expected);
		});
		test("subscripting round-trips", () => {
			testRoundtrip("matrix[i][j]");
		});

		test("an empty-tuple subscript keeps its parens; a non-empty one doesn't", () => {
			// Verified against CPython 3.13's own ast.unparse, and against the
			// aiosignal/__init__.py pattern (`Unpack[tuple[()]]`) that
			// surfaced this: `a[]` isn't valid syntax (a subscript can't be
			// empty), so the empty-tuple slice must still render as `()`,
			// unlike a non-empty tuple slice, which drops the parens.
			testUnparse("a[()]", "a[()]");
			testUnparse("a[1, 2]", "a[1, 2]");
			testRoundtrip("a[()]");
		});

		test("a single-element tuple slice keeps its trailing comma", () => {
			// A prior bug: `arr[x,]` (a 1-tuple index, distinct from the bare
			// index `arr[x]`) lost its trailing comma when unparsed, silently
			// changing `slice` from `Tuple(elts=[x])` to just `x` on re-parse.
			testUnparse("arr[x,]", "arr[x,]");
			testUnparse("mgrid[0.1:0.33:0.1,]", "mgrid[0.1:0.33:0.1,]");
			testRoundtrip("arr[x,]");
		});

		test("await expression", () => {
			testUnparse("await func()", "await func()");
			testRoundtrip("await async_operation()");
		});

		test("yield expression", () => {
			testUnparse("yield", "yield");
			testUnparse("yield 42", "yield 42");
			testUnparse("yield from generator", "yield from generator");
			testRoundtrip("yield value");
		});

		test("named expression (walrus operator)", () => {
			// A bare `x := 42` statement is invalid in CPython (the walrus
			// target needs enclosing parens outside contexts like `if`/`while`
			// conditions), so `ast.unparse` always parenthesizes a top-level
			// `NamedExpr` — matched here even though this parser is more
			// permissive than CPython about accepting the bare form.
			testUnparse("x := 42", "(x := 42)");
			testRoundtrip("if (n := len(items)) > 0:\n    print(n)");
		});
	});

	describe("Data Structures", () => {
		test("lists", () => {
			testUnparse("[]", "[]");
			testUnparse("[1, 2, 3]", "[1, 2, 3]");
			testUnparse("[x, y, z]", "[x, y, z]");
			testRoundtrip("[1, 2, 3]");
		});

		test("tuples", () => {
			testUnparse("()", "()");
			testUnparse("(1,)", "(1,)");
			testUnparse("(1, 2)", "(1, 2)");
			testUnparse("(x, y, z)", "(x, y, z)");
			testRoundtrip("(1, 2, 3)");
		});

		test("dictionaries", () => {
			testUnparse("{}", "{}");
			testUnparse("{'a': 1, 'b': 2}", "{'a': 1, 'b': 2}");
			testUnparse("{**other}", "{**other}");
			testUnparse("{'a': 1, **other}", "{'a': 1, **other}");
			testUnparse("{**a, 'b': 1, **c}", "{**a, 'b': 1, **c}");
			testRoundtrip("{'key': 'value'}");
			testRoundtrip("{**a, **b}");
		});

		test("a BoolOp/ternary operand of dict-unpacking `**` keeps its parens", () => {
			// Verified against the build/_builder.py pattern that surfaced
			// this: `**expr` binds at `bitor` precedence (same restriction as
			// `**kwargs` in a call), so a bare `BoolOp` there is a syntax
			// error unparenthesized (`{**a or b}` doesn't parse).
			testUnparse("{**(a or b)}", "{**(a or b)}");
			testUnparse(
				"{**(env() or {}), **(extra or {})}",
				"{**(env() or {}), **(extra or {})}",
			);
			testRoundtrip("{**(a or b)}");
		});

		test("sets", () => {
			testUnparse("{1, 2, 3}", "{1, 2, 3}");
			testUnparse("{x, y, z}", "{x, y, z}");
			testRoundtrip("{1, 2, 3}");
		});

		test("starred expressions", () => {
			testUnparse("*args", "*args");
			testRoundtrip("func(*args, **kwargs)");
		});

		test("a starred ternary/boolop operand keeps its parens", () => {
			// Verified against the _pyrepl/reader.py pattern that surfaced
			// this: CPython's grammar restricts a starred operand to `bitor`
			// (`star_expr: '*' bitor`) — a bare ternary or `BoolOp` there is a
			// syntax error unparenthesized, so the parser only ever produces
			// this shape from already-parenthesized source, and the
			// unparser must keep the parens or the result doesn't re-parse.
			testUnparse("[*(() if a else (1,))]", "[*(() if a else (1,))]");
			testUnparse("[*(a or b)]", "[*(a or b)]");
			testRoundtrip("[*(() if a else (1,))]");
		});

		test("a starred bitor operand needs no parens", () => {
			testUnparse("[*(a | b)]", "[*a | b]");
		});
	});

	describe("Comprehensions", () => {
		test("list comprehensions", () => {
			testUnparse("[x for x in items]", "[x for x in items]");
			testUnparse("[x for x in items if x > 0]", "[x for x in items if x > 0]");
			testUnparse(
				"[x * 2 for x in range(10) if x % 2 == 0]",
				"[x * 2 for x in range(10) if x % 2 == 0]",
			);
			testRoundtrip("[x ** 2 for x in range(5)]");
		});

		test("set comprehensions", () => {
			testUnparse("{x for x in items}", "{x for x in items}");
			testUnparse("{x for x in items if x > 0}", "{x for x in items if x > 0}");
			testRoundtrip("{x for x in range(5) if x % 2 == 0}");
		});

		test.each([
			[
				"tuple-unpacking target, single condition",
				"{k: v for k, v in items}",
				"{k: v for (k, v) in items}",
			],
			[
				"tuple-unpacking target with a method-call iterable",
				"{k: v for k, v in items.items()}",
				"{k: v for (k, v) in items.items()}",
			],
			[
				"tuple-unpacking target with an if filter",
				"{k: v for k, v in items.items() if v > 0}",
				"{k: v for (k, v) in items.items() if v > 0}",
			],
		])("dict comprehensions: %s", (_name, code, expected) => {
			testUnparse(code, expected);
		});
		test("dict comprehensions round-trip", () => {
			testRoundtrip("{i: i**2 for i in range(5)}");
		});

		test("generator expressions", () => {
			testUnparse("(x for x in items)", "(x for x in items)");
			testUnparse("(x for x in items if x > 0)", "(x for x in items if x > 0)");
			testRoundtrip("sum(x for x in range(10))");
		});

		test("a generator expression as a call's sole argument still gets its own parens", () => {
			// The unparser always wraps a bare `GeneratorExp` in parens rather
			// than special-casing "sole argument of a call" (where CPython's
			// own grammar permits dropping them) — valid, if not minimal,
			// output either way.
			testUnparse("sum(x for x in range(10))", "sum((x for x in range(10)))");
		});

		test("async generator expressions", () => {
			testUnparse(
				"(x async for x in async_items)",
				"(x async for x in async_items)",
			);
			testUnparse(
				"(x async for x in async_items if x > 0)",
				"(x async for x in async_items if x > 0)",
			);
			testUnparse(
				"(x for x in items async for y in async_items)",
				"(x for x in items async for y in async_items)",
			);
			testUnparse(
				"(x async for x in async_items for y in items)",
				"(x async for x in async_items for y in items)",
			);
			testUnparse(
				"(x async for x in async_items async for y in async_items2)",
				"(x async for x in async_items async for y in async_items2)",
			);
		});

		test("comprehension with multiple if clauses", () => {
			testUnparse(
				"[x for x in range(10) if x > 0 if x < 5]",
				"[x for x in range(10) if x > 0 if x < 5]",
			);
		});

		test("a parenthesized ternary as an `if` filter keeps its parens", () => {
			// Verified against the dataclasses.py pattern that surfaced this:
			// CPython's grammar restricts a comprehension's `if` condition to
			// `or_test` — a bare ternary is one level looser and a syntax
			// error there unparenthesized (`if a if b else c` doesn't parse:
			// it reads as two chained `if` clauses, not one `if` of a
			// ternary).
			testUnparse(
				"[f for f in fields if (f.compare if f.hash is None else f.hash)]",
				"[f for f in fields if (f.compare if f.hash is None else f.hash)]",
			);
			testRoundtrip(
				"[f for f in fields if (f.compare if f.hash is None else f.hash)]",
			);
		});

		test("a parenthesized ternary as the iterable keeps its parens", () => {
			// Same grammar restriction applies to `in <iter>`.
			testUnparse(
				"[i for i in (a if b else c)]",
				"[i for i in (a if b else c)]",
			);
			testRoundtrip("[i for i in (a if b else c)]");
		});

		test("a bare `or`/`and` filter or iterable needs no parens", () => {
			testUnparse("[i for i in a or b]", "[i for i in a or b]");
			testUnparse(
				"[i for i in items if a or b]",
				"[i for i in items if a or b]",
			);
		});
	});

	describe("F-strings", () => {
		test("simple f-strings", () => {
			testUnparse("f'Hello, {name}!'", "f'Hello, {name}!'");
			testRoundtrip("f'Value: {value}'");
		});

		test.each([
			["!s conversion", "f'{x!s}'", "f'{x!s}'"],
			["!r conversion", "f'{x!r}'", "f'{x!r}'"],
			["!a conversion", "f'{x!a}'", "f'{x!a}'"],
			[
				"conversion combined with a format spec",
				"f'{x!r:>10}'",
				"f'{x!r:>10}'",
			],
			[
				"format spec containing a nested replacement field",
				"f'{x:{width}}'",
				"f'{x:{width}}'",
			],
		])("%s", (_name, code, expected) => {
			testUnparse(code, expected);
		});

		test("f-strings with format specs round-trip", () => {
			testRoundtrip("f'{num:04d}'");
		});

		test("f-strings with conversions round-trip", () => {
			testRoundtrip("f'{obj!r}'");
		});

		test("a field expression starting with '{' gets a disambiguating space", () => {
			// A prior bug: a field whose expression itself starts with `{`
			// (a `Dict`/`DictComp`/`Set`/`SetComp`) unparsed with its `{`
			// sitting directly against the field's own opening `{` — but
			// CPython's tokenizer folds a leading `{{` to an escaped literal
			// brace *before* considering field boundaries, so `f"{{1: 2}}"`
			// doesn't mean "a field containing the dict `{1: 2}`". A space
			// disambiguates, matching what CPython requires source-side.
			testUnparse('f"{ {1: 2} }"', 'f"{ {1: 2}}"');
			testRoundtrip("f'{ {k: v for k, v in d.items()} }'");
			testRoundtrip("f'{ {1, 2, 3} }'");
		});

		test("raw f-strings (rf/fr prefixes) round-trip with interpolations intact", () => {
			testRoundtrip("rf'Hello, {name}!'");
			testRoundtrip("fr'Hello, {name}!'");
		});

		test("self-documenting expressions unparse to the equivalent explicit literal+field form", () => {
			// The unparser doesn't reconstruct the `{expr=}` shorthand syntax; it
			// renders the literal 'expr=' Constant and the field explicitly,
			// which is semantically equivalent and stable under a second
			// round-trip (re-parsing no longer sees a trailing '=' to re-detect).
			testUnparse('f"{x=}"', 'f"x={x!r}"');
			testUnparse('f"{x=:>10}"', 'f"x={x:>10}"');

			const once = unparse(parse('f"{x=}"'));
			const twice = unparse(parse(once));
			expect(twice).toBe(once);
		});

		test("triple-quoted f-strings round-trip", () => {
			testRoundtrip("f'''Hello, {name}!'''");
		});

		describe("literal text segment escaping", () => {
			// `testRoundtrip` only checks shallow structure; these check the
			// actual decoded literal-text values survive round-tripping.
			const joinedStrValues = (expr: ExprNode) =>
				(expr as JoinedStr).values.map((v) =>
					v.nodeType === "Constant" ? v.value : undefined,
				);

			test("a trailing \\n escape (not a real newline) survives round-tripping", () => {
				// Verified against the _osx_support.py pattern that surfaced
				// this: the decoded literal text ends in an actual newline
				// character, which a single-quoted (non-triple) f-string can't
				// contain unescaped — writing it back raw produced invalid,
				// unterminated source.
				testRoundtripValue(
					String.raw`f"Compiling with an SDK that does not exist: {sysroot}\n"`,
					joinedStrValues,
				);
			});

			test("a doubled brace in literal text is re-doubled on the way out", () => {
				testRoundtripValue(`f"literal {{brace}} and {y}"`, joinedStrValues);
			});

			test("raw f-string literal text (including a literal backslash) round-trips verbatim", () => {
				testRoundtripValue(String.raw`rf"raw \n {y}"`, joinedStrValues);
			});

			test("triple-quoted f-string literal text with a trailing-newline escape round-trips", () => {
				testRoundtripValue(String.raw`f"""value: {x}\n"""`, joinedStrValues);
			});
		});
	});

	describe("T-strings (PEP 750 template strings)", () => {
		test("simple t-strings", () => {
			testUnparse("t'Hello, {name}!'", "t'Hello, {name}!'");
			testRoundtrip("t'Value: {value}'");
		});

		test("t-strings with conversions and format specs", () => {
			testRoundtrip("t'{obj!r}'");
			testRoundtrip("t'{num:>{width}}'");
		});

		test("raw t-strings (tr/rt prefixes) round-trip", () => {
			testRoundtrip("tr'Hello, {name}!'");
			testRoundtrip("rt'Hello, {name}!'");
		});

		test("triple-quoted t-strings round-trip", () => {
			testRoundtrip("t'''Hello, {name}!'''");
		});

		test("nested f-string/t-string interpolations round-trip", () => {
			testRoundtrip("t\"outer {f'inner {y}'} end\"");
			testRoundtrip("t\"outer {t'inner {y}'} end\"");
		});
	});

	describe("Implicit string concatenation", () => {
		// Verified against the importlib/__init__.py pattern that surfaced
		// this: adjacent string literals concatenate into one `JoinedStr`
		// with the parser (see `parseConcatenatedStringLiteral`). Its
		// `quote_style` must reflect that the merged result needs an `f`/`t`
		// prefix even when the *first* literal in the concatenation is a
		// plain (non-f/t) string — otherwise the unparser drops the prefix
		// and re-parses the `{...}` field as literal text instead.
		test("a plain string followed by an f-string keeps the f prefix", () => {
			const code = '"plain " f"{value!r}"';
			const original = (parseExpression(code) as { nodeType: string }).nodeType;
			expect(original).toBe("JoinedStr");

			const reparsed = (
				parseExpression(unparse(parse(code)).trim()) as {
					nodeType: string;
				}
			).nodeType;
			expect(reparsed).toBe("JoinedStr");
		});

		test("an f-string followed by a plain string still round-trips", () => {
			testRoundtrip('f"{value!r}" " plain"');
		});

		describe("mixed raw and non-raw bytes/string parts", () => {
			// Verified against the PIL/XbmImagePlugin.py pattern that
			// surfaced this: concatenated parts merge into one `Constant`
			// with a single `quote_style` (see
			// `parseConcatenatedStringLiteral`), which can't record that
			// only *some* parts were raw. Marking the merge raw when a
			// non-raw part contributed already-escape-decoded text (e.g. a
			// real tab or newline from a `\t`/`\n` escape) made the
			// unparser write that decoded content back completely
			// unescaped into a raw literal — invalid source.
			const stringValue = (expr: ExprNode) => (expr as { value: string }).value;

			test("a raw part followed by a non-raw part with a real escape", () => {
				testRoundtripValue(String.raw`rb"\s+" b"\t\n"`, stringValue);
			});

			test("all-raw parts stay raw", () => {
				const code = String.raw`rb"\s+" rb"\d+"`;
				const parsed = parseExpression(code) as { quote_style?: string };
				expect(parsed.quote_style).toMatch(/r/i);
				testRoundtripValue(code, stringValue);
			});

			test("a non-raw part followed by a raw part", () => {
				testRoundtripValue(String.raw`b"\t" rb"\s+"`, stringValue);
			});

			test("raw parts with different quote characters (jinja2/lexer.py pattern)", () => {
				// Verified against the jinja2/lexer.py pattern that surfaced
				// this: two adjacent raw strings, one double- one
				// single-quoted, each containing the *other's* quote
				// character unescaped (safe individually, since raw strings
				// never need to escape the other quote char). Merging them
				// as one raw literal in either quote style would let an
				// embedded quote prematurely close it; falling back to
				// non-raw output escapes correctly regardless.
				testRoundtripValue(`r"a'b" r'c"d'`, stringValue);
			});

			test("a raw plain string with the f-string's quote char, concatenated with an f-string", () => {
				// Verified against the pandas test_to_datetime.py pattern that
				// surfaced this: a raw plain string containing the *other*
				// part's quote character (safe on its own — raw strings only
				// need to escape their own delimiter), concatenated with an
				// f-string. Merging under the f-string's quote style let the
				// raw part's embedded quote prematurely close the literal.
				const code = `r'^time data "True" ' f"at position {n}"`;
				const original = (parseExpression(code) as JoinedStr).values;
				const reparsed = (
					parseExpression(unparse(parse(code)).trim()) as JoinedStr
				).values;
				const literalValues = (vals: JoinedStr["values"]) =>
					vals
						.filter((v) => v.nodeType === "Constant")
						.map((v) => (v.nodeType === "Constant" ? v.value : undefined));
				expect(literalValues(reparsed)).toEqual(literalValues(original));
				expect(reparsed.map((v) => v.nodeType)).toEqual(
					original.map((v) => v.nodeType),
				);
			});
		});
	});

	describe("Constants", () => {
		test.each([
			["None", "None", "None"],
			["True", "True", "True"],
			["False", "False", "False"],
			["int", "42", "42"],
			["float", "3.14", "3.14"],
			["string", "'hello'", "'hello'"],
		])("primitive constant: %s", (_name, code, expected) => {
			testUnparse(code, expected);
		});
		test("primitive constants round-trip", () => {
			testRoundtrip("42");
		});

		test.each([
			["positive imaginary", "4j", "4j"],
			["fractional imaginary", "3.5j", "3.5j"],
			["zero imaginary", "0j", "0j"],
			["negative imaginary", "-4j", "-4j"],
			["complex sum expression", "3 + 4j", "3 + 4j"],
		])("imaginary literal constant: %s", (_name, code, expected) => {
			testUnparse(code, expected);
		});
		test("imaginary literal constants round-trip", () => {
			testRoundtrip("4j");
			testRoundtrip("3.5j");
			testRoundtrip("-4j");
		});

		test("a float literal that overflows to inf round-trips through 1e309", () => {
			// A prior bug: `formatConstant` fell through to JS's default
			// `Number.prototype.toString`, writing the bare identifiers
			// `Infinity`/`NaN` — not valid Python float literals, so a
			// unary-minus/round-trip read them back as an undefined `Name`
			// instead of the intended value. CPython's own `ast.unparse` writes
			// `1e309` (a literal that itself overflows to `inf`) for `inf`, and
			// `(1e309-1e309)` for `nan`; matched here for the same reason.
			testUnparse("x = 1e1000", "x = 1e309");
			testRoundtrip("x = 1e1000");
		});

		test("a negative-infinity UnaryOp round-trips through -1e309", () => {
			testUnparse("x = -1e1000", "x = -1e309");
			testRoundtrip("x = -1e1000");
		});

		describe("triple-quoted string content", () => {
			// `testRoundtrip` only checks shallow structure (body length,
			// nodeType), which wouldn't have caught this: a decoded value
			// written back into a triple-quoted literal without re-escaping
			// backslashes reads back as a different string.
			const stringValue = (expr: ExprNode) => (expr as { value: string }).value;

			test("a literal backslash-n (not a newline) survives round-tripping", () => {
				// Verified against the _pydecimal.py docstring pattern that
				// surfaced this: source `\\n` (escaped backslash + plain `n`)
				// decodes to a literal backslash followed by `n`, not `\n`'s
				// usual newline — the unparser must escape that backslash or
				// re-parsing reads it as a fresh escape sequence.
				testRoundtripValue(
					String.raw`"""value: \\n literal backslash-n"""`,
					stringValue,
				);
			});

			test("an actual embedded newline still round-trips", () => {
				testRoundtripValue('"""line one\nline two"""', stringValue);
			});

			test("content containing the closing delimiter round-trips", () => {
				testRoundtripValue(
					String.raw`"""contains \"\"\" inside"""`,
					stringValue,
				);
			});

			test("content ending in the quote character round-trips", () => {
				testRoundtripValue(String.raw`"""ends with quote\""""`, stringValue);
			});

			test("raw triple-quoted strings still round-trip verbatim", () => {
				testRoundtripValue(String.raw`r"""a \raw \backslash"""`, stringValue);
			});

			test("a \\r escape (carriage return) survives round-tripping", () => {
				// A prior bug: `escapeTripleQuoted` left a decoded `\r` as a
				// literal CR byte in the regenerated source. CPython applies
				// universal-newline translation to a raw `\r`/`\r\n` even
				// inside a triple-quoted literal's body, silently collapsing
				// it to `\n` on re-parse — so an escaped `\r` (as opposed to
				// an actual source line ending) must stay an explicit `\r`
				// escape to round-trip.
				testRoundtripValue(String.raw`b"""a\rb"""`, stringValue);
				testRoundtripValue(String.raw`"""a\rb"""`, stringValue);
			});
		});
	});

	describe("Raw strings", () => {
		test("raw string backslashes are not re-escaped", () => {
			testUnparse(String.raw`x = r"raw\bytes"`, String.raw`x = r"raw\bytes"`);
		});

		test("raw byte string backslashes are not re-escaped", () => {
			testUnparse(String.raw`x = rb"raw\bytes"`, String.raw`x = rb"raw\bytes"`);
		});
	});

	describe("Complex Constructs", () => {
		test("nested structures", () => {
			testRoundtrip("[[1, 2], [3, 4]]");
			testRoundtrip("{'outer': {'inner': 42}}");
			testRoundtrip("func(arg1, func2(nested))");
		});

		test("mixed constructs", () => {
			testRoundtrip("result = [func(x) for x in items if predicate(x)]");
			testRoundtrip(
				"await asyncio.gather(*[process(item) async for item in async_items])",
			);
		});
	});

	describe("Operator Precedence", () => {
		test("arithmetic precedence", () => {
			testUnparse("a + b * c", "a + b * c");
			testUnparse("(a + b) * c", "(a + b) * c"); // Parentheses are necessary to preserve mathematical meaning
			testUnparse("a ** b ** c", "a ** b ** c");
			testRoundtrip("a + b * c / d");
		});

		test("boolean precedence", () => {
			testUnparse("a and b or c", "a and b or c");
			testUnparse("not a and b", "not a and b"); // `not` binds tighter than `and`; no parens needed
			testRoundtrip("a or b and c");
		});

		test("comparison precedence", () => {
			testUnparse("a < b == c", "a < b == c");
			testUnparse("a and b < c", "a and b < c");
			testRoundtrip("x > 0 and x < 10");
		});

		test("an explicitly-parenthesized nested comparison keeps its parens", () => {
			// A `Compare` isn't associative the way `+`/`*` are: `a == b != c`
			// is one chained Compare with two ops, semantically different from
			// `(a == b) != c` (a Compare of a Compare's boolean result). The
			// parens must round-trip or the meaning changes.
			testUnparse("(a == b) != c", "(a == b) != c");
			testUnparse("(a < b) < c", "(a < b) < c");
			testRoundtrip("(a == b) != c");
		});

		test("left-grouped equal-precedence '**' keeps its parens", () => {
			testUnparse("(2 ** 3) ** 2", "(2 ** 3) ** 2");
		});

		test("right-grouped equal-precedence '**' drops redundant parens", () => {
			testUnparse("2 ** (3 ** 2)", "2 ** 3 ** 2");
		});

		test("chained '**' grouping round-trips as parsed", () => {
			testRoundtrip("2 ** 3 ** 2");
			testRoundtrip("(2 ** 3) ** 2");
		});

		test("named expression as a binary operand round-trips", () => {
			testRoundtrip("y = (x := 5) + 1");
		});

		// Each row is a lower-precedence expression form used in a context
		// (binary operand, call target, attribute/subscript base, ...) whose
		// grammar requires it stay parenthesized to round-trip. Verified
		// against CPython's own `ast.unparse` operator-precedence table.
		test.each([
			[
				"a Tuple self-delimits with its own parens as a binary operand (no extra pair needed)",
				"(1, 2) + x",
				"(1, 2) + x",
			],
			[
				"a boolean-op operand of '+' keeps its parens",
				"z = (a or b) + 1",
				"z = (a or b) + 1",
			],
			[
				"an 'and' boolean-op operand of '+' keeps its parens",
				"z = (a and b) + 1",
				"z = (a and b) + 1",
			],
			[
				"a conditional-expression operand of '+' keeps its parens",
				"z = (a if b else c) + 1",
				"z = (a if b else c) + 1",
			],
			[
				"a comparison operand of '+' keeps its parens",
				"z = (a < b) + 1",
				"z = (a < b) + 1",
			],
			[
				"a named-expression (walrus) operand of '+' keeps its parens",
				"y = (x := 5) + 1",
				"y = (x := 5) + 1",
			],
			[
				"a named expression as a conditional expression's test requires parens",
				'x = "a" if (flag := True) else "b"',
				'x = "a" if (flag := True) else "b"',
			],
			[
				"a named expression as a comparison operand requires parens",
				"y = [v for v in range(10) if (v := v * 2) > 5]",
				"y = [v for v in range(10) if (v := v * 2) > 5]",
			],
			[
				"'and' preserves parens around a lower-precedence 'or' operand",
				"z = (a or b) and c",
				"z = (a or b) and c",
			],
			[
				"comparison preserves parens around a lower-precedence boolean-op operand",
				"z = (a or b) == c",
				"z = (a or b) == c",
			],
			[
				"comparison preserves parens around a conditional-expression operand",
				"z = (a if b else c) == d",
				"z = (a if b else c) == d",
			],
			[
				"a lambda used as a call target keeps its parens",
				"x = (lambda a, b: a * b)(3, 4)",
				"x = (lambda a, b: a * b)(3, 4)",
			],
			[
				"a conditional expression used as a call target keeps its parens",
				"x = (f if cond else g)(1)",
				"x = (f if cond else g)(1)",
			],
			[
				"a lambda used as an attribute base keeps its parens",
				"x = (lambda: obj).attr",
				"x = (lambda: obj).attr",
			],
			[
				"a lambda used as a subscript base keeps its parens",
				"x = (lambda: seq)[0]",
				"x = (lambda: seq)[0]",
			],
		])("%s", (_name, code, expected) => {
			testUnparse(code, expected);
		});

		test("a yield expression as a binary operator operand keeps its parens", () => {
			const code = "def g():\n    x = 1 + (yield y)";
			testUnparse(code, code);
		});

		test("a yield-from expression as a binary operator operand keeps its parens", () => {
			const code = "def g():\n    x = 1 + (yield from gen())";
			testUnparse(code, code);
		});

		test("an await expression as a binary operator operand needs no parens", () => {
			testUnparse("y = (await foo()) + 1", "y = await foo() + 1");
		});
	});

	describe("Comments surfaced in unparsed output", () => {
		test("multiple inline comments collected while parsing the value merge onto one line", () => {
			const code = "x = (\n    1  # first\n    + 2  # second\n)\n";
			const ast = parse(code, { comments: true });
			expect(unparse(ast)).toBe("x = 1 + 2  # second  # first");
		});

		test("a standalone comment collected while parsing the value surfaces on its own line", () => {
			const code = "x = (\n    1\n    # standalone\n    + 2\n)\n";
			const ast = parse(code, { comments: true });
			expect(unparse(ast)).toBe("x = 1 + 2\n# standalone");
		});
	});

	describe("Edge Cases", () => {
		test("empty constructs", () => {
			testUnparse("pass", "pass");
			testUnparse("[]", "[]");
			testUnparse("{}", "{}");
			testRoundtrip("def empty(): pass");
		});

		test("single element constructs", () => {
			testUnparse("(x,)", "(x,)");
			testUnparse("[x]", "[x]");
			testUnparse("{x}", "{x}");
			testRoundtrip("(42,)");
		});
	});

	describe("API Integration", () => {
		test("unparse function exports", () => {
			expect(typeof unparse).toBe("function");

			const ast = parse("x = 42");
			const result = unparse(ast);
			expect(typeof result).toBe("string");
			expect(result.trim()).toBe("x = 42");
		});

		test("unparse with options", () => {
			const ast = parse("if x:\n    y = 1");
			const result = unparse(ast, { indent: "  " });
			expect(result).toContain("  y = 1");
		});

		test("error handling", () => {
			// Test with malformed AST should not crash
			expect(() => {
				unparse({} as unknown as ASTNodeUnion);
			}).not.toThrow();
		});
	});
});
