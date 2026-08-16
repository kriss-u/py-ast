import type { Theme } from "../components/ThemeToggle";
import type { ComplexityBand } from "./controlFlow";

/** Literal fill/stroke/text colors for one complexity band, in one app theme. */
export interface BandColors {
	fill: string;
	stroke: string;
	text: string;
}

/**
 * Literal (non-`var()`) per-complexity-band colors for each app theme,
 * matching the `--complexity-*` CSS custom properties in styles.css —
 * duplicated here because Mermaid's `classDef` grammar can't parse a
 * `var(--x)` reference as a style value, only a real color literal, so a
 * Mermaid renderer needs resolved colors instead. A non-Mermaid renderer
 * (e.g. a future React Flow diagram) can use the same `--complexity-*`
 * custom properties directly via plain CSS instead of this table.
 */
export const COMPLEXITY_BAND_COLORS: Record<Theme, Record<ComplexityBand, BandColors>> = {
	dark: {
		low: { fill: "#1c332f", stroke: "#4ec9b0", text: "#d4d4d4" },
		moderate: { fill: "#33301a", stroke: "#dcdcaa", text: "#d4d4d4" },
		high: { fill: "#332510", stroke: "#e2a33e", text: "#d4d4d4" },
		"very-high": { fill: "#331616", stroke: "#f14c4c", text: "#d4d4d4" },
	},
	light: {
		low: { fill: "#e3f3f0", stroke: "#267f7f", text: "#1e1e1e" },
		moderate: { fill: "#faf3d6", stroke: "#9a7d0a", text: "#1e1e1e" },
		high: { fill: "#fbe7d2", stroke: "#b5690a", text: "#1e1e1e" },
		"very-high": { fill: "#fbdcdc", stroke: "#d32f2f", text: "#1e1e1e" },
	},
};

/**
 * Literal (non-`var()`) color, per app theme, for the thin ring drawn around
 * each node's complexity badge — matches `--bg-panel` so the badge reads as
 * "cut out" of the node behind it, regardless of that node's own band tint.
 */
export const FLOW_BADGE_RING_COLOR: Record<Theme, string> = {
	dark: "#252526",
	light: "#f5f5f5",
};
