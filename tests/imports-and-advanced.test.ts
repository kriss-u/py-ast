import { describe, expect, test } from "vitest";
import { RELATIVE_IMPORT_DOT_CASES } from "./fixtures/index.js";
import { assertNodeType, parseStatement } from "./test-helpers.js";

describe("Import Statements", () => {
	test("simple import", () => {
		const stmt = parseStatement("import os");
		assertNodeType(stmt, "Import");
		expect(stmt.names).toHaveLength(1);
		expect(stmt.names[0].name).toBe("os");
		expect(stmt.names[0].asname).toBeUndefined();
	});

	test("import with alias", () => {
		const stmt = parseStatement("import os as operating_system");
		assertNodeType(stmt, "Import");
		expect(stmt.names[0].name).toBe("os");
		expect(stmt.names[0].asname).toBe("operating_system");
	});

	test("multiple imports", () => {
		const stmt = parseStatement("import os, sys, json");
		assertNodeType(stmt, "Import");
		expect(stmt.names).toHaveLength(3);
		expect(stmt.names[0].name).toBe("os");
		expect(stmt.names[1].name).toBe("sys");
		expect(stmt.names[2].name).toBe("json");
	});

	test("dotted import", () => {
		const stmt = parseStatement("import xml.etree.ElementTree");
		assertNodeType(stmt, "Import");
		expect(stmt.names[0].name).toBe("xml.etree.ElementTree");
	});

	test("mixed imports with aliases", () => {
		const stmt = parseStatement("import os, sys as system, json as js");
		assertNodeType(stmt, "Import");
		expect(stmt.names).toHaveLength(3);
		expect(stmt.names[0].asname).toBeUndefined();
		expect(stmt.names[1].asname).toBe("system");
		expect(stmt.names[2].asname).toBe("js");
	});
});

describe("From Import Statements", () => {
	test("simple from import", () => {
		const stmt = parseStatement("from os import path");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.module).toBe("os");
		expect(stmt.level).toBe(0);
		expect(stmt.names).toHaveLength(1);
		expect(stmt.names[0].name).toBe("path");
	});

	test("from import with alias", () => {
		const stmt = parseStatement("from os import path as p");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.names[0].name).toBe("path");
		expect(stmt.names[0].asname).toBe("p");
	});

	test("multiple from imports", () => {
		const stmt = parseStatement("from os import path, environ, getcwd");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.names).toHaveLength(3);
	});

	test("star import", () => {
		const stmt = parseStatement("from os import *");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.names).toHaveLength(1);
		expect(stmt.names[0].name).toBe("*");
	});

	test("dotted module from import", () => {
		const stmt = parseStatement("from xml.etree import ElementTree");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.module).toBe("xml.etree");
		expect(stmt.names[0].name).toBe("ElementTree");
	});
});

describe("Relative Imports", () => {
	// Verified against CPython 3.13: the lexer tokenizes any run of 3+ dots
	// as one or more `...` (ELLIPSIS) tokens rather than that many DOT
	// tokens, so e.g. 4 dots comes through as ELLIPSIS + DOT; the parser
	// must still recover the correct total dot count as `level`.
	test.each(RELATIVE_IMPORT_DOT_CASES)(
		"$dots leading dot(s) with a module name sets level=$expectedLevel, module=$expectedModule",
		({ code, expectedLevel, expectedModule }) => {
			const stmt = parseStatement(`${code}\n`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.level).toBe(expectedLevel);
			expect(stmt.module).toBe(expectedModule);
		},
	);

	test("single dot with no module name after the dot leaves module undefined", () => {
		const stmt = parseStatement("from . import module");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.level).toBe(1);
		expect(stmt.module).toBeUndefined();
		expect(stmt.names[0].name).toBe("module");
	});

	test("multiple dots with no module name after the dots leaves module undefined", () => {
		const stmt = parseStatement("from ... import module");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.level).toBe(3);
		expect(stmt.module).toBeUndefined();
	});
});

describe("Lazy Imports (PEP 810, Python 3.15+)", () => {
	test("'lazy import module' sets is_lazy", () => {
		const stmt = parseStatement("lazy import os\n");
		assertNodeType(stmt, "Import");
		expect(stmt.is_lazy).toBe(1);
		expect(stmt.names[0].name).toBe("os");
	});

	test("'lazy from module import name' sets is_lazy", () => {
		const stmt = parseStatement("lazy from os import path\n");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.is_lazy).toBe(1);
		expect(stmt.module).toBe("os");
	});

	test("plain 'import'/'from...import' leave is_lazy unset", () => {
		const importStmt = parseStatement("import os\n");
		assertNodeType(importStmt, "Import");
		expect(importStmt.is_lazy).toBeUndefined();

		const fromStmt = parseStatement("from os import path\n");
		assertNodeType(fromStmt, "ImportFrom");
		expect(fromStmt.is_lazy).toBeUndefined();
	});

	test("'lazy' remains usable as an ordinary identifier (soft keyword)", () => {
		expect(parseStatement("lazy = 5\n").nodeType).toBe("Assign");
		expect(parseStatement("lazy(x)\n").nodeType).toBe("Expr");
		expect(parseStatement("def lazy():\n    pass\n").nodeType).toBe(
			"FunctionDef",
		);
	});

	test("lazy import with dotted module and alias", () => {
		const stmt = parseStatement("lazy import os.path as p\n");
		assertNodeType(stmt, "Import");
		expect(stmt.is_lazy).toBe(1);
		expect(stmt.names[0]).toMatchObject({ name: "os.path", asname: "p" });
	});

	test("lazy relative from-import", () => {
		const stmt = parseStatement("lazy from . import module\n");
		assertNodeType(stmt, "ImportFrom");
		expect(stmt.is_lazy).toBe(1);
		expect(stmt.level).toBe(1);
	});
});

describe("Type Alias Statements (Python 3.12+)", () => {
	test("simple type alias", () => {
		const stmt = parseStatement("type Vector = list[float]");
		assertNodeType(stmt, "TypeAlias");
		expect(stmt.name.nodeType).toBe("Name");
		expect(stmt.value.nodeType).toBe("Subscript");
	});
});

describe("Complex Statement Combinations", () => {
	test("nested control structures", () => {
		const stmt = parseStatement(`if condition:
    for item in items:
        if item > 0:
            try:
                process(item)
            except Exception:
                pass`);
		assertNodeType(stmt, "If");
		assertNodeType(stmt.body[0], "For");
		assertNodeType(stmt.body[0].body[0], "If");
		assertNodeType(stmt.body[0].body[0].body[0], "Try");
	});

	test("decorated async function with complex signature", () => {
		const stmt = parseStatement(`@decorator1
@decorator2
async def complex_func(
    pos_only: int, /,
    regular: str = "default",
    *args: Any,
    kw_only: float = 1.0,
    **kwargs: Dict[str, Any]
) -> AsyncIterator[str]:
    pass`);
		assertNodeType(stmt, "AsyncFunctionDef");
		expect(stmt.decorator_list).toHaveLength(2);
		expect(stmt.returns?.nodeType).toBe("Subscript");
	});
});

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
			const stmt = parseStatement(
				`from some.module import (function_one, function_two, function_three)`,
			);
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

		test("multiple names with trailing comma", () => {
			const stmt = parseStatement(`from module import (name1, name2, name3,)`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.names).toHaveLength(3);
		});

		test("imports with aliases in parentheses", () => {
			const stmt = parseStatement(
				`from module import (name1 as alias1, name2 as alias2)`,
			);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.names).toHaveLength(2);
			expect(stmt.names[0].name).toBe("name1");
			expect(stmt.names[0].asname).toBe("alias1");
			expect(stmt.names[1].name).toBe("name2");
			expect(stmt.names[1].asname).toBe("alias2");
		});

		test("star import with parentheses", () => {
			const stmt = parseStatement(`from module import (*)`);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.names).toHaveLength(1);
			expect(stmt.names[0].name).toBe("*");
		});
	});

	describe("Edge cases with parentheses", () => {
		test("empty parentheses should fail", () => {
			expect(() => {
				parseStatement(`from module import ()`);
			}).toThrow();
		});

		test("nested parentheses should fail", () => {
			expect(() => {
				parseStatement(`from module import ((name))`);
			}).toThrow();
		});

		test("complex multiline imports with comments", () => {
			const code = `from very.long.module.name import (
    function_with_very_long_name,  # This function does something
    another_function,  # This one does something else
    ClassWithLongName,  # A class
    CONSTANT_VALUE,  # A constant
)`;
			const stmt = parseStatement(code);
			assertNodeType(stmt, "ImportFrom");
			expect(stmt.names).toHaveLength(4);
		});
	});
});
