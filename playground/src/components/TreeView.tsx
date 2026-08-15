import type { ASTNodeUnion } from "py-ast";
import { memo } from "react";
import { NodeRenderer } from "./NodeRenderer";

/** Props shared by TreeView and JsonView for driving code<->view sync. */
export interface BaseNodeViewProps {
	tree: ASTNodeUnion;
	/**
	 * Every *container* (not just AST nodes) from the root down to
	 * `activeNode`, inclusive — the same path {@link useTreeState} uses to
	 * force-open ancestors. Threaded down to each row so a memoized row can
	 * cheaply tell whether it's one of the (few) rows whose active styling
	 * could actually be affected by the current `activeNode`, and bail out of
	 * re-rendering otherwise — without this, every row would have to
	 * re-render on every cursor move just because the `activeNode` reference
	 * changed, even though only a handful of rows' appearance actually
	 * depends on it. See {@link NodeRenderer}'s memo comparator.
	 */
	activeContainerPath: readonly unknown[];
	activeNode: ASTNodeUnion | null;
	expanded: Set<unknown>;
	/**
	 * The container path (root..key, inclusive) that the most recent single
	 * `toggle` could have affected, or `null` if the last `expanded` change
	 * was a bulk replacement (expand-all/collapse-all, reset on reparse) that
	 * can't be narrowed to one path. See {@link useTreeState}. Same purpose
	 * as `activeContainerPath` but for `expanded` instead of `activeNode`:
	 * without it, toggling *any* one row would force *every* row in a large
	 * expanded tree to re-render, since `expanded`'s Set reference changes
	 * for the whole tree on every toggle.
	 */
	expandedChangePath: readonly unknown[] | null;
	toggle: (key: unknown) => void;
	registerRef: (key: unknown, el: HTMLDivElement | null) => void;
}

export interface TreeViewProps extends BaseNodeViewProps {
	onHoverEnter: (node: ASTNodeUnion) => void;
	onHoverLeave: (node: ASTNodeUnion) => void;
}

/**
 * ast.dump-style collapsible tree view of the parsed AST. Hovering anywhere
 * within a node's whole block (including its expanded children) highlights
 * the matching source range in the editor, transiently — the highlight
 * clears once the mouse leaves that block entirely. A more specific nested
 * node hovered within it always takes over the highlight. Clicking only
 * folds/unfolds.
 *
 * Fold state (`expanded`/`toggle`/`registerRef`) is lifted to the caller so
 * it can be shared with {@link JsonView} and driven by a global
 * expand-all/collapse-all action.
 */
function TreeViewImpl({
	tree,
	activeNode,
	activeContainerPath,
	expanded,
	expandedChangePath,
	toggle,
	registerRef,
	onHoverEnter,
	onHoverLeave,
}: TreeViewProps) {
	return (
		<div className="node-view tree-view">
			<NodeRenderer
				label={null}
				value={tree}
				depth={0}
				expanded={expanded}
				expandedChangePath={expandedChangePath}
				onToggle={toggle}
				activeNode={activeNode}
				activeContainerPath={activeContainerPath}
				onHoverEnter={onHoverEnter}
				onHoverLeave={onHoverLeave}
				registerRef={registerRef}
			/>
		</div>
	);
}

export const TreeView = memo(TreeViewImpl);
