import type {
	Arg,
	Arguments,
	ASTNodeUnion,
	CmpOpNode,
	ExprNode,
	Keyword,
	ModuleNode,
	OperatorNode,
	StmtNode,
	UnaryOpNode,
} from "./types.js";
import { NodeVisitor } from "./visitor.js";

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

interface UnparseContext {
	precedence: Precedence;
	source: string[];
	indent: number;
	indentString: string;
	isFirstStatement: boolean;
}

/**
 * Unparse an AST node back to Python source code
 */
export function unparse(
	node: ASTNodeUnion,
	options: { indent?: string } = {},
): string {
	const context: UnparseContext = {
		precedence: Precedence.TUPLE,
		source: [],
		indent: 0,
		indentString: options.indent || "    ",
		isFirstStatement: true,
	};

	const unparser = new Unparser(context);
	unparser.visit(node);

	return context.source.join("");
}

class Unparser extends NodeVisitor {
	constructor(private context: UnparseContext) {
		super();
	}

	private write(...text: string[]): void {
		this.context.source.push(...text);
	}

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

	private interleave<T>(inter: string, f: (item: T) => void, seq: T[]): void {
		for (let i = 0; i < seq.length; i++) {
			if (i > 0) {
				this.write(inter);
			}
			f(seq[i]);
		}
	}

	private withPrecedence(precedence: Precedence, node: ExprNode): void {
		const oldPrecedence = this.context.precedence;
		this.context.precedence = precedence;
		this.visit(node);
		this.context.precedence = oldPrecedence;
	}

	private requireParens(precedence: Precedence, node: ExprNode): boolean {
		return this.getPrecedence(node) < precedence;
	}

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
	visit_Module(node: Extract<ModuleNode, { nodeType: "Module" }>): void {
		for (const stmt of node.body) {
			this.visit(stmt);
		}
	}

	visit_Interactive(
		node: Extract<ModuleNode, { nodeType: "Interactive" }>,
	): void {
		for (const stmt of node.body) {
			this.visit(stmt);
		}
	}

	visit_Expression(
		node: Extract<ModuleNode, { nodeType: "Expression" }>,
	): void {
		this.visit(node.body);
	}

	// Statement visitors
	visit_FunctionDef(
		node: Extract<StmtNode, { nodeType: "FunctionDef" }>,
	): void {
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

	visit_ClassDef(node: Extract<StmtNode, { nodeType: "ClassDef" }>): void {
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

	visit_Return(node: Extract<StmtNode, { nodeType: "Return" }>): void {
		this.fill("return");
		if (node.value) {
			this.write(" ");
			this.visit(node.value);
		}
	}

	visit_Assign(node: Extract<StmtNode, { nodeType: "Assign" }>): void {
		this.fill();
		this.interleave(" = ", (target) => this.visit(target), node.targets);
		this.write(" = ");
		this.visit(node.value);
	}

	visit_AugAssign(node: Extract<StmtNode, { nodeType: "AugAssign" }>): void {
		this.fill();
		this.visit(node.target);
		this.write(" ", this.getAugAssignOp(node.op), " ");
		this.visit(node.value);
	}

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

	visit_Pass(_node: Extract<StmtNode, { nodeType: "Pass" }>): void {
		this.fill("pass");
	}

	visit_Break(_node: Extract<StmtNode, { nodeType: "Break" }>): void {
		this.fill("break");
	}

	visit_Continue(_node: Extract<StmtNode, { nodeType: "Continue" }>): void {
		this.fill("continue");
	}

	visit_Delete(node: Extract<StmtNode, { nodeType: "Delete" }>): void {
		this.fill("del ");
		this.interleave(", ", (target) => this.visit(target), node.targets);
	}

	visit_Nonlocal(node: Extract<StmtNode, { nodeType: "Nonlocal" }>): void {
		this.fill("nonlocal ");
		this.interleave(", ", (name) => this.write(name), node.names);
	}

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

	visit_Match(node: Extract<StmtNode, { nodeType: "Match" }>): void {
		this.fill("match ");
		this.visit(node.subject);
		this.write(":");
		for (const case_ of node.cases) {
			this.visit(case_);
		}
	}

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
		for (const stmt of node.body) {
			this.visit(stmt);
		}
	}

	visit_Expr(node: Extract<StmtNode, { nodeType: "Expr" }>): void {
		this.fill();
		this.visit(node.value);
	}

	visit_Import(node: Extract<StmtNode, { nodeType: "Import" }>): void {
		this.fill("import ");
		this.interleave(", ", (alias) => this.visit(alias), node.names);
	}

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

	visit_Global(node: Extract<StmtNode, { nodeType: "Global" }>): void {
		this.fill("global ");
		this.interleave(", ", (name) => this.write(name), node.names);
	}

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

	visit_TryStar(node: Extract<StmtNode, { nodeType: "TryStar" }>): void {
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

	visit_Assert(node: Extract<StmtNode, { nodeType: "Assert" }>): void {
		this.fill("assert ");
		this.visit(node.test);
		if (node.msg) {
			this.write(", ");
			this.visit(node.msg);
		}
	}

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

	visit_AsyncFunctionDef(
		node: Extract<StmtNode, { nodeType: "AsyncFunctionDef" }>,
	): void {
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
	visit_BinOp(node: Extract<ExprNode, { nodeType: "BinOp" }>): void {
		const precedence = this.getBinOpPrecedence(node.op);
		const needParens = this.requireParens(precedence, node);

		if (needParens) this.write("(");
		this.withPrecedence(precedence, node.left);
		this.write(" ", this.getBinOpSymbol(node.op), " ");
		this.withPrecedence(precedence, node.right);
		if (needParens) this.write(")");
	}

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

	visit_UnaryOp(node: Extract<ExprNode, { nodeType: "UnaryOp" }>): void {
		const precedence = Precedence.FACTOR;
		const needParens = this.requireParens(precedence, node);

		if (needParens) this.write("(");
		this.write(this.getUnaryOpSymbol(node.op));
		if (node.op.nodeType === "Not") this.write(" ");
		this.withPrecedence(precedence, node.operand);
		if (needParens) this.write(")");
	}

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

	visit_NamedExpr(node: Extract<ExprNode, { nodeType: "NamedExpr" }>): void {
		const needParens = this.requireParens(Precedence.TEST, node);
		if (needParens) this.write("(");
		this.visit(node.target);
		this.write(" := ");
		this.visit(node.value);
		if (needParens) this.write(")");
	}

	visit_Lambda(node: Extract<ExprNode, { nodeType: "Lambda" }>): void {
		this.write("lambda");
		if (node.args.args.length > 0 || node.args.vararg || node.args.kwarg) {
			this.write(" ");
			this.visit_arguments(node.args);
		}
		this.write(": ");
		this.visit(node.body);
	}

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

	visit_Await(node: Extract<ExprNode, { nodeType: "Await" }>): void {
		this.write("await ");
		this.withPrecedence(Precedence.AWAIT, node.value);
	}

	visit_Yield(node: Extract<ExprNode, { nodeType: "Yield" }>): void {
		this.write("yield");
		if (node.value) {
			this.write(" ");
			this.visit(node.value);
		}
	}

	visit_YieldFrom(node: Extract<ExprNode, { nodeType: "YieldFrom" }>): void {
		this.write("yield from ");
		this.visit(node.value);
	}

	visit_Starred(node: Extract<ExprNode, { nodeType: "Starred" }>): void {
		this.write("*");
		this.visit(node.value);
	}

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

	visit_JoinedStr(node: Extract<ExprNode, { nodeType: "JoinedStr" }>): void {
		this.write('f"');
		for (const value of node.values) {
			if (value.nodeType === "Constant") {
				this.write(String(value.value));
			} else if (value.nodeType === "FormattedValue") {
				this.write("{");
				this.visit(value.value);
				if (value.format_spec) {
					this.write(":");
					this.visit(value.format_spec);
				}
				this.write("}");
			} else {
				this.visit(value);
			}
		}
		this.write('"');
	}

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
			this.visit(node.format_spec);
		}
		this.write("}");
	}

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

	visit_Keyword(node: Keyword): void {
		if (node.arg) {
			this.write(node.arg, "=");
		} else {
			this.write("**");
		}
		this.visit(node.value);
	}

	visit_Constant(node: Extract<ExprNode, { nodeType: "Constant" }>): void {
		this.write(this.formatConstant(node.value, node.kind));
	}

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

	private escapeString(value: string, quote: string): string {
		return value
			.replace(/\\/g, "\\\\")
			.replace(/\n/g, "\\n")
			.replace(/\r/g, "\\r")
			.replace(/\t/g, "\\t")
			.replace(new RegExp(`\\${quote}`, "g"), `\\${quote}`);
	}

	visit_Name(node: Extract<ExprNode, { nodeType: "Name" }>): void {
		this.write(node.id);
	}

	visit_Attribute(node: Extract<ExprNode, { nodeType: "Attribute" }>): void {
		this.visit(node.value);
		this.write(".", node.attr);
	}

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

	visit_List(node: Extract<ExprNode, { nodeType: "List" }>): void {
		this.write("[");
		this.interleave(", ", (elt) => this.visit(elt), node.elts);
		this.write("]");
	}

	visit_Tuple(node: Extract<ExprNode, { nodeType: "Tuple" }>): void {
		this.write("(");
		this.interleave(", ", (elt) => this.visit(elt), node.elts);
		if (node.elts.length === 1) {
			this.write(",");
		}
		this.write(")");
	}

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

	visit_Set(node: Extract<ExprNode, { nodeType: "Set" }>): void {
		this.write("{");
		this.interleave(", ", (elt) => this.visit(elt), node.elts);
		this.write("}");
	}

	visit_ListComp(node: Extract<ExprNode, { nodeType: "ListComp" }>): void {
		this.write("[");
		this.visit(node.elt);
		for (const generator of node.generators) {
			this.visit(generator);
		}
		this.write("]");
	}

	visit_SetComp(node: Extract<ExprNode, { nodeType: "SetComp" }>): void {
		this.write("{");
		this.visit(node.elt);
		for (const generator of node.generators) {
			this.visit(generator);
		}
		this.write("}");
	}

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

	visit_Comprehension(
		node: Extract<
			import("./types.js").Comprehension,
			{ nodeType: "Comprehension" }
		>,
	): void {
		this.write(" for ");
		this.visit(node.target);
		this.write(" in ");
		this.visit(node.iter);
		for (const if_ of node.ifs) {
			this.write(" if ");
			this.visit(if_);
		}
	}

	// Handle helper types
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

	visit_Alias(
		node: Extract<import("./types.js").Alias, { nodeType: "Alias" }>,
	): void {
		this.write(node.name);
		if (node.asname) {
			this.write(" as ");
			this.write(node.asname);
		}
	}

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

	visit_Arg(node: Arg): void {
		this.write(node.arg);
		if (node.annotation) {
			this.write(": ");
			this.visit(node.annotation);
		}
	}

	// Pattern visitors
	visit_MatchValue(
		node: Extract<import("./types.js").PatternNode, { nodeType: "MatchValue" }>,
	): void {
		this.visit(node.value);
	}

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

	visit_MatchStar(
		node: Extract<import("./types.js").PatternNode, { nodeType: "MatchStar" }>,
	): void {
		this.write("*");
		if (node.name) {
			this.write(node.name);
		}
	}

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

	visit_MatchOr(
		node: Extract<import("./types.js").PatternNode, { nodeType: "MatchOr" }>,
	): void {
		this.interleave(" | ", (pattern) => this.visit(pattern), node.patterns);
	}

	// Helper method for type parameters
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
