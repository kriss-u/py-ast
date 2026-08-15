import type { ASTNodeUnion } from "py-ast";
import { useTreeState } from "../lib/useTreeState";
import { NodeRenderer } from "./NodeRenderer";

/** Props shared by TreeView and JsonView for driving code<->view sync. */
export interface BaseNodeViewProps {
	tree: ASTNodeUnion;
	activePath: ASTNodeUnion[];
	activeNode: ASTNodeUnion | null;
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
 */
export function TreeView({ tree, activePath, activeNode, onHoverEnter, onHoverLeave }: TreeViewProps) {
	const { expanded, toggle, registerRef } = useTreeState(tree, activePath);

	return (
		<div className="node-view">
			<NodeRenderer
				label={null}
				value={tree}
				mode="tree"
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
