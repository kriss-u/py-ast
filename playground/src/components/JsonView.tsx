import type { BaseNodeViewProps } from "./TreeView";
import { JsonCodeView } from "./JsonCodeView";

/**
 * Code-editor-style JSON rendering of the parsed AST (as `JSON.stringify`
 * would produce it), with a gutter of line numbers and fold arrows. Does not
 * highlight the editor on hover/click — only the tree view drives code
 * highlighting.
 */
export function JsonView({ tree, activePath, activeNode, expanded, toggle, registerRef }: BaseNodeViewProps) {
	return (
		<JsonCodeView
			tree={tree}
			activePath={activePath}
			activeNode={activeNode}
			expanded={expanded}
			toggle={toggle}
			registerRef={registerRef}
		/>
	);
}
