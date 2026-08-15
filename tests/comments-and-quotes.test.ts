import { describe, expect, test } from "vitest";
import { parse, unparse } from "../src/index.js";
import type { ASTNode, Module, StmtNode } from "../src/types.js";
import {
	assertNodeType,
	collectComments,
	parseStatement,
	testUnparse,
} from "./test-helpers.js";

describe("Comment Parsing", () => {
	test("parse with comments disabled", () => {
		const code = `# Top comment
x = 1  # Inline comment
# Bottom comment`;

		const ast = parse(code, { comments: false });
		expect(ast.nodeType).toBe("Module");
		// When comments are disabled, they should not appear in the AST body
		const comments = collectComments(ast);
		expect(comments).toHaveLength(0);
		expect(ast.body).toHaveLength(1);
		expect(ast.body[0].nodeType).toBe("Assign");
	});

	test("parse with comments enabled", () => {
		const code = `# Top comment
x = 1  # Inline comment
# Bottom comment`;

		const ast = parse(code, { comments: true });
		expect(ast.nodeType).toBe("Module");
		const comments = collectComments(ast);
		expect(comments).toHaveLength(3);

		expect(comments[0].nodeType).toBe("Comment");
		expect(comments[0].value).toBe("# Top comment");
		expect(comments[0].lineno).toBe(1);
		expect(comments[0].col_offset).toBe(0);

		expect(comments[1].value).toBe("# Inline comment");
		expect(comments[1].lineno).toBe(2);

		expect(comments[2].value).toBe("# Bottom comment");
		expect(comments[2].lineno).toBe(3);
	});

	test("standalone strings are not treated as comments", () => {
		const code = `"a"
'''multiline
string'''
"""another
multiline"""
x = 1`;

		const ast = parse(code, { comments: true });
		expect(ast.nodeType).toBe("Module");
		const comments = collectComments(ast);
		expect(comments.length).toBe(0);
		expect(ast.body).toHaveLength(4); // 3 expression statements + 1 assignment

		// First standalone string
		const firstStmt = ast.body[0];
		assertNodeType(firstStmt, "Expr");
		expect(firstStmt.value.nodeType).toBe("Constant");
		assertNodeType(firstStmt.value, "Constant");
		expect(firstStmt.value.value).toBe("a");

		// Assignment
		expect(ast.body[3].nodeType).toBe("Assign");
	});

	test("comments in complex code", () => {
		const code = `# Module docstring
def func():  # Function definition
    # Inside function
    return 42  # Return value`;

		const ast = parse(code, { comments: true });
		const comments = collectComments(ast);
		expect(comments).toHaveLength(4);
		expect(comments.map((c) => c.value)).toEqual([
			"# Module docstring",
			"# Function definition",
			"# Inside function",
			"# Return value",
		]);
	});

	test("trailing standalone comment before dedent is kept as its own node", () => {
		const code = `def f():
    pass
    # trailing
y = 2`;

		const ast = parse(code, { comments: true });
		expect(ast.body.map((s) => s.nodeType)).toEqual([
			"FunctionDef",
			"Comment",
			"Assign",
		]);
		const comments = collectComments(ast);
		expect(comments).toHaveLength(1);
		expect(comments[0].value).toBe("# trailing");
		expect(comments[0].inline).toBe(false);
	});

	test("nested block's trailing comment surfaces in the enclosing suite", () => {
		const code = `def f():
    if True:
        pass
        # trailing
    z = 1
y = 2`;

		const ast = parse(code, { comments: true });
		const firstStmt = ast.body[0];
		assertNodeType(firstStmt, "FunctionDef");
		const funcBody = firstStmt.body;
		expect(funcBody.map((s) => s.nodeType)).toEqual([
			"If",
			"Comment",
			"Assign",
		]);
		const trailingComment = funcBody[1];
		assertNodeType(trailingComment, "Comment");
		expect(trailingComment.value).toBe("# trailing");
	});
});

describe("Comment Attachment and Positions", () => {
	test("standalone comment before any statement", () => {
		const ast = parse("# leading\nx = 1\n", { comments: true });
		expect(ast.body.some((s) => s.nodeType === "Comment")).toBe(true);
	});

	test("inline comment attaches to previous statement", () => {
		const ast = parse("x = 1  # trailing\ny = 2\n", { comments: true });
		const first = ast.body.find(
			(s) => s.nodeType === "Assign" && "targets" in s,
		);
		expect(first?.inlineComment?.value).toBe("# trailing");
	});

	test("multiple standalone comments in a row at module level", () => {
		const ast = parse("# one\n# two\nx = 1\n", { comments: true });
		const comments = ast.body.filter((s) => s.nodeType === "Comment");
		expect(comments.length).toBeGreaterThanOrEqual(2);
	});

	test("comment immediately after colon before newline in suite", () => {
		const ast = parse("if True:  # note\n    pass\n", {
			comments: true,
		});
		expect(ast.comments?.length).toBeGreaterThan(0);
	});

	test("comments before INDENT inside a block", () => {
		const code = "if True:\n    # pre-indent comment\n    pass\n";
		const ast = parse(code, { comments: true });
		expect(ast.comments?.length).toBeGreaterThan(0);
	});

	test("comments nested in function/class/if/for/while/with/try/match bodies", () => {
		const code = [
			"def f():",
			"    # comment in function",
			"    pass",
			"",
			"class C:",
			"    # comment in class",
			"    pass",
			"",
			"if True:",
			"    x = 1  # inline in if",
			"else:",
			"    y = 2  # inline in else",
			"",
			"for i in range(3):",
			"    pass  # inline in for",
			"else:",
			"    pass  # inline in for-else",
			"",
			"while True:",
			"    break  # inline in while",
			"else:",
			"    pass  # inline in while-else",
			"",
			"with open('x') as fh:",
			"    pass  # inline in with",
			"",
			"try:",
			"    pass  # inline in try",
			"except Exception:",
			"    pass  # inline in except",
			"else:",
			"    pass  # inline in try-else",
			"finally:",
			"    pass  # inline in finally",
			"",
			"match 1:",
			"    case 1:",
			"        pass  # inline in match case",
			"",
		].join("\n");
		const ast = parse(code, { comments: true });
		expect(ast.comments?.length).toBeGreaterThan(10);
	});

	test("chained assignment collects trailing comment", () => {
		const ast = parse("x = y = 1  # chained\n", { comments: true });
		const stmt = ast.body[0];
		expect(stmt.nodeType).toBe("Assign");
		expect(stmt.inlineComment?.value).toBe("# chained");
	});

	test("standalone comment inside parenthesized assignment value", () => {
		const code = "x = (\n    # note\n    1\n)\n";
		const ast = parse(code, { comments: true });
		const stmt = ast.body[0] as ASTNode & {
			expressionComments?: { value: string }[];
		};
		expect(stmt.nodeType).toBe("Assign");
		expect(stmt.expressionComments?.length).toBe(1);
	});

	test("comment skipped after comma in list literal", () => {
		const ast = parse("x = [1,  # c\n    2]\n", { comments: true });
		expect(ast.comments?.length).toBeGreaterThan(0);
	});

	test("comments inside function parameter list", () => {
		const code = "def f(\n    a,  # first\n    b,\n):\n    pass\n";
		const ast = parse(code, { comments: true });
		expect(ast.comments?.length).toBeGreaterThan(0);
	});

	test("standalone comment on its own line inside parameter list", () => {
		const code = "def f(\n    a,\n    # standalone\n    b,\n):\n    pass\n";
		const ast = parse(code, { comments: true });
		expect(ast.comments?.length).toBeGreaterThan(0);
	});

	test("a second inline comment for a statement that already has one is discarded, at module level", () => {
		// The parenthesized tuple's trailing comma pulls "# internal" into
		// the Assign's own inlineComment while still inside expression
		// parsing; the semicolon then lets a second, genuinely separate
		// "# external" comment surface only once the statement has
		// already returned with inlineComment set.
		const src = "x = (1,  # internal\n)  ;  # external\n";
		const ast = parse(src, { comments: true });
		const assign = ast.body[0] as ASTNode & {
			inlineComment?: { value: string };
		};
		expect(assign.inlineComment?.value).toBe("# internal");
		expect(ast.comments?.some((c) => c.value === "# external")).toBe(false);
	});

	test("a second inline comment for a statement that already has one is discarded, inside a suite", () => {
		const src =
			"if True:\n    x = (1,  # internal\n    )  ;  # external\n    pass\n";
		const ast = parse(src, { comments: true });
		const ifStmt = ast.body[0] as ASTNode & { body: ASTNode[] };
		const assign = ifStmt.body[0] as ASTNode & {
			inlineComment?: { value: string };
		};
		expect(assign.inlineComment?.value).toBe("# internal");
		expect(ast.comments?.some((c) => c.value === "# external")).toBe(false);
	});
});

describe("single-line compound-statement body followed by a comment-only line", () => {
	// A comment-only line between a single-line `if a: ...` body and its
	// `elif`/`else` (or `except`/`finally`) previously left a stray
	// NEWLINE in the way of the follow-up clause check.
	test("elif after an inline if-body and a standalone comment", () => {
		const stmt = parseStatement("if a: y = 1\n# comment\nelif b: y = 2\n") as {
			orelse: StmtNode[];
		};
		expect(stmt.orelse[0].nodeType).toBe("If");
	});

	test("else after an inline while-body and a blank line", () => {
		const stmt = parseStatement("while a: y = 1\n\nelse: y = 2\n") as {
			orelse: StmtNode[];
		};
		expect(stmt.orelse).toHaveLength(1);
	});

	test("except after an inline try-body and a standalone comment", () => {
		const stmt = parseStatement("try: y = 1\n# c\nexcept: y = 2\n") as {
			handlers: unknown[];
		};
		expect(stmt.handlers).toHaveLength(1);
	});

	test("finally after an inline except-body and a standalone comment", () => {
		const stmt = parseStatement(
			"try: y = 1\nexcept: y = 2\n# c\nfinally: y = 3\n",
		) as { finalbody: StmtNode[] };
		expect(stmt.finalbody).toHaveLength(1);
	});
});

describe("Quote Style Preservation", () => {
	test.each<[string, string]>([
		["single quotes", "x = 'hello world'"],
		["double quotes", 'x = "hello world"'],
		["triple single quotes", "x = '''hello\nworld'''"],
		["triple double quotes", 'x = """hello\nworld"""'],
		["raw strings", 'x = r"raw string"'],
		["f-strings", 'x = f"hello {name}"'],
	])("preserves %s", (_name, code) => {
		testUnparse(code, code);
	});

	test("preserves u-prefixed strings and sets Constant.kind to CPython's real 'u' value", () => {
		const code = 'x = u"hello world"';
		const ast = parse(code);
		const assign = ast.body[0] as Extract<
			(typeof ast.body)[number],
			{ nodeType: "Assign" }
		>;
		const constant = assign.value as Extract<
			typeof assign.value,
			{ nodeType: "Constant" }
		>;
		expect(constant.kind).toBe("u");
		expect(unparse(ast)).toBe('x = u"hello world"');
	});

	test("an uppercase U-prefixed string also gets kind 'u'", () => {
		const code = "x = U'hello world'";
		const ast = parse(code);
		const assign = ast.body[0] as Extract<
			(typeof ast.body)[number],
			{ nodeType: "Assign" }
		>;
		const constant = assign.value as Extract<
			typeof assign.value,
			{ nodeType: "Constant" }
		>;
		expect(constant.kind).toBe("u");
	});

	test("a plain (non-u-prefixed) string has no kind, matching CPython", () => {
		const code = 'x = "hello world"';
		const ast = parse(code);
		const assign = ast.body[0] as Extract<
			(typeof ast.body)[number],
			{ nodeType: "Assign" }
		>;
		const constant = assign.value as Extract<
			typeof assign.value,
			{ nodeType: "Constant" }
		>;
		expect(constant.kind).toBeUndefined();
	});

	test("preserves mixed quote styles in collections", () => {
		const code = `lst = ['single', "double", '''triple''', """triple2"""]`;
		testUnparse(code, code);
	});

	test("defaults to double quotes for strings without a recorded quote style", () => {
		// Create a constant node manually, not via parse() — no original
		// quote style is recorded for it, so the unparser falls back to its
		// default.
		const ast: Module = {
			nodeType: "Module",
			body: [
				{
					nodeType: "Expr",
					value: {
						nodeType: "Constant",
						value: "test string",
						lineno: 1,
						col_offset: 0,
					},
					lineno: 1,
					col_offset: 0,
				},
			],
			lineno: 1,
			col_offset: 0,
		};

		const unparsed = unparse(ast);
		expect(unparsed).toBe('"test string"');
	});
});

describe("Integration with Comments and Quotes", () => {
	test("comments and quote styles work together", () => {
		const code = `# This is a comment
x = 'single quoted'  # Another comment
y = """triple
quoted"""  # Final comment`;

		const ast = parse(code, { comments: true });
		const unparsed = unparse(ast);

		// Check comments are collected
		const comments = collectComments(ast);
		expect(comments).toHaveLength(3);
		expect(comments[0].value).toBe("# This is a comment");
		expect(comments[1].value).toBe("# Another comment");
		expect(comments[2].value).toBe("# Final comment");

		// Check quote styles are preserved
		expect(unparsed).toContain("'single quoted'");
		expect(unparsed).toContain('"""triple\nquoted"""');
	});

	test("roundtrip parsing maintains both comments and quotes", () => {
		const originalCode = `# Module comment
def greet(name):  # Function comment
    msg = 'Hello'  # Single quote
    multiline = """
    This is a
    multiline string
    """  # Triple quote comment
    return f"{msg} {name}"  # F-string`;

		// First parse with comments
		const ast1 = parse(originalCode, { comments: true });
		const unparsed1 = unparse(ast1);

		// Parse the unparsed code again
		const ast2 = parse(unparsed1, { comments: false }); // Comments are lost in unparse
		const unparsed2 = unparse(ast2);

		// The code structure should be preserved even if comments are lost
		expect(unparsed1).toContain("'Hello'"); // Single quotes preserved
		expect(unparsed1).toContain('"""'); // Triple quotes preserved
		expect(unparsed1).toContain('f"{msg} {name}"'); // F-string preserved

		// Second roundtrip should still work
		expect(unparsed2).toContain("Hello"); // Content preserved
		expect(unparsed2).toContain('"""'); // Structure preserved

		// Comments should be in the AST
		const comments = collectComments(ast1);
		expect(comments).toHaveLength(5);
	});
});
