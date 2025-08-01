/**
 * Python Lexical Analyzer (Tokenizer)
 * Converts Python source code into a stream of tokens
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

export interface Token {
	type: TokenType;
	value: string;
	lineno: number;
	col_offset: number;
	end_lineno: number;
	end_col_offset: number;
}

export interface Position {
	line: number;
	column: number;
	index: number;
}

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
	["match", TokenType.MATCH],
	["case", TokenType.CASE],
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

export class Lexer {
	private source: string;
	private position: Position;
	private tokens: Token[] = [];
	private indentStack: number[] = [0];
	private atLineStart = true;
	private parenLevel = 0;
	private bracketLevel = 0;
	private braceLevel = 0;

	constructor(source: string) {
		this.source = source;
		this.position = { line: 1, column: 0, index: 0 };
	}

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

		// Add final dedents
		while (this.indentStack.length > 1) {
			this.indentStack.pop();
			this.addToken(TokenType.DEDENT, "");
		}

		this.addToken(TokenType.EOF, "");
		return this.tokens;
	}

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
		if (c === " " || c === "\t" || c === "\r") {
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

		// Identifiers and keywords
		if (this.isAlpha(c) || c === "_") {
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

	private scanNewline(): void {
		const start = { ...this.position }; // Create a copy
		this.advance(); // consume '\n'

		// Only emit NEWLINE if we're not inside parentheses/brackets/braces
		if (
			this.parenLevel === 0 &&
			this.bracketLevel === 0 &&
			this.braceLevel === 0
		) {
			this.addTokenAt(TokenType.NEWLINE, "\n", start);
		}

		this.atLineStart = true;
	}

	private scanIndentation(): void {
		let indent = 0;
		while (this.position.index < this.source.length) {
			const c = this.peek();
			if (c === " ") {
				indent++;
				this.advance();
			} else if (c === "\t") {
				indent += 8; // Tab counts as 8 spaces
				this.advance();
			} else {
				break;
			}
		}

		// Skip empty lines and comment-only lines
		const c = this.peek();
		if (c === "\n" || c === "#" || this.position.index >= this.source.length) {
			return;
		}

		// Skip indentation tracking when inside parentheses, brackets, or braces
		if (this.parenLevel > 0 || this.bracketLevel > 0 || this.braceLevel > 0) {
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

		// Handle decimal point
		if (
			this.peek() === "." &&
			this.position.index + 1 < this.source.length &&
			this.isDigit(this.peekNext())
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

	private scanIdentifier(): void {
		const start = { ...this.position }; // Create a copy
		let value = "";

		while (
			this.position.index < this.source.length &&
			(this.isAlphaNumeric(this.peek()) || this.peek() === "_")
		) {
			value += this.peek();
			this.advance();
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

		const tokenType = KEYWORDS.get(value) || TokenType.NAME;
		this.addTokenAt(tokenType, value, start);
	}

	private isStringPrefix(value: string): boolean {
		const lowerValue = value.toLowerCase();
		return ["f", "r", "b", "u", "fr", "rf", "br", "rb"].includes(lowerValue);
	}

	private scanPrefixedString(prefix: string, start: Position): void {
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
			case "^=":
				tokenType = TokenType.CIRCUMFLEXEQUAL;
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
					this.advance(); // consume '\n'
					this.position.line++;
					this.position.column = 0;
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

	private peek(offset: number = 0): string {
		const index = this.position.index + offset;
		return index < this.source.length ? this.source[index] : "";
	}

	private peekNext(): string {
		return this.peek(1);
	}

	private advance(): string {
		const c = this.peek();
		if (c === "\n") {
			this.position.line++;
			this.position.column = 0;
		} else {
			this.position.column++;
		}
		this.position.index++;
		return c;
	}

	private addToken(type: TokenType, value: string): void {
		this.addTokenAt(type, value, this.position);
	}

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

	private isDigit(c: string): boolean {
		return c >= "0" && c <= "9";
	}

	private isHexDigit(c: string): boolean {
		return this.isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
	}

	private isOctalDigit(c: string): boolean {
		return c >= "0" && c <= "7";
	}

	private isBinaryDigit(c: string): boolean {
		return c === "0" || c === "1";
	}

	private isAlpha(c: string): boolean {
		// Support Unicode letters using regex
		return /^[\p{L}]$/u.test(c);
	}

	private isAlphaNumeric(c: string): boolean {
		return this.isAlpha(c) || this.isDigit(c);
	}
}
