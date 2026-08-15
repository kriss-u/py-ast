import type { ASTNodeUnion } from "py-ast";
import { memo, useMemo } from "react";
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

/** No-op ref registration, used to keep record-keeping-only subtrees out of the scroll-target map. */
function noopRegisterRef() {}

/** Stable shared reference so record-keeping-only subtrees (never active) short-circuit the memo comparator below. */
const EMPTY_PATH: readonly unknown[] = [];

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

/** A single row's data, rendered as one combined element by {@link GutterAndLine}. */
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

/**
 * Renders one row as a single flex element: a fixed-width gutter cell
 * (line number + fold arrow) beside the content cell — both direct
 * siblings under one row `<div>`, not routed through separate DOM subtrees.
 * The gutter cell is pinned with `position: sticky; left: 0` (see
 * `.json-row` in styles.css) so it stays put as the row scrolls
 * horizontally, without needing a portal to give the content its own
 * independent scroll container.
 */
function GutterAndLine({ row }: { row: Row }) {
	return (
		<div className="json-row" data-active={row.isActive || undefined}>
			<div className="json-gutter">
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
			<div ref={row.registerRef} className="json-line">
				{row.content}
			</div>
		</div>
	);
}

interface JsonNodeProps {
	label: string | null;
	value: unknown;
	depth: number;
	trailingComma: boolean;
	keyPrefix: string;
	lineNumbers: Map<string, number>;
	expanded: Set<unknown>;
	/** See {@link BaseNodeViewProps.expandedChangePath} in TreeView.tsx. */
	expandedChangePath: readonly unknown[] | null;
	toggle: (key: unknown) => void;
	activeNode: ASTNodeUnion | null;
	/** See {@link BaseNodeViewProps.activeContainerPath} in TreeView.tsx. */
	activeContainerPath: readonly unknown[];
	registerRef: (key: unknown, el: HTMLDivElement | null) => void;
	/**
	 * Set while descending into an active node's expanded children, so every
	 * row belonging to its block (not just its own header/close lines) is
	 * rendered active — matching {@link TreeView}'s whole-block highlight.
	 */
	forceActive: boolean;
}

/**
 * True if `path` (an old-or-new snapshot of an active/change path) proves
 * `value`'s row can't be affected — i.e. `value` isn't on it. `null` means
 * "can't narrow" (a bulk change with no single path), which never proves
 * anything.
 */
function pathClearsValue(path: readonly unknown[] | null, value: unknown): boolean {
	return path !== null && !path.includes(value);
}

/**
 * Custom equality for {@link JsonNode}'s `memo` wrapper — mirrors
 * `NodeRenderer`'s comparator (see that file's docstring for the full
 * rationale). Without it, every row's `activeNode`/`activeContainerPath` prop
 * (cursor moves) and `expanded`/`expandedChangePath` prop (fold toggles)
 * would appear to change on every such interaction (they're threaded
 * uniformly down the whole tree), forcing a full re-render of a potentially
 * huge expanded JSON view just to move a highlight or fold one row. A row
 * only needs to reconsider its output for one of those changes if it was on
 * the old path, is on the new path, the change couldn't be narrowed to a
 * path at all (a bulk expand-all/collapse-all/reparse), or `forceActive`
 * itself changed (the active *container* flipping its whole-block highlight
 * on/off for its children).
 */
function jsonNodePropsEqual(prev: JsonNodeProps, next: JsonNodeProps): boolean {
	if (
		prev.value !== next.value ||
		prev.label !== next.label ||
		prev.depth !== next.depth ||
		prev.trailingComma !== next.trailingComma ||
		prev.keyPrefix !== next.keyPrefix ||
		prev.lineNumbers !== next.lineNumbers ||
		prev.toggle !== next.toggle ||
		prev.registerRef !== next.registerRef ||
		prev.forceActive !== next.forceActive
	) {
		return false;
	}
	if (
		prev.expanded !== next.expanded &&
		!(pathClearsValue(prev.expandedChangePath, prev.value) && pathClearsValue(next.expandedChangePath, next.value))
	) {
		return false;
	}
	if (prev.activeContainerPath === next.activeContainerPath) {
		return true;
	}
	return !prev.activeContainerPath.includes(prev.value) && !next.activeContainerPath.includes(next.value);
}

/**
 * Recursively renders `value` as a sequence of rows (via
 * {@link GutterAndLine}). Returns a fragment (not a wrapper element) so a
 * container's rows and its children's rows all stack in document order as
 * flat siblings, matching a real code view.
 */
function JsonNodeImpl(props: JsonNodeProps) {
	const {
		label,
		value,
		depth,
		trailingComma,
		keyPrefix,
		lineNumbers,
		expanded,
		expandedChangePath,
		toggle,
		activeNode,
		activeContainerPath,
		registerRef,
		forceActive,
	} = props;
	const indent = { paddingLeft: depth * 14 };
	const labelNode = label !== null ? <span className="node-label">"{label}": </span> : null;

	// AST nodes and plain objects render identically here — a pure JSON view
	// has no notion of "AST node" beyond it being an object with a
	// `nodeType` field like any other, exactly as `JSON.stringify` would
	// show it.
	if (value !== null && typeof value === "object") {
		const isArray = Array.isArray(value);
		const entries: Entry[] = isArray
			? value.map((item, index): Entry => ({ key: String(index), label: null, value: item }))
			: Object.entries(value).map(([name, v]): Entry => ({ key: name, label: name, value: v }));
		const bracketOpen = isArray ? "[" : "{";
		const bracketClose = isArray ? "]" : "}";
		const isEmpty = entries.length === 0;
		const isOpen = expanded.has(value);
		const isOwnActive = activeNode !== null && (value as ASTNodeUnion) === activeNode;
		const isActive = forceActive || isOwnActive;
		const closesInline = isEmpty || !isOpen;

		const headerKey = `${keyPrefix}#header`;
		const headerRow: Row = {
			key: headerKey,
			// biome-ignore lint/style/noNonNullAssertion: computeLineNumbers walks the exact same structure/keying, so every key it can reach here is always present.
			lineNumber: lineNumbers.get(headerKey)!,
			foldable: !isEmpty,
			isOpen,
			onToggle: !isEmpty ? () => toggle(value) : null,
			isActive,
			registerRef: (el) => registerRef(value, el),
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

		if (!isOpen || isEmpty) {
			return <GutterAndLine key={headerRow.key} row={headerRow} />;
		}

		const closeKey = `${keyPrefix}#close`;
		const closeRow: Row = {
			key: closeKey,
			// biome-ignore lint/style/noNonNullAssertion: see the header row's identical assertion.
			lineNumber: lineNumbers.get(closeKey)!,
			foldable: false,
			isOpen: false,
			onToggle: null,
			isActive,
			content: (
				<span style={indent}>
					<span className="node-bracket">{bracketClose}</span>
					{trailingComma && <span className="node-comma">,</span>}
				</span>
			),
		};

		return (
			<>
				<GutterAndLine key={headerRow.key} row={headerRow} />
				{entries.map((entry, i) => {
					const isRecordKeepingOnly = entry.key === RECORD_KEEPING_ONLY_FIELD;
					return (
						<JsonNode
							key={entry.key}
							label={entry.label}
							value={entry.value}
							depth={depth + 1}
							trailingComma={i < entries.length - 1}
							keyPrefix={`${keyPrefix}.${entry.key}`}
							lineNumbers={lineNumbers}
							expanded={expanded}
							expandedChangePath={expandedChangePath}
							toggle={toggle}
							activeNode={isRecordKeepingOnly ? null : activeNode}
							activeContainerPath={isRecordKeepingOnly ? EMPTY_PATH : activeContainerPath}
							registerRef={isRecordKeepingOnly ? noopRegisterRef : registerRef}
							forceActive={isRecordKeepingOnly ? false : isActive}
						/>
					);
				})}
				<GutterAndLine key={closeRow.key} row={closeRow} />
			</>
		);
	}

	const row: Row = {
		key: keyPrefix,
		// biome-ignore lint/style/noNonNullAssertion: computeLineNumbers walks the exact same structure/keying, so every key it can reach here is always present.
		lineNumber: lineNumbers.get(keyPrefix)!,
		foldable: false,
		isOpen: false,
		onToggle: null,
		isActive: forceActive,
		content: (
			<span style={indent}>
				{labelNode}
				<Leaf value={value} />
				{trailingComma && <span className="node-comma">,</span>}
			</span>
		),
	};
	return <GutterAndLine key={keyPrefix} row={row} />;
}

const JsonNode = memo(JsonNodeImpl, jsonNodePropsEqual);

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
 * Each row is a single element (see {@link GutterAndLine}) with the gutter
 * cell pinned via `position: sticky; left: 0`, so the outer pane is the
 * only scroll container, on both axes — its horizontal scrollbar always
 * renders at the bottom of the viewport (never the content's full height,
 * which for a large file would put it far off-screen) and the gutter stays
 * visually in place as that scroll moves.
 *
 * Fold state (`expanded`/`toggle`/`registerRef`) is lifted to the caller so
 * it can be shared with {@link TreeView} and driven by a global
 * expand-all/collapse-all action.
 */
export function JsonCodeView({
	tree,
	activeNode,
	activeContainerPath,
	expanded,
	expandedChangePath,
	toggle,
	registerRef,
}: BaseNodeViewProps) {
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

	return (
		<div
			className="node-view json-code-view"
			style={{ "--json-linenum-width": `${maxLineNumberDigits}ch` } as React.CSSProperties}
		>
			<JsonNode
				label={null}
				value={tree}
				depth={0}
				trailingComma={false}
				keyPrefix="root"
				lineNumbers={lineNumbers}
				expanded={expanded}
				expandedChangePath={expandedChangePath}
				toggle={toggle}
				activeNode={activeNode}
				activeContainerPath={activeContainerPath}
				registerRef={registerRef}
				forceActive={false}
			/>
		</div>
	);
}
