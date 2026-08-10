import type {
	Arg,
	Arguments,
	ASTNodeUnion,
	CmpOpNode,
	Comment,
	ExprNode,
	Keyword,
	ModuleNode,
	OperatorNode,
	StmtNode,
	UnaryOpNode,
} from "./types.js";
import { NodeVisitor } from "./visitor.js";

/**
 * Relative binding power of Python operators/expression forms, used to decide
 * whether an expression must be wrapped in parentheses when unparsed inside
 * a larger expression. Higher values bind tighter (e.g. `POWER` binds tighter
 * than `TERM`). `BOR` is an alias for `EXPR` because `|` sits at the bottom of
 * the binary-operator precedence chain in CPython's grammar.
 */
enum Precedence {
	TUPLE = 0,
	YIELD = 1,
	TEST = 2,
	OR = 3,
	AND = 4,
	NOT = 5,
	CMP = 6,
	EXPR = 7,
	BOR = EXPR,
	BXOR = 8,
	BAND = 9,
	SHIFT = 10,
	ARITH = 11,
	TERM = 12,
	FACTOR = 13,
	POWER = 14,
	AWAIT = 15,
	ATOM = 16,
}

/**
 * Mutable state threaded through a single `unparse` call. `source` accumulates
 * the emitted text as an array of fragments (joined once at the end);
 * `precedence` tracks the minimum precedence the currently-visited expression
 * must have to avoid parenthesization; `indent`/`indentString` track the
 * current block nesting; `isFirstStatement` suppresses the leading newline
 * before the very first statement written.
 */
interface UnparseContext {
	precedence: Precedence;
	source: string[];
	indent: number;
	indentString: string;
	isFirstStatement: boolean;
	// For handling inline comments during unparsing
	inlineComments?: Comment[];
	commentsByLine?: Map<number, Comment[]>;
}

/**
 * Infer the indentation string used by the original source by walking the
 * AST for the first indented block (function/class/if/for/while/with/try)
 * and comparing the `col_offset` of its first body statement to its own
 * `col_offset`. Falls back to four spaces if no usable offset is found.
 *
 * @param node - Root AST node to search.
 * @returns The detected indentation unit, e.g. `"    "` or `"\t"`.
 */
function detectIndentStyle(node: ASTNodeUnion): string {
	// Default to 4 spaces if we can't detect
	let detectedIndent = "    ";

	// biome-ignore lint/suspicious/noExplicitAny: AST traversal requires handling dynamic structures
	function traverse(n: any): void {
		if (!n || typeof n !== "object") return;

		// Look for indented blocks (functions, classes, if statements, etc.)
		if (
			n.nodeType === "FunctionDef" ||
			n.nodeType === "AsyncFunctionDef" ||
			n.nodeType === "ClassDef" ||
			n.nodeType === "If" ||
			n.nodeType === "For" ||
			n.nodeType === "While" ||
			n.nodeType === "With" ||
			n.nodeType === "Try"
		) {
			// Check if we have body with statements that have col_offset info
			if (n.body && Array.isArray(n.body) && n.body.length > 0) {
				const firstBodyStmt = n.body[0];
				if (
					firstBodyStmt &&
					typeof firstBodyStmt.col_offset === "number" &&
					typeof n.col_offset === "number"
				) {
					const indentSize = firstBodyStmt.col_offset - n.col_offset;
					if (indentSize > 0 && indentSize <= 8) {
						// Reasonable indent sizes
						if (indentSize === 1) {
							detectedIndent = "\t"; // Tab
						} else {
							detectedIndent = " ".repeat(indentSize); // Spaces
						}
						return; // Found it, stop searching
					}
				}
			}
		}

		// Recursively search through the AST
		for (const value of Object.values(n)) {
			if (Array.isArray(value)) {
				value.forEach(traverse);
			} else if (value && typeof value === "object") {
				traverse(value);
			}
		}
	}

	traverse(node);
	return detectedIndent;
}

/**
 * Convert an AST node back into Python source code.
 *
 * @param node - The AST node to unparse (typically a `Module`, but any node
 *   reachable from the visitor is supported).
 * @param options - Unparsing options.
 * @param options.indent - Indentation unit to use for nested blocks. If
 *   omitted, it is auto-detected from `node` via {@link detectIndentStyle}.
 * @returns The generated Python source text.
 */
export function unparse(
	node: ASTNodeUnion,
	options: { indent?: string } = {},
): string {
	const detectedIndent = options.indent || detectIndentStyle(node);

	const context: UnparseContext = {
		precedence: Precedence.TUPLE,
		source: [],
		indent: 0,
		indentString: detectedIndent,
		isFirstStatement: true,
	};

	const unparser = new Unparser(context);
	unparser.visit(node);

	return context.source.join("");
}

/**
 * Tree-walking unparser that converts AST nodes into Python source text.
 * Extends {@link NodeVisitor} and implements one `visit_<NodeType>` method
 * per AST node kind; each writes its fragment(s) directly onto the shared
 * {@link UnparseContext}. Instances are single-use, driven by {@link unparse}.
 */
class Unparser extends NodeVisitor {
	/**
	 * @param context - Shared mutable state (output buffer, indentation,
	 *   current precedence) that all `visit_*` methods read from and write to.
	 */
	constructor(private context: UnparseContext) {
		super();
	}

	/**
	 * Dispatches to the matching `visit_<NodeType>` method (via the base
	 * {@link NodeVisitor}), then appends any trailing inline comment attached
	 * to the node. Statement nodes may carry an `inlineComment` produced by
	 * the parser for `# comment` text following them on the same line.
	 *
	 * @param node - The AST node to render.
	 * @returns Whatever the underlying `visit_*` method returns (unused by
	 *   callers here; typed `any` to satisfy the base visitor's signature).
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Visitor pattern requires dynamic return types
	visit(node: ASTNodeUnion): any {
		const result = super.visit(node);

		// After visiting a statement node, check for inline comments
		if ("inlineComment" in node && node.inlineComment) {
			this.write("  ", node.inlineComment.value);
		}

		return result;
	}

	/**
	 * Appends raw text fragments to the output buffer without any newline or
	 * indentation handling.
	 *
	 * @param text - One or more text fragments to append in order.
	 */
	private write(...text: string[]): void {
		this.context.source.push(...text);
	}

	/**
	 * Starts a new statement line: indents to the current block depth and
	 * writes `text`. The very first statement of the whole output is written
	 * without a leading newline (tracked via `isFirstStatement`); every
	 * subsequent call prefixes a `"\n"` before indenting.
	 *
	 * @param text - Text to write at the start of the new line (defaults to
	 *   empty, e.g. when the statement itself will `visit()` its content).
	 */
	private fill(text: string = ""): void {
		if (this.context.isFirstStatement) {
			// For the first statement, don't add a leading newline
			this.context.isFirstStatement = false;
			if (this.context.indent > 0) {
				this.write(this.context.indentString.repeat(this.context.indent), text);
			} else {
				this.write(text);
			}
		} else {
			this.write(
				"\n",
				this.context.indentString.repeat(this.context.indent),
				text,
			);
		}
	}

	/**
	 * Renders each item of `seq` via `f`, writing `inter` between consecutive
	 * items (but not before the first or after the last) — mirrors Python's
	 * `str.join` for sequences of AST nodes.
	 *
	 * @param inter - Separator text written between items.
	 * @param f - Callback that renders a single item.
	 * @param seq - Items to render.
	 */
	private interleave<T>(inter: string, f: (item: T) => void, seq: T[]): void {
		for (let i = 0; i < seq.length; i++) {
			if (i > 0) {
				this.write(inter);
			}
			f(seq[i]);
		}
	}

	/**
	 * Visits `node` with `precedence` temporarily installed as the ambient
	 * minimum precedence, restoring the previous value afterward. Used by
	 * operator visitors to tell the child expression what precedence context
	 * it is being rendered in, so the child can decide (via
	 * {@link requireParens}) whether it needs its own parentheses.
	 *
	 * @param precedence - Precedence level of the enclosing operator.
	 * @param node - Child expression to render under that precedence.
	 */
	private withPrecedence(precedence: Precedence, node: ExprNode): void {
		const oldPrecedence = this.context.precedence;
		this.context.precedence = precedence;
		this.visit(node);
		this.context.precedence = oldPrecedence;
	}

	/**
	 * Decides whether `node` must be parenthesized to be rendered correctly
	 * at a context requiring at least `precedence` binding power — true when
	 * the node's own precedence is strictly lower.
	 *
	 * @param precedence - Minimum precedence required by the surrounding
	 *   expression.
	 * @param node - Candidate child expression.
	 * @returns `true` if parentheses are required around `node`.
	 */
	private requireParens(precedence: Precedence, node: ExprNode): boolean {
		return this.getPrecedence(node) < precedence;
	}

	/**
	 * Looks up the {@link Precedence} of an expression node's operator/form.
	 * Nodes with no meaningful operator precedence (literals, calls,
	 * subscripts, etc.) are treated as {@link Precedence.ATOM}, the tightest
	 * level, so they never need parenthesization on their own account.
	 *
	 * @param node - Expression node to classify.
	 * @returns The node's binding precedence.
	 */
	private getPrecedence(node: ExprNode): Precedence {
		switch (node.nodeType) {
			case "Tuple":
				return Precedence.TUPLE;
			case "Yield":
			case "YieldFrom":
				return Precedence.YIELD;
			case "IfExp":
				return Precedence.TEST;
			case "BoolOp":
				return node.op.nodeType === "Or" ? Precedence.OR : Precedence.AND;
			case "UnaryOp":
				return node.op.nodeType === "Not" ? Precedence.NOT : Precedence.FACTOR;
			case "Compare":
				return Precedence.CMP;
			case "BinOp":
				return this.getBinOpPrecedence(node.op);
			case "Await":
				return Precedence.AWAIT;
			default:
				return Precedence.ATOM;
		}
	}

	/**
	 * Maps a binary `OperatorNode` to its {@link Precedence} level, following
	 * Python's operator precedence table (bitwise OR lowest, power highest
	 * among binary operators).
	 *
	 * @param op - The binary operator node.
	 * @returns The operator's binding precedence.
	 */
	private getBinOpPrecedence(op: OperatorNode): Precedence {
		switch (op.nodeType) {
			case "BitOr":
				return Precedence.BOR;
			case "BitXor":
				return Precedence.BXOR;
			case "BitAnd":
				return Precedence.BAND;
			case "LShift":
			case "RShift":
				return Precedence.SHIFT;
			case "Add":
			case "Sub":
				return Precedence.ARITH;
			case "Mult":
			case "MatMult":
			case "Div":
			case "Mod":
			case "FloorDiv":
				return Precedence.TERM;
			case "Pow":
				return Precedence.POWER;
			default:
				return Precedence.ATOM;
		}
	}

	// Module visitors
	/** Renders a `Module` node: each top-level statement, in order. */
	visit_Module(node: Extract<ModuleNode, { nodeType: "Module" }>): void {
		for (const stmt of node.body) {
			this.visit(stmt);
		}
	}

	/** Renders an `Interactive` node (REPL-style statement list). */
	visit_Interactive(
		node: Extract<ModuleNode, { nodeType: "Interactive" }>,
	): void {
		for (const stmt of node.body) {
			this.visit(stmt);
		}
	}

	/** Renders an `Expression` node (a bare expression used as `eval` input). */
	visit_Expression(
		node: Extract<ModuleNode, { nodeType: "Expression" }>,
	): void {
		this.visit(node.body);
	}

	/**
	 * Writes each decorator in `decorators` on its own `@decorator` line
	 * immediately above the following `def`/`class`.
	 *
	 * @param decorators - Decorator expressions, outermost first.
	 */
	private writeDecorators(decorators: ExprNode[]): void {
		for (const decorator of decorators) {
			this.fill("@");
			this.visit(decorator);
		}
	}

	/**
	 * Determines the opening/closing quote text for an f-string, preserving
	 * the original quote style (including prefix casing and triple-quotes)
	 * captured in `node.kind` when available, so round-tripped f-strings
	 * don't silently change from `f'...'` to `f"..."` or vice versa.
	 *
	 * @param node - The `JoinedStr` (f-string) node.
	 * @returns A tuple of `[openingDelimiter, closingQuote]`, e.g. `['f"', '"']`.
	 */
	private chooseFStringQuotes(
		node: Extract<ExprNode, { nodeType: "JoinedStr" }>,
	): [string, string] {
		// If we have the original quote style, use it exactly
		if (node.kind) {
			// Extract quote from the kind (e.g., 'f"' -> '"', "f'" -> "'")
			const prefixMatch = node.kind.match(/^([fFrRbBuU]*)(.*)/);
			const quote = prefixMatch ? prefixMatch[2] : '"';
			return [node.kind, quote];
		}

		// Default to double quotes if no original style info
		return ['f"', '"'];
	}

	// Statement visitors
	/** Renders a `def` statement: decorators, signature, and indented body. */
	visit_FunctionDef(
		node: Extract<StmtNode, { nodeType: "FunctionDef" }>,
	): void {
		this.writeDecorators(node.decorator_list);
		this.fill("def ");
		this.write(node.name);
		this.writeTypeParams(node.type_params);
		this.write("(");
		this.visit_arguments(node.args);
		this.write(")");
		if (node.returns) {
			this.write(" -> ");
			this.visit(node.returns);
		}
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
	}

	/** Renders a `class` statement: decorators, name, bases/keywords, and indented body. */
	visit_ClassDef(node: Extract<StmtNode, { nodeType: "ClassDef" }>): void {
		this.writeDecorators(node.decorator_list);
		this.fill("class ");
		this.write(node.name);
		this.writeTypeParams(node.type_params);
		if (node.bases.length > 0 || node.keywords.length > 0) {
			this.write("(");
			this.interleave(", ", (base) => this.visit(base), node.bases);
			if (node.bases.length > 0 && node.keywords.length > 0) {
				this.write(", ");
			}
			this.interleave(", ", (kw) => this.visit(kw), node.keywords);
			this.write(")");
		}
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
	}

	/** Renders a `return` statement, with or without a return value. */
	visit_Return(node: Extract<StmtNode, { nodeType: "Return" }>): void {
		this.fill("return");
		if (node.value) {
			this.write(" ");
			this.visit(node.value);
		}
	}

	/**
	 * Renders an assignment statement (`a = b = value`). Also re-emits any
	 * standalone/inline comments recorded on `expressionComments` that
	 * weren't already handled via `inlineComment`, so comments attached
	 * around a multi-target or wrapped assignment aren't dropped.
	 */
	visit_Assign(node: Extract<StmtNode, { nodeType: "Assign" }>): void {
		this.fill();
		this.interleave(" = ", (target) => this.visit(target), node.targets);
		this.write(" = ");
		this.visit(node.value);

		// Handle additional expression comments (avoid duplicating inlineComment)
		const assignNode = node as Extract<StmtNode, { nodeType: "Assign" }> & {
			expressionComments?: Comment[];
		};
		if (assignNode.expressionComments) {
			// Find comments that aren't already handled as inlineComment
			const inlineCommentValue = assignNode.inlineComment?.value;
			const additionalComments = assignNode.expressionComments.filter(
				(comment) => comment.value !== inlineCommentValue,
			);

			for (const comment of additionalComments) {
				if (comment.inline) {
					this.write("  ", comment.value);
				} else {
					this.write("\n", comment.value);
				}
			}
		}
	}

	/** Renders an augmented assignment statement (`a += value`, `a **= value`, ...). */
	visit_AugAssign(node: Extract<StmtNode, { nodeType: "AugAssign" }>): void {
		this.fill();
		this.visit(node.target);
		this.write(" ", this.getAugAssignOp(node.op), " ");
		this.visit(node.value);
	}

	/**
	 * Maps an `OperatorNode` to its augmented-assignment spelling (`+=`, `**=`, ...).
	 *
	 * @param op - The operator node.
	 * @returns The augmented-assignment operator text, or `"?="` for an
	 *   unrecognized operator kind.
	 */
	private getAugAssignOp(op: OperatorNode): string {
		switch (op.nodeType) {
			case "Add":
				return "+=";
			case "Sub":
				return "-=";
			case "Mult":
				return "*=";
			case "MatMult":
				return "@=";
			case "Div":
				return "/=";
			case "Mod":
				return "%=";
			case "Pow":
				return "**=";
			case "LShift":
				return "<<=";
			case "RShift":
				return ">>=";
			case "BitOr":
				return "|=";
			case "BitXor":
				return "^=";
			case "BitAnd":
				return "&=";
			case "FloorDiv":
				return "//=";
			default:
				return "?=";
		}
	}

	/** Renders a `for target in iter:` loop, including an optional `else:` clause. */
	visit_For(node: Extract<StmtNode, { nodeType: "For" }>): void {
		this.fill("for ");
		this.visit(node.target);
		this.write(" in ");
		this.visit(node.iter);
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
		if (node.orelse.length > 0) {
			this.fill("else:");
			this.context.indent++;
			for (const stmt of node.orelse) {
				this.visit(stmt);
			}
			this.context.indent--;
		}
	}

	/** Renders a `while test:` loop, including an optional `else:` clause. */
	visit_While(node: Extract<StmtNode, { nodeType: "While" }>): void {
		this.fill("while ");
		this.visit(node.test);
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
		if (node.orelse.length > 0) {
			this.fill("else:");
			this.context.indent++;
			for (const stmt of node.orelse) {
				this.visit(stmt);
			}
			this.context.indent--;
		}
	}

	/**
	 * Renders an `if` statement. When `orelse` is exactly a single nested
	 * `If` node, it is collapsed into an `elif` clause rather than a nested
	 * `else:\n    if ...:`, matching idiomatic Python source. This collapsing
	 * is only applied one level deep: a further `elif` chained off that first
	 * `elif`'s own `orelse` is rendered as a nested `else:`/`if` block instead
	 * of a second `elif`.
	 */
	visit_If(node: Extract<StmtNode, { nodeType: "If" }>): void {
		this.fill("if ");
		this.visit(node.test);
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
		if (node.orelse.length > 0) {
			if (node.orelse.length === 1 && node.orelse[0].nodeType === "If") {
				this.fill("elif ");
				const elifNode = node.orelse[0] as Extract<
					StmtNode,
					{ nodeType: "If" }
				>;
				this.visit(elifNode.test);
				this.write(":");
				this.context.indent++;
				for (const stmt of elifNode.body) {
					this.visit(stmt);
				}
				this.context.indent--;
				if (elifNode.orelse.length > 0) {
					this.fill("else:");
					this.context.indent++;
					for (const stmt of elifNode.orelse) {
						this.visit(stmt);
					}
					this.context.indent--;
				}
			} else {
				this.fill("else:");
				this.context.indent++;
				for (const stmt of node.orelse) {
					this.visit(stmt);
				}
				this.context.indent--;
			}
		}
	}

	/** Renders a `pass` statement. */
	visit_Pass(_node: Extract<StmtNode, { nodeType: "Pass" }>): void {
		this.fill("pass");
	}

	/** Renders a `break` statement. */
	visit_Break(_node: Extract<StmtNode, { nodeType: "Break" }>): void {
		this.fill("break");
	}

	/** Renders a `continue` statement. */
	visit_Continue(_node: Extract<StmtNode, { nodeType: "Continue" }>): void {
		this.fill("continue");
	}

	/**
	 * Renders a standalone `Comment` pseudo-statement (`# ...` text tracked
	 * by the parser as its own node, distinct from the `inlineComment`
	 * attached to other statements). Inline comments append to the current
	 * line; standalone ones start a new indented line.
	 */
	visit_Comment(node: Extract<StmtNode, { nodeType: "Comment" }>): void {
		if (node.inline) {
			// For inline comments, append to current line with a space
			this.write("  ", node.value);
		} else {
			// For standalone comments, start a new line
			this.fill(node.value);
		}
	}

	/** Renders a `del target, ...` statement. */
	visit_Delete(node: Extract<StmtNode, { nodeType: "Delete" }>): void {
		this.fill("del ");
		this.interleave(", ", (target) => this.visit(target), node.targets);
	}

	/** Renders a `nonlocal name, ...` statement. */
	visit_Nonlocal(node: Extract<StmtNode, { nodeType: "Nonlocal" }>): void {
		this.fill("nonlocal ");
		this.interleave(", ", (name) => this.write(name), node.names);
	}

	/** Renders a PEP 695 `type Name[params] = value` alias statement. */
	visit_TypeAlias(node: Extract<StmtNode, { nodeType: "TypeAlias" }>): void {
		this.fill("type ");
		this.visit(node.name);
		if (node.type_params.length > 0) {
			this.write("[");
			this.interleave(", ", (param) => this.visit(param), node.type_params);
			this.write("]");
		}
		this.write(" = ");
		this.visit(node.value);
	}

	/** Renders a `match subject:` statement with its indented `case` blocks. */
	visit_Match(node: Extract<StmtNode, { nodeType: "Match" }>): void {
		this.fill("match ");
		this.visit(node.subject);
		this.write(":");
		this.context.indent++;
		for (const case_ of node.cases) {
			this.visit(case_);
		}
		this.context.indent--;
	}

	/** Renders one `case pattern [if guard]:` clause of a `match` statement. */
	visit_MatchCase(
		node: Extract<import("./types.js").MatchCase, { nodeType: "MatchCase" }>,
	): void {
		this.fill("case ");
		this.visit(node.pattern);
		if (node.guard) {
			this.write(" if ");
			this.visit(node.guard);
		}
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
	}

	/** Renders an expression-statement (an expression evaluated for its side effects). */
	visit_Expr(node: Extract<StmtNode, { nodeType: "Expr" }>): void {
		this.fill();
		this.visit(node.value);
	}

	/** Renders an `import module [as alias], ...` statement. */
	visit_Import(node: Extract<StmtNode, { nodeType: "Import" }>): void {
		this.fill("import ");
		this.interleave(", ", (alias) => this.visit(alias), node.names);
	}

	/**
	 * Renders a `from module import name, ...` statement, including relative
	 * import dots for `node.level` (e.g. `level: 2` -> `from ..module import ...`).
	 */
	visit_ImportFrom(node: Extract<StmtNode, { nodeType: "ImportFrom" }>): void {
		this.fill("from ");
		if (node.level && node.level > 0) {
			this.write(".".repeat(node.level));
		}
		if (node.module) {
			this.write(node.module);
		}
		this.write(" import ");
		this.interleave(", ", (alias) => this.visit(alias), node.names);
	}

	/** Renders a `global name, ...` statement. */
	visit_Global(node: Extract<StmtNode, { nodeType: "Global" }>): void {
		this.fill("global ");
		this.interleave(", ", (name) => this.write(name), node.names);
	}

	/** Renders a `raise [exc [from cause]]` statement. */
	visit_Raise(node: Extract<StmtNode, { nodeType: "Raise" }>): void {
		this.fill("raise");
		if (node.exc) {
			this.write(" ");
			this.visit(node.exc);
			if (node.cause) {
				this.write(" from ");
				this.visit(node.cause);
			}
		}
	}

	/** Renders a `try:` statement with its `except`, `else:`, and `finally:` clauses. */
	visit_Try(node: Extract<StmtNode, { nodeType: "Try" }>): void {
		this.fill("try:");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;

		for (const handler of node.handlers) {
			this.visit(handler);
		}

		if (node.orelse.length > 0) {
			this.fill("else:");
			this.context.indent++;
			for (const stmt of node.orelse) {
				this.visit(stmt);
			}
			this.context.indent--;
		}

		if (node.finalbody.length > 0) {
			this.fill("finally:");
			this.context.indent++;
			for (const stmt of node.finalbody) {
				this.visit(stmt);
			}
			this.context.indent--;
		}
	}

	/**
	 * Renders a `try:` statement using PEP 654 `except*` exception-group
	 * handlers, rather than delegating to `visit_ExceptHandler` (which emits
	 * plain `except`), since `TryStar` handlers always use the `except*` form.
	 */
	visit_TryStar(node: Extract<StmtNode, { nodeType: "TryStar" }>): void {
		this.fill("try:");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;

		for (const handler of node.handlers) {
			// Handle except* syntax for TryStar nodes
			this.fill("except*");
			if (handler.type) {
				this.write(" ");
				this.visit(handler.type);
				if (handler.name) {
					this.write(" as ");
					this.write(handler.name);
				}
			}
			this.write(":");
			this.context.indent++;
			for (const stmt of handler.body) {
				this.visit(stmt);
			}
			this.context.indent--;
		}

		if (node.orelse.length > 0) {
			this.fill("else:");
			this.context.indent++;
			for (const stmt of node.orelse) {
				this.visit(stmt);
			}
			this.context.indent--;
		}

		if (node.finalbody.length > 0) {
			this.fill("finally:");
			this.context.indent++;
			for (const stmt of node.finalbody) {
				this.visit(stmt);
			}
			this.context.indent--;
		}
	}

	/** Renders an `assert test[, msg]` statement. */
	visit_Assert(node: Extract<StmtNode, { nodeType: "Assert" }>): void {
		this.fill("assert ");
		this.visit(node.test);
		if (node.msg) {
			this.write(", ");
			this.visit(node.msg);
		}
	}

	/** Renders a `with item, ...:` statement and its indented body. */
	visit_With(node: Extract<StmtNode, { nodeType: "With" }>): void {
		this.fill("with ");
		this.interleave(", ", (item) => this.visit(item), node.items);
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
	}

	/** Renders an `async with item, ...:` statement and its indented body. */
	visit_AsyncWith(node: Extract<StmtNode, { nodeType: "AsyncWith" }>): void {
		this.fill("async with ");
		this.interleave(", ", (item) => this.visit(item), node.items);
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
	}

	/** Renders an `async for target in iter:` loop, including an optional `else:` clause. */
	visit_AsyncFor(node: Extract<StmtNode, { nodeType: "AsyncFor" }>): void {
		this.fill("async for ");
		this.visit(node.target);
		this.write(" in ");
		this.visit(node.iter);
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
		if (node.orelse.length > 0) {
			this.fill("else:");
			this.context.indent++;
			for (const stmt of node.orelse) {
				this.visit(stmt);
			}
			this.context.indent--;
		}
	}

	/** Renders an `async def` statement: decorators, signature, and indented body. */
	visit_AsyncFunctionDef(
		node: Extract<StmtNode, { nodeType: "AsyncFunctionDef" }>,
	): void {
		this.writeDecorators(node.decorator_list);
		this.fill("async def ");
		this.write(node.name);
		this.writeTypeParams(node.type_params);
		this.write("(");
		this.visit_arguments(node.args);
		this.write(")");
		if (node.returns) {
			this.write(" -> ");
			this.visit(node.returns);
		}
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
	}

	/** Renders an annotated assignment (`target: annotation[ = value]`). */
	visit_AnnAssign(node: Extract<StmtNode, { nodeType: "AnnAssign" }>): void {
		this.fill();
		this.visit(node.target);
		this.write(": ");
		this.visit(node.annotation);
		if (node.value) {
			this.write(" = ");
			this.visit(node.value);
		}
	}

	// Expression visitors
	/**
	 * Renders a binary operator expression (`left op right`), parenthesizing
	 * the whole expression and/or either operand as needed to preserve
	 * evaluation order. The right operand gets extra scrutiny: for a
	 * left-associative operator, a right-hand child of *equal* precedence
	 * still needs parens (`a - (b - c)` is not the same as `a - b - c`),
	 * whereas for the right-associative `**` operator an equal-precedence
	 * right child does not.
	 */
	visit_BinOp(node: Extract<ExprNode, { nodeType: "BinOp" }>): void {
		const precedence = this.getBinOpPrecedence(node.op);
		const needParens = this.requireParens(precedence, node);

		if (needParens) this.write("(");

		// Check if left operand needs parentheses
		const leftNeedsParens = this.requireParens(precedence, node.left);
		if (leftNeedsParens) this.write("(");
		this.withPrecedence(precedence, node.left);
		if (leftNeedsParens) this.write(")");

		this.write(" ", this.getBinOpSymbol(node.op), " ");

		// Check if right operand needs parentheses
		// For right-associative operators or same precedence, we need to be more careful
		const rightNeedsParens =
			this.requireParens(precedence, node.right) ||
			(this.getPrecedence(node.right) === precedence &&
				this.isLeftAssociative(node.op));
		if (rightNeedsParens) this.write("(");
		this.withPrecedence(precedence, node.right);
		if (rightNeedsParens) this.write(")");

		if (needParens) this.write(")");
	}

	/**
	 * Reports whether a binary operator is left-associative in Python.
	 * All binary operators are left-associative except `**` (power), which
	 * is right-associative (`2 ** 3 ** 2 == 2 ** (3 ** 2)`).
	 *
	 * @param op - The binary operator node.
	 * @returns `true` unless `op` is `Pow`.
	 */
	private isLeftAssociative(op: OperatorNode): boolean {
		// Most binary operators are left-associative, except power
		return op.nodeType !== "Pow";
	}

	/**
	 * Maps a binary `OperatorNode` to its source symbol (`+`, `**`, `//`, ...).
	 *
	 * @param op - The binary operator node.
	 * @returns The operator's source text, or `"?"` for an unrecognized kind.
	 */
	private getBinOpSymbol(op: OperatorNode): string {
		switch (op.nodeType) {
			case "Add":
				return "+";
			case "Sub":
				return "-";
			case "Mult":
				return "*";
			case "MatMult":
				return "@";
			case "Div":
				return "/";
			case "Mod":
				return "%";
			case "Pow":
				return "**";
			case "LShift":
				return "<<";
			case "RShift":
				return ">>";
			case "BitOr":
				return "|";
			case "BitXor":
				return "^";
			case "BitAnd":
				return "&";
			case "FloorDiv":
				return "//";
			default:
				return "?";
		}
	}

	/**
	 * Renders a unary operator expression (`-x`, `~x`, `not x`, `+x`).
	 * `not` is written with a trailing space (word operator); the symbolic
	 * operators (`-`, `~`, `+`) are written flush against the operand.
	 */
	visit_UnaryOp(node: Extract<ExprNode, { nodeType: "UnaryOp" }>): void {
		const precedence = Precedence.FACTOR;
		const needParens = this.requireParens(precedence, node);

		if (needParens) this.write("(");
		this.write(this.getUnaryOpSymbol(node.op));
		if (node.op.nodeType === "Not") this.write(" ");
		this.withPrecedence(precedence, node.operand);
		if (needParens) this.write(")");
	}

	/**
	 * Maps a `UnaryOpNode` to its source symbol/keyword (`~`, `not`, `+`, `-`).
	 *
	 * @param op - The unary operator node.
	 * @returns The operator's source text, or `"?"` for an unrecognized kind.
	 */
	private getUnaryOpSymbol(op: UnaryOpNode): string {
		switch (op.nodeType) {
			case "Invert":
				return "~";
			case "Not":
				return "not";
			case "UAdd":
				return "+";
			case "USub":
				return "-";
			default:
				return "?";
		}
	}

	/** Renders a boolean operator expression, joining `values` with `" and "`/`" or "`. */
	visit_BoolOp(node: Extract<ExprNode, { nodeType: "BoolOp" }>): void {
		const precedence =
			node.op.nodeType === "Or" ? Precedence.OR : Precedence.AND;
		const needParens = this.requireParens(precedence, node);
		const opSymbol = node.op.nodeType === "Or" ? " or " : " and ";

		if (needParens) this.write("(");
		this.interleave(
			opSymbol,
			(value) => this.withPrecedence(precedence, value),
			node.values,
		);
		if (needParens) this.write(")");
	}

	/** Renders a chained comparison expression (`left op1 c1 op2 c2 ...`). */
	visit_Compare(node: Extract<ExprNode, { nodeType: "Compare" }>): void {
		const precedence = Precedence.CMP;
		const needParens = this.requireParens(precedence, node);

		if (needParens) this.write("(");
		this.withPrecedence(precedence, node.left);
		for (let i = 0; i < node.ops.length; i++) {
			this.write(" ", this.getCmpOpSymbol(node.ops[i]), " ");
			this.withPrecedence(precedence, node.comparators[i]);
		}
		if (needParens) this.write(")");
	}

	/** Renders a walrus/named expression (`target := value`). */
	visit_NamedExpr(node: Extract<ExprNode, { nodeType: "NamedExpr" }>): void {
		const needParens = this.requireParens(Precedence.TEST, node);
		if (needParens) this.write("(");
		this.visit(node.target);
		this.write(" := ");
		this.visit(node.value);
		if (needParens) this.write(")");
	}

	/** Renders a `lambda [params]: body` expression. */
	visit_Lambda(node: Extract<ExprNode, { nodeType: "Lambda" }>): void {
		this.write("lambda");
		if (node.args.args.length > 0 || node.args.vararg || node.args.kwarg) {
			this.write(" ");
			this.visit_arguments(node.args);
		}
		this.write(": ");
		this.visit(node.body);
	}

	/** Renders a conditional expression (`body if test else orelse`). */
	visit_IfExp(node: Extract<ExprNode, { nodeType: "IfExp" }>): void {
		const precedence = Precedence.TEST;
		const needParens = this.requireParens(precedence, node);
		if (needParens) this.write("(");
		this.withPrecedence(precedence, node.body);
		this.write(" if ");
		this.withPrecedence(precedence, node.test);
		this.write(" else ");
		this.withPrecedence(precedence, node.orelse);
		if (needParens) this.write(")");
	}

	/** Renders an `await value` expression. */
	visit_Await(node: Extract<ExprNode, { nodeType: "Await" }>): void {
		this.write("await ");
		this.withPrecedence(Precedence.AWAIT, node.value);
	}

	/** Renders a `yield [value]` expression. */
	visit_Yield(node: Extract<ExprNode, { nodeType: "Yield" }>): void {
		this.write("yield");
		if (node.value) {
			this.write(" ");
			this.visit(node.value);
		}
	}

	/** Renders a `yield from value` expression. */
	visit_YieldFrom(node: Extract<ExprNode, { nodeType: "YieldFrom" }>): void {
		this.write("yield from ");
		this.visit(node.value);
	}

	/** Renders a starred expression (`*value`), e.g. in call args or assignment targets. */
	visit_Starred(node: Extract<ExprNode, { nodeType: "Starred" }>): void {
		this.write("*");
		this.visit(node.value);
	}

	/** Renders a slice (`lower:upper[:step]`) used inside a `Subscript`. */
	visit_Slice(node: Extract<ExprNode, { nodeType: "Slice" }>): void {
		if (node.lower) {
			this.visit(node.lower);
		}
		this.write(":");
		if (node.upper) {
			this.visit(node.upper);
		}
		if (node.step) {
			this.write(":");
			this.visit(node.step);
		}
	}

	/** Renders an f-string (`JoinedStr`), preserving its original quote style. */
	visit_JoinedStr(node: Extract<ExprNode, { nodeType: "JoinedStr" }>): void {
		const [openQuote, closeQuote] = this.chooseFStringQuotes(node);
		this.write(openQuote);
		this.writeJoinedStrContent(node);
		this.write(closeQuote);
	}

	/**
	 * Writes the interior parts of an f-string (between the quotes), handling
	 * literal text segments and `{expr[!conv][:format_spec]}` replacement
	 * fields inline. Extracted from {@link visit_JoinedStr} because nested
	 * format specs that are themselves f-strings (e.g. `f"{x:{width}}"`) need
	 * their content written without an extra pair of surrounding quotes.
	 *
	 * @param node - The `JoinedStr` node whose `values` to render.
	 */
	private writeJoinedStrContent(
		node: Extract<ExprNode, { nodeType: "JoinedStr" }>,
	): void {
		for (const value of node.values) {
			if (value.nodeType === "Constant") {
				this.write(String(value.value));
			} else if (value.nodeType === "FormattedValue") {
				this.write("{");
				this.visit(value.value);
				if (value.conversion !== -1) {
					if (value.conversion === 115) this.write("!s");
					else if (value.conversion === 114) this.write("!r");
					else if (value.conversion === 97) this.write("!a");
				}
				if (value.format_spec) {
					this.write(":");
					if (value.format_spec.nodeType === "JoinedStr") {
						this.writeJoinedStrContent(value.format_spec);
					} else {
						this.visit(value.format_spec);
					}
				}
				this.write("}");
			} else {
				this.visit(value);
			}
		}
	}

	/**
	 * Renders a standalone `FormattedValue` (a `{expr[!conv][:format_spec]}`
	 * replacement field visited outside of a `JoinedStr` context). The
	 * `conversion` field holds the ASCII code point of the conversion letter
	 * (115 = `s`, 114 = `r`, 97 = `a`) as produced by CPython's `ast` module;
	 * `-1` means no conversion.
	 */
	visit_FormattedValue(
		node: Extract<ExprNode, { nodeType: "FormattedValue" }>,
	): void {
		this.write("{");
		this.visit(node.value);
		if (node.conversion !== -1) {
			if (node.conversion === 115) this.write("!s");
			else if (node.conversion === 114) this.write("!r");
			else if (node.conversion === 97) this.write("!a");
		}
		if (node.format_spec) {
			this.write(":");
			if (node.format_spec.nodeType === "JoinedStr") {
				this.writeJoinedStrContent(node.format_spec);
			} else {
				this.visit(node.format_spec);
			}
		}
		this.write("}");
	}

	/**
	 * Maps a `CmpOpNode` to its source text (`==`, `is not`, `not in`, ...).
	 *
	 * @param op - The comparison operator node.
	 * @returns The operator's source text, or `"?"` for an unrecognized kind.
	 */
	private getCmpOpSymbol(op: CmpOpNode): string {
		switch (op.nodeType) {
			case "Eq":
				return "==";
			case "NotEq":
				return "!=";
			case "Lt":
				return "<";
			case "LtE":
				return "<=";
			case "Gt":
				return ">";
			case "GtE":
				return ">=";
			case "Is":
				return "is";
			case "IsNot":
				return "is not";
			case "In":
				return "in";
			case "NotIn":
				return "not in";
			default:
				return "?";
		}
	}

	/** Renders a call expression (`func(args, kw=value, ...)`). */
	visit_Call(node: Extract<ExprNode, { nodeType: "Call" }>): void {
		this.visit(node.func);
		this.write("(");
		this.interleave(", ", (arg) => this.visit(arg), node.args);
		if (node.args.length > 0 && node.keywords.length > 0) {
			this.write(", ");
		}
		this.interleave(", ", (kw) => this.visit(kw), node.keywords);
		this.write(")");
	}

	/** Renders a call keyword argument (`name=value`), or `**value` when `arg` is absent. */
	visit_Keyword(node: Keyword): void {
		if (node.arg) {
			this.write(node.arg, "=");
		} else {
			this.write("**");
		}
		this.visit(node.value);
	}

	/** Renders a literal constant (`None`/`True`/`False`/number/string/ellipsis). */
	visit_Constant(node: Extract<ExprNode, { nodeType: "Constant" }>): void {
		this.write(this.formatConstant(node.value, node.kind));
	}

	/**
	 * Formats a `Constant` node's raw JS value as Python source text.
	 * `value` is typed `any` because a `Constant` may hold any JSON-like
	 * literal produced by the parser (string, number, boolean, `null`, or the
	 * sentinel `"..."` for `Ellipsis`).
	 *
	 * @param value - The constant's runtime value.
	 * @param kind - Original string-prefix/quote-style hint (see {@link formatString}).
	 * @returns The Python source representation of `value`.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Could be of any type
	private formatConstant(value: any, kind?: string): string {
		if (value === null) return "None";
		if (value === true) return "True";
		if (value === false) return "False";
		if (value === "...") return "..."; // Handle ellipsis
		if (typeof value === "string") {
			return this.formatString(value, kind);
		}
		if (typeof value === "number") {
			return value.toString();
		}
		return String(value);
	}

	/**
	 * Formats a string constant with its original quote style preserved where
	 * known: triple-quoted strings (`"""`/`'''`) are re-emitted as
	 * triple-quoted regardless of whether they contain newlines, and
	 * single/double-quoted strings keep their original quote character
	 * (escaping only that character in the body). Falls back to double quotes
	 * when no `kind` hint is available.
	 *
	 * @param value - The raw (unescaped) string value.
	 * @param kind - Original prefix+quote text captured by the parser, e.g.
	 *   `'"'`, `"'''"`, or `"rb\""`.
	 * @returns The quoted, escaped Python string literal.
	 */
	private formatString(value: string, kind?: string): string {
		// If we have quote style information, use it
		if (kind) {
			// Extract prefix and quote info
			const prefixMatch = kind.match(/^([fFrRbBuU]*)(.*)/);
			const prefix = prefixMatch ? prefixMatch[1] : "";
			const quoteStyle = prefixMatch ? prefixMatch[2] : '"""';

			// For multiline strings, preserve triple quotes
			if (quoteStyle === '"""' || quoteStyle === "'''") {
				// Check if the string contains newlines
				if (value.includes("\n")) {
					return `${prefix}${quoteStyle}${value}${quoteStyle}`;
				}
				// If it doesn't have newlines but was originally triple-quoted, preserve that
				return `${prefix}${quoteStyle}${value}${quoteStyle}`;
			}

			// For regular strings, use the original quote style
			if (quoteStyle === '"') {
				return `${prefix}"${this.escapeString(value, '"')}"`;
			} else if (quoteStyle === "'") {
				return `${prefix}'${this.escapeString(value, "'")}'`;
			}
		}

		// Default to double quotes if no kind information
		return `"${this.escapeString(value, '"')}"`;
	}

	/**
	 * Escapes backslashes, newlines, carriage returns, tabs, and the given
	 * quote character in `value` so it can be embedded in a single-quoted
	 * (non-triple) Python string literal.
	 *
	 * @param value - Raw string content to escape.
	 * @param quote - The quote character (`"` or `'`) the string will be wrapped in.
	 * @returns The escaped string body (without surrounding quotes).
	 */
	private escapeString(value: string, quote: string): string {
		return value
			.replace(/\\/g, "\\\\")
			.replace(/\n/g, "\\n")
			.replace(/\r/g, "\\r")
			.replace(/\t/g, "\\t")
			.replace(new RegExp(`\\${quote}`, "g"), `\\${quote}`);
	}

	/** Renders a bare identifier reference. */
	visit_Name(node: Extract<ExprNode, { nodeType: "Name" }>): void {
		this.write(node.id);
	}

	/** Renders attribute access (`value.attr`). */
	visit_Attribute(node: Extract<ExprNode, { nodeType: "Attribute" }>): void {
		this.visit(node.value);
		this.write(".", node.attr);
	}

	/**
	 * Renders a subscript expression (`value[slice]`). A `Tuple` slice (as in
	 * `a[1, 2]` or `a[i, j:k]`) is unpacked and its elements interleaved with
	 * `", "` directly, rather than delegating to `visit_Tuple`, so it isn't
	 * wrapped in the parentheses `visit_Tuple` would normally add.
	 */
	visit_Subscript(node: Extract<ExprNode, { nodeType: "Subscript" }>): void {
		this.visit(node.value);
		this.write("[");
		// Special handling for tuples in subscripts - don't add parentheses
		if (node.slice.nodeType === "Tuple") {
			this.interleave(", ", (elt) => this.visit(elt), node.slice.elts);
		} else {
			this.visit(node.slice);
		}
		this.write("]");
	}

	/** Renders a list display (`[elt, ...]`). */
	visit_List(node: Extract<ExprNode, { nodeType: "List" }>): void {
		this.write("[");
		this.interleave(", ", (elt) => this.visit(elt), node.elts);
		this.write("]");
	}

	/**
	 * Renders a tuple display. A single-element tuple gets an explicit
	 * trailing comma (`(x,)`) since `(x)` alone would just be `x` in
	 * parentheses, not a tuple.
	 */
	visit_Tuple(node: Extract<ExprNode, { nodeType: "Tuple" }>): void {
		this.write("(");
		this.interleave(", ", (elt) => this.visit(elt), node.elts);
		if (node.elts.length === 1) {
			this.write(",");
		}
		this.write(")");
	}

	/**
	 * Renders a dict display (`{key: value, ...}`). A `null` key (paired with
	 * its value) represents a `**value` unpacking entry rather than an
	 * explicit `key: value` pair.
	 */
	visit_Dict(node: Extract<ExprNode, { nodeType: "Dict" }>): void {
		this.write("{");
		for (let i = 0; i < node.keys.length; i++) {
			if (i > 0) this.write(", ");
			const key = node.keys[i];
			if (key) {
				this.visit(key);
				this.write(": ");
			} else {
				this.write("**");
			}
			this.visit(node.values[i]);
		}
		this.write("}");
	}

	/** Renders a set display (`{elt, ...}`). */
	visit_Set(node: Extract<ExprNode, { nodeType: "Set" }>): void {
		this.write("{");
		this.interleave(", ", (elt) => this.visit(elt), node.elts);
		this.write("}");
	}

	/** Renders a list comprehension (`[elt for ... ]`). */
	visit_ListComp(node: Extract<ExprNode, { nodeType: "ListComp" }>): void {
		this.write("[");
		this.visit(node.elt);
		for (const generator of node.generators) {
			this.visit(generator);
		}
		this.write("]");
	}

	/** Renders a set comprehension (`{elt for ... }`). */
	visit_SetComp(node: Extract<ExprNode, { nodeType: "SetComp" }>): void {
		this.write("{");
		this.visit(node.elt);
		for (const generator of node.generators) {
			this.visit(generator);
		}
		this.write("}");
	}

	/** Renders a dict comprehension (`{key: value for ... }`). */
	visit_DictComp(node: Extract<ExprNode, { nodeType: "DictComp" }>): void {
		this.write("{");
		this.visit(node.key);
		this.write(": ");
		this.visit(node.value);
		for (const generator of node.generators) {
			this.visit(generator);
		}
		this.write("}");
	}

	/** Renders a generator expression (`(elt for ... )`). */
	visit_GeneratorExp(
		node: Extract<ExprNode, { nodeType: "GeneratorExp" }>,
	): void {
		this.write("(");
		this.visit(node.elt);
		for (const generator of node.generators) {
			this.visit(generator);
		}
		this.write(")");
	}

	/**
	 * Renders one `[async] for target in iter [if cond ...]` clause of a
	 * comprehension. Writes its own leading space (` for `/` async for `) so
	 * multiple clauses concatenate correctly when a comprehension has more
	 * than one `for`.
	 */
	visit_Comprehension(
		node: Extract<
			import("./types.js").Comprehension,
			{ nodeType: "Comprehension" }
		>,
	): void {
		if (node.is_async) {
			this.write(" async for ");
		} else {
			this.write(" for ");
		}
		this.visit(node.target);
		this.write(" in ");
		this.visit(node.iter);
		for (const if_ of node.ifs) {
			this.write(" if ");
			this.visit(if_);
		}
	}

	// Handle helper types
	/**
	 * Renders one `except [type [as name]]:` clause of a `Try` statement
	 * (plain `except`, not the `except*` form — see {@link visit_TryStar}).
	 */
	visit_ExceptHandler(
		node: Extract<
			import("./types.js").ExceptHandler,
			{ nodeType: "ExceptHandler" }
		>,
	): void {
		this.fill("except");
		if (node.type) {
			this.write(" ");
			this.visit(node.type);
			if (node.name) {
				this.write(" as ");
				this.write(node.name);
			}
		}
		this.write(":");
		this.context.indent++;
		for (const stmt of node.body) {
			this.visit(stmt);
		}
		this.context.indent--;
	}

	/** Renders one `name [as asname]` entry of an `import`/`from ... import` clause. */
	visit_Alias(
		node: Extract<import("./types.js").Alias, { nodeType: "Alias" }>,
	): void {
		this.write(node.name);
		if (node.asname) {
			this.write(" as ");
			this.write(node.asname);
		}
	}

	/** Renders one `context_expr [as optional_vars]` entry of a `with`/`async with` clause. */
	visit_WithItem(
		node: Extract<import("./types.js").WithItem, { nodeType: "WithItem" }>,
	): void {
		this.visit(node.context_expr);
		if (node.optional_vars) {
			this.write(" as ");
			this.visit(node.optional_vars);
		}
	}

	// Handle arguments
	/**
	 * Renders a function/lambda parameter list: positional-only params (with
	 * trailing `/`), regular params, `*args`, keyword-only params, and
	 * `**kwargs`, each with defaults aligned to the correct (rightmost)
	 * parameters. Does not write the surrounding parentheses — callers
	 * (`visit_FunctionDef`, `visit_Lambda`, etc.) are responsible for those.
	 *
	 * @param node - The `Arguments` node describing the full parameter list.
	 */
	visit_arguments(node: Arguments): void {
		const all_args = [...node.posonlyargs, ...node.args];

		for (let i = 0; i < all_args.length; i++) {
			if (i > 0) this.write(", ");
			this.visit(all_args[i]);

			// Add default values - they apply to the rightmost arguments
			const defaultIndex = i - (all_args.length - node.defaults.length);
			if (defaultIndex >= 0 && defaultIndex < node.defaults.length) {
				this.write("=");
				this.visit(node.defaults[defaultIndex]);
			}

			// Add positional-only separator
			if (i === node.posonlyargs.length - 1 && node.posonlyargs.length > 0) {
				this.write(", /");
			}
		}

		if (node.vararg) {
			if (all_args.length > 0) this.write(", ");
			this.write("*");
			this.visit(node.vararg);
		}

		if (node.kwonlyargs.length > 0) {
			if (!node.vararg && all_args.length > 0) this.write(", *");
			for (let i = 0; i < node.kwonlyargs.length; i++) {
				this.write(", ");
				this.visit(node.kwonlyargs[i]);
				if (i < node.kw_defaults.length && node.kw_defaults[i]) {
					this.write("=");
					const defaultValue = node.kw_defaults[i];
					if (defaultValue) {
						this.visit(defaultValue);
					}
				}
			}
		}

		if (node.kwarg) {
			if (all_args.length > 0 || node.vararg || node.kwonlyargs.length > 0) {
				this.write(", ");
			}
			this.write("**");
			this.visit(node.kwarg);
		}
	}

	/** Renders a single parameter (`name[: annotation]`) within a parameter list. */
	visit_Arg(node: Arg): void {
		this.write(node.arg);
		if (node.annotation) {
			this.write(": ");
			this.visit(node.annotation);
		}
	}

	// Pattern visitors
	/** Renders a `match` literal/value pattern (`case value:`). */
	visit_MatchValue(
		node: Extract<import("./types.js").PatternNode, { nodeType: "MatchValue" }>,
	): void {
		this.visit(node.value);
	}

	/** Renders a `match` singleton pattern (`case None:`/`True`/`False`). */
	visit_MatchSingleton(
		node: Extract<
			import("./types.js").PatternNode,
			{ nodeType: "MatchSingleton" }
		>,
	): void {
		if (node.value === null) this.write("None");
		else if (node.value === true) this.write("True");
		else if (node.value === false) this.write("False");
		else this.write(String(node.value));
	}

	/** Renders a `match` sequence pattern (`case [p1, p2, ...]:`). */
	visit_MatchSequence(
		node: Extract<
			import("./types.js").PatternNode,
			{ nodeType: "MatchSequence" }
		>,
	): void {
		this.write("[");
		this.interleave(", ", (pattern) => this.visit(pattern), node.patterns);
		this.write("]");
	}

	/**
	 * Renders a `match` mapping pattern (`case {key: pattern, ..., **rest}:`).
	 */
	visit_MatchMapping(
		node: Extract<
			import("./types.js").PatternNode,
			{ nodeType: "MatchMapping" }
		>,
	): void {
		this.write("{");
		for (let i = 0; i < node.keys.length; i++) {
			if (i > 0) this.write(", ");
			this.visit(node.keys[i]);
			this.write(": ");
			this.visit(node.patterns[i]);
		}
		if (node.rest) {
			if (node.keys.length > 0) this.write(", ");
			this.write("**");
			this.write(node.rest);
		}
		this.write("}");
	}

	/**
	 * Renders a `match` class pattern (`case Cls(p1, p2, kw=p3, ...):`),
	 * combining positional sub-patterns and keyword sub-patterns.
	 */
	visit_MatchClass(
		node: Extract<import("./types.js").PatternNode, { nodeType: "MatchClass" }>,
	): void {
		this.visit(node.cls);
		this.write("(");
		this.interleave(", ", (pattern) => this.visit(pattern), node.patterns);
		for (let i = 0; i < node.kwd_attrs.length; i++) {
			if (node.patterns.length > 0 || i > 0) this.write(", ");
			this.write(node.kwd_attrs[i]);
			this.write("=");
			this.visit(node.kwd_patterns[i]);
		}
		this.write(")");
	}

	/** Renders a `match` star pattern (`*name` or bare `*` inside a sequence pattern). */
	visit_MatchStar(
		node: Extract<import("./types.js").PatternNode, { nodeType: "MatchStar" }>,
	): void {
		this.write("*");
		if (node.name) {
			this.write(node.name);
		}
	}

	/**
	 * Renders a `match` "as" pattern (`pattern as name`), or a bare capture
	 * name / wildcard `_` when `pattern` is absent.
	 */
	visit_MatchAs(
		node: Extract<import("./types.js").PatternNode, { nodeType: "MatchAs" }>,
	): void {
		if (node.pattern) {
			this.visit(node.pattern);
			this.write(" as ");
		}
		if (node.name) {
			this.write(node.name);
		}
	}

	/** Renders an "or" pattern (`p1 | p2 | ...`). */
	visit_MatchOr(
		node: Extract<import("./types.js").PatternNode, { nodeType: "MatchOr" }>,
	): void {
		this.interleave(" | ", (pattern) => this.visit(pattern), node.patterns);
	}

	// Helper method for type parameters
	/**
	 * Writes a PEP 695 type-parameter list (`[T, *Ts, **P]`) if `type_params`
	 * is non-empty; writes nothing otherwise.
	 *
	 * @param type_params - Type parameters declared on a `def`/`class`/`type` statement.
	 */
	private writeTypeParams(
		type_params: import("./types.js").TypeParamNode[],
	): void {
		if (type_params && type_params.length > 0) {
			this.write("[");
			this.interleave(", ", (param) => this.visit(param), type_params);
			this.write("]");
		}
	}

	// Type parameter visitors
	/** Renders a PEP 695 `TypeVar` param (`T[: bound][ = default]`). */
	visit_TypeVar(
		node: Extract<import("./types.js").TypeParamNode, { nodeType: "TypeVar" }>,
	): void {
		this.write(node.name);
		if (node.bound) {
			this.write(": ");
			this.visit(node.bound);
		}
		if (node.default_value) {
			this.write(" = ");
			this.visit(node.default_value);
		}
	}

	/** Renders a PEP 695 `ParamSpec` param (`**P[ = default]`). */
	visit_ParamSpec(
		node: Extract<
			import("./types.js").TypeParamNode,
			{ nodeType: "ParamSpec" }
		>,
	): void {
		this.write("**");
		this.write(node.name);
		if (node.default_value) {
			this.write(" = ");
			this.visit(node.default_value);
		}
	}

	/** Renders a PEP 695 `TypeVarTuple` param (`*Ts[ = default]`). */
	visit_TypeVarTuple(
		node: Extract<
			import("./types.js").TypeParamNode,
			{ nodeType: "TypeVarTuple" }
		>,
	): void {
		this.write("*");
		this.write(node.name);
		if (node.default_value) {
			this.write(" = ");
			this.visit(node.default_value);
		}
	}

	// FunctionType module visitor
	/** Renders a `FunctionType` module node: a bare `(argtypes) -> returns` type signature. */
	visit_FunctionType(
		node: Extract<
			import("./types.js").ModuleNode,
			{ nodeType: "FunctionType" }
		>,
	): void {
		this.write("(");
		this.interleave(", ", (arg) => this.visit(arg), node.argtypes);
		this.write(") -> ");
		this.visit(node.returns);
	}
}
