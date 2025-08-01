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

	test("all augmented operators", () => {
		const operators = [
			"+=",
			"-=",
			"*=",
			"/=",
			"//=",
			"%=",
			"**=",
			"&=",
			"|=",
			"^=",
			"<<=",
			">>=",
		];

		const expectedOps = [
			"Add",
			"Sub",
			"Mult",
			"Div",
			"FloorDiv",
			"Mod",
			"Pow",
			"BitAnd",
			"BitOr",
			"BitXor",
			"LShift",
			"RShift",
		];

		operators.forEach((op, i) => {
			try {
				const stmt = parseStatement(`x ${op} 1`);
				assertNodeType(stmt, "AugAssign");
				expect(stmt.op.nodeType).toBe(expectedOps[i]);
			} catch (e) {
				throw new Error(
					`Failed on operator ${op} (index ${i}): ${(e as Error).message}`,
				);
			}
		});
	});

	test("matrix multiplication assignment", () => {
		const stmt = parseStatement("x @= matrix");
		assertNodeType(stmt, "AugAssign");
		expect(stmt.op.nodeType).toBe("MatMult");
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
