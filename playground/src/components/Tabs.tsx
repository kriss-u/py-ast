export type TabId = "tree" | "json";

export interface TabsProps {
	activeTab: TabId;
	onTabChange: (tab: TabId) => void;
	excludeComments: boolean;
	onToggleExcludeComments: (value: boolean) => void;
	onCopyJson: () => void;
	copied: boolean;
}

/** Tab switcher for the tree/JSON panes, the "exclude comments" toggle, and a copy-JSON action. */
export function Tabs({
	activeTab,
	onTabChange,
	excludeComments,
	onToggleExcludeComments,
	onCopyJson,
	copied,
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
			</div>
			<div className="tabs-actions">
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
		</div>
	);
}
