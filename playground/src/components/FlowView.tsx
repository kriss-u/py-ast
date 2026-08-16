import type { Module } from "py-ast";
import { useMemo, useState } from "react";
import { buildCallGraph, type CallGraphNode, filterConnectedByBand } from "../lib/callGraph";
import { type ComplexityBand, complexityBand } from "../lib/controlFlow";
import { collectFunctions } from "../lib/functionCatalog";
import {
	DEFAULT_LAYOUT_OPTIONS,
	type FlowDirection,
	type LayoutDensity,
	type LayoutOptions,
} from "../lib/mermaidCallGraph";
import type { SourceRange } from "../lib/types";
import { MermaidCallGraphDiagram } from "./MermaidCallGraphDiagram";
import type { Theme } from "./ThemeToggle";

const DENSITY_OPTIONS: { value: LayoutDensity; label: string }[] = [
	{ value: "compact", label: "Compact" },
	{ value: "comfortable", label: "Comfortable" },
	{ value: "spacious", label: "Spacious" },
];

const DIRECTION_OPTIONS: { value: FlowDirection; label: string }[] = [
	{ value: "TD", label: "Top → Bottom" },
	{ value: "LR", label: "Left → Right" },
];

const COMPLEXITY_BANDS: ComplexityBand[] = ["low", "moderate", "high", "very-high"];

export interface FlowViewProps {
	tree: Module;
	theme: Theme;
	onHighlightRange: (range: SourceRange | null) => void;
}

/** Labels + values for the non-zero contributors to a hovered node's complexity, for the details panel. */
function breakdownEntries(node: CallGraphNode): { label: string; value: number }[] {
	const { branches, loops, exceptHandlers, booleanOperators, ternaries, matchCases, asserts, comprehensionFilters } =
		node.complexity;
	return [
		{ label: "branches (if)", value: branches },
		{ label: "loops", value: loops },
		{ label: "except handlers", value: exceptHandlers },
		{ label: "boolean operators", value: booleanOperators },
		{ label: "ternaries", value: ternaries },
		{ label: "match cases", value: matchCases },
		{ label: "asserts", value: asserts },
		{ label: "comprehension filters", value: comprehensionFilters },
	].filter((entry) => entry.value > 0);
}

/**
 * "Flow" tab: a module-level call-graph heatmap of every function/method in
 * the parsed source — one box per function, colored by its own cyclomatic
 * complexity, with edges for resolved calls between them. Hovering a node
 * highlights its definition in the editor and shows a complexity breakdown.
 */
export function FlowView({ tree, theme, onHighlightRange }: FlowViewProps) {
	const functions = useMemo(() => collectFunctions(tree), [tree]);
	const graph = useMemo(() => buildCallGraph(functions), [functions]);
	const [hoveredNode, setHoveredNode] = useState<CallGraphNode | null>(null);
	const [layout, setLayout] = useState<LayoutOptions>(DEFAULT_LAYOUT_OPTIONS);
	const [selectedBand, setSelectedBand] = useState<ComplexityBand | null>(null);
	const visibleGraph = useMemo(() => filterConnectedByBand(graph, selectedBand), [graph, selectedBand]);

	if (functions.length === 0) {
		return <div className="flow-empty">No functions or methods found in this source.</div>;
	}

	return (
		<div className="flow-view">
			<div className="flow-toolbar">
				<span className="flow-summary">
					{selectedBand === null
						? `${functions.length} function${functions.length === 1 ? "" : "s"}, ${graph.edges.length} call${graph.edges.length === 1 ? "" : "s"} resolved`
						: `showing ${visibleGraph.nodes.length} of ${functions.length} functions`}
				</span>
				<div className="flow-filters">
					<button
						type="button"
						className={`flow-filter-chip flow-filter-chip-all${selectedBand === null ? " flow-filter-chip-active" : ""}`}
						onClick={() => setSelectedBand(null)}
					>
						All
					</button>
					{COMPLEXITY_BANDS.map((band) => (
						<button
							key={band}
							type="button"
							className={`flow-filter-chip complexity-${band}${selectedBand === band ? " flow-filter-chip-active" : ""}`}
							onClick={() => setSelectedBand((prev) => (prev === band ? null : band))}
							title={`Show only ${band}-complexity functions and everything connected to them`}
						>
							{band}
						</button>
					))}
				</div>
				<label className="flow-layout-control">
					Layout
					<select
						value={layout.density}
						onChange={(event) => setLayout((prev) => ({ ...prev, density: event.target.value as LayoutDensity }))}
					>
						{DENSITY_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="flow-layout-control">
					Direction
					<select
						value={layout.direction}
						onChange={(event) => setLayout((prev) => ({ ...prev, direction: event.target.value as FlowDirection }))}
					>
						{DIRECTION_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<MermaidCallGraphDiagram
				graph={visibleGraph}
				theme={theme}
				layout={layout}
				onHighlightRange={onHighlightRange}
				onNodeHover={setHoveredNode}
			/>
			<div className="flow-details">
				{hoveredNode ? (
					<>
						<span className="flow-details-name">{hoveredNode.qualifiedName}</span>
						<span className={`complexity-badge complexity-${complexityBand(hoveredNode.complexity.total)}`}>
							complexity: {hoveredNode.complexity.total}
						</span>
						{breakdownEntries(hoveredNode).map((entry) => (
							<span key={entry.label} className="flow-details-entry">
								{entry.label}: {entry.value}
							</span>
						))}
						{breakdownEntries(hoveredNode).length === 0 && (
							<span className="flow-details-entry">straight-line code, no extra decision points</span>
						)}
					</>
				) : (
					<span className="flow-details-hint">Hover a function to see its complexity breakdown.</span>
				)}
			</div>
		</div>
	);
}
