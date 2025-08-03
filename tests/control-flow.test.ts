import { assertNodeType, parseStatement, parseCode } from "./test-helpers.js";
import type { StmtNode } from "../src/types.js";

describe("Pattern Matching", () => {
	describe("Dictionary/Mapping Patterns", () => {
		test("simple dictionary pattern", () => {
			const code = `
match data:
    case {'name': str(name)}:
        return name
`;
			const ast = parseCode(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchMapping");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchMapping" }>;
			expect(pattern.keys).toHaveLength(1);
			expect(pattern.patterns).toHaveLength(1);
		});

		test("complex dictionary pattern with multiple keys", () => {
			const code = `
match data:
    case {'type': 'user', 'name': str(name), 'age': int(age)}:
        return f'{name} is {age} years old'
`;
			const ast = parseCode(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchMapping");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchMapping" }>;
			expect(pattern.keys).toHaveLength(3);
			expect(pattern.patterns).toHaveLength(3);
		});

		test("dictionary pattern with guard", () => {
			const code = `
match data:
    case {'type': 'user', 'name': str(name), 'age': int(age)} if age >= 18:
        return f'Adult: {name}'
`;
			const ast = parseCode(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchMapping");
			expect(caseStmt.guard).toBeTruthy();
			assertNodeType(caseStmt.guard!, "Compare");
		});

		test("dictionary pattern with rest capture", () => {
			const code = `
match data:
    case {'type': 'admin', **rest}:
        return rest
`;
			const ast = parseCode(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchMapping");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchMapping" }>;
			expect(pattern.rest).toBe("rest");
		});
	});

	describe("Class Pattern Fixes", () => {
		test("class pattern with arguments", () => {
			const code = `
match value:
    case str(name):
        return f'String: {name}'
`;
			const ast = parseCode(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchClass");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchClass" }>;
			expect(pattern.patterns).toHaveLength(1);
		});

		test("class pattern with multiple arguments", () => {
			const code = `
match point:
    case Point(int(x), int(y)):
        return f'Point at ({x}, {y})'
`;
			const ast = parseCode(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchClass");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchClass" }>;
			expect(pattern.patterns).toHaveLength(2);
		});

		test("class pattern with keyword arguments", () => {
			const code = `
match point:
    case Point(x=int(x_val), y=int(y_val)):
        return f'Point at x={x_val}, y={y_val}'
`;
			const ast = parseCode(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchClass");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchClass" }>;
			expect(pattern.kwd_attrs).toHaveLength(2);
			expect(pattern.kwd_patterns).toHaveLength(2);
		});

		test("class pattern with mixed positional and keyword arguments", () => {
			const code = `
match data:
    case Person(str(name), age=int(age)):
        return f'{name} is {age} years old'
`;
			const ast = parseCode(code);
			const matchStmt = ast.body[0];
			assertNodeType(matchStmt, "Match");
			
			const caseStmt = (matchStmt as Extract<StmtNode, { nodeType: "Match" }>).cases[0];
			assertNodeType(caseStmt.pattern, "MatchClass");
			const pattern = caseStmt.pattern as Extract<import("../src/types.js").PatternNode, { nodeType: "MatchClass" }>;
			expect(pattern.patterns).toHaveLength(1);
			expect(pattern.kwd_attrs).toHaveLength(1);
			expect(pattern.kwd_patterns).toHaveLength(1);
		});
	});

	test("reject invalid one-line match statements", () => {
		expect(() => {
			parseCode("match x: case 1:");
		}).toThrow();
	});

	test("accept valid multi-line match statements", () => {
		const code = `
match x:
    case 1:
        return "one"
`;
		const ast = parseCode(code);
		const matchStmt = ast.body[0];
		assertNodeType(matchStmt, "Match");
		expect((matchStmt as any).cases).toHaveLength(1);
	});
});

describe("Exception Handling", () => {
	describe("TryStar (except*) Support", () => {
		test("simple except* syntax", () => {
			const code = `
try:
    risky_operation()
except* ValueError as e:
    handle_value_error(e)
`;
			const ast = parseCode(code);
			const tryStmt = ast.body[0];
			assertNodeType(tryStmt, "TryStar");
			
			expect((tryStmt as any).handlers).toHaveLength(1);
			const handler = (tryStmt as any).handlers[0];
			assertNodeType(handler, "ExceptHandler");
			expect((handler as any).type?.nodeType).toBe("Name");
			expect((handler as any).type?.id).toBe("ValueError");
			expect((handler as any).name).toBe("e");
		});

		test("multiple except* handlers", () => {
			const code = `
try:
    operation()
except* ValueError as ve:
    handle_value_error(ve)
except* TypeError as te:
    handle_type_error(te)
`;
			const ast = parseCode(code);
			const tryStmt = ast.body[0];
			assertNodeType(tryStmt, "TryStar");
			expect((tryStmt as any).handlers).toHaveLength(2);
		});

		test("except* with finally", () => {
			const code = `
try:
    operation()
except* Exception as e:
    handle_exception(e)
finally:
    cleanup()
`;
			const ast = parseCode(code);
			const tryStmt = ast.body[0];
			assertNodeType(tryStmt, "TryStar");
			expect((tryStmt as any).finalbody).toHaveLength(1);
		});
	});
});

describe("If Statements", () => {
	test("simple if", () => {
		const stmt = parseStatement(`if condition:
    pass`);
		assertNodeType(stmt, "If");
		expect(stmt.test.nodeType).toBe("Name");
		expect(stmt.body).toHaveLength(1);
		expect(stmt.orelse).toHaveLength(0);
	});

	test("if-else", () => {
		const stmt = parseStatement(`if condition:
    pass
else:
    pass`);
		assertNodeType(stmt, "If");
		expect(stmt.orelse).toHaveLength(1);
	});

	test("if-elif-else", () => {
		const stmt = parseStatement(`if condition1:
    pass
elif condition2:
    pass
else:
    pass`);
		assertNodeType(stmt, "If");
		expect(stmt.orelse).toHaveLength(1);
		assertNodeType(stmt.orelse[0], "If");
	});
});

describe("While Loops", () => {
	test("simple while", () => {
		const stmt = parseStatement(`while condition:
    pass`);
		assertNodeType(stmt, "While");
		expect(stmt.test.nodeType).toBe("Name");
		expect(stmt.body).toHaveLength(1);
		expect(stmt.orelse).toHaveLength(0);
	});

	test("while with else", () => {
		const stmt = parseStatement(`while condition:
    pass
else:
    pass`);
		assertNodeType(stmt, "While");
		expect(stmt.orelse).toHaveLength(1);
	});
});

describe("For Loops", () => {
	test("simple for loop", () => {
		const stmt = parseStatement(`for item in items:
    pass`);
		assertNodeType(stmt, "For");
		expect(stmt.target.nodeType).toBe("Name");
		expect(stmt.iter.nodeType).toBe("Name");
		expect(stmt.body).toHaveLength(1);
		expect(stmt.orelse).toHaveLength(0);
	});

	test("for loop with unpacking", () => {
		const stmt = parseStatement(`for x, y in pairs:
    pass`);
		assertNodeType(stmt, "For");
		expect(stmt.target.nodeType).toBe("Tuple");
	});

	test("for loop with else", () => {
		const stmt = parseStatement(`for item in items:
    pass
else:
    pass`);
		assertNodeType(stmt, "For");
		expect(stmt.orelse).toHaveLength(1);
	});

	test("async for loop", () => {
		const stmt = parseStatement(`async for item in async_iter:
    pass`);
		assertNodeType(stmt, "AsyncFor");
		expect(stmt.target.nodeType).toBe("Name");
		expect(stmt.iter.nodeType).toBe("Name");
	});
});

describe("With Statements", () => {
	test("simple with", () => {
		const stmt = parseStatement(`with context:
    pass`);
		assertNodeType(stmt, "With");
		expect(stmt.items).toHaveLength(1);
		expect(stmt.items[0].context_expr.nodeType).toBe("Name");
		expect(stmt.items[0].optional_vars).toBeUndefined();
	});

	test("with as", () => {
		const stmt = parseStatement(`with context as var:
    pass`);
		assertNodeType(stmt, "With");
		expect(stmt.items[0].optional_vars?.nodeType).toBe("Name");
	});

	test("multiple with items", () => {
		const stmt = parseStatement(`with context1 as var1, context2 as var2:
    pass`);
		assertNodeType(stmt, "With");
		expect(stmt.items).toHaveLength(2);
	});

	test("async with", () => {
		const stmt = parseStatement(`async with async_context:
    pass`);
		assertNodeType(stmt, "AsyncWith");
	});
});

describe("Try Statements", () => {
	test("try-except", () => {
		const stmt = parseStatement(`try:
    pass
except:
    pass`);
		assertNodeType(stmt, "Try");
		expect(stmt.body).toHaveLength(1);
		expect(stmt.handlers).toHaveLength(1);
		expect(stmt.handlers[0].type).toBeUndefined();
		expect(stmt.handlers[0].name).toBeUndefined();
	});

	test("try-except with exception type", () => {
		const stmt = parseStatement(`try:
    pass
except ValueError:
    pass`);
		assertNodeType(stmt, "Try");
		expect(stmt.handlers[0].type?.nodeType).toBe("Name");
	});

	test("try-except with exception name", () => {
		const stmt = parseStatement(`try:
    pass
except ValueError as e:
    pass`);
		assertNodeType(stmt, "Try");
		expect(stmt.handlers[0].name).toBe("e");
	});

	test("try-except-else", () => {
		const stmt = parseStatement(`try:
    pass
except:
    pass
else:
    pass`);
		assertNodeType(stmt, "Try");
		expect(stmt.orelse).toHaveLength(1);
	});

	test("try-except-finally", () => {
		const stmt = parseStatement(`try:
    pass
except:
    pass
finally:
    pass`);
		assertNodeType(stmt, "Try");
		expect(stmt.finalbody).toHaveLength(1);
	});

	test("multiple except clauses", () => {
		const stmt = parseStatement(`try:
    pass
except ValueError:
    pass
except TypeError:
    pass`);
		assertNodeType(stmt, "Try");
		expect(stmt.handlers).toHaveLength(2);
	});
});

describe("Function Definitions", () => {
	test("simple function", () => {
		const stmt = parseStatement(`def func():
    pass`);
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.name).toBe("func");
		expect(stmt.args.args).toHaveLength(0);
		expect(stmt.body).toHaveLength(1);
		expect(stmt.decorator_list).toHaveLength(0);
		expect(stmt.returns).toBeUndefined();
	});

	test("function with parameters", () => {
		const stmt = parseStatement(`def func(a, b):
    pass`);
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.args.args).toHaveLength(2);
		expect(stmt.args.args[0].arg).toBe("a");
		expect(stmt.args.args[1].arg).toBe("b");
	});

	test("function with default parameters", () => {
		const stmt = parseStatement(`def func(a, b=1):
    pass`);
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.args.defaults).toHaveLength(1);
	});

	test("function with *args", () => {
		const stmt = parseStatement(`def func(*args):
    pass`);
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.args.vararg?.arg).toBe("args");
	});

	test("function with **kwargs", () => {
		const stmt = parseStatement(`def func(**kwargs):
    pass`);
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.args.kwarg?.arg).toBe("kwargs");
	});

	test("function with annotations", () => {
		const stmt = parseStatement(`def func(a: int) -> str:
    pass`);
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.args.args[0].annotation?.nodeType).toBe("Name");
		expect(stmt.returns?.nodeType).toBe("Name");
	});

	test("decorated function", () => {
		const stmt = parseStatement(`@decorator
def func():
    pass`);
		assertNodeType(stmt, "FunctionDef");
		expect(stmt.decorator_list).toHaveLength(1);
		expect(stmt.decorator_list[0].nodeType).toBe("Name");
	});

	test("async function", () => {
		const stmt = parseStatement(`async def func():
    pass`);
		assertNodeType(stmt, "AsyncFunctionDef");
	});
});

describe("Class Definitions", () => {
	test("simple class", () => {
		const stmt = parseStatement(`class MyClass:
    pass`);
		assertNodeType(stmt, "ClassDef");
		expect(stmt.name).toBe("MyClass");
		expect(stmt.bases).toHaveLength(0);
		expect(stmt.keywords).toHaveLength(0);
		expect(stmt.body).toHaveLength(1);
	});

	test("class with base class", () => {
		const stmt = parseStatement(`class MyClass(BaseClass):
    pass`);
		assertNodeType(stmt, "ClassDef");
		expect(stmt.bases).toHaveLength(1);
		expect(stmt.bases[0].nodeType).toBe("Name");
	});

	test("class with multiple bases", () => {
		const stmt = parseStatement(`class MyClass(Base1, Base2):
    pass`);
		assertNodeType(stmt, "ClassDef");
		expect(stmt.bases).toHaveLength(2);
	});

	test("decorated class", () => {
		const stmt = parseStatement(`@decorator
class MyClass:
    pass`);
		assertNodeType(stmt, "ClassDef");
		expect(stmt.decorator_list).toHaveLength(1);
	});
});
