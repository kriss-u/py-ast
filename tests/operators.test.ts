import { describe, expect, test } from "vitest";
import type { StmtNode } from "../src/types.js";
import { assertNodeType, parseCode, parseExpression } from "./test-helpers.js";

describe("Binary Operations", () => {
	test.each([
		["a + b", "Add"],
		["a - b", "Sub"],
		["a * b", "Mult"],
		["a / b", "Div"],
		["a % b", "Mod"],
		["a ** b", "Pow"],
		["a // b", "FloorDiv"],
		["a | b", "BitOr"],
		["a ^ b", "BitXor"],
		["a & b", "BitAnd"],
		["a << b", "LShift"],
		["a >> b", "RShift"],
		["a @ b", "MatMult"],
	])("%s parses as BinOp with op %s", (code, expectedOp) => {
		const expr = parseExpression(code);
		assertNodeType(expr, "BinOp");
		expect(expr.op.nodeType).toBe(expectedOp);
	});

	test("operator precedence: multiplication binds tighter than addition", () => {
		const expr = parseExpression("a + b * c");
		assertNodeType(expr, "BinOp");
		expect(expr.op.nodeType).toBe("Add");
		expect(expr.left.nodeType).toBe("Name");
		assertNodeType(expr.right, "BinOp");
		expect(expr.right.op.nodeType).toBe("Mult");
	});
});

describe("Unary Operations", () => {
	test.each([
		["+x", "UAdd"],
		["-x", "USub"],
		["not x", "Not"],
		["~x", "Invert"],
	])("%s parses as UnaryOp with op %s", (code, expectedOp) => {
		const expr = parseExpression(code);
		assertNodeType(expr, "UnaryOp");
		expect(expr.op.nodeType).toBe(expectedOp);
	});
});

describe("Boolean Operations", () => {
	test("and operation", () => {
		const expr = parseExpression("a and b");
		assertNodeType(expr, "BoolOp");
		expect(expr.op.nodeType).toBe("And");
		expect(expr.values).toHaveLength(2);
	});

	test("or operation", () => {
		const expr = parseExpression("a or b");
		assertNodeType(expr, "BoolOp");
		expect(expr.op.nodeType).toBe("Or");
		expect(expr.values).toHaveLength(2);
	});

	test("chained boolean operations", () => {
		const expr = parseExpression("a and b and c");
		assertNodeType(expr, "BoolOp");
		expect(expr.op.nodeType).toBe("And");
		expect(expr.values).toHaveLength(3);
	});

	test("mixed boolean operations: 'and' binds tighter than 'or'", () => {
		const expr = parseExpression("a and b or c");
		assertNodeType(expr, "BoolOp");
		expect(expr.op.nodeType).toBe("Or");
		expect(expr.values).toHaveLength(2);
		assertNodeType(expr.values[0], "BoolOp");
		expect(expr.values[0].op.nodeType).toBe("And");
	});
});

describe("Comparison Operations", () => {
	test.each([
		["a == b", "Eq"],
		["a != b", "NotEq"],
		["a < b", "Lt"],
		["a > b", "Gt"],
		["a <= b", "LtE"],
		["a >= b", "GtE"],
		["a is b", "Is"],
		["a is not b", "IsNot"],
		["a in b", "In"],
		["a not in b", "NotIn"],
	])("%s parses as Compare with op %s", (code, expectedOp) => {
		const expr = parseExpression(code);
		assertNodeType(expr, "Compare");
		expect(expr.ops[0].nodeType).toBe(expectedOp);
	});

	test("chained comparisons", () => {
		const expr = parseExpression("a < b < c");
		assertNodeType(expr, "Compare");
		expect(expr.ops).toHaveLength(2);
		expect(expr.ops[0].nodeType).toBe("Lt");
		expect(expr.ops[1].nodeType).toBe("Lt");
		expect(expr.comparators).toHaveLength(2);
	});

	test("chained comparison with mixed operators", () => {
		const ast = parseCode("a < b <= c == d != e\n");
		expect(ast.body[0].nodeType).toBe("Expr");
	});
});

describe("Conditional Expressions", () => {
	test("ternary conditional", () => {
		const expr = parseExpression("a if condition else b");
		assertNodeType(expr, "IfExp");
		expect(expr.test.nodeType).toBe("Name");
		expect(expr.body.nodeType).toBe("Name");
		expect(expr.orelse.nodeType).toBe("Name");
	});

	test("nested conditionals", () => {
		const expr = parseExpression("a if x else b if y else c");
		assertNodeType(expr, "IfExp");
		expect(expr.test.nodeType).toBe("Name");
		expect(expr.body.nodeType).toBe("Name");
		assertNodeType(expr.orelse, "IfExp");
	});
});

describe("Lambda Expressions", () => {
	test("simple lambda", () => {
		const expr = parseExpression("lambda x: x + 1");
		assertNodeType(expr, "Lambda");
		expect(expr.args.args).toHaveLength(1);
		expect(expr.args.args[0].arg).toBe("x");
		assertNodeType(expr.body, "BinOp");
	});

	test("lambda with multiple parameters", () => {
		const expr = parseExpression("lambda x, y: x + y");
		assertNodeType(expr, "Lambda");
		expect(expr.args.args).toHaveLength(2);
	});

	test("lambda with default parameters", () => {
		const expr = parseExpression("lambda x=1: x * 2");
		assertNodeType(expr, "Lambda");
		expect(expr.args.args).toHaveLength(1);
		expect(expr.args.defaults).toHaveLength(1);
	});

	test("lambda with no parameters", () => {
		const expr = parseExpression("lambda: 42");
		assertNodeType(expr, "Lambda");
		expect(expr.args.args).toHaveLength(0);
	});

	test("lambda with *args", () => {
		const expr = parseExpression("lambda *args: args");
		assertNodeType(expr, "Lambda");
		expect(expr.args.args).toHaveLength(0);
		expect(expr.args.vararg?.arg).toBe("args");
	});

	test("lambda with **kwargs", () => {
		const expr = parseExpression("lambda **kwargs: kwargs");
		assertNodeType(expr, "Lambda");
		expect(expr.args.kwarg?.arg).toBe("kwargs");
	});

	test("lambda with positional-only, keyword-only, *args and **kwargs", () => {
		const expr = parseExpression(
			"lambda a, /, b=1, *args, c, d=2, **kwargs: None",
		);
		assertNodeType(expr, "Lambda");
		expect(expr.args.posonlyargs.map((a) => a.arg)).toEqual(["a"]);
		expect(expr.args.args.map((a) => a.arg)).toEqual(["b"]);
		expect(expr.args.defaults).toHaveLength(1);
		expect(expr.args.vararg?.arg).toBe("args");
		expect(expr.args.kwonlyargs.map((a) => a.arg)).toEqual(["c", "d"]);
		expect(expr.args.kw_defaults).toEqual([null, expect.anything()]);
		expect(expr.args.kwarg?.arg).toBe("kwargs");
	});

	test("lambda with bare * marking keyword-only params, no vararg", () => {
		const expr = parseExpression("lambda *, c: c");
		assertNodeType(expr, "Lambda");
		expect(expr.args.vararg).toBeUndefined();
		expect(expr.args.kwonlyargs.map((a) => a.arg)).toEqual(["c"]);
	});
});

describe("Walrus Operator", () => {
	test("named expressions", () => {
		const expr = parseExpression("(x := 42)");
		assertNodeType(expr, "NamedExpr");
		expect(expr.target.nodeType).toBe("Name");
		expect(expr.value.nodeType).toBe("Constant");
	});

	test("named expression target gets Store context, matching CPython", () => {
		const expr = parseExpression("(x := 42)");
		assertNodeType(expr, "NamedExpr");
		assertNodeType(expr.target, "Name");
		expect(expr.target.ctx.nodeType).toBe("Store");
	});

	test("walrus operator in expression", () => {
		const ast = parseCode("if (n := 10) > 5:\n    pass\n");
		expect(ast.body[0].nodeType).toBe("If");
	});

	test.each([
		["(x := a or b)", "BoolOp"],
		["(x := a if b else c)", "IfExp"],
		["(x := lambda: 1)", "Lambda"],
	])(
		"walrus RHS %s binds a full 'test', not just an 'and_test' (CPython: value=%s)",
		(src, expectedValueNodeType) => {
			const expr = parseExpression(src);
			expect(expr.nodeType).toBe("NamedExpr");
			if (expr.nodeType === "NamedExpr") {
				expect(expr.value.nodeType).toBe(expectedValueNodeType);
			}
		},
	);

	test("setContext no-op branch: a non-target-shaped walrus target is left structurally unchanged", () => {
		// The parser (like this walrus production specifically) doesn't
		// restrict `:=`'s target to a bare NAME the way CPython does;
		// setContext's fallback branch simply leaves non-Name/Attribute/
		// Subscript/Starred/List/Tuple nodes untouched rather than crashing.
		const expr = parseExpression("(a + b := 5)");
		expect(expr.nodeType).toBe("NamedExpr");
		if (expr.nodeType === "NamedExpr") {
			expect(expr.target.nodeType).toBe("BinOp");
		}
	});

	test("walrus RHS containing 'or' isn't split across the enclosing BoolOp", () => {
		// Verified against CPython 3.13: `not c and (s := w or r)` binds
		// the whole `w or r` as the NamedExpr's value; a prior bug parsed
		// the walrus RHS at `and_test` precedence, splitting the trailing
		// `or r` out into the *enclosing* BoolOp instead.
		const ast = parseCode("if not c and (s := w or r):\n    pass\n");
		const ifStmt = ast.body[0] as Extract<StmtNode, { nodeType: "If" }>;
		expect(ifStmt.test).toMatchObject({
			nodeType: "BoolOp",
			op: { nodeType: "And" },
			values: [
				{ nodeType: "UnaryOp" },
				{
					nodeType: "NamedExpr",
					value: {
						nodeType: "BoolOp",
						op: { nodeType: "Or" },
						values: [
							{ nodeType: "Name", id: "w" },
							{ nodeType: "Name", id: "r" },
						],
					},
				},
			],
		});
	});
});
