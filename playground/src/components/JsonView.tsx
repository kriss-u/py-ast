import { memo } from "react";
import type { BaseNodeViewProps } from "./TreeView";
import { JsonCodeView } from "./JsonCodeView";

/**
 * Code-editor-style JSON rendering of the parsed AST (as `JSON.stringify`
 * would produce it), with a gutter of line numbers and fold arrows. Does not
 * highlight the editor on hover/click — only the tree view drives code
 * highlighting.
 */
function JsonViewImpl({
	tree,
	activeNode,
	activeContainerPath,
	expanded,
	expandedChangePath,
	toggle,
	registerRef,
}: BaseNodeViewProps) {
	return (
		<JsonCodeView
			tree={tree}
			activeNode={activeNode}
			activeContainerPath={activeContainerPath}
			expanded={expanded}
			expandedChangePath={expandedChangePath}
			toggle={toggle}
			registerRef={registerRef}
		/>
	);
}

export const JsonView = memo(JsonViewImpl);
