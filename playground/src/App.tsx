import type { ASTNodeUnion } from "py-ast";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import { JsonView } from "./components/JsonView";
import { type TabId, Tabs } from "./components/Tabs";
import { type Theme, ThemeToggle } from "./components/ThemeToggle";
import { TreeView } from "./components/TreeView";
import { containerPathTo, findNodePath, nodeRange } from "./lib/astRange";
import { collectContainers, collectTopLevelContainers } from "./lib/collectContainers";
import { useHoverStack } from "./lib/useHoverStack";
import { useMediaQuery } from "./lib/useMediaQuery";
import { useTreeState } from "./lib/useTreeState";
import { tryParse } from "./lib/parsePy";
import type { SourcePosition } from "./lib/types";

const SAMPLE_SOURCE = `# Edit this Python source to explore its AST.
def greet(name: str) -> str:
    """Say hello."""
    return f"Hello, {name}!"


greet("world")
`;

const THEME_STORAGE_KEY = "py-ast-playground-theme";
const EDITOR_WIDTH_STORAGE_KEY = "py-ast-playground-editor-width";
const COPY_FEEDBACK_MS = 1500;
const DEFAULT_EDITOR_WIDTH_PERCENT = 50;
const MIN_EDITOR_WIDTH_PERCENT = 20;
const MAX_EDITOR_WIDTH_PERCENT = 80;

/**
 * Below this width the editor/output panes stack vertically instead of
 * splitting horizontally — dragging a horizontal-width resizer doesn't
 * translate to a stacked layout, so the resizer is dropped entirely there
 * and each pane just takes an even flex share of the vertical space.
 */
const STACKED_LAYOUT_QUERY = "(max-width: 768px)";

/** Reads the persisted editor/output split, falling back to an even split. */
function initialEditorWidthPercent(): number {
	const stored = Number(localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY));
	if (Number.isFinite(stored) && stored >= MIN_EDITOR_WIDTH_PERCENT && stored <= MAX_EDITOR_WIDTH_PERCENT) {
		return stored;
	}
	return DEFAULT_EDITOR_WIDTH_PERCENT;
}

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
	const [editorWidthPercent, setEditorWidthPercent] = useState<number>(initialEditorWidthPercent);
	const panesRef = useRef<HTMLDivElement>(null);
	const [isResizing, setIsResizing] = useState(false);
	const isStackedLayout = useMediaQuery(STACKED_LAYOUT_QUERY);

	// Mount the JSON view once in the background, as a low-priority
	// transition, instead of only on first tab click — that way the switch
	// to the JSON tab is never the moment its (unavoidably nontrivial, even
	// collapsed) first render actually happens. Doing it as a transition
	// means React can still interrupt this background work for any
	// tree-view interaction, so it never competes with what the user is
	// doing on screen. `activeTab === "json"` is an escape hatch for the
	// rare case the user switches tabs before the transition has landed: it
	// mounts the JSON view directly, matching the old (synchronous) behavior
	// rather than showing nothing.
	const [jsonViewPrimed, setJsonViewPrimed] = useState(false);
	useEffect(() => {
		startTransition(() => setJsonViewPrimed(true));
	}, []);

	const handleThemeChange = (next: Theme) => {
		setTheme(next);
		localStorage.setItem(THEME_STORAGE_KEY, next);
	};

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	const handleResizerMouseDown = () => {
		setIsResizing(true);
	};

	useEffect(() => {
		if (!isResizing) {
			return;
		}
		const handleMouseMove = (event: MouseEvent) => {
			const panes = panesRef.current;
			if (!panes) {
				return;
			}
			const rect = panes.getBoundingClientRect();
			const percent = ((event.clientX - rect.left) / rect.width) * 100;
			const clamped = Math.min(MAX_EDITOR_WIDTH_PERCENT, Math.max(MIN_EDITOR_WIDTH_PERCENT, percent));
			setEditorWidthPercent(clamped);
		};
		const handleMouseUp = () => {
			setIsResizing(false);
		};
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing]);

	useEffect(() => {
		if (!isResizing) {
			localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, String(editorWidthPercent));
		}
	}, [isResizing, editorWidthPercent]);

	// Parsing (and, downstream, re-rendering the whole tree/JSON view) is
	// deferred to a lower React priority than the keystroke itself — on a
	// large file, that keeps typing responsive even while the AST rebuild and
	// tree re-render for the previous keystroke are still catching up,
	// instead of both competing on the main thread for every character typed.
	const deferredSource = useDeferredValue(source);
	const parseResult = useMemo(() => tryParse(deferredSource, !excludeComments), [deferredSource, excludeComments]);

	const activePath = useMemo<ASTNodeUnion[]>(() => {
		if (!parseResult.ok || !cursorPosition) {
			return [];
		}
		return findNodePath(parseResult.tree, cursorPosition);
	}, [parseResult, cursorPosition]);

	const activeNode = activePath.length > 0 ? activePath[activePath.length - 1] : null;

	// The AST-node ancestor chain (`activePath`) skips over the arrays
	// between consecutive nodes (e.g. a `FunctionDef`'s `body` statement
	// list) — but those arrays are their own foldable row with independent
	// fold state, so a nested active node is only actually visible once its
	// containing arrays are expanded too. `expandPath` is the fuller
	// container-by-container path used to drive that.
	const expandPath = useMemo<unknown[]>(() => {
		if (!parseResult.ok || activeNode === null) {
			return [];
		}
		return containerPathTo(parseResult.tree, activeNode) ?? [];
	}, [parseResult, activeNode]);

	// Fold state is independent per view, but both now start collapsed to
	// just their top-level outline — each instance persists its own toggles
	// across tab switches (switching tabs never resets what's expanded in
	// either one). A global expand-all/collapse-all action drives whichever
	// view is currently visible.
	//
	// The JSON view used to default to fully expanded, which meant every
	// tree change (a fresh parse on every keystroke, or the first mount)
	// synchronously built JSX/DOM for every row in the file at once — on a
	// large file, that's the actual source of the "slow"/"frozen" JSON view,
	// not the (cheap, DOM-free) line-number bookkeeping in
	// `computeLineNumbers`. Matching TreeView's collapsed-by-default start
	// (which was never a problem) fixes it at the source instead of trying
	// to schedule around it.
	const treeState = useTreeState(parseResult.ok ? parseResult.tree : null, expandPath, "top-level");
	const jsonState = useTreeState(parseResult.ok ? parseResult.tree : null, expandPath, "top-level");
	const activeState = activeTab === "tree" ? treeState : jsonState;

	// Expand-all/collapse-all is a deliberate, manual override of fold state —
	// it must not be immediately fought by the cursor-driven active node
	// forcing its own ancestors back open (see useTreeState's effectiveExpanded),
	// so it also clears the current code-cursor highlight.
	const handleExpandAll = () => {
		if (parseResult.ok) {
			activeState.setExpanded(collectContainers(parseResult.tree));
			setCursorPosition(null);
		}
	};

	const handleCollapseAll = () => {
		if (parseResult.ok) {
			activeState.setExpanded(collectTopLevelContainers(parseResult.tree));
			setCursorPosition(null);
		}
	};

	// Tree->code highlighting is transient: it only reflects whichever tree
	// node the mouse is currently over, and disappears when the mouse leaves
	// (unlike code->tree highlighting, which persists at the cursor).
	const highlightRange = useMemo(() => {
		if (!parseResult.ok || !hoveredTreeNode) {
			return null;
		}
		return nodeRange(parseResult.tree, hoveredTreeNode, documentEnd(source));
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
				<h1>PyAST Playground</h1>
				<div className="app-header-actions">
					<ThemeToggle theme={theme} onChange={handleThemeChange} />
					<a href="https://github.com/kriss-u/py-ast" target="_blank" rel="noreferrer">
						GitHub
					</a>
				</div>
			</header>
			<div
				className={`panes${isStackedLayout ? " panes-stacked" : ""}${isResizing ? " panes-resizing" : ""}`}
				ref={panesRef}
			>
				<div
					className="pane pane-editor"
					style={isStackedLayout ? undefined : { width: `${editorWidthPercent}%`, flex: "0 0 auto" }}
				>
					<Editor
						source={source}
						theme={theme}
						onSourceChange={setSource}
						onCursorMove={setCursorPosition}
						highlightRange={highlightRange}
					/>
				</div>
				{!isStackedLayout && (
					// biome-ignore lint/a11y/noStaticElementInteractions: pointer-drag resizer, not a semantic control
					<div
						className="pane-resizer"
						onMouseDown={handleResizerMouseDown}
						role="separator"
						aria-orientation="vertical"
						aria-label="Resize editor and output panes"
					/>
				)}
				<div className="pane pane-output">
					<Tabs
						activeTab={activeTab}
						onTabChange={setActiveTab}
						excludeComments={excludeComments}
						onToggleExcludeComments={setExcludeComments}
						onCopyJson={handleCopyJson}
						copied={copied}
						onExpandAll={handleExpandAll}
						onCollapseAll={handleCollapseAll}
					/>
					{parseResult.ok ? (
						<>
							<div className="node-view-slot" hidden={activeTab !== "tree"}>
								<TreeView
									tree={parseResult.tree}
									activeContainerPath={expandPath}
									activeNode={activeNode}
									expanded={treeState.expanded}
									expandedChangePath={treeState.expandedChangePath}
									toggle={treeState.toggle}
									registerRef={treeState.registerRef}
									onHoverEnter={handleTreeHoverEnter}
									onHoverLeave={handleTreeHoverLeave}
								/>
							</div>
							{(jsonViewPrimed || activeTab === "json") && (
								<div className="node-view-slot" hidden={activeTab !== "json"}>
									<JsonView
										tree={parseResult.tree}
										activeContainerPath={expandPath}
										activeNode={activeNode}
										expanded={jsonState.expanded}
										expandedChangePath={jsonState.expandedChangePath}
										toggle={jsonState.toggle}
										registerRef={jsonState.registerRef}
									/>
								</div>
							)}
						</>
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
