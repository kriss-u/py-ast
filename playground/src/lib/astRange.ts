import { type ASTNodeUnion, isASTNode } from "py-ast";
import type { SourcePosition, SourceRange } from "./types";

/**
 * `Module.comments` is a flat, parser-attached duplicate list of every
 * comment in the file (in addition to comments appearing in their real
 * position within `body`/`inlineComment`). It must be excluded from
 * position-based tree walking, or a comment's flat-list copy can outrank its
 * real nested occurrence and hijack cursor->tree resolution.
 */
const EXCLUDED_FIELDS = new Set(["comments"]);

/**
 * Yields `node`'s child AST nodes, like py-ast's `iterChildNodes`, but
 * additionally excludes {@link EXCLUDED_FIELDS}.
 * @param node The AST node whose children to iterate.
 * @returns The node's child AST nodes, field-declaration order.
 */
function childNodes(node: ASTNodeUnion): ASTNodeUnion[] {
	const result: ASTNodeUnion[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (
			key === "nodeType" ||
			key === "lineno" ||
			key === "col_offset" ||
			key === "end_lineno" ||
			key === "end_col_offset" ||
			EXCLUDED_FIELDS.has(key)
		) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				if (isASTNode(item)) {
					result.push(item);
				}
			}
		} else if (isASTNode(value)) {
			result.push(value);
		}
	}
	return result;
}

/**
 * Reads a node's own start position, or `null` if it lacks location info.
 * A handful of node types genuinely have none in CPython's `ast` (and so
 * none here either) — `Arguments`, `Comprehension`, `MatchCase`, `WithItem`,
 * and the `Load`/`Store`/operator singletons — so callers that need a
 * position for one of these must fall back to a positioned ancestor or
 * descendant; see {@link effectiveStart}/{@link effectiveEnd} and
 * {@link nearestPositioned}.
 * @param node The AST node to read location attributes from.
 * @returns The node's start position, or `null` when unavailable.
 */
function ownStart(node: ASTNodeUnion): SourcePosition | null {
	const { lineno, col_offset } = node;
	if (lineno === undefined || col_offset === undefined) {
		return null;
	}
	return { line: lineno, column: col_offset };
}

/**
 * Reads a node's own end position, or `null` if it lacks location info (see
 * {@link ownStart}).
 * @param node The AST node to read location attributes from.
 * @returns The node's end position, or `null` when unavailable.
 */
function ownEnd(node: ASTNodeUnion): SourcePosition | null {
	const node_ = node as ASTNodeUnion & {
		end_lineno?: number;
		end_col_offset?: number;
	};
	const { end_lineno, end_col_offset } = node_;
	if (end_lineno === undefined || end_col_offset === undefined) {
		return null;
	}
	return { line: end_lineno, column: end_col_offset };
}

const effectiveStartCache = new WeakMap<ASTNodeUnion, SourcePosition | null>();
const effectiveEndCache = new WeakMap<ASTNodeUnion, SourcePosition | null>();

/**
 * A node's start position for ordering/containment purposes: its own
 * position when available, otherwise the earliest position among its
 * descendants. This lets location-less nodes (e.g. `Arguments`) still sort
 * and hit-test correctly relative to their located siblings.
 * @param node The AST node to compute an effective start for.
 * @returns The effective start position, or `null` if no located node exists in `node`'s subtree.
 */
function effectiveStart(node: ASTNodeUnion): SourcePosition | null {
	const cached = effectiveStartCache.get(node);
	if (cached !== undefined) {
		return cached;
	}
	const own = ownStart(node);
	let result = own;
	if (!result) {
		for (const child of childNodes(node)) {
			const childStart = effectiveStart(child);
			if (childStart && (!result || comparePositions(childStart, result) < 0)) {
				result = childStart;
			}
		}
	}
	effectiveStartCache.set(node, result);
	return result;
}

/**
 * A node's end position for containment purposes: its own end when
 * available, otherwise the latest end position among its descendants.
 * Mirrors {@link effectiveStart} for the trailing edge.
 * @param node The AST node to compute an effective end for.
 * @returns The effective end position, or `null` if no located node exists in `node`'s subtree.
 */
function effectiveEnd(node: ASTNodeUnion): SourcePosition | null {
	const cached = effectiveEndCache.get(node);
	if (cached !== undefined) {
		return cached;
	}
	const own = ownEnd(node);
	let result = own;
	if (!result) {
		for (const child of childNodes(node)) {
			const childEnd = effectiveEnd(child);
			if (childEnd && (!result || comparePositions(childEnd, result) > 0)) {
				result = childEnd;
			}
		}
	}
	effectiveEndCache.set(node, result);
	return result;
}

/**
 * Compares two source positions in document order.
 * @param a The first position.
 * @param b The second position.
 * @returns A negative number if `a` precedes `b`, positive if it follows, `0` if equal.
 */
function comparePositions(a: SourcePosition, b: SourcePosition): number {
	return a.line !== b.line ? a.line - b.line : a.column - b.column;
}

/**
 * Returns `node`'s children in actual source order (by {@link effectiveStart}),
 * since field-declaration order doesn't always match source order (e.g.
 * `FunctionDef.returns` is declared after `body` but appears before it).
 * @param node The node whose children to order.
 * @returns Children paired with their effective start/end, sorted ascending; children without any located descendant are omitted.
 */
function orderedChildren(
	node: ASTNodeUnion,
): Array<{ node: ASTNodeUnion; start: SourcePosition; end: SourcePosition | null }> {
	const withStart: Array<{ node: ASTNodeUnion; start: SourcePosition; end: SourcePosition | null }> = [];
	for (const child of childNodes(node)) {
		const start = effectiveStart(child);
		if (start) {
			withStart.push({ node: child, start, end: effectiveEnd(child) });
		}
	}
	withStart.sort((a, b) => comparePositions(a.start, b.start));
	return withStart;
}

/**
 * Finds the path of AST nodes (root to innermost) that most specifically
 * contains `position`: at each level, descends into whichever child's own
 * `[start, end)` range actually contains `position`, so hovering in a gap
 * between two children (e.g. trailing whitespace, a comment) stops at the
 * enclosing node instead of incorrectly snapping to whichever child merely
 * starts earliest.
 * @param root The tree to search.
 * @param position The source position to locate.
 * @returns The path from `root` to the innermost matching node.
 */
export function findNodePath(root: ASTNodeUnion, position: SourcePosition): ASTNodeUnion[] {
	const path = [root];
	let current = root;
	while (true) {
		let chosen: ASTNodeUnion | null = null;
		for (const { node, start, end } of orderedChildren(current)) {
			if (comparePositions(start, position) > 0) {
				break;
			}
			if (end === null || comparePositions(position, end) < 0) {
				chosen = node;
			}
		}
		if (!chosen) {
			break;
		}
		path.push(chosen);
		current = chosen;
	}
	return path;
}

/**
 * Finds the path of nodes from `root` to `target` (inclusive), by identity.
 * @param root The subtree to search.
 * @param target The node to find.
 * @returns The path from `root` to `target`, or `null` if `target` isn't in `root`'s subtree.
 */
function pathTo(root: ASTNodeUnion, target: ASTNodeUnion): ASTNodeUnion[] | null {
	if (root === target) {
		return [root];
	}
	for (const child of childNodes(root)) {
		const sub = pathTo(child, target);
		if (sub) {
			return [root, ...sub];
		}
	}
	return null;
}

/**
 * Finds the path of every *container* — arrays and objects alike, not just
 * AST nodes — from `root` to `target` (inclusive), by identity. Unlike
 * {@link pathTo}/`findNodePath`'s result, this doesn't skip over the arrays
 * between consecutive AST nodes (e.g. a `FunctionDef`'s `body` statement
 * list): those arrays are their own foldable row in the tree/JSON views,
 * with their own independent fold state, so a node nested inside one is
 * only actually visible once that array is expanded too — not just its
 * AST-node ancestors.
 * @param root The subtree to search (typically the parsed `Module`).
 * @param target The container (usually an AST node) to find.
 * @returns The path from `root` to `target`, or `null` if `target` isn't in `root`'s subtree.
 */
export function containerPathTo(root: unknown, target: unknown): unknown[] | null {
	if (root === target) {
		return [root];
	}
	if (root === null || typeof root !== "object") {
		return null;
	}
	const children = Array.isArray(root) ? root : Object.entries(root).filter(([key]) => key !== "comments").map(([, v]) => v);
	for (const child of children) {
		if (child !== null && typeof child === "object") {
			const sub = containerPathTo(child, target);
			if (sub) {
				return [root, ...sub];
			}
		}
	}
	return null;
}

/**
 * Computes a node's highlighted source range for the editor, using its real
 * `lineno`/`col_offset`/`end_lineno`/`end_col_offset`. A handful of node
 * types carry no position of their own (`Arguments`, `Comprehension`,
 * `MatchCase`, `WithItem`, and CPython's context/operator singletons) —
 * hovering one of those (e.g. a `FunctionDef`'s `args`) walks up `target`'s
 * ancestor chain to the nearest node that does have a position, and
 * highlights that whole node instead, rather than highlighting nothing.
 * @param root The full tree `target` belongs to.
 * @param target The node to compute a range for.
 * @param documentEnd The end position of the source document, used only as
 * `root` (the `Module`) itself has no `end_lineno`/`end_col_offset` (CPython's
 * `ast.Module` has no position attributes at all).
 * @returns The range, or `null` if `target` isn't in `root`'s subtree.
 */
export function nodeRange(
	root: ASTNodeUnion,
	target: ASTNodeUnion,
	documentEnd: SourcePosition,
): SourceRange | null {
	const path = pathTo(root, target);
	if (!path) {
		return null;
	}

	for (let i = path.length - 1; i >= 0; i--) {
		const candidate = path[i];
		const start = ownStart(candidate);
		if (!start) {
			continue;
		}
		const end = ownEnd(candidate) ?? (i === 0 ? documentEnd : null);
		if (end) {
			return {
				startLine: start.line,
				startColumn: start.column,
				endLine: end.line,
				endColumn: end.column,
			};
		}
	}
	return null;
}
