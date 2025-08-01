import { parse } from "../parser.js";
import type { ExprNode, Module, StmtNode } from "../types.js";
import { unparse } from "../unparser.js";

/**
 * Test helper to parse Python code and return the AST
 */
export function parseCode(code: string): Module {
	return parse(code);
}

/**
 * Test helper to parse and get the first statement
 */
export function parseStatement(code: string): StmtNode {
	const ast = parseCode(code);
	expect(ast.body.length).toBeGreaterThan(0);
	return ast.body[0];
}

/**
 * Test helper to parse and get the first expression from an expression statement
 */
export function parseExpression(code: string): ExprNode {
	const stmt = parseStatement(code);
	expect(stmt.nodeType).toBe("Expr");
	return (stmt as any).value;
}

/**
 * Test helper that parses code and unparses it back to check roundtrip compatibility
 */
export function testRoundtrip(code: string): void {
	const ast = parseCode(code);
	const unparsed = unparse(ast);

	// Basic check - unparser should not return empty string for supported constructs
	expect(unparsed.length).toBeGreaterThan(0);

	// Parse the unparsed code to ensure it's valid
	const roundtripAst = parseCode(unparsed.trim());

	// Basic structural checks - the AST should have the same top-level structure
	expect(roundtripAst.body.length).toBe(ast.body.length);
	expect(roundtripAst.nodeType).toBe(ast.nodeType);
}

/**
 * Test helper for testing specific unparser output
 */
export function testUnparse(
	code: string,
	expectedPattern?: string | RegExp,
): string {
	const ast = parseCode(code);
	const unparsed = unparse(ast);

	expect(unparsed.length).toBeGreaterThan(0);

	if (expectedPattern) {
		if (typeof expectedPattern === "string") {
			expect(unparsed.trim()).toBe(expectedPattern);
		} else {
			expect(unparsed.trim()).toMatch(expectedPattern);
		}
	}

	return unparsed.trim();
}

/**
 * Assert that a node has the expected type
 */
export function assertNodeType<T extends string>(
	node: any,
	expectedType: T,
): asserts node is { nodeType: T } {
	expect(node.nodeType).toBe(expectedType);
}

/**
 * Test helper to count nodes of a specific type in an AST
 */
export function countNodeTypes(node: any): Record<string, number> {
	const counts: Record<string, number> = {};

	function visit(n: any) {
		if (!n || typeof n !== "object") return;

		if (n.nodeType) {
			counts[n.nodeType] = (counts[n.nodeType] || 0) + 1;
		}

		for (const [key, value] of Object.entries(n)) {
			if (key === "nodeType") continue;

			if (Array.isArray(value)) {
				value.forEach(visit);
			} else if (value && typeof value === "object") {
				visit(value);
			}
		}
	}

	visit(node);
	return counts;
}
