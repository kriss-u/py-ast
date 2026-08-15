import { useEffect, useRef, useState } from "react";
import { collectContainers } from "./collectContainers";

/**
 * Fold state, ref registry, and auto-expand/scroll behavior shared by
 * TreeView and JsonView. Expands fully whenever `root` changes identity
 * (i.e. on every successful parse) and additionally expands/scrolls to
 * whatever `activePath` points at.
 *
 * Scrolling happens in a separate effect keyed off `expanded` itself (rather
 * than firing a `requestAnimationFrame` right after requesting the expand),
 * so it reliably runs only once the newly expanded rows are actually in the
 * DOM — this matters because a mouse click can dispatch its selection change
 * in a way that races a same-frame `requestAnimationFrame` scroll, while
 * keyboard-driven moves happen to win that race.
 */
export function useTreeState(root: unknown, activePath: unknown[]) {
	const [expanded, setExpanded] = useState<Set<unknown>>(() => collectContainers(root));
	const refs = useRef(new Map<unknown, HTMLDivElement>());
	const pendingScrollTarget = useRef<unknown>(null);

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

	useEffect(() => {
		setExpanded(collectContainers(root));
	}, [root]);

	useEffect(() => {
		if (activePath.length === 0) {
			return;
		}
		const leaf = activePath[activePath.length - 1];
		pendingScrollTarget.current = leaf;
		setExpanded((prev) => {
			const next = new Set(prev);
			for (const node of activePath) {
				next.add(node);
			}
			return next;
		});
	}, [activePath]);

	useEffect(() => {
		const target = pendingScrollTarget.current;
		if (target === null) {
			return;
		}
		const el = refs.current.get(target);
		if (el) {
			el.scrollIntoView({ block: "nearest" });
			pendingScrollTarget.current = null;
		}
	}, [expanded]);

	return { expanded, setExpanded, toggle, registerRef };
}
