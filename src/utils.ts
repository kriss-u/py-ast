import type { ASTNodeUnion, ExprNode, StmtNode } from "./types.js";

/**
 * Get the docstring from a function, class, or module node.
 *
 * The docstring is the string literal that forms the first statement in the
 * node's body, matching CPython's `ast.get_docstring` semantics.
 * @param node The function, class, or module node to inspect
 * @returns The docstring text, or `null` if the node has no body, isn't a
 * function/class/module, or its first statement isn't a string constant
 */
export function getDocstring(node: ASTNodeUnion): string | null {
	if (
		node.nodeType !== "FunctionDef" &&
		node.nodeType !== "AsyncFunctionDef" &&
		node.nodeType !== "ClassDef" &&
		node.nodeType !== "Module"
	) {
		return null;
	}

	const body = "body" in node ? node.body : [];
	if (body.length === 0) return null;

	const firstStmt = body[0];
	if (firstStmt.nodeType !== "Expr") return null;

	const value = firstStmt.value;
	if (value.nodeType === "Constant" && typeof value.value === "string") {
		return value.value;
	}

	return null;
}

/**
 * Iterate over all fields of a node.
 *
 * Skips the location bookkeeping properties (`nodeType`, `lineno`,
 * `col_offset`, `end_lineno`, `end_col_offset`) and yields the node's
 * remaining own properties as `[name, value]` pairs.
 * @param node The AST node whose fields should be iterated
 * @returns A generator of `[fieldName, fieldValue]` tuples
 */
// biome-ignore lint/suspicious/noExplicitAny: Generator yields node field values which can be any type
export function* iterFields(node: ASTNodeUnion): Generator<[string, any]> {
	for (const [key, value] of Object.entries(node)) {
		if (
			key !== "nodeType" &&
			key !== "lineno" &&
			key !== "col_offset" &&
			key !== "end_lineno" &&
			key !== "end_col_offset"
		) {
			yield [key, value];
		}
	}
}

/**
 * Iterate over all direct child nodes.
 *
 * Walks the node's fields (via {@link iterFields}) and yields any values, or
 * array elements, that are themselves AST nodes.
 * @param node The AST node whose children should be iterated
 * @returns A generator of the node's direct child AST nodes
 */
export function* iterChildNodes(node: ASTNodeUnion): Generator<ASTNodeUnion> {
	for (const [, value] of iterFields(node)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				if (isASTNode(item)) {
					yield item;
				}
			}
		} else if (isASTNode(value)) {
			yield value;
		}
	}
}

/**
 * Check if a value is an AST node.
 *
 * A value is considered an AST node if it is a non-null object carrying a
 * `nodeType` property; this is a type guard that narrows to
 * {@link ASTNodeUnion}.
 * @param value The value to test
 * @returns `true` if `value` is an AST node, `false` otherwise
 */
// biome-ignore lint/suspicious/noExplicitAny: Type guard function needs to accept any value
export function isASTNode(value: any): value is ASTNodeUnion {
	return value && typeof value === "object" && "nodeType" in value;
}

/**
 * Get source segment from source code using node location info.
 *
 * Slices `source` using the node's `lineno`/`col_offset`/`end_lineno`/
 * `end_col_offset` attributes, matching CPython's `ast.get_source_segment`.
 * @param source The original source code the node was parsed from
 * @param node The AST node whose corresponding source text should be extracted
 * @param options.padded When `true`, pad the first line with leading spaces
 * so its column offsets line up with the original source (default: `false`)
 * @returns The extracted source text, or `null` if the node lacks complete
 * location information
 */
export function getSourceSegment(
	source: string,
	node: ASTNodeUnion,
	options: { padded?: boolean } = {},
): string | null {
	const { padded = false } = options;

	if (
		!("lineno" in node) ||
		!("col_offset" in node) ||
		!("end_lineno" in node) ||
		!("end_col_offset" in node) ||
		node.lineno === undefined ||
		node.col_offset === undefined ||
		node.end_lineno === undefined ||
		node.end_col_offset === undefined
	) {
		return null;
	}

	const lines = source.split("\n");
	const startLine = node.lineno - 1; // Convert to 0-based
	const endLine = node.end_lineno - 1;
	const startCol = node.col_offset;
	const endCol = node.end_col_offset;

	if (startLine === endLine) {
		return lines[startLine]?.slice(startCol, endCol) || null;
	}

	const result: string[] = [];

	// First line
	if (lines[startLine]) {
		let firstLine = lines[startLine].slice(startCol);
		if (padded) {
			firstLine = " ".repeat(startCol) + firstLine;
		}
		result.push(firstLine);
	}

	// Middle lines
	for (let i = startLine + 1; i < endLine; i++) {
		if (lines[i] !== undefined) {
			result.push(lines[i]);
		}
	}

	// Last line
	if (lines[endLine]) {
		result.push(lines[endLine].slice(0, endCol));
	}

	return result.join("\n");
}

/**
 * Expression context values, mirroring Python's `ast.Load`, `ast.Store`, and
 * `ast.Del` context node types.
 */
type ContextType = "Load" | "Store" | "Del";

/**
 * The set of literal value types a `Constant` node may hold. `bigint` covers
 * integer literals too large for a safe `number` (see {@link
 * Parser.parseNumber} in `parser.ts`).
 */
type ConstantValue = string | number | bigint | boolean | null;

/**
 * Shape of the {@link ast} factory object, exposing one builder method per
 * supported AST node type. Each method returns a plain node object with
 * `lineno` and `col_offset` defaulted to `1` and `0` respectively.
 */
interface ASTFactory {
	/**
	 * Build a `Name` node.
	 * @param id The identifier name
	 * @param ctx The expression context (default: `"Load"`)
	 * @returns A new `Name` node
	 */
	Name(id: string, ctx?: ContextType): Extract<ExprNode, { nodeType: "Name" }>;
	/**
	 * Build a `Constant` node.
	 * @param value The literal value held by the node
	 * @param kind An optional string kind annotation (e.g. `"u"` for `u"..."`)
	 * @returns A new `Constant` node
	 */
	Constant(
		value: ConstantValue,
		kind?: string,
	): Extract<ExprNode, { nodeType: "Constant" }>;
	/**
	 * Build a `Call` node.
	 * @param func The expression being called
	 * @param args Positional arguments (default: `[]`)
	 * @param keywords Keyword arguments (default: `[]`)
	 * @returns A new `Call` node
	 */
	Call(
		func: ExprNode,
		args?: ExprNode[],
		keywords?: import("./types.js").Keyword[],
	): Extract<ExprNode, { nodeType: "Call" }>;
	/**
	 * Build a `BinOp` node.
	 * @param left The left-hand operand
	 * @param op The operator, either an operator node or its string shorthand
	 * (e.g. `"Add"`)
	 * @param right The right-hand operand
	 * @returns A new `BinOp` node
	 */
	BinOp(
		left: ExprNode,
		op: import("./types.js").Operator | string,
		right: ExprNode,
	): Extract<ExprNode, { nodeType: "BinOp" }>;
	/**
	 * Build an `Assign` statement node.
	 * @param targets The assignment targets
	 * @param value The value being assigned
	 * @param type_comment An optional PEP 484 type comment
	 * @returns A new `Assign` node
	 */
	Assign(
		targets: ExprNode[],
		value: ExprNode,
		type_comment?: string,
	): Extract<StmtNode, { nodeType: "Assign" }>;
	/**
	 * Build an `Expr` statement node (an expression used as a statement).
	 * @param value The wrapped expression
	 * @returns A new `Expr` node
	 */
	Expr(value: ExprNode): Extract<StmtNode, { nodeType: "Expr" }>;
	/**
	 * Build a `List` node.
	 * @param elts The list elements
	 * @param ctx The expression context (default: `"Load"`)
	 * @returns A new `List` node
	 */
	List(
		elts: ExprNode[],
		ctx?: ContextType,
	): Extract<ExprNode, { nodeType: "List" }>;
	/**
	 * Build a `Tuple` node.
	 * @param elts The tuple elements
	 * @param ctx The expression context (default: `"Load"`)
	 * @returns A new `Tuple` node
	 */
	Tuple(
		elts: ExprNode[],
		ctx?: ContextType,
	): Extract<ExprNode, { nodeType: "Tuple" }>;
	/**
	 * Build an `Attribute` node.
	 * @param value The object whose attribute is being accessed
	 * @param attr The attribute name
	 * @param ctx The expression context (default: `"Load"`)
	 * @returns A new `Attribute` node
	 */
	Attribute(
		value: ExprNode,
		attr: string,
		ctx?: ContextType,
	): Extract<ExprNode, { nodeType: "Attribute" }>;
	/**
	 * Build a `Dict` node.
	 * @param keys The dict keys; a `null` entry represents a `**` unpacking
	 * @param values The dict values, aligned by index with `keys`
	 * @returns A new `Dict` node
	 */
	Dict(
		keys: (ExprNode | null)[],
		values: ExprNode[],
	): Extract<ExprNode, { nodeType: "Dict" }>;
	/**
	 * Build a `NamedExpr` node (the walrus operator, `:=`).
	 * @param target The name being bound
	 * @param value The value being assigned and returned
	 * @returns A new `NamedExpr` node
	 */
	NamedExpr(
		target: ExprNode,
		value: ExprNode,
	): Extract<ExprNode, { nodeType: "NamedExpr" }>;
	/**
	 * Build a `Lambda` node.
	 * @param args The lambda's argument list
	 * @param body The lambda's body expression
	 * @returns A new `Lambda` node
	 */
	Lambda(
		args: import("./types.js").Arguments,
		body: ExprNode,
	): Extract<ExprNode, { nodeType: "Lambda" }>;
	/**
	 * Build an `IfExp` node (a conditional expression, `a if b else c`).
	 * @param test The condition expression
	 * @param body The expression evaluated when `test` is truthy
	 * @param orelse The expression evaluated when `test` is falsy
	 * @returns A new `IfExp` node
	 */
	IfExp(
		test: ExprNode,
		body: ExprNode,
		orelse: ExprNode,
	): Extract<ExprNode, { nodeType: "IfExp" }>;
	/**
	 * Build an `Await` node.
	 * @param value The awaited expression
	 * @returns A new `Await` node
	 */
	Await(value: ExprNode): Extract<ExprNode, { nodeType: "Await" }>;
	/**
	 * Build a `Yield` node.
	 * @param value The optional yielded expression
	 * @returns A new `Yield` node
	 */
	Yield(value?: ExprNode): Extract<ExprNode, { nodeType: "Yield" }>;
	/**
	 * Build a `YieldFrom` node.
	 * @param value The iterable expression being delegated to
	 * @returns A new `YieldFrom` node
	 */
	YieldFrom(value: ExprNode): Extract<ExprNode, { nodeType: "YieldFrom" }>;
	/**
	 * Build a `Starred` node (a `*expr` unpacking).
	 * @param value The starred expression
	 * @param ctx The expression context (default: `"Load"`)
	 * @returns A new `Starred` node
	 */
	Starred(
		value: ExprNode,
		ctx?: ContextType,
	): Extract<ExprNode, { nodeType: "Starred" }>;
	/**
	 * Build a `Slice` node.
	 * @param lower The optional lower bound
	 * @param upper The optional upper bound
	 * @param step The optional step
	 * @returns A new `Slice` node
	 */
	Slice(
		lower?: ExprNode,
		upper?: ExprNode,
		step?: ExprNode,
	): Extract<ExprNode, { nodeType: "Slice" }>;
	/**
	 * Build a `Delete` statement node.
	 * @param targets The targets to delete
	 * @returns A new `Delete` node
	 */
	Delete(targets: ExprNode[]): Extract<StmtNode, { nodeType: "Delete" }>;
	/**
	 * Build a `Nonlocal` statement node.
	 * @param names The names declared nonlocal
	 * @returns A new `Nonlocal` node
	 */
	Nonlocal(names: string[]): Extract<StmtNode, { nodeType: "Nonlocal" }>;
}

/**
 * Factory object exposing one builder method per supported AST node type,
 * offering a lighter-weight alternative to constructing raw node objects by
 * hand. Every produced node defaults `lineno` to `1` and `col_offset` to `0`.
 * @example
 * ```ts
 * import { ast } from "py-ast";
 *
 * // Build `print("hi")`
 * const call = ast.Call(ast.Name("print"), [ast.Constant("hi")]);
 * ```
 */
export const ast: ASTFactory = {
	/**
	 * Create a Name node
	 */
	Name(
		id: string,
		ctx: ContextType = "Load",
	): Extract<ExprNode, { nodeType: "Name" }> {
		return {
			nodeType: "Name",
			id,
			ctx: { nodeType: ctx },
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Constant node
	 */
	Constant(
		value: ConstantValue,
		kind?: string,
	): Extract<ExprNode, { nodeType: "Constant" }> {
		return {
			nodeType: "Constant",
			value,
			kind,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Call node
	 */
	Call(
		func: ExprNode,
		args: ExprNode[] = [],
		keywords: import("./types.js").Keyword[] = [],
	): Extract<ExprNode, { nodeType: "Call" }> {
		return {
			nodeType: "Call",
			func,
			args,
			keywords,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a BinOp node
	 */
	BinOp(
		left: ExprNode,
		op: import("./types.js").Operator | string,
		right: ExprNode,
	): Extract<ExprNode, { nodeType: "BinOp" }> {
		// Handle string operator shorthand
		// biome-ignore lint/suspicious/noExplicitAny: String operator names need to be cast to operator node type
		const operatorNode = typeof op === "string" ? { nodeType: op as any } : op;

		return {
			nodeType: "BinOp",
			left,
			op: operatorNode,
			right,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create an Assign node
	 */
	Assign(
		targets: ExprNode[],
		value: ExprNode,
		type_comment?: string,
	): Extract<StmtNode, { nodeType: "Assign" }> {
		return {
			nodeType: "Assign",
			targets,
			value,
			type_comment,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create an Expr node (expression statement)
	 */
	Expr(value: ExprNode): Extract<StmtNode, { nodeType: "Expr" }> {
		return {
			nodeType: "Expr",
			value,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a List node
	 */
	List(
		elts: ExprNode[],
		ctx: ContextType = "Load",
	): Extract<ExprNode, { nodeType: "List" }> {
		return {
			nodeType: "List",
			elts,
			ctx: { nodeType: ctx },
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Tuple node
	 */
	Tuple(
		elts: ExprNode[],
		ctx: ContextType = "Load",
	): Extract<ExprNode, { nodeType: "Tuple" }> {
		return {
			nodeType: "Tuple",
			elts,
			ctx: { nodeType: ctx },
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create an Attribute node
	 */
	Attribute(
		value: ExprNode,
		attr: string,
		ctx: ContextType = "Load",
	): Extract<ExprNode, { nodeType: "Attribute" }> {
		return {
			nodeType: "Attribute",
			value,
			attr,
			ctx: { nodeType: ctx },
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Dict node
	 */
	Dict(
		keys: (ExprNode | null)[],
		values: ExprNode[],
	): Extract<ExprNode, { nodeType: "Dict" }> {
		return {
			nodeType: "Dict",
			keys,
			values,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a NamedExpr node (walrus operator)
	 */
	NamedExpr(
		target: ExprNode,
		value: ExprNode,
	): Extract<ExprNode, { nodeType: "NamedExpr" }> {
		return {
			nodeType: "NamedExpr",
			target,
			value,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Lambda node
	 */
	Lambda(
		args: import("./types.js").Arguments,
		body: ExprNode,
	): Extract<ExprNode, { nodeType: "Lambda" }> {
		return {
			nodeType: "Lambda",
			args,
			body,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create an IfExp node (conditional expression)
	 */
	IfExp(
		test: ExprNode,
		body: ExprNode,
		orelse: ExprNode,
	): Extract<ExprNode, { nodeType: "IfExp" }> {
		return {
			nodeType: "IfExp",
			test,
			body,
			orelse,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create an Await node
	 */
	Await(value: ExprNode): Extract<ExprNode, { nodeType: "Await" }> {
		return {
			nodeType: "Await",
			value,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Yield node
	 */
	Yield(value?: ExprNode): Extract<ExprNode, { nodeType: "Yield" }> {
		return {
			nodeType: "Yield",
			value,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a YieldFrom node
	 */
	YieldFrom(value: ExprNode): Extract<ExprNode, { nodeType: "YieldFrom" }> {
		return {
			nodeType: "YieldFrom",
			value,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Starred node
	 */
	Starred(
		value: ExprNode,
		ctx: ContextType = "Load",
	): Extract<ExprNode, { nodeType: "Starred" }> {
		return {
			nodeType: "Starred",
			value,
			ctx: { nodeType: ctx },
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Slice node
	 */
	Slice(
		lower?: ExprNode,
		upper?: ExprNode,
		step?: ExprNode,
	): Extract<ExprNode, { nodeType: "Slice" }> {
		return {
			nodeType: "Slice",
			lower,
			upper,
			step,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Delete statement
	 */
	Delete(targets: ExprNode[]): Extract<StmtNode, { nodeType: "Delete" }> {
		return {
			nodeType: "Delete",
			targets,
			lineno: 1,
			col_offset: 0,
		};
	},

	/**
	 * Create a Nonlocal statement
	 */
	Nonlocal(names: string[]): Extract<StmtNode, { nodeType: "Nonlocal" }> {
		return {
			nodeType: "Nonlocal",
			names,
			lineno: 1,
			col_offset: 0,
		};
	},
};
