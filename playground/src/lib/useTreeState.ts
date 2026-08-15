import { useEffect, useMemo, useRef, useState } from "react";
import { collectContainers, collectTopLevelContainers } from "./collectContainers";

/** Initial/reset fold state for a view: every container open, or just the root's top-level outline. */
export type DefaultFoldMode = "all" | "top-level";

function defaultExpandedFor(root: unknown, mode: DefaultFoldMode): Set<unknown> {
	return mode === "all" ? collectContainers(root) : collectTopLevelContainers(root);
}

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
	const [expanded, setExpanded] = useState<Set<unknown>>(() => defaultExpandedFor(root, defaultMode));
	const refs = useRef(new Map<unknown, HTMLDivElement>());

	const toggle = (key: unknown) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const registerRef = (key: unknown, el: HTMLDivElement | null) => {
		if (el) {
			refs.current.set(key, el);
		} else {
			refs.current.delete(key);
		}
	};

	// `defaultMode` never changes for a given view instance, so it's read
	// fresh each run without needing to be a dependency here — re-running
	// this on `root` alone (a fresh parse) is exactly the desired reset
	// trigger.
	useEffect(() => {
		setExpanded(defaultExpandedFor(root, defaultMode));
	}, [root]);

	// The rendered fold state always shows every node on `activePath` as open,
	// even if the user had manually folded one of them earlier — a node
	// that's currently highlighted as active must never render collapsed, or
	// its block highlight would have nothing to show. This is a view-only
	// overlay: it doesn't touch `expanded` itself, so a fold the user applied
	// while a node was active reasserts itself the moment that node leaves
	// `activePath`, and a node that was never manually folded simply reverts
	// to whatever `defaultMode` says once it's no longer active.
	const effectiveExpanded = useMemo(() => {
		if (activePath.length === 0) {
			return expanded;
		}
		let missing = false;
		for (const node of activePath) {
			if (!expanded.has(node)) {
				missing = true;
				break;
			}
		}
		if (!missing) {
			return expanded;
		}
		const next = new Set(expanded);
		for (const node of activePath) {
			next.add(node);
		}
		return next;
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

	return { expanded: effectiveExpanded, setExpanded, toggle, registerRef };
}
