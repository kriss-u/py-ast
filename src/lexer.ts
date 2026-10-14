/**
 * Python Lexical Analyzer (Tokenizer)
 * Converts Python source code into a stream of tokens
 */

import { quoteContextAt, scanInterpolatedBody } from "./interpolation.js";

/**
 * The kind of a lexical token produced by {@link Lexer}.
 *
 * Mirrors CPython's `tokenize` module categories: literals, keywords,
 * operators/delimiters, comparison and assignment operators, and the
 * structural tokens (`NEWLINE`/`INDENT`/`DEDENT`/`EOF`) used to represent
 * Python's significant whitespace. F-string specific values
 * (`FSTRING_START`/`FSTRING_MIDDLE`/`FSTRING_END`) are reserved for future
 * use; this lexer currently emits whole f-strings as a single `STRING`
 * token (see {@link Lexer.scanInterpolatedStringLiteral}).
 */
export enum TokenType {
	// Literals
	NUMBER = "NUMBER",
	STRING = "STRING",
	NAME = "NAME",

	// Keywords
	AND = "AND",
	AS = "AS",
	ASSERT = "ASSERT",
	ASYNC = "ASYNC",
	AWAIT = "AWAIT",
	BREAK = "BREAK",
	CLASS = "CLASS",
	CONTINUE = "CONTINUE",
	DEF = "DEF",
	DEL = "DEL",
	ELIF = "ELIF",
	ELSE = "ELSE",
	EXCEPT = "EXCEPT",
	FALSE = "FALSE",
	FINALLY = "FINALLY",
	FOR = "FOR",
	FROM = "FROM",
	GLOBAL = "GLOBAL",
	IF = "IF",
	IMPORT = "IMPORT",
	IN = "IN",
	IS = "IS",
	LAMBDA = "LAMBDA",
	MATCH = "MATCH",
	CASE = "CASE",
	NONE = "NONE",
	NONLOCAL = "NONLOCAL",
	NOT = "NOT",
	OR = "OR",
	PASS = "PASS",
	RAISE = "RAISE",
	RETURN = "RETURN",
	TRUE = "TRUE",
	TRY = "TRY",
	WHILE = "WHILE",
	WITH = "WITH",
	YIELD = "YIELD",

	// Operators
	PLUS = "PLUS", // +
	MINUS = "MINUS", // -
	STAR = "STAR", // *
	DOUBLESTAR = "DOUBLESTAR", // **
	SLASH = "SLASH", // /
	DOUBLESLASH = "DOUBLESLASH", // //
	PERCENT = "PERCENT", // %
	AT = "AT", // @
	VBAR = "VBAR", // |
	AMPER = "AMPER", // &
	CIRCUMFLEX = "CIRCUMFLEX", // ^
	TILDE = "TILDE", // ~
	LEFTSHIFT = "LEFTSHIFT", // <<
	RIGHTSHIFT = "RIGHTSHIFT", // >>

	// Delimiters
	LPAR = "LPAR", // (
	RPAR = "RPAR", // )
	LSQB = "LSQB", // [
	RSQB = "RSQB", // ]
	LBRACE = "LBRACE", // {
	RBRACE = "RBRACE", // }
	COMMA = "COMMA", // ,
	COLON = "COLON", // :
	DOT = "DOT", // .
	SEMI = "SEMI", // ;
	EQUAL = "EQUAL", // =
	RARROW = "RARROW", // ->

	// Comparison operators
	EQEQUAL = "EQEQUAL", // ==
	NOTEQUAL = "NOTEQUAL", // !=
	LESS = "LESS", // <
	GREATER = "GREATER", // >
	LESSEQUAL = "LESSEQUAL", // <=
	GREATEREQUAL = "GREATEREQUAL", // >=

	// Assignment operators
	PLUSEQUAL = "PLUSEQUAL", // +=
	MINEQUAL = "MINEQUAL", // -=
	STAREQUAL = "STAREQUAL", // *=
	SLASHEQUAL = "SLASHEQUAL", // /=
	PERCENTEQUAL = "PERCENTEQUAL", // %=
	AMPEREQUAL = "AMPEREQUAL", // &=
	VBAREQUAL = "VBAREQUAL", // |=
	CIRCUMFLEXEQUAL = "CIRCUMFLEXEQUAL", // ^=
	LEFTSHIFTEQUAL = "LEFTSHIFTEQUAL", // <<=
	RIGHTSHIFTEQUAL = "RIGHTSHIFTEQUAL", // >>=
	DOUBLESTAREQUAL = "DOUBLESTAREQUAL", // **=
	DOUBLESLASHEQUAL = "DOUBLESLASHEQUAL", // //=
	ATEQUAL = "ATEQUAL", // @=
	COLONEQUAL = "COLONEQUAL", // :=

	// Special tokens
	NEWLINE = "NEWLINE",
	INDENT = "INDENT",
	DEDENT = "DEDENT",
	COMMENT = "COMMENT",
	EOF = "EOF",
	ELLIPSIS = "ELLIPSIS", // ...

	// String formatting
	FSTRING_START = "FSTRING_START",
	FSTRING_MIDDLE = "FSTRING_MIDDLE",
	FSTRING_END = "FSTRING_END",
}

/**
 * A single lexical token produced by {@link Lexer.tokenize}.
 *
 * Line numbers are 1-based and column offsets are 0-based, matching
 * CPython's `ast` module conventions so positions can be attached directly
 * to AST nodes by the parser.
 */
export interface Token {
	/** The token's category. */
	type: TokenType;
	/** The raw source text of the token (e.g. `"def"`, `"+="`, or a string literal including its quotes/prefix). */
	value: string;
	/** 1-based line number where the token starts. */
	lineno: number;
	/** 0-based column offset where the token starts. */
	col_offset: number;
	/** 1-based line number where the token ends. */
	end_lineno: number;
	/** 0-based column offset where the token ends. */
	end_col_offset: number;
}

/**
 * A mutable cursor into the source string, tracked as the lexer advances.
 *
 * `line`/`column` are used to stamp token positions, while `index` is the
 * absolute offset used for all character lookups.
 */
export interface Position {
	/** 1-based line number. */
	line: number;
	/** 0-based column number within the current line. */
	column: number;
	/** 0-based absolute character offset into the source string. */
	index: number;
}

/** Maps Python reserved words to their {@link TokenType}. Any identifier not present here is lexed as {@link TokenType.NAME}. */
const KEYWORDS = new Map<string, TokenType>([
	["and", TokenType.AND],
	["as", TokenType.AS],
	["assert", TokenType.ASSERT],
	["async", TokenType.ASYNC],
	["await", TokenType.AWAIT],
	["break", TokenType.BREAK],
	["class", TokenType.CLASS],
	["continue", TokenType.CONTINUE],
	["def", TokenType.DEF],
	["del", TokenType.DEL],
	["elif", TokenType.ELIF],
	["else", TokenType.ELSE],
	["except", TokenType.EXCEPT],
	["False", TokenType.FALSE],
	["finally", TokenType.FINALLY],
	["for", TokenType.FOR],
	["from", TokenType.FROM],
	["global", TokenType.GLOBAL],
	["if", TokenType.IF],
	["import", TokenType.IMPORT],
	["in", TokenType.IN],
	["is", TokenType.IS],
	["lambda", TokenType.LAMBDA],
	["None", TokenType.NONE],
	["nonlocal", TokenType.NONLOCAL],
	["not", TokenType.NOT],
	["or", TokenType.OR],
	["pass", TokenType.PASS],
	["raise", TokenType.RAISE],
	["return", TokenType.RETURN],
	["True", TokenType.TRUE],
	["try", TokenType.TRY],
	["while", TokenType.WHILE],
	["with", TokenType.WITH],
	["yield", TokenType.YIELD],
]);

/**
 * Returns the number of bytes `codePoint` takes when encoded as UTF-8,
 * matching CPython's `col_offset`/`end_col_offset`, which count UTF-8 bytes
 * rather than UTF-16 code units or Unicode codepoints. Every non-ASCII
 * character (accented letters, em dashes, CJK text, emoji, ...) needs this:
 * counting JS string length directly under-counts them relative to CPython.
 * @param codePoint A full Unicode codepoint (not a lone UTF-16 surrogate).
 * @returns `1`, `2`, `3`, or `4` — the codepoint's UTF-8 byte length.
 */
export function utf8Length(codePoint: number): number {
	if (codePoint < 0x80) return 1;
	if (codePoint < 0x800) return 2;
	if (codePoint < 0x10000) return 3;
	return 4;
}

/**
 * Returns the UTF-8 byte length of the character at `text[index]`,
 * transparently combining a UTF-16 surrogate pair (e.g. most emoji) into
 * its single 4-byte codepoint. `index` should point at the start of a
 * character, not the low half of a pair.
 * @param text The string to read from.
 * @param index Index of the character (or high surrogate) to measure.
 * @returns The character's UTF-8 byte length.
 */
export function utf8LengthAt(text: string, index: number): number {
	const code = text.charCodeAt(index);
	if (code >= 0xd800 && code <= 0xdbff) {
		const low = text.charCodeAt(index + 1);
		if (low >= 0xdc00 && low <= 0xdfff) {
			const codePoint = (code - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
			return utf8Length(codePoint);
		}
	}
	return utf8Length(code);
}

/**
 * Tokenizes Python source code into a flat array of {@link Token}s.
 *
 * Handles Python's significant-whitespace grammar (emitting synthetic
 * `INDENT`/`DEDENT`/`NEWLINE` tokens), string literals (plain, prefixed,
 * triple-quoted, and f-strings), numeric literals (decimal, hex, octal,
 * binary, float, scientific notation, complex), comments, line
 * continuations (`\` followed by a newline), and all Python operators and
 * delimiters.
 */
export class Lexer {
	private source: string;
	private position: Position;
	private tokens: Token[] = [];
	/** Stack of indentation widths (in columns) for currently-open blocks; always starts at `[0]` for the top level. */
	private indentStack: number[] = [0];
	/** Whether the lexer is positioned at the start of a logical line and still needs to process leading indentation. */
	private atLineStart = true;
	/** Nesting depth of `(`/`)`; while > 0, newlines and indentation are not significant (implicit line joining). */
	private parenLevel = 0;
	/** Nesting depth of `[`/`]`; while > 0, newlines and indentation are not significant (implicit line joining). */
	private bracketLevel = 0;
	/** Nesting depth of `{`/`}`; while > 0, newlines and indentation are not significant (implicit line joining). */
	private braceLevel = 0;
	/** Whether the whole source behaves as if inside brackets (see the constructor's `options`). */
	private implicitLineJoining: boolean;

	/**
	 * @param source - The full Python source text to tokenize. Line endings
	 * are normalized to `\n` first (CPython's universal-newline handling —
	 * `\r\n` and lone `\r` both become `\n`, including inside string
	 * literals), so indentation tracking isn't thrown off by `\r` and
	 * `lineno`/`col_offset` land where CPython puts them regardless of the
	 * source file's original line-ending style.
	 * @param options - `implicitLineJoining` makes the whole source behave as
	 * if it were inside brackets, so newlines and indentation are never
	 * significant. This is how CPython treats the expression in an
	 * f-string/t-string replacement field, which can span lines freely.
	 */
	constructor(source: string, options: { implicitLineJoining?: boolean } = {}) {
		this.source = source.replace(/\r\n?/g, "\n");
		this.position = { line: 1, column: 0, index: 0 };
		this.implicitLineJoining = options.implicitLineJoining ?? false;
	}

	/** Whether newlines and indentation are currently insignificant (implicit line joining). */
	private insideBrackets(): boolean {
		return (
			this.implicitLineJoining ||
			this.parenLevel > 0 ||
			this.bracketLevel > 0 ||
			this.braceLevel > 0
		);
	}

	/**
	 * Tokenizes the source text passed to the constructor.
	 *
	 * Resets all internal lexer state first, so the same {@link Lexer}
	 * instance can be safely re-tokenized by calling this method again.
	 * Emits any trailing `DEDENT` tokens needed to close open indentation
	 * levels, followed by a final `EOF` token.
	 *
	 * @returns The complete list of tokens, terminated by an `EOF` token.
	 * @throws {Error} If the source contains invalid indentation, an
	 *   unterminated string/f-string literal, or an unexpected character.
	 */
	tokenize(): Token[] {
		this.tokens = [];
		this.position = { line: 1, column: 0, index: 0 };
		this.indentStack = [0];
		this.atLineStart = true;
		this.parenLevel = 0;
		this.bracketLevel = 0;
		this.braceLevel = 0;

		while (this.position.index < this.source.length) {
			this.scanToken();
		}

		// CPython's tokenizer treats the last logical line as terminated
		// even when the source doesn't end with an actual `\n` (`"def
		// f():\n    return"` — no trailing newline — is valid). Without a
		// real `\n` character, `scanNewline` never runs, so nothing emits
		// the `NEWLINE` a small_stmt like `return` normally ends on; the
		// parser would otherwise see it run straight into `DEDENT`/`EOF`
		// and, for a statement that can optionally be followed by a value
		// (`return`, `yield`, ...), misread whatever comes next as that
		// value. Synthesize the missing token here, mirroring CPython.
		const lastToken = this.tokens[this.tokens.length - 1];
		if (lastToken && lastToken.type !== TokenType.NEWLINE) {
			this.addToken(TokenType.NEWLINE, "\n");
		}

		// Add final dedents
		while (this.indentStack.length > 1) {
			this.indentStack.pop();
			this.addToken(TokenType.DEDENT, "");
		}

		this.addToken(TokenType.EOF, "");
		return this.tokens;
	}

	/**
	 * Scans and emits exactly one token (or handles one piece of
	 * line-start/whitespace state) starting at the current position.
	 *
	 * Dispatches to the appropriate specialized `scan*` method based on the
	 * current character, checking for f-string prefixes before falling back
	 * to generic identifier scanning.
	 */
	private scanToken(): void {
		const c = this.peek();

		if (c === "\n") {
			this.scanNewline();
			return;
		}

		if (this.atLineStart) {
			this.scanIndentation();
			this.atLineStart = false;
			// After scanning indentation, we need to scan the token at the current position
			// So we recursively call scanToken to handle the actual token
			if (this.position.index < this.source.length) {
				this.scanToken();
			}
			return;
		}

		// Skip whitespace (except newlines)
		if (c === " " || c === "\t" || c === "\r" || c === "\f") {
			this.advance();
			return;
		}

		// Comments
		if (c === "#") {
			this.scanComment();
			return;
		}

		// String literals
		if (c === '"' || c === "'") {
			this.scanString();
			return;
		}

		// Numbers
		if (this.isDigit(c)) {
			this.scanNumber();
			return;
		}

		// Leading-dot float literals (e.g. `.5`)
		if (c === "." && this.isDigit(this.peekNext())) {
			this.scanNumber();
			return;
		}

		// Identifiers and keywords - check for f-strings/t-strings first
		if (this.isAlpha(this.peekCodePoint()) || c === "_") {
			// Check for a bare `f"..."` or `t"..."` (single-letter prefix
			// immediately followed by a quote); multi-character prefix
			// combos (`rf`, `tr`, etc.) fall through to scanIdentifier.
			if (
				(c.toLowerCase() === "f" || c.toLowerCase() === "t") &&
				this.position.index + 1 < this.source.length
			) {
				const nextChar = this.peekNext();
				if (nextChar === '"' || nextChar === "'") {
					this.scanInterpolatedStringLiteral(c);
					return;
				}
			}
			this.scanIdentifier();
			return;
		}

		// Three-character operators (check before two-character to avoid conflicts)
		const threeChar = this.source.slice(
			this.position.index,
			this.position.index + 3,
		);
		if (this.scanThreeCharOperator(threeChar)) {
			return;
		}

		// Two-character operators
		const twoChar = this.source.slice(
			this.position.index,
			this.position.index + 2,
		);
		if (this.scanTwoCharOperator(twoChar)) {
			return;
		}

		// Single-character operators and delimiters
		this.scanSingleCharOperator(c);
	}

	/**
	 * Consumes a `\n` and emits a `NEWLINE` token, unless the lexer is
	 * currently inside parentheses, brackets, or braces (implicit line
	 * joining), in which case the newline is consumed silently. Marks the
	 * lexer as being at the start of a new line so indentation is rescanned.
	 */
	private scanNewline(): void {
		const start = { ...this.position }; // Create a copy
		this.advance(); // consume '\n'

		if (!this.insideBrackets()) {
			this.addTokenAt(TokenType.NEWLINE, "\n", start);
		}

		this.atLineStart = true;
	}

	/**
	 * Measures the leading whitespace of a logical line and updates
	 * {@link indentStack}, emitting `INDENT`/`DEDENT` tokens as needed.
	 *
	 * Blank lines and comment-only lines are skipped entirely (they don't
	 * affect indentation), and indentation is not tracked while inside an
	 * open `()`/`[]`/`{}` (continuation lines can be indented arbitrarily).
	 * Tabs are counted as 8 columns each, matching CPython's tokenizer.
	 *
	 * @throws {Error} If a dedent's width doesn't match any level still on
	 *   the indent stack (inconsistent indentation).
	 */
	private scanIndentation(): void {
		let indent = 0;
		// Mirrors CPython's tokenizer: indentation can't be split across
		// physical lines, so the column of the first line-start `\`
		// continuation decides the level — unless that column is 0, in which
		// case counting carries on into the continued line.
		let continuationIndent = 0;
		while (this.position.index < this.source.length) {
			const c = this.peek();
			if (c === " ") {
				indent++;
				this.advance();
			} else if (c === "\t") {
				indent += 8; // Tab counts as 8 spaces
				this.advance();
			} else if (c === "\f") {
				// A form feed resets the column count, as in CPython.
				indent = 0;
				this.advance();
			} else if (c === "\\" && this.peekNext() === "\n") {
				continuationIndent ||= indent;
				this.advance();
				this.advance();
			} else {
				break;
			}
		}
		indent = continuationIndent || indent;

		// Skip empty lines and comment-only lines
		const c = this.peek();
		if (c === "\n" || c === "#" || this.position.index >= this.source.length) {
			return;
		}

		// Skip indentation tracking when inside parentheses, brackets, or braces
		if (this.insideBrackets()) {
			return;
		}

		const currentIndent = this.indentStack[this.indentStack.length - 1];

		if (indent > currentIndent) {
			this.indentStack.push(indent);
			this.addToken(TokenType.INDENT, "");
		} else if (indent < currentIndent) {
			while (
				this.indentStack.length > 1 &&
				this.indentStack[this.indentStack.length - 1] > indent
			) {
				this.indentStack.pop();
				this.addToken(TokenType.DEDENT, "");
			}

			if (this.indentStack[this.indentStack.length - 1] !== indent) {
				throw new Error(`Indentation error at line ${this.position.line}`);
			}
		}
	}

	/**
	 * Consumes a `#` comment through the end of the current line (exclusive
	 * of the trailing newline) and emits a `COMMENT` token.
	 */
	private scanComment(): void {
		const start = { ...this.position }; // Create a copy
		this.advance(); // consume '#'

		let value = "#";
		while (this.position.index < this.source.length && this.peek() !== "\n") {
			value += this.peek();
			this.advance();
		}

		this.addTokenAt(TokenType.COMMENT, value, start);
	}

	/**
	 * Scans a single- or triple-quoted string literal (`'...'`, `"..."`,
	 * `'''...'''`, `"""..."""`) with no prefix, starting at the opening
	 * quote. Escape sequences are copied through verbatim without
	 * interpretation (unparsing/interpretation happens elsewhere).
	 *
	 * @throws {Error} If a single-quoted string contains a raw newline, or
	 *   if the string is unterminated at end of source.
	 */
	private scanString(): void {
		const start = { ...this.position }; // Create a copy
		const quote = this.peek();
		this.advance(); // consume opening quote

		// Check for triple quotes
		const isTripleQuote = this.peek() === quote && this.peekNext() === quote;
		if (isTripleQuote) {
			this.advance(); // consume second quote
			this.advance(); // consume third quote
		}

		let value = quote;
		if (isTripleQuote) {
			value += quote + quote;
		}

		let stringClosed = false;

		while (this.position.index < this.source.length) {
			const c = this.peek();

			if (c === "\\") {
				value += c;
				this.advance();
				if (this.position.index < this.source.length) {
					value += this.peek();
					this.advance();
				}
				continue;
			}

			if (isTripleQuote) {
				if (
					c === quote &&
					this.peekNext() === quote &&
					this.peek(2) === quote
				) {
					value += quote + quote + quote;
					this.advance(); // consume first quote
					this.advance(); // consume second quote
					this.advance(); // consume third quote
					stringClosed = true;
					break;
				}
			} else {
				if (c === quote) {
					value += quote;
					this.advance();
					stringClosed = true;
					break;
				}
				if (c === "\n") {
					throw new Error(
						`Unterminated string literal at line ${this.position.line}`,
					);
				}
			}

			value += c;
			this.advance();
		}

		// If we reached end of source without closing the string, it's an error
		if (!stringClosed) {
			if (isTripleQuote) {
				throw new Error(
					`Unterminated triple-quoted string literal at line ${start.line}`,
				);
			} else {
				throw new Error(`Unterminated string literal at line ${start.line}`);
			}
		}

		this.addTokenAt(TokenType.STRING, value, start);
	}

	/**
	 * Scans an f-string or t-string literal (`f"..."`, `t'''...'''`, etc.)
	 * starting at the leading prefix letter. The whole literal — including
	 * its prefix, quotes, and any `{expr}` replacement/interpolation fields
	 * — is captured as a single `STRING` token's value; nested expressions
	 * are not tokenized separately.
	 *
	 * @param prefixChar The single prefix letter already identified (`f`/`F`
	 *   for f-strings, `t`/`T` for t-strings/PEP 750 template strings).
	 * @throws {Error} If the literal is unterminated.
	 */
	private scanInterpolatedStringLiteral(prefixChar: string): void {
		const start = { ...this.position };
		this.advance();
		this.scanInterpolatedRest(prefixChar, start);
	}

	/**
	 * Scans the rest of an f-string/t-string literal once its prefix has
	 * been consumed and the current character is its opening quote, emitting
	 * the whole literal as one `STRING` token. Where the literal ends is
	 * decided by {@link scanInterpolatedBody}, which understands nested
	 * strings, comments, and format specs inside replacement fields (PEP 701).
	 *
	 * @param prefix The literal's prefix letters (e.g. `"f"`, `"rT"`).
	 * @param start The position where the prefix began.
	 * @throws {Error} If the literal is unterminated (end of source, a raw
	 *   newline in a single-quoted literal's text, or an unclosed field).
	 */
	private scanInterpolatedRest(prefix: string, start: Position): void {
		const ctx = quoteContextAt(this.source, this.position.index, prefix);
		const literalKind = /t/i.test(prefix) ? "t-string" : "f-string";
		const end = scanInterpolatedBody(
			this.source,
			this.position.index + (ctx.triple ? 3 : 1),
			ctx,
		);
		if (end === -1) {
			const tripleQuoted = ctx.triple ? "triple-quoted " : "";
			throw new Error(
				`Unterminated ${tripleQuoted}${literalKind} literal at line ${start.line}`,
			);
		}
		while (this.position.index < end) this.advance();
		this.addTokenAt(
			TokenType.STRING,
			this.source.slice(start.index, end),
			start,
		);
	}

	/**
	 * Scans a numeric literal starting at the current position, producing a
	 * single `NUMBER` token.
	 *
	 * Handles hex (`0x`), octal (`0o`), and binary (`0b`) integers; plain
	 * decimal integers; floats with a fractional part; scientific notation
	 * (`e`/`E` with an optional sign); and the trailing `j`/`J` suffix for
	 * complex number literals. Underscores used as digit-group separators
	 * (e.g. `1_000_000`) are recognized and stripped from the emitted value,
	 * matching Python's numeric literal grammar.
	 */
	private scanNumber(): void {
		const start = { ...this.position }; // Create a copy
		let value = "";

		// Handle different number formats (decimal, hex, octal, binary)
		if (this.peek() === "0" && this.position.index + 1 < this.source.length) {
			const next = this.peekNext().toLowerCase();
			if (next === "x" || next === "o" || next === "b") {
				value += this.peek(); // '0'
				this.advance();
				value += this.peek(); // 'x', 'o', or 'b'
				this.advance();

				const isHex = next === "x";
				const isOctal = next === "o";
				const isBinary = next === "b";

				while (this.position.index < this.source.length) {
					const c = this.peek().toLowerCase();
					if (
						(isHex && this.isHexDigit(c)) ||
						(isOctal && this.isOctalDigit(c)) ||
						(isBinary && this.isBinaryDigit(c))
					) {
						value += this.peek();
						this.advance();
					} else if (c === "_") {
						// Skip underscores in numbers
						this.advance();
					} else {
						break;
					}
				}

				this.addTokenAt(TokenType.NUMBER, value, start);
				return;
			}
		}

		// Regular decimal number
		while (
			this.position.index < this.source.length &&
			(this.isDigit(this.peek()) || this.peek() === "_")
		) {
			if (this.peek() !== "_") {
				value += this.peek();
			}
			this.advance();
		}

		// Handle decimal point. A digit before the dot means the dot always
		// starts a fractional part, even with no digits after it (e.g. `5.`);
		// a digit is only required after the dot when there were no digits
		// before it (handled by the leading-dot dispatch in `scanToken`).
		if (
			this.peek() === "." &&
			(value.length > 0 || this.isDigit(this.peekNext()))
		) {
			value += this.peek();
			this.advance();

			while (
				this.position.index < this.source.length &&
				(this.isDigit(this.peek()) || this.peek() === "_")
			) {
				if (this.peek() !== "_") {
					value += this.peek();
				}
				this.advance();
			}
		}

		// Handle scientific notation
		if (this.peek().toLowerCase() === "e") {
			value += this.peek();
			this.advance();

			if (this.peek() === "+" || this.peek() === "-") {
				value += this.peek();
				this.advance();
			}

			while (
				this.position.index < this.source.length &&
				(this.isDigit(this.peek()) || this.peek() === "_")
			) {
				if (this.peek() !== "_") {
					value += this.peek();
				}
				this.advance();
			}
		}

		// Handle complex numbers
		if (this.peek().toLowerCase() === "j") {
			value += this.peek();
			this.advance();
		}

		this.addTokenAt(TokenType.NUMBER, value, start);
	}

	/**
	 * Scans an identifier or keyword starting at the current position.
	 *
	 * If the scanned word is a recognized string prefix (`r`, `b`, `u`,
	 * `fr`, `rf`, `br`, `rb` — case-insensitive) immediately followed by a
	 * quote character, delegates to {@link scanPrefixedString} instead of
	 * emitting a `NAME`/keyword token, since it's actually the prefix of a
	 * string literal. Otherwise emits the matching keyword token type from
	 * {@link KEYWORDS}, or `NAME` if the word isn't a keyword.
	 */
	private scanIdentifier(): void {
		const start = { ...this.position }; // Create a copy
		let value = "";

		while (this.isAlphaNumeric(this.peekCodePoint())) {
			const codePoint = this.peekCodePoint();
			value += codePoint;
			for (let i = 0; i < codePoint.length; i++) this.advance();
		}

		// Check if this is a string prefix (f, r, b, u, fr, rf, br, rb)
		if (
			this.isStringPrefix(value) &&
			(this.peek() === '"' || this.peek() === "'")
		) {
			// This is a prefixed string, scan the string part
			this.scanPrefixedString(value, start);
			return;
		}

		// CPython matches keywords against the raw spelling, then NFKC-
		// normalizes identifiers (PEP 3131), so `ｗｉｄｔｈ` names `width`.
		const tokenType = KEYWORDS.get(value) || TokenType.NAME;
		this.addTokenAt(
			tokenType,
			tokenType === TokenType.NAME ? value.normalize("NFKC") : value,
			start,
		);
	}

	/**
	 * Checks whether `value` is a valid Python string-prefix word (e.g.
	 * `r`, `b`, `u`, `rb`, `fr`, `tr`) that, combined with a following quote,
	 * denotes a raw/bytes/unicode/template string rather than a plain
	 * identifier. Note: plain `f`/`t`-prefixed strings are handled
	 * separately by {@link scanInterpolatedStringLiteral}, called eagerly from
	 * {@link scanToken} before this check is reached for the
	 * single-character `"f"`/`"t"` case.
	 *
	 * @param value - The already-scanned identifier text to test.
	 * @returns `true` if `value` (case-insensitively) is a recognized
	 *   string prefix.
	 */
	private isStringPrefix(value: string): boolean {
		const lowerValue = value.toLowerCase();
		return [
			"f",
			"r",
			"b",
			"u",
			"t",
			"fr",
			"rf",
			"br",
			"rb",
			"tr",
			"rt",
		].includes(lowerValue);
	}

	/**
	 * Scans a prefixed string literal (e.g. `r"..."`, `rb'''...'''`,
	 * `tr"..."`) whose prefix and opening quote have already been identified
	 * by {@link scanIdentifier}. Behaves like {@link scanString} but
	 * includes the prefix in the emitted token's value and does not itself
	 * throw on an unterminated triple-quoted string reaching end of source
	 * (unlike {@link scanString}/{@link scanInterpolatedStringLiteral}).
	 *
	 * When `prefix` contains `f`/`t` (a raw f-string or raw t-string, e.g.
	 * `rf`/`tr`), brace nesting is tracked the same way as
	 * {@link scanInterpolatedStringLiteral} so a quote character inside a `{expr}` field
	 * doesn't terminate the literal early; plain `r`/`b`/`u` combos don't
	 * track braces, since `{`/`}` are just literal characters there.
	 *
	 * @param prefix - The string prefix text already consumed (e.g. `"rb"`).
	 * @param start - The position where the prefix began, used as the
	 *   resulting token's start position.
	 * @throws {Error} If a single-quoted prefixed string contains a raw
	 *   newline.
	 */
	private scanPrefixedString(prefix: string, start: Position): void {
		if (/[ft]/i.test(prefix)) {
			this.scanInterpolatedRest(prefix, start);
			return;
		}

		const quote = this.peek();
		this.advance(); // consume opening quote

		// Check for triple quotes
		const isTripleQuote = this.peek() === quote && this.peekNext() === quote;
		if (isTripleQuote) {
			this.advance(); // consume second quote
			this.advance(); // consume third quote
		}

		let value = prefix + quote;
		if (isTripleQuote) {
			value += quote + quote;
		}

		while (this.position.index < this.source.length) {
			const c = this.peek();

			if (c === "\\") {
				value += c;
				this.advance();
				if (this.position.index < this.source.length) {
					value += this.peek();
					this.advance();
				}
				continue;
			}

			if (isTripleQuote) {
				if (
					c === quote &&
					this.peekNext() === quote &&
					this.peek(2) === quote
				) {
					value += quote + quote + quote;
					this.advance(); // consume first quote
					this.advance(); // consume second quote
					this.advance(); // consume third quote
					break;
				}
			} else {
				if (c === quote) {
					value += quote;
					this.advance();
					break;
				}
				if (c === "\n") {
					throw new Error(
						`Unterminated string literal at line ${this.position.line}`,
					);
				}
			}

			value += c;
			this.advance();
		}

		this.addTokenAt(TokenType.STRING, value, start);
	}

	/**
	 * Attempts to match `twoChar` against the set of two-character
	 * operators/delimiters (e.g. `==`, `->`, `+=`). If it matches, consumes
	 * both characters and emits the corresponding token.
	 *
	 * @param twoChar - The two characters at the current position.
	 * @returns `true` if a two-character operator was matched and consumed;
	 *   `false` if `twoChar` isn't a recognized operator, leaving the
	 *   position unchanged so the caller can fall back to shorter matches.
	 */
	private scanTwoCharOperator(twoChar: string): boolean {
		const start = { ...this.position }; // Create a copy
		let tokenType: TokenType | null = null;

		switch (twoChar) {
			case "**":
				tokenType = TokenType.DOUBLESTAR;
				break;
			case "//":
				tokenType = TokenType.DOUBLESLASH;
				break;
			case "<<":
				tokenType = TokenType.LEFTSHIFT;
				break;
			case ">>":
				tokenType = TokenType.RIGHTSHIFT;
				break;
			case "==":
				tokenType = TokenType.EQEQUAL;
				break;
			case "!=":
				tokenType = TokenType.NOTEQUAL;
				break;
			case "<=":
				tokenType = TokenType.LESSEQUAL;
				break;
			case ">=":
				tokenType = TokenType.GREATEREQUAL;
				break;
			case "+=":
				tokenType = TokenType.PLUSEQUAL;
				break;
			case "-=":
				tokenType = TokenType.MINEQUAL;
				break;
			case "*=":
				tokenType = TokenType.STAREQUAL;
				break;
			case "/=":
				tokenType = TokenType.SLASHEQUAL;
				break;
			case "%=":
				tokenType = TokenType.PERCENTEQUAL;
				break;
			case "&=":
				tokenType = TokenType.AMPEREQUAL;
				break;
			case "|=":
				tokenType = TokenType.VBAREQUAL;
				break;
			case "^=":
				tokenType = TokenType.CIRCUMFLEXEQUAL;
				break;
			case "@=":
				tokenType = TokenType.ATEQUAL;
				break;
			case ":=":
				tokenType = TokenType.COLONEQUAL;
				break;
			case "->":
				tokenType = TokenType.RARROW;
				break;
		}

		if (tokenType) {
			this.advance();
			this.advance();
			this.addTokenAt(tokenType, twoChar, start);
			return true;
		}

		return false;
	}

	/**
	 * Attempts to match `threeChar` against the set of three-character
	 * operators (e.g. `...`, `**=`, `//=`). If it matches, consumes all
	 * three characters and emits the corresponding token. Checked before
	 * {@link scanTwoCharOperator} so e.g. `...` isn't misread as `..` + `.`.
	 *
	 * @param threeChar - The three characters at the current position.
	 * @returns `true` if a three-character operator was matched and
	 *   consumed; `false` otherwise, leaving the position unchanged.
	 */
	private scanThreeCharOperator(threeChar: string): boolean {
		const start = { ...this.position }; // Create a copy
		let tokenType: TokenType | null = null;

		switch (threeChar) {
			case "...":
				tokenType = TokenType.ELLIPSIS;
				break;
			case "<<=":
				tokenType = TokenType.LEFTSHIFTEQUAL;
				break;
			case ">>=":
				tokenType = TokenType.RIGHTSHIFTEQUAL;
				break;
			case "**=":
				tokenType = TokenType.DOUBLESTAREQUAL;
				break;
			case "//=":
				tokenType = TokenType.DOUBLESLASHEQUAL;
				break;
		}

		if (tokenType) {
			this.advance();
			this.advance();
			this.advance();
			this.addTokenAt(tokenType, threeChar, start);
			return true;
		}

		return false;
	}

	/**
	 * Scans a single-character operator or delimiter.
	 *
	 * Also maintains {@link parenLevel}/{@link bracketLevel}/{@link braceLevel}
	 * as `(`/`)`, `[`/`]`, and `{`/`}` are encountered, and handles the
	 * backslash line-continuation form (`\` immediately followed by `\n`),
	 * which consumes both characters and emits no token.
	 *
	 * @param c - The single character at the current position.
	 * @throws {Error} If `c` is a backslash not followed by a newline, or
	 *   is any other character not recognized as an operator/delimiter.
	 */
	private scanSingleCharOperator(c: string): void {
		const start = { ...this.position }; // Create a copy
		let tokenType: TokenType;

		switch (c) {
			case "+":
				tokenType = TokenType.PLUS;
				break;
			case "-":
				tokenType = TokenType.MINUS;
				break;
			case "*":
				tokenType = TokenType.STAR;
				break;
			case "/":
				tokenType = TokenType.SLASH;
				break;
			case "%":
				tokenType = TokenType.PERCENT;
				break;
			case "@":
				tokenType = TokenType.AT;
				break;
			case "|":
				tokenType = TokenType.VBAR;
				break;
			case "&":
				tokenType = TokenType.AMPER;
				break;
			case "^":
				tokenType = TokenType.CIRCUMFLEX;
				break;
			case "~":
				tokenType = TokenType.TILDE;
				break;
			case "(":
				tokenType = TokenType.LPAR;
				this.parenLevel++;
				break;
			case ")":
				tokenType = TokenType.RPAR;
				this.parenLevel--;
				break;
			case "[":
				tokenType = TokenType.LSQB;
				this.bracketLevel++;
				break;
			case "]":
				tokenType = TokenType.RSQB;
				this.bracketLevel--;
				break;
			case "{":
				tokenType = TokenType.LBRACE;
				this.braceLevel++;
				break;
			case "}":
				tokenType = TokenType.RBRACE;
				this.braceLevel--;
				break;
			case ",":
				tokenType = TokenType.COMMA;
				break;
			case ":":
				tokenType = TokenType.COLON;
				break;
			case ".":
				tokenType = TokenType.DOT;
				break;
			case ";":
				tokenType = TokenType.SEMI;
				break;
			case "=":
				tokenType = TokenType.EQUAL;
				break;
			case "<":
				tokenType = TokenType.LESS;
				break;
			case ">":
				tokenType = TokenType.GREATER;
				break;
			case "\\":
				// Handle line continuation
				if (this.peek(1) === "\n") {
					this.advance(); // consume '\\'
					this.advance(); // consume '\n' (already advances line/column)
					return; // Don't emit a token, just continue
				} else {
					throw new Error(
						`Unexpected character '${c}' at line ${this.position.line}, column ${this.position.column}`,
					);
				}
			default:
				throw new Error(
					`Unexpected character '${c}' at line ${this.position.line}, column ${this.position.column}`,
				);
		}

		this.advance();
		this.addTokenAt(tokenType, c, start);
	}

	/**
	 * Returns the character `offset` positions ahead of the current index
	 * without consuming it.
	 *
	 * @param offset - How many characters ahead to look (0 = current
	 *   character). Defaults to `0`.
	 * @returns The character at that position, or `""` if it is past the
	 *   end of the source.
	 */
	private peek(offset: number = 0): string {
		const index = this.position.index + offset;
		return index < this.source.length ? this.source[index] : "";
	}

	/**
	 * Returns the full code point at the current position without consuming
	 * it: two UTF-16 units for a character outside the Basic Multilingual
	 * Plane (e.g. `𝒞`), so it can be classified as a whole.
	 *
	 * @returns The code point as a string, or `""` at end of source.
	 */
	private peekCodePoint(): string {
		const codePoint = this.source.codePointAt(this.position.index);
		return codePoint === undefined ? "" : String.fromCodePoint(codePoint);
	}

	/**
	 * Returns the character immediately after the current one, without
	 * consuming it. Equivalent to `peek(1)`.
	 */
	private peekNext(): string {
		return this.peek(1);
	}

	/**
	 * Consumes and returns the current character, advancing the position by
	 * one. Updates `line`/`column` bookkeeping when crossing a `\n`.
	 *
	 * @returns The consumed character, or `""` if already at end of source.
	 */
	private advance(): string {
		const c = this.peek();
		if (c === "\n") {
			this.position.line++;
			this.position.column = 0;
		} else {
			const code = c.charCodeAt(0);
			const prevCode =
				this.position.index > 0
					? this.source.charCodeAt(this.position.index - 1)
					: 0;
			const isLowSurrogateOfPreviousPair =
				code >= 0xdc00 &&
				code <= 0xdfff &&
				prevCode >= 0xd800 &&
				prevCode <= 0xdbff;
			// A surrogate pair's byte length is attributed entirely to its
			// high half (by utf8LengthAt, which looks ahead to combine the
			// pair); skip the low half here so it isn't double-counted.
			if (!isLowSurrogateOfPreviousPair) {
				this.position.column += utf8LengthAt(this.source, this.position.index);
			}
		}
		this.position.index++;
		return c;
	}

	/**
	 * Appends a zero-width token (e.g. `INDENT`/`DEDENT`/`EOF`) whose start
	 * position is the lexer's current position.
	 *
	 * @param type - The token's type.
	 * @param value - The token's raw text (typically `""` for structural
	 *   tokens).
	 */
	private addToken(type: TokenType, value: string): void {
		this.addTokenAt(type, value, this.position);
	}

	/**
	 * Appends a token to the output list, using `start` as the token's
	 * start position and the lexer's current position as its end position.
	 *
	 * @param type - The token's type.
	 * @param value - The token's raw source text.
	 * @param start - The position captured before the token's characters
	 *   were consumed.
	 */
	private addTokenAt(type: TokenType, value: string, start: Position): void {
		this.tokens.push({
			type,
			value,
			lineno: start.line,
			col_offset: start.column,
			end_lineno: this.position.line,
			end_col_offset: this.position.column,
		});
	}

	/** Returns `true` if `c` is an ASCII digit (`0`-`9`). */
	private isDigit(c: string): boolean {
		return c >= "0" && c <= "9";
	}

	/** Returns `true` if `c` is a valid hexadecimal digit (`0`-`9`, `a`-`f`, `A`-`F`). */
	private isHexDigit(c: string): boolean {
		return this.isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
	}

	/** Returns `true` if `c` is a valid octal digit (`0`-`7`). */
	private isOctalDigit(c: string): boolean {
		return c >= "0" && c <= "7";
	}

	/** Returns `true` if `c` is a valid binary digit (`0` or `1`). */
	private isBinaryDigit(c: string): boolean {
		return c === "0" || c === "1";
	}

	/**
	 * Returns `true` if `c` is a letter usable as the start of a Python
	 * identifier. Uses the Unicode `\p{ID_Start}` property class (rather
	 * than an ASCII-only or plain-letter check) because Python identifiers
	 * may start with any `XID_Start` character (PEP 3131), which
	 * `ID_Start` closely approximates.
	 */
	private isAlpha(c: string): boolean {
		return /^\p{ID_Start}$/u.test(c);
	}

	/**
	 * Returns `true` if `c` is valid inside (not necessarily starting) a
	 * Python identifier. Uses `\p{ID_Continue}` rather than
	 * letter-or-digit, since Python's `XID_Continue` (PEP 3131) also
	 * admits combining marks (e.g. Hebrew niqqud) and connector
	 * punctuation — `ID_Continue` closely approximates it and already
	 * includes decimal digits.
	 */
	private isAlphaNumeric(c: string): boolean {
		return /^\p{ID_Continue}$/u.test(c);
	}
}
