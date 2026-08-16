import type { ASTNodeUnion } from "py-ast";
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Editor } from "./components/Editor";
import { FlowView } from "./components/FlowView";
import { JsonView } from "./components/JsonView";
import { type TabId, Tabs } from "./components/Tabs";
import { type Theme, ThemeToggle } from "./components/ThemeToggle";
import { TreeView } from "./components/TreeView";
import { containerPathTo, findNodePath, nodeRange } from "./lib/astRange";
import { collectContainers, collectTopLevelContainers } from "./lib/collectContainers";
import { defaultPreferences, loadPreferences, resetPreferences, savePreference } from "./lib/preferencesStore";
import { useHoverStack } from "./lib/useHoverStack";
import { useMediaQuery } from "./lib/useMediaQuery";
import { useTreeState } from "./lib/useTreeState";
import { tryParse } from "./lib/parsePy";
import type { SourcePosition, SourceRange } from "./lib/types";

const COPY_FEEDBACK_MS = 1500;
/** Debounce for persisting the source to IndexedDB — long enough to not write on every keystroke. */
const SOURCE_SAVE_DEBOUNCE_MS = 400;
const MIN_EDITOR_WIDTH_PERCENT = 20;
const MAX_EDITOR_WIDTH_PERCENT = 80;

/**
 * Below this width the editor/output panes stack vertically instead of
 * splitting horizontally — dragging a horizontal-width resizer doesn't
 * translate to a stacked layout, so the resizer is dropped entirely there
 * and each pane just takes an even flex share of the vertical space.
 */
const STACKED_LAYOUT_QUERY = "(max-width: 768px)";

/** Computes the end position (last line/column) of a source document. */
function documentEnd(source: string): SourcePosition {
	const lines = source.split("\n");
	return { line: lines.length, column: lines[lines.length - 1].length };
}

/** Root component: wires the editor, parser, and tree/JSON views together. */
export function App() {
	const [source, setSource] = useState(() => defaultPreferences().source);
	const [excludeComments, setExcludeComments] = useState(() => defaultPreferences().excludeComments);
	const [activeTab, setActiveTab] = useState<TabId>("tree");
	const [cursorPosition, setCursorPosition] = useState<SourcePosition | null>(null);
	const { hovered: hoveredTreeNode, onEnter: handleTreeHoverEnter, onLeave: handleTreeHoverLeave } =
		useHoverStack<ASTNodeUnion>();
	const [theme, setTheme] = useState<Theme>(() => defaultPreferences().theme);
	const [copied, setCopied] = useState(false);
	const [editorWidthPercent, setEditorWidthPercent] = useState<number>(() => defaultPreferences().editorWidthPercent);
	const panesRef = useRef<HTMLDivElement>(null);
	const [isResizing, setIsResizing] = useState(false);
	const isStackedLayout = useMediaQuery(STACKED_LAYOUT_QUERY);

	// Preferences load from IndexedDB asynchronously, so the app renders with
	// in-memory defaults first and swaps in the persisted values once they
	// arrive. `prefsLoaded` gates the save effects below so a save never fires
	// with a stale default before the load has had a chance to land.
	const [prefsLoaded, setPrefsLoaded] = useState(false);
	useEffect(() => {
		let cancelled = false;
		loadPreferences().then((prefs) => {
			if (cancelled) {
				return;
			}
			setSource(prefs.source);
			setExcludeComments(prefs.excludeComments);
			setTheme(prefs.theme);
			setEditorWidthPercent(prefs.editorWidthPercent);
			setPrefsLoaded(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!prefsLoaded) {
			return;
		}
		void savePreference("excludeComments", excludeComments);
	}, [prefsLoaded, excludeComments]);

	useEffect(() => {
		if (!prefsLoaded) {
			return;
		}
		void savePreference("theme", theme);
	}, [prefsLoaded, theme]);

	useEffect(() => {
		if (!prefsLoaded) {
			return;
		}
		const timeout = setTimeout(() => {
			void savePreference("source", source);
		}, SOURCE_SAVE_DEBOUNCE_MS);
		return () => clearTimeout(timeout);
	}, [prefsLoaded, source]);

	const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

	/** Clears persisted preferences and resets all in-memory state to the defaults. */
	const handleResetPreferences = async () => {
		setResetConfirmOpen(false);
		await resetPreferences();
		const defaults = defaultPreferences();
		setSource(defaults.source);
		setExcludeComments(defaults.excludeComments);
		setTheme(defaults.theme);
		setEditorWidthPercent(defaults.editorWidthPercent);
	};

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
	const [flowViewPrimed, setFlowViewPrimed] = useState(false);
	useEffect(() => {
		startTransition(() => {
			setJsonViewPrimed(true);
			setFlowViewPrimed(true);
		});
	}, []);

	// Flow-tab node hover drives its own editor highlight, independent of the
	// tree/JSON one below — the two are mutually exclusive in practice (only
	// one tab's content is visible/interactive at a time), so `Editor` is fed
	// whichever one corresponds to `activeTab`.
	const [flowHighlightRange, setFlowHighlightRange] = useState<SourceRange | null>(null);
	const handleFlowHighlightRange = useCallback((range: SourceRange | null) => {
		setFlowHighlightRange(range);
	}, []);

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
		if (!prefsLoaded || isResizing) {
			return;
		}
		void savePreference("editorWidthPercent", editorWidthPercent);
	}, [prefsLoaded, isResizing, editorWidthPercent]);

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

	// Fold state is independent per view — each instance persists its own
	// toggles across tab switches (switching tabs never resets what's
	// expanded in either one) — but the two default differently: the tree
	// view starts collapsed to just its top-level outline, while the JSON
	// view starts fully expanded. A global expand-all/collapse-all action
	// drives whichever view is currently visible.
	//
	// Fully expanding the JSON view by default used to mean every tree
	// change (a fresh parse on every keystroke, or the first mount)
	// synchronously rebuilt JSX/DOM for every row in the file at once — on a
	// large file, that was the actual source of the "slow"/"frozen" JSON
	// view. That's no longer the failure mode it once was: `useTreeState` now
	// migrates fold state across a reparse (by structural route) instead of
	// resetting it, so a keystroke only touches however many rows are
	// currently open, not the whole tree — the original cost only recurs
	// once, at first mount or a `root` swap so drastic that nothing survives
	// migration (essentially: a different tree from scratch).
	const treeState = useTreeState(parseResult.ok ? parseResult.tree : null, expandPath, "top-level");
	const jsonState = useTreeState(parseResult.ok ? parseResult.tree : null, expandPath, "all");
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
	const treeHighlightRange = useMemo(() => {
		if (!parseResult.ok || !hoveredTreeNode) {
			return null;
		}
		return nodeRange(parseResult.tree, hoveredTreeNode, documentEnd(source));
	}, [parseResult, hoveredTreeNode, source]);

	const highlightRange = activeTab === "flow" ? flowHighlightRange : treeHighlightRange;

	const handleCopyJson = async () => {
		if (!parseResult.ok) {
			return;
		}
		await navigator.clipboard.writeText(JSON.stringify(parseResult.tree, null, 2));
		setCopied(true);
		setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
	};

	// Render nothing but a loading screen until the persisted preferences have
	// been read back from IndexedDB — otherwise the app would briefly flash
	// the in-memory defaults (sample source, default theme) before swapping
	// in the user's actual saved state.
	if (!prefsLoaded) {
		return (
			<div className="app app-loading">
				<div className="app-loading-spinner" aria-hidden="true" />
				<p>Loading playground…</p>
			</div>
		);
	}

	return (
		<div className="app">
			<header className="app-header">
				<div className="app-header-brand">
					<img src="/favicon.svg" alt="" className="app-logo" width={24} height={24} />
					<h1>PyAST Playground</h1>
				</div>
				<div className="app-header-actions">
					<button
						type="button"
						className="reset-preferences-button"
						onClick={() => setResetConfirmOpen(true)}
						title="Reset the playground to its default state"
					>
						Reset
					</button>
					<ThemeToggle theme={theme} onChange={setTheme} />
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
							{(flowViewPrimed || activeTab === "flow") && (
								<div className="node-view-slot" hidden={activeTab !== "flow"}>
									<FlowView
										tree={parseResult.tree}
										theme={theme}
										onHighlightRange={handleFlowHighlightRange}
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
			<ConfirmDialog
				open={resetConfirmOpen}
				title="Reset playground?"
				description="This clears your saved source and settings, and restores the default sample."
				confirmLabel="Reset"
				cancelLabel="Cancel"
				onConfirm={handleResetPreferences}
				onCancel={() => setResetConfirmOpen(false)}
			/>
		</div>
	);
}
