import { describe, expect, test } from "vitest";
import { parse } from "../src/index.js";
import type { Call, ExprNode, GeneratorExp, Name } from "../src/types.js";
import { unparse } from "../src/unparser.js";
import {
	assertNodeType,
	parseCode,
	parseExpression,
	parseStatement,
} from "./test-helpers.js";

describe("Function Calls", () => {
	test("simple function call", () => {
		const expr = parseExpression("func()");
		assertNodeType(expr, "Call");
		expect(expr.func.nodeType).toBe("Name");
		expect(expr.args).toHaveLength(0);
		expect(expr.keywords).toHaveLength(0);
	});

	test("function call with positional arguments", () => {
		const expr = parseExpression("func(1, 2, 3)");
		assertNodeType(expr, "Call");
		expect(expr.args).toHaveLength(3);
		expect(expr.args[0].nodeType).toBe("Constant");
	});

	test("function call with keyword arguments", () => {
		const expr = parseExpression("func(a=1, b=2)");
		assertNodeType(expr, "Call");
		expect(expr.keywords).toHaveLength(2);
		expect(expr.keywords[0].arg).toBe("a");
		expect(expr.keywords[0].value.nodeType).toBe("Constant");
	});

	test("function call with mixed arguments", () => {
		const expr = parseExpression("func(1, 2, a=3, b=4)");
		assertNodeType(expr, "Call");
		expect(expr.args).toHaveLength(2);
		expect(expr.keywords).toHaveLength(2);
	});

	test("function call with *args", () => {
		const expr = parseExpression("func(*args)");
		assertNodeType(expr, "Call");
		expect(expr.args).toHaveLength(1);
		expect(expr.args[0].nodeType).toBe("Starred");
	});

	test("function call with **kwargs", () => {
		const expr = parseExpression("func(**kwargs)");
		assertNodeType(expr, "Call");
		expect(expr.keywords).toHaveLength(1);
		expect(expr.keywords[0].arg).toBeUndefined(); // **kwargs has no arg name
	});

	test("method call", () => {
		const expr = parseExpression("obj.method()");
		assertNodeType(expr, "Call");
		expect(expr.func.nodeType).toBe("Attribute");
	});

	test("chained method calls", () => {
		const expr = parseExpression("obj.method1().method2()");
		assertNodeType(expr, "Call");
		assertNodeType(expr.func, "Attribute");
		assertNodeType(expr.func.value, "Call");
	});
});

describe("Comprehensions", () => {
	test("list comprehension", () => {
		const expr = parseExpression("[x for x in items]");
		assertNodeType(expr, "ListComp");
		expect(expr.elt.nodeType).toBe("Name");
		expect(expr.generators).toHaveLength(1);
		expect(expr.generators[0].target.nodeType).toBe("Name");
		expect(expr.generators[0].iter.nodeType).toBe("Name");
		expect(expr.generators[0].ifs).toHaveLength(0);
	});

	test("list comprehension with condition", () => {
		const expr = parseExpression("[x for x in items if x > 0]");
		assertNodeType(expr, "ListComp");
		expect(expr.generators[0].ifs).toHaveLength(1);
		expect(expr.generators[0].ifs[0].nodeType).toBe("Compare");
	});

	test("nested list comprehension", () => {
		const expr = parseExpression("[x for row in matrix for x in row]");
		assertNodeType(expr, "ListComp");
		expect(expr.generators).toHaveLength(2);
	});

	test("set comprehension", () => {
		const expr = parseExpression("{x for x in items}");
		assertNodeType(expr, "SetComp");
		expect(expr.elt.nodeType).toBe("Name");
		expect(expr.generators).toHaveLength(1);
	});

	test("dict comprehension", () => {
		const expr = parseExpression("{k: v for k, v in items.items()}");
		assertNodeType(expr, "DictComp");
		expect(expr.key.nodeType).toBe("Name");
		expect(expr.value.nodeType).toBe("Name");
		expect(expr.generators).toHaveLength(1);
	});

	test("generator expression", () => {
		const expr = parseExpression("(x for x in items)");
		assertNodeType(expr, "GeneratorExp");
		expect(expr.elt.nodeType).toBe("Name");
		expect(expr.generators).toHaveLength(1);
	});

	test("async comprehension", () => {
		const expr = parseExpression("[x async for x in async_items]");
		assertNodeType(expr, "ListComp");
		expect(expr.generators[0].is_async).toBe(1);
	});

	describe("Generator expressions with multiple/complex clauses", () => {
		// Deep field-by-field inspection of GeneratorExp.generators structure,
		// as distinct from the string-equality checks in unparser tests.
		test("two for clauses", () => {
			const expr = parseExpression("(x for x in range(10) for y in range(5))");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);

			expect(expr.generators[0].target.nodeType).toBe("Name");
			expect((expr.generators[0].target as Name).id).toBe("x");
			expect(expr.generators[0].iter.nodeType).toBe("Call");
			expect(expr.generators[0].ifs).toHaveLength(0);
			expect(expr.generators[0].is_async).toBe(0);

			expect(expr.generators[1].target.nodeType).toBe("Name");
			expect((expr.generators[1].target as Name).id).toBe("y");
			expect(expr.generators[1].iter.nodeType).toBe("Call");
			expect(expr.generators[1].ifs).toHaveLength(0);
			expect(expr.generators[1].is_async).toBe(0);
		});

		test("three for clauses", () => {
			const expr = parseExpression("(x for x in a for y in b for z in c)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(3);

			expect((expr.generators[0].target as Name).id).toBe("x");
			expect((expr.generators[1].target as Name).id).toBe("y");
			expect((expr.generators[2].target as Name).id).toBe("z");
		});

		test("multiple for clauses with conditions", () => {
			const expr = parseExpression(
				"(x for x in range(10) if x > 5 for y in range(5) if y < 3)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);

			expect((expr.generators[0].target as Name).id).toBe("x");
			expect(expr.generators[0].ifs).toHaveLength(1);
			expect(expr.generators[0].ifs[0].nodeType).toBe("Compare");

			expect((expr.generators[1].target as Name).id).toBe("y");
			expect(expr.generators[1].ifs).toHaveLength(1);
			expect(expr.generators[1].ifs[0].nodeType).toBe("Compare");
		});

		test("complex real-world example with three generators and nested ifs", () => {
			const code = `(
				transform(item)
				for sublist in nested_structure
				for item in sublist
				if predicate(item)
				for transformed in [transform(item)]
				if validate(transformed)
			)`;

			const expr = parseExpression(code);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(3);

			expect(expr.elt.nodeType).toBe("Call");
			expect(((expr.elt as Call).func as Name).id).toBe("transform");

			expect((expr.generators[0].target as Name).id).toBe("sublist");
			expect(expr.generators[0].iter.nodeType).toBe("Name");
			expect((expr.generators[0].iter as Name).id).toBe("nested_structure");
			expect(expr.generators[0].ifs).toHaveLength(0);

			expect((expr.generators[1].target as Name).id).toBe("item");
			expect(expr.generators[1].iter.nodeType).toBe("Name");
			expect((expr.generators[1].iter as Name).id).toBe("sublist");
			expect(expr.generators[1].ifs).toHaveLength(1);
			expect(expr.generators[1].ifs[0].nodeType).toBe("Call");

			expect((expr.generators[2].target as Name).id).toBe("transformed");
			expect(expr.generators[2].iter.nodeType).toBe("List");
			expect(expr.generators[2].ifs).toHaveLength(1);
			expect(expr.generators[2].ifs[0].nodeType).toBe("Call");
		});

		test("condition before additional for clause", () => {
			const expr = parseExpression(
				"(x for x in range(10) if x > 5 for y in range(x))",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].ifs).toHaveLength(1);
			expect(expr.generators[1].ifs).toHaveLength(0);
		});

		test("multiple conditions on single comprehension", () => {
			const expr = parseExpression(
				"(x for x in range(20) if x > 5 if x < 15 if x % 2 == 0)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].ifs).toHaveLength(3);
		});

		test("interleaved conditions and comprehensions", () => {
			const expr = parseExpression(
				"(x for x in a if p(x) for y in b if q(y) for z in c if r(z))",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(3);
			expect(expr.generators[0].ifs).toHaveLength(1);
			expect(expr.generators[1].ifs).toHaveLength(1);
			expect(expr.generators[2].ifs).toHaveLength(1);
		});

		test("generator as iterator", () => {
			const expr = parseExpression("(x for x in (y for y in range(10)))");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].iter.nodeType).toBe("GeneratorExp");
		});

		test("nested generators with conditions", () => {
			const expr = parseExpression(
				"(x for x in (y for y in range(10) if y % 2 == 0) if x > 5)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].iter.nodeType).toBe("GeneratorExp");
			expect(expr.generators[0].ifs).toHaveLength(1);

			const nested = expr.generators[0].iter as GeneratorExp;
			expect(nested.generators).toHaveLength(1);
			expect(nested.generators[0].ifs).toHaveLength(1);
		});

		test("complex element with multiple comprehensions", () => {
			const expr = parseExpression(
				"((x, y, z) for x in a for y in b for z in c)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.elt.nodeType).toBe("Tuple");
			expect(expr.generators).toHaveLength(3);
		});

		test("function call as element", () => {
			const expr = parseExpression(
				"(func(x, y) for x in range(10) for y in range(x))",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.elt.nodeType).toBe("Call");
			expect(expr.generators).toHaveLength(2);
		});

		test("attribute access as element", () => {
			const expr = parseExpression(
				"(obj.method(x) for x in items for obj in objects)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.elt.nodeType).toBe("Call");
			expect((expr.elt as Call).func.nodeType).toBe("Attribute");
			expect(expr.generators).toHaveLength(2);
		});

		test("function call as iterator", () => {
			const expr = parseExpression(
				"(x for x in get_items() for y in get_more_items(x))",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].iter.nodeType).toBe("Call");
			expect(expr.generators[1].iter.nodeType).toBe("Call");
		});

		test("attribute access as iterator", () => {
			const expr = parseExpression("(x for x in obj.items for y in x.values)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].iter.nodeType).toBe("Attribute");
			expect(expr.generators[1].iter.nodeType).toBe("Attribute");
		});

		test("subscript as iterator", () => {
			const expr = parseExpression("(x for x in matrix[0] for y in matrix[x])");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].iter.nodeType).toBe("Subscript");
			expect(expr.generators[1].iter.nodeType).toBe("Subscript");
		});

		test("complex generator assignment", () => {
			const ast = parse(`result = (
				process(item, context)
				for batch in data_batches
				for item in batch.items
				if item.is_valid
				for context in [get_context(item)]
				if context.should_process
			)`);

			expect(ast.body).toHaveLength(1);
			const stmt = ast.body[0];
			assertNodeType(stmt, "Assign");
			assertNodeType(stmt.value, "GeneratorExp");
			expect(stmt.value.generators).toHaveLength(3);
		});
	});

	describe("'async' not followed by 'for' throws", () => {
		test.each<[string, string, RegExp]>([
			[
				"generator expression",
				"async def f():\n    return (x async for x in y async z)\n",
				/Expected '\)' after generator expression/,
			],
			[
				"list comprehension",
				"async def f():\n    return [x async for x in y async z]\n",
				/Expected '\]' after list comprehension/,
			],
			[
				"dict comprehension's second clause",
				"{k: v for k, v in x async z}\n",
				/Expected '}' after dict comprehension/,
			],
			[
				"set comprehension's second clause",
				"{v for v in x async z}\n",
				/Expected '}' after set comprehension/,
			],
		])("%s", (_name, code, expected) => {
			expect(() => parseCode(code)).toThrow(expected);
		});
	});

	describe("Async generator expressions", () => {
		test("simple async generator", () => {
			const expr = parseExpression("(x async for x in async_items)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].is_async).toBe(1);
			expect((expr.generators[0].target as Name).id).toBe("x");
		});

		test("async generator with condition", () => {
			const expr = parseExpression("(x async for x in async_items if x > 0)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].is_async).toBe(1);
			expect(expr.generators[0].ifs).toHaveLength(1);
		});

		test("mixed sync and async generators", () => {
			const expr = parseExpression(
				"(x for x in items async for y in async_items)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].is_async).toBe(0);
			expect(expr.generators[1].is_async).toBe(1);
		});

		test("async first then sync", () => {
			const expr = parseExpression(
				"(x async for x in async_items for y in items)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].is_async).toBe(1);
			expect(expr.generators[1].is_async).toBe(0);
		});

		test("multiple async generators", () => {
			const expr = parseExpression(
				"(x async for x in async_items async for y in async_items2)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].is_async).toBe(1);
			expect(expr.generators[1].is_async).toBe(1);
		});

		test("complex async generator with multiple conditions", () => {
			const code = `(
				await process(item)
				async for batch in async_batches
				for item in batch
				if item.is_ready
				async for result in async_process(item)
				if await validate(result)
			)`;

			const expr = parseExpression(code);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(3);

			expect(expr.generators[0].is_async).toBe(1);
			expect((expr.generators[0].target as Name).id).toBe("batch");
			expect(expr.generators[0].ifs).toHaveLength(0);

			expect(expr.generators[1].is_async).toBe(0);
			expect((expr.generators[1].target as Name).id).toBe("item");
			expect(expr.generators[1].ifs).toHaveLength(1);

			expect(expr.generators[2].is_async).toBe(1);
			expect((expr.generators[2].target as Name).id).toBe("result");
			expect(expr.generators[2].ifs).toHaveLength(1);
		});

		test("async generator with await in element", () => {
			const expr = parseExpression(
				"(await func(x) async for x in async_items)",
			);
			assertNodeType(expr, "GeneratorExp");
			expect(expr.elt.nodeType).toBe("Await");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].is_async).toBe(1);
		});
	});
});

describe("F-strings", () => {
	test("simple f-string", () => {
		const expr = parseExpression('f"Hello {name}"');
		assertNodeType(expr, "JoinedStr");
		expect(expr.values).toHaveLength(2);
		expect(expr.values[0].nodeType).toBe("Constant");
		expect(expr.values[1].nodeType).toBe("FormattedValue");
	});

	test("f-string with expression", () => {
		const expr = parseExpression('f"Result: {x + y}"');
		assertNodeType(expr, "JoinedStr");
		const formatted = expr.values[1];
		assertNodeType(formatted, "FormattedValue");
		expect(formatted.value.nodeType).toBe("BinOp");
	});

	test("f-string with format spec", () => {
		const expr = parseExpression('f"Number: {value:.2f}"');
		assertNodeType(expr, "JoinedStr");
		const formatted = expr.values[1];
		assertNodeType(formatted, "FormattedValue");
		expect(formatted.format_spec).toBeDefined();
	});

	test("f-string format spec round-trip", () => {
		const source = 'f"Elapsed: {time.time() - self.start:.2f}s"';
		const ast = parseCode(source);
		const unparsed = unparse(ast);
		expect(unparsed).toBe(source);

		// Ensure it can be parsed again
		const ast2 = parseCode(unparsed);
		expect(ast2).toBeDefined();
	});

	test("f-string with conversion", () => {
		const expr = parseExpression('f"Debug: {value!r}"');
		assertNodeType(expr, "JoinedStr");
		const formatted = expr.values[1];
		assertNodeType(formatted, "FormattedValue");
		expect(formatted.conversion).toBe(114); // 'r'
	});
});

describe("Await and Yield", () => {
	test("await expression", () => {
		const expr = parseExpression("await coro()");
		assertNodeType(expr, "Await");
		expect(expr.value.nodeType).toBe("Call");
	});

	test("yield expression", () => {
		const expr = parseExpression("yield value");
		assertNodeType(expr, "Yield");
		expect(expr.value?.nodeType).toBe("Name");
	});

	test("yield without value", () => {
		const expr = parseExpression("yield");
		assertNodeType(expr, "Yield");
		expect(expr.value).toBeUndefined();
	});

	test("yield from", () => {
		const expr = parseExpression("yield from generator()");
		assertNodeType(expr, "YieldFrom");
		expect(expr.value.nodeType).toBe("Call");
	});
});

describe("Starred Expressions", () => {
	test("starred in function call", () => {
		const expr = parseExpression("func(*args)");
		assertNodeType(expr, "Call");
		expect(expr.args[0].nodeType).toBe("Starred");
	});

	test("starred in list literal", () => {
		const expr = parseExpression("[1, *items, 2]");
		assertNodeType(expr, "List");
		expect(expr.elts[1].nodeType).toBe("Starred");
	});

	test("starred in tuple literal", () => {
		const expr = parseExpression("(1, *items, 2)");
		assertNodeType(expr, "Tuple");
		expect(expr.elts[1].nodeType).toBe("Starred");
	});

	// Verified against CPython 3.13.
	test.each<[string, string[]]>([
		["{*a, *b}", ["Starred", "Starred"]],
		["{a, *b}", ["Name", "Starred"]],
		["{*a, *b,}", ["Starred", "Starred"]],
	])("starred element(s) in a set display '%s'", (code, expectedTypes) => {
		const expr = parseExpression(code);
		assertNodeType(expr, "Set");
		expect(expr.elts.map((e) => e.nodeType)).toEqual(expectedTypes);
	});

	test("starred return value", () => {
		const stmt = parseStatement("def f():\n    return *a, b\n");
		assertNodeType(stmt, "FunctionDef");
		const ret = stmt.body[0] as { value: ExprNode };
		expect(ret.value.nodeType).toBe("Tuple");
	});

	test("starred yield value", () => {
		const stmt = parseStatement("def f():\n    yield *a, b\n");
		assertNodeType(stmt, "FunctionDef");
		const exprStmt = stmt.body[0] as { value: { value: ExprNode } };
		expect(exprStmt.value.value.nodeType).toBe("Tuple");
	});

	test("starred assignment value", () => {
		const stmt = parseStatement("x = *a, b\n");
		assertNodeType(stmt, "Assign");
		expect(stmt.value.nodeType).toBe("Tuple");
	});

	test("starred chained-assignment value", () => {
		const stmt = parseStatement("x = y = *a, b\n");
		assertNodeType(stmt, "Assign");
		expect(stmt.value.nodeType).toBe("Tuple");
	});

	test("starred annotated-assignment value", () => {
		const stmt = parseStatement("x: tuple = *a, b\n");
		assertNodeType(stmt, "AnnAssign");
		expect(stmt.value?.nodeType).toBe("Tuple");
	});

	test("starred for-loop iterable", () => {
		const stmt = parseStatement("for x in *a, b:\n    pass\n");
		assertNodeType(stmt, "For");
		expect(stmt.iter.nodeType).toBe("Tuple");
	});

	test("starred for-loop target", () => {
		const stmt = parseStatement("for label, *data in x:\n    pass\n");
		assertNodeType(stmt, "For");
		const target = stmt.target as { elts: ExprNode[] };
		expect(target.elts.map((e) => e.nodeType)).toEqual(["Name", "Starred"]);
	});

	test("starred class base", () => {
		const stmt = parseStatement("class C(*bases):\n    pass\n");
		assertNodeType(stmt, "ClassDef");
		expect(stmt.bases[0].nodeType).toBe("Starred");
	});

	test("double-starred class keyword", () => {
		const stmt = parseStatement("class C(**kwds):\n    pass\n");
		assertNodeType(stmt, "ClassDef");
		expect(stmt.keywords[0].arg).toBeUndefined();
	});

	test("class with a mix of base, starred base, keyword, and double-starred keyword", () => {
		const stmt = parseStatement(
			"class C(base, *more, meta=X, **kw):\n    pass\n",
		);
		assertNodeType(stmt, "ClassDef");
		expect(stmt.bases.map((b) => b.nodeType)).toEqual(["Name", "Starred"]);
		expect(stmt.keywords.map((k) => k.arg)).toEqual(["meta", undefined]);
	});
});
