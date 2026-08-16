import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildContainerRouteMap, containerPathTo, resolveContainerRoute } from "./astRange";
import { collectContainers, collectTopLevelContainers } from "./collectContainers";

/** Initial/reset fold state for a view: every container open, or just the root's top-level outline. */
export type DefaultFoldMode = "all" | "top-level";

function defaultExpandedFor(root: unknown, mode: DefaultFoldMode): Set<unknown> {
	return mode === "all" ? collectContainers(root) : collectTopLevelContainers(root);
}

/**
 * Sentinel `expanded`-change reason meaning "more than one node's open/closed
 * state may have changed, and there's no single path to narrow that down
 * to" — used for bulk replacements (expand-all/collapse-all, the initial
 * fold state, resetting on reparse) as opposed to a single `toggle(key)`
 * call. Consumers (see NodeRenderer's and JsonCodeView's memo comparators)
 * treat this as "can't prove any given row is unaffected," i.e. a full
 * re-render, same as before this path-narrowing existed at all.
 */
const BULK_FOLD_CHANGE = Symbol("bulk-fold-change");

/**
 * Fold state, ref registry, and auto-expand/scroll behavior for one view
 * (TreeView or JsonView — each gets its own independent instance, so the two
 * can default to different fold states and each remembers its own toggles
 * across tab switches). Resets to `defaultMode`'s fold state whenever `root`
 * changes identity (i.e. on every successful parse).
 *
 * `activePath` (the currently code-cursor-highlighted node's ancestor chain,
 * active node included) auto-opens in the persisted `expanded` state the
 * moment the active node changes — see the effect below — but is otherwise
 * left alone: once open, any node on it (the active node included) can be
 * manually collapsed again (via `toggle`) and it stays collapsed, even while
 * the cursor remains on that node. Moving the cursor away and back (or any
 * change that produces a new active node) reruns the auto-expand, so
 * returning to that line in the editor reopens it.
 */
export function useTreeState(root: unknown, activePath: unknown[], defaultMode: DefaultFoldMode) {
	const [expanded, setExpandedRaw] = useState<Set<unknown>>(() => defaultExpandedFor(root, defaultMode));
	// Which single key the *last* `expanded` change toggled, or
	// `BULK_FOLD_CHANGE` if it wasn't a single-key toggle. Exposed (as a
	// container path, see `expandedChangePath` below) so a memoized row can
	// tell whether *it* could possibly be one of the rows affected by the
	// most recent `expanded` change, instead of every row having to
	// re-render just because the `expanded` Set's reference changed — which
	// otherwise happens (and did, prior to this) on literally any toggle
	// anywhere in a potentially huge expanded tree.
	const [toggledKey, setToggledKey] = useState<unknown>(BULK_FOLD_CHANGE);
	const refs = useRef(new Map<unknown, HTMLDivElement>());

	// Stable identities so a toggle/ref-registration in one row doesn't force
	// every memoized row elsewhere in a large tree to re-render just because
	// its callback props appear to have changed.
	const toggle = useCallback((key: unknown) => {
		setToggledKey(key);
		setExpandedRaw((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	// The raw setter is also exposed directly, for expand-all/collapse-all
	// (see App.tsx) — those can change an unbounded number of rows' open
	// state at once, so they're marked as a bulk change rather than
	// attempting (incorrectly) to narrow them to one path.
	const setExpanded = useCallback((update: Set<unknown> | ((prev: Set<unknown>) => Set<unknown>)) => {
		setToggledKey(BULK_FOLD_CHANGE);
		setExpandedRaw(update);
	}, []);

	const registerRef = useCallback((key: unknown, el: HTMLDivElement | null) => {
		if (el) {
			refs.current.set(key, el);
		} else {
			refs.current.delete(key);
		}
	}, []);

	// Re-parsing produces an entirely new object graph — none of `root`'s
	// nodes are `===` to the previous parse's, even for a single-character
	// edit — so fold state can't just carry over as-is. Instead of resetting
	// to `defaultMode` on every keystroke (which used to collapse the whole
	// tree back down every time the user typed), this migrates each
	// currently-open container to its counterpart in the new tree by
	// structural route (which field/index path reaches it — see
	// `buildContainerRouteMap`/`resolveContainerRoute`), so open/closed state
	// survives edits that don't restructure the parts the user had folded.
	// `prevRootRef` holds the last *valid* tree to migrate from — a
	// transient syntax error mid-edit (`root === null`) is skipped entirely
	// rather than treated as "reset the reference tree", so fold state
	// doesn't get lost to a momentarily-unparseable in-between keystroke.
	const prevRootRef = useRef<unknown>(undefined);

	// `defaultMode` never changes for a given view instance, so it's read
	// fresh each run without needing to be a dependency here.
	useEffect(() => {
		if (root === null) {
			return;
		}
		const prevRoot = prevRootRef.current;
		if (prevRoot === undefined) {
			setExpandedRaw(defaultExpandedFor(root, defaultMode));
		} else {
			setExpandedRaw((prevExpanded) => {
				const routes = buildContainerRouteMap(prevRoot);
				const migrated = new Set<unknown>();
				for (const node of prevExpanded) {
					const route = routes.get(node);
					if (route === undefined) {
						continue;
					}
					const resolved = resolveContainerRoute(root, route);
					if (resolved !== null && typeof resolved === "object") {
						migrated.add(resolved);
					}
				}
				return migrated;
			});
		}
		prevRootRef.current = root;
		setToggledKey(BULK_FOLD_CHANGE);
	}, [root]);

	// The container path (root..toggled key, inclusive) that the most recent
	// *single* toggle could have affected — `null` for a bulk change, which
	// tells consumers they can't narrow and must treat the change as
	// affecting every row.
	const expandedChangePath = useMemo<readonly unknown[] | null>(() => {
		if (toggledKey === BULK_FOLD_CHANGE) {
			return null;
		}
		return containerPathTo(root, toggledKey);
	}, [root, toggledKey]);

	// Set whenever `activePath` changes to a non-empty path, and cleared once
	// the scroll effect below has actually performed the scroll — since
	// opening an ancestor here only takes effect on the *next* render (a
	// state update, not a render-time overlay), the leaf's row may not exist
	// in `refs` yet on this same commit. The flag lets the scroll effect
	// retry once `expanded` picks up that update, without re-scrolling (and
	// jarringly re-centering) on every unrelated fold change afterwards.
	const pendingScrollRef = useRef(false);

	// Every node on `activePath` — the active node itself as well as its
	// ancestors — is opened in the real `expanded` state the moment the
	// active node changes. Ancestors need this or the active node wouldn't be
	// rendered at all (a collapsed container never renders its children); the
	// active node itself needs it so landing the cursor on it actually shows
	// its fields, not just a highlighted `{…}` row. Unlike a per-render
	// overlay, this only fires on an actual `activePath` identity change
	// (App.tsx memoizes that on the active AST node, so it's stable while the
	// cursor stays within the same node), so a manual `toggle` on any of
	// these — including collapsing the active node back down — afterwards
	// sticks instead of being reasserted on the next unrelated render. Moving
	// the cursor to a different node and back (or any edit that changes the
	// active node) produces a new `activePath`, which reruns this and
	// reopens it.
	useEffect(() => {
		if (activePath.length === 0) {
			return;
		}
		pendingScrollRef.current = true;
		// Whether the functional update below actually opened anything —
		// read synchronously right after `setExpandedRaw`, since its updater
		// runs inline during the call. Deliberately *not* keyed off the
		// `expanded` state itself: doing so would rerun this effect (and
		// reopen the node) on every unrelated fold change, including the
		// user manually collapsing one of these same nodes.
		let changed = false;
		setExpandedRaw((prev) => {
			changed = false;
			let next: Set<unknown> | null = null;
			for (const node of activePath) {
				if (!prev.has(node)) {
					next ??= new Set(prev);
					next.add(node);
					changed = true;
				}
			}
			return next ?? prev;
		});
		if (changed) {
			setToggledKey(BULK_FOLD_CHANGE);
		}
	}, [activePath]);

	// Re-runs on `expanded` changes too (in addition to `activePath`) so that
	// when the effect above just opened an ancestor, this retries once that
	// update lands and the leaf's row actually mounts — `pendingScrollRef`
	// keeps that retry from turning into a scroll on every unrelated fold
	// toggle elsewhere in the tree.
	useEffect(() => {
		if (!pendingScrollRef.current || activePath.length === 0) {
			return;
		}
		const leaf = activePath[activePath.length - 1];
		const el = refs.current.get(leaf);
		if (el) {
			el.scrollIntoView({ block: "center" });
			pendingScrollRef.current = false;
		}
	}, [activePath, expanded]);

	return { expanded, setExpanded, toggle, registerRef, expandedChangePath };
}
