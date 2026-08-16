export type TabId = "tree" | "json" | "flow";

export interface TabsProps {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
	excludeComments: boolean;
	onToggleExcludeComments: (value: boolean) => void;
	onCopyJson: () => void;
	copied: boolean;
	onExpandAll: () => void;
	onCollapseAll: () => void;
}

/** Tab switcher for the tree/JSON/flow panes, fold-all actions, the "exclude comments" toggle, and a copy-JSON action (the last three only apply to the tree/JSON panes). */
export function Tabs({
	activeTab,
	onTabChange,
	excludeComments,
	onToggleExcludeComments,
	onCopyJson,
	copied,
	onExpandAll,
	onCollapseAll,
}: TabsProps) {
	return (
		<div className="tabs">
			<div className="tabs-buttons">
				<button
					type="button"
					className={activeTab === "tree" ? "tab-button tab-button-active" : "tab-button"}
					onClick={() => onTabChange("tree")}
				>
					Tree
				</button>
				<button
					type="button"
					className={activeTab === "json" ? "tab-button tab-button-active" : "tab-button"}
					onClick={() => onTabChange("json")}
				>
					JSON
				</button>
				<button
					type="button"
					className={activeTab === "flow" ? "tab-button tab-button-active" : "tab-button"}
					onClick={() => onTabChange("flow")}
				>
					Flow
				</button>
			</div>
			{activeTab !== "flow" && (
				<div className="tabs-actions">
					<button type="button" className="fold-action-button" onClick={onExpandAll} title="Expand all">
						Expand All
					</button>
					<button type="button" className="fold-action-button" onClick={onCollapseAll} title="Collapse all">
						Collapse All
					</button>
					<button type="button" className="copy-json-button" onClick={onCopyJson}>
						{copied ? "Copied!" : "Copy JSON"}
					</button>
					<label className="comments-toggle">
						<input
							type="checkbox"
							checked={excludeComments}
							onChange={(event) => onToggleExcludeComments(event.target.checked)}
						/>
						Exclude comments
					</label>
				</div>
			)}
		</div>
	);
}
