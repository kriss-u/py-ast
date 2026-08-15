import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { containerPathTo } from "./astRange";
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
 * `activePath` (the currently code-cursor-highlighted node's ancestor chain)
 * is never written into the persisted `expanded` state — it's overlaid onto
 * it purely for rendering (see `effectiveExpanded` below), so moving the
 * cursor to a different node reverts whatever was on the *previous*
 * `activePath` back to its own last manually-toggled state, rather than
 * leaving every node the cursor ever visited stuck open.
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

	// `defaultMode` never changes for a given view instance, so it's read
	// fresh each run without needing to be a dependency here — re-running
	// this on `root` alone (a fresh parse) is exactly the desired reset
	// trigger.
	useEffect(() => {
		setToggledKey(BULK_FOLD_CHANGE);
		setExpandedRaw(defaultExpandedFor(root, defaultMode));
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

	// The rendered fold state always shows every *ancestor* of `activePath`'s
	// last node as open, even if the user had manually folded one of them
	// earlier — otherwise the active node wouldn't be rendered at all (a
	// collapsed container never renders its children), and its block
	// highlight would have nothing to show. This is a view-only overlay: it
	// doesn't touch `expanded` itself, so a fold the user applied to an
	// ancestor while a node was active reasserts itself the moment that node
	// leaves `activePath`, and an ancestor that was never manually folded
	// simply reverts to whatever `defaultMode` says once it's no longer
	// active.
	//
	// The active node *itself* (the last entry) is deliberately excluded —
	// unlike its ancestors, folding it doesn't hide it (its header row still
	// renders, and still gets the active highlight, even collapsed — see
	// NodeRenderer's `Container`), so there's no reason to fight the user's
	// own toggle on it. Forcing it open too used to mean clicking to fold the
	// currently-active node was a no-op: `toggle` would remove it from
	// `expanded`, but this overlay just added it straight back on the next
	// render.
	const ancestorPath = activePath.length > 1 ? activePath.slice(0, -1) : [];

	const effectiveExpanded = useMemo(() => {
		if (ancestorPath.length === 0) {
			return expanded;
		}
		let missing = false;
		for (const node of ancestorPath) {
			if (!expanded.has(node)) {
				missing = true;
				break;
			}
		}
		if (!missing) {
			return expanded;
		}
		const next = new Set(expanded);
		for (const node of ancestorPath) {
			next.add(node);
		}
		return next;
		// biome-ignore lint/correctness/useExhaustiveDependencies: `ancestorPath` is a fresh array derived from `activePath` every render; its own identity is never stable, so it's intentionally omitted and `activePath` (the actual reactive input) is depended on instead.
	}, [expanded, activePath]);

	// `effectiveExpanded` already opens the active path's rows synchronously
	// within the same render as `activePath` changing, so by the time this
	// effect runs after commit, their refs are already registered — no need
	// to wait on a separate `expanded`-keyed effect.
	useEffect(() => {
		if (activePath.length === 0) {
			return;
		}
		const leaf = activePath[activePath.length - 1];
		const el = refs.current.get(leaf);
		if (el) {
			el.scrollIntoView({ block: "center" });
		}
	}, [activePath]);

	return { expanded: effectiveExpanded, setExpanded, toggle, registerRef, expandedChangePath };
}
