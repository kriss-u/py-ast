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
