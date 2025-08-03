import { describe, expect, test } from "@jest/globals";
import { parse } from "../src/index.js";
import { assertNodeType, parseExpression } from "./test-helpers.js";

describe("Complex Generator Expressions", () => {
	describe("Multiple comprehensions", () => {
		test("two for clauses", () => {
			const expr = parseExpression("(x for x in range(10) for y in range(5))");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			
			// First comprehension: for x in range(10)
			expect(expr.generators[0].target.nodeType).toBe("Name");
			expect((expr.generators[0].target as any).id).toBe("x");
			expect(expr.generators[0].iter.nodeType).toBe("Call");
			expect(expr.generators[0].ifs).toHaveLength(0);
			expect(expr.generators[0].is_async).toBe(0);
			
			// Second comprehension: for y in range(5)
			expect(expr.generators[1].target.nodeType).toBe("Name");
			expect((expr.generators[1].target as any).id).toBe("y");
			expect(expr.generators[1].iter.nodeType).toBe("Call");
			expect(expr.generators[1].ifs).toHaveLength(0);
			expect(expr.generators[1].is_async).toBe(0);
		});

		test("three for clauses", () => {
			const expr = parseExpression("(x for x in a for y in b for z in c)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(3);
			
			expect((expr.generators[0].target as any).id).toBe("x");
			expect((expr.generators[1].target as any).id).toBe("y");
			expect((expr.generators[2].target as any).id).toBe("z");
		});

		test("multiple for clauses with conditions", () => {
			const expr = parseExpression("(x for x in range(10) if x > 5 for y in range(5) if y < 3)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			
			// First comprehension with condition
			expect((expr.generators[0].target as any).id).toBe("x");
			expect(expr.generators[0].ifs).toHaveLength(1);
			expect(expr.generators[0].ifs[0].nodeType).toBe("Compare");
			
			// Second comprehension with condition
			expect((expr.generators[1].target as any).id).toBe("y");
			expect(expr.generators[1].ifs).toHaveLength(1);
			expect(expr.generators[1].ifs[0].nodeType).toBe("Compare");
		});

		test("complex real-world example", () => {
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
			
			// Element expression
			expect(expr.elt.nodeType).toBe("Call");
			expect((expr.elt as any).func.id).toBe("transform");
			
			// First comprehension: for sublist in nested_structure
			expect((expr.generators[0].target as any).id).toBe("sublist");
			expect(expr.generators[0].iter.nodeType).toBe("Name");
			expect((expr.generators[0].iter as any).id).toBe("nested_structure");
			expect(expr.generators[0].ifs).toHaveLength(0);
			
			// Second comprehension: for item in sublist if predicate(item)
			expect((expr.generators[1].target as any).id).toBe("item");
			expect(expr.generators[1].iter.nodeType).toBe("Name");
			expect((expr.generators[1].iter as any).id).toBe("sublist");
			expect(expr.generators[1].ifs).toHaveLength(1);
			expect(expr.generators[1].ifs[0].nodeType).toBe("Call");
			
			// Third comprehension: for transformed in [transform(item)] if validate(transformed)
			expect((expr.generators[2].target as any).id).toBe("transformed");
			expect(expr.generators[2].iter.nodeType).toBe("List");
			expect(expr.generators[2].ifs).toHaveLength(1);
			expect(expr.generators[2].ifs[0].nodeType).toBe("Call");
		});
	});

	describe("Mixed conditions and comprehensions", () => {
		test("condition before additional for clause", () => {
			const expr = parseExpression("(x for x in range(10) if x > 5 for y in range(x))");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].ifs).toHaveLength(1);
			expect(expr.generators[1].ifs).toHaveLength(0);
		});

		test("multiple conditions on single comprehension", () => {
			const expr = parseExpression("(x for x in range(20) if x > 5 if x < 15 if x % 2 == 0)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].ifs).toHaveLength(3);
		});

		test("interleaved conditions and comprehensions", () => {
			const expr = parseExpression("(x for x in a if p(x) for y in b if q(y) for z in c if r(z))");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(3);
			expect(expr.generators[0].ifs).toHaveLength(1);
			expect(expr.generators[1].ifs).toHaveLength(1);
			expect(expr.generators[2].ifs).toHaveLength(1);
		});
	});

	describe("Nested generators", () => {
		test("generator as iterator", () => {
			const expr = parseExpression("(x for x in (y for y in range(10)))");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].iter.nodeType).toBe("GeneratorExp");
		});

		test("nested generators with conditions", () => {
			const expr = parseExpression("(x for x in (y for y in range(10) if y % 2 == 0) if x > 5)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].iter.nodeType).toBe("GeneratorExp");
			expect(expr.generators[0].ifs).toHaveLength(1);
			
			// Check nested generator
			const nested = expr.generators[0].iter as any;
			expect(nested.generators).toHaveLength(1);
			expect(nested.generators[0].ifs).toHaveLength(1);
		});
	});

	describe("Complex element expressions", () => {
		test("complex element with multiple comprehensions", () => {
			const expr = parseExpression("((x, y, z) for x in a for y in b for z in c)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.elt.nodeType).toBe("Tuple");
			expect(expr.generators).toHaveLength(3);
		});

		test("function call as element", () => {
			const expr = parseExpression("(func(x, y) for x in range(10) for y in range(x))");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.elt.nodeType).toBe("Call");
			expect(expr.generators).toHaveLength(2);
		});

		test("attribute access as element", () => {
			const expr = parseExpression("(obj.method(x) for x in items for obj in objects)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.elt.nodeType).toBe("Call");
			expect((expr.elt as any).func.nodeType).toBe("Attribute");
			expect(expr.generators).toHaveLength(2);
		});
	});

	describe("Complex iterator expressions", () => {
		test("function call as iterator", () => {
			const expr = parseExpression("(x for x in get_items() for y in get_more_items(x))");
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
	});

	describe("Assignment statements with complex generators", () => {
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

	describe("Async generator expressions", () => {
		test("simple async generator", () => {
			const expr = parseExpression("(x async for x in async_items)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].is_async).toBe(1);
			expect((expr.generators[0].target as any).id).toBe("x");
		});

		test("async generator with condition", () => {
			const expr = parseExpression("(x async for x in async_items if x > 0)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].is_async).toBe(1);
			expect(expr.generators[0].ifs).toHaveLength(1);
		});

		test("mixed sync and async generators", () => {
			const expr = parseExpression("(x for x in items async for y in async_items)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].is_async).toBe(0);
			expect(expr.generators[1].is_async).toBe(1);
		});

		test("async first then sync", () => {
			const expr = parseExpression("(x async for x in async_items for y in items)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.generators).toHaveLength(2);
			expect(expr.generators[0].is_async).toBe(1);
			expect(expr.generators[1].is_async).toBe(0);
		});

		test("multiple async generators", () => {
			const expr = parseExpression("(x async for x in async_items async for y in async_items2)");
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
			
			// First generator: async for batch in async_batches
			expect(expr.generators[0].is_async).toBe(1);
			expect((expr.generators[0].target as any).id).toBe("batch");
			expect(expr.generators[0].ifs).toHaveLength(0);
			
			// Second generator: for item in batch if item.is_ready
			expect(expr.generators[1].is_async).toBe(0);
			expect((expr.generators[1].target as any).id).toBe("item");
			expect(expr.generators[1].ifs).toHaveLength(1);
			
			// Third generator: async for result in async_process(item) if await validate(result)
			expect(expr.generators[2].is_async).toBe(1);
			expect((expr.generators[2].target as any).id).toBe("result");
			expect(expr.generators[2].ifs).toHaveLength(1);
		});

		test("async generator with await in element", () => {
			const expr = parseExpression("(await func(x) async for x in async_items)");
			assertNodeType(expr, "GeneratorExp");
			expect(expr.elt.nodeType).toBe("Await");
			expect(expr.generators).toHaveLength(1);
			expect(expr.generators[0].is_async).toBe(1);
		});
	});
});
