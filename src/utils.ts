import { ASTNodeUnion, ExprNode, StmtNode } from "./types.js";

/**
 * Get the docstring from a function, class, or module node
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
 * Iterate over all fields of a node
 */
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
 * Iterate over all direct child nodes
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
 * Check if a value is an AST node
 */
export function isASTNode(value: any): value is ASTNodeUnion {
	return value && typeof value === "object" && "nodeType" in value;
}

/**
 * Get source segment from source code using node location info
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
 * Node factory functions for creating AST nodes
 */
export const ast = {
	/**
	 * Create a Name node
	 */
	Name(
		id: string,
		ctx: "Load" | "Store" | "Del" = "Load",
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
		value: any,
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
		ctx: "Load" | "Store" | "Del" = "Load",
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
		ctx: "Load" | "Store" | "Del" = "Load",
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
		ctx: "Load" | "Store" | "Del" = "Load",
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
		ctx: "Load" | "Store" | "Del" = "Load",
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
