import { type ASTNodeUnion, iterChildNodes } from "py-ast";
import { complexityBand, type ComplexityBand, type ComplexityBreakdown, computeComplexityBreakdown } from "./controlFlow";
import type { CatalogedFunction } from "./functionCatalog";
import type { SourceRange } from "./types";

/**
 * A function/method node in the module-level call graph, colored/labeled by
 * its own cyclomatic complexity. This is a plain data model — no rendering
 * library's syntax or DOM concerns — so it can be handed to any renderer
 * (Mermaid today; a React Flow + dagre layout would consume the same shape).
 */
export interface CallGraphNode {
	/** Stable, renderer-safe id (`f0`, `f1`, …) — alphanumeric so it's valid as both a Mermaid node id and a DOM id/React key. */
	id: string;
	qualifiedName: string;
	complexity: ComplexityBreakdown;
	/** The function definition's own source range, for hover highlighting. */
	range: SourceRange;
}

/** A directed "calls" edge between two {@link CallGraphNode}s (by id). Self-edges represent direct recursion. */
export interface CallGraphEdge {
	from: string;
	to: string;
}

export interface CallGraph {
	nodes: CallGraphNode[];
	edges: CallGraphEdge[];
}

/** Resolves a `Call` expression's callee to a best-effort simple name: `f(...)` -> `f`, `obj.method(...)` -> `method`. */
function calleeName(node: ASTNodeUnion): string | null {
	if (node.nodeType !== "Call") {
		return null;
	}
	const func = node.func;
	if (func.nodeType === "Name") {
		return func.id;
	}
	if (func.nodeType === "Attribute") {
		return func.attr;
	}
	return null;
}

/** Collects every call's callee name reachable from `node`, without descending into nested function/class definitions. */
function collectCalleeNames(node: ASTNodeUnion, into: string[]): void {
	if (node.nodeType === "FunctionDef" || node.nodeType === "AsyncFunctionDef" || node.nodeType === "ClassDef") {
		return;
	}
	const name = calleeName(node);
	if (name) {
		into.push(name);
	}
	for (const child of iterChildNodes(node)) {
		collectCalleeNames(child, into);
	}
}

/**
 * Builds a module-level call graph from every function/method in `functions`:
 * one node per function (labeled with its cyclomatic complexity), and an
 * edge for each call from one cataloged function into another.
 *
 * Callee resolution is a best-effort static heuristic, not real symbol
 * resolution: a call is matched to a cataloged function by its bare/attribute
 * name (`f(...)` or `obj.f(...)` both match a function named `f`). When more
 * than one cataloged function shares that name (e.g. same-named methods on
 * different classes), the call is ambiguous and no edge is drawn, rather
 * than guessing wrong.
 * @param functions Every function/method to graph, as returned by `collectFunctions`.
 * @returns The call graph: one node per function, plus resolved call edges.
 */
export function buildCallGraph(functions: CatalogedFunction[]): CallGraph {
	const idByFunction = new Map(functions.map((f, index) => [f, `f${index}`]));
	const candidatesByName = new Map<string, CatalogedFunction[]>();
	for (const f of functions) {
		const list = candidatesByName.get(f.node.name) ?? [];
		list.push(f);
		candidatesByName.set(f.node.name, list);
	}

	const nodes: CallGraphNode[] = functions.map((f) => ({
		id: idByFunction.get(f) as string,
		qualifiedName: f.qualifiedName,
		complexity: computeComplexityBreakdown(f.node),
		range: {
			startLine: f.node.lineno,
			startColumn: f.node.col_offset,
			endLine: f.node.end_lineno ?? f.node.lineno,
			endColumn: f.node.end_col_offset ?? f.node.col_offset,
		},
	}));

	const edges: CallGraphEdge[] = [];
	const seenEdges = new Set<string>();
	for (const f of functions) {
		const fromId = idByFunction.get(f) as string;
		const calleeNames: string[] = [];
		for (const stmt of f.node.body) {
			collectCalleeNames(stmt, calleeNames);
		}
		for (const name of calleeNames) {
			const candidates = candidatesByName.get(name);
			if (!candidates || candidates.length !== 1) {
				continue;
			}
			const toId = idByFunction.get(candidates[0]) as string;
			const key = `${fromId}->${toId}`;
			if (seenEdges.has(key)) {
				continue;
			}
			seenEdges.add(key);
			edges.push({ from: fromId, to: toId });
		}
	}

	return { nodes, edges };
}

/**
 * Filters `graph` down to whichever functions score in `band`, plus every
 * function transitively reachable from one of those (in either call
 * direction — a caller or a callee, and *their* callers/callees, and so on)
 * until the reachable set stops growing. In practice this is the graph's
 * weakly-connected component(s) that contain at least one `band`-scoring
 * function: other components with no such function are dropped entirely,
 * so filtering by band can genuinely split one diagram into several
 * disconnected pieces rather than always keeping everything in one blob.
 * @param graph The full call graph to filter.
 * @param band The complexity band to seed the filter from, or `null` for no filtering (returns `graph` unchanged).
 * @returns The filtered graph (a new object; `graph` itself is never mutated).
 */
export function filterConnectedByBand(graph: CallGraph, band: ComplexityBand | null): CallGraph {
	if (band === null) {
		return graph;
	}

	const neighbors = new Map<string, Set<string>>();
	const addNeighbor = (from: string, to: string) => {
		let set = neighbors.get(from);
		if (!set) {
			set = new Set();
			neighbors.set(from, set);
		}
		set.add(to);
	};
	for (const edge of graph.edges) {
		addNeighbor(edge.from, edge.to);
		addNeighbor(edge.to, edge.from);
	}

	const seeds = graph.nodes.filter((n) => complexityBand(n.complexity.total) === band).map((n) => n.id);
	const visited = new Set<string>(seeds);
	const queue = [...seeds];
	while (queue.length > 0) {
		const current = queue.pop() as string;
		for (const neighbor of neighbors.get(current) ?? []) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push(neighbor);
			}
		}
	}

	return {
		nodes: graph.nodes.filter((n) => visited.has(n.id)),
		edges: graph.edges.filter((e) => visited.has(e.from) && visited.has(e.to)),
	};
}
