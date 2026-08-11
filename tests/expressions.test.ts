import { describe, expect, test } from "vitest";
import { parse } from "../src/index.js";
import { assertNodeType, parseExpression } from "./test-helpers.js";

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
		expect(expr.keys).toEqual([null, null, expect.objectContaining({ nodeType: "Constant" }), null]);
		expect(expr.values).toHaveLength(4);
		expect(expr.values[0]).toMatchObject({ nodeType: "Name", id: "a" });
		expect(expr.values[1]).toMatchObject({ nodeType: "Name", id: "b" });
		expect(expr.values[3]).toMatchObject({ nodeType: "Name", id: "c" });
	});

	test("dict literal with ** unpacking after a key:value entry", () => {
		const expr = parseExpression("{1: 2, **a}");
		assertNodeType(expr, "Dict");
		expect(expr.keys).toEqual([expect.objectContaining({ nodeType: "Constant" }), null]);
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
});
