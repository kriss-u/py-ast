import { parse } from "../src/index.js";
import { assertNodeType } from "./test-helpers.js";

function parseStatement(code: string) {
	const ast = parse(code);
	return ast.body[0];
}

describe("Import with Parentheses", () => {
	describe("Valid parenthesized imports", () => {
		test("single name in parentheses", () => {
			const stmt = parseStatement(`from module import (name)`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("module");
			expect(stmt.names).toHaveLength(1);
			expect(stmt.names[0].name).toBe("name");
		});

		test("multiple names in parentheses", () => {
			const stmt = parseStatement(`from some.module import (function_one, function_two, function_three)`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("some.module");
			expect(stmt.names).toHaveLength(3);
			expect(stmt.names[0].name).toBe("function_one");
			expect(stmt.names[1].name).toBe("function_two");
			expect(stmt.names[2].name).toBe("function_three");
		});

		test("multiline parenthesized imports", () => {
			const stmt = parseStatement(`from pkg import (
    name1,
    name2,
    name3
)`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("pkg");
			expect(stmt.names).toHaveLength(3);
			expect(stmt.names[0].name).toBe("name1");
			expect(stmt.names[1].name).toBe("name2");
			expect(stmt.names[2].name).toBe("name3");
		});

		test("trailing comma in parentheses", () => {
			const stmt = parseStatement(`from module import (name,)`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("module");
			expect(stmt.names).toHaveLength(1);
			expect(stmt.names[0].name).toBe("name");
		});

		test("spaces around names in parentheses", () => {
			const stmt = parseStatement(`from module import ( name )`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("module");
			expect(stmt.names).toHaveLength(1);
			expect(stmt.names[0].name).toBe("name");
		});

		test("alias in parentheses", () => {
			const stmt = parseStatement(`from module import (name as alias)`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("module");
			expect(stmt.names).toHaveLength(1);
			expect(stmt.names[0].name).toBe("name");
			expect(stmt.names[0].asname).toBe("alias");
		});

		test("relative imports with parentheses", () => {
			const stmt = parseStatement(`from .module import (name)`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("module");
			expect(stmt.level).toBe(1);
			expect(stmt.names).toHaveLength(1);
			expect(stmt.names[0].name).toBe("name");
		});
	});

	describe("Invalid parenthesized imports (should throw errors)", () => {
		test("empty parentheses should fail", () => {
			expect(() => {
				parseStatement(`from module import()`);
			}).toThrow(/Expected name/);
		});

		test("empty parentheses with space should fail", () => {
			expect(() => {
				parseStatement(`from module import ( )`);
			}).toThrow(/Expected name/);
		});

		test("only comma in parentheses should fail", () => {
			expect(() => {
				parseStatement(`from module import (,)`);
			}).toThrow(/Expected name/);
		});

		test("multiple commas without names should fail", () => {
			expect(() => {
				parseStatement(`from module import (,,)`);
			}).toThrow(/Expected name/);
		});

		test("leading comma should fail", () => {
			expect(() => {
				parseStatement(`from module import (, name)`);
			}).toThrow(/Expected name/);
		});
	});

	describe("Regular imports still work", () => {
		test("import without parentheses", () => {
			const stmt = parseStatement(`from module import name1, name2`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("module");
			expect(stmt.names).toHaveLength(2);
			expect(stmt.names[0].name).toBe("name1");
			expect(stmt.names[1].name).toBe("name2");
		});

		test("star import", () => {
			const stmt = parseStatement(`from module import *`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.module).toBe("module");
			expect(stmt.names).toHaveLength(1);
			expect(stmt.names[0].name).toBe("*");
		});
	});
});
