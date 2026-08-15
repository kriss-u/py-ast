import { type ASTNodeUnion, isASTNode, iterFields } from "py-ast";

/**
 * Recursively collects every array/object/AST-node container reachable from
 * `value`, for use as an initial "fully expanded" fold state.
 * @param value The root value to walk (typically a parsed `Module`).
 * @returns A set containing `value` and every nested container within it.
 */
export function collectContainers(value: unknown): Set<unknown> {
	const into = new Set<unknown>();
	visit(value, into);
	return into;
}

/**
 * Fields at the root whose own containers stay open under
 * {@link collectTopLevelContainers} — the root's outline is still visible
 * after a "collapse all", it's only the elements *within* it that fold.
 */
const ROOT_OUTLINE_FIELDS = ["body", "comments"];

/**
 * Fold state for "collapse all": the root itself, plus its `body`/`comments`
 * arrays, stay expanded (so the top-level outline of statements/comments is
 * still visible); everything nested within those elements collapses.
 * Collapsing the root itself wouldn't make sense — there'd be nothing left to
 * look at.
 * @param root The root value (typically a parsed `Module`).
 * @returns A set containing just the root and its outline-only containers.
 */
export function collectTopLevelContainers(root: unknown): Set<unknown> {
	const into = new Set<unknown>();
	if (root === null || typeof root !== "object") {
		return into;
	}
	into.add(root);
	for (const field of ROOT_OUTLINE_FIELDS) {
		const value = (root as Record<string, unknown>)[field];
		if (Array.isArray(value)) {
			into.add(value);
		}
	}
	return into;
}

function visit(value: unknown, into: Set<unknown>): void {
	if (Array.isArray(value)) {
		into.add(value);
		for (const item of value) {
			visit(item, into);
		}
		return;
	}
	if (isASTNode(value as ASTNodeUnion)) {
		into.add(value);
		for (const [, fieldValue] of iterFields(value as ASTNodeUnion)) {
			visit(fieldValue, into);
		}
		return;
	}
	if (value !== null && typeof value === "object") {
		into.add(value);
		for (const fieldValue of Object.values(value)) {
			visit(fieldValue, into);
		}
	}
}
