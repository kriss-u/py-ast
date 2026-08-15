/** A 1-indexed line / 0-indexed column source position, matching py-ast's `lineno`/`col_offset`. */
export interface SourcePosition {
	line: number;
	column: number;
}

/** An inclusive-start/exclusive-end source range used to drive editor highlight decorations. */
export interface SourceRange {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}
