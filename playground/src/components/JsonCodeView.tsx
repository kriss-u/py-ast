import type { ASTNodeUnion } from "py-ast";
import { useMemo } from "react";
import type { BaseNodeViewProps } from "./TreeView";

/** A single labeled child of a container, ready to render recursively. */
interface Entry {
	key: string;
	label: string | null;
	value: unknown;
}

/** Renders a leaf (primitive) JSON value with type-based syntax coloring. */
function Leaf({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="tok-null">null</span>;
	}
	if (typeof value === "string") {
		return <span className="tok-string">{JSON.stringify(value)}</span>;
	}
	if (typeof value === "boolean") {
		return <span className="tok-boolean">{String(value)}</span>;
	}
	if (typeof value === "number" || typeof value === "bigint") {
		return <span className="tok-number">{String(value)}</span>;
	}
	return <span className="tok-string">{String(value)}</span>;
}

/**
 * `Module.comments` duplicates the same `Comment` node objects that already
 * appear in their real position within `body`/`inlineComment` (see
 * NodeRenderer's identical note) — excluded here for the same reason: it
 * would otherwise steal the shared object's DOM ref and scroll/highlight
 * targeting.
 */
const RECORD_KEEPING_ONLY_FIELD = "comments";

/**
 * Walks `value` exactly as {@link renderRows}/{@link renderContainer} would
 * if every container were expanded, assigning each row (container headers,
 * closing brackets, and leaves) the line number it would have in that fully
 * expanded rendering. Keyed by the same `keyPrefix` scheme those functions
 * use for their row keys, so a render pass can look a row's stable number up
 * regardless of the *current* fold state.
 *
 * This is what makes line numbers behave like a real code editor's: folding
 * a block hides its lines rather than renumbering what comes after — the
 * next visible line keeps whatever number it would always have had.
 * @param root The full tree to number.
 * @returns A map from row key to its stable line number.
 */
function computeLineNumbers(root: unknown): Map<string, number> {
	const lineNumbers = new Map<string, number>();
	let next = 1;

	function visit(value: unknown, keyPrefix: string): void {
		if (Array.isArray(value)) {
			lineNumbers.set(`${keyPrefix}#header`, next++);
			value.forEach((item, index) => visit(item, `${keyPrefix}.${index}`));
			if (value.length > 0) {
				lineNumbers.set(`${keyPrefix}#close`, next++);
			}
			return;
		}
		if (value !== null && typeof value === "object") {
			const entries = Object.entries(value);
			lineNumbers.set(`${keyPrefix}#header`, next++);
			for (const [name, v] of entries) {
				visit(v, `${keyPrefix}.${name}`);
			}
			if (entries.length > 0) {
				lineNumbers.set(`${keyPrefix}#close`, next++);
			}
			return;
		}
		lineNumbers.set(keyPrefix, next++);
	}

	visit(root, "root");
	return lineNumbers;
}

/** A single gutter+content row pair, laid out as two cells of the shared code-view grid. */
interface Row {
	key: string;
	lineNumber: number;
	foldable: boolean;
	isOpen: boolean;
	onToggle: (() => void) | null;
	content: React.ReactNode;
	registerRef?: (el: HTMLDivElement | null) => void;
	isActive?: boolean;
}

function GutterAndLine({ row }: { row: Row }) {
	return (
		<>
			<div className="json-gutter" data-active={row.isActive || undefined}>
				<span className="json-linenum">{row.lineNumber}</span>
				{row.foldable ? (
					<button
						type="button"
						className="json-fold-arrow"
						aria-label={row.isOpen ? "Collapse" : "Expand"}
						aria-expanded={row.isOpen}
						onClick={row.onToggle ?? undefined}
					>
						{row.isOpen ? "▾" : "▸"}
					</button>
				) : (
					<span className="json-fold-arrow" aria-hidden="true" />
				)}
			</div>
			<div ref={row.registerRef} className="json-line" data-active={row.isActive || undefined}>
				{row.content}
			</div>
		</>
	);
}

interface RenderContext {
	lineNumbers: Map<string, number>;
	expanded: Set<unknown>;
	toggle: (key: unknown) => void;
	activeNode: ASTNodeUnion | null;
	registerRef: (key: unknown, el: HTMLDivElement | null) => void;
}

/**
 * Recursively renders `value` as a sequence of gutter+content row pairs
 * (flattened, not nested elements — the grid layout relies on every row
 * pair being a direct flow child of the shared `.json-code-grid`, matched up
 * by document order via CSS Grid's implicit row placement).
 */
function renderRows(
	label: string | null,
	value: unknown,
	depth: number,
	trailingComma: boolean,
	ctx: RenderContext,
	keyPrefix: string,
): React.ReactNode[] {
	const indent = { paddingLeft: depth * 14 };
	const labelNode = label !== null ? <span className="node-label">"{label}": </span> : null;

	if (Array.isArray(value)) {
		return renderContainer(
			labelNode,
			value,
			"[",
			"]",
			value.length === 0,
			value.map((item, index): Entry => ({ key: String(index), label: null, value: item })),
			depth,
			trailingComma,
			ctx,
			keyPrefix,
			indent,
		);
	}

	// AST nodes and plain objects render identically here — a pure JSON view
	// has no notion of "AST node" beyond it being an object with a
	// `nodeType` field like any other, exactly as `JSON.stringify` would
	// show it.
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value);
		return renderContainer(
			labelNode,
			value,
			"{",
			"}",
			entries.length === 0,
			entries.map(([name, v]): Entry => ({ key: name, label: name, value: v })),
			depth,
			trailingComma,
			ctx,
			keyPrefix,
			indent,
		);
	}

	const row: Row = {
		key: keyPrefix,
		// biome-ignore lint/style/noNonNullAssertion: computeLineNumbers walks the exact same structure/keying, so every key it can reach here is always present.
		lineNumber: ctx.lineNumbers.get(keyPrefix)!,
		foldable: false,
		isOpen: false,
		onToggle: null,
		content: (
			<span style={indent}>
				{labelNode}
				<Leaf value={value} />
				{trailingComma && <span className="node-comma">,</span>}
			</span>
		),
	};
	return [<GutterAndLine key={keyPrefix} row={row} />];
}

function renderContainer(
	labelNode: React.ReactNode,
	value: object,
	bracketOpen: string,
	bracketClose: string,
	isEmpty: boolean,
	entries: readonly Entry[],
	depth: number,
	trailingComma: boolean,
	ctx: RenderContext,
	keyPrefix: string,
	indent: React.CSSProperties,
): React.ReactNode[] {
	const isOpen = ctx.expanded.has(value);
	const isActive = ctx.activeNode !== null && (value as ASTNodeUnion) === ctx.activeNode;
	const closesInline = isEmpty || !isOpen;

	const rows: React.ReactNode[] = [];

	const headerKey = `${keyPrefix}#header`;
	const headerRow: Row = {
		key: headerKey,
		// biome-ignore lint/style/noNonNullAssertion: see renderRows's identical assertion.
		lineNumber: ctx.lineNumbers.get(headerKey)!,
		foldable: !isEmpty,
		isOpen,
		onToggle: !isEmpty ? () => ctx.toggle(value) : null,
		isActive,
		registerRef: (el) => ctx.registerRef(value, el),
		content: (
			<span style={indent}>
				{labelNode}
				<span className="node-bracket">{bracketOpen}</span>
				{!isOpen && !isEmpty && <span className="node-ellipsis">…</span>}
				{closesInline && <span className="node-bracket">{bracketClose}</span>}
				{closesInline && trailingComma && <span className="node-comma">,</span>}
			</span>
		),
	};
	rows.push(<GutterAndLine key={headerRow.key} row={headerRow} />);

	if (isOpen && !isEmpty) {
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const isRecordKeepingOnly = entry.key === RECORD_KEEPING_ONLY_FIELD;
			rows.push(
				...renderRows(
					entry.label,
					entry.value,
					depth + 1,
					i < entries.length - 1,
					isRecordKeepingOnly ? { ...ctx, activeNode: null, registerRef: () => {} } : ctx,
					`${keyPrefix}.${entry.key}`,
				),
			);
		}

		const closeKey = `${keyPrefix}#close`;
		const closeRow: Row = {
			key: closeKey,
			// biome-ignore lint/style/noNonNullAssertion: see renderRows's identical assertion.
			lineNumber: ctx.lineNumbers.get(closeKey)!,
			foldable: false,
			isOpen: false,
			onToggle: null,
			content: (
				<span style={indent}>
					<span className="node-bracket">{bracketClose}</span>
					{trailingComma && <span className="node-comma">,</span>}
				</span>
			),
		};
		rows.push(<GutterAndLine key={closeRow.key} row={closeRow} />);
	}

	return rows;
}

/**
 * Code-editor-style read-only view of the parsed AST as JSON: a fixed
 * gutter (stable line numbers + fold arrows) beside a selectable,
 * non-editable content pane — as distinct from {@link TreeView}'s inline
 * `+`/`−` disclosure style. Folding is triggered only from the gutter arrow,
 * so clicking/selecting text in the content pane never toggles a fold. Line
 * numbers are stable across folding (see {@link computeLineNumbers}): they
 * depend only on the tree's structure, not on which parts are currently
 * expanded, so folding a block hides its line numbers rather than shifting
 * every later line's number down to fill the gap.
 *
 * Fold state (`expanded`/`toggle`/`registerRef`) is lifted to the caller so
 * it can be shared with {@link TreeView} and driven by a global
 * expand-all/collapse-all action.
 */
export function JsonCodeView({ tree, activeNode, expanded, toggle, registerRef }: BaseNodeViewProps) {
	const lineNumbers = useMemo(() => computeLineNumbers(tree), [tree]);
	// The gutter's width is fixed to the widest line number in the *whole*
	// (fully expanded) tree, computed once here — since folding only hides
	// numbers rather than replacing them with smaller ones (line numbers are
	// stable, see computeLineNumbers), the gutter never needs to resize as
	// you fold/unfold.
	const maxLineNumberDigits = useMemo(() => {
		let max = 1;
		for (const n of lineNumbers.values()) {
			if (n > max) {
				max = n;
			}
		}
		return String(max).length;
	}, [lineNumbers]);

	const ctx: RenderContext = {
		lineNumbers,
		expanded,
		toggle,
		activeNode,
		registerRef,
	};

	const rows = renderRows(null, tree, 0, false, ctx, "root");

	return (
		<div className="node-view json-code-view">
			<div
				className="json-code-grid"
				style={{ "--json-linenum-width": `${maxLineNumberDigits}ch` } as React.CSSProperties}
			>
				{rows}
			</div>
		</div>
	);
}
