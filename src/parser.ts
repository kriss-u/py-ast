/**
 * Python Parser - Recursive Descent Parser for Python Source Code
 * Based on the Python ASDL grammar specification
 */

import { Lexer, type Token, TokenType } from "./lexer.js";
import type {
	Arg,
	Arguments,
	ASTNode,
	CmpOpNode,
	Comment,
	Comprehension,
	ExceptHandler,
	ExprNode,
	FormattedValue,
	JoinedStr,
	Keyword,
	Load,
	MatchCase,
	Module,
	OperatorNode,
	PatternNode,
	StmtNode,
	Store,
	Try,
	TryStar,
	TypeParamNode,
	UnaryOpNode,
	WithItem,
} from "./types.js";

export interface ParseOptions {
	filename?: string;
	comments?: boolean;
	feature_version?: number;
}

export interface ParseError extends Error {
	lineno: number;
	col_offset: number;
	end_lineno?: number;
	end_col_offset?: number;
}

export class Parser {
	private tokens: Token[];
	private current = 0;
	private includeComments: boolean;
	private lastNonCommentTokenLine = 0; // Track the line of the last non-comment, non-newline token
	private pendingComments: Comment[] = []; // Temporary storage for comments during expression parsing

	constructor(source: string, options: ParseOptions = {}) {
		const lexer = new Lexer(source);
		this.tokens = lexer.tokenize();
		this.includeComments = options.comments ?? false;

		// Filter out comments unless needed
		if (!this.includeComments) {
			this.tokens = this.tokens.filter(
				(token) => token.type !== TokenType.COMMENT,
			);
		}
	}

	parse(): Module {
		this.current = 0;
		return this.parseFileInput();
	}

	// ==== Top level parser ====

	private parseFileInput(): Module {
		const body: StmtNode[] = [];

		// Skip leading newlines
		while (this.match(TokenType.NEWLINE)) {
			// Skip
		}

		while (!this.isAtEnd()) {
			if (this.match(TokenType.NEWLINE)) {
				continue;
			}

			// Handle comments that were collected during token peeking
			if (this.includeComments && this.pendingComments.length > 0) {
				for (const comment of this.pendingComments) {
					// If this is an inline comment and we have a previous statement, attach it
					if (comment.inline && body.length > 0) {
						const lastStmt = body[body.length - 1];
						// Add the comment as metadata to the last statement
						if (!lastStmt.inlineComment) {
							lastStmt.inlineComment = comment;
						}
					} else {
						// For standalone comments, add as separate statement
						body.push(comment);
					}
				}
				// Clear pending comments after processing
				this.pendingComments = [];
			}

			// Parse comments as proper statement nodes when includeComments is enabled
			if (this.includeComments && this.check(TokenType.COMMENT)) {
				const comment = this.parseCommentStatement();

				// If this is an inline comment and we have a previous statement, attach it
				if (comment.inline && body.length > 0) {
					const lastStmt = body[body.length - 1];
					// Add the comment as metadata to the last statement
					if (!lastStmt.inlineComment) {
						lastStmt.inlineComment = comment;
					}
				} else {
					// For standalone comments, add as separate statement
					body.push(comment);
				}
				continue;
			}

			const stmt = this.parseStatement();
			if (stmt) {
				body.push(stmt);

				// Process any comments that were collected during statement parsing
				if (this.includeComments && this.pendingComments.length > 0) {
					for (const comment of this.pendingComments) {
						if (comment.inline) {
							// Attach inline comment to the statement we just parsed
							if (!stmt.inlineComment) {
								stmt.inlineComment = comment;
							}
						} else {
							// Add standalone comment as separate statement
							body.push(comment);
						}
					}
					// Clear pending comments after processing
					this.pendingComments = [];
				}
			}
		}

		// Handle any remaining pending comments after the main parsing loop
		if (this.includeComments && this.pendingComments.length > 0) {
			for (const comment of this.pendingComments) {
				if (comment.inline && body.length > 0) {
					// Attach inline comment to the last statement
					const lastStmt = body[body.length - 1];
					if (!lastStmt.inlineComment) {
						lastStmt.inlineComment = comment;
					}
				} else {
					// Add standalone comment as separate statement
					body.push(comment);
				}
			}
			// Clear pending comments after processing
			this.pendingComments = [];
		}

		const result: Module = {
			nodeType: "Module",
			body,
			lineno: 1,
			col_offset: 0,
		};

		// If comments are enabled, collect all comments and add them to the module
		if (this.includeComments) {
			result.comments = this.collectAllComments(result);
		}

		return result;
	}

	// Parse a comment as a statement node
	private parseCommentStatement(): Comment {
		const token = this.consume(TokenType.COMMENT, "Expected comment");

		// Check if this is an inline comment (on the same line as previous content)
		const isInline = token.lineno === this.lastNonCommentTokenLine;

		return {
			nodeType: "Comment",
			value: token.value,
			lineno: token.lineno,
			col_offset: token.col_offset,
			end_lineno: token.end_lineno,
			end_col_offset: token.end_col_offset,
			inline: isInline,
		};
	}

	// Collect all comments from the AST (both standalone and inline)
	private collectAllComments(module: Module): Comment[] {
		const comments: Comment[] = [];

		const collectFromBody = (body: StmtNode[]): void => {
			for (const stmt of body) {
				if (stmt.nodeType === "Comment") {
					comments.push(stmt);
				} else {
					// Check for inline comments attached to this statement
					if (stmt.inlineComment) {
						comments.push(stmt.inlineComment);
					}
					// Recursively collect from nested bodies
					this.collectFromStatement(stmt, comments);
				}
			}
		};

		collectFromBody(module.body);

		// Also include any pending comments from expression parsing
		comments.push(...this.pendingComments);

		return comments;
	}

	// Helper to collect comments from nested statement bodies
	private collectFromStatement(stmt: StmtNode, comments: Comment[]): void {
		switch (stmt.nodeType) {
			case "FunctionDef":
			case "AsyncFunctionDef":
				this.collectFromBody(stmt.body, comments);
				break;
			case "ClassDef":
				this.collectFromBody(stmt.body, comments);
				break;
			case "If":
				this.collectFromBody(stmt.body, comments);
				this.collectFromBody(stmt.orelse, comments);
				break;
			case "For":
			case "AsyncFor":
				this.collectFromBody(stmt.body, comments);
				this.collectFromBody(stmt.orelse, comments);
				break;
			case "While":
				this.collectFromBody(stmt.body, comments);
				this.collectFromBody(stmt.orelse, comments);
				break;
			case "With":
			case "AsyncWith":
				this.collectFromBody(stmt.body, comments);
				break;
			case "Try":
				this.collectFromBody(stmt.body, comments);
				if (stmt.handlers) {
					for (const handler of stmt.handlers) {
						this.collectFromBody(handler.body, comments);
					}
				}
				this.collectFromBody(stmt.orelse, comments);
				this.collectFromBody(stmt.finalbody, comments);
				break;
			case "Match":
				if (stmt.cases) {
					for (const case_ of stmt.cases) {
						this.collectFromBody(case_.body, comments);
					}
				}
				break;
		}
	}

	// Helper to collect comments from a statement body
	private collectFromBody(body: StmtNode[], comments: Comment[]): void {
		for (const stmt of body) {
			if (stmt.nodeType === "Comment") {
				comments.push(stmt);
			} else {
				if (stmt.inlineComment) {
					comments.push(stmt.inlineComment);
				}
				this.collectFromStatement(stmt, comments);
			}
		}
	} // ==== Statement parsers ====

	private parseStatement(): StmtNode | null {
		// Handle indentation
		if (this.check(TokenType.INDENT)) {
			// INDENT tokens should only appear after compound statements
			throw this.error("unexpected indent");
		}

		if (this.match(TokenType.DEDENT)) {
			return null;
		}

		// Check for decorators first
		if (this.check(TokenType.AT)) {
			return this.parseDecorated();
		}

		return this.parseSimpleStmt() || this.parseCompoundStmt();
	}

	private parseSimpleStmt(): StmtNode | null {
		const stmt = this.parseSmallStmt();

		// Handle multiple statements on one line
		while (this.match(TokenType.SEMI)) {
			if (!this.check(TokenType.NEWLINE) && !this.isAtEnd()) {
				// Additional statements on the same line would go here
				// For simplicity, we'll just parse the first one
				break;
			}
		}

		this.match(TokenType.NEWLINE); // Optional newline
		return stmt;
	}

	private parseSmallStmt(): StmtNode | null {
		const start = this.peek();

		// Check if this is a compound statement keyword - let parseCompoundStmt handle it
		if (
			this.check(TokenType.DEF) ||
			this.check(TokenType.CLASS) ||
			this.check(TokenType.IF) ||
			this.check(TokenType.WHILE) ||
			this.check(TokenType.FOR) ||
			this.check(TokenType.TRY) ||
			this.check(TokenType.WITH) ||
			this.check(TokenType.ASYNC) ||
			this.check(TokenType.MATCH)
		) {
			return null;
		}

		// Handle pass statement
		if (this.match(TokenType.PASS)) {
			return {
				nodeType: "Pass",
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle break statement
		if (this.match(TokenType.BREAK)) {
			return {
				nodeType: "Break",
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle continue statement
		if (this.match(TokenType.CONTINUE)) {
			return {
				nodeType: "Continue",
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle return statement
		if (this.match(TokenType.RETURN)) {
			let value: ExprNode | undefined;
			if (
				!this.check(TokenType.NEWLINE) &&
				!this.check(TokenType.SEMI) &&
				!this.isAtEnd()
			) {
				value = this.parseTestList();
			}
			return {
				nodeType: "Return",
				value,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle delete statement
		if (this.match(TokenType.DEL)) {
			const targets: ExprNode[] = [];
			targets.push(this.parseExpr());
			while (this.match(TokenType.COMMA)) {
				targets.push(this.parseExpr());
			}
			return {
				nodeType: "Delete",
				targets,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle global statement
		if (this.match(TokenType.GLOBAL)) {
			const names: string[] = [];
			names.push(
				this.consume(TokenType.NAME, "Expected name after 'global'").value,
			);
			while (this.match(TokenType.COMMA)) {
				names.push(
					this.consume(TokenType.NAME, "Expected name after ','").value,
				);
			}
			return {
				nodeType: "Global",
				names,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle nonlocal statement
		if (this.match(TokenType.NONLOCAL)) {
			const names: string[] = [];
			names.push(
				this.consume(TokenType.NAME, "Expected name after 'nonlocal'").value,
			);
			while (this.match(TokenType.COMMA)) {
				names.push(
					this.consume(TokenType.NAME, "Expected name after ','").value,
				);
			}
			return {
				nodeType: "Nonlocal",
				names,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle import statement
		if (this.match(TokenType.IMPORT)) {
			const names: { name: string; asname?: string }[] = [];

			do {
				let name = this.consume(TokenType.NAME, "Expected module name").value;
				// Handle dotted names like 'os.path'
				while (this.match(TokenType.DOT)) {
					name += `.${this.consume(TokenType.NAME, "Expected name after '.'").value}`;
				}

				let asname: string | undefined;
				if (this.match(TokenType.AS)) {
					asname = this.consume(
						TokenType.NAME,
						"Expected name after 'as'",
					).value;
				}

				names.push({ name, asname });
			} while (this.match(TokenType.COMMA));

			return {
				nodeType: "Import",
				names: names.map((n) => ({
					nodeType: "Alias",
					name: n.name,
					asname: n.asname,
					lineno: start.lineno,
					col_offset: start.col_offset,
				})),
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle from import statement
		if (this.match(TokenType.FROM)) {
			let level = 0;
			// Handle relative imports (.., ., ..., etc.)
			while (this.match(TokenType.DOT)) {
				level++;
			}

			// Handle ellipsis (...) as three dots
			if (this.match(TokenType.ELLIPSIS)) {
				level += 3;
			}

			let module: string | undefined;
			if (this.check(TokenType.NAME)) {
				module = this.advance().value;
				// Handle dotted module names
				while (this.match(TokenType.DOT)) {
					module += `.${this.consume(TokenType.NAME, "Expected name after '.'").value}`;
				}
			}

			this.consume(TokenType.IMPORT, "Expected 'import' after module name");

			const names: { name: string; asname?: string }[] = [];

			// Handle parenthesized import lists
			const hasParens = this.match(TokenType.LPAR);

			if (this.match(TokenType.STAR)) {
				names.push({ name: "*" });
			} else {
				// Parse the first name
				const firstName = this.consume(TokenType.NAME, "Expected name").value;
				let firstAsname: string | undefined;
				if (this.match(TokenType.AS)) {
					firstAsname = this.consume(
						TokenType.NAME,
						"Expected name after 'as'",
					).value;
				}
				names.push({ name: firstName, asname: firstAsname });

				// Parse additional names if there are commas
				while (this.match(TokenType.COMMA)) {
					// Skip any newlines after comma (for multiline imports)
					while (this.match(TokenType.NEWLINE)) {
						// Skip newlines
					}

					// Check if we've reached the end (trailing comma case)
					if (hasParens && this.check(TokenType.RPAR)) break;
					if (!hasParens && (this.check(TokenType.NEWLINE) || this.isAtEnd()))
						break;

					const name = this.consume(TokenType.NAME, "Expected name").value;
					let asname: string | undefined;
					if (this.match(TokenType.AS)) {
						asname = this.consume(
							TokenType.NAME,
							"Expected name after 'as'",
						).value;
					}
					names.push({ name, asname });
				}
			}

			if (hasParens) {
				this.consume(TokenType.RPAR, "Expected ')' after import list");
			}

			return {
				nodeType: "ImportFrom",
				module,
				names: names.map((n) => ({
					nodeType: "Alias",
					name: n.name,
					asname: n.asname,
					lineno: start.lineno,
					col_offset: start.col_offset,
				})),
				level,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle raise statement
		if (this.match(TokenType.RAISE)) {
			let exc: ExprNode | undefined;
			let cause: ExprNode | undefined;

			if (
				!this.check(TokenType.NEWLINE) &&
				!this.check(TokenType.SEMI) &&
				!this.check(TokenType.DEDENT) &&
				!this.check(TokenType.COMMENT) &&
				!this.isAtEnd()
			) {
				exc = this.parseTest();
				if (this.match(TokenType.FROM)) {
					cause = this.parseTest();
				}
			}

			return {
				nodeType: "Raise",
				exc,
				cause,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle assert statement
		if (this.match(TokenType.ASSERT)) {
			const test = this.parseTest();
			let msg: ExprNode | undefined;

			if (this.match(TokenType.COMMA)) {
				msg = this.parseTest();
			}

			return {
				nodeType: "Assert",
				test,
				msg,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Handle type alias statement (Python 3.12+)
		if (this.check(TokenType.NAME) && this.peek().value === "type") {
			const start = this.peek();
			this.advance(); // consume 'type'

			const nameToken = this.consume(
				TokenType.NAME,
				"Expected type alias name",
			).value;

			// Type parameters (optional)
			const type_params = this.parseTypeParams();

			this.consume(TokenType.EQUAL, "Expected '=' in type alias");
			const value = this.parseTest();

			return {
				nodeType: "TypeAlias",
				name: {
					nodeType: "Name",
					id: nameToken,
					ctx: { nodeType: "Store" },
					lineno: start.lineno,
					col_offset: start.col_offset,
				},
				type_params,
				value,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Expression statement (including assignments)
		const expr = this.parseTestListWithStar();

		// Check for assignment operators
		if (this.match(TokenType.EQUAL)) {
			// Regular assignment - handle multiple assignment
			const targets = [expr];
			this.validateAssignmentTarget(expr);
			let value = this.parseTestList();

			// Collect any comments that were gathered during value parsing
			const expressionComments: Comment[] = [];
			if (this.includeComments && this.pendingComments.length > 0) {
				expressionComments.push(...this.pendingComments);
				this.pendingComments = [];
			}

			// Check for chained assignments like x = y = z
			while (this.match(TokenType.EQUAL)) {
				this.validateAssignmentTarget(value);
				targets.push(value);
				value = this.parseTestList();

				// Collect any additional comments from chained assignment parsing
				if (this.includeComments && this.pendingComments.length > 0) {
					expressionComments.push(...this.pendingComments);
					this.pendingComments = [];
				}
			}

			const assignNode: StmtNode & { expressionComments?: Comment[] } = {
				nodeType: "Assign",
				targets,
				value,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};

			// Attach all collected expression comments
			if (expressionComments.length > 0) {
				// For now, attach the first inline comment as inlineComment
				// and store the rest as a special property
				const inlineComments = expressionComments.filter((c) => c.inline);
				const standaloneComments = expressionComments.filter((c) => !c.inline);

				if (inlineComments.length > 0) {
					assignNode.inlineComment = inlineComments[0];
				}

				// Store additional comments for unparsing
				if (inlineComments.length > 1 || standaloneComments.length > 0) {
					assignNode.expressionComments = expressionComments;
				}
			}

			return assignNode;
		} else if (this.matchAugAssign()) {
			// Augmented assignment
			this.validateAssignmentTarget(expr);
			const op = this.parseAugAssignOp();
			const value = this.parseTest();
			return {
				nodeType: "AugAssign",
				target: expr,
				op,
				value,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		} else if (this.match(TokenType.COLON)) {
			// Annotated assignment
			const annotation = this.parseTest();
			let value: ExprNode | undefined;

			if (this.match(TokenType.EQUAL)) {
				value = this.parseTestList();
			}

			return {
				nodeType: "AnnAssign",
				target: expr,
				annotation,
				value,
				simple: this.isSimpleTarget(expr) ? 1 : 0,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Expression statement
		return {
			nodeType: "Expr",
			value: expr,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseCompoundStmt(): StmtNode | null {
		const start = this.peek();

		// Handle decorators
		if (this.check(TokenType.AT)) {
			return this.parseDecorated();
		}

		if (this.match(TokenType.IF)) {
			return this.parseIfStmt(start);
		} else if (this.match(TokenType.WHILE)) {
			return this.parseWhileStmt(start);
		} else if (this.match(TokenType.FOR)) {
			return this.parseForStmt(start);
		} else if (this.match(TokenType.TRY)) {
			return this.parseTryStmt(start);
		} else if (this.match(TokenType.WITH)) {
			return this.parseWithStmt(start);
		} else if (this.match(TokenType.DEF)) {
			return this.parseFunctionDef(start);
		} else if (this.match(TokenType.CLASS)) {
			return this.parseClassDef(start);
		} else if (this.match(TokenType.ASYNC)) {
			return this.parseAsyncStmt(start);
		} else if (this.match(TokenType.MATCH)) {
			return this.parseMatchStmt(start);
		}

		return null;
	}

	private parseDecorated(): StmtNode | null {
		const decorators = this.parseDecorators();

		if (this.match(TokenType.DEF)) {
			return this.parseFunctionDef(this.previous(), decorators);
		} else if (this.match(TokenType.CLASS)) {
			return this.parseClassDef(this.previous(), decorators);
		} else if (this.match(TokenType.ASYNC)) {
			if (this.match(TokenType.DEF)) {
				return this.parseAsyncFunctionDef(this.previous(), decorators);
			}
		}

		// Handle type alias statement
		if (this.check(TokenType.NAME) && this.checkNext(TokenType.LSQB)) {
			// Possible type alias with type parameters
			const nameStart = this.peek();
			const nameToken = this.advance();

			// Parse type parameters
			const type_params = this.parseTypeParams();

			this.consume(TokenType.EQUAL, "Expected '=' in type alias");
			const value = this.parseTest();

			return {
				nodeType: "TypeAlias",
				name: {
					nodeType: "Name",
					id: nameToken.value,
					ctx: { nodeType: "Store" },
					lineno: nameToken.lineno,
					col_offset: nameToken.col_offset,
				},
				type_params,
				value,
				lineno: nameStart.lineno,
				col_offset: nameStart.col_offset,
			};
		}

		throw new Error("Invalid decorator target");
	}

	private parseDecorators(): ExprNode[] {
		const decorators: ExprNode[] = [];

		while (this.match(TokenType.AT)) {
			const decorator = this.parseTest();
			decorators.push(decorator);
			this.match(TokenType.NEWLINE);
		}

		return decorators;
	}

	private parseIfStmt(start: Token): StmtNode {
		const test = this.parseTest();
		this.consume(TokenType.COLON, "Expected ':' after if condition");
		const body = this.parseSuite();

		let orelse: StmtNode[] = [];

		if (this.match(TokenType.ELIF)) {
			// Convert elif to nested if-else
			orelse = [this.parseIfStmt(this.previous())];
		} else if (this.match(TokenType.ELSE)) {
			this.consume(TokenType.COLON, "Expected ':' after else");
			orelse = this.parseSuite();
		}

		return {
			nodeType: "If",
			test,
			body,
			orelse,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseWhileStmt(start: Token): StmtNode {
		const test = this.parseTest();
		this.consume(TokenType.COLON, "Expected ':' after while condition");
		const body = this.parseSuite();

		let orelse: StmtNode[] = [];
		if (this.match(TokenType.ELSE)) {
			this.consume(TokenType.COLON, "Expected ':' after else");
			orelse = this.parseSuite();
		}

		return {
			nodeType: "While",
			test,
			body,
			orelse,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseForStmt(start: Token): StmtNode {
		const target = this.parseExprList();
		this.consume(TokenType.IN, "Expected 'in' in for statement");
		const iter = this.parseTestList();
		this.consume(TokenType.COLON, "Expected ':' after for clause");
		const body = this.parseSuite();

		let orelse: StmtNode[] = [];
		if (this.match(TokenType.ELSE)) {
			this.consume(TokenType.COLON, "Expected ':' after else");
			orelse = this.parseSuite();
		}

		return {
			nodeType: "For",
			target,
			iter,
			body,
			orelse,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseFunctionDef(
		start: Token,
		decorators: ExprNode[] = [],
	): StmtNode {
		const name = this.consume(TokenType.NAME, "Expected function name").value;

		// Type parameters (Python 3.12+)
		const type_params = this.parseTypeParams();

		this.consume(TokenType.LPAR, "Expected '(' after function name");
		const args = this.parseParameters();
		this.consume(TokenType.RPAR, "Expected ')' after parameters");

		let returns: ExprNode | undefined;
		if (this.match(TokenType.RARROW)) {
			returns = this.parseTest();
		}

		this.consume(TokenType.COLON, "Expected ':' after function header");
		const body = this.parseSuite();

		return {
			nodeType: "FunctionDef",
			name,
			args,
			body,
			decorator_list: decorators,
			returns,
			type_params,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseAsyncFunctionDef(
		start: Token,
		decorators: ExprNode[] = [],
	): StmtNode {
		const name = this.consume(TokenType.NAME, "Expected function name").value;

		// Type parameters (Python 3.12+)
		const type_params = this.parseTypeParams();

		this.consume(TokenType.LPAR, "Expected '(' after function name");
		const args = this.parseParameters();
		this.consume(TokenType.RPAR, "Expected ')' after parameters");

		let returns: ExprNode | undefined;
		if (this.match(TokenType.RARROW)) {
			returns = this.parseTest();
		}

		this.consume(TokenType.COLON, "Expected ':' after function header");
		const body = this.parseSuite();

		return {
			nodeType: "AsyncFunctionDef",
			name,
			args,
			body,
			decorator_list: decorators,
			returns,
			type_params,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseClassDef(start: Token, decorators: ExprNode[] = []): StmtNode {
		const name = this.consume(TokenType.NAME, "Expected class name").value;

		// Type parameters (Python 3.12+)
		const type_params = this.parseTypeParams();

		const bases: ExprNode[] = [];
		const keywords: Keyword[] = [];

		if (this.match(TokenType.LPAR)) {
			if (!this.check(TokenType.RPAR)) {
				// Parse base classes and keyword arguments
				do {
					if (this.check(TokenType.RPAR)) break;

					// Check if this is a keyword argument (name=value)
					const savedPos = this.current;
					if (this.check(TokenType.NAME)) {
						const nameToken = this.advance();
						if (this.match(TokenType.EQUAL)) {
							// This is a keyword argument
							const value = this.parseTest();
							keywords.push({
								nodeType: "Keyword",
								arg: nameToken.value,
								value,
								lineno: nameToken.lineno,
								col_offset: nameToken.col_offset,
							});
						} else {
							// This is a base class, rewind and parse as expression
							this.current = savedPos;
							bases.push(this.parseTest());
						}
					} else {
						// Not a name, parse as base class expression
						bases.push(this.parseTest());
					}
				} while (this.match(TokenType.COMMA));
			}
			this.consume(TokenType.RPAR, "Expected ')' after class bases");
		}

		this.consume(TokenType.COLON, "Expected ':' after class header");
		const body = this.parseSuite();

		return {
			nodeType: "ClassDef",
			name,
			bases,
			keywords,
			body,
			decorator_list: decorators,
			type_params,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseTryStmt(start: Token): StmtNode {
		this.consume(TokenType.COLON, "Expected ':' after try");
		const body = this.parseSuite();

		const handlers: ExceptHandler[] = [];
		let orelse: StmtNode[] = [];
		let finalbody: StmtNode[] = [];

		// Parse except clauses
		let hasStarHandler = false;
		let hasRegularHandler = false;

		while (this.match(TokenType.EXCEPT)) {
			const handlerStart = this.previous();
			let type: ExprNode | undefined;
			let name: string | undefined;

			// Check for except* syntax
			if (this.match(TokenType.STAR)) {
				hasStarHandler = true;
				if (hasRegularHandler) {
					throw this.error(
						"cannot have both 'except' and 'except*' on the same 'try'",
					);
				}
				if (!this.check(TokenType.COLON)) {
					type = this.parseTest();
					if (this.match(TokenType.AS)) {
						name = this.consume(
							TokenType.NAME,
							"Expected name after 'as'",
						).value;
					}
				}
			} else {
				hasRegularHandler = true;
				if (hasStarHandler) {
					throw this.error(
						"cannot have both 'except' and 'except*' on the same 'try'",
					);
				}
				if (!this.check(TokenType.COLON)) {
					type = this.parseTest();
					if (this.match(TokenType.AS)) {
						name = this.consume(
							TokenType.NAME,
							"Expected name after 'as'",
						).value;
					}
				}
			}

			this.consume(TokenType.COLON, "Expected ':' after except clause");
			const handlerBody = this.parseSuite();

			handlers.push({
				nodeType: "ExceptHandler",
				type,
				name,
				body: handlerBody,
				lineno: handlerStart.lineno,
				col_offset: handlerStart.col_offset,
			});
		}

		if (this.match(TokenType.ELSE)) {
			this.consume(TokenType.COLON, "Expected ':' after else");
			orelse = this.parseSuite();
		}

		if (this.match(TokenType.FINALLY)) {
			this.consume(TokenType.COLON, "Expected ':' after finally");
			finalbody = this.parseSuite();
		}

		return {
			nodeType: hasStarHandler ? "TryStar" : "Try",
			body,
			handlers,
			orelse,
			finalbody,
			lineno: start.lineno,
			col_offset: start.col_offset,
		} as Try | TryStar;
	}

	private parseWithStmt(start: Token): StmtNode {
		const items: WithItem[] = [];

		// Parse with items
		do {
			const context_expr = this.parseTest();
			let optional_vars: ExprNode | undefined;

			if (this.match(TokenType.AS)) {
				optional_vars = this.parseExpr();
			}

			items.push({
				nodeType: "WithItem",
				context_expr,
				optional_vars,
			});
		} while (this.match(TokenType.COMMA));

		this.consume(TokenType.COLON, "Expected ':' after with clause");
		const body = this.parseSuite();

		return {
			nodeType: "With",
			items,
			body,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseAsyncStmt(start: Token): StmtNode {
		if (this.match(TokenType.DEF)) {
			// biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for object spreading
			const funcDef = this.parseFunctionDef(this.previous()) as any;
			return {
				...funcDef,
				nodeType: "AsyncFunctionDef",
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		} else if (this.match(TokenType.FOR)) {
			// biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for object spreading
			const forStmt = this.parseForStmt(this.previous()) as any;
			return {
				...forStmt,
				nodeType: "AsyncFor",
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		} else if (this.match(TokenType.WITH)) {
			// biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for object spreading
			const withStmt = this.parseWithStmt(this.previous()) as any;
			return {
				...withStmt,
				nodeType: "AsyncWith",
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		throw this.error("Invalid async statement");
	}

	private parseMatchStmt(start: Token): StmtNode {
		const subject = this.parseTest();
		this.consume(TokenType.COLON, "Expected ':' after match subject");

		// Match statements must always be multi-line with proper indentation
		this.consume(TokenType.NEWLINE, "Expected newline after match:");

		// Skip comment tokens and newlines that might appear before the indent
		// (These comments belong to the match statement level, not the case level)
		while (this.check(TokenType.COMMENT) || this.check(TokenType.NEWLINE)) {
			this.advance();
		}

		this.consume(TokenType.INDENT, "Expected indented block");

		const cases: MatchCase[] = [];

		while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
			if (this.match(TokenType.NEWLINE)) {
				continue;
			}

			// When includeComments is true, comments will be parsed as statements in parseSuite
			// For now, skip comments at the case level (this could be enhanced later)
			if (!this.includeComments) {
				while (this.check(TokenType.COMMENT)) {
					this.advance();
				}
			}

			if (this.match(TokenType.CASE)) {
				this.previous(); // consume case token
				const pattern = this.parsePattern();

				let guard: ExprNode | undefined;
				if (this.match(TokenType.IF)) {
					guard = this.parseTest();
				}

				this.consume(TokenType.COLON, "Expected ':' after case pattern");
				const body = this.parseSuite();

				cases.push({
					nodeType: "MatchCase",
					pattern,
					guard,
					body,
				});
			} else {
				throw this.error("Expected 'case' in match statement");
			}
		}

		this.consume(TokenType.DEDENT, "Expected dedent");

		return {
			nodeType: "Match",
			subject,
			cases,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parsePattern(): PatternNode {
		return this.parseOrPattern();
	}

	private parseOrPattern(): PatternNode {
		const patterns: PatternNode[] = [];
		const start = this.peek();

		patterns.push(this.parseBasicPattern());

		while (this.match(TokenType.VBAR)) {
			patterns.push(this.parseBasicPattern());
		}

		if (patterns.length === 1) {
			return patterns[0];
		}

		return {
			nodeType: "MatchOr",
			patterns,
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseBasicPattern(): PatternNode {
		const start = this.peek();

		// Check for expressions that could be class patterns (like int(), str(), etc.)
		if (this.check(TokenType.NAME)) {
			const nameToken = this.peek();

			// Look ahead to see if this is a function call pattern
			if (this.peekNext().type === TokenType.LPAR) {
				// Parse the class name
				const className = this.advance(); // consume the name
				this.advance(); // consume the (

				const patterns: PatternNode[] = [];
				const kwd_attrs: string[] = [];
				const kwd_patterns: PatternNode[] = [];

				if (!this.check(TokenType.RPAR)) {
					do {
						// Check for keyword patterns
						if (
							this.check(TokenType.NAME) &&
							this.peekNext().type === TokenType.EQUAL
						) {
							const kwdName = this.advance().value;
							this.advance(); // consume =
							const kwdPattern = this.parsePattern();
							kwd_attrs.push(kwdName);
							kwd_patterns.push(kwdPattern);
						} else {
							// Positional pattern
							patterns.push(this.parsePattern());
						}
					} while (this.match(TokenType.COMMA) && !this.check(TokenType.RPAR));
				}

				this.consume(TokenType.RPAR, "Expected ')' in class pattern");

				const cls: ExprNode = {
					nodeType: "Name",
					id: className.value,
					ctx: this.createLoad(),
					lineno: className.lineno,
					col_offset: className.col_offset,
				};

				return {
					nodeType: "MatchClass",
					cls,
					patterns,
					kwd_attrs,
					kwd_patterns,
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			}

			// Wildcard pattern (_)
			if (nameToken.value === "_") {
				this.advance(); // consume the _
				return {
					nodeType: "MatchAs",
					pattern: undefined,
					name: "_",
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			}

			// Regular name pattern (variable binding)
			this.advance(); // consume the name
			return {
				nodeType: "MatchAs",
				pattern: undefined,
				name: nameToken.value,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// List pattern [...]
		if (this.match(TokenType.LSQB)) {
			const patterns: PatternNode[] = [];

			if (!this.check(TokenType.RSQB)) {
				patterns.push(this.parsePattern());
				while (this.match(TokenType.COMMA)) {
					if (this.check(TokenType.RSQB)) break;
					patterns.push(this.parsePattern());
				}
			}

			this.consume(TokenType.RSQB, "Expected ']' after list pattern");

			return {
				nodeType: "MatchSequence",
				patterns,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Tuple pattern (...)
		if (this.match(TokenType.LPAR)) {
			const patterns: PatternNode[] = [];

			if (!this.check(TokenType.RPAR)) {
				patterns.push(this.parsePattern());
				while (this.match(TokenType.COMMA)) {
					if (this.check(TokenType.RPAR)) break;
					patterns.push(this.parsePattern());
				}
			}

			this.consume(TokenType.RPAR, "Expected ')' after tuple pattern");

			return {
				nodeType: "MatchSequence",
				patterns,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Dictionary pattern {...}
		if (this.match(TokenType.LBRACE)) {
			const keys: ExprNode[] = [];
			const patterns: PatternNode[] = [];
			let rest: string | undefined;

			if (!this.check(TokenType.RBRACE)) {
				do {
					if (this.match(TokenType.DOUBLESTAR)) {
						// **rest pattern
						rest = this.consume(
							TokenType.NAME,
							"Expected name after '**'",
						).value;
						break;
					}

					// Parse key expression
					const key = this.parseTest();
					this.consume(TokenType.COLON, "Expected ':' in mapping pattern");

					// Parse value pattern
					const pattern = this.parsePattern();

					keys.push(key);
					patterns.push(pattern);
				} while (this.match(TokenType.COMMA) && !this.check(TokenType.RBRACE));
			}

			this.consume(TokenType.RBRACE, "Expected '}' after mapping pattern");

			return {
				nodeType: "MatchMapping",
				keys,
				patterns,
				rest,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		if (
			this.match(
				TokenType.NUMBER,
				TokenType.STRING,
				TokenType.TRUE,
				TokenType.FALSE,
				TokenType.NONE,
			)
		) {
			const token = this.previous();
			// biome-ignore lint/suspicious/noExplicitAny: Value can be string, number, boolean, or null
			let value: any;

			switch (token.type) {
				case TokenType.NUMBER:
					value = this.parseNumber(token.value);
					break;
				case TokenType.STRING:
					value = this.parseString(token.value);
					break;
				case TokenType.TRUE:
					value = true;
					break;
				case TokenType.FALSE:
					value = false;
					break;
				case TokenType.NONE:
					value = null;
					break;
				default:
					value = token.value;
			}

			return {
				nodeType: "MatchValue",
				value: {
					nodeType: "Constant",
					value,
					lineno: token.lineno,
					col_offset: token.col_offset,
				},
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Wildcard pattern
		if (this.match(TokenType.STAR)) {
			let name: string | undefined;
			if (this.check(TokenType.NAME)) {
				name = this.advance().value;
			}

			return {
				nodeType: "MatchStar",
				name,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Default fallback - create a wildcard
		return {
			nodeType: "MatchAs",
			pattern: undefined,
			name: "_",
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	// ==== Expression parsers ====

	private parseTestList(): ExprNode {
		const expr = this.parseTest();

		if (this.match(TokenType.COMMA)) {
			const elts = [expr];

			// Handle trailing commas and additional elements
			while (
				!this.check(TokenType.NEWLINE) &&
				!this.isAtEnd() &&
				!this.check(TokenType.RPAR) &&
				!this.check(TokenType.RSQB) &&
				!this.check(TokenType.RBRACE)
			) {
				elts.push(this.parseTest());
				if (!this.match(TokenType.COMMA)) break;
			}

			return {
				nodeType: "Tuple",
				elts,
				ctx: this.createLoad(),
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseTest(): ExprNode {
		const expr = this.parseOrTest();

		if (this.match(TokenType.IF)) {
			const test = this.parseOrTest();
			this.consume(TokenType.ELSE, "Expected 'else' in conditional expression");
			const orelse = this.parseTest();

			return {
				nodeType: "IfExp",
				test,
				body: expr,
				orelse,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseArgument(): ExprNode {
		// Parse an argument that could be a generator expression
		const start = this.current;
		const expr = this.parseTest();

		// Check if this is a generator expression by looking for 'for' keyword
		if (this.check(TokenType.FOR)) {
			this.advance(); // consume 'for'
			const generators = this.parseComprehensionsAfterFor();

			return {
				nodeType: "GeneratorExp",
				elt: expr,
				generators,
				lineno: this.tokens[start].lineno,
				col_offset: this.tokens[start].col_offset,
			};
		}

		return expr;
	}

	private parseOrTest(): ExprNode {
		// Check for lambda expression first
		if (this.match(TokenType.LAMBDA)) {
			const start = this.previous();
			let args: Arguments;

			if (this.check(TokenType.COLON)) {
				// Lambda with no parameters
				args = {
					nodeType: "Arguments",
					posonlyargs: [],
					args: [],
					vararg: undefined,
					kwonlyargs: [],
					kw_defaults: [],
					kwarg: undefined,
					defaults: [],
				};
			} else {
				args = this.parseLambdaParameters();
			}

			this.consume(TokenType.COLON, "Expected ':' after lambda parameters");
			const body = this.parseTest();

			return {
				nodeType: "Lambda",
				args,
				body,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		const expr = this.parseAndTest();

		if (this.match(TokenType.OR)) {
			const values = [expr];

			do {
				values.push(this.parseAndTest());
			} while (this.match(TokenType.OR));

			return {
				nodeType: "BoolOp",
				op: { nodeType: "Or" },
				values,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseAndTest(): ExprNode {
		const expr = this.parseNotTest();

		// Check for named expression (walrus operator :=)
		if (this.match(TokenType.COLONEQUAL)) {
			const value = this.parseAndTest();
			return {
				nodeType: "NamedExpr",
				target: expr,
				value,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		if (this.match(TokenType.AND)) {
			const values = [expr];

			do {
				values.push(this.parseNotTest());
			} while (this.match(TokenType.AND));

			return {
				nodeType: "BoolOp",
				op: { nodeType: "And" },
				values,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseNotTest(): ExprNode {
		if (this.match(TokenType.NOT)) {
			const start = this.previous();
			const operand = this.parseNotTest();

			return {
				nodeType: "UnaryOp",
				op: { nodeType: "Not" },
				operand,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		return this.parseComparison();
	}

	private parseComparison(): ExprNode {
		const expr = this.parseExpr();

		if (this.matchComparison()) {
			const ops: CmpOpNode[] = [];
			const comparators: ExprNode[] = [];

			do {
				ops.push(this.parseCompOp());
				comparators.push(this.parseExpr());
			} while (this.matchComparison());

			return {
				nodeType: "Compare",
				left: expr,
				ops,
				comparators,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseExpr(): ExprNode {
		return this.parseOrExpr();
	}

	private parseOrExpr(): ExprNode {
		let expr = this.parseXorExpr();

		while (this.match(TokenType.VBAR)) {
			const op: OperatorNode = { nodeType: "BitOr" };
			const right = this.parseXorExpr();

			expr = {
				nodeType: "BinOp",
				left: expr,
				op,
				right,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseXorExpr(): ExprNode {
		let expr = this.parseAndExpr();

		while (this.match(TokenType.CIRCUMFLEX)) {
			const op: OperatorNode = { nodeType: "BitXor" };
			const right = this.parseAndExpr();

			expr = {
				nodeType: "BinOp",
				left: expr,
				op,
				right,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseAndExpr(): ExprNode {
		let expr = this.parseShiftExpr();

		while (this.match(TokenType.AMPER)) {
			const op: OperatorNode = { nodeType: "BitAnd" };
			const right = this.parseShiftExpr();

			expr = {
				nodeType: "BinOp",
				left: expr,
				op,
				right,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseShiftExpr(): ExprNode {
		let expr = this.parseArithExpr();

		while (this.match(TokenType.LEFTSHIFT, TokenType.RIGHTSHIFT)) {
			const opToken = this.previous();
			const op: OperatorNode =
				opToken.type === TokenType.LEFTSHIFT
					? { nodeType: "LShift" }
					: { nodeType: "RShift" };
			const right = this.parseArithExpr();

			expr = {
				nodeType: "BinOp",
				left: expr,
				op,
				right,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseArithExpr(): ExprNode {
		let expr = this.parseTerm();

		while (this.match(TokenType.PLUS, TokenType.MINUS)) {
			const opToken = this.previous();
			const op: OperatorNode =
				opToken.type === TokenType.PLUS
					? { nodeType: "Add" }
					: { nodeType: "Sub" };
			const right = this.parseTerm();

			expr = {
				nodeType: "BinOp",
				left: expr,
				op,
				right,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseTerm(): ExprNode {
		let expr = this.parseFactor();

		while (
			this.match(
				TokenType.STAR,
				TokenType.AT,
				TokenType.SLASH,
				TokenType.DOUBLESLASH,
				TokenType.PERCENT,
			)
		) {
			const opToken = this.previous();
			let op: OperatorNode;

			switch (opToken.type) {
				case TokenType.STAR:
					op = { nodeType: "Mult" };
					break;
				case TokenType.AT:
					op = { nodeType: "MatMult" };
					break;
				case TokenType.SLASH:
					op = { nodeType: "Div" };
					break;
				case TokenType.DOUBLESLASH:
					op = { nodeType: "FloorDiv" };
					break;
				case TokenType.PERCENT:
					op = { nodeType: "Mod" };
					break;
				default:
					throw this.error("Unexpected operator");
			}

			const right = this.parseFactor();

			expr = {
				nodeType: "BinOp",
				left: expr,
				op,
				right,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseFactor(): ExprNode {
		// Handle await expressions at factor level (unary)
		if (this.match(TokenType.AWAIT)) {
			const start = this.previous();
			const value = this.parseFactor();
			return {
				nodeType: "Await",
				value,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		if (this.match(TokenType.PLUS, TokenType.MINUS, TokenType.TILDE)) {
			const start = this.previous();
			let op: UnaryOpNode;

			switch (start.type) {
				case TokenType.PLUS:
					op = { nodeType: "UAdd" };
					break;
				case TokenType.MINUS:
					op = { nodeType: "USub" };
					break;
				case TokenType.TILDE:
					op = { nodeType: "Invert" };
					break;
				default:
					throw this.error("Unexpected unary operator");
			}

			const operand = this.parseFactor();

			return {
				nodeType: "UnaryOp",
				op,
				operand,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		return this.parsePower();
	}

	private parsePower(): ExprNode {
		let expr = this.parseAtomWithTrailers();

		if (this.match(TokenType.DOUBLESTAR)) {
			const op: OperatorNode = { nodeType: "Pow" };
			const right = this.parseFactor(); // Right associative

			expr = {
				nodeType: "BinOp",
				left: expr,
				op,
				right,
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseAtomWithTrailers(): ExprNode {
		let expr = this.parseAtom();

		// Handle subscripts, attributes, and function calls
		while (true) {
			if (this.match(TokenType.DOT)) {
				const attr = this.consume(
					TokenType.NAME,
					"Expected attribute name",
				).value;
				expr = {
					nodeType: "Attribute",
					value: expr,
					attr,
					ctx: this.createLoad(),
					lineno: expr.lineno || 1,
					col_offset: expr.col_offset || 0,
				};
			} else if (this.match(TokenType.LSQB)) {
				const slice = this.parseSubscriptList();
				this.consume(TokenType.RSQB, "Expected ']'");
				expr = {
					nodeType: "Subscript",
					value: expr,
					slice,
					ctx: this.createLoad(),
					lineno: expr.lineno || 1,
					col_offset: expr.col_offset || 0,
				};
			} else if (this.match(TokenType.LPAR)) {
				// Function call
				const args: ExprNode[] = [];
				const keywords: Keyword[] = [];

				if (!this.check(TokenType.RPAR)) {
					do {
						if (this.check(TokenType.RPAR)) break;

						// Check for keyword arguments
						if (this.check(TokenType.NAME) && this.checkNext(TokenType.EQUAL)) {
							const argName = this.advance().value;
							this.advance(); // consume '='
							const value = this.parseTest();
							keywords.push({
								nodeType: "Keyword",
								arg: argName,
								value,
								lineno: this.previous().lineno,
								col_offset: this.previous().col_offset,
							});
						} else if (this.match(TokenType.DOUBLESTAR)) {
							// **kwargs
							const value = this.parseTest();
							keywords.push({
								nodeType: "Keyword",
								arg: undefined,
								value,
								lineno: this.previous().lineno,
								col_offset: this.previous().col_offset,
							});
						} else if (this.match(TokenType.STAR)) {
							// *args
							const value = this.parseTest();
							args.push({
								nodeType: "Starred",
								value,
								ctx: this.createLoad(),
								lineno: this.previous().lineno,
								col_offset: this.previous().col_offset,
							});
						} else {
							const arg = this.parseArgument();
							args.push(arg);
						}
					} while (this.match(TokenType.COMMA));
				}

				this.consume(TokenType.RPAR, "Expected ')' after arguments");
				expr = {
					nodeType: "Call",
					func: expr,
					args,
					keywords,
					lineno: expr.lineno || 1,
					col_offset: expr.col_offset || 0,
				};
			} else {
				break;
			}
		}

		return expr;
	}

	private parseAtom(): ExprNode {
		const start = this.peek();

		// Handle yield expressions
		if (this.match(TokenType.YIELD)) {
			if (this.match(TokenType.FROM)) {
				const value = this.parseTest();
				return {
					nodeType: "YieldFrom",
					value,
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			} else {
				let value: ExprNode | undefined;
				if (
					!this.check(TokenType.NEWLINE) &&
					!this.check(TokenType.RPAR) &&
					!this.check(TokenType.RSQB) &&
					!this.check(TokenType.RBRACE) &&
					!this.check(TokenType.COMMA) &&
					!this.isAtEnd()
				) {
					value = this.parseTestList();
				}
				return {
					nodeType: "Yield",
					value,
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			}
		}

		if (this.match(TokenType.NAME)) {
			const token = this.previous();
			return {
				nodeType: "Name",
				id: token.value,
				ctx: this.createLoad(),
				lineno: token.lineno,
				col_offset: token.col_offset,
			};
		}

		if (this.match(TokenType.NUMBER)) {
			const token = this.previous();
			return {
				nodeType: "Constant",
				value: this.parseNumber(token.value),
				lineno: token.lineno,
				col_offset: token.col_offset,
			};
		}

		if (this.match(TokenType.STRING)) {
			const token = this.previous();
			const value = this.parseString(token.value);

			// Check if this is an f-string
			if (
				token.value.toLowerCase().startsWith('f"') ||
				token.value.toLowerCase().startsWith("f'")
			) {
				// Parse f-string with proper interpolation handling
				return this.parseFString(token);
			}

			// Determine the quote style from the original token
			const quoteStyle = this.getStringQuoteStyle(token.value);

			return {
				nodeType: "Constant",
				value,
				kind: quoteStyle,
				lineno: token.lineno,
				col_offset: token.col_offset,
			};
		}

		if (this.match(TokenType.TRUE)) {
			const token = this.previous();
			return {
				nodeType: "Constant",
				value: true,
				lineno: token.lineno,
				col_offset: token.col_offset,
			};
		}

		if (this.match(TokenType.FALSE)) {
			const token = this.previous();
			return {
				nodeType: "Constant",
				value: false,
				lineno: token.lineno,
				col_offset: token.col_offset,
			};
		}

		if (this.match(TokenType.NONE)) {
			const token = this.previous();
			return {
				nodeType: "Constant",
				value: null,
				lineno: token.lineno,
				col_offset: token.col_offset,
			};
		}

		if (this.match(TokenType.ELLIPSIS)) {
			const token = this.previous();
			return {
				nodeType: "Constant",
				value: "...", // Ellipsis representation
				lineno: token.lineno,
				col_offset: token.col_offset,
			};
		}

		if (this.match(TokenType.LPAR)) {
			if (this.match(TokenType.RPAR)) {
				// Empty tuple
				return {
					nodeType: "Tuple",
					elts: [],
					ctx: this.createLoad(),
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			}

			const expr = this.parseTestOrStarred();

			// Check for generator expression
			const isAsyncGenerator =
				this.check(TokenType.ASYNC) && this.checkNext(TokenType.FOR);
			const isGenerator = this.check(TokenType.FOR) || isAsyncGenerator;

			if (isGenerator) {
				let generators: Comprehension[];

				if (isAsyncGenerator) {
					// Handle async generator: consume ASYNC, then handle like normal but mark first as async
					this.advance(); // consume ASYNC
					this.consume(TokenType.FOR, "Expected 'for' after async");

					// Parse first comprehension manually with async=1
					const target = this.parseExprList();
					this.consume(TokenType.IN, "Expected 'in' in comprehension");
					const iter = this.parseOrTest();

					const ifs: ExprNode[] = [];
					while (this.match(TokenType.IF)) {
						ifs.push(this.parseOrTest());
					}

					const firstComprehension = {
						nodeType: "Comprehension" as const,
						target,
						iter,
						ifs,
						is_async: 1,
					};

					// Parse additional comprehensions using existing logic
					const additionalComprehensions: Comprehension[] = [];
					while (this.check(TokenType.FOR) || this.check(TokenType.ASYNC)) {
						let next_is_async = 0;
						if (this.check(TokenType.ASYNC)) {
							this.advance(); // consume 'async'
							next_is_async = 1;
						}

						if (!this.check(TokenType.FOR)) {
							break;
						}

						this.consume(TokenType.FOR, "Expected 'for' in comprehension");
						const nextTarget = this.parseExprList();
						this.consume(TokenType.IN, "Expected 'in' in comprehension");
						const nextIter = this.parseOrTest();

						const nextIfs: ExprNode[] = [];
						while (this.match(TokenType.IF)) {
							nextIfs.push(this.parseOrTest());
						}

						additionalComprehensions.push({
							nodeType: "Comprehension",
							target: nextTarget,
							iter: nextIter,
							ifs: nextIfs,
							is_async: next_is_async,
						});
					}

					generators = [firstComprehension, ...additionalComprehensions];
				} else {
					// Normal generator: consume FOR and use existing method
					this.advance(); // consume FOR
					generators = this.parseComprehensionsAfterFor();
				}

				this.consume(TokenType.RPAR, "Expected ')' after generator expression");

				return {
					nodeType: "GeneratorExp",
					elt: expr,
					generators,
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			}

			// Check for tuple
			if (this.match(TokenType.COMMA)) {
				const elts = [expr];

				while (!this.check(TokenType.RPAR) && !this.isAtEnd()) {
					elts.push(this.parseTestOrStarred());
					if (!this.match(TokenType.COMMA)) break;
				}

				this.consume(TokenType.RPAR, "Expected ')' after tuple");
				return {
					nodeType: "Tuple",
					elts,
					ctx: this.createLoad(),
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			}

			this.consume(TokenType.RPAR, "Expected ')' after expression");
			return expr;
		}

		if (this.match(TokenType.LSQB)) {
			return this.parseListOrListComp(start);
		}

		if (this.match(TokenType.LBRACE)) {
			return this.parseDictOrSetOrComp(start);
		}

		throw this.error("Unexpected token in expression");
	}

	// ==== Helper parsers ====

	private parseSuite(): StmtNode[] {
		// Handle comments that appear immediately after colon but before newline
		const postColonComments: Comment[] = [];
		if (this.includeComments) {
			while (this.check(TokenType.COMMENT)) {
				const comment = this.parseCommentStatement();
				postColonComments.push(comment);
			}
		}

		if (this.match(TokenType.NEWLINE)) {
			// Skip any additional newlines before the indent
			while (this.match(TokenType.NEWLINE)) {
				// Continue skipping newlines
			}

			// Skip any newlines before INDENT
			while (this.check(TokenType.NEWLINE)) {
				this.advance();
			}

			// When includeComments is enabled, collect any comments before INDENT
			const preIndentComments: Comment[] = [];
			if (this.includeComments) {
				while (this.check(TokenType.COMMENT)) {
					const comment = this.parseCommentStatement();
					preIndentComments.push(comment);
					// Skip newlines after comments
					while (this.check(TokenType.NEWLINE)) {
						this.advance();
					}
				}
			} // Require proper indentation - must have INDENT token for block structure
			if (!this.match(TokenType.INDENT)) {
				throw this.error("Expected indented block");
			}

			const stmts: StmtNode[] = [];

			// Add post-colon comments first
			stmts.push(...postColonComments);
			// Then add pre-indent comments
			stmts.push(...preIndentComments);

			while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
				if (this.match(TokenType.NEWLINE)) {
					continue;
				}

				// Handle comments that were collected during token peeking
				if (this.includeComments && this.pendingComments.length > 0) {
					for (const comment of this.pendingComments) {
						// If this is an inline comment and we have a previous statement, attach it
						if (comment.inline && stmts.length > 0) {
							const lastStmt = stmts[stmts.length - 1];
							// Add the comment as metadata to the last statement
							if (!lastStmt.inlineComment) {
								lastStmt.inlineComment = comment;
							}
						} else {
							// For standalone comments, add as separate statement
							stmts.push(comment);
						}
					}
					// Clear pending comments after processing
					this.pendingComments = [];
				}

				// Parse comments as statement nodes when includeComments is enabled (fallback for direct comment tokens)
				if (this.includeComments && this.check(TokenType.COMMENT)) {
					const comment = this.parseCommentStatement();

					// If this is an inline comment and we have a previous statement, attach it
					if (comment.inline && stmts.length > 0) {
						const lastStmt = stmts[stmts.length - 1];
						// Add the comment as metadata to the last statement
						if (!lastStmt.inlineComment) {
							lastStmt.inlineComment = comment;
						}
					} else {
						// For standalone comments, add as separate statement
						stmts.push(comment);
					}
					continue;
				}

				const stmt = this.parseStatement();
				if (stmt) {
					stmts.push(stmt);

					// Process any comments that were collected during statement parsing
					if (this.includeComments && this.pendingComments.length > 0) {
						for (const comment of this.pendingComments) {
							if (comment.inline) {
								// Attach inline comment to the statement we just parsed
								if (!stmt.inlineComment) {
									stmt.inlineComment = comment;
								}
							} else {
								// Add standalone comment as separate statement
								stmts.push(comment);
							}
						}
						// Clear pending comments after processing
						this.pendingComments = [];
					}
				}
			}

			// Consume DEDENT
			if (!this.match(TokenType.DEDENT)) {
				throw this.error("Expected dedent to close block");
			}

			return stmts;
		} else {
			// Simple statement on the same line
			const stmt = this.parseSimpleStmt();
			return stmt ? [stmt] : [];
		}
	}

	private parseParameters(): Arguments {
		const posonlyargs: Arg[] = [];
		const args: Arg[] = [];
		let vararg: Arg | undefined;
		const kwonlyargs: Arg[] = [];
		const kw_defaults: (ExprNode | null)[] = [];
		let kwarg: Arg | undefined;
		const defaults: ExprNode[] = [];

		let seenStar = false;

		if (!this.check(TokenType.RPAR)) {
			do {
				// Skip comments and newlines at the start of each parameter
				while (this.check(TokenType.COMMENT) || this.check(TokenType.NEWLINE)) {
					this.advance();
				}

				// Check for end of parameter list
				if (this.check(TokenType.RPAR)) {
					break;
				}

				if (this.match(TokenType.SLASH)) {
					// Positional-only separator
					// Move all current args to posonlyargs
					posonlyargs.push(...args);
					args.length = 0;
				} else if (this.match(TokenType.STAR)) {
					seenStar = true;

					if (this.check(TokenType.NAME)) {
						const name = this.advance().value;
						let annotation: ExprNode | undefined;

						if (this.match(TokenType.COLON)) {
							annotation = this.parseTestOrStarred();
						}

						vararg = {
							nodeType: "Arg",
							arg: name,
							annotation,
							lineno: this.previous().lineno,
							col_offset: this.previous().col_offset,
						};
					}
					// After *, all following params are keyword-only
				} else if (this.match(TokenType.DOUBLESTAR)) {
					const name = this.consume(
						TokenType.NAME,
						"Expected parameter name",
					).value;
					let annotation: ExprNode | undefined;

					if (this.match(TokenType.COLON)) {
						annotation = this.parseTestOrStarred();
					}

					kwarg = {
						nodeType: "Arg",
						arg: name,
						annotation,
						lineno: this.previous().lineno,
						col_offset: this.previous().col_offset,
					};
				} else {
					const name = this.consume(
						TokenType.NAME,
						"Expected parameter name",
					).value;
					let annotation: ExprNode | undefined;

					if (this.match(TokenType.COLON)) {
						annotation = this.parseTestOrStarred();
					}

					let defaultValue: ExprNode | undefined;
					if (this.match(TokenType.EQUAL)) {
						defaultValue = this.parseTest();
					}

					const arg: Arg = {
						nodeType: "Arg",
						arg: name,
						annotation,
						lineno: this.previous().lineno,
						col_offset: this.previous().col_offset,
					};

					if (seenStar) {
						// After *, these are keyword-only
						kwonlyargs.push(arg);
						kw_defaults.push(defaultValue || null);
					} else {
						// Regular positional arguments
						args.push(arg);
						if (defaultValue) {
							defaults.push(defaultValue);
						}
					}
				}
			} while (this.match(TokenType.COMMA) && !this.check(TokenType.RPAR));
		}

		return {
			nodeType: "Arguments",
			posonlyargs,
			args,
			vararg,
			kwonlyargs,
			kw_defaults,
			kwarg,
			defaults,
		};
	}

	private parseLambdaParameters(): Arguments {
		const args: Arg[] = [];
		const defaults: ExprNode[] = [];

		// Parse lambda parameters: name, name=default, name, name=default, ...
		do {
			if (!this.check(TokenType.NAME)) {
				break;
			}

			const name = this.advance().value;
			const arg: Arg = {
				nodeType: "Arg",
				arg: name,
				annotation: undefined,
				lineno: this.previous().lineno,
				col_offset: this.previous().col_offset,
			};

			args.push(arg);

			// Check for default value
			if (this.match(TokenType.EQUAL)) {
				const defaultValue = this.parseTest();
				defaults.push(defaultValue);
			}
		} while (this.match(TokenType.COMMA) && !this.check(TokenType.COLON));

		return {
			nodeType: "Arguments",
			posonlyargs: [],
			args,
			vararg: undefined,
			kwonlyargs: [],
			kw_defaults: [],
			kwarg: undefined,
			defaults,
		};
	}

	private parseExprList(): ExprNode {
		const expr = this.parseExpr();

		if (this.match(TokenType.COMMA)) {
			const elts = [expr];

			if (!this.check(TokenType.IN)) {
				elts.push(this.parseExpr());
				while (this.match(TokenType.COMMA)) {
					if (this.check(TokenType.IN)) break;
					elts.push(this.parseExpr());
				}
			}

			return {
				nodeType: "Tuple",
				elts,
				ctx: this.createStore(),
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	private parseSubscriptList(): ExprNode {
		const first = this.parseSubscript();

		if (this.match(TokenType.COMMA)) {
			const elts = [first];

			if (!this.check(TokenType.RSQB)) {
				elts.push(this.parseSubscript());
				while (this.match(TokenType.COMMA)) {
					if (this.check(TokenType.RSQB)) break;
					elts.push(this.parseSubscript());
				}
			}

			return {
				nodeType: "Tuple",
				elts,
				ctx: this.createLoad(),
				lineno: first.lineno || 1,
				col_offset: first.col_offset || 0,
			};
		}

		return first;
	}

	private parseSubscript(): ExprNode {
		if (this.match(TokenType.COLON)) {
			// Slice with no lower bound
			let upper: ExprNode | undefined;
			let step: ExprNode | undefined;

			if (
				!this.check(TokenType.COLON) &&
				!this.check(TokenType.RSQB) &&
				!this.check(TokenType.COMMA)
			) {
				upper = this.parseTest();
			}

			if (this.match(TokenType.COLON)) {
				if (!this.check(TokenType.RSQB) && !this.check(TokenType.COMMA)) {
					step = this.parseTest();
				}
			}

			return {
				nodeType: "Slice",
				lower: undefined,
				upper,
				step,
				lineno: this.previous().lineno,
				col_offset: this.previous().col_offset,
			};
		}

		const first = this.parseTestOrStarred();

		if (this.match(TokenType.COLON)) {
			// Slice
			let upper: ExprNode | undefined;
			let step: ExprNode | undefined;

			if (
				!this.check(TokenType.COLON) &&
				!this.check(TokenType.RSQB) &&
				!this.check(TokenType.COMMA)
			) {
				upper = this.parseTest();
			}

			if (this.match(TokenType.COLON)) {
				if (!this.check(TokenType.RSQB) && !this.check(TokenType.COMMA)) {
					step = this.parseTest();
				}
			}

			return {
				nodeType: "Slice",
				lower: first,
				upper,
				step,
				lineno: first.lineno || 1,
				col_offset: first.col_offset || 0,
			};
		}

		return first;
	}

	private parseListOrListComp(start: Token): ExprNode {
		if (this.match(TokenType.RSQB)) {
			// Empty list
			return {
				nodeType: "List",
				elts: [],
				ctx: this.createLoad(),
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		const first = this.parseTestOrStarred();

		// Check for list comprehension
		if (this.check(TokenType.FOR) || this.check(TokenType.ASYNC)) {
			const generators = this.parseComprehensions();
			this.consume(TokenType.RSQB, "Expected ']' after list comprehension");

			return {
				nodeType: "ListComp",
				elt: first,
				generators,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		// Regular list
		const elts = [first];
		while (this.match(TokenType.COMMA)) {
			// Skip comments after comma when includeComments is enabled
			if (this.includeComments) {
				while (this.check(TokenType.COMMENT)) {
					this.advance();
				}
			}

			if (this.check(TokenType.RSQB)) break;
			elts.push(this.parseTestOrStarred());
		}

		this.consume(TokenType.RSQB, "Expected ']' after list");

		return {
			nodeType: "List",
			elts,
			ctx: this.createLoad(),
			lineno: start.lineno,
			col_offset: start.col_offset,
		};
	}

	private parseDictOrSetOrComp(start: Token): ExprNode {
		if (this.match(TokenType.RBRACE)) {
			// Empty dict
			return {
				nodeType: "Dict",
				keys: [],
				values: [],
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}

		const first = this.parseTest();

		if (this.match(TokenType.COLON)) {
			// Dictionary
			const firstValue = this.parseTest();

			// Check for dict comprehension
			if (this.match(TokenType.FOR)) {
				const generators = this.parseComprehensionsAfterFor();
				this.consume(TokenType.RBRACE, "Expected '}' after dict comprehension");

				return {
					nodeType: "DictComp",
					key: first,
					value: firstValue,
					generators,
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			}

			// Regular dictionary
			const keys = [first];
			const values = [firstValue];

			while (this.match(TokenType.COMMA)) {
				if (this.check(TokenType.RBRACE)) break; // Handle trailing comma
				keys.push(this.parseTest());
				this.consume(TokenType.COLON, "Expected ':' in dictionary");
				values.push(this.parseTest());
			}

			this.consume(TokenType.RBRACE, "Expected '}' after dictionary");

			return {
				nodeType: "Dict",
				keys,
				values,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		} else {
			// Set
			// Check for set comprehension
			if (this.match(TokenType.FOR)) {
				const generators = this.parseComprehensionsAfterFor();
				this.consume(TokenType.RBRACE, "Expected '}' after set comprehension");

				return {
					nodeType: "SetComp",
					elt: first,
					generators,
					lineno: start.lineno,
					col_offset: start.col_offset,
				};
			}

			// Regular set
			const elts = [first];
			while (this.match(TokenType.COMMA)) {
				if (this.check(TokenType.RBRACE)) break;
				elts.push(this.parseTest());
			}

			this.consume(TokenType.RBRACE, "Expected '}' after set");

			return {
				nodeType: "Set",
				elts,
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}
	}

	private parseComprehensions(): Comprehension[] {
		const comprehensions: Comprehension[] = [];

		do {
			// Check for async comprehensions
			let is_async = 0;
			if (this.check(TokenType.ASYNC)) {
				this.advance(); // consume 'async'
				is_async = 1;
			}

			if (!this.check(TokenType.FOR)) {
				break;
			}

			this.consume(TokenType.FOR, "Expected 'for' in comprehension");
			const target = this.parseExprList();
			this.consume(TokenType.IN, "Expected 'in' in comprehension");
			const iter = this.parseOrTest();

			const ifs: ExprNode[] = [];
			while (this.match(TokenType.IF)) {
				ifs.push(this.parseOrTest());
			}

			comprehensions.push({
				nodeType: "Comprehension",
				target,
				iter,
				ifs,
				is_async,
			});
		} while (this.check(TokenType.FOR) || this.check(TokenType.ASYNC));

		return comprehensions;
	}

	private parseComprehensionsAfterFor(): Comprehension[] {
		const comprehensions: Comprehension[] = [];
		let is_async = 0; // First comprehension is not async for now

		// Parse first comprehension (FOR already consumed)
		const target = this.parseExprList();
		this.consume(TokenType.IN, "Expected 'in' in comprehension");
		const iter = this.parseOrTest();

		const ifs: ExprNode[] = [];
		while (this.match(TokenType.IF)) {
			ifs.push(this.parseOrTest());
		}

		comprehensions.push({
			nodeType: "Comprehension",
			target,
			iter,
			ifs,
			is_async,
		});

		// Parse additional comprehensions
		while (this.check(TokenType.FOR) || this.check(TokenType.ASYNC)) {
			// Check for async comprehensions
			is_async = 0;
			if (this.check(TokenType.ASYNC)) {
				this.advance(); // consume 'async'
				is_async = 1;
			}

			if (!this.check(TokenType.FOR)) {
				break;
			}

			this.consume(TokenType.FOR, "Expected 'for' in comprehension");
			const target = this.parseExprList();
			this.consume(TokenType.IN, "Expected 'in' in comprehension");
			const iter = this.parseOrTest();

			const ifs: ExprNode[] = [];
			while (this.match(TokenType.IF)) {
				ifs.push(this.parseOrTest());
			}

			comprehensions.push({
				nodeType: "Comprehension",
				target,
				iter,
				ifs,
				is_async,
			});
		}

		return comprehensions;
	}

	// ==== Utility methods ====

	private matchAugAssign(): boolean {
		return (
			this.check(TokenType.PLUSEQUAL) ||
			this.check(TokenType.MINEQUAL) ||
			this.check(TokenType.STAREQUAL) ||
			this.check(TokenType.SLASHEQUAL) ||
			this.check(TokenType.PERCENTEQUAL) ||
			this.check(TokenType.AMPEREQUAL) ||
			this.check(TokenType.VBAREQUAL) ||
			this.check(TokenType.CIRCUMFLEXEQUAL) ||
			this.check(TokenType.LEFTSHIFTEQUAL) ||
			this.check(TokenType.RIGHTSHIFTEQUAL) ||
			this.check(TokenType.DOUBLESTAREQUAL) ||
			this.check(TokenType.DOUBLESLASHEQUAL) ||
			this.check(TokenType.ATEQUAL)
		);
	}

	private parseAugAssignOp(): OperatorNode {
		const token = this.advance();

		switch (token.type) {
			case TokenType.PLUSEQUAL:
				return { nodeType: "Add" };
			case TokenType.MINEQUAL:
				return { nodeType: "Sub" };
			case TokenType.STAREQUAL:
				return { nodeType: "Mult" };
			case TokenType.SLASHEQUAL:
				return { nodeType: "Div" };
			case TokenType.PERCENTEQUAL:
				return { nodeType: "Mod" };
			case TokenType.AMPEREQUAL:
				return { nodeType: "BitAnd" };
			case TokenType.VBAREQUAL:
				return { nodeType: "BitOr" };
			case TokenType.CIRCUMFLEXEQUAL:
				return { nodeType: "BitXor" };
			case TokenType.LEFTSHIFTEQUAL:
				return { nodeType: "LShift" };
			case TokenType.RIGHTSHIFTEQUAL:
				return { nodeType: "RShift" };
			case TokenType.DOUBLESTAREQUAL:
				return { nodeType: "Pow" };
			case TokenType.DOUBLESLASHEQUAL:
				return { nodeType: "FloorDiv" };
			case TokenType.ATEQUAL:
				return { nodeType: "MatMult" };
			default:
				throw this.error("Invalid augmented assignment operator");
		}
	}

	private matchComparison(): boolean {
		return (
			this.check(TokenType.LESS) ||
			this.check(TokenType.GREATER) ||
			this.check(TokenType.EQEQUAL) ||
			this.check(TokenType.GREATEREQUAL) ||
			this.check(TokenType.LESSEQUAL) ||
			this.check(TokenType.NOTEQUAL) ||
			this.check(TokenType.IN) ||
			this.check(TokenType.IS) ||
			(this.check(TokenType.NOT) && this.checkNext(TokenType.IN)) ||
			(this.check(TokenType.IS) && this.checkNext(TokenType.NOT))
		);
	}

	private parseCompOp(): CmpOpNode {
		if (this.match(TokenType.LESS)) return { nodeType: "Lt" };
		if (this.match(TokenType.GREATER)) return { nodeType: "Gt" };
		if (this.match(TokenType.EQEQUAL)) return { nodeType: "Eq" };
		if (this.match(TokenType.GREATEREQUAL)) return { nodeType: "GtE" };
		if (this.match(TokenType.LESSEQUAL)) return { nodeType: "LtE" };
		if (this.match(TokenType.NOTEQUAL)) return { nodeType: "NotEq" };
		if (this.match(TokenType.IN)) return { nodeType: "In" };
		if (this.match(TokenType.IS)) {
			if (this.match(TokenType.NOT)) {
				return { nodeType: "IsNot" };
			}
			return { nodeType: "Is" };
		}
		if (this.match(TokenType.NOT)) {
			this.consume(TokenType.IN, "Expected 'in' after 'not'");
			return { nodeType: "NotIn" };
		}

		throw this.error("Expected comparison operator");
	}

	private isSimpleTarget(expr: ExprNode): boolean {
		return expr.nodeType === "Name";
	}

	private createLoad(): Load {
		return { nodeType: "Load" };
	}

	private createStore(): Store {
		return { nodeType: "Store" };
	}

	private parseNumber(value: string): number {
		// Handle different number formats
		if (value.startsWith("0x") || value.startsWith("0X")) {
			return parseInt(value, 16);
		} else if (value.startsWith("0o") || value.startsWith("0O")) {
			return parseInt(value.slice(2), 8);
		} else if (value.startsWith("0b") || value.startsWith("0B")) {
			return parseInt(value.slice(2), 2);
		} else if (
			value.includes(".") ||
			value.includes("e") ||
			value.includes("E")
		) {
			return parseFloat(value);
		} else {
			return parseInt(value, 10);
		}
	}

	private parseString(value: string): string {
		// Check for string prefixes (f, r, b, u, etc.)
		let prefix = "";
		let actualValue = value;

		// Extract prefix if present
		const prefixMatch = value.match(/^([fFrRbBuU]+)/);
		if (prefixMatch) {
			prefix = prefixMatch[1].toLowerCase();
			actualValue = value.slice(prefix.length);
		}

		// Remove quotes
		const quote = actualValue[0];
		let content = actualValue.slice(1, -1);

		// Handle triple quotes
		if (actualValue.startsWith('"""') || actualValue.startsWith("'''")) {
			content = actualValue.slice(3, -3);
		}

		// For raw strings, don't process escape sequences
		if (prefix.includes("r")) {
			return content;
		}

		// Basic escape sequence handling for non-raw strings
		content = content
			.replace(/\\n/g, "\n")
			.replace(/\\t/g, "\t")
			.replace(/\\r/g, "\r")
			.replace(/\\\\/g, "\\")
			.replace(new RegExp(`\\\\${quote}`, "g"), quote);

		return content;
	}

	private getStringQuoteStyle(tokenValue: string): string {
		// Extract any prefix (f, r, b, u, etc.)
		const prefixMatch = tokenValue.match(/^([fFrRbBuU]*)/);
		const prefix = prefixMatch ? prefixMatch[1] : "";
		const withoutPrefix = tokenValue.slice(prefix.length);

		// Determine quote style
		if (withoutPrefix.startsWith('"""')) {
			return `${prefix}"""`;
		} else if (withoutPrefix.startsWith("'''")) {
			return `${prefix}'''`;
		} else if (withoutPrefix.startsWith('"')) {
			return `${prefix}"`;
		} else if (withoutPrefix.startsWith("'")) {
			return `${prefix}'`;
		}

		// Default fallback to double quotes
		return `${prefix}"`;
	}

	private parseFString(token: Token): JoinedStr {
		// Extract the content inside the f-string quotes
		let content = token.value;

		// Determine and store the original quote style
		const quoteStyle = this.getStringQuoteStyle(token.value);

		// Remove f-string prefix and quotes
		if (content.toLowerCase().startsWith('f"')) {
			content = content.slice(2, -1); // Remove f" and "
		} else if (content.toLowerCase().startsWith("f'")) {
			content = content.slice(2, -1); // Remove f' and '
		}

		const values: ExprNode[] = [];
		let i = 0;
		let literalStart = 0;

		while (i < content.length) {
			if (content[i] === "{") {
				// Add any literal content before this expression
				if (i > literalStart) {
					const literalValue = content.slice(literalStart, i);
					if (literalValue) {
						values.push({
							nodeType: "Constant",
							value: literalValue,
							lineno: token.lineno,
							col_offset: token.col_offset + literalStart + 2, // +2 for f" prefix
						});
					}
				}

				// Parse the expression recursively
				const { exprText, nextPos } = this.parseExpressionInFString(content, i);
				const formattedValue = this.parseFormattedValue(exprText, token);
				values.push(formattedValue);

				i = nextPos;
				literalStart = i;
			} else {
				i++;
			}
		}

		// Add any remaining literal content
		if (literalStart < content.length) {
			const literalValue = content.slice(literalStart);
			if (literalValue) {
				values.push({
					nodeType: "Constant",
					value: literalValue,
					lineno: token.lineno,
					col_offset: token.col_offset + literalStart + 2,
				});
			}
		}

		return {
			nodeType: "JoinedStr",
			values,
			kind: quoteStyle,
			lineno: token.lineno,
			col_offset: token.col_offset,
		};
	}

	/**
	 * Parse an expression within an f-string, handling nested contexts properly.
	 * Returns the expression text and the position after the closing brace.
	 */
	private parseExpressionInFString(
		content: string,
		startPos: number,
	): { exprText: string; nextPos: number } {
		if (content[startPos] !== "{") {
			throw new Error(`Expected '{' at position ${startPos}`);
		}

		let i = startPos + 1;
		let braceLevel = 1;
		let result = "";

		while (i < content.length && braceLevel > 0) {
			const char = content[i];

			// Handle nested f-strings
			if (char === "f" && i + 1 < content.length) {
				const nextChar = content[i + 1];
				if (nextChar === '"' || nextChar === "'") {
					// Found nested f-string, parse it recursively
					const { fStringContent, nextPos } = this.parseNestedFString(
						content,
						i,
					);
					result += fStringContent;
					i = nextPos;
					continue;
				}
			}

			// Handle regular strings
			if (char === '"' || char === "'") {
				const { stringContent, nextPos } = this.parseStringLiteral(content, i);
				result += stringContent;
				i = nextPos;
				continue;
			}

			// Handle braces
			if (char === "{") {
				braceLevel++;
				result += char;
			} else if (char === "}") {
				braceLevel--;
				if (braceLevel > 0) {
					result += char;
				}
			} else {
				result += char;
			}

			i++;
		}

		if (braceLevel !== 0) {
			throw new Error(`Unmatched '{' in f-string at position ${startPos}`);
		}

		return { exprText: result, nextPos: i };
	}

	/**
	 * Parse a nested f-string within an expression.
	 */
	private parseNestedFString(
		content: string,
		startPos: number,
	): { fStringContent: string; nextPos: number } {
		const quote = content[startPos + 1];
		let i = startPos + 2; // Skip 'f' and quote
		let braceLevel = 0;
		let result = content.slice(startPos, startPos + 2); // Include 'f' and opening quote

		while (i < content.length) {
			const char = content[i];

			if (char === "{") {
				braceLevel++;
				result += char;
			} else if (char === "}") {
				braceLevel--;
				result += char;
			} else if (char === quote && braceLevel === 0) {
				result += char;
				return { fStringContent: result, nextPos: i + 1 };
			} else {
				result += char;
			}

			i++;
		}

		throw new Error(`Unterminated f-string starting at position ${startPos}`);
	}

	/**
	 * Parse a regular string literal within an expression.
	 */
	private parseStringLiteral(
		content: string,
		startPos: number,
	): { stringContent: string; nextPos: number } {
		const quote = content[startPos];
		let i = startPos + 1;
		let escaped = false;
		let result = quote;

		while (i < content.length) {
			const char = content[i];

			if (escaped) {
				escaped = false;
				result += char;
			} else if (char === "\\") {
				escaped = true;
				result += char;
			} else if (char === quote) {
				result += char;
				return { stringContent: result, nextPos: i + 1 };
			} else {
				result += char;
			}

			i++;
		}

		throw new Error(`Unterminated string starting at position ${startPos}`);
	}

	private parseFormattedValue(exprText: string, token: Token): FormattedValue {
		// Split expression and format spec if present
		let expression = exprText;
		let formatSpec: ExprNode | undefined;
		let conversion = -1;

		// Check for conversion specifiers (!r, !s, !a)
		const conversionMatch = expression.match(/^(.+?)!(r|s|a)(?::(.*))?$/);
		if (conversionMatch) {
			expression = conversionMatch[1];
			const conversionType = conversionMatch[2];
			conversion =
				conversionType === "r" ? 114 : conversionType === "s" ? 115 : 97;

			if (conversionMatch[3]) {
				// Has format spec after conversion
				formatSpec = {
					nodeType: "JoinedStr",
					values: [
						{
							nodeType: "Constant",
							value: conversionMatch[3],
							lineno: token.lineno,
							col_offset: token.col_offset,
						},
					],
					lineno: token.lineno,
					col_offset: token.col_offset,
				};
			}
		} else {
			// Check for format spec without conversion
			const formatMatch = expression.match(/^(.+?):(.*)$/);
			if (formatMatch) {
				expression = formatMatch[1];
				formatSpec = {
					nodeType: "JoinedStr",
					values: [
						{
							nodeType: "Constant",
							value: formatMatch[2],
							lineno: token.lineno,
							col_offset: token.col_offset,
						},
					],
					lineno: token.lineno,
					col_offset: token.col_offset,
				};
			}
		}

		// Parse the expression using a mini-parser
		const exprAst = this.parseExpressionFromString(expression.trim(), token);

		return {
			nodeType: "FormattedValue",
			value: exprAst,
			conversion,
			format_spec: formatSpec,
			lineno: token.lineno,
			col_offset: token.col_offset,
		};
	}

	private parseExpressionFromString(exprText: string, token: Token): ExprNode {
		try {
			// Create a mini-lexer/parser for the expression
			const tempParser = new Parser(exprText);
			const expr = tempParser.parseExpr();

			return expr;
		} catch (_error) {
			// Fallback: treat as a simple name if parsing fails
			return {
				nodeType: "Name",
				id: exprText,
				ctx: { nodeType: "Load" },
				lineno: token.lineno,
				col_offset: token.col_offset,
			};
		}
	}

	// ==== Parser utilities ====

	private match(...types: TokenType[]): boolean {
		for (const type of types) {
			if (this.check(type)) {
				this.advance();
				return true;
			}
		}
		return false;
	}

	private check(type: TokenType): boolean {
		if (this.isAtEnd()) return false;
		const token = this.peek();
		return token.type === type;
	}

	// Helper method to peek while skipping comments

	private checkNext(type: TokenType): boolean {
		if (this.current + 1 >= this.tokens.length) return false;
		return this.tokens[this.current + 1].type === type;
	}

	private isAtEnd(): boolean {
		// When parsing comments as statement nodes, check the actual current token
		const token = this.peek();
		return token.type === TokenType.EOF;
	}

	private peek(): Token {
		// Skip over comment tokens and collect them
		let currentIndex = this.current;
		while (
			currentIndex < this.tokens.length &&
			this.tokens[currentIndex].type === TokenType.COMMENT
		) {
			// Create comment node directly without using parseCommentStatement to avoid recursion
			const commentToken = this.tokens[currentIndex];
			const comment: Comment = {
				nodeType: "Comment",
				value: commentToken.value,
				inline: commentToken.lineno === this.lastNonCommentTokenLine,
				lineno: commentToken.lineno,
				col_offset: commentToken.col_offset,
			};
			this.pendingComments.push(comment);
			// Advance past this comment token
			currentIndex++;
			this.current = currentIndex;
		}

		if (this.current >= this.tokens.length) {
			// Return EOF token if we've gone past the end
			return {
				type: TokenType.EOF,
				value: "",
				lineno: this.tokens[this.tokens.length - 1]?.lineno || 1,
				col_offset: this.tokens[this.tokens.length - 1]?.col_offset || 0,
				end_lineno: this.tokens[this.tokens.length - 1]?.end_lineno || 1,
				end_col_offset:
					this.tokens[this.tokens.length - 1]?.end_col_offset || 0,
			};
		}

		return this.tokens[this.current];
	}

	private peekNext(): Token {
		if (this.current + 1 >= this.tokens.length) {
			// Return EOF token if we've gone past the end
			return {
				type: TokenType.EOF,
				value: "",
				lineno: this.tokens[this.tokens.length - 1]?.lineno || 1,
				col_offset: this.tokens[this.tokens.length - 1]?.col_offset || 0,
				end_lineno: this.tokens[this.tokens.length - 1]?.end_lineno || 1,
				end_col_offset:
					this.tokens[this.tokens.length - 1]?.end_col_offset || 0,
			};
		}

		return this.tokens[this.current + 1];
	}

	private advance(): Token {
		if (!this.isAtEnd()) {
			this.current++;
		}
		const token = this.previous();

		// Track the line number of non-comment, non-newline tokens
		if (token.type !== TokenType.COMMENT && token.type !== TokenType.NEWLINE) {
			this.lastNonCommentTokenLine = token.end_lineno || token.lineno;
		}

		return token;
	}

	private previous(): Token {
		return this.tokens[this.current - 1];
	}

	private consume(type: TokenType, message: string): Token {
		if (this.check(type)) {
			return this.advance();
		}
		throw this.error(message);
	}

	private error(message: string): ParseError {
		const token = this.peek();
		const error = new Error(
			`${message} at line ${token.lineno}, column ${token.col_offset}`,
		) as ParseError;
		error.lineno = token.lineno;
		error.col_offset = token.col_offset;
		error.end_lineno = token.end_lineno;
		error.end_col_offset = token.end_col_offset;
		return error;
	}

	private validateAssignmentTarget(expr: ExprNode): void {
		switch (expr.nodeType) {
			case "Name":
			case "Attribute":
			case "Subscript":
			case "List":
			case "Tuple":
				// These are valid assignment targets
				break;
			case "Starred":
				// Starred expressions are valid in assignment contexts
				this.validateAssignmentTarget(expr.value);
				break;
			case "Constant":
				throw this.error(`cannot assign to literal`);
			case "BinOp":
			case "UnaryOp":
			case "Call":
			case "Compare":
				throw this.error(`cannot assign to expression`);
			default:
				throw this.error(`cannot assign to ${expr.nodeType}`);
		}

		// For containers, validate all elements
		if (expr.nodeType === "List" || expr.nodeType === "Tuple") {
			for (const elt of expr.elts) {
				this.validateAssignmentTarget(elt);
			}
		}
	}

	private parseTestOrStarred(): ExprNode {
		if (this.match(TokenType.STAR)) {
			const start = this.previous();
			const value = this.parseExpr();
			return {
				nodeType: "Starred",
				value,
				ctx: this.createLoad(),
				lineno: start.lineno,
				col_offset: start.col_offset,
			};
		}
		return this.parseTest();
	}

	private parseTestListWithStar(): ExprNode {
		const expr = this.parseTestOrStarred();

		if (this.match(TokenType.COMMA)) {
			const elts = [expr];

			// Handle trailing commas and additional elements
			while (
				!this.check(TokenType.NEWLINE) &&
				!this.isAtEnd() &&
				!this.check(TokenType.RPAR) &&
				!this.check(TokenType.RSQB) &&
				!this.check(TokenType.RBRACE)
			) {
				elts.push(this.parseTestOrStarred());
				if (!this.match(TokenType.COMMA)) break;
			}

			return {
				nodeType: "Tuple",
				elts,
				ctx: this.createLoad(),
				lineno: expr.lineno || 1,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	// ==== Type parameter parsing ====

	private parseTypeParams(): TypeParamNode[] {
		const params: TypeParamNode[] = [];

		if (!this.match(TokenType.LSQB)) {
			return params;
		}

		do {
			const start = this.peek();

			// Check for ParamSpec (**P)
			if (this.match(TokenType.DOUBLESTAR)) {
				const name = this.consume(
					TokenType.NAME,
					"Expected parameter name after '**'",
				).value;
				let default_value: ExprNode | undefined;

				if (this.match(TokenType.EQUAL)) {
					default_value = this.parseTestOrStarred();
				}

				params.push({
					nodeType: "ParamSpec",
					name,
					default_value,
					lineno: start.lineno,
					col_offset: start.col_offset,
				});
			}
			// Check for TypeVarTuple (*Ts)
			else if (this.match(TokenType.STAR)) {
				const name = this.consume(
					TokenType.NAME,
					"Expected parameter name after '*'",
				).value;
				let default_value: ExprNode | undefined;

				if (this.match(TokenType.EQUAL)) {
					default_value = this.parseTestOrStarred();
				}

				params.push({
					nodeType: "TypeVarTuple",
					name,
					default_value,
					lineno: start.lineno,
					col_offset: start.col_offset,
				});
			}
			// Regular TypeVar (T, T: bound, T = default)
			else {
				const name = this.consume(
					TokenType.NAME,
					"Expected type parameter name",
				).value;
				let bound: ExprNode | undefined;
				let default_value: ExprNode | undefined;

				// Parse bound (T: SomeBound)
				if (this.match(TokenType.COLON)) {
					bound = this.parseTest();
				}

				// Parse default value (T = SomeDefault)
				if (this.match(TokenType.EQUAL)) {
					default_value = this.parseTestOrStarred();
				}

				params.push({
					nodeType: "TypeVar",
					name,
					bound,
					default_value,
					lineno: start.lineno,
					col_offset: start.col_offset,
				});
			}
		} while (this.match(TokenType.COMMA));

		this.consume(TokenType.RSQB, "Expected ']' after type parameters");
		return params;
	}
}

// ==== Main parse functions ====

/**
 * Parse Python source code from a string
 */
export function parse(source: string, options: ParseOptions = {}): Module {
	const parser = new Parser(source, options);
	return parser.parse();
}

/**
 * Parse Python source code from a file
 * Note: This is for Node.js environments. In browsers, you'll need to read the file content first.
 */
export function parseFile(
	_filename: string,
	_options: ParseOptions = {},
): Module {
	// This would need to be implemented based on the environment
	// For now, just provide the interface
	throw new Error(
		"parseFile not implemented - read file content and use parse() instead",
	);
}

// ==== Additional utility functions ====

// biome-ignore lint/suspicious/noExplicitAny: Function evaluates Python literals which can be any type
export function literalEval(source: string): any {
	// For literal evaluation, we just parse the source and evaluate the first expression
	const ast = parse(source);

	// Find the first expression statement
	for (const stmt of ast.body) {
		if (stmt.nodeType === "Expr") {
			return evaluateLiteral(stmt.value);
		}
	}

	throw new Error("No expression found to evaluate");
}

// biome-ignore lint/suspicious/noExplicitAny: Function evaluates Python literals which can be any type
function evaluateLiteral(node: ExprNode): any {
	switch (node.nodeType) {
		case "Constant":
			return node.value;
		case "List":
			return node.elts.map(evaluateLiteral);
		case "Tuple":
			return node.elts.map(evaluateLiteral);
		case "Dict": {
			// biome-ignore lint/suspicious/noExplicitAny: Dictionary values can be any type
			const result: Record<string, any> = {};
			for (let i = 0; i < node.keys.length; i++) {
				const key = node.keys[i];
				if (key === null) {
					throw new Error("Cannot evaluate dict unpacking in literal");
				}
				const keyValue = evaluateLiteral(key);
				const value = evaluateLiteral(node.values[i]);
				result[keyValue] = value;
			}
			return result;
		}
		case "Set":
			return new Set(node.elts.map(evaluateLiteral));
		case "UnaryOp":
			if (node.op.nodeType === "UAdd") {
				return +evaluateLiteral(node.operand);
			} else if (node.op.nodeType === "USub") {
				return -evaluateLiteral(node.operand);
			}
			break;
		case "BinOp":
			if (node.op.nodeType === "Add") {
				return evaluateLiteral(node.left) + evaluateLiteral(node.right);
			} else if (node.op.nodeType === "Sub") {
				return evaluateLiteral(node.left) - evaluateLiteral(node.right);
			}
			break;
	}

	throw new Error(`Cannot evaluate ${node.nodeType} in literal context`);
}

export function copyLocation(newNode: ASTNode, oldNode: ASTNode): ASTNode {
	newNode.lineno = oldNode.lineno;
	newNode.col_offset = oldNode.col_offset;
	newNode.end_lineno = oldNode.end_lineno;
	newNode.end_col_offset = oldNode.end_col_offset;
	return newNode;
}

export function fixMissingLocations(node: ASTNode): ASTNode {
	function fix(
		// biome-ignore lint/suspicious/noExplicitAny: Supposed to be any
		node: any,
		parentLineno = 1,
		parentColOffset = 0,
		parentEndLineno = 1,
		parentEndColOffset = 0,
	): void {
		if (!node || typeof node !== "object") return;

		// Set missing location attributes from parent
		if (node.lineno === undefined && "lineno" in node) {
			node.lineno = parentLineno;
		}
		if (node.col_offset === undefined && "col_offset" in node) {
			node.col_offset = parentColOffset;
		}
		if (node.end_lineno === undefined && "end_lineno" in node) {
			node.end_lineno = parentEndLineno;
		}
		if (node.end_col_offset === undefined && "end_col_offset" in node) {
			node.end_col_offset = parentEndColOffset;
		}

		// Recursively fix child nodes
		for (const [, value] of Object.entries(node)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					fix(
						item,
						node.lineno || parentLineno,
						node.col_offset || parentColOffset,
						node.end_lineno || parentEndLineno,
						node.end_col_offset || parentEndColOffset,
					);
				}
			} else if (value && typeof value === "object" && "nodeType" in value) {
				fix(
					value,
					node.lineno || parentLineno,
					node.col_offset || parentColOffset,
					node.end_lineno || parentEndLineno,
					node.end_col_offset || parentEndColOffset,
				);
			}
		}
	}

	fix(node);
	return node;
}

export function incrementLineno(node: ASTNode, n: number = 1): ASTNode {
	// biome-ignore lint/suspicious/noExplicitAny: Function needs to traverse any AST node structure
	function increment(node: any): void {
		if (!node || typeof node !== "object") return;

		// Increment line numbers
		if (typeof node.lineno === "number") {
			node.lineno += n;
		}
		if (typeof node.end_lineno === "number") {
			node.end_lineno += n;
		}

		// Recursively increment child nodes
		for (const [, value] of Object.entries(node)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					increment(item);
				}
			} else if (value && typeof value === "object") {
				increment(value);
			}
		}
	}

	increment(node);
	return node;
}
