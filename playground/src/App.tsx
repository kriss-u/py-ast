import type { ASTNodeUnion } from "py-ast";
import { useEffect, useMemo, useState } from "react";
import { Editor } from "./components/Editor";
import { JsonView } from "./components/JsonView";
import { type TabId, Tabs } from "./components/Tabs";
import { type Theme, ThemeToggle } from "./components/ThemeToggle";
import { TreeView } from "./components/TreeView";
import { approximateRange, findNodePath } from "./lib/astRange";
import { useHoverStack } from "./lib/useHoverStack";
import { tryParse } from "./lib/parsePy";
import type { SourcePosition } from "./lib/types";

const SAMPLE_SOURCE = `# Edit this Python source to explore its AST.
def greet(name: str) -> str:
    """Say hello."""
    return f"Hello, {name}!"


greet("world")
`;

const THEME_STORAGE_KEY = "py-ast-playground-theme";
const COPY_FEEDBACK_MS = 1500;

/** Reads the persisted theme, falling back to the OS preference. */
function initialTheme(): Theme {
	const stored = localStorage.getItem(THEME_STORAGE_KEY);
	if (stored === "light" || stored === "dark") {
		return stored;
	}
	return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Computes the end position (last line/column) of a source document. */
function documentEnd(source: string): SourcePosition {
	const lines = source.split("\n");
	return { line: lines.length, column: lines[lines.length - 1].length };
}

/** Root component: wires the editor, parser, and tree/JSON views together. */
export function App() {
	const [source, setSource] = useState(SAMPLE_SOURCE);
	const [excludeComments, setExcludeComments] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>("tree");
	const [cursorPosition, setCursorPosition] = useState<SourcePosition | null>(null);
	const { hovered: hoveredTreeNode, onEnter: handleTreeHoverEnter, onLeave: handleTreeHoverLeave } =
		useHoverStack<ASTNodeUnion>();
	const [theme, setTheme] = useState<Theme>(initialTheme);
	const [copied, setCopied] = useState(false);

	const handleThemeChange = (next: Theme) => {
		setTheme(next);
		localStorage.setItem(THEME_STORAGE_KEY, next);
	};

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	const parseResult = useMemo(() => tryParse(source, !excludeComments), [source, excludeComments]);

	const activePath = useMemo<ASTNodeUnion[]>(() => {
		if (!parseResult.ok || !cursorPosition) {
			return [];
		}
		return findNodePath(parseResult.tree, cursorPosition);
	}, [parseResult, cursorPosition]);

	const activeNode = activePath.length > 0 ? activePath[activePath.length - 1] : null;

	// Tree->code highlighting is transient: it only reflects whichever tree
	// node the mouse is currently over, and disappears when the mouse leaves
	// (unlike code->tree highlighting, which persists at the cursor).
	const highlightRange = useMemo(() => {
		if (!parseResult.ok || !hoveredTreeNode) {
			return null;
		}
		return approximateRange(parseResult.tree, hoveredTreeNode, documentEnd(source));
	}, [parseResult, hoveredTreeNode, source]);

	const handleCopyJson = async () => {
		if (!parseResult.ok) {
			return;
		}
		await navigator.clipboard.writeText(JSON.stringify(parseResult.tree, null, 2));
		setCopied(true);
		setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
	};

	return (
		<div className="app">
			<header className="app-header">
				<h1>py-ast Playground</h1>
				<div className="app-header-actions">
					<ThemeToggle theme={theme} onChange={handleThemeChange} />
					<a href="https://github.com/kriss-u/py-ast" target="_blank" rel="noreferrer">
						GitHub
					</a>
				</div>
			</header>
			<div className="panes">
				<div className="pane pane-editor">
					<Editor
						source={source}
						theme={theme}
						onSourceChange={setSource}
						onCursorMove={setCursorPosition}
						highlightRange={highlightRange}
					/>
				</div>
				<div className="pane pane-output">
					<Tabs
						activeTab={activeTab}
						onTabChange={setActiveTab}
						excludeComments={excludeComments}
						onToggleExcludeComments={setExcludeComments}
						onCopyJson={handleCopyJson}
						copied={copied}
					/>
					{parseResult.ok ? (
						activeTab === "tree" ? (
							<TreeView
								tree={parseResult.tree}
								activePath={activePath}
								activeNode={activeNode}
								onHoverEnter={handleTreeHoverEnter}
								onHoverLeave={handleTreeHoverLeave}
							/>
						) : (
							<JsonView tree={parseResult.tree} activePath={activePath} activeNode={activeNode} />
						)
					) : (
						<div className="error-banner">
							<strong>Syntax error:</strong> {parseResult.error.message}
							{parseResult.error.line !== undefined && (
								<span>
									{" "}
									(line {parseResult.error.line}
									{parseResult.error.column !== undefined ? `, column ${parseResult.error.column}` : ""})
								</span>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
