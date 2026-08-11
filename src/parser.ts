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

/**
 * Options controlling how {@link parse} lexes and parses Python source.
 */
export interface ParseOptions {
	/** Source filename to associate with parse errors and the resulting AST (informational only). */
	filename?: string;
	/** When true, comments are lexed and attached to the AST (as `Comment` nodes / `inlineComment`) instead of being discarded. */
	comments?: boolean;
	/** Target Python feature version; currently unused but reserved for future version-gated syntax. */
	feature_version?: number;
}

/**
 * Error thrown for a Python syntax error encountered during parsing.
 * Extends `Error` with the source position of the offending token.
 */
export interface ParseError extends Error {
	/** 1-based line number of the token that triggered the error. */
	lineno: number;
	/** 0-based column offset of the token that triggered the error. */
	col_offset: number;
	/** End line number of the offending token, if known. */
	end_lineno?: number;
	/** End column offset of the offending token, if known. */
	end_col_offset?: number;
}

/**
 * Recursive-descent parser that turns a token stream (produced by {@link Lexer})
 * into a Python AST rooted at a {@link Module} node, mirroring the shape of
 * CPython's `ast` module as defined in the project's ASDL grammar.
 *
 * Each `parseX` method corresponds to one grammar production and consumes
 * exactly the tokens for that production, leaving the cursor positioned at
 * the first unconsumed token.
 */
export class Parser {
	private tokens: Token[];
	private current = 0;
	private includeComments: boolean;
	private lastNonCommentTokenLine = 0; // Track the line of the last non-comment, non-newline token
	private pendingComments: Comment[] = []; // Temporary storage for comments during expression parsing

	/**
	 * Lexes `source` and prepares the parser to consume the resulting tokens.
	 * @param source Python source code to tokenize.
	 * @param options Parsing options; see {@link ParseOptions}.
	 * @throws Error (or a lexer-specific error) if `source` cannot be tokenized.
	 */
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

	/**
	 * Parses the full token stream into a {@link Module} node (the `file_input` grammar rule).
	 * @returns The root `Module` AST node.
	 * @throws {ParseError} On any syntax error in the source.
	 */
	parse(): Module {
		this.current = 0;
		return this.parseFileInput();
	}

	// ==== Top level parser ====

	/**
	 * Parses a whole program (`file_input`): a sequence of top-level statements
	 * until EOF, threading standalone/inline comments through when
	 * `includeComments` is enabled.
	 * @returns The `Module` node containing the parsed statement list.
	 * @throws {ParseError} On any syntax error encountered while parsing statements.
	 */
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

			// Comments collected during token peeking (via peek()) that precede
			// the next statement are always standalone here: an inline comment
			// (sharing a line with the previous statement) is always swept up
			// and drained by the previous iteration's post-statement handling
			// below before this point is reached.
			if (this.includeComments && this.pendingComments.length > 0) {
				body.push(...this.pendingComments);
				this.pendingComments = [];
			}

			const stmt = this.parseStatement();
			if (stmt) {
				body.push(stmt);

				// Comments collected while parsing `stmt` are usually inline
				// with it, but a standalone comment can also surface here:
				// one trailing the last statement of a just-closed nested
				// suite is buffered (via peek()) by that suite's own DEDENT
				// check, which then exits its loop without draining it, so
				// it bubbles up to the statement that opened that suite.
				if (this.includeComments && this.pendingComments.length > 0) {
					for (const comment of this.pendingComments) {
						if (comment.inline) {
							if (!stmt.inlineComment) {
								stmt.inlineComment = comment;
							}
						} else {
							body.push(comment);
						}
					}
					this.pendingComments = [];
				}
			}
		}

		// Handle any remaining pending comments after the main parsing loop
		// (e.g. a trailing standalone comment at end of file); see the note
		// above on why these are always standalone.
		if (this.includeComments && this.pendingComments.length > 0) {
			body.push(...this.pendingComments);
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

	/**
	 * Walks the parsed `module` and gathers every {@link Comment} node,
	 * whether standalone or attached to a statement as an inline comment,
	 * plus any comments still buffered in {@link pendingComments}.
	 * @param module The parsed module to scan for comments.
	 * @returns All comments found, in traversal order.
	 */
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

	/**
	 * Recurses into the nested body/bodies of a compound statement (function,
	 * class, if/for/while, with, try, match) to collect their comments.
	 * @param stmt The statement to inspect for nested bodies.
	 * @param comments Accumulator array that found comments are pushed onto.
	 */
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
				for (const handler of stmt.handlers) {
					this.collectFromBody(handler.body, comments);
				}
				this.collectFromBody(stmt.orelse, comments);
				this.collectFromBody(stmt.finalbody, comments);
				break;
			case "Match":
				for (const case_ of stmt.cases) {
					this.collectFromBody(case_.body, comments);
				}
				break;
		}
	}

	/**
	 * Collects top-level and inline comments from a flat statement list,
	 * recursing into nested bodies via {@link collectFromStatement}.
	 * @param body Statement list to scan.
	 * @param comments Accumulator array that found comments are pushed onto.
	 */
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

	/**
	 * Parses a single statement, dispatching to decorated/simple/compound
	 * statement parsing as appropriate.
	 * @returns The parsed statement.
	 * @throws {ParseError} On an unexpected `INDENT` or other syntax error.
	 */
	private parseStatement(): StmtNode | null {
		// Handle indentation
		if (this.check(TokenType.INDENT)) {
			// INDENT tokens should only appear after compound statements
			throw this.error("unexpected indent");
		}

		// Check for decorators first
		if (this.check(TokenType.AT)) {
			return this.parseDecorated();
		}

		return this.parseSimpleStmt() || this.parseCompoundStmt();
	}

	/**
	 * Parses one `simple_stmt`: a small statement followed by an optional
	 * `;` or newline terminator.
	 * @returns The parsed statement, or `null` if the current token doesn't
	 * start a small statement.
	 * @throws {ParseError} If the statement isn't terminated correctly.
	 */
	private parseSimpleStmt(): StmtNode | null {
		const stmt = this.parseSmallStmt();
		if (!stmt) {
			return null;
		}

		// A semicolon separates this statement from the next one on the
		// same line; the next small_stmt is picked up by the caller's
		// statement loop, which invokes parseStatement()/parseSimpleStmt()
		// again.
		const hadSemi = this.match(TokenType.SEMI);

		if (
			!hadSemi &&
			!this.check(TokenType.NEWLINE) &&
			!this.check(TokenType.DEDENT) &&
			!this.isAtEnd()
		) {
			throw this.error("invalid syntax");
		}

		this.match(TokenType.NEWLINE); // Optional newline
		return stmt;
	}

	/**
	 * Parses a `small_stmt`: pass/break/continue/return/delete/global/
	 * nonlocal/import/from-import/raise/assert/type-alias, or falls through
	 * to an expression statement (plain, assignment, augmented assignment,
	 * or annotated assignment).
	 * @returns The parsed statement, or `null` if the current token starts a
	 * compound statement instead (handled by {@link parseCompoundStmt}).
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses a `compound_stmt`: if/while/for/try/with/def/class/async/match.
	 * Only called (via {@link parseStatement}) when {@link parseSmallStmt}
	 * has already confirmed the current token starts one of these, so every
	 * branch below is guaranteed to be taken.
	 * @returns The parsed statement.
	 * @throws {ParseError} On malformed statement syntax.
	 */
	private parseCompoundStmt(): StmtNode {
		const start = this.peek();

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
		}

		this.consume(TokenType.MATCH, "Expected compound statement");
		return this.parseMatchStmt(start);
	}

	/**
	 * Parses a decorator list followed by the def/class/async-def/type-alias
	 * it applies to, attaching the decorators to the resulting node.
	 * @returns The decorated function, class, or type-alias statement.
	 * @throws {Error} If the decorators are not followed by a valid target.
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses zero or more `@expr` decorator lines preceding a def/class.
	 * @returns The decorator expressions, in source order.
	 */
	private parseDecorators(): ExprNode[] {
		const decorators: ExprNode[] = [];

		while (this.match(TokenType.AT)) {
			const decorator = this.parseTest();
			decorators.push(decorator);
			while (this.match(TokenType.NEWLINE)) {
				// Consume extra NEWLINEs left behind by blank lines or
				// comment-only lines between the decorator and its target.
			}
		}

		return decorators;
	}

	/**
	 * Parses an `if` statement, recursively folding any `elif` clauses into
	 * nested `If` nodes in `orelse` and handling a trailing `else`.
	 * @param start Token of the already-consumed `if` keyword, used for node position.
	 * @returns The parsed `If` node.
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses a `while` statement, including its optional `else` clause.
	 * @param start Token of the already-consumed `while` keyword, used for node position.
	 * @returns The parsed `While` node.
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses a `for` statement, including its optional `else` clause.
	 * @param start Token of the already-consumed `for` keyword, used for node position.
	 * @returns The parsed `For` node.
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses a `def` statement: name, optional PEP 695 type parameters,
	 * parameter list, optional return annotation, and body.
	 * @param start Token of the already-consumed `def` keyword, used for node position.
	 * @param decorators Decorator expressions already parsed by the caller (empty if none).
	 * @returns The parsed `FunctionDef` node.
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses an `async def` statement; identical to {@link parseFunctionDef}
	 * but produces an `AsyncFunctionDef` node.
	 * @param start Token of the already-consumed `def` keyword, used for node position.
	 * @param decorators Decorator expressions already parsed by the caller (empty if none).
	 * @returns The parsed `AsyncFunctionDef` node.
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses a `class` statement: name, optional PEP 695 type parameters,
	 * and an optional parenthesized list of base classes and/or keyword
	 * arguments (e.g. `metaclass=...`).
	 * @param start Token of the already-consumed `class` keyword, used for node position.
	 * @param decorators Decorator expressions already parsed by the caller (empty if none).
	 * @returns The parsed `ClassDef` node.
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses a `try` statement, including all `except`/`except*` handlers
	 * (which cannot be mixed on the same `try`), the optional `else`, and
	 * the optional `finally` clause.
	 * @param start Token of the already-consumed `try` keyword, used for node position.
	 * @returns The parsed `Try` node.
	 * @throws {ParseError} On malformed statement syntax, or if `except` and
	 * `except*` handlers are mixed on the same `try`.
	 */
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

	/**
	 * Parses a `with` statement, including one or more comma-separated
	 * context-manager items, each with an optional `as` target.
	 * @param start Token of the already-consumed `with` keyword, used for node position.
	 * @returns The parsed `With` node.
	 * @throws {ParseError} On malformed statement syntax.
	 */
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

	/**
	 * Parses the statement following an `async` keyword (`def`, `for`, or
	 * `with`) by delegating to the corresponding sync parser and rewriting
	 * the result's `nodeType` to its async variant.
	 * @param start Token of the already-consumed `async` keyword, used for node position.
	 * @returns The parsed `AsyncFunctionDef`, `AsyncFor`, or `AsyncWith` node.
	 * @throws {ParseError} If `async` is not followed by `def`, `for`, or `with`.
	 */
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

	/**
	 * Parses a `match` statement (PEP 634): the subject expression followed
	 * by an indented block of one or more `case pattern [if guard]:` clauses.
	 * @param start Token of the already-consumed `match` keyword, used for node position.
	 * @returns The parsed `Match` node.
	 * @throws {ParseError} On malformed statement syntax, e.g. a missing
	 * `case` in the match body.
	 */
	private parseMatchStmt(start: Token): StmtNode {
		const subject = this.parseTest();
		this.consume(TokenType.COLON, "Expected ':' after match subject");

		// Match statements must always be multi-line with proper indentation
		this.consume(TokenType.NEWLINE, "Expected newline after match:");

		// Skip newlines that might appear before the indent (these belong to
		// the match statement level, not the case level)
		while (this.match(TokenType.NEWLINE)) {
			// Skip
		}

		this.consume(TokenType.INDENT, "Expected indented block");

		const cases: MatchCase[] = [];

		while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
			if (this.match(TokenType.NEWLINE)) {
				continue;
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

	/**
	 * Parses one `case` pattern (the entry point of the pattern grammar).
	 * @returns The parsed pattern node.
	 * @throws {ParseError} On malformed pattern syntax.
	 */
	private parsePattern(): PatternNode {
		return this.parseOrPattern();
	}

	/**
	 * Parses a pattern with optional `|`-separated alternatives, producing
	 * a `MatchOr` when more than one alternative is present.
	 * @returns The parsed pattern, or a `MatchOr` wrapping multiple alternatives.
	 * @throws {ParseError} On malformed pattern syntax.
	 */
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

	/**
	 * Parses a single match pattern alternative: class patterns (`Point(x, y=0)`),
	 * capture/wildcard/value patterns, literals, sequence patterns (`[...]`/`(...)`),
	 * mapping patterns (`{...}`), or an `as`-bound pattern.
	 * @returns The parsed pattern node.
	 * @throws {ParseError} On malformed pattern syntax.
	 */
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

			if (token.type === TokenType.NUMBER) {
				value = this.parseNumber(token.value);
			} else if (token.type === TokenType.STRING) {
				value = this.parseString(token.value);
			} else if (token.type === TokenType.TRUE) {
				value = true;
			} else if (token.type === TokenType.FALSE) {
				value = false;
			} else {
				value = null;
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

	/**
	 * Parses a `testlist`: a single test expression, or a comma-separated
	 * sequence of them collapsed into a `Tuple` (trailing comma allowed).
	 * @returns The single expression, or a `Tuple` node if a comma was found.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a `test`: an or-test, optionally followed by a conditional
	 * expression (`X if COND else Y`).
	 * @returns The parsed expression, or an `IfExp` node.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a call argument, recognizing a bare generator expression
	 * (`f(x for x in y)`, no parens needed for a lone argument).
	 * @returns The parsed argument expression, or a `GeneratorExp` node.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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

	/**
	 * Parses an `or_test`: a `lambda` expression, or a chain of `and_test`s
	 * joined by `or` (collapsed into a single `BoolOp` when more than one).
	 * @returns The parsed expression.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses an `and_test`: a `not_test`, optionally a named expression
	 * (`:=` walrus target), or a chain of `not_test`s joined by `and`
	 * (collapsed into a single `BoolOp` when more than one).
	 * @returns The parsed expression.
	 * @throws {ParseError} On malformed expression syntax.
	 */
	private parseAndTest(): ExprNode {
		const expr = this.parseNotTest();

		// Check for named expression (walrus operator :=)
		if (this.match(TokenType.COLONEQUAL)) {
			const value = this.parseAndTest();
			return {
				nodeType: "NamedExpr",
				target: expr,
				value,
				lineno: expr.lineno,
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a `not_test`: zero or more `not` unary operators applied to a
	 * comparison expression.
	 * @returns The parsed expression, wrapped in `UnaryOp`(`Not`) for each `not`.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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

	/**
	 * Parses a `comparison`: an expr optionally followed by a chain of
	 * comparison operators and operands, collapsed into a single `Compare`
	 * node (Python allows chained comparisons like `a < b < c`).
	 * @returns The parsed expression, or a `Compare` node.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses an `expr` (the bitwise-or precedence level and below).
	 * @returns The parsed expression.
	 * @throws {ParseError} On malformed expression syntax.
	 */
	private parseExpr(): ExprNode {
		return this.parseOrExpr();
	}

	/**
	 * Parses a chain of `xor_expr`s joined by `|`, left-associative.
	 * @returns The parsed expression, or a `BinOp`(`BitOr`) chain.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a chain of `and_expr`s joined by `^`, left-associative.
	 * @returns The parsed expression, or a `BinOp`(`BitXor`) chain.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a chain of `shift_expr`s joined by `&`, left-associative.
	 * @returns The parsed expression, or a `BinOp`(`BitAnd`) chain.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a chain of `arith_expr`s joined by `<<`/`>>`, left-associative.
	 * @returns The parsed expression, or a `BinOp`(`LShift`/`RShift`) chain.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a chain of `term`s joined by `+`/`-`, left-associative.
	 * @returns The parsed expression, or a `BinOp`(`Add`/`Sub`) chain.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a chain of `factor`s joined by `*`, `@`, `/`, `//`, or `%`,
	 * left-associative.
	 * @returns The parsed expression, or a `BinOp` chain over these operators.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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

			if (opToken.type === TokenType.STAR) {
				op = { nodeType: "Mult" };
			} else if (opToken.type === TokenType.AT) {
				op = { nodeType: "MatMult" };
			} else if (opToken.type === TokenType.SLASH) {
				op = { nodeType: "Div" };
			} else if (opToken.type === TokenType.DOUBLESLASH) {
				op = { nodeType: "FloorDiv" };
			} else {
				op = { nodeType: "Mod" };
			}

			const right = this.parseFactor();

			expr = {
				nodeType: "BinOp",
				left: expr,
				op,
				right,
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a `factor`: an `await` expression, a unary `+`/`-`/`~` applied
	 * (right-recursively) to another factor, or a power expression.
	 * @returns The parsed expression.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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

			if (start.type === TokenType.PLUS) {
				op = { nodeType: "UAdd" };
			} else if (start.type === TokenType.MINUS) {
				op = { nodeType: "USub" };
			} else {
				op = { nodeType: "Invert" };
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

	/**
	 * Parses a `power`: an atom-with-trailers, optionally raised to a
	 * right-associative `**` exponent.
	 * @returns The parsed expression, or a `BinOp`(`Pow`) node.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses an atom followed by zero or more trailers: attribute access
	 * (`.name`), subscription (`[...]`), or call (`(...)`).
	 * @returns The parsed expression, wrapped in `Attribute`/`Subscript`/`Call` per trailer.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
					lineno: expr.lineno,
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
					lineno: expr.lineno,
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
					lineno: expr.lineno,
					col_offset: expr.col_offset || 0,
				};
			} else {
				break;
			}
		}

		return expr;
	}

	/**
	 * Parses an `atom`: the base case of the expression grammar — names,
	 * numeric/string/f-string/boolean/`None`/ellipsis literals, parenthesized
	 * expressions, tuples, list/dict/set displays and comprehensions, or
	 * `yield`/`yield from`.
	 * @returns The parsed atomic expression node.
	 * @throws {ParseError} On malformed or unrecognized atom syntax.
	 */
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

	/**
	 * Parses a `suite`: either an indented block of statements following a
	 * `:` and `NEWLINE`, or a single simple statement on the same line as
	 * the `:`. When `includeComments` is enabled, standalone comments are
	 * threaded into the returned list and inline comments are attached to
	 * the preceding statement's `inlineComment`.
	 * @returns The list of parsed statements (and comment nodes, if enabled).
	 * @throws {ParseError} If the block is not properly indented/dedented.
	 */
	private parseSuite(): StmtNode[] {
		if (this.match(TokenType.NEWLINE)) {
			// Skip any additional newlines before the indent
			while (this.match(TokenType.NEWLINE)) {
				// Continue skipping newlines
			}

			if (!this.match(TokenType.INDENT)) {
				throw this.error("Expected indented block");
			}

			const stmts: StmtNode[] = [];

			while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
				if (this.match(TokenType.NEWLINE)) {
					continue;
				}

				// See the note in parseFileInput: comments collected here via
				// peek() are always standalone, since an inline comment is
				// always drained by the post-statement handling below first.
				if (this.includeComments && this.pendingComments.length > 0) {
					stmts.push(...this.pendingComments);
					this.pendingComments = [];
				}

				const stmt = this.parseStatement();
				if (stmt) {
					stmts.push(stmt);

					// Comments collected while parsing `stmt` are usually
					// inline with it, but a standalone comment can also
					// surface here, bubbled up from a just-closed nested
					// suite; see the note in parseFileInput.
					if (this.includeComments && this.pendingComments.length > 0) {
						for (const comment of this.pendingComments) {
							if (comment.inline) {
								if (!stmt.inlineComment) {
									stmt.inlineComment = comment;
								}
							} else {
								stmts.push(comment);
							}
						}
						this.pendingComments = [];
					}
				}
			}

			this.consume(TokenType.DEDENT, "Expected dedent to close block");

			return stmts;
		} else {
			// Simple statement on the same line
			const stmt = this.parseSimpleStmt();
			return stmt ? [stmt] : [];
		}
	}

	/**
	 * Parses a `def`/`class`-style parameter list: positional-only args
	 * (before `/`), regular args, `*args`/bare `*`, keyword-only args, and
	 * `**kwargs`, each with optional annotations and defaults.
	 * @returns The parsed `Arguments` node.
	 * @throws {ParseError} On malformed parameter syntax.
	 */
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

	/**
	 * Parses a `lambda`'s (simplified, unannotated) parameter list: plain
	 * names with optional `=default` values, comma-separated.
	 * @returns The parsed `Arguments` node (no posonly/kwonly/vararg/kwarg support).
	 * @throws {ParseError} On malformed parameter syntax.
	 */
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

	/**
	 * Parses an `exprlist` (assignment-target form used by `for`/`del`):
	 * a single expr, or a comma-separated sequence collapsed into a `Tuple`
	 * with `Store` context, stopping before a trailing `in`.
	 * @returns The single expression, or a `Tuple` node.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	/**
	 * Parses a comma-separated list of subscripts inside `[...]`, collapsing
	 * multiple entries into a `Tuple` (used for multi-dimensional indexing).
	 * @returns The single subscript expression, or a `Tuple` node.
	 * @throws {ParseError} On malformed subscript syntax.
	 */
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
				lineno: first.lineno,
				col_offset: first.col_offset || 0,
			};
		}

		return first;
	}

	/**
	 * Parses a single subscript entry: a plain index expression, or a
	 * `lower:upper:step` slice (any part may be omitted).
	 * @returns The parsed index expression, or a `Slice` node.
	 * @throws {ParseError} On malformed subscript syntax.
	 */
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
				lineno: first.lineno,
				col_offset: first.col_offset || 0,
			};
		}

		return first;
	}

	/**
	 * Parses the contents of a `[...]` display after the opening bracket has
	 * been consumed: an empty list, a list comprehension, or a regular
	 * (possibly starred) element list.
	 * @param start Token of the already-consumed `[`, used for node position.
	 * @returns The parsed `List` or `ListComp` node.
	 * @throws {ParseError} On malformed list syntax.
	 */
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

	/**
	 * Parses the contents of a `{...}` display after the opening brace has
	 * been consumed: an empty dict, a dict/dict-comprehension (`key: value`),
	 * or a set/set-comprehension.
	 * @param start Token of the already-consumed `{`, used for node position.
	 * @returns The parsed `Dict`, `DictComp`, `Set`, or `SetComp` node.
	 * @throws {ParseError} On malformed dict/set syntax.
	 */
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

	/**
	 * Parses a sequence of `[async] for ... in ... [if ...]` comprehension
	 * clauses, used when the leading `for` has not yet been consumed
	 * (e.g. list/generator comprehensions).
	 * @returns The parsed comprehension clauses, in source order.
	 * @throws {ParseError} On malformed comprehension syntax.
	 */
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

	/**
	 * Parses a sequence of comprehension clauses when the leading `for`
	 * keyword of the first clause has already been consumed by the caller
	 * (e.g. dict/set comprehensions).
	 * @returns The parsed comprehension clauses, in source order.
	 * @throws {ParseError} On malformed comprehension syntax.
	 */
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

	/**
	 * Reports whether the current token is an augmented-assignment operator
	 * (e.g. `+=`, `-=`, `**=`) without consuming it.
	 * @returns `true` if the current token is an augmented-assignment operator.
	 */
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

	/**
	 * Consumes the current augmented-assignment token and maps it to its
	 * underlying binary operator node (e.g. `+=` -> `Add`). Only called
	 * (via {@link matchAugAssign}) once the current token is already
	 * confirmed to be one of these, so every branch below is reachable.
	 * @returns The corresponding `OperatorNode`.
	 */
	private parseAugAssignOp(): OperatorNode {
		const token = this.advance();

		if (token.type === TokenType.PLUSEQUAL) return { nodeType: "Add" };
		if (token.type === TokenType.MINEQUAL) return { nodeType: "Sub" };
		if (token.type === TokenType.STAREQUAL) return { nodeType: "Mult" };
		if (token.type === TokenType.SLASHEQUAL) return { nodeType: "Div" };
		if (token.type === TokenType.PERCENTEQUAL) return { nodeType: "Mod" };
		if (token.type === TokenType.AMPEREQUAL) return { nodeType: "BitAnd" };
		if (token.type === TokenType.VBAREQUAL) return { nodeType: "BitOr" };
		if (token.type === TokenType.CIRCUMFLEXEQUAL) return { nodeType: "BitXor" };
		if (token.type === TokenType.LEFTSHIFTEQUAL) return { nodeType: "LShift" };
		if (token.type === TokenType.RIGHTSHIFTEQUAL) return { nodeType: "RShift" };
		if (token.type === TokenType.DOUBLESTAREQUAL) return { nodeType: "Pow" };
		if (token.type === TokenType.DOUBLESLASHEQUAL)
			return { nodeType: "FloorDiv" };
		return { nodeType: "MatMult" };
	}

	/**
	 * Reports whether the current token(s) start a comparison operator
	 * (`<`, `>`, `==`, `>=`, `<=`, `!=`, `in`, `is`, `not in`, `is not`)
	 * without consuming them.
	 * @returns `true` if the current position begins a comparison operator.
	 */
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
			(this.check(TokenType.NOT) && this.checkNext(TokenType.IN))
		);
	}

	/**
	 * Consumes one comparison operator (including the two-token `not in`
	 * and `is not` forms) and returns its AST node. Only called (via
	 * {@link matchComparison}) once the current token is already confirmed
	 * to start a comparison operator, so every branch below is reachable.
	 * @returns The corresponding `CmpOpNode`.
	 */
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

		this.consume(TokenType.NOT, "Expected comparison operator");
		this.consume(TokenType.IN, "Expected 'in' after 'not'");
		return { nodeType: "NotIn" };
	}

	/**
	 * Determines whether an annotated-assignment target is a "simple" name
	 * target per the `AnnAssign.simple` flag in the Python AST (as opposed
	 * to an attribute, subscript, or parenthesized name).
	 * @param expr The assignment target expression.
	 * @returns `true` if `expr` is a bare `Name` node.
	 */
	private isSimpleTarget(expr: ExprNode): boolean {
		return expr.nodeType === "Name";
	}

	/** Creates a `Load` expression-context node. */
	private createLoad(): Load {
		return { nodeType: "Load" };
	}

	/** Creates a `Store` expression-context node. */
	private createStore(): Store {
		return { nodeType: "Store" };
	}

	/**
	 * Converts a raw numeric literal token value to a JS `number`, handling
	 * hex (`0x`), octal (`0o`), binary (`0b`), float, and decimal-int forms.
	 * @param value The raw token text of the numeric literal.
	 * @returns The parsed numeric value.
	 */
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

	/**
	 * Converts a raw string literal token value to its decoded string
	 * content: strips the prefix (`f`/`r`/`b`/`u`) and surrounding quotes
	 * (single or triple), and resolves basic escape sequences unless the
	 * literal is raw (`r`-prefixed).
	 * @param value The raw token text of the string literal, including prefix and quotes.
	 * @returns The decoded string content.
	 */
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

	/**
	 * Determines the original prefix + quote style (e.g. `f"`, `'''`) of a
	 * raw string/f-string token, for round-tripping through the unparser.
	 * The lexer only ever emits `STRING` tokens shaped as `<prefix><quote>
	 * ...<quote>`, with the quote character immediately following the
	 * prefix, so one of these cases always applies.
	 * @param tokenValue The raw token text, including prefix and quotes.
	 * @returns The prefix concatenated with its quote characters.
	 */
	private getStringQuoteStyle(tokenValue: string): string {
		// Extract any prefix (f, r, b, u, etc.); the `*` quantifier means this
		// regex always matches from position 0, so the capture group is
		// always defined (possibly empty).
		const [, prefix] = tokenValue.match(/^([fFrRbBuU]*)/) as [string, string];
		const withoutPrefix = tokenValue.slice(prefix.length);

		if (withoutPrefix.startsWith('"""')) {
			return `${prefix}"""`;
		}
		if (withoutPrefix.startsWith("'''")) {
			return `${prefix}'''`;
		}
		if (withoutPrefix.startsWith('"')) {
			return `${prefix}"`;
		}
		return `${prefix}'`;
	}

	/**
	 * Parses an f-string token into a `JoinedStr` node: splits the content
	 * into literal text segments (`Constant` nodes) and `{expr}` segments
	 * (delegated to {@link parseExpressionInFString}), tracking brace/quote
	 * nesting so expressions containing strings or nested f-strings are
	 * handled correctly.
	 * @param token The f-string token, including its quotes and `f` prefix.
	 * @returns A `JoinedStr` node containing the interleaved literal and formatted-value parts.
	 * @throws {ParseError} If an f-string expression is malformed.
	 */
	private parseFString(token: Token): JoinedStr {
		// Extract the content inside the f-string quotes
		let content = token.value;

		// Determine and store the original quote style
		const quoteStyle = this.getStringQuoteStyle(token.value);

		// Remove f-string prefix and quotes. The sole caller only invokes
		// parseFString when the token already starts with `f"` or `f'`
		// (case-insensitively), so both cases strip the same way.
		content = content.slice(2, -1);

		const values: ExprNode[] = [];
		let i = 0;
		let literalStart = 0;

		while (i < content.length) {
			if (content[i] === "{") {
				// Add any literal content before this expression
				if (i > literalStart) {
					values.push({
						nodeType: "Constant",
						value: content.slice(literalStart, i),
						lineno: token.lineno,
						col_offset: token.col_offset + literalStart + 2, // +2 for f" prefix
					});
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
			values.push({
				nodeType: "Constant",
				value: content.slice(literalStart),
				lineno: token.lineno,
				col_offset: token.col_offset + literalStart + 2,
			});
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
	 * Extracts the raw text of a single `{expr}` segment from f-string
	 * content, tracking brace nesting and skipping over any nested strings
	 * or nested f-strings so their braces/quotes don't confuse the scan.
	 * Only called with `startPos` pointing at a `{` (the caller checks
	 * this first), and the lexer already validated overall brace balance
	 * before producing the f-string token, so the braces here are always
	 * balanced too.
	 * @param content The f-string's unquoted content.
	 * @param startPos Index into `content` of the opening `{`.
	 * @returns The expression text (braces excluded) and the index just past the matching `}`.
	 */
	private parseExpressionInFString(
		content: string,
		startPos: number,
	): { exprText: string; nextPos: number } {
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

		return { exprText: result, nextPos: i };
	}

	/**
	 * Scans a nested f-string literal (`f"..."`/`f'...'`) that appears
	 * inside an outer f-string's `{expr}` segment, returning its raw text
	 * verbatim so the outer scan can skip past it intact.
	 * @param content The enclosing f-string's unquoted content.
	 * @param startPos Index into `content` of the nested f-string's `f` prefix.
	 * @returns The nested f-string's full raw text and the index just past its closing quote.
	 * @throws {Error} If the nested f-string is unterminated.
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
	 * Scans a quoted string literal that appears inside an f-string's
	 * `{expr}` segment, respecting backslash escapes so an escaped quote
	 * doesn't terminate the scan early.
	 * @param content The enclosing f-string's unquoted content.
	 * @param startPos Index into `content` of the string's opening quote.
	 * @returns The string's raw text (quotes included) and the index just past its closing quote.
	 * @throws {Error} If the string literal is unterminated.
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

	/**
	 * Parses the text of an f-string `{expr}` segment into a `FormattedValue`
	 * node: splits off an optional `!r`/`!s`/`!a` conversion specifier and/or
	 * a `:spec` format spec, then parses the remaining expression text via
	 * {@link parseExpressionFromString}.
	 * @param exprText The raw text between the segment's braces (as returned by {@link parseExpressionInFString}).
	 * @param token The f-string token, used for error/node position.
	 * @returns The parsed `FormattedValue` node.
	 */
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

	/**
	 * Parses a standalone expression string (an f-string interpolation's
	 * expression text) using a fresh nested {@link Parser} instance. Falls
	 * back to treating the text as a bare `Name` if it fails to parse, so a
	 * single malformed interpolation doesn't abort the whole file.
	 * @param exprText The expression source text to parse.
	 * @param token The originating f-string token, used for fallback node position.
	 * @returns The parsed expression, or a fallback `Name` node on parse failure.
	 */
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

	/**
	 * Consumes the current token if it matches any of `types`.
	 * @param types Token types to accept.
	 * @returns `true` (and advances) if the current token matched one of `types`; otherwise `false`.
	 */
	private match(...types: TokenType[]): boolean {
		for (const type of types) {
			if (this.check(type)) {
				this.advance();
				return true;
			}
		}
		return false;
	}

	/**
	 * Reports whether the current token (comments skipped) is of `type`, without consuming it.
	 * @param type Token type to test for.
	 * @returns `true` if the current token matches `type`.
	 */
	private check(type: TokenType): boolean {
		if (this.isAtEnd()) return false;
		const token = this.peek();
		return token.type === type;
	}

	/**
	 * Reports whether the token immediately after the current one is of
	 * `type`, without consuming anything. Unlike {@link check}, this looks
	 * at the raw next token and does not skip comments.
	 * @param type Token type to test for.
	 * @returns `true` if the next raw token matches `type`.
	 */
	private checkNext(type: TokenType): boolean {
		return this.tokens[this.current + 1].type === type;
	}

	/**
	 * Reports whether the parser has consumed all tokens (reached `EOF`).
	 * @returns `true` at end of input.
	 */
	private isAtEnd(): boolean {
		// When parsing comments as statement nodes, check the actual current token
		const token = this.peek();
		return token.type === TokenType.EOF;
	}

	/**
	 * Returns the current token without consuming it. As a side effect,
	 * any `COMMENT` tokens at the current position are skipped over and
	 * buffered into {@link pendingComments} so callers never observe them
	 * directly (comments are re-attached to statements elsewhere). The
	 * lexer always terminates the token stream with a real `EOF` token, so
	 * this comment-skipping loop always stops there and `this.current`
	 * never runs past the end of {@link tokens}.
	 * @returns The current non-comment token.
	 */
	private peek(): Token {
		// Skip over comment tokens and collect them
		let currentIndex = this.current;
		while (this.tokens[currentIndex].type === TokenType.COMMENT) {
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

		return this.tokens[this.current];
	}

	/**
	 * Returns the raw token immediately after the current position, without
	 * skipping comments and without consuming anything.
	 * @returns The next raw token.
	 */
	private peekNext(): Token {
		return this.tokens[this.current + 1];
	}

	/**
	 * Consumes and returns the current token, updating
	 * {@link lastNonCommentTokenLine} when the consumed token isn't a
	 * comment or newline (used to detect inline vs. standalone comments).
	 * @returns The token that was just consumed.
	 */
	private advance(): Token {
		// Every call site checks/peeks the current token first, which is
		// never EOF when advance() is reached, so the isAtEnd() guard other
		// token-consuming helpers use isn't needed here.
		this.current++;
		const token = this.previous();

		// Track the line number of non-comment, non-newline tokens. The
		// lexer always sets end_lineno, so no fallback to lineno is needed.
		if (token.type !== TokenType.COMMENT && token.type !== TokenType.NEWLINE) {
			this.lastNonCommentTokenLine = token.end_lineno;
		}

		return token;
	}

	/**
	 * Returns the most recently consumed token.
	 * @returns The token at the position just before the current cursor.
	 */
	private previous(): Token {
		return this.tokens[this.current - 1];
	}

	/**
	 * Consumes the current token if it matches `type`, otherwise raises a syntax error.
	 * @param type Expected token type.
	 * @param message Error message to use if the current token doesn't match.
	 * @returns The consumed token.
	 * @throws {ParseError} If the current token is not of `type`.
	 */
	private consume(type: TokenType, message: string): Token {
		if (this.check(type)) {
			return this.advance();
		}
		throw this.error(message);
	}

	/**
	 * Builds a {@link ParseError} for `message`, positioned at the current token.
	 * @param message Description of the syntax error.
	 * @returns A `ParseError` ready to be thrown, carrying the current token's source location.
	 */
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

	/**
	 * Recursively checks that an expression is a syntactically valid
	 * assignment target (name, attribute, subscript, list/tuple of targets,
	 * or a starred target), matching CPython's assignment-target rules.
	 * @param expr The expression to validate as an assignment target.
	 * @throws {ParseError} If `expr` (or one of its nested elements) cannot be assigned to.
	 */
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

	/**
	 * Parses a `test`, or a starred expression (`*expr`) used as an element
	 * of a list/tuple/call-argument context.
	 * @returns The parsed expression, or a `Starred` node.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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

	/**
	 * Parses a comma-separated list of (possibly starred) test expressions,
	 * collapsing into a `Tuple` when more than one element is present
	 * (trailing comma allowed). Used for expression statements and
	 * assignment left-hand sides that may include starred targets.
	 * @returns The single expression, or a `Tuple` node.
	 * @throws {ParseError} On malformed expression syntax.
	 */
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
				lineno: expr.lineno,
				col_offset: expr.col_offset || 0,
			};
		}

		return expr;
	}

	// ==== Type parameter parsing ====

	/**
	 * Parses an optional PEP 695 `[...]` type-parameter list on a
	 * `def`/`class`/`type` statement: regular `TypeVar`s (with optional
	 * `: bound` and `= default`), `*Ts` `TypeVarTuple`s, and `**P` `ParamSpec`s.
	 * @returns The parsed type parameters, or an empty array if no `[` is present.
	 * @throws {ParseError} On malformed type-parameter syntax.
	 */
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
 * Parses Python source code from a string into an AST, mirroring
 * CPython's `ast.parse`.
 * @param source Python source code to parse.
 * @param options Parsing options; see {@link ParseOptions}.
 * @returns The root `Module` AST node.
 * @throws {ParseError} On any syntax error in `source`.
 */
export function parse(source: string, options: ParseOptions = {}): Module {
	const parser = new Parser(source, options);
	return parser.parse();
}

/**
 * Parses Python source code from a file path. Not yet implemented: this is
 * a Node.js-oriented placeholder — read the file's contents yourself and
 * pass them to {@link parse} instead.
 * @param _filename Path to the Python source file (currently unused).
 * @param _options Parsing options; see {@link ParseOptions} (currently unused).
 * @returns Never returns.
 * @throws {Error} Always — this function is not implemented.
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

/**
 * Parses `source` and evaluates its first expression statement as a Python
 * literal, mirroring CPython's `ast.literal_eval`. Supports constants,
 * lists, tuples, sets, dicts (no unpacking), and unary/binary +/- on
 * numeric literals.
 * @param source Python source containing a single literal expression.
 * @returns The evaluated JavaScript value corresponding to the literal.
 * @throws {Error} If `source` contains no expression statement, or the
 * expression isn't a supported literal form.
 */
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

/**
 * Recursively evaluates an expression node as a Python literal (constant,
 * list, tuple, dict, set, or +/- unary/binary op on numbers), the worker
 * behind {@link literalEval}.
 * @param node The expression node to evaluate.
 * @returns The evaluated JavaScript value.
 * @throws {Error} If `node` (or a nested key/value) isn't a supported
 * literal form, e.g. an unrecognized node type.
 */
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
				// `Dict.keys` allows `null` (for CPython AST shape parity with
				// `**dict` unpacking), but this parser's dict-literal grammar
				// never actually produces `**` entries, so a key here is
				// always a real expression.
				const key = node.keys[i] as ExprNode;
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

/**
 * Copies source-location fields (`lineno`, `col_offset`, `end_lineno`,
 * `end_col_offset`) from `oldNode` onto `newNode`, mirroring CPython's
 * `ast.copy_location`. Useful when synthesizing or replacing AST nodes
 * that must retain their original position for error reporting.
 * @param newNode The node to receive the location.
 * @param oldNode The node to copy the location from.
 * @returns `newNode`, mutated in place.
 */
export function copyLocation(newNode: ASTNode, oldNode: ASTNode): ASTNode {
	newNode.lineno = oldNode.lineno;
	newNode.col_offset = oldNode.col_offset;
	newNode.end_lineno = oldNode.end_lineno;
	newNode.end_col_offset = oldNode.end_col_offset;
	return newNode;
}

/**
 * Recursively fills in missing `lineno`/`col_offset`/`end_lineno`/
 * `end_col_offset` fields on `node` and all its descendants by inheriting
 * them from the nearest ancestor that has them (or `(1, 0, 1, 0)` at the
 * root), mirroring CPython's `ast.fix_missing_locations`. Useful after
 * hand-constructing or transforming AST nodes that lack location info.
 * @param node The AST node (typically a `Module`) to fix in place.
 * @returns `node`, mutated in place.
 */
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

/**
 * Recursively increments the `lineno` and `end_lineno` of `node` and all
 * its descendants by `n`, mirroring CPython's `ast.increment_lineno`.
 * Useful when splicing a parsed AST fragment into a larger source file at
 * a known line offset.
 * @param node The AST node (typically a `Module`) to adjust in place.
 * @param n Number of lines to add to every line number (default `1`).
 * @returns `node`, mutated in place.
 */
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
