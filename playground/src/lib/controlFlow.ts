import { type ASTNodeUnion, iterChildNodes } from "py-ast";
import type { FunctionLikeDef } from "./functionCatalog";

/**
 * The McCabe cyclomatic complexity of a function, broken down by which kind
 * of decision point contributed to it — so a UI can show *why* a function
 * scored what it did, not just the final number. `total` is always `1 +`
 * the sum of every other field.
 */
export interface ComplexityBreakdown {
	total: number;
	/** `if`/`elif` branches (each `elif` is a nested `If`, counted separately). */
	branches: number;
	/** `for`/`async for`/`while` loops. */
	loops: number;
	/** `except`/`except*` handlers. */
	exceptHandlers: number;
	/** Extra short-circuit points in boolean-operator chains (`values.length - 1` per `and`/`or` chain). */
	booleanOperators: number;
	/** Ternary (`a if test else b`) expressions. */
	ternaries: number;
	/** `match` `case` clauses. */
	matchCases: number;
	/** `assert` statements. */
	asserts: number;
	/** `if` filter clauses within comprehensions/generator expressions. */
	comprehensionFilters: number;
}

function emptyBreakdown(): ComplexityBreakdown {
	return {
		total: 1,
		branches: 0,
		loops: 0,
		exceptHandlers: 0,
		booleanOperators: 0,
		ternaries: 0,
		matchCases: 0,
		asserts: 0,
		comprehensionFilters: 0,
	};
}

/** Adds `node`'s own decision points (not its descendants') to `breakdown`, in place. */
function accumulate(node: ASTNodeUnion, breakdown: ComplexityBreakdown): void {
	switch (node.nodeType) {
		case "If":
			breakdown.branches += 1;
			breakdown.total += 1;
			break;
		case "For":
		case "AsyncFor":
		case "While":
			breakdown.loops += 1;
			breakdown.total += 1;
			break;
		case "ExceptHandler":
			breakdown.exceptHandlers += 1;
			breakdown.total += 1;
			break;
		case "IfExp":
			breakdown.ternaries += 1;
			breakdown.total += 1;
			break;
		case "MatchCase":
			breakdown.matchCases += 1;
			breakdown.total += 1;
			break;
		case "Assert":
			breakdown.asserts += 1;
			breakdown.total += 1;
			break;
		case "BoolOp": {
			const extra = Math.max(0, node.values.length - 1);
			breakdown.booleanOperators += extra;
			breakdown.total += extra;
			break;
		}
		case "Comprehension": {
			const extra = node.ifs.length;
			breakdown.comprehensionFilters += extra;
			breakdown.total += extra;
			break;
		}
		default:
			break;
	}
}

/** Recursively accumulates decision points in `node`'s subtree into `breakdown`, without descending into nested function/class definitions. */
function walk(node: ASTNodeUnion, breakdown: ComplexityBreakdown): void {
	if (node.nodeType === "FunctionDef" || node.nodeType === "AsyncFunctionDef" || node.nodeType === "ClassDef") {
		return;
	}
	accumulate(node, breakdown);
	for (const child of iterChildNodes(node)) {
		walk(child, breakdown);
	}
}

/**
 * Computes the function's McCabe cyclomatic complexity, broken down by
 * decision-point kind (branches, loops, exception handlers, boolean-operator
 * short-circuits, ternaries, comprehension `if`s, `match` cases, and
 * `assert`s). Nested function/class definitions are excluded — they get
 * their own score via their own catalog entry — but a `lambda`'s body is
 * included, since lambdas aren't separately selectable.
 * @param func The function/method to score.
 * @returns The complexity breakdown; `total` is the conventional McCabe score (minimum 1).
 */
export function computeComplexityBreakdown(func: FunctionLikeDef): ComplexityBreakdown {
	const breakdown = emptyBreakdown();
	for (const stmt of func.body) {
		walk(stmt, breakdown);
	}
	return breakdown;
}

/**
 * Computes just the function's total McCabe cyclomatic complexity score.
 * @param func The function/method to score.
 * @returns The function's cyclomatic complexity (minimum 1).
 */
export function computeCyclomaticComplexity(func: FunctionLikeDef): number {
	return computeComplexityBreakdown(func).total;
}

/** The conventional McCabe risk bands for a cyclomatic complexity score. */
export type ComplexityBand = "low" | "moderate" | "high" | "very-high";

const COMPLEXITY_BAND_THRESHOLDS: [max: number, band: ComplexityBand][] = [
	[10, "low"],
	[20, "moderate"],
	[50, "high"],
];

/** Buckets a cyclomatic complexity score into the conventional McCabe risk bands (1–10 low, 11–20 moderate, 21–50 high, 50+ very high). */
export function complexityBand(score: number): ComplexityBand {
	for (const [max, band] of COMPLEXITY_BAND_THRESHOLDS) {
		if (score <= max) {
			return band;
		}
	}
	return "very-high";
}
