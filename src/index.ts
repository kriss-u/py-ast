// Export all types

/**
 * Tokenizer for Python source code ({@link Lexer}), and the enumeration of
 * token kinds it produces ({@link TokenType}).
 */
export { Lexer, TokenType } from "./lexer.js";
/**
 * Parser entry points and location-manipulation helpers.
 *
 * - {@link parse} / {@link parseFile} — parse Python source (or a file on
 *   disk) into an AST.
 * - {@link literalEval} — safely evaluate a literal expression node, mirroring
 *   `ast.literal_eval`.
 * - {@link fixMissingLocations} — fill in missing `lineno`/`col_offset` info
 *   on a hand-built tree by copying it from parent nodes.
 * - {@link copyLocation} — copy location info from one node to another.
 * - {@link incrementLineno} — shift every line number in a tree by an offset.
 * - {@link ParseOptions} — options accepted by {@link parse}.
 */
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
/**
 * Core AST node type definitions, re-exported for consumers building typed
 * tooling on top of the parser/unparser (e.g. visitors, factories). This is
 * a curated subset of the full node type union defined in `./types.js`.
 */
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
/**
 * Convert an AST node back into Python source code.
 * @see {@link ./unparser.js} for the implementation.
 */
export { unparse } from "./unparser.js";
/**
 * AST inspection and construction utilities.
 *
 * - {@link ast} — factory object for building AST nodes by hand.
 * - {@link getDocstring} — extract a function/class/module's docstring.
 * - {@link getSourceSegment} — slice the original source text for a node.
 * - {@link isASTNode} — type guard for AST node values.
 * - {@link iterFields} / {@link iterChildNodes} — iterate a node's fields or
 *   direct child nodes.
 */
export {
	ast,
	getDocstring,
	getSourceSegment,
	isASTNode,
	iterChildNodes,
	iterFields,
} from "./utils.js";
/**
 * Tree-traversal utilities modeled on Python's `ast` module.
 *
 * - {@link walk} — iterate over every node in a tree, breadth-first.
 * - {@link NodeVisitor} — base class for read-only tree visitors.
 * - {@link NodeTransformer} — base class for tree-rewriting visitors.
 */
export { NodeTransformer, NodeVisitor, walk } from "./visitor.js";

// Convenience functions similar to Python's ast module
import { parse } from "./parser.js";
import type { ASTNodeUnion, Module } from "./types.js";
import { unparse } from "./unparser.js";

/**
 * Parse Python source code and return an AST (simplified API).
 *
 * Thin wrapper over {@link parse} that accepts a smaller, more convenient
 * options shape.
 * @param source The Python source code to parse
 * @param options Optional parsing options
 * @param options.filename The filename to attribute in error messages
 * (default: `'<unknown>'`)
 * @param options.comments Whether to attach comment nodes to the tree
 * @returns The parsed module's AST
 * @throws If `source` contains a syntax error
 * @example
 * ```ts
 * import { parsePython } from "py-ast";
 *
 * const tree = parsePython("x = 1 + 2");
 * ```
 */
export function parsePython(
	source: string,
	options?: { filename?: string; comments?: boolean },
): Module {
	return parse(source, options);
}

/**
 * Parse Python source code and return an AST.
 * @param source The Python source code to parse
 * @param filename The filename (optional, defaults to '<unknown>')
 * @returns The parsed module's AST
 * @throws If `source` contains a syntax error
 * @example
 * ```ts
 * import { parseModule } from "py-ast";
 *
 * const tree = parseModule("def f(): pass", "example.py");
 * ```
 */
export function parseModule(source: string, filename?: string): Module {
	return parse(source, { filename });
}

/**
 * Convert an AST back to Python source code.
 * @param node The AST node to unparse
 * @param indent The indentation string (default: 4 spaces)
 * @returns The generated Python source code
 * @example
 * ```ts
 * import { parseModule, toSource } from "py-ast";
 *
 * const tree = parseModule("x=1");
 * console.log(toSource(tree)); // "x = 1"
 * ```
 */
export function toSource(node: ASTNodeUnion, indent: string = "    "): string {
	return unparse(node, { indent });
}

/**
 * Dump an AST node to a formatted string for debugging, similar to Python's
 * `ast.dump`.
 * @param node The AST node to dump
 * @param options Formatting options
 * @param options.annotateFields Whether to prefix each value with its field
 * name (default: `true`)
 * @param options.includeAttributes Whether to include location attributes
 * (`lineno`, `col_offset`, etc.) in the output (default: `false`)
 * @param options.indent Indentation to use for multi-line output; a number
 * of spaces or a literal string, or `null` for single-line output
 * (default: `null`)
 * @param options.showEmpty Whether to include empty/`null`/`undefined`
 * fields in the output (default: `false`)
 * @returns The formatted string representation of `node`
 * @example
 * ```ts
 * import { dump, parseModule } from "py-ast";
 *
 * const tree = parseModule("x = 1");
 * console.log(dump(tree, { indent: 2 }));
 * ```
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

/**
 * The current version of the `py-ast` package.
 */
export const version = "1.0.0";
