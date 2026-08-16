import type { Module, StmtNode } from "py-ast";

/** A `FunctionDef` or `AsyncFunctionDef` node (the latter isn't separately exported by py-ast). */
export type FunctionLikeDef = Extract<StmtNode, { nodeType: "FunctionDef" | "AsyncFunctionDef" }>;

/** A function/method definition discovered by {@link collectFunctions}, labeled for a dropdown. */
export interface CatalogedFunction {
	node: FunctionLikeDef;
	/** Dotted display name, e.g. `greet` or `Greeter.greet`, disambiguated on collision (see {@link collectFunctions}). */
	qualifiedName: string;
}

function isFunctionDef(node: StmtNode): node is FunctionLikeDef {
	return node.nodeType === "FunctionDef" || node.nodeType === "AsyncFunctionDef";
}

/**
 * Recursively collects every function/method definition in `module`, in
 * source order, labeled with a dotted qualified name (`Class.method`,
 * `outer.inner` for closures). Descends into `ClassDef` bodies and into each
 * function's own body to find further nested defs — those nested defs get
 * their own catalog entry rather than being folded into their enclosing
 * function's diagram/complexity.
 * @param module The parsed module to scan.
 * @returns Every function/method definition found, in source order.
 */
export function collectFunctions(module: Module): CatalogedFunction[] {
	const found: CatalogedFunction[] = [];
	const seenNames = new Map<string, number>();

	const addFunction = (node: FunctionLikeDef, prefix: string) => {
		const baseName = prefix ? `${prefix}.${node.name}` : node.name;
		const count = seenNames.get(baseName) ?? 0;
		seenNames.set(baseName, count + 1);
		const qualifiedName = count === 0 ? baseName : `${baseName} (${count + 1})`;
		found.push({ node, qualifiedName });
		visitBody(node.body, baseName);
	};

	const visitBody = (body: StmtNode[], prefix: string) => {
		for (const stmt of body) {
			if (isFunctionDef(stmt)) {
				addFunction(stmt, prefix);
			} else if (stmt.nodeType === "ClassDef") {
				visitBody(stmt.body, prefix ? `${prefix}.${stmt.name}` : stmt.name);
			}
		}
	};

	visitBody(module.body, "");
	return found;
}
