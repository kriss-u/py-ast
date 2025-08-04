import { parse, unparse } from "../src/index.js";
import { collectComments } from "./test-helpers.js";

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
		expect(ast.body[0].nodeType).toBe("Expr");
		expect((ast.body[0] as any).value.nodeType).toBe("Constant");
		expect((ast.body[0] as any).value.value).toBe("a");

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
		expect(comments.map(c => c.value)).toEqual([
			"# Module docstring",
			"# Function definition",
			"# Inside function",
			"# Return value"
		]);
	});
});

describe("Quote Style Preservation", () => {
	test("preserves single quotes", () => {
		const code = "x = 'hello world'";
		const ast = parse(code);
		const unparsed = unparse(ast);
		expect(unparsed).toBe("x = 'hello world'");
	});

	test("preserves double quotes", () => {
		const code = 'x = "hello world"';
		const ast = parse(code);
		const unparsed = unparse(ast);
		expect(unparsed).toBe('x = "hello world"');
	});

	test("preserves triple single quotes", () => {
		const code = `x = '''hello
world'''`;
		const ast = parse(code);
		const unparsed = unparse(ast);
		expect(unparsed).toBe(`x = '''hello
world'''`);
	});

	test("preserves triple double quotes", () => {
		const code = `x = """hello
world"""`;
		const ast = parse(code);
		const unparsed = unparse(ast);
		expect(unparsed).toBe(`x = """hello
world"""`);
	});

	test("preserves raw strings", () => {
		const code = 'x = r"raw string"';
		const ast = parse(code);
		const unparsed = unparse(ast);
		expect(unparsed).toBe('x = r"raw string"');
	});

	test("preserves f-strings", () => {
		const code = 'x = f"hello {name}"';
		const ast = parse(code);
		const unparsed = unparse(ast);
		expect(unparsed).toBe('x = f"hello {name}"');
	});

	test("preserves mixed quote styles in collections", () => {
		const code = `lst = ['single', "double", '''triple''', """triple2"""]`;
		const ast = parse(code);
		const unparsed = unparse(ast);
		expect(unparsed).toBe(`lst = ['single', "double", '''triple''', """triple2"""]`);
	});

	test("defaults to double quotes for strings without kind info", () => {
		// Create a constant node manually without kind info
		const ast: any = {
			nodeType: "Module",
			body: [{
				nodeType: "Expr",
				value: {
					nodeType: "Constant",
					value: "test string",
					lineno: 1,
					col_offset: 0
				},
				lineno: 1,
				col_offset: 0
			}],
			lineno: 1,
			col_offset: 0
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
