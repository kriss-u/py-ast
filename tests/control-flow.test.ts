import { describe, expect, test } from "vitest";
import type { ASTNode, Constant, Name, StmtNode } from "../src/types.js";
import { assertNodeType, parseCode, parseStatement } from "./test-helpers.js";

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

			expect(tryStmt.handlers).toHaveLength(1);
			const handler = tryStmt.handlers[0];
			assertNodeType(handler, "ExceptHandler");
			expect(handler.type?.nodeType).toBe("Name");
			assertNodeType(handler.type, "Name");
			expect(handler.type.id).toBe("ValueError");
			expect(handler.name).toBe("e");
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
			expect(tryStmt.handlers).toHaveLength(2);
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
			expect(tryStmt.finalbody).toHaveLength(1);
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

	test("parenthesized with-items (PEP 617)", () => {
		const stmt = parseStatement(`with (context1 as var1, context2 as var2):
    pass`);
		assertNodeType(stmt, "With");
		expect(stmt.items).toHaveLength(2);
		expect(stmt.items[0].optional_vars?.nodeType).toBe("Name");
		expect(stmt.items[1].optional_vars?.nodeType).toBe("Name");
	});

	test("parenthesized with-items with trailing comma", () => {
		const stmt = parseStatement(`with (
    context1 as var1,
    context2 as var2,
):
    pass`);
		assertNodeType(stmt, "With");
		expect(stmt.items).toHaveLength(2);
	});

	test("parenthesized with-items without 'as' (not a tuple)", () => {
		const stmt = parseStatement(`with (context1, context2):
    pass`);
		assertNodeType(stmt, "With");
		expect(stmt.items).toHaveLength(2);
		expect(stmt.items[0].context_expr.nodeType).toBe("Name");
		expect(stmt.items[1].context_expr.nodeType).toBe("Name");
	});

	test("parenthesized tuple context manager is still a single item", () => {
		const stmt = parseStatement(`with (context1, context2) as var:
    pass`);
		assertNodeType(stmt, "With");
		expect(stmt.items).toHaveLength(1);
		expect(stmt.items[0].context_expr.nodeType).toBe("Tuple");
		expect(stmt.items[0].optional_vars?.nodeType).toBe("Name");
	});

	test("parenthesized generator expression context manager", () => {
		const stmt = parseStatement(`with (x for x in range(3)):
    pass`);
		assertNodeType(stmt, "With");
		expect(stmt.items).toHaveLength(1);
		expect(stmt.items[0].context_expr.nodeType).toBe("GeneratorExp");
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

	describe("Parameter list syntax quirks", () => {
		// These are def-site parameter-list shapes rather than call-argument
		// ordering (see error-handling.test.ts's "Parameter list ordering" for
		// the rejected orderings); placed alongside the rest of this describe's
		// FunctionDef coverage rather than function-calls.test.ts or
		// statements.test.ts, since it's this describe that already owns
		// FunctionDef parameter shape.
		test("positional-only separator", () => {
			const stmt = parseStatement("def f(a, b, /, c):\n    pass\n");
			assertNodeType(stmt, "FunctionDef");
			expect(stmt.args.posonlyargs.map((a) => a.arg)).toEqual(["a", "b"]);
			expect(stmt.args.args.map((a) => a.arg)).toEqual(["c"]);
		});

		test("trailing comma in parameter list", () => {
			const stmt = parseStatement("def f(a, b,):\n    pass\n");
			assertNodeType(stmt, "FunctionDef");
			expect(stmt.args.args.map((a) => a.arg)).toEqual(["a", "b"]);
		});

		test("blank line between trailing comma and closing paren", () => {
			const stmt = parseStatement("def f(\n    a,\n\n):\n    pass\n");
			assertNodeType(stmt, "FunctionDef");
			expect(stmt.args.args.map((a) => a.arg)).toEqual(["a"]);
		});

		test("keyword-only params after bare star", () => {
			const stmt = parseStatement("def f(a, *, b, c=1):\n    pass\n");
			assertNodeType(stmt, "FunctionDef");
			expect(stmt.args.kwonlyargs.map((a) => a.arg)).toEqual(["b", "c"]);
		});
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

	describe("Metaclass Syntax", () => {
		test("simple metaclass", () => {
			const stmt = parseStatement(
				`class DatabaseConnection(metaclass=SingletonMeta):
    pass`,
			);
			assertNodeType(stmt, "ClassDef");
			expect(stmt.name).toBe("DatabaseConnection");
			expect(stmt.bases).toHaveLength(0);
			expect(stmt.keywords).toHaveLength(1);
			expect(stmt.keywords[0].arg).toBe("metaclass");
			expect(stmt.keywords[0].value.nodeType).toBe("Name");
			expect((stmt.keywords[0].value as Name).id).toBe("SingletonMeta");
		});

		test("class with base class and metaclass", () => {
			const stmt = parseStatement(
				`class MyClass(BaseClass, metaclass=MyMeta):
    pass`,
			);
			assertNodeType(stmt, "ClassDef");
			expect(stmt.name).toBe("MyClass");
			expect(stmt.bases).toHaveLength(1);
			expect(stmt.bases[0].nodeType).toBe("Name");
			expect((stmt.bases[0] as Name).id).toBe("BaseClass");
			expect(stmt.keywords).toHaveLength(1);
			expect(stmt.keywords[0].arg).toBe("metaclass");
			expect((stmt.keywords[0].value as Name).id).toBe("MyMeta");
		});

		test("class with multiple bases and keyword arguments", () => {
			const stmt = parseStatement(
				`class Complex(Base1, Base2, metaclass=Meta, foo=bar, baz=42):
    pass`,
			);
			assertNodeType(stmt, "ClassDef");
			expect(stmt.name).toBe("Complex");
			expect(stmt.bases).toHaveLength(2);
			expect((stmt.bases[0] as Name).id).toBe("Base1");
			expect((stmt.bases[1] as Name).id).toBe("Base2");
			expect(stmt.keywords).toHaveLength(3);

			const metaclassKw = stmt.keywords.find((kw) => kw.arg === "metaclass");
			expect(metaclassKw).toBeDefined();
			expect((metaclassKw?.value as Name).id).toBe("Meta");

			const fooKw = stmt.keywords.find((kw) => kw.arg === "foo");
			expect(fooKw).toBeDefined();
			expect((fooKw?.value as Name).id).toBe("bar");

			const bazKw = stmt.keywords.find((kw) => kw.arg === "baz");
			expect(bazKw).toBeDefined();
			expect((bazKw?.value as Constant).value).toBe(42);
		});

		test("class with only keyword arguments (no bases)", () => {
			const stmt = parseStatement(
				`class MyClass(metaclass=SingletonMeta, abstract=True):
    pass`,
			);
			assertNodeType(stmt, "ClassDef");
			expect(stmt.name).toBe("MyClass");
			expect(stmt.bases).toHaveLength(0);
			expect(stmt.keywords).toHaveLength(2);
		});
	});
});

describe("Decorator and Class-Header Branch Coverage", () => {
	test("decorator followed by async-non-def throws", () => {
		expect(() => parseCode("@deco\nasync x = 1\n")).toThrow(
			/Invalid decorator target/,
		);
	});

	test("decorated async def without a return-type annotation", () => {
		// Only the decorated path routes through parseAsyncFunctionDef; a bare
		// top-level `async def` goes through parseAsyncStmt instead, which
		// delegates to parseFunctionDef.
		const module = parseCode("@deco\nasync def f():\n    pass\n");
		const fn = module.body[0] as ASTNode & { returns?: ASTNode };
		expect(fn.nodeType).toBe("AsyncFunctionDef");
		expect(fn.returns).toBeUndefined();
	});

	test("class with empty parentheses has no bases or keywords", () => {
		const module = parseCode("class Foo():\n    pass\n");
		const cls = module.body[0] as ASTNode & {
			bases: unknown[];
			keywords: unknown[];
		};
		expect(cls.nodeType).toBe("ClassDef");
		expect(cls.bases).toEqual([]);
		expect(cls.keywords).toEqual([]);
	});

	test("comment-only line between a decorator and its target does not throw", () => {
		const module = parseCode(
			"@deco\n# pragma: valid SAT pragma\ndef f():\n    pass\n",
		);
		const fn = module.body[0] as ASTNode & { lineno: number };
		expect(fn.nodeType).toBe("FunctionDef");
		expect(fn.lineno).toBe(3);
	});

	test("blank line between a decorator and its target does not throw", () => {
		const module = parseCode("@deco\n\ndef f():\n    pass\n");
		const fn = module.body[0] as ASTNode & { lineno: number };
		expect(fn.nodeType).toBe("FunctionDef");
		expect(fn.lineno).toBe(3);
	});

	test("multiple comment-only lines between stacked decorators do not throw", () => {
		const module = parseCode(
			"@deco1\n# note one\n# note two\n@deco2\n\nclass C:\n    pass\n",
		);
		const cls = module.body[0] as ASTNode & {
			decorator_list: unknown[];
			lineno: number;
		};
		expect(cls.nodeType).toBe("ClassDef");
		expect(cls.decorator_list).toHaveLength(2);
		expect(cls.lineno).toBe(6);
	});
});

describe("Multiple ';'-separated statements in a single-line suite", () => {
	// Verified against CPython 3.13: `simple_stmts: simple_stmt (';'
	// simple_stmt)* [';'] NEWLINE` — a single-line suite can hold more than
	// one `;`-separated statement, not just the first.
	test("two statements, then a following 'else' clause", () => {
		const stmt = parseStatement("if a: b = 1; del c\nelse: b = 2\n") as {
			body: StmtNode[];
		};
		expect(stmt.body.map((s) => s.nodeType)).toEqual(["Assign", "Delete"]);
	});

	test("three statements on one line", () => {
		const stmt = parseStatement("if a: b = 1; c = 2; d = 3\n") as {
			body: StmtNode[];
		};
		expect(stmt.body).toHaveLength(3);
	});

	test("a trailing ';' right before the newline", () => {
		const stmt = parseStatement("if a: b = 1;\nelse: b = 2\n") as {
			body: StmtNode[];
		};
		expect(stmt.body).toHaveLength(1);
	});

	test("a trailing ';' at end of file (no trailing newline)", () => {
		const stmt = parseStatement("if a: b = 1;") as { body: StmtNode[] };
		expect(stmt.body).toHaveLength(1);
	});
});
