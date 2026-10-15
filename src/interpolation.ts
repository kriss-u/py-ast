/**
 * Character-level scanning of f-string/t-string bodies (PEP 701/750), shared
 * by the lexer (to find where an interpolated-string token ends) and the
 * parser (to split each `{...}` replacement field into its expression,
 * conversion, and format spec).
 *
 * Python's tokenizer switches between three modes while inside one of these
 * literals, and a scan that ignores them goes wrong on valid code:
 *
 * - literal text, where `{{`/`}}` are escaped braces and the enclosing
 *   quote ends the literal;
 * - a replacement field's expression, where quotes start nested string
 *   literals (possibly reusing the enclosing quote character, or being
 *   f-strings themselves), `#` starts a comment, newlines are allowed even
 *   in a single-quoted literal, and brackets nest;
 * - a format spec (after a top-level `:` in a field), which is literal text
 *   again (a `"`, `#`, or `!r` there is just text) except that `{expr}`
 *   opens a nested field and a single `}` ends the spec.
 *
 * @module
 */

/** How an f-string/t-string body being scanned is delimited. */
export interface QuoteContext {
	/** The quote character (`'` or `"`) that opened the literal. */
	quote: string;
	/** Whether the literal is triple-quoted, which also permits raw newlines in its literal text. */
	triple: boolean;
	/** Whether the literal is raw (`r` prefix), where `\N{...}` isn't an escape. */
	raw: boolean;
}

/**
 * Where the parts of one `{...}` replacement field sit, as indices into the
 * scanned text.
 */
export interface FieldBounds {
	/** Index of the top-level `!` that introduces a conversion, or `-1` if there is none. */
	conversion: number;
	/** Index of the top-level `:` that introduces a format spec, or `-1` if there is none. */
	formatSpec: number;
	/** Index of the field's closing `}`, or `-1` if the field is unterminated. */
	end: number;
}

const STRING_PREFIXES = new Set([
	"r",
	"u",
	"b",
	"br",
	"rb",
	"f",
	"fr",
	"rf",
	"t",
	"tr",
	"rt",
]);

/**
 * Builds the {@link QuoteContext} for a string literal whose opening quote
 * is at `text[quoteIndex]`.
 * @param text The text containing the literal.
 * @param quoteIndex Index of the literal's (first) opening quote character.
 * @param prefix The literal's prefix letters (e.g. `"rf"`), case-insensitive.
 * @returns The literal's quote character, triple-quotedness, and rawness.
 */
export function quoteContextAt(
	text: string,
	quoteIndex: number,
	prefix: string,
): QuoteContext {
	const quote = text[quoteIndex];
	return {
		quote,
		triple: text[quoteIndex + 1] === quote && text[quoteIndex + 2] === quote,
		raw: /r/i.test(prefix),
	};
}

/** Whether the literal described by `ctx` closes at `text[i]`. */
function closesAt(text: string, i: number, ctx: QuoteContext): boolean {
	return (
		text[i] === ctx.quote &&
		(!ctx.triple || (text[i + 1] === ctx.quote && text[i + 2] === ctx.quote))
	);
}

/**
 * Scans an f-string/t-string body starting just past its opening quote(s).
 * @param text The text containing the literal.
 * @param start Index of the first character of the body.
 * @param ctx The literal's quote context.
 * @returns The index just past the closing quote(s), or `-1` if the literal
 * is unterminated (end of text, a raw newline in a single-quoted literal's
 * text, or an unterminated field).
 */
export function scanInterpolatedBody(
	text: string,
	start: number,
	ctx: QuoteContext,
): number {
	const close = scanLiteralText(text, start, ctx, false);
	return close === -1 ? -1 : close + (ctx.triple ? 3 : 1);
}

/**
 * Scans literal text (an f-string's own text, or a field's format spec) up
 * to its terminator, skipping over every nested replacement field.
 * @param text The text being scanned.
 * @param start Index to start scanning at.
 * @param ctx The enclosing literal's quote context.
 * @param inFormatSpec Whether this is a format spec, which ends at a single
 * `}` and doesn't treat `{{`/`}}` as escapes.
 * @returns The index of the terminator (the closing quote, or for a format
 * spec its closing `}`), or `-1` if none is found.
 */
function scanLiteralText(
	text: string,
	start: number,
	ctx: QuoteContext,
	inFormatSpec: boolean,
): number {
	let i = start;
	while (i < text.length) {
		const c = text[i];
		if (c === "\\") {
			// `\N{...}` is a named-unicode escape whose braces don't open a
			// field. Any other `\{`/`\}` isn't an escape at all (CPython keeps
			// the backslash literally), so the brace still opens/closes a
			// field and the backslash mustn't swallow it.
			if (!ctx.raw && text[i + 1] === "N" && text[i + 2] === "{") {
				const nameEnd = text.indexOf("}", i + 3);
				if (nameEnd === -1) return -1;
				i = nameEnd + 1;
			} else {
				i += text[i + 1] === "{" || text[i + 1] === "}" ? 1 : 2;
			}
			continue;
		}
		if (c === "{") {
			if (!inFormatSpec && text[i + 1] === "{") {
				i += 2;
				continue;
			}
			const { end } = scanField(text, i, ctx);
			if (end === -1) return -1;
			i = end + 1;
			continue;
		}
		if (c === "}") {
			if (inFormatSpec) return i;
			i += text[i + 1] === "}" ? 2 : 1;
			continue;
		}
		if (closesAt(text, i, ctx)) return inFormatSpec ? -1 : i;
		if (c === "\n" && !ctx.triple) return -1;
		i++;
	}
	return -1;
}

/**
 * Scans one `{...}` replacement field, locating its top-level conversion
 * `!`, format-spec `:`, and closing `}`. Nested brackets, string literals
 * (including nested f-strings/t-strings), and `#` comments inside the
 * expression are skipped so their characters never count as field syntax.
 * @param text The text being scanned.
 * @param open Index of the field's opening `{`.
 * @param ctx The enclosing literal's quote context (needed to scan the format spec).
 * @returns The positions of the field's parts.
 */
export function scanField(
	text: string,
	open: number,
	ctx: QuoteContext,
): FieldBounds {
	let depth = 0;
	let conversion = -1;
	let i = open + 1;
	while (i < text.length) {
		const c = text[i];
		if (c === "#") {
			while (i < text.length && text[i] !== "\n") i++;
			continue;
		}
		if (c === "\\") {
			i += 2;
			continue;
		}
		const skipped = skipLiteralOrWord(text, i);
		if (skipped !== undefined) {
			i = skipped;
			continue;
		}
		if (c === "(" || c === "[" || c === "{") {
			depth++;
		} else if (c === ")" || c === "]") {
			depth--;
		} else if (c === "}") {
			if (depth === 0) return { conversion, formatSpec: -1, end: i };
			depth--;
		} else if (depth === 0 && c === "!" && text[i + 1] !== "=") {
			conversion = i;
		} else if (depth === 0 && c === ":") {
			const end = scanLiteralText(text, i + 1, ctx, true);
			return { conversion, formatSpec: i, end };
		}
		i++;
	}
	return { conversion, formatSpec: -1, end: -1 };
}

/**
 * Skips a (possibly prefixed) string literal or an identifier starting at
 * `text[i]`, so the characters inside either are never mistaken for field
 * syntax. An identifier is skipped whole so a string prefix (`rf"..."`) is
 * recognized only at the start of a word.
 * @param text The text being scanned.
 * @param i The index to look at.
 * @returns The index just past the literal or identifier (`text.length` for
 * an unterminated literal), or `undefined` if neither starts at `i`.
 */
function skipLiteralOrWord(text: string, i: number): number | undefined {
	if (text[i] === '"' || text[i] === "'") return skipStringLiteral(text, i, "");
	if (!/\p{ID_Continue}/u.test(text[i])) return undefined;
	let wordEnd = i + 1;
	while (wordEnd < text.length && /\p{ID_Continue}/u.test(text[wordEnd])) {
		wordEnd++;
	}
	const word = text.slice(i, wordEnd);
	const quoted = text[wordEnd] === '"' || text[wordEnd] === "'";
	return quoted && STRING_PREFIXES.has(word.toLowerCase())
		? skipStringLiteral(text, wordEnd, word)
		: wordEnd;
}

/**
 * Skips a string literal nested inside a replacement field's expression.
 * @param text The text being scanned.
 * @param quoteIndex Index of the literal's opening quote (just past any prefix).
 * @param prefix The literal's prefix letters, which decide whether it is
 * itself an f-string/t-string to scan recursively.
 * @returns The index just past the literal's closing quote(s), or
 * `text.length` if it is unterminated (which leaves the enclosing field
 * unterminated too).
 */
function skipStringLiteral(
	text: string,
	quoteIndex: number,
	prefix: string,
): number {
	const ctx = quoteContextAt(text, quoteIndex, prefix);
	const start = quoteIndex + (ctx.triple ? 3 : 1);
	if (/[ft]/i.test(prefix)) {
		const end = scanInterpolatedBody(text, start, ctx);
		return end === -1 ? text.length : end;
	}
	for (let i = start; i < text.length; i++) {
		if (text[i] === "\\") {
			i++;
		} else if (closesAt(text, i, ctx)) {
			return i + (ctx.triple ? 3 : 1);
		} else if (text[i] === "\n" && !ctx.triple) {
			break;
		}
	}
	return text.length;
}

/**
 * Removes `#` comments from a replacement field's expression text (each up
 * to, not including, its newline), leaving string literals intact. CPython
 * drops them from both a t-string `Interpolation.str` and a self-documenting
 * field's `expr=` text.
 * @param text A replacement field's expression text.
 * @returns The text without its comments.
 */
export function stripComments(text: string): string {
	let out = "";
	let i = 0;
	while (i < text.length) {
		if (text[i] === "#") {
			while (i < text.length && text[i] !== "\n") i++;
			continue;
		}
		const end = skipLiteralOrWord(text, i) ?? i + 1;
		out += text.slice(i, end);
		i = end;
	}
	return out;
}
