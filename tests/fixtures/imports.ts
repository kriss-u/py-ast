/**
 * Shared fixture for relative-import leading-dot-count tests: how many
 * leading dots precede a module name in a `from`-import, and the
 * `ImportFrom.level`/`module` it should produce.
 *
 * Covers 1-7 dots. Verified against CPython 3.13: the lexer tokenizes any
 * run of 3+ dots as one or more `...` (ELLIPSIS) tokens rather than that
 * many DOT tokens, so e.g. 4 dots comes through as ELLIPSIS + DOT — the
 * parser must still recover the correct total dot count.
 */
export interface RelativeImportDotCase {
	dots: number;
	code: string;
	expectedLevel: number;
	expectedModule: string;
}

export const RELATIVE_IMPORT_DOT_CASES: RelativeImportDotCase[] = Array.from(
	{ length: 7 },
	(_, i) => {
		const dots = i + 1;
		return {
			dots,
			code: `from ${".".repeat(dots)}pkg import x`,
			expectedLevel: dots,
			expectedModule: "pkg",
		};
	},
);
