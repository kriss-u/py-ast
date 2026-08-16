import mermaid from "mermaid";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ReactZoomPanPinchContentRef, TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import type { CallGraph, CallGraphNode } from "../lib/callGraph";
import { complexityBand } from "../lib/controlFlow";
import { COMPLEXITY_BAND_COLORS, FLOW_BADGE_RING_COLOR } from "../lib/flowTheme";
import { callGraphToMermaid, type LayoutOptions } from "../lib/mermaidCallGraph";
import type { SourceRange } from "../lib/types";
import type { Theme } from "./ThemeToggle";

/**
 * Props every call-graph diagram renderer implements, regardless of
 * rendering technology — this is the seam a future non-Mermaid renderer
 * (e.g. React Flow + dagre) would implement instead of this component,
 * without `FlowView` or `callGraph.ts` needing to change.
 */
export interface CallGraphDiagramProps {
	graph: CallGraph;
	theme: Theme;
	/** Direction/density to render with — see {@link LayoutOptions}. */
	layout: LayoutOptions;
	/** Called with the hovered node's source range (or `null` on hover-out) to drive editor highlighting. */
	onHighlightRange: (range: SourceRange | null) => void;
	/** Called with the hovered node itself (or `null` on hover-out), for a details panel. */
	onNodeHover: (node: CallGraphNode | null) => void;
}

let mermaidInitialized = false;

/**
 * Configures Mermaid once. Colors come from the `classDef`s
 * {@link callGraphToMermaid} emits, built from {@link COMPLEXITY_BAND_COLORS}'s
 * literal per-theme palette rather than Mermaid's own `themeVariables` —
 * those get run through Mermaid's color-manipulation library to derive
 * shades, which throws on a `var(--x)` reference instead of a real color.
 * `flowchart.useMaxWidth: false` here is a global fallback for the same
 * per-diagram setting `callGraphToMermaid`'s `%%{init: ...}%%` directive
 * already applies (see its doc comment for why it matters).
 */
function ensureMermaidInitialized(): void {
	if (mermaidInitialized) {
		return;
	}
	mermaid.initialize({ startOnLoad: false, securityLevel: "strict", flowchart: { useMaxWidth: false } });
	mermaidInitialized = true;
}

let diagramCounter = 0;

/** A fresh Mermaid render-call id, unique per call — see the render effect for why this can't be a single id reused across re-renders. */
function nextDiagramId(): string {
	return `call-graph-${diagramCounter++}`;
}

/**
 * Extracts the {@link CallGraphNode} id a Mermaid-rendered SVG element's
 * `id` attribute encodes. Mermaid's own node ids follow `flowchart-<nodeId>-<index>`,
 * but `mermaid.render(diagramId, ...)` additionally prefixes every element id
 * with `${diagramId}-` for uniqueness across multiple diagrams on one page —
 * so the actual DOM id is `${diagramId}-flowchart-<nodeId>-<index>`.
 */
function callGraphNodeIdFromElementId(elementId: string, diagramId: string): string | null {
	const prefix = `${diagramId}-flowchart-`;
	if (!elementId.startsWith(prefix)) {
		return null;
	}
	const match = /^(.+)-\d+$/.exec(elementId.slice(prefix.length));
	return match ? match[1] : null;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 24;
const FIT_MARGIN = 0.92;
const BADGE_RADIUS = 11;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Overlays each node's cyclomatic complexity as a small circular badge on
 * its top-right corner, rather than as label text — keeps the label itself
 * to just the function name, and reads more like a familiar "notification
 * count" than an inline `complexity: N` string competing with the name.
 *
 * Runs as a DOM patch after Mermaid's own render: appended directly onto
 * each `.node` group. Badges are created at a placeholder position and
 * immediately positioned via {@link positionComplexityBadges} — see that
 * function's doc comment for why the position can't just be computed once
 * here.
 */
function addComplexityBadges(
	container: HTMLElement,
	graph: CallGraph,
	colors: ReturnType<typeof colorsFor>,
	diagramId: string,
): void {
	const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
	for (const nodeEl of container.querySelectorAll<SVGGElement>(".node")) {
		const nodeId = nodeEl.id ? callGraphNodeIdFromElementId(nodeEl.id, diagramId) : null;
		const node = nodeId ? nodeById.get(nodeId) : undefined;
		if (!node) {
			continue;
		}
		const band = colors[complexityBand(node.complexity.total)];

		const circle = document.createElementNS(SVG_NS, "circle");
		circle.setAttribute("r", String(BADGE_RADIUS));
		circle.setAttribute("fill", band.stroke);
		circle.setAttribute("stroke", colors.ringColor);
		circle.setAttribute("stroke-width", "2");
		circle.setAttribute("class", "flow-node-badge");

		const text = document.createElementNS(SVG_NS, "text");
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.setAttribute("class", "flow-node-badge-text");
		text.setAttribute("fill", band.text);
		text.textContent = String(node.complexity.total);

		nodeEl.append(circle, text);
	}
	positionComplexityBadges(container);
}

/**
 * Positions every already-created badge (see {@link addComplexityBadges}) at
 * its node shape's top-right corner, from that shape's own `getBBox()`
 * (stable regardless of the pan/zoom transform applied further up the tree,
 * since `getBBox()` reports the shape's local coordinate space).
 *
 * Split out from badge creation because `getBBox()` returns an all-zero rect
 * for elements under a `display: none` ancestor — which is exactly the state
 * the Flow tab's diagram renders in the first time: `FlowView` is mounted in
 * the background (see `App`'s `flowViewPrimed`) while the tab is still
 * hidden, so the initial badge placement always lands on the zero rect and
 * every badge ends up at each node's local origin — its center — instead of
 * its corner. The `ResizeObserver` in the render effect below calls this
 * again once the container actually gains real layout size (i.e. the tab
 * becomes visible), which corrects it.
 */
function positionComplexityBadges(container: HTMLElement): void {
	for (const nodeEl of container.querySelectorAll<SVGGElement>(".node")) {
		const shape = nodeEl.querySelector<SVGGraphicsElement>("rect, polygon, path");
		const badge = nodeEl.querySelector<SVGCircleElement>(".flow-node-badge");
		const badgeText = nodeEl.querySelector<SVGTextElement>(".flow-node-badge-text");
		if (!shape || !badge || !badgeText) {
			continue;
		}
		const bbox = shape.getBBox();
		const cx = String(bbox.x + bbox.width);
		const cy = String(bbox.y);
		badge.setAttribute("cx", cx);
		badge.setAttribute("cy", cy);
		badgeText.setAttribute("x", cx);
		badgeText.setAttribute("y", cy);
	}
}

function colorsFor(theme: Theme) {
	return { ...COMPLEXITY_BAND_COLORS[theme], ringColor: FLOW_BADGE_RING_COLOR[theme] };
}

/**
 * Renders a {@link CallGraph} via Mermaid, wrapped in `react-zoom-pan-pinch`
 * for pan/zoom/fit — it applies a plain CSS transform to the rendered SVG's
 * container rather than manipulating the SVG's own viewBox/matrix, and its
 * `centerView` computes centering for us given a target scale — so the
 * diagram scales to whatever viewport it's given instead of overflowing
 * into a scrollbar. Node hover is wired to both editor-highlight and
 * details-panel callbacks.
 */
export function MermaidCallGraphDiagram({ graph, theme, layout, onHighlightRange, onNodeHover }: CallGraphDiagramProps) {
	const definition = useMemo(
		() => callGraphToMermaid(graph, COMPLEXITY_BAND_COLORS[theme], layout),
		[graph, theme, layout],
	);

	const containerRef = useRef<HTMLDivElement>(null);
	const transformRef = useRef<ReactZoomPanPinchContentRef>(null);
	/** The `diagramId` whose SVG is currently live in the DOM — read (not a dependency) by the hover effect below, so it always matches whatever actually got rendered rather than an id from a stale/discarded invocation. */
	const liveDiagramIdRef = useRef<string>("");
	const [renderError, setRenderError] = useState<string | null>(null);

	const fitToViewport = () => {
		const svgEl = containerRef.current?.querySelector("svg");
		const wrapperEl = transformRef.current?.instance.wrapperComponent;
		if (!svgEl || !wrapperEl) {
			return;
		}
		const naturalWidth = svgEl.width.baseVal.value || svgEl.viewBox.baseVal.width;
		const naturalHeight = svgEl.height.baseVal.value || svgEl.viewBox.baseVal.height;
		const wrapperRect = wrapperEl.getBoundingClientRect();
		if (!naturalWidth || !naturalHeight || !wrapperRect.width || !wrapperRect.height) {
			return;
		}
		const scale = clamp(
			Math.min(wrapperRect.width / naturalWidth, wrapperRect.height / naturalHeight) * FIT_MARGIN,
			MIN_ZOOM,
			MAX_ZOOM,
		);
		transformRef.current?.centerView(scale, 0);
	};

	useEffect(() => {
		// A fresh id per invocation, not a stable ref reused across re-renders:
		// React 18 StrictMode double-invokes this effect once on mount (setup,
		// cleanup, setup again) purely synchronously, before either
		// `mermaid.render` promise settles — sharing one id would mean both
		// invocations' calls raced over the same internal temp DOM node Mermaid
		// uses for layout measurement.
		const diagramId = nextDiagramId();
		let cancelled = false;
		ensureMermaidInitialized();
		mermaid
			.render(diagramId, definition)
			.then(({ svg, bindFunctions }) => {
				if (cancelled) {
					return;
				}
				const container = containerRef.current;
				if (!container) {
					return;
				}
				container.innerHTML = svg;
				liveDiagramIdRef.current = diagramId;
				bindFunctions?.(container);
				const svgEl = container.querySelector("svg");
				if (svgEl) {
					// Defensive: `useMaxWidth: false` (set both globally and per-diagram,
					// see ensureMermaidInitialized/callGraphToMermaid) should already keep
					// Mermaid from adding this, but stripping it here too means a stray
					// `max-width` can never silently shrink the SVG's real rendered size.
					svgEl.style.maxWidth = "none";
				}
				addComplexityBadges(container, graph, colorsFor(theme), diagramId);
				fitToViewport();
				setRenderError(null);
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setRenderError(error instanceof Error ? error.message : String(error));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [definition]);

	// The initial render above can happen while this pane is still `display:
	// none` (the Flow tab primes itself in the background before the user
	// switches to it — see `App`'s `flowViewPrimed`), which leaves badges
	// mispositioned at each node's center (see `positionComplexityBadges`'s
	// doc comment). A `ResizeObserver` catches the moment the container
	// actually gains real layout size — i.e. becomes visible — and redoes the
	// badge placement and view-fit then.
	const wasVisibleRef = useRef(false);
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		wasVisibleRef.current = container.getBoundingClientRect().width > 0;
		const observer = new ResizeObserver(([entry]) => {
			const isVisible = (entry?.contentRect.width ?? 0) > 0;
			if (isVisible && !wasVisibleRef.current) {
				positionComplexityBadges(container);
				fitToViewport();
			}
			wasVisibleRef.current = isVisible;
		});
		observer.observe(container);
		return () => {
			observer.disconnect();
		};
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

		const hitFor = (target: EventTarget | null): { element: Element; node: CallGraphNode } | null => {
			if (!(target instanceof Element)) {
				return null;
			}
			const nodeEl = target.closest(".node");
			if (!nodeEl?.id) {
				return null;
			}
			const nodeId = callGraphNodeIdFromElementId(nodeEl.id, liveDiagramIdRef.current);
			const node = nodeId ? nodeById.get(nodeId) : undefined;
			return node ? { element: nodeEl, node } : null;
		};

		const handleOver = (event: MouseEvent) => {
			const hit = hitFor(event.target);
			if (hit) {
				onHighlightRange(hit.node.range);
				onNodeHover(hit.node);
			}
		};
		const handleOut = (event: MouseEvent) => {
			const hit = hitFor(event.target);
			if (!hit) {
				return;
			}
			const related = event.relatedTarget;
			if (related instanceof Node && hit.element.contains(related)) {
				return;
			}
			onHighlightRange(null);
			onNodeHover(null);
		};

		container.addEventListener("mouseover", handleOver);
		container.addEventListener("mouseout", handleOut);
		return () => {
			container.removeEventListener("mouseover", handleOver);
			container.removeEventListener("mouseout", handleOut);
			onHighlightRange(null);
			onNodeHover(null);
		};
	}, [graph, onHighlightRange, onNodeHover]);

	if (renderError) {
		return <div className="flow-error">Couldn't render diagram: {renderError}</div>;
	}

	return (
		<div className="flow-diagram-wrapper">
			<TransformWrapper
				ref={transformRef}
				initialScale={1}
				minScale={MIN_ZOOM}
				maxScale={MAX_ZOOM}
				limitToBounds={false}
				centerOnInit={false}
			>
				<div className="flow-diagram-controls">
					<button type="button" onClick={() => transformRef.current?.zoomIn(0.3, 150)} title="Zoom in" aria-label="Zoom in">
						+
					</button>
					<button
						type="button"
						onClick={() => transformRef.current?.zoomOut(0.3, 150)}
						title="Zoom out"
						aria-label="Zoom out"
					>
						−
					</button>
					<button type="button" onClick={fitToViewport} title="Fit to view" aria-label="Fit to view">
						⤢
					</button>
				</div>
				<TransformComponent wrapperClass="flow-diagram" wrapperStyle={{ width: "100%", height: "100%" }}>
					<div ref={containerRef} />
				</TransformComponent>
			</TransformWrapper>
		</div>
	);
}
