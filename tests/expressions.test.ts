import { describe, expect, test } from "vitest";
import { PyComplex, parse } from "../src/index.js";
import type { ExprNode, StmtNode } from "../src/types.js";
import { unparse } from "../src/unparser.js";
import { assertNodeType, parseCode, parseExpression } from "./test-helpers.js";

describe("Basic Python Literals", () => {
	test("integer literals", () => {
		const expr = parseExpression("42");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe(42);
	});

	test("float literals", () => {
		const expr = parseExpression("3.14");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe(3.14);
	});

	test("string literals", () => {
		const expr = parseExpression("'hello world'");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("hello world");
	});

	test("boolean literals", () => {
		const trueExpr = parseExpression("True");
		assertNodeType(trueExpr, "Constant");
		expect(trueExpr.value).toBe(true);

		const falseExpr = parseExpression("False");
		assertNodeType(falseExpr, "Constant");
		expect(falseExpr.value).toBe(false);
	});

	test("None literal", () => {
		const expr = parseExpression("None");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBeNull();
	});

	test("bytes literals", () => {
		const expr = parseExpression("b'hello'");
		assertNodeType(expr, "Constant");
		// Note: Implementation may vary for bytes handling
	});

	test("complex numbers", () => {
		const expr = parseExpression("1 + 2j");
		assertNodeType(expr, "BinOp");
		expect(expr.left.nodeType).toBe("Constant");
		expect(expr.right.nodeType).toBe("Constant");
		expect(expr.op.nodeType).toBe("Add");
	});

	test("imaginary literal is a PyComplex, not a truncated number", () => {
		const expr = parseExpression("4j");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBeInstanceOf(PyComplex);
		expect(expr.value).toEqual(new PyComplex(0, 4));
	});

	test("imaginary literal variations", () => {
		const cases: [string, number][] = [
			["1j", 1],
			["1.5j", 1.5],
			["0j", 0],
			["1e10j", 1e10],
			["1_000j", 1000],
		];
		for (const [source, imag] of cases) {
			const expr = parseExpression(source);
			assertNodeType(expr, "Constant");
			expect(expr.value).toEqual(new PyComplex(0, imag));
		}
	});

	test("hex, octal, binary literals", () => {
		const hexExpr = parseExpression("0xFF");
		assertNodeType(hexExpr, "Constant");
		expect(hexExpr.value).toBe(255);

		const octExpr = parseExpression("0o755");
		assertNodeType(octExpr, "Constant");
		expect(octExpr.value).toBe(493);

		const binExpr = parseExpression("0b101");
		assertNodeType(binExpr, "Constant");
		expect(binExpr.value).toBe(5);
	});

	test("a hex literal whose digits include 'e'/'E' isn't mistaken for a float exponent", () => {
		// `0x008e`'s hex digits happen to contain 'e', which must not be
		// read as a decimal-float exponent marker (e.g. as if it were
		// `0x008 * 10**?`) the way a plain-decimal literal's 'e' would be.
		const lower = parseExpression("0x008e");
		assertNodeType(lower, "Constant");
		expect(lower.value).toBe(0x008e);

		const upper = parseExpression("0X00E8");
		assertNodeType(upper, "Constant");
		expect(upper.value).toBe(0x00e8);
	});

	test("a hex literal too large for a safe number parses as a bigint", () => {
		const expr = parseExpression(`0x${"F".repeat(20)}`);
		assertNodeType(expr, "Constant");
		expect(typeof expr.value).toBe("bigint");
		expect(expr.value).toBe(BigInt(`0x${"F".repeat(20)}`));
	});
});

describe("Implicit string literal concatenation", () => {
	test("two adjacent plain strings fold into one Constant", () => {
		const expr = parseExpression('"a" "b"');
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("ab");
	});

	test("three adjacent strings with mixed quote styles fold into one Constant", () => {
		const expr = parseExpression(`'a' "b" '''c'''`);
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("abc");
	});

	test("adjacent strings split across parenthesized lines still concatenate", () => {
		const expr = parseExpression('(\n"a"\n"b"\n)');
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("ab");
	});

	test("plain string adjacent to an f-string produces a single JoinedStr", () => {
		const expr = parseExpression('f"a{1}" "b"');
		assertNodeType(expr, "JoinedStr");
		expect(expr.values).toMatchObject([
			{ nodeType: "Constant", value: "a" },
			{ nodeType: "FormattedValue" },
			{ nodeType: "Constant", value: "b" },
		]);
	});

	test("f-string adjacent to a plain string merges trailing/leading literal text", () => {
		const expr = parseExpression('"a" f"b{1}c" "d"');
		assertNodeType(expr, "JoinedStr");
		// "a" and the f-string's leading "b" literal merge into one Constant,
		// as do the f-string's trailing "c" literal and the final "d".
		expect(expr.values).toMatchObject([
			{ nodeType: "Constant", value: "ab" },
			{ nodeType: "FormattedValue" },
			{ nodeType: "Constant", value: "cd" },
		]);
	});

	test("assert message built from parenthesized adjacent strings", () => {
		const module = parse('assert True, (\n"a"\n"b"\n)\n');
		const assertStmt = module.body[0] as unknown as {
			nodeType: string;
			msg: { nodeType: string; value: string };
		};
		expect(assertStmt.nodeType).toBe("Assert");
		expect(assertStmt.msg.nodeType).toBe("Constant");
		expect(assertStmt.msg.value).toBe("ab");
	});
});

describe("Collections", () => {
	test("list literals", () => {
		const expr = parseExpression("[1, 2, 3]");
		assertNodeType(expr, "List");
		expect(expr.elts).toHaveLength(3);
		expect(expr.elts[0].nodeType).toBe("Constant");
	});

	test("tuple literals", () => {
		const expr = parseExpression("(1, 2, 3)");
		assertNodeType(expr, "Tuple");
		expect(expr.elts).toHaveLength(3);
	});

	test("set literals", () => {
		const expr = parseExpression("{1, 2, 3}");
		assertNodeType(expr, "Set");
		expect(expr.elts).toHaveLength(3);
	});

	test("dict literals", () => {
		const expr = parseExpression("{'a': 1, 'b': 2}");
		assertNodeType(expr, "Dict");
		expect(expr.keys).toHaveLength(2);
		expect(expr.values).toHaveLength(2);
	});

	test("dict literals with ** unpacking", () => {
		const expr = parseExpression("{**a, **b, 1: 2, **c}");
		assertNodeType(expr, "Dict");
		expect(expr.keys).toEqual([
			null,
			null,
			expect.objectContaining({ nodeType: "Constant" }),
			null,
		]);
		expect(expr.values).toHaveLength(4);
		expect(expr.values[0]).toMatchObject({ nodeType: "Name", id: "a" });
		expect(expr.values[1]).toMatchObject({ nodeType: "Name", id: "b" });
		expect(expr.values[3]).toMatchObject({ nodeType: "Name", id: "c" });
	});

	test("dict literal with ** unpacking after a key:value entry", () => {
		const expr = parseExpression("{1: 2, **a}");
		assertNodeType(expr, "Dict");
		expect(expr.keys).toEqual([
			expect.objectContaining({ nodeType: "Constant" }),
			null,
		]);
		expect(expr.values[1]).toMatchObject({ nodeType: "Name", id: "a" });
	});

	test("dict literal with only ** unpacking", () => {
		const expr = parseExpression("{**a}");
		assertNodeType(expr, "Dict");
		expect(expr.keys).toEqual([null]);
		expect(expr.values).toHaveLength(1);
		expect(expr.values[0]).toMatchObject({ nodeType: "Name", id: "a" });
	});

	test("dict literal with parenthesized ternary after **", () => {
		const expr = parseExpression("{**(a if b else c)}");
		assertNodeType(expr, "Dict");
		expect(expr.keys).toEqual([null]);
		expect(expr.values[0].nodeType).toBe("IfExp");
	});

	test("dict literal rejects unparenthesized ternary after ** (matches CPython bitor precedence)", () => {
		expect(() => parseExpression("{**a if b else c}")).toThrow();
	});

	test("dict literal with trailing comma after ** unpacking", () => {
		const expr = parseExpression("{**a,}");
		assertNodeType(expr, "Dict");
		expect(expr.keys).toEqual([null]);
	});

	test("list literal trailing comma with a comment after the comma", () => {
		const ast = parse("[1,  # c\n 2]\n", { comments: true });
		const stmt = ast.body[0];
		assertNodeType(stmt, "Expr");
		assertNodeType(stmt.value, "List");
		expect(stmt.value.elts).toHaveLength(2);
	});

	test("set literal trailing comma", () => {
		const expr = parseExpression("{1, 2,}");
		assertNodeType(expr, "Set");
		expect(expr.elts).toHaveLength(2);
	});

	test("empty collections", () => {
		const emptyList = parseExpression("[]");
		assertNodeType(emptyList, "List");
		expect(emptyList.elts).toHaveLength(0);

		const emptyDict = parseExpression("{}");
		assertNodeType(emptyDict, "Dict");
		expect(emptyDict.keys).toHaveLength(0);

		const emptySet = parseExpression("set()");
		assertNodeType(emptySet, "Call");
		expect(emptySet.func.nodeType).toBe("Name");
	});
});

describe("Names and Identifiers", () => {
	test("simple names", () => {
		const expr = parseExpression("variable_name");
		assertNodeType(expr, "Name");
		expect(expr.id).toBe("variable_name");
		expect(expr.ctx.nodeType).toBe("Load");
	});

	test("attribute access", () => {
		const expr = parseExpression("obj.attr");
		assertNodeType(expr, "Attribute");
		expect(expr.attr).toBe("attr");
		expect(expr.value.nodeType).toBe("Name");
		expect(expr.ctx.nodeType).toBe("Load");
	});

	test("chained attribute access", () => {
		const expr = parseExpression("obj.attr.method");
		assertNodeType(expr, "Attribute");
		expect(expr.attr).toBe("method");
		expect(expr.value.nodeType).toBe("Attribute");
	});

	test("subscript access", () => {
		const expr = parseExpression("obj[key]");
		assertNodeType(expr, "Subscript");
		expect(expr.value.nodeType).toBe("Name");
		expect(expr.slice.nodeType).toBe("Name");
		expect(expr.ctx.nodeType).toBe("Load");
	});
});

describe("Slice Operations", () => {
	test("simple slice", () => {
		const expr = parseExpression("obj[1:5]");
		assertNodeType(expr, "Subscript");
		assertNodeType(expr.slice, "Slice");
		expect(expr.slice.lower?.nodeType).toBe("Constant");
		expect(expr.slice.upper?.nodeType).toBe("Constant");
	});

	test("slice with step", () => {
		const expr = parseExpression("obj[1:10:2]");
		assertNodeType(expr, "Subscript");
		assertNodeType(expr.slice, "Slice");
		expect(expr.slice.step?.nodeType).toBe("Constant");
	});

	test("open slices", () => {
		const expr1 = parseExpression("obj[1:]");
		assertNodeType(expr1, "Subscript");
		assertNodeType(expr1.slice, "Slice");
		expect(expr1.slice.lower?.nodeType).toBe("Constant");
		expect(expr1.slice.upper).toBeUndefined();

		const expr2 = parseExpression("obj[:5]");
		assertNodeType(expr2, "Subscript");
		assertNodeType(expr2.slice, "Slice");
		expect(expr2.slice.lower).toBeUndefined();
		expect(expr2.slice.upper?.nodeType).toBe("Constant");

		const expr3 = parseExpression("obj[::]");
		assertNodeType(expr3, "Subscript");
		assertNodeType(expr3.slice, "Slice");
		expect(expr3.slice.lower).toBeUndefined();
		expect(expr3.slice.upper).toBeUndefined();
		expect(expr3.slice.step).toBeUndefined();
	});

	test("omitted lower bound: col_offset points at the colon, not the upper-bound expression", () => {
		// Verified against CPython 3.13: `ast.parse('x[:3]', mode='eval')`
		// gives the Slice node col_offset 2 (the `:`), not 3 (the `3`).
		const expr = parseExpression("x[:3]");
		assertNodeType(expr, "Subscript");
		assertNodeType(expr.slice, "Slice");
		expect(expr.slice.col_offset).toBe(2);
	});

	test("lower bound with an explicit empty step (trailing colon before ']')", () => {
		const expr = parseExpression("x[1:2:]");
		assertNodeType(expr, "Subscript");
		assertNodeType(expr.slice, "Slice");
		expect(expr.slice.step).toBeUndefined();
	});
});

describe("Tuple/Subscript Parsing Edge Shapes", () => {
	test("assignment RHS testlist with three or more elements keeps building past the first comma", () => {
		// A plain `a, b, c` expression statement is parsed by the separate
		// parseTestListWithStar; assigning to a testlist RHS (parseTestList)
		// is the only way to exercise this loop.
		const ast = parseCode("x = 1, 2, 3\n");
		const assign = ast.body[0];
		assertNodeType(assign, "Assign");
		assertNodeType(assign.value, "Tuple");
		expect(assign.value.elts).toHaveLength(3);
	});

	test("assignment RHS testlist starting at column 0 (via line continuation) uses its own col_offset", () => {
		const ast = parseCode("x = \\\n1, 2, 3\n");
		const assign = ast.body[0];
		assertNodeType(assign, "Assign");
		expect(assign.value.col_offset).toBe(0);
	});

	test("comprehension target spanning a line continuation starts at column 0", () => {
		const ast = parseCode("data = [x for\na, b in pairs]\n");
		const assign = ast.body[0];
		assertNodeType(assign, "Assign");
		assertNodeType(assign.value, "ListComp");
		const target = assign.value.generators[0].target;
		expect(target.nodeType).toBe("Tuple");
		expect(target.col_offset).toBe(0);
	});

	test("subscript list spanning a line continuation starts at column 0", () => {
		const ast = parseCode("x[\n0,\n1]\n");
		const expr = ast.body[0];
		assertNodeType(expr, "Expr");
		assertNodeType(expr.value, "Subscript");
		expect(expr.value.slice.col_offset).toBe(0);
	});

	test("slice with a lower bound spanning a line continuation starts at column 0", () => {
		const ast = parseCode("x[\n0:1]\n");
		const expr = ast.body[0];
		assertNodeType(expr, "Expr");
		assertNodeType(expr.value, "Subscript");
		expect(expr.value.slice.col_offset).toBe(0);
	});

	test.each<[string, string, number]>([
		["for-loop target, 1 element", "for x, in seq:\n    pass\n", 1],
		["for-loop target, 2 elements", "for a, b, in y:\n    pass\n", 2],
	])(
		"%s: a trailing comma immediately before 'in' still builds a Tuple",
		(_name, code, length) => {
			const ast = parseCode(code);
			const forStmt = ast.body[0];
			assertNodeType(forStmt, "For");
			assertNodeType(forStmt.target, "Tuple");
			expect(forStmt.target.elts).toHaveLength(length);
		},
	);

	test("for-loop target with three elements (no trailing comma) keeps building past the second comma", () => {
		const ast = parseCode("for a, b, c in y:\n    pass\n");
		const forStmt = ast.body[0];
		assertNodeType(forStmt, "For");
		assertNodeType(forStmt.target, "Tuple");
		expect(forStmt.target.elts).toHaveLength(3);
	});

	test.each<[string, number]>([
		["x[1,]\n", 1],
		["x[1, 2,]\n", 2],
		["x[1, 2, 3,]\n", 3],
	])(
		"subscript list '%s' with a trailing comma immediately before ']' keeps %i elements",
		(code, length) => {
			const ast = parseCode(code);
			const expr = ast.body[0];
			assertNodeType(expr, "Expr");
			assertNodeType(expr.value, "Subscript");
			assertNodeType(expr.value.slice, "Tuple");
			expect(expr.value.slice.elts).toHaveLength(length);
		},
	);
});

describe("F-string Support", () => {
	test("f-strings in list with inline comments should parse correctly", () => {
		const code = `
def format_examples():
    # Comment before the list
    formatted = [
        f"Expression: 2 + 3 = {2 + 3}", # Inline comment
        f"Dict access: {test_dict['key']}",
    ]
    # Comment after the list
    return formatted
`;

		// This should not throw when comments are enabled
		expect(() => {
			parse(code, { comments: true });
		}).not.toThrow();

		const ast = parse(code, { comments: true });
		expect(ast.nodeType).toBe("Module");
		expect(ast.body).toHaveLength(1);

		// Check that the function contains the list with f-strings
		const funcDef = ast.body[0];
		assertNodeType(funcDef, "FunctionDef");
		expect(funcDef.name).toBe("format_examples");
	});

	test("main regression: f-strings in list with inline comments", () => {
		// This is the exact pattern that was failing in the original issue
		const code = `formatted = [
    f"Expression: 2 + 3 = {2 + 3}",  # Debug format alternative
    f"Dict access: {test_dict['key']}",
]`;

		expect(() => {
			parse(code, { comments: true });
		}).not.toThrow();

		const ast = parse(code, { comments: true });
		expect(ast.nodeType).toBe("Module");

		// Should contain one assignment statement
		const assign = ast.body[0];
		assertNodeType(assign, "Assign");
		assertNodeType(assign.value, "List");
		expect(assign.value.elts).toHaveLength(2);

		// Both elements should be JoinedStr (f-strings)
		expect(assign.value.elts[0].nodeType).toBe("JoinedStr");
		expect(assign.value.elts[1].nodeType).toBe("JoinedStr");
	});

	test("format spec with a nested replacement field parses as a JoinedStr", () => {
		const expr = parseExpression('f"{name!r:>{10}}"');
		assertNodeType(expr, "JoinedStr");
		const formattedValue = expr.values[0];
		assertNodeType(formattedValue, "FormattedValue");
		expect(formattedValue.conversion).toBe(114); // 'r'

		const formatSpec = formattedValue.format_spec;
		assertNodeType(formatSpec, "JoinedStr");
		expect(formatSpec.values).toHaveLength(2);
		expect(formatSpec.values[0]).toMatchObject({
			nodeType: "Constant",
			value: ">",
		});

		const nested = formatSpec.values[1];
		assertNodeType(nested, "FormattedValue");
		expect(nested.conversion).toBe(-1);
		expect(nested.value).toMatchObject({ nodeType: "Constant", value: 10 });
		expect(nested.format_spec).toBeUndefined();
	});

	test("format spec with multiple levels of nested replacement fields", () => {
		const expr = parseExpression('f"{x:{y:{z}}}"');
		assertNodeType(expr, "JoinedStr");

		const outer = expr.values[0];
		assertNodeType(outer, "FormattedValue");
		assertNodeType(outer.value, "Name");
		expect(outer.value.id).toBe("x");

		const middleSpec = outer.format_spec;
		assertNodeType(middleSpec, "JoinedStr");
		const middle = middleSpec.values[0];
		assertNodeType(middle, "FormattedValue");
		assertNodeType(middle.value, "Name");
		expect(middle.value.id).toBe("y");

		const innerSpec = middle.format_spec;
		assertNodeType(innerSpec, "JoinedStr");
		const inner = innerSpec.values[0];
		assertNodeType(inner, "FormattedValue");
		assertNodeType(inner.value, "Name");
		expect(inner.value.id).toBe("z");
		expect(inner.format_spec).toBeUndefined();
	});

	test("empty format spec parses as an empty JoinedStr", () => {
		const expr = parseExpression('f"{x:}"');
		assertNodeType(expr, "JoinedStr");
		const formattedValue = expr.values[0];
		assertNodeType(formattedValue, "FormattedValue");
		const formatSpec = formattedValue.format_spec;
		assertNodeType(formatSpec, "JoinedStr");
		expect(formatSpec.values).toHaveLength(0);
	});
});

describe("F-string Parsing Edge Cases", () => {
	test("nested f-string inside interpolation", () => {
		const expr = parseCode("f\"{f'{x}'}\"\n");
		expect(expr.body[0].nodeType).toBe("Expr");
	});

	test("quoted string literal inside interpolation", () => {
		const ast = parseCode("f\"{'a' + 'b'}\"\n");
		expect(ast.body[0].nodeType).toBe("Expr");
	});

	test("doubled braces are a literal brace, not an interpolation", () => {
		// Verified against CPython 3.13.
		const expr = parseExpression('f"{{literal}}"') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values).toHaveLength(1);
		expect(expr.values[0].nodeType).toBe("Constant");
		expect(expr.values[0].value).toBe("{literal}");
	});

	test("a line continuation between two fields produces no empty Constant", () => {
		// Verified against CPython 3.13: `ast.parse('f"""\\\n{a}\n    {b}"""')`
		// merges the surrounding text into a single `Constant('\n    ')`
		// with no empty `Constant` for the `\`-newline itself — a prior
		// bug emitted `Constant('')` for the consumed-but-decodes-to-
		// nothing continuation text.
		const expr = parseExpression('f"""\\\n{a}\n    {b}"""') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values.map((v) => v.nodeType)).toEqual([
			"FormattedValue",
			"Constant",
			"FormattedValue",
		]);
		expect(expr.values[1].value).toBe("\n    ");
	});

	test("a line continuation as an f-string's entire content produces an empty JoinedStr", () => {
		const expr = parseExpression('f"""\\\n"""') as { values: unknown[] };
		expect(expr.values).toHaveLength(0);
	});

	test("a real interpolation flanked by doubled-brace literals", () => {
		const expr = parseExpression('f"{a}{{b}}{c}"') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values.map((v) => v.nodeType)).toEqual([
			"FormattedValue",
			"Constant",
			"FormattedValue",
		]);
		expect(expr.values[1].value).toBe("{b}");
	});

	test("doubled braces immediately wrapping a real interpolation", () => {
		const expr = parseExpression('f"{{{x}}}"') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values.map((v) => v.nodeType)).toEqual([
			"Constant",
			"FormattedValue",
			"Constant",
		]);
		expect(expr.values[0].value).toBe("{");
		expect(expr.values[2].value).toBe("}");
	});

	test("four consecutive braces on each side collapse to pure literal text", () => {
		const expr = parseExpression('f"{{{{nested}}}}"') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values).toHaveLength(1);
		expect(expr.values[0].value).toBe("{{nested}}");
	});

	test("doubled braces between two real interpolations (dataclasses.py repr pattern)", () => {
		const expr = parseExpression('f"{f.name}={{self.{f.name}!r}}"') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values.map((v) => v.nodeType)).toEqual([
			"FormattedValue",
			"Constant",
			"FormattedValue",
			"Constant",
		]);
		expect(expr.values[1].value).toBe("={self.");
		expect(expr.values[3].value).toBe("!r}");
	});

	test("a doubled brace before the closing quote doesn't look unterminated (tkinter.py pattern)", () => {
		// Verified against CPython 3.13: `f'if {{"[{funcid} '` — the `{{`
		// must not count as opening a real field, or the lexer sees
		// unbalanced brace nesting and never finds the closing `'`.
		const expr = parseExpression(`f'if {{"[{funcid} '`) as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values.map((v) => v.nodeType)).toEqual([
			"Constant",
			"FormattedValue",
			"Constant",
		]);
		expect(expr.values[0].value).toBe('if {"[');
		expect(expr.values[2].value).toBe(" ");
	});

	test("\\N{...} braces between two fields aren't mistaken for a field boundary", () => {
		// Verified against CPython 3.13 (ptutils.py pattern): the `{`/`}`
		// of a `\N{...}` named escape are part of the escape, not a
		// field delimiter, even though this library leaves the name
		// itself unresolved (see the string-escape-sequences tests).
		const expr = parseExpression('f"{a}\\N{HORIZONTAL ELLIPSIS}{b}"') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values.map((v) => v.nodeType)).toEqual([
			"FormattedValue",
			"Constant",
			"FormattedValue",
		]);
		expect(expr.values[1].value).toBe("\\N{HORIZONTAL ELLIPSIS}");
	});

	test("real nested braces inside a field still nest normally (not the doubling escape)", () => {
		// Verified against CPython 3.13: `{ {1: 2} }` is a dict display
		// inside the field, unrelated to the `{{`/`}}` literal-brace
		// escape, which only applies outside a field.
		const expr = parseExpression('f"{ {1: 2} }"') as {
			values: { value: ExprNode }[];
		};
		expect(expr.values[0].value.nodeType).toBe("Dict");
	});

	test("escape sequences in literal text are decoded", () => {
		// Verified against CPython 3.13: the literal portions of an
		// f-string go through the same escape decoding as a plain string.
		const expr = parseExpression('f"\\nvalue={x}"') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values[0].value).toBe("\nvalue=");
	});

	test("raw f-string literal text is not escape-decoded", () => {
		const expr = parseExpression('rf"\\nvalue={x}"') as {
			values: { nodeType: string; value?: string }[];
		};
		expect(expr.values[0].value).toBe("\\nvalue=");
	});

	test("escape sequences in a format spec are decoded", () => {
		const expr = parseExpression('f"{x:\\n<5}"') as {
			values: { format_spec?: { values: { value?: string }[] } }[];
		};
		expect(expr.values[0].format_spec?.values[0].value).toBe("\n<5");
	});

	test("escape sequences in a nested f-string's literal text are decoded", () => {
		const expr = parseExpression("f\"outer {f'\\ninner {y}'}\"") as {
			values: {
				value?: { values: { value?: string }[] };
			}[];
		};
		const inner = expr.values[1].value;
		expect(inner?.values[0].value).toBe("\ninner ");
	});

	test("an emoji in literal text before an interpolation shifts the field's column by its UTF-8 byte length", () => {
		// Verified against CPython 3.13 (`f"😀{x}"` inside `a = ...`): the
		// emoji is 1 JS UTF-16 surrogate pair but 4 UTF-8 bytes, so the
		// literal Constant spans 4 columns and the field starts right
		// after it, not after just 1 (a naive JS-length count).
		const expr = parseExpression('f"😀{x}"') as {
			values: ExprNode[];
		};
		const literal = expr.values[0];
		const field = expr.values[1];
		const literalEndColOffset = literal.end_col_offset;
		if (literalEndColOffset === undefined) {
			throw new Error("expected literal.end_col_offset to be set");
		}
		expect(literalEndColOffset - literal.col_offset).toBe(4);
		expect(field.col_offset).toBe(literal.end_col_offset);
	});

	test("conversion specifier with format spec", () => {
		const ast = parseCode('f"{x!r:>10}"\n');
		expect(ast.body[0].nodeType).toBe("Expr");
	});

	test("conversion specifier without format spec", () => {
		const ast = parseCode('f"{x!s}"\n');
		expect(ast.body[0].nodeType).toBe("Expr");
	});

	test("malformed interpolation expression throws (matches CPython)", () => {
		// Verified against CPython 3.13: `ast.parse('f"{,}"')` raises
		// `SyntaxError: f-string: invalid syntax`.
		expect(() => parseCode('f"{,}"\n')).toThrow(
			/f-string: invalid syntax in interpolated expression/,
		);
	});

	test("an empty interpolation throws (matches CPython)", () => {
		// Verified against CPython 3.13: `ast.parse('f"{}"')` raises
		// `SyntaxError: f-string: valid expression required before '}'`.
		expect(() => parseCode('f"{}"\n')).toThrow(
			/f-string: valid expression required before '\}'/,
		);
		expect(() => parseCode('t"{}"\n')).toThrow(
			/f-string: valid expression required before '\}'/,
		);
	});

	test("trailing/leftover tokens after a complete interpolation expression throw (matches CPython)", () => {
		// Verified against CPython 3.13: `ast.parse('f"{1 2}"')` raises
		// `SyntaxError: invalid syntax. Perhaps you forgot a comma?`.
		expect(() => parseCode('f"{1 2}"\n')).toThrow(
			/f-string: invalid syntax in interpolated expression/,
		);
	});

	test("escaped quote inside a nested string literal", () => {
		const code = "f\"{'a\\'b'}\"\n";
		const ast = parseCode(code);
		expect(ast.body[0].nodeType).toBe("Expr");
	});

	test("unterminated nested string literal throws", () => {
		expect(() => parseCode('f"{\'a}"\n')).toThrow(
			/Unterminated string starting at position/,
		);
	});

	test("unterminated nested f-string throws", () => {
		expect(() => parseCode('f"{f\'{x}}"\n')).toThrow(
			/Unterminated f-string\/t-string starting at position/,
		);
	});

	test("brace-containing dict literal inside interpolation", () => {
		const ast = parseCode('f"{ {1: 2} }"\n');
		expect(ast.body[0].nodeType).toBe("Expr");
	});

	test("slice colon inside interpolation is not mistaken for a format spec", () => {
		const ast = parseCode('f"{arr[1:2]}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value.nodeType).toBe("Subscript");
		expect(formatted.format_spec).toBeUndefined();
	});

	test("dict literal colon inside interpolation is not mistaken for a format spec", () => {
		const ast = parseCode('f"{ {1: 2, 3: 4} }"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value.nodeType).toBe("Dict");
		expect(formatted.format_spec).toBeUndefined();
	});

	test("format spec after a subscripted expression is still split out", () => {
		const ast = parseCode("f\"{d['a']:>10}\"\n");
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value.nodeType).toBe("Subscript");
		expect(formatted.format_spec).toBeDefined();
	});

	test("conversion specifier immediately before a top-level colon still splits format spec", () => {
		const ast = parseCode('f"{x!r:>10}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.conversion).toBe(114);
		expect(formatted.format_spec).toBeDefined();
	});

	test("comparison operator inside interpolation parses as a Compare, not just its left operand", () => {
		const ast = parseCode('f"{a != b}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value.nodeType).toBe("Compare");
	});

	test("boolean 'or' inside interpolation parses as a BoolOp, not just its left operand", () => {
		const ast = parseCode('f"{a or b}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value.nodeType).toBe("BoolOp");
	});

	test("conditional expression inside interpolation parses as an IfExp", () => {
		const ast = parseCode('f"{a if b else c}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value.nodeType).toBe("IfExp");
	});

	test("bare tuple inside interpolation parses as a Tuple", () => {
		const ast = parseCode('f"{1, 2}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value.nodeType).toBe("Tuple");
	});

	test("self-documenting expression defaults to !r conversion and prepends a literal 'expr=' Constant", () => {
		const ast = parseCode('f"{x=}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		expect(expr.values[0]).toMatchObject({
			nodeType: "Constant",
			value: "x=",
		});
		const formatted = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value).toMatchObject({ nodeType: "Name", id: "x" });
		expect(formatted.conversion).toBe(114);
	});

	test("self-documenting expression's synthesized literal merges with preceding literal text", () => {
		// Verified against CPython 3.13: `ast.parse('f"prefix: {x=}"')`
		// produces a single merged Constant('prefix: x='), not two
		// separate adjacent Constants.
		const ast = parseCode('f"prefix: {x=}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		expect(expr.values).toHaveLength(2);
		expect(expr.values[0]).toMatchObject({
			nodeType: "Constant",
			value: "prefix: x=",
		});
		expect(expr.values[1].nodeType).toBe("FormattedValue");
	});

	test("self-documenting expression preserves surrounding whitespace in the literal", () => {
		const ast = parseCode('f"{x =}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		expect(expr.values[0]).toMatchObject({
			nodeType: "Constant",
			value: "x =",
		});
	});

	test("self-documenting expression with an explicit conversion keeps it instead of defaulting", () => {
		const ast = parseCode('f"{x=!s}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.conversion).toBe(115);
	});

	test("self-documenting expression with a format spec and no explicit conversion stays unconverted", () => {
		const ast = parseCode('f"{x=:>10}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.conversion).toBe(-1);
		expect(formatted.format_spec).toBeDefined();
	});

	test("self-documenting expression with an explicit conversion and a format spec keeps both", () => {
		const ast = parseCode('f"{x=!s:>10}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		const formatted = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.conversion).toBe(115);
		expect(formatted.format_spec).toBeDefined();
	});

	test("a self-documenting-looking expression nested in parens/calls is still recognized (nested '=' isn't mistaken)", () => {
		const ast = parseCode('f"{f(x=1)=}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
		expect(expr.values[0]).toMatchObject({
			nodeType: "Constant",
			value: "f(x=1)=",
		});
		const formatted = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "FormattedValue" }
		>;
		expect(formatted.value.nodeType).toBe("Call");
		expect(formatted.conversion).toBe(114);
	});

	test.each(['f"{x==y}"\n', 'f"{x!=y}"\n', 'f"{x<=y}"\n', 'f"{x>=y}"\n'])(
		"comparison/walrus operators ending in '=' are not mistaken for the self-documenting marker (%s)",
		(src) => {
			const ast = parseCode(src);
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "JoinedStr" }>;
			expect(expr.values).toHaveLength(1);
			expect(expr.values[0].nodeType).toBe("FormattedValue");
		},
	);

	test("a dangling comparison operator (invalid as real Python, e.g. '{x>=}') is not mistaken for the self-documenting marker either", () => {
		// Verified against CPython 3.13: `ast.parse('f"{x>=}"')` raises
		// `SyntaxError: f-string: expecting '=', or '!', or ':', or '}'` —
		// a trailing comparison operator can never be valid, complete
		// expression text (every comparison/walrus operator requires a
		// right-hand operand), so `isComparisonOrWalrus` only ever excludes
		// input that's already malformed. Since it isn't mistaken for the
		// self-documenting marker, `x>=` is left as the (invalid) expression
		// text, which correctly throws rather than being misread as a
		// self-documenting `{expr=}` marker.
		expect(() => parseCode('f"{x>=}"\n')).toThrow(
			/f-string: invalid syntax in interpolated expression/,
		);
	});

	test("self-documenting expression works the same way in a t-string interpolation", () => {
		const ast = parseCode('t"{x=}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		expect(expr.values[0]).toMatchObject({
			nodeType: "Constant",
			value: "x=",
		});
		const interpolation = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "Interpolation" }
		>;
		expect(interpolation.str).toBe("x");
		expect(interpolation.conversion).toBe(114);
	});
});

describe("String Escape Sequences", () => {
	// Verified against CPython 3.13's escape table. Every case here shares
	// the same shape (parse a literal, check its decoded `.value`), so it's
	// one table rather than one `test()` per escape.
	test.each<[string, string, string]>([
		["hex escape \\x", '"\\x41"', "A"],
		["4-digit unicode escape \\u", '"\\u0041"', "A"],
		["8-digit unicode escape \\U", '"\\U0001F600"', "\u{1F600}"],
		["octal escape", '"\\101\\102\\103"', "ABC"],
		[
			"bell, backspace, formfeed, vertical tab escapes",
			'"\\a\\b\\f\\v"',
			"\x07\b\f\v",
		],
		["line continuation is dropped entirely", '"line1\\\nline2"', "line1line2"],
		["unrecognized escape keeps the backslash literally", '"\\q"', "\\q"],
		["\\u is not decoded in a bytes literal", 'b"\\u0041"', "\\u0041"],
		["raw strings still skip all escape processing", 'r"\\x41\\n"', "\\x41\\n"],
		[
			"hex escape with fewer than 2 hex digits is kept literal",
			'"\\xg1"',
			"\\xg1",
		],
		[
			"\\N{...} named escape is kept literal (no name database)",
			'"\\N{DEGREE SIGN}"',
			"\\N{DEGREE SIGN}",
		],
		[
			"\\u escape with fewer than 4 hex digits is kept literal",
			'"\\u12"',
			"\\u12",
		],
		[
			"\\U escape with fewer than 8 hex digits is kept literal",
			'"\\U1234"',
			"\\U1234",
		],
		["\\N{ with no closing brace is kept literal", '"\\N{ABC"', "\\N{ABC"],
	])("%s", (_name, source, expected) => {
		const expr = parseExpression(source);
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe(expected);
	});
});

describe("T-strings (PEP 750 template strings)", () => {
	test("simple interpolation produces TemplateStr/Interpolation nodes", () => {
		const ast = parseCode('t"hello {x}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		expect(expr.nodeType).toBe("TemplateStr");
		expect(expr.values[0]).toMatchObject({
			nodeType: "Constant",
			value: "hello ",
		});
		const interpolation = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "Interpolation" }
		>;
		expect(interpolation.nodeType).toBe("Interpolation");
		expect(interpolation.value.nodeType).toBe("Name");
		expect(interpolation.str).toBe("x");
		expect(interpolation.conversion).toBe(-1);
	});

	test("uppercase T prefix also produces a TemplateStr", () => {
		const ast = parseCode('T"hello {x}"\n');
		expect(
			(ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>).value.nodeType,
		).toBe("TemplateStr");
	});

	test("conversion specifier with format spec", () => {
		const ast = parseCode('t"{x!r:>10}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		const interpolation = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "Interpolation" }
		>;
		expect(interpolation.conversion).toBe(114);
		expect(interpolation.str).toBe("x");
		expect(interpolation.format_spec?.nodeType).toBe("JoinedStr");
	});

	test("nested interpolation's format spec is JoinedStr/FormattedValue, not TemplateStr", () => {
		const ast = parseCode('t"{x:>{width}}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		const interpolation = expr.values[0] as Extract<
			ExprNode,
			{ nodeType: "Interpolation" }
		>;
		const formatSpec = interpolation.format_spec as Extract<
			ExprNode,
			{ nodeType: "JoinedStr" }
		>;
		expect(formatSpec.nodeType).toBe("JoinedStr");
		expect(formatSpec.values.some((v) => v.nodeType === "FormattedValue")).toBe(
			true,
		);
	});

	test("raw t-string (tr/rt prefixes) keeps backslashes literal", () => {
		for (const src of ['tr"a\\\\b {x}"\n', 'rt"a\\\\b {x}"\n']) {
			const ast = parseCode(src);
			const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
				.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
			expect(expr.values[0]).toMatchObject({
				nodeType: "Constant",
				value: "a\\\\b ",
			});
		}
	});

	test("triple-quoted t-string", () => {
		const src = 't"""multi\nline {x}"""\n';
		const ast = parseCode(src);
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		// `TemplateStr` has no `kind` field (CPython's `ast` doesn't have one
		// either); the original triple-quote style is instead recorded on the
		// py-ast-specific `quote_style` field, which the unparser uses to
		// round-trip it exactly.
		expect("kind" in expr).toBe(false);
		expect(expr.quote_style).toBe('t"""');
		expect(unparse(ast).trim()).toBe(src.trim());
		expect(expr.values[0]).toMatchObject({
			nodeType: "Constant",
			value: "multi\nline ",
		});
	});

	test("nested f-string inside a t-string interpolation", () => {
		const ast = parseCode("t\"outer {f'inner {y}'} end\"\n");
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		const interpolation = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "Interpolation" }
		>;
		expect(interpolation.value.nodeType).toBe("JoinedStr");
	});

	test("nested t-string inside a t-string interpolation", () => {
		const ast = parseCode("t\"outer {t'inner {y}'} end\"\n");
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		const interpolation = expr.values[1] as Extract<
			ExprNode,
			{ nodeType: "Interpolation" }
		>;
		expect(interpolation.value.nodeType).toBe("TemplateStr");
	});

	test("adjacent t-string literals concatenate into one TemplateStr", () => {
		const ast = parseCode('t"a" t"{x}"\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		expect(expr.nodeType).toBe("TemplateStr");
		expect(expr.values).toHaveLength(2);
		expect(expr.values[0]).toMatchObject({
			nodeType: "Constant",
			value: "a",
		});
	});

	test("mixing f-string and t-string literals throws", () => {
		expect(() => parseCode('f"a" t"b"\n')).toThrow(
			/cannot mix f-string literals with t-string literals/,
		);
	});

	test("mixing t-string and plain string literals throws", () => {
		expect(() => parseCode('t"a" "b"\n')).toThrow(
			/cannot mix t-string literals with string or bytes literals/,
		);
	});

	test("empty t-string", () => {
		const ast = parseCode('t""\n');
		const expr = (ast.body[0] as Extract<StmtNode, { nodeType: "Expr" }>)
			.value as Extract<ExprNode, { nodeType: "TemplateStr" }>;
		expect(expr.nodeType).toBe("TemplateStr");
		expect(expr.values).toEqual([]);
	});

	// The self-documenting-expression-in-a-t-string case is already covered
	// by "F-string Parsing Edge Cases" > "self-documenting expression works
	// the same way in a t-string interpolation" above.
});
