import { expect } from "vitest";
import { parse } from "../src/parser.js";
import type {
	ASTNodeUnion,
	Comment,
	Expr,
	ExprNode,
	Module,
	StmtNode,
} from "../src/types.js";
import { PyComplex } from "../src/types.js";
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
	return (stmt as Expr).value;
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
 * Test helper that parses `code`, extracts a value from the resulting
 * expression via `extractor`, unparses and reparses the code, and asserts
 * the extracted value survives the round-trip unchanged. Useful for
 * checking decoded literal content (e.g. escape sequences) that a plain
 * `testRoundtrip` structural check wouldn't catch.
 */
export function testRoundtripValue<T>(
	code: string,
	extractor: (expr: ExprNode) => T,
): void {
	const original = extractor(parseExpression(code));
	const reparsed = extractor(parseExpression(unparse(parseCode(code)).trim()));
	expect(reparsed).toEqual(original);
}

/**
 * Extracts and type-asserts the `value` field of the first statement's
 * expression in a parsed module, for tests that need a typed node deep in
 * a specific statement shape (e.g. `Assign.value as JoinedStr`).
 */
export function firstStmtValue<T>(
	mod: Module,
	guard: (stmt: StmtNode) => stmt is StmtNode & { value: T },
): T {
	const stmt = mod.body[0];
	if (!guard(stmt)) {
		throw new Error(`first statement does not match expected shape`);
	}
	return stmt.value;
}

/**
 * Assert that a node has the expected type
 */
export function assertNodeType<T extends ASTNodeUnion["nodeType"]>(
	node: ASTNodeUnion | null | undefined,
	expectedType: T,
): asserts node is Extract<ASTNodeUnion, { nodeType: T }> {
	expect(node?.nodeType).toBe(expectedType);
}

/**
 * Test helper to count nodes of a specific type in an AST
 */
export function countNodeTypes(node: unknown): Record<string, number> {
	const counts: Record<string, number> = {};

	function visit(n: unknown): void {
		if (!n || typeof n !== "object") return;

		if ("nodeType" in n && typeof n.nodeType === "string") {
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

/** CPython's lowercase names for the ASDL product types py-ast PascalCases. */
const CPYTHON_NODE_NAMES: Record<string, string> = {
	Alias: "alias",
	Arg: "arg",
	Arguments: "arguments",
	Comprehension: "comprehension",
	Keyword: "keyword",
	MatchCase: "match_case",
	WithItem: "withitem",
};

/** py-ast fields with no counterpart in CPython's `ast.dump` output. */
const NON_CPYTHON_FIELDS = new Set([
	"nodeType",
	"lineno",
	"col_offset",
	"end_lineno",
	"end_col_offset",
	"quote_style",
	"inlineComment",
	"comments",
]);

/**
 * Renders a string the way Python's `repr` does for the characters these
 * tests use: single quotes unless only double quotes avoid escaping, with
 * backslashes, the quote, and `\n`/`\r`/`\t` escaped.
 */
function pythonStringRepr(value: string, prefix = ""): string {
	const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
	const body = value
		.replace(/\\/g, "\\\\")
		.replace(new RegExp(quote, "g"), `\\${quote}`)
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
	return `${prefix}${quote}${body}${quote}`;
}

/** Renders a `Constant`'s value as CPython's `ast.dump` would. */
function pythonConstantRepr(
	node: Extract<ExprNode, { nodeType: "Constant" }>,
): string {
	const { value } = node;
	if (value === null) return "None";
	if (value === true) return "True";
	if (value === false) return "False";
	if (value instanceof PyComplex) return `${value.imag}j`;
	if (typeof value !== "string") return String(value);
	if (value === "..." && node.quote_style === undefined) return "Ellipsis";
	return /^[a-z]*b/i.test(node.quote_style ?? "")
		? pythonStringRepr(value, "b")
		: pythonStringRepr(value);
}

/**
 * Renders a py-ast node in the format of CPython 3.15's `ast.dump(node)`
 * (no attributes), so tests can compare against output pasted verbatim from
 * CPython. Like `ast.dump`, it leaves out `None`/empty-list fields and the
 * default `ctx=Load()`. Supports the constant types the tests use (no floats,
 * which a JS number can't tell apart from ints).
 */
export function cpythonDump(node: unknown): string {
	if (Array.isArray(node)) return `[${node.map(cpythonDump).join(", ")}]`;
	if (typeof node === "string") return pythonStringRepr(node);
	if (!node || typeof node !== "object" || !("nodeType" in node)) {
		return String(node);
	}
	const astNode = node as ASTNodeUnion;
	const name = CPYTHON_NODE_NAMES[astNode.nodeType] ?? astNode.nodeType;
	const fields: string[] = [];
	for (const [key, value] of Object.entries(astNode)) {
		if (NON_CPYTHON_FIELDS.has(key) || value === undefined || value === null) {
			continue;
		}
		if (Array.isArray(value) && value.length === 0) continue;
		if (key === "ctx" && value.nodeType === "Load") continue;
		const rendered =
			astNode.nodeType === "Constant" && key === "value"
				? pythonConstantRepr(astNode)
				: cpythonDump(value);
		fields.push(`${key}=${rendered}`);
	}
	return `${name}(${fields.join(", ")})`;
}
