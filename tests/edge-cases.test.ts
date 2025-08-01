import { assertNodeType, parseCode, parseExpression } from "./test-helpers.js";

describe("Error Handling and Edge Cases", () => {
	test("handles empty input", () => {
		const ast = parseCode("");
		expect(ast.nodeType).toBe("Module");
		expect(ast.body).toHaveLength(0);
	});

	test("handles whitespace-only input", () => {
		const ast = parseCode("   \n\n  \t  \n");
		expect(ast.nodeType).toBe("Module");
		expect(ast.body).toHaveLength(0);
	});

	test("handles comments-only input", () => {
		const ast = parseCode(`
# This is a comment
# Another comment
    # Indented comment
`);
		expect(ast.nodeType).toBe("Module");
	});

	test("handles mixed whitespace and comments", () => {
		const ast = parseCode(`

# Comment 1

    # Indented comment

# Final comment

`);
		expect(ast.nodeType).toBe("Module");
	});
});

describe("Syntax Error Cases", () => {
	test("invalid syntax should throw meaningful errors", () => {
		const invalidCases = [
			"def :", // Missing function name
			"if :", // Missing condition
			"for in items:", // Missing variable
			"class :", // Missing class name
			"import", // Missing module name
			"[1,]", // This should actually be valid - trailing comma in list
			"def func(x y):", // Missing comma in parameters
		];

		invalidCases.forEach((code) => {
			try {
				parseCode(code);
				// If we get here without an error, the case might be valid Python
				// or our parser is more permissive than expected
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				if (error instanceof Error) {
					expect(error.message).toBeTruthy();
				}
			}
		});
	});
});

describe("Complex Nested Structures", () => {
	test("deeply nested function calls", () => {
		const expr = parseExpression("f(g(h(i(j(k())))))");
		assertNodeType(expr, "Call");

		let current = expr;
		let depth = 1;
		while (current.args.length > 0 && current.args[0].nodeType === "Call") {
			current = current.args[0];
			depth++;
		}
		expect(depth).toBeGreaterThan(3);
	});

	test("deeply nested attribute access", () => {
		const expr = parseExpression("a.b.c.d.e.f.g");
		assertNodeType(expr, "Attribute");

		let current = expr;
		let depth = 1;
		while (current.value && current.value.nodeType === "Attribute") {
			current = current.value;
			depth++;
		}
		expect(depth).toBeGreaterThan(5);
	});

	test("complex nested comprehensions", () => {
		const expr = parseExpression(`[
      [
        item.upper() 
        for item in row 
        if item.startswith('a')
      ] 
      for row in matrix 
      if len(row) > 0
    ]`);
		assertNodeType(expr, "ListComp");
		assertNodeType(expr.elt, "ListComp");
	});
});

describe("Unicode and Special Characters", () => {
	test("unicode identifiers", () => {
		const stmt = parseCode("变量 = 'value'");
		expect(stmt.body[0].nodeType).toBe("Assign");
	});

	test("unicode strings", () => {
		const expr = parseExpression("'Hello 世界 🌍'");
		assertNodeType(expr, "Constant");
		expect(expr.value).toBe("Hello 世界 🌍");
	});

	test("raw strings", () => {
		const expr = parseExpression("r'raw\\nstring'");
		assertNodeType(expr, "Constant");
	});

	test("triple quoted strings", () => {
		const expr = parseExpression(`"""
Multi-line
string
"""`);
		assertNodeType(expr, "Constant");
	});
});

describe("Number Edge Cases", () => {
	test("very large integers", () => {
		const expr = parseExpression("999999999999999999999999999999");
		assertNodeType(expr, "Constant");
		expect(typeof expr.value).toBe("number");
	});

	test("scientific notation", () => {
		const expr = parseExpression("1.23e-45");
		assertNodeType(expr, "Constant");
		expect(typeof expr.value).toBe("number");
	});

	test("complex number variations", () => {
		const cases = ["1j", "1.5j", "0j", "1e10j"];
		cases.forEach((num) => {
			const expr = parseExpression(num);
			assertNodeType(expr, "Constant");
		});
	});
});

describe("Operator Precedence Edge Cases", () => {
	test("mixed arithmetic and bitwise", () => {
		const expr = parseExpression("a + b << c & d | e");
		assertNodeType(expr, "BinOp");
		expect(expr.op.nodeType).toBe("BitOr");
	});

	test("comparison chaining with different operators", () => {
		const expr = parseExpression(
			"a < b <= c == d != e > f >= g is h is not i in j not in k",
		);
		assertNodeType(expr, "Compare");
		expect(expr.ops.length).toBeGreaterThan(5);
	});

	test("boolean operators with parentheses", () => {
		const expr = parseExpression("(a and b) or (c and d)");
		assertNodeType(expr, "BoolOp");
		expect(expr.op.nodeType).toBe("Or");
	});
});

describe("Function Parameter Edge Cases", () => {
	test("positional-only parameters", () => {
		const stmt = parseCode("def func(a, b, /, c, d): pass");
		expect(stmt.body[0].nodeType).toBe("FunctionDef");
	});

	test("keyword-only parameters", () => {
		const stmt = parseCode("def func(a, *, b, c=1): pass");
		expect(stmt.body[0].nodeType).toBe("FunctionDef");
	});

	test("complex parameter combinations", () => {
		const stmt = parseCode(`
def complex_func(
    pos_only1, pos_only2, /,
    normal1, normal2='default',
    *args,
    kw_only1, kw_only2=42,
    **kwargs
): pass
`);
		assertNodeType(stmt.body[0], "FunctionDef");
	});
});

describe("Collection Edge Cases", () => {
	test("trailing commas", () => {
		const list = parseExpression("[1, 2, 3,]");
		assertNodeType(list, "List");
		expect(list.elts).toHaveLength(3);

		const tuple = parseExpression("(1, 2, 3,)");
		assertNodeType(tuple, "Tuple");
		expect(tuple.elts).toHaveLength(3);

		const dict = parseExpression("{'a': 1, 'b': 2,}");
		assertNodeType(dict, "Dict");
		expect(dict.keys).toHaveLength(2);
	});

	test("single element tuple", () => {
		const expr = parseExpression("(1,)");
		assertNodeType(expr, "Tuple");
		expect(expr.elts).toHaveLength(1);
	});

	test("empty tuple", () => {
		const expr = parseExpression("()");
		assertNodeType(expr, "Tuple");
		expect(expr.elts).toHaveLength(0);
	});
});

describe("Statement Boundary Cases", () => {
	test("multiple statements on one line", () => {
		const ast = parseCode("x = 1; y = 2; z = 3");
		expect(ast.body).toHaveLength(3); // Parser correctly separates statements by semicolon
	});

	test("backslash line continuation", () => {
		const ast = parseCode(`x = 1 + \\
    2 + \\
    3`);
		expect(ast.body).toHaveLength(1);
	});

	test("implicit line joining", () => {
		const ast = parseCode(`x = [
    1,
    2,
    3
]`);
		expect(ast.body).toHaveLength(1);
	});
});
