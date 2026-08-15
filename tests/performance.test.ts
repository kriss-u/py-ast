import { describe, expect, test } from "vitest";
import { parse } from "../src/index.js";

/**
 * Builds Python source with `depth` levels of a chosen nesting shape, to
 * exercise the parser's recursive-descent stack without asserting on wall
 * clock time (timing thresholds are inherently flaky under CI load — see
 * CLAUDE.md rule 8). Each case only needs to parse without throwing.
 */
const DEEP_NESTING_CASES: Array<{ name: string; code: () => string }> = [
	{
		name: "nested function calls",
		code: () => {
			let nested = "base()";
			for (let i = 0; i < 100; i++) {
				nested = `wrapper_${i}(${nested})`;
			}
			return `result = ${nested}`;
		},
	},
	{
		name: "nested if statements",
		code: () => {
			let nested = "x = 1";
			for (let i = 0; i < 10; i++) {
				nested = `if condition${i}:\n    ${nested.replace(/\n/g, "\n    ")}`;
			}
			return nested;
		},
	},
	{
		name: "nested parenthesized expressions",
		code: () => {
			let nested = "1";
			for (let i = 0; i < 20; i++) {
				nested = `(${nested} + ${i})`;
			}
			return `result = ${nested}`;
		},
	},
];

describe("Performance Tests", () => {
	test("parses a large file with many top-level statements", () => {
		const lines: string[] = [];
		for (let i = 0; i < 1000; i++) {
			lines.push(`var_${i} = ${i} * 2 + 1`);
		}

		const ast = parse(lines.join("\n"));
		expect(ast.body).toHaveLength(1000);
	});

	test.each(DEEP_NESTING_CASES)("parses $name without throwing", ({ code }) => {
		expect(() => parse(code())).not.toThrow();
	});
});

describe("Memory Usage Tests", () => {
	test("repeated parse calls produce consistent results", () => {
		const code = `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

result = fibonacci(10)
`;

		for (let i = 0; i < 100; i++) {
			const ast = parse(code);
			expect(ast.nodeType).toBe("Module");
			expect(ast.body).toHaveLength(2);
		}
	});
});
