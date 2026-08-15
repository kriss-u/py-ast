import { type Module, parsePython } from "py-ast";

/** A syntax error surfaced by the parser, with source position when available. */
export interface ParseFailure {
	message: string;
	line?: number;
	column?: number;
}

/** The result of attempting to parse Python source: either a tree or a failure. */
export type ParseResult =
	| { ok: true; tree: Module }
	| { ok: false; error: ParseFailure };

/**
 * Parses Python source into an AST, catching syntax errors instead of throwing.
 * @param source Python source code to parse.
 * @param comments Whether to attach comment nodes to the tree.
 * @returns A discriminated result carrying either the parsed tree or a failure description.
 */
export function tryParse(source: string, comments: boolean): ParseResult {
	try {
		const tree = parsePython(source, { comments });
		return { ok: true, tree };
	} catch (caught) {
		if (caught instanceof Error) {
			const located = caught as Error & { lineno?: number; col_offset?: number };
			return {
				ok: false,
				error: {
					message: located.message,
					line: located.lineno,
					column: located.col_offset,
				},
			};
		}
		return { ok: false, error: { message: String(caught) } };
	}
}
