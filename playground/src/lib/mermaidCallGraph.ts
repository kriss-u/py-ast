import type { CallGraph, CallGraphNode } from "./callGraph";
import { complexityBand, type ComplexityBand } from "./controlFlow";
import type { BandColors } from "./flowTheme";

/**
 * Mermaid-specific rendering of a {@link CallGraph}. Deliberately isolated
 * from `callGraph.ts` (the graph's data model is renderer-agnostic) so a
 * different renderer — e.g. a React Flow + dagre-laid-out diagram — can
 * consume the same `CallGraph` without touching this file, by adding a
 * sibling module instead of modifying this one.
 */

/** Escapes text for use inside a quoted Mermaid node label. */
function escapeNodeLabel(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/"/g, "'")
		.replace(/\n/g, "<br/>");
}

function nodeSyntax(node: CallGraphNode): string {
	// Just the name — the complexity score renders separately, as a badge
	// overlaid on the node's corner (see MermaidCallGraphDiagram's
	// addComplexityBadges), not as label text.
	const label = escapeNodeLabel(node.qualifiedName);
	// A rounded rect (`id("label")`) rather than a square one (`id["label"]") —
	// softer, more modern edges that match the rest of the app's rounded UI.
	return `${node.id}("${label}")`;
}

const CLASS_DEF_BY_BAND: Record<ComplexityBand, string> = {
	low: "bandLow",
	moderate: "bandModerate",
	high: "bandHigh",
	"very-high": "bandVeryHigh",
};

/** Which way the call graph flows: top-to-bottom or left-to-right. */
export type FlowDirection = "TD" | "LR";

/** How tightly Mermaid packs nodes/ranks — mapped to `nodeSpacing`/`rankSpacing` below. */
export type LayoutDensity = "compact" | "comfortable" | "spacious";

/** Full set of layout knobs a user can pick, threaded into the Mermaid `%%{init: ...}%%` directive. */
export interface LayoutOptions {
	direction: FlowDirection;
	density: LayoutDensity;
}

const DEFAULT_MERMAID_SPACING = { nodeSpacing: 50, rankSpacing: 50 };

const SPACING_BY_DENSITY: Record<LayoutDensity, { nodeSpacing: number; rankSpacing: number }> = {
	compact: { nodeSpacing: 20, rankSpacing: 25 },
	comfortable: DEFAULT_MERMAID_SPACING,
	spacious: { nodeSpacing: 80, rankSpacing: 90 },
};

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = { direction: "TD", density: "compact" };

/**
 * Renders a {@link CallGraph} as Mermaid `flowchart` source: one box per
 * function, edges for resolved calls, colored by {@link ComplexityBand}. The
 * complexity score itself isn't in the label — see `addComplexityBadges` in
 * `MermaidCallGraphDiagram.tsx`, which overlays it as a corner badge after render.
 * @param graph The call graph to render.
 * @param colors Literal (non-`var()`) colors for each complexity band — see {@link BandColors}.
 * @param layout Direction and node/rank spacing to render with — see {@link LayoutOptions}.
 * @returns A complete Mermaid flowchart definition string.
 */
export function callGraphToMermaid(
	graph: CallGraph,
	colors: Record<ComplexityBand, BandColors>,
	layout: LayoutOptions,
): string {
	// `useMaxWidth: false` is essential, not cosmetic: Mermaid's default (true)
	// stamps a `max-width` inline style onto the SVG so it shrinks to fit a
	// narrow container — combined with the pan/zoom library's content div
	// being auto-sized, that collapses the diagram's *natural* rendered size
	// itself, not just its on-screen scale, so no amount of zooming in
	// recovers real detail. A per-diagram `%%{init: ...}%%` directive
	// overrides `mermaid.initialize`'s config for just this render.
	//
	// The top-level `fontFamily` (not `themeVariables.fontFamily`, and not a
	// later CSS override) matters here too: Mermaid measures each node's text
	// to size its box *using this exact font* before drawing it, so setting the
	// font any other way (e.g. a CSS rule applied after rendering) leaves the
	// box sized for a different, narrower font than what actually ends up
	// rendered — which is exactly what clipped node text before this was
	// fixed. Unlike `themeVariables` colors, `fontFamily` is applied as a
	// literal CSS value (never color-parsed), so a `var(--x)` reference here
	// is safe and resolves normally.
	const initDirective = `%%{init: ${JSON.stringify({
		fontFamily: "var(--font-mono)",
		// Extra `diagramPadding` gives the corner complexity badges
		// (MermaidCallGraphDiagram's addComplexityBadges, added after render)
		// room to sit fully inside the SVG's own bounds instead of getting
		// clipped when they land on an outer-edge node.
		flowchart: { useMaxWidth: false, curve: "basis", diagramPadding: 16, ...SPACING_BY_DENSITY[layout.density] },
	})}}%%`;
	const lines = [initDirective, `flowchart ${layout.direction}`];
	for (const node of graph.nodes) {
		lines.push(`\t${nodeSyntax(node)}`);
	}
	for (const edge of graph.edges) {
		lines.push(`\t${edge.from} --> ${edge.to}`);
	}
	for (const band of Object.keys(CLASS_DEF_BY_BAND) as ComplexityBand[]) {
		const c = colors[band];
		lines.push(`\tclassDef ${CLASS_DEF_BY_BAND[band]} fill:${c.fill},stroke:${c.stroke},color:${c.text};`);
	}
	for (const band of Object.keys(CLASS_DEF_BY_BAND) as ComplexityBand[]) {
		const ids = graph.nodes.filter((n) => complexityBand(n.complexity.total) === band).map((n) => n.id);
		if (ids.length > 0) {
			lines.push(`\tclass ${ids.join(",")} ${CLASS_DEF_BY_BAND[band]};`);
		}
	}
	return lines.join("\n");
}
