import { useRef, useState } from "react";

/**
 * Tracks nested hover regions as a stack, so that hovering anywhere within a
 * node's whole rendered block (including its expanded children) attributes
 * the hover to that node, while a more specific nested node hovered within
 * it always wins over its ancestors.
 *
 * Relies on non-bubbling `mouseenter`/`mouseleave`, attached to every
 * interactive node's full block (not just its header row): entering a
 * nested child's block always fires after its ancestors' (since the pointer
 * must cross into the ancestor's box first), so the stack's top is always
 * the innermost currently-hovered node; leaving a child pops back to
 * whichever ancestor's block the pointer is still within.
 */
export function useHoverStack<T>() {
	const [hovered, setHovered] = useState<T | null>(null);
	const stack = useRef<T[]>([]);

	const onEnter = (node: T) => {
		stack.current.push(node);
		setHovered(node);
	};

	const onLeave = (node: T) => {
		const index = stack.current.lastIndexOf(node);
		if (index !== -1) {
			stack.current.splice(index, 1);
		}
		setHovered(stack.current[stack.current.length - 1] ?? null);
	};

	return { hovered, onEnter, onLeave };
}
