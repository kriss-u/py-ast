import { useTreeState } from "../lib/useTreeState";
import type { BaseNodeViewProps } from "./TreeView";
import { NodeRenderer } from "./NodeRenderer";

/**
 * Plain, literal JSON rendering of the parsed AST (as `JSON.stringify` would
 * produce it), with fold/unfold controls added. Does not highlight the
 * editor on hover/click — only the tree view drives code highlighting.
 */
export function JsonView({ tree, activePath, activeNode }: BaseNodeViewProps) {
	const { expanded, toggle, registerRef } = useTreeState(tree, activePath);

	return (
		<div className="node-view">
			<NodeRenderer
				label={null}
				value={tree}
				mode="json"
				depth={0}
				expanded={expanded}
				onToggle={toggle}
				activeNode={activeNode}
				registerRef={registerRef}
			/>
		</div>
	);
}
