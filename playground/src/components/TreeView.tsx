import type { ASTNodeUnion } from "py-ast";
import { NodeRenderer } from "./NodeRenderer";

/** Props shared by TreeView and JsonView for driving code<->view sync. */
export interface BaseNodeViewProps {
	tree: ASTNodeUnion;
	activePath: ASTNodeUnion[];
	activeNode: ASTNodeUnion | null;
	expanded: Set<unknown>;
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
export function TreeView({ tree, activeNode, expanded, toggle, registerRef, onHoverEnter, onHoverLeave }: TreeViewProps) {
	return (
		<div className="node-view tree-view">
			<NodeRenderer
				label={null}
				value={tree}
				depth={0}
				expanded={expanded}
				onToggle={toggle}
				activeNode={activeNode}
				onHoverEnter={onHoverEnter}
				onHoverLeave={onHoverLeave}
				registerRef={registerRef}
			/>
		</div>
	);
}
