import { describe, expect, it } from "vitest";
import { Lexer, TokenType } from "../src/lexer.js";

function tokenTypes(source: string) {
	return new Lexer(source).tokenize().map((t) => t.type);
}

describe("Lexer string literals", () => {
	it("throws on a raw newline inside a single-quoted string", () => {
		expect(() => new Lexer("'abc\ndef'").tokenize()).toThrow(
			/Unterminated string literal/,
		);
	});

	it("throws when a triple-quoted string is unterminated at EOF", () => {
		expect(() => new Lexer('"""abc').tokenize()).toThrow(
			/Unterminated triple-quoted string literal/,
		);
	});

	it("throws when a single-quoted string is unterminated at EOF", () => {
		expect(() => new Lexer('"abc').tokenize()).toThrow(
			/Unterminated string literal/,
		);
	});

	it("scans a closed triple-quoted string", () => {
		const tokens = new Lexer('"""abc\ndef"""').tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toBe('"""abc\ndef"""');
	});

	it("throws on a string with a trailing escaped backslash at EOF", () => {
		expect(() => new Lexer("'abc\\").tokenize()).toThrow(
			/Unterminated string literal/,
		);
	});
});

describe("Lexer f-strings", () => {
	it("scans a simple closed f-string", () => {
		const tokens = new Lexer('f"hello {name}"').tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toBe('f"hello {name}"');
	});

	it("scans a closed triple-quoted f-string", () => {
		const tokens = new Lexer('f"""hello\n{name}"""').tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toBe('f"""hello\n{name}"""');
	});

	it("throws on a raw newline inside a single-quoted f-string", () => {
		expect(() => new Lexer('f"abc\ndef"').tokenize()).toThrow(
			/Unterminated f-string literal/,
		);
	});

	it("throws when a triple-quoted f-string is unterminated at EOF", () => {
		expect(() => new Lexer('f"""abc').tokenize()).toThrow(
			/Unterminated triple-quoted f-string literal/,
		);
	});

	it("throws when a single-quoted f-string is unterminated at EOF", () => {
		expect(() => new Lexer('f"abc').tokenize()).toThrow(
			/Unterminated f-string literal/,
		);
	});

	it("handles escape sequences inside an f-string", () => {
		const tokens = new Lexer('f"a\\nb {x}"').tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toBe('f"a\\nb {x}"');
	});

	it("does not treat a closing quote inside braces as the string end", () => {
		const tokens = new Lexer("f\"{d['key']}\"").tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toContain("d['key']");
	});

	it("throws on an f-string with a trailing escaped backslash at EOF", () => {
		expect(() => new Lexer('f"abc\\').tokenize()).toThrow(
			/Unterminated f-string literal/,
		);
	});

	it("does not go negative on a stray closing brace outside any replacement field", () => {
		const tokens = new Lexer('f"abc}def"').tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toBe('f"abc}def"');
	});
});

describe("Lexer prefixed strings", () => {
	it("scans a closed raw triple-quoted string", () => {
		const tokens = new Lexer('r"""abc\ndef"""').tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toBe('r"""abc\ndef"""');
	});

	it("scans a closed rb-prefixed string", () => {
		const tokens = new Lexer('rb"abc"').tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toBe('rb"abc"');
	});

	it("throws on a raw newline inside a single-quoted prefixed string", () => {
		expect(() => new Lexer("r'abc\ndef'").tokenize()).toThrow(
			/Unterminated string literal/,
		);
	});

	it("handles a trailing escaped backslash at EOF in a prefixed string", () => {
		const tokens = new Lexer("r'abc\\").tokenize();
		const strTok = tokens.find((t) => t.type === TokenType.STRING);
		expect(strTok?.value).toBe("r'abc\\");
	});
});

describe("Lexer numbers", () => {
	it("strips underscores from hex literals", () => {
		const tokens = new Lexer("0xFF_FF").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("0xFFFF");
	});

	it("strips underscores from octal literals", () => {
		const tokens = new Lexer("0o17_17").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("0o1717");
	});

	it("strips underscores from binary literals", () => {
		const tokens = new Lexer("0b10_10").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("0b1010");
	});

	it("stops scanning a hex literal at a non-hex, non-underscore character", () => {
		const tokens = new Lexer("0xFF + 1").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("0xFF");
	});

	it("strips underscores from the integer part of a decimal literal", () => {
		const tokens = new Lexer("1_000_000").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("1000000");
	});

	it("strips underscores from the fractional part of a decimal literal", () => {
		const tokens = new Lexer("1.0_1").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("1.01");
	});

	it("strips underscores from the exponent of a scientific notation literal", () => {
		const tokens = new Lexer("1e1_0").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("1e10");
	});

	it("scans a leading-dot float literal (.5)", () => {
		const tokens = new Lexer(".5").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe(".5");
	});

	it("scans a trailing-dot float literal (5.) with no digits after the dot", () => {
		const tokens = new Lexer("5.").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("5.");
	});

	it("scans a trailing-dot float followed by an exponent (5.e3)", () => {
		const tokens = new Lexer("5.e3").tokenize();
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("5.e3");
	});

	it("treats a second dot after a trailing-dot float as attribute access (5..real)", () => {
		const tokens = new Lexer("5..real").tokenize();
		expect(tokens.map((t) => t.type)).toEqual([
			TokenType.NUMBER,
			TokenType.DOT,
			TokenType.NAME,
			TokenType.EOF,
		]);
		const numTok = tokens.find((t) => t.type === TokenType.NUMBER);
		expect(numTok?.value).toBe("5.");
	});
});

describe("Lexer operators", () => {
	it("scans the three-character ^= is not valid, but three-char operators work", () => {
		expect(tokenTypes("x <<= 1")).toContain(TokenType.LEFTSHIFTEQUAL);
		expect(tokenTypes("x >>= 1")).toContain(TokenType.RIGHTSHIFTEQUAL);
		expect(tokenTypes("x **= 1")).toContain(TokenType.DOUBLESTAREQUAL);
		expect(tokenTypes("x //= 1")).toContain(TokenType.DOUBLESLASHEQUAL);
		expect(tokenTypes("...")).toContain(TokenType.ELLIPSIS);
	});

	it("scans the ^= compound assignment operator", () => {
		expect(tokenTypes("x ^= 1")).toContain(TokenType.CIRCUMFLEXEQUAL);
	});

	it("scans a trailing ^= at end of source (only 2 chars remain)", () => {
		expect(tokenTypes("x ^=")).toContain(TokenType.CIRCUMFLEXEQUAL);
	});

	it("handles a backslash-newline line continuation", () => {
		const tokens = new Lexer("x = 1 + \\\n    2\n").tokenize();
		const types = tokens.map((t) => t.type);
		expect(types).not.toContain(undefined);
		expect(types.filter((t) => t === TokenType.NEWLINE).length).toBeGreaterThan(
			0,
		);
	});

	it("throws on a backslash not followed by a newline", () => {
		expect(() => new Lexer("x = 1 \\ 2\n").tokenize()).toThrow(
			/Unexpected character/,
		);
	});

	it("throws on a genuinely unexpected character", () => {
		expect(() => new Lexer("x = $\n").tokenize()).toThrow(
			/Unexpected character/,
		);
	});
});
