import { describe, expect, test } from "vitest";
import { assertNodeType, parseStatement } from "./test-helpers.js";

describe("Assignment Statements", () => {
	test("simple assignment", () => {
		const stmt = parseStatement("x = 1");
		assertNodeType(stmt, "Assign");
		expect(stmt.targets).toHaveLength(1);
		expect(stmt.targets[0].nodeType).toBe("Name");
		expect(stmt.value.nodeType).toBe("Constant");
	});

	test("multiple assignment", () => {
		const stmt = parseStatement("x = y = 1");
		assertNodeType(stmt, "Assign");
		expect(stmt.targets).toHaveLength(2);
	});

	test("unpacking assignment", () => {
		const stmt = parseStatement("x, y = 1, 2");
		assertNodeType(stmt, "Assign");
		expect(stmt.targets[0].nodeType).toBe("Tuple");
		expect(stmt.value.nodeType).toBe("Tuple");
	});

	test("list-target assignment gets recursive Store context, matching CPython", () => {
		const stmt = parseStatement("[a, b] = [1, 2]");
		assertNodeType(stmt, "Assign");
		const target = stmt.targets[0];
		assertNodeType(target, "List");
		expect(target.ctx.nodeType).toBe("Store");
		expect(
			target.elts.every(
				(elt) => elt.nodeType === "Name" && elt.ctx.nodeType === "Store",
			),
		).toBe(true);
	});

	test("starred assignment", () => {
		const stmt = parseStatement("x, *y, z = values");
		assertNodeType(stmt, "Assign");
		const target = stmt.targets[0];
		assertNodeType(target, "Tuple");
		expect(target.elts[1].nodeType).toBe("Starred");
	});
});

describe("Annotated Assignment", () => {
	test("simple annotated assignment", () => {
		const stmt = parseStatement("x: int = 1");
		assertNodeType(stmt, "AnnAssign");
		expect(stmt.target.nodeType).toBe("Name");
		expect(stmt.annotation.nodeType).toBe("Name");
		expect(stmt.value?.nodeType).toBe("Constant");
		expect(stmt.simple).toBe(1);
	});

	test("annotated assignment without value", () => {
		const stmt = parseStatement("x: int");
		assertNodeType(stmt, "AnnAssign");
		expect(stmt.target.nodeType).toBe("Name");
		expect(stmt.annotation.nodeType).toBe("Name");
		expect(stmt.value).toBeUndefined();
	});

	test("complex target annotation", () => {
		const stmt = parseStatement("obj.attr: int = 1");
		assertNodeType(stmt, "AnnAssign");
		expect(stmt.target.nodeType).toBe("Attribute");
		expect(stmt.simple).toBe(0);
	});
});

describe("Augmented Assignment", () => {
	test("addition assignment", () => {
		const stmt = parseStatement("x += 1");
		assertNodeType(stmt, "AugAssign");
		expect(stmt.op.nodeType).toBe("Add");
		expect(stmt.target.nodeType).toBe("Name");
		expect(stmt.value.nodeType).toBe("Constant");
	});

	test.each([
		["+=", "Add"],
		["-=", "Sub"],
		["*=", "Mult"],
		["/=", "Div"],
		["//=", "FloorDiv"],
		["%=", "Mod"],
		["**=", "Pow"],
		["&=", "BitAnd"],
		["|=", "BitOr"],
		["^=", "BitXor"],
		["<<=", "LShift"],
		[">>=", "RShift"],
	])("augmented operator %s parses as %s", (op, expectedOp) => {
		const stmt = parseStatement(`x ${op} 1`);
		assertNodeType(stmt, "AugAssign");
		expect(stmt.op.nodeType).toBe(expectedOp);
	});

	test("matrix multiplication assignment", () => {
		const stmt = parseStatement("x @= matrix");
		assertNodeType(stmt, "AugAssign");
		expect(stmt.op.nodeType).toBe("MatMult");
	});

	test("valid single-target forms", () => {
		expect(() => parseStatement("x += 1")).not.toThrow();
		expect(() => parseStatement("x.attr += 1")).not.toThrow();
		expect(() => parseStatement("x[0] += 1")).not.toThrow();
	});

	test("cannot augmented-assign to a tuple target", () => {
		expect(() => parseStatement("x, y += 1")).toThrow(
			/tuple.*illegal expression for augmented assignment/,
		);
	});

	test("cannot augmented-assign to a list target", () => {
		expect(() => parseStatement("[x, y] += 1")).toThrow(
			/list.*illegal expression for augmented assignment/,
		);
	});

	test("cannot augmented-assign to a starred target", () => {
		expect(() => parseStatement("*x += 1")).toThrow(
			/starred.*illegal expression for augmented assignment/,
		);
	});

	test("cannot augmented-assign to a literal", () => {
		expect(() => parseStatement("1 += 1")).toThrow(/cannot assign to literal/);
	});
});

describe("Delete Statement", () => {
	test("delete variable", () => {
		const stmt = parseStatement("del x");
		assertNodeType(stmt, "Delete");
		expect(stmt.targets).toHaveLength(1);
		expect(stmt.targets[0].nodeType).toBe("Name");
	});

	test("delete multiple targets", () => {
		const stmt = parseStatement("del x, y, z");
		assertNodeType(stmt, "Delete");
		expect(stmt.targets).toHaveLength(3);
	});

	test("delete attribute", () => {
		const stmt = parseStatement("del obj.attr");
		assertNodeType(stmt, "Delete");
		expect(stmt.targets[0].nodeType).toBe("Attribute");
	});

	test("delete subscript", () => {
		const stmt = parseStatement("del arr[0]");
		assertNodeType(stmt, "Delete");
		expect(stmt.targets[0].nodeType).toBe("Subscript");
	});
});

describe("Control Flow Statements", () => {
	test("pass statement", () => {
		const stmt = parseStatement("pass");
		assertNodeType(stmt, "Pass");
	});

	test("break statement", () => {
		const stmt = parseStatement("break");
		assertNodeType(stmt, "Break");
	});

	test("continue statement", () => {
		const stmt = parseStatement("continue");
		assertNodeType(stmt, "Continue");
	});

	test("return statement", () => {
		const stmt = parseStatement("return");
		assertNodeType(stmt, "Return");
		expect(stmt.value).toBeUndefined();
	});

	test("return with value", () => {
		const stmt = parseStatement("return 42");
		assertNodeType(stmt, "Return");
		expect(stmt.value?.nodeType).toBe("Constant");
	});
});

describe("Global and Nonlocal", () => {
	test("global statement", () => {
		const stmt = parseStatement("global x, y");
		assertNodeType(stmt, "Global");
		expect(stmt.names).toEqual(["x", "y"]);
	});

	test("nonlocal statement", () => {
		const stmt = parseStatement("nonlocal x, y");
		assertNodeType(stmt, "Nonlocal");
		expect(stmt.names).toEqual(["x", "y"]);
	});

	test("global with multiple names inside a function body", () => {
		const stmt = parseStatement("def f():\n    global a, b, c\n");
		assertNodeType(stmt, "FunctionDef");
		const global = stmt.body[0];
		assertNodeType(global, "Global");
		expect(global.names).toEqual(["a", "b", "c"]);
	});

	test("nonlocal with multiple names inside a nested function", () => {
		const stmt = parseStatement(
			"def f():\n    def g():\n        nonlocal a, b\n",
		);
		assertNodeType(stmt, "FunctionDef");
		const inner = stmt.body[0];
		assertNodeType(inner, "FunctionDef");
		const nonlocal = inner.body[0];
		assertNodeType(nonlocal, "Nonlocal");
		expect(nonlocal.names).toEqual(["a", "b"]);
	});
});

describe("Raise Statement", () => {
	test("raise without exception", () => {
		const stmt = parseStatement("raise");
		assertNodeType(stmt, "Raise");
		expect(stmt.exc).toBeUndefined();
		expect(stmt.cause).toBeUndefined();
	});

	test("raise with exception", () => {
		const stmt = parseStatement("raise ValueError('error')");
		assertNodeType(stmt, "Raise");
		expect(stmt.exc?.nodeType).toBe("Call");
	});

	test("raise with cause", () => {
		const stmt = parseStatement("raise ValueError('error') from cause");
		assertNodeType(stmt, "Raise");
		expect(stmt.exc?.nodeType).toBe("Call");
		expect(stmt.cause?.nodeType).toBe("Name");
	});
});

describe("Assert Statement", () => {
	test("simple assert", () => {
		const stmt = parseStatement("assert condition");
		assertNodeType(stmt, "Assert");
		expect(stmt.test.nodeType).toBe("Name");
		expect(stmt.msg).toBeUndefined();
	});

	test("assert with message", () => {
		const stmt = parseStatement("assert condition, 'error message'");
		assertNodeType(stmt, "Assert");
		expect(stmt.test.nodeType).toBe("Name");
		expect(stmt.msg?.nodeType).toBe("Constant");
	});
});

describe("Expression Statement", () => {
	test("expression as statement", () => {
		const stmt = parseStatement("func()");
		assertNodeType(stmt, "Expr");
		expect(stmt.value.nodeType).toBe("Call");
	});

	test("string literal as statement", () => {
		const stmt = parseStatement("'docstring'");
		assertNodeType(stmt, "Expr");
		expect(stmt.value.nodeType).toBe("Constant");
	});
});
