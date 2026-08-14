import { describe, expect, test } from "vitest";
import { parse } from "../src/parser.js";
import type {
	Arg,
	Constant,
	Dict,
	Expression,
	FormattedValue,
	FunctionDef,
	FunctionType,
	Interactive,
	Interpolation,
	JoinedStr,
	MatchAs,
	MatchSingleton,
	MatchValue,
	Module,
} from "../src/types.js";
import { unparse } from "../src/unparser.js";
import { testRoundtrip, testUnparse } from "./test-helpers.js";

describe("Unparser Edge Cases", () => {
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

	describe("Decorators", () => {
		test("function with multiple decorators", () => {
			testUnparse(
				"@a\n@b.c\ndef f():\n    pass",
				"@a\n@b.c\ndef f():\n    pass",
			);
		});

		test("class with multiple decorators", () => {
			testUnparse(
				"@deco1\n@deco2\nclass C:\n    pass",
				"@deco1\n@deco2\nclass C:\n    pass",
			);
		});
	});

	describe("Function and class signatures", () => {
		test("class with bases and keywords together", () => {
			testUnparse(
				"class C(A, B, metaclass=Meta):\n    pass",
				"class C(A, B, metaclass=Meta):\n    pass",
			);
		});

		test("class with only keywords, no bases", () => {
			testUnparse(
				"class C(metaclass=Meta):\n    pass",
				"class C(metaclass=Meta):\n    pass",
			);
		});

		test("function with type params, bound and defaults (PEP 695/696)", () => {
			testUnparse(
				"def f[T: int](x: T) -> T:\n    return x",
				"def f[T: int](x: T) -> T:\n    return x",
			);
			testUnparse(
				"def f[T = int](x: T):\n    pass",
				"def f[T = int](x: T):\n    pass",
			);
			testUnparse(
				"def f[**P = int](x):\n    pass",
				"def f[**P = int](x):\n    pass",
			);
			testUnparse(
				"def f[*Ts = int](x):\n    pass",
				"def f[*Ts = int](x):\n    pass",
			);
		});

		test("class with TypeVar, TypeVarTuple and ParamSpec type params", () => {
			testUnparse(
				"class Foo[T: int, *Ts, **P]:\n    pass",
				"class Foo[T: int, *Ts, **P]:\n    pass",
			);
		});

		test("type alias with type params", () => {
			testUnparse("type Alias[T] = list[T]", "type Alias[T] = list[T]");
		});

		test("bare keyword-only separator with no positional args", () => {
			const code = "def f(*, a):\n    pass";
			testUnparse(code, code);
			testRoundtrip(code);
		});

		test("bare keyword-only separator with multiple params and defaults", () => {
			const code = "def f(*, a, b=1):\n    pass";
			testUnparse(code, code);
			testRoundtrip(code);
		});

		test("positional-only params with defaults", () => {
			testUnparse(
				"def f(a=1, b=2, /, c=3):\n    pass",
				"def f(a=1, b=2, /, c=3):\n    pass",
			);
		});

		test("keyword-only param without a default among defaulted ones", () => {
			testUnparse("def f(*, a=1, b):\n    pass", "def f(*, a=1, b):\n    pass");
		});

		test("keyword-only separator combined with a preceding positional param", () => {
			testUnparse("def f(x, *, a):\n    pass", "def f(x, *, a):\n    pass");
		});

		test("vararg and kwarg with no keyword-only params", () => {
			testUnparse(
				"def f(*args, **kwargs):\n    pass",
				"def f(*args, **kwargs):\n    pass",
			);
		});

		test("keyword-only params combined with kwarg, no positional or vararg", () => {
			testUnparse(
				"def f(*, a, **kwargs):\n    pass",
				"def f(*, a, **kwargs):\n    pass",
			);
		});

		test("vararg combined with keyword-only params", () => {
			testUnparse("def f(*args, a):\n    pass", "def f(*args, a):\n    pass");
		});

		test("kwarg with no positional, vararg or keyword-only params", () => {
			testUnparse("def f(**kwargs):\n    pass", "def f(**kwargs):\n    pass");
		});

		test("async function with return annotation", () => {
			testUnparse(
				"async def f() -> int:\n    return 1",
				"async def f() -> int:\n    return 1",
			);
		});
	});

	describe("Augmented assignment", () => {
		test("matrix multiplication augmented assignment", () => {
			testUnparse("x @= y", "x @= y");
		});
	});

	describe("Assignment with attached expression comments", () => {
		test("multiple inline comments collected while parsing the value", () => {
			const code = "x = (\n    1  # first\n    + 2  # second\n)\n";
			const ast = parse(code, { comments: true });
			expect(unparse(ast)).toBe("x = 1 + 2  # second  # first");
		});

		test("standalone comment collected while parsing the value", () => {
			const code = "x = (\n    1\n    # standalone\n    + 2\n)\n";
			const ast = parse(code, { comments: true });
			expect(unparse(ast)).toBe("x = 1 + 2\n# standalone");
		});
	});

	describe("Match statements", () => {
		test("match with a guard clause", () => {
			const code =
				"match command.split():\n    case [go, direction] if direction in dirs:\n        move(direction)";
			testUnparse(code, code);
			testRoundtrip(code);
		});

		test("match value pattern", () => {
			testUnparse(
				"match x:\n    case 1:\n        pass",
				"match x:\n    case 1:\n        pass",
			);
		});

		test("match sequence pattern, including star and empty", () => {
			testUnparse(
				"match p:\n    case [1, 2, *rest]:\n        pass",
				"match p:\n    case [1, 2, *rest]:\n        pass",
			);
			testUnparse(
				"match p:\n    case []:\n        pass",
				"match p:\n    case []:\n        pass",
			);
			testUnparse(
				"match p:\n    case [1, *_]:\n        pass",
				"match p:\n    case [1, *_]:\n        pass",
			);
		});

		test("match star pattern without a bound name", () => {
			testUnparse(
				"match p:\n    case [*]:\n        pass",
				"match p:\n    case [*]:\n        pass",
			);
		});

		test("match mapping pattern, with and without rest and keys", () => {
			testUnparse(
				'match p:\n    case {"key": value, **rest}:\n        pass',
				'match p:\n    case {"key": value, **rest}:\n        pass',
			);
			testUnparse(
				"match p:\n    case {**rest}:\n        pass",
				"match p:\n    case {**rest}:\n        pass",
			);
			testUnparse(
				"match p:\n    case {}:\n        pass",
				"match p:\n    case {}:\n        pass",
			);
		});

		test("match mapping pattern with multiple key/value pairs", () => {
			testUnparse(
				'match p:\n    case {"a": 1, "b": 2}:\n        pass',
				'match p:\n    case {"a": 1, "b": 2}:\n        pass',
			);
		});

		test("match class pattern, positional and keyword sub-patterns", () => {
			testUnparse(
				"match p:\n    case Point(x=0, y=0):\n        pass",
				"match p:\n    case Point(x=0, y=0):\n        pass",
			);
			testUnparse(
				"match p:\n    case Point(1, 2, x=0):\n        pass",
				"match p:\n    case Point(1, 2, x=0):\n        pass",
			);
			testUnparse(
				"match p:\n    case Point():\n        pass",
				"match p:\n    case Point():\n        pass",
			);
		});

		test("match or pattern", () => {
			testUnparse(
				"match p:\n    case 1 | 2 | 3:\n        pass",
				"match p:\n    case 1 | 2 | 3:\n        pass",
			);
		});

		test("match capture and wildcard patterns", () => {
			testUnparse(
				"match p:\n    case x:\n        pass",
				"match p:\n    case x:\n        pass",
			);
			testUnparse(
				"match p:\n    case _:\n        pass",
				"match p:\n    case _:\n        pass",
			);
		});
	});

	describe("Exception groups (except*)", () => {
		test("full except* statement with type, name, orelse and finally", () => {
			const code =
				"try:\n    risky()\nexcept* ValueError as e:\n    handle(e)\nelse:\n    ok()\nfinally:\n    done()";
			testUnparse(code, code);
			testRoundtrip(code);
		});

		test("except* with a type but no bound name", () => {
			const code = "try:\n    risky()\nexcept* ValueError:\n    handle()";
			testUnparse(code, code);
		});
	});

	describe("Context managers without a bound name", () => {
		test("with item having no 'as' clause", () => {
			testUnparse("with lock:\n    pass", "with lock:\n    pass");
		});
	});

	describe("Async control flow", () => {
		test("async for loop with an else clause", () => {
			const code =
				"async def f():\n    async for i in gen():\n        pass\n    else:\n        pass";
			testUnparse(code, code);
			testRoundtrip(code);
		});
	});

	describe("Operator precedence edge cases", () => {
		test("left-grouped equal-precedence '**' keeps its parens", () => {
			const ast = parse("(2 ** 3) ** 2");
			expect(unparse(ast)).toBe("(2 ** 3) ** 2");
		});

		test("right-grouped equal-precedence '**' drops redundant parens", () => {
			const ast = parse("2 ** (3 ** 2)");
			expect(unparse(ast)).toBe("2 ** 3 ** 2");
		});

		test("unparenthesized chained '**' round-trips without adding parens", () => {
			testRoundtrip("2 ** 3 ** 2");
		});

		test("left-grouped '**' round-trips to the same parenthesization", () => {
			testRoundtrip("(2 ** 3) ** 2");
		});

		test("tuple as a binary operator operand", () => {
			const ast = parse("(1, 2) + x");
			expect(unparse(ast)).toBe("((1, 2)) + x");
		});

		test("yield expression as a binary operator operand", () => {
			const code = "def g():\n    x = 1 + (yield y)";
			const ast = parse(code);
			expect(unparse(ast)).toBe("def g():\n    x = 1 + (yield y)");
		});

		test("yield from expression as a binary operator operand", () => {
			const code = "def g():\n    x = 1 + (yield from gen())";
			const ast = parse(code);
			expect(unparse(ast)).toBe("def g():\n    x = 1 + (yield from gen())");
		});

		test("await expression as a binary operator operand", () => {
			const ast = parse("y = (await foo()) + 1");
			expect(unparse(ast)).toBe("y = await foo() + 1");
		});

		test("boolean operation as a binary operator operand", () => {
			const ast = parse("z = (a or b) + 1");
			expect(unparse(ast)).toBe("z = (a or b) + 1");
		});

		test("'and' boolean operation as a binary operator operand", () => {
			const ast = parse("z = (a and b) + 1");
			expect(unparse(ast)).toBe("z = (a and b) + 1");
		});

		test("conditional expression as a binary operator operand", () => {
			const ast = parse("z = (a if b else c) + 1");
			expect(unparse(ast)).toBe("z = (a if b else c) + 1");
		});

		test("comparison as a binary operator operand", () => {
			const ast = parse("z = (a < b) + 1");
			expect(unparse(ast)).toBe("z = (a < b) + 1");
		});

		test("named expression (walrus) preserves grouping as a binary operand", () => {
			const ast = parse("y = (x := 5) + 1");
			expect(unparse(ast)).toBe("y = (x := 5) + 1");
		});

		test("named expression roundtrips back to the same value", () => {
			testRoundtrip("y = (x := 5) + 1");
		});

		test("bare named expression statement stays unparenthesized", () => {
			testUnparse("x := 42", "x := 42");
		});

		test("named expression as a conditional expression's test requires parens", () => {
			const ast = parse('x = "a" if (flag := True) else "b"');
			expect(unparse(ast)).toBe('x = "a" if (flag := True) else "b"');
		});

		test("named expression as a comparison operand requires parens", () => {
			const ast = parse("y = [v for v in range(10) if (v := v * 2) > 5]");
			expect(unparse(ast)).toBe(
				"y = [v for v in range(10) if (v := v * 2) > 5]",
			);
		});

		test("boolean operator preserves parens around a lower-precedence operand", () => {
			const ast = parse("z = (a or b) and c");
			expect(unparse(ast)).toBe("z = (a or b) and c");
		});

		test("comparison preserves parens around a lower-precedence operand", () => {
			const ast = parse("z = (a or b) == c");
			expect(unparse(ast)).toBe("z = (a or b) == c");
		});

		test("comparison preserves parens around a conditional-expression operand", () => {
			const ast = parse("z = (a if b else c) == d");
			expect(unparse(ast)).toBe("z = (a if b else c) == d");
		});

		test("lambda used as a call target keeps its parens", () => {
			const ast = parse("x = (lambda a, b: a * b)(3, 4)");
			expect(unparse(ast)).toBe("x = (lambda a, b: a * b)(3, 4)");
		});

		test("conditional expression used as a call target keeps its parens", () => {
			const ast = parse("x = (f if cond else g)(1)");
			expect(unparse(ast)).toBe("x = (f if cond else g)(1)");
		});

		test("lambda used as an attribute base keeps its parens", () => {
			const ast = parse("x = (lambda: obj).attr");
			expect(unparse(ast)).toBe("x = (lambda: obj).attr");
		});

		test("lambda used as a subscript base keeps its parens", () => {
			const ast = parse("x = (lambda: seq)[0]");
			expect(unparse(ast)).toBe("x = (lambda: seq)[0]");
		});
	});

	describe("Raw strings", () => {
		test("raw string backslashes are not re-escaped", () => {
			const ast = parse(String.raw`x = r"raw\bytes"`);
			expect(unparse(ast)).toBe(String.raw`x = r"raw\bytes"`);
		});

		test("raw byte string backslashes are not re-escaped", () => {
			const ast = parse(String.raw`x = rb"raw\bytes"`);
			expect(unparse(ast)).toBe(String.raw`x = rb"raw\bytes"`);
		});
	});

	describe("F-strings", () => {
		test("conversion flags", () => {
			testUnparse("f'{x!s}'", "f'{x!s}'");
			testUnparse("f'{x!r}'", "f'{x!r}'");
			testUnparse("f'{x!a}'", "f'{x!a}'");
		});

		test("conversion combined with a format spec", () => {
			testUnparse("f'{x!r:>10}'", "f'{x!r:>10}'");
		});

		test("nested format spec containing a replacement field", () => {
			testUnparse("f'{x:{width}}'", "f'{x:{width}}'");
		});
	});

	describe("Slices and subscripts", () => {
		test("all slice component combinations", () => {
			testUnparse("arr[:]", "arr[:]");
			testUnparse("arr[1:]", "arr[1:]");
			testUnparse("arr[:5]", "arr[:5]");
			testUnparse("arr[1:5:2]", "arr[1:5:2]");
			testUnparse("arr[::2]", "arr[::2]");
		});

		test("tuple slice is unpacked without extra parens", () => {
			testUnparse("arr[i, j:k]", "arr[i, j:k]");
		});
	});

	describe("Comprehensions", () => {
		test("dict comprehension", () => {
			testUnparse("{k: v for k, v in items}", "{k: v for (k, v) in items}");
		});

		test("generator expression", () => {
			const ast = parse("sum(x for x in range(10))");
			expect(unparse(ast)).toBe("sum((x for x in range(10)))");
		});

		test("comprehension with multiple if clauses", () => {
			testUnparse(
				"[x for x in range(10) if x > 0 if x < 5]",
				"[x for x in range(10) if x > 0 if x < 5]",
			);
		});
	});

	describe("Elif chain collapsing", () => {
		test("second elif nests as else/if rather than a second elif", () => {
			const code =
				"if a:\n    x = 1\nelif b:\n    y = 2\nelif c:\n    z = 3\nelse:\n    w = 4";
			const expected =
				"if a:\n    x = 1\nelif b:\n    y = 2\nelse:\n    if c:\n        z = 3\n    else:\n        w = 4";
			testUnparse(code, expected);
		});

		test("elif with no trailing else", () => {
			const code = "if a:\n    x = 1\nelif b:\n    y = 2";
			testUnparse(code, code);
		});
	});

	describe("Miscellaneous statement forms", () => {
		test("type alias with no type params", () => {
			testUnparse("type Alias = int", "type Alias = int");
		});

		test("except* with no exception type", () => {
			const code = "try:\n    risky()\nexcept*:\n    handle()";
			testUnparse(code, code);
		});
	});

	describe("Module-level node kinds constructed directly", () => {
		test("Interactive node renders its statement body", () => {
			const body = parse("a = 1\nb = 2").body;
			const node: Interactive = {
				nodeType: "Interactive",
				body,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("a = 1\nb = 2");
		});

		test("Expression node renders a bare eval-mode body", () => {
			const exprStmt = parse("1 + 2").body[0];
			if (exprStmt.nodeType !== "Expr") throw new Error("expected Expr");
			const node: Expression = {
				nodeType: "Expression",
				body: exprStmt.value,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("1 + 2");
		});

		test("FunctionType node renders a type-comment-style signature", () => {
			const intType = parse("int").body[0];
			const strType = parse("str").body[0];
			const boolType = parse("bool").body[0];
			if (
				intType.nodeType !== "Expr" ||
				strType.nodeType !== "Expr" ||
				boolType.nodeType !== "Expr"
			) {
				throw new Error("expected Expr statements");
			}
			const node: FunctionType = {
				nodeType: "FunctionType",
				argtypes: [intType.value, strType.value],
				returns: boolType.value,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("(int, str) -> bool");
		});

		test("MatchSingleton node renders None/True/False", () => {
			const noneNode: MatchSingleton = {
				nodeType: "MatchSingleton",
				value: null,
				lineno: 1,
				col_offset: 0,
			};
			const trueNode: MatchSingleton = {
				nodeType: "MatchSingleton",
				value: true,
				lineno: 1,
				col_offset: 0,
			};
			const falseNode: MatchSingleton = {
				nodeType: "MatchSingleton",
				value: false,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(noneNode)).toBe("None");
			expect(unparse(trueNode)).toBe("True");
			expect(unparse(falseNode)).toBe("False");
		});

		test("MatchAs node with a wrapped sub-pattern renders 'pattern as name'", () => {
			const valuePattern: MatchValue = {
				nodeType: "MatchValue",
				value: {
					nodeType: "Constant",
					value: 1,
					lineno: 1,
					col_offset: 0,
				},
				lineno: 1,
				col_offset: 0,
			};
			const node: MatchAs = {
				nodeType: "MatchAs",
				pattern: valuePattern,
				name: "p",
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("1 as p");
		});

		test("standalone FormattedValue node with a non-JoinedStr format_spec", () => {
			const node: FormattedValue = {
				nodeType: "FormattedValue",
				value: {
					nodeType: "Name",
					id: "x",
					ctx: { nodeType: "Load" },
					lineno: 1,
					col_offset: 0,
				},
				conversion: 114,
				format_spec: {
					nodeType: "Name",
					id: "spec",
					ctx: { nodeType: "Load" },
					lineno: 1,
					col_offset: 0,
				},
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("{x!r:spec}");
		});

		test("standalone FormattedValue node with the !s and !a conversions", () => {
			const makeNode = (conversion: number): FormattedValue => ({
				nodeType: "FormattedValue",
				value: {
					nodeType: "Name",
					id: "x",
					ctx: { nodeType: "Load" },
					lineno: 1,
					col_offset: 0,
				},
				conversion,
				lineno: 1,
				col_offset: 0,
			});
			expect(unparse(makeNode(115))).toBe("{x!s}");
			expect(unparse(makeNode(97))).toBe("{x!a}");
		});

		test("standalone FormattedValue node with a JoinedStr format_spec", () => {
			const node: FormattedValue = {
				nodeType: "FormattedValue",
				value: {
					nodeType: "Name",
					id: "x",
					ctx: { nodeType: "Load" },
					lineno: 1,
					col_offset: 0,
				},
				conversion: -1,
				format_spec: {
					nodeType: "JoinedStr",
					kind: 'f"',
					values: [
						{
							nodeType: "Constant",
							value: ">10",
							lineno: 1,
							col_offset: 0,
						},
					],
					lineno: 1,
					col_offset: 0,
				},
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("{x:>10}");
		});

		test("standalone Interpolation node (t-string field visited outside a TemplateStr)", () => {
			const node: Interpolation = {
				nodeType: "Interpolation",
				value: {
					nodeType: "Name",
					id: "x",
					ctx: { nodeType: "Load" },
					lineno: 1,
					col_offset: 0,
				},
				str: "x",
				conversion: 114,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("{x!r}");
		});

		test("JoinedStr value with a non-JoinedStr format_spec on its FormattedValue", () => {
			const node: JoinedStr = {
				nodeType: "JoinedStr",
				kind: 'f"',
				values: [
					{
						nodeType: "FormattedValue",
						value: {
							nodeType: "Name",
							id: "x",
							ctx: { nodeType: "Load" },
							lineno: 1,
							col_offset: 0,
						},
						conversion: -1,
						format_spec: {
							nodeType: "Name",
							id: "spec",
							ctx: { nodeType: "Load" },
							lineno: 1,
							col_offset: 0,
						},
						lineno: 1,
						col_offset: 0,
					},
				],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('f"{x:spec}"');
		});

		test("JoinedStr containing a raw expression value (not Constant/FormattedValue)", () => {
			const node: JoinedStr = {
				nodeType: "JoinedStr",
				kind: 'f"',
				values: [
					{
						nodeType: "Name",
						id: "raw",
						ctx: { nodeType: "Load" },
						lineno: 1,
						col_offset: 0,
					},
				],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('f"raw"');
		});

		test("JoinedStr without a kind hint falls back to double-quoted f-string", () => {
			const node: JoinedStr = {
				nodeType: "JoinedStr",
				values: [
					{
						nodeType: "Constant",
						value: "hi",
						lineno: 1,
						col_offset: 0,
					},
				],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('f"hi"');
		});

		test("Constant with a value outside the known literal kinds falls back to String()", () => {
			const node: Constant = {
				nodeType: "Constant",
				value: { toString: () => "custom" },
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("custom");
		});
	});

	describe("Indentation detection with irregular hand-built ASTs", () => {
		test("compound statement with an empty body is skipped, falling back to default indent", () => {
			const emptyFunction: FunctionDef = {
				nodeType: "FunctionDef",
				name: "f",
				args: {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					kwonlyargs: [],
					kw_defaults: [],
					defaults: [],
				},
				body: [],
				decorator_list: [],
				type_params: [],
				lineno: 1,
				col_offset: 0,
			};
			const outer: FunctionDef = {
				nodeType: "FunctionDef",
				name: "g",
				args: {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					kwonlyargs: [],
					kw_defaults: [],
					defaults: [],
				},
				body: [{ nodeType: "Pass", lineno: 3, col_offset: 4 }],
				decorator_list: [],
				type_params: [],
				lineno: 2,
				col_offset: 0,
			};
			const mod: Module = {
				nodeType: "Module",
				body: [emptyFunction, outer],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(mod)).toBe("def f():\ndef g():\n    pass");
		});

		// The parser always attaches numeric col_offset values; a missing one
		// only occurs on hand-built AST fragments, hence the `any` escape hatch.
		test("compound statement missing col_offset info is skipped by the indent detector", () => {
			// biome-ignore lint/suspicious/noExplicitAny: constructing a deliberately malformed node to exercise a defensive check
			const outer: any = {
				nodeType: "FunctionDef",
				name: "f",
				args: {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					kwonlyargs: [],
					kw_defaults: [],
					defaults: [],
				},
				body: [{ nodeType: "Pass", lineno: 1, col_offset: 4 }],
				decorator_list: [],
				type_params: [],
				lineno: 1,
				// col_offset intentionally omitted
			};
			// biome-ignore lint/suspicious/noExplicitAny: constructing a deliberately malformed node to exercise a defensive check
			const mod: any = {
				nodeType: "Module",
				body: [outer],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(mod)).toBe("def f():\n    pass");
		});
	});

	describe("F-string conversion codes outside the known set", () => {
		test("FormattedValue inside a JoinedStr with an unrecognized conversion code writes no conversion marker", () => {
			const node: JoinedStr = {
				nodeType: "JoinedStr",
				kind: 'f"',
				values: [
					{
						nodeType: "FormattedValue",
						value: {
							nodeType: "Name",
							id: "x",
							ctx: { nodeType: "Load" },
							lineno: 1,
							col_offset: 0,
						},
						conversion: 0,
						lineno: 1,
						col_offset: 0,
					},
				],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('f"{x}"');
		});

		test("standalone FormattedValue with an unrecognized conversion code writes no conversion marker", () => {
			const node: FormattedValue = {
				nodeType: "FormattedValue",
				value: {
					nodeType: "Name",
					id: "x",
					ctx: { nodeType: "Load" },
					lineno: 1,
					col_offset: 0,
				},
				conversion: 0,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("{x}");
		});
	});

	describe("String constant with an unrecognized quote-style kind", () => {
		test("falls back to double-quoted formatting when kind is neither triple nor single/double", () => {
			const node: Constant = {
				nodeType: "Constant",
				value: "hi",
				kind: "z",
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('"hi"');
		});
	});

	describe("Dict unpacking entries constructed directly", () => {
		test("a null key renders a '**value' unpacking entry", () => {
			const node: Dict = {
				nodeType: "Dict",
				keys: [
					{
						nodeType: "Constant",
						value: "a",
						lineno: 1,
						col_offset: 0,
					},
					null,
				],
				values: [
					{
						nodeType: "Constant",
						value: 1,
						lineno: 1,
						col_offset: 0,
					},
					{
						nodeType: "Name",
						id: "rest",
						ctx: { nodeType: "Load" },
						lineno: 1,
						col_offset: 0,
					},
				],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe('{"a": 1, **rest}');
		});

		test("parsing and unparsing a dict literal with ** unpacking round-trips", () => {
			testUnparse("{**a, 'b': 1, **c}", "{**a, 'b': 1, **c}");
		});
	});

	describe("Match pattern nodes with unusual shapes", () => {
		test("MatchSingleton with a value outside None/True/False falls back to String()", () => {
			const node: MatchSingleton = {
				nodeType: "MatchSingleton",
				value: 42,
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("42");
		});

		test("MatchAs with neither a wrapped pattern nor a bound name renders nothing", () => {
			const node: MatchAs = {
				nodeType: "MatchAs",
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(node)).toBe("");
		});
	});

	describe("Keyword-only arguments with a short kw_defaults array", () => {
		test("a keyword-only arg past the end of kw_defaults renders without a default", () => {
			const b: Arg = {
				nodeType: "Arg",
				arg: "b",
				lineno: 1,
				col_offset: 0,
			};
			const func: FunctionDef = {
				nodeType: "FunctionDef",
				name: "f",
				args: {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					kwonlyargs: [
						{ nodeType: "Arg", arg: "a", lineno: 1, col_offset: 0 },
						b,
					],
					kw_defaults: [
						{ nodeType: "Constant", value: 1, lineno: 1, col_offset: 0 },
					],
					defaults: [],
				},
				body: [{ nodeType: "Pass", lineno: 1, col_offset: 0 }],
				decorator_list: [],
				type_params: [],
				lineno: 1,
				col_offset: 0,
			};
			expect(unparse(func)).toBe("def f(*, a=1, b):\n    pass");
		});
	});
});
