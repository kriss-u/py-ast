// Export all types

// Export lexer
export { Lexer, TokenType } from "./lexer.js";
// Export parser functions
export {
	copyLocation,
	fixMissingLocations,
	incrementLineno,
	literalEval,
	type ParseOptions,
	parse,
	parseFile,
} from "./parser.js";
// Export essential types only (not the massive union)
export type {
	Alias,
	Arg,
	// Helper types
	Arguments,
	// Core interfaces
	ASTNode,
	// Main union types
	ASTNodeUnion,
	Assign,
	Attribute,
	BoolOpNode,
	Call,
	ClassDef,
	CmpOpNode,
	Comment,
	Comprehension,
	// Commonly used specific types
	Constant,
	ExceptHandler,
	// Context and operators
	ExprContextNode,
	Expression,
	ExprNode,
	FunctionDef,
	FunctionType,
	Interactive,
	Keyword,
	Load,
	Located,
	// Module types
	Module,
	Name,
	OperatorNode,
	StmtNode,
	Store,
	UnaryOpNode,
	WithItem,
} from "./types.js";
// Export unparser function
export { unparse } from "./unparser.js";
// Export utilities
export {
	ast,
	getDocstring,
	getSourceSegment,
	isASTNode,
	iterChildNodes,
	iterFields,
} from "./utils.js";
// Export visitor classes and utilities
export { NodeTransformer, NodeVisitor, walk } from "./visitor.js";

// Convenience functions similar to Python's ast module
import { parse } from "./parser.js";
import type { ASTNodeUnion, Module } from "./types.js";
import { unparse } from "./unparser.js";

/**
 * Parse Python source code and return an AST (simplified API)
 * @param source The Python source code to parse
 * @param options Optional parsing options
 */
export function parsePython(
	source: string,
	options?: { filename?: string; comments?: boolean },
): Module {
	return parse(source, options);
}

/**
 * Parse Python source code and return an AST
 * @param source The Python source code to parse
 * @param filename The filename (optional, defaults to '<unknown>')
 */
export function parseModule(source: string, filename?: string): Module {
	return parse(source, { filename });
}

/**
 * Convert an AST back to Python source code
 * @param node The AST node to unparse
 * @param indent The indentation string (default: 4 spaces)
 */
export function toSource(node: ASTNodeUnion, indent: string = "    "): string {
	return unparse(node, { indent });
}

/**
 * Dump an AST node to a formatted string for debugging
 */
export function dump(
	node: ASTNodeUnion,
	options: {
		annotateFields?: boolean;
		includeAttributes?: boolean;
		indent?: string | number;
		showEmpty?: boolean;
	} = {},
): string {
	const {
		annotateFields = true,
		includeAttributes = false,
		indent = null,
		showEmpty = false,
	} = options;

	// biome-ignore lint/suspicious/noExplicitAny: Supposed to be any
	function formatNode(node: any, level: number = 0): string {
		if (!node || typeof node !== "object") {
			return JSON.stringify(node);
		}

		if (Array.isArray(node)) {
			if (node.length === 0 && !showEmpty) {
				return "[]";
			}
			const items = node.map((item) => formatNode(item, level + 1));
			if (indent !== null) {
				const indentStr =
					typeof indent === "string" ? indent : " ".repeat(indent);
				const currentIndent = indentStr.repeat(level + 1);
				const parentIndent = indentStr.repeat(level);
				return `[\n${currentIndent}${items.join(
					`,\n${currentIndent}`,
				)}\n${parentIndent}]`;
			}
			return `[${items.join(", ")}]`;
		}

		if (!("nodeType" in node)) {
			return JSON.stringify(node);
		}

		const fields: string[] = [];
		const nodeType = node.nodeType;

		for (const [key, value] of Object.entries(node)) {
			if (key === "nodeType") continue;

			if (
				!includeAttributes &&
				(key === "lineno" ||
					key === "col_offset" ||
					key === "end_lineno" ||
					key === "end_col_offset")
			) {
				continue;
			}

			if (
				!showEmpty &&
				(value === null ||
					value === undefined ||
					(Array.isArray(value) && value.length === 0))
			) {
				continue;
			}

			const formattedValue = formatNode(value, level + 1);
			if (annotateFields) {
				fields.push(`${key}=${formattedValue}`);
			} else {
				fields.push(formattedValue);
			}
		}

		const fieldsStr = fields.join(", ");
		if (indent !== null && fields.length > 1) {
			const indentStr =
				typeof indent === "string" ? indent : " ".repeat(indent);
			const currentIndent = indentStr.repeat(level + 1);
			const parentIndent = indentStr.repeat(level);
			return `${nodeType}(\n${currentIndent}${fields.join(
				`,\n${currentIndent}`,
			)}\n${parentIndent})`;
		}

		return `${nodeType}(${fieldsStr})`;
	}

	return formatNode(node);
}

// Version information
export const version = "1.0.0";
