import { parse } from "../index.js";

describe("Comment Parsing Debug", () => {
	test("parse code with inline comment", () => {
		const code = "x = 1  # this is a comment";

		console.log("Testing without type_comments:");
		const ast1 = parse(code, { type_comments: false });
		expect(ast1.nodeType).toBe("Module");

		console.log("Testing with type_comments:");
		try {
			const ast2 = parse(code, { type_comments: true });
			expect(ast2.nodeType).toBe("Module");
			console.log("Success with comments!");
		} catch (e: any) {
			console.log("Error with comments:", e.message);
			throw e;
		}
	});

	test("parse code with type comment", () => {
		const code = `x = 1  # type: int`;

		try {
			const ast = parse(code, { type_comments: true });
			expect(ast.nodeType).toBe("Module");
			console.log("Type comment parsing successful!");
		} catch (e: any) {
			console.log("Type comment error:", e.message);
			throw e;
		}
	});
});
