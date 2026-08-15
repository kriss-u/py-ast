import { describe, expect, test } from "vitest";
import {
	copyLocation,
	fixMissingLocations,
	incrementLineno,
	literalEval,
	parse,
	parseFile,
} from "../src/parser.js";
import type { ASTNode, Module } from "../src/types.js";
import { PyComplex } from "../src/types.js";
import { assertNodeType, parseCode, parseExpression } from "./test-helpers.js";

describe("Empty, Whitespace, and Comment-Only Input", () => {
	test.each([
		["empty input", ""],
		["whitespace-only input", "   \n\n  \t  \n"],
		[
			"comments-only input",
			"\n# This is a comment\n# Another comment\n    # Indented comment\n",
		],
		[
			"mixed whitespace and comments",
			"\n\n# Comment 1\n\n    # Indented comment\n\n# Final comment\n\n",
		],
	])("%s produces an empty module", (_name, code) => {
		const ast = parseCode(code);
		expect(ast.nodeType).toBe("Module");
		expect(ast.body).toHaveLength(0);
	});

	test("comments-only input with { comments: true } produces a non-empty body of Comment nodes", () => {
		// Unlike the empty-module cases above (which use the default
		// comments:false), enabling the comments option turns comment-only
		// source into real Comment statement nodes instead of an empty body.
		const ast = parse("# just a comment\n", { comments: true });
		expect(ast.body.length).toBeGreaterThan(0);
	});
});

describe("Syntax Errors", () => {
	test.each<[string, string]>([
		["missing function name", "def :"],
		["missing if condition", "if :"],
		["missing for-loop variable", "for in items:"],
		["missing class name", "class :"],
		["missing import module name", "import"],
		["missing comma between parameters", "def func(x y):"],
	])("%s ('%s') throws", (_name, code) => {
		expect(() => parseCode(code)).toThrow(Error);
	});

	test("unclosed string", () => {
		expect(() => parseCode('"unclosed string')).toThrow(
			/Unterminated string literal/,
		);
	});

	test("unclosed triple string", () => {
		expect(() => parseCode('"""unclosed triple')).toThrow(
			/Unterminated triple-quoted string literal/,
		);
	});

	test.each([
		["parentheses", "(1 + 2"],
		["brackets", "[1, 2, 3"],
		["braces", "{1, 2, 3"],
	])("unmatched %s throws", (_name, code) => {
		expect(() => parseCode(code)).toThrow();
	});

	test("invalid operator '@@' throws", () => {
		expect(() => parseCode("x @@ y")).toThrow();
	});

	test("repeated unary +/- operators are valid, but a starred combination is not", () => {
		// Python accepts ++ and -- as consecutive unary/binary operators.
		expect(() => parseCode("x ++ y")).not.toThrow(); // x + (+y)
		expect(() => parseCode("x -- y")).not.toThrow(); // x - (-y)
		expect(() => parseCode("x +++ y")).not.toThrow(); // x + (+(+y))

		// But starred expressions are only valid in specific contexts.
		expect(() => parseCode("x +* y")).toThrow();
		expect(() => parseCode("x -* y")).toThrow();
	});

	test("literals cannot be assignment targets", () => {
		expect(() => parseCode("1 = x")).toThrow();
		expect(() => parseCode('"hello" = x')).toThrow();
		expect(() => parseCode("(1 + 2) = x")).toThrow();
	});
});

describe("A compound statement can't be a single-line suite's inline body", () => {
	test("a compound-statement keyword right after ':' throws (matches CPython)", () => {
		// Verified against CPython 3.13: `ast.parse('if True: class Foo: pass')`
		// raises `SyntaxError: invalid syntax` — a compound statement
		// (`class`/`def`/`if`/... ) can only start a *block* body
		// (`if True:\n    class Foo: ...`), never a single-line one.
		// This previously silently accepted it, treating the `if`'s body
		// as empty and `class Foo: pass` as a new top-level statement —
		// itself a bug, not a documented/intentional shape.
		expect(() => parseCode("if True: class Foo: pass\n")).toThrow(
			/invalid syntax/,
		);
	});
});

describe("Syntax error branches", () => {
	test.each<[string, string, RegExp]>([
		[
			"unexpected indent at statement position",
			"    x = 1\n",
			/unexpected indent/,
		],
		[
			"two small statements on one line without a separator",
			"pass pass\n",
			/invalid syntax/,
		],
		[
			"mixing except and except* on the same try (except first)",
			"try:\n    pass\nexcept ValueError:\n    pass\nexcept* TypeError:\n    pass\n",
			/cannot have both/,
		],
		[
			"mixing except and except* on the same try (except* first)",
			"try:\n    pass\nexcept* ValueError:\n    pass\nexcept TypeError:\n    pass\n",
			/cannot have both/,
		],
		[
			"'async' not followed by def/for/with",
			"async x = 1\n",
			/Invalid async statement/,
		],
		[
			"match statement missing 'case'",
			"match x:\n    y = 1\n",
			/Expected 'case'/,
		],
		["assigning to a lambda", "(lambda: 1) = 2\n", /cannot assign to/],
		["assigning to a literal", "1 = x\n", /cannot assign to literal/],
		[
			"assigning to a call expression",
			"f() = x\n",
			/cannot assign to expression/,
		],
	])("%s throws", (_name, code, expected) => {
		expect(() => parseCode(code)).toThrow(expected);
	});

	test.each<[string, string, string]>([
		[
			"class with a trailing comma in its base list",
			"class Foo(Base1, Base2,):\n    pass\n",
			"ClassDef",
		],
		[
			"class with a non-name base class expression",
			"class Foo(get_base()):\n    pass\n",
			"ClassDef",
		],
		[
			"class with a parenthesized (non-name-start) base class expression",
			"class Foo((Base)):\n    pass\n",
			"ClassDef",
		],
		[
			"class with keyword and positional bases mixed",
			"class Foo(Base1, metaclass=Meta):\n    pass\n",
			"ClassDef",
		],
		[
			"except* without a bound name",
			"try:\n    pass\nexcept* ValueError:\n    pass\n",
			"TryStar",
		],
		[
			"bare except* (no type)",
			"try:\n    pass\nexcept*:\n    pass\n",
			"TryStar",
		],
		[
			"from-import trailing comma without parens",
			"from mod import a, b,\n",
			"ImportFrom",
		],
		[
			"from-import parenthesized trailing comma",
			"from mod import (a, b,)\n",
			"ImportFrom",
		],
	])("%s parses successfully", (_name, code, expectedType) => {
		const ast = parseCode(code);
		expect(ast.body[0].nodeType).toBe(expectedType);
	});
});

describe("Indentation Errors", () => {
	test("missing indentation after colon", () => {
		expect(() => parseCode("if True:\nprint('hello')")).toThrow(
			/Expected indented block/,
		);
	});

	test("inconsistent indentation", () => {
		expect(() => parseCode("if True:\n    x = 1\n  y = 2")).toThrow();
	});

	test("unexpected indentation", () => {
		expect(() => parseCode("x = 1\n    y = 2")).toThrow();
		expect(() => parseCode("if True:\n    pass\n        x = 1")).toThrow();
	});

	test("missing dedent", () => {
		expect(() =>
			parseCode("def func():\n    x = 1\n    y = 2\n        z = 3"),
		).toThrow();
	});
});

describe("Invalid Keywords", () => {
	test.each(["def", "class", "if", "for", "while", "try"])(
		"bare '%s' keyword throws",
		(code) => {
			expect(() => parseCode(code)).toThrow();
		},
	);
});

describe("Invalid Expressions", () => {
	test("empty parentheses parse as an empty tuple, not an error", () => {
		const ast = parseCode("()");
		const stmt = ast.body[0];
		assertNodeType(stmt, "Expr");
		expect(stmt.value.nodeType).toBe("Tuple");
	});

	test("a trailing comma in a function call is valid", () => {
		expect(() => parseCode("func(1, 2,)")).not.toThrow();
	});

	test("a generator expression with no expression before 'for' throws", () => {
		expect(() => parseCode("(x for)")).toThrow();
	});

	test("a comprehension with no expression before 'for' throws", () => {
		expect(() => parseCode("[x for]")).toThrow();
	});

	test("a lambda with no body throws", () => {
		expect(() => parseCode("lambda")).toThrow();
	});
});

describe("Valid but Unusual Edge Cases", () => {
	test("a very long identifier round-trips its exact name", () => {
		const longName = `a${"b".repeat(1000)}`;
		const ast = parseCode(`${longName} = 1`);
		const stmt = ast.body[0];
		assertNodeType(stmt, "Assign");
		assertNodeType(stmt.targets[0], "Name");
		expect(stmt.targets[0].id).toBe(longName);
	});

	test("deeply nested parenthesized expression (100 levels) doesn't throw", () => {
		const nested = `${"(".repeat(100)}1${")".repeat(100)}`;
		const ast = parseCode(nested);
		expect(ast.nodeType).toBe("Module");
	});

	test("many chained method calls (50 levels) don't throw", () => {
		const chained = `obj${".method()".repeat(50)}`;
		const ast = parseCode(chained);
		expect(ast.nodeType).toBe("Module");
	});

	test("multiple statements on one line, separated by ';'", () => {
		const ast = parseCode("x = 1; y = 2; z = 3");
		expect(ast.body).toHaveLength(3);
	});

	test("backslash line continuation joins lines into one statement", () => {
		const ast = parseCode("x = 1 + \\\n    2 + \\\n    3");
		expect(ast.body).toHaveLength(1);
	});

	test("implicit line joining inside brackets", () => {
		const ast = parseCode("x = [\n    1,\n    2,\n    3\n]");
		expect(ast.body).toHaveLength(1);
	});

	test("source ending in a bare name with no trailing newline", () => {
		const ast = parseCode("x");
		expect(ast.body[0].nodeType).toBe("Expr");
	});

	test("trailing inline comment with no trailing newline", () => {
		const ast = parse("x = 1  # trailing", { comments: true });
		expect(ast.body[0].nodeType).toBe("Assign");
	});
});

describe("Unicode and Special Characters", () => {
	test.each([
		["CJK identifier", "变量 = 'value'"],
		["Greek-letter identifier", "π = 3.14159"],
	])("%s parses as an Assign", (_name, code) => {
		const ast = parseCode(code);
		const stmt = ast.body[0];
		assertNodeType(stmt, "Assign");
	});

	test("unicode string literal decodes its exact content", () => {
		const expr = parseExpression("'Hello 世界 🌍'");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("Hello 世界 🌍");
	});

	test("non-ASCII string literal decodes its exact content", () => {
		const expr = parseExpression("'café'");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("café");
	});

	test("raw strings leave backslash escapes undecoded", () => {
		const expr = parseExpression("r'raw\\nstring'");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("raw\\nstring");
	});

	test("triple-quoted strings decode their exact multi-line content", () => {
		const expr = parseExpression('"""\nMulti-line\nstring\n"""');
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("\nMulti-line\nstring\n");
	});

	test("emoji are not valid identifier characters", () => {
		expect(() => parseCode("🐍 = 'python'")).toThrow(/Unexpected character/);
		expect(() => parseCode("x🔥 = 1")).toThrow(/Unexpected character/);
	});
});

describe("Number Edge Cases", () => {
	test("a very large integer literal parses as a Constant", () => {
		const largeNum = `1${"0".repeat(100)}`;
		const expr = parseExpression(largeNum);
		assertNodeType(expr, "Constant");
		expect(typeof expr.value).toBe("number");
	});

	test("scientific notation parses as a numeric Constant", () => {
		const expr = parseExpression("1.23e-45");
		assertNodeType(expr, "Constant");
		expect(typeof expr.value).toBe("number");
	});

	test.each(["1j", "1.5j", "0j", "1e10j"])(
		"complex literal '%s' parses as a Constant",
		(num) => {
			const expr = parseExpression(num);
			assertNodeType(expr, "Constant");
		},
	);

	test.each([
		["hexadecimal", "0xDEADBEEF"],
		["binary", "0b101010"],
		["octal", "0o777"],
	])("%s number literal parses as a Constant", (_name, code) => {
		const expr = parseExpression(code);
		assertNodeType(expr, "Constant");
	});
});

describe("String Edge Cases", () => {
	test.each<[string, string, string]>([
		["empty string", '""', ""],
		["escape sequences", '"\\n\\t\\r\\\\"', "\n\t\r\\"],
		["raw string keeps escapes literal", 'r"\\n\\t"', "\\n\\t"],
		[
			"triple-quoted string",
			'"""This is a\nmulti-line\nstring"""',
			"This is a\nmulti-line\nstring",
		],
		["mixed quotes inside a string", "'He said \"Hello\"'", 'He said "Hello"'],
	])("%s decodes to %j", (_name, code, expected) => {
		const expr = parseExpression(code);
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe(expected);
	});
});

describe("Complex Nested Structures", () => {
	test("deeply nested function calls build a matching Call chain", () => {
		const expr = parseExpression("f(g(h(i(j(k())))))");
		assertNodeType(expr, "Call");

		let current = expr;
		let depth = 1;
		while (current.args.length > 0 && current.args[0].nodeType === "Call") {
			current = current.args[0];
			depth++;
		}
		expect(depth).toBeGreaterThan(3);
	});

	test("deeply nested attribute access builds a matching Attribute chain", () => {
		const expr = parseExpression("a.b.c.d.e.f.g");
		assertNodeType(expr, "Attribute");

		let current = expr;
		let depth = 1;
		while (current.value && current.value.nodeType === "Attribute") {
			current = current.value;
			depth++;
		}
		expect(depth).toBeGreaterThan(5);
	});

	test("nested list comprehensions with filters at both levels", () => {
		const expr = parseExpression(`[
      [
        item.upper()
        for item in row
        if item.startswith('a')
      ]
      for row in matrix
      if len(row) > 0
    ]`);
		assertNodeType(expr, "ListComp");
		assertNodeType(expr.elt, "ListComp");
	});

	test("a single-line nested comprehension with a filter on the outer loop", () => {
		const expr = parseExpression("[[y for y in x] for x in matrix if x]");
		assertNodeType(expr, "ListComp");
		assertNodeType(expr.elt, "ListComp");
	});

	test("nested function definitions", () => {
		const code = `
def outer():
    def inner():
        def deepest():
            return 42
        return deepest()
    return inner()
`;
		const ast = parseCode(code);
		expect(ast.body[0].nodeType).toBe("FunctionDef");
	});

	test("nested class definitions", () => {
		const code = `
class Outer:
    class Inner:
        class Deepest:
            pass
`;
		const ast = parseCode(code);
		expect(ast.body[0].nodeType).toBe("ClassDef");
	});
});

describe("Function and Class Edge Cases", () => {
	test("positional-only parameters", () => {
		const ast = parseCode("def func(a, b, /, c, d): pass");
		expect(ast.body[0].nodeType).toBe("FunctionDef");
	});

	test("keyword-only parameters", () => {
		const ast = parseCode("def func(a, *, b, c=1): pass");
		expect(ast.body[0].nodeType).toBe("FunctionDef");
	});

	test("positional-only, normal, *args, keyword-only, and **kwargs all together", () => {
		const ast = parseCode(`
def complex_func(
    pos_only1, pos_only2, /,
    normal1, normal2='default',
    *args,
    kw_only1, kw_only2=42,
    **kwargs
): pass
`);
		assertNodeType(ast.body[0], "FunctionDef");
	});

	test("async function with an await expression", () => {
		const ast = parseCode("async def func(): await something()");
		expect(ast.body[0].nodeType).toBe("AsyncFunctionDef");
	});

	test("multiple stacked decorators, including a call and an attribute access", () => {
		const code = `
@decorator1
@decorator2(arg)
@decorator3.method
def func(): pass
`;
		const ast = parseCode(code);
		const stmt = ast.body[0];
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.decorator_list).toHaveLength(3);
	});

	test("class with multiple base classes, including a dotted one", () => {
		const code = "class Child(Parent1, Parent2, mixin.Mixin): pass";
		const ast = parseCode(code);
		const stmt = ast.body[0];
		assertNodeType(stmt, "ClassDef");
		expect(stmt.bases).toHaveLength(3);
	});
});

describe("Collection Edge Cases", () => {
	test.each<[string, string, number]>([
		["list", "[1, 2, 3,]", 3],
		["tuple", "(1, 2, 3,)", 3],
	])("trailing comma in a %s literal is allowed", (_name, code, length) => {
		const expr = parseExpression(code);
		expect((expr as { elts: unknown[] }).elts).toHaveLength(length);
	});

	test("trailing comma in a dict literal is allowed", () => {
		const dict = parseExpression("{'a': 1, 'b': 2,}");
		assertNodeType(dict, "Dict");
		expect(dict.keys).toHaveLength(2);
	});

	test("single element tuple", () => {
		const expr = parseExpression("(1,)");
		assertNodeType(expr, "Tuple");
		expect(expr.elts).toHaveLength(1);
	});

	test("empty tuple", () => {
		const expr = parseExpression("()");
		assertNodeType(expr, "Tuple");
		expect(expr.elts).toHaveLength(0);
	});
});

describe("Parameter list ordering (verified against CPython 3.13)", () => {
	test.each<[string, string, RegExp]>([
		[
			"repeated '/' separator",
			"def f(a, /, b, /, c): pass",
			/\/ may appear only once/,
		],
		[
			"repeated '/' separator in a lambda",
			"lambda a, /, /: a",
			/\/ may appear only once/,
		],
		[
			"repeated bare '*'",
			"def f(a, *, b, *, c): pass",
			/\* argument may appear only once/,
		],
		[
			"repeated '*args'",
			"def f(*a, *b): pass",
			/\* argument may appear only once/,
		],
		["'/' after '*'", "def f(*, /): pass", /\/ must be ahead of \*/],
		[
			"a parameter after '**kwargs'",
			"def f(**a, b): pass",
			/arguments cannot follow var-keyword argument/,
		],
		[
			"a second '**kwargs'",
			"def f(*a, **b, *c): pass",
			/arguments cannot follow var-keyword argument/,
		],
		[
			"a bare '*' with no following parameter",
			"def f(*): pass",
			/named arguments must follow bare \*/,
		],
		[
			"a bare '*' followed only by '**kwargs'",
			"def f(*, **a): pass",
			/named arguments must follow bare \*/,
		],
		[
			"a required positional parameter after a defaulted one",
			"def f(a, b=1, c): pass",
			/parameter without a default follows parameter with a default/,
		],
		[
			"a required positional parameter after a defaulted one (default first)",
			"def f(a=1, b): pass",
			/parameter without a default follows parameter with a default/,
		],
	])("%s is rejected", (_name, code, expected) => {
		expect(() => parseCode(code)).toThrow(expected);
	});

	test("keyword-only parameters may freely mix defaulted and non-defaulted", () => {
		expect(() => parseCode("def f(a, *, b=1, c): pass")).not.toThrow();
	});

	test("the same ordering rules apply to lambda parameter lists", () => {
		expect(() => parseCode("lambda **a, b: a")).toThrow(
			/arguments cannot follow var-keyword argument/,
		);
		expect(() => parseCode("lambda *, /: a")).toThrow(/\/ must be ahead of \*/);
		expect(() => parseCode("lambda *a, *b: a")).toThrow(
			/\* argument may appear only once/,
		);
		expect(() => parseCode("lambda a, b=1, c: a")).toThrow(
			/parameter without a default follows parameter with a default/,
		);
		expect(() => parseCode("lambda *: a")).toThrow(
			/named arguments must follow bare \*/,
		);
	});

	test("duplicate parameter names are accepted (CPython only rejects this at compile time, not in ast.parse)", () => {
		expect(() => parseCode("def f(a, a): pass")).not.toThrow();
	});

	test("a positional-only and keyword-only parameter may share a name", () => {
		expect(() => parseCode("def f(a, /, *, a): pass")).not.toThrow();
	});
});

describe("Call argument ordering (verified against CPython 3.13)", () => {
	test.each<[string, string, RegExp | undefined]>([
		[
			"a positional argument after a keyword argument",
			"f(a, b, a=1, b)",
			/positional argument follows keyword argument /,
		],
		[
			"a positional argument after '**kwargs' unpacking",
			"f(**a, b)",
			/positional argument follows keyword argument unpacking/,
		],
		[
			"'*args' unpacking after '**kwargs' unpacking",
			"f(*a, **b, *c)",
			/iterable argument unpacking follows keyword argument unpacking/,
		],
		["'*args' unpacking after a keyword argument", "f(a=1, *b)", undefined],
		[
			"a plain positional argument after '*args' unpacking",
			"f(*a, b)",
			undefined,
		],
		[
			"a keyword argument after '**kwargs' unpacking",
			"f(a=1, **b, c=2)",
			undefined,
		],
	])("%s", (_name, code, expected) => {
		if (expected) {
			expect(() => parseCode(code)).toThrow(expected);
		} else {
			expect(() => parseCode(code)).not.toThrow();
		}
	});
});

describe("Comprehension unpacking (verified against CPython 3.13)", () => {
	test("starred iterable unpacking in a list comprehension is rejected", () => {
		expect(() => parseCode("[*x for x in y]")).toThrow(
			/iterable unpacking cannot be used in comprehension/,
		);
	});
});

describe("Performance and Stress Tests", () => {
	test("a 1000-element list literal parses fully", () => {
		const items = Array.from({ length: 1000 }, (_, i) => i).join(", ");
		const expr = parseExpression(`[${items}]`);
		assertNodeType(expr, "List");
		expect(expr.elts).toHaveLength(1000);
	});

	test("50 levels of nested function calls don't throw", () => {
		const nested = `f(${"g(".repeat(50)}1${")".repeat(50)})`;
		const ast = parseCode(nested);
		expect(ast.nodeType).toBe("Module");
	});

	test("a 10000-character string literal decodes fully", () => {
		const longString = `"${"a".repeat(10000)}"`;
		const expr = parseExpression(longString);
		assertNodeType(expr, "Constant");
		expect(expr.value).toHaveLength(10000);
	});
});

describe("Parser Utilities", () => {
	test("parseFile is unimplemented", () => {
		expect(() => parseFile("nonexistent.py")).toThrow(
			/parseFile not implemented/,
		);
	});

	test("literalEval evaluates a list", () => {
		expect(literalEval("[1, 2, 3]")).toEqual([1, 2, 3]);
	});

	test("literalEval evaluates a tuple", () => {
		expect(literalEval("(1, 2, 3)")).toEqual([1, 2, 3]);
	});

	test("literalEval evaluates a dict", () => {
		expect(literalEval("{'a': 1, 'b': 2}")).toEqual({ a: 1, b: 2 });
	});

	test("literalEval evaluates a set", () => {
		expect(literalEval("{1, 2, 3}")).toEqual(new Set([1, 2, 3]));
	});

	test("literalEval evaluates unary plus/minus", () => {
		expect(literalEval("-5")).toBe(-5);
		expect(literalEval("+5")).toBe(5);
	});

	test("literalEval evaluates binary add/sub of numbers", () => {
		expect(literalEval("1 + 2")).toBe(3);
		expect(literalEval("5 - 2")).toBe(3);
	});

	test("literalEval evaluates imaginary literals", () => {
		expect(literalEval("4j")).toEqual(new PyComplex(0, 4));
		expect(literalEval("+4j")).toEqual(new PyComplex(0, 4));
		expect(literalEval("-4j")).toEqual(new PyComplex(-0, -4));
		expect(literalEval("3 + 4j")).toEqual(new PyComplex(3, 4));
		expect(literalEval("3 - 4j")).toEqual(new PyComplex(3, -4));
		expect(literalEval("4j + 3")).toEqual(new PyComplex(3, 4));
		expect(literalEval("4j - 3")).toEqual(new PyComplex(-3, 4));
		expect(literalEval("4j + 3j")).toEqual(new PyComplex(0, 7));
		expect(literalEval("4j - 3j")).toEqual(new PyComplex(0, 1));
		expect(() => literalEval("4j * 2")).toThrow(/Cannot evaluate/);
	});

	test("literalEval throws with no expression statement", () => {
		expect(() => literalEval("x = 1\n")).toThrow(
			/No expression found to evaluate/,
		);
	});

	test("literalEval throws on unsupported node type", () => {
		expect(() => literalEval("f()")).toThrow(/Cannot evaluate/);
	});

	test("literalEval throws on unsupported unary operator", () => {
		expect(() => literalEval("~5")).toThrow(
			/Cannot evaluate UnaryOp in literal context/,
		);
	});

	test("literalEval throws on unsupported binary operator", () => {
		expect(() => literalEval("2 * 3")).toThrow(
			/Cannot evaluate BinOp in literal context/,
		);
	});

	test("copyLocation copies position fields", () => {
		const oldNode: ASTNode = {
			nodeType: "Name",
			lineno: 5,
			col_offset: 3,
			end_lineno: 5,
			end_col_offset: 10,
		} as unknown as ASTNode;
		const newNode: ASTNode = {
			nodeType: "Name",
			lineno: 1,
			col_offset: 0,
		} as unknown as ASTNode;
		const result = copyLocation(newNode, oldNode);
		expect(result.lineno).toBe(5);
		expect(result.col_offset).toBe(3);
		expect(result.end_lineno).toBe(5);
		expect(result.end_col_offset).toBe(10);
	});

	test("fixMissingLocations fills in nested nodes recursively", () => {
		const module: Module = parseCode("x = 1\n");
		const assign = module.body[0] as ASTNode & {
			lineno: number | undefined;
			col_offset: number | undefined;
		};
		assign.lineno = undefined;
		assign.col_offset = undefined;
		const fixed = fixMissingLocations(module) as Module;
		const fixedAssign = fixed.body[0] as ASTNode;
		expect(fixedAssign.lineno).toBe(1);
		expect(fixedAssign.col_offset).toBe(0);
	});

	test("fixMissingLocations handles non-object input gracefully", () => {
		const module = parseCode("x = 1\n");
		expect(() => fixMissingLocations(module)).not.toThrow();
	});

	test("fixMissingLocations falls back to parent location for a child whose own location keys are absent (array and object fields)", () => {
		const raw = {
			nodeType: "Module",
			lineno: 7,
			col_offset: 2,
			end_lineno: 7,
			end_col_offset: 20,
			body: [
				{
					nodeType: "Wrapper",
					child: {
						nodeType: "Constant",
						value: 1,
						lineno: undefined,
						col_offset: undefined,
					},
					children: [
						{
							nodeType: "Constant",
							value: 2,
							lineno: undefined,
							col_offset: undefined,
						},
					],
				},
			],
		} as unknown as ASTNode & {
			body: (ASTNode & {
				child: ASTNode;
				children: ASTNode[];
			})[];
		};
		const fixed = fixMissingLocations(raw) as typeof raw;
		const wrapper = fixed.body[0];
		expect(wrapper.child.lineno).toBe(7);
		expect(wrapper.child.col_offset).toBe(2);
		expect(wrapper.children[0].lineno).toBe(7);
		expect(wrapper.children[0].col_offset).toBe(2);
	});

	test("fixMissingLocations skips primitive items inside array fields", () => {
		const module = parseCode("global a, b\n");
		expect(() => fixMissingLocations(module)).not.toThrow();
	});

	test("fixMissingLocations fills in missing end_lineno/end_col_offset", () => {
		const node = {
			nodeType: "Name",
			lineno: 1,
			col_offset: 0,
			end_lineno: undefined,
			end_col_offset: undefined,
		} as unknown as ASTNode;
		const fixed = fixMissingLocations(node) as unknown as {
			end_lineno: number;
			end_col_offset: number;
		};
		expect(fixed.end_lineno).toBe(1);
		expect(fixed.end_col_offset).toBe(0);
	});

	test("incrementLineno shifts lineno/end_lineno recursively", () => {
		const module = parseCode("x = 1\ny = 2\n");
		const shifted = incrementLineno(module, 10) as Module;
		expect(shifted.body[0].lineno).toBe(11);
		expect(shifted.body[1].lineno).toBe(12);
	});

	test("incrementLineno defaults to shifting by 1", () => {
		const module = parseCode("x = 1\n");
		const shifted = incrementLineno(module) as Module;
		expect(shifted.body[0].lineno).toBe(2);
	});

	test("incrementLineno skips primitive items inside array fields", () => {
		const module = parseCode("global a, b\n");
		expect(() => incrementLineno(module)).not.toThrow();
	});

	test("incrementLineno shifts a numeric end_lineno field", () => {
		const node = {
			nodeType: "Name",
			lineno: 1,
			col_offset: 0,
			end_lineno: 1,
			end_col_offset: 5,
		} as unknown as ASTNode;
		const shifted = incrementLineno(node, 3) as unknown as {
			end_lineno: number;
		};
		expect(shifted.end_lineno).toBe(4);
	});
});
