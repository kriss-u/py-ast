import { parse } from "../src/parser.js";
import type { ExprNode, Module, StmtNode, Comment } from "../src/types.js";
import { unparse } from "../src/unparser.js";

/**
 * Helper function to collect all comments from an AST recursively
 */
export function collectComments(ast: Module): Comment[] {
	const comments: Comment[] = [];
	
	function collectFromBody(body: StmtNode[]): void {
		for (const stmt of body) {
			if (stmt.nodeType === "Comment") {
				comments.push(stmt);
			} else {
				// Check for inline comments attached to this statement
				if (stmt.inlineComment) {
					comments.push(stmt.inlineComment);
				}
				collectFromStmt(stmt);
			}
		}
	}
	
	function collectFromStmt(stmt: StmtNode): void {
		switch (stmt.nodeType) {
			case "FunctionDef":
			case "AsyncFunctionDef":
				collectFromBody(stmt.body);
				break;
			case "ClassDef":
				collectFromBody(stmt.body);
				break;
			case "If":
				collectFromBody(stmt.body);
				collectFromBody(stmt.orelse);
				break;
			case "For":
			case "AsyncFor":
				collectFromBody(stmt.body);
				collectFromBody(stmt.orelse);
				break;
			case "While":
				collectFromBody(stmt.body);
				collectFromBody(stmt.orelse);
				break;
			case "With":
			case "AsyncWith":
				collectFromBody(stmt.body);
				break;
			case "Try":
				collectFromBody(stmt.body);
				if (stmt.handlers) {
					for (const handler of stmt.handlers) {
						collectFromBody(handler.body);
					}
				}
				collectFromBody(stmt.orelse);
				collectFromBody(stmt.finalbody);
				break;
			case "Match":
				if (stmt.cases) {
					for (const case_ of stmt.cases) {
						collectFromBody(case_.body);
					}
				}
				break;
		}
	}
	
	collectFromBody(ast.body);
	return comments;
}

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
